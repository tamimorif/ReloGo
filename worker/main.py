"""
ReloGo Worker — Official Source Scraper

Monitors official government/agency URLs for content changes.
An atomic database RPC records baselines and files PENDING alerts for true
changes. Never modifies live rules directly.

Usage:
    python main.py
"""

import asyncio
import logging
import os
import random
import sys
import urllib.error
import urllib.parse
import urllib.request
from contextlib import asynccontextmanager
from dataclasses import dataclass
from typing import Awaitable, Callable

from dotenv import load_dotenv
from playwright.async_api import (
    async_playwright,
    Error as PlaywrightError,
    TimeoutError as PlaywrightTimeoutError,
)
from supabase import create_client, Client
from tenacity import (
    retry,
    retry_if_exception_type,
    stop_after_attempt,
    wait_exponential,
)

from changedetect import (
    BASELINE,
    CHANGED,
    HARD_MAX_CONTENT_CHARS,
    MAX_BLOCK_PAGE_CHARS,
    MIN_CONTENT_CHARS as DEFAULT_MIN_CONTENT_CHARS,
    STALE,
    UNCHANGED,
    content_rejection_reason,
    parse_persist_response,
    pdf_fingerprint_text,
    sha256,
    summarize_diff,
)
from reporting import (
    build_step_summary,
    run_should_fail,
    send_run_webhook,
)

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

load_dotenv()

SUPABASE_URL: str = os.environ.get("SUPABASE_URL", "")
SUPABASE_SERVICE_ROLE_KEY: str = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")

PAGE_TIMEOUT_MS: int = int(os.environ.get("PAGE_TIMEOUT_MS", "30000"))
NAV_TIMEOUT_MS: int = int(os.environ.get("NAV_TIMEOUT_MS", "60000"))

# Bound simultaneous pages/downloads so the 53-source run is substantially
# faster without overwhelming government sites or the Actions runner.
SCRAPE_CONCURRENCY: int = max(1, int(os.environ.get("SCRAPE_CONCURRENCY", "8")))

# Be a polite crawler and avoid bursts that can trip managed anti-bot services.
# Different origins still run concurrently; requests to one origin are serialized
# and separated by a short, bounded delay. Exact duplicate URLs are fetched only
# once per run (see ``scrape_all_sources``), reducing load further.
ORIGIN_MIN_SPACING_SECONDS: float = min(
    10.0,
    max(0.0, float(os.environ.get("ORIGIN_MIN_SPACING_SECONDS", "1.0"))),
)
ORIGIN_MAX_JITTER_SECONDS: float = min(
    2.0,
    max(0.0, float(os.environ.get("ORIGIN_MAX_JITTER_SECONDS", "0.25"))),
)

# PDF sources are downloaded as inert bytes and fingerprinted. Cap downloads
# to avoid unbounded memory use from a bad or unexpectedly large response.
MAX_PDF_BYTES: int = max(
    1, int(os.environ.get("MAX_PDF_BYTES", str(25 * 1024 * 1024)))
)

# Minimum plausible body length; shorter scrapes count as failed and never
# overwrite the stored baseline (see changedetect.content_rejection_reason).
MIN_CONTENT_CHARS: int = int(
    os.environ.get("MIN_CONTENT_CHARS", str(DEFAULT_MIN_CONTENT_CHARS))
)

# Return at most limit+1 characters from the browser and reject the extra
# sentinel before any persistence. The database enforces the same hard cap.
MAX_HTML_TEXT_CHARS: int = min(
    HARD_MAX_CONTENT_CHARS,
    max(1, int(os.environ.get("MAX_HTML_TEXT_CHARS", str(HARD_MAX_CONTENT_CHARS)))),
)

# Optional Slack-compatible incoming-webhook URL. When set, the worker POSTs
# a short JSON summary after any run that files alerts or has failures.
ALERT_WEBHOOK_URL: str = os.environ.get("ALERT_WEBHOOK_URL", "")

USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/125.0.0.0 Safari/537.36"
)

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s — %(message)s",
    datefmt="%Y-%m-%dT%H:%M:%S%z",
)
logger = logging.getLogger("relogo.worker")

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


class WorkerConfigurationError(RuntimeError):
    """Raised for a missing or unusable worker configuration."""


def init_supabase() -> Client:
    """Create and return a Supabase client using the service-role key (bypasses RLS)."""
    if not SUPABASE_URL or not SUPABASE_SERVICE_ROLE_KEY:
        raise WorkerConfigurationError(
            "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set"
        )
    logger.info("Connecting to Supabase at %s", SUPABASE_URL)
    return create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)


def fetch_official_sources(sb: Client) -> list[dict]:
    """Fetch all rows from the `official_sources` table."""
    response = sb.table("official_sources").select(
        "id, agency_name, official_url, last_content_hash, last_content_text"
    ).execute()
    rows = response.data or []
    logger.info("Fetched %d official source(s) to scrape.", len(rows))
    return rows


def persist_scrape_result(
    sb: Client,
    official_source_id: str,
    expected_hash: str | None,
    new_hash: str,
    content_text: str,
    diff_summary: str | None,
) -> tuple[str, str | None, str | None]:
    """Atomically classify and persist one scrape through the CAS RPC."""

    response = sb.rpc(
        "persist_official_source_scrape",
        {
            "p_official_source_id": official_source_id,
            "p_expected_hash": expected_hash,
            "p_new_hash": new_hash,
            "p_content_text": content_text,
            "p_diff_summary": diff_summary,
        },
    ).execute()
    return parse_persist_response(response.data)


# ---------------------------------------------------------------------------
# Notifications
# ---------------------------------------------------------------------------


def notify_admins(
    webhook_url: str,
    stats: dict[str, int],
    filed_alerts: list[dict],
    failed_sources: list[dict],
) -> None:
    """POST a small run summary to *webhook_url*.

    Rendering, JSON/request construction, and network I/O are all inside the
    best-effort helper; notification problems never fail the monitoring run.
    """

    sent, detail = send_run_webhook(
        webhook_url, stats, filed_alerts, failed_sources
    )
    if sent:
        logger.info("  🔔 Admin webhook notified (%s).", detail)
    else:
        logger.warning(
            "  ⚠️ Admin webhook notification failed (ignored: %s).", detail
        )


def write_step_summary(
    stats: dict[str, int],
    filed_alerts: list[dict],
    failed_sources: list[dict],
) -> None:
    """Append a markdown run summary to the GitHub Actions job summary.

    No-op outside GitHub Actions (GITHUB_STEP_SUMMARY unset). Best-effort:
    an unwritable summary file must never fail the run.
    """
    summary_path = os.environ.get("GITHUB_STEP_SUMMARY")
    if not summary_path:
        return
    try:
        with open(summary_path, "a", encoding="utf-8") as fh:
            fh.write(build_step_summary(stats, filed_alerts, failed_sources))
    except OSError as exc:
        logger.warning("Could not write GitHub step summary (ignored): %s", exc)


# ---------------------------------------------------------------------------
# Scraper
# ---------------------------------------------------------------------------


class ScrapeHTTPError(Exception):
    """Raised when a source responds with an HTTP error status (>= 400)."""

    def __init__(self, status: int) -> None:
        super().__init__(f"HTTP {status}")
        self.status = status


class ManagedChallengeError(ScrapeHTTPError):
    """Raised when a managed anti-bot service challenges the worker."""

    def __init__(self, status: int) -> None:
        super().__init__(status)
        self.args = (f"HTTP {status} managed anti-bot challenge",)


class CaptchaChallengeError(Exception):
    """Raised when the response body is a CAPTCHA rather than source content."""


class PDFTransientError(Exception):
    """Raised for a PDF download failure that is safe to retry."""


class PDFContentError(Exception):
    """Raised when a PDF response is invalid or exceeds the safety limit."""


class RejectedContentError(Exception):
    """Raised when scraped content fails the sanity gate."""


HIGH_CONFIDENCE_CHALLENGE_MARKERS = (
    "checking your browser",
    "verifying your browser",
    "verify you are human",
    "verify that you are human",
    "enable javascript and cookies",
    "pardon our interruption",
)
SHORT_CHALLENGE_MARKERS = (
    "attention required",
    "captcha",
)


@dataclass(frozen=True)
class ScrapeOutcome:
    """One isolated source scrape, before any database persistence."""

    source: dict
    body_text: str | None = None
    error: str | None = None
    failure_category: str | None = None


class OriginRequestGate:
    """Serialize and gently pace requests to one URL origin."""

    def __init__(
        self,
        min_spacing_seconds: float,
        max_jitter_seconds: float,
        *,
        clock: Callable[[], float] | None = None,
        sleep: Callable[[float], Awaitable[None]] = asyncio.sleep,
        jitter: Callable[[float, float], float] = random.uniform,
    ) -> None:
        self._min_spacing_seconds = max(0.0, min_spacing_seconds)
        self._max_jitter_seconds = max(0.0, max_jitter_seconds)
        self._clock = clock
        self._sleep = sleep
        self._jitter = jitter
        self._lock = asyncio.Lock()
        self._next_start_at = 0.0

    def _now(self) -> float:
        if self._clock is not None:
            return self._clock()
        return asyncio.get_running_loop().time()

    @asynccontextmanager
    async def request_slot(self):
        """Yield one exclusive slot, then schedule the next allowed start."""

        async with self._lock:
            delay = max(0.0, self._next_start_at - self._now())
            if delay > 0:
                await self._sleep(delay)
            try:
                yield
            finally:
                bounded_jitter = min(
                    self._max_jitter_seconds,
                    max(0.0, self._jitter(0.0, self._max_jitter_seconds)),
                )
                self._next_start_at = (
                    self._now() + self._min_spacing_seconds + bounded_jitter
                )


def scrape_origin(url: str) -> str:
    """Return a stable request-gate key for *url* without resolving it."""

    try:
        parsed = urllib.parse.urlsplit(url)
        if not parsed.scheme or not parsed.hostname:
            return f"invalid:{url}"
        port = parsed.port
        default_port = (parsed.scheme.lower() == "https" and port == 443) or (
            parsed.scheme.lower() == "http" and port == 80
        )
        port_suffix = "" if port is None or default_port else f":{port}"
        return f"{parsed.scheme.lower()}://{parsed.hostname.lower()}{port_suffix}"
    except ValueError:
        return f"invalid:{url}"


def failure_category(exc: Exception) -> str:
    """Classify one scrape failure for operator-facing reporting."""

    if isinstance(exc, ManagedChallengeError):
        return "managed_challenge"
    if isinstance(exc, CaptchaChallengeError):
        return "captcha"
    if isinstance(exc, ScrapeHTTPError):
        return "http"
    if isinstance(exc, RejectedContentError):
        return "content"
    if isinstance(exc, PlaywrightTimeoutError):
        return "timeout"
    if isinstance(exc, PlaywrightError):
        return "navigation"
    if isinstance(exc, (PDFTransientError, PDFContentError)):
        return "pdf"
    if isinstance(exc, WorkerConfigurationError):
        return "configuration"
    return "other"


def captcha_body_marker(text: str) -> str | None:
    """Identify anti-bot text before generic length/content gates."""

    stripped = text.strip()
    lowered = stripped.lower()
    high_confidence = next(
        (
            marker
            for marker in HIGH_CONFIDENCE_CHALLENGE_MARKERS
            if marker in lowered
        ),
        None,
    )
    if high_confidence is not None:
        return high_confidence
    if len(stripped) <= MAX_BLOCK_PAGE_CHARS:
        return next(
            (marker for marker in SHORT_CHALLENGE_MARKERS if marker in lowered),
            None,
        )
    return None


@retry(
    retry=retry_if_exception_type(PlaywrightError),
    stop=stop_after_attempt(3),
    wait=wait_exponential(multiplier=2, min=2, max=30),
    reraise=True,
)
async def _scrape_with_retry(page, url: str) -> str:
    """Navigate to *url* and return the full body text.

    Retries any Playwright error (timeouts, connection resets, aborted
    navigations — PlaywrightTimeoutError is an Error subclass). Raises
    ScrapeHTTPError immediately (no retry) on an HTTP error response.
    """
    response = await page.goto(url, wait_until="domcontentloaded", timeout=NAV_TIMEOUT_MS)
    if response is not None and response.status >= 400:
        if response.status == 403:
            headers = await response.all_headers()
            if headers.get("cf-mitigated", "").lower() == "challenge":
                raise ManagedChallengeError(response.status)
        raise ScrapeHTTPError(response.status)
    # Give dynamic pages a moment to settle
    await page.wait_for_timeout(2000)
    result: dict = await page.evaluate(
        """(maxChars) => {
            const text = document.body?.innerText ?? '';
            return {
                text: text.slice(0, maxChars + 1),
                oversized: text.length > maxChars,
            };
        }""",
        MAX_HTML_TEXT_CHARS,
    )
    if result["oversized"]:
        raise RejectedContentError(
            f"body too long (limit {MAX_HTML_TEXT_CHARS} chars)"
        )
    return str(result["text"]).strip()


async def scrape_html_url(context, url: str) -> str:
    """Scrape one HTML URL with its own page and retry policy."""

    page = await context.new_page()
    try:
        return await _scrape_with_retry(page, url)
    finally:
        await page.close()


@retry(
    retry=retry_if_exception_type(PDFTransientError),
    stop=stop_after_attempt(3),
    wait=wait_exponential(multiplier=2, min=2, max=30),
    reraise=True,
)
def _scrape_pdf_with_retry(url: str) -> str:
    """Download a PDF as inert bytes and return its monitoring record."""

    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    try:
        with urllib.request.urlopen(
            request, timeout=max(1, NAV_TIMEOUT_MS / 1000)
        ) as response:
            status = getattr(response, "status", 200)
            if status >= 400:
                if (
                    status == 403
                    and response.headers.get("cf-mitigated", "").lower()
                    == "challenge"
                ):
                    raise ManagedChallengeError(status)
                raise ScrapeHTTPError(status)

            declared_size = response.headers.get("Content-Length")
            if declared_size:
                try:
                    if int(declared_size) > MAX_PDF_BYTES:
                        raise PDFContentError(
                            f"PDF exceeds {MAX_PDF_BYTES} byte safety limit"
                        )
                except ValueError:
                    # A malformed Content-Length is not trusted; the bounded
                    # read below still enforces the safety limit.
                    pass

            content = response.read(MAX_PDF_BYTES + 1)
    except urllib.error.HTTPError as exc:
        if (
            exc.code == 403
            and exc.headers is not None
            and exc.headers.get("cf-mitigated", "").lower() == "challenge"
        ):
            raise ManagedChallengeError(exc.code) from exc
        raise ScrapeHTTPError(exc.code) from exc
    except (urllib.error.URLError, TimeoutError, OSError) as exc:
        raise PDFTransientError(f"PDF download failed: {exc}") from exc

    if len(content) > MAX_PDF_BYTES:
        raise PDFContentError(f"PDF exceeds {MAX_PDF_BYTES} byte safety limit")
    if b"%PDF-" not in content[:1024]:
        raise PDFContentError("response did not contain a PDF header")

    return pdf_fingerprint_text(content)


def is_pdf_url(url: str) -> bool:
    """Return whether *url* explicitly identifies a PDF resource."""

    return urllib.parse.urlsplit(url).path.lower().endswith(".pdf")


def concise_error(exc: Exception, max_chars: int = 240) -> str:
    """Return a bounded single-line error suitable for summaries/webhooks."""

    if isinstance(exc, PlaywrightTimeoutError):
        return "navigation timed out after 3 attempts"
    if isinstance(exc, ScrapeHTTPError):
        return str(exc)

    message = " ".join(str(exc).split()) or type(exc).__name__
    if isinstance(exc, PlaywrightError):
        message = f"navigation failed after 3 attempts: {message}"
    if len(message) > max_chars:
        message = message[: max_chars - 1] + "…"
    return message


async def scrape_source(
    context,
    source: dict,
    semaphore: asyncio.Semaphore,
    origin_gate: OriginRequestGate,
) -> ScrapeOutcome:
    """Scrape one source in isolation without performing database writes."""

    agency = str(source.get("agency_name") or "Unknown")
    url = str(source.get("official_url") or "")

    if not url:
        exc = WorkerConfigurationError("official source URL is missing")
        error = concise_error(exc)
        category = failure_category(exc)
        logger.warning(
            "  🚫 [%s] (missing URL) failed [%s]: %s",
            agency,
            category,
            error,
        )
        return ScrapeOutcome(
            source=source,
            error=error,
            failure_category=category,
        )

    async with origin_gate.request_slot():
        async with semaphore:
            logger.info("Scraping [%s] %s …", agency, url or "(missing URL)")
            try:
                pdf_source = is_pdf_url(url)
                if pdf_source:
                    body_text = await asyncio.to_thread(_scrape_pdf_with_retry, url)
                else:
                    body_text = await scrape_html_url(context, url)

                captcha_marker = None if pdf_source else captcha_body_marker(body_text)
                rejection = content_rejection_reason(
                    body_text,
                    MIN_CONTENT_CHARS,
                    None if pdf_source else MAX_HTML_TEXT_CHARS,
                )
                if captcha_marker is not None:
                    raise CaptchaChallengeError(
                        "CAPTCHA challenge returned instead of source content"
                    )
                if rejection is not None:
                    raise RejectedContentError(rejection)

                return ScrapeOutcome(source=source, body_text=body_text)
            except Exception as exc:  # noqa: BLE001
                error = concise_error(exc)
                category = failure_category(exc)
                logger.warning(
                    "  🚫 [%s] %s failed [%s]: %s",
                    agency,
                    url,
                    category,
                    error,
                )
                return ScrapeOutcome(
                    source=source,
                    error=error,
                    failure_category=category,
                )


async def scrape_all_sources(context, sources: list[dict]) -> list[ScrapeOutcome]:
    """Scrape unique URLs with bounded concurrency and stable fan-out order."""

    semaphore = asyncio.Semaphore(SCRAPE_CONCURRENCY)
    origin_gates: dict[str, OriginRequestGate] = {}
    tasks_by_url: dict[str, asyncio.Task[ScrapeOutcome]] = {}

    for source in sources:
        url = str(source.get("official_url") or "")
        if url in tasks_by_url:
            continue
        origin = scrape_origin(url)
        gate = origin_gates.setdefault(
            origin,
            OriginRequestGate(
                ORIGIN_MIN_SPACING_SECONDS,
                ORIGIN_MAX_JITTER_SECONDS,
            ),
        )
        tasks_by_url[url] = asyncio.create_task(
            scrape_source(context, source, semaphore, gate)
        )

    tasks = list(tasks_by_url.values())
    try:
        results = await asyncio.gather(*tasks)
    except BaseException:
        # ``scrape_source`` normally converts failures to outcomes, but an
        # unexpected gate/task cancellation must not leave siblings using a
        # browser context that ``run`` is about to close.
        for task in tasks:
            if not task.done():
                task.cancel()
        await asyncio.gather(*tasks, return_exceptions=True)
        raise
    fetched = dict(zip(tasks_by_url, results))
    duplicate_count = len(sources) - len(tasks_by_url)
    if duplicate_count:
        logger.info(
            "Fetched %d unique URL(s); reusing outcomes for %d duplicate "
            "source row(s).",
            len(tasks_by_url),
            duplicate_count,
        )

    # Preserve the input/source-ID order for deterministic database effects.
    # Each source row receives its own outcome, while exact duplicate URLs share
    # only the network result.
    return [
        ScrapeOutcome(
            source=source,
            body_text=fetched[str(source.get("official_url") or "")].body_text,
            error=fetched[str(source.get("official_url") or "")].error,
            failure_category=fetched[
                str(source.get("official_url") or "")
            ].failure_category,
        )
        for source in sources
    ]


def persist_outcomes(
    sb: Client,
    outcomes: list[ScrapeOutcome],
    stats: dict[str, int],
    filed_alerts: list[dict],
    failed_sources: list[dict],
) -> None:
    """Persist completed scrapes sequentially in deterministic source order."""

    for outcome in outcomes:
        source = outcome.source
        agency = str(source.get("agency_name") or "Unknown")
        url = str(source.get("official_url") or "")

        if outcome.error is not None:
            stats["failed"] += 1
            failed_sources.append(
                {
                    "agency": agency,
                    "url": url,
                    "error": outcome.error,
                    "kind": "source",
                    "category": outcome.failure_category or "other",
                }
            )
            continue

        try:
            source_id: str = source["id"]
            last_hash: str | None = source.get("last_content_hash")
            body_text = outcome.body_text
            if body_text is None:
                raise RuntimeError("scrape completed without content")

            new_hash = sha256(body_text)
            diff_summary = None
            if last_hash is not None and last_hash != new_hash:
                diff_summary = summarize_diff(
                    source.get("last_content_text"), body_text
                )

            classification, alert_id, current_hash = persist_scrape_result(
                sb,
                source_id,
                last_hash,
                new_hash,
                body_text,
                diff_summary,
            )
            stats["scraped"] += 1

            if classification == BASELINE:
                logger.info("  — Baseline recorded (hash=%s…)", new_hash[:12])
                stats["baseline"] += 1
            elif classification == UNCHANGED:
                logger.info("  — No change detected (hash=%s…)", new_hash[:12])
                stats["unchanged"] += 1
            elif classification == CHANGED:
                logger.info(
                    "  ⚡ Change detected; PENDING alert %s filed "
                    "(old=%s… → new=%s…).",
                    alert_id,
                    last_hash[:12],
                    new_hash[:12],
                )
                filed_alerts.append(
                    {
                        "agency": agency,
                        "url": url,
                        "diff_chars": len(diff_summary) if diff_summary else 0,
                    }
                )
                stats["changed"] += 1
            elif classification == STALE:
                expected_display = last_hash[:12] if last_hash else "none"
                current_display = current_hash[:12] if current_hash else "none"
                logger.warning(
                    "  ↻ Stale scrape ignored (expected=%s… current=%s…).",
                    expected_display,
                    current_display,
                )
                stats["stale"] += 1
            else:  # parse_persist_response rejects unknown classifications.
                raise RuntimeError(
                    f"unexpected persistence classification {classification!r}"
                )
        except Exception as exc:  # noqa: BLE001
            error = f"atomic persistence failed: {concise_error(exc)}"
            logger.error(
                "  ❌ [%s] %s failed — continuing with remaining sources: %s",
                agency,
                url,
                error,
            )
            stats["failed"] += 1
            failed_sources.append(
                {
                    "agency": agency,
                    "url": url,
                    "error": error,
                    "kind": "source",
                }
            )


async def run() -> dict[str, int]:
    """Main entry-point: fetch, scrape, and atomically persist source outcomes.

    Every source is attempted before the result is reported. Network work is
    concurrent, while database effects are sequential and deterministic.
    """
    stats = {
        "scraped": 0,
        "baseline": 0,
        "unchanged": 0,
        "changed": 0,
        "stale": 0,
        "failed": 0,
    }
    filed_alerts: list[dict] = []
    failed_sources: list[dict] = []

    try:
        sb = init_supabase()
        # Supabase does not guarantee row order without an explicit ordering.
        # Sort locally so persistence and logs are stable across runs.
        sources = sorted(
            fetch_official_sources(sb), key=lambda source: str(source.get("id", ""))
        )
        if not sources:
            raise WorkerConfigurationError(
                "no official sources found (is the table seeded?)"
            )

        logger.info(
            "Scraping %d source(s) with concurrency=%d.",
            len(sources),
            SCRAPE_CONCURRENCY,
        )
        async with async_playwright() as pw:
            browser = await pw.chromium.launch(headless=True)
            try:
                context = await browser.new_context(
                    user_agent=USER_AGENT,
                    viewport={"width": 1280, "height": 720},
                )
                context.set_default_timeout(PAGE_TIMEOUT_MS)
                outcomes = await scrape_all_sources(context, sources)

                # Network completion order cannot influence database state:
                # gather preserved the sorted source order, and this loop is
                # intentionally sequential.
                persist_outcomes(
                    sb, outcomes, stats, filed_alerts, failed_sources
                )
            finally:
                await browser.close()
    except Exception as exc:  # noqa: BLE001
        error = concise_error(exc)
        logger.exception("Fatal worker failure: %s", error)
        stats["failed"] += 1
        failed_sources.append(
            {
                "agency": "Worker runtime",
                "url": "n/a",
                "error": error,
                "kind": "runtime",
            }
        )
    finally:
        logger.info(
            "Run complete — scraped=%d  baseline=%d  unchanged=%d  "
            "changed=%d  stale=%d  failed=%d",
            stats["scraped"],
            stats["baseline"],
            stats["unchanged"],
            stats["changed"],
            stats["stale"],
            stats["failed"],
        )
        if ALERT_WEBHOOK_URL and (
            filed_alerts or failed_sources or stats["stale"] > 0
        ):
            notify_admins(
                ALERT_WEBHOOK_URL, stats, filed_alerts, failed_sources
            )
        write_step_summary(stats, filed_alerts, failed_sources)

    return stats


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    logger.info("ReloGo Worker starting …")
    run_stats = asyncio.run(run())
    if run_should_fail(run_stats):
        # Failed sources and stale CAS outcomes both make monitoring incomplete
        # and turn the scheduled Actions job red after all sources are attempted.
        logger.error(
            "Run incomplete (scraped=%d, stale=%d, failed=%d) — exiting 1.",
            run_stats["scraped"],
            run_stats["stale"],
            run_stats["failed"],
        )
        sys.exit(1)
    logger.info("ReloGo Worker finished.")

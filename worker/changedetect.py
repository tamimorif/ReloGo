"""
Pure change-detection logic for the ReloGo worker.

Kept free of I/O (no Playwright, Supabase, or network) so the alert-or-not
decision — the worker's correctness-critical core — can be unit-tested in
isolation. ``main.py`` imports these; the scrape/DB plumbing stays there.
"""

import difflib
import hashlib
import re

# Outcomes returned by the atomic persistence RPC. STALE means another worker
# advanced the row after this worker fetched its expected hash.
BASELINE = "BASELINE"
UNCHANGED = "UNCHANGED"
CHANGED = "CHANGED"
STALE = "STALE"
PERSIST_CLASSIFICATIONS = frozenset((BASELINE, UNCHANGED, CHANGED, STALE))

# The database RPC enforces the same hard ceiling. MAX_HTML_TEXT_CHARS may be
# configured lower at runtime, but never above this value.
HARD_MAX_CONTENT_CHARS = 1_000_000

# rule_change_alerts.diff_summary is for human review in the admin dashboard,
# not archival — cap it so a full page rewrite doesn't bloat the row.
MAX_DIFF_CHARS = 4000

# Content-sanity thresholds. A real government page body is never this short —
# anything below reads as a blank render, an error page, or a bot interstitial.
# ``main.py`` lets this be overridden via the MIN_CONTENT_CHARS env var for
# unusually terse sources.
MIN_CONTENT_CHARS = 200

# Block/error interstitials are short. Markers are only scanned when the body
# is at most this long, so a long real page that merely *mentions* e.g.
# "captcha" (an accessibility note, a news item) is never rejected.
MAX_BLOCK_PAGE_CHARS = 3000

# Lowercase phrases that betray a bot wall or error page rather than real
# content. Matched case-insensitively against short bodies only (see above).
BLOCK_PAGE_MARKERS = (
    # Bot walls / CAPTCHA challenges
    "access denied",
    "attention required",
    "checking your browser",
    "verify you are human",
    "verify that you are human",
    "enable javascript and cookies",
    "request blocked",
    "pardon our interruption",
    "captcha",
    # HTTP error / outage pages rendered as HTML
    "403 forbidden",
    "404 not found",
    "page not found",
    "500 internal server error",
    "502 bad gateway",
    "503 service unavailable",
    "service unavailable",
    "too many requests",
    "temporarily unavailable",
    "under maintenance",
    "down for maintenance",
)


def sha256(text: str) -> str:
    """Return the hex SHA-256 digest of *text* (UTF-8 encoded)."""
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def pdf_fingerprint_text(content: bytes) -> str:
    """Return a stable, human-readable monitoring record for PDF bytes.

    PDFs are treated as inert binary documents: the worker never executes or
    renders embedded content. The record is long enough to pass the normal
    content sanity gate, and its digest changes whenever the official file
    changes. Human approval remains mandatory for any resulting alert.
    """

    digest = hashlib.sha256(content).hexdigest()
    return (
        "ReloGo PDF monitoring record.\n"
        "This official source is a PDF document. The worker fingerprints the "
        "complete binary file without executing or rendering embedded content. "
        "Any binary change creates a PENDING alert for human review; the worker "
        "never updates live rules automatically.\n"
        "Media type: application/pdf\n"
        f"Byte length: {len(content)}\n"
        f"SHA-256: {digest}"
    )


def classify_change(last_hash: str | None, new_hash: str) -> str:
    """Classify a fresh content hash against the stored baseline.

    Returns:
        BASELINE  — no prior hash recorded; store it silently, do NOT alert
                    (the first time we've ever seen this source).
        UNCHANGED — the content hash matches the stored baseline.
        CHANGED   — the content hash differs; an admin alert should be filed.
    """
    if last_hash is None:
        return BASELINE
    if last_hash == new_hash:
        return UNCHANGED
    return CHANGED


def parse_persist_response(
    data: object,
) -> tuple[str, str | None, str | None]:
    """Validate and unpack one atomic persistence RPC response.

    PostgREST returns table-function rows as a list. Treat any unexpected
    shape as a persistence failure instead of guessing and reporting the wrong
    classification.
    """

    if not isinstance(data, list) or len(data) != 1 or not isinstance(data[0], dict):
        raise ValueError("persistence RPC must return exactly one object")

    row = data[0]
    classification = row.get("classification")
    alert_id = row.get("alert_id")
    current_hash = row.get("current_hash")

    if classification not in PERSIST_CLASSIFICATIONS:
        raise ValueError("persistence RPC returned an unknown classification")
    if alert_id is not None and not isinstance(alert_id, str):
        raise ValueError("persistence RPC returned an invalid alert id")
    if current_hash is not None and (
        not isinstance(current_hash, str)
        or re.fullmatch(r"[0-9a-f]{64}", current_hash) is None
    ):
        raise ValueError("persistence RPC returned an invalid current hash")
    if classification == CHANGED and not alert_id:
        raise ValueError("CHANGED persistence response is missing its alert id")
    if classification != CHANGED and alert_id is not None:
        raise ValueError("non-CHANGED persistence response included an alert id")
    if classification != STALE and current_hash is None:
        raise ValueError("successful persistence response is missing its hash")

    return classification, alert_id, current_hash


def content_rejection_reason(
    text: str,
    min_chars: int = MIN_CONTENT_CHARS,
    max_chars: int | None = None,
) -> str | None:
    """Sanity-check scraped *text* before it is treated as page content.

    A rejected scrape must count as a failed scrape and must NOT become the
    stored baseline — otherwise a bot wall or error page poisons the stored
    hash, and the next run against the recovered real page files a spurious
    alert.

    Returns:
        ``None``   — the text plausibly is a real page body; safe to classify.
        reason str — human-readable rejection reason (for the warning log):
                     the body exceeds *max_chars*, is shorter than *min_chars*,
                     or a short body matches an obvious bot-block/error marker.
    """
    if max_chars is not None and len(text) > max_chars:
        return f"body too long ({len(text)} chars, limit {max_chars})"

    stripped = text.strip()
    if len(stripped) < min_chars:
        return f"body too short ({len(stripped)} chars, need {min_chars})"
    if len(stripped) <= MAX_BLOCK_PAGE_CHARS:
        lowered = stripped.lower()
        for marker in BLOCK_PAGE_MARKERS:
            if marker in lowered:
                return f"looks like a bot-block/error page (matched {marker!r})"
    return None


def summarize_diff(
    old_text: str | None,
    new_text: str,
    max_chars: int = MAX_DIFF_CHARS,
) -> str | None:
    """Build the human-readable ``diff_summary`` for a rule-change alert.

    Returns a unified diff (2 lines of context) between the previously stored
    page text and the fresh scrape, truncated to *max_chars*.

    Returns ``None`` when no summary can be made:
    - *old_text* is ``None`` — the hash predates the stored-text column, so
      there is nothing to diff against (the alert still carries both hashes);
    - the texts are line-identical (a hash change from whitespace-only /
      line-ending churn produces an empty diff).
    """
    if old_text is None:
        return None
    diff_lines = difflib.unified_diff(
        old_text.splitlines(),
        new_text.splitlines(),
        fromfile="previous scrape",
        tofile="current scrape",
        lineterm="",
        n=2,
    )
    diff = "\n".join(diff_lines)
    if not diff:
        return None
    if len(diff) > max_chars:
        diff = diff[:max_chars] + "\n… (diff truncated)"
    return diff

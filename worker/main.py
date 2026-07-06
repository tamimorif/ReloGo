"""
ReloGo Worker — Official Source Scraper

Monitors official government/agency URLs for content changes.
When a change is detected, inserts a PENDING alert into `rule_change_alerts`
for admin review. Never modifies live rules directly.

Usage:
    python main.py
"""

import asyncio
import logging
import os
import sys
from datetime import datetime, timezone

from dotenv import load_dotenv
from playwright.async_api import async_playwright, TimeoutError as PlaywrightTimeoutError
from supabase import create_client, Client
from tenacity import (
    retry,
    retry_if_exception_type,
    stop_after_attempt,
    wait_exponential,
)

from changedetect import BASELINE, CHANGED, UNCHANGED, classify_change, sha256

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

load_dotenv()

SUPABASE_URL: str = os.environ.get("SUPABASE_URL", "")
SUPABASE_SERVICE_ROLE_KEY: str = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")

PAGE_TIMEOUT_MS: int = int(os.environ.get("PAGE_TIMEOUT_MS", "30000"))
NAV_TIMEOUT_MS: int = int(os.environ.get("NAV_TIMEOUT_MS", "60000"))

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


def init_supabase() -> Client:
    """Create and return a Supabase client using the service-role key (bypasses RLS)."""
    if not SUPABASE_URL or not SUPABASE_SERVICE_ROLE_KEY:
        logger.critical("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set.")
        sys.exit(1)
    logger.info("Connecting to Supabase at %s", SUPABASE_URL)
    return create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)


def fetch_official_sources(sb: Client) -> list[dict]:
    """Fetch all rows from the `official_sources` table."""
    response = sb.table("official_sources").select(
        "id, corridor_rule_id, agency_name, official_url, last_verified, last_content_hash"
    ).execute()
    rows = response.data or []
    logger.info("Fetched %d official source(s) to scrape.", len(rows))
    return rows


def insert_alert(
    sb: Client,
    official_source_id: str,
    old_hash: str,
    new_hash: str,
) -> None:
    """Insert a new PENDING alert into `rule_change_alerts`."""
    payload = {
        "official_source_id": official_source_id,
        "old_hash": old_hash,
        "new_hash": new_hash,
        "status": "PENDING",
    }
    sb.table("rule_change_alerts").insert(payload).execute()
    logger.info(
        "  ✅ Alert inserted — old_hash=%s… new_hash=%s…",
        old_hash[:12],
        new_hash[:12],
    )


def record_scrape_result(sb: Client, official_source_id: str, content_hash: str) -> None:
    """Persist the scrape baseline: last_verified timestamp + content hash."""
    sb.table("official_sources").update(
        {
            "last_verified": datetime.now(timezone.utc).isoformat(),
            "last_content_hash": content_hash,
        }
    ).eq("id", official_source_id).execute()


# ---------------------------------------------------------------------------
# Scraper
# ---------------------------------------------------------------------------


@retry(
    retry=retry_if_exception_type(PlaywrightTimeoutError),
    stop=stop_after_attempt(3),
    wait=wait_exponential(multiplier=2, min=2, max=30),
    reraise=True,
)
async def _scrape_with_retry(page, url: str) -> str:
    """Navigate to *url* and return the full body text. Retries on timeout."""
    await page.goto(url, wait_until="domcontentloaded", timeout=NAV_TIMEOUT_MS)
    # Give dynamic pages a moment to settle
    await page.wait_for_timeout(2000)
    text: str = await page.evaluate("() => document.body.innerText")
    return text.strip()


async def scrape_url(page, url: str) -> str | None:
    """
    Navigate to *url* and return the full body text, or ``None`` on failure.
    Flaky government sites get 3 attempts with exponential backoff.
    """
    try:
        return await _scrape_with_retry(page, url)
    except PlaywrightTimeoutError:
        logger.warning("  ⏱  Timeout loading %s (after 3 attempts)", url)
        return None
    except Exception as exc:  # noqa: BLE001
        logger.error("  ❌ Error scraping %s: %s", url, exc)
        return None


async def run() -> None:
    """Main entry-point: fetch sources, scrape, detect changes, create alerts."""
    sb = init_supabase()
    sources = fetch_official_sources(sb)

    if not sources:
        logger.warning("No official sources found. Exiting.")
        return

    stats = {"scraped": 0, "unchanged": 0, "changed": 0, "failed": 0}

    async with async_playwright() as pw:
        browser = await pw.chromium.launch(headless=True)
        context = await browser.new_context(
            user_agent=(
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/125.0.0.0 Safari/537.36"
            ),
            viewport={"width": 1280, "height": 720},
        )
        # Set a default page-level timeout
        context.set_default_timeout(PAGE_TIMEOUT_MS)
        page = await context.new_page()

        for source in sources:
            source_id: str = source["id"]
            agency: str = source.get("agency_name", "Unknown")
            url: str = source["official_url"]
            last_hash: str | None = source.get("last_content_hash")

            logger.info("Scraping [%s] %s …", agency, url)
            body_text = await scrape_url(page, url)

            if body_text is None:
                stats["failed"] += 1
                continue

            stats["scraped"] += 1
            new_hash = sha256(body_text)
            classification = classify_change(last_hash, new_hash)

            if classification == BASELINE:
                # First scrape of this source — record the baseline, no alert.
                logger.info("  — Baseline recorded (hash=%s…)", new_hash[:12])
                stats["unchanged"] += 1
            elif classification == UNCHANGED:
                logger.info("  — No change detected (hash=%s…)", new_hash[:12])
                stats["unchanged"] += 1
            else:  # CHANGED
                logger.info(
                    "  ⚡ Change detected! old=%s… → new=%s…",
                    last_hash[:12],
                    new_hash[:12],
                )
                insert_alert(sb, source_id, last_hash, new_hash)
                stats["changed"] += 1

            # Persist the new baseline (last_verified + last_content_hash)
            record_scrape_result(sb, source_id, new_hash)

        await browser.close()

    logger.info(
        "Run complete — scraped=%d  unchanged=%d  changed=%d  failed=%d",
        stats["scraped"],
        stats["unchanged"],
        stats["changed"],
        stats["failed"],
    )


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    logger.info("ReloGo Worker starting …")
    asyncio.run(run())
    logger.info("ReloGo Worker finished.")

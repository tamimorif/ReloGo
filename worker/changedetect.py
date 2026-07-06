"""
Pure change-detection logic for the ReloGo worker.

Kept free of I/O (no Playwright, Supabase, or network) so the alert-or-not
decision — the worker's correctness-critical core — can be unit-tested in
isolation. ``main.py`` imports these; the scrape/DB plumbing stays there.
"""

import hashlib

# The three possible outcomes of comparing a fresh scrape against the stored
# baseline. BASELINE and UNCHANGED file no alert; CHANGED does.
BASELINE = "baseline"
UNCHANGED = "unchanged"
CHANGED = "changed"


def sha256(text: str) -> str:
    """Return the hex SHA-256 digest of *text* (UTF-8 encoded)."""
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


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

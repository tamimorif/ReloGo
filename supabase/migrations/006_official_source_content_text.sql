-- ============================================================================
-- Migration 006 — official_sources.last_content_text
--
-- The worker has always stored a SHA-256 fingerprint of each official page
-- (002: last_content_hash), which detects THAT a page changed but not WHAT
-- changed — so rule_change_alerts.diff_summary was always NULL and the admin
-- Alerts table had nothing human-readable to review.
--
-- Keep the plain body text of the last scrape alongside the hash so the next
-- scrape can compute a unified diff into rule_change_alerts.diff_summary.
--
-- Exposure note: official_sources is publicly readable (001: "public read"
-- RLS policy) so the mobile/admin apps can show agency names and URLs. The
-- scraped page bodies are public government pages — not confidential — but
-- multi-KB blobs behind the anon key invite bulk-download/bandwidth abuse
-- and expose scraper internals for no client benefit. RLS has no column
-- granularity, so the content columns are restricted with COLUMN-LEVEL
-- GRANTS layered on top of the row policy: clients keep the metadata
-- columns, only service_role (the worker) reads the fingerprint/body.
--
-- ⚠ Client caveat: with column-level grants, SELECT * against
-- official_sources fails for anon/authenticated with "permission denied" —
-- clients must name columns explicitly. (The only client query today is the
-- admin AlertsTable embed, which already selects explicit columns.)
-- ============================================================================

ALTER TABLE official_sources
    ADD COLUMN last_content_text TEXT;

COMMENT ON COLUMN official_sources.last_content_text IS
    'Plain body text of the page at the last scrape; baseline for the human-readable diff the worker writes into rule_change_alerts.diff_summary. Service-role read only (column-level grants).';

-- Replace the platform's blanket SELECT grant with an explicit column list
-- that excludes the scraper-internal columns (last_content_hash from 002,
-- last_content_text from this migration).
REVOKE SELECT ON official_sources FROM anon, authenticated;
GRANT SELECT (id, corridor_rule_id, agency_name, official_url, last_verified, created_at)
    ON official_sources TO anon, authenticated;

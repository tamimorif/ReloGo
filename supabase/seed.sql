-- ============================================================================
-- Local-only privilege baseline
-- ============================================================================
--
-- WHY THIS FILE EXISTS
--
-- The hosted Supabase platform provisions every project with default
-- privileges that grant table/sequence DML on `public` to `anon`,
-- `authenticated`, and `service_role`. RLS -- not the absence of a GRANT -- is
-- the real security gate, so this repository's migrations never issue those
-- baseline grants themselves; they only ever GRANT EXECUTE on functions and
-- then REVOKE the specific privileges that must be narrower than the baseline.
--
-- `supabase db reset` applies migrations only. It does not reproduce the
-- platform's default privileges, so a fresh local database ends up with
-- `anon`/`authenticated` holding no SELECT/INSERT/UPDATE at all. Every
-- migration REVOKE then becomes a no-op, and the local schema silently stops
-- resembling the hosted one.
--
-- The visible symptom is that the app cannot run against a local stack:
-- anonymous sign-in succeeds, the very first `user_profiles` write fails with
-- `42501 permission denied for table user_profiles`, and onboarding shows its
-- generic "Couldn't finish setup" alert. Both test suites hid this for a long
-- time because each issues its own blanket GRANT during setup
-- (`supabase/tests/rls_and_rpcs_test.sql` and `tests/e2e/conftest.py`), so
-- neither one ever observed the un-granted state.
--
-- This file closes that gap for local development. It is applied by
-- `supabase db reset` via `[db.seed]` in config.toml and is NEVER applied to a
-- hosted project -- `supabase db push` deploys migrations only -- so it cannot
-- widen production privileges.
--
-- ORDER MATTERS. On hosted, the platform's baseline grants exist BEFORE the
-- migrations run, so each migration's REVOKE lands on top of them. Here the
-- migrations have already run, so the baseline is granted first and every
-- migration-defined restriction is then re-applied, mirroring that order.
--
-- Keep the restrictions below in sync with migrations 006, 008, 009, 011, 015,
-- 023, and 027. `supabase/tests/rls_and_rpcs_test.sql` models the same ordering and its
-- privilege assertions are the guard against this file drifting.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1. Platform baseline (what a hosted project starts with)
-- ----------------------------------------------------------------------------
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;


-- ----------------------------------------------------------------------------
-- 2. Migration 006 — official_sources is column-restricted for clients.
--    Scraped page bodies and hashes must never reach anon/authenticated.
-- ----------------------------------------------------------------------------
REVOKE SELECT ON public.official_sources FROM anon, authenticated;
GRANT SELECT (
    id,
    corridor_rule_id,
    agency_name,
    official_url,
    last_verified,
    created_at
)
    ON public.official_sources TO anon, authenticated;


-- ----------------------------------------------------------------------------
-- 3. Migration 008/012 — clients may write only narrow support columns, so
--    server-authored timestamps and thread metadata cannot be forged.
-- ----------------------------------------------------------------------------
REVOKE INSERT ON public.support_messages FROM authenticated;
GRANT INSERT (thread_id, sender, body)
    ON public.support_messages TO authenticated;

REVOKE INSERT, UPDATE ON public.support_threads FROM authenticated;
GRANT INSERT (user_id, status) ON public.support_threads TO authenticated;
GRANT UPDATE (status) ON public.support_threads TO authenticated;


-- ----------------------------------------------------------------------------
-- 4. Migration 009 — live rule review is RPC-only. No client may update a
--    corridor rule or an alert directly.
-- ----------------------------------------------------------------------------
REVOKE UPDATE ON public.corridor_task_rules FROM anon, authenticated;
REVOKE UPDATE ON public.rule_change_alerts FROM anon, authenticated;


-- ----------------------------------------------------------------------------
-- 5. Migration 011 — worker least privilege. The shared server role reads a
--    few source columns and persists baselines only through its RPC.
-- ----------------------------------------------------------------------------
REVOKE ALL PRIVILEGES ON TABLE public.official_sources FROM service_role;
GRANT SELECT (
    id,
    agency_name,
    official_url,
    monitor_url,
    monitoring_mode,
    manual_review_owner,
    manual_review_interval_days,
    last_content_hash,
    last_content_text
)
    ON public.official_sources TO service_role;

REVOKE ALL PRIVILEGES ON TABLE public.rule_change_alerts FROM service_role;


-- ----------------------------------------------------------------------------
-- 6. Migration 015 — support AI least privilege. The Edge Function reads only
--    non-PII columns and writes replies through its finalize RPC.
-- ----------------------------------------------------------------------------
REVOKE ALL PRIVILEGES ON TABLE public.support_threads FROM service_role;
GRANT SELECT (id, user_id, status, human_takeover_at)
    ON public.support_threads TO service_role;
GRANT UPDATE (status) ON public.support_threads TO service_role;

REVOKE ALL PRIVILEGES ON TABLE public.support_messages FROM service_role;
GRANT SELECT (id, thread_id, sender, body, created_at)
    ON public.support_messages TO service_role;

REVOKE ALL PRIVILEGES ON TABLE public.user_profiles FROM service_role;
GRANT SELECT (
    id,
    origin_prov,
    dest_prov,
    move_date,
    has_vehicle,
    has_dependents
)
    ON public.user_profiles TO service_role;

REVOKE ALL PRIVILEGES ON TABLE public.corridor_task_rules FROM service_role;
GRANT SELECT (
    id,
    task_id,
    origin_province,
    dest_province,
    days_deadline,
    is_mandatory
)
    ON public.corridor_task_rules TO service_role;

REVOKE ALL PRIVILEGES ON TABLE public.global_tasks FROM service_role;
GRANT SELECT (
    id,
    title_en,
    base_description_en,
    requires_vehicle,
    requires_dependents
)
    ON public.global_tasks TO service_role;


-- ----------------------------------------------------------------------------
-- 7. Migration 023 — the canonical SECURITY INVOKER resolver needs a few
--    additional public metadata columns. These remain read-only and non-PII.
-- ----------------------------------------------------------------------------
GRANT SELECT (created_at)
    ON public.corridor_task_rules TO service_role;

GRANT SELECT (task_key)
    ON public.global_tasks TO service_role;

GRANT SELECT (corridor_rule_id, last_verified)
    ON public.official_sources TO service_role;

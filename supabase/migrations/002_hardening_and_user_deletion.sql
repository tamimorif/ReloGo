-- ============================================================================
-- ReloGo — Canadian Relocation Autopilot
-- Supabase Migration: 002_hardening_and_user_deletion.sql
--
-- Fixes critical defects in 001 and completes the Phase 1/2 backend:
--   1.  BUGFIX: corridor_task_rules province columns were VARCHAR(2) but the
--       wildcard value is 'ANY' (3 chars) — any wildcard insert failed.
--   2.  global_tasks.requires_vehicle / requires_dependents — needed by the
--       Phase 3 checklist engine to filter tasks by user profile.
--   3.  official_sources.last_content_hash — the scraper's change-detection
--       baseline (001's comments referenced a hash that never existed).
--   4.  Data-integrity constraints (province codes, email format, uniqueness).
--   5.  FK indexes and updated_at triggers.
--   6.  delete_current_user() RPC — PIPEDA "Delete My Data" (Phase 2.4).
--   7.  admin_users + is_admin() + admin RLS policies so the admin dashboard
--       can work with the anon key instead of a client-side email check.
--   8.  RLS performance: per-user policies rewritten with (SELECT auth.uid())
--       so the UID is evaluated once per statement, not once per row.
-- ============================================================================


-- ============================================================================
-- 1. BUGFIX — widen corridor province columns to fit the 'ANY' wildcard
-- ============================================================================
ALTER TABLE corridor_task_rules
    ALTER COLUMN origin_province TYPE VARCHAR(3),
    ALTER COLUMN dest_province   TYPE VARCHAR(3);


-- ============================================================================
-- 2. GLOBAL_TASKS — conditional-applicability flags
--    The checklist engine hides vehicle tasks from users without a vehicle
--    and school tasks from users without dependents.
-- ============================================================================
ALTER TABLE global_tasks
    ADD COLUMN requires_vehicle    BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN requires_dependents BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN global_tasks.requires_vehicle    IS 'Task only applies when user_profiles.has_vehicle is TRUE.';
COMMENT ON COLUMN global_tasks.requires_dependents IS 'Task only applies when user_profiles.has_dependents is TRUE.';

UPDATE global_tasks SET requires_vehicle    = TRUE WHERE task_key = 'REGISTER_VEHICLE';
UPDATE global_tasks SET requires_dependents = TRUE WHERE task_key = 'REGISTER_CHILDREN_SCHOOL';


-- ============================================================================
-- 3. OFFICIAL_SOURCES — scraper change-detection baseline
--    The worker compares the SHA-256 of the freshly scraped page against
--    last_content_hash. On first scrape it just records the hash (no alert).
-- ============================================================================
ALTER TABLE official_sources
    ADD COLUMN last_content_hash VARCHAR(64);

COMMENT ON COLUMN official_sources.last_content_hash IS 'SHA-256 hex digest of the page text at the last scrape.';


-- ============================================================================
-- 4. DATA-INTEGRITY CONSTRAINTS
-- ============================================================================

-- Province code whitelists (NULL passes CHECK by SQL semantics, which is
-- correct for nullable columns).
ALTER TABLE corridor_task_rules
    ADD CONSTRAINT corridor_task_rules_origin_province_check
        CHECK (origin_province IN ('AB','BC','MB','NB','NL','NS','NT','NU','ON','PE','QC','SK','YT','ANY')),
    ADD CONSTRAINT corridor_task_rules_dest_province_check
        CHECK (dest_province IN ('AB','BC','MB','NB','NL','NS','NT','NU','ON','PE','QC','SK','YT','ANY')),
    ADD CONSTRAINT corridor_task_rules_days_deadline_check
        CHECK (days_deadline IS NULL OR days_deadline >= 0);

ALTER TABLE user_profiles
    ADD CONSTRAINT user_profiles_origin_prov_check
        CHECK (origin_prov IN ('AB','BC','MB','NB','NL','NS','NT','NU','ON','PE','QC','SK','YT')),
    ADD CONSTRAINT user_profiles_dest_prov_check
        CHECK (dest_prov IN ('AB','BC','MB','NB','NL','NS','NT','NU','ON','PE','QC','SK','YT'));

ALTER TABLE waitlist
    ADD CONSTRAINT waitlist_email_format_check
        CHECK (email ~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
    ADD CONSTRAINT waitlist_origin_province_check
        CHECK (origin_province IN ('AB','BC','MB','NB','NL','NS','NT','NU','ON','PE','QC','SK','YT')),
    ADD CONSTRAINT waitlist_dest_province_check
        CHECK (dest_province IN ('AB','BC','MB','NB','NL','NS','NT','NU','ON','PE','QC','SK','YT'));

-- One rule per (task, corridor) — prevents ambiguous duplicate rules.
ALTER TABLE corridor_task_rules
    ADD CONSTRAINT corridor_task_rules_unique_corridor
        UNIQUE (task_id, origin_province, dest_province);

-- Case-insensitive de-duplication of waitlist signups.
CREATE UNIQUE INDEX waitlist_email_unique_idx ON waitlist (lower(email));


-- ============================================================================
-- 5. FK INDEXES & updated_at TRIGGERS
-- ============================================================================
CREATE INDEX idx_corridor_task_rules_task_id        ON corridor_task_rules (task_id);
CREATE INDEX idx_official_sources_corridor_rule_id  ON official_sources (corridor_rule_id);
CREATE INDEX idx_rule_change_alerts_source_id       ON rule_change_alerts (official_source_id);
CREATE INDEX idx_user_task_progress_task_rule_id    ON user_task_progress (task_rule_id);

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_user_profiles_updated_at
    BEFORE UPDATE ON user_profiles
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_user_task_progress_updated_at
    BEFORE UPDATE ON user_task_progress
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


-- ============================================================================
-- 6. PIPEDA — delete_current_user()
--    The mobile "Delete My Data" flow calls this RPC. It removes the
--    auth.users row; ON DELETE CASCADE wipes user_profiles, which cascades
--    to user_task_progress (and admin_users, if the user was an admin).
--    SECURITY DEFINER because clients have no privileges on auth.users.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.delete_current_user()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'delete_current_user(): not authenticated';
    END IF;

    DELETE FROM auth.users WHERE id = auth.uid();
END;
$$;

COMMENT ON FUNCTION public.delete_current_user() IS
    'PIPEDA right-to-be-forgotten: deletes the calling user''s auth record and, via cascades, all of their application data.';

REVOKE ALL ON FUNCTION public.delete_current_user() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_current_user() TO authenticated;


-- ============================================================================
-- 7. ADMIN ACCESS — admin_users + is_admin()
--    The admin dashboard is a browser SPA using the anon key; a client-side
--    email check is not a security boundary. Membership in admin_users is
--    the server-side source of truth. Rows are managed via service_role
--    (SQL editor / ops tooling), never by the SPA itself.
--
--    To grant admin access:
--      INSERT INTO admin_users (user_id)
--      SELECT id FROM auth.users WHERE email = 'admin@relogo.ca';
-- ============================================================================
CREATE TABLE admin_users (
    user_id     UUID        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE admin_users IS 'Server-side admin allowlist. Managed via service_role only.';

ALTER TABLE admin_users ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_users: users can read own membership"
    ON admin_users FOR SELECT
    TO authenticated
    USING (user_id = (SELECT auth.uid()));

CREATE POLICY "admin_users: service_role full access"
    ON admin_users FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- STABLE so the planner caches the result within a statement.
-- SECURITY DEFINER so it can read admin_users regardless of the caller's RLS.
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.admin_users WHERE user_id = auth.uid()
    );
$$;

REVOKE ALL ON FUNCTION public.is_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;

-- Admins can review and resolve alerts from the dashboard.
CREATE POLICY "rule_change_alerts: admins can read"
    ON rule_change_alerts FOR SELECT
    TO authenticated
    USING (public.is_admin());

CREATE POLICY "rule_change_alerts: admins can update"
    ON rule_change_alerts FOR UPDATE
    TO authenticated
    USING (public.is_admin())
    WITH CHECK (public.is_admin());

-- Admins can correct live rules after approving an alert.
CREATE POLICY "corridor_task_rules: admins can update"
    ON corridor_task_rules FOR UPDATE
    TO authenticated
    USING (public.is_admin())
    WITH CHECK (public.is_admin());

-- Atomic "Save & Approve": updates the rule AND resolves the alert in one
-- transaction. Two separate client-side writes could leave a changed live
-- rule behind a still-PENDING alert if the second write failed.
CREATE OR REPLACE FUNCTION public.approve_rule_change(
    p_alert_id      UUID,
    p_days_deadline INTEGER,   -- NULL = no fixed deadline
    p_is_mandatory  BOOLEAN
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_rule_id UUID;
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'approve_rule_change(): admin access required';
    END IF;

    SELECT os.corridor_rule_id INTO v_rule_id
    FROM public.rule_change_alerts rca
    JOIN public.official_sources os ON os.id = rca.official_source_id
    WHERE rca.id = p_alert_id;

    IF v_rule_id IS NULL THEN
        RAISE EXCEPTION 'approve_rule_change(): alert % not found', p_alert_id;
    END IF;

    UPDATE public.corridor_task_rules
    SET days_deadline = p_days_deadline,
        is_mandatory  = p_is_mandatory
    WHERE id = v_rule_id;

    UPDATE public.rule_change_alerts
    SET status = 'APPROVED'
    WHERE id = p_alert_id;
END;
$$;

REVOKE ALL ON FUNCTION public.approve_rule_change(UUID, INTEGER, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.approve_rule_change(UUID, INTEGER, BOOLEAN) TO authenticated;


-- ============================================================================
-- 8. RLS PERFORMANCE & GAP FIXES
--    (SELECT auth.uid()) is evaluated once per statement instead of per row.
--    Also: users may DELETE their own progress rows (corridor change), and
--    authenticated visitors may join the waitlist (001 allowed anon only).
-- ============================================================================
DROP POLICY "user_profiles: users can read own row"      ON user_profiles;
DROP POLICY "user_profiles: users can insert own row"    ON user_profiles;
DROP POLICY "user_profiles: users can update own row"    ON user_profiles;
DROP POLICY "user_task_progress: users can read own rows"   ON user_task_progress;
DROP POLICY "user_task_progress: users can insert own rows" ON user_task_progress;
DROP POLICY "user_task_progress: users can update own rows" ON user_task_progress;

CREATE POLICY "user_profiles: users can read own row"
    ON user_profiles FOR SELECT
    TO authenticated
    USING ((SELECT auth.uid()) = id);

CREATE POLICY "user_profiles: users can insert own row"
    ON user_profiles FOR INSERT
    TO authenticated
    WITH CHECK ((SELECT auth.uid()) = id);

CREATE POLICY "user_profiles: users can update own row"
    ON user_profiles FOR UPDATE
    TO authenticated
    USING  ((SELECT auth.uid()) = id)
    WITH CHECK ((SELECT auth.uid()) = id);

CREATE POLICY "user_task_progress: users can read own rows"
    ON user_task_progress FOR SELECT
    TO authenticated
    USING ((SELECT auth.uid()) = user_id);

CREATE POLICY "user_task_progress: users can insert own rows"
    ON user_task_progress FOR INSERT
    TO authenticated
    WITH CHECK ((SELECT auth.uid()) = user_id);

CREATE POLICY "user_task_progress: users can update own rows"
    ON user_task_progress FOR UPDATE
    TO authenticated
    USING  ((SELECT auth.uid()) = user_id)
    WITH CHECK ((SELECT auth.uid()) = user_id);

CREATE POLICY "user_task_progress: users can delete own rows"
    ON user_task_progress FOR DELETE
    TO authenticated
    USING ((SELECT auth.uid()) = user_id);


-- ============================================================================
-- 9. WAITLIST — join via RPC only (prevents email enumeration)
--    With a unique index on lower(email), direct PostgREST inserts leak
--    membership: a duplicate insert returns error 23505 whose DETAIL echoes
--    the email, so anyone with the anon key could probe who is signed up.
--    Instead, inserts go through a SECURITY DEFINER function that swallows
--    duplicates — the caller always sees success.
-- ============================================================================
DROP POLICY "waitlist: anon can insert" ON waitlist;

CREATE OR REPLACE FUNCTION public.join_waitlist(
    p_email           TEXT,
    p_origin_province TEXT DEFAULT NULL,
    p_dest_province   TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    INSERT INTO public.waitlist (email, origin_province, dest_province)
    VALUES (lower(trim(p_email)), p_origin_province, p_dest_province)
    ON CONFLICT DO NOTHING;
END;
$$;

COMMENT ON FUNCTION public.join_waitlist(TEXT, TEXT, TEXT) IS
    'Landing-page waitlist signup. Duplicate emails are silently ignored so callers cannot probe membership.';

REVOKE ALL ON FUNCTION public.join_waitlist(TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.join_waitlist(TEXT, TEXT, TEXT) TO anon, authenticated;


-- ============================================================================
-- END OF MIGRATION 002_hardening_and_user_deletion.sql
-- ============================================================================

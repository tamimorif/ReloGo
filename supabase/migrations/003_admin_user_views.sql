-- ============================================================================
-- ReloGo — Canadian Relocation Autopilot
-- Supabase Migration: 003_admin_user_views.sql
--
-- Admin "Users" page support:
--   1. RLS: admins may READ all user_profiles / user_task_progress rows.
--      (Write access stays user-only — admins observe, never edit.)
--   2. admin_list_users()        — one row per profile, joined with
--      auth.users metadata (email, anonymous flag, sign-in times) plus
--      checklist progress counts. SECURITY DEFINER because PostgREST
--      cannot reach the auth schema directly.
--   3. admin_get_user_detail(uuid) — everything the server knows about one
--      user, including their full per-task checklist state.
--
-- PIPEDA note: none of this exposes PII. Health card / licence numbers,
-- names, street addresses, and DOBs exist only on the user's device and
-- have no server-side representation to leak.
--
-- Conventions follow 002: SET search_path = '', REVOKE FROM PUBLIC/anon,
-- GRANT EXECUTE TO authenticated, explicit is_admin() check inside.
-- ============================================================================


-- ============================================================================
-- 1. RLS — admin read access (observation only; no INSERT/UPDATE/DELETE)
-- ============================================================================
-- (SELECT ...) wrapper = one is_admin() evaluation per statement, not per
-- row — same initplan convention 002 established for auth.uid() policies.
CREATE POLICY "user_profiles: admins can read all"
    ON user_profiles FOR SELECT
    TO authenticated
    USING ((SELECT public.is_admin()));

CREATE POLICY "user_task_progress: admins can read all"
    ON user_task_progress FOR SELECT
    TO authenticated
    USING ((SELECT public.is_admin()));


-- ============================================================================
-- 2. admin_list_users()
--    tasks_total counts the rules applicable to the user's corridor and
--    flags (same filter the mobile checklist applies), so the admin sees
--    the same "X of Y" the user does.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.admin_list_users()
RETURNS TABLE (
    user_id            UUID,
    email              TEXT,
    is_anonymous       BOOLEAN,
    joined_at          TIMESTAMPTZ,
    last_sign_in_at    TIMESTAMPTZ,
    origin_prov        TEXT,
    dest_prov          TEXT,
    move_date          DATE,
    has_vehicle        BOOLEAN,
    has_dependents     BOOLEAN,
    profile_updated_at TIMESTAMPTZ,
    tasks_completed    BIGINT,
    tasks_total        BIGINT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'admin_list_users(): admin access required';
    END IF;

    -- Both counts come from ONE pass over the applicable-rule set, so they
    -- can never drift apart: completed tasks from a corridor the user has
    -- since left (stale user_task_progress rows survive profile changes)
    -- are excluded, matching the "X of Y" the mobile checklist shows.
    RETURN QUERY
    SELECT
        p.id,
        u.email::TEXT,
        COALESCE(u.is_anonymous, FALSE),
        u.created_at,
        u.last_sign_in_at,
        p.origin_prov::TEXT,
        p.dest_prov::TEXT,
        p.move_date,
        p.has_vehicle,
        p.has_dependents,
        p.updated_at,
        COALESCE(counts.completed, 0),
        COALESCE(counts.total, 0)
    FROM public.user_profiles p
    LEFT JOIN auth.users u ON u.id = p.id
    LEFT JOIN LATERAL (
        SELECT
            COUNT(*) FILTER (WHERE utp.status = 'COMPLETED') AS completed,
            COUNT(*)                                         AS total
        FROM public.corridor_task_rules r
        JOIN public.global_tasks t ON t.id = r.task_id
        LEFT JOIN public.user_task_progress utp
               ON utp.task_rule_id = r.id AND utp.user_id = p.id
        WHERE (r.origin_province = p.origin_prov OR r.origin_province = 'ANY')
          AND (r.dest_province   = p.dest_prov   OR r.dest_province   = 'ANY')
          AND (NOT t.requires_vehicle    OR p.has_vehicle)
          AND (NOT t.requires_dependents OR p.has_dependents)
    ) counts ON TRUE
    ORDER BY u.created_at DESC NULLS LAST;
END;
$$;

COMMENT ON FUNCTION public.admin_list_users() IS
    'Admin dashboard: all user profiles joined with auth metadata and checklist progress counts. No PII — identity documents live only on user devices.';

REVOKE ALL ON FUNCTION public.admin_list_users() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_users() TO authenticated;


-- ============================================================================
-- 3. admin_get_user_detail(p_user_id)
--    Returns JSONB: profile + auth metadata + the user's full checklist
--    (applicable corridor rules LEFT JOINed with their progress rows;
--    a missing progress row renders as AVAILABLE, mirroring the mobile app).
-- ============================================================================
CREATE OR REPLACE FUNCTION public.admin_get_user_detail(p_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_result JSONB;
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'admin_get_user_detail(): admin access required';
    END IF;

    SELECT jsonb_build_object(
        'user_id',            p.id,
        'email',              u.email,
        'is_anonymous',       COALESCE(u.is_anonymous, FALSE),
        'joined_at',          u.created_at,
        'last_sign_in_at',    u.last_sign_in_at,
        'origin_prov',        p.origin_prov,
        'dest_prov',          p.dest_prov,
        'move_date',          p.move_date,
        'has_vehicle',        p.has_vehicle,
        'has_dependents',     p.has_dependents,
        'profile_created_at', p.created_at,
        'profile_updated_at', p.updated_at,
        'tasks', COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
                'task_rule_id',      r.id,
                'task_key',          t.task_key,
                'title',             t.title_en,
                'days_deadline',     r.days_deadline,
                'is_mandatory',      r.is_mandatory,
                'status',            COALESCE(utp.status, 'AVAILABLE'),
                'status_updated_at', utp.updated_at,
                'official_url', (SELECT os.official_url
                                   FROM public.official_sources os
                                  WHERE os.corridor_rule_id = r.id
                                  ORDER BY os.created_at
                                  LIMIT 1)
            ) ORDER BY t.title_en)
            FROM public.corridor_task_rules r
            JOIN public.global_tasks t ON t.id = r.task_id
            LEFT JOIN public.user_task_progress utp
                   ON utp.task_rule_id = r.id AND utp.user_id = p.id
            WHERE (r.origin_province = p.origin_prov OR r.origin_province = 'ANY')
              AND (r.dest_province   = p.dest_prov   OR r.dest_province   = 'ANY')
              AND (NOT t.requires_vehicle    OR p.has_vehicle)
              AND (NOT t.requires_dependents OR p.has_dependents)
        ), '[]'::JSONB)
    )
    INTO v_result
    FROM public.user_profiles p
    LEFT JOIN auth.users u ON u.id = p.id
    WHERE p.id = p_user_id;

    IF v_result IS NULL THEN
        RAISE EXCEPTION 'admin_get_user_detail(): user % not found', p_user_id;
    END IF;

    RETURN v_result;
END;
$$;

COMMENT ON FUNCTION public.admin_get_user_detail(UUID) IS
    'Admin dashboard: one user''s profile, auth metadata, and full checklist state. No PII — identity documents live only on user devices.';

REVOKE ALL ON FUNCTION public.admin_get_user_detail(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_get_user_detail(UUID) TO authenticated;


-- ============================================================================
-- END OF MIGRATION 003_admin_user_views.sql
-- ============================================================================

-- ============================================================================
-- ReloGo — server-side pagination for admin_list_users()
--
-- Migration 003 returned every user in one payload; the dashboard then paged
-- the render client-side. As the user base grows that payload is unbounded.
-- This replaces the function with LIMIT/OFFSET paging plus a windowed
-- total_count, so the admin "Users" page fetches one page at a time.
--
-- Behaviour is otherwise identical to 003: is_admin()-gated, SECURITY DEFINER,
-- same columns and ordering, and no PII (identity documents live only on the
-- user's device and have no server-side representation).
-- ============================================================================

-- The return TABLE shape and the argument list both change, so the old
-- zero-argument function is dropped rather than replaced. Nothing depends on
-- it except the grants re-established below.
DROP FUNCTION public.admin_list_users();

CREATE FUNCTION public.admin_list_users(
    p_limit  INT DEFAULT 50,
    p_offset INT DEFAULT 0
)
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
    tasks_total        BIGINT,
    total_count        BIGINT
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

    -- Clamp paging arguments so a client cannot request an unbounded page, a
    -- zero/negative page size, or a negative offset.
    p_limit  := least(greatest(coalesce(p_limit, 50), 1), 200);
    p_offset := greatest(coalesce(p_offset, 0), 0);

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
        COALESCE(counts.total, 0),
        -- Full profile count so the dashboard can show "X of N" and know when
        -- to stop paging. A scalar subquery (not COUNT(*) OVER()) keeps the
        -- count cheap and lets LIMIT/OFFSET bound the per-row LATERAL work
        -- instead of forcing the whole windowed set to materialize each page.
        (SELECT count(*) FROM public.user_profiles)
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
    -- p.id is a deterministic tiebreaker so OFFSET paging never skips or
    -- duplicates a row when two profiles share a created_at.
    ORDER BY u.created_at DESC NULLS LAST, p.id
    LIMIT p_limit OFFSET p_offset;
END;
$$;

COMMENT ON FUNCTION public.admin_list_users(INT, INT) IS
    'Admin dashboard: one page of user profiles (LIMIT/OFFSET, ordered newest-first) joined with auth metadata and checklist progress counts, plus a windowed total_count. No PII — identity documents live only on user devices.';

REVOKE ALL ON FUNCTION public.admin_list_users(INT, INT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_users(INT, INT) TO authenticated;

-- ============================================================================
-- END OF MIGRATION 021_admin_user_pagination.sql
-- ============================================================================

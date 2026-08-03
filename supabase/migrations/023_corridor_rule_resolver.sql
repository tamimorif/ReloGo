-- ============================================================================
-- ReloGo — canonical corridor-rule resolution
--
-- A corridor may have rules at four specificity levels. Direct client and
-- server queries previously returned every matching wildcard row, so adding a
-- more specific rule could duplicate a task. This migration creates one
-- canonical resolver with deterministic precedence:
--
--   exact origin / exact destination
--   ANY origin   / exact destination
--   exact origin / ANY destination
--   ANY origin   / ANY destination
--
-- The resolver is SECURITY INVOKER. Public callers remain behind the source
-- tables' RLS policies and column grants; the shared service_role receives
-- only the additional non-PII metadata columns needed by this read path.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.resolve_corridor_rules(
    p_origin_province TEXT,
    p_dest_province   TEXT
)
RETURNS TABLE (
    id                   UUID,
    task_id              UUID,
    origin_province      TEXT,
    dest_province        TEXT,
    days_deadline        INTEGER,
    is_mandatory         BOOLEAN,
    created_at           TIMESTAMPTZ,
    task_key             TEXT,
    title_en             TEXT,
    base_description_en  TEXT,
    requires_vehicle     BOOLEAN,
    requires_dependents  BOOLEAN,
    official_sources     JSONB
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
    WITH ranked_rules AS (
        SELECT
            r.*,
            row_number() OVER (
                PARTITION BY r.task_id
                ORDER BY
                    CASE
                        WHEN r.origin_province = p_origin_province
                         AND r.dest_province = p_dest_province THEN 1
                        WHEN r.origin_province = 'ANY'
                         AND r.dest_province = p_dest_province THEN 2
                        WHEN r.origin_province = p_origin_province
                         AND r.dest_province = 'ANY' THEN 3
                        WHEN r.origin_province = 'ANY'
                         AND r.dest_province = 'ANY' THEN 4
                        ELSE 5
                    END,
                    r.id
            ) AS specificity_rank
        FROM public.corridor_task_rules AS r
        WHERE r.origin_province IN (p_origin_province, 'ANY')
          AND r.dest_province IN (p_dest_province, 'ANY')
    )
    SELECT
        r.id,
        r.task_id,
        r.origin_province::TEXT,
        r.dest_province::TEXT,
        r.days_deadline,
        r.is_mandatory,
        r.created_at,
        t.task_key::TEXT,
        t.title_en::TEXT,
        t.base_description_en,
        t.requires_vehicle,
        t.requires_dependents,
        COALESCE(s.official_sources, '[]'::JSONB)
    FROM ranked_rules AS r
    JOIN public.global_tasks AS t
      ON t.id = r.task_id
    LEFT JOIN LATERAL (
        SELECT jsonb_agg(
            jsonb_build_object(
                'id', os.id,
                'agency_name', os.agency_name,
                'official_url', os.official_url,
                'last_verified', os.last_verified
            )
            ORDER BY lower(os.agency_name), os.official_url, os.id
        ) AS official_sources
        FROM public.official_sources AS os
        WHERE os.corridor_rule_id = r.id
          AND os.official_url ~* '^https://[^[:space:]]+$'
    ) AS s ON TRUE
    WHERE r.specificity_rank = 1
    ORDER BY t.title_en, r.id
$$;

COMMENT ON FUNCTION public.resolve_corridor_rules(TEXT, TEXT) IS
    'Returns exactly one rule per task for a move corridor using deterministic exact/ANY precedence, with ordered HTTPS-only public source metadata.';

REVOKE ALL ON FUNCTION public.resolve_corridor_rules(TEXT, TEXT)
    FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.resolve_corridor_rules(TEXT, TEXT)
    TO anon, authenticated, service_role;

-- Explicit Data API grants. These make the resolver portable to projects
-- created after Supabase stopped auto-exposing new public objects in 2026.
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

GRANT SELECT (
    id,
    task_id,
    origin_province,
    dest_province,
    days_deadline,
    is_mandatory,
    created_at
)
    ON TABLE public.corridor_task_rules TO anon, authenticated, service_role;

GRANT SELECT (
    id,
    task_key,
    title_en,
    base_description_en,
    requires_vehicle,
    requires_dependents
)
    ON TABLE public.global_tasks TO anon, authenticated, service_role;

-- Re-state the public source allowlist and extend the shared server role's
-- read-only metadata access. Scraper hashes and page bodies remain private.
GRANT SELECT (
    id,
    corridor_rule_id,
    agency_name,
    official_url,
    last_verified
)
    ON TABLE public.official_sources TO anon, authenticated, service_role;


-- ============================================================================
-- Admin user list — count the exact same resolved task set the app receives.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.admin_list_users(
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
        (SELECT count(*) FROM public.user_profiles)
    FROM public.user_profiles AS p
    LEFT JOIN auth.users AS u
      ON u.id = p.id
    LEFT JOIN LATERAL (
        SELECT
            count(*) FILTER (WHERE utp.status = 'COMPLETED') AS completed,
            count(*) AS total
        FROM public.resolve_corridor_rules(
            p.origin_prov::TEXT,
            p.dest_prov::TEXT
        ) AS r
        LEFT JOIN public.user_task_progress AS utp
          ON utp.task_rule_id = r.id
         AND utp.user_id = p.id
        WHERE (NOT r.requires_vehicle OR p.has_vehicle)
          AND (NOT r.requires_dependents OR p.has_dependents)
    ) AS counts ON TRUE
    ORDER BY u.created_at DESC NULLS LAST, p.id
    LIMIT p_limit OFFSET p_offset;
END;
$$;

COMMENT ON FUNCTION public.admin_list_users(INT, INT) IS
    'Admin dashboard: one page of non-PII profiles with progress counts computed from canonical resolved corridor rules.';

REVOKE ALL ON FUNCTION public.admin_list_users(INT, INT)
    FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_users(INT, INT)
    TO authenticated;


-- ============================================================================
-- Admin user detail — canonical rules plus every safe official source.
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
            SELECT jsonb_agg(
                jsonb_build_object(
                    'task_rule_id',      r.id,
                    'task_key',          r.task_key,
                    'title',             r.title_en,
                    'days_deadline',     r.days_deadline,
                    'is_mandatory',      r.is_mandatory,
                    'status',            COALESCE(utp.status, 'AVAILABLE'),
                    'status_updated_at', utp.updated_at,
                    'official_sources',  r.official_sources
                )
                ORDER BY r.title_en, r.id
            )
            FROM public.resolve_corridor_rules(
                p.origin_prov::TEXT,
                p.dest_prov::TEXT
            ) AS r
            LEFT JOIN public.user_task_progress AS utp
              ON utp.task_rule_id = r.id
             AND utp.user_id = p.id
            WHERE (NOT r.requires_vehicle OR p.has_vehicle)
              AND (NOT r.requires_dependents OR p.has_dependents)
        ), '[]'::JSONB)
    )
    INTO v_result
    FROM public.user_profiles AS p
    LEFT JOIN auth.users AS u
      ON u.id = p.id
    WHERE p.id = p_user_id;

    IF v_result IS NULL THEN
        RAISE EXCEPTION 'admin_get_user_detail(): user % not found', p_user_id;
    END IF;

    RETURN v_result;
END;
$$;

COMMENT ON FUNCTION public.admin_get_user_detail(UUID) IS
    'Admin dashboard: one non-PII profile and its canonical resolved checklist, including ordered HTTPS-only official source metadata.';

REVOKE ALL ON FUNCTION public.admin_get_user_detail(UUID)
    FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_get_user_detail(UUID)
    TO authenticated;

-- ============================================================================
-- END OF MIGRATION 023_corridor_rule_resolver.sql
-- ============================================================================

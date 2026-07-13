-- ============================================================================
-- ReloGo — atomic official-source scrape persistence
--
-- Concurrent workers used to classify a scrape in Python, INSERT an alert,
-- then UPDATE the baseline as two independent requests. Two runs starting from
-- the same baseline could therefore overwrite a newer result, duplicate an
-- alert, or attach a diff computed from stale content.
--
-- This migration makes scrape persistence one row-locked compare-and-swap RPC:
--   * BASELINE  — first healthy scrape; persist silently.
--   * UNCHANGED — hash still matches; refresh the verified timestamp.
--   * CHANGED   — true non-null hash transition; atomically file one PENDING
--                 alert and advance the baseline.
--   * STALE     — another run advanced the row after this worker read it; make
--                 no changes and return the current hash.
--
-- The service role may read only the source columns required by the worker and
-- execute this function. It loses all direct official_sources write access and
-- all direct rule_change_alerts access. Live corridor rules remain exclusively
-- human-controlled through the admin review RPCs.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;


CREATE OR REPLACE FUNCTION public.persist_official_source_scrape(
    p_official_source_id UUID,
    p_expected_hash      TEXT,
    p_new_hash           TEXT,
    p_content_text       TEXT,
    p_diff_summary       TEXT DEFAULT NULL
)
RETURNS TABLE (
    classification TEXT,
    alert_id        UUID,
    current_hash    TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_current_hash TEXT;
    v_current_text TEXT;
    v_new_hash     TEXT;
    v_alert_id     UUID;
BEGIN
    IF p_expected_hash IS NOT NULL
       AND p_expected_hash !~ '^[0-9a-f]{64}$' THEN
        RAISE EXCEPTION
            'persist_official_source_scrape(): expected hash must be lowercase SHA-256'
            USING ERRCODE = '22023';
    END IF;

    IF p_new_hash IS NULL OR p_new_hash !~ '^[0-9a-f]{64}$' THEN
        RAISE EXCEPTION
            'persist_official_source_scrape(): new hash must be lowercase SHA-256'
            USING ERRCODE = '22023';
    END IF;

    IF p_content_text IS NULL OR char_length(p_content_text) = 0 THEN
        RAISE EXCEPTION
            'persist_official_source_scrape(): content must not be empty'
            USING ERRCODE = '22023';
    END IF;

    -- Defense in depth behind the worker's configurable HTML limit. This is a
    -- hard database ceiling, so a compromised service key cannot store an
    -- unbounded page body through the definer function.
    IF char_length(p_content_text) > 1000000 THEN
        RAISE EXCEPTION
            'persist_official_source_scrape(): content exceeds 1000000 characters'
            USING ERRCODE = '22023';
    END IF;

    IF p_diff_summary IS NOT NULL AND char_length(p_diff_summary) > 8192 THEN
        RAISE EXCEPTION
            'persist_official_source_scrape(): diff summary exceeds 8192 characters'
            USING ERRCODE = '22023';
    END IF;

    v_new_hash := encode(
        extensions.digest(convert_to(p_content_text, 'UTF8'), 'sha256'),
        'hex'
    );
    IF v_new_hash <> p_new_hash THEN
        RAISE EXCEPTION
            'persist_official_source_scrape(): new hash does not match content'
            USING ERRCODE = '22023';
    END IF;

    SELECT os.last_content_hash, os.last_content_text
    INTO v_current_hash, v_current_text
    FROM public.official_sources AS os
    WHERE os.id = p_official_source_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION
            'persist_official_source_scrape(): source % not found',
            p_official_source_id
            USING ERRCODE = 'P0002';
    END IF;

    -- Protect the CAS/diff invariant if an older direct-write path ever left a
    -- hash and body that do not correspond. Legacy hash-only rows (NULL text)
    -- remain valid and acquire a body on their next successful scrape.
    IF v_current_hash IS NOT NULL
       AND v_current_text IS NOT NULL
       AND v_current_hash <> encode(
            extensions.digest(convert_to(v_current_text, 'UTF8'), 'sha256'),
            'hex'
       ) THEN
        RAISE EXCEPTION
            'persist_official_source_scrape(): stored hash/content invariant is broken'
            USING ERRCODE = '22000';
    END IF;

    -- NULL-safe compare-and-swap. A stale caller must not refresh last_verified,
    -- regress the baseline, or file a diff against content it did not observe.
    IF v_current_hash IS DISTINCT FROM p_expected_hash THEN
        RETURN QUERY SELECT 'STALE'::TEXT, NULL::UUID, v_current_hash;
        RETURN;
    END IF;

    IF v_current_hash IS NULL THEN
        UPDATE public.official_sources
        SET last_verified = clock_timestamp(),
            last_content_hash = p_new_hash,
            last_content_text = p_content_text
        WHERE id = p_official_source_id;

        RETURN QUERY SELECT 'BASELINE'::TEXT, NULL::UUID, p_new_hash;
        RETURN;
    END IF;

    IF v_current_hash = p_new_hash THEN
        UPDATE public.official_sources
        SET last_verified = clock_timestamp(),
            last_content_hash = p_new_hash,
            last_content_text = p_content_text
        WHERE id = p_official_source_id;

        RETURN QUERY SELECT 'UNCHANGED'::TEXT, NULL::UUID, p_new_hash;
        RETURN;
    END IF;

    INSERT INTO public.rule_change_alerts (
        official_source_id,
        old_hash,
        new_hash,
        diff_summary,
        status
    ) VALUES (
        p_official_source_id,
        v_current_hash,
        p_new_hash,
        p_diff_summary,
        'PENDING'
    )
    RETURNING id INTO v_alert_id;

    UPDATE public.official_sources
    SET last_verified = clock_timestamp(),
        last_content_hash = p_new_hash,
        last_content_text = p_content_text
    WHERE id = p_official_source_id;

    RETURN QUERY SELECT 'CHANGED'::TEXT, v_alert_id, p_new_hash;
END;
$$;

COMMENT ON FUNCTION public.persist_official_source_scrape(UUID, TEXT, TEXT, TEXT, TEXT) IS
    'Service-role-only row-locked CAS for official-source baselines; atomically files a PENDING alert only on a true hash transition and never changes live rules.';

REVOKE ALL ON FUNCTION public.persist_official_source_scrape(UUID, TEXT, TEXT, TEXT, TEXT)
    FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.persist_official_source_scrape(UUID, TEXT, TEXT, TEXT, TEXT)
    TO service_role;


-- ============================================================================
-- Worker least privilege
-- ============================================================================
GRANT USAGE ON SCHEMA public TO service_role;

REVOKE ALL PRIVILEGES ON TABLE public.official_sources FROM service_role;
GRANT SELECT (
    id,
    agency_name,
    official_url,
    last_content_hash,
    last_content_text
)
    ON TABLE public.official_sources TO service_role;

REVOKE ALL PRIVILEGES ON TABLE public.rule_change_alerts FROM service_role;


-- ============================================================================
-- END OF MIGRATION 011_atomic_official_source_scrapes.sql
-- ============================================================================

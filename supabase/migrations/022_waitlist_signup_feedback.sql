-- ============================================================================
-- ReloGo — explicit, enumeration-safe waitlist signup feedback
--
-- Migration 007 made join_waitlist() silently drop signups past the per-IP
-- hourly cap, returning VOID so the caller could not tell an accepted signup
-- from a rate-limited one. That protects against email enumeration but leaves
-- a real user who hits the cap staring at a false "you're on the list".
--
-- This returns an explicit status:
--   'accepted'  — the signup was recorded (or was a duplicate; see below)
--   'throttled' — the caller's IP exceeded the hourly cap
--
-- Enumeration safety is preserved: a duplicate email still returns 'accepted'
-- (ON CONFLICT DO NOTHING), so the response never reveals whether an address
-- is already on the list. 'throttled' concerns the caller's own IP rate, not
-- any email, so surfacing it leaks nothing about other people's data.
-- ============================================================================

-- The return type changes (VOID -> TEXT), so the function is dropped and
-- recreated; the anon/authenticated grants are re-established below.
DROP FUNCTION public.join_waitlist(TEXT, TEXT, TEXT);

CREATE FUNCTION public.join_waitlist(
    p_email           TEXT,
    p_origin_province TEXT DEFAULT NULL,
    p_dest_province   TEXT DEFAULT NULL
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_ip    TEXT;
    v_count INTEGER;
BEGIN
    v_ip := nullif(current_setting('request.headers', true), '')::json
                ->> 'x-forwarded-for';

    IF v_ip IS NOT NULL THEN
        -- Opportunistic prune keeps the counter table tiny.
        DELETE FROM public.waitlist_signup_throttle
        WHERE window_start < NOW() - INTERVAL '24 hours';

        INSERT INTO public.waitlist_signup_throttle AS t (ip_hash, window_start)
        VALUES (encode(sha256(v_ip::bytea), 'hex'), date_trunc('hour', NOW()))
        ON CONFLICT (ip_hash, window_start)
        DO UPDATE SET signups = t.signups + 1
        RETURNING t.signups INTO v_count;

        IF v_count > 5 THEN
            -- IP rate limit — reveals nothing about any email address.
            RETURN 'throttled';
        END IF;
    END IF;

    INSERT INTO public.waitlist (email, origin_province, dest_province)
    VALUES (lower(trim(p_email)), p_origin_province, p_dest_province)
    ON CONFLICT DO NOTHING;

    -- 'accepted' for both a new and a duplicate email: enumeration-safe.
    RETURN 'accepted';
END;
$$;

COMMENT ON FUNCTION public.join_waitlist(TEXT, TEXT, TEXT) IS
    'Landing-page waitlist signup. Returns ''accepted'' (new or duplicate email — no enumeration) or ''throttled'' (caller IP exceeded the hourly cap). Duplicate emails are silently ignored so callers cannot probe membership.';

REVOKE ALL ON FUNCTION public.join_waitlist(TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.join_waitlist(TEXT, TEXT, TEXT) TO anon, authenticated;

-- ============================================================================
-- END OF MIGRATION 022_waitlist_signup_feedback.sql
-- ============================================================================

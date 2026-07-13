-- ============================================================================
-- ReloGo — Canadian Relocation Autopilot
-- Supabase Migration: 007_hardening_round_two.sql
--
-- Closes gaps confirmed by the July 2026 multi-agent audit:
--   1. support_threads.last_message_at was only bumped by the AI function and
--      admin replies — a user reply into a HUMAN/AWAITING_HUMAN thread never
--      touched it, so the admin inbox ordering and "Last activity" went stale
--      exactly when a human was handling the thread. → AFTER INSERT trigger.
--   2. No length caps on chat input: support_messages.body / support_threads
--      .subject were unbounded TEXT — a storage / Gemini-token amplifier.
--   3. RLS symmetry gaps: the admin INSERT policy on support_messages didn't
--      pin sender='admin' (an admin could forge 'user'/'ai' rows in the
--      support audit record), and users could INSERT a thread directly in
--      status 'HUMAN' (a state that asserts "an admin is handling this").
--   4. approve_rule_change() approved alerts regardless of current status —
--      a DISMISSED/stale alert could silently overwrite the live rule. Also
--      no row lock against two admins racing the same alert.
--   5. join_waitlist() had no abuse throttle: anyone with the public anon key
--      could script unlimited inserts. → per-IP hourly throttle (silent drop,
--      preserving 002's enumeration-safety: callers always see success).
--   6. Waitlist signups were write-only — nothing in the product could read
--      them. → admins may SELECT (read-only) for the dashboard Waitlist tab.
--
-- Conventions follow 001–006: SET search_path = '', REVOKE FROM PUBLIC/anon,
-- (SELECT auth.uid()) / (SELECT public.is_admin()) initplan wrappers,
-- "table: who can do what" policy names.
-- ============================================================================


-- ============================================================================
-- 1. last_message_at — bump on EVERY message insert
--    SECURITY DEFINER is required, not optional: the user UPDATE policy on
--    support_threads has WITH CHECK (status <> 'HUMAN'), so an invoker-rights
--    trigger would be rejected precisely in the case being fixed (a user
--    replying while an admin handles the thread).
-- ============================================================================
CREATE OR REPLACE FUNCTION public.touch_thread_on_message()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    UPDATE public.support_threads
    SET last_message_at = NEW.created_at
    WHERE id = NEW.thread_id;
    RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.touch_thread_on_message() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER trg_support_messages_touch_thread
    AFTER INSERT ON support_messages
    FOR EACH ROW EXECUTE FUNCTION public.touch_thread_on_message();


-- ============================================================================
-- 2. Input length caps (chat is for questions, not payloads)
-- ============================================================================
ALTER TABLE support_messages
    ADD CONSTRAINT support_messages_body_length_check
        CHECK (char_length(body) <= 4000);

ALTER TABLE support_threads
    ADD CONSTRAINT support_threads_subject_length_check
        CHECK (subject IS NULL OR char_length(subject) <= 200);


-- ============================================================================
-- 3. RLS symmetry — admins post only as 'admin'; no user-created 'HUMAN'
--    threads. status <> 'HUMAN' (rather than an allowlist) keeps the INSERT
--    policy symmetric with 004's user UPDATE policy, which already lets
--    users set RESOLVED.
-- ============================================================================
DROP POLICY "support_messages: admins can insert" ON support_messages;
CREATE POLICY "support_messages: admins can insert"
    ON support_messages FOR INSERT
    TO authenticated
    WITH CHECK ((SELECT public.is_admin()) AND sender = 'admin');

DROP POLICY "support_threads: users can insert own threads" ON support_threads;
CREATE POLICY "support_threads: users can insert own threads"
    ON support_threads FOR INSERT
    TO authenticated
    WITH CHECK ((SELECT auth.uid()) = user_id AND status <> 'HUMAN');


-- ============================================================================
-- 4. approve_rule_change() — only PENDING alerts, and lock the row so two
--    admins can't race the same alert.
-- ============================================================================
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
    v_status  TEXT;
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'approve_rule_change(): admin access required';
    END IF;

    SELECT os.corridor_rule_id, rca.status
    INTO v_rule_id, v_status
    FROM public.rule_change_alerts rca
    JOIN public.official_sources os ON os.id = rca.official_source_id
    WHERE rca.id = p_alert_id
    FOR UPDATE OF rca;

    IF v_rule_id IS NULL THEN
        RAISE EXCEPTION 'approve_rule_change(): alert % not found', p_alert_id;
    END IF;

    IF v_status <> 'PENDING' THEN
        RAISE EXCEPTION
            'approve_rule_change(): alert % is %, only PENDING alerts can be approved',
            p_alert_id, v_status;
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


-- ============================================================================
-- 5. join_waitlist() — per-IP hourly throttle
--    PostgREST exposes request headers as a GUC; hash the caller IP so raw
--    addresses are never stored. Beyond the cap the call silently succeeds
--    without inserting — indistinguishable from success, preserving 002's
--    enumeration-safety while starving scripted abuse. When no header exists
--    (local psql, pgTAP without the GUC) the throttle is skipped.
-- ============================================================================
CREATE TABLE waitlist_signup_throttle (
    ip_hash      TEXT        NOT NULL,
    window_start TIMESTAMPTZ NOT NULL,
    signups      INTEGER     NOT NULL DEFAULT 1,
    PRIMARY KEY (ip_hash, window_start)
);

COMMENT ON TABLE waitlist_signup_throttle IS
    'Per-IP-hash hourly counters for join_waitlist(). Written only by the SECURITY DEFINER function; no client policies.';

-- No policies on purpose: only the definer function (owner) touches it.
ALTER TABLE waitlist_signup_throttle ENABLE ROW LEVEL SECURITY;

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
            RETURN;  -- silent drop: enumeration-safe, abuse-starving
        END IF;
    END IF;

    INSERT INTO public.waitlist (email, origin_province, dest_province)
    VALUES (lower(trim(p_email)), p_origin_province, p_dest_province)
    ON CONFLICT DO NOTHING;
END;
$$;

COMMENT ON FUNCTION public.join_waitlist(TEXT, TEXT, TEXT) IS
    'Landing-page waitlist signup. Duplicate emails are silently ignored so callers cannot probe membership; per-IP hourly throttle silently drops scripted abuse.';


-- ============================================================================
-- 6. Waitlist — admins may read (dashboard Waitlist tab; read-only)
-- ============================================================================
CREATE POLICY "waitlist: admins can read"
    ON waitlist FOR SELECT
    TO authenticated
    USING ((SELECT public.is_admin()));


-- ============================================================================
-- END OF MIGRATION 007_hardening_round_two.sql
-- ============================================================================

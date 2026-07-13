-- ============================================================================
-- ReloGo — Canadian Relocation Autopilot
-- Supabase Migration: 008_atomic_support_ai.sql
--
-- Closes the remaining support-chat race and timestamp-trust gaps:
--   1. The Edge Function used to check AI ownership / human participation,
--      call Gemini, then perform an unconditional INSERT and UPDATE. An admin
--      takeover, a newer user turn, or a duplicate invocation could land while
--      Gemini was running and still receive a stale AI reply.
--   2. last_message_at trusted support_messages.created_at, even though clients
--      could supply that column and pin a thread in the inbox with a future
--      timestamp.
--   3. Platform table grants exposed server-owned ids/timestamps to client
--      INSERT/UPDATE statements even though RLS protected row ownership.
--
-- The finalize RPC locks the thread row and re-checks every safety condition
-- immediately before writing. The BEFORE INSERT trigger below locks that same
-- thread row before a message row exists, so concurrent inserts serialize
-- before the RPC (and are observed) or after its AI reply. It also replaces
-- PostgreSQL's transaction-start NOW() default after any lock wait, keeping
-- message ordering aligned with serialized lock acquisition.
-- ============================================================================


-- ============================================================================
-- 1. Trust server time for support inbox ordering
-- ============================================================================
CREATE OR REPLACE FUNCTION public.touch_thread_on_message()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    UPDATE public.support_threads
    SET last_message_at = clock_timestamp()
    WHERE id = NEW.thread_id
    RETURNING last_message_at INTO NEW.created_at;
    RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.touch_thread_on_message()
    FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER trg_support_messages_touch_thread ON public.support_messages;
CREATE TRIGGER trg_support_messages_touch_thread
    BEFORE INSERT ON public.support_messages
    FOR EACH ROW EXECUTE FUNCTION public.touch_thread_on_message();


-- ============================================================================
-- 2. Atomic AI reply finalization
--    Only the Supabase service role may call this function. Returning FALSE is
--    an expected stale-work outcome, not an error: the thread changed while the
--    model was generating, so the caller must not claim its reply was saved.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.persist_support_ai_reply(
    p_thread_id               UUID,
    p_expected_user_message_id UUID,
    p_reply_body              TEXT,
    p_escalate                BOOLEAN
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_status        TEXT;
    v_latest_id     UUID;
    v_latest_sender TEXT;
BEGIN
    -- This lock is the serialization point shared with the BEFORE INSERT
    -- message trigger.
    SELECT t.status
    INTO v_status
    FROM public.support_threads AS t
    WHERE t.id = p_thread_id
    FOR UPDATE;

    IF NOT FOUND OR v_status <> 'AI' THEN
        RETURN FALSE;
    END IF;

    -- Human participation permanently disqualifies a transcript from AI.
    IF EXISTS (
        SELECT 1
        FROM public.support_messages AS m
        WHERE m.thread_id = p_thread_id
          AND m.sender = 'admin'
    ) THEN
        RETURN FALSE;
    END IF;

    -- Match the exact user turn loaded before Gemini generation. The id
    -- tie-breaker makes equal timestamps deterministic in both SQL and JS.
    SELECT m.id, m.sender
    INTO v_latest_id, v_latest_sender
    FROM public.support_messages AS m
    WHERE m.thread_id = p_thread_id
    ORDER BY m.created_at DESC, m.id DESC
    LIMIT 1;

    IF v_latest_id IS DISTINCT FROM p_expected_user_message_id
       OR v_latest_sender IS DISTINCT FROM 'user' THEN
        RETURN FALSE;
    END IF;

    INSERT INTO public.support_messages (thread_id, sender, body)
    VALUES (p_thread_id, 'ai', p_reply_body);

    IF COALESCE(p_escalate, FALSE) THEN
        UPDATE public.support_threads
        SET status = 'AWAITING_HUMAN'
        WHERE id = p_thread_id;
    END IF;

    RETURN TRUE;
END;
$$;

COMMENT ON FUNCTION public.persist_support_ai_reply(UUID, UUID, TEXT, BOOLEAN) IS
    'Atomically stores an AI support reply only if the thread is still AI-owned, has no admin history, and the expected user message remains latest.';

REVOKE ALL ON FUNCTION public.persist_support_ai_reply(UUID, UUID, TEXT, BOOLEAN)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.persist_support_ai_reply(UUID, UUID, TEXT, BOOLEAN)
    TO service_role;


-- ============================================================================
-- 3. Client column privileges
--    RLS decides which rows clients may access; these grants additionally keep
--    server-owned identity and timestamp columns out of client write payloads.
--    service_role retains its platform-level table privileges.
-- ============================================================================
REVOKE INSERT ON TABLE public.support_messages FROM authenticated;
GRANT INSERT (thread_id, sender, body)
    ON TABLE public.support_messages TO authenticated;

REVOKE INSERT, UPDATE ON TABLE public.support_threads FROM authenticated;
GRANT INSERT (user_id, subject, status)
    ON TABLE public.support_threads TO authenticated;
GRANT UPDATE (subject, status)
    ON TABLE public.support_threads TO authenticated;


-- ============================================================================
-- END OF MIGRATION 008_atomic_support_ai.sql
-- ============================================================================

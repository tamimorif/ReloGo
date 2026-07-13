-- ============================================================================
-- ReloGo — persistent support human-takeover boundary
--
-- A thread could previously enter HUMAN, be resolved without an admin message,
-- and later be reopened to AI by its owner. Because the AI safety checks could
-- only see current status and admin-message history, that no-message takeover
-- left no durable evidence and the transcript could reach Gemini again.
--
-- human_takeover_at is a server-authored, write-once marker. Triggers stamp the
-- first HUMAN transition or admin reply and preserve the original timestamp
-- through every later status change. Client column grants remain status-only.
-- Existing HUMAN threads, threads with admin messages, and RESOLVED threads
-- are marked conservatively because a historical HUMAN -> RESOLVED transition
-- without a reply cannot be distinguished after the fact.
-- ============================================================================


-- ============================================================================
-- 1. Durable marker and conservative legacy backfill
-- ============================================================================
ALTER TABLE public.support_threads
    ADD COLUMN human_takeover_at TIMESTAMPTZ;

COMMENT ON COLUMN public.support_threads.human_takeover_at IS
    'Server-authored timestamp of first recorded human involvement (HUMAN '
    'status or admin reply). Once set it is immutable and permanently '
    'disqualifies the thread from AI.';

UPDATE public.support_threads AS t
SET human_takeover_at = COALESCE(
    (
        SELECT MIN(m.created_at)
        FROM public.support_messages AS m
        WHERE m.thread_id = t.id
          AND m.sender = 'admin'
    ),
    t.updated_at,
    t.created_at
)
WHERE t.status IN ('HUMAN', 'RESOLVED')
   OR EXISTS (
       SELECT 1
       FROM public.support_messages AS m
       WHERE m.thread_id = t.id
         AND m.sender = 'admin'
   );


-- ============================================================================
-- 2. Stamp the first HUMAN transition and make the marker write-once
-- ============================================================================
CREATE OR REPLACE FUNCTION public.preserve_support_human_takeover()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        -- Ignore any caller-supplied timestamp. Only an initial HUMAN status
        -- may create the marker, and it always uses trusted server time.
        IF NEW.status = 'HUMAN' THEN
            NEW.human_takeover_at := clock_timestamp();
        ELSE
            NEW.human_takeover_at := NULL;
        END IF;
    ELSIF OLD.human_takeover_at IS NOT NULL THEN
        -- The original takeover timestamp is immutable, even for a later
        -- privileged/status update that explicitly tries to clear or replace it.
        NEW.human_takeover_at := OLD.human_takeover_at;
    ELSIF NEW.status = 'HUMAN' THEN
        NEW.human_takeover_at := clock_timestamp();
    ELSIF NEW.human_takeover_at IS NOT NULL THEN
        -- Server code may stamp the marker while serializing an admin-message
        -- insert. Clients have no INSERT/UPDATE privilege on this column.
        NEW.human_takeover_at := NEW.human_takeover_at;
    ELSE
        NEW.human_takeover_at := NULL;
    END IF;

    RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.preserve_support_human_takeover()
    FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER trg_support_threads_preserve_human_takeover
    BEFORE INSERT OR UPDATE ON public.support_threads
    FOR EACH ROW EXECUTE FUNCTION public.preserve_support_human_takeover();


-- ============================================================================
-- 3. An admin reply itself records human participation atomically
--    This update takes the same thread-row lock used by AI finalization. The
--    marker is therefore durable even if the dashboard's later status update
--    fails or the thread intentionally remains RESOLVED.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.touch_thread_on_message()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_now TIMESTAMPTZ := clock_timestamp();
BEGIN
    UPDATE public.support_threads
    SET last_message_at = v_now,
        human_takeover_at = CASE
            WHEN NEW.sender = 'admin'
                THEN COALESCE(human_takeover_at, v_now)
            ELSE human_takeover_at
        END
    WHERE id = NEW.thread_id
    RETURNING last_message_at INTO NEW.created_at;
    RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.touch_thread_on_message()
    FROM PUBLIC, anon, authenticated, service_role;


-- ============================================================================
-- 4. Atomic AI finalization also requires no recorded takeover
-- ============================================================================
CREATE OR REPLACE FUNCTION public.persist_support_ai_reply(
    p_thread_id                UUID,
    p_expected_user_message_id UUID,
    p_reply_body               TEXT,
    p_escalate                 BOOLEAN
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_status            TEXT;
    v_human_takeover_at TIMESTAMPTZ;
    v_latest_id         UUID;
    v_latest_sender     TEXT;
BEGIN
    -- This lock is the serialization point shared with the BEFORE INSERT
    -- message trigger and the takeover-marker status transition.
    SELECT t.status, t.human_takeover_at
    INTO v_status, v_human_takeover_at
    FROM public.support_threads AS t
    WHERE t.id = p_thread_id
    FOR UPDATE;

    IF NOT FOUND
       OR v_status <> 'AI'
       OR v_human_takeover_at IS NOT NULL THEN
        RETURN FALSE;
    END IF;

    -- Keep admin-message history as defense in depth for legacy/service rows.
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
    'Atomically stores an AI support reply only if the thread is still '
    'AI-owned, has no durable human-takeover marker or admin history, and '
    'the expected user message remains latest.';

REVOKE ALL ON FUNCTION public.persist_support_ai_reply(UUID, UUID, TEXT, BOOLEAN)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.persist_support_ai_reply(UUID, UUID, TEXT, BOOLEAN)
    TO service_role;


-- ============================================================================
-- 5. Edge read access; authenticated write columns stay unchanged
-- ============================================================================
GRANT SELECT (human_takeover_at)
    ON TABLE public.support_threads TO service_role;

REVOKE INSERT, UPDATE ON TABLE public.support_threads FROM authenticated;
GRANT INSERT (user_id, status)
    ON TABLE public.support_threads TO authenticated;
GRANT UPDATE (status)
    ON TABLE public.support_threads TO authenticated;

-- ============================================================================
-- END OF MIGRATION 014_persistent_support_human_takeover.sql
-- ============================================================================

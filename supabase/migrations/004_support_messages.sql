-- ============================================================================
-- ReloGo — Canadian Relocation Autopilot
-- Supabase Migration: 004_support_messages.sql
--
-- AI customer-support chat with HUMAN TAKEOVER. Two-table chat-thread model:
--   1. support_threads  — one conversation per row. status drives who answers:
--        'AI'             AI is answering (the Edge Function only replies here)
--        'AWAITING_HUMAN' escalated; AI has stopped; waiting for an admin
--        'HUMAN'          an admin is handling the conversation
--        'RESOLVED'       closed
--   2. support_messages — one chat message per row, sender ∈ {user, ai, admin}.
--   3. RLS: users INSERT/READ their own threads and the user-authored messages
--      in them; admins READ all and UPDATE threads/insert admin replies from
--      the dashboard. 'ai' messages are written by the support-ai Edge Function
--      using the service_role key (which bypasses RLS), so users can never
--      spoof an 'ai' or 'admin' message.
--   4. updated_at trigger on support_threads reusing public.set_updated_at()
--      from migration 002.
--   5. Indexes for message ordering, recency sorting, and open-thread triage.
--   6. Supabase Realtime enabled on both tables so chat updates stream live.
--
-- PIPEDA note: these tables store NO PII. Names, DOBs, street addresses,
-- driver's licence numbers, and health card numbers live only on the user's
-- device and are never uploaded. The AI is explicitly instructed never to
-- request or accept identity documents, and escalated/human conversations are
-- never sent to Gemini. Message bodies are free-text general how-to questions;
-- no identity columns exist here to leak.
--
-- Conventions follow 001/002/003: NOW(), gen_random_uuid(), TIMESTAMPTZ,
-- ENABLE ROW LEVEL SECURITY, "table: who can do what" policy names,
-- (SELECT auth.uid()) / (SELECT public.is_admin()) initplan wrappers,
-- idx_* index naming.
-- ============================================================================


-- ============================================================================
-- 1. SUPPORT_THREADS
--    One row per support conversation. user_id is a direct FK to auth.users(id)
--    so ownership is anchored to Supabase Auth. status is the human-takeover
--    state machine: AI → AWAITING_HUMAN → HUMAN → RESOLVED (the user may also
--    close their own thread). last_message_at lets clients sort by recency.
-- ============================================================================
CREATE TABLE support_threads (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    subject         TEXT,                                  -- optional, user-supplied
    status          VARCHAR(20) NOT NULL DEFAULT 'AI'
                    CHECK (status IN ('AI', 'AWAITING_HUMAN', 'HUMAN', 'RESOLVED')),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_message_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE  support_threads IS 'One support conversation per row, with the human-takeover status machine. No PII.';
COMMENT ON COLUMN support_threads.status          IS 'Human-takeover state: AI (bot answering) → AWAITING_HUMAN (escalated) → HUMAN (admin handling) → RESOLVED (closed).';
COMMENT ON COLUMN support_threads.last_message_at IS 'Timestamp of the most recent message; used to sort threads by recency.';


-- ============================================================================
-- 2. SUPPORT_MESSAGES
--    One chat message per row. sender records the author role; 'ai' rows are
--    inserted by the support-ai Edge Function via the service_role key.
-- ============================================================================
CREATE TABLE support_messages (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    thread_id   UUID        NOT NULL REFERENCES support_threads(id) ON DELETE CASCADE,
    sender      VARCHAR(10) NOT NULL CHECK (sender IN ('user', 'ai', 'admin')),
    body        TEXT        NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE  support_messages IS 'Chat messages within a support thread. No PII; AI/admin replies and user questions only.';
COMMENT ON COLUMN support_messages.sender IS 'Author role: user, ai (Edge Function, service_role), or admin (dashboard).';


-- ============================================================================
-- 3. INDEXES
--    - (thread_id, created_at) — load a thread's messages in chronological order.
--    - (last_message_at DESC)  — sort threads by recency in the admin inbox.
--    - partial (status) WHERE status <> 'RESOLVED' — surface open threads fast.
-- ============================================================================
CREATE INDEX idx_support_messages_thread_created
    ON support_messages (thread_id, created_at);

CREATE INDEX idx_support_threads_last_message_at
    ON support_threads (last_message_at DESC);

CREATE INDEX idx_support_threads_status
    ON support_threads (status)
    WHERE status <> 'RESOLVED';


-- ============================================================================
-- 4. updated_at TRIGGER (reuses public.set_updated_at() from migration 002)
-- ============================================================================
CREATE TRIGGER trg_support_threads_updated_at
    BEFORE UPDATE ON support_threads
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


-- ============================================================================
-- 5. ROW-LEVEL SECURITY
--    Users own their threads and may escalate or close them; they may post
--    only 'user' messages into their own threads. Admins read everything,
--    update any thread, and post admin replies. 'ai' messages arrive via the
--    service_role key, which bypasses RLS — the user INSERT policy below forbids
--    users from spoofing 'ai' or 'admin' rows. (SELECT ...) wrappers evaluate
--    auth.uid() / is_admin() once per statement, not per row — same initplan
--    convention 002/003 established.
-- ============================================================================
ALTER TABLE support_threads  ENABLE ROW LEVEL SECURITY;
ALTER TABLE support_messages ENABLE ROW LEVEL SECURITY;


-- --------------------------------------------------------------------------
-- support_threads
-- --------------------------------------------------------------------------
CREATE POLICY "support_threads: users can insert own threads"
    ON support_threads FOR INSERT
    TO authenticated
    WITH CHECK ((SELECT auth.uid()) = user_id);

CREATE POLICY "support_threads: users can read own threads"
    ON support_threads FOR SELECT
    TO authenticated
    USING ((SELECT auth.uid()) = user_id);

-- Lets the user escalate their own thread to AWAITING_HUMAN, reopen a RESOLVED
-- thread to 'AI', or close it. They may NOT set 'HUMAN' — that is an admin-only
-- state asserting a human is handling the conversation.
CREATE POLICY "support_threads: users can update own threads"
    ON support_threads FOR UPDATE
    TO authenticated
    USING  ((SELECT auth.uid()) = user_id)
    WITH CHECK ((SELECT auth.uid()) = user_id AND status <> 'HUMAN');

CREATE POLICY "support_threads: admins can read all"
    ON support_threads FOR SELECT
    TO authenticated
    USING ((SELECT public.is_admin()));

CREATE POLICY "support_threads: admins can update"
    ON support_threads FOR UPDATE
    TO authenticated
    USING  ((SELECT public.is_admin()))
    WITH CHECK ((SELECT public.is_admin()));


-- --------------------------------------------------------------------------
-- support_messages
-- --------------------------------------------------------------------------
-- Users may post ONLY 'user' messages, and ONLY into their own thread. This is
-- what stops a user from impersonating the AI or an admin.
CREATE POLICY "support_messages: users can insert own messages"
    ON support_messages FOR INSERT
    TO authenticated
    WITH CHECK (
        sender = 'user'
        AND EXISTS (
            SELECT 1 FROM public.support_threads t
            WHERE t.id = thread_id
              AND t.user_id = (SELECT auth.uid())
        )
    );

CREATE POLICY "support_messages: users can read own thread messages"
    ON support_messages FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.support_threads t
            WHERE t.id = thread_id
              AND t.user_id = (SELECT auth.uid())
        )
    );

CREATE POLICY "support_messages: admins can insert"
    ON support_messages FOR INSERT
    TO authenticated
    WITH CHECK ((SELECT public.is_admin()));

CREATE POLICY "support_messages: admins can read all"
    ON support_messages FOR SELECT
    TO authenticated
    USING ((SELECT public.is_admin()));


-- ============================================================================
-- 6. REALTIME
--    Clients subscribe so AI/admin replies and status changes stream live.
--    (RLS still governs which rows each subscriber actually receives.)
-- ============================================================================
ALTER PUBLICATION supabase_realtime ADD TABLE public.support_threads;
ALTER PUBLICATION supabase_realtime ADD TABLE public.support_messages;


-- ============================================================================
-- END OF MIGRATION 004_support_messages.sql
-- ============================================================================

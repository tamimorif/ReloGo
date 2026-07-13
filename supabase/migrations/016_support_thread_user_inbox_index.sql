-- ============================================================================
-- ReloGo — support inbox user lookup index
--
-- Mobile restores the user's newest support thread by filtering on user_id and
-- ordering by last_message_at descending. The user_id foreign key was also the
-- only hosted advisor finding without a covering index.
-- ============================================================================

CREATE INDEX idx_support_threads_user_last_message
    ON public.support_threads (user_id, last_message_at DESC);

-- ============================================================================
-- END OF MIGRATION 016_support_thread_user_inbox_index.sql
-- ============================================================================

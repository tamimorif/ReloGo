-- ============================================================================
-- ReloGo — support-thread metadata privacy boundary
--
-- Migration 010 removed free-text message composition, but the older client
-- column grant still allowed an authenticated caller to write an arbitrary
-- support_threads.subject through the public API. The mobile app never used
-- that field, yet a direct client could persist names, addresses, or document
-- numbers there. Leave the optional subject server-controlled (it is NULL by
-- default) and expose only the status transitions required by the fixed-question
-- UI and human handoff.
-- ============================================================================

REVOKE INSERT, UPDATE ON TABLE public.support_threads FROM authenticated;

GRANT INSERT (user_id, status)
    ON TABLE public.support_threads TO authenticated;
GRANT UPDATE (status)
    ON TABLE public.support_threads TO authenticated;

COMMENT ON COLUMN public.support_threads.subject IS
    'Optional server-controlled support label. Authenticated clients cannot author or update free-text thread metadata.';

COMMENT ON TABLE public.support_messages IS
    'Support transcript. Authenticated users may insert only migration-010 fixed questions; AI/admin prose is server-authored.';

-- ============================================================================
-- END OF MIGRATION 012_support_thread_metadata_privacy.sql
-- ============================================================================

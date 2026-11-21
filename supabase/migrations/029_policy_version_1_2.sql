-- ==========================================================================
-- ReloGo — policy version 1.2
--
-- The 1.2 mobile flow stores route details and checklist progress locally and
-- uses the backend only for public corridor rules and human support chats.
-- Keep the legacy profile consent contract aligned for existing clients.
-- Applying this migration to a hosted project is a separate release action.
-- ==========================================================================
-- CURRENT_CONSENT_VERSION: 1.2

CREATE OR REPLACE FUNCTION public.current_policy_version()
RETURNS TEXT
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
    SELECT '1.2'::TEXT
$$;

REVOKE ALL ON FUNCTION public.current_policy_version()
    FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.current_policy_version()
    TO authenticated, service_role;

-- ============================================================================
-- ReloGo — Migration 028: Require explicit server-managed admin membership
-- ============================================================================
-- A signup email is not authorization. Checking email_confirmed_at would still
-- trust an unverified address when Auth auto-confirmation is enabled. Retire
-- email-based bootstrap entirely; trusted operators provision reviewed user IDs
-- in admin_users through the existing server-only boundary from migration 002.
--
-- Preserve existing memberships: this migration cannot distinguish a reviewed
-- grant from a historic bootstrap grant. Operators must review existing access
-- separately; changing Auth or credentials is outside this schema migration.

DROP TRIGGER IF EXISTS trg_admin_bootstrap ON auth.users;
DROP FUNCTION IF EXISTS public.handle_admin_bootstrap();

COMMENT ON TABLE public.admin_users IS
    'Explicit server-managed admin membership by reviewed auth user ID. Signup email, email confirmation, and user metadata never grant admin access.';

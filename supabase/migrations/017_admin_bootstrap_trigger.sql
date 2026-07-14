-- ============================================================================
-- ReloGo — Migration 017: Admin Bootstrap Trigger
-- Sets up a secure bootstrap trigger that automatically registers users with
-- admin emails (admin@relogo.app / admin@relogo.ca) in the admin_users table.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.handle_admin_bootstrap()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    IF NEW.email = 'admin@relogo.app' OR NEW.email = 'admin@relogo.ca' THEN
        INSERT INTO public.admin_users (user_id)
        VALUES (NEW.id)
        ON CONFLICT (user_id) DO NOTHING;
    END IF;
    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.handle_admin_bootstrap() IS
    'Automatically registers bootstrap admin accounts into the public.admin_users table.';

-- Revoke all execute privileges on the function to prevent direct calls.
REVOKE ALL ON FUNCTION public.handle_admin_bootstrap() FROM PUBLIC, anon, authenticated;

-- Trigger: trg_admin_bootstrap AFTER INSERT on auth.users for each row
CREATE TRIGGER trg_admin_bootstrap
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_admin_bootstrap();

-- ============================================================================
-- ReloGo — Canadian Relocation Autopilot
-- Supabase Migration: 009_atomic_rule_review_permissions.sql
--
-- Make the human rule-review workflow RPC-only for authenticated clients:
--   1. Admins may no longer UPDATE live corridor rules directly.
--   2. Admins may no longer set arbitrary alert fields or statuses directly.
--   3. Approval remains atomic through approve_rule_change().
--   4. Dismissal is a narrow, row-locked PENDING -> DISMISSED transition.
--
-- service_role keeps its platform privileges for operational tooling. The
-- worker is still prohibited by application design from changing live rules.
-- ============================================================================


-- ============================================================================
-- 1. Remove authenticated direct-write paths
-- ============================================================================
DROP POLICY IF EXISTS "corridor_task_rules: admins can update"
    ON public.corridor_task_rules;
DROP POLICY IF EXISTS "rule_change_alerts: admins can update"
    ON public.rule_change_alerts;

-- Supabase grants broad table privileges to API roles during provisioning.
-- RLS alone is not sufficient here because the removed admin policies used to
-- authorize arbitrary updates. Revoke the table capability as a second layer.
REVOKE UPDATE ON TABLE public.corridor_task_rules FROM anon, authenticated;
REVOKE UPDATE ON TABLE public.rule_change_alerts FROM anon, authenticated;


-- ============================================================================
-- 2. Narrow dismissal RPC
-- ============================================================================
CREATE OR REPLACE FUNCTION public.dismiss_rule_change(p_alert_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_status TEXT;
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'dismiss_rule_change(): admin access required';
    END IF;

    SELECT rca.status
    INTO v_status
    FROM public.rule_change_alerts AS rca
    WHERE rca.id = p_alert_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'dismiss_rule_change(): alert % not found', p_alert_id;
    END IF;

    IF v_status <> 'PENDING' THEN
        RAISE EXCEPTION
            'dismiss_rule_change(): alert % is %, only PENDING alerts can be dismissed',
            p_alert_id, v_status;
    END IF;

    UPDATE public.rule_change_alerts
    SET status = 'DISMISSED'
    WHERE id = p_alert_id
      AND status = 'PENDING';
END;
$$;

COMMENT ON FUNCTION public.dismiss_rule_change(UUID) IS
    'Admin-only, row-locked transition of a rule-change alert from PENDING to DISMISSED.';

REVOKE ALL ON FUNCTION public.dismiss_rule_change(UUID)
    FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.dismiss_rule_change(UUID)
    TO authenticated;


-- ============================================================================
-- 3. Keep approval access explicit
-- ============================================================================
REVOKE ALL ON FUNCTION public.approve_rule_change(UUID, INTEGER, BOOLEAN)
    FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.approve_rule_change(UUID, INTEGER, BOOLEAN)
    TO authenticated;


-- ============================================================================
-- END OF MIGRATION 009_atomic_rule_review_permissions.sql
-- ============================================================================

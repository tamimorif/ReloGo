-- ============================================================================
-- ReloGo — reject obsolete rule-change approvals
--
-- A PENDING alert can outlive the source revision that created it. If the
-- worker advances the same source again before an admin acts, approving the
-- older alert must not apply rule edits based on an obsolete revision.
--
-- Lock order is deliberate: official source first (matching the worker's
-- persistence RPC), then alert. The initial unlocked alert lookup identifies
-- the source; both rows are re-read/validated while locked before any live rule
-- or alert state changes.
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
    v_source_id        UUID;
    v_locked_source_id UUID;
    v_rule_id          UUID;
    v_status           TEXT;
    v_alert_new_hash   TEXT;
    v_source_hash      TEXT;
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'approve_rule_change(): admin access required';
    END IF;

    -- Locate the source without taking the alert lock yet. The worker's
    -- persistence path locks official_sources first, so approval uses the same
    -- order and avoids a source/alert lock inversion.
    SELECT rca.official_source_id
    INTO v_source_id
    FROM public.rule_change_alerts AS rca
    WHERE rca.id = p_alert_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'approve_rule_change(): alert % not found', p_alert_id;
    END IF;

    SELECT os.corridor_rule_id, os.last_content_hash
    INTO v_rule_id, v_source_hash
    FROM public.official_sources AS os
    WHERE os.id = v_source_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION
            'approve_rule_change(): source for alert % not found', p_alert_id;
    END IF;

    -- Re-read the alert under lock. This catches a concurrent dismissal,
    -- approval, deletion, or unexpected source reassignment after the initial
    -- lookup and before the source lock was acquired.
    SELECT rca.official_source_id, rca.status, rca.new_hash
    INTO v_locked_source_id, v_status, v_alert_new_hash
    FROM public.rule_change_alerts AS rca
    WHERE rca.id = p_alert_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'approve_rule_change(): alert % not found', p_alert_id;
    END IF;

    IF v_locked_source_id <> v_source_id THEN
        RAISE EXCEPTION
            'approve_rule_change(): alert % source changed during approval',
            p_alert_id
            USING ERRCODE = '55000';
    END IF;

    IF v_status <> 'PENDING' THEN
        RAISE EXCEPTION
            'approve_rule_change(): alert % is %, only PENDING alerts can be approved',
            p_alert_id, v_status;
    END IF;

    IF v_alert_new_hash IS DISTINCT FROM v_source_hash THEN
        RAISE EXCEPTION
            'approve_rule_change(): alert % is obsolete; its revision is no longer current',
            p_alert_id
            USING ERRCODE = '55000';
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

COMMENT ON FUNCTION public.approve_rule_change(UUID, INTEGER, BOOLEAN) IS
    'Admin-only atomic rule approval; source-first row locks reject PENDING alerts whose revision is no longer the current official-source baseline.';

REVOKE ALL ON FUNCTION public.approve_rule_change(UUID, INTEGER, BOOLEAN)
    FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.approve_rule_change(UUID, INTEGER, BOOLEAN)
    TO authenticated;


-- ============================================================================
-- END OF MIGRATION 013_reject_obsolete_rule_approvals.sql
-- ============================================================================

-- ============================================================================
-- ReloGo — consent-state startup profile payload
--
-- Root startup already calls get_policy_consent_state(). Returning the full
-- server-side (non-PII) profile row in that same round trip avoids a second
-- mobile request. The payload is present only while consent is current; stale
-- users receive JSON null and must re-consent before normal app data is read.
-- The explicit field allowlist prevents future schema additions from silently
-- expanding this boundary.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_policy_consent_state()
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_user_id            UUID := auth.uid();
    v_accepted_version   TEXT;
    v_current_version    TEXT := public.current_policy_version();
    v_has_profile        BOOLEAN := FALSE;
    v_has_current        BOOLEAN := FALSE;
    v_profile            JSONB;
BEGIN
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'get_policy_consent_state(): not authenticated';
    END IF;

    SELECT
        p.consent_version,
        jsonb_build_object(
            'id', p.id,
            'origin_prov', p.origin_prov,
            'dest_prov', p.dest_prov,
            'move_date', p.move_date,
            'has_vehicle', p.has_vehicle,
            'has_dependents', p.has_dependents,
            'consent_version', p.consent_version,
            'consent_timestamp', p.consent_timestamp,
            'created_at', p.created_at,
            'updated_at', p.updated_at
        )
    INTO v_accepted_version, v_profile
    FROM public.user_profiles AS p
    WHERE p.id = v_user_id;

    v_has_profile := FOUND;
    v_has_current := v_has_profile
        AND v_accepted_version IS NOT DISTINCT FROM v_current_version;

    RETURN jsonb_build_object(
        'has_profile', v_has_profile,
        'accepted_version', v_accepted_version,
        'current_version', v_current_version,
        'has_current_consent', v_has_current,
        'profile', CASE WHEN v_has_current THEN v_profile ELSE NULL::JSONB END
    );
END;
$$;

COMMENT ON FUNCTION public.get_policy_consent_state() IS
    'Authenticated startup state. Includes the calling user''s explicitly allowlisted non-PII profile only while their policy consent is current.';

REVOKE ALL ON FUNCTION public.get_policy_consent_state()
    FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.get_policy_consent_state()
    TO authenticated;

-- ============================================================================
-- END OF MIGRATION 024_consent_state_profile_payload.sql
-- ============================================================================

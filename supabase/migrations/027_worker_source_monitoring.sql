-- ============================================================================
-- ReloGo — resilient official-source monitoring targets
--
-- User-facing official URLs remain unchanged. The worker may instead fetch a
-- reviewed first-party monitor URL when the public page blocks automation.
-- Sources with no equivalent accessible first-party target are explicitly
-- assigned to an owned manual-review cadence instead of weakening CAPTCHA or
-- content-sanity protections.
-- ============================================================================

ALTER TABLE public.official_sources
    ADD COLUMN monitor_url TEXT,
    ADD COLUMN monitoring_mode VARCHAR(20) NOT NULL DEFAULT 'AUTOMATED',
    ADD COLUMN manual_review_owner TEXT,
    ADD COLUMN manual_review_interval_days SMALLINT,
    ADD CONSTRAINT official_sources_monitor_url_https
        CHECK (
            monitor_url IS NULL
            OR monitor_url ~ '^https://[^[:space:]]+$'
        ),
    ADD CONSTRAINT official_sources_monitoring_mode
        CHECK (monitoring_mode IN ('AUTOMATED', 'MANUAL')),
    ADD CONSTRAINT official_sources_manual_monitoring_metadata
        CHECK (
            (
                monitoring_mode = 'AUTOMATED'
                AND manual_review_owner IS NULL
                AND manual_review_interval_days IS NULL
            )
            OR
            (
                monitoring_mode = 'MANUAL'
                AND monitor_url IS NULL
                AND NULLIF(BTRIM(manual_review_owner), '') IS NOT NULL
                AND manual_review_interval_days IS NOT NULL
                AND manual_review_interval_days BETWEEN 1 AND 365
            )
        );

COMMENT ON COLUMN public.official_sources.monitor_url IS
    'Private first-party URL fetched by the worker when official_url blocks safe automation; NULL falls back to official_url.';
COMMENT ON COLUMN public.official_sources.monitoring_mode IS
    'AUTOMATED for a configured change-detection target or MANUAL for an explicitly owned review cadence.';
COMMENT ON COLUMN public.official_sources.manual_review_owner IS
    'Operational owner required for MANUAL monitoring; private worker metadata.';
COMMENT ON COLUMN public.official_sources.manual_review_interval_days IS
    'Assigned review interval for MANUAL monitoring; does not record or prove completed reviews.';

-- The new monitoring metadata is worker-only. Public resolver output continues
-- to expose official_url and approved source metadata, never internal targets.
REVOKE SELECT (
    monitor_url,
    monitoring_mode,
    manual_review_owner,
    manual_review_interval_days
)
    ON TABLE public.official_sources FROM anon, authenticated;

GRANT SELECT (
    monitor_url,
    monitoring_mode,
    manual_review_owner,
    manual_review_interval_days
)
    ON TABLE public.official_sources TO service_role;

DO $$
DECLARE
    v_updated INTEGER;
BEGIN
    WITH target_sources (
        task_key,
        destination,
        official_url,
        monitor_url,
        monitoring_mode,
        manual_review_owner,
        manual_review_interval_days
    ) AS (
        VALUES
            (
                'EXCHANGE_DRIVERS_LICENCE', 'NU',
                'https://www.gov.nu.ca/en/service-nunavut/apply-drivers-licence',
                'https://www.gov.nu.ca/sites/default/files/documents/2022-12/driversmanual_eng.pdf',
                'AUTOMATED'::VARCHAR(20), NULL::TEXT, NULL::SMALLINT
            ),
            (
                'EXCHANGE_DRIVERS_LICENCE', 'PE',
                'https://www.princeedwardisland.ca/en/information/transportation-and-infrastructure/driving-with-an-out-of-province-license',
                'https://www.princeedwardisland.ca/sites/default/files/publications/drivers_handbook.pdf',
                'AUTOMATED', NULL, NULL
            ),
            (
                'EXCHANGE_DRIVERS_LICENCE', 'YT',
                'https://yukon.ca/en/driving-and-transportation/driver-licensing/transfer-your-drivers-licence-jurisdiction-outside-yukon',
                NULL,
                'MANUAL', 'ReloGo operations', 30
            ),
            (
                'UPDATE_HEALTH_CARD', 'NU',
                'https://www.gov.nu.ca/en/health/applying-health-care',
                'https://www.gov.nu.ca/sites/default/files/forms/2022-02/new_to_nunavut_health_care_coverage%20_appli_eng.pdf',
                'AUTOMATED', NULL, NULL
            ),
            (
                'UPDATE_HEALTH_CARD', 'PE',
                'https://www.princeedwardisland.ca/en/service/apply-for-pei-health-card-new-residents',
                'https://www.princeedwardisland.ca/sites/default/files/forms/pei_health_card_application_form.pdf',
                'AUTOMATED', NULL, NULL
            ),
            (
                'UPDATE_HEALTH_CARD', 'QC',
                'https://www.ramq.gouv.qc.ca/en/citizens/health-insurance/registration-information',
                'https://www.quebec.ca/en/immigration/settle-and-integrate-in-quebec',
                'AUTOMATED', NULL, NULL
            ),
            (
                'REGISTER_VEHICLE', 'NU',
                'https://www.gov.nu.ca/en/service-nunavut/private-vehicle-registration-nunavut',
                'https://www.gov.nu.ca/sites/default/files/documents/2022-12/driversmanual_eng.pdf',
                'AUTOMATED', NULL, NULL
            ),
            (
                'REGISTER_CHILDREN_SCHOOL', 'NU',
                'https://www.gov.nu.ca/en/education-and-schools/k-12-school-calendars-map-and-registration',
                'https://www.gov.nu.ca/sites/default/files/publications/2024-12/Student_Registration_Guidelines_for_Kindergarten_to_Grade_12_2023.pdf',
                'AUTOMATED', NULL, NULL
            ),
            (
                'REGISTER_CHILDREN_SCHOOL', 'PE',
                'https://www.princeedwardisland.ca/en/information/education-and-lifelong-learning/register-your-child-for-school',
                'https://psb.edu.pe.ca/schools/registering-your-child-for-school',
                'AUTOMATED', NULL, NULL
            ),
            (
                'REGISTER_CHILDREN_SCHOOL', 'YT',
                'https://yukon.ca/en/education-and-schools/plan-elementary-and-high-school/register-your-child-school',
                'https://open.yukon.ca/information/d29fd0f4-dd63-4444-94ca-7a1476b76583/resource/49e90760-acb7-40c9-b4a0-4741296a72e0/download/edu-policy-enrolment-students-yukon-schools-2026.pdf',
                'AUTOMATED', NULL, NULL
            ),
            (
                'REGISTER_VEHICLE', 'YT',
                'https://yukon.ca/en/driving-and-transportation/driver-licensing/transfer-your-drivers-licence-jurisdiction-outside-yukon',
                NULL,
                'MANUAL', 'ReloGo operations', 30
            )
    )
    UPDATE public.official_sources AS source
    SET monitor_url = target.monitor_url,
        monitoring_mode = target.monitoring_mode,
        manual_review_owner = target.manual_review_owner,
        manual_review_interval_days = target.manual_review_interval_days,
        -- A new document must establish a fresh baseline. Comparing it with the
        -- blocked page's old content would create a false change alert.
        last_verified = NULL,
        last_content_hash = NULL,
        last_content_text = NULL
    FROM target_sources AS target
    JOIN public.global_tasks AS task
      ON task.task_key = target.task_key
    JOIN public.corridor_task_rules AS rule
      ON rule.task_id = task.id
     AND rule.origin_province = 'ANY'
     AND rule.dest_province = target.destination
    WHERE source.corridor_rule_id = rule.id
      AND source.official_url = target.official_url;

    GET DIAGNOSTICS v_updated = ROW_COUNT;
    IF v_updated <> 11 THEN
        RAISE EXCEPTION
            '027_worker_source_monitoring: expected 11 source rows, updated %',
            v_updated;
    END IF;
END;
$$;


-- Defense in depth: even an old or misconfigured worker must not write a
-- baseline or alert for a source that operations explicitly owns manually.
CREATE OR REPLACE FUNCTION public.persist_official_source_scrape(
    p_official_source_id UUID,
    p_expected_hash      TEXT,
    p_new_hash           TEXT,
    p_content_text       TEXT,
    p_diff_summary       TEXT DEFAULT NULL
)
RETURNS TABLE (
    classification TEXT,
    alert_id        UUID,
    current_hash    TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_monitoring_mode VARCHAR(20);
    v_current_hash    TEXT;
    v_current_text    TEXT;
    v_new_hash        TEXT;
    v_alert_id        UUID;
BEGIN
    IF p_expected_hash IS NOT NULL
       AND p_expected_hash !~ '^[0-9a-f]{64}$' THEN
        RAISE EXCEPTION
            'persist_official_source_scrape(): expected hash must be lowercase SHA-256'
            USING ERRCODE = '22023';
    END IF;

    IF p_new_hash IS NULL OR p_new_hash !~ '^[0-9a-f]{64}$' THEN
        RAISE EXCEPTION
            'persist_official_source_scrape(): new hash must be lowercase SHA-256'
            USING ERRCODE = '22023';
    END IF;

    IF p_content_text IS NULL OR char_length(p_content_text) = 0 THEN
        RAISE EXCEPTION
            'persist_official_source_scrape(): content must not be empty'
            USING ERRCODE = '22023';
    END IF;

    IF char_length(p_content_text) > 1000000 THEN
        RAISE EXCEPTION
            'persist_official_source_scrape(): content exceeds 1000000 characters'
            USING ERRCODE = '22023';
    END IF;

    IF p_diff_summary IS NOT NULL AND char_length(p_diff_summary) > 8192 THEN
        RAISE EXCEPTION
            'persist_official_source_scrape(): diff summary exceeds 8192 characters'
            USING ERRCODE = '22023';
    END IF;

    v_new_hash := encode(
        extensions.digest(convert_to(p_content_text, 'UTF8'), 'sha256'),
        'hex'
    );
    IF v_new_hash <> p_new_hash THEN
        RAISE EXCEPTION
            'persist_official_source_scrape(): new hash does not match content'
            USING ERRCODE = '22023';
    END IF;

    SELECT
        os.monitoring_mode,
        os.last_content_hash,
        os.last_content_text
    INTO
        v_monitoring_mode,
        v_current_hash,
        v_current_text
    FROM public.official_sources AS os
    WHERE os.id = p_official_source_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION
            'persist_official_source_scrape(): source % not found',
            p_official_source_id
            USING ERRCODE = 'P0002';
    END IF;

    IF v_monitoring_mode <> 'AUTOMATED' THEN
        RAISE EXCEPTION
            'persist_official_source_scrape(): source % is not automatically monitored',
            p_official_source_id
            USING ERRCODE = '55000';
    END IF;

    IF v_current_hash IS NOT NULL
       AND v_current_text IS NOT NULL
       AND v_current_hash <> encode(
            extensions.digest(convert_to(v_current_text, 'UTF8'), 'sha256'),
            'hex'
       ) THEN
        RAISE EXCEPTION
            'persist_official_source_scrape(): stored hash/content invariant is broken'
            USING ERRCODE = '22000';
    END IF;

    IF v_current_hash IS DISTINCT FROM p_expected_hash THEN
        RETURN QUERY SELECT 'STALE'::TEXT, NULL::UUID, v_current_hash;
        RETURN;
    END IF;

    IF v_current_hash IS NULL THEN
        UPDATE public.official_sources
        SET last_verified = clock_timestamp(),
            last_content_hash = p_new_hash,
            last_content_text = p_content_text
        WHERE id = p_official_source_id;

        RETURN QUERY SELECT 'BASELINE'::TEXT, NULL::UUID, p_new_hash;
        RETURN;
    END IF;

    IF v_current_hash = p_new_hash THEN
        UPDATE public.official_sources
        SET last_verified = clock_timestamp(),
            last_content_hash = p_new_hash,
            last_content_text = p_content_text
        WHERE id = p_official_source_id;

        RETURN QUERY SELECT 'UNCHANGED'::TEXT, NULL::UUID, p_new_hash;
        RETURN;
    END IF;

    INSERT INTO public.rule_change_alerts (
        official_source_id,
        old_hash,
        new_hash,
        diff_summary,
        status
    ) VALUES (
        p_official_source_id,
        v_current_hash,
        p_new_hash,
        p_diff_summary,
        'PENDING'
    )
    RETURNING id INTO v_alert_id;

    UPDATE public.official_sources
    SET last_verified = clock_timestamp(),
        last_content_hash = p_new_hash,
        last_content_text = p_content_text
    WHERE id = p_official_source_id;

    RETURN QUERY SELECT 'CHANGED'::TEXT, v_alert_id, p_new_hash;
END;
$$;

COMMENT ON FUNCTION public.persist_official_source_scrape(UUID, TEXT, TEXT, TEXT, TEXT) IS
    'Service-role-only row-locked CAS for AUTOMATED official-source baselines; atomically files a PENDING alert only on a true hash transition and never changes live rules.';

REVOKE ALL ON FUNCTION public.persist_official_source_scrape(UUID, TEXT, TEXT, TEXT, TEXT)
    FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.persist_official_source_scrape(UUID, TEXT, TEXT, TEXT, TEXT)
    TO service_role;


-- ============================================================================
-- END OF MIGRATION 027_worker_source_monitoring.sql
-- ============================================================================

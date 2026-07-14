-- ============================================================================
-- ReloGo — conservative corrections from the 2026-07-14 source audit
--
-- `days_deadline` drives exact calendar-day arithmetic in the mobile app. A
-- value therefore remains only where an authoritative source supports that
-- exact number for the general new-resident case. Month-based wording,
-- material vehicle/class conditions, unsupported scopes, and stale-law
-- uncertainty are left untimed so the app points users to the official source
-- without manufacturing an exact date.
-- ============================================================================

DO $$
DECLARE
    v_updated INTEGER;
BEGIN
    WITH corrections(task_key, dest, days_deadline, is_mandatory) AS (
        VALUES
            -- Official Nova Scotia guidance gives new residents 90 days.
            ('EXCHANGE_DRIVERS_LICENCE', 'NS', 90, TRUE),

            -- Calendar-unit or condition-dependent licence wording.
            ('EXCHANGE_DRIVERS_LICENCE', 'MB', NULL, TRUE),
            ('EXCHANGE_DRIVERS_LICENCE', 'NU', NULL, TRUE),
            ('EXCHANGE_DRIVERS_LICENCE', 'PE', NULL, TRUE),
            ('EXCHANGE_DRIVERS_LICENCE', 'QC', NULL, TRUE),
            ('EXCHANGE_DRIVERS_LICENCE', 'YT', NULL, TRUE),

            -- Alberta says "within 3 months". Manitoba says enrollment within
            -- 3 months is encouraged rather than a generic mandatory rule.
            ('UPDATE_HEALTH_CARD', 'AB', NULL, TRUE),
            ('UPDATE_HEALTH_CARD', 'MB', NULL, FALSE),

            -- Personal/commercial, calendar-unit, employment, or statutory-
            -- scope conditions cannot be represented by the current boolean
            -- `has_vehicle` model, so these remain mandatory but untimed.
            ('REGISTER_VEHICLE', 'BC', NULL, TRUE),
            ('REGISTER_VEHICLE', 'MB', NULL, TRUE),
            ('REGISTER_VEHICLE', 'NU', NULL, TRUE),
            ('REGISTER_VEHICLE', 'PE', NULL, TRUE),
            ('REGISTER_VEHICLE', 'QC', NULL, TRUE),
            ('REGISTER_VEHICLE', 'YT', NULL, TRUE)
    )
    UPDATE public.corridor_task_rules AS r
       SET days_deadline = c.days_deadline,
           is_mandatory = c.is_mandatory
      FROM public.global_tasks AS g,
           corrections AS c
     WHERE r.task_id = g.id
       AND g.task_key = c.task_key
       AND r.origin_province = 'ANY'
       AND r.dest_province = c.dest;

    GET DIAGNOSTICS v_updated = ROW_COUNT;
    IF v_updated <> 14 THEN
        RAISE EXCEPTION
            'content audit expected 14 seeded rules, updated %', v_updated;
    END IF;
END;
$$;

-- Migration 005 seeded `last_verified = NOW()` before a crawler ever fetched
-- a source. Clear only untouched seed placeholders; real worker baselines keep
-- their successful-crawl timestamp and content.
UPDATE public.official_sources
   SET last_verified = NULL
 WHERE last_content_hash IS NULL
   AND last_content_text IS NULL;

COMMENT ON COLUMN public.official_sources.last_verified IS
    'Timestamp of the last successful worker crawl; not a legal or semantic content-approval timestamp.';

-- ============================================================================
-- END OF MIGRATION 020_content_audit_corrections.sql
-- ============================================================================

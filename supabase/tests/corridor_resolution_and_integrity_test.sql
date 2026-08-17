-- Adversarial coverage for migrations 023-026.

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;

SELECT plan(40);

CREATE FUNCTION pg_temp.login_as(uid UUID) RETURNS VOID AS $$
BEGIN
    PERFORM set_config(
        'request.jwt.claims',
        json_build_object('sub', uid, 'role', 'authenticated')::TEXT,
        TRUE
    );
    SET LOCAL ROLE authenticated;
END
$$ LANGUAGE plpgsql;

CREATE FUNCTION pg_temp.login_anon() RETURNS VOID AS $$
BEGIN
    PERFORM set_config(
        'request.jwt.claims',
        json_build_object('role', 'anon')::TEXT,
        TRUE
    );
    SET LOCAL ROLE anon;
END
$$ LANGUAGE plpgsql;

INSERT INTO auth.users (instance_id, id, aud, role, email, created_at, updated_at)
VALUES
    ('00000000-0000-0000-0000-000000000000', 'fa000000-0000-0000-0000-000000000001',
     'authenticated', 'authenticated', 'resolver-user@test.local', NOW(), NOW()),
    ('00000000-0000-0000-0000-000000000000', 'fa000000-0000-0000-0000-000000000002',
     'authenticated', 'authenticated', 'resolver-empty@test.local', NOW(), NOW()),
    ('00000000-0000-0000-0000-000000000000', 'fa000000-0000-0000-0000-0000000000ad',
     'authenticated', 'authenticated', 'resolver-admin@test.local', NOW(), NOW());

INSERT INTO public.admin_users (user_id)
VALUES ('fa000000-0000-0000-0000-0000000000ad');

INSERT INTO public.user_profiles (
    id,
    origin_prov,
    dest_prov,
    move_date,
    has_vehicle,
    has_dependents,
    consent_version
)
VALUES (
    'fa000000-0000-0000-0000-000000000001',
    'ON',
    'AB',
    '2026-11-15',
    FALSE,
    FALSE,
    '1.1'
);

INSERT INTO public.global_tasks (
    id,
    task_key,
    title_en,
    base_description_en
)
VALUES
    ('fa100000-0000-0000-0000-000000000001', 'TEST_RESOLVE_EXACT', 'Resolver exact', 'test'),
    ('fa100000-0000-0000-0000-000000000002', 'TEST_RESOLVE_DEST', 'Resolver destination', 'test'),
    ('fa100000-0000-0000-0000-000000000003', 'TEST_RESOLVE_ORIGIN', 'Resolver origin', 'test'),
    ('fa100000-0000-0000-0000-000000000004', 'TEST_RESOLVE_GLOBAL', 'Resolver global', 'test'),
    ('fa100000-0000-0000-0000-000000000005', 'TEST_RESOLVE_TIE', 'Resolver tie', 'test');

INSERT INTO public.corridor_task_rules (
    id,
    task_id,
    origin_province,
    dest_province,
    days_deadline,
    is_mandatory
)
VALUES
    -- Task 1 has every precedence level; exact/exact must win.
    ('fa200000-0000-0000-0000-000000000001', 'fa100000-0000-0000-0000-000000000001', 'ANY', 'ANY', 101, TRUE),
    ('fa200000-0000-0000-0000-000000000002', 'fa100000-0000-0000-0000-000000000001', 'ON',  'ANY', 102, TRUE),
    ('fa200000-0000-0000-0000-000000000003', 'fa100000-0000-0000-0000-000000000001', 'ANY', 'AB',  103, TRUE),
    ('fa200000-0000-0000-0000-000000000004', 'fa100000-0000-0000-0000-000000000001', 'ON',  'AB',  104, TRUE),
    -- Task 2 proves ANY/exact destination outranks exact origin/ANY.
    ('fa200000-0000-0000-0000-000000000011', 'fa100000-0000-0000-0000-000000000002', 'ANY', 'ANY', 111, TRUE),
    ('fa200000-0000-0000-0000-000000000012', 'fa100000-0000-0000-0000-000000000002', 'ON',  'ANY', 112, TRUE),
    ('fa200000-0000-0000-0000-000000000013', 'fa100000-0000-0000-0000-000000000002', 'ANY', 'AB',  113, TRUE),
    -- Task 3 falls back to exact origin/ANY.
    ('fa200000-0000-0000-0000-000000000021', 'fa100000-0000-0000-0000-000000000003', 'ANY', 'ANY', 121, TRUE),
    ('fa200000-0000-0000-0000-000000000022', 'fa100000-0000-0000-0000-000000000003', 'ON',  'ANY', 122, TRUE),
    -- Task 4 falls back to ANY/ANY.
    ('fa200000-0000-0000-0000-000000000031', 'fa100000-0000-0000-0000-000000000004', 'ANY', 'ANY', 131, TRUE);

-- The production uniqueness constraint makes equal-priority duplicates
-- impossible. Temporarily remove it inside this rolled-back test transaction
-- to prove the resolver's UUID tiebreak remains deterministic under bad data.
ALTER TABLE public.corridor_task_rules
    DROP CONSTRAINT corridor_task_rules_unique_corridor;

INSERT INTO public.corridor_task_rules (
    id,
    task_id,
    origin_province,
    dest_province,
    days_deadline,
    is_mandatory
)
VALUES
    ('fa200000-0000-0000-0000-000000000050', 'fa100000-0000-0000-0000-000000000005', 'ON', 'AB', 150, TRUE),
    ('fa200000-0000-0000-0000-000000000051', 'fa100000-0000-0000-0000-000000000005', 'ON', 'AB', 151, TRUE);

INSERT INTO public.official_sources (
    id,
    corridor_rule_id,
    agency_name,
    official_url,
    last_verified
)
VALUES
    ('fa300000-0000-0000-0000-000000000001', 'fa200000-0000-0000-0000-000000000004',
     'Agency Z', 'https://z.example.gc.ca/rule', '2026-01-03T00:00:00Z'),
    ('fa300000-0000-0000-0000-000000000002', 'fa200000-0000-0000-0000-000000000004',
     'Agency A', 'https://a.example.gc.ca/rule', '2026-01-02T00:00:00Z'),
    ('fa300000-0000-0000-0000-000000000003', 'fa200000-0000-0000-0000-000000000004',
     'Agency HTTP', 'http://insecure.example.gc.ca/rule', '2026-01-01T00:00:00Z');

INSERT INTO public.user_task_progress (user_id, task_rule_id, status)
VALUES (
    'fa000000-0000-0000-0000-000000000001',
    'fa200000-0000-0000-0000-000000000001',
    'COMPLETED'
);

SELECT ok(
    (SELECT NOT p.prosecdef AND p.provolatile = 's'
       FROM pg_proc AS p
       JOIN pg_namespace AS n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public'
        AND p.proname = 'resolve_corridor_rules'
        AND pg_get_function_identity_arguments(p.oid) =
            'p_origin_province text, p_dest_province text')
    AND has_function_privilege(
        'anon', 'public.resolve_corridor_rules(text,text)', 'EXECUTE')
    AND has_function_privilege(
        'authenticated', 'public.resolve_corridor_rules(text,text)', 'EXECUTE')
    AND has_function_privilege(
        'service_role', 'public.resolve_corridor_rules(text,text)', 'EXECUTE'),
    '023: resolver is stable, SECURITY INVOKER, and explicitly callable by app/server roles'
);

SELECT pg_temp.login_anon();

SELECT is(
    (SELECT count(*)::INTEGER
       FROM public.resolve_corridor_rules('ON', 'AB')
      WHERE task_key LIKE 'TEST_RESOLVE_%'),
    5,
    '023: resolver returns all five test tasks'
);

SELECT is(
    (SELECT max(per_task)::INTEGER
       FROM (
          SELECT count(*) AS per_task
            FROM public.resolve_corridor_rules('ON', 'AB')
           WHERE task_key LIKE 'TEST_RESOLVE_%'
           GROUP BY task_id
       ) AS counts),
    1,
    '023: resolver returns exactly one row per task'
);

SELECT is(
    (SELECT id FROM public.resolve_corridor_rules('ON', 'AB')
      WHERE task_key = 'TEST_RESOLVE_EXACT'),
    'fa200000-0000-0000-0000-000000000004'::UUID,
    '023: exact origin/exact destination has first precedence'
);

SELECT is(
    (SELECT id FROM public.resolve_corridor_rules('ON', 'AB')
      WHERE task_key = 'TEST_RESOLVE_DEST'),
    'fa200000-0000-0000-0000-000000000013'::UUID,
    '023: ANY origin/exact destination outranks exact origin/ANY destination'
);

SELECT is(
    (SELECT id FROM public.resolve_corridor_rules('ON', 'AB')
      WHERE task_key = 'TEST_RESOLVE_ORIGIN'),
    'fa200000-0000-0000-0000-000000000022'::UUID,
    '023: exact origin/ANY destination is the third fallback'
);

SELECT is(
    (SELECT id FROM public.resolve_corridor_rules('ON', 'AB')
      WHERE task_key = 'TEST_RESOLVE_GLOBAL'),
    'fa200000-0000-0000-0000-000000000031'::UUID,
    '023: ANY/ANY is the final fallback'
);

SELECT is(
    (SELECT id FROM public.resolve_corridor_rules('ON', 'AB')
      WHERE task_key = 'TEST_RESOLVE_TIE'),
    'fa200000-0000-0000-0000-000000000050'::UUID,
    '023: equal-specificity bad data is resolved by ascending rule id'
);

SELECT is(
    (SELECT jsonb_array_length(official_sources)
       FROM public.resolve_corridor_rules('ON', 'AB')
      WHERE task_key = 'TEST_RESOLVE_EXACT'),
    2,
    '023: only HTTPS official sources are returned'
);

SELECT ok(
    (SELECT bool_and(source->>'official_url' LIKE 'https://%')
       FROM public.resolve_corridor_rules('ON', 'AB') AS r,
            LATERAL jsonb_array_elements(r.official_sources) AS source
      WHERE r.task_key = 'TEST_RESOLVE_EXACT'),
    '023: every returned official source uses HTTPS'
);

SELECT is(
    (SELECT official_sources->0->>'agency_name'
       FROM public.resolve_corridor_rules('ON', 'AB')
      WHERE task_key = 'TEST_RESOLVE_EXACT'),
    'Agency A',
    '023: official sources have deterministic agency/url/id ordering'
);

SELECT is(
    (SELECT array_agg(key ORDER BY key)
       FROM public.resolve_corridor_rules('ON', 'AB') AS r,
            LATERAL jsonb_object_keys(r.official_sources->0) AS key
      WHERE r.task_key = 'TEST_RESOLVE_EXACT'),
    ARRAY['agency_name', 'id', 'last_verified', 'official_url']::TEXT[],
    '023: official source objects expose only the approved metadata fields'
);

RESET ROLE;
SET LOCAL ROLE service_role;

SELECT is(
    (SELECT count(*)::INTEGER
       FROM public.resolve_corridor_rules('ON', 'AB')
      WHERE task_key LIKE 'TEST_RESOLVE_%'),
    5,
    '023: the least-privilege service role can execute the invoker resolver'
);

RESET ROLE;
SELECT pg_temp.login_as('fa000000-0000-0000-0000-0000000000ad');

SELECT is(
    (SELECT count(*)::INTEGER
       FROM public.resolve_corridor_rules('ON', 'AB')
      WHERE task_key LIKE 'TEST_RESOLVE_%'),
    5,
    '023: an authenticated caller can execute the invoker resolver'
);

SELECT is(
    (SELECT tasks_completed
       FROM public.admin_list_users()
      WHERE user_id = 'fa000000-0000-0000-0000-000000000001'),
    0::BIGINT,
    '023: admin counts ignore progress attached to a losing wildcard rule'
);

SELECT is(
    (SELECT tasks_total
       FROM public.admin_list_users()
      WHERE user_id = 'fa000000-0000-0000-0000-000000000001'),
    (SELECT count(*)
       FROM public.resolve_corridor_rules('ON', 'AB')
      WHERE NOT requires_vehicle AND NOT requires_dependents),
    '023: admin list total reuses the canonical resolver result'
);

SELECT is(
    (SELECT task->>'task_rule_id'
       FROM jsonb_array_elements(public.admin_get_user_detail(
            'fa000000-0000-0000-0000-000000000001')->'tasks') AS task
      WHERE task->>'task_key' = 'TEST_RESOLVE_EXACT'),
    'fa200000-0000-0000-0000-000000000004',
    '023: admin detail uses the winning canonical rule id'
);

SELECT is(
    (SELECT count(*)::INTEGER
       FROM jsonb_array_elements(public.admin_get_user_detail(
            'fa000000-0000-0000-0000-000000000001')->'tasks') AS task
      WHERE task->>'task_key' = 'TEST_RESOLVE_EXACT'),
    1,
    '023: admin detail returns one entry for a task with wildcard overrides'
);

SELECT is(
    (SELECT task->'official_sources'
       FROM jsonb_array_elements(public.admin_get_user_detail(
            'fa000000-0000-0000-0000-000000000001')->'tasks') AS task
      WHERE task->>'task_key' = 'TEST_RESOLVE_EXACT'),
    (SELECT official_sources
       FROM public.resolve_corridor_rules('ON', 'AB')
      WHERE task_key = 'TEST_RESOLVE_EXACT'),
    '023: admin detail returns the resolver official_sources array'
);

RESET ROLE;
SELECT pg_temp.login_as('fa000000-0000-0000-0000-000000000001');

SELECT ok(
    public.get_policy_consent_state()->'profile' IS NOT NULL
    AND public.get_policy_consent_state()->'profile' <> 'null'::JSONB,
    '024: current consent returns the startup profile payload'
);

SELECT is(
    (SELECT array_agg(key ORDER BY key)
       FROM jsonb_object_keys(
            public.get_policy_consent_state()->'profile') AS key),
    ARRAY[
        'consent_timestamp', 'consent_version', 'created_at', 'dest_prov',
        'has_dependents', 'has_vehicle', 'id', 'move_date', 'origin_prov',
        'updated_at'
    ]::TEXT[],
    '024: startup profile has an explicit non-PII field allowlist'
);

SELECT ok(
    public.get_policy_consent_state()->'profile'->>'id' =
        'fa000000-0000-0000-0000-000000000001'
    AND public.get_policy_consent_state()->'profile'->>'origin_prov' = 'ON'
    AND public.get_policy_consent_state()->'profile'->>'dest_prov' = 'AB',
    '024: startup profile belongs to the authenticated caller'
);

RESET ROLE;
SELECT pg_temp.login_as('fa000000-0000-0000-0000-000000000002');

SELECT is(
    public.get_policy_consent_state()->'profile',
    'null'::JSONB,
    '024: a caller without a profile receives JSON null'
);

RESET ROLE;

INSERT INTO public.user_task_progress (user_id, task_rule_id)
VALUES (
    'fa000000-0000-0000-0000-000000000001',
    'fa200000-0000-0000-0000-000000000004'
);

SELECT is(
    (SELECT status::TEXT
       FROM public.user_task_progress
      WHERE user_id = 'fa000000-0000-0000-0000-000000000001'
        AND task_rule_id = 'fa200000-0000-0000-0000-000000000004'),
    'AVAILABLE',
    '025: omitted progress status defaults to AVAILABLE'
);

SELECT throws_ok(
    $$INSERT INTO public.user_task_progress (user_id, task_rule_id, status)
      VALUES (
        'fa000000-0000-0000-0000-000000000001',
        'fa200000-0000-0000-0000-000000000013',
        'LOCKED')$$,
    '23514', NULL,
    '025: progress constraint rejects LOCKED'
);

SELECT is(
    (SELECT count(*)::INTEGER
       FROM public.user_task_progress
      WHERE status = 'LOCKED'),
    0,
    '025: no legacy LOCKED values remain'
);

SELECT ok(
    EXISTS (
        SELECT 1 FROM pg_constraint
         WHERE conname = 'user_profiles_distinct_provinces_check'
           AND conrelid = 'public.user_profiles'::REGCLASS
    ),
    '026: user_profiles has a distinct-province constraint'
);

SELECT ok(
    NOT (
        SELECT convalidated FROM pg_constraint
         WHERE conname = 'user_profiles_distinct_provinces_check'
           AND conrelid = 'public.user_profiles'::REGCLASS
    ),
    '026: the profile constraint preserves unknown legacy rows with NOT VALID'
);

SELECT ok(
    NOT (
        SELECT convalidated FROM pg_constraint
         WHERE conname = 'waitlist_distinct_provinces_check'
           AND conrelid = 'public.waitlist'::REGCLASS
    ),
    '026: the waitlist constraint preserves unknown legacy rows with NOT VALID'
);

SELECT throws_ok(
    $$INSERT INTO public.user_profiles (
          id, origin_prov, dest_prov, consent_version)
      VALUES (
          'fa000000-0000-0000-0000-000000000002', 'ON', 'ON', '1.1')$$,
    '23514', NULL,
    '026: a new same-province profile is rejected'
);

SELECT throws_ok(
    $$INSERT INTO public.waitlist (email, origin_province, dest_province)
      VALUES ('same-corridor@test.local', 'BC', 'BC')$$,
    '23514', NULL,
    '026: a new same-province waitlist row is rejected'
);

SELECT lives_ok(
    $$INSERT INTO public.waitlist (email, origin_province, dest_province)
      VALUES ('unknown-corridor@test.local', NULL, NULL)$$,
    '026: a waitlist row may still omit an unknown corridor'
);

CREATE TEMP TABLE expected_worker_source_monitoring (
    task_key TEXT NOT NULL,
    destination VARCHAR(2) NOT NULL,
    official_url TEXT NOT NULL,
    monitor_url TEXT,
    monitoring_mode VARCHAR(20) NOT NULL,
    manual_review_owner TEXT,
    manual_review_interval_days SMALLINT,
    PRIMARY KEY (task_key, destination, official_url)
) ON COMMIT DROP;

INSERT INTO expected_worker_source_monitoring VALUES
    (
        'EXCHANGE_DRIVERS_LICENCE', 'NU',
        'https://www.gov.nu.ca/en/service-nunavut/apply-drivers-licence',
        'https://www.gov.nu.ca/sites/default/files/documents/2022-12/driversmanual_eng.pdf',
        'AUTOMATED', NULL, NULL
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
        NULL, 'MANUAL', 'ReloGo operations', 30
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
        'REGISTER_VEHICLE', 'YT',
        'https://yukon.ca/en/driving-and-transportation/driver-licensing/transfer-your-drivers-licence-jurisdiction-outside-yukon',
        NULL, 'MANUAL', 'ReloGo operations', 30
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
    );

CREATE TEMP VIEW actual_worker_source_monitoring AS
SELECT
    expected.*,
    source.id AS source_id,
    source.monitor_url AS actual_monitor_url,
    source.monitoring_mode AS actual_monitoring_mode,
    source.manual_review_owner AS actual_manual_review_owner,
    source.manual_review_interval_days AS actual_manual_review_interval_days,
    source.last_verified,
    source.last_content_hash,
    source.last_content_text
FROM expected_worker_source_monitoring AS expected
LEFT JOIN public.global_tasks AS task
  ON task.task_key = expected.task_key
LEFT JOIN public.corridor_task_rules AS rule
  ON rule.task_id = task.id
 AND rule.origin_province = 'ANY'
 AND rule.dest_province = expected.destination
LEFT JOIN public.official_sources AS source
  ON source.corridor_rule_id = rule.id
 AND source.official_url = expected.official_url;

SELECT ok(
    (SELECT count(*) = 11
            AND count(source_id) = 11
            AND count(*) FILTER (
                WHERE actual_monitoring_mode = 'AUTOMATED') = 9
            AND count(*) FILTER (
                WHERE actual_monitoring_mode = 'MANUAL') = 2
       FROM actual_worker_source_monitoring)
    AND (SELECT count(*) = 53
           FROM public.official_sources AS source
           JOIN public.corridor_task_rules AS rule
             ON rule.id = source.corridor_rule_id
           JOIN public.global_tasks AS task
             ON task.id = rule.task_id
          WHERE task.task_key IN (
              'EXCHANGE_DRIVERS_LICENCE',
              'UPDATE_HEALTH_CARD',
              'REGISTER_VEHICLE',
              'REGISTER_CHILDREN_SCHOOL',
              'UPDATE_CRA_ADDRESS'
          )),
    '027: all 53 sources remain, with nine targets automated and two manual'
);

SELECT ok(
    (SELECT bool_and(
        actual_monitor_url IS NOT DISTINCT FROM monitor_url
        AND actual_monitoring_mode = monitoring_mode
        AND actual_manual_review_owner IS NOT DISTINCT FROM manual_review_owner
        AND actual_manual_review_interval_days IS NOT DISTINCT FROM
            manual_review_interval_days
    ) FROM actual_worker_source_monitoring),
    '027: every exact task/destination/source tuple has its reviewed configuration'
);

SELECT ok(
    (SELECT bool_and(
        (
            monitoring_mode = 'AUTOMATED'
            AND manual_review_owner IS NULL
            AND manual_review_interval_days IS NULL
        ) OR (
            monitoring_mode = 'MANUAL'
            AND monitor_url IS NULL
            AND NULLIF(BTRIM(manual_review_owner), '') IS NOT NULL
            AND manual_review_interval_days BETWEEN 1 AND 365
        )
    ) FROM public.official_sources),
    '027: seeded source-monitoring modes satisfy their metadata invariants'
);

SELECT ok(
    (SELECT bool_and(
        last_verified IS NULL
        AND last_content_hash IS NULL
        AND last_content_text IS NULL
    ) FROM actual_worker_source_monitoring),
    '027: every switched source starts with a cleared baseline'
);

SELECT throws_ok(
    $$INSERT INTO public.official_sources (
          id, corridor_rule_id, agency_name, official_url, monitor_url)
      VALUES (
          'fa300000-0000-0000-0000-000000000027',
          'fa200000-0000-0000-0000-000000000001',
          'Invalid HTTP Monitor',
          'https://example.gc.ca/canonical',
          'http://example.gc.ca/monitor')$$,
    '23514', NULL,
    '027: an insecure HTTP monitor target is rejected'
);

SELECT throws_ok(
    $$INSERT INTO public.official_sources (
          id, corridor_rule_id, agency_name, official_url, monitor_url,
          monitoring_mode, manual_review_owner, manual_review_interval_days)
      VALUES (
          'fa300000-0000-0000-0000-000000000028',
          'fa200000-0000-0000-0000-000000000001',
          'Invalid Manual Monitor',
          'https://example.gc.ca/manual',
          'https://example.gc.ca/automatic',
          'MANUAL', '', 0)$$,
    '23514', NULL,
    '027: a malformed manual-monitoring assignment is rejected'
);

CREATE OR REPLACE FUNCTION public.current_policy_version()
RETURNS TEXT
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
    SELECT '2.0'::TEXT
$$;

SELECT pg_temp.login_as('fa000000-0000-0000-0000-000000000001');

SELECT is(
    public.get_policy_consent_state()->'profile',
    'null'::JSONB,
    '024: stale consent never returns the profile payload'
);

SELECT ok(
    NOT (public.get_policy_consent_state()->>'has_current_consent')::BOOLEAN
    AND public.get_policy_consent_state()->>'accepted_version' = '1.1'
    AND public.get_policy_consent_state()->>'current_version' = '2.0',
    '024: stale state still reports versions needed for re-consent'
);

SELECT * FROM finish();
ROLLBACK;

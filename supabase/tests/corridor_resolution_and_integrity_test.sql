-- Adversarial coverage for migrations 023-026.

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;

SELECT plan(34);

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

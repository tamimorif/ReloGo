-- ============================================================================
-- ReloGo — pgTAP tests for the security boundary:
--   Row-Level Security policies + SECURITY DEFINER RPCs.
--
-- Run locally:  supabase start && supabase test db --local
-- CI:           .github/workflows/ci.yml → "db-tests" job
--
-- Gotchas baked into this file (learned the hard way):
--   * The hosted Supabase platform grants table privileges to anon /
--     authenticated at provisioning time; running migrations alone does NOT.
--     We mirror that baseline below so the tests exercise RLS (the real
--     security gate), not a missing GRANT.
--   * Identity is simulated the way PostgREST does it: set the
--     request.jwt.claims GUC, then SET LOCAL ROLE.
--   * A write that fails a policy's USING clause affects 0 rows silently;
--     one that fails WITH CHECK raises SQLSTATE 42501. Tests assert
--     accordingly (CTE row-count for the former, throws_ok for the latter).
--   * throws_ok is used in its 4-arg form (sql, sqlstate, errmsg, desc)
--     with errmsg NULL so only the SQLSTATE is matched.
-- ============================================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;

SELECT plan(164);

-- ============================================================================
-- Platform-baseline grants (see header). RLS remains the actual gate.
-- ============================================================================
GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated;

-- Re-apply 006's column-level restriction, which the blanket baseline grant
-- above just clobbered. (On the platform the order matches production:
-- provisioning grants come FIRST, the migration's REVOKE runs after.)
REVOKE SELECT ON official_sources FROM anon, authenticated;
GRANT SELECT (id, corridor_rule_id, agency_name, official_url, last_verified, created_at)
    ON official_sources TO anon, authenticated;

-- Re-apply 008's support write-column restrictions after the blanket grant.
-- Clients choose only business fields; ids and timestamps stay server-owned.
REVOKE INSERT ON support_messages FROM authenticated;
GRANT INSERT (thread_id, sender, body) ON support_messages TO authenticated;
REVOKE INSERT, UPDATE ON support_threads FROM authenticated;
-- Migration 012 removes the last client-authored free-text field (subject).
GRANT INSERT (user_id, status) ON support_threads TO authenticated;
GRANT UPDATE (status) ON support_threads TO authenticated;

-- Re-apply 009's RPC-only rule-review boundary after the blanket grant.
-- Both regular users and admins are authenticated at the table layer.
REVOKE UPDATE ON corridor_task_rules FROM anon, authenticated;
REVOKE UPDATE ON rule_change_alerts FROM anon, authenticated;

-- ============================================================================
-- Identity helpers
-- ============================================================================
CREATE FUNCTION pg_temp.login_as(uid UUID) RETURNS VOID AS $$
BEGIN
    PERFORM set_config(
        'request.jwt.claims',
        json_build_object('sub', uid, 'role', 'authenticated')::text,
        true
    );
    SET LOCAL ROLE authenticated;
END $$ LANGUAGE plpgsql;

CREATE FUNCTION pg_temp.login_anon() RETURNS VOID AS $$
BEGIN
    PERFORM set_config(
        'request.jwt.claims',
        json_build_object('role', 'anon')::text,
        true
    );
    SET LOCAL ROLE anon;
END $$ LANGUAGE plpgsql;

-- ============================================================================
-- Fixtures (inserted as postgres — table owner bypasses RLS)
-- ============================================================================
INSERT INTO auth.users (instance_id, id, aud, role, email, created_at, updated_at)
VALUES
    ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-00000000000a',
     'authenticated', 'authenticated', 'user-a@test.local', NOW(), NOW()),
    ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-00000000000b',
     'authenticated', 'authenticated', 'user-b@test.local', NOW(), NOW()),
    ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000000ad',
     'authenticated', 'authenticated', 'admin@test.local', NOW(), NOW());

INSERT INTO public.admin_users (user_id)
VALUES ('00000000-0000-0000-0000-0000000000ad');

INSERT INTO public.global_tasks (id, task_key, title_en, base_description_en)
VALUES
    ('10000000-0000-0000-0000-000000000001', 'TEST_TASK_ONE', 'Test task one', 'pgTAP fixture'),
    ('10000000-0000-0000-0000-000000000002', 'TEST_TASK_TWO', 'Test task two', 'pgTAP fixture');

INSERT INTO public.corridor_task_rules (id, task_id, origin_province, dest_province, days_deadline, is_mandatory)
VALUES
    ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'ON', 'AB', 90, true),
    ('20000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000002', 'ON', 'AB', 30, true);

INSERT INTO public.official_sources (
    id, corridor_rule_id, agency_name, official_url, last_content_hash)
VALUES (
    '30000000-0000-0000-0000-000000000001',
    '20000000-0000-0000-0000-000000000001',
    'Test Agency',
    'https://example.gc.ca/rules',
    'bbb'
);

INSERT INTO public.rule_change_alerts (id, official_source_id, old_hash, new_hash, status)
VALUES
    ('40000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', 'aaa', 'bbb', 'PENDING'),
    ('40000000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-000000000001', 'bbb', 'ccc', 'PENDING');

INSERT INTO public.user_profiles (
    id,
    origin_prov,
    dest_prov,
    move_date,
    has_vehicle,
    has_dependents,
    consent_version
)
VALUES
    ('00000000-0000-0000-0000-00000000000a', 'ON', 'AB', '2026-09-01', false, false, '1.1'),
    ('00000000-0000-0000-0000-00000000000b', 'BC', 'ON', '2026-10-01', false, false, '1.1');

INSERT INTO public.user_task_progress (user_id, task_rule_id, status)
VALUES
    ('00000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-000000000001', 'COMPLETED'),
    ('00000000-0000-0000-0000-00000000000b', '20000000-0000-0000-0000-000000000001', 'AVAILABLE');

INSERT INTO public.support_threads (id, user_id, subject)
VALUES
    ('50000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000a', 'Thread A'),
    ('50000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-00000000000b', 'Thread B');

INSERT INTO public.support_messages (thread_id, sender, body)
VALUES ('50000000-0000-0000-0000-00000000000a', 'user', 'Hello, I have a question.');

-- ============================================================================
-- A. user_profiles — per-user isolation                              (5 tests)
-- ============================================================================
SELECT pg_temp.login_as('00000000-0000-0000-0000-00000000000a');

SELECT is(
    (SELECT count(*)::int FROM public.user_profiles),
    1,
    'A: a user sees exactly one profile — their own'
);

SELECT is(
    (SELECT count(*)::int FROM public.user_profiles
      WHERE id = '00000000-0000-0000-0000-00000000000b'),
    0,
    'A: another user''s profile row is invisible'
);

SELECT throws_ok(
    $$INSERT INTO public.user_profiles (
          id, origin_prov, dest_prov, consent_version)
      VALUES (
          '00000000-0000-0000-0000-00000000000b', 'ON', 'AB', '1.1')$$,
    '42501', NULL,
    'A: inserting a profile under someone else''s id is rejected by WITH CHECK'
);

-- A write that fails USING matches zero rows silently — run it, then prove
-- from the owner's vantage point that nothing changed.
SELECT lives_ok(
    $$UPDATE public.user_profiles SET origin_prov = 'QC'
       WHERE id = '00000000-0000-0000-0000-00000000000b'$$,
    'A: cross-user profile update executes without error (USING filters it)'
);

RESET ROLE;
SELECT is(
    (SELECT origin_prov::text FROM public.user_profiles
      WHERE id = '00000000-0000-0000-0000-00000000000b'),
    'BC',
    'A: user B''s profile is untouched after the blocked update'
);

-- ============================================================================
-- B. user_task_progress — per-user isolation                          (4 tests)
-- ============================================================================
SELECT pg_temp.login_as('00000000-0000-0000-0000-00000000000a');

SELECT lives_ok(
    $$INSERT INTO public.user_task_progress (user_id, task_rule_id, status)
      VALUES ('00000000-0000-0000-0000-00000000000a',
              '20000000-0000-0000-0000-000000000002', 'AVAILABLE')$$,
    'B: a user can insert their own progress row'
);

SELECT throws_ok(
    $$INSERT INTO public.user_task_progress (user_id, task_rule_id, status)
      VALUES ('00000000-0000-0000-0000-00000000000b',
              '20000000-0000-0000-0000-000000000002', 'AVAILABLE')$$,
    '42501', NULL,
    'B: inserting progress for another user is rejected by WITH CHECK'
);

SELECT is(
    (SELECT count(*)::int FROM public.user_task_progress),
    2,
    'B: a user sees only their own progress rows (B''s row is invisible)'
);

SELECT lives_ok(
    $$DELETE FROM public.user_task_progress
       WHERE user_id = '00000000-0000-0000-0000-00000000000a'
         AND task_rule_id = '20000000-0000-0000-0000-000000000002'$$,
    'B: a user can delete their own progress row (corridor change)'
);

-- ============================================================================
-- C. waitlist — RPC-only inserts, enumeration-safe                    (6 tests)
-- ============================================================================
RESET ROLE;
SELECT pg_temp.login_anon();

SELECT throws_ok(
    $$INSERT INTO public.waitlist (email) VALUES ('direct@example.com')$$,
    '42501', NULL,
    'C: direct INSERT into waitlist as anon is blocked (RPC-only)'
);

SELECT lives_ok(
    $$SELECT public.join_waitlist('newuser@example.com', 'ON', 'AB')$$,
    'C: join_waitlist() succeeds for anon'
);

SELECT lives_ok(
    $$SELECT public.join_waitlist('  NEWUSER@example.com ', 'BC', 'NS')$$,
    'C: duplicate join_waitlist() also reports success (no email enumeration)'
);

SELECT is(
    (SELECT count(*)::int FROM public.waitlist),
    0,
    'C: anon cannot read the waitlist back'
);

RESET ROLE;
SELECT is(
    (SELECT count(*)::int FROM public.waitlist
      WHERE email = 'newuser@example.com'),
    1,
    'C: the duplicate signup was silently dropped (one row, lower-cased/trimmed)'
);

SELECT pg_temp.login_anon();
SELECT throws_ok(
    $$SELECT public.join_waitlist('not-an-email')$$,
    '23514', NULL,
    'C: join_waitlist() rejects malformed emails via the CHECK constraint'
);

-- ============================================================================
-- C2. official_sources — column-level grants (006)                    (2 tests)
-- ============================================================================
SELECT lives_ok(
    $$SELECT agency_name, official_url FROM public.official_sources LIMIT 1$$,
    'C2: anon can read source metadata columns'
);

SELECT throws_ok(
    $$SELECT last_content_text FROM public.official_sources LIMIT 1$$,
    '42501', NULL,
    'C2: anon cannot read scraped page bodies (column-level grant)'
);

-- ============================================================================
-- D. rule review — RPC-only admin mutations                           (14 tests)
-- ============================================================================
RESET ROLE;
SELECT pg_temp.login_as('00000000-0000-0000-0000-00000000000a');

SELECT is(
    public.is_admin(), false,
    'D: is_admin() is false for a regular user'
);

SELECT is(
    (SELECT count(*)::int FROM public.rule_change_alerts),
    0,
    'D: a regular user sees no alerts'
);

SELECT throws_ok(
    $$SELECT public.dismiss_rule_change(
        '40000000-0000-0000-0000-000000000002')$$,
    'P0001', NULL,
    'D: dismiss_rule_change() refuses non-admins'
);

SELECT pg_temp.login_as('00000000-0000-0000-0000-0000000000ad');

SELECT is(
    public.is_admin(), true,
    'D: is_admin() is true for an admin_users member'
);

SELECT is(
    (SELECT count(*)::int FROM public.rule_change_alerts),
    2,
    'D: an admin sees all alerts'
);

SELECT throws_ok(
    $$UPDATE public.corridor_task_rules
         SET days_deadline = 1
       WHERE id = '20000000-0000-0000-0000-000000000001'$$,
    '42501', NULL,
    'D: an admin cannot edit a live rule directly'
);

SELECT throws_ok(
    $$UPDATE public.rule_change_alerts
         SET status = 'APPROVED'
       WHERE id = '40000000-0000-0000-0000-000000000002'$$,
    '42501', NULL,
    'D: an admin cannot mark an alert APPROVED directly'
);

RESET ROLE;
SELECT is(
    (SELECT days_deadline FROM public.corridor_task_rules
      WHERE id = '20000000-0000-0000-0000-000000000001'),
    90,
    'D: the rejected direct edit left the live rule unchanged'
);

SELECT is(
    (SELECT status::text FROM public.rule_change_alerts
      WHERE id = '40000000-0000-0000-0000-000000000002'),
    'PENDING',
    'D: the rejected direct approval left the alert PENDING'
);

SELECT pg_temp.login_as('00000000-0000-0000-0000-0000000000ad');

SELECT lives_ok(
    $$SELECT public.dismiss_rule_change(
        '40000000-0000-0000-0000-000000000002')$$,
    'D: an admin can dismiss a PENDING alert through the RPC'
);

RESET ROLE;
SELECT is(
    (SELECT status::text FROM public.rule_change_alerts
      WHERE id = '40000000-0000-0000-0000-000000000002'),
    'DISMISSED',
    'D: the RPC dismissal persisted'
);

SELECT pg_temp.login_as('00000000-0000-0000-0000-0000000000ad');

SELECT throws_ok(
    $$SELECT public.dismiss_rule_change(
        '40000000-0000-0000-0000-000000000002')$$,
    'P0001', NULL,
    'D: a DISMISSED alert cannot be dismissed again'
);

SELECT throws_ok(
    $$SELECT public.dismiss_rule_change(
        '99999999-9999-9999-9999-999999999999')$$,
    'P0001', NULL,
    'D: dismissing an unknown alert id raises'
);

RESET ROLE;
SELECT is(
    (SELECT status::text FROM public.rule_change_alerts
      WHERE id = '40000000-0000-0000-0000-000000000002'),
    'DISMISSED',
    'D: rejected dismissal attempts leave the alert DISMISSED'
);

-- Put the alert back to PENDING so section E's approve flow starts clean.
UPDATE public.rule_change_alerts SET status = 'PENDING'
 WHERE id = '40000000-0000-0000-0000-000000000002';

-- ============================================================================
-- E. approve_rule_change() — atomic, current-source-only approval    (15 tests)
-- ============================================================================
SELECT ok(
    has_function_privilege(
        'authenticated',
        'public.approve_rule_change(uuid,integer,boolean)',
        'EXECUTE')
    AND NOT has_function_privilege(
        'anon',
        'public.approve_rule_change(uuid,integer,boolean)',
        'EXECUTE')
    AND NOT has_function_privilege(
        'service_role',
        'public.approve_rule_change(uuid,integer,boolean)',
        'EXECUTE')
    AND COALESCE((
        SELECT proc.prosecdef
           AND proc.proconfig @> ARRAY['search_path=""']::TEXT[]
        FROM pg_catalog.pg_proc AS proc
        WHERE proc.oid =
            'public.approve_rule_change(uuid,integer,boolean)'::REGPROCEDURE
    ), false),
    'E: approval keeps its authenticated-only SECURITY DEFINER boundary and empty search_path'
);

SELECT pg_temp.login_as('00000000-0000-0000-0000-00000000000a');

SELECT throws_ok(
    $$SELECT public.approve_rule_change(
        '40000000-0000-0000-0000-000000000001', 30, true)$$,
    'P0001', NULL,
    'E: approve_rule_change() refuses non-admins'
);

SELECT pg_temp.login_as('00000000-0000-0000-0000-0000000000ad');

SELECT lives_ok(
    $$SELECT public.approve_rule_change(
        '40000000-0000-0000-0000-000000000001', 30, false)$$,
    'E: admin can approve an alert'
);

RESET ROLE;
SELECT is(
    (SELECT days_deadline FROM public.corridor_task_rules
      WHERE id = '20000000-0000-0000-0000-000000000001'),
    30,
    'E: the linked rule''s deadline was updated'
);

SELECT is(
    (SELECT is_mandatory FROM public.corridor_task_rules
      WHERE id = '20000000-0000-0000-0000-000000000001'),
    false,
    'E: the linked rule''s mandatory flag was updated'
);

SELECT is(
    (SELECT status::text FROM public.rule_change_alerts
      WHERE id = '40000000-0000-0000-0000-000000000001'),
    'APPROVED',
    'E: the alert was resolved in the same transaction'
);

SELECT pg_temp.login_as('00000000-0000-0000-0000-0000000000ad');
SELECT throws_ok(
    $$SELECT public.approve_rule_change(
        '40000000-0000-0000-0000-000000000002', NULL, true)$$,
    '55000', NULL,
    'E: an obsolete PENDING alert cannot be approved after its source revision moved on'
);

RESET ROLE;
SELECT ok(
    (SELECT days_deadline = 30 AND is_mandatory = false
       FROM public.corridor_task_rules
      WHERE id = '20000000-0000-0000-0000-000000000001'),
    'E: obsolete approval cannot change the live rule'
);

SELECT is(
    (SELECT status::text FROM public.rule_change_alerts
      WHERE id = '40000000-0000-0000-0000-000000000002'),
    'PENDING',
    'E: rejected obsolete approval leaves the alert PENDING for explicit review'
);

SELECT is(
    (SELECT last_content_hash FROM public.official_sources
      WHERE id = '30000000-0000-0000-0000-000000000001'),
    'bbb',
    'E: rejected obsolete approval leaves the locked source baseline untouched'
);

-- Simulate the worker advancing to the alert's revision. Once that revision is
-- current, the existing valid-approval path should remain unchanged.
UPDATE public.official_sources
SET last_content_hash = 'ccc'
WHERE id = '30000000-0000-0000-0000-000000000001';

SELECT pg_temp.login_as('00000000-0000-0000-0000-0000000000ad');
SELECT lives_ok(
    $$SELECT public.approve_rule_change(
        '40000000-0000-0000-0000-000000000002', NULL, true)$$,
    'E: approving with a NULL deadline is accepted'
);

RESET ROLE;
SELECT ok(
    (SELECT days_deadline IS NULL FROM public.corridor_task_rules
      WHERE id = '20000000-0000-0000-0000-000000000001'),
    'E: a NULL deadline round-trips as NULL (not 0)'
);

SELECT pg_temp.login_as('00000000-0000-0000-0000-0000000000ad');
SELECT throws_ok(
    $$SELECT public.approve_rule_change(
        '99999999-9999-9999-9999-999999999999', 10, true)$$,
    'P0001', NULL,
    'E: approving an unknown alert id raises'
);

SELECT throws_ok(
    $$SELECT public.approve_rule_change(
        '40000000-0000-0000-0000-000000000001', 45, true)$$,
    'P0001', NULL,
    'E: re-approving an already-APPROVED alert raises (007 status guard)'
);

RESET ROLE;
SELECT ok(
    (SELECT days_deadline IS NULL AND is_mandatory = true
       FROM public.corridor_task_rules
      WHERE id = '20000000-0000-0000-0000-000000000001'),
    'E: the live rule is untouched by the rejected re-approval'
);

-- ============================================================================
-- F. admin_list_users() / admin_get_user_detail()                    (10 tests)
-- ============================================================================
SELECT pg_temp.login_as('00000000-0000-0000-0000-00000000000a');

SELECT throws_ok(
    $$SELECT * FROM public.admin_list_users()$$,
    'P0001', NULL,
    'F: admin_list_users() refuses non-admins'
);

SELECT throws_ok(
    $$SELECT * FROM public.admin_list_users(10, 0)$$,
    'P0001', NULL,
    'F: paginated admin_list_users(limit, offset) also refuses non-admins'
);

SELECT throws_ok(
    $$SELECT public.admin_get_user_detail(
        '00000000-0000-0000-0000-00000000000a')$$,
    'P0001', NULL,
    'F: admin_get_user_detail() refuses non-admins (even for themselves)'
);

SELECT pg_temp.login_as('00000000-0000-0000-0000-0000000000ad');

SELECT is(
    (SELECT tasks_completed FROM public.admin_list_users()
      WHERE user_id = '00000000-0000-0000-0000-00000000000a'),
    1::bigint,
    'F: admin_list_users() reports user A''s completed count'
);

SELECT ok(
    (SELECT tasks_total >= 2 FROM public.admin_list_users()
      WHERE user_id = '00000000-0000-0000-0000-00000000000a'),
    'F: admin_list_users() counts the rules applicable to A''s corridor'
);

SELECT is(
    (SELECT public.admin_get_user_detail(
        '00000000-0000-0000-0000-00000000000a')->>'origin_prov'),
    'ON',
    'F: admin_get_user_detail() returns the user''s profile'
);

SELECT throws_ok(
    $$SELECT public.admin_get_user_detail(
        '99999999-9999-9999-9999-999999999999')$$,
    'P0001', NULL,
    'F: admin_get_user_detail() raises for an unknown user'
);

-- Server-side pagination (migration 021): LIMIT/OFFSET + windowed total_count.
SELECT is(
    (SELECT total_count FROM public.admin_list_users(1, 0) LIMIT 1),
    (SELECT count(*) FROM public.user_profiles),
    'F: admin_list_users() total_count equals the full profile count'
);

SELECT is(
    (SELECT count(*)::int FROM public.admin_list_users(200, 0)),
    (SELECT count(*)::int FROM public.user_profiles),
    'F: admin_list_users() with a large page returns every profile'
);

SELECT is(
    (SELECT count(*)::int FROM public.admin_list_users(200, 1)),
    greatest((SELECT count(*)::int FROM public.user_profiles) - 1, 0),
    'F: admin_list_users() OFFSET skips exactly one profile'
);

-- ============================================================================
-- G. support chat — ownership, privacy, timestamps, atomic finalize  (37 tests)
-- ============================================================================
SELECT pg_temp.login_as('00000000-0000-0000-0000-00000000000a');

SELECT lives_ok(
    $$INSERT INTO public.support_threads (user_id)
      VALUES ('00000000-0000-0000-0000-00000000000a')$$,
    'G: a user can open their own thread'
);

SELECT throws_ok(
    $$INSERT INTO public.support_threads (user_id)
      VALUES ('00000000-0000-0000-0000-00000000000b')$$,
    '42501', NULL,
    'G: opening a thread as another user is rejected'
);

SELECT throws_ok(
    $$INSERT INTO public.support_messages (thread_id, sender, body)
      VALUES ('50000000-0000-0000-0000-00000000000a', 'ai', 'I am the AI')$$,
    '42501', NULL,
    'G: a user cannot spoof an ''ai'' message'
);

SELECT throws_ok(
    $$INSERT INTO public.support_messages (thread_id, sender, body)
      VALUES ('50000000-0000-0000-0000-00000000000b', 'user',
              'What deadlines should I know about?')$$,
    '42501', NULL,
    'G: a user cannot post into someone else''s thread'
);

SELECT throws_ok(
    $$UPDATE public.support_threads SET status = 'HUMAN'
       WHERE id = '50000000-0000-0000-0000-00000000000a'$$,
    '42501', NULL,
    'G: a user cannot claim an admin is handling their thread (HUMAN)'
);

SELECT lives_ok(
    $$UPDATE public.support_threads SET status = 'AWAITING_HUMAN'
       WHERE id = '50000000-0000-0000-0000-00000000000a'$$,
    'G: a user can escalate their own thread'
);

SELECT pg_temp.login_as('00000000-0000-0000-0000-00000000000b');
SELECT is(
    (SELECT count(*)::int FROM public.support_threads
      WHERE id = '50000000-0000-0000-0000-00000000000a'),
    0,
    'G: another user cannot see A''s thread'
);

SELECT pg_temp.login_as('00000000-0000-0000-0000-0000000000ad');
SELECT is(
    (SELECT count(*)::int FROM public.support_threads),
    3,
    'G: an admin sees every thread'
);

SELECT lives_ok(
    $$INSERT INTO public.support_messages (thread_id, sender, body)
      VALUES ('50000000-0000-0000-0000-00000000000a', 'admin',
              'Hello from support')$$,
    'G: an admin can reply in any thread'
);

SELECT throws_ok(
    $$INSERT INTO public.support_messages (thread_id, sender, body)
      VALUES ('50000000-0000-0000-0000-00000000000a', 'user',
              'What deadlines should I know about?')$$,
    '42501', NULL,
    'G: an admin cannot forge a ''user'' message (007 sender pinning)'
);

SELECT throws_ok(
    $$INSERT INTO public.support_messages (thread_id, sender, body)
      VALUES ('50000000-0000-0000-0000-00000000000a', 'ai', 'forged reply')$$,
    '42501', NULL,
    'G: an admin cannot forge an ''ai'' message (007 sender pinning)'
);

SELECT pg_temp.login_as('00000000-0000-0000-0000-00000000000a');

SELECT throws_ok(
    $$INSERT INTO public.support_threads (user_id, status)
      VALUES ('00000000-0000-0000-0000-00000000000a', 'HUMAN')$$,
    '42501', NULL,
    'G: a user cannot open a thread already in HUMAN status (007)'
);

SELECT lives_ok(
    $$INSERT INTO public.support_threads (user_id, status)
      VALUES ('00000000-0000-0000-0000-00000000000a', 'AWAITING_HUMAN')$$,
    'G: a user can open a pre-escalated thread'
);

SELECT lives_ok(
    $$INSERT INTO public.support_messages (thread_id, sender, body)
      VALUES ('50000000-0000-0000-0000-00000000000a', 'user',
              'What deadlines should I know about?')$$,
    'G: an exact approved question inserts into the user''s escalated thread'
);

SELECT throws_ok(
    $$INSERT INTO public.support_messages (thread_id, sender, body)
      VALUES ('50000000-0000-0000-0000-00000000000a', 'user',
              'Can you check my application?')$$,
    '42501', NULL,
    'G: arbitrary user-authored support text is rejected by migration 010'
);

SELECT throws_ok(
    $$INSERT INTO public.support_messages (thread_id, sender, body)
      VALUES ('50000000-0000-0000-0000-00000000000a', 'user',
              'My health card number is 1234-567-890.')$$,
    '42501', NULL,
    'G: PII-like user-authored support text is rejected'
);

SELECT throws_ok(
    $$INSERT INTO public.support_messages (thread_id, sender, body)
      VALUES ('50000000-0000-0000-0000-00000000000a', 'user',
              'What deadlines should I know about? ')$$,
    '42501', NULL,
    'G: allowlist matching is exact and rejects appended whitespace'
);

RESET ROLE;
SELECT ok(
    (SELECT t.last_message_at >= clock_timestamp() - INTERVAL '1 minute'
       FROM public.support_threads t,
            public.support_messages m
      WHERE t.id = '50000000-0000-0000-0000-00000000000a'
        AND m.body = 'What deadlines should I know about?'),
    'G: the reply bumps last_message_at using current server time (008 trigger)'
);

SELECT pg_temp.login_as('00000000-0000-0000-0000-00000000000a');

-- Exercise the table CHECK as the owner; authenticated user input now reaches
-- the stricter migration-010 allowlist policy first.
RESET ROLE;
SELECT throws_ok(
    $$INSERT INTO public.support_messages (thread_id, sender, body)
      VALUES ('50000000-0000-0000-0000-00000000000a', 'user', repeat('x', 4001))$$,
    '23514', NULL,
    'G: a 4001-char message body violates the 007 length cap'
);
SELECT pg_temp.login_as('00000000-0000-0000-0000-00000000000a');

SELECT throws_ok(
    $$INSERT INTO public.support_threads (user_id, subject)
      VALUES ('00000000-0000-0000-0000-00000000000a', repeat('s', 201))$$,
    '42501', NULL,
    'G: a user cannot supply free-text support thread metadata (012)'
);

SELECT throws_ok(
    $$INSERT INTO public.support_messages (thread_id, sender, body, created_at)
      VALUES ('50000000-0000-0000-0000-00000000000a', 'user',
              'future pinned message', '2099-01-01T00:00:00Z')$$,
    '42501', NULL,
    'G: a user cannot supply support_messages.created_at (008 column grant)'
);

SELECT throws_ok(
    $$INSERT INTO public.support_threads (user_id, last_message_at)
      VALUES ('00000000-0000-0000-0000-00000000000a',
              '2099-01-01T00:00:00Z')$$,
    '42501', NULL,
    'G: a user cannot supply support_threads.last_message_at on insert'
);

SELECT throws_ok(
    $$UPDATE public.support_threads
       SET last_message_at = '2099-01-01T00:00:00Z'
       WHERE id = '50000000-0000-0000-0000-00000000000a'$$,
    '42501', NULL,
    'G: a user cannot pin the inbox by updating last_message_at'
);

SELECT throws_ok(
    $$SELECT public.persist_support_ai_reply(
        '50000000-0000-0000-0000-00000000000a',
        '60000000-0000-0000-0000-000000000001',
        'forged AI reply', false)$$,
    '42501', NULL,
    'G: authenticated clients cannot execute the service-only AI finalize RPC'
);

RESET ROLE;

-- A privileged insert with an intentionally false timestamp proves the BEFORE
-- trigger replaces NEW.created_at and records that same trusted server time on
-- the thread after acquiring the serialization lock.
INSERT INTO public.support_threads (id, user_id, subject)
VALUES ('50000000-0000-0000-0000-00000000000f',
        '00000000-0000-0000-0000-00000000000a', 'Timestamp trigger fixture');
INSERT INTO public.support_messages (id, thread_id, sender, body, created_at)
VALUES ('60000000-0000-0000-0000-00000000000f',
        '50000000-0000-0000-0000-00000000000f', 'user', 'future fixture',
        '2099-01-01T00:00:00Z');

SELECT ok(
    (SELECT m.created_at <> '2099-01-01T00:00:00Z'::timestamptz
            AND t.last_message_at = m.created_at
            AND m.created_at >= clock_timestamp() - INTERVAL '1 minute'
       FROM public.support_threads AS t
       JOIN public.support_messages AS m ON m.thread_id = t.id
      WHERE t.id = '50000000-0000-0000-0000-00000000000f'
        AND m.id = '60000000-0000-0000-0000-00000000000f'),
    'G: BEFORE trigger replaces a future timestamp with serialized server time'
);

-- Atomic-finalize fixtures. Sequential ids provide a deterministic tie-breaker
-- even if adjacent server timestamps have the same clock resolution.
INSERT INTO public.support_threads (id, user_id, subject, status)
VALUES
    ('50000000-0000-0000-0000-000000000010',
     '00000000-0000-0000-0000-00000000000a', 'Atomic success', 'AI'),
    ('50000000-0000-0000-0000-000000000011',
     '00000000-0000-0000-0000-00000000000a', 'Stale user turn', 'AI'),
    ('50000000-0000-0000-0000-000000000012',
     '00000000-0000-0000-0000-00000000000a', 'Human owned', 'AWAITING_HUMAN'),
    ('50000000-0000-0000-0000-000000000013',
     '00000000-0000-0000-0000-00000000000a', 'Admin history', 'AI'),
    ('50000000-0000-0000-0000-000000000014',
     '00000000-0000-0000-0000-00000000000a', 'Atomic escalation', 'AI');

INSERT INTO public.support_messages (id, thread_id, sender, body, created_at)
VALUES
    ('60000000-0000-0000-0000-000000000010',
     '50000000-0000-0000-0000-000000000010', 'user', 'Please answer',
     NOW() - INTERVAL '10 seconds'),
    ('60000000-0000-0000-0000-000000000011',
     '50000000-0000-0000-0000-000000000011', 'user', 'Older user turn',
     NOW() - INTERVAL '10 seconds'),
    ('60000000-0000-0000-0000-000000000012',
     '50000000-0000-0000-0000-000000000011', 'user', 'Newer user turn',
     NOW() - INTERVAL '5 seconds'),
    ('60000000-0000-0000-0000-000000000013',
     '50000000-0000-0000-0000-000000000012', 'user', 'Waiting for a human',
     NOW() - INTERVAL '5 seconds'),
    ('60000000-0000-0000-0000-000000000014',
     '50000000-0000-0000-0000-000000000013', 'admin', 'Prior human reply',
     NOW() - INTERVAL '10 seconds'),
    ('60000000-0000-0000-0000-000000000015',
     '50000000-0000-0000-0000-000000000013', 'user', 'Reopened question',
     NOW() - INTERVAL '5 seconds'),
    ('60000000-0000-0000-0000-000000000016',
     '50000000-0000-0000-0000-000000000014', 'user', 'Need a person',
     NOW() - INTERVAL '5 seconds');

SET LOCAL ROLE service_role;

SELECT is(
    public.persist_support_ai_reply(
        '50000000-0000-0000-0000-000000000010',
        '60000000-0000-0000-0000-000000000010',
        'Atomic reply', false),
    true,
    'G: atomic finalize persists a reply for the unchanged latest user turn'
);

RESET ROLE;

SELECT is(
    (SELECT count(*)::int FROM public.support_messages
      WHERE thread_id = '50000000-0000-0000-0000-000000000010'
        AND sender = 'ai' AND body = 'Atomic reply'),
    1,
    'G: successful atomic finalize inserts exactly the requested AI reply'
);

SET LOCAL ROLE service_role;

SELECT is(
    public.persist_support_ai_reply(
        '50000000-0000-0000-0000-000000000010',
        '60000000-0000-0000-0000-000000000010',
        'Duplicate reply', false),
    false,
    'G: replaying finalize for an already-answered user turn is skipped'
);

RESET ROLE;

SELECT is(
    (SELECT count(*)::int FROM public.support_messages
      WHERE thread_id = '50000000-0000-0000-0000-000000000010'
        AND sender = 'ai'),
    1,
    'G: a replay cannot persist a duplicate AI reply'
);

SET LOCAL ROLE service_role;

SELECT is(
    public.persist_support_ai_reply(
        '50000000-0000-0000-0000-000000000011',
        '60000000-0000-0000-0000-000000000011',
        'Stale reply', false),
    false,
    'G: finalize skips when a newer user message replaced the expected turn'
);

RESET ROLE;

SELECT is(
    (SELECT count(*)::int FROM public.support_messages
      WHERE thread_id = '50000000-0000-0000-0000-000000000011'
        AND sender = 'ai'),
    0,
    'G: stale-turn finalization inserts no AI message'
);

SET LOCAL ROLE service_role;

SELECT is(
    public.persist_support_ai_reply(
        '50000000-0000-0000-0000-000000000012',
        '60000000-0000-0000-0000-000000000013',
        'Late AI reply', false),
    false,
    'G: finalize skips after the thread leaves AI ownership'
);

RESET ROLE;

SELECT is(
    (SELECT count(*)::int FROM public.support_messages
      WHERE thread_id = '50000000-0000-0000-0000-000000000012'
        AND sender = 'ai'),
    0,
    'G: a human-owned thread receives no late AI message'
);

SET LOCAL ROLE service_role;

SELECT is(
    public.persist_support_ai_reply(
        '50000000-0000-0000-0000-000000000013',
        '60000000-0000-0000-0000-000000000015',
        'Unsafe reopened reply', false),
    false,
    'G: finalize skips an AI-status thread with any prior admin participation'
);

RESET ROLE;

SELECT is(
    (SELECT count(*)::int FROM public.support_messages
      WHERE thread_id = '50000000-0000-0000-0000-000000000013'
        AND sender = 'ai'),
    0,
    'G: a reopened human transcript receives no AI reply'
);

SET LOCAL ROLE service_role;

SELECT is(
    public.persist_support_ai_reply(
        '50000000-0000-0000-0000-000000000014',
        '60000000-0000-0000-0000-000000000016',
        'Handing off now', true),
    true,
    'G: atomic finalize can persist an escalating AI reply'
);

RESET ROLE;

SELECT is(
    (SELECT status::text FROM public.support_threads
      WHERE id = '50000000-0000-0000-0000-000000000014'),
    'AWAITING_HUMAN',
    'G: escalating finalize atomically moves the thread to AWAITING_HUMAN'
);

-- ============================================================================
-- H. delete_current_user() — PIPEDA erasure cascade                   (5 tests)
-- ============================================================================
SELECT pg_temp.login_as(NULL);

SELECT throws_ok(
    $$SELECT public.delete_current_user()$$,
    'P0001', NULL,
    'H: delete_current_user() requires an authenticated caller'
);

SELECT pg_temp.login_as('00000000-0000-0000-0000-00000000000b');

SELECT lives_ok(
    $$SELECT public.delete_current_user()$$,
    'H: a user can delete their own account'
);

RESET ROLE;
SELECT is(
    (SELECT count(*)::int FROM auth.users
      WHERE id = '00000000-0000-0000-0000-00000000000b'),
    0,
    'H: the auth.users row is gone'
);

SELECT is(
    (SELECT count(*)::int FROM public.user_profiles
      WHERE id = '00000000-0000-0000-0000-00000000000b'),
    0,
    'H: the profile cascaded away'
);

SELECT is(
    (SELECT count(*)::int FROM public.user_task_progress
      WHERE user_id = '00000000-0000-0000-0000-00000000000b'),
    0,
    'H: progress rows cascaded away'
);

-- ============================================================================
-- I. join_waitlist() throttle + admin read (007)                      (4 tests)
-- ============================================================================
RESET ROLE;
SELECT set_config('request.headers',
    json_build_object('x-forwarded-for', '203.0.113.7')::text, true);

SELECT pg_temp.login_anon();

SELECT lives_ok(
    $$SELECT public.join_waitlist('throttle-' || i || '@example.com')
        FROM generate_series(1, 6) AS i$$,
    'I: six rapid signups from one IP all report success (enumeration-safe)'
);

RESET ROLE;
SELECT is(
    (SELECT count(*)::int FROM public.waitlist
      WHERE email LIKE 'throttle-%@example.com'),
    5,
    'I: the sixth signup was silently dropped by the per-IP throttle'
);

SELECT pg_temp.login_as('00000000-0000-0000-0000-0000000000ad');
SELECT ok(
    (SELECT count(*) >= 1 FROM public.waitlist),
    'I: an admin can read waitlist signups (007 policy)'
);

SELECT pg_temp.login_as('00000000-0000-0000-0000-00000000000a');
SELECT is(
    (SELECT count(*)::int FROM public.waitlist),
    0,
    'I: a non-admin user still cannot read the waitlist'
);

-- ============================================================================
-- J. shared service_role support-path ACLs (migrations 010, 015)       (7 tests)
-- ============================================================================
RESET ROLE;

SELECT ok(
    has_schema_privilege('service_role', 'public', 'USAGE'),
    'J: the shared service_role can resolve objects in public'
);

SELECT ok(
    (SELECT bool_and(has_column_privilege(
        'service_role', required.table_name, required.column_name, 'SELECT'))
       FROM (VALUES
          ('public.support_threads', 'id'),
          ('public.support_threads', 'user_id'),
          ('public.support_threads', 'status'),
          ('public.support_threads', 'human_takeover_at'),
          ('public.support_messages', 'id'),
          ('public.support_messages', 'thread_id'),
          ('public.support_messages', 'sender'),
          ('public.support_messages', 'body'),
          ('public.support_messages', 'created_at'),
          ('public.user_profiles', 'id'),
          ('public.user_profiles', 'origin_prov'),
          ('public.user_profiles', 'dest_prov'),
          ('public.user_profiles', 'move_date'),
          ('public.user_profiles', 'has_vehicle'),
          ('public.user_profiles', 'has_dependents'),
          ('public.corridor_task_rules', 'id'),
          ('public.corridor_task_rules', 'task_id'),
          ('public.corridor_task_rules', 'origin_province'),
          ('public.corridor_task_rules', 'dest_province'),
          ('public.corridor_task_rules', 'days_deadline'),
          ('public.corridor_task_rules', 'is_mandatory'),
          ('public.global_tasks', 'id'),
          ('public.global_tasks', 'title_en'),
          ('public.global_tasks', 'base_description_en'),
          ('public.global_tasks', 'requires_vehicle'),
          ('public.global_tasks', 'requires_dependents')
       ) AS required(table_name, column_name)),
    'J: the shared role can read every column required by the support path'
);

SELECT ok(
    (SELECT bool_and(
        has_column_privilege(
            'service_role', 'public.support_threads', column_name, 'UPDATE')
        = (column_name = 'status'))
     FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = 'support_threads'),
    'J: the shared role may update only the support status field'
);

SELECT ok(
    has_function_privilege(
        'service_role',
        'public.persist_support_ai_reply(uuid,uuid,text,boolean)',
        'EXECUTE')
    AND NOT has_any_column_privilege(
        'service_role', 'public.support_messages', 'INSERT'),
    'J: AI replies use the finalize RPC, not direct service-role inserts'
);

SELECT ok(
    NOT has_any_column_privilege(
        'service_role', 'public.support_threads', 'INSERT')
    AND NOT has_table_privilege(
        'service_role', 'public.support_threads', 'DELETE')
    AND NOT has_any_column_privilege(
        'service_role', 'public.support_messages', 'INSERT')
    AND NOT has_any_column_privilege(
        'service_role', 'public.support_messages', 'UPDATE')
    AND NOT has_table_privilege(
        'service_role', 'public.support_messages', 'DELETE'),
    'J: the shared role cannot create/delete threads or write transcripts directly'
);

SELECT ok(
    (SELECT bool_and(
        NOT has_any_column_privilege(
            'service_role', table_name, 'INSERT')
        AND NOT has_any_column_privilege(
            'service_role', table_name, 'UPDATE')
        AND NOT has_table_privilege(
            'service_role', table_name, 'DELETE'))
     FROM (VALUES
         ('public.user_profiles'),
         ('public.corridor_task_rules'),
         ('public.global_tasks')
     ) AS tables(table_name)),
    'J: support grounding tables are read-only for the shared role'
);

SELECT ok(
    (SELECT bool_and(
        has_column_privilege(
            'service_role',
            format('%I.%I', table_schema, table_name),
            column_name,
            'SELECT'
        ) = CASE table_name
            WHEN 'support_threads' THEN column_name = ANY (ARRAY[
                'id', 'user_id', 'status', 'human_takeover_at'
            ])
            WHEN 'support_messages' THEN column_name = ANY (ARRAY[
                'id', 'thread_id', 'sender', 'body', 'created_at'
            ])
            WHEN 'user_profiles' THEN column_name = ANY (ARRAY[
                'id', 'origin_prov', 'dest_prov', 'move_date',
                'has_vehicle', 'has_dependents'
            ])
            WHEN 'corridor_task_rules' THEN column_name = ANY (ARRAY[
                'id', 'task_id', 'origin_province', 'dest_province',
                'days_deadline', 'is_mandatory'
            ])
            WHEN 'global_tasks' THEN column_name = ANY (ARRAY[
                'id', 'title_en', 'base_description_en',
                'requires_vehicle', 'requires_dependents'
            ])
            ELSE FALSE
        END)
     FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name IN (
           'support_threads',
           'support_messages',
           'user_profiles',
           'corridor_task_rules',
           'global_tasks'
       )),
    'J: the shared role cannot read columns outside support-path needs'
);

-- ============================================================================
-- K. shared service_role worker-path ACLs + atomic persistence (011)
--                                                                    (28 tests)
-- ============================================================================
RESET ROLE;

SELECT ok(
    has_function_privilege(
        'service_role',
        'public.persist_official_source_scrape(uuid,text,text,text,text)',
        'EXECUTE')
    AND NOT has_function_privilege(
        'anon',
        'public.persist_official_source_scrape(uuid,text,text,text,text)',
        'EXECUTE')
    AND NOT has_function_privilege(
        'authenticated',
        'public.persist_official_source_scrape(uuid,text,text,text,text)',
        'EXECUTE'),
    'K: only service_role can execute the scrape persistence RPC'
);

SELECT ok(
    (SELECT bool_and(has_column_privilege(
        'service_role', 'public.official_sources', required.column_name, 'SELECT'))
       FROM (VALUES
          ('id'),
          ('agency_name'),
          ('official_url'),
          ('last_content_hash'),
          ('last_content_text')
       ) AS required(column_name)),
    'K: worker can select every official-source column it requires'
);

SELECT ok(
    NOT has_column_privilege(
        'service_role', 'public.official_sources', 'corridor_rule_id', 'SELECT')
    AND NOT has_column_privilege(
        'service_role', 'public.official_sources', 'last_verified', 'SELECT')
    AND NOT has_table_privilege(
        'service_role', 'public.official_sources', 'INSERT')
    AND NOT has_table_privilege(
        'service_role', 'public.official_sources', 'UPDATE')
    AND NOT has_table_privilege(
        'service_role', 'public.official_sources', 'DELETE'),
    'K: worker cannot read unneeded source columns or write baselines directly'
);

SELECT ok(
    NOT has_table_privilege(
        'service_role', 'public.rule_change_alerts', 'SELECT')
    AND NOT has_table_privilege(
        'service_role', 'public.rule_change_alerts', 'INSERT')
    AND NOT has_table_privilege(
        'service_role', 'public.rule_change_alerts', 'UPDATE')
    AND NOT has_table_privilege(
        'service_role', 'public.rule_change_alerts', 'DELETE'),
    'K: worker has no direct rule-change-alert table privileges'
);

SELECT pg_temp.login_as('00000000-0000-0000-0000-0000000000ad');
SELECT throws_ok(
    $$SELECT * FROM public.persist_official_source_scrape(
        '30000000-0000-0000-0000-000000000001',
        NULL,
        '141c9b53a7fe331587ba2e9a0d7b8eb57e6a024068f30e89790fb4b7d8f094ce',
        repeat('baseline content ', 20),
        NULL)$$,
    '42501', NULL,
    'K: authenticated admins cannot invoke the worker RPC'
);

RESET ROLE;
SET LOCAL ROLE service_role;
SELECT throws_ok(
    $$UPDATE public.official_sources
         SET last_content_hash = repeat('a', 64)
       WHERE id = '30000000-0000-0000-0000-000000000001'$$,
    '42501', NULL,
    'K: service_role cannot update an official-source baseline directly'
);

SELECT throws_ok(
    $$INSERT INTO public.rule_change_alerts (
          official_source_id, old_hash, new_hash, status)
      VALUES (
          '30000000-0000-0000-0000-000000000001', 'x', 'y', 'PENDING')$$,
    '42501', NULL,
    'K: service_role cannot insert a rule-change alert directly'
);

RESET ROLE;
INSERT INTO public.official_sources (
    id, corridor_rule_id, agency_name, official_url)
VALUES (
    '30000000-0000-0000-0000-000000000011',
    '20000000-0000-0000-0000-000000000001',
    'Atomic Worker Test Agency',
    'https://example.gc.ca/atomic-worker-test'
);

SET LOCAL ROLE service_role;
SELECT ok(
    (SELECT classification = 'BASELINE'
            AND alert_id IS NULL
            AND current_hash =
                '141c9b53a7fe331587ba2e9a0d7b8eb57e6a024068f30e89790fb4b7d8f094ce'
       FROM public.persist_official_source_scrape(
          '30000000-0000-0000-0000-000000000011',
          NULL,
          '141c9b53a7fe331587ba2e9a0d7b8eb57e6a024068f30e89790fb4b7d8f094ce',
          repeat('baseline content ', 20),
          NULL)),
    'K: first scrape returns BASELINE without an alert'
);

RESET ROLE;
SELECT ok(
    (SELECT last_content_hash =
                '141c9b53a7fe331587ba2e9a0d7b8eb57e6a024068f30e89790fb4b7d8f094ce'
            AND last_content_text = repeat('baseline content ', 20)
            AND last_verified IS NOT NULL
       FROM public.official_sources
      WHERE id = '30000000-0000-0000-0000-000000000011'),
    'K: BASELINE atomically persists hash, body, and verification time'
);

SELECT is(
    (SELECT count(*)::int FROM public.rule_change_alerts
      WHERE official_source_id = '30000000-0000-0000-0000-000000000011'),
    0,
    'K: BASELINE creates no alert'
);

SET LOCAL ROLE service_role;
SELECT is(
    (SELECT classification
       FROM public.persist_official_source_scrape(
          '30000000-0000-0000-0000-000000000011',
          '141c9b53a7fe331587ba2e9a0d7b8eb57e6a024068f30e89790fb4b7d8f094ce',
          '141c9b53a7fe331587ba2e9a0d7b8eb57e6a024068f30e89790fb4b7d8f094ce',
          repeat('baseline content ', 20),
          'must be ignored')),
    'UNCHANGED',
    'K: equal expected/new hashes return UNCHANGED'
);

RESET ROLE;
SELECT is(
    (SELECT count(*)::int FROM public.rule_change_alerts
      WHERE official_source_id = '30000000-0000-0000-0000-000000000011'),
    0,
    'K: UNCHANGED creates no alert even when a caller supplies a diff'
);

SET LOCAL ROLE service_role;
SELECT ok(
    (SELECT classification = 'CHANGED'
            AND alert_id IS NOT NULL
            AND current_hash =
                'ab58df3d39e3bc802dc7e2261f6114f684873c40d5a9b38dc82964db5c70229a'
       FROM public.persist_official_source_scrape(
          '30000000-0000-0000-0000-000000000011',
          '141c9b53a7fe331587ba2e9a0d7b8eb57e6a024068f30e89790fb4b7d8f094ce',
          'ab58df3d39e3bc802dc7e2261f6114f684873c40d5a9b38dc82964db5c70229a',
          repeat('changed content ', 20),
          '-baseline\n+changed')),
    'K: a true hash transition returns CHANGED with its alert id'
);

RESET ROLE;
SELECT ok(
    (SELECT last_content_hash =
                'ab58df3d39e3bc802dc7e2261f6114f684873c40d5a9b38dc82964db5c70229a'
            AND last_content_text = repeat('changed content ', 20)
       FROM public.official_sources
      WHERE id = '30000000-0000-0000-0000-000000000011'),
    'K: CHANGED atomically advances the baseline'
);

SELECT is(
    (SELECT count(*)::int FROM public.rule_change_alerts
      WHERE official_source_id = '30000000-0000-0000-0000-000000000011'
        AND old_hash =
            '141c9b53a7fe331587ba2e9a0d7b8eb57e6a024068f30e89790fb4b7d8f094ce'
        AND new_hash =
            'ab58df3d39e3bc802dc7e2261f6114f684873c40d5a9b38dc82964db5c70229a'
        AND diff_summary = '-baseline\n+changed'
        AND status = 'PENDING'),
    1,
    'K: CHANGED creates exactly one consistent PENDING alert'
);

SET LOCAL ROLE service_role;
SELECT ok(
    (SELECT classification = 'STALE'
            AND alert_id IS NULL
            AND current_hash =
                'ab58df3d39e3bc802dc7e2261f6114f684873c40d5a9b38dc82964db5c70229a'
       FROM public.persist_official_source_scrape(
          '30000000-0000-0000-0000-000000000011',
          '141c9b53a7fe331587ba2e9a0d7b8eb57e6a024068f30e89790fb4b7d8f094ce',
          '8d33bd897fb8b682e69f2981f50c1dea2fd0f272c51988769560229c053b89cc',
          repeat('stale content ', 20),
          'inconsistent stale diff')),
    'K: stale expected hash returns STALE and the locked current hash'
);

RESET ROLE;
SELECT ok(
    (SELECT last_content_hash =
                'ab58df3d39e3bc802dc7e2261f6114f684873c40d5a9b38dc82964db5c70229a'
            AND last_content_text = repeat('changed content ', 20)
       FROM public.official_sources
      WHERE id = '30000000-0000-0000-0000-000000000011'),
    'K: STALE cannot regress or overwrite the current baseline'
);

SELECT ok(
    (SELECT count(*) = 1
            AND count(*) FILTER (
                WHERE new_hash =
                    '8d33bd897fb8b682e69f2981f50c1dea2fd0f272c51988769560229c053b89cc'
                   OR diff_summary = 'inconsistent stale diff') = 0
       FROM public.rule_change_alerts
      WHERE official_source_id = '30000000-0000-0000-0000-000000000011'),
    'K: STALE creates neither an alert nor an inconsistent diff'
);

SET LOCAL ROLE service_role;
SELECT throws_ok(
    $$SELECT * FROM public.persist_official_source_scrape(
        '30000000-0000-0000-0000-000000000011',
        'not-a-sha256',
        'ab58df3d39e3bc802dc7e2261f6114f684873c40d5a9b38dc82964db5c70229a',
        repeat('changed content ', 20),
        NULL)$$,
    '22023', NULL,
    'K: malformed expected hashes are rejected'
);

SELECT throws_ok(
    $$SELECT * FROM public.persist_official_source_scrape(
        '30000000-0000-0000-0000-000000000011',
        'ab58df3d39e3bc802dc7e2261f6114f684873c40d5a9b38dc82964db5c70229a',
        repeat('a', 64),
        repeat('changed content ', 20),
        NULL)$$,
    '22023', NULL,
    'K: a supplied new hash must match the supplied content'
);

RESET ROLE;
SELECT ok(
    (SELECT last_content_hash =
                'ab58df3d39e3bc802dc7e2261f6114f684873c40d5a9b38dc82964db5c70229a'
       FROM public.official_sources
      WHERE id = '30000000-0000-0000-0000-000000000011')
    AND (SELECT count(*) = 1 FROM public.rule_change_alerts
          WHERE official_source_id = '30000000-0000-0000-0000-000000000011'),
    'K: rejected hash inputs leave both baseline and alerts unchanged'
);

SET LOCAL ROLE service_role;
SELECT throws_ok(
    $$SELECT * FROM public.persist_official_source_scrape(
        '30000000-0000-0000-0000-000000000011',
        'ab58df3d39e3bc802dc7e2261f6114f684873c40d5a9b38dc82964db5c70229a',
        repeat('a', 64),
        repeat('x', 1000001),
        NULL)$$,
    '22023', NULL,
    'K: oversized content is rejected by the database hard ceiling'
);

SELECT throws_ok(
    $$SELECT * FROM public.persist_official_source_scrape(
        '99999999-9999-9999-9999-999999999999',
        NULL,
        '141c9b53a7fe331587ba2e9a0d7b8eb57e6a024068f30e89790fb4b7d8f094ce',
        repeat('baseline content ', 20),
        NULL)$$,
    'P0002', NULL,
    'K: unknown official-source ids raise without side effects'
);

RESET ROLE;
UPDATE public.official_sources
SET last_content_text = 'corrupt stored content'
WHERE id = '30000000-0000-0000-0000-000000000011';

SET LOCAL ROLE service_role;
SELECT throws_ok(
    $$SELECT * FROM public.persist_official_source_scrape(
        '30000000-0000-0000-0000-000000000011',
        'ab58df3d39e3bc802dc7e2261f6114f684873c40d5a9b38dc82964db5c70229a',
        'ab58df3d39e3bc802dc7e2261f6114f684873c40d5a9b38dc82964db5c70229a',
        repeat('changed content ', 20),
        NULL)$$,
    '22000', NULL,
    'K: a broken stored hash/body invariant is rejected before classification'
);

RESET ROLE;
SELECT is(
    (SELECT count(*)::int FROM public.rule_change_alerts
      WHERE official_source_id = '30000000-0000-0000-0000-000000000011'),
    1,
    'K: invariant failure creates no alert'
);

UPDATE public.official_sources
SET last_content_text = repeat('changed content ', 20)
WHERE id = '30000000-0000-0000-0000-000000000011';

ALTER TABLE public.official_sources
    ADD CONSTRAINT pgtap_reject_atomic_worker_body
    CHECK (last_content_text <> 'atomic failure content');

SET LOCAL ROLE service_role;
SELECT throws_ok(
    $$SELECT * FROM public.persist_official_source_scrape(
        '30000000-0000-0000-0000-000000000011',
        'ab58df3d39e3bc802dc7e2261f6114f684873c40d5a9b38dc82964db5c70229a',
        '76616daeb38afed83581fc37533aff2e0ecb53852176f3c8bc6ae9649884117d',
        'atomic failure content',
        '-changed\n+blocked')$$,
    '23514', NULL,
    'K: a baseline-write failure aborts the atomic RPC'
);

RESET ROLE;
SELECT ok(
    (SELECT last_content_hash =
                'ab58df3d39e3bc802dc7e2261f6114f684873c40d5a9b38dc82964db5c70229a'
            AND last_content_text = repeat('changed content ', 20)
       FROM public.official_sources
      WHERE id = '30000000-0000-0000-0000-000000000011'),
    'K: failed atomic RPC rolls the baseline back'
);

SELECT is(
    (SELECT count(*)::int FROM public.rule_change_alerts
      WHERE official_source_id = '30000000-0000-0000-0000-000000000011'
        AND new_hash =
            '76616daeb38afed83581fc37533aff2e0ecb53852176f3c8bc6ae9649884117d'),
    0,
    'K: failed atomic RPC rolls the inserted alert back'
);

ALTER TABLE public.official_sources
    DROP CONSTRAINT pgtap_reject_atomic_worker_body;

-- ============================================================================
-- L. support-thread metadata privacy (migration 012)                  (2 tests)
-- ============================================================================
RESET ROLE;

SELECT ok(
    NOT has_column_privilege(
        'authenticated', 'public.support_threads', 'subject', 'INSERT')
    AND NOT has_column_privilege(
        'authenticated', 'public.support_threads', 'subject', 'UPDATE')
    AND NOT has_column_privilege(
        'authenticated', 'public.support_threads', 'human_takeover_at', 'INSERT')
    AND NOT has_column_privilege(
        'authenticated', 'public.support_threads', 'human_takeover_at', 'UPDATE'),
    'L: clients cannot write support subject text or the takeover marker'
);

SELECT ok(
    has_column_privilege(
        'authenticated', 'public.support_threads', 'user_id', 'INSERT')
    AND has_column_privilege(
        'authenticated', 'public.support_threads', 'status', 'INSERT')
    AND has_column_privilege(
        'authenticated', 'public.support_threads', 'status', 'UPDATE'),
    'L: clients retain only the thread columns required by fixed-question support'
);

-- ============================================================================
-- M. persistent support human-takeover marker (migration 014)         (7 tests)
-- ============================================================================
RESET ROLE;

INSERT INTO public.support_threads (id, user_id, subject, status)
VALUES
    ('50000000-0000-0000-0000-000000000020',
     '00000000-0000-0000-0000-00000000000a', 'No-message takeover', 'AI'),
    ('50000000-0000-0000-0000-000000000021',
     '00000000-0000-0000-0000-00000000000a', 'Admin-message marker', 'AI'),
    ('50000000-0000-0000-0000-000000000022',
     '00000000-0000-0000-0000-00000000000a', 'User-only resolve', 'AI');

INSERT INTO public.support_messages (id, thread_id, sender, body)
VALUES
    ('60000000-0000-0000-0000-000000000020',
     '50000000-0000-0000-0000-000000000020', 'user',
     'What deadlines should I know about?'),
    ('60000000-0000-0000-0000-000000000021',
     '50000000-0000-0000-0000-000000000021', 'user',
     'Which documents should I prepare?');

SELECT pg_temp.login_as('00000000-0000-0000-0000-0000000000ad');
UPDATE public.support_threads
SET status = 'HUMAN'
WHERE id = '50000000-0000-0000-0000-000000000020';

RESET ROLE;
SELECT ok(
    (SELECT human_takeover_at IS NOT NULL
       FROM public.support_threads
      WHERE id = '50000000-0000-0000-0000-000000000020'),
    'M: entering HUMAN stamps the durable marker without an admin message'
);

CREATE TEMP TABLE takeover_marker_snapshot (value TIMESTAMPTZ) ON COMMIT DROP;
INSERT INTO takeover_marker_snapshot (value)
SELECT human_takeover_at
FROM public.support_threads
WHERE id = '50000000-0000-0000-0000-000000000020';

SELECT pg_temp.login_as('00000000-0000-0000-0000-0000000000ad');
SELECT throws_ok(
    $$UPDATE public.support_threads
         SET human_takeover_at = NULL
       WHERE id = '50000000-0000-0000-0000-000000000020'$$,
    '42501', NULL,
    'M: an authenticated admin cannot explicitly clear the server marker'
);

UPDATE public.support_threads
SET status = 'RESOLVED'
WHERE id = '50000000-0000-0000-0000-000000000020';

RESET ROLE;
SELECT pg_temp.login_as('00000000-0000-0000-0000-00000000000a');
UPDATE public.support_threads
SET status = 'AI'
WHERE id = '50000000-0000-0000-0000-000000000020';

RESET ROLE;
SELECT is(
    (SELECT human_takeover_at
       FROM public.support_threads
      WHERE id = '50000000-0000-0000-0000-000000000020'),
    (SELECT value FROM takeover_marker_snapshot),
    'M: resolving and reopening preserves the original takeover timestamp'
);

SET LOCAL ROLE service_role;
SELECT is(
    public.persist_support_ai_reply(
        '50000000-0000-0000-0000-000000000020',
        '60000000-0000-0000-0000-000000000020',
        'Unsafe reply after no-message takeover', false),
    false,
    'M: atomic finalize rejects a reopened marker thread with no admin message'
);

RESET ROLE;
SELECT is(
    (SELECT count(*)::int
       FROM public.support_messages
      WHERE thread_id = '50000000-0000-0000-0000-000000000020'
        AND sender = 'ai'),
    0,
    'M: rejected no-message takeover finalization stores no AI reply'
);

SELECT pg_temp.login_as('00000000-0000-0000-0000-0000000000ad');
INSERT INTO public.support_messages (thread_id, sender, body)
VALUES ('50000000-0000-0000-0000-000000000021', 'admin',
        'A human has joined this thread.');

RESET ROLE;
SELECT ok(
    (SELECT human_takeover_at IS NOT NULL AND status = 'AI'
       FROM public.support_threads
      WHERE id = '50000000-0000-0000-0000-000000000021'),
    'M: an admin message stamps the marker even before any status update'
);

SELECT pg_temp.login_as('00000000-0000-0000-0000-00000000000a');
UPDATE public.support_threads
SET status = 'RESOLVED'
WHERE id = '50000000-0000-0000-0000-000000000022';
UPDATE public.support_threads
SET status = 'AI'
WHERE id = '50000000-0000-0000-0000-000000000022';

RESET ROLE;
SELECT ok(
    (SELECT human_takeover_at IS NULL AND status = 'AI'
       FROM public.support_threads
      WHERE id = '50000000-0000-0000-0000-000000000022'),
    'M: a future user-only resolve and reopen remains AI-eligible'
);

-- ============================================================================
-- N. hosted performance parity (016)                                  (1 test)
-- ============================================================================

SELECT ok(
    EXISTS (
        SELECT 1
        FROM pg_catalog.pg_indexes
        WHERE schemaname = 'public'
          AND tablename = 'support_threads'
          AND indexname = 'idx_support_threads_user_last_message'
          AND indexdef LIKE '%(user_id, last_message_at DESC)%'
    ),
    'N: user support inbox queries have a covering recency index'
);

-- ============================================================================
-- O. legal-policy re-consent integrity (019)                         (17 tests)
-- ============================================================================

SELECT ok(
    has_function_privilege(
        'authenticated', 'public.accept_current_policies()', 'EXECUTE')
    AND has_function_privilege(
        'authenticated', 'public.get_policy_consent_state()', 'EXECUTE')
    AND has_function_privilege(
        'authenticated', 'public.has_current_policy_consent()', 'EXECUTE')
    AND NOT has_function_privilege(
        'anon', 'public.accept_current_policies()', 'EXECUTE')
    AND NOT has_function_privilege(
        'authenticated',
        'public.enforce_user_profile_consent_integrity()', 'EXECUTE'),
    'O: re-consent is authenticated-only and the trigger helper is not callable'
);

SELECT pg_temp.login_anon();
SELECT throws_ok(
    $$SELECT public.accept_current_policies()$$,
    '42501', NULL,
    'O: an anonymous caller cannot record policy acceptance'
);

RESET ROLE;
CREATE TEMP TABLE consent_timestamp_snapshot AS
SELECT id, consent_timestamp
FROM public.user_profiles
WHERE id IN (
    '00000000-0000-0000-0000-00000000000a',
    '00000000-0000-0000-0000-00000000000b'
);

SELECT pg_temp.login_as('00000000-0000-0000-0000-00000000000a');
SELECT throws_ok(
    $$UPDATE public.user_profiles
         SET consent_version = 'future-unpublished-version'
       WHERE id = '00000000-0000-0000-0000-00000000000a'$$,
    '23514', NULL,
    'O: a user cannot attest to an unsupported policy version'
);

SELECT lives_ok(
    $$UPDATE public.user_profiles
         SET consent_timestamp = '2000-01-01T00:00:00Z'
       WHERE id = '00000000-0000-0000-0000-00000000000a'$$,
    'O: a timestamp spoof is replaced rather than persisted'
);

SELECT is(
    public.accept_current_policies(),
    '1.1',
    'O: a user can accept exactly the server-current policy version'
);

RESET ROLE;
SELECT isnt(
    (SELECT consent_timestamp::text
       FROM public.user_profiles
      WHERE id = '00000000-0000-0000-0000-00000000000a'),
    '2000-01-01 00:00:00+00',
    'O: the client-chosen acceptance timestamp is not stored'
);

SELECT ok(
    (SELECT p.consent_timestamp >= s.consent_timestamp
       FROM public.user_profiles p
       JOIN consent_timestamp_snapshot s USING (id)
      WHERE p.id = '00000000-0000-0000-0000-00000000000a'),
    'O: re-consent cannot backdate the server-authored acceptance timestamp'
);

SELECT is(
    (SELECT p.consent_timestamp
       FROM public.user_profiles p
      WHERE p.id = '00000000-0000-0000-0000-00000000000b'),
    (SELECT s.consent_timestamp
       FROM consent_timestamp_snapshot s
      WHERE s.id = '00000000-0000-0000-0000-00000000000b'),
    'O: accepting policies cannot change another user''s consent record'
);

SELECT is(
    public.current_policy_version(),
    '1.1',
    'O: the server exposes one current policy version to all consent gates'
);

-- Simulate a future policy release without changing any client code. Existing
-- 1.1 profiles must lose normal app access, while the state/accept/delete RPCs
-- remain available so an upgraded client can re-consent or erase the account.
RESET ROLE;
CREATE OR REPLACE FUNCTION public.current_policy_version()
RETURNS TEXT
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
    SELECT '2.0'::TEXT
$$;

SELECT pg_temp.login_as('00000000-0000-0000-0000-00000000000a');

SELECT is(
    public.get_policy_consent_state(),
    jsonb_build_object(
        'has_profile', true,
        'accepted_version', '1.1',
        'current_version', '2.0',
        'has_current_consent', false
    ),
    'O: an upgraded client can detect a stale profile and the server-current version'
);

SELECT is(
    (SELECT count(*)::int FROM public.user_profiles),
    0,
    'O: a stale client cannot read its profile through the normal table API'
);

SELECT is(
    (SELECT count(*)::int FROM public.user_task_progress),
    0,
    'O: stale consent blocks checklist-progress access'
);

SELECT is(
    (SELECT count(*)::int FROM public.support_threads),
    0,
    'O: stale consent blocks support-thread access'
);

SELECT throws_ok(
    $$INSERT INTO public.support_threads (user_id, status)
      VALUES ('00000000-0000-0000-0000-00000000000a', 'AI')$$,
    '42501', NULL,
    'O: a stale client cannot create a support thread'
);

SELECT is(
    public.accept_current_policies(),
    '2.0',
    'O: re-consent records the server-current future version'
);

SELECT ok(
    (SELECT count(*) = 1 AND bool_and(consent_version = '2.0')
       FROM public.user_profiles),
    'O: accepting the future version restores profile access'
);

SELECT pg_temp.login_as('00000000-0000-0000-0000-00000000000b');
SELECT lives_ok(
    $$SELECT public.delete_current_user()$$,
    'O: a stale user can still permanently delete the account without accepting'
);

SELECT * FROM finish();
ROLLBACK;

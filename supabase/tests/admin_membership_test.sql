-- Admin authority must come from explicit server-managed membership, never
-- signup email, Auth auto-confirmation, or user-editable metadata.
BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;
SELECT plan(14);

SELECT is(
    (SELECT count(*)::int FROM pg_trigger WHERE tgname = 'trg_admin_bootstrap'),
    0,
    'Admin signup bootstrap trigger is retired'
);
SELECT ok(
    to_regprocedure('public.handle_admin_bootstrap()') IS NULL,
    'Retired bootstrap function cannot be invoked or reattached'
);

-- SSO fixtures let these assertions coexist with a real local admin using the
-- same address. The retired trigger granted either kind of identity equally.
INSERT INTO auth.users (id, email, email_confirmed_at, is_sso_user, is_anonymous)
VALUES
    ('a0280000-0000-0000-0000-000000000001', 'admin@relogo.ca', NULL, true, false),
    ('a0280000-0000-0000-0000-000000000002', 'admin@relogo.app', NOW(), true, false),
    ('a0280000-0000-0000-0000-000000000003', 'admin@relogo.ca', NOW(), true, true),
    ('a0280000-0000-0000-0000-000000000004', 'ordinary@test.invalid', NOW(), false, false);

SELECT is(
    (SELECT count(*)::int FROM public.admin_users
     WHERE user_id = 'a0280000-0000-0000-0000-000000000001'),
    0, 'An unconfirmed bootstrap email cannot gain admin membership'
);
SELECT is(
    (SELECT count(*)::int FROM public.admin_users
     WHERE user_id = 'a0280000-0000-0000-0000-000000000002'),
    0, 'Even a confirmed bootstrap email cannot gain admin membership'
);
SELECT is(
    (SELECT count(*)::int FROM public.admin_users
     WHERE user_id = 'a0280000-0000-0000-0000-000000000003'),
    0, 'An anonymous identity cannot bootstrap admin membership'
);

UPDATE auth.users SET email_confirmed_at = NOW()
WHERE id = 'a0280000-0000-0000-0000-000000000001';
SELECT is(
    (SELECT count(*)::int FROM public.admin_users
     WHERE user_id = 'a0280000-0000-0000-0000-000000000001'),
    0, 'Later email confirmation cannot grant membership'
);

UPDATE auth.users SET email = 'admin@relogo.app'
WHERE id = 'a0280000-0000-0000-0000-000000000001';
SELECT is(
    (SELECT count(*)::int FROM public.admin_users
     WHERE user_id = 'a0280000-0000-0000-0000-000000000001'),
    0, 'Changing to another bootstrap email cannot grant membership'
);

UPDATE auth.users
SET raw_user_meta_data = '{"is_admin":true,"role":"admin","email_verified":true}'
WHERE id = 'a0280000-0000-0000-0000-000000000004';
SELECT is(
    (SELECT count(*)::int FROM public.admin_users
     WHERE user_id = 'a0280000-0000-0000-0000-000000000004'),
    0, 'User metadata cannot grant membership'
);

-- Model hosted Data API grants so the following denial actually exercises RLS.
GRANT SELECT, INSERT ON public.admin_users TO authenticated, service_role;
SELECT set_config('request.jwt.claims',
    '{"sub":"a0280000-0000-0000-0000-000000000001","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
SELECT is(public.is_admin(), false, 'A matching email does not satisfy is_admin()');
SELECT throws_ok(
    $$INSERT INTO public.admin_users (user_id)
      VALUES ('a0280000-0000-0000-0000-000000000001')$$,
    '42501', NULL, 'An authenticated user cannot insert their own membership'
);
RESET ROLE;

SET LOCAL ROLE service_role;
SELECT lives_ok(
    $$INSERT INTO public.admin_users (user_id)
      VALUES ('a0280000-0000-0000-0000-000000000001')$$,
    'Trusted server provisioning can still create an explicit membership'
);
RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT is(public.is_admin(), true, 'Explicit membership still authorizes the admin');
SELECT throws_ok(
    $$INSERT INTO public.admin_users (user_id)
      VALUES ('a0280000-0000-0000-0000-000000000004')$$,
    '42501', NULL, 'An admin browser session cannot provision another admin'
);
RESET ROLE;

UPDATE auth.users SET email = 'renamed@test.invalid'
WHERE id = 'a0280000-0000-0000-0000-000000000001';
SET LOCAL ROLE authenticated;
SELECT is(public.is_admin(), true, 'Explicit access does not depend on the email address');
RESET ROLE;

SELECT * FROM finish();
ROLLBACK;

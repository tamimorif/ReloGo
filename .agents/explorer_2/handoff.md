# Handoff Report — Explorer 2 (RPCs & Tests)

## 1. Observation

### Codebase Elements Observed
1. **`is_admin()` function definition**:
   - Location: `supabase/migrations/002_hardening_and_user_deletion.sql`, lines 184–194:
     ```sql
     CREATE OR REPLACE FUNCTION public.is_admin()
     RETURNS BOOLEAN
     LANGUAGE sql
     STABLE
     SECURITY DEFINER
     SET search_path = ''
     AS $$
         SELECT EXISTS (
             SELECT 1 FROM public.admin_users WHERE user_id = auth.uid()
         );
     $$;
     ```
   - Privileges: `REVOKE ALL ON FUNCTION public.is_admin() FROM PUBLIC, anon; GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;` (Lines 196–197).

2. **`approve_rule_change` function definition**:
   - Location: Overridden and finalized in `supabase/migrations/013_reject_obsolete_rule_approvals.sql`, lines 14–101.
   - It performs source-first row-locking (`official_sources FOR UPDATE`, then `rule_change_alerts FOR UPDATE`) to prevent deadlocks and races.
   - It validates:
     - `public.is_admin()` check (Lines 32–34).
     - Alert existence and mapping (Lines 44–46, 54–57, 68–70, 72–77).
     - Status must be exactly `PENDING` (Lines 79–83).
     - Alert `new_hash` must match the source's current `last_content_hash` (Lines 85–90). If they diverge, it throws custom error `55000` (obsolete revision).
   - Upon successful checks, it updates the live rule in `corridor_task_rules` and sets the alert status to `APPROVED` (Lines 92–99).
   - Privileges: Revoked from PUBLIC, anon, authenticated, service_role, and granted to authenticated (Lines 106–109).

3. **`dismiss_rule_change` function definition**:
   - Location: `supabase/migrations/009_atomic_rule_review_permissions.sql`, lines 34–68.
   - It validates:
     - `public.is_admin()` check (Lines 43–45).
     - Alert exists under row lock `FOR UPDATE` (Lines 47–55).
     - Status must be `PENDING` (Lines 57–61).
   - It transitions the alert status to `DISMISSED` under lock (Lines 63–66).
   - Privileges: Revoked from PUBLIC, anon, authenticated, service_role, and granted to authenticated (Lines 73–76).

4. **Admin views and pagination RPCs**:
   - Location: `supabase/migrations/003_admin_user_views.sql`.
   - `admin_list_users()`: Returns user metadata joined with auth.users (email, is_anonymous, sign-in times) and checklist progress totals. Enforces `is_admin()` check (Lines 68–70).
   - `admin_get_user_detail(p_user_id)`: Builds and returns a nested JSONB containing profile data and full checklist progress state. Enforces `is_admin()` check (Lines 133–135).
   - Privileges: Revoked from PUBLIC/anon, granted to authenticated (Lines 113–114, 191–192).

5. **Existing pgTAP tests**:
   - Location: `supabase/tests/rls_and_rpcs_test.sql` (1674 lines).
   - Currently contains 143 test assertions executing under local Supabase.
   - Ran using `supabase test db --local` resulting in:
     ```text
     psql:/Users/tamimorif/Documents/GitHub/ReloGo/supabase/tests/rls_and_rpcs_test.sql:24: NOTICE:  extension "pgtap" already exists, skipping
     /Users/tamimorif/Documents/GitHub/ReloGo/supabase/tests/rls_and_rpcs_test.sql .. ok
     All tests successful.
     Files=1, Tests=143,  0 wallclock secs ( 0.02 usr +  0.01 sys =  0.03 CPU)
     Result: PASS
     ```

---

## 2. Logic Chain

1. By inspecting the migrations (002, 003, 007, 009, 013), we established how admin membership is checked (`is_admin()` looking up `admin_users`), and how admin actions (approval, dismissal, user views) are restricted.
2. By reading `supabase/tests/rls_and_rpcs_test.sql`, we verified the coverage. Section D tests direct-edit prevention and `dismiss_rule_change` checks, Section E tests `approve_rule_change` checks (including obsolete alert rejection), and Section F tests `admin_list_users` and `admin_get_user_detail`.
3. By cross-referencing the schema objects and policies with the test assertions, the following test gaps were found:
   - **`admin_users` RLS test coverage**: There are no pgTAP assertions validating RLS policies on the `admin_users` table itself. This table is a critical security anchor.
   - **RPC Function privileges**: Function execution privileges are verified for `approve_rule_change` and `persist_official_source_scrape` via `has_function_privilege()`, but missing for `is_admin()`, `dismiss_rule_change()`, `admin_list_users()`, and `admin_get_user_detail()`.
   - **Obsolete dismissal verification**: The tests do not explicitly check if dismissing an obsolete alert is allowed (it should be allowed, since dismissal does not apply rule modifications, unlike approval).
   - **Dismissed approval verification**: The tests do not explicitly verify that trying to approve an already `DISMISSED` alert fails under the status guard.
   - **Direct Table-level Writes on Public Tables**: While there are tests for admin-direct updates and service-role constraints on `global_tasks` and `corridor_task_rules`, general user or anonymous direct writes (INSERT, UPDATE, DELETE) are not explicitly tested.
4. From these gaps, we can formulate a target verification strategy.

---

## 3. Caveats

- We assumed that dismissing an obsolete alert is the intended business logic (unlike approval which is blocked). Dismissing only marks the alert as `DISMISSED` in `rule_change_alerts`, and does not affect `corridor_task_rules`.
- We assumed that running pgTAP tests locally via Docker is sufficient for database verification (which is the project's standard).

---

## 4. Conclusion

The current admin RPC architecture is highly secure, relying on `is_admin()` lookup against `admin_users` with explicit `REVOKE`/`GRANT` configurations. The pgTAP tests are comprehensive, but have specific gaps around the `admin_users` RLS policies, ACL privilege tests on several RPC functions, obsolete alert dismissal, dismissed alert approval, and direct user writes on read-only public tables.

We recommend adding **19 new test assertions** to `supabase/tests/rls_and_rpcs_test.sql` (extending the total plan to 162 tests) to fully verify the security boundary.

---

## 5. Verification Method

### Test Snippets to Address Gaps

To verify the gaps, the following blocks can be appended to `supabase/tests/rls_and_rpcs_test.sql` (and the plan updated to `162`):

#### 1. `admin_users` RLS & privileges (8 tests)
```sql
-- ============================================================================
-- O. admin_users RLS & privileges                                     (8 tests)
-- ============================================================================
SELECT pg_temp.login_as('00000000-0000-0000-0000-00000000000a'); -- user-a (non-admin)

SELECT is(
    (SELECT count(*)::int FROM public.admin_users),
    0,
    'O: a regular user cannot see any admin_users rows (including their own non-existent row)'
);

SELECT throws_ok(
    $$INSERT INTO public.admin_users (user_id) VALUES ('00000000-0000-0000-0000-00000000000a')$$,
    '42501', NULL,
    'O: a regular user cannot insert into admin_users to escalate privileges'
);

SELECT pg_temp.login_as('00000000-0000-0000-0000-0000000000ad'); -- admin

SELECT is(
    (SELECT count(*)::int FROM public.admin_users),
    1,
    'O: an admin can read their own admin_users row'
);

SELECT is(
    (SELECT count(*)::int FROM public.admin_users WHERE user_id = '00000000-0000-0000-0000-0000000000a'),
    0,
    'O: an admin cannot see other users'' membership in admin_users'
);

SELECT throws_ok(
    $$INSERT INTO public.admin_users (user_id) VALUES ('00000000-0000-0000-0000-00000000000a')$$,
    '42501', NULL,
    'O: an admin cannot insert another user into admin_users directly'
);

SELECT pg_temp.login_anon();

SELECT is(
    (SELECT count(*)::int FROM public.admin_users),
    0,
    'O: anonymous users cannot read admin_users'
);

SELECT throws_ok(
    $$INSERT INTO public.admin_users (user_id) VALUES ('00000000-0000-0000-0000-00000000000a')$$,
    '42501', NULL,
    'O: anonymous users cannot insert into admin_users'
);

RESET ROLE; -- postgres (service_role equivalent)

SELECT lives_ok(
    $$INSERT INTO public.admin_users (user_id) VALUES ('00000000-0000-0000-0000-00000000000a')$$,
    'O: service_role can insert into admin_users'
);

DELETE FROM public.admin_users WHERE user_id = '00000000-0000-0000-0000-00000000000a';
```

#### 2. Admin RPC Function privileges (4 tests)
```sql
-- ============================================================================
-- P. Admin RPC Function privileges                                     (4 tests)
-- ============================================================================
SELECT ok(
    has_function_privilege('authenticated', 'public.is_admin()', 'EXECUTE')
    AND NOT has_function_privilege('anon', 'public.is_admin()', 'EXECUTE'),
    'P: is_admin() execute is restricted to authenticated only'
);

SELECT ok(
    has_function_privilege('authenticated', 'public.dismiss_rule_change(uuid)', 'EXECUTE')
    AND NOT has_function_privilege('anon', 'public.dismiss_rule_change(uuid)', 'EXECUTE')
    AND NOT has_function_privilege('service_role', 'public.dismiss_rule_change(uuid)', 'EXECUTE'),
    'P: dismiss_rule_change() execute is restricted to authenticated only (and revoked from service_role)'
);

SELECT ok(
    has_function_privilege('authenticated', 'public.admin_list_users()', 'EXECUTE')
    AND NOT has_function_privilege('anon', 'public.admin_list_users()', 'EXECUTE')
    AND NOT has_function_privilege('service_role', 'public.admin_list_users()', 'EXECUTE'),
    'P: admin_list_users() execute is restricted to authenticated only (and revoked from service_role)'
);

SELECT ok(
    has_function_privilege('authenticated', 'public.admin_get_user_detail(uuid)', 'EXECUTE')
    AND NOT has_function_privilege('anon', 'public.admin_get_user_detail(uuid)', 'EXECUTE')
    AND NOT has_function_privilege('service_role', 'public.admin_get_user_detail(uuid)', 'EXECUTE'),
    'P: admin_get_user_detail() execute is restricted to authenticated only (and revoked from service_role)'
);
```

#### 3. Obsolete dismissal and dismissed alert approval checks (3 tests)
```sql
-- ============================================================================
-- Q. dismiss_rule_change() obsolete alerts & invalid states             (3 tests)
-- ============================================================================
-- Setup: Make alert 2 obsolete by changing official source hash
RESET ROLE;
UPDATE public.official_sources
SET last_content_hash = 'xyz'
WHERE id = '30000000-0000-0000-0000-000000000001';

SELECT pg_temp.login_as('00000000-0000-0000-0000-0000000000ad'); -- admin

SELECT lives_ok(
    $$SELECT public.dismiss_rule_change('40000000-0000-0000-0000-000000000002')$$,
    'Q: admin can dismiss an obsolete alert (hash mismatch does not block dismissal)'
);

RESET ROLE;
-- Setup: Check that approving a DISMISSED alert is blocked
SELECT pg_temp.login_as('00000000-0000-0000-0000-0000000000ad'); -- admin

SELECT throws_ok(
    $$SELECT public.approve_rule_change('40000000-0000-0000-0000-000000000002', 30, true)$$,
    'P0001', NULL,
    'Q: approving a DISMISSED alert raises (status guard)'
);

-- Clean up / restore
RESET ROLE;
UPDATE public.official_sources
SET last_content_hash = 'bbb'
WHERE id = '30000000-0000-0000-0000-000000000001';

UPDATE public.rule_change_alerts
SET status = 'PENDING'
WHERE id = '40000000-0000-0000-0000-000000000002';
```

#### 4. Direct user writes on read-only public tables (4 tests)
```sql
-- ============================================================================
-- R. public read-only table direct write restriction checks            (4 tests)
-- ============================================================================
SELECT pg_temp.login_as('00000000-0000-0000-0000-00000000000a'); -- user-a

SELECT throws_ok(
    $$INSERT INTO public.global_tasks (id, task_key, title_en, base_description_en)
      VALUES ('10000000-0000-0000-0000-000000000003', 'FORGED_TASK', 'Forged', 'no')$$,
    '42501', NULL,
    'R: regular user cannot insert into global_tasks'
);

SELECT throws_ok(
    $$UPDATE public.global_tasks SET title_en = 'hacked' WHERE id = '10000000-0000-0000-0000-000000000001'$$,
    '42501', NULL,
    'R: regular user cannot update global_tasks'
);

SELECT throws_ok(
    $$DELETE FROM public.global_tasks WHERE id = '10000000-0000-0000-0000-000000000001'$$,
    '42501', NULL,
    'R: regular user cannot delete from global_tasks'
);

SELECT throws_ok(
    $$INSERT INTO public.corridor_task_rules (id, task_id, origin_province, dest_province, days_deadline, is_mandatory)
      VALUES ('20000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000001', 'ON', 'BC', 10, true)$$,
    '42501', NULL,
    'R: regular user cannot insert into corridor_task_rules'
);
```

### Running Verification Command
To run tests, run from the repository root:
`supabase test db --local`
Verify that `All tests successful` and the total count matches the expected plan count.

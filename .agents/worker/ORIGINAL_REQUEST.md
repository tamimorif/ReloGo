## 2026-07-13T19:53:19-04:00
We need to implement the database schema support, test coverage, and documentation for Milestone 1: Admin & DB Setup (Phase 1) for ReloGo.

Tasks:
1. **Admin Bootstrap Schema Support**:
   Create a new migration `supabase/migrations/017_admin_bootstrap_trigger.sql` that sets up a secure bootstrap trigger.
   - Trigger function: `public.handle_admin_bootstrap()` (SECURITY DEFINER, SET search_path = '').
   - Logic: When a new user is inserted into `auth.users`, check if their email matches `admin@relogo.app` or `admin@relogo.ca`. If yes, insert their UUID (`new.id`) into `public.admin_users`.
   - Trigger: `trg_admin_bootstrap` `AFTER INSERT` on `auth.users` for each row executing `public.handle_admin_bootstrap()`.
   - Add appropriate GRANTS / REVOKES.

2. **Database Testing & Test Gaps**:
   Modify `supabase/tests/rls_and_rpcs_test.sql`:
   - Update `SELECT plan(143);` to the new total test count.
   - Append the 19 new test assertions for the 5 identified gaps (admin_users RLS, RPC privileges, obsolete dismissal, dismissed approval, and direct write restrictions).
   - Also append test assertions for the new admin bootstrap trigger (e.g. inserting a mock user with email `admin@relogo.app` into `auth.users` and asserting that they are in `admin_users` and `is_admin()` returns true).
   - Ensure the plan count matches the exact total count of assertions.

3. **Backup & Restore Documentation**:
   Create `docs/BACKUP_RESTORE.md` containing the PITR and daily backup posture and restore runbooks. You can read the draft report from `/Users/tamimorif/Documents/GitHub/ReloGo/.agents/explorer_1/supabase_backup_pitr_report.md` and use its content.

4. **Verification**:
   - Run `supabase db reset --local` to apply all migrations (001 to 017) on the local database.
   - Run `supabase test db --local` to execute pgTAP tests. Make sure they all pass!
   - Run `supabase db lint --local --schema public --level warning --fail-on warning` to verify there are no schema lint warnings.
   - Run type checks / sync script: `bash scripts/check-database-types-sync.sh`.

5. **MANDATORY INTEGRITY WARNING**:
   DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A Forensic Auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

Please report back when the tasks are completed, detailing the commands executed, test results, and file paths changed.

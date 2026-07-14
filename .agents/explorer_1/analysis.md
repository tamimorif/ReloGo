# ReloGo Admin User Management & Setup Analysis

## Executive Summary
This report analyzes the existing schema, database policies, configurations, and mocks for admin users in the ReloGo workspace. Based on this read-only investigation, the database schema (`supabase/migrations/`) contains a secure, functional admin authorization boundary utilizing a dedicated `admin_users` table and an `is_admin()` helper function. No admin credentials or identities are hardcoded or seeded in migrations, which follows security best practices. We outline the structure, findings, and a recommended strategy for provisioning the first admin identity across both preview and production environments without changing the existing schema.

---

## 1. Table Structure & Security Model of `admin_users`

The admin authorization boundary was introduced in `supabase/migrations/002_hardening_and_user_deletion.sql`. 

### Schema Definition
```sql
CREATE TABLE admin_users (
    user_id     UUID        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```
- **`user_id`**: Acts as the primary key and maintains a foreign key constraint linking directly to Supabase's internal auth table (`auth.users(id)`).
- **`ON DELETE CASCADE`**: Enables automatic clean-up of admin status. If a user is deleted from `auth.users` (e.g., via the PIPEDA-compliant `delete_current_user()` RPC or manual admin deletion), their corresponding `admin_users` record is wiped.

### Row Level Security (RLS)
RLS is enabled on `admin_users` to prevent public data exposure:
- **`admin_users: users can read own membership`**: Allows logged-in users to SELECT their own row to verify admin membership:
  ```sql
  CREATE POLICY "admin_users: users can read own membership"
      ON admin_users FOR SELECT
      TO authenticated
      USING (user_id = (SELECT auth.uid()));
  ```
- **`admin_users: service_role full access`**: Grants full administrative CRUD access to the server `service_role` role:
  ```sql
  CREATE POLICY "admin_users: service_role full access"
      ON admin_users FOR ALL
      TO service_role
      USING (true)
      WITH CHECK (true);
  ```

### The `is_admin()` Helper Function
Admin checking is centralized in a custom SECURITY DEFINER SQL function:
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
- **`SECURITY DEFINER`**: Allows the function to bypass normal RLS constraints to read the `admin_users` table, regardless of the active caller's RLS.
- **`STABLE`**: Optimizes performance by caching results within a single statement execution.
- **`SET search_path = ''`**: Hardens the function against search-path hijacking attacks.
- **Privilege Lockdown**: Explicitly revokes access from public/anonymous roles and grants execute permissions only to authenticated users:
  ```sql
  REVOKE ALL ON FUNCTION public.is_admin() FROM PUBLIC, anon;
  GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;
  ```

### Scope of Admin Control
Admins bypass normal RLS to read all profiles/checklists (`003_admin_user_views.sql`) and are the exclusive execution targets for the following RPCs:
- `approve_rule_change()` / `dismiss_rule_change()` (`002_hardening_and_user_deletion.sql`)
- `admin_list_users()` / `admin_get_user_detail()` (`003_admin_user_views.sql`)

---

## 2. Existing Seed Data and Configurations

### Production and Preview Schema
* **No Administrative Accounts Pre-Seeded**: There are zero SQL scripts or migrations that insert real admin identities into `auth.users` or `public.admin_users` for the preview or production databases.
* **Developer Comments**: The migrations include comments detailing how to provision admin users:
  ```sql
  --    To grant admin access:
  --      INSERT INTO admin_users (user_id)
  --      SELECT id FROM auth.users WHERE email = 'admin@relogo.ca';
  ```
* **Frontend Placeholders**: In the admin dashboard React SPA (`admin/src/components/LoginForm.tsx`), the email input placeholder is set to `admin@relogo.ca`.

### Testing Configurations
In `supabase/tests/rls_and_rpcs_test.sql`, mock admin users are initialized strictly for running local pgTAP assertions:
```sql
INSERT INTO auth.users (instance_id, id, aud, role, email, created_at, updated_at)
VALUES (
    '00000000-0000-0000-0000-000000000000', 
    '00000000-0000-0000-0000-0000000000ad',
    'authenticated', 
    'authenticated', 
    'admin@test.local', 
    NOW(), 
    NOW()
);

INSERT INTO public.admin_users (user_id)
VALUES ('00000000-0000-0000-0000-0000000000ad');
```
*Note: This data only exists ephemerally during pgTAP test suite execution in a transactional rollback envelope.*

---

## 3. Options for Creating/Selecting the First Admin Identity

To establish administrative access, we must:
1. Register a user in the environment's `auth.users` table.
2. Link their registered UUID in the environment's `public.admin_users` table.

Because the preview and production databases are isolated (`ca-central-1` regions under separate Supabase projects: `uwfblgllkibbupqyofkl` and `yskknolxbxfxakgvrcmg`), these steps must be executed on each environment independently.

### Schema Support Evaluation
**Does the project need schema support for admin creation?**
**No.** The existing database architecture and migrations (001–016) are fully complete. No schema adjustments are necessary. The authorization mechanisms (`is_admin()`, table relationships, policies, and cascading deletes) are robust and production-ready.

---

## 4. Recommended Strategy

We recommend a **Dashboard-based Manual Provisioning Flow** for creating the first admin identity, supplemented by a **Local Bootstrap Script** (optional, for local development testing).

### Options Matrix

| Approach | Pros | Cons | Verdict |
|---|---|---|---|
| **A. Supabase Dashboard (UI + SQL Editor)** | - High security (passwords never hit git or config)<br>- Built-in email confirm handling<br>- Quick setup | - Manual step per environment | **Recommended** for Hosted Preview & Prod |
| **B. Programmatic Bootstrap Script (Admin API)** | - Automatable<br>- Standardized setup across environments | - Requires secret management (`service_role` key and password envs) | **Optional Follow-up** for local development seeding |
| **C. Checked-in Migration (SQL INSERT)** | - Fully automated | - Hardcodes password hashes/emails in version control (high risk) | **Banned** |

---

### Step-by-Step Execution Plan (Dashboard-based)

Run this sequence separately on the **Preview** and **Production** Supabase instances:

#### Step 1: Create the User in Supabase Auth
1. Log in to the **Supabase Dashboard** for the desired environment.
2. Go to **Authentication** (sidebar) -> **Users**.
3. Click **Add User** -> **Create User**.
4. Enter the administrator's email (e.g. `admin@relogo.app` or the approved organization email) and a strong, generated password.
5. Toggle "Auto-confirm User" (or manually verify the signup depending on organization policy).
6. Click **Create User**.
7. Locate the newly created user in the users list and **copy their User ID (UUID)**.

#### Step 2: Grant Admin Permissions in the Database
1. In the Supabase Dashboard, navigate to the **SQL Editor**.
2. Click **New Query**.
3. Execute the following SQL (replace `<USER_UUID>` with the UUID copied in Step 1):
   ```sql
   INSERT INTO public.admin_users (user_id)
   VALUES ('<USER_UUID>')
   ON CONFLICT (user_id) DO NOTHING;
   ```
4. Verify that exactly 1 row was affected.

#### Step 3: Validate Access
1. Open the Vite Admin Dashboard client pointing to the matching environment.
2. Sign in using the newly created admin credentials.
3. Verify that the client is not redirected to the `NotAuthorized` screen, that the navigation tabs (Alerts, Users, Messages, Waitlist) appear, and that the data loads successfully.
4. Run the following validation SQL in the Dashboard SQL Editor under the authenticated user session to verify policies:
   ```sql
   -- Should return true
   SELECT public.is_admin();
   ```

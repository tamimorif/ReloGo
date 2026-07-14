# Supabase Backup and PITR Posture Report for ReloGo

## Executive Summary
This report defines the Supabase backup and Point-in-Time Recovery (PITR) posture for ReloGo. It evaluates Supabase plan capabilities, recommends specific configurations for preview and production environments, and provides a comprehensive, step-by-step recovery runbook. 

No existing backup/restore scripts or documentation were found in the repository, making this the primary reference for ReloGo's disaster recovery protocol.

---

## 1. Supabase Backup and PITR Plan Options

Supabase offers tiered backup capabilities across its plans. The details are synthesized below:

| Feature / Plan | Free Plan | Pro Plan | Team Plan | Enterprise Plan |
| :--- | :--- | :--- | :--- | :--- |
| **Base Cost** | $0/month | $25/month per project | $599/month organization | Custom |
| **Database Limit** | 500 MB | 8 GB included (+$0.125/GB extra) | 8 GB included (+$0.125/GB extra) | Custom |
| **Automated Backups** | None (manual export only) | Daily nightly backups | Daily nightly backups | Daily nightly backups |
| **Backup Retention** | N/A | 7 days | 14 days | Custom (up to 30+ days) |
| **Backup Type** | N/A | Logical (<100GB), Physical (>100GB) | Logical (<100GB), Physical (>100GB) | Custom |
| **PITR Support** | No | Yes (Paid Add-on) | Yes (Paid Add-on) | Yes (Included/Custom) |
| **PITR Cost** | N/A | Starting at +$100/month | Starting at +$100/month | Included in Custom |
| **PITR Retention Tiers** | N/A | 7 days (+$100/mo)<br>14 days (+$150/mo)<br>21 days (+$200/mo)<br>28 days (+$250/mo) | Same as Pro | Custom |
| **Inactivity Pausing** | Paused after 7 days | Never paused | Never paused | Never paused |

### Crucial Technical Distinctions:
*   **Daily Automated Backups (Logical/Physical)**: Daily snapshots are scheduled once per day. Restoring from these backups is **destructive** because it overwrites the existing active database. This causes immediate service downtime and results in data loss of up to 24 hours (RPO = 24 hours).
*   **Point-in-Time Recovery (PITR) (Physical WAL Archiving)**: PITR continuously archives Postgres Write-Ahead Logs (WAL) and periodically takes base backups. It allows recovery down to the second (or microsecond). PITR restore is **non-destructive** because it provisions a **new project** containing the restored state. This prevents data loss (RPO < 1 min) and allows data validation before cutover, resulting in zero downtime for the restore process itself.

---

## 2. Proposed Plan Selection for ReloGo

To align with budget constraints while ensuring maximum stability and security for user data, the following posture is proposed:

### A. Preview Environment (`ReloGo Preview` — ref: `uwfblgllkibbupqyofkl`)
*   **Recommendation**: **Pro Plan ($25/month)** without PITR add-on.
*   **Rationale**:
    1.  **Prevents Inactivity Pausing**: The Free plan pauses databases after 7 days of inactivity. This would disrupt CI/CD tests, QA verification, and admin preview operations.
    2.  **Daily Backups (7-day retention)**: Provides sufficient recovery capability for testing schemas and layouts. If a developer runs a bad migration, they can restore from the previous night or run a local script.
    3.  **Cost Efficiency**: Saves $100/month by omitting PITR, which is unnecessary for transient testing data.

### B. Production Environment (`ReloGo Production` — ref: `yskknolxbxfxakgvrcmg`)
*   **Recommendation**: **Pro Plan ($25/month) + 7-Day PITR Add-on ($100/month)**
*   **Total Cost**: $125/month
*   **Rationale**:
    1.  **No Data Loss (Low RPO)**: ReloGo production stores active checklists, waitlist signups, and support threads. A maximum data loss of 24 hours (under standard nightly backups) is unacceptable for a production consumer app. PITR reduces RPO to seconds.
    2.  **Non-Destructive Target Validation**: If a scraper worker bug corrupts data or a bad migration is deployed, a PITR restore clones the database into a *new project*. This allows the team to run pgTAP schemas/tests and inspect the data before making it live, ensuring no corrupt state is exposed.
    3.  **SLA and Risk Mitigation**: Enables safe rollback immediately prior to any known scraper execution failure or bad admin update.

---

## 3. Step-by-Step Restore Runbooks

### Runbook A: Point-in-Time Recovery (PITR) — Production (Recommended)

Use this protocol if a production database corruption, accidental deletion, or bad migration occurs.

#### Step 1: Identify the Recovery Target Timestamp
1.  Verify the exact UTC time when the incident occurred (e.g., from worker execution logs, GitHub Actions runner, or Vercel edge logs). Let this be $T_{incident}$.
2.  Choose a target timestamp $T_{target}$ that is at least 1–2 minutes *before* the incident occurred (e.g., if a bad migration ran at `2026-07-13 12:05:00 UTC`, select `2026-07-13 12:03:00 UTC` as the target).

#### Step 2: Initiate PITR in Supabase Dashboard
1.  Log in to the Supabase Dashboard.
2.  Select the active production project: `ReloGo Production` (ref: `yskknolxbxfxakgvrcmg`).
3.  Go to **Database** -> **Backups** from the sidebar.
4.  Select the **Point-in-Time Recovery** tab.
5.  Enter the target date and time $T_{target}$ (ensure UTC is selected if entering UTC).
6.  Click **Restore**.
7.  *Note*: Supabase will begin provisioning a new project (e.g., `ReloGo Production (Restored)`). This process takes 10 to 30 minutes. Take note of the new restored project's reference ID (e.g., `yskknol_restored`).

#### Step 3: Verify the Restored Database
1.  Once the new project is active, open its Supabase Dashboard.
2.  Inspect critical tables (`user_profiles`, `user_task_progress`, `waitlist`, `support_threads`) to confirm the data state is healthy and corresponds to $T_{target}$.
3.  Run the pgTAP test suite against the new database to verify RLS policies and database integrity:
    ```bash
    # Link the Supabase CLI to the newly restored project
    supabase link --project-ref <restored_project_ref>
    
    # Run the pgTAP test suite against the restored instance
    supabase test db --linked
    ```
4.  Confirm all 143+ pgTAP assertions pass.

#### Step 4: Promote the Restored Database (DNS & Env Secrets Cutover)
Update all application environments to point to the new database URL and API keys.

1.  **Vercel (Landing & Admin)**:
    *   Go to Vercel Dashboard -> ReloGo Projects.
    *   Navigate to **Settings** -> **Environment Variables**.
    *   Update production variables with the restored project credentials:
        *   `NEXT_PUBLIC_SUPABASE_URL` -> `https://<restored_project_ref>.supabase.co`
        *   `NEXT_PUBLIC_SUPABASE_ANON_KEY` -> `<new_restored_anon_key>`
        *   `SUPABASE_SERVICE_ROLE_KEY` -> `<new_restored_service_role_key>`
    *   Trigger a new deployment or redeploy the current production branch in Vercel to pick up changes.
2.  **EAS (Expo Mobile App)**:
    *   Go to EAS Dashboard or credentials configuration.
    *   Update the production secrets used for build/runtime.
    *   If using Expo Updates (OTA), publish a new update containing the new Supabase URL and anon key to redirect users without requiring an App Store resubmission:
        ```bash
        cd mobile
        eas update --branch production --message "Database hotfix restore cutover"
        ```
3.  **GitHub Actions (Scraper Worker)**:
    *   Go to GitHub Repository -> **Settings** -> **Secrets and variables** -> **Actions**.
    *   Update the repository secrets:
        *   `SUPABASE_URL` -> `https://<restored_project_ref>.supabase.co`
        *   `SUPABASE_SERVICE_ROLE_KEY` -> `<new_restored_service_role_key>`
    *   Trigger a manual run of the worker to confirm it can authenticate and scrape successfully.

#### Step 5: Post-Restore Cleanup
1.  Keep the old (corrupted) project active in a read-only state for 48 hours to resolve any edge-case disputes.
2.  Rename the new project from `ReloGo Production (Restored)` to `ReloGo Production` in the Supabase Dashboard.
3.  Delete or pause the old corrupted project once data parity is confirmed to prevent double-billing.

---

### Runbook B: Daily Snapshot Restore — Preview

Use this protocol for the preview environment if a destructive test corrupts the preview database.

#### Warning:
Restoring a daily backup is a **destructive process**. It will completely overwrite the database, causing immediate downtime during restore, and all data written since the backup was taken will be permanently lost.

#### Steps:
1.  Log in to the Supabase Dashboard.
2.  Select `ReloGo Preview` (ref: `uwfblgllkibbupqyofkl`).
3.  Go to **Database** -> **Backups** -> **Daily Backups**.
4.  Locate the latest daily snapshot.
5.  Click **Restore Backup**.
6.  Wait for the restore to complete (typically 5–15 minutes depending on size).
7.  Verify database schemas and run database lints/tests:
    ```bash
    supabase link --project-ref uwfblgllkibbupqyofkl
    supabase db lint --local --schema public
    supabase test db --linked
    ```

---

### Runbook C: Manual CLI logical Backup & Restore (Fallback)

Use this protocol for local development, schema migrations fallback, or if a manual, offline copy of the database is required.

#### 1. Perform Logical Backup via CLI
Run the following commands using the Supabase CLI and standard Postgres client tools to create local SQL dumps:

```bash
# Define Project URL and variables
DB_URL="postgresql://postgres:[PASSWORD]@db.yskknolxbxfxakgvrcmg.supabase.co:5432/postgres"

# A. Extract Database Roles
supabase db dump --db-url "$DB_URL" --role-only > supabase_backup_roles.sql

# B. Extract Database Schema Only
supabase db dump --db-url "$DB_URL" --schema-only > supabase_backup_schema.sql

# C. Extract Database User Data Only
supabase db dump --db-url "$DB_URL" --data-only > supabase_backup_data.sql
```

*Note: In ReloGo, PII data is restricted to the device client vault and is never sent to Supabase. Thus, these data backups are completely clean of user PII.*

#### 2. Restore Logical Backup to a Fresh Project
To restore these files to a fresh target database:

```bash
TARGET_HOST="db.<target_project_ref>.supabase.co"

# A. Restore Custom Roles
psql -h "$TARGET_HOST" -U postgres -d postgres -f supabase_backup_roles.sql

# B. Restore Schema structure
# Note: For clean migrations, running standard CLI migration command is preferred:
# supabase db push
# If migrations are not configured, restore the schema file directly:
psql -h "$TARGET_HOST" -U postgres -d postgres -f supabase_backup_schema.sql

# C. Restore User Data
psql -h "$TARGET_HOST" -U postgres -d postgres -f supabase_backup_data.sql
```

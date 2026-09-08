# Supabase backup and restore posture for ReloGo

_Last reviewed: 2026-07-31_

## Executive summary

This is the recovery runbook for ReloGo's Supabase database. It is a proposed
operational posture, not evidence that billing, managed backups, PITR, or a
restore drill are complete.

Current environment state:

| Environment | Project | Runtime state | Schema/function state | Backup gate |
| --- | --- | --- | --- | --- |
| Preview | `uwfblgllkibbupqyofkl` | Deliberately paused after verification | Migrations 001–026; `support-ai` v3 | Resume only for preview work; verify the Dashboard's available backups before relying on them |
| Production | `yskknolxbxfxakgvrcmg` | Active | Exact migrations 001–026; `support-ai` v4 ACTIVE/JWT-protected; anonymous auth enabled; user-data tables empty | Plan/retention/PITR selection, funding, and a restore drill remain owner approvals |

A backup exercise must not apply migration 027+, redeploy functions, or change
production configuration. Preview 001–026/v3 and production 001–026/v4 are the
current environment-specific recovery baselines. Future promotion has a
separate explicit approval gate in
[DEPLOYMENT.md](DEPLOYMENT.md).

The App Store 1.0 binary points to a deleted Supabase project and has no
compatible Expo Updates runtime. It cannot be redirected with an OTA update.
Any database cutover for current users requires a new store binary. The local
1.0.1 configuration includes Expo Updates, but OTA recovery applies only after
that binary is released and only to a compatible runtime/channel.

## 1. Capability and decision record

Supabase's managed backup architecture differentiates between Free projects
(no automatic backups or PITR) and Pro projects (daily automated physical
backups with seven-day retention). Point-in-Time Recovery (PITR) is a separately
billed add-on providing continuous physical Write-Ahead Logging (WAL) streaming
for high-granularity recovery.

### Exact PITR prerequisite steps

To enable and operationalize Point-in-Time Recovery (PITR) for production
project `yskknolxbxfxakgvrcmg`:

1. **Plan upgrade to Pro tier ($25/month)**:
   - Free tier projects do not support physical backups or PITR.
   - In the Supabase Dashboard, navigate to **Organization Settings → Billing →
     Subscription**, select project `yskknolxbxfxakgvrcmg`, and upgrade to the
     **Pro Plan** ($25/month base).

2. **Enable PITR add-on ($100/month for 7-day retention)**:
   - In the project dashboard, navigate to **Project Settings → Billing →
     Add-ons**.
   - Under **Point in Time Recovery (PITR)**, select the retention window:
     - **7 days**: $100/month (approved baseline for ReloGo); or
     - **30 days**: $280/month.
   - Click **Save changes** and confirm the add-on purchase.

3. **WAL archiving warmup period**:
   - PITR enablement is **not retroactive**. Continuous WAL streaming begins
     from the exact moment the add-on is provisioned.
   - A newly enabled PITR setup requires an initial **warmup period**
     (typically several hours, up to 24 hours until the first full physical
     base backup snapshot is captured and WAL segments accumulate).
   - During warmup, arbitrary point-in-time restores across the full 7-day
     window are not yet available; restores can only target points after the
     initial base backup completes. The restorable window advances as WAL
     segments are continuously archived to cloud storage.

4. **Verify restorable window**:
   - Navigate to **Database → Backups → Point in Time (PITR)** tab.
   - Confirm that the status shows active WAL archiving and that the restorable
     window displays valid "Earliest restorable time" and "Latest restorable time"
     timestamps in UTC.

### Decision record (operational determinations)

| Item | Approved value | Operational notes |
| --- | --- | --- |
| Production plan | Supabase Pro ($25/mo) | Required for automated daily physical backups and PITR add-on eligibility. |
| Daily-backup retention | 7 days | Included automatically with Pro plan. Snapshot frequency: every 24 hours. |
| PITR retention | 7 days ($100/mo add-on) | Continuous WAL archiving enabling recovery to any second within past 7 days. |
| RPO / RTO | RPO < 5s; RTO < 60m | Recovery Point Objective: < 5 seconds with active WAL streaming. Recovery Time Objective: < 60 minutes for project provisioning, non-database reconstruction, and validation. |
| Restore-drill owner and cadence | ReloGo Operations & Infrastructure Lead | Quarterly cadence; mandatory drill execution prior to major mobile release cutovers. |

## 2. What a Supabase restore does and does not recover

Prefer Supabase's **Restore to a New Project** flow for a drill or corruption
incident when the source project is eligible. It creates an independent,
database-only copy that can be tested before cutover. Supabase currently marks
this feature beta and limits it to paid plans with physical backups enabled.

According to the official restore guide, the database copy includes schema,
data, indexes, roles/permissions, Auth user records, and the encryption root
key. It does **not** fully reconfigure Storage objects/settings, Edge Functions,
Auth settings and API keys, Realtime settings, database settings/extensions,
or read replicas. Treat all of those as a separate recovery checklist.

ReloGo currently stores no user-uploaded Storage objects, but still verify that
assumption during every drill. The database is expected not to contain the
device-only full name, date of birth, street address, driver's licence number,
health-card number, or completed PDFs. It does contain user-linked anonymous
IDs, move metadata, progress, waitlist data, and fixed-question support data,
so every backup remains confidential.

Deleting a Supabase project is permanent and also removes its backups. Never
delete, pause, or overwrite the source during a drill. Restrict project-delete
access and require a second human to verify the exact project reference before
any destructive production action.

## 3. Restore-to-new-project runbook (preferred)

Use this for a scheduled drill or when production corruption is suspected.
The incident commander decides whether writes must be stopped; do not make that
decision from this document alone.

### Step 1: preserve evidence and select a recovery point

1. Record the incident start, discovery time, suspected cause, affected paths,
   and all timestamps in UTC.
2. Preserve relevant Supabase, Vercel, GitHub Actions, and app-release logs.
   Never paste secrets or device PII into the incident record.
3. In **Database → Backups**, confirm that the chosen physical backup or PITR
   point predates the incident. Record its UTC timestamp and expected data loss.
4. Have a second person verify the source is production
   `yskknolxbxfxakgvrcmg` and the restore target will be a new project.

### Step 2: create the isolated restore target (Dashboard navigation)

Execute the following exact navigation steps in the Supabase Dashboard:

1. Log in to the Supabase Dashboard at `https://supabase.com/dashboard`.
2. Select the production project: **`yskknolxbxfxakgvrcmg`** (`ReloGo Production`).
3. In the left-hand navigation sidebar, click **Database**, then click **Backups**.
4. In the Backups view, select the **Point in Time (PITR)** tab (adjacent to
   Scheduled Backups).
5. Inspect the interactive recovery timeline slider showing the continuous
   restorable window ("Earliest restorable time" to "Latest restorable time"
   in UTC).
6. Click the green **Restore database** button, then select **Restore to a new
   project** (strongly recommended over in-place restore to prevent accidental
   production overwrite).
7. In the restoration modal, configure the target clone:
   - **Project Name**: Enter an isolated identifier, e.g.
     `relogo-restore-drill-YYYYMMDD` (or `relogo-recovery-YYYYMMDD`).
   - **Region**: Select `ca-central-1` (Canada Central - Montreal), ensuring
     strict geographic parity with production for low network latency and
     Canadian data residency compliance.
   - **Compute Size**: Select an equivalent compute instance matching
     production (e.g. Small or Medium).
   - **Target Timestamp**: Select the exact target recovery timestamp (Date,
     Hour, Minute, Second in UTC) predating the corruption or marking the
     drill injection point.
8. Click **Confirm restore**. Supabase provisions the new clone project by
   restoring the base backup and replaying WAL records up to the exact chosen
   second (typically 10–25 minutes).
9. Once provisioning is complete, record the newly assigned target project
   reference (`<restored-project-ref>`) without exposing its generated database
   passwords or API keys.
10. Do not point any production client, function, worker, webhook, cron, or DNS
    record at the restored project yet.
11. Disable or inspect external-operation extensions such as scheduled
    jobs/webhooks before running validation tests.

### Step 3: reconstruct non-database configuration

Using the repository and a reviewed configuration inventory, restore or verify:

1. **Authentication settings**:
   - Navigate to **Authentication → Sign In / Providers**.
   - Ensure **Allow anonymous sign-ins** is enabled with a rate limit of
     30 sign-ins per hour per IP.
   - Set Site URL (`https://relogo-two.vercel.app`) and allowed redirect URLs.
2. **Edge Functions**:
   - Deploy `support-ai` with JWT verification enabled:
     ```bash
     supabase functions deploy support-ai --project-ref <restored-project-ref> --use-api
     ```
   - Set the Gemini API key secret:
     ```bash
     supabase secrets set --project-ref <restored-project-ref> GEMINI_API_KEY="<api-key>"
     ```
3. **Realtime settings**:
   - Confirm Realtime is enabled for `support_threads` and `support_messages`
     tables.
4. **API keys and secrets**:
   - Retrieve the new project's publishable (anon) key and secret service-role
     key from **Project Settings → API**.
   - Note that new projects issue brand-new URLs and API keys; never reuse
     source project secrets.

### Step 4: validate without production traffic

Link to the restored target and run database validation:

```bash
supabase link --project-ref <restored-project-ref>
supabase migration list --linked
supabase db push --dry-run
supabase db lint --linked --schema public --level warning --fail-on warning
```

Then run the transactional pgTAP test suite through the password-authenticated
pooler URL:

```bash
DB_KEYCHAIN_SERVICE="ReloGo Supabase Drill DB"
export PGPASSWORD="$(security find-generic-password -a 'tamimorif' -s "$DB_KEYCHAIN_SERVICE" -w)"
POOLER_URL="$(tr -d '\n' < supabase/.temp/drill-pooler-url)"
supabase test db --db-url "$POOLER_URL" supabase/tests/
unset PGPASSWORD POOLER_URL DB_KEYCHAIN_SERVICE
```

Execute a self-cleaning hosted smoke test that verifies:
- anonymous sign-in and account deletion;
- policy consent gate and profile bootstrap (`get_policy_consent_state()`);
- canonical corridor resolution (`resolve_corridor_rules()`) with HTTPS official sources;
- progress toggle writes (`AVAILABLE` ↔ `COMPLETED`) and RLS isolation;
- authenticated, non-fallback `support-ai` invocation; and
- admin and worker access boundaries.

### Step 5: approve and execute cutover

Cutover requires explicit authorization from the account owner, incident
commander, and release owner. Record the exact values changed and retain a
rollback path:

1. **Web applications**: Update Vercel production environment variables for
   landing (`relogo`) and admin (`relo-go`):
   - `NEXT_PUBLIC_SUPABASE_URL` / `VITE_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` / `VITE_SUPABASE_ANON_KEY`
   Redeploy the existing reviewed production builds.
2. **Background worker and uptime**: Update GitHub Actions repository secrets:
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
   Keep scheduled cron disabled until manual execution verifies resolver and
   write boundaries.
3. **Support AI Edge Function**: Verify live JWT protection and unauthenticated
   401 responses on the new target.
4. **Mobile client cutover**: Follow the mobile considerations below.
5. **Observation**: Observe authentication, API traffic, function invocations,
   and client telemetry before declaring recovery complete.

Keep the original project unchanged for the approved evidence-retention window.
Pause/delete it only after parity, rollback, billing, and legal-retention review;
deletion is permanent.

### Mobile 1.0 binary considerations and client cutover mechanics

#### 1. Permanent 1.0 binary invalidation
The shipped App Store 1.0 binary (Apple ID `6781947478`, bundle ID
`com.relogo.app`) was built from Expo SDK 51. It contains the retired Supabase
project reference `fxrynmgaymslwcklfena` hardcoded directly into the compiled
Hermes JavaScript bytecode bundle (`main.jsbundle`). Furthermore, the 1.0 build
lacked a compatible `expo-updates` runtime and has zero registered OTA updates
in EAS.
**Result**: The 1.0 binary **cannot** be rescued, redirected, or recovered via
database restoration, DNS cutover, or over-the-air updates. It remains
permanently non-functional. Recovery of users on 1.0 requires distributing an
updated native binary through the App Store and Google Play.

#### 2. Disaster recovery cutover dynamics for mobile 1.0.1+
Restoring a database to a new project creates a new project reference, a new
Supabase URL (`https://<new-ref>.supabase.co`), and new publishable/secret API keys:
- **Web apps (landing, admin)**: Cut over in under 5 minutes by updating Vercel
  environment variables and triggering a redeployment.
- **Worker automation**: Cut over in under 5 minutes by updating GitHub Actions
  secrets.
- **Mobile app 1.0.1+**: The recovery app is built on Expo SDK 55 with
  app-version-based runtime versioning and Expo Updates support.
  - If a production database cutover occurs, an Expo Updates OTA release can
    deliver updated configuration to active 1.0.1 installations without
    requiring immediate App Store review.
  - However, if the client requires native configuration updates or if
    un-upgraded users on 1.0 must be recovered, an expedited native release
    (e.g., version 1.0.2) must be submitted to App Store Connect and Google
    Play Console.

#### 3. Restore drill decommissioning
For scheduled drills, do **not** leave the restored project running indefinitely.
After capturing all pgTAP logs, smoke test results, and RPO/RTO metrics in the
drill record, decommission the restored drill project in the Supabase Dashboard
(**Project Settings → General → Delete project**) to prevent recurring compute
and storage charges.

## 4. In-place daily-backup restore (last resort)

An in-place restore can overwrite the active database and cause downtime/data
loss after the chosen snapshot. Use it only when Restore to a New Project is
unavailable and the incident commander explicitly approves the destructive
scope.

Before clicking Restore:

1. Verify the exact project ref and backup timestamp with a second person.
2. Record expected data loss and stop dependent writes/jobs if directed.
3. Capture the current migration ledger and configuration inventory.
4. Confirm that Edge Functions, Auth settings, API keys, Realtime, Storage, and
   integrations have their own reconstruction plan.
5. After restore, run the same lint, pgTAP, smoke, boundary, and client checks
   from Step 4 above before reopening traffic.

Do not use production for a practice in-place restore. Resume the preview
project and use disposable preview data for that exercise only after confirming
what backup options its current plan actually exposes.

## 5. Manual logical backup/restore fallback

Follow Supabase's maintained
[CLI backup/restore guide](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore)
rather than relying on copied commands from memory. A representative export is:

```bash
supabase db dump --db-url '<source-pooler-url>' -f roles.sql --role-only
supabase db dump --db-url '<source-pooler-url>' -f schema.sql
supabase db dump --db-url '<source-pooler-url>' -f data.sql \
  --use-copy --data-only \
  -x 'storage.buckets_vectors' -x 'storage.vector_indexes'
```

Store the outputs encrypted outside the repository and apply a retention/deletion
policy. A logical database restore does not reconstruct Edge Functions, Storage
objects, Auth provider configuration, API keys, Realtime settings, or external
platform variables. Vault/column encryption and migration-ledger preservation
have extra steps in the official guide; do not improvise them.

The Supabase CLI local restore path is for inspection/development and is not a
production service. If a paused project can no longer be restored directly,
download its available database and Storage backups before their recovery
window expires and follow Supabase's current migration guidance.

## 6. Drill acceptance criteria

A restore drill is complete only when all of the following evidence exists:

- the source, restore point, target, RPO, RTO, owner, and cost were recorded;
- production was not mutated and no client was accidentally pointed at the
  drill target;
- the migration ledger and repository source of truth were reconciled;
- lint, pgTAP, RLS/RPC checks, and the self-cleaning hosted smoke passed;
- Auth, Realtime, Edge Function, worker, and external configuration gaps were
  explicitly tested or recorded;
- mobile cutover behavior was proven with a compatible release binary (never
  inferred from the unrecoverable 1.0 binary);
- logs and backup artifacts contain no secrets or device-only PII; and
- the runbook was updated with measured RPO/RTO and lessons learned.

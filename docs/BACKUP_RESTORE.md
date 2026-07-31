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

Supabase's current public plan page says Free projects do not include automatic
backups or PITR, while Pro includes daily backups with seven-day retention.
PITR is a separately billed add-on with retention-dependent pricing. These
commercial terms change; verify them in the project Dashboard and the official
pages before approving spend:

- [Supabase pricing](https://supabase.com/pricing)
- [PITR usage and pricing](https://supabase.com/docs/guides/platform/manage-your-usage/point-in-time-recovery)
- [Restore to a new project](https://supabase.com/docs/guides/platform/clone-project)

Required owner decisions before launch:

1. Confirm the production organization/plan and enable at least managed daily
   backups with a documented retention window.
2. Decide whether the recovery objective requires the PITR add-on. Record the
   approved recovery point objective (RPO), recovery time objective (RTO),
   retention, owner, and monthly budget here.
3. Decide whether preview remains paused/free or is funded for managed backups.
   Preview contains disposable test data and must never be treated as the only
   production recovery copy.
4. Assign a restore-drill owner and a secure location for drill evidence. Do
   not commit database dumps, passwords, API keys, user-linked identifiers, or
   support data.

Decision record (must be completed by the account owner):

| Item | Approved value |
| --- | --- |
| Production plan | Pending |
| Daily-backup retention | Pending |
| PITR retention | Pending / not enabled |
| RPO / RTO | Pending |
| Restore-drill owner and date | Pending |

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

### Step 2: create the isolated restore target

1. In the production project's **Database → Backups → Restore to a New
   Project** flow, choose the reviewed backup/PITR timestamp.
2. Keep the restored project in `ca-central-1`; review the displayed compute,
   disk, and ongoing project cost before confirming.
3. Record the new target reference without exposing its password or keys.
4. Do not point any production client, function, worker, webhook, cron, or DNS
   record at it yet.
5. Once available, disable or inspect external-operation extensions such as
   scheduled jobs/webhooks before running tests, as recommended by Supabase.

### Step 3: reconstruct non-database configuration

Using the repository and a reviewed configuration inventory, restore or verify:

- anonymous sign-ins and the reviewed per-IP rate limit;
- allowed Auth redirect/site URLs and email/provider settings;
- required extensions, Realtime publications, and database settings;
- `support-ai` with JWT verification enabled and `GEMINI_API_KEY` set as a
  server-side Edge secret;
- public publishable keys for mobile/landing/admin and server-only credentials
  for the worker;
- Vercel and EAS environment separation;
- GitHub worker/uptime secrets and variables; and
- any Storage buckets/objects if ReloGo begins using them later.

New projects issue new URLs and API keys. Never reuse a source project's secret
key by assumption, and never place a secret/service-role value in a client.

### Step 4: validate without production traffic

Link only after visually confirming the restored target reference:

```bash
supabase link --project-ref <restored-project-ref>
supabase migration list --linked
supabase db push --dry-run
supabase db lint --linked --schema public --level warning --fail-on warning
```

Then run the transactional pgTAP suite through the password-authenticated
pooler URL as documented in [DEPLOYMENT.md](DEPLOYMENT.md). Also run a
self-cleaning hosted smoke test that verifies:

- anonymous auth and account deletion;
- current policy consent/profile bootstrap;
- canonical corridor resolution and HTTPS official-source links;
- progress writes and RLS isolation;
- authenticated, non-fallback `support-ai`; and
- admin and worker access boundaries.

Compare critical counts and sampled records with the incident expectations.
Do not "repair" migration history merely to make the list look current; resolve
any discrepancy against repository migrations and recorded hosted history.

### Step 5: approve and execute cutover

Cutover requires the account owner, incident commander, and release owner.
Record the exact values changed and retain a rollback path.

1. Update Vercel production public variables for landing/admin and redeploy the
   already-reviewed build.
2. Update GitHub worker/uptime configuration, but keep scheduled jobs disabled
   until the new target's resolver and write boundaries pass.
3. Deploy/configure `support-ai` on the new target, verify JWT protection, and
   run authenticated support smoke testing.
4. For mobile, publish OTA only if the installed store binary has a compatible
   Expo Updates runtime/channel and the update has passed preview QA. The
   shipped 1.0 binary does not, so a new App Store/Play Store binary is required.
5. Observe auth, API, function, worker, and client health before enabling
   recurring jobs or declaring recovery complete.

Keep the original project unchanged for the approved evidence-retention window.
Pause/delete it only after parity, rollback, billing, and legal-retention review;
deletion is permanent.

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

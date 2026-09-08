# ReloGo Deployment Guide

Pinned stack: Next.js 16 (static export) for the landing page, Vite 5 for the
admin dashboard, Expo SDK 55 / React Native 0.83 / EAS for mobile, Supabase
(Postgres + Auth + RLS) for the backend, and a Python 3.11 Playwright worker for
rule monitoring.

## 0. Order of operations

Follow these top-to-bottom for the recovery release. Use isolated preview and
production environments; never point a preview build at production data and
never infer production approval from a successful preview deploy.

| # | Step | Section |
| --- | --- | --- |
| 1 | Verify that current iOS build 8 and Android build 5 identify exact green commit `cd3a87c`, then—after explicit upload authorization—complete real-device startup, offline/recovery, PDF, deletion, and privacy QA on those exact artifacts | [§4](#4-mobile-app-expo-sdk-55-eas) |
| 2 | Correct and approve store/privacy metadata, then submit/release iOS 1.0.1 only after device, legal, store, and operations approval | [§4](#4-mobile-app-expo-sdk-55-eas) |
| 3 | Confirm an owner-controlled Google Play publication path after Android device QA; the current public 404 is not publication-history evidence | [§4](#4-mobile-app-expo-sdk-55-eas) |
| 4 | Apply migration 027 to production outside the `0 2 * * *` UTC cron window, run post-push pgTAP/lint, trigger `.github/workflows/worker.yml` via `workflow_dispatch` (coordinated worker merged to `main` via PR #5), verify 9 automated targets and 2 manual Yukon assignments in step summary, and configure/test alert webhook ownership | [§1](#1-supabase-database), [§5](#5-rule-monitor-worker-python-311--playwright), [§8](#8-incident-runbook-and-monitoring) |
| 5 | Fund/test backups, establish mailbox/domain and incident ownership, and resume preview v3 only for isolated preview QA | [§8](#8-incident-runbook-and-monitoring) |

**Configured cloud mapping:** separate Supabase preview and production projects
use `ca-central-1`. Vercel project `relogo` maps to `landing/`; `relo-go` maps
to `admin/`. Development/preview variables target the preview backend and
production variables target production in both Vercel and the registered EAS
project. Values remain platform-managed and are not committed.

Current hosted/repository truth (2026-08-17):

| Target | State |
| --- | --- |
| Preview Supabase `uwfblgllkibbupqyofkl` | Deliberately paused after exact 001–026, JWT-protected `support-ai` v3, and passing hosted smoke |
| Production Supabase `yskknolxbxfxakgvrcmg` | Active/currently linked; exact 001–026; last pre-027 dry run clean; final `support-ai` v5 ACTIVE/JWT-protected with unauthenticated 401; self-cleaning authenticated/non-fallback AI smoke passed and cleaned up |
| Mobile | Local version 1.0.1 / SDK 55 gates and push CI run `32050117854` pass. Current exact-`cd3a87c` iOS build 8 (`daa8e42a-c12d-4365-b6ca-ff36732cd858`) and Android build 5 (`f839dede-1f83-4c6a-a928-de258597e6d0`) `FINISHED` with verified archives. Neither was uploaded or submitted to a store; real-device QA and approval remain. Historical exact-`e75f449` iOS build 7 remains in internal TestFlight but is not the current candidate |
| Web/admin | Reviewed admin recovery is live at `https://relo-go.vercel.app`; landing is unchanged/live at `https://relogo-two.vercel.app`; main run `30843906264` passed public web/auth/resolver checks with required backend probes |
| Worker/uptime | Main run `30843904269` passed the `2.31.0` preflight and created 42 baselines. Hardened run `30845791036` fetched 50 unique URLs for 53 rows, completed 42 rows, added one baseline, and filed three PENDING alerts while 11 rows/10 URLs failed closed. Production remains at 43/53 baselines. Local migration 027 maps nine rows to validated worker-only first-party targets and two Yukon rows to visible 30-day ReloGo operations assignments; it is pending review, hosted rollout, and live rerun. Key rotation is not needed; `ALERT_WEBHOOK_URL` is unset |
| GitHub | Pull request #2 merged recovery as `e75f449`. Pull request #3 final head `3f063e9` passed all 19 checks, its sole review thread was fixed/resolved, and it merged as `d2db994` |

The worker's Ubuntu 22.04 runner and `supabase==2.31.0` exact-origin preflight
are now on `main`. Run `30843904269` proved that the existing encrypted key and
schema access work, so do not rotate or request another credential. Its 11
failed rows/10 URLs were official-site anti-bot, CAPTCHA, or empty-content
rejections, not authentication.

## 1. Supabase (database)

Migrations live in `supabase/migrations/` and are the single schema source of
truth (`001_init.sql` through local `027_worker_source_monitoring.sql`). Never
edit a hosted schema by hand or rewrite a deployed migration. Migration 027 is
pending review and has not been applied to any hosted project.

Preview and production both have exact migrations 001–026. Preview was verified
and deliberately paused. Production's last pre-027 post-push dry run was clean;
anonymous auth is enabled; the self-cleaning smoke passed anonymous auth, resolver output with
five tasks/five HTTPS sources, a minimal onboarding profile insert,
authoritative consent/profile confirmation, and cleanup; and profile, waitlist,
support, and progress tables contain zero rows. Recovery migrations add:

- 023: canonical exact/`ANY` corridor rule resolution plus ordered HTTPS
  official sources, reused by mobile/admin/AI;
- 024: one consent/bootstrap response with profile only for current consent;
- 025: `AVAILABLE`/`COMPLETED` progress only;
- 026: rejection of new/updated same-origin/destination moves; and
- 027 (local/pending): worker-private first-party monitor targets for nine
  previously failed rows, explicit owned manual monitoring for two Yukon rows,
  and a persistence guard that rejects manual rows. It does not change public
  canonical source links or any live corridor rule.

Migration 019/policy 1.1 and 023–026 are coordinated with the 1.0.1 client. The
currently shipped 1.0 binary points to a deleted backend and cannot be rescued,
so this is a new-binary recovery rather than an in-place compatibility rollout.
Still deploy matching legal pages and verify the 1.0.1 preview build before the
  1.0.1 recovery release.

The support-chat feature requires `004_support_messages.sql`, which creates
the `support_threads` and `support_messages` chat tables (+ RLS) and enables
Supabase Realtime on both so clients receive live message updates. Apply it
with `supabase db push` like any other migration; the Messages tab in the
admin dashboard and the in-app support chat will not work until it is applied.

```bash
# Authenticate, then target preview explicitly after resuming it in Dashboard.
supabase login
supabase link --project-ref uwfblgllkibbupqyofkl
supabase migration list --linked
supabase db push --dry-run
```

After preview is deliberately resumed, its ledger should still end at 026 and
the current repository dry run should report only pending migration 027. Re-run
local reset/lint/pgTAP first. Do not push without explicit approval; after an
approved preview migration, re-run ledger, lint, pgTAP, advisors, and the self-
cleaning hosted smoke, then pause preview again if no work remains.

Production is currently linked locally and remains at exact 001–026. Its last
pre-027 dry run was clean; with this local tranche, a current dry run should
show exactly migration 027 pending. Record the state with read-only commands:

```bash
supabase link --project-ref yskknolxbxfxakgvrcmg
supabase migration list --linked
supabase db push --dry-run
```

Do not run the push merely because the dry run finds 027. Migration 027 requires
its own explicit approval, preview verification, and pre/post ledger/dry-run/
lint/pgTAP/advisor/smoke gates. It must be applied before the coordinated worker
code, whose preflight selects the new monitoring columns. After the approved
migration passes its post-push gates, deploy or trigger the coordinated worker
and require a live Actions summary showing both manual assignments. Neither the
migration nor worker may auto-change live rules. Stop and report any mismatch;
do not repair history ad hoc. Never run `supabase config push`: committed config
contains localhost Auth URLs.

> **Note:** Supabase link state is machine-local and intentionally ignored by
> git. On a new machine, run `supabase login` and `supabase link` even if another
> contributor previously linked the project.

To verify what would run without applying it:

```bash
supabase db push --dry-run
```

After each hosted push, require an up-to-date dry run, lint only project-owned
SQL, and run the transactional pgTAP suite:

```bash
supabase db push --dry-run
supabase db lint --linked --schema public --level warning --fail-on warning
DB_KEYCHAIN_SERVICE="ReloGo Supabase Preview DB"
# For production, use: ReloGo Supabase Production DB
export PGPASSWORD="$(security find-generic-password \
  -a 'tamimorif' -s "$DB_KEYCHAIN_SERVICE" -w)"
POOLER_URL="$(tr -d '\n' < supabase/.temp/pooler-url)"
supabase test db --db-url "$POOLER_URL" supabase/tests/
unset PGPASSWORD POOLER_URL DB_KEYCHAIN_SERVICE
```

`supabase test db --linked` uses a restricted temporary login on hosted
projects that cannot resolve the preinstalled pgTAP schema. Use the linked
pooler URL plus the database password instead; keep the password in Keychain or
`PGPASSWORD`, never command output. The suite is enclosed in `BEGIN`/`ROLLBACK`.

Supabase CLI 2.109.1 may warn that its optional pg-delta migration catalog cache
could not read a temporary CA file. Treat a push as successful only when the
command finishes, remote migration history matches, and the post-push dry run,
lint, and pgTAP checks all pass.

### Migration 027: Validation and security architecture

Migration 027 (`supabase/migrations/027_worker_source_monitoring.sql`) resolves
the 11 source-row monitoring failures identified in hardened worker run
`30845791036` (8 Cloudflare managed challenges, 2 CAPTCHAs, 1 empty body) while
strictly preserving public API contracts and baseline integrity.

#### 1. Column-level access security
Migration 027 adds four monitoring columns to `public.official_sources`:
`monitor_url`, `monitoring_mode`, `manual_review_owner`, and
`manual_review_interval_days`. To prevent reconnaissance of internal scraping
targets or operational review cadences, column privileges are explicitly
restricted:
```sql
REVOKE SELECT (monitor_url, monitoring_mode, manual_review_owner, manual_review_interval_days)
    ON TABLE public.official_sources FROM anon, authenticated;
GRANT SELECT (monitor_url, monitoring_mode, manual_review_owner, manual_review_interval_days)
    ON TABLE public.official_sources TO service_role;
```
Neither anonymous visitors, authenticated mobile users, nor standard PostgREST
clients can query these columns. Only the worker executing under the
`service_role` can access them.

#### 2. Database RPC manual guard (ERRCODE 55000)
`persist_official_source_scrape()` provides a database-enforced integrity gate.
If an automated worker or misconfigured script attempts to persist scrape
results against a row marked `MANUAL`, PostgreSQL raises an immediate
exception:
```sql
IF v_monitoring_mode <> 'AUTOMATED' THEN
    RAISE EXCEPTION 'persist_official_source_scrape(): source % is not automatically monitored',
        p_official_source_id USING ERRCODE = '55000';
END IF;
```
PostgreSQL error code `55000` (`object_not_in_prerequisite_state`) aborts the
transaction. Manual monitoring baselines and audit history cannot be overwritten
by scraper execution.

#### 3. Canonical public official_url preservation
The canonical corridor rule resolver `resolve_corridor_rules(origin, destination)`
(defined in migration 023) selects and aggregates only the public
`os.official_url`:
```sql
SELECT jsonb_agg(
    jsonb_build_object(
        'id', os.id,
        'agency_name', os.agency_name,
        'official_url', os.official_url,
        'last_verified', os.last_verified
    )
    ORDER BY lower(os.agency_name), os.official_url, os.id
) AS official_sources
FROM public.official_sources AS os
WHERE os.corridor_rule_id = r.id
  AND os.official_url ~* '^https://[^[:space:]]+$'
```
`monitor_url` is private to the worker. Mobile end-users, the admin dashboard,
and Support AI grounding only ever receive verified, canonical public government
URLs.

#### 4. Fail-closed anti-bot and CAPTCHA handling
In `worker/main.py`, HTTP requests encountering Cloudflare managed challenges
(`cf-mitigated: challenge` on HTTP 403) raise `ManagedChallengeError`. Pages
displaying CAPTCHA text patterns raise `CaptchaChallengeError`, and short
block/rejection pages raise `RejectedContentError`. When an exception is raised:
- `persist_official_source_scrape()` is **never** invoked for that source;
- existing stored baselines (`last_content_hash`, `last_content_text`) remain
  uncorrupted;
- the source is tallied in `stats["failed"]`; and
- `run_should_fail(run_stats)` causes the worker process to exit with code 1.

Under no circumstances does the worker attempt to bypass, solve, or baseline
anti-bot or challenge pages.

#### 5. The 11 mapped target sources inventory
Migration 027 updates exactly 11 sources (verified by `v_updated = 11` during
execution) across 10 unique URLs. Nine sources are assigned verified first-party
surrogate URLs for automated scraping, and two Yukon sources are assigned to
operations for recurring 30-day manual review:

| Task Key | Dest | Canonical `official_url` (Public) | Assigned `monitor_url` (Worker Private) | Mode | Review Owner / Cadence |
| :--- | :---: | :--- | :--- | :---: | :---: |
| `EXCHANGE_DRIVERS_LICENCE` | NU | `https://www.gov.nu.ca/en/service-nunavut/apply-drivers-licence` | `https://www.gov.nu.ca/sites/default/files/documents/2022-12/driversmanual_eng.pdf` | AUTOMATED | — |
| `EXCHANGE_DRIVERS_LICENCE` | PE | `https://www.princeedwardisland.ca/en/information/transportation-and-infrastructure/driving-with-an-out-of-province-license` | `https://www.princeedwardisland.ca/sites/default/files/publications/drivers_handbook.pdf` | AUTOMATED | — |
| `EXCHANGE_DRIVERS_LICENCE` | YT | `https://yukon.ca/en/driving-and-transportation/driver-licensing/transfer-your-drivers-licence-jurisdiction-outside-yukon` | `NULL` | MANUAL | ReloGo operations / 30d |
| `UPDATE_HEALTH_CARD` | NU | `https://www.gov.nu.ca/en/health/applying-health-care` | `https://www.gov.nu.ca/sites/default/files/forms/2022-02/new_to_nunavut_health_care_coverage%20_appli_eng.pdf` | AUTOMATED | — |
| `UPDATE_HEALTH_CARD` | PE | `https://www.princeedwardisland.ca/en/service/apply-for-pei-health-card-new-residents` | `https://www.princeedwardisland.ca/sites/default/files/forms/pei_health_card_application_form.pdf` | AUTOMATED | — |
| `UPDATE_HEALTH_CARD` | QC | `https://www.ramq.gouv.qc.ca/en/citizens/health-insurance/registration-information` | `https://www.quebec.ca/en/immigration/settle-and-integrate-in-quebec` | AUTOMATED | — |
| `REGISTER_VEHICLE` | NU | `https://www.gov.nu.ca/en/service-nunavut/private-vehicle-registration-nunavut` | `https://www.gov.nu.ca/sites/default/files/documents/2022-12/driversmanual_eng.pdf` | AUTOMATED | — |
| `REGISTER_CHILDREN_SCHOOL` | NU | `https://www.gov.nu.ca/en/education-and-schools/k-12-school-calendars-map-and-registration` | `https://www.gov.nu.ca/sites/default/files/publications/2024-12/Student_Registration_Guidelines_for_Kindergarten_to_Grade_12_2023.pdf` | AUTOMATED | — |
| `REGISTER_CHILDREN_SCHOOL` | PE | `https://www.princeedwardisland.ca/en/information/education-and-lifelong-learning/register-your-child-for-school` | `https://psb.edu.pe.ca/schools/registering-your-child-for-school` | AUTOMATED | — |
| `REGISTER_CHILDREN_SCHOOL` | YT | `https://yukon.ca/en/education-and-schools/plan-elementary-and-high-school/register-your-child-school` | `https://open.yukon.ca/information/d29fd0f4-dd63-4444-94ca-7a1476b76583/resource/49e90760-acb7-40c9-b4a0-4741296a72e0/download/edu-policy-enrolment-students-yukon-schools-2026.pdf` | AUTOMATED | — |
| `REGISTER_VEHICLE` | YT | `https://yukon.ca/en/driving-and-transportation/driver-licensing/transfer-your-drivers-licence-jurisdiction-outside-yukon` | `NULL` | MANUAL | ReloGo operations / 30d |

### Migration 027: Zero-regression rollout sequence

To guarantee zero regression when rolling out Migration 027 and activating the
coordinated worker, adhere to the following sequence:

#### Background and safety barrier
Pull request #5 merged the coordinated worker code (`worker/changedetect.py`,
`worker/reporting.py`, `worker/main.py`) to `main`. The scheduled workflow
`.github/workflows/worker.yml` runs daily at `0 2 * * *` UTC on `main`.
Importantly, `worker/preflight.py` queries:
```python
client.table("official_sources").select(
    "id, monitor_url, monitoring_mode, manual_review_owner, manual_review_interval_days"
).limit(1).execute()
```
Because Migration 027 has not yet been applied to production Supabase
(`yskknolxbxfxakgvrcmg`), `preflight.py` currently fails fast with exit code 1
before browser installation or scraper execution. This fail-fast mechanism
prevents the worker from regressing baselines against an unmigrated schema.

#### Step-by-step rollout execution

1. **Schedule maintenance outside cron window**:
   Execute the migration strictly outside the daily scheduled cron window
   (`0 2 * * *` UTC). A recommended window is between 04:00 UTC and 06:00 UTC.
   Never apply schema migrations during or immediately adjacent to `02:00` UTC
   to prevent race conditions with active cron jobs.

2. **Pre-push verification**:
   Confirm linked production target and dry-run output:
   ```bash
   supabase link --project-ref yskknolxbxfxakgvrcmg
   supabase migration list --linked
   supabase db push --dry-run
   ```
   Verify that `027_worker_source_monitoring.sql` is the only pending migration.

3. **Apply migration to production**:
   ```bash
   supabase db push
   ```
   Confirm the command finishes cleanly and records migration 027 in the
   hosted schema ledger.

4. **Post-push database validation gates**:
   Run schema lint and the transactional pgTAP test suite:
   ```bash
   supabase migration list --linked
   supabase db push --dry-run
   supabase db lint --linked --schema public --level warning --fail-on warning
   DB_KEYCHAIN_SERVICE="ReloGo Supabase Production DB"
   export PGPASSWORD="$(security find-generic-password -a 'tamimorif' -s "$DB_KEYCHAIN_SERVICE" -w)"
   POOLER_URL="$(tr -d '\n' < supabase/.temp/pooler-url)"
   supabase test db --db-url "$POOLER_URL" supabase/tests/
   unset PGPASSWORD POOLER_URL DB_KEYCHAIN_SERVICE
   ```
   Verify that all pgTAP tests pass (including Migration 027 tests verifying
   `monitor_url` check constraints, manual metadata invariants, and RPC
   guard execution).

5. **Manually trigger worker workflow via workflow_dispatch**:
   Trigger the GitHub Actions workflow manually on branch `main`:
   ```bash
   gh workflow run worker.yml --ref main
   ```
   Alternatively, navigate to GitHub Actions → **Rule Monitor Worker** →
   **Run workflow** → select branch `main`.

6. **Verify GitHub Actions step summary and execution logs**:
   Open the triggered workflow run and inspect the step summary:
   - **Preflight**: Confirms connection to production Supabase, resolver
     health, and query access to the new monitoring columns.
   - **Automated targets**: All 9 newly mapped automatic sources complete
     successfully and establish initial baselines (or report unchanged/changed)
     without anti-bot rejections or CAPTCHA errors.
   - **Manual assignments**: The summary table explicitly lists both Yukon
     manual assignments:
     - `EXCHANGE_DRIVERS_LICENCE` (YT) — Owner: `ReloGo operations`, Interval: `30d`
     - `REGISTER_VEHICLE` (YT) — Owner: `ReloGo operations`, Interval: `30d`
   - **Exit code**: The job finishes with status **Success** (exit code 0).

### Granting admin access

Admin access is governed by the `admin_users` table plus RLS. Migration 017
automatically registers the two reviewed bootstrap addresses
(`admin@relogo.app` and `admin@relogo.ca`) when their auth users are created.
The first admin is already verified in both hosted projects. For a reviewed
additional admin address, use these steps:

Legacy local bootstrap helpers with password material have been removed, but
the old value remains in repository history. Treat it as exposed: rotate/revoke
the existing hosted admin credentials before release and use a reviewed
history-remediation plan rather than casually rewriting shared history.

1. Create an auth user for the intended internal admin email. Supabase
   Dashboard → **Authentication → Users → Add user** → enter the monitored
   address and a strong unique password.
2. Add that user to `admin_users` through a privileged database-owner session,
   such as the Dashboard SQL Editor or a secured owner `psql` connection. Do
   not treat the service-role API key as a database password:

```sql
INSERT INTO public.admin_users (user_id)
SELECT id
FROM auth.users
WHERE email = 'admin@example.com'
ON CONFLICT (user_id) DO NOTHING
RETURNING user_id;
```

3. Require exactly one returned row. Sign in through the admin client and
   verify `is_admin()` returns `true` and an admin-only RPC succeeds. A normal
   authenticated user must still receive `false`/authorization failure.

Admin access is enforced entirely server-side: the admin app calls the
`is_admin()` RPC (which checks `admin_users`) and shows a "not authorized"
screen on `false`. There is no client-side email allowlist.

### Enabling anonymous sign-ins (required for mobile)

The mobile onboarding flow calls `supabase.auth.signInAnonymously()`
(`mobile/app/(auth)/onboarding.tsx`), which is **off by default** in Supabase.
Enable it or every new user's onboarding will fail at runtime:

- Supabase Dashboard → **Authentication → Sign In / Providers** → enable
  **"Allow anonymous sign-ins"**.

Use a limit of 30 anonymous sign-ins per hour per IP unless load testing
justifies another reviewed value. Preserve the setting when rotating or
recreating projects. See [PLAN.md](PLAN.md) for current completion state.

### Advisor and backup gate

Run Supabase security and performance advisors on preview after every security
or index migration, review every finding, then repeat on production. Advisor
errors block promotion. Warnings require a written determination; public
waitlist/signed-in RPCs, anonymous-user RLS, separate admin/owner policies, and
fresh-database unused indexes may be intentional but must not be ignored.

Before launch, the owner must select/fund the managed backup/PITR posture,
record retention/RPO/RTO, and complete a documented restore drill. The current
runbook is a proposal, not evidence that backup billing or recovery is
operational. See [BACKUP_RESTORE.md](BACKUP_RESTORE.md).

## 2. Landing page (Next.js 16 static export, Vercel)

`landing/next.config.js` sets `output: 'export'`, so `next build` emits a
fully static site into `landing/out/`. There is no Node server at runtime --
do not use `next start`.

```bash
cd landing
cp .env.example .env.local   # local dev: Next.js loads .env.local (not .env)
npm ci
npm run build        # static export -> out/
npx serve out        # optional local preview of the exported site
```

Vercel setup (`landing/vercel.json` is already configured):

- Linked Vercel project: `relogo`
- Root directory: `landing`
- Framework preset: Next.js (Vercel detects the static export automatically)
- Environment variables (build-time, public):
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
  - `NEXT_PUBLIC_SITE_URL` (currently `https://relogo-two.vercel.app`)
  - `NEXT_PUBLIC_SUPPORT_EMAIL` (leave empty until a monitored mailbox exists)

The variables are configured as development/preview → preview Supabase and
production → production Supabase.

The current public alias is `https://relogo-two.vercel.app`; the landing site is
unchanged/live, and pull request #2's Vercel preview passed. Main-branch uptime
run `30843906264` reverified its public route markers plus production auth and
resolver health. The
custom `relogo.app` domain and monitored support/privacy mailbox are not
configured. Preview, review, and smoke-test `/`, `/privacy`, `/terms`,
`/support`, `/robots.txt`, and `/sitemap.xml` before any future promotion.

## 3. Admin dashboard (Vite 5 SPA, Vercel)

```bash
cd admin
npm ci
npm run build        # tsc -b && vite build -> dist/
npm run preview      # optional local preview of the production build
```

Vercel setup (`admin/vercel.json` already includes the SPA rewrite to
`/index.html`):

- Linked Vercel project: `relo-go`
- Root directory: `admin`
- Framework preset: Vite
- Environment variables (build-time, public):
  - `VITE_SUPABASE_URL`
  - `VITE_SUPABASE_ANON_KEY`

The variables are configured with the same preview/production separation.
The reviewed current recovery build is deployed to production at
`https://relo-go.vercel.app`, and the manual seven-route public check includes
its admin marker. Before any future deployment, inspect the local Vercel link:
`admin/.vercel/project.json` currently names a separate `admin` project, so
relink or explicitly target the intended `relo-go` project and use a preview
deployment before promotion.

## 4. Mobile app (Expo SDK 55, EAS)

Build profiles are defined in `mobile/eas.json` (`development`, `preview`,
`production`; EAS CLI `>= 12.0.0`, remote app version source with
auto-increment in production).

App Store version 1.0 has been live since 2026-06-23 (Apple ID `6781947478`,
bundle ID `com.relogo.app`). It is not recoverable: its compiled SDK 51 bundle
contains the deleted `fxrynmgaymslwcklfena` Supabase ref, it had no compatible
Expo Updates runtime, and there are zero OTA updates for it. Backend-dependent
onboarding/checklist behavior is broken in the downloadable release. Do not
attempt an `eas update` hotfix for that binary.

The recovery app is 1.0.1 / SDK 55 and now has app-version-based runtime
versioning, Expo Updates configuration, and a build-time release preflight.
This helps future compatible releases; it does not retroactively update 1.0.
Earlier production/store builds from exact merged `main` `e75f449` both
finished successfully: iOS version 1.0.1 build 7, EAS
`765965d7-c7c1-432c-ac1d-302d2f0c5116`, and Android version 1.0.1 build 4, EAS
`28076f35-1495-466b-af77-97a9339c5ea2`. The registered production EAS values
passed the release contract and existing remote signing credentials worked;
no credential or password was requested. iOS build 7 was successfully uploaded
on 2026-08-04 and is `VALID`/`IN_BETA_TESTING` in internal TestFlight; it has
not been submitted for App Review. Android build 4 has not been uploaded to
Google Play. Both artifacts predate the current `tamim` startup and dependency
fixes, so they are historical evidence rather than current release candidates.
Current production replacements both `FINISHED` from exact green `tamim` commit
`cd3a87c`: iOS version 1.0.1 build 8, EAS
`daa8e42a-c12d-4365-b6ca-ff36732cd858`, and Android version 1.0.1 build 5, EAS
`f839dede-1f83-4c6a-a928-de258597e6d0`. Their archives and embedded production
metadata passed integrity checks. Neither was uploaded or submitted to a store.
Cloud build completion still cannot replace real-device evidence or approval.
Prioritize the iOS recovery because broken 1.0 is publicly downloadable there.
Google Play currently returns 404 for `com.relogo.app`; that proves only that it
is not publicly available now, not whether it was previously published.
The mobile production audit patches `js-yaml`, `nanoid`, and `postcss` and uses
a fail-closed wrapper for two exact `image-size@1.2.1` denial-of-service
advisories propagated through Metro build tooling. There is no patched
`image-size` release or compatible npm remedy; the reviewed exception is
limited to repository-controlled build assets and every other high/critical
finding fails. The exact `xcode@3.0.1` override still pins the CommonJS-
compatible `uuid@11.1.1`; keep it narrow and remove it when fixed upstream.
The final current-tree local mobile gates pass: release configuration,
TypeScript, lint, 13 Jest suites with 133/133 tests, iOS export at 1,753
modules/5.8 MB Hermes bytecode, Android export at 1,774 modules/5.9 MB Hermes
bytecode, and the fail-closed production audit. Cloud build completion does
not replace real-device QA or store-submission evidence. Do not create duplicate
builds merely to reproduce their successful status. For internal iOS QA, only
with explicit owner authorization, upload exact-`cd3a87c` build 8 to TestFlight,
then install it with an App Store Connect internal tester. EAS device
registration is not required. Before automated Android submission, the owner
must provide/review a Google Play service-account key; otherwise use a
documented owner-controlled manual path.

```bash
cd mobile
npm ci
npm run check:release
npx expo install --check
npm run lint
npm run typecheck
npm test -- --runInBand
npm run audit:production
npx expo start                                  # local development

npm install -g eas-cli                          # or: npx eas-cli ...
eas login
eas env:list --environment preview
eas build --profile preview --platform all      # first: internal distribution

# Create exact production artifacts after repository gates pass. This does not
# upload them to a store or submit them for review:
eas env:list --environment production
eas build --profile production --platform all --non-interactive \
  --freeze-credentials --no-wait --json

# Only after explicit owner authorization to upload current iOS build 8 for
# TestFlight/device QA. This uploads the binary to App Store Connect; it does
# not submit an App Review release:
eas submit --profile production --platform ios \
  --id daa8e42a-c12d-4365-b6ca-ff36732cd858 --non-interactive --no-wait

# Android remains separate. Only after Android device QA, an owner-approved
# Google Play path/service-account key, and explicit upload authorization:
eas submit --profile production --platform android \
  --id f839dede-1f83-4c6a-a928-de258597e6d0 --non-interactive --no-wait
```
`mobile/eas.json` explicitly selects the EAS `development`, `preview`, and
`production` environments and intentionally stores no project values. The
registered EAS project already has `EXPO_PUBLIC_SUPABASE_URL` and
`EXPO_PUBLIC_SUPABASE_ANON_KEY`: development/preview target preview Supabase;
production targets production. Verify them with
`eas env:list --environment <name>` after any rotation. The publishable key
(stored under the compatibility `*_ANON_KEY` name) is public by design;
RLS/RPCs are the security boundary. Runtime validation accepts only clean
Supabase origins; hosted URLs require HTTPS and cannot contain credentials,
custom ports, paths, queries, or fragments.

`eas-build-pre-install` runs `npm run check:release`. It rejects a marketing
version below 1.0.1, a mismatched EAS project/runtime/update URL, the retired
backend ref, incorrect environment/channel wiring, an unverified legal origin,
or a production build whose URL is not the exact clean origin
`https://yskknolxbxfxakgvrcmg.supabase.co` (an optional trailing slash is
accepted). It trims the public key and rejects missing or whitespace-only
values. Treat any failure as a release blocker; do not remove the check to make
a build pass.

The startup recovery removes network work from the static splash path, bounds
session restore at 3 seconds and consent/profile bootstrap at 5 seconds, avoids
duplicate initial-session requests, reuses the bootstrap profile, and defers the
heavy PDF engine until an explicit tap. After current consent is confirmed it
prefetches corridor rules and progress during route rendering; the checklist
reuses those exact in-flight queries. Checklist profile/rules/progress reads
abort after 8 seconds and use `retry: false`. Onboarding writes only minimal
non-PII profile fields, then `get_policy_consent_state()` returns the
authoritative allowlisted profile that is cached before checklist navigation.
Onboarding auth, profile insert/update, and confirmation waits are each bounded
at 10 seconds. Measure cold/warm launch on representative phones and constrained
networks; local code changes are not proof of user-perceived startup time.

`EXPO_PUBLIC_LEGAL_SITE_URL` defaults to
`https://relogo-two.vercel.app`; set it explicitly in EAS only when switching to
a replacement origin whose `/privacy` and `/terms` routes have been verified.

The BC form download is fail-closed against the SHA-256 in
`mobile/lib/pdfTemplates.ts`. If the government replaces the file, do not merely
copy the new hash: inspect actions and links, revalidate every mapped field,
repeat editable Unicode round-trip tests, and obtain the required content/legal
review before repinning it.

Real-device PDF QA must also confirm that over-limit and integrity failures
occur before local PII is read, backgrounding cancels an active blank-form
transfer, mapped and Unicode values render in an editable form, and the
pre-share warning appears before the chooser. On Android, cancel the chooser
once and share once to an asynchronous target such as Gmail or Drive: the
receiver must remain able to read during the ten-minute grace, and ReloGo's
exact cached source must be gone once the app is active after that grace. App
start and next fill reschedule younger files or delete expired ones; sign-out
and account deletion wipe the cache unconditionally.

For local development copy `mobile/.env.example` to `mobile/.env`.

Before store submission, a human account owner/legal reviewer must confirm the
draft App Store Connect and Google Play disclosures in `docs/STORE.md`, including
anonymous account-linked move/progress/support data, Gemini processing, and
device-only PII. The live App Store "Data Not Collected" answer must be
corrected. Complete Apple metadata, reconcile the age rating shown by Apple,
and inspect availability/trader status in App Store Connect without assuming
why European/UK storefronts are absent. Also complete 2FA/account steps, final
screenshots, real-device QA, and a monitored Support URL. Never describe a Git
draft as a completed store form. Apple device
registration/2FA and Google Play service-account provisioning are account-owner
actions, not engineering verification.

## 5. Rule-monitor worker (Python 3.11 + Playwright)

The worker is part of launch operations: it keeps official-source content under
review by filing admin alerts. Its daily GitHub Actions workflow is at
`.github/workflows/worker.yml`; scheduling requires that file on the default
branch plus the secrets in [Scheduling](#scheduling-free).

The worker is containerized (`worker/Dockerfile`, `python:3.11-slim` with
Chromium for Playwright).

Migrations 011 and 023 must be applied first; both are now present in
production. Local migration 027 must also be applied before the coordinated
worker changes are run; it is not yet hosted. Do not apply 027 while the daily
schedule still executes the older default-branch worker: that implementation
ignores `monitor_url` and could repopulate the nine cleared automatic baselines
from canonical blocked pages. First schedule the coordinated worker, or
explicitly pause the old schedule and run the reviewed `tamim` workflow
manually. The service role can read the
narrow source columns and execute
`persist_official_source_scrape()` but cannot directly edit source baselines or
alert rows. The RPC atomically files a PENDING alert and advances its baseline;
stale compare-and-swap work is discarded and reported.

The workflow runs `worker/preflight.py` before browser installation. It
accepts only `https://yskknolxbxfxakgvrcmg.supabase.co`, rejecting preview,
lookalike hosts, credentials, ports, paths, queries, and fragments before its
read-only key/schema/resolver checks. Production has the required resolver.
`worker/requirements.txt` pins `supabase==2.31.0`. Pull request #2's compile and
77/77 worker tests passed. Post-merge safeguards fetch duplicate URLs once, serialize
and pace each origin, and classify access challenges without weakening the
failure policy; the expanded suite passes 97/97. Main run `30843904269` passed
the key/schema/resolver preflight and created 42 baselines. Hardened production
run `30845791036` fetched 50 unique URLs for 53 rows, reused three duplicate
outcomes, completed 42 rows (`1` baseline, `38` unchanged, `3` changed), and
kept 11 outcomes failed closed (`8` managed challenges, `2` CAPTCHAs, `1`
empty-body rejection). Production now has 43/53 baselines. The three changes
are PENDING human-review alerts; the worker did not update live rules.

Those 11 failed rows represented 10 unique canonical URLs. The local migration
027 treatment preserves every canonical `official_url` exposed to users. Nine
rows use separate, worker-only first-party monitor targets; all nine targets
passed worker-equivalent local reachability checks. Yukon driver-licence and
vehicle-registration rows have no approved safely reachable equivalent and are
instead MANUAL assignments owned by ReloGo operations every 30 days. The
updated worker excludes those rows from automatic fetching and lists them in
every Actions summary. The cadence records responsibility only—it is not proof
of review and does not track overdue work. Challenge/content gates remain fail-
closed, and the persistence RPC rejects writes to manual rows. These changes
are local/pending review: no hosted migration, worker deployment, or live rerun
has occurred.

Worker-equivalent reachability does not prove complete semantic coverage. The
Quebec surrogate contains high-level RAMQ guidance rather than the full RAMQ
procedure; the Nunavut vehicle surrogate is a general driver manual; the PEI
school source covers the English Public Schools Branch; and the Yukon school
policy omits some registration steps and school authorities. A green Actions
run means the configured automatic checks completed, not that these content
gaps disappeared. Keep them in the human content/legal review gate.

Local verification of this tranche passes a fresh reset through migration 027,
public-schema lint, pgTAP 207/207, worker compile/tests 106/106, database type
sync, mobile TypeScript, and the admin production build. The API E2E run passed
247/248 before the local Edge Runtime stopped and returned 503; after restarting
that local service, the exact remaining anonymous-function test passed.

```bash
cd worker
docker build -t relogo-worker .
docker run --rm \
  -e SUPABASE_URL=https://yskknolxbxfxakgvrcmg.supabase.co \
  -e SUPABASE_SERVICE_ROLE_KEY=<service-role-key> \
  relogo-worker
```

Optional tuning: `PAGE_TIMEOUT_MS` (default 30000), `NAV_TIMEOUT_MS`
(default 60000), `SCRAPE_CONCURRENCY` (default 8),
`ORIGIN_MIN_SPACING_SECONDS` (default 1.0, capped at 10),
`ORIGIN_MAX_JITTER_SECONDS` (default 0.25, capped at 2),
`MAX_HTML_TEXT_CHARS` (default and hard ceiling 1000000 characters), and
`MAX_PDF_BYTES` (default 25 MiB).

### Scheduling

The workflow defines a daily cron (`0 2 * * *` UTC) plus a manual **Run
workflow** button. It and the required `SUPABASE_URL` and
`SUPABASE_SERVICE_ROLE_KEY` secret names are on the default branch. GitHub
Actions variables are corrected. Main run `30843904269` confirmed the exact
production origin and existing encrypted key with the `2.31.0` preflight; do
not rotate it. The full run scraped and persisted 42 of 53 sources, then exited
nonzero because 11 rows across 10 URLs returned anti-bot/CAPTCHA responses or
empty content. Preserve this fail-closed visibility: never baseline a block
page, solve/evasion-test a CAPTCHA, or use an
unreviewed cache/third-party mirror. Review and apply migration 027 before
running its coordinated worker changes. Require all nine automatic targets to
remain healthy and both Yukon manual assignments to appear in the Actions
summary. Configure and exercise optional `ALERT_WEBHOOK_URL`, which is currently
unset. The secret key bypasses RLS and belongs only in the worker, never a
client.

Hardened verification run `30845791036` intentionally exited nonzero after the
successful preflight because 11 source-row outcomes remained inaccessible. It
also demonstrated exact-URL deduplication (50 fetches for 53 rows) and filed
three PENDING alerts for human review: Manitoba Health navigation/layout churn
and two ICBC footer `Feedback` toggles. Do not auto-approve or auto-dismiss
them; preserve the admin review boundary.

Local run without Docker:

```bash
cd worker
python3.11 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
SUPABASE_URL=https://yskknolxbxfxakgvrcmg.supabase.co \
  SUPABASE_SERVICE_ROLE_KEY=... python preflight.py
playwright install chromium
SUPABASE_URL=https://yskknolxbxfxakgvrcmg.supabase.co \
  SUPABASE_SERVICE_ROLE_KEY=... python main.py
```

## 6. Secrets and PIPEDA notes

- Only the Supabase **publishable key** (or legacy anon key) ever ships in
  landing, admin, or mobile builds. Existing `*_ANON_KEY` names are retained
  for compatibility.
- The **service role** key is used only by the worker and Supabase-managed
  server functions. It never ships in a client. These workloads currently
  share the aggregate `service_role` capability set; they are not isolated by
  workload-specific database credentials.
- Personal information (health card number, driver's licence number, street
  address, full name, date of birth) lives only in `expo-secure-store` on the
  device (`mobile/lib/secureStore.ts`). It must never appear in a Supabase
  query, log, error message, or any deployed environment variable.

### Secret leakage audit findings

A comprehensive repository security audit was conducted to verify credential
hygiene across all tracked files, local development environments, and Git
history:

1. **Tracked files audit**:
   Automated pattern scanning across the entire repository tree for sensitive
   credential patterns:
   - Supabase secret keys (`sb_secret_`, `service_role` tokens);
   - Google AI Studio / Gemini API keys (`AIza[0-9A-Za-z_-]{35}`);
   - GitHub Personal Access Tokens (`ghp_`, `github_pat_`);
   - Private key blocks (RSA, EC, OpenSSH `BEGIN PRIVATE KEY`); and
   - Hardcoded database passwords or authorization tokens.
   **Finding**: ZERO leaked production credentials or private keys exist in
   tracked repository files.

2. **Local environment isolation**:
   All `.env` files across root, `landing/`, `admin/`, and `mobile/` (`.env`,
   `.env.local`, `.vercel/.env.*`, `admin/.env*`, `mobile/.env`) are strictly
   ignored by `.gitignore` and contain no tracked history.

3. **Integration test mock credentials**:
   `tests/e2e/conftest.py` contains mock JWT tokens with issuer `"iss":
   "supabase-demo"`. These are the standard, publicly documented local Supabase
   Docker demo tokens. They function exclusively against an ephemeral local
   Docker container listening on `127.0.0.1:54321` and cannot be used against
   hosted preview or production environments.

4. **Historical bootstrap credentials rotation note**:
   Historical commit `059ccd43` (dated 2026-07-14) introduced bootstrap helpers
   `create_admin.py` and `create_admin.sql` containing a default admin
   credential pair (`admin@relogo.app` / `crypt('password123', gen_salt('bf'))`).
   While commit `7c6edfef` subsequently excised both files from the working tree,
   the plaintext password remains permanently recorded in repository commit
   history.
   **Operational Action**:
   - Treat the historical bootstrap password as publicly compromised.
   - Any admin user created using historical bootstrap credentials in hosted
     Supabase environments (`yskknolxbxfxakgvrcmg` or `uwfblgllkibbupqyofkl`)
     must be rotated or re-provisioned with strong unique credentials via the
     Supabase Dashboard before public launch.
   - Schedule a Git-history purge (e.g., via `git-filter-repo` or BFG Repo-Cleaner)
     as a post-release maintenance task to eliminate the historical commit
     without disrupting active branches during release execution.

### Support chat (threads + messages)

Authenticated app support is delivered as in-app **chat threads**. A user
selects one of six fixed general questions; there is no free-text client field.
An admin can take over from the dashboard's **Messages** tab. A future monitored
public mailbox for website, waitlist, privacy, and accessibility requests is a
separate channel and must never feed arbitrary text into these support tables or
Gemini. The chat data model begins in
`004_support_messages.sql` and is privacy-hardened by migrations 010, 012, and
014:

- `support_threads` — one row per conversation, with a `status` of `AI`
  (AI answering), `AWAITING_HUMAN` (escalated, AI stopped, waiting for an
  admin), `HUMAN` (an admin is handling it), or `RESOLVED` (closed).
- `support_messages` — one row per message, with a `sender` of `user`, `ai`,
  or `admin`.

Database policy accepts only the exact fixed user questions, and authenticated
clients cannot author free-text thread subjects. Neither table can receive the
on-device personal information listed above through the application/API grants.
The database permanently records the first HUMAN transition or admin reply, so
resolving and reopening a human-involved thread cannot make it AI-eligible
again.

Live updates flow over Supabase Realtime (enabled on both tables by the
migration), so the user's app and the admin dashboard see new messages without
polling.

### AI support (Edge Function)

General questions are answered by the Supabase **Edge Function** at
`supabase/functions/support-ai/`. The mobile client inserts the selected fixed
question, then invokes the function with only `thread_id`. The function scans
all user turns, fails closed on unknown/legacy text or human history, bounds
usage/context, and atomically persists a reply only if the same user turn is
still latest and the thread remains AI-owned.

Current state: preview v3 was authenticated-smoke-tested before being paused.
Production v5 is ACTIVE with JWT verification and returns 401 unauthenticated;
its public resolver smoke passed. v5 grounds through
`resolve_corridor_rules()`, validates/bounds HTTPS sources, uses current
reviewed Gemini model IDs, applies a 12-second provider deadline across both
response headers and the full response-body read, caps output, and returns
generic PII-safe failures. Keep authenticated production support in the release
QA matrix even though unauthenticated/JWT behavior is verified.

Deploy and configure it:

```bash
# Optional preview QA only after the owner resumes preview. Always target it
# explicitly. The env file must be outside the repo and contain exactly:
# GEMINI_API_KEY=<your-key>
PREVIEW_REF="replace-with-preview-project-ref"
PRODUCTION_REF="replace-with-production-project-ref"
GEMINI_ENV_FILE="/secure/path/outside-repo/relogo-gemini.env"

supabase secrets set --project-ref "$PREVIEW_REF" \
  --env-file "$GEMINI_ENV_FILE"
supabase functions deploy support-ai \
  --project-ref "$PREVIEW_REF" --use-api
supabase functions list --project-ref "$PREVIEW_REF"

# Future production source deploys require fresh CI and explicit authorization.
# Production already has GEMINI_API_KEY; do not reset it for a source-only
# deploy. Run authenticated production smoke immediately afterward.
supabase functions deploy support-ai \
  --project-ref "$PRODUCTION_REF" --use-api
supabase functions list --project-ref "$PRODUCTION_REF"
```

Never rely on the currently linked project for secret or function commands.
Keep JWT verification enabled; do not pass `--no-verify-jwt`. See
[PLAN.md](PLAN.md) for the current deployment/secret status.

After either deployment, inspect `supabase functions list --project-ref ...`,
verify the expected version is ACTIVE with JWT verification, confirm an
unauthenticated request is rejected, and run the authenticated non-fallback
support smoke. A safe fallback alone is not authenticated AI verification.

Only `GEMINI_API_KEY` must be set: `SUPABASE_URL` and
`SUPABASE_SERVICE_ROLE_KEY` are auto-injected into Edge Functions by Supabase,
so do not set them yourself. The key is **never** embedded in the mobile or
admin app — it lives only as a Supabase secret read server-side by the function.

Create the key in Google AI Studio. The function tries the stable models in the
`MODELS` list in order and falls through to a human-handoff response on
quota/availability errors. Re-verify current model IDs and provider terms before
the recovery production deploy and before later mobile releases.

### Support / privacy guarantees

- Personal IDs (full name, DOB, street address, driver's licence number, health
  card number) never reach the server or AI; fixed questions cannot contain
  them and on-device PII is never read by support.
- Once a human takes over a thread (`AWAITING_HUMAN` / `HUMAN`), the AI stops —
  the Edge Function will not send that conversation to Gemini.
- No public mailbox is currently configured. Keep
  `NEXT_PUBLIC_SUPPORT_EMAIL` empty until a monitored privacy, support, and
  accessibility channel exists; never publish a non-operational address or a
  private/admin inbox.

## 7. CI

`.github/workflows/ci.yml` runs on pushes to `main`/`tamim` and on pull requests:

- Node jobs use Node 22. Pull request #2 final head `f34b64a` passed all 19
  GitHub/Vercel checks, both fixed review threads were resolved, and it merged
  to `main` as `e75f449`.
- `mobile-typecheck`: clean install, release-config preflight, Expo dependency
  alignment, TypeScript
- `mobile-lint`: clean install, ESLint (`eslint-config-expo` flat config)
- `mobile-test`: Jest account/date/support/legal/PDF/error-reporting tests
- `mobile-native-export`: iOS and Android Hermes exports
- `admin-build`: `npm ci && npm run build` in `admin/`
- `landing-build`: clean install, ESLint, and static production build
- `db-tests`: pinned Supabase CLI, fresh local stack, schema lint, pgTAP
- `e2e-test`: full Python local integration/E2E suite (do not hard-code an old
  case count; record collection/results for the exact release tree)
- `support-ai-test`: allowlist sync plus Deno format, lint, type, and helper tests
- `consent-version-sync`: verifies mobile, legal-page, and database policy versions
- `worker-compile`: compiles worker and read-only preflight modules
- `worker-test`: Python 3.11 pytest suite
- `types-sync`: verifies the mobile/admin `Database` interfaces are byte-identical

The web builds use placeholder Supabase env values in CI; real values are
injected by Vercel at deploy time.

On the latest full code matrix at `2624ad3`, admin/landing lint and builds, Deno
format/lint/type checks with 16/16 support tests, worker compile with 77/77
tests, and the mobile gates recorded above all pass. Pull-request run
`30703006224` passed all 19 checks on `2624ad3`; later commits require fresh CI
evidence. A focused 2026-08-03 recheck on the documentation tree passed mobile
116/116, TypeScript, release configuration, worker 77/77, Gemini transport 4/4,
Python dependency consistency, uptime shell syntax, and whitespace checks.

Pull request #2 final head `f34b64a` passed all 19 GitHub/Vercel checks and was
merged as `e75f449`. Main-branch uptime run `30843906264` then passed the public
web, production anonymous-auth, and canonical-resolver probes with
`REQUIRE_SUPABASE_CHECK=true`. The script rejects every backend URL except the
exact production origin `https://yskknolxbxfxakgvrcmg.supabase.co`. One passing
run does not prove recurring schedule or alert ownership. Never put a secret/
service-role key in the uptime probe.

## 8. Incident Runbook and Monitoring

### Support Ownership and Monitoring Setup

- **Public inbox:** not configured. Assign an owner and response expectation,
  then publish the monitored address through `NEXT_PUBLIC_SUPPORT_EMAIL`.
- **Edge Function:** review `support-ai` logs for exceptions, Gemini rate limits,
  policy-consent failures, and fallback surges.
- **Worker:** hardened run `30845791036` passed preflight and left 43/53
  baselines; key rotation is not needed. Review and roll out local migration 027
  before its worker changes, then require a healthy live rerun with both Yukon
  manual assignments visible. Configure a webhook and explicit GitHub Actions
  alert owner; `ALERT_WEBHOOK_URL` remains unset.
- **App uptime:** main run `30843906264` passed the public web, production
  anonymous-auth, and resolver checks against the exact production origin.
  Establish recurring schedule and alert ownership before relying on it as an
  operational monitor. Provider status pages are useful incident context, but
  are not ReloGo app monitoring.
- **Crash/error monitoring:** the mobile app now captures crashes/errors
  on-device in a PII-safe form behind a top-level `AppErrorBoundary` and a
  global handler (`mobile/lib/errorReporting.ts`) — identifiers, emails, and
  opaque tokens are redacted, only non-PII metadata is kept, and nothing is
  transmitted off-device. No external crash service is wired yet; adding one is
  a deliberate, privacy-reviewed decision and it must receive only the sanitized
  record from `reportFatalError`, never a raw error.

### Alert webhook setup and operational runbook

The rule-monitoring worker communicates run summaries, failures, and rule change
alerts through an incoming webhook configured in GitHub Actions.

#### 1. `ALERT_WEBHOOK_URL` secret configuration
1. In the GitHub repository, navigate to **Settings → Secrets and variables →
   Actions → Repository secrets**.
2. Click **New repository secret**.
3. Name: `ALERT_WEBHOOK_URL`.
4. Value: The HTTPS incoming webhook URL provided by your team communication
   platform:
   - **Slack**: Create an Incoming Webhook app; use URL `https://hooks.slack.com/services/...`.
   - **Discord**: In channel settings, create a Webhook and append `/slack` to
     the generated URL (e.g. `https://discord.com/api/webhooks/.../slack`) to
     enable Slack-compatible JSON payload processing.
   - **Microsoft Teams**: Create an Incoming Webhook connector and use the
     generated URL.
5. Click **Add secret**. GitHub Actions masks the secret value in all workflow
   logs.

#### 2. Responder channel and platform assignment
- **Platform**: Slack or Discord.
- **Channel**: `#relogo-ops-alerts` (dedicated operations alert channel).
- **Assigned team**: ReloGo Operations & On-Call Engineering.
- **Alert classifications and response SLAs**:
  - **PENDING Rule Change Alert**: Triggered when government portal content
    changes (hash mismatch or content update). Action: Admin signs into
    `https://relo-go.vercel.app`, reviews the visual diff, and clicks
    **Approve** or **Dismiss**. **Response SLA**: 24 hours.
  - **Worker Execution Failure**: Triggered when `main.py` exits nonzero due to
    unreachable targets, anti-bot challenges, or timeout. Action: Inspect
    failed source URLs, verify if government domains changed, and triage.
    **Response SLA**: 4 hours during business days.

#### 3. Standalone test verification
To independently verify webhook connectivity and channel delivery without
waiting for the nightly cron or executing a full scraper run:

```bash
# Option A: Standalone curl probe
curl -X POST -H 'Content-Type: application/json' \
  -d '{"text":"[ReloGo Operations Alert] Standalone webhook verification probe successful. Monitoring channel #relogo-ops-alerts active."}' \
  "$ALERT_WEBHOOK_URL"
```

Verify that the message appears immediately in `#relogo-ops-alerts`.

```bash
# Option B: Worker reporting module probe
cd worker
python3.11 -c "
import os, sys, reporting
url = os.environ.get('ALERT_WEBHOOK_URL')
if not url:
    print('ERROR: Set ALERT_WEBHOOK_URL before running test', file=sys.stderr)
    sys.exit(1)
payload = {
    'summary': 'Verification Probe',
    'total': 53,
    'completed': 42,
    'unchanged': 40,
    'changed': 2,
    'pending_alerts': 2,
    'stale': 0,
    'failed': 0,
}
reporting.post_webhook(url, payload)
print('SUCCESS: Webhook payload delivered.')
"
```

#### 4. Failure handling and resilience architecture
- **Non-blocking delivery**: In `worker/reporting.py`, the `post_webhook()`
  function wraps HTTP POST requests in a `try / except Exception` block. If the
  webhook endpoint times out (10-second request bound), returns an HTTP 4xx/5xx
  status, or suffers a network drop, it logs a warning (`logger.warning("Failed
  to post alert webhook: %s", err)`) and continues without throwing. Webhook
  outages will **never** cause the worker to abort, fail a healthy scrape, or
  prevent database baseline persistence.
- **Dual-alert notification behavior**: The GitHub Actions workflow
  `.github/workflows/worker.yml` contains two notification paths:
  1. Application-level rich summary sent by Python `reporting.py` at the end
     of `main.py`.
  2. Step-level fallback curl command executed conditionally if the job fails
     (`if: failure() && env.ALERT_WEBHOOK_URL != ''`).
  Operators should be aware that when an unexpected worker failure occurs, both
  notifications may fire in `#relogo-ops-alerts`.
- **Secondary fallback**: If the webhook service is down, GitHub Actions
  native email notifications (sent to repository owners and contributors on
  workflow failure) serve as the automated secondary alerting channel.

### Incident Runbook

#### 1. Worker Failure (GitHub Actions Alert)
**Symptom:** You receive a "Run failed" email from GitHub Actions for the `worker.yml` workflow.
**Action:**
1. Open the GitHub Actions tab and inspect the failed worker logs.
2. Determine whether the failure happened during runner setup, authentication,
   or source fetching; rerun only after the cause is understood.
   The modern 2.31.0/preflight source is on the default branch. Verify
   the run used that merged dependency before diagnosing a current
   authentication failure or rotating a valid key unnecessarily.
3. Triage every failed automatic source and verify every manual assignment is
   listed. The last live incident contained 11 failed rows across 10 URLs; the
   local migration 027 treatment is not production evidence until it is
   reviewed, applied before the coordinated worker, and live-rerun. Do not
   silently wait for the next cron or treat a 30-day assignment as proof of
   review.
4. If a site structure changed, update and test the bounded extraction logic.
5. If Supabase failed, verify the scoped secrets and project health without
   printing credentials.

#### 2. AI Support Fallback Surge
**Symptom:** An unusual spike in `AWAITING_HUMAN` support threads in the admin dashboard.
**Action:**
1. Check the `support-ai` Edge Function logs in the Supabase dashboard.
2. Look for `429 Too Many Requests` (Gemini API quota exceeded) or `500 Internal Server Error`.
3. If quota is exceeded, consider upgrading the Google AI Studio tier or increasing the rate limits.
4. While AI is degraded, all user queries safely fallback to `AWAITING_HUMAN`. Operations must manually resolve them from the Admin dashboard.

#### 3. Database Outage or Data Corruption
**Symptom:** Apps fail to load data, or admin dashboard reports a database connection error.
**Action:**
1. Check [Supabase Status](https://status.supabase.com/) for ongoing platform incidents.
2. Stop unsafe writes, preserve evidence, and follow
   `docs/BACKUP_RESTORE.md`. Backup plan/retention/PITR are not currently
   approved as operational; use only capabilities verified in the Dashboard
   and do not practice an in-place restore on production.
3. Establish a monitored public incident channel before launch; no public
   status page or mailbox currently exists.

#### 4. Mobile opens slowly or cannot reach the backend

**Symptom:** A user remains on loading/retry UI, or the store build cannot reach
Supabase.

1. Identify the exact binary version/runtime/channel and embedded project ref.
   The shipped 1.0 / SDK 51 binary points to a deleted project and cannot be
   repaired by OTA; direct the incident to the 1.0.1 store-release plan.
2. For 1.0.1+, distinguish the three-second local secure-session restore, the
   five-second consent/profile bootstrap, and the eight-second abortable
   checklist reads. Onboarding auth, profile insert/update, and authoritative
   confirmation each use a ten-second bound. Automatic query retry is
   intentionally disabled. Do not log session tokens or user-entered PII.
3. Verify Supabase health, anonymous auth, resolver availability, and the EAS
   environment mapping. Do not lengthen startup timeouts merely to hide a
   backend/configuration failure.
4. OTA is an option only when the installed binary has a compatible
   app-version runtime/channel and the update has passed preview QA.

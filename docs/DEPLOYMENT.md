# ReloGo Deployment Guide

Pinned stack: Next.js 16 (static export) for the landing page, Vite 5 for the
admin dashboard, Expo SDK 55 / React Native 0.83 / EAS for mobile, Supabase
(Postgres + Auth + RLS) for the backend, and a Python 3.11 Playwright worker for
rule monitoring.

## 0. Order of operations

Follow these top-to-bottom for a first deploy. Use isolated preview and
production environments; do not point preview builds at production data.

| # | Step | Section |
| --- | --- | --- |
| 1 | Push migrations 001–022, enable anonymous sign-ins, verify admin | [§1](#1-supabase-database) |
| 2 | Fill each app's `.env` from `.env.example` | per app below |
| 3 | Deploy landing + admin to Vercel | [§2](#2-landing-page-nextjs-16-static-export-vercel), [§3](#3-admin-dashboard-vite-5-spa-vercel) |
| 4 | Deploy the `support-ai` function + set `GEMINI_API_KEY`; build mobile via EAS | [§4](#4-mobile-app-expo-sdk-55-eas) |
| 5 | Configure, baseline, and schedule the worker | [§5](#5-rule-monitor-worker-python-311--playwright) |

**Configured cloud mapping:** separate Supabase preview and production projects
use `ca-central-1`. Vercel project `relogo` maps to `landing/`; `relo-go` maps
to `admin/`. Development/preview variables target the preview backend and
production variables target production in both Vercel and the registered EAS
project. Values remain platform-managed and are not committed.

The worker workflow and required Supabase repository secrets are on the default
branch. Its first manual run failed during Playwright system-dependency setup on
Ubuntu 24.04, before the scraper started. The local workflow pins Ubuntu 22.04;
commit that fix and rerun it before treating monitoring as operational.

## 1. Supabase (database)

Migrations live in `supabase/migrations/` and are the single source of truth
for the schema (`001_init.sql` through
`020_content_audit_corrections.sql`). Hosted preview and production currently
have 001–018; verify 019–020 in preview before promoting the same files to
production. Migration 005 seeds provisional destination-wide content plus a
federal CRA task. Migration 020 conservatively removes unsafe exact timing and
leaves 12 numeric deadlines. This content is useful for testing but is not a
substitute for final government, legal, and corridor-specific review.

Migration 019 and policy version 1.1 are a coordinated release boundary. First
deploy and verify the version 1.1 legal pages, then apply 019–020 to preview and
test a current SDK 55 preview build. Promote 019 to production only when the
matching mobile binary can be released: older binaries do not know the consent
state RPC and will fail closed once the server requires version 1.1.

The support-chat feature requires `004_support_messages.sql`, which creates
the `support_threads` and `support_messages` chat tables (+ RLS) and enables
Supabase Realtime on both so clients receive live message updates. Apply it
with `supabase db push` like any other migration; the Messages tab in the
admin dashboard and the in-app support chat will not work until it is applied.

```bash
# One-time: authenticate and link the project
supabase login
supabase link --project-ref <your-project-ref>

# Apply all pending migrations to the linked project
supabase db push
```

For this repository, always link and verify preview first, promote the same
migration set to production only after preview passes, then relink preview. Do
not run `supabase config push`: the committed config intentionally contains
localhost Auth URLs for local development.

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

Supabase CLI 2.107.0 may warn that its optional pg-delta migration catalog cache
could not read a temporary CA file. Treat a push as successful only when the
command finishes, remote migration history matches, and the post-push dry run,
lint, and pgTAP checks all pass.

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

Before launch, select a plan that meets the required managed backup/PITR
posture and perform a documented restore drill. Project provisioning alone
does not meet that gate. Current results and blockers live in
[PLAN.md](PLAN.md).

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

The current public alias is `https://relogo-two.vercel.app`. The custom
`relogo.app` domain is not configured. The local `/support` and versioned legal
pages are newer than the deployed build; redeploy, then smoke-test `/`,
`/privacy`, `/terms`, `/support`, `/robots.txt`, and `/sitemap.xml` before
promotion.

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
The public alias is `https://relo-go.vercel.app`. Before deploying, inspect the
local Vercel link: `admin/.vercel/project.json` currently names a separate
`admin` project, so relink or explicitly target the intended `relo-go` project.

## 4. Mobile app (Expo SDK 55, EAS)

Build profiles are defined in `mobile/eas.json` (`development`, `preview`,
`production`; EAS CLI `>= 12.0.0`, remote app version source with
auto-increment in production).

Local iOS and Android Hermes exports pass. The only existing EAS artifacts are
three old SDK 51 production builds; they are not evidence for the current SDK
55 tree. New preview builds and real-device QA are required before release.

```bash
cd mobile
npm ci
npx expo start                                  # local development

npm install -g eas-cli                          # or: npx eas-cli ...
eas login
eas build --profile preview --platform all      # internal distribution
eas build --profile production --platform all   # store build
eas submit --profile production --platform all  # store submission
```
`mobile/eas.json` explicitly selects the EAS `development`, `preview`, and
`production` environments and intentionally stores no project values. The
registered EAS project already has `EXPO_PUBLIC_SUPABASE_URL` and
`EXPO_PUBLIC_SUPABASE_ANON_KEY`: development/preview target preview Supabase;
production targets production. Verify them with
`eas env:list --environment <name>` after any rotation. The publishable key
(stored under the compatibility `*_ANON_KEY` name) is public by design;
RLS/RPCs are the security boundary.

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

## 5. Rule-monitor worker (Python 3.11 + Playwright)

The worker is part of launch operations: it keeps official-source content under
review by filing admin alerts. Its daily GitHub Actions workflow is at
`.github/workflows/worker.yml`; scheduling requires that file on the default
branch plus the secrets in [Scheduling](#scheduling-free).

The worker is containerized (`worker/Dockerfile`, `python:3.11-slim` with
Chromium for Playwright).

Migration 011 must be applied first. The service role can read the narrow source
columns and execute `persist_official_source_scrape()` but cannot directly edit
source baselines or alert rows. The RPC atomically files a PENDING alert and
advances its baseline; stale compare-and-swap work is discarded and reported.

```bash
cd worker
docker build -t relogo-worker .
docker run --rm \
  -e SUPABASE_URL=https://<your-project-ref>.supabase.co \
  -e SUPABASE_SERVICE_ROLE_KEY=<service-role-key> \
  relogo-worker
```

Optional tuning: `PAGE_TIMEOUT_MS` (default 30000), `NAV_TIMEOUT_MS`
(default 60000), `SCRAPE_CONCURRENCY` (default 8), `MAX_HTML_TEXT_CHARS`
(default and hard ceiling 1000000 characters), and
`MAX_PDF_BYTES` (default 25 MiB).

### Scheduling

The workflow defines a daily cron (`0 2 * * *` UTC) plus a manual **Run
workflow** button. It and the required `SUPABASE_URL` and
`SUPABASE_SERVICE_ROLE_KEY` secrets are already on the default branch. Commit
the local Ubuntu 22.04 runner fix, manually rerun the workflow, triage every
failed source, and establish a healthy baseline. Configure and exercise the
optional `ALERT_WEBHOOK_URL`; that secret is currently absent. The service role
key bypasses RLS and belongs only in the worker environment, never in a client
app.

Local run without Docker:

```bash
cd worker
python3.11 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
playwright install chromium
SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... python main.py
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

Deploy and configure it:

```bash
# Always target preview explicitly. The env file must be outside the repo and
# contain exactly: GEMINI_API_KEY=<your-key>
PREVIEW_REF="replace-with-preview-project-ref"
PRODUCTION_REF="replace-with-production-project-ref"
GEMINI_ENV_FILE="/secure/path/outside-repo/relogo-gemini.env"

supabase secrets set --project-ref "$PREVIEW_REF" \
  --env-file "$GEMINI_ENV_FILE"
supabase functions deploy support-ai \
  --project-ref "$PREVIEW_REF" --use-api
supabase functions list --project-ref "$PREVIEW_REF"

# After an authenticated preview Gemini/support flow passes, promote explicitly.
supabase secrets set --project-ref "$PRODUCTION_REF" \
  --env-file "$GEMINI_ENV_FILE"
supabase functions deploy support-ai \
  --project-ref "$PRODUCTION_REF" --use-api
supabase functions list --project-ref "$PRODUCTION_REF"
```

Never rely on the currently linked project for secret or function commands.
Keep JWT verification enabled; do not pass `--no-verify-jwt`. See
[PLAN.md](PLAN.md) for the current deployment/secret status.

Only `GEMINI_API_KEY` must be set: `SUPABASE_URL` and
`SUPABASE_SERVICE_ROLE_KEY` are auto-injected into Edge Functions by Supabase,
so do not set them yourself. The key is **never** embedded in the mobile or
admin app — it lives only as a Supabase secret read server-side by the function.

Create the key in Google AI Studio. The function tries the stable models in the
`MODELS` list in order and falls through to a human-handoff response on
quota/availability errors. Re-verify current model IDs and provider terms before
production deployment.

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

- `mobile-typecheck`: clean install, Expo dependency alignment, TypeScript
- `mobile-lint`: clean install, ESLint (`eslint-config-expo` flat config)
- `mobile-test`: Jest account/date/support/legal/PDF/error-reporting tests
- `mobile-native-export`: iOS and Android Hermes exports
- `admin-build`: `npm ci && npm run build` in `admin/`
- `landing-build`: clean install, ESLint, and static production build
- `db-tests`: pinned Supabase CLI, fresh local stack, schema lint, pgTAP
- `e2e-test`: 85-case Python local integration/E2E suite
- `support-ai-test`: allowlist sync plus Deno helper tests
- `consent-version-sync`: verifies mobile, legal-page, and database policy versions
- `worker-compile`: compiles worker modules
- `worker-test`: Python 3.11 pytest suite
- `types-sync`: verifies the mobile/admin `Database` interfaces are byte-identical

The web builds use placeholder Supabase env values in CI; real values are
injected by Vercel at deploy time.

`.github/workflows/uptime.yml` is a separate local pending scheduled workflow.
After the new support route is deployed and a manual dispatch passes, set the
repository variable `UPTIME_ENABLED=true` to activate its schedule. Configure
explicit GitHub notification ownership rather than assuming failure email.

## 8. Incident Runbook and Monitoring

### Support Ownership and Monitoring Setup

- **Public inbox:** not configured. Assign an owner and response expectation,
  then publish the monitored address through `NEXT_PUBLIC_SUPPORT_EMAIL`.
- **Edge Function:** review `support-ai` logs for exceptions, Gemini rate limits,
  policy-consent failures, and fallback surges.
- **Worker:** commit the runner fix, establish a healthy 53-source baseline,
  configure a webhook, and assign explicit GitHub Actions alert ownership.
- **App uptime:** commit the uptime workflow after `/support` is live. Provider
  status pages are useful incident context, but are not ReloGo app monitoring.
- **Crash/error monitoring:** the mobile app now captures crashes/errors
  on-device in a PII-safe form behind a top-level `AppErrorBoundary` and a
  global handler (`mobile/lib/errorReporting.ts`) — identifiers, emails, and
  opaque tokens are redacted, only non-PII metadata is kept, and nothing is
  transmitted off-device. No external crash service is wired yet; adding one is
  a deliberate, privacy-reviewed decision and it must receive only the sanitized
  record from `reportFatalError`, never a raw error.

### Incident Runbook

#### 1. Worker Failure (GitHub Actions Alert)
**Symptom:** You receive a "Run failed" email from GitHub Actions for the `worker.yml` workflow.
**Action:**
1. Open the GitHub Actions tab and inspect the failed worker logs.
2. Determine whether the failure happened during runner setup, authentication,
   or source fetching; rerun only after the cause is understood.
3. Triage every failed government source. Fifteen sources currently need a bot,
   server-error, or extraction strategy; do not silently wait for the next cron.
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
   `docs/BACKUP_RESTORE.md`. The current free plan does not provide the required
   PITR posture; use PITR only after a capable plan is funded and a restore
   drill has passed.
3. Establish a monitored public incident channel before launch; no public
   status page or mailbox currently exists.

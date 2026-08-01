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
| 1 | Record/reverify production at exact 001–026 and `support-ai` v4; resume preview v3 only for preview QA | [§1](#1-supabase-database), [§6](#ai-support-edge-function) |
| 2 | Fill each app's `.env` from `.env.example` | per app below |
| 3 | Monitor the current 1.0.1 production builds and complete iOS/Android real-device QA | [§4](#4-mobile-app-expo-sdk-55-eas) |
| 4 | Use the owner passkey to update encrypted worker secrets, then run the production preflight/baseline and configure the webhook | [§5](#5-rule-monitor-worker-python-311--playwright) |
| 5 | Review backend-aware uptime run #113 and establish recurring monitoring/alert ownership | [§7](#7-ci), [§8](#8-incident-runbook-and-monitoring) |
| 6 | Create/submit the new store binary only after legal/store/ops approval | [§4](#4-mobile-app-expo-sdk-55-eas) |

**Configured cloud mapping:** separate Supabase preview and production projects
use `ca-central-1`. Vercel project `relogo` maps to `landing/`; `relo-go` maps
to `admin/`. Development/preview variables target the preview backend and
production variables target production in both Vercel and the registered EAS
project. Values remain platform-managed and are not committed.

Current hosted/repository truth (2026-07-31):

| Target | State |
| --- | --- |
| Preview Supabase `uwfblgllkibbupqyofkl` | Deliberately paused after exact 001–026, JWT-protected `support-ai` v3, and passing hosted smoke |
| Production Supabase `yskknolxbxfxakgvrcmg` | Active/currently linked; exact 001–026; dry run clean; `support-ai` v4 ACTIVE/JWT-protected with unauthenticated 401; self-cleaning smoke passed anonymous auth, resolver 5 tasks/5 HTTPS sources, minimal onboarding profile insert, authoritative consent/profile confirmation, and cleanup; profile/waitlist/support/progress empty |
| Mobile | Local version 1.0.1 / SDK 55 gates pass. iOS production build 6 is `FINISHED` (EAS `2c83c4f5-b154-4632-8604-6350a77bbee4`); Android production build 3 is `FINISHED` (EAS `20256d8c-cf12-472c-a236-7223e0207103`). Real-device QA and submission remain |
| Web/admin | Reviewed admin recovery is live at `https://relo-go.vercel.app`; landing is unchanged/live at `https://relogo-two.vercel.app`; backend-aware uptime run #113 passed production web/auth/resolver checks |
| Worker/uptime | Worker compile/tests 77/77 pass and backend-aware uptime run #113 passed; worker production baseline/webhook remain blocked by old encrypted secrets pending owner passkey update |
| GitHub | Recovery commit `0135964` and the final evidence update are pushed in pull request #2; Actions variables are corrected; encrypted secrets remain old pending owner passkey; required CI checks are the review gate |

The worker's Ubuntu 22.04 runner is already on `main`, and the modern
`supabase==2.31.0` client/preflight source is pushed in `0135964`. Old encrypted
worker values still block a current production baseline; update them only
through the owner's passkey-authorized flow and never print them.

## 1. Supabase (database)

Migrations live in `supabase/migrations/` and are the single schema source of
truth (`001_init.sql` through `026_distinct_move_provinces.sql`). Never edit a
hosted schema by hand or rewrite a deployed migration. The next migration is
027.

Preview and production both have exact migrations 001–026. Preview was verified
and deliberately paused. Production's post-push dry run is clean; anonymous auth
is enabled; the self-cleaning smoke passed anonymous auth, resolver output with
five tasks/five HTTPS sources, a minimal onboarding profile insert,
authoritative consent/profile confirmation, and cleanup; and profile, waitlist,
support, and progress tables contain zero rows. Recovery migrations add:

- 023: canonical exact/`ANY` corridor rule resolution plus ordered HTTPS
  official sources, reused by mobile/admin/AI;
- 024: one consent/bootstrap response with profile only for current consent;
- 025: `AVAILABLE`/`COMPLETED` progress only; and
- 026: rejection of new/updated same-origin/destination moves.

Migration 019/policy 1.1 and 023–026 are coordinated with the 1.0.1 client. The
currently shipped 1.0 binary points to a deleted backend and cannot be rescued,
so this is a new-binary recovery rather than an in-place compatibility rollout.
Still deploy matching legal pages and verify the 1.0.1 preview build before the
product release.

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

Preview's dry run should report no pending migrations. Re-run ledger, lint,
pgTAP, advisors, and the self-cleaning hosted smoke; then pause it again if no
preview work remains.

Production is currently linked locally and needs no schema push: its ledger is
exact 001–026 and dry run reports no pending migrations. Record the state with
read-only commands:

```bash
supabase link --project-ref yskknolxbxfxakgvrcmg
supabase migration list --linked
supabase db push --dry-run
```

Do not rerun a push merely to reproduce the already-complete promotion. The
next schema change is migration 027 and requires its own explicit approval,
preview verification, and pre/post ledger/dry-run/lint/pgTAP/advisor/smoke gates.
Stop and report any mismatch; do not repair history ad hoc. Never run
`supabase config push`: committed config contains localhost Auth URLs.

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
unchanged/live, and no landing deployment is pending for recovery commit
`0135964`. Backend-aware uptime run #113 passed its public route markers. The
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

The shipped App Store 1.0 binary is not recoverable: its compiled SDK 51 bundle
contains the deleted `fxrynmgaymslwcklfena` Supabase ref, it had no compatible
Expo Updates runtime, and there are zero OTA updates for it. Do not attempt an
`eas update` hotfix for that binary.

The recovery app is 1.0.1 / SDK 55 and now has app-version-based runtime
versioning, Expo Updates configuration, and a build-time release preflight.
This helps future compatible releases; it does not retroactively update 1.0.
The current iOS production store build is `FINISHED`: version 1.0.1, build 6,
EAS `2c83c4f5-b154-4632-8604-6350a77bbee4`. The Android production store build
is `FINISHED`: version 1.0.1, build 3, EAS
`20256d8c-cf12-472c-a236-7223e0207103`. The registered production EAS values
pass the release contract and signing credentials exist for iOS and Android.
The production dependency audit reports 0 vulnerabilities after an exact
`xcode@3.0.1` override pins the CommonJS-compatible `uuid@11.1.1`; keep that
override narrow and remove it when fixed upstream.
The final current-tree local mobile gates pass: release configuration,
TypeScript, lint, 11 Jest suites with 116/116 tests, iOS export at 1,752
modules/5.8 MB Hermes bytecode, Android export at 1,773 modules/5.9 MB Hermes
bytecode, and audit 0. Cloud build completion does not replace real-device QA
or store-submission evidence; do not start duplicate builds merely to reproduce
the recorded status.
Before internal iOS QA, the account owner must register a test iPhone. Before
automated Android submission, the owner must provide/review a Google Play
service-account key; otherwise use a documented owner-controlled manual path.

```bash
cd mobile
npm ci
npm run check:release
npx expo install --check
npm run lint
npm run typecheck
npm test -- --runInBand
npm audit --omit=dev
npx expo start                                  # local development

npm install -g eas-cli                          # or: npx eas-cli ...
eas login
eas env:list --environment preview
eas build --profile preview --platform all      # first: internal distribution

# Only after preview/device/legal/store/production gates all pass:
eas env:list --environment production
eas build --profile production --platform all
eas submit --profile production --platform all
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
heavy PDF engine until an explicit tap. Checklist profile/rules/progress reads
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
corrected. Complete Apple metadata, age rating, availability/trader status,
2FA/account steps, final screenshots, real-device QA, and a monitored Support
URL. Never describe a Git draft as a completed store form. Apple device
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
production. The service role can read the narrow source columns and execute
`persist_official_source_scrape()` but cannot directly edit source baselines or
alert rows. The RPC atomically files a PENDING alert and advances its baseline;
stale compare-and-swap work is discarded and reported.

The workflow runs `worker/preflight.py` before browser installation. It
accepts only `https://yskknolxbxfxakgvrcmg.supabase.co`, rejecting preview,
lookalike hosts, credentials, ports, paths, queries, and fragments before its
read-only key/schema/resolver checks. Production has the required resolver.
`worker/requirements.txt` pins `supabase==2.31.0`, and the modern client/
preflight source is pushed in recovery commit `0135964`. Current compile and
77/77 worker tests pass; they do not establish a live 53-source production
baseline.

```bash
cd worker
docker build -t relogo-worker .
docker run --rm \
  -e SUPABASE_URL=https://yskknolxbxfxakgvrcmg.supabase.co \
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
`SUPABASE_SERVICE_ROLE_KEY` secret names are on the default branch. GitHub
Actions variables are corrected, but encrypted worker secrets still contain
old values pending the owner's passkey-authorized update; review/update them
without printing them. After that update, confirm the exact production origin,
run preflight and one manual 53-source baseline, then configure and exercise the
optional `ALERT_WEBHOOK_URL`. Do not treat a green preflight as authorization
to enable recurring execution without named alert ownership. The secret key
bypasses RLS and belongs only in the worker, never a client.

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
Production v4 is ACTIVE with JWT verification and returns 401 unauthenticated;
its public resolver smoke passed. v4 grounds through
`resolve_corridor_rules()`, validates/bounds HTTPS sources, uses current
reviewed Gemini model IDs, applies a 12-second provider deadline across both
response headers and the full response-body read, caps output, and returns
generic PII-safe failures. Keep authenticated production support in the release
QA matrix even though unauthenticated/JWT behavior is verified.

Deploy and configure it:

```bash
# Resume preview first. Always target it explicitly. The env file must be outside the repo and
# contain exactly: GEMINI_API_KEY=<your-key>
PREVIEW_REF="replace-with-preview-project-ref"
PRODUCTION_REF="replace-with-production-project-ref"
GEMINI_ENV_FILE="/secure/path/outside-repo/relogo-gemini.env"

supabase secrets set --project-ref "$PREVIEW_REF" \
  --env-file "$GEMINI_ENV_FILE"
supabase functions deploy support-ai \
  --project-ref "$PREVIEW_REF" --use-api
supabase functions list --project-ref "$PREVIEW_REF"

# Future production redeploy only: require explicit approval and a passing
# authenticated preview Gemini/support flow first. Production is already on v4.
supabase secrets set --project-ref "$PRODUCTION_REF" \
  --env-file "$GEMINI_ENV_FILE"
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
any future production redeploy or mobile release.

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

- Node jobs use Node 22. Recovery commit `0135964` and the final evidence update
  are pushed on `codex/recovery-and-mobile-startup` in pull request #2; its
  required checks are the CI review gate.
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

On the current recovery tree, admin/landing lint and builds, Deno
format/lint/type checks with 16/16 support tests, worker compile with 77/77
tests, and the mobile gates recorded above all pass. CI still requires a pushed
pull request/workflow run and is not implied by these local results.

The pushed recovery-branch `.github/workflows/uptime.yml` was manually
dispatched with corrected repository variables. Backend-aware run #113 passed
the public web, production anonymous-auth, and canonical-resolver probes. The
script rejects every backend URL except the exact production origin
`https://yskknolxbxfxakgvrcmg.supabase.co`. The default branch still needs the
reviewed workflow merge, and one passing run does not prove recurring schedule
or alert ownership. Never put a secret/service-role key in the uptime probe.

## 8. Incident Runbook and Monitoring

### Support Ownership and Monitoring Setup

- **Public inbox:** not configured. Assign an owner and response expectation,
  then publish the monitored address through `NEXT_PUBLIC_SUPPORT_EMAIL`.
- **Edge Function:** review `support-ai` logs for exceptions, Gemini rate limits,
  policy-consent failures, and fallback surges.
- **Worker:** the modern Supabase client/preflight source is pushed. After the
  owner updates old encrypted worker secrets through the passkey-authorized
  flow, establish a healthy 53-source baseline, configure a webhook, and assign
  explicit GitHub Actions alert ownership. Ubuntu 22.04 itself is already on
  `main`.
- **App uptime:** backend-aware run #113 passed the public web, production
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

### Incident Runbook

#### 1. Worker Failure (GitHub Actions Alert)
**Symptom:** You receive a "Run failed" email from GitHub Actions for the `worker.yml` workflow.
**Action:**
1. Open the GitHub Actions tab and inspect the failed worker logs.
2. Determine whether the failure happened during runner setup, authentication,
   or source fetching; rerun only after the cause is understood.
   The modern 2.31.0/preflight source is pushed; verify that the encrypted
   worker secrets were updated through the owner passkey flow before diagnosing
   a current authentication failure or rotating a valid key unnecessarily.
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

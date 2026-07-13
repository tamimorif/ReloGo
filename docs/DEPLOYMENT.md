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
| 1 | Push migrations 001–014, enable anonymous sign-ins, grant admin | [§1](#1-supabase-database) |
| 2 | Fill each app's `.env` from `.env.example` | per app below |
| 3 | Deploy landing + admin to Vercel | [§2](#2-landing-page-nextjs-16-static-export-vercel), [§3](#3-admin-dashboard-vite-5-spa-vercel) |
| 4 | Deploy the `support-ai` function + set `GEMINI_API_KEY`; build mobile via EAS | [§4](#4-mobile-app-expo-sdk-55-eas) |
| 5 | Configure, baseline, and schedule the worker | [§5](#5-rule-monitor-worker-python-311--playwright) |

**Repository setup:** an EAS project is registered (`mobile/app.json`), and
Vercel config exists for both web apps
(`landing/vercel.json`, `admin/vercel.json`). The worker's daily cron is committed
(`.github/workflows/worker.yml`); it just needs two repo secrets to activate (§5).

## 1. Supabase (database)

Migrations live in `supabase/migrations/` and are the single source of truth
for the schema (`001_init.sql` through
`014_persistent_support_human_takeover.sql`). `005` seeds provisional core
checklist content for **all 13 provinces and territories** (destination tasks
plus a federal CRA task, with suggested deadlines and official URLs), so a
fresh `db push` yields a testable checklist for every corridor. This seed is
not a substitute for the independent government-content review required before
launch.

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

> **Note:** Supabase link state is machine-local and intentionally ignored by
> git. On a new machine, run `supabase login` and `supabase link` even if another
> contributor previously linked the project.

To verify what would run without applying it:

```bash
supabase db push --dry-run
```

### Granting admin access

Admin access is governed by the `admin_users` table plus RLS (see migration
002). Granting it is two steps:

1. Create an auth user for the intended internal admin email. Supabase
   Dashboard → **Authentication → Users → Add user** → enter the monitored
   address and a strong unique password.
2. Add that user to `admin_users`. Run as `service_role` (SQL editor or
   `psql`):

```sql
INSERT INTO admin_users (user_id)
SELECT id FROM auth.users WHERE email = 'admin@example.com';
```

Admin access is enforced entirely server-side: the admin app calls the
`is_admin()` RPC (which checks `admin_users`) and shows a "not authorized"
screen on `false`. There is no client-side email allowlist.

### Enabling anonymous sign-ins (required for mobile)

The mobile onboarding flow calls `supabase.auth.signInAnonymously()`
(`mobile/app/(auth)/onboarding.tsx`), which is **off by default** in Supabase.
Enable it or every new user's onboarding will fail at runtime:

- Supabase Dashboard → **Authentication → Sign In / Providers** → enable
  **"Allow anonymous sign-ins"**.

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

- Root directory: `landing`
- Framework preset: Next.js (Vercel detects the static export automatically)
- Environment variables (build-time, public):
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY`

## 3. Admin dashboard (Vite 5 SPA, Vercel)

```bash
cd admin
npm ci
npm run build        # tsc -b && vite build -> dist/
npm run preview      # optional local preview of the production build
```

Vercel setup (`admin/vercel.json` already includes the SPA rewrite to
`/index.html`):

- Root directory: `admin`
- Framework preset: Vite
- Environment variables (build-time, public):
  - `VITE_SUPABASE_URL`
  - `VITE_SUPABASE_ANON_KEY`

## 4. Mobile app (Expo SDK 55, EAS)

Build profiles are defined in `mobile/eas.json` (`development`, `preview`,
`production`; EAS CLI `>= 12.0.0`, remote app version source with
auto-increment in production).

Local iOS and Android Hermes exports pass. EAS preview builds and real-device QA
are still required before release.

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
`production` environments and intentionally stores no project values. Create
`EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY` in every EAS
environment you build. Use separate preview/production Supabase projects and
verify them with `eas env:list --environment <name>`. The anon key is public by
design; RLS/RPCs are the security boundary.

For local development copy `mobile/.env.example` to `mobile/.env`.

## 5. Rule-monitor worker (Python 3.11 + Playwright)

The worker is part of launch operations: it keeps official-source content under
review by filing admin alerts. A daily GitHub Actions cron is committed at
`.github/workflows/worker.yml` — it just needs two repo secrets (see
[Scheduling](#scheduling-free) below).

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

### Scheduling (free)

A daily GitHub Actions cron is committed at `.github/workflows/worker.yml`
(`0 2 * * *` UTC, plus a manual **Run workflow** button). It checks out, installs
deps, runs `playwright install --with-deps chromium`, and executes
`python worker/main.py`. To activate it, add two **repo secrets** (Settings →
Secrets and variables → Actions → New repository secret):
`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`. Until they exist, the scheduled
run exits 1 by design. No always-on host or paid plan needed. Managed-runner
alternatives if you prefer: Fly.io, Railway, or Cloud Run jobs. The service role
key bypasses RLS — it belongs only in the worker environment, never in any client app.

Local run without Docker:

```bash
cd worker
python3.11 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
playwright install chromium
SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... python main.py
```

## 6. Secrets and PIPEDA notes

- Only the **anon** key ever ships in landing, admin, or mobile builds.
- The **service role** key is used only by the worker and Supabase-managed
  server functions. It never ships in a client.
- Personal information (health card number, driver's licence number, street
  address, full name, date of birth) lives only in `expo-secure-store` on the
  device (`mobile/lib/secureStore.ts`). It must never appear in a Supabase
  query, log, error message, or any deployed environment variable.

### Support chat (threads + messages)

Support is delivered entirely as in-app **chat threads** — there is no email
collection or email notification. A user selects one of six fixed general
questions; there is no free-text client field. An admin can take over from the
dashboard's **Messages** tab. The data model begins in
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
# Deploy the function (after supabase login + supabase link)
supabase functions deploy support-ai

# Set the Gemini API key as a Supabase secret
supabase secrets set GEMINI_API_KEY=<your-key>
```

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
- The public-facing contact placeholder is `privacy@relogo.app`. Replace it
  with a monitored public mailbox before launch; never document private/admin
  inboxes in the repository.

## 7. CI

`.github/workflows/ci.yml` runs on pushes to `main`/`tamim` and on pull requests:

- `mobile-typecheck`: clean install, Expo dependency alignment, TypeScript
- `mobile-test`: Jest date/account/support tests
- `mobile-native-export`: iOS and Android Hermes exports
- `admin-build`: `npm ci && npm run build` in `admin/`
- `landing-build`: clean install, ESLint, and static production build
- `db-tests`: pinned Supabase CLI, fresh local stack, schema lint, pgTAP
- `support-ai-test`: allowlist sync plus Deno helper tests
- `worker-compile`: compiles worker modules
- `worker-test`: Python 3.11 pytest suite
- `types-sync`: verifies the mobile/admin `Database` interfaces are byte-identical

The web builds use placeholder Supabase env values in CI; real values are
injected by Vercel at deploy time.

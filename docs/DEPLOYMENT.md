# ReloGo Deployment Guide

Pinned stack: Next.js 14 (static export) for the landing page, Vite 5 for the
admin dashboard, Expo SDK 51 / EAS for the mobile app, Supabase (Postgres +
Auth + RLS) for the backend, and a Python 3.11 Playwright worker for rule
monitoring.

## 0. Order of operations

Follow these top-to-bottom for a first deploy. Steps 1–4 make the app work and go
live; step 5 (worker) is optional and not launch-blocking.

| # | Step | Section |
| --- | --- | --- |
| 1 | Push migrations 001–005, enable anonymous sign-ins, grant admin | [§1](#1-supabase-database) |
| 2 | Fill each app's `.env` from `.env.example` | per app below |
| 3 | Deploy landing + admin to Vercel | [§2](#2-landing-page-nextjs-14-static-export-vercel), [§3](#3-admin-dashboard-vite-5-spa-vercel) |
| 4 | Deploy the `support-ai` function + set `GEMINI_API_KEY`; build mobile via EAS | [§4](#4-mobile-app-expo-sdk-51-eas) |
| 5 | *(optional)* Schedule the worker | [§5](#5-rule-monitor-worker-python-311--playwright) |

**Already set up:** a Supabase project (**"ReloGo"**) is created and linked, an EAS
project is registered (`app.json`), and Vercel config exists for both web apps
(`landing/vercel.json`, `admin/vercel.json`). The worker's daily cron is committed
(`.github/workflows/worker.yml`); it just needs two repo secrets to activate (§5).

## 1. Supabase (database)

Migrations live in `supabase/migrations/` and are the single source of truth
for the schema (`001_init.sql`, `002_hardening_and_user_deletion.sql`,
`003_admin_user_views.sql`, `004_support_messages.sql`,
`005_seed_all_corridors.sql`). `005` seeds checklist content for **all 13
provinces & territories** (core destination tasks + a federal CRA task, with
deadlines + official URLs), so a fresh `db push` yields a working checklist for
every corridor out of the box.

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

> **Note:** the **"ReloGo"** project is already linked in this repo
> (`supabase/.temp/`), so `supabase link` may report it's already linked — that's
> expected. On a new machine you still need `supabase login` first.

To verify what would run without applying it:

```bash
supabase db push --dry-run
```

### Granting admin access

Admin access is governed by the `admin_users` table plus RLS (see migration
002). Granting it is two steps:

1. Create an auth user for the admin email. Supabase Dashboard →
   **Authentication → Users → Add user** → enter
   `valley.yew666@eagereverest.com` and a password (this is the admin
   dashboard login).
2. Add that user to `admin_users`. Run as `service_role` (SQL editor or
   `psql`):

```sql
INSERT INTO admin_users (user_id)
SELECT id FROM auth.users WHERE email = 'valley.yew666@eagereverest.com';
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

## 2. Landing page (Next.js 14 static export, Vercel)

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

## 4. Mobile app (Expo SDK 51, EAS)

Build profiles are defined in `mobile/eas.json` (`development`, `preview`,
`production`; EAS CLI `>= 12.0.0`, remote app version source with
auto-increment in production).

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

Before a production build, replace the placeholder values in the
`build.production.env` block of `mobile/eas.json` with your real
`EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY` (or manage them
as EAS environment variables instead of committing them).

For local development copy `mobile/.env.example` to `mobile/.env`.

## 5. Rule-monitor worker (Python 3.11 + Playwright)

> **Optional / not launch-blocking.** The worker only keeps official-source
> content fresh over time by filing admin alerts; the app works fully without it.
> A free daily GitHub Actions cron is already committed at
> `.github/workflows/worker.yml` — it just needs two repo secrets (see
> [Scheduling](#scheduling-free) below).

The worker is containerized (`worker/Dockerfile`, `python:3.11-slim` with
Chromium for Playwright).

```bash
cd worker
docker build -t relogo-worker .
docker run --rm \
  -e SUPABASE_URL=https://<your-project-ref>.supabase.co \
  -e SUPABASE_SERVICE_ROLE_KEY=<service-role-key> \
  relogo-worker
```

Optional tuning: `PAGE_TIMEOUT_MS` (default 30000), `NAV_TIMEOUT_MS`
(default 60000).

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
- The **service role** key is used exclusively by the worker.
- Personal information (health card number, driver's licence number, street
  address, full name, date of birth) lives only in `expo-secure-store` on the
  device (`mobile/lib/secureStore.ts`). It must never appear in a Supabase
  query, log, error message, or any deployed environment variable.

### Support chat (threads + messages)

Support is delivered entirely as in-app **chat threads** — there is no email
collection and no email notification. A user opens a thread from the app's
Contact screen and exchanges messages with the AI assistant; an admin can take
over from the dashboard's **Messages** tab. The data model is two tables in
`004_support_messages.sql`:

- `support_threads` — one row per conversation, with a `status` of `AI`
  (AI answering), `AWAITING_HUMAN` (escalated, AI stopped, waiting for an
  admin), `HUMAN` (an admin is handling it), or `RESOLVED` (closed).
- `support_messages` — one row per message, with a `sender` of `user`, `ai`,
  or `admin`.

Neither table stores any of the on-device personal information listed above.
Thread bodies are general how-to / process questions only.

Live updates flow over Supabase Realtime (enabled on both tables by the
migration), so the user's app and the admin dashboard see new messages without
polling.

### AI support (Edge Function)

General how-to / process questions are answered by a Supabase **Edge Function**
at `supabase/functions/support-ai/`. The mobile client inserts the user's
message, then calls `supabase.functions.invoke('support-ai', { body: { thread_id } })`;
the function generates the AI reply and inserts it as a `sender = 'ai'` message
(arriving in the app via Realtime). The function only generates a reply when the
thread's `status = 'AI'` — once a thread is escalated or a human takes over, the
function returns without ever calling Gemini, so that conversation is never sent
to the AI.

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

The key comes from a **free** Google AI Studio account
(https://aistudio.google.com). The model is `gemini-2.0-flash` (a `MODEL`
constant in `supabase/functions/support-ai/index.ts`, easily editable). Note
that on the free tier Google may use chat text to improve its products — which
is exactly why the app shows an in-app "don't share sensitive info" notice and
the AI is instructed to refuse personal IDs.

### Support / privacy guarantees

- Personal IDs (full name, DOB, street address, driver's licence number, health
  card number) never reach the server or the AI; they stay only in
  `expo-secure-store` on the device. The AI is also instructed to refuse them.
- Once a human takes over a thread (`AWAITING_HUMAN` / `HUMAN`), the AI stops —
  the Edge Function will not send that conversation to Gemini.
- The public-facing contact label shown to users in the app is
  `privacy@relogo.app`. The private inbox `valley.yew666@eagereverest.com` is an
  internal address only and must never be exposed to users anywhere in the app
  or site.

## 7. CI

`.github/workflows/ci.yml` runs on every push to `main` and on pull requests:

- `mobile-typecheck`: `npm ci && npx tsc --noEmit` in `mobile/`
- `mobile-test`: `npm ci && npm test` in `mobile/` (jest — 20 deadline/date tests)
- `admin-build`: `npm ci && npm run build` in `admin/`
- `landing-build`: `npm ci && npm run build` in `landing/`
- `worker-compile`: `python -m py_compile worker/main.py`
- `worker-test`: `pip install -r requirements-dev.txt && pytest` in `worker/` (14 tests)

The web builds use placeholder Supabase env values in CI; real values are
injected by Vercel at deploy time.

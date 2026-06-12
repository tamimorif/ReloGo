# ReloGo Deployment Guide

Pinned stack: Next.js 14 (static export) for the landing page, Vite 5 for the
admin dashboard, Expo SDK 51 / EAS for the mobile app, Supabase (Postgres +
Auth + RLS) for the backend, and a Python 3.11 Playwright worker for rule
monitoring.

## 1. Supabase (database)

Migrations live in `supabase/migrations/` and are the single source of truth
for the schema (`001_init.sql`, `002_hardening_and_user_deletion.sql`,
`003_admin_user_views.sql`).

```bash
# One-time: authenticate and link the project
supabase login
supabase link --project-ref <your-project-ref>

# Apply all pending migrations to the linked project
supabase db push
```

To verify what would run without applying it:

```bash
supabase db push --dry-run
```

### Granting admin access

Admin access is governed by the `admin_users` table plus RLS (see migration
002). Run as `service_role` (SQL editor or `psql`):

```sql
INSERT INTO admin_users (user_id)
SELECT id FROM auth.users WHERE email = 'admin@relogo.ca';
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

Run it on a schedule (e.g. a daily cron on Fly.io, Railway, Cloud Run jobs,
or a GitHub Actions scheduled workflow). The service role key bypasses RLS:
it belongs only in the worker environment, never in any client app.

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

## 7. CI

`.github/workflows/ci.yml` runs on every push to `main` and on pull requests:

- `mobile-typecheck`: `npm ci && npx tsc --noEmit` in `mobile/`
- `admin-build`: `npm ci && npm run build` in `admin/`
- `landing-build`: `npm ci && npm run build` in `landing/`
- `worker-compile`: `python -m py_compile worker/main.py`

The web builds use placeholder Supabase env values in CI; real values are
injected by Vercel at deploy time.

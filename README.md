# ReloGo

**Your Canadian relocation autopilot.** ReloGo turns an interprovincial move
(e.g. Ontario → Alberta) into a personalized, deadline-aware checklist of
every government task you have to do — licences, health cards, vehicle
registration, CRA address, school enrollment — backed by official sources,
with a worker that watches those sources for rule changes and a human-reviewed
approval flow before anything goes live.

A core principle is **privacy by construction**: your most sensitive
information never leaves your device (see [Privacy](#privacy-pipeda)).

## What's inside

| App | What it does |
| --- | --- |
| **Mobile** | The product. Onboard with your corridor + move date + vehicle/kids flags → get a filtered, deadline-sorted checklist with optimistic completion toggles. Auto-fills government PDF forms on-device and shares them. Includes a profile screen with an on-device "personal info" vault and a PIPEDA "Delete My Data" flow. |
| **Landing** | Marketing page with a "Moving from / Moving to" corridor picker that reveals a waitlist signup (enumeration-safe via an RPC). |
| **Admin** | Two tabs: **Alerts** (review/approve government rule changes the worker detected) and **Users** (read-only list of users — corridor, move date, checklist progress — with a per-user detail modal). Access is gated server-side by an `is_admin()` check. |
| **Worker** | A daily headless-browser scraper that fingerprints each official government page (SHA-256) and files a PENDING alert when the content changes. It never edits live rules — humans approve via the admin. |

## Repository layout

| Directory | What it is | Stack |
| --- | --- | --- |
| `mobile/` | User-facing app | Expo SDK 51, expo-router, NativeWind, TanStack Query, Supabase |
| `landing/` | Marketing page + waitlist | Next.js 14 (static export), Tailwind |
| `admin/` | Rule-change + user dashboard | Vite 5, React 18, Tailwind |
| `worker/` | Official-source change monitor | Python 3.11, Playwright, tenacity |
| `supabase/migrations/` | Database schema (source of truth) | Postgres + RLS |
| `docs/` | Deployment guide + project status | |

The four apps are independent folders (no monorepo tooling); each has its own
`package.json` / `requirements.txt` and `.env.example`.

## Architecture

```
        ┌─────────────────────────────┐
        │      Mobile app (Expo)      │  ← users, on their phones
        │  reads rules · writes own   │
        │  progress · PII on-device   │
        └──────────────┬──────────────┘
                       ▼
                ┌──────────────┐
   Landing ───▶ │   Supabase   │ ◀─── Admin (alerts + users,
  (waitlist)    │ Postgres +   │       is_admin() gated)
                │ Auth + RLS   │
                └──────▲───────┘
                       │ service_role (bypasses RLS)
                ┌──────┴───────┐
                │    Worker    │  ← watches gov URLs, files alerts
                └──────────────┘
```

Supabase is the single backend everyone talks to. Row Level Security is the
authorization boundary: users see only their own rows, admins are gated on the
`admin_users` table via `is_admin()`, and the worker is the only component that
uses the secret `service_role` key.

## Database migrations

Applied in order; `supabase/migrations/` is the schema source of truth.

| Migration | Adds |
| --- | --- |
| `001_init.sql` | 7 core tables, RLS, ON→AB seed data |
| `002_hardening_and_user_deletion.sql` | Bug fixes, constraints, indexes, `updated_at` triggers; `delete_current_user()` (PIPEDA); `admin_users` + `is_admin()` + admin RLS; atomic `approve_rule_change()`; enumeration-safe `join_waitlist()` |
| `003_admin_user_views.sql` | Admin-read RLS on user tables; `admin_list_users()` / `admin_get_user_detail()` RPCs powering the admin Users page |

## Quick start

Each app reads Supabase credentials from environment variables. Copy the
`.env.example` in each directory and fill in your project's URL and key
(landing uses `.env.local`; the rest use `.env`).

```bash
# 1. Database (Supabase CLI)
supabase link --project-ref <your-project-ref>
supabase db push                      # applies 001 → 002 → 003
# Then in the Supabase dashboard: Authentication → enable "Allow anonymous sign-ins"
# (the mobile onboarding uses signInAnonymously)

# 2. Mobile (Expo SDK 51)
cd mobile && cp .env.example .env && npm ci && npx expo start

# 3. Landing (Next.js 14 static export)
cd landing && cp .env.example .env.local && npm ci && npm run dev

# 4. Admin (Vite 5)
cd admin && cp .env.example .env && npm ci && npm run dev
# Grant yourself admin (Supabase SQL editor, service_role):
#   INSERT INTO admin_users (user_id) SELECT id FROM auth.users WHERE email = 'you@example.com';

# 5. Worker (Python 3.11)
cd worker && cp .env.example .env && pip install -r requirements.txt && playwright install chromium
python main.py
```

See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) for production builds (EAS,
Vercel, Railway) and [docs/PROJECT_STATUS.md](docs/PROJECT_STATUS.md) for the
current build status and what's left.

## Privacy (PIPEDA)

Personal information — health card number, driver's licence number, street
address, full name, date of birth — is stored only on-device via
`expo-secure-store` (`mobile/lib/secureStore.ts`). It never appears in Supabase
queries, logs, or error messages, and there is no server-side column that holds
it. The backend stores only non-identifying move metadata (provinces, move
date, vehicle/dependent flags). The admin dashboard, by construction, cannot
display PII. "Delete My Data" removes the server record (cascade) and wipes the
on-device vault and any cached filled PDFs.

## CI

`.github/workflows/ci.yml` typechecks the mobile app, builds the admin and
landing apps, and syntax-checks the worker on every push to `main` and on
pull requests.

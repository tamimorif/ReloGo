# ReloGo

Interprovincial moving checklists for Canada. ReloGo turns a move (e.g.
Ontario to Alberta) into a personalized, deadline-aware task list backed by
official government sources, with a worker that watches those sources for
rule changes.

## Repository layout

| Directory | What it is | Stack |
| --- | --- | --- |
| `mobile/` | User-facing app | Expo SDK 51, expo-router, NativeWind, Supabase |
| `landing/` | Marketing page + waitlist | Next.js 14 (static export), Tailwind |
| `admin/` | Rule-change review dashboard | Vite 5, React 18, Tailwind |
| `worker/` | Official-source change monitor | Python 3.11, Playwright |
| `supabase/migrations/` | Database schema (source of truth) | Postgres + RLS |
| `docs/` | Project documentation | |

## Quick start

Each app reads Supabase credentials from environment variables; copy the
`.env.example` in each directory to `.env` and fill in your project's URL and
anon key.

```bash
# Database (Supabase CLI)
supabase link --project-ref <your-project-ref>
supabase db push

# Mobile (Expo SDK 51)
cd mobile && npm ci && npx expo start

# Landing (Next.js 14 static export)
cd landing && npm ci && npm run dev

# Admin (Vite 5)
cd admin && npm ci && npm run dev

# Worker (Python 3.11)
cd worker && pip install -r requirements.txt && playwright install chromium
SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... python main.py
```

See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) for production builds (EAS,
Vercel, Docker) and environment variable details.

## Privacy (PIPEDA)

Personal information -- health card number, driver's licence number, street
address, full name, date of birth -- is stored only on-device via
`expo-secure-store` (`mobile/lib/secureStore.ts`). It never appears in
Supabase queries, logs, or error messages. The backend stores only
non-identifying move metadata (provinces, move date, vehicle/dependent
flags).

## CI

`.github/workflows/ci.yml` typechecks the mobile app, builds the admin and
landing apps, and syntax-checks the worker on every push to `main` and on
pull requests.

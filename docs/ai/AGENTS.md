# AGENTS.md — ReloGo agent guide

**If you are an AI agent (or a human) picking this project up, read this first.**
It tells you what ReloGo is, how to build and verify each part, and the hard rules
you must not break. It deliberately does **not** duplicate the existing docs — it
points to them.

## What ReloGo is (one paragraph)

ReloGo turns a Canadian interprovincial move (e.g. Ontario → Alberta) into a
personalized, deadline-aware checklist of government tasks, backed by official
sources, with a worker that watches those sources for rule changes and a
human-approval flow before anything goes live. Its defining constraint is
**privacy by construction**: the user's sensitive personal information never
leaves their device.

## The map

- **[PROJECT_MAP.md](PROJECT_MAP.md)** — annotated file/folder tree (start here to find anything).
- Four independent apps + one backend, **no monorepo tooling**:

| Dir | Role | Stack |
| --- | --- | --- |
| `mobile/` | The product | Expo SDK 51, expo-router, NativeWind, TanStack Query, Supabase |
| `landing/` | Marketing + waitlist | Next.js 14 (static export), Tailwind |
| `admin/` | Rule/user/support dashboard | Vite 5, React 18, Tailwind |
| `worker/` | Gov-source change monitor | Python 3.11, Playwright, tenacity |
| `supabase/` | The single backend (schema source of truth) | Postgres + RLS + Deno Edge Function |

## Where to read more

| Read | For |
| --- | --- |
| [../../README.md](../../README.md) | Product overview, architecture diagram, quick start |
| [../DEPLOYMENT.md](../DEPLOYMENT.md) | Production deploy (Supabase, Vercel, EAS, worker, support-ai). **Current.** |
| [../PROJECT_STATUS.md](../PROJECT_STATUS.md) | Build-vs-product status, Implementation Map, roadmap (refreshed 2026-07-06). |
| [HANDOFF.md](HANDOFF.md) | What the last agent did + current git state + next steps |

## Build & verify (mirror CI exactly)

CI (`.github/workflows/ci.yml`) is the contract. Reproduce it locally per app:

```bash
# mobile — typecheck only
cd mobile   && npm ci && npx tsc --noEmit

# admin — full build
cd admin    && npm ci && npm run build

# landing — static export build
cd landing  && npm ci && npm run build

# worker — syntax check
python -m py_compile worker/main.py
```

## Hard rules — do not break these

1. **`npm ci` lockfile discipline.** Each app installs independently with `npm ci`,
   which **hard-fails if `package.json` and its `package-lock.json` drift**. Any
   dependency change **must** regenerate that app's lockfile (`npm install`) and
   commit `package.json` **and** `package-lock.json` together — otherwise every CI
   job for that app breaks. (This is exactly the discipline behind the 2026-07-05
   mobile dependency cleanup; see HANDOFF.)

2. **PII / PIPEDA — personal info stays on-device.** Health card number, driver's
   licence number, street address, full name, and date of birth live only in
   `mobile/lib/secureStore.ts` (`expo-secure-store`). They must **never** appear in
   a Supabase query, a log, an error message, a deployed env var, or a message sent
   to the AI. The backend stores only non-identifying move metadata. Deleting an
   account must also wipe the on-device vault and any cached filled PDFs
   (`mobile/lib/account.ts`).

3. **RLS is the authorization boundary.** Users can read/write only their own rows;
   admins are gated server-side by `is_admin()` (never a client-side email list);
   the secret `service_role` key is used **only** by the worker. Never move
   authorization into the client.

4. **Two `database.ts` files must stay identical.** `mobile/types/database.ts` and
   `admin/src/types/database.ts` are the shared Supabase contract. If you change one
   (e.g. after a migration), change the other to match, byte-for-byte.

5. **Migrations are the schema source of truth.** Change the DB only by adding a new,
   ordered `supabase/migrations/00N_*.sql` and applying it with `supabase db push`.
   Never hand-edit a live schema out-of-band.

6. **Secrets.** Only the Supabase **anon** key ships in client apps. The
   **service_role** key belongs only in the worker's environment. `GEMINI_API_KEY`
   exists only as a Supabase secret read by the `support-ai` Edge Function. Never
   commit a real `.env` (only `.env.example` is tracked).

7. **Lint is not wired.** Each `package.json` defines a `lint` script but no `eslint`
   dependency is installed, and **CI never runs lint**. Do not assume `npm run lint`
   works or treat its absence as a regression.

## Gotchas

- **Duplicate Expo config.** There is a root `app.json`/`eas.json` **and** a
  `mobile/app.json`/`mobile/eas.json`. `docs/DEPLOYMENT.md` and EAS builds operate
  from `mobile/`, so treat the `mobile/` copies as authoritative; the root pair
  looks like a leftover and is a cleanup candidate (see HANDOFF). Verify before
  relying on either.
- **Landing is a static export** (`output: 'export'`) — there is no Node server;
  never `next start` it.
- **Anonymous auth must be enabled** in the Supabase project or mobile onboarding
  fails at runtime (see DEPLOYMENT.md → “Enabling anonymous sign-ins”).
- **`react-native` is pinned via `overrides` in `mobile/package.json`.** Keep
  `"overrides": { "react-native": "0.74.5" }`. Without it a fresh `npm install`
  can resolve a transitive `"react-native": "*"` to a newer RN nested under
  `node_modules/react-native/node_modules/`, which Metro (SDK 51) can't parse
  (`SyntaxError: Missing semicolon`). CI won't catch it — it never bundles.
- **`@tanstack/react-query` is pinned to exactly `5.45.0`.** Newer 5.x types need
  TypeScript ≥5.4; under this project's TS ~5.3 they **silently degrade query
  generics to `any`** (no error). Bump `typescript` to ~5.4+ before unpinning.

## Convention for updating this folder

When you finish a unit of work, **append an entry to [HANDOFF.md](HANDOFF.md)**
(don't rewrite history) and, if you added/moved files, update
[PROJECT_MAP.md](PROJECT_MAP.md). Keep this AGENTS.md about durable rules, not
session events.

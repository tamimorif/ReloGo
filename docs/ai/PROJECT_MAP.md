# ReloGo — Project Map

An annotated tour of the repository. Only **git-tracked** files are shown, grouped
by app. Build output, `node_modules/`, `.env` files, and other ignored paths are
omitted. For prose descriptions see [README.md](../../README.md); for this folder's
purpose see [AGENTS.md](AGENTS.md).

> ReloGo = four independent apps + one Supabase backend. **No monorepo tooling** —
> each app has its own `package.json`/`requirements.txt`, `.env.example`, and lockfile,
> and is built/installed on its own.

## Top level

```
ReloGo/
├── README.md                  ← START HERE (humans): product, architecture, quick start
├── AGENTS.md                  ← START HERE (AI): pointer into docs/ai/
├── docs/
│   ├── DEPLOYMENT.md          ← production deploy: Supabase · Vercel · EAS · worker · support-ai  (CURRENT)
│   ├── PROJECT_STATUS.md      ← build-vs-product status + Implementation Map + roadmap  (refreshed 2026-07-06)
│   └── ai/                    ← ★ AI HANDOFF FOLDER (this dir)
│       ├── AGENTS.md          ← agent guide: conventions, commands, hard rules
│       ├── PROJECT_MAP.md     ← this file
│       └── HANDOFF.md         ← running session log + current state + next steps
├── .github/workflows/
│   ├── ci.yml                 ← CI: typecheck · admin/landing build · worker compile · mobile-test · worker-test
│   └── worker.yml             ← daily cron running the worker (needs SUPABASE_* repo secrets)
├── app.json, eas.json         ← ⚠ root-level Expo/EAS config — duplicates mobile/* (see AGENTS “Gotchas”)
├── package.json               ← root: only @vercel/analytics (near-empty; not a workspace root)
├── .gitignore                 ← covers all apps; .env ignored, .env.example committed
│
├── mobile/            ← THE PRODUCT — Expo SDK 51 / expo-router / NativeWind
├── landing/           ← marketing + waitlist — Next.js 14 (static export)
├── admin/             ← rule/user/support dashboard — Vite 5 + React 18
├── worker/            ← gov-source change monitor — Python 3.11 + Playwright
├── supabase/          ← backend source of truth — Postgres migrations + Edge Function
└── store-screenshots/ ← iOS App Store screenshots (iphone/ipad × 4)
```

## mobile/ — the user-facing app

```
mobile/
├── app/                        ← expo-router file-based routes
│   ├── _layout.tsx             ← root layout / providers (TanStack Query, etc.)
│   ├── index.tsx               ← entry redirect (→ onboarding or tabs)
│   ├── (auth)/
│   │   ├── _layout.tsx
│   │   └── onboarding.tsx      ← corridor + move date + vehicle/kids flags → signInAnonymously()
│   └── (tabs)/
│       ├── _layout.tsx         ← bottom tab bar
│       ├── checklist.tsx       ← filtered, deadline-sorted task list (optimistic toggles)
│       ├── profile.tsx         ← move details + on-device PII vault + “Delete My Data”
│       └── contact.tsx         ← in-app support chat (threads → support-ai Edge Function)
├── lib/
│   ├── supabase.ts             ← typed client + AES-encrypted session store, foreground-only refresh
│   ├── secureStore.ts          ← on-device PII vault (expo-secure-store) — PII NEVER leaves the device
│   ├── account.ts              ← deleteAccount(): RPC → PII wipe → filled-PDF wipe → local sign-out
│   ├── pdfEngine.ts            ← on-device gov PDF form-fill + share, with cache hygiene
│   └── dateHelpers.ts          ← pure local-time date math (deadline calc); unit-tested
├── __tests__/lib/dateHelpers.test.ts ← 20 jest tests (deadline pipeline + timezone/DST guard)
├── types/database.ts           ← Supabase types — MUST stay identical to admin/src/types/database.ts
├── assets/pdfs/sample-form.pdf ← placeholder AcroForm (real gov PDFs pending)
├── app.json, eas.json          ← authoritative Expo app config + EAS build profiles
├── jest.config.js              ← ts-jest (node env) for pure-logic tests
├── package.json                ← deps (cleaned 2026-07-05: −react-native-picker-select, −@types/react-native)
└── babel · metro · tailwind · global.css · nativewind-env.d.ts · tsconfig.json
```

## landing/ — marketing page + waitlist

```
landing/
├── app/                        ← Next.js 14 app router
│   ├── layout.tsx, page.tsx    ← hero + “moving from/to” corridor picker → waitlist reveal
│   ├── globals.css
│   └── privacy/page.tsx        ← privacy policy
├── components/WaitlistForm.tsx ← enumeration-safe join_waitlist() RPC
├── lib/supabase.ts
├── next.config.js              ← output:'export' → static site in out/ (do NOT use `next start`)
├── vercel.json
└── tailwind · postcss · tsconfig.json
```

## admin/ — internal dashboard (is_admin() gated)

```
admin/
├── src/
│   ├── App.tsx                 ← tabs: Alerts · Users · Messages; server-side is_admin() gate
│   ├── main.tsx, index.css
│   ├── components/
│   │   ├── LoginForm.tsx, NotAuthorized.tsx
│   │   ├── AlertsTable.tsx, EditRuleModal.tsx    ← review/approve gov rule-change alerts
│   │   ├── UsersTable.tsx, UserDetailModal.tsx   ← read-only user list (no PII by construction)
│   │   └── MessagesTable.tsx, ThreadModal.tsx    ← support-chat human takeover
│   ├── lib/supabase.ts
│   └── types/database.ts       ← MUST stay identical to mobile/types/database.ts
├── vite.config.ts, vercel.json (SPA rewrite → /index.html)
└── tailwind · postcss · tsconfig.json · index.html
```

## worker/ — official-source change monitor

```
worker/
├── main.py                     ← Playwright: SHA-256 fingerprint gov pages → file PENDING alert on change
├── changedetect.py             ← pure sha256 + classify_change (baseline/unchanged/changed); unit-tested
├── tests/test_changedetect.py  ← 14 pytest cases (alert decision + hashing)
├── conftest.py                 ← puts worker/ on sys.path for tests
├── requirements.txt            ← pinned runtime deps (tenacity, supabase, playwright)
├── requirements-dev.txt        ← test-only deps (pytest)
├── Dockerfile                  ← python:3.11-slim + Chromium
└── .env.example                ← SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY  (service_role — worker ONLY)
```

## supabase/ — the single backend

```
supabase/
├── migrations/                 ← SCHEMA SOURCE OF TRUTH — apply in order via `supabase db push`
│   ├── 001_init.sql            ← 7 core tables, RLS on every table, ON→AB seed
│   ├── 002_hardening_and_user_deletion.sql ← PIPEDA delete_current_user(), admin_users/is_admin(), constraints
│   ├── 003_admin_user_views.sql            ← admin_list_users() / admin_get_user_detail() RPCs
│   ├── 004_support_messages.sql            ← support_threads + support_messages (+ Realtime)
│   └── 005_seed_all_corridors.sql          ← corridor seed expansion
├── functions/support-ai/       ← Edge Function (Deno): generates Gemini reply only when thread.status='AI'
│   ├── index.ts, deno.json
└── .temp/                      ← ⚠ Supabase CLI local state — tracked but should be ignored (see HANDOFF cleanups)
```

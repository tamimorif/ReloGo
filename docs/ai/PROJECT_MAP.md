# ReloGo — Project Map

An annotated tour of the current shared tree, grouped by app. This is a source
map; branch, release, and hosted-environment status belongs in
[PLAN.md](../PLAN.md) and [AI_HANDOFF.md](AI_HANDOFF.md), where it is dated.
Build output, `node_modules/`, `.env` files, and other ignored paths are
omitted. For product context see [README.md](../../README.md).

**Current source scope (2026-11-16):** mobile asks for origin/destination city
and province, plus optional Yes / No / Skip answers for vehicle registration
and school-age children. Route details, answers, and checkmarks stay on the
device. Human support uses fixed questions and server-stored chats so Admin can
reply. There is no move date, map, AI call, PDF form-filling, name, or user
account form in this MVP. The source is unbuilt and unpublished; the legacy AI
Edge Function and profile/progress database surfaces remain.

> ReloGo = four independent apps + one Supabase backend. **No monorepo tooling** —
> each app has its own `package.json`/`requirements.txt`, `.env.example`, and lockfile,
> and is built/installed on its own.

## Top level

```
ReloGo/
├── README.md                  ← START HERE (humans): product, architecture, quick start
├── AGENTS.md                  ← START HERE (AI): pointer to the consolidated handoff
├── docs/
│   ├── README.md              ← documentation index
│   ├── PLAN.md                ← canonical status · roadmap · owner actions · definition of done
│   ├── DEPLOYMENT.md          ← detailed Supabase · Vercel · EAS · worker commands
│   ├── PROJECT_STATUS.md      ← compatibility pointer to PLAN.md
│   ├── USER_ACTIONS.md        ← compatibility pointer to PLAN.md
│   └── ai/                    ← ★ AI HANDOFF FOLDER (this dir)
│       ├── AI_HANDOFF.md      ← canonical current agent brief; READ FIRST
│       ├── AGENTS.md          ← compatibility pointer to AI_HANDOFF.md
│       ├── PROJECT_MAP.md     ← this file
│       └── HANDOFF.md         ← compatibility pointer to AI_HANDOFF.md
├── .github/workflows/
│   ├── ci.yml                 ← CI: builds/tests · native exports · lint/pgTAP · contract sync
│   ├── worker.yml             ← daily cron running the worker (needs SUPABASE_* repo secrets)
│   └── uptime.yml             ← local pending public-route availability monitor
├── scripts/                   ← database/support/consent contracts + public uptime probe
├── tests/e2e/                 ← 85-case Python integration/E2E suite against local Supabase
├── package.json               ← root: only @vercel/analytics (near-empty; not a workspace root)
├── .gitignore                 ← covers all apps; .env ignored, .env.example committed
│
├── mobile/            ← THE PRODUCT — Expo SDK 57 / React Native 0.86 / expo-router
├── landing/           ← marketing + waitlist — Next.js 16 (static export)
├── admin/             ← rule/user/support dashboard — Vite 5 + React 18
├── worker/            ← gov-source change monitor — Python 3.11 + Playwright
├── supabase/          ← backend source of truth — Postgres migrations + Edge Function
└── store-screenshots/ ← iOS App Store screenshots (iphone/ipad × 4)
```

## mobile/ — the user-facing app

```
mobile/
├── app/                        ← expo-router file-based routes
│   ├── _layout.tsx             ← root layout / providers (TanStack Query, crash boundary)
│   ├── index.tsx               ← entry redirect (→ onboarding or tabs)
│   ├── (auth)/
│   │   ├── _layout.tsx
│   │   ├── onboarding.tsx      ← route + optional checklist preferences
│   │   └── reconsent.tsx       ← local policy-version review
│   └── (tabs)/
│       ├── _layout.tsx         ← bottom tab bar
│       ├── checklist.tsx       ← route task list, relative timing, local checkmarks
│       ├── profile.tsx         ← move details + local checklist reset + help link
│       └── contact.tsx         ← fixed-question human support chat
├── components/
│   ├── MovePreferences.tsx     ← shared Yes / No / Skip checklist questions
│   └── AppErrorBoundary.tsx    ← top-level PII-safe crash boundary (generic recovery UI)
├── lib/
│   ├── supabase.ts             ← typed client + AES-encrypted session store, foreground-only refresh
│   ├── localJourney.ts         ← device-only route and per-corridor checkmarks
│   ├── checklistQueries.ts     ← public rule fetch + local progress
│   ├── supportConversation.ts  ← anonymous identity, remote chat, local chat cache
│   ├── legalConsent.ts         ← local policy version + hosted legal URLs
│   ├── supportQuestions.ts      ← six client-sendable fixed questions
│   ├── errorReporting.ts       ← PII-safe crash/error redaction + global handler; unit-tested
├── __tests__/lib/              ← remaining local logic/support/error-reporting tests
├── eslint.config.js            ← Expo flat ESLint config (CI-gated via mobile-lint job)
├── types/database.ts           ← Supabase types; legacy profile/progress types remain for backend sync
├── app.json, eas.json          ← authoritative Expo app config + EAS build profiles
├── jest.config.js              ← ts-jest (node env) for pure-logic tests
├── package.json                ← Expo SDK 57 / React Native 0.86 dependencies and scripts
└── babel · metro · tailwind · global.css · nativewind-env.d.ts · tsconfig.json
```

## landing/ — marketing page + waitlist

```
landing/
├── app/                        ← Next.js 16 app router
│   ├── layout.tsx, page.tsx    ← hero + “moving from/to” corridor picker → waitlist reveal
│   ├── globals.css
│   ├── privacy/page.tsx        ← privacy policy
│   ├── terms/page.tsx          ← terms of service
│   ├── support/page.tsx        ← public help, deletion, data, and launch-contact status
│   ├── robots.ts, sitemap.ts   ← search-engine metadata routes
│   └── icon.png                ← site icon
├── components/SiteFooter.tsx   ← shared support/legal footer navigation
├── components/WaitlistForm.tsx ← enumeration-safe join_waitlist() RPC
├── lib/                        ← Supabase client, site URL, legal version, support config
├── public/og.png               ← social preview image
├── eslint.config.mjs           ← Next.js flat ESLint configuration
├── next.config.js              ← output:'export' → static site in out/
├── vercel.json
└── tailwind · postcss · tsconfig.json
```

## admin/ — internal dashboard (is_admin() gated)

```
admin/
├── src/
│   ├── App.tsx                 ← tabs: Alerts · Users · Messages · Waitlist; is_admin() gate
│   ├── main.tsx, index.css
│   ├── components/
│   │   ├── LoginForm.tsx, NotAuthorized.tsx
│   │   ├── AlertsTable.tsx, EditRuleModal.tsx    ← review/approve gov rule-change alerts
│   │   ├── UsersTable.tsx, UserDetailModal.tsx   ← read-only user list (no PII by construction)
│   │   ├── MessagesTable.tsx, ThreadModal.tsx    ← support-chat human takeover
│   │   └── WaitlistTable.tsx                     ← landing signup visibility
│   ├── lib/supabase.ts
│   └── types/database.ts       ← extracted Database interface syncs with mobile
├── vite.config.ts, vercel.json (security headers; no SPA catch-all)
└── tailwind · postcss · tsconfig.json · index.html
```

## worker/ — official-source change monitor

```
worker/
├── main.py                     ← automatic monitor targets + manual partition → atomic CAS baseline/alert RPC
├── changedetect.py             ← pure hashes, PDF records, diffs, and content sanity gates
├── reporting.py                ← fail-closed exit policy + webhook/job summaries, including manual assignments
├── preflight.py                ← exact-origin key/schema/resolver checks before Chromium installation
├── tests/                      ← pytest coverage for scraping, monitoring modes, PDF records, and reporting
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
│   ├── 005_seed_all_corridors.sql          ← corridor seed expansion
│   ├── 006_official_source_content_text.sql ← worker text baselines + column grants
│   ├── 007_hardening_round_two.sql         ← chat/RLS/waitlist/approval hardening
│   ├── 008_atomic_support_ai.sql           ← atomic reply finalization + trusted timestamps
│   ├── 009_atomic_rule_review_permissions.sql ← RPC-only approval/dismissal
│   ├── 010_support_question_privacy_boundary.sql ← fixed-question policy + Edge grants
│   ├── 011_atomic_official_source_scrapes.sql ← row-locked worker persistence
│   ├── 012_support_thread_metadata_privacy.sql ← no client-authored subject text
│   ├── 013_reject_obsolete_rule_approvals.sql ← reject stale source revisions
│   ├── 014_persistent_support_human_takeover.sql ← durable human marker
│   ├── 015_hosted_support_ai_least_privilege.sql ← hosted Edge grant parity
│   ├── 016_support_thread_user_inbox_index.sql ← support inbox lookup index
│   ├── 017_admin_bootstrap_trigger.sql ← historical admin-email bootstrap trigger (retired by local 028)
│   ├── 018_consent_versioning.sql ← policy version/timestamp columns
│   ├── 019_policy_reconsent.sql ← server-current consent RPCs, trigger, and RLS gates
│   ├── 020_content_audit_corrections.sql ← conservative deadline/crawl-state corrections
│   ├── 021_admin_user_pagination.sql ← server-side LIMIT/OFFSET admin_list_users + total_count
│   ├── 022_waitlist_signup_feedback.sql ← enumeration-safe accepted/throttled signup status
│   ├── 023_corridor_rule_resolver.sql ← canonical exact/ANY resolver + public HTTPS sources
│   ├── 024_consent_state_profile_payload.sql ← allowlisted startup profile in consent response
│   ├── 025_available_only_progress.sql ← removes unused LOCKED progress state
│   ├── 026_distinct_move_provinces.sql ← rejects new/updated same-origin/destination moves
│   ├── 027_worker_source_monitoring.sql ← committed, unhosted monitor targets/manual assignments
│   ├── 028_explicit_admin_membership.sql ← committed, unhosted removal of email-based admin grants
│   └── 029_policy_version_1_2.sql     ← local policy contract update; not hosted
├── functions/support-ai/       ← retained legacy Deno/Gemini function; current mobile does not call it
│   ├── index.ts, grounding.ts, humanTakeover.ts, supportQuestions.ts, deno.lock
├── tests/rls_and_rpcs_test.sql ← adversarial pgTAP security/RPC suite
├── config.toml                 ← local Supabase configuration
└── .gitignore                  ← ignores machine-local CLI state
```

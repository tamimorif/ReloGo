# ReloGo — AI agent handoff

_Current as of 2026-07-13_

Read this file completely before changing the repository. The canonical product
roadmap is [../PLAN.md](../PLAN.md); operational commands are in
[../DEPLOYMENT.md](../DEPLOYMENT.md).

## Mission and stage

ReloGo converts a Canadian interprovincial move into a personalized checklist
of official tasks and deadlines. A substantial MVP is implemented and locally
verified. Its isolated Canadian cloud foundation is provisioned and the backend
is deployed, but it is not release-approved: Gemini/admin setup, web/worker
deployment, full live/device QA, government content/PDF validation, legal/store
work, backup recovery, and production operations remain.

The worker monitors official sources and may create PENDING alerts. It must
never change live rules; only a human admin can approve a rule change.

## Start every task this way

1. Read [../PLAN.md](../PLAN.md) for current scope and priorities.
2. Run `git status --short --branch`; preserve all unrelated/user changes.
3. Read every migration/RLS/RPC involved in the path you will touch.
4. Make the smallest coherent change and add adversarial coverage.
5. Run the proportional checks in this file.
6. Update PLAN only for roadmap/status changes and this file only for current
   architecture, invariants, verification, or ordered engineering handoff.

The stabilization work is committed locally on `tamim`; Phase 1 handoff changes
may be in the working tree or a later local commit. Re-check the exact
ahead/dirty state before acting. Do not reset, discard, or broadly reformat work
you did not create. Never push or deploy without explicit authorization.

## Non-negotiable rules

### PII stays on the device

These values may exist only in `mobile/lib/secureStore.ts` and ephemeral local
PDF memory/cache:

- Full name
- Date of birth
- Street address
- Driver's licence number
- Health-card number

Never put them in a Supabase row/query, support field, AI prompt, log, error,
analytics event, environment variable, or admin view. Do not expose underlying
native/database errors if they could echo input.

Support is deliberately not free text. Mobile, migration 010, and the Edge
helper contain the same six-question allowlist; CI checks all three copies.
Migration 012 prevents arbitrary client-authored thread subjects. Migration
014 permanently marks any HUMAN transition or admin reply. Unknown or legacy
user messages fail closed to a human without reaching Gemini.

Sign-out and account deletion wipe the device PII vault and filled-PDF cache.
Deletion also removes the server account and local session.

### RLS/RPCs are the authorization boundary

- Users access only their own profile, progress, and support rows.
- Admin membership comes from `admin_users` and `is_admin()`, never a client
  email list.
- Only public Supabase publishable keys (or legacy anon keys) may ship in
  mobile, landing, and admin. Compatibility variable names still use
  `*_ANON_KEY`.
- `service_role` is limited to server functions/worker operations.
- Live-rule approval/dismissal and worker baseline persistence are RPC-only.
- Keep SECURITY DEFINER `search_path`, role grants, row locks, and transition
  checks explicit and covered by pgTAP.

### Migrations and types

- `supabase/migrations/001_*.sql` through `016_*.sql` are the ordered schema
  source of truth. Add the next numbered migration; do not rewrite deployed
  behavior in an older migration.
- The `Database` interface must remain byte-identical in
  `mobile/types/database.ts` and `admin/src/types/database.ts`.
- Run `bash scripts/check-database-types-sync.sh` after schema/type changes.

### Dependency and git discipline

- Each JavaScript app has its own `package.json` and `package-lock.json`.
- Dependency changes require a matching lockfile and a clean `npm ci` check.
- Mobile targets iOS/Android only; do not reintroduce the unused web surface.
- Landing is a Next.js 16 static export and currently builds with webpack to
  avoid the local sandbox's Turbopack port restriction.
- Use Python 3.11 for worker verification; the existing local Python 3.14 venv
  is incompatible with pinned Playwright 1.44.
- Never use destructive git commands on this repository without explicit user
  authorization.

## Repository map

```text
ReloGo/
├── mobile/                    Expo user app
│   ├── app/(auth)/            onboarding/legal consent
│   ├── app/(tabs)/            checklist, profile, fixed-question support
│   ├── lib/                   auth storage, PII, PDF, account, dates, questions
│   └── types/database.ts      synchronized database contract
├── landing/                   Next.js static marketing/legal/waitlist
├── admin/                     protected operations dashboard
├── worker/                    official HTML/PDF monitor and reporting
├── supabase/
│   ├── migrations/            ordered schema, seed, security, RPCs
│   ├── functions/support-ai/  Deno/Gemini support function and pure helpers
│   └── tests/                 pgTAP RLS/RPC adversarial suite
├── scripts/                   cross-app contract checks
├── docs/
│   ├── PLAN.md                canonical status and phased roadmap
│   ├── DEPLOYMENT.md          deployment/runbook details
│   └── ai/AI_HANDOFF.md       this working brief
└── .github/workflows/         CI and daily worker schedule
```

See [PROJECT_MAP.md](PROJECT_MAP.md) for annotated paths. Tracked generated
Vite/Supabase temp files and duplicate root Expo config were removed during the
July stabilization pass.

## Runtime behavior

### Authentication, profile, and checklist

1. Root layout restores the encrypted Supabase session and guards stale/racing
   profile checks.
2. Onboarding requires legal consent, signs in anonymously, and upserts only
   non-PII move metadata.
3. Checklist queries the profile, corridor rules/global tasks, and progress.
4. Exact/`ANY` corridor matching and vehicle/dependent flags select tasks.
5. Deadlines use local calendar arithmetic; zero days means the move date.
6. Progress toggles update optimistically and persist through an upsert.

### Local PII and PDFs

1. Profile PII uses `expo-secure-store`; it never enters Supabase.
2. `pdfEngine.ts` fills registered field names entirely on-device.
3. Production currently registers no government templates; only a development
   sample exists.
4. Filled PDFs use a dedicated cache. iOS deletes after sharing; Android waits
   until the next fill/app start because share targets may read asynchronously.
   Sign-out/account deletion always wipe the directory.

### Support

1. Mobile loads the latest user-owned thread and subscribes to messages/status.
2. A user selects one of six fixed questions; migration 010 enforces the exact
   body and migration 012 prevents free-text thread metadata.
3. While status is `AI`, mobile invokes `support-ai` with only the thread ID.
4. The function authenticates ownership, rejects a durable human-takeover
   marker, scans all user turns, rejects admin history/unsafe legacy body,
   applies replay/rate bounds, and builds grounding only from non-PII move/task
   data.
5. Gemini receives a bounded fixed-question transcript. Reply persistence is a
   row-locked RPC that rechecks ownership state/latest turn/human history and
   the persistent marker.
6. A HUMAN status or admin reply stamps an immutable server timestamp, so human
   participation permanently disqualifies that transcript from AI even after
   resolve/reopen.
7. Invoke/query/model failures fail closed or persist a safe human handoff.

### Worker and rule review

1. Worker fetches service-authorized source metadata and scrapes every source
   with bounded concurrency and isolated pages/downloads.
2. HTML has sanity/size gates; PDFs are downloaded inertly with a 25 MiB cap.
3. Results are processed in deterministic source-ID order.
4. `persist_official_source_scrape()` row-locks the source and uses the expected
   hash as a compare-and-swap guard. It atomically records BASELINE/UNCHANGED or
   creates a PENDING alert plus advances CHANGED; STALE work writes nothing.
5. Any source failure or STALE outcome remains visible in logs, webhook/job
   summary, and a non-zero exit code without preventing other sources from
   running. HTML text is bounded by `MAX_HTML_TEXT_CHARS` (default and hard
   ceiling `1000000`) before persistence.
6. Admin approval/dismissal is row-locked and RPC-only. Worker code and grants
   do not permit live corridor-rule updates.

## Important schema/RPC inventory

Core tables: `global_tasks`, `corridor_task_rules`, `official_sources`,
`rule_change_alerts`, `user_profiles`, `user_task_progress`, `waitlist`,
`waitlist_signup_throttle`, `admin_users`, `support_threads`, and
`support_messages`.

Key RPCs:

- `join_waitlist()`
- `is_admin()`
- `admin_list_users()` / `admin_get_user_detail()`
- `delete_current_user()`
- `approve_rule_change()` / `dismiss_rule_change()`
- `persist_support_ai_reply()`
- `persist_official_source_scrape()`

## Verification matrix

Run from the repository root unless the command changes directory.

```bash
# Cross-app contracts
bash scripts/check-database-types-sync.sh
bash scripts/check-support-questions-sync.sh
git diff --check

# Mobile
cd mobile
npm ci
npx expo install --check
npm run typecheck
npm test -- --runInBand
npx expo export --platform ios --output-dir /tmp/relogo-ios-check --clear
npx expo export --platform android --output-dir /tmp/relogo-android-check --clear

# Admin
cd ../admin
npm ci
npm run build
npm audit --omit=dev

# Landing
cd ../landing
npm ci
npm run lint
npm run build
npm audit --omit=dev

# Worker (Python 3.11)
cd ../worker
python3.11 -m pip install -r requirements-dev.txt
python3.11 -m py_compile main.py changedetect.py reporting.py
python3.11 -m pytest

# Database (Docker required)
cd ..
supabase start
supabase db reset --local
supabase db lint --local --schema public --level warning --fail-on warning
supabase test db --local supabase/tests/

# Deno helpers (CI also runs these)
deno test supabase/functions/support-ai/grounding_test.ts \
  supabase/functions/support-ai/humanTakeover_test.ts \
  supabase/functions/support-ai/supportQuestions_test.ts
```

### Latest established results

- Mobile clean install/dependency check/typecheck and iOS/Android Hermes
  exports: pass; Jest 40/40.
- Mobile production audit: 12 moderate Expo build-tool transitives, 0
  high/critical; npm offers only a breaking forced downgrade.
- Admin build: pass; production dependency audit: 0 vulnerabilities.
- Landing Next.js 16 lint/build: pass; production audit: 0 vulnerabilities.
- Worker Python 3.11 compile and 69/69 tests: pass.
- Database types are byte-identical at 285 lines; the three support-question
  allowlists match.
- Fresh migrations 001–016, public-schema lint, and all 143 pgTAP assertions:
  pass locally and against both hosted projects.
- Preview's disposable hosted journey passed anonymous auth, profile upsert,
  five matching checklist rules, support fallback persistence, and account
  deletion.
- `support-ai` is ACTIVE with JWT verification on both projects; unauthenticated
  requests return 401. `GEMINI_API_KEY` is absent, so the tested behavior is
  fallback-to-human, not a real Gemini response.
- Hosted security/performance advisors have no errors. Remaining warnings are
  reviewed intentional RPC/RLS policy shape and fresh-project unused indexes.
- Workflow YAML and project/package JSON parsing: pass. Deno is not installed
  locally; the Deno helper suite is enforced by CI.

## Hosted environment state

- Supabase preview: `ReloGo Preview`, project ref
  `uwfblgllkibbupqyofkl`, region `ca-central-1`.
- Supabase production: `ReloGo Production`, project ref
  `yskknolxbxfxakgvrcmg`, region `ca-central-1`.
- Anonymous sign-ins are enabled on both with a 30/hour/IP limit. Migrations
  001–016 and `support-ai` version 1 are deployed to both.
- Machine-local Supabase link state is intentionally left on preview. Database
  passwords are in macOS Keychain services `ReloGo Supabase Preview DB` and
  `ReloGo Supabase Production DB`, account `tamimorif`; never print them.
- Vercel `relogo` maps to `landing/`; `relo-go` maps to `admin/`.
  Development/preview variables use preview Supabase and production variables
  use production Supabase.
- EAS project `@tamimorif/relogo` has the same mapping across its
  development/preview/production environments. Ignored local env files point
  all three apps at preview.
- Do not run `supabase config push`: `supabase/config.toml` contains localhost
  Auth URLs. Patch hosted Auth fields minimally or use the Dashboard.
- Hosted `supabase test db --linked` uses a restricted temporary role without
  pgTAP schema usage. Run hosted pgTAP through the password-authenticated linked
  pooler URL; the suite is transactional and rolls back.
- Supabase CLI 2.107.0 may emit a pg-delta temporary-CA catalog-cache warning
  after a successful migration. Confirm remote history/post-push dry run, lint,
  and pgTAP rather than relying on that optional cache.

## Known limits and next work

1. Obtain `GEMINI_API_KEY`, set it on preview, run a real authenticated support
   flow, then set/test production.
2. Select/create the first admin identity and add it to `admin_users` in both
   environments; verify `is_admin()` and an admin-only RPC.
3. Choose a backup/PITR-capable Supabase plan and complete a restore drill.
4. Deploy landing/admin and run a real worker baseline + webhook test.
5. Build EAS preview binaries and perform full two-platform/live E2E QA.
6. Verify government content and add/test a real fillable PDF.
7. Add consent version/timestamp + re-consent, legal/store approval, monitoring,
   incident response, and support ownership.

Non-blocking engineering debt: a recoverable pre-generation AI lease (atomic
finalization already prevents duplicate stored replies), server-side admin user
pagination, explicit waitlist throttle feedback that preserves enumeration
safety, workload-specific credentials/narrow escalation RPCs instead of the
shared aggregate `service_role`, and broader automated end-to-end coverage.

## Operational facts

- Anonymous sign-ins must be enabled or onboarding fails.
- Scheduled GitHub workflows run from the default branch; the worker cron is not
  active until merged there.
- Worker GitHub secrets: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`; optional
  `ALERT_WEBHOOK_URL`.
- Edge secret: `GEMINI_API_KEY`; never expose it to clients.
- Public publishable/legacy-anon keys are expected in client bundles; database
  security must never depend on hiding them.
- EAS `development` and `preview` currently target preview Supabase;
  `production` targets production. Preserve that separation during rotations.
- `privacy@relogo.app` is a placeholder until a monitored public mailbox exists.

## Documentation rule

- Status, remaining work, phases, and definition of done: `docs/PLAN.md` only.
- Current agent architecture/rules/checks/next engineering tasks: this file.
- Deployment commands/platform setup: `docs/DEPLOYMENT.md`.
- Annotated structure only: `docs/ai/PROJECT_MAP.md`.
- Do not create another roadmap, status file, action list, or handoff log.

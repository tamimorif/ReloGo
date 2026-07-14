# ReloGo — AI agent handoff

_Current as of 2026-07-14_

Read this file completely before changing the repository. The canonical product
roadmap is [../PLAN.md](../PLAN.md); operational commands are in
[../DEPLOYMENT.md](../DEPLOYMENT.md).

## Mission and stage

ReloGo converts a move between Canadian provinces or territories into a
personalized checklist of official tasks and suggested timing. A substantial
MVP is implemented. The current shared tree has clean local verification for
migrations 001–022, 85 API integration cases, and the checks recorded below,
but the change set is dirty/uncommitted and migrations 019–022 plus the current
app/web changes are not deployed. The isolated Canadian cloud foundation is
provisioned at migrations 001–018 with `support-ai` version 2, configured Gemini
and verified first-admin authorization. Still not release-approved: current
schema/app promotion, full live/device QA, remaining government-content/legal
review, a healthy worker baseline/webhook, backup billing/restore drill, admin
credential rotation, and production operations remain.

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

The prior stabilization baseline is committed on `tamim`; the current
release-readiness change set is dirty and uncommitted. Re-check the exact
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
native/database errors if they could echo input. Crash/error capture
(`mobile/lib/errorReporting.ts`) enforces this by construction: it redacts
numeric identifiers, emails, and opaque tokens, records only non-PII metadata
(name/message/context/timestamp), and never transmits anything off-device. The
top-level `AppErrorBoundary` shows a generic recovery screen with no error text.
Wiring an external crash service is a deliberate, privacy-reviewed future
decision — the sink in `reportFatalError` is the single seam for it.

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

- `supabase/migrations/001_*.sql` through `022_*.sql` are the ordered local
  schema source of truth. Migrations 001–018 are hosted; 019–022 are local and
  uncommitted. Add the next numbered migration; do not rewrite deployed
  behavior in an older migration.
- Migration 017 adds an admin bootstrap trigger that automatically registers
  users with admin emails (`admin@relogo.app` / `admin@relogo.ca`) into
  `admin_users` on `auth.users` insert. The trigger function is `SECURITY
  DEFINER` with a restricted `search_path` and all direct execute privileges
  are revoked.
- Migration 019 makes policy acceptance timestamps server-authored, exposes
  narrow consent-state/acceptance RPCs, and gates normal user data on the
  server-current policy version. Keep the database, mobile, and legal-page
  policy version synchronized with `scripts/check-consent-version-sync.sh`.
- Migration 020 is the conservative result of the source audit: a fresh reset
  has 53 rules/sources and 12 numeric deadlines. Do not restore an exact day for
  calendar-month, conditional, unsupported-scope, or stale-law wording without
  new authoritative evidence and human review.
- Migration 021 replaces `admin_list_users()` with `admin_list_users(p_limit,
  p_offset)`: server-side LIMIT/OFFSET paging (clamped to [1,200] / offset ≥ 0)
  plus a `total_count` column. Still `is_admin()`-gated, SECURITY DEFINER, and
  PII-free. The zero-arg call site keeps working via defaults (50, 0).
- Migration 022 makes `join_waitlist()` return `'accepted'`/`'throttled'`
  instead of VOID. Enumeration safety is preserved: a duplicate email still
  returns `'accepted'`; only the caller's own per-IP hourly cap yields
  `'throttled'`. Re-grant to `anon, authenticated` after the DROP+CREATE.
- The extracted `Database` interface must remain byte-identical in
  `mobile/types/database.ts` and `admin/src/types/database.ts`; the complete
  files intentionally contain different app-specific helper types.
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
│   ├── app/(auth)/            onboarding and fail-closed policy re-consent
│   ├── app/(tabs)/            checklist, profile, fixed-question support
│   ├── components/            top-level PII-safe crash boundary
│   ├── lib/                   auth, PII, PDF templates/engine, legal consent, dates, error reporting
│   ├── eslint.config.js       Expo flat ESLint config (CI-gated)
│   └── types/database.ts      synchronized database contract
├── landing/                   Next.js static marketing/legal/support/waitlist
├── admin/                     protected operations dashboard
├── worker/                    official HTML/PDF monitor and reporting
├── supabase/
│   ├── migrations/            ordered schema, seed, security, RPCs
│   ├── functions/support-ai/  Deno/Gemini support function and pure helpers
│   └── tests/                 pgTAP RLS/RPC adversarial suite
├── scripts/                   cross-app contract checks
├── tests/
│   └── e2e/                   Python 3.11 + pytest API integration suite (85 cases)
├── docs/
│   ├── PLAN.md                canonical status and phased roadmap
│   ├── DEPLOYMENT.md          deployment/runbook details
│   ├── BACKUP_RESTORE.md      Supabase backup/PITR posture and runbooks
│   └── ai/AI_HANDOFF.md       this working brief
└── .github/workflows/         CI, daily worker, and opt-in local uptime workflow
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
3. An authenticated profile whose policy version is stale is routed to the
   re-consent screen. The server-current version and server-authored timestamp
   are accepted only through the narrow migration 019 boundary; declining can
   still delete the account.
4. Checklist queries the profile, corridor rules/global tasks, and progress.
5. Exact/`ANY` corridor matching and vehicle/dependent flags select tasks. The
   seeded jurisdiction rules currently use `ANY` origins, so origin-specific
   content is not yet implemented.
6. Deadlines use local calendar arithmetic; zero days means the move date.
7. Progress toggles update optimistically and persist through an upsert.

### Local PII and PDFs

1. Profile PII uses `expo-secure-store`; it never enters Supabase.
2. `pdfTemplates.ts` selects a form by task plus destination;
   `pdfEngine.ts` downloads the official blank only after an explicit tap,
   requests a bounded byte range, cancels over-limit/backgrounded transfers,
   verifies its audited SHA-256 before reading PII, validates mapped fields,
   and fills them entirely on-device.
3. The current local tree registers British Columbia's official Application
   for Health and Drug Coverage for BC health tasks. Unit tests pass; it has not
   been verified on a current SDK 55 EAS build or real device and is not in the
   deployed app.
   Non-WinAnsi field values remain Unicode PDF strings and request viewer-side
   appearances rather than crashing; the pre-share acknowledgement requires
   the user to review every field.
4. Filled PDFs use a dedicated cache. iOS deletes after sharing. Android
   schedules deletion of that exact temporary file after a ten-minute grace
   period for asynchronous share targets. A non-PII expiry marker restores the
   remaining timer after a restart, and transient deletion failures retain the
   marker and retry. Next fill/app start deletes only expired files, while
   sign-out/account deletion wipe the cache unconditionally.

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
- `current_policy_version()` / `get_policy_consent_state()`
- `has_current_policy_consent()` / `accept_current_policies()`
- `approve_rule_change()` / `dismiss_rule_change()`
- `persist_support_ai_reply()`
- `persist_official_source_scrape()`

## Verification matrix

Run from the repository root unless the command changes directory.

```bash
# Cross-app contracts
bash scripts/check-database-types-sync.sh
bash scripts/check-support-questions-sync.sh
bash scripts/check-consent-version-sync.sh
git diff --check

# Mobile
cd mobile
npm ci
npx expo install --check
npm run lint
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

# Supabase API integration suite (resets/owns its local test data)
python3.11 -m pip install -r tests/e2e/requirements.txt
python3.11 -m pytest tests/e2e/ --strict-markers -ra

# Public route markers (after serving/deploying the current landing/admin build)
bash scripts/check-public-uptime.sh

# Deno helpers (CI also runs these)
deno test supabase/functions/support-ai/grounding_test.ts \
  supabase/functions/support-ai/humanTakeover_test.ts \
  supabase/functions/support-ai/supportQuestions_test.ts
```

### Latest established results

These results apply to the current local, dirty/uncommitted shared tree. They do
not mean migrations 019–022, the web changes, or a new mobile build are hosted.

- Mobile clean install/dependency check/typecheck and iOS/Android Hermes
  exports: pass; Jest 85/85.
- Mobile production audit: 12 moderate Expo build-tool transitives, 0
  high/critical; npm offers only a breaking forced downgrade.
- Mobile ESLint is now a configured CI gate. `eslint@9` with the
  `eslint-config-expo` flat config (`mobile/eslint.config.js`) runs via
  `npm run lint` and the `mobile-lint` job; it passes with 0 errors (one
  pre-existing `react-hooks/exhaustive-deps` warning on the stable expo-router
  `router` is intentionally left). Current mobile gates are ESLint, dependency
  alignment, TypeScript, Jest, and native exports. `react/no-unescaped-entities`
  and `@typescript-eslint/array-type` are disabled by design (RN `<Text>`
  renders entities literally; array-type is stylistic and would force the
  CI-synced `types/database.ts` to diverge from admin's byte-identical copy).
- Admin build: pass; production dependency audit: 0 vulnerabilities.
- Landing Next.js 16 lint/build: pass; production audit: 0 vulnerabilities.
- Worker Python 3.11 compile and 69/69 tests: pass.
- The extracted mobile/admin `Database` interface is byte-identical at 305
  lines; the three support-question allowlists and mobile/database/legal policy
  version (`1.1`) match.
- A clean local reset applies migrations 001–022; public-schema lint is clean;
  pgTAP passes 164/164; the Python Supabase API integration suite passes 85/85.
- Preview's disposable hosted journey passed anonymous auth, profile upsert,
  five matching checklist rules, support fallback persistence, and account
  deletion.
- `support-ai` version 2 is ACTIVE with JWT verification on both projects;
  unauthenticated requests return 401. `GEMINI_API_KEY` is configured, but a
  complete authenticated mobile-to-Gemini-to-Realtime/device journey is not yet
  documented as passing.
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
  001–018 and `support-ai` version 2 are deployed to both; migrations 019–022
  remain local/uncommitted.
- Machine-local Supabase link state currently points to production, despite the
  intended preview-first default. Relink preview after explicit hosted work and
  always pass project refs for secrets/functions. Database
  passwords are in macOS Keychain services `ReloGo Supabase Preview DB` and
  `ReloGo Supabase Production DB`, account `tamimorif`; never print them.
- Vercel `relogo` maps to `landing/`; `relo-go` maps to `admin/`.
  Development/preview variables use preview Supabase and production variables
  use production Supabase. Existing public aliases are
  `https://relogo-two.vercel.app` and `https://relo-go.vercel.app`; they serve
  the earlier committed build. The current Support/legal changes are not
  deployed, `relogo.app` is not attached/resolving, and the public mailbox is
  not configured. The ignored local `admin/.vercel` link names project `admin`,
  not the intended `relo-go`; relink or target explicitly before deployment.
- EAS project `@tamimorif/relogo` has the same mapping across its
  development/preview/production environments. Ignored local env files point
  all three apps at preview. Existing cloud artifacts are three old SDK 51
  production builds; no current SDK 55 preview/device build exists.
- Do not run `supabase config push`: `supabase/config.toml` contains localhost
  Auth URLs. Patch hosted Auth fields minimally or use the Dashboard.
- Hosted `supabase test db --linked` uses a restricted temporary role without
  pgTAP schema usage. Run hosted pgTAP through the password-authenticated linked
  pooler URL; the suite is transactional and rolls back.
- Supabase CLI 2.107.0 may emit a pg-delta temporary-CA catalog-cache warning
  after a successful migration. Confirm remote history/post-push dry run, lint,
  and pgTAP rather than relying on that optional cache.

## Known limits and next work

Phase 1 is complete except backup billing/restore and hosted admin credential
rotation. Phase 2 remains open until the current web build is deployed, public
support ownership exists, and the worker completes a healthy baseline plus
webhook path.

1. Choose a backup/PITR-capable Supabase plan and complete a restore drill
   (documentation is ready at `docs/BACKUP_RESTORE.md`).
2. Rotate/revoke the bootstrap admin credentials removed from tracked helper
   files; the old value remains in Git history, so choose a reviewed history
   remediation approach without rewriting shared history casually.
3. Commit/push the Ubuntu 22.04 worker-runner fix, run a real 53-source baseline,
   and test webhook delivery. The first manual run failed before scraper startup
   on Ubuntu 24.04 Playwright dependencies.
4. Preview-deploy and promote migrations 019–022 only after hosted checks; deploy
   the current landing/mobile changes and verify policy re-consent.
5. Build SDK 55 EAS preview binaries and perform full two-platform/live E2E QA,
   including the BC PDF download/fill/review/share/cache lifecycle.
6. Resolve the 15 source fetch failures from the independent audit, deepen
   origin/destination content, and obtain human/legal/store approval.

Resolved engineering debt: server-side admin pagination (migration 021),
enumeration-safe waitlist signup feedback (migration 022), and broader
consent/RLS end-to-end coverage (E2E 82→85, pgTAP 160→164).

Remaining non-blocking engineering debt, both deferred because they cannot be
completed and verified in the local tree:

- A recoverable pre-generation AI lease so two concurrent support invocations do
  not both spend Gemini quota (atomic finalization already prevents a duplicate
  stored reply). Deferred: it must change the `support-ai` Deno Edge critical
  path, which has no local test harness (Deno is CI-only here), so it cannot be
  exercised before shipping. Only worth doing if spend becomes material.
- Workload-specific credentials / narrow escalation RPCs instead of the shared
  aggregate `service_role` for the worker and Edge Function. Deferred: this needs
  new hosted database roles, minted JWTs, and deployment-secret changes, so it
  cannot be built or verified locally — it is hosted-infra work.

## Operational facts

- Anonymous sign-ins must be enabled or onboarding fails.
- The worker schedule is present on the default branch and its required secrets
  exist. Its first manual run failed during runner dependency installation;
  the local Ubuntu 22.04 fix is uncommitted and no healthy baseline exists.
- Worker GitHub secrets: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`; optional
  `ALERT_WEBHOOK_URL`.
- Edge secret: `GEMINI_API_KEY`; never expose it to clients.
- Public publishable/legacy-anon keys are expected in client bundles; database
  security must never depend on hiding them.
- EAS `development` and `preview` currently target preview Supabase;
  `production` targets production. Preserve that separation during rotations.
- No public mailbox is configured; do not publish `privacy@relogo.app` unless it
  becomes monitored. The custom `relogo.app` domain is not currently attached
  or resolving.

## Documentation rule

- Status, remaining work, phases, and definition of done: `docs/PLAN.md` only.
- Current agent architecture/rules/checks/next engineering tasks: this file.
- Deployment commands/platform setup: `docs/DEPLOYMENT.md`.
- Annotated structure only: `docs/ai/PROJECT_MAP.md`.
- Do not create another roadmap, status file, action list, or handoff log.

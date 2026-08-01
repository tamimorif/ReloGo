# ReloGo — AI agent handoff

_Current as of 2026-07-31_

Read this file completely before changing the repository. The canonical product
roadmap is [../PLAN.md](../PLAN.md); operational commands are in
[../DEPLOYMENT.md](../DEPLOYMENT.md).

## Mission and stage

ReloGo turns a move between Canadian provinces or territories into a
personalized checklist of government tasks, timing, and official sources. The
reviewed recovery implementation is pushed on
`codex/recovery-and-mobile-startup` at commit `0135964`. Its database
migrations and Edge Function are deployed to production, the reviewed admin
recovery is live, and the landing site is unchanged/live. The product release
is not complete because mobile device/store, worker, CI, secret, and human
approval gates remain.

The shipped App Store 1.0 binary was built from SDK 51 and contains the retired
Supabase ref `fxrynmgaymslwcklfena`. That project is deleted, the ref is present
in the compiled Hermes bundle, the build had no compatible `expo-updates`
runtime, and EAS has no OTA update for it. The binary cannot be repaired or
redirected. Recovery requires a new 1.0.1 store binary.

Environment truth:

- Local schema: migrations 001–026.
- Preview `uwfblgllkibbupqyofkl`: migrations 001–026 and JWT-protected
  `support-ai` v3; live smoke passed, then the project was deliberately paused.
- Production `yskknolxbxfxakgvrcmg`: active, currently linked locally,
  exact migrations 001–026 and JWT-protected `support-ai` v4. Dry run is clean,
  anonymous auth is enabled, unauthenticated function invocation returns 401,
  and the self-cleaning smoke passed anonymous auth, resolver output with five
  tasks/five HTTPS sources, a minimal onboarding profile insert, authoritative
  consent/profile confirmation, and cleanup. Profile, waitlist, support, and
  progress tables are empty.
- Web: the reviewed admin recovery is live at `https://relo-go.vercel.app`, the
  landing site is unchanged/live, and backend-aware uptime run #113 passed the
  production web, anonymous-auth, and canonical-resolver checks.
- Mobile builds: iOS production version 1.0.1 build 6 is `FINISHED` (EAS
  `2c83c4f5-b154-4632-8604-6350a77bbee4`); Android production version 1.0.1
  build 3 is `FINISHED` (EAS
  `20256d8c-cf12-472c-a236-7223e0207103`). Neither status is real-device QA or
  store-submission evidence.
- GitHub: recovery commit `0135964` and the final evidence update are pushed in
  pull request #2. Actions variables are corrected. Encrypted secrets still
  contain old values pending the owner's passkey-authorized update; required CI
  checks are the review gate.

Remaining release gates include pull-request/CI evidence, real-device
startup/PDF/privacy QA, store submission and review, the
owner's passkey-authorized encrypted-secret update, a healthy worker
baseline/webhook, backup funding/restore drill, admin credential rotation, a
monitored public mailbox/domain, correction of the live App Store privacy
answer, and human legal/content/store approval.

The worker may create PENDING alerts. It must never change live rules; only a
human admin may approve a rule change.

## Start every task this way

1. Read [../PLAN.md](../PLAN.md) and run `git status --short --branch`.
2. Preserve all unrelated/user changes. The current dirty recovery tree is
   intentional; do not reset, discard, or broadly reformat it.
3. Read every migration, RLS policy, RPC, and client path involved.
4. Check the exact Supabase target before any hosted action. Local link state
   currently points to production; use explicit project refs for functions,
   secrets, and status checks.
5. Make the smallest coherent change and add adversarial coverage.
6. Run proportional checks from this file and record the exact tree/environment
   each result covers.
7. Update PLAN only for roadmap/status changes and this file only for current
   architecture, invariants, verification, or ordered engineering handoff.

Never push, merge, migrate production, deploy production, rotate credentials,
or submit a store build without the corresponding explicit authorization.

## Non-negotiable rules

### PII stays on the device

These values may exist only in `mobile/lib/secureStore.ts` and ephemeral local
PDF memory/cache:

- full name;
- date of birth;
- street address;
- driver's licence number; and
- health-card number.

Never put them in a Supabase row/query, support field, AI prompt, log, error,
analytics event, environment variable, or admin view. Never expose a raw native
or database error if it could echo input. `mobile/lib/errorReporting.ts`
redacts identifiers, emails, and opaque tokens and stores only non-PII metadata
on-device. `AppErrorBoundary` shows generic recovery UI. Adding an external
crash/analytics service requires explicit privacy review and may receive only a
sanitized record.

Support is deliberately not free text. Mobile, migration 010, and the Edge
helper contain the same six-question allowlist; CI checks all copies. Migration
012 blocks arbitrary client-authored thread subjects. Migration 014 permanently
marks human involvement. Unknown/legacy user messages fail closed to a human
without reaching Gemini.

Sign-out and account deletion wipe the local PII vault and filled-PDF cache.
Deletion also removes the server account and local session.

### RLS/RPCs are the authorization boundary

- Users access only their own profile, progress, and support rows.
- Admin membership comes from `admin_users` and `is_admin()`, never a client
  email list.
- Only public Supabase publishable/legacy anon keys may ship in mobile,
  landing, and admin. Compatibility names still use `*_ANON_KEY`.
- `service_role`/secret keys are server-only. Never put one in a client,
  committed file, command output, or documentation example value.
- Live-rule approval/dismissal and worker persistence are RPC-only.
- Keep SECURITY DEFINER `search_path`, grants/revokes, row locks, transition
  checks, and 2026 Data API privilege behavior explicit and covered by pgTAP.

### Migrations and types

- `supabase/migrations/001_*.sql` through `026_*.sql` are the ordered local
  schema source of truth. Preview and production both have 001–026. The next
  migration is 027. Never rewrite a deployed migration.
- `supabase/seed.sql` is local-only. It reproduces hosted baseline
  table/sequence grants before reapplying migration-defined restrictions;
  `supabase db push` never applies it. Read its header before changing grants.
- Migration 017 bootstraps the reviewed admin emails through a restricted
  `SECURITY DEFINER` auth trigger. Direct function execution is revoked.
- Migration 019 makes policy timestamps server-authored, provides the
  consent/re-consent RPC boundary, and gates normal user data on the current
  policy. Its `user_profiles` UPDATE policy means first-time creation must
  INSERT and fall back to UPDATE; supabase-js `.upsert()` is rejected for a new
  profile. `test_policy_74b` pins this behavior.
- Migration 020 is the conservative source audit: 53 rules/sources and 12
  numeric deadlines after reset. Do not add exact timing for calendar-month,
  conditional, unsupported, or stale-law wording without authoritative
  evidence and human review.
- Migration 021 adds bounded server-side admin pagination; migration 022 adds
  enumeration-safe `accepted`/`throttled` waitlist feedback.
- Migration 023 defines `resolve_corridor_rules(origin,destination)`. It returns
  one deterministic rule per task with precedence exact/exact →
  `ANY`/destination → origin/`ANY` → `ANY`/`ANY`, ordered validated HTTPS
  sources, and explicit `anon`/`authenticated` execute grants. Mobile, admin
  detail/list, and support AI must reuse it rather than reimplement precedence.
- Migration 024 extends `get_policy_consent_state()` with the full allowlisted
  non-PII startup profile only when consent is current; stale/missing consent
  returns `profile: null`.
- Migration 025 converts/removes `LOCKED`. Stored progress is only `AVAILABLE`
  or `COMPLETED`, with `AVAILABLE` the default; missing rows also mean
  `AVAILABLE`.
- Migration 026 adds `NOT VALID` origin/destination inequality constraints to
  profiles and waitlist. Existing legacy rows survive, but new/updated invalid
  rows are rejected.
- The extracted `Database` interface must remain byte-identical in
  `mobile/types/database.ts` and `admin/src/types/database.ts`; app-specific
  helper types outside that interface may differ.
- Run `bash scripts/check-database-types-sync.sh` after schema/type changes.

### Dependency and git discipline

- Each JavaScript app owns its `package.json` and `package-lock.json`.
- Dependency changes require a matching lockfile and clean `npm ci`.
- CI/release development uses Node 22. Supabase JS dependencies no longer make
  Node 20 a safe documented baseline.
- Mobile is iOS/Android only; do not restore the unused web surface.
- Landing is a Next.js 16 static export and uses webpack in the build script.
- Use Python 3.11 for the worker; the updated runtime pins `supabase==2.31.0`
  so modern `sb_secret_` keys work.
- Mobile uses an exact scoped `xcode@3.0.1` override to `uuid@11.1.1`. It makes
  the production audit clean while retaining CommonJS compatibility; do not
  widen it to UUID 12+ or `latest`, and remove it when fixed upstream.
- Never use destructive git commands without explicit authorization.

## Repository map

```text
ReloGo/
├── mobile/                    Expo SDK 55 / 1.0.1 user app
│   ├── app/(auth)/            onboarding and fail-closed re-consent
│   ├── app/(tabs)/            checklist, profile, fixed-question support
│   ├── components/            PII-safe crash/recovery boundary
│   ├── lib/                   startup, auth, PII, PDF, legal, dates
│   ├── scripts/               release-configuration preflight
│   └── types/database.ts      synchronized database contract
├── landing/                   static marketing/legal/support/waitlist
├── admin/                     protected operations dashboard
├── worker/                    source monitor plus read-only preflight
├── supabase/
│   ├── migrations/            ordered schema/security/RPC source
│   ├── functions/support-ai/  Deno/Gemini function and tests
│   └── tests/                 pgTAP RLS/RPC adversarial suite
├── scripts/                   cross-app checks and hosted smoke
├── tests/e2e/                 Python 3.11 API integration suite
├── docs/                      maintained plan/deploy/recovery/handoff
└── .github/workflows/         CI, worker, and uptime automation
```

See [PROJECT_MAP.md](PROJECT_MAP.md) for annotated paths.

## Runtime behavior

### Authentication, startup, profile, and checklist

1. Supabase config is validated without throwing during module evaluation.
   Runtime URLs must be clean origins; production build preflight accepts only
   the exact production origin and trims/rejects a blank public key.
   Missing/invalid configuration renders a controlled recovery screen.
2. Native splash is released after React paints; remote session/profile work no
   longer holds a static splash. AsyncStorage ciphertext and SecureStore key
   are read concurrently.
3. Session restore is bounded at 3 seconds and consent/profile bootstrap at 5
   seconds. Failure produces retry UI rather than an indefinite loading page.
   The auth subscription ignores duplicate `INITIAL_SESSION` startup work.
4. The consent RPC returns server-current state plus an allowlisted profile only
   when current. Root seeds React Query with that profile, avoiding a duplicate
   profile round trip. Checklist profile/rule/progress reads have bounded stale
   times, an 8-second abort deadline, and `retry: false`.
5. Onboarding requires legal consent, signs in anonymously, and INSERTs only
   minimal non-PII move metadata, falling back to UPDATE where appropriate. It
   then calls `get_policy_consent_state()`; the RPC's authoritative allowlisted
   profile seeds the cache before routing to the checklist. Auth, profile
   insert/update, and confirmation waits are each bounded at 10 seconds.
6. Stale consent routes to re-consent; declining may still delete the account.
7. Checklist calls `resolve_corridor_rules()` once, filters required/optional
   rules by vehicle/dependents, calculates local-calendar deadlines, and shows
   safe official sources. Missing progress means `AVAILABLE`; optimistic writes
   toggle between `AVAILABLE` and `COMPLETED`.

### Local PII and PDFs

1. Profile PII uses `expo-secure-store`; it never enters Supabase.
2. Startup imports only lightweight `pdfCleanup.ts`. The heavy `pdf-lib` and
   sharing paths are dynamically imported after an explicit fill action.
3. `pdfTemplates.ts` selects a form by task/destination. `pdfEngine.ts`
   downloads the official blank only after a tap, requests a bounded range,
   cancels over-limit/backgrounded transfers, verifies the audited SHA-256
   before reading PII, validates mapped fields, and fills on-device.
4. The BC health-coverage form passes local unit/Unicode round-trip and an
   historical iOS Simulator share flow. It has not passed real-device
   Android/iOS QA on the current 1.0.1 production artifacts.
5. iOS deletes a filled PDF after sharing. Android retains the exact file for a
   ten-minute asynchronous share-target grace and retries safe cleanup. Start,
   sign-out, and deletion paths preserve the documented privacy behavior.

### Support

1. Mobile loads the latest owned thread and subscribes to messages/status.
2. The user selects one of six fixed questions; the database blocks other user
   bodies and free-text metadata.
3. While status is `AI`, mobile invokes `support-ai` with only `thread_id`.
4. Function v4 authenticates ownership, rejects durable human involvement,
   validates every user turn, bounds context/output, and applies one provider
   deadline across both response headers and the full response-body read. It
   grounds through the canonical corridor resolver and validated official
   sources.
5. Gemini receives only the bounded fixed-question transcript plus non-PII
   grounding. Persistence is a row-locked RPC that rechecks current state.
6. Human takeover/admin reply permanently disqualifies AI even after
   resolve/reopen. Provider/query/model failures expose generic PII-safe errors
   and fail closed to human support.
7. Preview v3 remains paused after authenticated smoke. Production v4 is ACTIVE
   with JWT verification, rejects unauthenticated invocation with 401, and has
   a passing public resolver smoke. Keep a production authenticated support
   check in release QA.

### Worker and rule review

1. `worker/preflight.py` accepts only the exact production Supabase origin, then
   performs fast read-only key, schema, and canonical-resolver checks before
   installing Chromium. It rejects preview, lookalike hosts, credentials,
   ports, paths, query strings, and fragments. Do not broaden it into writes.
2. Worker fetches narrow source metadata and scrapes every source with bounded
   concurrency and isolated pages/downloads. HTML/PDF content has sanity and
   size gates.
3. Results are processed in stable source-ID order.
4. `persist_official_source_scrape()` uses a row lock and expected-hash
   compare-and-swap. It records BASELINE/UNCHANGED or creates PENDING and
   advances CHANGED; stale work writes nothing.
5. Source failures/stale outcomes remain visible in logs, webhook/job summary,
   and a non-zero exit without preventing other source attempts.
6. Admin approval/dismissal is row-locked and RPC-only. Worker grants do not
   permit live-rule changes.

## Important schema/RPC inventory

Core tables: `global_tasks`, `corridor_task_rules`, `official_sources`,
`rule_change_alerts`, `user_profiles`, `user_task_progress`, `waitlist`,
`waitlist_signup_throttle`, `admin_users`, `support_threads`, and
`support_messages`.

Key RPCs:

- `join_waitlist()`;
- `is_admin()`;
- `admin_list_users()` / `admin_get_user_detail()`;
- `delete_current_user()`;
- `current_policy_version()` / `get_policy_consent_state()`;
- `has_current_policy_consent()` / `accept_current_policies()`;
- `resolve_corridor_rules()`;
- `approve_rule_change()` / `dismiss_rule_change()`;
- `persist_support_ai_reply()`; and
- `persist_official_source_scrape()`.

## Verification matrix

Run from the repository root unless the command changes directory. Do not turn
an old green result into current evidence without rerunning it on the final tree.

```bash
# Cross-app contracts
bash scripts/check-database-types-sync.sh
bash scripts/check-support-questions-sync.sh
bash scripts/check-consent-version-sync.sh
git diff --check

# Mobile (Node 22)
cd mobile
npm ci
npm run check:release
npx expo install --check
npm run lint
npm run typecheck
npm test -- --runInBand
npx expo export --platform ios --output-dir /tmp/relogo-ios-check --clear
npx expo export --platform android --output-dir /tmp/relogo-android-check --clear

# Admin
cd ../admin
npm ci
npm run lint
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
python3.11 -m py_compile main.py changedetect.py reporting.py preflight.py
python3.11 -m pytest

# Database (Docker required)
cd ..
supabase start
supabase db reset --local
supabase db lint --local --schema public --level warning --fail-on warning
supabase test db --local supabase/tests/

# Supabase API integration suite (self-cleaning)
python3.11 -m pip install -r tests/e2e/requirements.txt
python3.11 -m pytest tests/e2e/ --strict-markers -ra

# Public route markers (defaults to current aliases)
bash scripts/check-public-uptime.sh

# Backend-inclusive probe: use the exact production URL and public key only.
# Never use a secret/service-role key here.
REQUIRE_SUPABASE_CHECK=true \
SUPABASE_URL='https://yskknolxbxfxakgvrcmg.supabase.co' \
SUPABASE_PUBLIC_KEY='<production-publishable-key>' \
bash scripts/check-public-uptime.sh

# Deno function gates
deno fmt --check supabase/functions/support-ai
deno lint supabase/functions/support-ai
deno check --config supabase/functions/support-ai/deno.json \
  supabase/functions/support-ai/index.ts
deno test --config supabase/functions/support-ai/deno.json \
  supabase/functions/support-ai/grounding_test.ts \
  supabase/functions/support-ai/humanTakeover_test.ts \
  supabase/functions/support-ai/supportQuestions_test.ts
```

### Latest established results

- Current recovery database slice: fresh reset 001–026, public lint clean,
  pgTAP 198/198, focused resolver/integrity API E2E 5/5.
- Preview: exact 001–026 ledger and hosted smoke passed, including anonymous
  auth, resolver/HTTPS sources, consent gate, authenticated non-fallback AI,
  and cleanup, before deliberate pause.
- Production: exact 001–026 ledger, clean dry run, anonymous auth enabled,
  self-cleaning smoke passed anonymous auth, resolver 5 tasks/5 HTTPS sources,
  minimal onboarding profile insert, authoritative consent/profile
  confirmation, and cleanup; `support-ai` v4 is ACTIVE with JWT verification,
  and unauthenticated invocation is rejected with 401. Profile, waitlist,
  support, and progress tables are empty.
- Mobile production dependency audit: 0 vulnerabilities after exact
  `xcode@3.0.1` → `uuid@11.1.1`; clean install and iOS project generation pass.
- Final current-tree local matrix (2026-07-31): mobile release configuration,
  TypeScript, lint, 11 Jest suites with 113/113 tests, iOS export at 1,752
  modules/5.8 MB Hermes bytecode, Android export at 1,773 modules/5.9 MB Hermes
  bytecode, and production audit 0; admin and landing lint/build; Deno
  format/lint/type checks and support tests 12/12; worker compile and tests
  77/77; contract sync, workflow YAML, shell syntax, and diff checks all passed.
- iOS production store build is `FINISHED`: version 1.0.1, build 6, EAS
  `2c83c4f5-b154-4632-8604-6350a77bbee4`.
- Android production store build is `FINISHED`: version 1.0.1, build 3, EAS
  `20256d8c-cf12-472c-a236-7223e0207103`.
- No current real-device QA or store-submission result exists.

## Hosted environment state

- Preview: `ReloGo Preview`, `uwfblgllkibbupqyofkl`, `ca-central-1`, currently
  INACTIVE by deliberate pause. Before pause it had exact migrations 001–026,
  `support-ai` v3 ACTIVE with JWT verification, and a passing live smoke.
- Production: `ReloGo Production`, `yskknolxbxfxakgvrcmg`, `ca-central-1`,
  ACTIVE_HEALTHY and currently linked locally. Remote ledger is exact 001–026;
  dry run is clean; `support-ai` v4 is ACTIVE with JWT verification and returns
  401 unauthenticated. The self-cleaning smoke passed anonymous auth, resolver
  output with five tasks/five HTTPS sources, a minimal onboarding profile
  insert, authoritative consent/profile confirmation, and cleanup; profile,
  waitlist, support, and progress tables contain zero rows.
- A separate empty/new project `gbhzaathkkqzosovhnjh` exists in another
  organization and is not a ReloGo deployment target.
- Production anonymous sign-ins are enabled; preview anonymous auth passed
  before pause. Re-verify preview after resume and both environments during
  final release smoke. The reviewed rate limit remains 30/hour/IP.
- Never run `supabase config push`; committed config contains localhost Auth
  URLs. Patch reviewed hosted Auth fields minimally or use the Dashboard.
- Hosted `supabase test db --linked` uses a restricted temporary role without
  pgTAP schema usage. Run pgTAP through the password-authenticated linked pooler
  URL and keep passwords in Keychain/`PGPASSWORD`, never output.
- Supabase CLI was last observed at 2.109.1. Optional pg-delta cache warnings do
  not replace ledger, dry-run, lint, pgTAP, advisor, and smoke verification.
- Vercel `relogo` maps to `landing/`; `relo-go` maps to `admin/`. The reviewed
  admin recovery is live at `https://relo-go.vercel.app`, and the landing site
  at `https://relogo-two.vercel.app` is unchanged/live. Backend-aware uptime
  run #113 passed the public web, production anonymous-auth, and canonical-
  resolver checks. `relogo.app` does not resolve, and no monitored public
  mailbox exists. The ignored `admin/.vercel` link names project `admin`;
  relink or target `relo-go` explicitly for future deploys.
- EAS project `@tamimorif/relogo` separates development/preview from production.
  The iOS production 1.0.1 build 6 is `FINISHED` at EAS
  `2c83c4f5-b154-4632-8604-6350a77bbee4`; Android production 1.0.1 build 3 is
  `FINISHED` at EAS `20256d8c-cf12-472c-a236-7223e0207103`. Production EAS
  variables pass the release contract and iOS/Android signing credentials
  exist. Neither build status replaces real-device QA or submission. No iPhone
  is registered for internal preview installation, and automated Android
  submission has no Google Play service-account key.

## Known limits and next work

1. Pull request #2 is open for recovery commit `0135964` and the final evidence
   update. Review any later deltas and obtain its required CI evidence. Actions
   variables are already corrected; encrypted secrets can be updated only
   through an owner-controlled local GitHub authentication flow, with no
   password or credential shared.
2. Distribute both finished production builds through approved owner-controlled
   test paths, and measure startup/PDF/privacy behavior on real iOS and Android
   devices. Resume preview and reconfirm 001–026/v3 only if isolated preview QA
   is still required.
3. Archive the production ledger/dry-run/smoke and final build evidence. Run
   final production lint, pgTAP, advisors, and authenticated AI smoke if they
   are not already captured. Future hosted changes start at migration 027 and
   still need explicit approval.
4. The modern worker client/preflight source is pushed in `0135964`. After the
   owner updates encrypted worker secrets, run the exact-origin preflight,
   establish the first healthy 53-source baseline, and test
   `ALERT_WEBHOOK_URL`; do not enable recurring execution until the exact
   workflow/secrets pass and notification ownership is named.
5. The admin recovery and unchanged landing site are live, and backend-aware
   uptime run #113 passed. Configure a monitored public support/privacy mailbox
   and domain, then establish recurring schedule and notification ownership;
   one passing run does not prove either.
6. Choose/fund managed backups/PITR, record RPO/RTO, and complete a restore
   drill using [../BACKUP_RESTORE.md](../BACKUP_RESTORE.md).
7. Rotate/revoke exposed historical admin credentials and choose a reviewed
   Git-history remediation approach without casually rewriting shared history.
8. Complete human government-content/legal/store review. `docs/STORE.md` is a
   draft: account owners must correct the live App Store "Data Not Collected"
   answer, confirm App Store/Play privacy answers for anonymous linked data and
   Gemini processing, finish age rating, availability/trader status, final
   screenshots, Support URL, Apple metadata/device/2FA actions, and provide a
   Google Play service-account key or reviewed manual Android submission path.

Out of MVP scope unless new evidence justifies reopening: a recoverable AI
quota lease and workload-specific credentials replacing the shared server-side
service role. External crash/analytics services also require a separate privacy
decision.

## Operational facts

- Old binary recovery is impossible. The replacement iOS 1.0.1 build 6 and
  Android 1.0.1 build 3 are `FINISHED`. Both still require
  real-device QA and store approval. OTA can be considered only for a released
  compatible runtime/channel, never for v1.0.
- Mobile runtime configuration accepts only clean Supabase origins; production
  release preflight accepts only
  `https://yskknolxbxfxakgvrcmg.supabase.co` (with an optional trailing slash).
- Local Supabase link points to production. Use explicit refs and leave
  production at exact 001–026/v4; future changes begin at 027 and still require
  explicit approval.
- Preview is paused after successful verification; resume deliberately and
  account for the project's live plan and pausing behavior.
- Recovery commit `0135964` and the final evidence update are pushed in pull
  request #2, Actions variables are corrected, and backend-aware uptime run
  #113 passed. Encrypted secrets still contain old values pending the owner's
  passkey-authorized update; required CI checks are the review gate.
- The Ubuntu 22.04 worker runner is already on `main`, and the modern
  dependency/preflight source is pushed in `0135964`. Old encrypted values
  block the current production baseline; no healthy baseline or webhook exists.
- The worker preflight and backend-aware uptime probe fail closed unless
  `SUPABASE_URL` is the exact production origin
  `https://yskknolxbxfxakgvrcmg.supabase.co`.
- Worker GitHub configuration: `SUPABASE_URL`,
  `SUPABASE_SERVICE_ROLE_KEY`; optional `ALERT_WEBHOOK_URL` is currently absent.
- Backend-aware uptime run #113 passed the public web, production anonymous-
  auth, and canonical-resolver checks. That one run does not establish
  recurring schedule or alert ownership.
- Edge secret: `GEMINI_API_KEY`; never expose it to clients.
- Public publishable/legacy anon keys are expected in client bundles; security
  must never depend on hiding them.
- Backup billing/retention/PITR are not approved; the runbook is proposed, not
  operational proof.
- No monitored public mailbox exists. Do not publish `privacy@relogo.app` or
  another address until it is owned and monitored.

## Documentation rule

- Status, remaining work, phases, definition of done: `docs/PLAN.md` only.
- Current agent architecture/rules/checks/next engineering tasks: this file.
- Deployment commands/platform setup: `docs/DEPLOYMENT.md`.
- Backup posture and restore drills: `docs/BACKUP_RESTORE.md`.
- Annotated structure only: `docs/ai/PROJECT_MAP.md`.
- Do not create another roadmap, status file, action list, or handoff log.

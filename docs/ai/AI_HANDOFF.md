# ReloGo — AI agent handoff

_Current as of 2026-08-17_

Read this file completely before changing the repository. The canonical product
roadmap is [../PLAN.md](../PLAN.md); operational commands are in
[../DEPLOYMENT.md](../DEPLOYMENT.md).

## Mission and stage

ReloGo converts a move between Canadian provinces or territories into a
standardized **Relocation Navigator & Moving Checklist** of government tasks,
urgency timing, document preparation guides, and direct official government
links. Pull request #2 final head `f34b64a` passed all 19 GitHub/Vercel checks,
its two fixed review threads were resolved, and it merged into `main` as
`e75f449`. Pull request #3 final head `3f063e9` then passed all 19 checks, its
sole review thread was fixed/resolved, and worker hardening merged as `d2db994`.
The final production Edge Function v5, reviewed admin recovery, landing site,
and backend-aware main uptime are live. The App Store still distributes the
broken 1.0 binary; 1.0.1 has not shipped. Recovery is not complete because
real-device/store, hosted rollout of the local source-monitoring fix, and human
approval gates remain.

The product operates under a clear, phased architectural strategy:
- **Phase 1 (Current / 1.0.1 MVP — Relocation Navigator & Checklist):**
  A uniform, distraction-free moving guide across all 13 provinces. Every task card
  gives users the urgency countdown, document preparation pack, direct link to the
  official government portal, and a 1-tap completion checkmark (Available ↔ Completed).
- **Phase 2 (Future Roadmap — Direct Government Integration):**
  Provincial ministry partnerships and registry system access to enable automated
  in-app form auto-fill and direct digital submission.

The shipped App Store 1.0 binary was built from SDK 51 and contains the retired
Supabase ref `fxrynmgaymslwcklfena`. That project is deleted, the ref is present
in the compiled Hermes bundle, the build had no compatible `expo-updates`
runtime, and EAS has no OTA update for it. The binary cannot be repaired or
redirected. Recovery requires a new 1.0.1 store binary.

Environment truth:

- Repository schema: migrations 001–027. Migration 027 and its coordinated
  worker changes are local and pending review; they are not hosted or live.
- Preview `uwfblgllkibbupqyofkl`: migrations 001–026 and JWT-protected
  `support-ai` v3; live smoke passed, then the project was deliberately paused.
- Production `yskknolxbxfxakgvrcmg`: active, currently linked locally,
  exact migrations 001–026 and JWT-protected `support-ai` v5. Its last pre-027
  dry run was clean,
  anonymous auth is enabled, unauthenticated function invocation returns 401,
  and the self-cleaning smoke passed anonymous auth, resolver output with five
  tasks/five HTTPS sources, a minimal onboarding profile insert, authoritative
  consent/profile confirmation, authenticated non-fallback AI, and cleanup.
- Web: the reviewed admin recovery is live at `https://relo-go.vercel.app`, the
  landing site is unchanged/live, and main uptime run `30843906264` passed the
  public web, production anonymous-auth, and canonical-resolver checks with
  backend probes required.
- Mobile builds: earlier iOS production version 1.0.1 build 7 is `FINISHED` from
  exact merged commit `e75f449` (EAS
  `765965d7-c7c1-432c-ac1d-302d2f0c5116`). Earlier Android production version
  1.0.1 build 4 is also `FINISHED` from the same commit (EAS
  `28076f35-1495-466b-af77-97a9339c5ea2`). iOS build 7 was successfully
  uploaded to App Store Connect on 2026-08-04 and is `VALID`/`IN_BETA_TESTING`
  in internal TestFlight; it has not been submitted for App Review. Android
  build 4 has not been uploaded to Google Play. Both artifacts predate the
  current `tamim` startup-prefetch and dependency-audit fixes and must not be
  treated as current release candidates. Current replacements were built from
  exact green commit `cd3a87c`: iOS 1.0.1 build 8 (EAS
  `daa8e42a-c12d-4365-b6ca-ff36732cd858`) and Android 1.0.1 build 5 (EAS
  `f839dede-1f83-4c6a-a928-de258597e6d0`) both `FINISHED`. Archive identity and
  integrity pass; neither current artifact was uploaded or submitted to a
  store.
- GitHub: pull request #2 final head `f34b64a` passed all 19 GitHub/Vercel
  checks, both fixed review threads were resolved, and it merged as `e75f449`.
- Worker: main run `30843904269` installed `supabase==2.31.0`; its exact-origin
  key/schema/resolver preflight passed, proving the encrypted key works. It
  created 42 baselines and failed closed on 11 source rows. Hardened run
  `30845791036` fetched 50 unique URLs for 53 rows, reused three outcomes,
  completed 42 rows, added one baseline, and filed three PENDING human-review
  alerts while 11 outcomes remained failed (`8` managed challenges, `2`
  CAPTCHAs, `1` empty body). Production now has 43/53 baselines.
  Those 11 rows represented 10 unique URLs. Local migration 027 retains each
  canonical public `official_url`, assigns nine rows a worker-only validated
  first-party monitor target, and makes Yukon driver-licence and vehicle-
  registration monitoring MANUAL under `ReloGo operations` every 30 days.
  Every Actions summary lists the manual assignments; that cadence is an
  assignment, not proof of review or overdue tracking. All nine automatic
  targets passed worker-equivalent local reachability checks. Challenge gates
  remain fail-closed. Migration 027 has not been applied to preview or
  production, and the updated worker has not had a live Actions rerun.
  Do not apply 027 while the scheduled workflow still runs the older worker
  from default branch `main`: that worker ignores `monitor_url` and could
  repopulate cleared automatic baselines from the wrong URL. First make the
  coordinated worker the scheduled version, or explicitly pause the old
  schedule and run the reviewed `tamim` workflow manually.
  `ALERT_WEBHOOK_URL` is unset; key rotation is not needed.

Remaining release gates include real-device startup/PDF/privacy QA, store
submission and review, reviewed migration-first rollout and live verification
of the migration 027 source-monitoring fix, a tested worker webhook, backup
funding/restore drill, admin credential rotation, a
monitored public mailbox/domain, correction of the live App Store privacy
answer, and human legal/content/store approval.

The worker may create PENDING alerts. It must never change live rules; only a
human admin may approve a rule change.

## Start every task this way

1. Read [../PLAN.md](../PLAN.md) and run `git status --short --branch`.
2. Run `git status` and preserve every existing or user-authored change. Never
   assume the tree is clean, reset unrelated work, or broadly reformat it.
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

- `supabase/migrations/001_*.sql` through `027_*.sql` are the ordered repository
  schema source of truth. Preview and production both remain at exact 001–026;
  migration 027 is local and pending review. Never rewrite a deployed migration
  or treat the presence of 027 in Git as hosted evidence.
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
- Migration 027 adds private `monitor_url`/monitoring metadata for the worker,
  preserves canonical public resolver links, and resets baselines only for its
  11 mapped rows. Nine rows remain automatic through validated first-party
  targets; Yukon driver-licence and vehicle-registration rows are manual,
  assigned to ReloGo operations every 30 days. The interval is not evidence of
  a completed review and no overdue-review state exists. The migration also
  blocks the persistence RPC from writing manual rows. Review and apply it
  before running the coordinated worker; it has not been hosted.
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
   profile round trip, then immediately prefetches corridor rules and progress
   while the route renders. The checklist subscribes to the same keys, so it
   reuses in-flight work. Checklist profile/rule/progress reads have bounded
   stale times, an 8-second abort deadline, and `retry: false`.
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

### Local PII, Privacy, and Unified Navigation

1. Profile PII uses `expo-secure-store`; it never enters Supabase.
2. The checklist interface presents a 100% unified experience across all 13
   provinces and territories: urgency badge, document preparation guide, verified
   official government portal link, and an optimistic completion checkmark.
3. Users are guided directly to official government portals and registry locators
   to complete applications directly on official systems.
4. Underlying PDF form-filling modules (`pdfEngine.ts`, `pdfTemplates.ts`) remain
   modular and preserved for Phase 2 government integration.
5. Sign-out and account deletion wipe the local PII vault and local session.
   Deletion also removes the server account and session.

### Support

1. Mobile loads the latest owned thread and subscribes to messages/status.
2. The user selects one of six fixed questions; the database blocks other user
   bodies and free-text metadata.
3. While status is `AI`, mobile invokes `support-ai` with only `thread_id`.
4. Function v5 authenticates ownership, rejects durable human involvement,
   validates every user turn, bounds context/output, and applies one provider
   deadline across both response headers and the full response-body read. It
   grounds through the canonical corridor resolver and validated official
   sources.
5. Gemini receives only the bounded fixed-question transcript plus non-PII
   grounding. Persistence is a row-locked RPC that rechecks current state.
6. Human takeover/admin reply permanently disqualifies AI even after
   resolve/reopen. Provider/query/model failures expose generic PII-safe errors
   and fail closed to human support.
7. Preview v3 remains paused after authenticated smoke. Production v5 is ACTIVE
   with JWT verification, rejects unauthenticated invocation with 401, and has
   a passing public resolver smoke. Keep a production authenticated support
   check in release QA.

### Worker and rule review

1. `worker/preflight.py` accepts only the exact production Supabase origin, then
   performs fast read-only key, schema, and canonical-resolver checks before
   installing Chromium. It rejects preview, lookalike hosts, credentials,
   ports, paths, query strings, and fragments. Do not broaden it into writes.
2. Worker fetches narrow source metadata, partitions AUTOMATED from MANUAL
   sources, and scrapes every automatic source with bounded concurrency and
   isolated pages/downloads. An automatic source may use a worker-only
   first-party `monitor_url`; the canonical `official_url` remains the public
   link. HTML/PDF content has fail-closed sanity and size gates.
3. Results are processed in stable source-ID order.
4. `persist_official_source_scrape()` uses a row lock and expected-hash
   compare-and-swap. It records BASELINE/UNCHANGED or creates PENDING and
   advances CHANGED; stale work writes nothing.
5. Automatic source failures/stale outcomes remain visible in logs,
   webhook/job summary, and a non-zero exit without preventing other automatic
   source attempts.
6. Every job summary separately lists the Yukon driver-licence and vehicle-
   registration manual assignments, their ReloGo operations owner, and 30-day
   cadence. Manual rows do not make an otherwise healthy automatic run fail;
   the cadence is assignment metadata, not completion or overdue evidence.
7. Admin approval/dismissal is row-locked and RPC-only. Worker grants do not
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
npm run audit:production
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
python3.11 -m pip install -r requirements.txt -r requirements-dev.txt
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
  supabase/functions/support-ai/geminiTransport_test.ts \
  supabase/functions/support-ai/grounding_test.ts \
  supabase/functions/support-ai/humanTakeover_test.ts \
  supabase/functions/support-ai/supportQuestions_test.ts
```

### Latest established results

- Current `tamim` recovery recheck (2026-08-17): Node 22 clean installs pass;
  mobile release/dependency checks, TypeScript, lint, 13 Jest suites with
  133/133 tests, and both 1,753-module iOS/1,774-module Android Hermes exports
  pass; admin/landing lint and production builds pass; worker compile and
  106/106 tests pass; Deno format/lint/check and 16/16 tests pass; contract
  checks and production-backed public uptime pass. Fresh local reset through
  027, public lint, pgTAP 207/207, and API E2E 248/248 pass.
- Established recovery database baseline: fresh reset 001–026, public lint clean,
  pgTAP 198/198, focused resolver/integrity API E2E 5/5.
- Local migration 027 source-monitoring fix: all nine replacement automatic
  first-party targets passed worker-equivalent reachability checks; the two
  remaining Yukon rows are explicit manual assignments. This is target
  reachability evidence only: Quebec coverage is high-level, the Nunavut
  vehicle target is a general driver manual, PEI school coverage is the English
  Public Schools Branch, and the Yukon school policy omits some registration
  steps/authorities. A green run proves configured automatic checks, not full
  semantic coverage. Review, hosted migration, and a live Actions rerun remain.
  Fresh local reset through 027, public-schema lint, and pgTAP 207/207 pass;
  worker compile/tests pass 106/106; database type sync, mobile TypeScript, and
  the admin production build pass. After restarting the stopped local Edge
  Runtime, the full API E2E suite passed 248/248 in one run.
- Preview: exact 001–026 ledger and hosted smoke passed, including anonymous
  auth, resolver/HTTPS sources, consent gate, authenticated non-fallback AI,
  and cleanup, before deliberate pause.
- Production: exact 001–026 ledger, clean pre-027 dry run, anonymous auth enabled,
  self-cleaning smoke passed anonymous auth, resolver 5 tasks/5 HTTPS sources,
  minimal onboarding profile insert, authoritative consent/profile
  confirmation, authenticated non-fallback AI, and cleanup; final `support-ai`
  v5 is ACTIVE with JWT verification, and unauthenticated invocation is
  rejected with 401.
- Mobile production dependency audit: patched `js-yaml`, `nanoid`, and
  `postcss` transitives are pinned. npm still propagates two high-severity
  `image-size@1.2.1` denial-of-service advisories through ten Expo/Metro build-
  tool paths; there is no patched release or compatible npm remedy. The
  fail-closed `audit:production` gate accepts only those exact two advisory
  URLs at that exact version because Metro processes only repository-controlled
  assets, and rejects every other high/critical finding. Landing and admin
  production audits report zero vulnerabilities.
- Latest full code matrix at `2624ad3` (2026-08-01): mobile release configuration,
  TypeScript, lint, 11 Jest suites with 116/116 tests, iOS export at 1,752
  modules/5.8 MB Hermes bytecode, Android export at 1,773 modules/5.9 MB Hermes
  bytecode, and production audit 0; admin and landing lint/build; Deno
  format/lint/type checks and support tests 16/16; worker compile and tests
  77/77; contract sync, workflow YAML, shell syntax, and diff checks all passed.
- Focused documentation-tree recheck (2026-08-03): mobile 116/116, TypeScript,
  release configuration, worker 77/77, Gemini transport 4/4, Python dependency
  consistency, uptime shell syntax, and `git diff --check` passed. The code
  paths remain identical to `2624ad3`.
- Post-merge worker safeguards: exact duplicate URLs are fetched once and
  fanned out per source row; same-origin requests are serialized and paced;
  managed challenges/CAPTCHAs are categorized but remain failed closed. Worker
  compile and 97/97 tests pass. Production run `30845791036` verified 50 unique
  fetches/three reused outcomes and preserved all 11 failed source-row outcomes.
- Pull request #2 final head `f34b64a`: all 19 GitHub/Vercel checks passed,
  including native exports, database/pgTAP, full API integration, support,
  audits, worker, web builds, and both Vercel deployments. Its review threads
  were resolved and it merged as `e75f449`.
- Pull request #3 final head `3f063e9`: all 19 checks passed, its sole review
  thread was fixed/resolved, and it merged as `d2db994`.
- Earlier iOS build 7 (`765965d7-c7c1-432c-ac1d-302d2f0c5116`) is `FINISHED`
  from exact merged commit `e75f449`. Android build 4
  (`28076f35-1495-466b-af77-97a9339c5ea2`) is also `FINISHED` from the same
  commit. iOS build 7 is valid and active in internal TestFlight, but has not
  been submitted for App Review. Android build 4 has no Google Play submission.
  Both predate the current `tamim` changes and are not current candidates.
- Current iOS build 8 (`daa8e42a-c12d-4365-b6ca-ff36732cd858`) and Android
  build 5 (`f839dede-1f83-4c6a-a928-de258597e6d0`) are `FINISHED` from exact
  green commit `cd3a87c`; both archives and embedded production metadata pass
  verification. Neither was uploaded or submitted to a store.
- No current real-device QA or App Review submission result exists.

## Hosted environment state

- Preview: `ReloGo Preview`, `uwfblgllkibbupqyofkl`, `ca-central-1`, currently
  INACTIVE by deliberate pause. Before pause it had exact migrations 001–026,
  `support-ai` v3 ACTIVE with JWT verification, and a passing live smoke.
- Production: `ReloGo Production`, `yskknolxbxfxakgvrcmg`, `ca-central-1`,
  ACTIVE_HEALTHY and currently linked locally. Remote ledger is exact 001–026;
  the last pre-027 dry run was clean; final `support-ai` v5 is ACTIVE with JWT verification and returns
  401 unauthenticated. The self-cleaning smoke passed anonymous auth, resolver
  output with five tasks/five HTTPS sources, a minimal onboarding profile
  insert, authoritative consent/profile confirmation, authenticated
  non-fallback AI, and cleanup.
- A previously observed project ref `gbhzaathkkqzosovhnjh` is not visible in the
  connected account/organization and is not a ReloGo deployment target. Do not
  infer ownership or delete it without account-level evidence.
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
  at `https://relogo-two.vercel.app` is unchanged/live. Main uptime run
  `30843906264` passed the public web, production anonymous-auth, and canonical-
  resolver checks. `relogo.app` does not resolve, and no monitored public
  mailbox exists. The ignored `admin/.vercel` link names project `admin`;
  relink or target `relo-go` explicitly for future deploys.
- EAS project `@tamimorif/relogo` separates development/preview from production.
  Current production replacements are iOS 1.0.1 build 8 at EAS
  `daa8e42a-c12d-4365-b6ca-ff36732cd858` and Android 1.0.1 build 5 at EAS
  `f839dede-1f83-4c6a-a928-de258597e6d0`; both `FINISHED` from exact green
  commit `cd3a87c`, using production channel/runtime 1.0.1 and existing frozen
  credentials. Archive checks pass. Neither was uploaded or submitted.
  Earlier iOS production 1.0.1 build 7 is `FINISHED` at EAS
  `765965d7-c7c1-432c-ac1d-302d2f0c5116`; Android production 1.0.1 build 4 is
  also `FINISHED` at EAS `28076f35-1495-466b-af77-97a9339c5ea2`. Both use exact merged
  commit `e75f449`. Production EAS variables pass the release contract and
  frozen iOS/Android signing credentials worked without a password request.
  iOS build 7 is already in internal TestFlight (`VALID`, `IN_BETA_TESTING`),
  so EAS device registration is not required; no physical iPhone was connected
  during the 2026-08-17 audit. It is not in App Review. Android build 4 has not
  been submitted, and automated Android submission has no Google Play service-
  account key. Those earlier artifacts predate the current `tamim` fixes.

## Known limits and next work

1. Do not upload or submit the current artifacts automatically. After explicit
   owner authorization, upload exact-`cd3a87c` iOS build 8 to TestFlight and
   use exact-`cd3a87c` Android build 5 for real-device startup,
   offline/
   recovery, PDF, deletion, and privacy QA. Do not submit either automatically.
2. Review local migration 027 and its coordinated worker changes. It maps the
   11 failed rows/10 URLs to nine validated automatic first-party targets plus
   two owned Yukon manual assignments without changing public `official_url`
   values. Do not host it while the scheduled default-branch worker is still
   the pre-027 implementation. First promote the coordinated worker or pause
   that schedule; then apply 027 to an explicitly targeted environment before
   running the new worker and obtain a live Actions result. Never bypass
   CAPTCHAs or baseline challenge text.
3. Configure and test `ALERT_WEBHOOK_URL`, assign worker/uptime alert owners,
   and require failed/manual sources to remain visible. The existing worker key
   passed preflight and must not be rotated or requested again.
4. Archive the production ledger/dry-run/smoke and final build evidence. Run
   final production lint, pgTAP, advisors, and authenticated AI smoke if they
   are not already captured. The next hosted change is pending migration 027
   and still needs explicit approval.
5. Configure a monitored public support/privacy mailbox and domain, then
   establish recurring schedule and notification ownership; one passing uptime
   run does not prove either.
6. Resume preview and reconfirm 001–026/v3 only if isolated preview QA is still
   required; do not restore it merely for status symmetry.
7. Choose/fund managed backups/PITR, record RPO/RTO, and complete a restore
   drill using [../BACKUP_RESTORE.md](../BACKUP_RESTORE.md).
8. Rotate/revoke exposed historical admin credentials and choose a reviewed
   Git-history remediation approach without casually rewriting shared history.
9. Complete human government-content/legal/store review. `docs/STORE.md` is a
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

- Old binary recovery is impossible. Historical iOS 1.0.1 build 7 is `FINISHED`
  from exact merged commit `e75f449`; Android 1.0.1 build 4 is also `FINISHED`
  from that commit. Both predate the current `tamim` fixes. Current exact-
  `cd3a87c` iOS build 8 and Android build 5 are `FINISHED` with verified
  archives but still require real-device QA and store approval. OTA can be
  considered only for a released compatible
  runtime/channel, never for v1.0.
- Mobile runtime configuration accepts only clean Supabase origins; production
  release preflight accepts only
  `https://yskknolxbxfxakgvrcmg.supabase.co` (with an optional trailing slash).
- Local Supabase link points to production. Use explicit refs and leave
  production at exact 001–026/v5. Migration 027 exists only locally; its
  migration-first rollout still requires explicit approval.
- Preview is paused after successful verification; resume deliberately and
  account for the project's live plan and pausing behavior.
- Pull request #2 final head `f34b64a` passed all 19 checks, its fixed review
  threads were resolved, and it merged as `e75f449`.
- Main worker run `30843904269` passed the `2.31.0` preflight and created 42
  baselines. Hardened run `30845791036` added one baseline and filed three
  PENDING alerts while 11 outcomes remained failed; 43/53 sources now have
  baselines. Those 11 rows/10 URLs were anti-bot, CAPTCHA, or empty-content
  failures. The local 027 treatment uses nine automatic worker-only first-party
  targets and two visible, owned manual assignments, but it is not hosted and
  has no live rerun. Keep challenge gates fail-closed. Key rotation is not
  needed; the webhook is absent.
- The worker preflight and backend-aware uptime probe fail closed unless
  `SUPABASE_URL` is the exact production origin
  `https://yskknolxbxfxakgvrcmg.supabase.co`.
- Worker GitHub configuration: `SUPABASE_URL`,
  `SUPABASE_SERVICE_ROLE_KEY`; optional `ALERT_WEBHOOK_URL` is currently absent.
- Main uptime run `30843906264` passed the public web, production anonymous-
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

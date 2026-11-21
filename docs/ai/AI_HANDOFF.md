# ReloGo — AI agent handoff

_Current local scope, production schema, and release state as of 2026-11-21_

Read this file completely before changing the repository. The canonical product
roadmap is [../PLAN.md](../PLAN.md); operational commands are in
[../DEPLOYMENT.md](../DEPLOYMENT.md).

## Current MVP scope — authoritative for the current mobile source

This working tree contains local mobile, database, documentation, and
store-asset changes for the basic moving checklist. Migrations 027–031 have
been applied to local `supabase_db_ReloGo` and linked production; no hosted
function deployment, secret rotation, or user-data cleanup has been performed.
EAS iOS build 1.0.2 (build 9) finished. Its App Store Connect submission job
errored because an Apple agreement is missing or expired; no successful upload
or App Review submission is recorded.

- Git state checked 2026-11-21: branch `tamim` at `5f14fe1`, with extensive
  pre-existing staged deletions under `qa-artifacts/` and modifications across
  mobile, Admin, landing, Supabase, tests, screenshots, and docs. Preserve this
  checkout; do not reset, stage, or revert it wholesale. Only the three
  migrations were committed in `5f14fe1`; mobile source and the 1.0.2 version
  bump were still uncommitted when EAS recorded that commit hash for the build.
  Do not treat that commit alone as a reproducible source snapshot for the IPA.

- Onboarding asks for origin/destination city and province, plus optional
  Yes/No/Skip questions about vehicle registration and school-age children.
  Explicit No hides matching tasks; Yes shows them without a conditional
  label; Skip keeps them visible with an applicability label. Route details,
  answers, and checkmarks stay on-device. No move date, name, email, home
  address, map, PDF fill feature, or AI feature is part of the mobile MVP.
- Province codes are sent to the public corridor-rule RPC when fetching
  guidance; the current client does not send city, preference answers, or
  checkmarks to that RPC or write route/progress to profile tables.
- Help creates an anonymous Supabase identity only when opened. It offers six
  fixed questions; the app stores the resulting human-support thread remotely
  for Admin replies and caches it on-device. The user cannot send free text.
- The mobile client no longer invokes `support-ai`. The Edge Function source,
  deployment workflow, historical AI migrations, and production function are
  retained for now; the last recorded production state had function v5 active.
  Recheck and retire hosted AI separately before claiming it is decommissioned.
- The legacy database still has profile/progress tables and may contain records
  created by older clients. Production and local migration ledgers are now at
  001–031; no legacy rows were purged. Review chat retention/deletion and
  release sequencing before store publication.
- Help's local 403 was traced to the consent predicate requiring a
  `user_profiles` row the simplified client no longer creates. Migrations 030
  and 031 keep the narrow support column grants and add a
  private consent record/RPC for the anonymous support identity. The fixed
  question allowlist, user ownership, and no-client-HUMAN-status rules remain
  enforced. A simulator send after the fix returned HTTP 201 for
  `support_threads` and `support_messages`; both rows were present in
  `supabase_db_ReloGo`. Migrations 027–031 were subsequently applied to linked
  production and verified with `supabase migration list --linked`.
- Latest verification: mobile TypeScript check, lint, 11 Jest suites / 114
  tests, database-type sync, consent-version sync, support-question sync, and
  `git diff --check` passed. The fresh simulator run is documented at
  `/tmp/relogo-simulator-evidence/2026-11-21-helpfix-rerun/section-6-report.md`:
  19 PASS, 0 FAIL, 3 BLOCKED, and 1 OBSERVATION across SIM-01–SIM-14 and all
  nine SIM-04 rows. SIM-09/10 Admin interaction was blocked by this Codex
  session's managed localhost browser-origin policy; SIM-14 request body field
  names were not logged. EAS build `a61bc88b-36fb-4380-9a8f-3e258cab7268`
  finished as iOS 1.0.2 build 9. Submission
  `1e38d883-36b0-4b81-9407-7b87181370bc` is `ERRORED` because an Apple
  agreement is missing or expired. The Account Holder must resolve the
  agreement before retrying this build. No Android or physical-device run was
  performed; SIM-09/10 remain unverified.

The local plan in [../PLAN.md](../PLAN.md) is the canonical product roadmap.
Historical release and hosted environment details below are retained as
evidence and must not be mistaken for the current local app behavior.

## Mission and stage

ReloGo helps people organize common government tasks when moving between
Canadian provinces or territories. Current mobile scope is a city/province
route, local checkmark checklist, and human-only support. Maps and AI are not
part of this release. The broken App Store 1.0 binary still requires a new
store update; the 1.0.2 iOS build now exists, but its EAS submission failed at
Apple's agreement gate. Migrations 027–031 are applied in production. The
current checkout is branch `tamim` at `5f14fe1` with uncommitted app changes.

The current iPhone run is Expo Go only. It does not verify a signed build on a
physical device. SIM-09/10 Admin workflows were blocked by the managed browser
origin policy and the SIM-14 request-body field names were unavailable. Read
the dated QA report above before making a release decision. Historical PR,
store, and worker records below are retained as evidence; use the dated current
snapshot above whenever an older status conflicts.

The shipped App Store 1.0 binary was built from SDK 51 and contains the retired
Supabase ref `fxrynmgaymslwcklfena`. That project is deleted, the ref is present
in the compiled Hermes bundle, the build had no compatible `expo-updates`
runtime, and EAS has no OTA update for it. The binary cannot be repaired or
redirected. Recovery requires a new 1.0.1 store binary.

Environment truth:

- Repository, local, and linked production migration ledgers are at 001–031.
  Production was advanced from 026 by migrations 027–031 on 2026-11-21 and
  verified with `supabase migration list --linked`. The 2026-10-16 worker
  preflight failure happened before 027 was applied; no post-migration live
  worker run has been verified in this task.
- Preview `uwfblgllkibbupqyofkl`: migrations 001–026 and JWT-protected
  `support-ai` v3; live smoke passed, then the project was deliberately paused.
- Production `yskknolxbxfxakgvrcmg`: active, currently linked locally,
  exact migrations 001–031 and `support-ai` v5 (the function version is the
  last recorded hosted version; these migrations did not deploy a function).
  Its last pre-027 dry run was clean,
  anonymous auth is enabled, unauthenticated function invocation returns 401,
  and the self-cleaning smoke passed anonymous auth, resolver output with five
  tasks/five HTTPS sources, a minimal onboarding profile insert, authoritative
  consent/profile confirmation, authenticated non-fallback AI, and cleanup.
- Web: the reviewed admin recovery is live at `https://relo-go.vercel.app` and
  main uptime run `30843906264` passed the public web, production
  anonymous-auth, and canonical-resolver checks with backend probes required.
  Read-only probes on 2026-09-24 show the deployed landing at
  `https://relogo-two.vercel.app` already serves Privacy v1.1 plus the
  Support/Terms pages with the unconfigured-mailbox preview notices, while
  `relo-go.vercel.app` still answers `/vite.svg` and missing `/assets/*.js`
  paths with the SPA HTML, so the local admin favicon/missing-asset fix is not
  deployed there yet.
- Mobile builds: earlier iOS production version 1.0.1 build 7 is `FINISHED` from
  exact merged commit `e75f449` (EAS
  `765965d7-c7c1-432c-ac1d-302d2f0c5116`). Earlier Android production version
  1.0.1 build 4 is also `FINISHED` from the same commit (EAS
  `28076f35-1495-466b-af77-97a9339c5ea2`). iOS build 7 was successfully
  uploaded to App Store Connect on 2026-08-04 and is `VALID`/`IN_BETA_TESTING`
  in internal TestFlight; it has not been submitted for App Review. Android
  build 4 has not been uploaded to Google Play. Both artifacts predate the
  current recovery tree and must not be treated as current release candidates.
  The recorded replacements were built on SDK 55 from exact green commit
  `cd3a87c`: iOS 1.0.1 build 8 (EAS
  `daa8e42a-c12d-4365-b6ca-ff36732cd858`) and Android 1.0.1 build 5 (EAS
  `f839dede-1f83-4c6a-a928-de258597e6d0`) both `FINISHED`. Archive identity and
  integrity pass. iOS build 8 was uploaded and submitted as 1.0.1 (8) on
  2026-09-08, rejected on 2026-09-09 under Guideline 2.3.10 for non-iOS
  status-bar screenshots, then resubmitted on 2026-10-20 after all eight
  iPhone/iPad screenshots were replaced with iOS-status-bar versions; the
  version is now `WAITING_FOR_REVIEW` under submission
  `a5d59778-8286-4ebf-9373-d96917499171`. Android build 5 was not uploaded.
  Both artifacts are superseded. The current SDK 57 iOS build 1.0.2 build 9 is
  documented in the release snapshot above; no current Android EAS build is
  recorded.
- GitHub: pull request #2 final head `f34b64a` passed all 19 GitHub/Vercel
  checks, both fixed review threads were resolved, and it merged as `e75f449`.
- Local git state (read-only check 2026-10-16): `main` == `origin/main` ==
  `69ff576` (PR #7 merge, 2026-10-10) and the checked-out branch `tamim` ==
  `origin/tamim` == `c7e4dcd` (2026-10-10); all commits are pushed, nothing is
  unpushed, and `tamim` is contained in `main`. Only the `main` and `tamim`
  branches exist.
- Working-tree hygiene (verified 2026-10-16): sync-duplicate "... 2.ext" files
  and broken duplicate git ref files were removed to a local backup;
  `qa-artifacts/` is staged-deleted pending an owner decision; `.gitignore`
  carries a trivial two-blank-line edit; and an uncommitted change set awaits
  owner review: doc/status updates plus the four `.opencode/skills` refreshes,
  `mobile/eas.json` Android submit prep, the `mobile/.gitignore` Play-key
  ignore entry, and the new `store-assets/` Play drafts. The 2026-10-20 App
  Review screenshot fix is also uncommitted: all eight `store-screenshots/`
  PNGs were regenerated with iOS status bars, uploaded to ASC, and the 1.0.1
  submission was resubmitted. No EAS build or git push action is pending.
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
  production. A 2026-09-14 read-only check confirmed that default branch `main`
  already has the coordinated worker, while production has none of the four
  027 columns: scheduled monitoring fails closed before scraping. After explicit
  authorization, apply 027 then 028 to the intended project, verify the schema
  and privileges, and obtain a live worker rerun.
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

### Local checklist data and support boundary

The current mobile app does not ask for a name, email, street address,
government document number, move date, vehicle ownership, or child/dependent
details. It saves origin/destination city and province, consent version, and
checkmarks in AsyncStorage on the device. Province codes alone are sent to
`resolve_corridor_rules()` to fetch public task guidance. Do not describe this
as a fully offline app or as making no server request.

Support is the only user content intentionally stored by the current mobile
client: a random anonymous support identity, six fixed user questions, human
replies, and thread status. The thread is also cached on-device. There is no
free-text user composer, and migration 010 remains the server enforcement
boundary. The mobile app no longer invokes AI. Old AI rows, the production
function, function deployment workflow, and legacy profile/progress schema may
remain until separately reviewed and retired.

Never expose a raw native or database error if it could echo input.
`mobile/lib/errorReporting.ts` discards arbitrary exception text, stack,
custom names and unknown context; only allowlisted diagnostic metadata reaches
the development log. Nothing is transmitted or persisted by this reporter.
`AppErrorBoundary` shows generic recovery UI. Adding an external
crash/analytics service requires explicit privacy review and may receive only a
sanitized record.

Support questions are deliberately not free text. Mobile and migration 010
enforce the same six-question allowlist. CI still syncs the retained Edge
helper because that server code is not yet decommissioned. Migration 012 blocks
client-authored thread subjects; migration 014 permanently marks human
involvement.

### RLS/RPCs are the authorization boundary

- Current mobile users access only their own support rows. Profile/progress
  tables and admin user views remain legacy backend surfaces.
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

- `supabase/migrations/001_*.sql` through `031_*.sql` are the ordered repository
  schema source of truth. Production is at 001–031; preview remains paused at
  its last verified 001–026. Never rewrite a deployed migration or infer hosted
  state from Git alone; verify with the linked migration ledger.
- `supabase/seed.sql` is local-only. It reproduces hosted baseline
  table/sequence grants before reapplying migration-defined restrictions;
  `supabase db push` never applies it. Read its header before changing grants.
- Migration 028 removes the email-based admin bootstrap trigger and function:
  neither
  signup, confirmation, email changes nor user metadata can grant admin access.
  Trusted operators provision reviewed user IDs explicitly; existing memberships
  are preserved. A read-only production check found one confirmed membership.
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
  blocks the persistence RPC from writing manual rows. It is applied to
  production; a coordinated live worker rerun still needs verification.
- Migration 028 retires email-based admin bootstrap without changing existing
  memberships or the public typed API. Confirmation alone is insufficient when
  Auth auto-confirms signup. Never edit deployed 017 to make this change.
- Migration 029 advances the legacy policy version to 1.2. Migration 030
  reasserts only the support-message insert columns and support-thread
  insert/status-update columns required by the mobile client. Migration 031
  stores current policy acceptance for the anonymous support identity and
  updates support RLS checks to accept either that private record or a current
  legacy profile consent. Its RPC validates the current policy version and
  stores only the identity, version, and server timestamp. Migrations 029–031
  are applied in local `supabase_db_ReloGo` and linked production.
- Help support INSERT permission is not a table-wide grant. Preserve the narrow
  column grants and the 031 RLS consent, ownership, allowlist, and status checks
  if the support flow changes. The mobile app must record support consent before
  attempting its first thread insert.
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
- Mobile uses an exact scoped `xcode@3.0.1` override to `uuid@11.1.1`. It retains
  CommonJS compatibility; do not widen it to UUID 12+ or `latest`, and remove it
  when fixed upstream.
- Mobile is now Expo SDK 57.0.27 / React Native 0.86.3 / React 19.2.3. Expo
  Doctor passed 21/21 checks. Global Metro overrides were removed to let Expo
  SDK 57 select its supported Metro version; XML stays on compatible patched
  0.8.15/0.9.12 paths, js-yaml is pinned to 4.3.2, and the exact `xcode@3.0.1`
  UUID override remains scoped. The mobile audit rejects every high/critical
  finding; the 2026-10-05/06 audit regression is resolved as of 2026-10-10 with
  two owner-approved, narrowly scoped, time-boxed exceptions (`braces`
  GHSA-vfj7-8cjw-p6xm and `node-forge` GHSA-86w9-cpqp-85rv, both reachable only
  through build-time tooling chains; critical findings are never excepted;
  re-review 2026-12-01), and the gate still fails closed on anything outside
  those entries. Do not force breaking Tailwind/Expo Updates upgrades or weaken
  the gate without an owner decision.
- Never use destructive git commands without explicit authorization.

## Repository map

```text
ReloGo/
├── mobile/                    Expo SDK 57 / local checklist + human support
│   ├── app/(auth)/            route setup and local policy re-consent
│   ├── app/(tabs)/            checklist, move details, fixed-question support
│   ├── components/            safe crash/recovery boundary
│   ├── lib/                   local journey/progress, rules, support, legal, dates
│   ├── scripts/               release-configuration preflight
│   └── types/database.ts      synchronized database contract
├── landing/                   static marketing/legal/support/waitlist
├── admin/                     protected operations dashboard
├── worker/                    source monitor plus read-only preflight
├── supabase/
│   ├── migrations/            ordered schema/security/RPC source
│   ├── functions/support-ai/  retained legacy Deno/Gemini function and tests
│   └── tests/                 pgTAP RLS/RPC adversarial suite
├── scripts/                   cross-app checks and hosted smoke
├── tests/e2e/                 Python 3.11 API integration suite
├── docs/                      maintained plan/deploy/recovery/handoff
└── .github/workflows/         CI, worker, and uptime automation
```

See [PROJECT_MAP.md](PROJECT_MAP.md) for annotated paths.

## Runtime behavior

### Startup, local journey, and checklist

1. Supabase public config is validated without throwing during module
   evaluation. Invalid config renders a controlled recovery screen because
   corridor rules are fetched from the public resolver.
2. Startup loads only `LocalJourney` from AsyncStorage. It does not create or
   restore a support identity just to open the checklist.
3. Onboarding saves only origin/destination city and province plus local
   consent version to AsyncStorage.
   Re-consent updates that local version.
4. The checklist reads the journey from `JourneyContext`, calls
   `resolve_corridor_rules()` with province codes only, shows relative task
   timing and applicability labels, and displays safe official sources. The
   public request is abortable and bounded at 8 seconds so a stalled connection
   can reach the retry screen.
5. Checkmarks are stored per province corridor in AsyncStorage. Writes are
   serialized so rapid taps do not overwrite another task's update. Clear
   checklist removes local route/progress and the corresponding React Query
   cache; support data remains separate.
6. City names are display-only. There is no geocoding, map, or nearby-place
   lookup.

### Local data, privacy, and navigation

The native app declares light appearance. Status-bar icons explicitly match
the rendered header: light over blue Auth/Profile headers, dark over light
Checklist/Help/recovery screens. Tabs use navigation history for Support Back.
Large support text uses full-width questions and scrollable controls without
disabling font scaling; current physical-device/visual confirmation remains open.

1. No profile PII vault or PDF form-filling engine is included in the current
   mobile source. The unused Expo native packages and sample PDF were removed.
2. The checklist retains urgency, task guidance, official links, and local
   checkmarks. The rule resolver still requires connectivity when refreshing
   task guidance.
3. Route/progress data in AsyncStorage is not encrypted; it is ordinary local
   app data. The support session is separately encrypted using the existing
   secure-store-backed Supabase session storage.
4. The Move tab explains local storage, offers a local checklist reset, and
   links to human support. Resetting the checklist does not delete support chat.

### Human support

1. Opening Help lazily restores or creates a Supabase anonymous identity. The
   checklist itself does not require this identity.
2. Mobile loads the latest owned thread and subscribes to messages/status.
   Conversation snapshots are cached in AsyncStorage by that anonymous ID and
   reconciled with Realtime.
3. A new thread starts in `AWAITING_HUMAN`; users choose among six fixed
   questions. The database allowlist still blocks arbitrary user messages.
4. The Admin inbox displays the thread; an admin can take over, reply, and
   resolve it. A user may start a new thread after resolution.
5. Support writes have a ten-second deadline. If the result is unknown, the
   app requires an authoritative refresh before another write. The current
   mobile client makes no AI function invocation.
6. The server transcript and a local cache are retained; there is no
   self-service chat deletion control in the current app. A retention and
   deletion path is a launch decision.
7. The production AI Edge Function was last documented as active (v5) on
   2026-10-16. The source and secret may still be deployed; do not claim server
   decommissioning without a separate authorized rollout and verification.

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
python3 scripts/test-support-questions-sync.py
python3 scripts/test-run-local-app.py
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
node --test tests/*.test.cjs
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

### Historical established results (verified 2026-10-16)

- Current git/CI state (verified 2026-10-16): `main` == `origin/main` ==
  `69ff576` (PR #7 merge, 2026-10-10); `tamim` == `origin/tamim` == `c7e4dcd`
  is fully pushed and contained in `main`. CI run `38071116034` (PR #7 merge
  push) succeeded on 2026-10-10; public uptime runs on `main` remain green
  through 2026-10-16 (e.g., `38925058297`). Mobile `npm run check:release`
  passes and `npm run audit:production` passes with the two reviewed exceptions
  (resolution of the 2026-10-05/06 regression; the gate still fails closed on
  anything outside the exception list). Scheduled worker run `38863388197`
  failed on 2026-10-16 before migrations 027–028 were deployed. Those migrations
  have since been applied, but no post-migration live worker rerun is recorded.
  No SDK 57 build existed at that time; iOS 1.0.2 build 9 is recorded above.
  Visual QA remains partial: iPhone Expo Go runs on
  2026-10-09/10-10 passed most committed visual cases, Android evidence is
  seven Expo Go emulator screenshots (2026-10-07), the Android Suite A–J has
  never run, and no real-device QA exists on either platform.
- Historical git state (read-only check 2026-10-05; superseded by PR #7):
  `main` == `origin/main` == `0c78e56` (PR #6 merge, 2026-09-08), untouched.
  Local `tamim` is clean and
  carries committed, unpushed work on top of `origin/tamim` (`fff31da`,
  2026-09-29): `fff31da` commits the 2026-09-14 verification fixes, migrations
  027–028, the store-readiness mobile fixes, and the supporting QA/docs/CI
  updates; `3d156ec` reconciles the status docs and refreshes the landing
  lockfile to `next@16.3.8` (clearing the critical RCE advisory); later commits
  record the committed state. Only the `main` and `tamim` branches exist. No
  rebuild, upload, store submission, migration, deploy, or push was performed.
- Read-only web audit (2026-09-24, historical): `relogo-two.vercel.app` served
  the current Privacy/Support/Terms pages with unconfigured-mailbox notices,
  while `relo-go.vercel.app` still returns SPA HTML for `/vite.svg` and missing
  `/assets/*.js`; the local admin favicon/404 fix is committed in `fff31da` but
  awaits an explicit deploy to the `relo-go` project. Recorded build metadata
  (iOS 8 / Android 5 from `cd3a87c`) predates `fff31da` and is superseded.
- Verification-report fixes (2026-09-14; committed in `fff31da`):
  Node 22 mobile lint/TypeScript, 15 Jest suites/161 tests, release contract,
  online Expo alignment and strict production audit pass (eight moderate,
  no high/critical findings). Final iOS/Android Hermes exports pass with
  1,569/1,590 modules after the final runtime edit. Landing clean install/lint/static export and
  admin lint/build pass; their production audits are zero. Admin callback
  regressions pass 15/15 (all fail on untouched HEAD). Worker compile/110 tests,
  Deno gates/16 tests, contracts and four allowlist/six local-launcher tests pass.
  Transactional 028 pgTAP passes 221/221 twice; direct public PL/pgSQL lint
  has zero findings across 16 routine/trigger combinations. No reset-based API
  E2E rerun or fresh simulator visual pass is claimed. Production remains 026;
  027/028 and web fixes await explicitly authorized rollout. Detailed evidence:
  [fix verification](../../qa-artifacts/fix-verification-2026-09-14.md)
  (staged-deleted in the working tree; available in git history).
- Historical `tamim` recovery recheck (2026-08-17): Node 22 clean installs pass;
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
- Mobile production dependency audit (2026-09-14, historical): no high/critical
  findings; eight moderate navigation dependency findings remain. Patched
  js-yaml and compatible XML dependencies plus scoped Metro 0.83.8 eliminate the
  old image-size exception. Landing and admin production audits reported zero.
  This is superseded by the 2026-10-05 recheck below.
- Dependency advisory recheck (2026-10-05; clean `npm ci`): landing's `next`
  critical RCE GHSA-vcvr-r3jv-pc5j was cleared by refreshing the lockfile to
  `next@16.3.8` within the existing `^16.3.5` range; `npm audit --omit=dev` is
  0 and `npm run build` passes. Mobile `npm run audit:production` now fails
  closed (26 high, 0 critical) from newly published `braces`
  GHSA-vfj7-8cjw-p6xm (affected `<=3.0.3`, **no patched release**, reached via
  micromatch/Tailwind/NativeWind/Jest/Metro) and `node-forge`
  GHSA-86w9-cpqp-85rv. This was a release-gate blocker requiring an owner/
  engineering decision; the audit gate must not be weakened. (Superseded
  2026-10-10 by the reviewed, time-boxed audit exceptions; see the 2026-10-16
  entry.)
- Local iOS simulator verification (2026-10-06): Xcode 27 / Device Hub,
  iPhone 17 with iOS 26.5, local Supabase on loopback, and Expo Go 57.0.9.
  `python3.11 scripts/run-local-app.py mobile -- --ios --clear` launched the
  app; Metro bundled 1,833 modules and the onboarding screen rendered. Expo
  Doctor passed 21/21, mobile lint/typecheck/release-config passed, Jest passed
  161/161, and launcher checks passed 13/13. At that time the production audit
  still failed on 23 high findings (zero critical) after compatible fixes;
  this is resolved as of 2026-10-10 (see the 2026-10-16 entry).
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
  Both predate the current recovery tree and are not current candidates.
- Recorded iOS build 8 (`daa8e42a-c12d-4365-b6ca-ff36732cd858`) and Android
  build 5 (`f839dede-1f83-4c6a-a928-de258597e6d0`) are `FINISHED` from exact
  green commit `cd3a87c` (SDK 55); both archives and embedded production
  metadata pass verification. Neither was uploaded or submitted to a store, and
  both are superseded by the merged SDK 57 tree; no EAS build exists from that
  tree.
- No current real-device QA or App Review submission result exists.

## Historical hosted environment state (verified 2026-10-16; current ledger is above)

- Preview: `ReloGo Preview`, `uwfblgllkibbupqyofkl`, `ca-central-1`, currently
  INACTIVE by deliberate pause. Before pause it had exact migrations 001–026,
  `support-ai` v3 ACTIVE with JWT verification, and a passing live smoke.
- Production: `ReloGo Production`, `yskknolxbxfxakgvrcmg`, `ca-central-1`,
  ACTIVE_HEALTHY and currently linked locally. At the time of this snapshot the
  remote ledger was 001–026; migrations 027–031 are applied per the current
  snapshot above. The last recorded `support-ai` version is v5 with JWT verification and returns
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
- Supabase CLI is pinned at 2.120.0 (root `package.json`). Optional pg-delta
  cache warnings do not replace ledger, dry-run, lint, pgTAP, advisor, and
  smoke verification.
- Vercel `relogo` maps to `landing/`; `relo-go` maps to `admin/`. The reviewed
  admin recovery is live at `https://relo-go.vercel.app`, and the landing site
  at `https://relogo-two.vercel.app` is live. Read-only probes on 2026-09-24:
  the deployed landing already serves Privacy v1.1 plus Support/Terms with the
  unconfigured-mailbox preview notices, while `relo-go.vercel.app` still
  returns the SPA HTML for `/vite.svg` and missing `/assets/*.js`, so the local
  admin favicon/missing-asset fix is not deployed there yet. Main uptime run
  `30843906264` passed the public web, production anonymous-auth, and canonical-
  resolver checks. `relogo.app` does not resolve, and no monitored public
  mailbox exists. The ignored `admin/.vercel/project.json` link already names
  project `relo-go` with root `admin`; only an explicit deploy of the `tamim`
  recovery tree to that project remains.
- EAS project `@tamimorif/relogo` separates development/preview from production.
  Recorded production artifacts are iOS 1.0.1 build 8 at EAS
  `daa8e42a-c12d-4365-b6ca-ff36732cd858` and Android 1.0.1 build 5 at EAS
  `f839dede-1f83-4c6a-a928-de258597e6d0`; both `FINISHED` on SDK 55 from
  `cd3a87c`, which predates the merged recovery tree, using production
  channel/runtime 1.0.1 and existing frozen credentials. Archive checks pass.
  Neither was uploaded or submitted; both are superseded. The current iOS 1.0.2
  build 9 and its errored submission are recorded at the top of this file. No
  current Android production build is recorded. Earlier iOS
  production 1.0.1 build 7 is `FINISHED` at
  EAS `765965d7-c7c1-432c-ac1d-302d2f0c5116`; Android production 1.0.1 build 4 is
  also `FINISHED` at EAS `28076f35-1495-466b-af77-97a9339c5ea2`. Both use exact merged
  commit `e75f449`. Production EAS variables pass the release contract and
  frozen iOS/Android signing credentials worked without a password request.
  iOS build 7 is already in internal TestFlight (`VALID`, `IN_BETA_TESTING`),
  so EAS device registration is not required; no physical iPhone was connected
  during the 2026-08-17 audit. It is not in App Review. Android build 4 has not
  been submitted, the Google Play listing is not configured, and automated
  Android submission has no Google Play service-account key. Those earlier
  artifacts predate the merged recovery tree.

## Known limits and next work

1. Finish the iOS upload path. EAS build 1.0.2 build 9 exists, but its
   submission job errored at Apple's agreement gate. The Account Holder must
   accept the required agreement; then retry the submission. The EAS build
   recorded commit `5f14fe1` while mobile source/version edits were uncommitted,
   so make the intended release source reproducible from a clean commit before
   App Review. No current Android EAS build exists.
2. Production migrations 027–031 are applied. Migration 027 maps the 11 failed
   rows/10 URLs to nine validated automatic first-party targets plus two owned
   Yukon manual assignments without changing public `official_url` values.
   Obtain a post-migration live worker result. Migration 028 removes automatic
   email-based admin grants while retaining reviewed access. Never bypass
   CAPTCHAs or baseline challenge text.
3. Configure and test `ALERT_WEBHOOK_URL`, assign worker/uptime alert owners,
   and require failed/manual sources to remain visible. The existing worker key
   passed preflight and must not be rotated or requested again.
4. Archive the production ledger, post-migration smoke, and final build
   evidence. Run production lint, pgTAP, and advisors if they are not already
   captured. Do not invoke the retained legacy AI function as part of the
   mobile MVP verification.
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
   screenshots, Support URL, and Apple metadata/device/2FA actions. The Google
   Play listing is not configured: `com.relogo.app` 404s publicly and no Play
   Console record/listing exists in-repo. Before any Android submission,
   provide the 512×512 icon, 1024×500 feature graphic, and Play-format phone
   screenshots (uncommitted draft Play assets exist in `store-assets/`
   (`play-icon-512.png`, `play-feature-graphic-1024x500.png`); existing
   `store-screenshots/` are iOS-dimension only), complete the Data safety
   questionnaire (drafts in `docs/STORE.md` §3.3), content rating, target
   audience, government-app declaration, account-deletion URL, and a monitored
   contact email. If the Play developer account is a personal (individual)
   account created after 2023-11-13, Google requires 12+ testers across 14+
   continuous days of closed testing before production access; the owner must
   confirm the account type. Automated Android submission expects the Play
   service-account key at `mobile/google-play-service-account.json`
   (working-tree `eas.json`/`.gitignore` prep, uncommitted pending review;
   none provisioned), with manual Console upload as the documented fallback.

10. Mobile dependency-advisory regression — **locally resolved 2026-10-10**
    (owner approved). Both remaining roots — `braces` GHSA-vfj7-8cjw-p6xm and
    `node-forge` GHSA-86w9-cpqp-85rv — have **no patched release published**
    (latest 3.0.3 / 1.4.0 are still affected) and are reachable only through
    build-time/CLI tooling chains (Tailwind/NativeWind/Metro transforms; Expo
    code-signing CLI). `mobile/scripts/production-audit-policy.js` now carries a
    **narrowly scoped, reviewed exception list** (exact GHSA + package match,
    criticals never allowed, npm propagation chains resolved, fail-closed on
    unknown data) with per-entry justification and a 2026-12-01 re-review date;
    the gate still fails on anything outside those entries. Verified:
    `npm run audit:production` passes with the two exceptions in effect, lint,
    typecheck, and Jest 16 suites / 178 tests all pass. Remove each exception as
    soon as an upstream patch ships; do not bypass or weaken the gate further.

Out of MVP scope unless new evidence justifies reopening: a recoverable AI
quota lease and workload-specific credentials replacing the shared server-side
service role. External crash/analytics services also require a separate privacy
decision.

## Operational facts

- Old binary recovery is impossible. Historical iOS 1.0.1 build 7 is `FINISHED`
  from exact merged commit `e75f449`; Android 1.0.1 build 4 is also `FINISHED`
  from that commit. Both predate the current recovery tree. iOS build 8 and
  Android build 5 are `FINISHED` with verified archives but were recorded on
  SDK 55 from `cd3a87c`, which predates the merged recovery tree; they are
  superseded. The current iOS 1.0.2 build 9 is recorded above; its App Store
  Connect upload failed at Apple's agreement gate. A committed source archive,
  physical-device QA, and successful ASC upload remain. OTA can be considered
  only for a released compatible
  runtime/channel, never for v1.0.
- Mobile runtime configuration accepts only clean Supabase origins; production
  release preflight accepts only
  `https://yskknolxbxfxakgvrcmg.supabase.co` (with an optional trailing slash).
- Local Supabase link points to production. Use explicit refs. Production is
  now at migrations 001–031; the last recorded hosted AI function is v5.
- Preview is paused after successful verification; resume deliberately and
  account for the project's live plan and pausing behavior.
- Pull request #2 final head `f34b64a` passed all 19 checks, its fixed review
  threads were resolved, and it merged as `e75f449`.
- Main worker run `30843904269` passed the `2.31.0` preflight and created 42
  baselines. Hardened run `30845791036` added one baseline and filed three
  PENDING alerts while 11 outcomes remained failed; 43/53 sources now have
  baselines. Those 11 rows/10 URLs were anti-bot, CAPTCHA, or empty-content
  failures. The local 027 treatment uses nine automatic worker-only first-party
  targets and two visible, owned manual assignments; migration 027 is now
  hosted but has no recorded post-migration live rerun. Keep challenge gates
  fail-closed. Key rotation is not
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
- Current user-run iPhone flow: `docs/ai/SIMULATOR_TESTING_GUIDE.md`.
- Do not create another roadmap, status file, action list, or handoff log.

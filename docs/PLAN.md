# ReloGo — canonical project plan

_Last updated: 2026-08-03_

This is the single source of truth for the product concept, implemented state,
remaining work, phased roadmap, and definition of done. Operational commands
belong in [DEPLOYMENT.md](DEPLOYMENT.md). AI agents must also read
[ai/AI_HANDOFF.md](ai/AI_HANDOFF.md).

## Product concept

ReloGo converts a move between Canadian provinces or territories into a
personalized checklist of government tasks and suggested timing. The app uses
the user's origin, destination, move date, vehicle, and dependent flags when
selecting rules, but the current seeded jurisdiction rules are destination-wide
`ANY`-origin rules; true origin-specific content remains launch work. Users can
track completion and verify each task against its official source.

The defining product rule is privacy by construction. Full name, date of birth,
street address, driver's licence number, and health-card number stay in the
device secure store and ephemeral on-device PDF cache. They are never stored in
Supabase, sent to Gemini, logged, or exposed to the admin dashboard.

## Architecture

| Area | Responsibility | Current stack |
| --- | --- | --- |
| `mobile/` | User product, local PII/PDFs, support | Expo SDK 55, React Native 0.83, React 19 |
| `landing/` | Marketing, legal, support, waitlist | Next.js 16 static export, React 19 |
| `admin/` | Human operations | Vite 5, React 18 |
| `worker/` | Official-source monitoring | Python 3.11, Playwright |
| `supabase/` | Auth, database, RLS/RPCs, Realtime, AI function | Local migrations 001–026, Deno Edge Function |

There is no monorepo build layer. Each JavaScript app has an independent
lockfile and environment. Supabase migrations are the schema source of truth;
RLS and narrow SECURITY DEFINER RPCs are the authorization boundary.

### Main runtime flows

1. Landing submits a corridor/email through the enumeration-safe
   `join_waitlist()` RPC.
2. Mobile creates an anonymous account and stores only non-sensitive move
   metadata in `user_profiles`.
3. One consent-state RPC returns the server-current policy state and, only for
   current consent, the allowlisted non-PII startup profile. Stale profiles are
   routed through re-consent before normal data access.
4. The canonical `resolve_corridor_rules()` RPC selects one rule per task with
   deterministic precedence: exact/exact, `ANY`/destination, origin/`ANY`, then
   `ANY`/`ANY`. It also returns ordered, validated HTTPS official-source links.
   Mobile then filters vehicle/dependent flags and calculates local-calendar
   deadlines.
5. Sensitive form values stay in the device secure store. Filled PDFs are
   generated locally and shared only after an explicit action.
6. Support uses six fixed general questions. Database policy enforces the exact
   allowlist; unsafe legacy history is re-escalated without reaching Gemini.
7. The worker monitors official HTML/PDF sources with bounded concurrency and
   atomically records each result. Changes create PENDING alerts.
8. Admins review source diffs. Approval/dismissal is RPC-only, row-locked, and
   never performed by the worker.

## Implemented state

### Mobile

- App Store version 1.0 has been live since 2026-06-23 (Apple ID
  `6781947478`, bundle ID `com.relogo.app`). Its SDK 51 bundle points at the
  deleted Supabase project `fxrynmgaymslwcklfena` and has no compatible
  Expo Updates runtime. Backend-dependent onboarding and checklist flows are
  therefore broken in the currently downloadable release; 1.0.1 has not
  shipped.
- The recovery release is version 1.0.1 on Expo SDK 55. Pull request #2 merged
  the reviewed tree to `main` at `e75f449`. Fresh iOS production build 7
  (`765965d7-c7c1-432c-ac1d-302d2f0c5116`) finished successfully from that
  exact commit. Fresh Android production build 4
  (`28076f35-1495-466b-af77-97a9339c5ea2`) was started from the same commit and
  still needs a terminal result. Neither artifact has been submitted. Apple
  metadata/real-device QA and a Google Play service-account key or reviewed
  manual Android path remain.
- Startup no longer waits behind a static native splash for remote work.
  Session storage reads the encrypted value and key concurrently; session
  restore is bounded at 3 seconds and consent/profile bootstrap at 5 seconds,
  with a retryable recovery screen instead of an indefinite spinner. Duplicate
  `INITIAL_SESSION` work is ignored, the bootstrap profile seeds React Query,
  and checklist profile/rules/progress reads use bounded stale times, abort
  after 8 seconds, and disable automatic retries so an offline request reaches
  visible recovery UI promptly.
- Missing or invalid Supabase release configuration now renders a controlled
  recovery state rather than throwing during module evaluation. Runtime public
  URLs must be clean origins, and the production build preflight accepts only
  the exact production Supabase origin plus a trimmed, nonblank public key. It
  also checks version, EAS environment/channel, retired project references,
  legal origin, and update/runtime configuration.
- The PDF cleanup path is lightweight at startup; `pdf-lib` and sharing code
  are dynamically loaded only after an explicit fill action. Direct icon
  imports avoid loading the package-wide icon entry point.
- Anonymous onboarding with required Privacy Policy and Terms consent. Its
  insert/update sends only the minimal non-PII profile fields; the existing
  `get_policy_consent_state()` RPC then returns the authoritative allowlisted
  profile and seeds React Query before the first checklist load. Auth, profile
  insert/update, and authoritative confirmation waits are each bounded at 10
  seconds.
- Server-current policy checks, server-authored acceptance timestamps, and a
  fail-closed re-consent route are implemented locally through migration 019.
- Profile-aware auth routing with retry and stale-request protection.
- Personalized, deadline-sorted checklist and optimistic progress updates.
  It uses the canonical server resolver, labels rule requirements as Required
  or Optional, exposes safe HTTPS official sources, and has no dead `LOCKED`
  state (`AVAILABLE`/`COMPLETED` only).
- Editable non-PII move profile and on-device encrypted PII vault.
- Secure sign-out and account deletion wipe PII, cached PDFs, and local session.
- A destination-scoped British Columbia Application for Health and Drug
  Coverage template is registered locally. The official blank form is
  downloaded on demand, checked against an audited SHA-256 before any PII read,
  and filled on-device. Requests include a byte range, emitted progress cancels
  past the reviewed size limit, backgrounding stops an active transfer, and the
  completed file is rechecked. Unicode values round-trip without flattening;
  Android schedules exact-file cache cleanup after a ten-minute share-target
  grace and retains retry state if deletion is temporarily unavailable. EAS
  real-device download/render/review/share verification remains.
- Realtime support transcript, fixed questions, AI replies, human takeover,
  resolve/reopen behavior, and local fallback escalation.
- Expo SDK 55 dependencies aligned; native iOS/Android Hermes exports pass.
- The production dependency audit reports 0 vulnerabilities after a narrow
  `xcode@3.0.1` override pins its CommonJS-compatible `uuid` dependency to
  11.1.1. Keep the override exact and remove it when Expo/xcode fixes upstream.
- A top-level PII-safe crash boundary (`AppErrorBoundary`) and global error
  handler capture only redacted, non-PII diagnostics on-device and never
  transmit them; redaction is unit-tested.
- ESLint is a CI gate (`eslint-config-expo` flat config, `mobile-lint` job),
  passing with 0 errors.
- Unused mobile-web configuration removed.

### Landing

- Responsive marketing/waitlist flow for all 13 provinces and territories.
- Enumeration-safe signup RPC with database validation and per-IP throttling.
  The RPC returns an explicit `accepted`/`throttled` status (migration 022) so a
  rate-limited user gets real feedback; a duplicate email still returns
  `accepted`, so membership is never revealed.
- Privacy Policy, Terms, a Support route, metadata, favicon/social image,
  robots, and sitemap are implemented and committed on `tamim`. The Support/legal
  changes are not yet present on the currently deployed landing build, which
  still serves the earlier `main` build.
- Next.js 16/React 19 upgrade, production dependency audit, lint, static build,
  fail-fast environment validation, and deployment security headers.

### Admin

- Server-authorized login through `is_admin()`.
- Alerts, users, messages, and waitlist views. The Users view uses server-side
  LIMIT/OFFSET pagination (migration 021) with a windowed total for "X of N".
- Safe external URLs, readable source diffs, Realtime support inbox, takeover,
  reply, resolve, and protected deployment headers.
- Live-rule edits and alert status changes are no longer direct table updates;
  approval and dismissal use narrow atomic RPCs.

### Worker

- A read-only preflight accepts only the exact production Supabase origin, then
  validates the key, required schema, and canonical resolver before Chromium is
  installed. It rejects preview and malformed/lookalike URLs. The Supabase
  Python client is updated to 2.31.0 so current `sb_secret_` keys are accepted.
- Bounded parallel scraping with an isolated page/download per source.
- Retry and sanity gates for blank, blocked, error, oversized, or invalid data.
- Inert, size-capped PDF fingerprinting for official PDF sources.
- Stable source ordering and sequential database effects.
- Row-locked compare-and-swap persistence prevents duplicate alerts, stale
  diffs, and baseline regression during overlapping work.
- Every source is attempted; any source failure is visible and exits non-zero.
- Webhook and GitHub job summaries include alerts/failures without controlling
  the run; live corridor rules remain human-controlled.

### Backend and CI

- Ordered local migrations 001–026 cover schema, seed data, RLS, deletion,
  admin authorization, admin bootstrap, consent/re-consent, support, waitlist,
  worker state, atomic workflows, conservative content corrections,
  server-side admin pagination (021), and enumeration-safe waitlist signup
  feedback (022).
  Migration 017 auto-registers admin emails
  (`admin@relogo.app` / `admin@relogo.ca`) via a trigger on `auth.users` insert.
- Migration 019 makes policy acceptance timestamps server-authored, adds a
  narrow re-consent RPC/state boundary, and gates normal user data on the
  server-current policy version. Migration 020 removes exact-day arithmetic
  where the source uses calendar months, material conditions, unsupported
  scope, or stale-law evidence; a fresh database retains 12 numeric deadlines.
- Migration 023 centralizes exact/`ANY` corridor precedence and official-source
  ordering in one RPC shared by mobile, admin, and AI grounding. Migration 024
  folds the current allowlisted profile into the consent bootstrap response.
  Migration 025 removes the unused `LOCKED` progress state. Migration 026
  rejects new/updated same-origin-and-destination profile/waitlist rows while
  preserving legacy rows through `NOT VALID` constraints.
- Support timestamps are server-authored; AI persistence is atomic and
  service-only; human involvement is permanently marked; client write columns
  are narrow.
- Support AI applies one provider deadline across response headers and the full
  response-body read, so a stalled body cannot hold the Edge invocation after
  headers arrive.
- Support message bodies and thread metadata cannot carry client-authored free
  text.
- The extracted mobile/admin `Database` interfaces are CI-checked byte-for-byte.
- CI covers clean installs, mobile types/tests/dependency alignment/native
  exports, landing lint/build, admin lint/build, worker compile/tests, support
  helper tests/allowlist synchronization, API integration tests, consent-version
  synchronization, database lint/pgTAP, shared types, and a production
  dependency audit for all three JavaScript apps.
- Recovery CI work moves Node jobs to Node 22, runs the mobile release
  preflight, adds Deno format/lint/type checks, compiles the worker preflight,
  and expands public uptime checks to production Supabase auth and resolver
  health. Worker and uptime preflights reject every Supabase URL except the
  exact production origin. Pull request #2 final head `f34b64a` passed all 19
  GitHub/Vercel checks and merged to `main` as `e75f449` after its two fixed
  review threads were resolved.
- The dependency audit gates on high/critical. Mobile currently reports 0
  vulnerabilities after the exact `xcode@3.0.1` → `uuid@11.1.1` override;
  clean install and iOS project-generation checks cover that temporary
  out-of-range transitive pin.

### Cloud foundation

- Separate preview and production Supabase projects exist in Canada's
  `ca-central-1` region. Development/preview clients target preview; production
  clients target production in Vercel and EAS.
- Preview (`uwfblgllkibbupqyofkl`) was migrated to 001–026, deployed with
  JWT-protected `support-ai` v3, and passed a self-cleaning hosted smoke that
  covered anonymous auth, canonical resolution/HTTPS sources, consent gating,
  authenticated non-fallback AI support, and cleanup. It was then deliberately
  paused and is currently inactive.
- Production (`yskknolxbxfxakgvrcmg`) is active and currently linked locally at
  exact migrations 001–026 with final JWT-protected `support-ai` v5. The
  post-push
  dry run is clean; unauthenticated function invocation returns 401; anonymous
  auth is enabled; and the self-cleaning hosted smoke passed anonymous auth,
  resolver output with five tasks/five HTTPS official sources, a minimal
  onboarding profile insert, authoritative consent/profile confirmation,
  authenticated non-fallback AI, and cleanup.
- The reviewed current admin recovery build is deployed to production at
  `https://relo-go.vercel.app`; landing is unchanged and live at
  `https://relogo-two.vercel.app`. Main-branch uptime run `30843906264` passed
  the production web, anonymous-auth, and canonical-resolver checks with
  backend probes required.
- The latest reviewed hosted advisor results had no errors; six
  multiple-permissive-policy warnings were intentional. Re-run production
  lint, pgTAP, advisors, and authenticated smoke against 001–026 in final
  release verification and before any future hosted change.
- A previously observed Supabase ref (`gbhzaathkkqzosovhnjh`) is not visible in
  the connected account/organization and is not a ReloGo deployment target.
  Do not infer ownership or delete it without account-level evidence; always
  use the two explicit refs above.

## Verification snapshot

Verification must be interpreted by tree and environment; older green counts do
not prove a newer tree. Pull request #2 final head `f34b64a` passed all 19
GitHub/Vercel checks, both fixed review threads were resolved, and it merged to
`main` as `e75f449`.
Local evidence does not replace real-device or store-submission evidence.

| Scope | Latest established evidence |
| --- | --- |
| Current recovery database work | Fresh local reset applies 001–026; public-schema lint clean; pgTAP 198/198; focused resolver/integrity API E2E 5/5 |
| Hosted preview recovery | Exact ledger 001–026; JWT-protected `support-ai` v3; hosted smoke passed before preview was deliberately paused |
| Production backend | Active at exact ledger 001–026; dry run clean; final `support-ai` v5 ACTIVE/JWT-protected; unauthenticated 401; self-cleaning smoke passed anonymous auth, resolver 5 tasks/5 HTTPS sources, minimal onboarding profile insert, authoritative consent/profile confirmation, authenticated non-fallback AI, and cleanup |
| Mobile dependency audit | 0 vulnerabilities with exact `xcode@3.0.1` → `uuid@11.1.1` override; clean install and iOS project generation verified |
| Prior committed `tamim` baseline (2026-07-21) | Mobile 85/85, worker 69/69, support helpers 9/9, pgTAP 164/164, API E2E 243/243, both native Hermes exports and web/admin builds passed |
| Latest full code matrix at `2624ad3` (2026-08-01) | Mobile release configuration, TypeScript, lint, 11 Jest suites with 116/116 tests, iOS export 1,752 modules/5.8 MB Hermes bytecode, Android export 1,773 modules/5.9 MB Hermes bytecode, and production audit 0; admin and landing lint/build; Deno format/lint/type checks and tests 16/16; worker compile and tests 77/77; contract sync, workflow YAML, shell syntax, and diff checks passed |
| Focused documentation-tree recheck (2026-08-03) | Mobile 116/116, TypeScript, release configuration, worker 77/77, Gemini transport 4/4, Python dependency consistency, uptime shell syntax, and `git diff --check` passed; code paths are unchanged from `2624ad3` |
| Post-merge worker safeguards | Duplicate-URL fan-out, per-origin serialization/pacing, Cloudflare/Radware classification, task cleanup, baseline-safety reporting, compile, and 97/97 worker tests pass. Production run `30845791036` verified 50 unique fetches/3 reused outcomes and kept 11 failures visible; failure policy remains nonzero for any failed/stale source |
| Pull request #2 / CI | Final head `f34b64a`; 19/19 GitHub and Vercel checks passed; both review threads resolved; merged to `main` as `e75f449` |
| iOS production store build | Fresh build 7 `FINISHED`, EAS `765965d7-c7c1-432c-ac1d-302d2f0c5116`, exact merged commit `e75f449`; real-device QA and submission remain |
| Android production store build | Fresh build 4, EAS `28076f35-1495-466b-af77-97a9339c5ea2`, started from exact merged commit `e75f449`; terminal result, real-device QA, and publication decision remain |
| Web/worker/uptime recovery | Admin recovery live; landing unchanged/live; main uptime run `30843906264` passed required backend probes. Hardened worker run `30845791036` passed preflight, fetched 50 unique URLs for 53 rows, completed 42 rows, and left 11 outcomes failed closed; 43/53 sources now have baselines, three new alerts are PENDING human review, key rotation is not needed, and the webhook is unset |
| Backup/restore | Runbook corrected; funding/retention decision and a measured restore drill remain |

The recovery database result was established locally, production carries the
final schema/function, main uptime is backend-aware and green, and the reviewed
tree is merged. The release still requires Android's terminal build result,
real-device QA, approved store metadata, and store-submission evidence.

### iOS Simulator run (2026-07-21)

This is historical simulator evidence from 2026-07-21, not evidence for the
current 1.0.1 recovery tree. The app ran against local migrations 001–022 and
the following behavior was verified by observation, not inference:

| Behaviour | Result |
| --- | --- |
| Onboarding renders; consent gate blocks submission | Pass; explicit "Consent Required" alert, and **0 auth users / 0 profiles** created while unticked |
| Anonymous sign-in → profile → checklist | Pass |
| Checklist matches AB→BC with vehicle | Pass; 4 tasks |
| Deadline arithmetic | Pass; BC licence 90 days → Jul 22 + 90 = **Oct 20, 2026** |
| Migration 020 NULL deadlines | Pass; render as "No fixed deadline" |
| PDF button gating | Pass; only the one task with a registered template offers it |
| BC health-coverage PDF: download → audited SHA-256 → on-device fill → share | **Pass**; 1.4 MB filled PDF reached the iOS share sheet |
| Pre-share review acknowledgement | Pass; shown before the share sheet |
| Session restore after app restart | Pass; resumed at checklist, no re-onboarding |
| On-device PII vault | Pass; saved, and the value appears **zero times** anywhere server-side |
| Account deletion (PIPEDA erasure) | Pass; auth users, profile and progress all 0; app returned to clean onboarding |

Not covered by this run, and still genuinely owner work: real-device behaviour,
Android (including the ten-minute share-target cache grace), and store builds.
The simulator uses Expo Go, not an EAS binary.

Four defects surfaced during that re-run and are fixed:

- **Onboarding was broken by migration 019 and would have failed for every new
  user on deployment.** `onboarding.tsx` wrote its profile with `.upsert()`,
  which emits `INSERT ... ON CONFLICT DO UPDATE`. Migration 019 gates
  `user_profiles` UPDATE on `has_current_policy_consent()`, and that is false
  until a profile row already records the current policy version — so the write
  is refused for exactly the first-time user it exists to serve. Anonymous
  sign-in succeeded and the first write then failed, surfacing as the generic
  "Couldn't finish setup" alert. No test caught it because every E2E case
  creates profiles with `.insert()`; the call the app actually makes was
  untested. Onboarding now inserts and falls back to an update, and
  `test_policy_74b` pins the behaviour.
- Running the app against a local stack was impossible at all: the hosted
  platform grants a table/sequence baseline to `anon`/`authenticated` that
  `supabase db reset` does not reproduce, so every client write failed with
  `42501`. Both test suites hid this by issuing their own `GRANT ALL` during
  setup. `supabase/seed.sql` now reproduces the hosted grant model locally; it
  is never applied by `supabase db push`.

- Mobile dependency alignment (a CI gate) had drifted behind the current Expo
  SDK 55 patch set, and `react-dom` was pinned only by an accident of the
  lockfile, so any fresh install broke `npm ci`. The pin is now declared.
- Two high-severity `sharp`/libvips advisories reached landing through Next's
  optional image-optimization dependency. It is unreachable in a static export
  with `images.unoptimized`, but it is patched rather than suppressed — and
  nothing in CI was auditing dependencies at all, which is why the documented
  "0 vulnerabilities" had quietly stopped being true.
- The Python E2E harness granted `service_role` blanket table access and never
  restored it, erasing the migration 011/015 least-privilege boundary from the
  local database and failing nine pgTAP privilege assertions on any later run.
  It also swallowed failed setup statements, one of which had been failing
  silently. Both are fixed and the suites are now order-independent.

Those historical checks established a strong SDK 55 simulator baseline. The
current local matrix is now green as well, but neither result replaces new EAS
binaries, real-device QA, CI, or the remaining release phases below.

## Remaining risks and deliberate limits

### Release blockers

- The shipped App Store 1.0 / SDK 51 binary contains a deleted Supabase project
  reference and has no compatible Expo Updates runtime. The old backend and
  binary cannot be recovered or redirected; a new tested 1.0.1 store binary is
  required. Fresh iOS 1.0.1 build 7 is `FINISHED` from exact merged commit
  `e75f449` (EAS `765965d7-c7c1-432c-ac1d-302d2f0c5116`); Android build 4 was
  started from the same commit (EAS
  `28076f35-1495-466b-af77-97a9339c5ea2`) and still needs a terminal result.
  Both still require real-device QA and store approval. Automated Google Play
  submission needs an
  owner-provided service-account key or reviewed manual submission path.
- The production backend promotion is complete at exact 001–026/final function
  v5. The authenticated production support smoke passed non-fallback AI and
  cleaned up; unauthenticated invocation returned 401.
- GitHub Actions variables are corrected and main uptime run `30843906264`
  passed. Main worker run `30843904269` passed the modern-key preflight and
  created 42 source baselines, proving that secret rotation is not needed.
  Hardened run `30845791036` added one baseline and completed 42 rows while
  preserving 11 failures, so 43/53 sources now have baselines. Ten failures
  were explicit managed/CAPTCHA challenges and one PEI source returned an empty
  body; keep them visible
  until an equivalent first-party source is reviewed or explicit manual
  monitoring is modeled. The worker webhook is still unset.
- No complete live pass has exercised the new mobile binary, Gemini, database,
  admin, landing, and worker together against the intended production stack.
- The Supabase backup plan/retention/PITR decision is not approved or funded,
  and no measured restore drill has passed. The proposed runbook is
  [BACKUP_RESTORE.md](BACKUP_RESTORE.md), not proof of an operational backup.
- Legacy admin bootstrap helpers containing password material were removed from
  the working tree, but the value remains in Git history. Rotate/revoke the
  hosted admin credentials and decide the reviewed history-remediation approach
  before release.
- The reviewed admin recovery build is live, landing is unchanged/live, and
  main backend-aware uptime passed. Worker authentication and 43 baselines are
  established, but 11 failed source-row outcomes and webhook ownership remain.
  `relogo.app` does not resolve and no monitored public support/privacy mailbox
  exists.
- The BC government PDF workflow now runs end to end on SDK 55 in the iOS
  Simulator (download, audited hash check, on-device fill, review prompt,
  share sheet). It has still not been exercised on an EAS binary, on a real
  device, or on Android — where the ten-minute share-target cache grace and the
  chooser-cancellation path remain unobserved.
- The initial independent content audit covered all 53 source URLs and all 24
  seeded numeric deadlines, but 15 sources did not yield usable content to the
  automated probe and origin-specific, qualitative, school, and exception-heavy
  content still needs human/legal review before promotion.
- `docs/STORE.md` contains conservative draft disclosures (anonymous user ID
  linked to non-PII move/progress/support data and Gemini processing; device PII
  not collected). The account owner/legal reviewer must correct the live App
  Store "Data Not Collected" answer and confirm the App Store Connect/Google
  Play privacy forms, age rating, availability/trader status, support
  URL/mailbox, Apple metadata/device QA, final screenshots, and legal text. A
  draft in Git is not a completed store disclosure.

### Follow-ups that do not block local stabilization

- Two hardening ideas were reviewed and deliberately left out of MVP scope
  (2026-07-14): a recoverable AI-quota lease (negligible benefit at launch scale
  — a duplicate *stored* reply is already prevented) and workload-specific
  credentials replacing the shared server-side `service_role` (post-launch
  hardening needing hosted roles/JWTs/secrets). Revisit either only post-launch
  if warranted.
- Fixed-question support protects privacy but cannot collect arbitrary bug
  details; define a privacy-reviewed support channel before broad launch.
- The default branch now contains `supabase==2.31.0` and the read-only exact-
  origin preflight. Hardened run `30845791036` authenticated, left 43/53
  baselines, and safely rejected 10 access challenges plus one empty response;
  source review/manual monitoring and webhook delivery remain unresolved.
  `ALERT_WEBHOOK_URL` is unset.
- Mobile's audit is clean after the exact `xcode@3.0.1` → `uuid@11.1.1`
  override. It is intentionally narrow because UUID 12 removes CommonJS;
  recheck and remove the override when an upstream Expo/xcode release supports
  a fixed dependency directly.
- Mobile now captures crashes/errors on-device in a PII-safe form (redacted,
  never transmitted) behind a top-level boundary. Wiring an external crash
  service remains a deliberate, privacy-reviewed decision; do not add one that
  transmits data off-device without that review. (The earlier "no mobile ESLint
  gate" gap is resolved: `eslint-config-expo` flat config now runs in CI.)

## Phased roadmap

### Phase 0 — repository consolidation and local stabilization

Status: **recovery implementation merged; release evidence incomplete.** Pull
request #2 final head `f34b64a` passed all 19 checks, both fixed review threads
were resolved, and it merged as `e75f449`. Its migrations/final function and
admin build are live; main backend-aware uptime passed.

- Consolidate planning into this file and agent context into AI_HANDOFF.
- Remove tracked generated files and duplicate root Expo configuration.
- Align SDK/framework dependencies and lockfiles.
- Close account, support, admin, waitlist logging, and worker race/security bugs.
- Make the complete local verification matrix a CI contract.

Exit now requires: finish the fresh Android build, complete real-device QA,
approve and publish store metadata, release 1.0.1, resolve/manual-monitor the 11
challenge-blocked sources, and test worker alert delivery. The merged preflight
proved the current key works; do not rotate or share it.

### Phase 1 — provision isolated environments

Status: **backend environments recovered; operational gates incomplete.**

- Completed: separate Canadian preview/production Supabase projects.
- Completed: environment-scoped public variables in Vercel, EAS, and local preview files.
- Completed: preview migrations 001–026, JWT-protected `support-ai` v3,
  hosted verification, and recovery smoke; preview is deliberately paused.
- Completed: production is active at exact migrations 001–026 with final
  JWT-protected `support-ai` v5, clean dry run, and unauthenticated 401. Its
  self-cleaning smoke passed anonymous auth, resolver output with five
  tasks/five HTTPS sources, minimal onboarding profile insert, authoritative
  consent/profile confirmation, and cleanup. Profile, waitlist, support, and
  progress tables are empty.
- Completed: created the first admin identity (`admin@relogo.app`) and verified `is_admin()` in both environments.
- Completed: supplied `GEMINI_API_KEY` securely to preview and production.
- Completed: pull request #2 final head `f34b64a` passed all 19 checks, both
  review threads were resolved, and it merged as `e75f449`.
- Completed: deployed final function v5 and passed authenticated non-fallback
  production smoke plus unauthenticated 401.
- Remaining: preserve explicit targeting for every future hosted change; the
  next migration is 027.
- Remaining: choose/fund a backup posture and complete a measured restore drill.
- Remaining: rotate/revoke the exposed bootstrap admin credentials and complete
  a reviewed Git-history remediation decision.

Exit: preview/prod credentials cannot cross, production matches the reviewed
release ledger/function, a real user and authenticated AI flow pass, advisors
are reviewed, and backup/credential gates are closed.

### Phase 2 — deploy web and monitoring worker

Status: **in progress.**

- Completed: The reviewed admin recovery is live, the landing site is
  unchanged/live, and main uptime run `30843906264` passed the production web,
  anonymous-auth, and canonical-resolver checks.
- Completed: GitHub Actions variables are corrected. The required
  `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` secret names exist.
- Completed: The scheduled worker workflow is present on the default branch.
- Remaining: Configure the public privacy/support mailbox, attach a reviewed
  public domain, and verify every legal/metadata route under that domain.
- Completed: Main worker run `30843904269` passed the exact-origin/key/schema
  preflight and created 42 baselines. Hardened run `30845791036` verified
  dedupe/pacing, added one baseline, and filed three PENDING alerts while 11
  outcomes failed closed; 43/53 sources now have baselines. The encrypted key
  works and must not be rotated merely because official sites block automation.
- Remaining: Review equivalent first-party URLs or assign explicit manual
  monitoring for 10 access-challenge outcomes plus the empty PEI driver page;
  never baseline challenge pages or bypass CAPTCHAs. Configure/test webhook
  delivery.
- Remaining: Verify waitlist signup → admin visibility and source change → PENDING alert → human approval/dismissal.

Exit: both web apps are live, one complete worker run is healthy, notifications
work, and no worker path can modify live rules.

### Phase 3 — mobile preview and full end-to-end QA

Status: **fresh final builds created/started; real-device QA not complete.**

- Fresh iOS production store build 7 is `FINISHED`: version 1.0.1, exact merged
  commit `e75f449`, EAS `765965d7-c7c1-432c-ac1d-302d2f0c5116`.
- Fresh Android production store build 4 was started from exact merged commit
  `e75f449`: version 1.0.1, EAS
  `28076f35-1495-466b-af77-97a9339c5ea2`; record its terminal result.
- Neither build was submitted. Build completion is not device or store
  evidence. If isolated preview QA is still required, resume preview and
  reconfirm exact 001–026/v3 before using it. Do not use the three old SDK 51
  artifacts as evidence.
- Prioritize the iOS build/device/release path because broken version 1.0 is
  publicly downloadable there. Google Play does not currently expose
  `com.relogo.app`; Android recovery work can run in parallel or immediately
  afterward, but a public-store 404 alone does not prove publication history.
- Register an approved test iPhone before the internal iOS build. Keep device
  enrollment and Apple 2FA with the account owner.
- Measure cold and warm startup on representative phones and slow networks;
  confirm the static splash releases promptly, timeout/retry states work, and
  deferred PDF code does not inflate startup work.
- Test onboarding, checklist selection/deadlines, progress, profile edits,
  local-only PII, sign-out, deletion, and PDF cache behavior on real devices.
- On both platforms, verify the BC form stays editable, mapped and Unicode
  values render, and integrity/size failures happen before PII is read. On
  Android, test both chooser cancellation and a delayed Gmail/Drive read during
  the ten-minute grace, then confirm ReloGo's exact cached file is removed once
  the app is active again.
- Test each fixed support question, Gemini failure/rate limit, unsafe-history
  fail-closed behavior, human takeover, resolve, and reopen.
- Exercise the full browser → API → database → Realtime/device response path.
- Resolve any release-only accessibility, crash, performance, or network issue.

Exit: a non-developer can complete the real preview journey on both platforms,
and privacy/deletion behavior is observed rather than inferred.

### Phase 4 — content, PDF, legal, and store readiness

Status: **in progress.**

- Completed: Added consent version/timestamp tracking to mobile onboarding (Migration 018).
- Completed locally: Added a server-authored, server-current re-consent flow
  (Migration 019), synchronized policy versioning, and fail-closed app routing.
- Completed locally: Audited all 53 official URLs and all 24 numeric deadlines;
  Migration 020 conservatively leaves 12 exact-day deadlines on a fresh reset.
- Completed locally: Registered and unit-tested the current BC health-coverage
  PDF mapping and local download/fill/cache path. The downloaded file is pinned
  to its audited hash, Unicode values survive an editable 167-field round trip,
  requests include a byte range with progress cancellation and a final size
  check, the review acknowledgement appears before the share sheet, and
  Android chooser returns schedule exact-file cleanup without risking a newer
  share.
- Drafted: App Store/Play Store descriptions, privacy nutrition labels, and
  data-safety answers in `docs/STORE.md`; current name/subtitle/short-description
  and keyword lengths fit platform limits. Version 1.0 is already live and
  broken; the draft specifically remains unapproved for the 1.0.1 recovery
  submission.
- Recommended: Start content work with AB↔ON, then ON↔BC and AB↔BC, using
  waitlist demand before final commercial ranking.
- Remaining: Resolve inaccessible/blocked sources, deepen origin and
  destination rules, and obtain human/legal approval for conditional content.
- Remaining: release the reviewed web/mobile recovery only after preview/device
  gates; then test policy re-consent, resolver sources, and the BC PDF on SDK 55
  EAS builds and real devices against the now-current production backend.
- Remaining: Complete Apple/Google accounts and replace the existing pre-final
  screenshots with store-ready captures from the release candidate.
- Remaining: provision/review a Google Play service-account key for automated
  Android submission, or document the owner-controlled manual submission path.
- Remaining human/account gates: confirm the draft privacy nutrition/data
  safety forms (including anonymous linked data and Gemini processing), correct
  the live App Store "Data Not Collected" answer, finish Apple metadata and
  real-device QA, reconcile the age rating shown by Apple, and inspect
  territorial availability/trader status in App Store Connect without assuming
  why European/UK storefronts are absent; complete any 2FA; approve final
  legal/content language; and make the Support URL point to a monitored mailbox.

Exit: content is defensible, one production PDF works, legal/disclosures are
approved, and the 1.0.1 recovery submissions are ready.

### Phase 5 — observability and controlled recovery rollout

Status: **in progress.**

- Completed: Main uptime run `30843906264` passed the public web, production
  anonymous-auth, and canonical-resolver probes with backend checks required;
  the probe rejects preview and every URL except the exact production origin.
- Completed locally: Added a PII-safe on-device crash/error boundary and global
  handler in mobile (redacts identifiers, transmits nothing off-device).
- Remaining: A single passing run does not establish recurring schedule or
  alert ownership. Decide on and, if approved, wire a privacy-reviewed external
  crash/error service; establish recurring uptime/alert ownership; configure
  Edge/worker alerts; verify support ownership; and add backup checks.
- Remaining: Treat 1.0.1 as an incident-recovery release: ship it only after
  the release gates pass, then monitor a small verified cohort/corridor set
  before expanding availability or marketing.
- Remaining: Monitor onboarding, completion, escalations, worker noise,
  deletions, and source accuracy before expanding.

Exit: 1.0.1 users are observable, recoverable, and supportable, and the broken
1.0 release is no longer the current App Store version.

### Phase 6 — post-launch product growth

Status: **deferred.**

- Recoverable/linkable accounts and multi-device sync.
- Push reminders, calendar export, and deadline notifications.
- French content and UI localization.
- Admin audit log and full content/source CRUD (server-side user pagination is
  already implemented in migration 021).
- Broader corridor coverage, worker queues/per-source schedules, analytics,
  partnerships, and monetization.

## Definition of done

Recovery completion and MVP readiness are established only when:

- App Store version 1.0.1 has passed real-device QA and is released, so broken
  version 1.0 is no longer the current downloadable version;
- the repository is clean, committed, reproducible, and CI-green;
- isolated preview/production environments are configured;
- hosted migrations, RLS/RPCs, Edge Function, web apps, and worker are live;
- iOS and Android store-equivalent builds pass full end-to-end QA;
- promoted rules and at least one production PDF workflow are verified;
- legal/store disclosures are approved and published;
- backup/restore, monitoring, alerts, incident response, and support ownership
  are operational; and
- deletion and on-device PII behavior are verified on real devices.

Update this file when status or priority changes. Do not create another roadmap,
project-status document, or competing action list.

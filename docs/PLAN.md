# ReloGo — canonical project plan

_Last updated: 2026-07-14_

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
| `supabase/` | Auth, database, RLS/RPCs, Realtime, AI function | Local migrations 001–022, Deno Edge Function |

There is no monorepo build layer. Each JavaScript app has an independent
lockfile and environment. Supabase migrations are the schema source of truth;
RLS and narrow SECURITY DEFINER RPCs are the authorization boundary.

### Main runtime flows

1. Landing submits a corridor/email through the enumeration-safe
   `join_waitlist()` RPC.
2. Mobile creates an anonymous account and stores only non-sensitive move
   metadata in `user_profiles`.
3. The app compares the profile's accepted policy version with the
   server-current version and routes stale profiles through re-consent before
   normal data access.
4. Checklist rules match exact province/territory codes plus `ANY` wildcards,
   filter for vehicle/dependents, and calculate local-calendar deadlines.
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

- Anonymous onboarding with required Privacy Policy and Terms consent.
- Server-current policy checks, server-authored acceptance timestamps, and a
  fail-closed re-consent route are implemented locally through migration 019.
- Profile-aware auth routing with retry and stale-request protection.
- Personalized, deadline-sorted checklist and optimistic progress updates.
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
  robots, and sitemap are implemented locally. The Support/legal changes are
  uncommitted and are not present on the currently deployed landing build.
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

- Ordered local migrations 001–022 cover schema, seed data, RLS, deletion,
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
- Support timestamps are server-authored; AI persistence is atomic and
  service-only; human involvement is permanently marked; client write columns
  are narrow.
- Support message bodies and thread metadata cannot carry client-authored free
  text.
- The extracted mobile/admin `Database` interfaces are CI-checked byte-for-byte.
- CI covers clean installs, mobile types/tests/dependency alignment/native
  exports, landing lint/build, admin build, worker compile/tests, support helper
  tests/allowlist synchronization, API integration tests, consent-version
  synchronization, database lint/pgTAP, and shared types.

### Cloud foundation

- Separate preview and production Supabase projects are active in Canada's
  `ca-central-1` region. Development/preview clients target preview; production
  clients target production in Vercel and EAS.
- Hosted anonymous sign-ins are enabled with a 30-per-hour-per-IP limit.
- Migrations 001–018 and `support-ai` version 2 are deployed to both projects.
  JWT verification is enabled, `GEMINI_API_KEY` is configured, and the first
  admin identity is server-authorized in both environments. Local migrations
  019–020 and the current app/web changes are not deployed.
- Preview passed a self-cleaning anonymous onboarding → profile → checklist →
  support fallback → account deletion smoke test.
- Hosted public-schema lint and all 143 pgTAP checks pass in both environments.
  Security/performance advisor results were reviewed; the remaining warnings
  are intentional RPC/RLS policy shape or expected unused-index noise on fresh
  databases.

## Verification snapshot

Current local checks for the uncommitted 2026-07-14 shared tree, plus the last
separately identified hosted checks:

| Check | Result |
| --- | --- |
| Mobile clean install and dependency alignment | Pass |
| Mobile TypeScript | Pass |
| Mobile ESLint (eslint-config-expo flat) | Pass; 0 errors |
| Mobile Jest | 85/85 pass |
| Expo iOS Hermes export | Pass |
| Expo Android Hermes export | Pass |
| Mobile production dependency audit | 12 moderate, 0 high/critical (Expo build-tool transitives) |
| Admin production build/audit | Pass; 0 vulnerabilities |
| Landing Next.js 16 lint/static production build | Pass |
| Landing production dependency audit | 0 vulnerabilities |
| Worker Python 3.11 compile/tests | 69/69 pass |
| Database/support/consent synchronization | Pass; extracted `Database` interface byte-identical at 305 lines; support questions and policy version match |
| Fresh local migrations, public-schema lint, pgTAP | Clean reset applies 001–022; lint clean; 164/164 pgTAP pass |
| E2E test suite (Python) | 85/85 pass against clean local Supabase |
| Backup/restore documentation | Complete at `docs/BACKUP_RESTORE.md` |
| Hosted preview smoke | Anonymous onboarding, profile, checklist, support fallback, and account deletion pass |
| Full deployed flow / EAS device builds | Not run; current web/schema changes, healthy worker baseline/webhook, and SDK 55 device builds remain |

Passing these checks means the implementation is a strong MVP. It is not a
production launch until the remaining phases below pass.

## Remaining risks and deliberate limits

### Release blockers

- The current free Supabase plan does not provide the required managed
  backup/PITR posture; a paid-backup decision and restore drill remain.
  Backup/restore procedures are documented at `docs/BACKUP_RESTORE.md`.
- No complete live pass has exercised mobile, Gemini, database, admin, landing,
  and worker together against the intended hosted projects.
- Legacy admin bootstrap helpers containing password material were removed from
  the working tree, but the value remains in Git history. Rotate/revoke the
  hosted admin credentials and decide the reviewed history-remediation approach
  before release.
- The local migration 019 re-consent boundary, migration 020 content
  corrections, Support/legal routes, BC PDF workflow, worker runner fix, and
  uptime workflow are uncommitted and not deployed.
- The BC government PDF workflow has not been exercised on current SDK 55 EAS
  builds or real devices.
- The initial independent content audit covered all 53 source URLs and all 24
  seeded numeric deadlines, but 15 sources did not yield usable content to the
  automated probe and origin-specific, qualitative, school, and exception-heavy
  content still needs human/legal review before promotion.
- Legal text, store disclosures, backup/restore, active monitoring, and a
  monitored public support/privacy mailbox are not production-approved.

### Follow-ups that do not block local stabilization

- Two hardening ideas were reviewed and deliberately left out of MVP scope
  (2026-07-14): a recoverable AI-quota lease (negligible benefit at launch scale
  — a duplicate *stored* reply is already prevented) and workload-specific
  credentials replacing the shared server-side `service_role` (post-launch
  hardening needing hosted roles/JWTs/secrets). Revisit either only post-launch
  if warranted.
- Fixed-question support protects privacy but cannot collect arbitrary bug
  details; define a privacy-reviewed support channel before broad launch.
- The first manual worker workflow attempt failed during Playwright dependency
  installation on Ubuntu 24.04, before the scraper ran. The local Ubuntu 22.04
  runner fix is uncommitted; a full real 53-source baseline and webhook delivery
  still have not succeeded with production credentials.
- Mobile dependency audit findings are limited to moderate Expo toolchain
  transitive advisories; avoid unsafe forced downgrades and recheck with future
  supported SDK updates.
- Mobile now captures crashes/errors on-device in a PII-safe form (redacted,
  never transmitted) behind a top-level boundary. Wiring an external crash
  service remains a deliberate, privacy-reviewed decision; do not add one that
  transmits data off-device without that review. (The earlier "no mobile ESLint
  gate" gap is resolved: `eslint-config-expo` flat config now runs in CI.)

## Phased roadmap

### Phase 0 — repository consolidation and local stabilization

Status: **complete for the committed stabilization baseline.** The current
release-readiness changes are locally verified but remain dirty/uncommitted and
must return to a clean CI-green state before this exit is met again.

- Consolidate planning into this file and agent context into AI_HANDOFF.
- Remove tracked generated files and duplicate root Expo configuration.
- Align SDK/framework dependencies and lockfiles.
- Close account, support, admin, waitlist logging, and worker race/security bugs.
- Make the complete local verification matrix a CI contract.

The prior stabilization exit was met with fresh migrations, clean installs, and
a committed tree. The same clean/committed requirement applies to the current
001–022 change set.

### Phase 1 — provision isolated environments

Status: **completed except backup/billing and admin credential rotation.**

- Completed: separate Canadian preview/production Supabase projects.
- Completed: environment-scoped public variables in Vercel, EAS, and local preview files.
- Completed: anonymous auth/rate limit, migrations 001–018, active JWT-protected `support-ai`, hosted lint/pgTAP, advisors, and preview smoke test.
- Completed: pushed migrations 017 and 018 to both hosted projects; verified the admin bootstrap trigger works.
- Completed: created the first admin identity (`admin@relogo.app`) and verified `is_admin()` in both environments.
- Completed: supplied `GEMINI_API_KEY` securely to preview and production.
- Remaining: choose a backup/PITR-capable plan and complete a restore drill (requires billing upgrade).
- Remaining: rotate/revoke the exposed bootstrap admin credentials and complete
  a reviewed Git-history remediation decision.

Exit: preview/prod credentials cannot cross, a real anonymous user can onboard,
an admin is server-authorized, Gemini-backed support is configured in production,
and database/function security checks pass.

### Phase 2 — deploy web and monitoring worker

Status: **in progress.**

- Completed: Deployed landing and admin to Vercel with intended public variables.
- Completed: Added `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` GitHub secrets for the worker.
- Completed: The scheduled worker workflow is present on the default branch.
- Remaining: Deploy the current Support/legal build, configure the public
  privacy/support mailbox, attach a reviewed public domain, and verify every
  legal/metadata route. The current live aliases still serve the earlier build.
- Remaining: Commit/push the Ubuntu 22.04 worker fix, rerun manually to establish
  healthy baselines, and configure/test webhook delivery.
- Remaining: Verify waitlist signup → admin visibility and source change → PENDING alert → human approval/dismissal.

Exit: both web apps are live, one complete worker run is healthy, notifications
work, and no worker path can modify live rules.

### Phase 3 — mobile preview and full end-to-end QA

Status: **blocked on Phase 2.**

- Produce EAS preview builds for iOS and Android.
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
  and keyword lengths fit platform limits, but final legal/store review remains,
  so these are not submission-ready.
- Recommended: Start content work with AB↔ON, then ON↔BC and AB↔BC, using
  waitlist demand before final commercial ranking.
- Remaining: Resolve inaccessible/blocked sources, deepen origin and
  destination rules, and obtain human/legal approval for conditional content.
- Remaining: Deploy migrations 019–020 and current web/mobile changes, then test
  policy re-consent and the BC PDF on SDK 55 EAS builds and real devices.
- Remaining: Complete Apple/Google accounts and replace the existing pre-final
  screenshots with store-ready captures from the release candidate.

Exit: content is defensible, one production PDF works, legal/disclosures are
approved, and store submissions are ready.

### Phase 5 — observability and controlled launch

Status: **in progress.**

- Completed locally: Created an incident runbook and added a privacy-safe public
  route check plus opt-in scheduled uptime workflow. The workflow is uncommitted
  and remains inactive until `UPTIME_ENABLED=true`; operational ownership and
  alert delivery are not established.
- Completed locally: Added a PII-safe on-device crash/error boundary and global
  handler in mobile (redacts identifiers, transmits nothing off-device).
- Remaining: Decide on and, if approved, wire a privacy-reviewed external
  crash/error service; activate uptime checks; configure Edge/worker alerts;
  verify support ownership; and add backup checks.
- Remaining: Soft-launch to a small set of verified corridors.
- Remaining: Monitor onboarding, completion, escalations, worker noise, deletions, and source accuracy before expanding.

Exit: a controlled audience is live, observable, recoverable, and supportable.

### Phase 6 — post-launch product growth

Status: **deferred.**

- Recoverable/linkable accounts and multi-device sync.
- Push reminders, calendar export, and deadline notifications.
- French content and UI localization.
- Server-side admin pagination, audit log, and full content/source CRUD.
- Broader corridor coverage, worker queues/per-source schedules, analytics,
  partnerships, and monetization.

## Definition of done

MVP launch is complete only when:

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

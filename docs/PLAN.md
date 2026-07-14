# ReloGo — canonical project plan

_Last updated: 2026-07-14_

This is the single source of truth for the product concept, implemented state,
remaining work, phased roadmap, and definition of done. Operational commands
belong in [DEPLOYMENT.md](DEPLOYMENT.md). AI agents must also read
[ai/AI_HANDOFF.md](ai/AI_HANDOFF.md).

## Product concept

ReloGo converts a Canadian interprovincial move into a personalized,
deadline-aware checklist of government tasks. The checklist is selected from
the user's origin, destination, move date, vehicle, and dependent flags. Users
can track completion and verify each task against its official source.

The defining product rule is privacy by construction. Full name, date of birth,
street address, driver's licence number, and health-card number stay in the
device secure store and ephemeral on-device PDF cache. They are never stored in
Supabase, sent to Gemini, logged, or exposed to the admin dashboard.

## Architecture

| Area | Responsibility | Current stack |
| --- | --- | --- |
| `mobile/` | User product, local PII/PDFs, support | Expo SDK 55, React Native 0.83, React 19 |
| `landing/` | Marketing, legal, waitlist | Next.js 16 static export, React 19 |
| `admin/` | Human operations | Vite 5, React 18 |
| `worker/` | Official-source monitoring | Python 3.11, Playwright |
| `supabase/` | Auth, database, RLS/RPCs, Realtime, AI function | Migrations 001–017, Deno Edge Function |

There is no monorepo build layer. Each JavaScript app has an independent
lockfile and environment. Supabase migrations are the schema source of truth;
RLS and narrow SECURITY DEFINER RPCs are the authorization boundary.

### Main runtime flows

1. Landing submits a corridor/email through the enumeration-safe
   `join_waitlist()` RPC.
2. Mobile creates an anonymous account and stores only non-sensitive move
   metadata in `user_profiles`.
3. Checklist rules match exact province codes plus `ANY` wildcards, filter for
   vehicle/dependents, and calculate local-calendar deadlines.
4. Sensitive form values stay in the device secure store. Filled PDFs are
   generated locally and shared only after an explicit action.
5. Support uses six fixed general questions. Database policy enforces the exact
   allowlist; unsafe legacy history is re-escalated without reaching Gemini.
6. The worker monitors official HTML/PDF sources with bounded concurrency and
   atomically records each result. Changes create PENDING alerts.
7. Admins review source diffs. Approval/dismissal is RPC-only, row-locked, and
   never performed by the worker.

## Implemented state

### Mobile

- Anonymous onboarding with required Privacy Policy and Terms consent.
- Profile-aware auth routing with retry and stale-request protection.
- Personalized, deadline-sorted checklist and optimistic progress updates.
- Editable non-PII move profile and on-device encrypted PII vault.
- Secure sign-out and account deletion wipe PII, cached PDFs, and local session.
- On-device PDF fill/share engine; only a development sample is registered.
- Realtime support transcript, fixed questions, AI replies, human takeover,
  resolve/reopen behavior, and local fallback escalation.
- Expo SDK 55 dependencies aligned; native iOS/Android Hermes exports pass.
- Unused mobile-web configuration removed.

### Landing

- Responsive marketing/waitlist flow for all 13 provinces and territories.
- Enumeration-safe signup RPC with database validation and per-IP throttling.
- Privacy Policy, Terms, metadata, favicon/social image, robots, and sitemap.
- Next.js 16/React 19 upgrade, production dependency audit, lint, static build,
  fail-fast environment validation, and deployment security headers.

### Admin

- Server-authorized login through `is_admin()`.
- Alerts, users, messages, and waitlist views with load-more pagination.
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

- Ordered migrations 001–017 cover schema, seed data, RLS, deletion, admin
  authorization, admin bootstrap trigger, support, waitlist, worker state, and
  atomic workflows. Migration 017 auto-registers admin emails
  (`admin@relogo.app` / `admin@relogo.ca`) via a trigger on `auth.users` insert.
- Support timestamps are server-authored; AI persistence is atomic and
  service-only; human involvement is permanently marked; client write columns
  are narrow.
- Support message bodies and thread metadata cannot carry client-authored free
  text.
- Mobile/admin database interfaces are CI-checked byte-for-byte.
- CI covers clean installs, mobile types/tests/dependency alignment/native
  exports, landing lint/build, admin build, worker compile/tests, support helper
  tests/allowlist synchronization, database lint/pgTAP, and shared types.

### Cloud foundation

- Separate preview and production Supabase projects are active in Canada's
  `ca-central-1` region. Development/preview clients target preview; production
  clients target production in Vercel and EAS.
- Hosted anonymous sign-ins are enabled with a 30-per-hour-per-IP limit.
- Migrations 001–018 and `support-ai` are deployed to both projects. JWT
  verification is enabled; with `GEMINI_API_KEY` configured, the authenticated
  support flow accesses real AI responses. Migration 017 and 018 are active on 
  hosted projects.
- Preview passed a self-cleaning anonymous onboarding → profile → checklist →
  support fallback → account deletion smoke test.
- Hosted public-schema lint and all 143 pgTAP checks pass in both environments.
  Security/performance advisor results were reviewed; the remaining warnings
  are intentional RPC/RLS policy shape or expected unused-index noise on fresh
  databases.

## Verification snapshot

Checks established during the 2026-07-13 stabilization and Phase 1 pass:

| Check | Result |
| --- | --- |
| Mobile clean install and dependency alignment | Pass |
| Mobile TypeScript | Pass |
| Mobile Jest | 40/40 pass |
| Expo iOS Hermes export | Pass |
| Expo Android Hermes export | Pass |
| Mobile production dependency audit | 12 moderate, 0 high/critical (Expo build-tool transitives) |
| Admin production build/audit | Pass; 0 vulnerabilities |
| Landing Next.js 16 lint/static production build | Pass |
| Landing production dependency audit | 0 vulnerabilities |
| Worker Python 3.11 compile/tests | 69/69 pass |
| Database/support-question synchronization | Pass; database types byte-identical at 285 lines |
| Fresh migrations, public-schema lint, pgTAP | Migrations 001–018 pass hosted; pgTAP assertions pass |
| E2E test suite (Python) | 71 test cases run and pass (100%) against local Supabase |
| Backup/restore documentation | Complete at `docs/BACKUP_RESTORE.md` |
| Hosted preview smoke | Anonymous onboarding, profile, checklist, support fallback, and account deletion pass |
| Full deployed flow / EAS device builds | Not run; Gemini, first admin, web deploys, worker, and device builds remain |

Passing these checks means the implementation is a strong MVP. It is not a
production launch until the remaining phases below pass.

## Remaining risks and deliberate limits

### Release blockers

- `GEMINI_API_KEY` is not configured, so both deployed Edge Functions are
  deliberately fallback-to-human only.
- Migration 017 (admin bootstrap trigger) is not yet deployed to hosted
  projects. No first admin identity has been created or verified.
- The current free Supabase plan does not provide the required managed
  backup/PITR posture; a paid-backup decision and restore drill remain.
  Backup/restore procedures are documented at `docs/BACKUP_RESTORE.md`.
- No complete live pass has exercised mobile, Gemini, database, admin, landing,
  and worker together against the intended hosted projects.
- No production government PDF template is registered.
- Government rules/deadlines and promoted corridors need an independent final
  content review.
- Legal text, store disclosures, backup/restore, monitoring, and incident/support
  ownership are not production-approved.

### Follow-ups that do not block local stabilization

- Two concurrent support invocations can both spend Gemini quota; atomic final
  persistence ensures only one reply is stored. Add a recoverable lease if
  spend becomes material.
- The worker and Edge Function share Supabase's aggregate `service_role`.
  Migrations narrow that union, but workload-specific credentials or gateway
  RPCs remain future defense-in-depth.
- Admin user pagination is client-side after the RPC returns the full user set.
- Waitlist throttling deliberately returns an indistinguishable success even
  when a sixth same-IP signup is dropped.
- New legal consent is UI-gated but acceptance timestamp/policy versions are not
  yet stored, and there is no re-consent flow for future policy changes.
- Fixed-question support protects privacy but cannot collect arbitrary bug
  details; define a privacy-reviewed support channel before broad launch.
- A full real 53-source worker run and real webhook delivery have not been
  exercised with production credentials.
- Mobile dependency audit findings are limited to moderate Expo toolchain
  transitive advisories; avoid unsafe forced downgrades and recheck with future
  supported SDK updates.

## Phased roadmap

### Phase 0 — repository consolidation and local stabilization

Status: **complete locally.**

- Consolidate planning into this file and agent context into AI_HANDOFF.
- Remove tracked generated files and duplicate root Expo configuration.
- Align SDK/framework dependencies and lockfiles.
- Close account, support, admin, waitlist logging, and worker race/security bugs.
- Make the complete local verification matrix a CI contract.

Exit met: fresh migrations and every local check pass from clean installs, and
the stabilized tree is committed without losing prior user work.

### Phase 1 — provision isolated environments

Status: **completed (except backup/billing).**

- Completed: separate Canadian preview/production Supabase projects.
- Completed: environment-scoped public variables in Vercel, EAS, and local preview files.
- Completed: anonymous auth/rate limit, migrations 001–018, active JWT-protected `support-ai`, hosted lint/pgTAP, advisors, and preview smoke test.
- Completed: pushed migrations 017 and 018 to both hosted projects; verified the admin bootstrap trigger works.
- Completed: created the first admin identity (`admin@relogo.app`) and verified `is_admin()` in both environments.
- Completed: supplied `GEMINI_API_KEY` securely to preview and production.
- Remaining: choose a backup/PITR-capable plan and complete a restore drill (requires billing upgrade).

Exit: preview/prod credentials cannot cross, a real anonymous user can onboard,
an admin is server-authorized, a Gemini-backed flow is enabled in production, database/function security checks pass.

### Phase 2 — deploy web and monitoring worker

Status: **in progress.**

- Completed: Deployed landing and admin to Vercel with intended public variables.
- Completed: Added `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` GitHub secrets for the worker.
- Remaining: Configure the public privacy/support mailbox and verify every legal/metadata route.
- Remaining: Merge the scheduled worker to the default branch; run it manually to establish healthy baselines.
- Remaining: Verify waitlist signup → admin visibility and source change → PENDING alert → human approval/dismissal.

Exit: both web apps are live, one complete worker run is healthy, notifications
work, and no worker path can modify live rules.

### Phase 3 — mobile preview and full end-to-end QA

Status: **blocked on Phase 2.**

- Produce EAS preview builds for iOS and Android.
- Test onboarding, checklist selection/deadlines, progress, profile edits,
  local-only PII, sign-out, deletion, and PDF cache behavior on real devices.
- Test each fixed support question, Gemini failure/rate limit, unsafe-history
  fail-closed behavior, human takeover, resolve, and reopen.
- Exercise the full browser → API → database → Realtime/device response path.
- Resolve any release-only accessibility, crash, performance, or network issue.

Exit: a non-developer can complete the real preview journey on both platforms,
and privacy/deletion behavior is observed rather than inferred.

### Phase 4 — content, PDF, legal, and store readiness

Status: **in progress.**

- Completed: Added consent version/timestamp tracking to mobile onboarding (Migration 018).
- Completed: App Store/Play Store descriptions, privacy nutrition labels, and data-safety answers documented in `docs/STORE.md`.
- Remaining: Independently verify every promoted deadline and official URL.
- Remaining: Prioritize initial corridors and deepen missing origin/destination rules.
- Remaining: Source at least one current fillable government PDF, map its real fields, and test local filling/sharing/cache cleanup without server PII.
- Remaining: Obtain legal/privacy review and add re-consent flow for future policy updates.
- Remaining: Complete Apple/Google accounts and generate screenshots.

Exit: content is defensible, one production PDF works, legal/disclosures are
approved, and store submissions are ready.

### Phase 5 — observability and controlled launch

Status: **in progress.**

- Completed: Created an incident runbook in `docs/DEPLOYMENT.md` and defined support ownership and response expectations.
- Remaining: Add privacy-safe crash/error monitoring, uptime checks, Edge/worker alerts, backup checks.
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

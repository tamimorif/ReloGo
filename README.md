# ReloGo

ReloGo turns a move between Canadian provinces or territories into a
personalized checklist of government tasks with suggested timing. Current core
content is selected by destination and filtered by vehicle and dependent
details; origin-specific rule depth remains planned. The app tracks completion
and links every task to an official source.

Privacy is an architectural rule: full name, date of birth, street address,
driver's licence number, and health-card number stay on the device. They are
never written to Supabase or sent to the support AI.

## Applications

| Area | Purpose | Stack |
| --- | --- | --- |
| `mobile/` | Onboarding, checklist, local PII vault, on-device PDF filling, fixed-question support | Expo SDK 55, React Native 0.83, React 19, expo-router |
| `landing/` | Marketing, legal pages, and waitlist | Next.js 16 static export, React 19, Tailwind |
| `admin/` | Rule alerts, users, support, and waitlist operations | Vite 5, React 18, Tailwind |
| `worker/` | Official-source change monitor | Python 3.11, Playwright, Supabase |
| `supabase/` | Auth, Postgres, RLS, RPCs, Realtime, and support AI | Ordered SQL migrations and a Deno Edge Function |

The JavaScript applications are independent projects. Each owns its own
`package.json`, lockfile, build, and environment file.

## Recovery and release status

The reviewed recovery source was merged through pull request #2 into `main` at
`e75f449`; worker hardening and its evidence then merged through pull request
#3 at `d2db994`. The production database, final support function, reviewed
admin recovery, and backend-aware uptime checks are live; landing is unchanged
and live. The App Store still distributes the broken 1.0 release, so real-
device QA, approved store metadata, and release of 1.0.1 remain the user-facing
outage gate.

- The repository now contains migrations 001–027, but migration 027 and its
  coordinated worker changes are local and pending review. Preview was migrated
  to 001–026, passed the hosted smoke checks (including authenticated AI
  support), and was then deliberately paused. Production remains active at
  exact migrations 001–026 with `support-ai` version 5 ACTIVE/JWT-protected;
  unauthenticated invocation returns 401. Its last pre-027 post-promotion dry
  run was clean. A self-cleaning production
  smoke against the final function passed anonymous auth, resolver output with
  five tasks/five HTTPS official sources, a minimal onboarding profile insert,
  authoritative consent/profile confirmation, authenticated non-fallback AI,
  and cleanup.
- App Store version 1.0 has been live since 2026-06-23 (Apple ID `6781947478`,
  bundle ID `com.relogo.app`). It is built from the retired SDK 51
  configuration and contains a Supabase project reference that no longer
  exists. It did not include a compatible Expo Updates runtime, so its
  backend-dependent onboarding and checklist flows cannot be repaired by an
  OTA update. A final 1.0.1 store binary from the merged recovery tree is the
  user-facing recovery path and has not shipped.
- The local 1.0.1 / SDK 55 app no longer holds the native splash screen on a
  network request, restores its encrypted session with bounded timeouts,
  avoids duplicate startup fetches, caches the profile/bootstrap result, and
  starts rules/progress prefetch after authoritative consent while the route
  renders. It loads the PDF engine only when the user asks to fill a form. Public Supabase
  runtime configuration accepts only a clean origin, and production release
  checks require the exact production origin and a trimmed, nonblank public
  key. Checklist profile, rules, and progress reads abort after 8 seconds with
  automatic retries disabled. Onboarding writes only minimal non-PII profile
  fields, then `get_policy_consent_state()` returns the authoritative
  allowlisted profile that is cached before checklist navigation. Its auth,
  profile insert/update, and confirmation waits are each bounded at 10 seconds.
  Real-device QA is still required to measure and approve startup performance;
  a successful cloud build is not device evidence. Its production dependency
  audit now patches `js-yaml`, `nanoid`, and `postcss`; a fail-closed wrapper
  accepts only two exact upstream Metro/image-size build-time advisories with
  no patched release. A narrow `xcode@3.0.1` override still pins `uuid` 11.1.1.
- The latest full code matrix at `2624ad3` passed mobile release configuration,
  TypeScript, lint, 11 Jest suites with 116/116 tests, iOS export (1,752 modules,
  5.8 MB Hermes bytecode), Android export (1,773 modules, 5.9 MB Hermes
  bytecode), and audit 0; landing and admin lint/build; Deno
  format/lint/type checks and 16/16 support tests; worker compile and 77/77
  tests; and contract/workflow/script validation. A focused 2026-08-03 rerun on
  the documentation tree again passed mobile 116/116, TypeScript, release
  configuration, worker 77/77, Gemini transport 4/4, Python dependency
  consistency, uptime-script syntax, and whitespace checks.
  Worker and backend-aware uptime preflights now reject every Supabase URL
  except the exact production project origin.
- Earlier iOS production/store build 7 `FINISHED` successfully from exact
  `main` `e75f449` (version 1.0.1, EAS
  `765965d7-c7c1-432c-ac1d-302d2f0c5116`). Android production/store build 4
  also `FINISHED` successfully from the same commit (version 1.0.1, EAS
  `28076f35-1495-466b-af77-97a9339c5ea2`). iOS build 7 is valid and active in
  internal TestFlight but has not entered App Review; Android build 4 has not
  reached Google Play. Those artifacts predate the current `tamim` startup and
  dependency fixes and are historical evidence, not current release
  candidates. Fresh exact-commit artifacts, real-device QA, and
  owner/legal/store approval remain.
- The reviewed admin build is live at `https://relo-go.vercel.app`; landing is
  unchanged and live at `https://relogo-two.vercel.app`. Main-branch uptime run
  `30843906264` passed every public route plus production anonymous-auth and
  canonical-resolver probes with `REQUIRE_SUPABASE_CHECK=true`.
- Pull request #2's final head `f34b64a` passed all 19 GitHub/Vercel checks;
  both fixed review threads were resolved and the pull request was merged as
  `e75f449`.
- Pull request #3's final head `3f063e9` passed all 19 checks, its sole review
  thread was fixed/resolved, and it merged as `d2db994`.
- Main-branch worker run `30843904269` installed `supabase==2.31.0`; its exact-
  origin key/schema preflight passed, proving that secret rotation is not
  needed. The full run persisted 42 of 53 baselines. The follow-up run's 11
  failed source rows represented 10 unique URLs and were anti-bot, CAPTCHA, or
  empty-content rejections—not an authentication or Python crash. These
  failures must stay visible:
  do not baseline challenge content or bypass CAPTCHAs. Replace a source only
  after review of an equivalent first-party URL, otherwise assign explicit
  manual monitoring. The post-merge worker follow-up fetches duplicate URLs
  once, serializes/paces same-origin requests, and reports managed challenges
  separately while preserving the nonzero fail-closed policy; its worker suite
  passes 97/97. Production verification run `30845791036` fetched 50 unique
  URLs for 53 rows, reused three duplicate outcomes, and again completed 42
  rows (`1` new baseline, `38` unchanged, `3` changed) while keeping 11 blocked
  outcomes failed. Production now has 43/53 source baselines; the three changes
  are PENDING human-review alerts, not live-rule edits. `ALERT_WEBHOOK_URL` is
  still unset. A local, pending migration 027 keeps every canonical
  `official_url` public while assigning nine affected rows a separately stored,
  worker-only first-party monitor target. Yukon driver-licence and vehicle-
  registration rows are instead assigned to MANUAL review by ReloGo operations
  every 30 days and appear in every Actions summary. That cadence is an
  assignment, not proof of review or overdue tracking. All nine automatic
  targets passed worker-equivalent local reachability checks; migration 027 has
  not been applied to a hosted project and the updated worker has not had a live
  Actions rerun. Challenge and content gates remain fail-closed.
  Reachability is not semantic equivalence: the Quebec target is high-level
  RAMQ guidance, the Nunavut vehicle target is a general driver manual, the PEI
  school target covers the English Public Schools Branch, and the Yukon school
  policy does not cover every registration step or school authority. A green
  run will prove only that configured automatic checks completed; those content
  gaps remain human-review gates.

The backend promotion does not release the rest of the product. See the
[deployment guide](docs/DEPLOYMENT.md) for the remaining guarded release order
and the [canonical plan](docs/PLAN.md) for the human gates.

## How it works

```text
Landing ── waitlist RPC ───────────────┐
                                      │
Mobile ── auth/checklist/progress ── Supabase ── protected Admin dashboard
  │                                   ▲
  └─ sensitive PII + filled PDFs      │
     remain on the device             ├─ support-ai Edge Function
                                      └─ service-role monitoring RPC ── Worker
```

- Row-level security is the client authorization boundary.
- Admin membership is checked server-side through `admin_users` and
  `is_admin()`; there is no client email allowlist.
- Mobile support accepts six fixed general questions. The database enforces the
  same allowlist, and the Edge Function fails closed on legacy/unsafe history.
- The worker scrapes automatic official HTML/PDF sources concurrently, then
  records each result through a row-locked compare-and-swap RPC. Explicit manual
  assignments remain visible in every Actions summary. A changed source creates
  a PENDING alert; only a human admin can approve a live rule change.
- The first production template is British Columbia's official Application for
  Health and Drug Coverage. ReloGo downloads the blank form from the government
  source only after an explicit tap, verifies its audited SHA-256 before reading
  local PII, fills mapped fields on-device, and leaves it editable. Unit and
  Unicode round-trip checks pass; real-device sharing still needs preview-build
  QA.

## Database migrations

`supabase/migrations/` is the schema source of truth. Apply approved migrations
in order; do not edit the hosted schema by hand or treat local migration 027 as
deployed evidence.

| Migration | Purpose |
| --- | --- |
| `001_init.sql` | Core tasks, rules, sources, alerts, profiles, progress, waitlist, and baseline RLS |
| `002_hardening_and_user_deletion.sql` | Constraints, admin authorization, deletion, waitlist, and alert-approval RPCs |
| `003_admin_user_views.sql` | Admin user-list/detail RPCs |
| `004_support_messages.sql` | Support threads/messages, states, RLS, and Realtime |
| `005_seed_all_corridors.sql` | Core data for all 13 provinces and territories |
| `006_official_source_content_text.sql` | Worker text baselines and protected scraper columns |
| `007_hardening_round_two.sql` | Support caps, RLS tightening, waitlist throttle, guarded approval |
| `008_atomic_support_ai.sql` | Atomic AI finalization and trusted support timestamps |
| `009_atomic_rule_review_permissions.sql` | RPC-only rule approval/dismissal |
| `010_support_question_privacy_boundary.sql` | Fixed support-question allowlist and least-privilege Edge grants |
| `011_atomic_official_source_scrapes.sql` | Atomic worker baseline/alert compare-and-swap |
| `012_support_thread_metadata_privacy.sql` | Blocks client-authored free-text support metadata |
| `013_reject_obsolete_rule_approvals.sql` | Rejects approval after a source baseline advances |
| `014_persistent_support_human_takeover.sql` | Permanently records human-involved support threads |
| `015_hosted_support_ai_least_privilege.sql` | Makes hosted Edge grants match the tested least-privilege boundary |
| `016_support_thread_user_inbox_index.sql` | Covers the user-specific support inbox lookup and ordering |
| `017_admin_bootstrap_trigger.sql` | Registers reviewed bootstrap admin emails on auth-user creation |
| `018_consent_versioning.sql` | Adds accepted policy version and timestamp fields |
| `019_policy_reconsent.sql` | Makes consent server-authored, adds re-consent RPCs, and gates normal user data on the current version |
| `020_content_audit_corrections.sql` | Applies conservative deadline corrections and distinguishes crawl timestamps from content approval |
| `021_admin_user_pagination.sql` | Adds bounded server-side admin user pagination and totals |
| `022_waitlist_signup_feedback.sql` | Returns enumeration-safe accepted/throttled waitlist feedback |
| `023_corridor_rule_resolver.sql` | Adds the canonical exact/`ANY` rule resolver and ordered HTTPS official sources |
| `024_consent_state_profile_payload.sql` | Returns the current consent state and allowlisted non-PII startup profile in one RPC |
| `025_available_only_progress.sql` | Removes the unused `LOCKED` state; progress is `AVAILABLE` or `COMPLETED` |
| `026_distinct_move_provinces.sql` | Rejects new or updated profiles/waitlist rows whose origin equals destination |
| `027_worker_source_monitoring.sql` | Adds private automatic monitor targets and explicit owned manual assignments; local and pending review/deployment |

## Quick start

Prerequisites: Node.js 22, Python 3.11, Docker Desktop, the Supabase CLI, and
Chromium for Playwright.

```bash
# Local backend: starts services and applies migrations
supabase start
supabase db reset --local
supabase test db --local supabase/tests/

# Mobile
cd mobile
cp .env.example .env
npm ci
npm start

# Landing
cd ../landing
cp .env.example .env.local
npm ci
npm run dev

# Admin
cd ../admin
cp .env.example .env
npm ci
npm run dev

# Worker (use Python 3.11)
cd ../worker
cp .env.example .env
python3.11 -m pip install -r requirements.txt
python3.11 -m playwright install chromium
python3.11 main.py
```

Enable anonymous sign-ins in Supabase before testing mobile onboarding. Never
put a `service_role` key in a client application.

Cloud mobile builds use the `development`, `preview`, and `production` EAS
environments declared in `mobile/eas.json`. The registered EAS project maps
development/preview to the isolated preview Supabase project and production to
the isolated production project. Keep those public values scoped separately
when rotating them or creating another EAS project.

## Documentation

- [Canonical plan](docs/PLAN.md) — concept, current state, phased roadmap,
  risks, and definition of done.
- [Deployment guide](docs/DEPLOYMENT.md) — platform setup and release commands.
- [AI handoff](docs/ai/AI_HANDOFF.md) — required architecture, safety rules,
  verification matrix, and next engineering steps for agents.
- [Documentation index](docs/README.md) — the small set of maintained docs.

The production backend is recovered, but the App Store still serves broken
version 1.0 and the 1.0.1 recovery release is incomplete. Real-device QA,
store submission/metadata, migration-first review and hosted rollout of 027 for
the 11 previously failed source-row outcomes, a successful live worker rerun,
a tested worker webhook, funded backup/restore with a drill, a monitored public
mailbox/custom domain, final government
content/legal review, and correction of the live App Store privacy answer
remain.
The disclosure text in `docs/STORE.md` is a conservative draft; the account
owner and legal reviewer must confirm it before the 1.0.1 recovery submission.

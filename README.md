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
- The worker scrapes official HTML/PDF sources concurrently, then records each
  result through a row-locked compare-and-swap RPC. A changed source creates a
  PENDING alert; only a human admin can approve a live rule change.
- The first production template is British Columbia's official Application for
  Health and Drug Coverage. ReloGo downloads the blank form from the government
  source only after an explicit tap, verifies its audited SHA-256 before reading
  local PII, fills mapped fields on-device, and leaves it editable. Unit and
  Unicode round-trip checks pass; real-device sharing still needs preview-build
  QA.

## Database migrations

`supabase/migrations/` is the schema source of truth. Apply every migration in
order; do not edit the hosted schema by hand.

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

## Quick start

Prerequisites: Node.js 20, Python 3.11, Docker Desktop, the Supabase CLI, and
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

The project is a locally verified MVP, not a launched product. The remaining
work is primarily deploying the pending schema/web/worker fixes, establishing
a healthy worker baseline and webhook, funding and drilling backup/restore,
running SDK 55 preview builds on real devices, configuring a monitored public
mailbox/custom domain, deepening government content, and completing legal,
store, and operational approval. See the canonical plan for the ordered phases.

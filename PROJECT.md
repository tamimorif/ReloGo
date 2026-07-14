# Project: ReloGo

## Architecture
ReloGo is a Canadian interprovincial move assistant that converts a move into a personalized checklist of official tasks and deadlines.
- **Mobile (`mobile/`)**: Expo user app targeting iOS and Android. On-device PII secure store and local PDF cache. Realtime support.
- **Landing (`landing/`)**: Next.js static marketing/waitlist.
- **Admin (`admin/`)**: PROTECTED dashboard for operations.
- **Worker (`worker/`)**: Python scraper/monitor that detects official changes and creates alerts.
- **Supabase (`supabase/`)**: Backend schema, migrations, RLS/RPC policies, and Edge Functions.

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| 1 | Admin & DB Setup (Phase 1) | Create first admin identity, verify `is_admin()` and admin RPCs, and document backup recovery. | None | IN_PROGRESS (a07606e3-c3e8-4808-8a23-e1ecaac68329) |
| 2 | Web & Worker Deploy (Phase 2) | Configure Vercel environments, scheduled worker actions, webhook alerts. | M1 | PLANNED |
| 3 | Mobile Onboarding & PDFs (Phases 3-4) | Legal consent versioning/re-consent, production PDF fill/share workflow. | M2 | PLANNED |
| 4 | Store & Observability (Phases 4-5) | App store metadata (markdown), crash/error monitoring, incident runbook. | M3 | PLANNED |
| 5 | Verification & Docs (Phase 5 E2E) | Verify against E2E test suite, adversarial hardening, update PLAN.md and AI_HANDOFF.md. | M4, E2E | PLANNED |

## E2E Testing Track
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| E1| E2E Test Suite | Design E2E test infrastructure, feature/boundary/pairwise test cases, publish TEST_READY.md. | None | IN_PROGRESS (bb1ae9a5-5253-4ed2-b1ba-8406dc7743b7) |

## Interface Contracts
### Client ↔ Supabase (RLS/RPCs)
- Admin privileges verified via `admin_users` table and `is_admin()` function.
- All waitlist signups use `join_waitlist()`.
- AI support replies use `persist_support_ai_reply()`.
- Rule change approvals/dismissals use `approve_rule_change()` / `dismiss_rule_change()`.

### Code Layout
- `.agents/` — Coordination metadata (plans, progress, handoffs). No source code.
- `mobile/` — Expo app.
- `landing/` — Next.js landing page.
- `admin/` — Vite admin dashboard.
- `worker/` — Python checker.
- `supabase/` — Database migrations, edge functions, pgTAP tests.

# Project: ReloGo

## Architecture
ReloGo is a Canadian move assistant that converts a move between provinces or territories into a personalized checklist with suggested timing and official sources.
- **Mobile (`mobile/`)**: Expo user app targeting iOS and Android. On-device PII secure store and local PDF cache. Realtime support.
- **Landing (`landing/`)**: Next.js static marketing, legal, support, and waitlist.
- **Admin (`admin/`)**: PROTECTED dashboard for operations.
- **Worker (`worker/`)**: Python scraper/monitor that detects official changes and creates alerts.
- **Supabase (`supabase/`)**: Backend schema, migrations, RLS/RPC policies, and Edge Functions.

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| 1 | Admin & DB Setup (Phase 1) | Create first admin identity, verify `is_admin()` and admin RPCs, and document backup recovery. | None | IN_PROGRESS (a07606e3-c3e8-4808-8a23-e1ecaac68329) |
| 2 | Web & Worker Deploy (Phase 2) | Configure Vercel environments, scheduled worker actions, webhook alerts. | M1 | IN_PROGRESS (current web build and worker baseline/webhook remain) |
| 3 | Mobile Onboarding & PDFs (Phases 3-4) | Legal consent versioning/re-consent, production PDF fill/share workflow. | M2 | IN_PROGRESS (local implementation complete; EAS/device QA remains) |
| 4 | Store & Observability (Phases 4-5) | App store metadata (markdown), crash/error monitoring, incident runbook. | M3 | IN_PROGRESS (drafts/runbook done; production approval and monitoring remain) |
| 5 | Verification & Docs (Phase 5 E2E) | Verify against E2E test suite, adversarial hardening, update PLAN.md and AI_HANDOFF.md. | M4, E2E | IN_PROGRESS (local matrix/docs complete; deployed E2E remains) |

## E2E Testing Track
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| E1| E2E Test Suite | Maintain the 85-case Supabase API integration/E2E-style gate and its scope documentation. | None | COMPLETE locally |

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

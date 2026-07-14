# Scope: Milestone 1: Admin & DB Setup (Phase 1)

## Architecture
- Database: Supabase / PostgreSQL.
- Schema components: `admin_users` table, `is_admin()` function, RLS policies, admin-only RPCs (`approve_rule_change`, `dismiss_rule_change`).
- Environments: Preview and Production.
- Verification: pgTAP tests in `supabase/tests/`, Supabase CLI local commands.

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| 1 | Admin Schema & Identity | Select/create first admin identity, seed it or update schema, verify `is_admin()` & RPCs. | none | IN_PROGRESS |
| 2 | Backup Plan & Restore | Document backup/PITR-capable Supabase plan, complete/document a restore drill. | M1 | PLANNED |
| 3 | Verification | Run and pass RLS, RPCs, and database tests (pgTAP). | M1, M2 | PLANNED |

## Interface Contracts
### `is_admin()` ↔ Admin dashboard / RPCs
- Input: `auth.uid()` (UUID)
- Output: `boolean`
- Behavior: returns true if the user's UUID exists in `admin_users` and matches constraints.

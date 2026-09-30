---
name: relogo-backend
description: Use when working on ReloGo backend pieces — supabase/migrations (RLS policies, RPCs, SECURITY DEFINER, grants, pgTAP), the support-ai Deno Edge function, the Python worker source monitor/preflight, or the synchronized database types in mobile/ and admin/.
---

# ReloGo backend

**Source of truth** — `supabase/migrations/001_*.sql` … `028_*.sql`.
**Related** — `relogo-verify` · `relogo-mobile` · `relogo-release-qa`.

## Migrations

- Ordered and **immutable once deployed** — never rewrite a deployed migration.
- Deployed state: preview and production are at exact **001–026**; **027–028
  are local and unhosted**.
- `supabase/seed.sql` is local-only; `supabase db push` never applies it.
- The default-branch worker is already coordinated and its preflight requires
  027's columns, so production at 026 currently fails closed before scraping —
  hosted 027 is a monitoring outage, not a pre-027 worker that ignores
  `monitor_url`. Apply 027 (explicitly authorized) before expecting any worker
  run; never bypass challenge gates or baseline challenge text.
- RLS/RPCs are the **authorization boundary**. Users see only their own
  profile/progress/support rows; admin rights come only from `admin_users` /
  `is_admin()`. Live-rule approval/dismissal and worker persistence are RPC-only.
- Every `SECURITY DEFINER` function needs explicit `SET search_path = ''` with
  fully-qualified `public.*` / `auth.*` refs, plus explicit grants/revokes
  (covered by pgTAP).
- `resolve_corridor_rules(origin,destination)` (migration 023) is the single
  deterministic precedence resolver — reuse it, never reimplement precedence.
- Keep the extracted `Database` interface **byte-identical** in
  `mobile/types/database.ts` and `admin/src/types/database.ts`; run
  `bash scripts/check-database-types-sync.sh` after schema/type changes.

## Support AI Edge function (`supabase/functions/support-ai/`)

- Deno. Production is **v5**, JWT-verified; unauthenticated invocation → 401.
- Six-question allowlist is mirrored in mobile, migration 010, and the Edge
  helper; CI (`check-support-questions-sync.sh`) checks all copies.
- **Permanent human takeover**: once a human participates, AI is disqualified
  even after resolve/reopen (`migrations/014`, `humanTakeover.ts`). Intentional
  fail-closed behavior, not a bug.
- Allowlist enforcement is an RLS `WITH CHECK` policy plus narrow column grants,
  **not** a named CHECK constraint. Non-allowlisted inserts fail RLS `42501` →
  HTTP 403.
- `GEMINI_API_KEY` is an Edge secret; never expose it to clients.

## Worker (`worker/`, Python 3.11)

- `preflight.py` accepts only the exact production origin
  (`https://yskknolxbxfxakgvrcmg.supabase.co`), read-only, before installing
  Chromium. Do not broaden it into writes.
- The worker may create PENDING alerts; it must **never** change live rules.
- Challenge/CAPTCHA/empty-body sources stay fail-closed; never bypass.
- Runtime pins `supabase==2.31.0` so modern `sb_secret_` keys work.

## Known backend risk — flag, do not fix without authorization

| Location | Risk |
| --- | --- |
| `migrations/017_admin_bootstrap_trigger.sql` | The `AFTER INSERT` trigger on `auth.users` grants `admin_users` membership from `NEW.email` **without checking `email_confirmed_at`**. If registration to the bootstrap address is possible (confirmation disabled / unclaimed address), that registrant passes `is_admin()` and reaches admin RLS/RPCs. Conditional on hosted auth config — verify before acting. |

## Verify

Use `relogo-verify`: contract scripts, worker `py_compile` + pytest (110 on the
2026-09-14 tree; 106 on committed `0c78e56`), and the Deno fmt/lint/check/test
block (16). DB lint/pgTAP/E2E require Docker and reset local data; never target
a hosted project.

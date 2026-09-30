# ReloGo — Independent Finding Verification Report

- **Date:** 2026-09-14
- **Tree:** branch `tamim` @ `0c78e56` (`main` == `origin/main` == `origin/tamim` == `0c78e56`)
- **Method:** four parallel read-only verification sub-agents; no repository files were
  modified. Local Supabase experiments used `BEGIN; … ROLLBACK;`. Hosted access was
  read-only (`supabase migration list --linked`). No hosted migration, push, deploy,
  credential rotation, or store submission was performed.
- **Purpose:** empirically reproduce or refute each issue raised by the initial
  analysis pass before any fix is attempted.

Environment observed: Docker 29.6.1, local Supabase running (`127.0.0.1:54321`),
Deno 2.9.3, Python 3.11.15, Node v26.5.0, iOS 17-series simulators available.

---

## Reproduced (real)

| # | Finding | Verdict | Evidence |
| --- | --- | --- | --- |
| 1 | Mobile `audit:production` gate red | **REPRODUCED** | `npm run audit:production` exit 1 on repeated runs; `npm audit --omit=dev` reports 8 high. Override `js-yaml@4.3.1` (`mobile/package.json:65`) is still inside advisory range `4.0.0–4.3.1` (GHSA-2883-xcg3-v3hh); fixed `4.3.2` exists. `@xmldom/xmldom 0.8.13` (GHSA-6gmq-8vp8-gcm6 etc.) has fix `0.9.12`. `image-size@1.2.1` and Metro tools also remain. |
| 2 | Landing production audit red | **REPRODUCED** | `npm audit --omit=dev` exit 1: 1 critical + 1 high. `next@16.2.11` RCE (GHSA-p293-qw3h-jr36, GHSA-2xp9-vwfh-vxw4), `sharp@0.35.3` (GHSA-rgj7-g3m4-5g8c). `npm audit fix --dry-run` (not applied) would move to `next 16.3.5`, `sharp 0.35.4`. `next.config.js` sets `output: 'export'` + `images.unoptimized: true`, so the RCE advisories are not runtime-reachable, but the release gate is objectively red. |
| 3 | Worker selects 027-only columns; production is at 026 | **REPRODUCED + hosted confirmed** | `main`/HEAD `worker/preflight.py:52-55` and `worker/main.py:151-155` select `monitor_url, monitoring_mode, manual_review_owner, manual_review_interval_days` (added only by `027_worker_source_monitoring.sql`). `.github/workflows/worker.yml` runs on a `0 2 * * *` cron from the default branch. `supabase migration list --linked` shows production remote at **026; 027 not applied**. Dropping the columns locally then running the worker select produced `ERROR: 42703: column "monitor_url" does not exist` (rolled back). Net effect: the scheduled monitor fails closed and no monitoring runs. **Live monitoring outage.** |
| 4 | Admin bootstrap trusts an unconfirmed email | **REPRODUCED** | `017_admin_bootstrap_trigger.sql:14` grants `admin_users` for `admin@relogo.app`/`admin@relogo.ca` with no `email_confirmed_at` check. Local transaction inserting an unconfirmed `auth.users` row for `admin@relogo.ca` auto-created one `admin_users` membership, then rolled back. `supabase/config.toml:231 enable_confirmations = false`. Exploitability depends on hosted Auth config. |
| 5 | Admin UI renders raw DB errors | **REPRODUCED (static)** | Raw `.message` assigned and rendered: `LoginForm.tsx:26/85`, `AlertsTable.tsx:29,61,84/129`, `WaitlistTable.tsx:32,66/104`, `MessagesTable.tsx:60,116/167`, `ThreadModal.tsx:97,102,175,196,217,239/298`, `EditRuleModal.tsx:41,74/112`, `UserDetailModal.tsx:54/105`, `UsersTable.tsx:64,88/137`. Can surface SQLSTATE/schema/provider detail. |
| 6 | Admin missing-asset fallback serves 200 HTML | **REPRODUCED (live)** | `admin/public/` does not exist; `admin/index.html:5` references `/vite.svg`; `admin/vercel.json` catch-all rewrites to `index.html`. Live `https://relo-go.vercel.app/vite.svg` → `200 text/html`; missing `/assets/does-not-exist-abc123.js` → `200 text/html` instead of 404. |
| 7 | Local `.env` files point at paused preview | **REPRODUCED** | `admin/.env`, `admin/.env.local`, `landing/.env.local`, `mobile/.env` all resolve to `https://uwfblgllkibbupqyofkl.supabase.co`; the production ref `yskknolxbxfxakgvrcmg` appears only in docs/worker. Live check: preview origin curl `000` (no connection), production `401` (alive). Local build/QA trap, not a shipping defect. |
| 8 | Mobile timeout wrappers missing on key flows | **REPRODUCED (source)** | `app/(auth)/reconsent.tsx:63,74` (`accept_current_policies`, `get_policy_consent_state`) unwrapped; `app/(tabs)/profile.tsx:124-136` query lacks `retry:false`/`staleTime`/abort; `app/(tabs)/contact.tsx:117-133`, `:211-252`, `:317-331` (load, send, escalate) unwrapped. Contrast `onboarding.tsx:207-214` and `lib/checklistQueries.ts:30-60`. Can leave spinners unbounded on stalled networks. |
| 9 | F-02 support back returns to Checklist | **REPRODUCED (retained artifacts)** | `app/(tabs)/_layout.tsx:9-34` has no `backBehavior` (defaults to first route = Checklist); `profile.tsx:639` uses `router.push("/(tabs)/contact")`; `contact.tsx:353` uses `router.back()`. Prior run: `qa-artifacts/README.md:119`, `results.json` F-02 = FAIL; screenshot `qa-artifacts/suite-f/F-02/02-CFG-01-…png` shows Checklist. Fresh simulator re-run not performed. |
| 10 | H-02 XXXL Dynamic Type clipping | **REPRODUCED (retained artifacts)** | Zero occurrences of `maxFontSizeMultiplier`/`numberOfLines`/`allowFontScaling` across `app/`, `components/`, `lib/`; fixed 2-column `w-[49%]` question buttons at `contact.tsx:560-583`. Prior run H-02 = FAIL; screenshot `suite-h/H-02/04-CFG-07-…png` shows clipped "Hel" and truncated question labels. |
| 11 | H-03 dark-mode status bar disappears | **REPRODUCED (retained artifacts)** | `app/_layout.tsx:415` `<StatusBar style="auto" />` + `app.json:13 userInterfaceStyle: "automatic"` with hardcoded light UI. Prior run H-03 = FAIL; screenshot `suite-h/H-03/02-CFG-08-…png` shows missing status-bar time/icons. |
| 12 | `errorReporting` misses alphabetic PII | **REPRODUCED (runtime)** | `mobile/lib/errorReporting.ts:46-52` covers emails, 16+ alphanumeric tokens, and 5+ digit runs only. Executed module: `"Jane Doe"`, `"123 Main St"`, `"42 Wellington Street"` pass through unchanged. Defence-in-depth gap, not a live leak. |
| 13 | Support-allowlist CI misses migration-010 drift | **REPRODUCED (runtime)** | `scripts/check-support-questions-sync.sh:12-13` selects only the newest SQL copy via `sort | tail -n 1` → `019_policy_reconsent.sql`. Temp test: drifting the 010 copy → exit 0 (undetected); drifting 019 → exit 1. |
| 14 | Admin pagination de-dup / ordering | **PARTIALLY REPRODUCED** | `UsersTable.tsx:91` appends `[...prev, ...page]` with no seen-set (Alerts/Waitlist/Messages de-dupe); `AlertsTable.tsx:25/57` orders only by `created_at` before `.range()`. |
| 15 | Committed local-demo `service_role` JWT | **REPRODUCED (low risk)** | `TEST_INFRA.md:42`, `tests/e2e/conftest.py:10`, plus `.agents/**`. Decoded claims `iss:supabase-demo`, `role:service_role` — public local CLI default, **no live secret**. |

---

## Refuted — not actual defects (earlier analysis was wrong)

- **Admin reimplements `resolve_corridor_rules()`** → **NOT REPRODUCED.** Migration
  `023_corridor_rule_resolver.sql:149-304` *replaces* `admin_list_users` and
  `admin_get_user_detail` so both call the canonical resolver. A local fixture with a
  task that had an exact `ON/BC` rule plus an `ANY/ANY` rule returned the task exactly
  once from admin detail and `resolve_corridor_rules('ON','BC')` (6 == 6 tasks); the
  superseded 003/021 OR-ANY query would have returned 2. No action needed.
- **pgTAP suite is not idempotent** → **NOT REPRODUCED.** After one
  `supabase db reset --local`, `supabase test db --local supabase/tests/` passed
  207/207 on run 1 and again on run 2. The earlier failure was stale local data.
- **UsersTable non-unique ordering** → **NOT REPRODUCED.** It pages via RPC with
  `ORDER BY u.created_at DESC NULLS LAST, p.id` (unique tiebreaker). Only the
  append/de-dupe half is real.
- **`mobile/lib/account.ts:71` raw error reaches the user** → not rendered. Both callers
  (`profile.tsx:314`, `reconsent.tsx:120`) show generic copy. Hygiene only.

---

## Baselines still green

- Mobile: `npm run lint` clean, `npm run typecheck` clean, `npm test -- --runInBand`
  → **13 suites / 133 tests passed**, `npm run check:release` OK, iOS
  `npx expo export` succeeds (**1,565 modules**; the documented 1,753 is stale for
  this tree).
- Backend (verification pass): cross-app contract scripts OK, worker compile + 106/106
  pytest, Deno fmt/lint/check + 16/16, local pgTAP 207/207 twice, public-schema lint
  clean, all SECURITY DEFINER functions have empty `search_path`, all public tables
  have RLS enabled.
- Web: admin lint/build/audit clean; landing lint/build pass (only its npm audit gate
  is red, item 2).

---

## Recommended fix order (no changes made yet)

1. **Worker / migration 027** (live outage): decide to host 027 or revert the
   default-branch worker to the pre-027 implementation.
2. **Admin bootstrap** confirmation gate (`017`).
3. **Dependency audits**: mobile override/deps, landing `next`/`sharp`.
4. **Admin raw-error sanitization**.
5. **Admin asset fallback + favicon**.
6. **Mobile timeout wrappers** (reconsent, profile, contact).
7. **Mobile UI defects** F-02, H-02, H-03 (optionally re-confirm on simulator first).
8. Minor: `errorReporting` PII patterns, allowlist CI drift check, UsersTable de-dupe,
   Alerts ordering tiebreaker, local `.env` targets, committed local-demo keys.

> Note: this file is a QA evidence artifact, not a canonical roadmap/status/handoff
> document. Product status stays in `docs/PLAN.md`; agent architecture stays in
> `docs/ai/AI_HANDOFF.md`.

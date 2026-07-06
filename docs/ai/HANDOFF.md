# HANDOFF — session log & current state

A running, **append-only** log so the next agent knows what was done, the current
state of the tree, and what to do next. Newest entry on top. For durable rules see
[AGENTS.md](AGENTS.md); for the layout see [PROJECT_MAP.md](PROJECT_MAP.md).

---

## Current state (as of 2026-07-06)

- **Branch:** `tamim` (main branch for PRs is `main`).
- **Builds:** all four apps build clean; mobile now also has a passing unit-test
  suite (`npm test`, 20 tests) that CI runs.
- **Live QA pass done today** (browser + iOS Simulator) — see entry directly below
  for full results. Headline: admin + landing verified working in-browser; mobile
  onboarding verified working in-Simulator; **one real product gap found**
  (waitlist signups are invisible in admin — see that entry); Supabase project
  is currently down/paused, blocking the rest of the end-to-end pass.
- **Uncommitted working-tree changes** (nothing committed yet):
  - Docs: `docs/PROJECT_STATUS.md` + `docs/DEPLOYMENT.md` refreshed; `docs/ai/*` +
    root `AGENTS.md` handoff folder (new).
  - Mobile dependency cleanup: `mobile/package.json` + `mobile/package-lock.json`.
  - Implementation (2026-07-06): worker cron + deadline tests — see entry below.
- **Product stage:** validated MVP codebase; not yet deployed. The remaining work is
  deployment, real corridor content, hardening, and compliance — see
  [PROJECT_STATUS.md](../PROJECT_STATUS.md) “Implementation Map” + “Remaining to reach 100%”.

---

## 2026-07-06 — Claude (Sonnet 5): live QA pass (browser + Simulator) — one real gap found

Manual, hands-on QA of the `tamim` branch as a user would experience it — not just
`tsc`/build checks. Used Chrome (via the claude-in-chrome MCP) for admin + landing,
and the iOS Simulator (via computer-use) for mobile. Supabase project was paused
for most of this session (free-tier auto-pause after inactivity — not a billing
issue, see note below), so real data round-trips could not be fully verified;
everything below is what **could** be confirmed with the information available.

**Admin dashboard (`localhost:5174`) — clean.** Login screen renders correctly.
Submitted a real login attempt against placeholder Supabase creds: failed with a
clean inline "Failed to fetch", caught in `LoginForm.tsx`, no crash. Console had no
unexpected errors.

**Landing page (`localhost:3000`) — clean.** Hero, both province `<select>`s (all
13 provinces/territories present), and the waitlist form all render and function.
HTML5 required-field validation blocks empty submits. A real submit attempt against
placeholder creds fails with a friendly inline message and **zero console errors**
— `WaitlistForm.tsx` catches the Supabase error more cleanly than admin's LoginForm
does.

**Real gap found — waitlist signups never reach the admin dashboard.** Traced the
full path in both directions:
- `landing/components/WaitlistForm.tsx` → RPC `join_waitlist()` → inserts into
  `public.waitlist` (`supabase/migrations/002_hardening_and_user_deletion.sql:323-338`).
- `admin/src/components/UsersTable.tsx` calls `admin_list_users()`
  (`003_admin_user_views.sql:46-108`), which joins `user_profiles` + `auth.users` —
  **a completely different table**, populated only by mobile onboarding, not the
  landing waitlist.
- There is no admin UI tab, and no admin RPC, that reads `waitlist` at all. RLS on
  that table (`001_init.sql:265-268`) only grants SELECT to `service_role`, so even
  a naive `supabase.from("waitlist").select()` from the admin app would be blocked
  by RLS as-is.
- **Net effect: a landing-page signup is currently invisible everywhere in the
  product.** The only way to see it today is a direct Supabase Studio query or a
  service-role script. If a "Waitlist" admin tab is wanted, it needs a new
  `admin_list_waitlist()`-style `SECURITY DEFINER` RPC (mirroring the
  `admin_list_users()` pattern) — a normal `is_admin()`-gated client query won't
  work against current RLS.

**Support chat flow (mobile ↔ admin) — traced, looks correct, one minor gap.**
`contact.tsx` → `support_threads`/`support_messages` (RLS + Realtime both
correctly configured in `004_support_messages.sql`) → `MessagesTable.tsx` /
`ThreadModal.tsx` read the same tables, same column names, no type drift between
`mobile/types/database.ts` and `admin/src/types/database.ts`. Minor gap:
`MessagesTable.tsx` (the inbox list) has no Realtime subscription — only
`ThreadModal.tsx` (an open thread) does — so a brand-new thread won't appear in the
admin inbox until a manual refresh, even though the DB/Realtime plumbing fully
supports pushing it live. Small, cheap fix if wanted: add the same subscription
pattern `ThreadModal.tsx` already uses to `MessagesTable.tsx`'s mount effect.

**Mobile (iOS Simulator) — onboarding verified working, blocked past that point.**
Note: Expo Go on a physical phone **cannot** run this project — Expo Go always
auto-updates to the latest SDK (currently 54) and can only run projects on that
exact SDK; this project is pinned to SDK 51. The iOS Simulator has no such
restriction and is the correct way to run this project locally today. Hit and
fixed one real issue along the way, independently of the `overrides` fix noted in
the entry below: a stale Metro/Haste cache (from `node_modules` having been
installed under a different Node version at some point) caused the same class of
`SyntaxError: Missing semicolon` in `react-native/index.js` that the entry below
also describes. Fixed with `rm -rf node_modules && rm -rf $TMPDIR/metro-*
$TMPDIR/haste-map-*` + clean `npm install` + `npx expo start --clear`. **If this
recurs, check `mobile/package.json` still has the `overrides.react-native` pin
(entry below) before assuming it's a cache issue again** — that's the more likely
root cause for anyone hitting this fresh.

Once fixed, onboarding rendered exactly as coded: origin/destination province
pickers (hand-rolled dropdowns, all provinces present), move-date field, two
toggles, submit button. Submitting correctly triggers `signInAnonymously()` and,
against a dead/placeholder Supabase config, fails with a clean native `Alert`
("Network request failed") — no crash. **Could not test past onboarding**
(checklist, profile, contact/support chat, PDF fill, delete-account) because that
requires a live, reachable Supabase project with real anon credentials, which
wasn't available this session.

**Supabase pause is not a billing problem.** The user saw a paused-project screen
and asked whether to move to Firebase over cost concerns. Confirmed via current
Supabase pricing: Free tier is $0/month indefinitely; the only free-tier catch is
auto-pause after ~1 week of inactivity, which "Resume project" clears with no
charge. Recommended staying on Supabase — this schema is fully relational
(migrations, RLS, Postgres RPCs throughout); moving to Firestore would be a full
backend rewrite to solve a problem a free "Resume" click already solves.

**Not done / blocked on Supabase being reachable again:**
- Wire real (non-placeholder) `EXPO_PUBLIC_SUPABASE_*` / `VITE_SUPABASE_*` /
  `NEXT_PUBLIC_SUPABASE_*` env vars and re-run: real waitlist signup → confirm
  where (if anywhere) it surfaces in admin; real admin login; mobile onboarding →
  checklist → profile → contact/support-chat end-to-end, including the AI-reply
  path in `support-ai`.
- Decide whether to build the missing admin "Waitlist" view (needs a new
  `SECURITY DEFINER` RPC, see above) or leave waitlist signups as
  Studio/service-role-only for now.

---

## 2026-07-06 — Claude (Opus 4.8): worker cron + deadline-logic tests

First implementation pass from the Implementation Map — the two zero-decision,
parallel-safe "quick wins" (additive; no user-facing behavior change).

**1. Deadline-logic unit tests (was: zero test coverage).**
- Extracted the 5 date helpers (`parseISODate`, `addDays`, `toISODate`,
  `startOfToday`, `formatDeadline`) — inlined in `checklist.tsx` and duplicated in
  `profile.tsx` — into a shared, framework-free `mobile/lib/dateHelpers.ts`. Both
  screens now import them; behavior is byte-equivalent (adversarially verified).
- Added a jest + ts-jest harness (`mobile/jest.config.js`, a `test` script, and
  `jest`/`ts-jest`/`@types/jest` devDeps) and
  `mobile/__tests__/lib/dateHelpers.test.ts` — 20 tests covering the deadline
  pipeline and the timezone off-by-one guard (round-trip stability across leap day
  + both DST switches). `mobile/tsconfig.json` excludes `__tests__` from the app
  typecheck; ts-jest type-checks the tests instead.
- New CI job `mobile-test` (`.github/workflows/ci.yml`) runs `npm test`.

**2. Worker cron (was: no worker host wired).**
- `.github/workflows/worker.yml` — a free daily GitHub Actions cron (`0 2 * * *`)
  + manual `workflow_dispatch` that runs `python worker/main.py`, installing
  Chromium via `playwright install --with-deps`. Env var names verified against
  `worker/main.py`.

**3. Worker unit tests (was: zero worker test coverage).**
- Extracted `sha256` + a new pure `classify_change` (baseline / unchanged /
  changed — the alert-or-not decision) out of `worker/main.py` into
  `worker/changedetect.py`; `main.py` now uses it (behavior-equivalent, verified).
- `worker/tests/test_changedetect.py` (14 pytest cases), `worker/conftest.py`
  (sys.path), `worker/requirements-dev.txt` (pytest, test-only), and a `worker-test`
  CI job. Tests import only stdlib, so CI installs just pytest (no playwright/supabase).

**Verification:** `tsc --noEmit` clean; `npm test` 20/20; `pytest` 14/14; worker
`py_compile` clean; clean `npm ci` in sync; all workflow YAMLs parse; three
adversarial reviewers (mobile refactor-equivalence, CI/runtime, worker
refactor-equivalence) returned **clean**.

**Action required by a human (not code):** set two GitHub repo secrets for the
worker cron — `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` (Settings → Secrets
and variables → Actions). Until then the scheduled run exits 1 by design.

**Follow-up fix (same day): Metro bundle broke, now fixed.** Regenerating the
lockfile during the dep work let npm resolve a transitive `"react-native": "*"`
range to the **latest** RN (0.86.0), nested at
`node_modules/react-native/node_modules/react-native`. Expo SDK 51 (RN 0.74.5)
can't parse its `index.js` → `SyntaxError: Missing semicolon` during Metro
bundling (CI never caught it — CI runs `tsc`, never an actual bundle). Fixed with
an npm **`overrides: { "react-native": "0.74.5" }`** in `mobile/package.json` +
a clean lockfile regen. **Do not remove that override** — it's what stops a
future `npm install` from re-nesting a newer react-native. Verified with a full
`npx expo export` (1725 modules bundled clean).

---

## 2026-07-05 — Claude (Opus 4.8): mobile dependency cleanup + AI handoff folder

**Trigger.** A manual QA pass: four clean builds, no blocking bugs, and two real
dependency issues in `mobile/` (both fixed below).

**What I changed (mobile dependency fixes):**
- Removed **`react-native-picker-select`** from `mobile/package.json`. It was
  completely unused (verified: zero references across all mobile source files — the
  province dropdown is a hand-rolled `TouchableOpacity` picker; dates use
  `@react-native-community/datetimepicker`). Removing it kills the missing
  `@react-native-picker/picker` peer-dependency warning **at the root** instead of
  installing another native module the app never uses.
- Removed **`@types/react-native`** (`~0.73.0`) from `devDependencies`. React Native
  ships its own types since 0.71, and this app is on `react-native@0.74.5`, so the
  package was redundant **and** version-skewed (0.73 stubs vs 0.74 runtime).
- Regenerated `mobile/package-lock.json` via `npm install` (−20 packages; −53 lock lines).

**Verification (all green):**
- `npx tsc --noEmit` clean after `npm install`.
- `rm -rf node_modules && npm ci` succeeded (proves `package.json` + lockfile are in
  sync — the exact thing CI's `npm ci` enforces), then `npx tsc --noEmit` clean again.
- No references to either package remain in mobile source, `package.json`, or the lockfile.

**Also added:** this `docs/ai/` handoff folder (`AGENTS.md`, `PROJECT_MAP.md`,
`HANDOFF.md`) and a thin root `AGENTS.md` pointer, so future agents have a single
place to get oriented.

**Not done (left for a human/next agent):**
- The mobile dep change and this folder are **uncommitted**. Suggested next step:
  commit them (e.g. `git add mobile/package.json mobile/package-lock.json docs/ai AGENTS.md`)
  on `tamim`, then open a PR to `main`.

---

## Recommended cleanups (flagged, NOT yet done)

These are stray tracked files / clutter — safe, reversible fixes. Left undone
because they change git state and were out of scope for the dependency fix. Do them
in a small dedicated commit:

1. **`.DS_Store` is tracked** at the repo root even though `.gitignore` lists it.
   ```bash
   git rm --cached .DS_Store
   ```
2. **`supabase/.temp/` is tracked** — Supabase CLI local state (`linked-project.json`,
   `project-ref`, tool versions). It shouldn't be committed.
   ```bash
   git rm -r --cached supabase/.temp
   echo "supabase/.temp/" >> .gitignore
   ```
3. **`admin/vite.config.ts.timestamp-*.mjs` is tracked** — a Vite scratch file.
   ```bash
   git rm --cached admin/vite.config.ts.timestamp-*.mjs
   echo "vite.config.ts.timestamp-*" >> admin/.gitignore   # (create admin/.gitignore if absent)
   ```
4. **Duplicate root Expo config** — root `app.json`/`eas.json` duplicate the
   authoritative `mobile/` copies. Confirm nothing builds from root, then consider
   removing the root pair to avoid confusion.

## Doc freshness note

**Resolved 2026-07-06.** Both [PROJECT_STATUS.md](../PROJECT_STATUS.md) and
[DEPLOYMENT.md](../DEPLOYMENT.md) were refreshed to match reality: support chat
(migrations `004`/`005`, `contact.tsx`, admin **Messages** tab, the `support-ai`
Edge Function) is now documented; corridor coverage corrected to all 13
provinces/territories; infra status updated (Supabase project already linked);
DEPLOYMENT gained a "0. Order of operations" runbook + the free GitHub Actions
worker option; and PROJECT_STATUS gained an ordered **Implementation Map**. Keep
both current as features land.

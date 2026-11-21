---
name: relogo-verify
description: Use when verifying, testing, linting, typechecking, building, or QA-ing any part of the ReloGo monorepo (mobile Expo app, landing Next.js site, admin Vite dashboard, Python worker, Supabase migrations/Edge functions). Covers the exact per-app commands, cross-app contract scripts, environment caveats, and currently-red checks.
---

# ReloGo verification

**Purpose** — run the right checks for a change and report exact results.
**Source of truth** — `docs/ai/AI_HANDOFF.md` → "Verification matrix".
**Related** — `relogo-mobile` · `relogo-backend` · `relogo-release-qa`.

> **Current-tree notice (2026-11-16):** The simplified mobile MVP has not been
> built or released. Older green counts below refer to earlier trees; several
> mobile feature tests were removed with the retired account/PDF/date code, so
> do not treat those counts as current evidence. Read the current handoff and
> verify the exact changed tree before any release decision.

## Fast facts

| Topic | Value |
| --- | --- |
| CI / release Node | **22** (local may be newer; a green Node-26 run is not CI proof) |
| Python | **3.11** (`python3.11`) |
| Dependencies | `mobile/`, `admin/`, `landing/` `node_modules` already present — run scripts directly, avoid slow `npm ci` unless required |
| DB checks | require Docker; `supabase db reset` and `tests/e2e` **destroy local data** |
| Never | apply migrations, push, deploy, rotate credentials, or submit store builds without explicit authorization |

## Commands

```bash
# Cross-app contracts — repo root; run after schema/type/support/consent changes
bash scripts/check-database-types-sync.sh
bash scripts/check-support-questions-sync.sh
bash scripts/check-consent-version-sync.sh
git diff --check
```

```bash
# mobile/            admin/                landing/
npm run check:release   npm run lint        npm run lint
npx expo install --check npm run build      npm run build     # next build --webpack
npm run lint            npm audit --omit=dev npm audit --omit=dev
npm run typecheck
npm test -- --runInBand
npm run audit:production
npx expo export --platform ios     --output-dir /tmp/relogo-ios-check     --clear
npx expo export --platform android --output-dir /tmp/relogo-android-check --clear
```

```bash
# worker/  (Python 3.11)
python3.11 -m py_compile main.py changedetect.py reporting.py preflight.py
python3.11 -m pytest

# supabase/functions/support-ai/  (Deno; repo root)
deno fmt --check supabase/functions/support-ai
deno lint supabase/functions/support-ai
deno check --config supabase/functions/support-ai/deno.json supabase/functions/support-ai/index.ts
deno test  --config supabase/functions/support-ai/deno.json \
  supabase/functions/support-ai/geminiTransport_test.ts \
  supabase/functions/support-ai/grounding_test.ts \
  supabase/functions/support-ai/humanTakeover_test.ts \
  supabase/functions/support-ai/supportQuestions_test.ts
```

```bash
# Database (Docker required; resets local data)
supabase start
supabase db reset --local
supabase db lint --local --schema public --level warning --fail-on warning
supabase test db --local supabase/tests/            # pgTAP

# Local Supabase API E2E (resets local DB; never point at hosted)
python3.11 -m pip install -r tests/e2e/requirements.txt
python3.11 -m pytest tests/e2e/ --strict-markers -ra
```

## Expected green results

| Check | Expected |
| --- | --- |
| mobile Jest | Historical only: 16 suites / 178 tests (merged recovery tree, verified 2026-10-16); current simplified tree has not been run or recounted |
| worker pytest | 110 tests (merged recovery tree); earlier: 106 on `0c78e56` |
| Deno tests | 16 tests |
| contract scripts | all `OK:` |
| mobile exports | historical: iOS 1,569 · Android 1,590 modules (`fff31da`); 1,753/1,774 (`0c78e56`). Rerun for the SDK 57 tree |

## Audit gates (history and current state)

Both production-audit failures below were found on base `0c78e56` and are
fixed in `fff31da`. The merged recovery tree was re-verified on 2026-10-16
(`check:release` and `audit:production` both pass); rerun both audits on any
final tree.

| Check | Base `0c78e56` | Fix in `fff31da` |
| --- | --- | --- |
| `mobile` → `npm run audit:production` | **FAIL (exit 1)** | 8 high names outside the build-tool allowlist (`@expo/xcpretty`, `@istanbuljs/load-nyc-config`, `@xmldom/xmldom`, `js-yaml` 4.3.1). Fixed with js-yaml 4.3.2, XML 0.8.15/0.9.12, and scoped Metro 0.83.8; final audit 0 high/critical, 8 moderate. |
| `landing` → `npm audit --omit=dev` | **FAIL (exit 1)** | 1 critical + 1 high (`next@16.2.11` RCE advisories GHSA-p293-qw3h-jr36 / GHSA-2xp9-vwfh-vxw4, transitive `sharp@0.35.3`). Fixed with Next 16.3.5 + sharp 0.35.4; final audit 0. |

Still unverified on that tree: a fresh simulator/device visual pass, a
reset-based API E2E rerun, production 027/028 rollout, and the admin/web
deploys.

**2026-10-05 advisory regression — resolved 2026-10-10 (merged in PR #7):**
the mobile production audit went **red** on `braces` GHSA-vfj7-8cjw-p6xm
(affected `<=3.0.3`, **no patched release**) and `node-forge`
GHSA-86w9-cpqp-85rv, both build/test-only transitive paths. It now **passes**
with a narrowly scoped, owner-approved, time-boxed exception list in
`mobile/scripts/production-audit-policy.js` (exact GHSA + package match;
criticals never excepted; re-review by 2026-12-01). Do not weaken or bypass
the gate further; remove each exception when an upstream patch ships. Landing
is green after a `next@16.3.8` lockfile refresh within `^16.3.5` (critical
GHSA-vcvr-r3jv-pc5j cleared).

## Rules

- Report observations; do not fix while "verifying" unless asked.
- Treat old green results as stale — rerun on the final tree.
- Never run `supabase config push` (committed localhost Auth URLs).

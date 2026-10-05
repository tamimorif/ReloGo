# ReloGo — verified fixes, 2026-09-14

> **Superseded (2026-09-29):** these fixes were subsequently committed in
> `fff31da` (branch `tamim`; the local tip is now `3d156ec`, two commits ahead
> of `main` at `0c78e56` and unpushed). This file
> remains the historical evidence for that verification tree, not a statement of
> the current working tree.

Scope: uncommitted working changes based on `tamim` at `0c78e56`.
The original verification report and pre-existing README/QA edits were preserved.
Each finding was checked before its fix; historical screenshots are identified
separately from current runtime evidence. No hosted migration, deployment, push,
credential rotation, or store submission was performed.

## Finding-by-finding evidence

| Report item | Fresh verification and result |
| --- | --- |
| 1. Mobile audit | Reproduced 8 high and 8 moderate production findings. Patched js-yaml to 4.3.2 and compatible XML paths to 0.8.15/0.9.12. Scoped React Native community CLI Metro/config 0.83.8 matches Expo and removes image-size. Final audit: **0 high/critical, 8 moderate**. The old image-size exception is removed; CI rejects all high/critical findings. |
| 2. Landing audit | Reproduced 1 critical + 1 high. Next 16.3.5, matching ESLint config, and Sharp 0.35.4 installed with updated lockfile. Final production audit: **0 vulnerabilities**. Static export and unoptimized images were confirmed; an audit finding is not proof that this static site exposes the server exploit. |
| 3. Worker schema mismatch | Fresh production reads show ledger 001–026 and zero 027 monitoring columns. Local rollback-only experiment reproduced SQLSTATE 42703. GitHub `main` already contains the coordinated worker, correcting stale handoff wording. Added safe, specific readiness errors without unsafe fallback. **Production monitoring remains blocked until authorized migration 027 rollout.** |
| 4. Admin bootstrap | Local unconfirmed signup created membership; new regression suite failed 9/14 before the fix. New migration **028** retires email-based grants entirely, because a confirmation check alone is bypassed by Auth auto-confirmation. Existing access remains intact. Read-only production audit: one membership, zero unconfirmed memberships. **028 is verified locally and not hosted.** |
| 5. Admin raw errors | Actual component callbacks now show authored action-specific recovery messages. Synthetic provider errors containing private details do not reach displayed state. New admin suite fails all 15 checks against untouched HEAD and passes after fixes. |
| 6. Admin missing assets | Fresh live requests reproduced 200 HTML for `/vite.svg` and missing `/assets/*.js`. Added a real favicon and removed the unnecessary catch-all; the app uses only `/` and state-selected views. Built artifact serves homepage/favicon 200 and missing assets 404. **Production routing awaits deployment and an HTTP recheck.** |
| 7. Paused local preview | Confirmed three app configurations point at deliberate paused preview. Current `admin/.env.local` has no Supabase URL and inherits `.env`, so that detail in the report was inaccurate. Added `scripts/run-local-app.py` to launch against local Supabase with process-only public environment overrides. Original ignored files remain intact; the launcher rejects hosted URLs and server keys. Real admin launch verified local origin and neither hosted ref. |
| 8. Mobile network bounds | Confirmed unbounded re-consent, profile and support paths. Implemented shared bounded profile queries, one acceptance/confirmation deadline, abortable support requests, and cancellation/late-result guards. Fresh adversarial runtime tests exercise stalled operations. Lost-response failures require a successful conversation refresh before further writes; subscription activation reconciles replies missed before Realtime connected. |
| 9. Support Back | Existing tab configuration defaults to the first route; retained F-02 screenshot shows Checklist. Tabs now use history so Back follows the originating tab. Fresh device-navigation evidence is recorded below separately. |
| 10. XXXL text | Inspected retained H-02 screenshots showing clipping. Missing `maxFontSizeMultiplier` alone was not proof of a defect. Support now uses full-width questions at large font scales, flexible header/action text, natural line height and a scrollable question area; text scaling remains enabled. Fresh device-layout evidence is recorded below separately. |
| 11. Dark status bar | Retained H-03 screenshot and source confirmed automatic status-bar style on a hardcoded light UI. App appearance now explicitly stays light, with dark status-bar icons on light screens and light icons over the blue Auth/Profile headers; recovery screens use dark icons. Fresh device-appearance evidence is recorded below separately. |
| 12. Alphabetic PII in errors | Fresh regression cases failed against original name/address handling. Reporter now discards arbitrary error content, custom names, stacks and unknown contexts; built-in error categories and fixed metadata remain. Tests cover Unicode names, addresses, hostile getters, proxies and the global handler. |
| 13. Allowlist CI drift | In a disposable copy, changing migration 010 still returned exit 0 before the fix. Checker now validates both deployed copies and newly marked migrations, and fails on missing markers. Four adversarial tests pass and run in CI. |
| 14. Pagination | Confirmed user-page append lacked de-duplication and alert ordering lacked a unique tiebreaker. User pagination now tracks consumed server rows separately from visible unique rows. Alert queries order by timestamp and ID. User RPC ordering was already deterministic and remains unchanged. |
| 15. Local demo key | Confirmed public Supabase local-development JWT claims (`supabase-demo`, `service_role`). This is **not a live credential leak**; no production key rotation or historical-file churn was warranted. |

## Backend rollout rehearsal

Local transactions rehearsed a 026-shaped schema through unchanged migration 027
and new 028: nine replacement automatic rows, two manual assignments, exactly
11 baseline resets with 42 other rows preserved, unchanged public government
URLs/live rules, and retained explicit admin membership. All experiments rolled
back and left no fixtures. All nine replacement rows (eight distinct URLs)
passed fresh worker-equivalent fetch/content checks without persistence. The
complete pgTAP suite passed **221/221 twice** with 028 applied inside rollback-only
transactions. Direct `plpgsql_check` lint found zero issues across 16 public
PL/pgSQL routine/trigger combinations after 028.

Production target remains explicitly `yskknolxbxfxakgvrcmg`, ledger 001–026.
After authorization: apply 027 then 028, verify ledger/grants/manual assignments
and retained admin access, run the coordinated `main` worker, and inspect its
actual result. A successful local rehearsal does not repair a live outage.

## Final local checks

Checks used Node 22 for the JavaScript apps and Python 3.11 for worker/database
orchestration. They cover this uncommitted working tree, not a hosted deployment.

| Check | Result |
| --- | --- |
| Mobile clean `npm ci`, release contract, online Expo dependency alignment | Pass |
| Mobile lint / TypeScript | Pass; zero lint warnings/errors |
| Final iOS / Android Hermes exports | Pass after the final runtime edit: **1,569 / 1,590 modules** |
| Mobile Jest | **15 suites / 161 tests passed** |
| Mobile production audit | Pass under strict high/critical gate; **8 moderate, 0 high, 0 critical** |
| Admin lint / production build | Pass; one pre-existing lint warning, zero errors |
| Admin callback regressions | **15/15 passed**; all 15 fail against original HEAD |
| Admin production audit | **0 vulnerabilities** |
| Landing clean `npm ci`, lint / production static export | Pass, Next 16.3.5 |
| Landing production audit | **0 vulnerabilities** |
| Worker Python compile / pytest | **110/110 passed** |
| Database pgTAP with rollback-only 028 | **221/221 passed twice** |
| Transactional public PL/pgSQL lint after 028 | **0 findings / 16 routine/trigger combinations** |
| Deno format/lint/typecheck / support tests | Pass; **16/16 tests** |
| Support allowlist adversarial gate tests | **4/4 passed** |
| Local development launcher tests | **6/6 passed**, plus actual local admin launch |
| Database type / consent / support contracts; shell syntax; diff whitespace | Pass |

The support suite also covers lost write responses, required authoritative
recovery, Realtime snapshot/message merges, newer status events and out-of-order
reconnect success/failure. Startup console errors now use the same sanitizer.

## Verification boundaries

- No new simulator UI pass: the existing simulator boot/open flow reported a
  shutdown device and the computer-use Simulator call stalled/timed out. The
  retained F-02/H-02/H-03 screenshots demonstrate the old defects; source changes
  and native exports do not certify the final appearance or physical-device UX.
- No reset-based full API E2E run was performed, to preserve existing local data.
  The database migration/security suite ran transactionally twice instead.
- Native export checks use the saved preview public configuration and are
  compilation evidence, not production release artifacts. The local-development
  launcher was separately exercised against local Supabase.
- The report's refuted canonical-resolver/unique-user-ordering claims remain
  refuted; their SQL paths were inspected and the resolver pgTAP suite passed.
  Account-operation callers still show generic errors.
- The production worker outage and hosted signup-trigger exposure remain until
  approved migrations are applied. Hosted web behavior remains until deployment.
  No local test is presented as proof of those hosted fixes.

## Dependency patch references

The compatible XML 0.8.15 release fixes the reported issues while preserving
its existing parser API. See the [maintainer release notes](https://github.com/xmldom/xmldom/releases/tag/0.8.15).
The js-yaml vulnerability excludes patched 4.3.2; see the
[maintainer advisory](https://github.com/nodeca/js-yaml/security/advisories/GHSA-2883-xcg3-v3hh).
The admin routing change follows [Vercel's Vite routing guidance](https://vercel.com/docs/frameworks/frontend/vite).

The matching Metro update removes the former image parser dependency; see
[Metro 0.83.8 release notes](https://github.com/react/metro/releases/tag/v0.83.8).

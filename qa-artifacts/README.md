# ReloGo local visual QA — 2026-09-13

Testing was stopped at the user's request. This is a partial evidence record, not a release sign-off. The [canonical playbook](../docs/QA_TEST_PLAYBOOK.md) remains the test specification; [PLAN.md](../docs/PLAN.md) remains the product roadmap.

The ledger contains 121 tests and 8 gates: **63 PASS, 11 FAIL, 55 BLOCKED**. Gate results are included in these counts. The ten failed test IDs include repeated evidence of one issue and five playbook discrepancies; they are not ten separate application defects.

PASS applies to the observed configuration and scope stated in each row. FAIL means an exercised assertion did not match, including documented playbook discrepancies. BLOCKED means a required assertion or prerequisite was unverified, or the test was not executed before the stop request. Earlier provisional passes with missing evidence were narrowed during report review; no additional app tests were run during cleanup.

## Environment and coverage

- Commit `0c78e56a245a260ba08b1a60606ac02b668c31ef`, branch `tamim`. Existing README, documentation-index and playbook changes were preserved. Application code, migrations, dependency files and environment files were not changed for this run.
- Local Supabase at `127.0.0.1:54321`, migrations 001–027. Reset succeeded on retry. Existing dependencies ran under Node 26.5; a fresh Node 22 dependency installation was not validated. Local PostgreSQL reported 17.6, rather than the playbook's version 15.
- iPhone 16 Pro simulator with iOS 26.5 and Expo Go; this cannot certify standalone splash timing, packaging or the `relogo://` scheme. Baseline and selected XXXL/dark states were inspected. The compact-device attempt did not finish. No Android virtual device was configured.
- Local Chrome admin screenshots were 1440×778, not a completed 1440×900 matrix. The repository's admin default used port 5174, so the run supplied port 5173 explicitly. The documented admin account was absent after reset and was created only in the local test backend.
- Suites A–G were exercised with the gaps below; H was partial. Admin support actions were used during Suite F, so those L observations occurred before a complete H–K sweep. Suites I, J, K and M were not completed in the requested order. B-13 incidentally covered local Privacy/Terms links.
- No provider key was available for genuine local AI replies. Human escalation, fallback, admin replies and resolved states were observed. No real personal information was entered. No PDF button or free-text support input was expected.

## Findings to review

| Test IDs | Observation | Interpretation |
| --- | --- | --- |
| F-02 | Support back chevron returned to Checklist after entering from Profile. | Navigation defect against the specified return destination. |
| H-02 | XXXL clipped Profile/Help headings and several action/question labels. | Accessibility/layout defect in the observed live font setting; other devices and relaunch persistence unverified. |
| H-03 | Light app colors remained, but system status-bar text/icons disappeared against the light background in Dark Mode. | Contrast defect; the app is expected to remain light. |
| A-06, G-03 | Expo Go LogBox displayed internal profile-timeout diagnostics beside the friendly recovery UI. | Development-run sanitization failure; release behavior unverified. No real PII disclosure was demonstrated. |
| D-03 | The 30-day-old D4 move fixture did not produce overdue tasks against a 60-day licence deadline. | Fixture discrepancy. A 90-day-old fixture demonstrated overdue styling in D-04. |
| D-18 | Vehicle=false omitted registration but kept the licence task. | Eligibility assertion differs from observed rules; confirm product intent before changing code. |
| F-11 | A resolved thread with human participation reopened as awaiting human. | Playbook expects AI, but the result matches the permanent human-takeover safety design. |
| G-04 | Arbitrary support text was rejected with HTTP 403/RLS; the named CHECK constraint was absent. | Enforcement mechanism differs from the playbook; arbitrary text was still blocked. The API error was diagnostic evidence, not an on-screen leak. |
| L-10 | Row click opened the thread; working buttons used Take over / Mark resolved / Send. | Labels and entry control differ from the playbook. Reply and resolution worked. |
| E-05/E-06 | iOS offered strong-password generation for identifier inputs. | Additional usability observation; no password saving or upload is claimed. |

## Privacy evidence

At both checkpoints, database dumps of `postgres` and `_supabase` were scanned in memory for each of the five dummy fixtures, with zero matches. Saved values reappeared after relaunch, and fresh-session fields were empty after profile sign-out/deletion. These checks cover the exercised fixtures; direct encrypted SecureStore key enumeration was unavailable. The empty metadata output was removed rather than retained as proof.

- [First database scan](suite-e/E-06/backend-privacy.json)
- [Second database scan](suite-g/G-01/backend-scan.json)
- [Account deletion counts](suite-e/E-11/backend-deletion.txt)
- [Arbitrary-message rejection](suite-g/G-04/api-result.json)

## Evidence and cleanup

All 203 original step screenshots are kept under `suite-<letter>/<test-id>/`. Repeated images are retained when they belong to different tests or document timeout timing. One H-02 filename was corrected from CFG-01 to CFG-07 to match the XXXL setting used during capture. Links in the table point to representative visual evidence and the complete per-test folder; related evidence does not imply that an unexecuted test passed. The [JSON ledger](results.json) lists every retained evidence file for each test.

Removed 16 temporary files: startup/debug logs, capture/privacy helper scripts, the restored-fixture SQL backup, and empty manifest/keychain outputs. Kept concise backend counts and the deep-link/sanitizer outputs; the latter were renamed from `.log` to `.txt` so the repository's log ignore rule will not hide this evidence. Temporary test dev servers were stopped and the three disposable QA simulators were removed. The original checklist-rule fixture was restored before cleanup. Local Supabase was stopped with its local data preserved. No production backend changes were made.

## Test results

| Test ID | Description | Result (PASS/FAIL/BLOCKED) | Visual Evidence Path | Notes / Defects Found |
| --- | --- | --- | --- | --- |
| A-01 | Native splash and cold launch | BLOCKED | [Screenshot](suite-a/A-01/03-CFG-01-onboarding.png) · [steps](suite-a/A-01/) | Expo Go loader captured; standalone native splash and 300ms/3s launch timing cannot be certified from this development runner. |
| A-02 | Missing configuration recovery | PASS | [Screenshot](suite-a/A-02/01-CFG-01-missing-config.png) · [steps](suite-a/A-02/) | Missing config shows exact controlled recovery copy. |
| A-03 | Malformed configuration recovery | PASS | [Screenshot](suite-a/A-03/01-CFG-01-malformed-config.png) · [steps](suite-a/A-03/) | Malformed origin shows exact controlled recovery copy. |
| A-04 | Session timeout | BLOCKED | — (not captured) | Session-specific timeout requires an expired/stalled session fixture; current unexpired session restores locally and reaches profile timeout. |
| A-05 | Retry session restoration | BLOCKED | — (not captured) | A-04 session-error prerequisite not established. |
| A-06 | Profile timeout and recovery | FAIL | [Screenshot](suite-a/A-06/11-CFG-01-2026-09-14T03-10-29.656Z.png) · [steps](suite-a/A-06/) | Recovery copy and retry appear, but Expo Go LogBox exposes internal Profile check failed: Error: Startup operation timed out. Development-run error sanitization defect; release behavior unverified. |
| A-07 | Retry profile loading | PASS | [Screenshot](suite-a/A-07/01-CFG-01-2026-09-14T03-10-44.608Z.png) · [steps](suite-a/A-07/) | Restoring local REST service and Retry returns to checklist. |
| A-08 | Render error boundary | BLOCKED | — (not captured) | No source-free render-crash injection fixture available; app source preserved. |
| B-01 | Onboarding defaults | PASS | [Screenshot](suite-b/B-01/01-CFG-01-20260914T030257Z.png) · [steps](suite-b/B-01/) | Expected defaults, grey submit, empty pickers, unchecked consent, both switches off. |
| B-02 | Province list and scrolling | BLOCKED | [Screenshot](suite-b/B-02/01-CFG-01-20260914T030315Z.png) · [steps](suite-b/B-02/) | All 13 ordered options and bounded list observed; smooth nested scrolling not established by automation. |
| B-03 | Mutually exclusive pickers | PASS | [Screenshot](suite-b/B-03/01-CFG-01-20260914T030349Z.png) · [steps](suite-b/B-03/) | Pickers are mutually exclusive. |
| B-04 | Change province selection | PASS | [Screenshot](suite-b/B-04/02-CFG-01-20260914T030424Z.png) · [steps](suite-b/B-04/) | Ontario selection changes to Alberta and collapses. |
| B-05 | Date picker and past dates | PASS | [Screenshot](suite-b/B-05/01-CFG-01-20260914T030437Z.png) · [steps](suite-b/B-05/) | Inline iOS calendar; dates before Sep 13 disabled. |
| B-06 | Missing origin alert | PASS | [Screenshot](suite-b/B-06/01-CFG-01-20260914T030513Z.png) · [steps](suite-b/B-06/) | Exact missing-origin alert. |
| B-07 | Missing destination alert | PASS | [Screenshot](suite-b/B-07/01-CFG-01-20260914T030606Z.png) · [steps](suite-b/B-07/) | Exact missing-destination alert. |
| B-08 | Destination-only validation | PASS | [Screenshot](suite-b/B-08/03-CFG-01-2026-09-14T03-06-45.575Z.png) · [steps](suite-b/B-08/) | Destination-only form produces missing-origin alert. |
| B-09 | Same-jurisdiction validation | PASS | [Screenshot](suite-b/B-09/05-CFG-01-2026-09-14T03-07-19.836Z.png) · [steps](suite-b/B-09/) | ON to ON rejected with exact copy. |
| B-10 | Consent gate and zero account creation | PASS | [Screenshot](suite-b/B-10/05-CFG-01-2026-09-14T03-07-47.283Z.png) · [steps](suite-b/B-10/) | Exact consent alert; auth users=0, profiles=0 verified. |
| B-11 | Enable consent | PASS | [Screenshot](suite-b/B-11/01-CFG-01-2026-09-14T03-08-13.733Z.png) · [steps](suite-b/B-11/) | Checked box and submit turn blue. |
| B-12 | Withdraw consent | PASS | [Screenshot](suite-b/B-12/01-CFG-01-2026-09-14T03-08-15.929Z.png) · [steps](suite-b/B-12/) | Unchecked box and submit return to grey. |
| B-13 | Privacy and Terms links | PASS | [Screenshot](suite-b/B-13/06-CFG-01-2026-09-14T03-09-20.006Z.png) · [steps](suite-b/B-13/) | Privacy and Terms open Safari; form preserved. Local legal origin per setup replaces hosted URL named in assertion. |
| B-14 | Create corridor and checklist | BLOCKED | [Screenshot](suite-b/B-14/09-CFG-01-2026-09-14T03-10-01.200Z.png) · [steps](suite-b/B-14/) | Anonymous account, non-PII profile and five-task checklist observed. The brief spinner and disabled-submit state were not independently established; complete assertion remains unverified. |
| B-15 | Offline onboarding recovery | PASS | [Screenshot](suite-b/B-15/08-CFG-01-2026-09-14T03-14-27.720Z.png) · [steps](suite-b/B-15/) | Offline friendly error and preserved form; retry online succeeds. |
| B-16 | Compact onboarding and keyboard | BLOCKED | — (not captured) | Not executed before testing was stopped at the user's request. |
| C-01 | Stale consent routing | PASS | [Screenshot](suite-c/C-01/01-CFG-01-2026-09-14T03-11-15.730Z.png) · [steps](suite-c/C-01/) | Stale consent routes to policy update, tabs hidden. |
| C-02 | Re-consent layout | PASS | [Screenshot](suite-c/C-02/01-CFG-01-2026-09-14T03-11-16.020Z.png) · [steps](suite-c/C-02/) | Expected policy update hero, privacy card, unchecked consent and teardown controls. |
| C-03 | Consent-required alert | PASS | [Screenshot](suite-c/C-03/01-CFG-01-2026-09-14T03-11-24.317Z.png) · [steps](suite-c/C-03/) | Exact consent-required alert. |
| C-04 | Accept current policies | PASS | [Screenshot](suite-c/C-04/02-CFG-01-2026-09-14T03-11-40.445Z.png) · [steps](suite-c/C-04/) | Accept records server timestamp and version 1.1 and routes to checklist. |
| C-05 | Delete confirmation | PASS | [Screenshot](suite-c/C-05/01-CFG-01-2026-09-14T03-12-04.855Z.png) · [steps](suite-c/C-05/) | Exact destructive confirmation and Cancel/Delete Everything controls. |
| C-06 | Cancel deletion | PASS | [Screenshot](suite-c/C-06/02-CFG-01-2026-09-14T03-12-20.915Z.png) · [steps](suite-c/C-06/) | Cancel returns to re-consent and retains account. |
| C-07 | Delete from re-consent | BLOCKED | [Screenshot](suite-c/C-07/03-CFG-01-2026-09-14T03-13-46.536Z.png) · [steps](suite-c/C-07/) | Deletion returned to onboarding and auth/profile/progress counts were zero. This re-consent fixture had no populated vault; profile deletion with a populated vault was separately observed in E-11. |
| C-08 | Sign-out confirmation | PASS | [Screenshot](suite-c/C-08/01-CFG-01-2026-09-14T03-12-23.337Z.png) · [steps](suite-c/C-08/) | Exact sign-out warning shown. |
| C-09 | Sign out from re-consent | BLOCKED | [Screenshot](suite-c/C-09/03-CFG-01-2026-09-14T03-15-11.910Z.png) · [steps](suite-c/C-09/) | Sign-out returned to onboarding. This re-consent fixture had no populated vault; profile sign-out with saved values was separately observed in E-10. |
| C-10 | Offline deletion recovery | PASS | [Screenshot](suite-c/C-10/02-CFG-01-2026-09-14T03-12-48.907Z.png) · [steps](suite-c/C-10/) | Offline deletion produces exact friendly error; account retained and retry deletion succeeds. |
| C-11 | Deep link with stale consent | BLOCKED | [Screenshot](suite-c/C-11/01-CFG-01-2026-09-14T03-13-20.598Z.png) · [steps](suite-c/C-11/) | Expo Go does not register relogo scheme; simctl returns LSApplicationWorkspaceErrorDomain 115. |
| D-01 | Checklist header and progress | PASS | [Screenshot](suite-d/D-01/setup8-CFG-01-2026-09-14T03-15-29.234Z.png) · [steps](suite-d/D-01/) | D1 Ontario to British Columbia route, move date and 0% progress observed. |
| D-02 | Section grouping | PASS | [Screenshot](suite-d/D-02/01-CFG-01-2026-09-14T03-16-25.486Z.png) · [steps](suite-d/D-02/) | DUE SOON (1), then NO DEADLINE (4), with section counts and dividers. |
| D-03 | Overdue fixture | FAIL | [Screenshot](suite-d/D-03/01-CFG-01-2026-09-14T03-17-38.784Z.png) · [steps](suite-d/D-03/) | D4 move 30 days ago produces no overdue tasks: ON licence deadline is 60 days. Playbook fixture mismatch; older-date fixture shows correct red overdue styling. |
| D-04 | Overdue and requirement badges | PASS | [Screenshot](suite-d/D-04/02-older-fixture-CFG-01-2026-09-14T03-18-18.509Z.png) · [steps](suite-d/D-04/) | Red overdue badge/count and amber Required badge observed using a move date 90 days earlier; canonical D4 was insufficient (D-03). |
| D-05 | Due-today boundary | PASS | [Screenshot](suite-d/D-05/01-CFG-01-2026-09-14T03-18-48.504Z.png) · [steps](suite-d/D-05/) | Temporary exact SK to MB zero-day licence rule: due today remains Due Soon. Fixture removed afterward. |
| D-06 | No-deadline badge | PASS | [Screenshot](suite-d/D-06/01-CFG-01-2026-09-14T03-16-25.696Z.png) · [steps](suite-d/D-06/) | No fixed deadline chip and NO DEADLINE grouping observed. |
| D-07 | Expand task details | PASS | [Screenshot](suite-d/D-07/01-CFG-01-2026-09-14T03-16-27.896Z.png) · [steps](suite-d/D-07/) | Chevron and expanded description/source details observed. |
| D-08 | Expand multiple cards | PASS | [Screenshot](suite-d/D-08/01-CFG-01-2026-09-14T03-16-39.011Z.png) · [steps](suite-d/D-08/) | Two task cards remained expanded together. |
| D-09 | Official source row | PASS | [Screenshot](suite-d/D-09/01-CFG-01-2026-09-14T03-16-28.569Z.png) · [steps](suite-d/D-09/) | Official-source heading, blue agency link and external-link icon observed. |
| D-10 | Open official HTTPS source | PASS | [Screenshot](suite-d/D-10/02-CFG-01-2026-09-14T03-16-59.789Z.png) · [steps](suite-d/D-10/) | ICBC source opened its official HTTPS page in Safari. Unsafe displayed-link recovery remains unverified in D-11. |
| D-11 | Unsafe source recovery | BLOCKED | — (not captured) | Canonical resolver filters unsafe official URLs before UI; no unsafe displayed-link fixture without modifying application path. |
| D-12 | Complete task | PASS | [Screenshot](suite-d/D-12/01-CFG-01-2026-09-14T03-18-59.237Z.png) · [steps](suite-d/D-12/) | Checked task moved to COMPLETED with strikethrough and updated progress. |
| D-13 | Undo completion | PASS | [Screenshot](suite-d/D-13/01-CFG-01-2026-09-14T03-19-02.078Z.png) · [steps](suite-d/D-13/) | Unchecking restored the original urgency group and incomplete styling. |
| D-14 | Offline toggle rollback | PASS | [Screenshot](suite-d/D-14/01-CFG-01-2026-09-14T03-19-20.384Z.png) · [steps](suite-d/D-14/) | Offline toggle rolled back and showed Update failed / Couldn't save your progress. Please try again. |
| D-15 | 100% celebration | PASS | [Screenshot](suite-d/D-15/05-CFG-01-2026-09-14T03-19-52.282Z.png) · [steps](suite-d/D-15/) | All five tasks completed; trophy banner and 100% progress observed. |
| D-16 | Remove celebration | PASS | [Screenshot](suite-d/D-16/01-CFG-01-2026-09-14T03-20-01.478Z.png) · [steps](suite-d/D-16/) | Unchecking one task removed celebration and changed progress to 80%. |
| D-17 | Pull to refresh | BLOCKED | [Screenshot](suite-d/D-17/01-CFG-01-2026-09-14T03-20-03.532Z.png) · [steps](suite-d/D-17/) | Automated scroll gesture did not establish native pull-to-refresh spinner; no pass claimed. |
| D-18 | Vehicle-disabled rules | FAIL | [Screenshot](suite-d/D-18/01-CFG-01-2026-09-14T03-20-31.503Z.png) · [steps](suite-d/D-18/) | Playbook discrepancy: vehicle=false omitted registration but retained Exchange Your Driver's Licence. Confirm intended licence eligibility before changing behavior. |
| D-19 | Dependents-disabled rules | PASS | [Screenshot](suite-d/D-19/01-CFG-01-2026-09-14T03-21-13.828Z.png) · [steps](suite-d/D-19/) | D2 Alberta to British Columbia with dependents=false omitted school/child-benefit tasks. |
| D-20 | Empty checklist | PASS | [Screenshot](suite-d/D-20/01-CFG-01-2026-09-14T03-21-36.430Z.png) · [steps](suite-d/D-20/) | Temporary zero-rule fixture showed No tasks yet and hid progress. The original 53 rules were restored afterward. |
| E-01 | Profile layout and tabs | PASS | [Screenshot](suite-e/E-01/01-CFG-01-2026-09-14T03-21-56.149Z.png) · [steps](suite-e/E-01/) | My Profile, Move details, Personal info and Account sections; only Checklist and Profile tabs visible. |
| E-02 | Stored move details | PASS | [Screenshot](suite-e/E-02/01-CFG-01-2026-09-14T03-21-57.057Z.png) · [steps](suite-e/E-02/) | Pickers, date and switches matched the stored move metadata. |
| E-03 | Same-jurisdiction update | PASS | [Screenshot](suite-e/E-03/03-CFG-01-2026-09-14T03-22-19.661Z.png) · [steps](suite-e/E-03/) | Same-jurisdiction save showed the specified validation alert. |
| E-04 | Save move details | PASS | [Screenshot](suite-e/E-04/04-CFG-01-2026-09-14T03-23-07.730Z.png) · [steps](suite-e/E-04/) | Alberta to Ontario move update saved and checklist changed without manual refresh. |
| E-05 | Five personal-information fields | PASS | [Screenshot](suite-e/E-05/01-CFG-01-2026-09-14T03-24-17.566Z.png) · [steps](suite-e/E-05/) | Exactly five fields, green privacy notice, two masked identifier inputs. iOS strong-password suggestion unexpectedly appeared during first secure-field entry. |
| E-06 | Save dummy fixtures on device | PASS | [Screenshot](suite-e/E-06/06-CFG-01-2026-09-14T03-24-20.268Z.png) · [steps](suite-e/E-06/) | Saved-on-device confirmation; full local postgres and analytics data scans each found zero occurrences of all five fixtures. SecureStore prefix confirmed in implementation; encrypted OS metadata not independently readable. |
| E-07 | Persist values across relaunch | PASS | [Screenshot](suite-e/E-07/03-CFG-01-2026-09-14T03-25-35.427Z.png) · [steps](suite-e/E-07/) | Force quit and relaunch restore all five entries; identifier inputs remain masked. |
| E-08 | Clear one saved field | PASS | [Screenshot](suite-e/E-08/04-CFG-01-2026-09-14T03-26-20.633Z.png) · [steps](suite-e/E-08/) | Cleared full name stayed empty after save and relaunch. |
| E-09 | Open support | PASS | [Screenshot](suite-e/E-09/01-CFG-01-2026-09-14T03-26-23.375Z.png) · [steps](suite-e/E-09/) | Help & support opened the contact screen. |
| E-10 | Sign out and clear vault | PASS | [Screenshot](suite-e/E-10/setup6-CFG-01-2026-09-14T03-27-27.641Z.png) · [steps](suite-e/E-10/) | Correct warning and onboarding after sign-out; a fresh session displayed empty personal-information fields. Direct encrypted-key enumeration was unavailable. |
| E-11 | Delete account and clear vault | PASS | [Screenshot](suite-e/E-11/setup6-new-CFG-01-2026-09-14T03-30-03.098Z.png) · [steps](suite-e/E-11/) | Populated-vault deletion returned to onboarding; fresh-session fields were empty and deleted auth/profile/progress counts were zero. |
| F-01 | Support layout and fixed questions | PASS | [Screenshot](suite-f/F-01/02-CFG-01-2026-09-14T03-30-58.763Z.png) · [steps](suite-f/F-01/) | Help header, privacy notice, empty state, human escalation and six question buttons observed; no free-text input. |
| F-02 | Back navigation | FAIL | [Screenshot](suite-f/F-02/02-CFG-01-2026-09-14T03-26-48.578Z.png) · [steps](suite-f/F-02/) | Back chevron returns to Checklist rather than Profile. |
| F-03 | Six allowlisted question labels | PASS | [Screenshot](suite-f/F-03/01-CFG-01-2026-09-14T03-26-32.118Z.png) · [steps](suite-f/F-03/) | All six labels matched the allowlist. |
| F-04 | Optimistic message and typing state | BLOCKED | [Screenshot](suite-f/F-04/01-CFG-01-2026-09-14T03-31-39.358Z.png) · [steps](suite-f/F-04/) | Unavailable Edge path completes fallback too quickly to independently capture typing indicator and disabled-question transient. |
| F-05 | AI response | BLOCKED | — (not captured) | No local Gemini provider key; genuine AI response unavailable. |
| F-06 | Escalate to human | PASS | [Screenshot](suite-f/F-06/02-CFG-01-2026-09-14T03-33-11.525Z.png) · [steps](suite-f/F-06/) | Manual escalation produced AWAITING_HUMAN, amber banner and removed the human button. A local status fixture was used to start in AI state. |
| F-07 | Question during human handling | PASS | [Screenshot](suite-f/F-07/05-CFG-01-2026-09-14T03-32-05.904Z.png) · [steps](suite-f/F-07/) | Six allowlisted user messages were saved during human handling; no AI reply appeared. Provider credentials were absent, limiting validation of configured-provider suppression. |
| F-08 | Unavailable AI fallback | PASS | [Screenshot](suite-f/F-08/01-CFG-01-2026-09-14T03-31-56.561Z.png) · [steps](suite-f/F-08/) | Unavailable local Edge function produced the specified friendly fallback and awaiting-human state. |
| F-09 | Realtime support reply | PASS | [Screenshot](suite-f/F-09/02-CFG-01-2026-09-14T03-35-20.499Z.png) · [steps](suite-f/F-09/) | Local admin reply arrived in realtime as a left-aligned white bordered Support bubble. |
| F-10 | Resolved conversation banner | PASS | [Screenshot](suite-f/F-10/01-CFG-01-2026-09-14T03-35-33.619Z.png) · [steps](suite-f/F-10/) | Admin resolution produced the specified grey closed-conversation banner. |
| F-11 | Reopen resolved conversation | FAIL | [Screenshot](suite-f/F-11/01-CFG-01-2026-09-14T03-35-35.852Z.png) · [steps](suite-f/F-11/) | After human reply and resolve, reopening yields AWAITING_HUMAN, no AI answer. Conflicts with playbook but matches permanent human-takeover safety design. |
| G-01 | Device-only dummy fixtures and database scan | PASS | [Screenshot](suite-e/E-07/03-CFG-01-2026-09-14T03-25-35.427Z.png) · [steps](suite-e/E-07/) (related) | Five dummy fixtures persisted on device; scans of postgres and _supabase at two checkpoints found zero occurrences of each fixture. This verifies the exercised fixtures, not every possible PII value. |
| G-02 | SecureStore teardown audit | BLOCKED | [Screenshot](suite-e/E-11/setup6-new-CFG-01-2026-09-14T03-30-03.098Z.png) · [steps](suite-e/E-11/) (related) | E-10/E-11 show empty fields after teardown. Direct enumeration of all relogo_pii_* encrypted keys was unavailable, so the complete key-removal assertion is unverified. |
| G-03 | Error sanitization sweep | FAIL | [Screenshot](suite-a/A-06/11-CFG-01-2026-09-14T03-10-29.656Z.png) · [steps](suite-a/A-06/) (related) | A-06 exposes internal error text through Expo Go LogBox; other exercised error cards are friendly. All error paths not exhaustively injectable without source changes. |
| G-04 | Reject arbitrary support text | FAIL | No screenshot; [verification](suite-g/G-04/api-result.json) | Arbitrary text correctly rejected (HTTP 403, RLS 42501), but specified support_messages_body_allowlist CHECK constraint is absent. Security invariant protected; exact playbook assertion differs. |
| G-05 | URL scheme sanitizer | BLOCKED | [Screenshot](suite-d/D-10/02-CFG-01-2026-09-14T03-16-59.789Z.png) · [steps](suite-d/D-10/) (related) | Existing sanitizer suite passed 8/8 tests (public HTTPS, HTTP, javascript, file, malformed and credential URLs); D-10 opened official HTTPS. The requested data: case was not separately exercised. |
| H-01 | Safe areas | BLOCKED | [Screenshot](suite-h/H-01/01-CFG-08-2026-09-14T03-37-12.324Z.png) · [steps](suite-h/H-01/) | Partial baseline safe-area capture retained. Full screen/platform matrix was not completed before the user stopped testing. |
| H-02 | XXXL Dynamic Type | FAIL | [Screenshot](suite-h/H-02/04-CFG-07-2026-09-14T03-37-51.892Z.png) · [steps](suite-h/H-02/) | Live XXXL setting clipped Profile/Help headings and multiple action/question labels. Checklist titles reflowed. Persistence after relaunch and other devices were not verified. |
| H-03 | Dark system appearance | FAIL | [Screenshot](suite-h/H-03/02-CFG-08-2026-09-14T03-37-15.274Z.png) · [steps](suite-h/H-03/) | Light palette retained, but system status-bar time/icons become white on white and disappear in Dark Mode. |
| H-04 | Compact layout | BLOCKED | — (not captured) | Compact simulator was prepared but app installation/inspection did not finish before testing was stopped. |
| H-05 | Portrait orientation lock | BLOCKED | — (not captured) | Not executed before testing was stopped at the user's request. |
| I-01 | Onboarding screen reader | BLOCKED | — (not captured) | Not executed before testing was stopped at the user's request. |
| I-02 | Checklist screen reader | BLOCKED | — (not captured) | Not executed before testing was stopped at the user's request. |
| I-03 | Profile screen reader | BLOCKED | — (not captured) | Not executed before testing was stopped at the user's request. |
| I-04 | 44-point touch targets | BLOCKED | — (not captured) | Not executed before testing was stopped at the user's request. |
| J-01 | Offline cold launch | BLOCKED | [Screenshot](suite-a/A-06/11-CFG-01-2026-09-14T03-10-29.656Z.png) · [steps](suite-a/A-06/) (related) | Suite J was not executed. Related profile-timeout evidence exists in A-06; session-specific timeout remains unverified. |
| J-02 | Offline checklist refresh | BLOCKED | — (not captured) | Not executed before testing was stopped at the user's request. |
| J-03 | Offline task toggle | BLOCKED | [Screenshot](suite-d/D-14/01-CFG-01-2026-09-14T03-19-20.384Z.png) · [steps](suite-d/D-14/) (related) | Suite J was not executed separately. D-14 records an earlier offline toggle rollback. |
| J-04 | High-latency connection | BLOCKED | — (not captured) | Not executed before testing was stopped at the user's request. |
| K-01 | Desktop landing page | BLOCKED | — (not captured) | Not executed before testing was stopped at the user's request. |
| K-02 | Mobile landing page | BLOCKED | — (not captured) | Not executed before testing was stopped at the user's request. |
| K-03 | Same-corridor waitlist validation | BLOCKED | — (not captured) | Not executed before testing was stopped at the user's request. |
| K-04 | Valid-corridor waitlist form | BLOCKED | — (not captured) | Not executed before testing was stopped at the user's request. |
| K-05 | Invalid email validation | BLOCKED | — (not captured) | Not executed before testing was stopped at the user's request. |
| K-06 | Waitlist submission | BLOCKED | — (not captured) | Not executed before testing was stopped at the user's request. |
| K-07 | Duplicate waitlist submission | BLOCKED | — (not captured) | Not executed before testing was stopped at the user's request. |
| K-08 | Legal pages | BLOCKED | [Screenshot](suite-b/B-13/06-CFG-01-2026-09-14T03-09-20.006Z.png) · [steps](suite-b/B-13/) (related) | Suite K was not completed. B-13 opened local Privacy and Terms pages; /support and the complete desktop/mobile legal-page assertions were not inspected. |
| L-01 | Admin login layout | PASS | [Screenshot](suite-l/L-01/01-CFG-09-1789356849716.png) · [steps](suite-l/L-01/) | Dark login card with email/password inputs. Initial desktop viewport 1440x778; exact 1440x900 sweep pending. |
| L-02 | Invalid admin credentials | PASS | [Screenshot](suite-l/L-02/02-CFG-09-1789356865963.png) · [steps](suite-l/L-02/) | Wrong password shows Invalid login credentials without raw details. |
| L-03 | Non-admin authorization | BLOCKED | — (not captured) | Not executed before testing was stopped at the user's request. |
| L-04 | Admin navigation | PASS | [Screenshot](suite-l/L-04/01-CFG-09-1789356876076.png) · [steps](suite-l/L-04/) | Authorized local fixture login shows Alerts, Users, Messages, Waitlist and Log out. |
| L-05 | Pending alerts | BLOCKED | — (not captured) | Not executed before testing was stopped at the user's request. |
| L-06 | Edit rule modal | BLOCKED | — (not captured) | Not executed before testing was stopped at the user's request. |
| L-07 | Approve rule change | BLOCKED | — (not captured) | Not executed before testing was stopped at the user's request. |
| L-08 | User inspection | BLOCKED | — (not captured) | Not executed before testing was stopped at the user's request. |
| L-09 | Realtime support inbox | PASS | [Screenshot](suite-l/L-09/01-CFG-09-1789356892878.png) · [steps](suite-l/L-09/) | Inbox shows Awaiting human / Human / Resolved transitions and updates after mobile messages. |
| L-10 | Support thread actions | FAIL | [Screenshot](suite-l/L-10/05-CFG-09-1789356921222.png) · [steps](suite-l/L-10/) | No View Thread button; clickable row opens modal. Actual labels Take over / Mark resolved / Send differ from playbook. Functional takeover, reply, and resolve succeed with realtime mobile delivery. |
| L-11 | Waitlist table | BLOCKED | — (not captured) | Not executed before testing was stopped at the user's request. |
| M-01 | Authenticated deep link | BLOCKED | [Screenshot](suite-c/C-11/01-CFG-01-2026-09-14T03-13-20.598Z.png) · [steps](suite-c/C-11/) (related) | No standalone ReloGo binary; Expo Go did not register relogo:// (see C-11). |
| M-02 | Unauthenticated deep link | BLOCKED | [Screenshot](suite-c/C-11/01-CFG-01-2026-09-14T03-13-20.598Z.png) · [steps](suite-c/C-11/) (related) | Unauthenticated custom deep link not exercised; standalone ReloGo scheme unavailable in Expo Go. |
| M-03 | Invalid deep link | BLOCKED | [Screenshot](suite-c/C-11/01-CFG-01-2026-09-14T03-13-20.598Z.png) · [steps](suite-c/C-11/) (related) | Invalid custom deep link not exercised; standalone ReloGo scheme unavailable in Expo Go. |
| M-04 | Return after backgrounding | BLOCKED | — (not captured) | Not executed before testing was stopped at the user's request. |
| M-05 | Android hardware back | BLOCKED | — (not captured) | No configured Android virtual device; hardware-back test not executed. |
| M-06 | iOS back gesture | BLOCKED | — (not captured) | Not executed before testing was stopped at the user's request. |
| M-07 | Timezone shift | BLOCKED | — (not captured) | Not executed before testing was stopped at the user's request. |
| GATE-Z01 | iOS A–J coverage | BLOCKED | — (not captured) | Coverage incomplete; startup, accessibility and network assertions remain unverified. |
| GATE-Z02 | Android A–J coverage | BLOCKED | — (not captured) | No Android virtual device was configured; Android testing was not performed. |
| GATE-Z03 | Complete visual matrix | FAIL | [Screenshot](suite-h/H-03/02-CFG-08-2026-09-14T03-37-15.274Z.png) · [steps](suite-h/H-03/) (related) | H-02 shows text clipping and H-03 shows status-bar contrast loss; the remaining device matrix is incomplete. |
| GATE-Z04 | Privacy suite sign-off | BLOCKED | No screenshot; [verification](suite-g/G-01/backend-scan.json) | Automated fixture scans found zero occurrences, but G-03/G-04 failed playbook assertions and G-02/G-05 are incomplete. |
| GATE-Z05 | Landing suite sign-off | BLOCKED | — (not captured) | Suite K was not completed. |
| GATE-Z06 | Admin suite sign-off | BLOCKED | — (not captured) | Support reply was observed, but rule approval, user inspection and remaining admin cases were not completed. |
| GATE-Z07 | No open P0/P1 issues | BLOCKED | — (not captured) | Severity triage and release-build verification remain incomplete; no release sign-off is granted. |
| GATE-Z08 | Complete screenshot bundle | BLOCKED | — (not captured) | All 203 collected screenshots are retained, but screenshots for unexecuted cases/configurations do not exist. |

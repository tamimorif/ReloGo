# iPhone simulator QA — 2026-10-10 continuation

## Scope and environment

- Followed `/docs/ai/SIMULATOR_TESTING_GUIDE.md` on the iPhone 17 simulator (iOS 26.5) in Device Hub, using Expo Go. This continues the initial run documented in [`../visual-iphone-2026-10-09/results.md`](../visual-iphone-2026-10-09/results.md).
- Local Supabase only (`127.0.0.1:54321`), local synthetic account, and Metro launched with the local-only process override on port 8083. REST returned HTTP 200 after backend recovery. No hosted Supabase target was contacted.
- No app source, migrations, or configuration were changed. Evidence and this report are QA artifacts. Existing unrelated working-tree changes were preserved.
- The local stale-consent setup required a temporary test-only transaction that disabled only `trg_user_profiles_consent_integrity`, set the test profile's consent version to `1.0`, re-enabled the trigger, and committed. The in-app checkbox was then accepted; local profile is back at version `1.1`.
- The guide-specified fixtures were synthetic. Its PII sweep returned zero profile hits and zero support-message hits for `Jane`, `9876`, and `D1234`.

## Results

| Case | Status | Evidence / observation |
| --- | --- | --- |
| B-11 | PASS | Consent checkbox checked; blue state. Evidence in `../visual-iphone-2026-10-09/B-11/01-consent-checked.png`. |
| B-12 | PASS | Checkbox unticked and rechecked; disabled/active submit states followed. Evidence in `../visual-iphone-2026-10-09/B-12/`. |
| B-13 | SKIPPED | Optional public legal-page navigation skipped to keep the run local. |
| B-14 | PASS after recovery | Local Ontario → British Columbia flow created the checklist with 5 tasks. Earlier stale preview bundle attempts failed before request transmission; the corrected local-only 8083 bundle passed. Evidence: `B-14/05-checklist-5tasks.png`. |
| B-15 | PASS | Local profile is `ON | BC | 2026-10-10 | vehicle=true | dependents=true | consent=1.1`. |
| D-01 | PASS | Checklist header and Ontario → British Columbia corridor/date displayed. |
| D-02 | PASS | Five task titles and due-soon/no-deadline groupings matched the guide. |
| D-03 | PASS | Licence deadline was Jan 8, 2027 (move date + 90 days); required/optional badges matched. |
| D-04 | PASS | Licence task details, official-source heading, and source row expanded. |
| D-05 | PASS | A second task card expanded without collapsing the first. |
| D-06 | SKIPPED | External ICBC legal/source URL was not opened. |
| D-07 | PASS | Task toggle updated progress optimistically. |
| D-08 | PASS | Undo restored the original state. |
| D-09 | PASS | All five tasks completed; 100% and celebration banner displayed. Evidence: `D-09/01-all-complete.png`. |
| D-10 | PASS | Unchecking/rechecking one task changed progress to 4/5 (80%) and restored 5/5. |
| D-11 | PASS | Force-quit/relaunch restored 5/5 and the 100% banner. Evidence: `D-11/01-persisted-after-relaunch.png`. |
| D-12 | SKIPPED | Optional duplicate persistence toggle pass not repeated. |
| E-01 | PASS | Profile sections and tabs displayed. |
| E-02 | PASS | Stored move details matched the ON → BC, date, vehicle, and kids fixture. |
| E-03 | PASS | Same-jurisdiction validation showed the expected alert. |
| E-04 | PASS | Changing and restoring the destination saved with the expected confirmation. |
| E-05 | PASS | Device-only privacy copy and five ordered fields displayed; last two masked. |
| E-06 | PASS | Synthetic profile fixture saved on device; confirmation matched. PII sweep returned 0/0 hits. |
| E-07 | PASS | Clearing the name persisted after relaunch; other fixture fields remained. |
| E-08 | PASS | Re-entered synthetic name and confirmed persistence. |
| E-09 | PASS | Help & support opened from Profile. |
| E-10 | PASS | Support back navigation returned to Profile. |
| E-11 | PASS | Exact Sign Out warning displayed; Cancel preserved account and local data. Evidence: `E-11/01-signout-warning.png`. |
| E-12 | PASS | Exact Delete My Data warning displayed; Cancel preserved account, progress, and on-device PII. Evidence: `E-12/01-delete-warning.png`. |
| F-01 | PASS | Support screen had privacy banner, empty state, human option, six fixed questions, and no free-text input. |
| F-02 | PASS | All six question labels matched the guide. |
| F-03 | PASS | First fixed question used the expected fallback: “Our assistant is unavailable right now — a member of the support team will follow up here.” Amber handoff banner appeared. |
| F-04 | PASS | Second question produced no AI reply in the human-routed thread. |
| F-05 | N/A | Human option disappeared automatically after handoff. |
| F-06 | PASS (follow-up) | Local admin reply appeared live. See Follow-up local-only coverage below. |
| F-07 | PASS (follow-up) | Resolved-thread banner matched the guide. See Follow-up local-only coverage below. |
| F-08 | PASS (follow-up) | Resolved question re-escalated to human follow-up. See Follow-up local-only coverage below. |
| C-01 | PASS | Local stale-consent fixture routed to Policy update after relaunch. Evidence: `C-01/01-policy-update-unchecked.png`. |
| C-02 | PASS | Exact Policy update copy appeared; checkbox began unticked and tabs were unavailable. |
| C-03 | PASS | Accept without checking showed “Consent Required” and the expected current-policy copy. |
| C-04 | PASS | Accepting after checking returned to Checklist; local consent version is 1.1. |
| C-05 | PASS | Delete My Data → Cancel kept the account and data. |
| C-06 | PASS | After action-time approval, Sign Out returned to Onboarding and cleared the on-device PII vault. Local server account remained, as expected. |
| C-07 | PASS | Re-onboarding recreated the ON → BC account with the five-task checklist. |
| C-08 | SKIPPED (safe choice) | Opened and captured the permanent-delete warning, then selected Cancel. The synthetic account and its local checklist data were preserved. Evidence: `C-08/01-permanent-delete-warning.png`. |
| J-01 | PASS | With local Supabase stopped, cold launch showed “Couldn't reach ReloGo” / “Check your connection and try again.” Restarting Supabase and tapping Retry restored Checklist and 5/5. Evidence: `J-01/01-offline-error.png`, `J-01/02-recovered-checklist.png`. |
| J-02 | PASS | Offline toggle rolled back to 5/5 and displayed “Update failed” / “Couldn't save your progress. Please try again.” Evidence: `J-02/01-update-failed.png`. |
| J-03 | PASS | Cold Expo Go launch showed a brief opening/splash state and resolved to the signed-in 5/5 Checklist after about 7 seconds. No stuck spinner or raw app error appeared. Evidence: `J-03/01-cold-launch-restored.png`. |
| S-01 | PASS | Dark system appearance left the app light, with readable status bar. Restored light appearance. Evidence: `S-01/`. |
| S-02 | PASS (standard XXXL) | The controlled verification below found no clipping at `extra-extra-extra-large` on Checklist, Support, or Profile. The accessibility-size “My Profile” title clip remains the sole defect candidate; it is not a standard XXXL failure. |
| S-03 | PASS | Notch/status area and home indicator remained clear at medium size. |
| S-04 | OBSERVATION | Expo Go cannot certify the native portrait lock. The earlier image is portrait, so it is not landscape evidence; verify orientation in a standalone build before filing an app issue. |
| M-01 | PASS | Signed-in checklist deep link opened the Checklist. |
| M-02 | PASS | After sign-out, the signed-in Checklist deep link safely returned to Onboarding. |
| M-03 | OBSERVATION | Invalid route shows the documented Unmatched Route screen; see prior run's evidence. |
| M-04 | PASS | Background/foreground returned to the signed-in Checklist without a loop or freeze. |
| M-05 | SKIPPED | Optional timezone variant not run. |
| G-01 | PASS | PII sweep found no fixture values in the scanned local database fields/messages. |
| G-02 | PASS | After Sign Out and re-onboarding, all five on-device personal-info fields were empty in the fresh profile. |
| G-03 | PASS | App error card contained only friendly copy. Expo Go showed the guide-allowed sanitized development diagnostic. |
| V-01–V-03 | PASS (follow-up) | Vehicle/kids filtering and overdue-date fixture passed. See Follow-up local-only coverage below. |
| V-04–V-06 | SKIPPED | Remaining optional variants not run. |

## End state

- Current local database counts: 2 auth users, 2 profiles, 5 task-progress rows, and 1 support thread. The support thread is `AWAITING_HUMAN` with 2 user messages. One profile was retained after sign-out; the newly re-onboarded profile is current on device. C-08 was cancelled, so no account or checklist data were permanently deleted.
- Sign Out cleared the device-only Jane Doe fixture. The current account's five personal-info fields are empty. Both server accounts and the support thread are synthetic local test data.
- The local Supabase stack is running and REST responds HTTP 200. The simulator remains open on Profile. Metro on port 8083 was stopped at cleanup.

## Post-run controlled verification of S-02 and S-04 (assistant, same day)

Re-verified the two failures with a fresh local Metro session (launcher, port 8083), deep links to
Checklist/Support/Profile, and settled captures. Read-only toward the app; environment restored to the
end state above. Evidence: `verification-S-02-*.png` in this folder.

- **S-02 (standard XXXL, `content_size extra-extra-extra-large`)**: **NOT reproduced**. Checklist,
  Support, and Profile rendered correctly — text wrapped within the screen, badges/banners/buttons
  complete, with both immediate (~0.4 s) and settled captures identical and clean. The recorded
  mid-word clipping screenshots do not match the current build at this exact setting; re-capture
  at a recorded setting before filing as an app defect.
- **S-02 (true accessibility max, `content_size accessibility-extra-extra-extra-large`)**: one
  reproducible issue — the native **"My Profile" header title is clipped vertically** while all
  other content wraps correctly. This exceeds the standard XXXL target; treat as the single
  accessibility-size defect candidate.
- **S-04 (landscape)**: the only evidence (`../visual-iphone-2026-10-09/S-04-landscape.png`) is
  **portrait** (1206×2622) and does not demonstrate rotation. The native portrait lock is real in
  `mobile/ios/ReloGo/Info.plist`; Expo Go cannot certify orientation, so this is an environment
  observation, not an app failure, pending a standalone-build check.

## Follow-up local-only coverage — 2026-10-10

### Environment and scope

- iPhone 17, iOS 26.5, Device Hub, Expo Go, portrait, light appearance, medium text. Metro was
  started only from the repository root with `python3.11 scripts/run-local-app.py mobile -- --ios
  --port 8083 --clear`; `http://127.0.0.1:8083/status` returned HTTP 200
  (`packager-status:running`) before testing. Local Supabase REST returned HTTP 200. No hosted
  service was contacted.
- No app source, migration, or configuration files were changed. Only this QA ledger and local
  screenshots were added. Existing unrelated worktree changes were preserved.
- S-02 standard XXXL is PASS and S-04 is an Expo Go OBSERVATION, as recorded above. The only
  existing accessibility-size candidate remains the vertically clipped native “My Profile” title
  in `verification-S-02-profile-axxxl-header-clip.png`; this follow-up did not re-file it.

### Follow-up results

| Case | Status | Configuration and result | Evidence |
| --- | --- | --- | --- |
| F-06 | PASS | On the current synthetic local account, the §7.3 `sender='admin'` fixture appeared live in Support as a left-aligned `Support` reply after insertion. | `followup-2026-10-10/F-06-F-08/03-admin-reply-realtime.png` |
| F-07 | PASS | Setting that thread to `RESOLVED` showed `This conversation is closed. Send a message to reopen it.` | `followup-2026-10-10/F-06-F-08/05-resolved-banner.png` |
| F-08 | PASS | Sent `What should I do first for my move?` while resolved. The thread returned to `AWAITING_HUMAN`; the human-follow-up fallback appeared, with no AI answer after the existing admin reply. | `followup-2026-10-10/F-06-F-08/04-resolved-question-human-reroute.png` |
| V-01 | PASS | Profile configuration: vehicle OFF, kids ON, move date 2026-10-10. Checklist showed 4 tasks; `Register Your Vehicle` disappeared and the licence task remained. | `followup-2026-10-10/V-01-V-03/01-vehicle-off-profile.png`, `02-vehicle-off-4-tasks.png` |
| V-02 | PASS | Profile configuration: vehicle OFF, kids OFF, move date 2026-10-10. Checklist showed 3 tasks; the school task disappeared. | `followup-2026-10-10/V-01-V-03/03-vehicle-and-kids-off-profile.png`, `04-vehicle-and-kids-off-3-tasks.png` |
| V-03 | PASS | Fixture configuration: `move_date = 2026-06-12` (2026-10-10 minus 120 days), vehicle OFF, kids OFF. Checklist put `OVERDUE (1)` first, showed `1 overdue`, and the licence chip read `Overdue · Sep 10, 2026`. Restored the date to 2026-10-10 and both switches ON; the baseline 5-task checklist returned. | `followup-2026-10-10/V-01-V-03/05-overdue-checklist.png`, `07-restored-baseline-5-tasks.png` |
| M-05 | SKIPPED | Optional timezone variant not run; no host timezone or simulator region settings were changed. | — |
| C-08 | SKIPPED | Per the requested safe choice, Delete Everything was not tapped; the synthetic account and its data remain. Prior warning capture: `C-08/01-permanent-delete-warning.png`. | — |

### End state and cleanup

- Current local counts: 2 auth users, 2 profiles, 5 task-progress rows, 2 support threads, and 5
  support messages. Both threads are `AWAITING_HUMAN`; the follow-up thread retains the synthetic
  admin reply and test questions. Current account settings are ON → BC, move date 2026-10-10,
  vehicle ON, kids ON, consent 1.1. No PII was entered.
- Simulator appearance and text size were set back to light and medium. It remains open on Profile.
  Local Supabase remains running. Metro on port 8083 was stopped after the follow-up.

## Accessibility header clipping fix verification — 2026-10-10

- **PASS** — On iPhone 17 / iOS 26.5 in Device Hub + Expo Go, portrait and light appearance,
  `accessibility-extra-extra-extra-large` Dynamic Type, the native Profile header rendered the
  complete “My Profile” title without vertical clipping. The other Profile content continued to
  scale and wrap. Evidence: `verification-header-fix-accessibility-xxxl.png`.
- The fix sets `headerTitleAllowFontScaling: false` in the shared tab `screenOptions`. This option
  is present in the installed Expo Router 57.0.25 `HeaderOptions` type and its JS header passes the
  value to the title text as `allowFontScaling`.
- **PASS** — Restored medium text and light appearance; Profile remained open. Evidence:
  `verification-header-fix-medium-restored.png`.
- Verification on the final dependency tree: `npm run lint` PASS; `npm run typecheck` PASS;
  `npm test -- --runInBand` PASS (16 suites, 165 tests). The iCloud-evicted generated dependency
  tree was reinstalled from the existing lockfile; the dataless count returned to 0 and
  `require('xmlbuilder').create` resolved as a function before rerunning checks.
- Local launcher on port 8083 returned `packager-status:running` and bundled 1,834 modules;
  local Supabase REST returned HTTP 200. Cleanup left Supabase running and stopped Metro; no
  hosted service was contacted.

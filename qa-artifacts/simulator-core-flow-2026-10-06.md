# ReloGo iOS Simulator Core-Flow QA

- **Date:** 2026-10-06 (America/Toronto)
- **App:** ReloGo 1.0.1, opened from the running Expo development session
- **Device:** iPhone 17 Simulator, iOS 26.5
- **Planned baseline:** iPhone 16 Pro; unavailable in Device Hub, so this run used the available iPhone 17 and records the deviation explicitly.
- **Backend:** Local Supabase at `http://127.0.0.1:54321` (reported running by the user)
- **Test data:** Ontario → British Columbia; move date 2026-10-16; vehicle and dependents enabled. No PII entered.
- **Code changes:** None made by the tester. Existing working-tree edits were preserved.

## Results

| Case | Status | Observation |
| --- | --- | --- |
| A-01 startup route | PARTIAL | ReloGo loaded to onboarding. Splash/transition timing was not measured. |
| B-01 onboarding defaults | PASS | Both province pickers began unselected; date defaulted to 2026-10-06; vehicle/kids switches were off; consent was unchecked. |
| B-02 province picker | PASS | Picker expanded and exposed all 13 provinces and territories. |
| B-03 picker exclusivity | PASS | Opening the destination picker collapsed the origin picker. |
| B-05 date picker | PASS | iOS inline calendar appeared. Past dates were disabled; selecting 2026-10-16 updated the displayed move date. |
| Onboarding switches | PASS | Vehicle and dependents switches both toggled on and exposed the expected task hints. |
| B-09 same-jurisdiction validation | PASS | Ontario → Ontario showed “Same jurisdiction” and “Origin and destination must be different provinces or territories.” |
| B-10 unchecked-consent guard | PASS | With a valid corridor and consent unchecked, submit showed “Consent Required” and “Please agree to the Privacy Policy and Terms of Service to continue.” |
| B-14 account creation and checklist | BLOCKED | Stopped before tapping consent. That action records legal acceptance and requires action-time confirmation. |
| Checklist, profile, support, persistence, and recovery flows | BLOCKED | Depend on completing onboarding and were not reached. |

## Notes and Issues

- The simulator presented a development warning indicator (“Open debugger to view warnings”) over the lower form. It was dismissed in the simulator; the submit button was then visible. No app code was changed.
- The local migration ledger was not verified: `supabase migration list --local` failed when the CLI attempted to write its telemetry file. The app itself rendered its fresh onboarding screen.
- No PII was entered, no account was created, no database reset was run, and no production service was contacted by the tester.

## Remaining Test Work

After the local test account has valid consent, continue with checklist task expansion, official-source links, completion/undo and persistence; profile privacy presentation; one fixed support question with either an AI reply or safe fallback; and one relaunch/recovery check. Do not enter PII or perform account deletion as part of this pass.

## 2026-10-06 Follow-up Verification

The simulator/backend were rechecked on the SDK 57 working tree, including the existing user edits. No source files were changed by this verification.

| Check | Status | Evidence |
| --- | --- | --- |
| iOS Simulator available | PASS | `xcrun simctl list devices booted` reports iPhone 17 / iOS 26.5 booted. CUA initially reported the Mac locked, then accessibility interaction resumed; the onboarding screen and consent guard were inspected. |
| Current simulator screen | PASS (visual capture only) | `xcrun simctl io booted screenshot` captured the onboarding form. It shows Ontario → British Columbia, October 16, 2026, vehicle and kids enabled, consent unchecked. See `qa-artifacts/simulator-core-flow-2026-10-06.png`. |
| Accessibility and jurisdiction picker | PASS | The iOS accessibility tree exposed the onboarding controls and all 13 provinces/territories. In a fresh interaction, changing origin to Alberta caused the destination picker to exclude Alberta; origin was restored to Ontario and destination remained British Columbia. |
| Consent guard | PASS | Tapping “Build My Checklist” while consent is unchecked shows “Consent Required” and “Please agree to the Privacy Policy and Terms of Service to continue.” |
| Same-jurisdiction validation | PASS | Selecting Ontario as both origin and destination, then submitting without consent, shows “Same jurisdiction” and “Origin and destination must be different provinces or territories.” No profile write occurred. |
| Local Supabase REST endpoint | PASS | `http://127.0.0.1:54321/rest/v1/` returned HTTP 200. No account creation or database reset was performed. |
| Release config, TypeScript, lint | PASS | `npm run check:release`, `npm run typecheck`, and `npm run lint` in `mobile/` all succeeded. |
| Mobile Jest | PASS | 15 suites, 161 tests. |
| Expo Doctor | PASS | 21/21 checks. |
| iOS bundle export | PASS | 1,668 modules; Hermes bundle 4.6 MB at `/tmp/relogo-ios-check`. |
| Android bundle export | PASS | 1,762 modules; Hermes bundle 4.8 MB at `/tmp/relogo-android-check`. |
| Local launcher tests | PASS | `python3.11 scripts/test-run-local-app.py`: 13/13. |
| `git diff --check` | PASS | No whitespace errors. |
| Mobile production dependency audit | FAIL (existing release blocker) | `npm run audit:production` fails closed: 23 high and 7 moderate findings, including `braces` and `node-forge`. `npm audit fix --force` proposes breaking Tailwind/Expo Updates changes; handoff rules prohibit forcing these or weakening the gate without an owner decision. No dependency changes made. |
| Full interactive mobile flow | BLOCKED | The user declined acceptance of Privacy/Terms. No account was created. Authenticated checklist/profile/support flows therefore remain unexercised. The simulator locked during corridor cleanup, leaving the unsaved destination set to Ontario and its picker open; see `qa-artifacts/simulator-core-flow-2026-10-06-same-corridor.png`. |

### Defects and disposition

- The 2026-10-07 status-bar defect was fixed in onboarding and the matching re-consent screen. Onboarding was visually retested at the top and while scrolled; re-consent uses the same implementation but could not be entered without accepting updated legal terms.
- The mobile dependency audit failure is confirmed and remains a release blocker. It needs a reviewed dependency strategy rather than an automatic breaking upgrade.
- Remaining interactive work: finish a consented local onboarding session, then verify checklist expand/source/completion/reopen persistence, profile privacy presentation, fixed-question support behavior, relaunch/recovery, and the documented visual/accessibility cases. The current environment prevented this pass from reaching those flows.

## 2026-10-07 Simulator Retest

Retested the running app on the same iPhone 17 / iOS 26.5 simulator from the Expo development session. No application source or configuration files were changed.

| Check | Status | Evidence |
| --- | --- | --- |
| Onboarding route and current defaults | PASS | ReloGo remained on onboarding. Origin was Ontario, destination British Columbia, move date October 7, 2026, and both optional switches were off at the end of the test. |
| Missing-origin validation | PASS | Submitting with no origin displayed “Missing Info” and “Please select your origin province or territory.” |
| Missing-destination validation | PASS | After selecting Ontario as the origin, submitting with no destination displayed “Missing Info” and “Please select your destination province or territory.” |
| Future date selection | PASS | Selecting October 8 updated the date field; selecting “Today, Wednesday, October 7” restored the original date. Past dates remained disabled. |
| Vehicle and children switches | PASS | Both switches could be enabled and returned to off. The visible task hint text remained present. |
| Scrolled onboarding/status bar | FIXED / PASS | The overlap was reproduced, then onboarding and re-consent were updated to keep scrolled content out of the status-bar safe area and switch icon contrast with the background. Onboarding simulator retest showed no label/icon overlap. See `qa-artifacts/simulator-core-flow-2026-10-07-statusbar-fixed.png`. |
| Consent / account creation | BLOCKED | Left consent unchecked and stopped before account creation because doing so would accept the Privacy Policy and Terms. No account or backend record was created. |

Authenticated checklist, profile, support, persistence, and recovery flows remain untested because onboarding was not completed. No account was created; the previously reproduced visual issue has since been fixed and verified, while the dependency audit remains a release blocker.

## 2026-10-07 Fix Verification

The full-test request authorized fixing application defects. Onboarding and re-consent now update status-bar contrast and cover the device safe area as the blue hero scrolls away. The date picker uses `onValueChange` and `onDismiss` instead of deprecated `onChange`.

| Verification | Status | Evidence |
| --- | --- | --- |
| Mobile Jest | PASS | 16 suites, 165 tests, including four status-bar threshold tests. |
| TypeScript | PASS | `npm run typecheck`. |
| ESLint | PASS | `npm run lint`. |
| Release configuration | PASS | `npm run check:release`. |
| Expo Doctor | PASS | 21/21 checks. |
| iOS bundle export | PASS | 1,669 modules; Hermes bundle 4.6 MB at `/tmp/relogo-ios-final`. |
| Android bundle export | PASS | 1,763 modules; Hermes bundle 4.8 MB at `/tmp/relogo-android-final`. |
| Local launcher tests | PASS | `python3.11 scripts/test-run-local-app.py`: 13/13. |
| Simulator visual regression | PASS | White status icons over the blue hero at the top; dark icons over the light safe-area cover while scrolled. The form label no longer renders behind the system status bar. |
| Updated date picker | PASS | On iPhone 17 / iOS 26.5, selected October 8 then restored October 7. Metro emitted no new `onChange` deprecation warning after the callback update. |
| Local Supabase REST | PASS | Loopback REST endpoint returned HTTP 200. No account or database row was created. |
| Production dependency audit | FAIL (release blocker) | `npm audit --omit=dev --audit-level=high` reports 23 high and 7 moderate vulnerabilities. Its suggested force fix upgrades Tailwind CSS or Expo Updates across breaking versions; no forced dependency change or audit bypass was made. |
| Authenticated app flows | BLOCKED | No legal acceptance was recorded. Checklist, profile, support, and account persistence cannot be reached through the app without completing onboarding. |

The onboarding visual fix is verified on the simulator. The remaining audit and authenticated-flow blockers prevent claiming a complete, all-green application test.

## 2026-10-07 Dependency Audit Recheck

A fresh registry audit still reports 23 high and 7 moderate findings. The installed `braces@3.0.3` and `node-forge@1.4.0` are within the affected ranges reported by npm (`braces <=3.0.3`, `node-forge <=1.4.0`). `npm audit fix --dry-run --omit=dev` offered no non-breaking path to clear them; npm's suggested package upgrades are major-version changes. No dependency or lockfile change was made because the handoff prohibits forced framework upgrades or relaxing the production gate without an owner decision.

## 2026-10-07 Consented Local Simulator Flow

The user explicitly authorized accepting the app consent for this local test and asked for a full test without application fixes. The consent checkbox was accepted in the running iPhone 17 / iOS 26.5 simulator; onboarding created a test account against local Supabase. This supersedes earlier entries that said the authenticated flow was blocked. No production backend was used, no account deletion was performed, and no application source/configuration was changed during this simulator pass. Test profile values were synthetic; their literal values are intentionally omitted.

| Check | Status | Observation |
| --- | --- | --- |
| Consent and local onboarding | PASS | Accepted consent as explicitly authorized for this local test; Ontario → British Columbia onboarding completed against local Supabase. |
| Conditional checklist generation | PASS | Five tasks appeared, including the vehicle registration and school enrollment tasks after enabling both corresponding onboarding options. Required/optional labels were displayed. |
| Task details and official source | PASS | Driver's licence task expanded with due date, guidance, and an “Open ICBC official website” link. Link opened ICBC's driver licensing page in the simulator browser. |
| Completion, undo, and progress | PASS | Marking the driver's licence task complete changed progress from 0/5 (0%) to 1/5 (20%) and moved it to Completed. Unmarking returned progress to 0/5; marking it again restored 1/5. Single accessibility clicks worked in the extended run. A double-click automation action initially toggled two tasks as the list reflowed, so subsequent checks used one click followed by a fresh accessibility state. |
| Profile and move details persistence | PASS | Profile showed Ontario → British Columbia, vehicle and children enabled, and the selected move date. Saving the synthetic profile displayed the on-device storage confirmation; saving move details displayed the update confirmation. |
| Privacy presentation | PASS | Profile states personal information is stored only on the device and never uploaded to the app's servers. Sensitive card/licence fields were masked. No real personal information was entered. |
| Checklist progress across tabs | PASS | After changing to Profile and back, completed-task progress remained at 1/5 (20%). The test checkbox was then reset to incomplete; simulator ended at 0/5. |
| Session/reopen persistence | PASS | Returning from the official-source browser via the app switch/reopen path restored the signed-in app and its checklist. |
| Fixed support question and fallback | PARTIAL | Submitted the fixed question “Which tasks are mandatory for my move?” The local support flow safely showed its human follow-up fallback when the AI response was unavailable; the thread remained visible after leaving and reopening the support screen. An AI-generated answer was not obtained. The support function may send its fixed question plus non-PII corridor/task context to the configured Gemini provider; profile PII was not entered into support. |
| Destructive account deletion | NOT RUN | Deliberately not tested because it would delete the local account, checklist progress, and on-device profile data. |
| Production dependency audit | FAIL (release blocker) | The separate production dependency audit remains at 23 high and 7 moderate findings, as recorded above. |

The remaining test limitation is the support AI provider response; the app's safe fallback and local thread persistence worked. The full simulator smoke flow passed for onboarding, checklist generation and task controls, profile save/privacy, tab persistence, and session recovery. The independent production dependency audit still prevents an all-green release assessment.

## 2026-10-07 Simulator Guide-Aligned Extended Pass

Read `docs/ai/SIMULATOR_TESTING_GUIDE.md` and applied its four critical journeys to the actual app and the more detailed `docs/QA_TEST_PLAYBOOK.md`. The guide's AI example asks “What documents do I need for a health card?”, which is not one of the app's six allowlisted questions; the live test used the exact in-app allowlist instead. The guide's generic screen strings were treated as examples, and visible current app behavior was checked against the repository playbook. No app source/configuration files were changed.

| Test area | Status | Evidence |
| --- | --- | --- |
| Checklist completion and all-done state | PASS | Single-clicked all five tasks; progress reached 5/5 (100%) and the “All set for the move!” celebration appeared. Undo removed the celebration and reduced progress to 4/5 (80%). Multiple task details remained expanded together. All checkmarks were later cleared and the app ended at 0/5. |
| Vehicle/children filtering | PASS | Saved both options OFF and verified the checklist shrank from five tasks to three, removing vehicle registration and school enrollment. Re-enabled and saved both options; the five-task corridor returned. |
| Profile same-jurisdiction guard | PASS | Changed destination to Ontario to match origin and saved. App showed “Same jurisdiction” with the expected different-provinces message. Restored British Columbia without a profile change from the invalid save. |
| Support allowlist, no free text, and human-state behavior | PASS | Verified all six exact question buttons and no text entry control. After the existing thread had escalated, submitted another allowlisted question; it persisted and the AI remained stepped aside. |
| Sign-out and deletion warnings | PASS (cancel paths) | Both warning dialogs showed their expected copy. Cancel preserved the local account, PII vault, and checklist. The irreversible “Delete Everything” confirmation was not executed. |
| Local Supabase pgTAP | FAIL (fixture contamination) | `supabase test db --local`: `admin_membership_test.sql` and `corridor_resolution_and_integrity_test.sql` passed. `rls_and_rpcs_test.sql` failed test 65 because its admin fixture expected three support threads but the already-running local database contained four. A later scalar subquery also found multiple matching support messages, so the file stopped before its planned 167 assertions. The local database was not reset because it contains the active simulator test account and thread. This is a test-isolation/environment failure; no migration or test source was changed. |
| Current mobile checks | PASS / FAIL | Jest: 16 suites / 165 tests; TypeScript, ESLint, release config, Expo Doctor (21/21), local launcher tests (13/13), iOS export (1,669 modules / 4.6 MB), and Android export (1,763 modules / 4.8 MB) passed. `npm run audit:production` failed closed on high-severity dependency findings; the earlier audit detail remains 23 high and 7 moderate. |

### Remaining unverified playbook scope

- No VoiceOver announcement/TalkBack pass, Dynamic Type XXXL, dark appearance, compact-device layout, or full multi-device visual matrix was performed. The live pass covered iPhone 17 / iOS 26.5 and, in the Android section below, Medium_Phone / Android 17. An iPad attempt is recorded below but did not reach the app.
- Android network fault injection verified A-06/A-07 profile retry and D-14/J-03 task rollback, including the unchanged server-side task row. A-04's isolated SecureStore restoration timeout, stale-consent/re-consent fixture, invalid deep link, and destructive account deletion were not executed.
- Support AI did not return a model answer; only the PII-safe local fallback/escalation behavior was verified. Admin reply/resolve/reopen was not exercised.
- Landing site, admin browser operations, and the complete release gates in Suite Z remain unverified by this simulator run.

The guide-aligned test run expands the verified app journeys but does not make all suites green. Current outstanding evidence is the contaminated local pgTAP run, the production dependency audit, unavailable AI/admin response, remaining device/accessibility and release-matrix cases, and network scenarios beyond the Android retry and rollback cases verified above.

### Accessibility setting attempt

On 2026-10-07, the Device Hub slider attempt could not change Dynamic Type, so no result came from that interaction. A later direct simulator setting to XXXL did show the existing Profile screen behind an OS deep-link confirmation: the `My Profile` header and account buttons (`Help & support`, `Sign Out`, `Delete My Data`) visibly truncated. This is recorded as an iOS visual defect with the system alert noted as a screenshot caveat; see `qa-artifacts/iphone17-xxxl-profile-under-link-confirmation-2026-10-07.png`. The iPhone was returned to medium text and light appearance. No app code or settings files were changed.

## 2026-10-07 Android Emulator Pass

Started the available `Medium_Phone` AVD (Android 17 / API 37). `python3.11 scripts/run-local-app.py mobile -- --android` could not attach because Metro was already using port 8081 and Expo's port prompt was non-interactive. Restarted the Android entry point on port 8082 with the process-only local Supabase override. Expo Go 55.0.7 was replaced by the Expo CLI's recommended Expo Go 57.0.9 for SDK 57. No repository application files were edited.

| Test area | Status | Evidence |
| --- | --- | --- |
| Android local onboarding | PASS | First-run screen rendered; selected Ontario → British Columbia, October 7, 2026, and enabled vehicle and children options. After the user's instruction to agree for the local test, accepted the displayed consent and built the checklist against local Supabase. Five tasks appeared. |
| Consent document link | PARTIAL | Tapping Terms of Service launched Chrome. Chrome showed its first-run screen, so the actual terms page was not verified on Android. |
| Checklist completion and persistence | PASS | First task changed 0/5 → 1/5 and undo returned 1/5 → 0/5. Profile → Checklist navigation retained 0/5. Final Android state was restored to 0/5. |
| Android profile/support presentation | PASS (display only) | Profile presented the on-device storage statement. Help showed exactly six preset questions and no editable text field. No support question was submitted on Android. |
| A-06/A-07 offline profile recovery and retry | PASS | With the emulator's port-54321 ADB reverse removed and only Metro port 8082 left forwarded, a cold Expo Go relaunch with the locally stored session showed “Couldn't reach ReloGo / Check your connection and try again” and “Retry loading your profile,” without routing to onboarding. Restoring the Supabase tunnel and tapping Retry returned to the 0/5 checklist. A-04's separate authentication-session restoration timeout was not isolated in this run. |
| D-14 / J-03 offline task rollback | PASS | With port 54321 reverse removed (confirmed by `adb reverse --list`), toggling the first task briefly displayed 1/5. A read-only local DB query showed its row remained `AVAILABLE`; the app displayed “Update failed / Couldn't save your progress. Please try again.” Dismissing the alert returned the UI to 0/5, and the DB row stayed `AVAILABLE`. Restored the tunnel afterward. |
| Android official-link navigation | PARTIAL | Expanded the driver's licence task and tapped “Open ICBC official website”; Android launched Chrome's first-run activity, so the destination page itself could not be inspected. Back navigation returned to ReloGo with 0/5 progress intact. The Terms link also opened Chrome's first-run activity. |

The Android emulator was left running with the Supabase reverse tunnel restored. Its synthetic anonymous test account remains present; no account or database reset was performed.

## 2026-10-07 iPad Attempt

The iPad Pro 13-inch (M5), iOS 26.5, eventually completed first boot. Expo Go 57.0.9 was installed from the matching iPhone simulator app bundle. Opening the verified local iOS Metro URL with `simctl openurl` brought up iPadOS's `Open in “Expo Go”?` confirmation. The Mac is locked and Device Hub cannot control the native UI, so that system confirmation could not be accepted and ReloGo did not load. Screenshot: `qa-artifacts/ipad-open-in-expo-go-2026-10-07.png`. The iPad form-factor assertions remain BLOCKED by the required simulator UI confirmation; this is not an app failure.

## 2026-10-07 Continued Full-Scope Pass

This continuation used the current working tree and left all application source/configuration files unchanged. Only QA evidence files and this report were updated. Local backend availability changed: `supabase status` fails because Docker Desktop cannot start, and `http://127.0.0.1:54321/rest/v1/` does not respond. The CLI's saved link points to a hosted project, so no linked/hosted Supabase command was run. Backend-dependent tests below are BLOCKED until local Supabase is available.

| Test area | Status | Evidence |
| --- | --- | --- |
| H-02 iOS XXXL | FAIL | `simctl ui` set XXXL. In the visible Profile screen, the header and three Account action labels truncate. Screenshot includes an OS deep-link confirmation over the app, so the visible truncation is noted with that caveat. |
| H-02 Android XXXL | BLOCKED | Setting Android `font_scale` to 2.0 caused Expo Go to show `New update available, downloading…`; the ReloGo screen was not stable for layout assertions. Font scale was restored to 1.0. |
| H-03 Android dark appearance | PASS | Android remained on the app's intentional light palette when system night mode was enabled. Restored night mode to `no`; see `qa-artifacts/android17-dark-checklist-2026-10-07.png`. |
| H-03 iOS dark appearance | PARTIAL | The underlying app remained light while the OS confirmation was shown in dark appearance; full app screen interaction was not possible. See `qa-artifacts/iphone17-dark-profile-under-link-confirmation-2026-10-07.png`. |
| A-06 / J-01 Android offline cold launch | PARTIAL | Cold Expo Go launch showed `Getting your checklist ready…` before the expected `Couldn't reach ReloGo` / `Check your connection and try again.` / `Retry` screen. Metro/Expo bundle startup took about 24 seconds, so the app's 5-second profile timeout could not be isolated from the dev-client startup. Error screen contains no URL, key, SQLSTATE, or raw backend message. See `qa-artifacts/android17-offline-recovery-2026-10-07.png`. |
| I-04 Retry touch target | PASS (one control) | UIAutomator exposed `Retry loading your profile` as an enabled button. At 420 dpi its 236×120 px bounds are about 90×46 dp, meeting the playbook's 44×44 dp minimum. This is not a full-screen touch-target audit. |
| Error sanitization on offline profile check | PASS (app card) | UIAutomator found only the friendly retry title/body/button in ReloGo. Expo Go's developer overlay separately displayed the app's sanitized development diagnostic (`fatal (auth)` / `unexpected error`); no SQLSTATE, project URL, credential, stack, or underlying service text appeared in the app recovery card. |
| K-01 landing desktop | PASS | Local Next.js dev page returned 200 and matched the ReloGo/Coming soon assertions; screenshot `qa-artifacts/landing-K01-desktop-2026-10-07.png`. |
| K-02 landing mobile | PASS | 390×844 viewport had no horizontal overflow; screenshot `qa-artifacts/landing-K02-mobile-2026-10-07.png`. |
| K-03 / K-04 waitlist corridor behavior | PASS | Same-province notice kept email disabled; changing to AB → BC revealed the enabled email form. |
| K-05 invalid email | PARTIAL | `test@` was rejected by the browser's native `type=email` validity message. The playbook's specified inline error copy did not render in Chromium; screenshot `qa-artifacts/landing-K05-invalid-email-2026-10-07.png`. |
| K-06 / K-07 waitlist insert and duplicate | BLOCKED | Local Supabase was unavailable, so no success, duplicate, throttling, or enumeration behavior could be validated against the local RPC. A valid synthetic test address was attempted only in the first dev session with explicit localhost environment variables; the subsequent bundle audit confirmed the compiled dev client target was `127.0.0.1:54321`, and no successful waitlist confirmation was observed. All later browser checks used an isolated `/tmp` copy with a local-only route guard; zero external requests were attempted. |
| K-08 privacy, terms, support pages | PASS | All three local pages returned 200 with rendered copy. |
| L-01 unauthenticated admin | PASS | Local Vite page returned 200 with email/password login; screenshot `qa-artifacts/admin-L01-login-2026-10-07.png`. |
| L-02 invalid admin credentials | BLOCKED | Test used only a dummy address/password and the local Supabase URL; auth service was unavailable, so it could not distinguish invalid-credential behavior from backend outage. The route-guarded browser run attempted no external request. |
| Landing/admin lint and builds | PASS / WARN | Isolated local-config landing lint/build succeeded. Admin lint/build succeeded; lint reported one existing `react-hooks/set-state-in-effect` warning in `MessagesTable.tsx`. |
| Mobile automated checks | PASS | Jest 16 suites / 165 tests, TypeScript, ESLint, release-config check, launcher tests 13/13, and Expo Doctor 21/21 passed. Local-config Expo exports passed: iOS 1,669 modules / 4.6 MB; Android 1,763 modules / 4.8 MB. |
| Production dependency audit | FAIL | `npm run audit:production` fails closed; `npm audit --omit=dev` reports 23 high and 7 moderate findings. No dependency or lockfile changes were made. |

### Remaining full-playbook coverage

The earlier iPhone and Android core-flow results remain recorded above. Still unverified or blocked are local database pgTAP after a clean fixture, privacy-table zero-row checks, destructive deletion and sign-out teardown, offline recovery with the local backend restored after this environment change, successful/duplicate waitlist RPC, authenticated admin views/actions, admin reply/resolve/reopen, support AI answer and live admin response, iPad/small-device visual matrix, TalkBack/VoiceOver announcements, full touch-target audit, deep-link/back/long-background/timezone cases, and Suite Z release gates. Account deletion was not executed; its final confirmation would erase simulator account data. No production service was contacted during this continuation.

## 2026-10-07 Additional Android Offline and Accessibility Retest

The local Metro server was live on port 8082 (`/status` returned HTTP 200), but local Supabase REST on port 54321 timed out. A fresh check confirmed the Android emulator still held its synthetic signed-in session and had the Metro and local Supabase ADB reverses configured. No production service was contacted.

| Test area | Status | Evidence |
| --- | --- | --- |
| A-06 / J-01 cold offline recovery timing | FAIL (latency) | Force-stopped Expo Go without clearing its data, then launched the same local project with the saved session and unavailable local Supabase. UIAutomator first observed “Getting your checklist ready…” at 44.3s after the deep-link launch and still observed it at 55.4s; the “Couldn't reach ReloGo” retry card appeared by 60.8s. This confirms the checklist loading state remained visible for more than 11 seconds, exceeding the playbook's 5-second A-06 profile-check bound. The app preserved the session and did not route to onboarding. Timing includes Expo Go and Metro startup, so it is not a release-build launch benchmark. Screenshot: `qa-artifacts/android17-startup-recovered-2026-10-07.png`. |
| Recovery retry control accessibility | PASS (control metadata) | Android UIAutomator exposed an enabled, clickable button named “Retry loading your profile”, with bounds 236×120 px at 420 dpi (about 90×46 dp). Tapping it while Supabase was down returned to the same friendly retry state. |
| Error details shown to user | PASS in app / DEV overlay caveat | The app card showed only the friendly connection message, with no SQLSTATE, project URL, or backend function detail. Expo Go's development-only notification separately exposed the generic text `[ReloGo] fatal (auth): Error: An unexpected error occurred.`; this was not the app's recovery-card copy. |
| Loading accessibility label after recovery | OBSERVATION (needs TalkBack confirmation) | After the retry card was visible, UIAutomator still exposed the full-screen content description “Loading your ReloGo checklist” alongside the retry control. TalkBack was not enabled, so an actual spoken announcement was not verified. |
| H-02 Android font scaling | BLOCKED | A 1.3 system font-scale change triggered an Expo Go reload; the app showed its native splash during the capture and did not provide a stable scaled checklist/profile screen for layout assertions. Font scale was restored to 1.0 and the app recovered to the retry card. Evidence of the reload: `qa-artifacts/android17-landscape-2026-10-07.png`; restored-screen evidence: `qa-artifacts/android17-startup-recovered-2026-10-07.png`. |
| H-05 Android orientation | PARTIAL | With auto-rotation disabled and landscape requested, UIAutomator continued to report portrait rotation, consistent with the app's declared portrait orientation. The app was in its splash/reload phase during this attempt, so this confirms the orientation lock but not post-load layout behavior. The emulator's original auto-rotation setting was restored. |
| iOS interaction availability | BLOCKED | A read-only screenshot of the booted iPhone showed an iOS confirmation sheet (“Open in ‘ReloGo’?”) over onboarding. The native UI remained inaccessible through Device Hub while macOS was locked, so no action was taken on that system sheet. Evidence: `qa-artifacts/iphone17-current-2026-10-07.png`. |

The Android emulator was left with font scale 1.0, automatic rotation enabled, and the local project on its retry screen. The iPhone simulator was left with its system confirmation sheet unchanged. App source, configuration, and database state were not modified in this retest.

### Additional deep-link check

| Test | Status | Evidence |
| --- | --- | --- |
| M-03 invalid route deep link | FAIL (routing assertion) | Opened `exp://127.0.0.1:8082/--/invalid-path` in Expo Go. The app did not crash, but rendered Expo Router's “Unmatched Route / Page could not be found” screen with the invalid URL and “Go back”/“Sitemap” actions instead of falling back directly to the root routing gate as the playbook expects. Tapping “Go back” restored the app's offline retry card. Screenshot: `qa-artifacts/android17-invalid-deep-link-2026-10-07.png`. |
| M-01 authenticated checklist deep link | BLOCKED | Opened `exp://127.0.0.1:8082/--/checklist` with the existing local session. The app displayed the profile retry card while Supabase was unavailable, so the target checklist route could not be confirmed. Screenshot: `qa-artifacts/android17-checklist-deep-link-2026-10-07.png`. |

These routes were tested through Expo Go's local deep-link form; they are development-session checks and do not replace the packaged-build scheme checks in Suite M.

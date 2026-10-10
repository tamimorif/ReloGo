# iPhone simulator QA — 2026-10-09 (in progress)

## Environment

- Device: iPhone 17, iOS 26.5, Device Hub
- App: ReloGo in Expo Go on iPhone 17; fresh Metro session from `scripts/run-local-app.py` at `http://192.168.2.64:8082`, offline mode, local Supabase process-only override. Metro bundled 1,834 modules and `/status` returned HTTP 200.
- Appearance/text size restored to light/medium; device restored to upright portrait.
- Local Supabase at `127.0.0.1:54321` is healthy (REST HTTP 200). `supabase db reset --local` completed migrations 001–028 and the local seed.
- Docker Desktop recovered after its stuck backend was stopped and the app reopened; engine responds as Docker 29.8.2. The earlier approved **Clean up data** action had not recovered it. No factory reset was needed.
- The generated `mobile/node_modules` tree was reinstalled from the existing lockfile per the guide's Metro troubleshooting step. Dataless-file count is now 0 and `xmlbuilder.create` resolves as a function. No tracked source/configuration or package files were changed; no hosted Supabase target was contacted.

## Results

| Case | Status | Result |
| --- | --- | --- |
| A-01 | PASS after recovery | The initial 8081 server produced an Expo Go open timeout and then an `xmlbuilder` HTTP 500. After reinstalling generated mobile dependencies and starting the local-only server on 8082, Expo Go cold-opened onboarding, Metro bundled 1,834 modules, and a second cold reopen returned to onboarding without raw error text. Evidence: `A-01-runtime-error.png`, `A-01-recovered.png`. |
| B-01 | PASS | Initial onboarding showed empty origin/destination pickers, October 9, 2026, both switches off, consent unchecked, and disabled grey submit. |
| B-02 | PASS | Origin list exposed all 13 provinces and territories. |
| B-03 | PASS | Opening the destination picker collapsed the origin picker. |
| B-04 | PASS | Form showed Ontario → British Columbia after selection. |
| B-05 | PASS | Inline October 2026 calendar opened; dates before October 9 were disabled and October 9 was selected. |
| B-06 | PASS | Empty submission displayed `Missing Info` / `Please select your origin province or territory.` Evidence: `B-06-empty-form.png`. |
| B-07 | PASS | Origin-only submission displayed `Missing Info` / `Please select your destination province or territory.` Evidence: `B-07-origin-only.png`. |
| B-08 | PASS | Destination-only submission displayed `Missing Info` / `Please select your origin province or territory.` Evidence: `B-08-destination-only.png`. |
| B-09 | PASS | Ontario → Ontario displayed `Same jurisdiction` / `Origin and destination must be different provinces or territories.` Evidence: `B-09-same-jurisdiction.png`. |
| B-10 | PASS | Ontario → British Columbia with consent unchecked displayed `Consent Required` / `Please agree to the Privacy Policy and Terms of Service to continue.` Local `auth.users` count was 0 before and after. Evidence: `B-10-consent-required.png`. |
| S-01 | PARTIAL | With simulator appearance set to dark, onboarding remained light and status-bar text/icons were legible. Checklist/Profile unavailable before consent. Evidence: `S-01-dark-onboarding.png`. |
| S-02 | PARTIAL; issue observed | At XXXL on onboarding, the switch descriptions clipped (`We'll add licence & registration task…`, `We'll add school enrollment & child…`) and the submit label truncated to `Build My Check…`. Profile/Support/Checklist remain unvisited. Evidence: `S-02-xxxl-onboarding.png`. |
| S-03 | PARTIAL | Onboarding content stayed within the notch and home-indicator safe areas at medium text size. Checklist header and Support composer not visited. |
| S-04 | FAIL in Expo Go | Device Hub rotation changed the ReloGo screen to landscape and upside-down portrait despite `mobile/app.json` declaring `orientation: "portrait"`. Restored upright portrait. Evidence: `S-04-landscape.png`. |
| M-02 | PASS | Opening the signed-out `checklist` deep link returned to Onboarding. Evidence: `M-02-signed-out-checklist-link.png`. |
| M-03 | OBSERVATION | Invalid route showed the documented `Unmatched Route` / `Page could not be found.` screen with `Go back`, matching the guide's known deviation. Evidence: `M-03-invalid-route.png`. |

## Blocked / not run

- B-11–B-15, checklist/profile/support/re-consent, signed-in deep links, database-backed account flows, privacy sweeps, offline recovery, and teardown remain unrun because the next onboarding action would accept the in-app Privacy Policy/Terms and create the local test account. Awaiting action-time user confirmation before that consent action.
- Optional B-13 public legal-page navigation was skipped to keep this run local.
- No consent was accepted, no anonymous account was created/deleted, and no dummy PII was entered. Local account count remains 0.

## Handoff

Local Docker, Supabase, and Metro are recovered. Continue from the unchecked onboarding consent box after receiving action-time confirmation; then run B-11 onward and the account-dependent guide phases. Keep using local Supabase only and preserve unrelated working-tree changes. Metro is still running on port 8082 for continuation.

# ReloGo QA Test Playbook (Human + Autonomous AI Visual Agent)

_Last updated: 2026-09-13 · Applies to repository tree with migrations 001–028 (local; 027–028 unhosted), mobile version 1.0.1 / Expo SDK 55, landing site, and admin dashboard._

This document is the **canonical, agent-executable test playbook** covering every user-reachable behavior, UI flow, visual edge case, and accessibility trait across the ReloGo stack. It is structured so that either a **human QA tester** or an **autonomous AI agent driving an iOS Simulator, Android Emulator, or web browser** can step through every case, execute the exact actions, capture visual evidence, and verify on-screen assertions.

---

## 0. Playbook Architecture & Rules of Engagement

### 0.1 Reader Roles

| Role | Responsibility |
| --- | --- |
| **Autonomous AI Agent** | Execute suites sequentially by Test ID. Capture high-fidelity screenshots at each step. Evaluate visual assertions against exact screen copy, colors, badges, and layout bounds. Record PASS / FAIL / BLOCKED in the standardized test ledger. |
| **Human QA Engineer** | Perform exploratory verification, physical device sweeps (touch feel, haptics, system keyboards), and sign-off on visual polish. |
| **Release Gatekeeper** | Review Suite Z (Release Gates). No store submission or production deployment can occur without 100% pass on all P0/P1 gates on the candidate binary. |

### 0.2 Cardinal Rules for Autonomous AI Agents

1. **Never Invent UI**: If an element described in this playbook is missing from the screen, mark the test as **FAIL (missing UI)**. Do not skip or assume an alternative flow.
2. **Never Violate Privacy**: Personal identifiable information (PII) — Full Name, Date of Birth, Street Address, Health Card Number, Driver's Licence Number — **never leaves the device**. When testing input fields, use only documented test fixtures (e.g., `Jane Doe`, `123 Main St`). Never write PII to Supabase, logs, crash reports, or support chats.
3. **Never Mask Errors**: If an unexpected raw error string, stack trace, PostgreSQL error code (e.g. `23505`, `42501`), Supabase project URL, or API key appears on screen, mark **FAIL (Privacy / Security Leak)**. All errors in ReloGo must render user-friendly, privacy-safe recovery copy.
4. **Timeout Enforcement**: The app enforces strict timeout bounds (3s session restore, 5s profile check, 8s checklist query, 10s onboarding). If a loading spinner remains visible longer than the documented bound, mark **FAIL (Hang / Unbounded Spinner)**.
5. **Preserve Repository Integrity**: Never edit database migrations, backend code, or app source code to force a test to pass.
6. **Artifact Storage**: Save every visual capture to:
   `qa-artifacts/<suite>/<test-id>/<step-number>-<device-config>-<timestamp>.png`

---

## 1. System Under Test (SUT)

| Component | Path | Tech Stack | Target Environment | Visual Test Surface |
| --- | --- | --- | --- | --- |
| **Mobile App** | `mobile/` | Expo SDK 55, React Native 0.83, React 19, expo-router, NativeWind | iOS Simulator, Android Emulator, physical devices | Full mobile UI (Onboarding, Re-consent, Checklist, Profile, Support Chat) |
| **Landing Site** | `landing/` | Next.js 16 static export, React 19, Tailwind CSS | Desktop & mobile web browsers | Marketing homepage, responsive waitlist form, legal pages (`/privacy`, `/terms`, `/support`) |
| **Admin Dashboard** | `admin/` | Vite 5 SPA, React 18, Tailwind CSS | Desktop web browser | Authenticated operations (Alerts, Users, Support Messages, Waitlist) |
| **Backend & Edge** | `supabase/` | Postgres 15, PostgREST, RLS, RPCs, Deno Edge Function | Local Supabase (`http://127.0.0.1:54321`) | Verified end-to-end through Mobile, Landing, and Admin surfaces |

### 1.1 Intentional Design Boundaries (Do NOT Report as Bugs)

| Feature / Element | Status | Technical Rationale |
| --- | --- | --- |
| **PDF Download / In-App Fill Button** | **Does not exist in UI** | `mobile/lib/pdfEngine.ts` and `pdfTemplates.ts` are library modules preserved for Phase 2 (direct government integration). No button exists in 1.0.1. |
| **Free-text Support Message Input** | **Does not exist** | Support chat strictly uses 6 allowlisted questions. Free-text inputs are excluded by architecture to guarantee zero PII leaves the device into support logs. |
| **Email/Password Sign-Up in Mobile** | **Does not exist** | Mobile uses anonymous authentication only. No login or password fields exist in the mobile app. |
| **Tablet/iPad Customized Layout** | **Renders phone-optimized UI** | `supportsTablet: true` is enabled in `app.json` for App Store compliance, but renders centered phone layout without clipping. |
| **App Theme in System Dark Mode** | **Remains clean light palette** | The app hardcodes a clean light theme (`bg-slate-50`, white cards). Dark mode must preserve high contrast and legibility without turning dark. |
| **Landing Page "Coming Soon" Badge** | **Expected** | Marketing site reflects pre-launch status. |

---

## 2. Environment Setup & Launch Commands

### 2.1 Backend Target Selection

For autonomous QA runs, **Local Supabase** is the primary, authorized backend. It enables fast resets, custom test fixtures, and destructive actions without impacting live services.

```bash
# 1. Start local Supabase (from repo root)
supabase start

# 2. Reset database and apply migrations 001-027 + seed.sql
supabase db reset --local

# 3. Seed local admin user for Suite L (Admin Dashboard)
# Default seed provides an admin user: admin@relogo.ca / AdminTestPassword123!
```

### 2.2 Mobile App Setup & Execution

```bash
cd mobile

# Configure environment pointing to local Supabase
cat <<EOF > .env
EXPO_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
EXPO_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0
EXPO_PUBLIC_LEGAL_SITE_URL=http://localhost:3000
EOF

# Install dependencies
npm ci

# Launch on iOS Simulator or Android Emulator
npx expo start --ios
# or
npx expo start --android
```

### 2.3 Landing & Admin Web Applications

```bash
# Landing Site (Terminal 1)
cd landing
npm ci
npm run dev # Runs at http://localhost:3000

# Admin Dashboard (Terminal 2)
cd admin
npm ci
npm run dev # Runs at http://localhost:5173
```

---

## 3. Simulator Automation & Visual Inspection Recipes

Autonomous AI agents driving the simulator should use these native CLI recipes to inspect, navigate, and capture screens.

### 3.1 iOS Simulator (`xcrun simctl`)

```bash
# List available devices
xcrun simctl list devices available

# Boot specific device
xcrun simctl boot "iPhone 16 Pro"

# Capture screenshot directly to artifact path
mkdir -p qa-artifacts/suite-a/A-01
xcrun simctl io booted screenshot qa-artifacts/suite-a/A-01/01-boot.png

# Open deep link / URL
xcrun simctl openurl booted "relogo://checklist"

# Toggle Dark / Light appearance
xcrun simctl ui booted appearance dark
xcrun simctl ui booted appearance light

# Adjust Dynamic Type (Accessibility Text Size)
xcrun simctl ui booted content_size extra-extra-extra-large
xcrun simctl ui booted content_size medium

# Terminate and Relaunch App
xcrun simctl terminate booted com.relogo.app
xcrun simctl launch booted com.relogo.app
```

### 3.2 Android Emulator (`adb`)

```bash
# Capture screenshot
mkdir -p qa-artifacts/suite-a/A-01
adb exec-out screencap -p > qa-artifacts/suite-a/A-01/01-android-boot.png

# Tap coordinates
adb shell input tap 300 800

# Type text into focused input
adb shell input text "Jane%sDoe"

# Trigger Hardware Back Button
adb shell input keyevent 4

# Toggle Dark Mode
adb shell "cmd uimode night yes"
adb shell "cmd uimode night no"

# Send Deep Link
adb shell am start -a android.intent.action.VIEW -d "relogo://checklist" com.relogo.app

# Force Stop and Launch
adb shell am force-stop com.relogo.app
adb shell monkey -p com.relogo.app -c android.intent.category.LAUNCHER 1
```

---

## 4. Device & Viewport Test Matrix

| Matrix ID | Device / Environment | Resolution / Dp | Primary Focus Area |
| --- | --- | --- | --- |
| **CFG-01** | **iPhone 16 Pro (Default Baseline)** | 402 × 874 pt | Standard iOS baseline, safe area insets, Dynamic Island. |
| **CFG-02** | iPhone SE (3rd generation) | 375 × 667 pt | Compact screen, vertical scrolling, keyboard overlap behavior. |
| **CFG-03** | iPhone 16 Pro Max | 440 × 956 pt | Wide viewport, card layout width, typography scaling. |
| **CFG-04** | iPad Pro 13-inch (Portrait) | 1024 × 1366 pt | Tablet render verification, absence of layout distortion. |
| **CFG-05** | Pixel 7 (Android Baseline) | 412 × 915 dp | Material ripple effects, Android native date picker dialog. |
| **CFG-06** | Small Android (Pixel 4a / 360dp) | 360 × 640 dp | Province picker 220px max-height scroll, keyboard dismissal. |
| **CFG-07** | High-Accessibility Font (XXXL) | 402 × 874 pt | Chip wrapping, button text clipping, multiline title reflow. |
| **CFG-08** | Dark Mode Enabled | 402 × 874 pt | Text contrast verification against light cards. |
| **CFG-09** | Desktop Browser (Chrome/Safari) | 1440 × 900 px | Landing site and Admin dashboard desktop grid. |
| **CFG-10** | Mobile Browser (Mobile Safari) | 390 × 844 px | Landing site responsive waitlist form and legal navigation. |

---

## 5. Global Test Data Matrix

| Corridor ID | Origin | Destination | Vehicle | Kids | Move Date Offset | Test Scenario Focus |
| --- | --- | --- | --- | --- | --- | --- |
| **D1** | Ontario (ON) | British Columbia (BC) | Yes | Yes | Today + 10 days | Comprehensive task set, mixed deadlines, vehicle + dependent tasks. |
| **D2** | Alberta (AB) | British Columbia (BC) | Yes | No | Today + 45 days | Vehicle-specific tasks included; dependent tasks excluded. |
| **D3** | Ontario (ON) | Quebec (QC) | No | No | Today + 2 days | Minimal task set; urgent deadline grouping. |
| **D4** | British Columbia (BC) | Ontario (ON) | No | Yes | Today - 30 days | Past move date; forces **Overdue** section with red badges. |
| **D5** | Yukon (YT) | Nunavut (NU) | No | No | Today + 365 days | Territory-to-territory long horizon. |
| **D6** | Saskatchewan (SK) | Manitoba (MB) | Yes | Yes | Today (0 days) | Boundary test: deadline matching today belongs in **Due Soon**, NOT Overdue. |
| **D7** | Ontario (ON) | Ontario (ON) | — | — | Today + 30 days | **Invalid**: same jurisdiction must trigger instant validation alert. |

---

## 6. Screen Inventory & UI Element Selectors

### 6.1 State & Routing Flow Diagram

```mermaid
stateDiagram-v2
    [*] --> AppLaunch
    AppLaunch --> ConfigErrorScreen: Missing / Malformed Supabase Config
    AppLaunch --> SessionRestoreErrorScreen: Session restore fails / times out (3s)
    AppLaunch --> AuthenticatedGate: Session exists or restored
    AppLaunch --> OnboardingScreen: No session exists (anonymous user)
    
    AuthenticatedGate --> ProfileCheckErrorScreen: Profile RPC fails / times out (5s)
    AuthenticatedGate --> OnboardingScreen: Signed in, but no profile exists
    AuthenticatedGate --> ReconsentScreen: Profile exists, consent version stale
    AuthenticatedGate --> MainTabsNavigator: Profile exists + current consent (1.1)

    ReconsentScreen --> MainTabsNavigator: Policies accepted
    ReconsentScreen --> OnboardingScreen: Account deleted / Signed out

    MainTabsNavigator --> ChecklistTab: Default initial tab
    MainTabsNavigator --> ProfileTab: User profile & device PII
    ProfileTab --> SupportChatScreen: "Help & support" button
    SupportChatScreen --> ProfileTab: "Go back" chevron
```

### 6.2 Element Reference & Accessibility Map

| Screen / Component | Element Description | Exact Accessibility Label / Role / Text | Expected Visual Style |
| --- | --- | --- | --- |
| **Global Loading** | Splash / Root Loader | `accessibilityLabel="Loading your ReloGo checklist"` | Blue spinner (`#2563EB`) + "Getting your checklist ready…" |
| **Config Error** | Recovery Card | Title: `This ReloGo build isn't configured` | Slate-900 bold title, Slate-500 explanatory body. No buttons. |
| **Auth Restore Error** | Session Error Card | `Couldn't restore your session` / `accessibilityLabel="Retry restoring your session"` | Blue button "Retry" (`bg-blue-600 px-8 py-3.5`). |
| **Profile Check Error**| Network Error Card | `Couldn't reach ReloGo` / `accessibilityLabel="Retry loading your profile"` | Blue button "Retry" (`bg-blue-600 px-8 py-3.5`). |
| **Crash Boundary** | Generic Recovery Screen | `Something went wrong` / `accessibilityLabel="Try again"` | Blue button "Try again". No error codes or stack traces. |
| **Onboarding** | Header Card | Title: `🇨🇦 ReloGo` | Large bold white text on `bg-blue-600` header banner. |
| **Onboarding** | Moving From Picker | `accessibilityLabel="Moving from: <selected or none selected>"` | Bordered input card; tap toggles nested 220px province list. |
| **Onboarding** | Moving To Picker | `accessibilityLabel="Moving to: <selected or none selected>"` | Mutually exclusive with Moving From picker. |
| **Onboarding** | Province Option | `accessibilityRole="radio"` / `accessibilityLabel="<Province Name>"` | Highlighted with `bg-blue-50` and blue bold text when selected. |
| **Onboarding** | Move Date Selector | `accessibilityLabel="Move date, <Formatted Date>"` | Opens iOS inline calendar or Android native date picker dialog. |
| **Onboarding** | Vehicle Switch | `accessibilityLabel="Bringing a vehicle?"` | Switch toggle: track turns `#93c5fd`, thumb turns `#2563eb` when ON. Subtitle: "We'll add licence & registration tasks". |
| **Onboarding** | Dependents Switch | `accessibilityLabel="Moving with kids?"` | Switch toggle. Subtitle: "We'll add school enrollment & child benefit tasks". |
| **Onboarding** | Legal Consent Box | `accessibilityRole="checkbox"` / `accessibilityLabel="I agree to the Privacy Policy and Terms of Service"` | 44pt touch box; checkmark fills solid blue (`#2563eb`). Links to Privacy & Terms. |
| **Onboarding** | Submit Button | Visible text: `Build My Checklist →` | Grey (`bg-slate-300`) when unconsented; solid blue (`bg-blue-600`) when consented. Spinner on submit. |
| **Re-consent** | Header & Card | Title: `Policy update` / "Sensitive details stay on this device" | Blue hero header with informational privacy container. |
| **Re-consent** | Accept Button | `accessibilityLabel="Accept the current policies and continue"` | Solid blue button; disabled while submitting. |
| **Re-consent** | Delete My Data | `accessibilityLabel="Delete My Data without accepting the updated policies"` | Red outline button (`border-red-200 bg-red-50 text-red-700`). |
| **Re-consent** | Sign Out Button | `accessibilityLabel="Sign out without accepting the updated policies"` | Slate text button (`text-slate-600`). |
| **Checklist** | Screen Header | Title: `Checklist` | Large 3xl title; route line: `Origin → Destination · Moving Date`. |
| **Checklist** | Progress Bar | `accessibilityRole="progressbar"` | Rounded track with blue fill proportional to `progress.pct`. |
| **Checklist** | Overdue Section | Header: `OVERDUE` (Red text `#dc2626`) | Pill with count in red (`bg-red-50 text-red-700`), hairline separator. |
| **Checklist** | Due Soon Section | Header: `DUE SOON` (Slate text) | Pill with count in grey (`bg-slate-200 text-slate-600`). |
| **Checklist** | No Deadline Section| Header: `NO DEADLINE` | Contiguous section for tasks with null deadline. |
| **Checklist** | Completed Section | Header: `COMPLETED` | Section for completed tasks with struck-through titles. |
| **Checklist** | Task Checkbox | `accessibilityRole="checkbox"` / `accessibilityLabel="Mark \"<Title>\" as done"` | Circular 44pt target; fills blue with white checkmark on tap. |
| **Checklist** | Task Body (Expand)| `accessibilityRole="button"` / `accessibilityHint="Shows or hides the task details"` | Tap toggles chevron up/down, description, and official sources. |
| **Checklist** | Official Source | `accessibilityRole="link"` / `accessibilityLabel="Open <Agency> official website"` | Slate rounded button with external link icon. |
| **Checklist** | 100% Celebration | `accessibilityLabel="All set for the move! Every task on your checklist is complete."` | Blue banner (`bg-brand-600`) with trophy icon. |
| **Profile** | Header | `headerTitle: "My Profile"` | Native blue navigation bar with white text. |
| **Profile** | Move Details Card | Header: `Move details` | Origin/Destination pickers, Move Date, Switches, and "Save Move Details" button. Subtitle for vehicle: "Adds licence & registration tasks". |
| **Profile** | Personal Info Card | Header: `Personal info` | Lock icon in green + "Stored only on this device — never uploaded to our servers." |
| **Profile** | 5 PII Inputs | Labels: Full name, Date of birth, New street address, Health card number, Driver's licence number | Last two fields are `secureTextEntry` (masked dots). |
| **Profile** | Save PII Button | Text: `Save On Device` | Blue button. Saves exclusively to device SecureStore. |
| **Profile** | Help & Support | Button text: `Help & support` | Pushes Support chat view (`/(tabs)/contact`). |
| **Profile** | Sign Out Button | Button text: `Sign Out` | Slate button with log-out icon. |
| **Profile** | Delete My Data | Button text: `Delete My Data` | Red container button (`border-red-200 bg-red-50 text-red-700`). |
| **Support Chat** | Header & Back | Title: `Help` / `accessibilityLabel="Go back"` | Chevron back button returns to Profile. |
| **Support Chat** | Privacy Banner | Text: "Questions are fixed and never include your personal details..." | Green container (`bg-green-50 text-green-800`). |
| **Support Chat** | Takeover Banner | Text: "We'll reply right here. The AI assistant has stepped aside." | Amber banner (`bg-amber-50 text-amber-800`) visible after human escalation. |
| **Support Chat** | Resolved Banner | Text: "This conversation is closed. Send a message to reopen it." | Grey banner (`bg-slate-100 text-slate-600`). |
| **Support Chat** | Talk to Human | Button text: `Talk to a human` | Visible only when status is `AI`. Hidden once escalated. |
| **Support Chat** | 6 Fixed Questions | Buttons in 2-column grid (`w-[49%]`) | Exact copy allowlist. Disabled and greyed during in-flight send. |

---

## Detailed Test Suites (A through M, Z)

---

### Suite A — Application Startup, Splash, Session & Recovery

| Test ID | Prerequisites | Step-by-Step Actions | Expected Visual & Functional Assertions |
| --- | --- | --- | --- |
| **A-01** | Clean simulator install (no local session, valid config). | 1. Cold launch ReloGo.<br>2. Observe splash screen.<br>3. Observe initial transition. | 1. Native splash `#2563EB` displays without distortion.<br>2. React paints root view within ~300ms, immediately releasing the native splash.<br>3. Brief loading indicator: spinner + "Getting your checklist ready…"<br>4. Routes cleanly to Onboarding within ≤3.0s.<br>5. No white flicker or raw "Loading ReloGo…" text appears. |
| **A-02** | Configuration error fixture (`EXPO_PUBLIC_SUPABASE_URL` unset or blank). | 1. Cold launch app with empty environment variables. | 1. Clean recovery card: title `This ReloGo build isn't configured`.<br>2. Body: `Install the latest release or contact ReloGo support. Your on-device personal information is unchanged.`<br>3. No red screen, no uncaught JS exception. |
| **A-03** | Malformed URL fixture (e.g. `https://example.supabase.co/path/v1`). | 1. Launch app with malformed origin in `.env`. | 1. Renders `This ReloGo build isn't configured` recovery card.<br>2. URL path/port/credentials are rejected by preflight validation. |
| **A-04** | Session exists in SecureStore, Network Blackholed / Airplane Mode. | 1. Launch app with existing session and offline connection. | 1. Within exactly 3.0 seconds, session restoration times out gracefully.<br>2. Renders recovery card: `Couldn't restore your session`.<br>3. Body: `Your local data is unchanged. Please try again.`<br>4. Blue button: `Retry` (`accessibilityLabel="Retry restoring your session"`). |
| **A-05** | On A-04 error screen. | 1. Restore network connection.<br>2. Tap `Retry` button. | 1. Button shows active press opacity.<br>2. Session restores and routes to Checklist or Profile without restarting the app. |
| **A-06** | Session exists, but `get_policy_consent_state` RPC unreachable. | 1. Block RPC or simulate slow 3G (>5s latency).<br>2. Launch app. | 1. Within exactly 5.0 seconds, profile check times out.<br>2. Renders recovery card: `Couldn't reach ReloGo`.<br>3. Body: `Check your connection and try again.`<br>4. Blue button: `Retry` (`accessibilityLabel="Retry loading your profile"`).<br>5. **Crucial**: App must NOT assume "new user" or route to Onboarding. |
| **A-07** | On A-06 error screen. | 1. Restore network connection.<br>2. Tap `Retry`. | 1. Profile check succeeds.<br>2. Pre-fetches corridor rules and navigates directly to Checklist. |
| **A-08** | Any screen. | 1. Force an unhandled React rendering error. | 1. `AppErrorBoundary` catches exception.<br>2. Renders recovery screen: `Something went wrong`.<br>3. Body: `Your saved information on this device is unchanged. Please try again.`<br>4. Button: `Try again`.<br>5. **Zero error messages, stack traces, or component names are visible**. |

---

### Suite B — Onboarding & Corridor Creation

| Test ID | Prerequisites | Step-by-Step Actions | Expected Visual & Functional Assertions |
| --- | --- | --- | --- |
| **B-01** | First launch (fresh install, no session). | 1. Land on Onboarding screen. | 1. Blue hero header: `🇨🇦 ReloGo` with descriptive subtitle.<br>2. Both province pickers display placeholder: `Select province or territory…`<br>3. Move date displays today's date formatted in local format (`YYYY-MM-DD` or `Month Day, Year`).<br>4. Both switches ("Bringing a vehicle?", "Moving with kids?") are **OFF**.<br>5. Consent checkbox is **unticked**.<br>6. Submit button `Build My Checklist →` is rendered in grey (`bg-slate-300`). |
| **B-02** | Onboarding screen. | 1. Tap "Moving from" picker. | 1. Picker expands inline with a 220px scrollable list.<br>2. Lists all 13 Canadian provinces and territories in exact order.<br>3. List scrolls smoothly with nested scrolling enabled. |
| **B-03** | Origin picker open. | 1. Tap "Moving to" destination picker. | 1. Origin picker collapses immediately.<br>2. Destination picker expands. Mutually exclusive display verified. |
| **B-04** | Onboarding screen. | 1. Select "Ontario" from origin picker.<br>2. Reopen origin picker and tap "Alberta". | 1. Highlight moves from Ontario to Alberta (`bg-blue-50`, blue bold font).<br>2. Selected label collapses and displays `Alberta`. |
| **B-05** | Onboarding screen. | 1. Tap Move Date button. | 1. **iOS**: Inline calendar appears directly beneath the date button inside the scroll view.<br>2. **Android**: Native system calendar dialog opens.<br>3. Past dates are disabled (`minimumDate={new Date()}`). |
| **B-06** | Empty form. | 1. Tap `Build My Checklist →` button. | 1. Native alert appears:<br>   Title: `Missing Info`<br>   Message: `Please select your origin province or territory.` |
| **B-07** | Origin selected ("Ontario"), destination empty. | 1. Tap `Build My Checklist →` button. | 1. Native alert appears:<br>   Title: `Missing Info`<br>   Message: `Please select your destination province or territory.` |
| **B-08** | Destination selected ("British Columbia"), origin empty. | 1. Tap `Build My Checklist →` button. | 1. Native alert appears:<br>   Title: `Missing Info`<br>   Message: `Please select your origin province or territory.` |
| **B-09** | Same jurisdiction selected (ON → ON). | 1. Select Ontario in both pickers.<br>2. Tap `Build My Checklist →`. | 1. Native alert appears:<br>   Title: `Same jurisdiction`<br>   Message: `Origin and destination must be different provinces or territories.` |
| **B-10** | Valid corridor (AB → BC), consent **unticked**. | 1. Leave consent checkbox unticked.<br>2. Tap `Build My Checklist →`. | 1. Native alert appears:<br>   Title: `Consent Required`<br>   Message: `Please agree to the Privacy Policy and Terms of Service to continue.`<br>2. **Backend check**: 0 anonymous users and 0 profiles created. |
| **B-11** | Valid corridor (AB → BC). | 1. Tap consent checkbox. | 1. Checkbox fills solid blue (`#2563EB`) with a white checkmark icon.<br>2. Submit button transitions from grey (`bg-slate-300`) to solid blue (`bg-blue-600`). |
| **B-12** | Valid corridor (AB → BC). | 1. Tap consent checkbox again (untick). | 1. Checkbox clears to white with grey border.<br>2. Submit button returns to grey (`bg-slate-300`). |
| **B-13** | Onboarding screen. | 1. Tap `Privacy Policy` link text.<br>2. Return to app.<br>3. Tap `Terms of Service` link text. | 1. Opens external browser to `https://relogo-two.vercel.app/privacy`.<br>2. Preserves all entered form inputs upon returning.<br>3. Terms opens `/terms`. |
| **B-14** | Complete valid form (D1 corridor: ON → BC, vehicle=ON, kids=ON, consent=TICKED). | 1. Tap `Build My Checklist →`. | 1. Button label hides, displaying white `ActivityIndicator`.<br>2. Button is disabled to prevent duplicate submissions.<br>3. Anonymous user authenticated in background.<br>4. Profile inserted with non-PII move metadata.<br>5. Authoritative consent state confirmed.<br>6. Seamlessly navigates to `/(tabs)/checklist`. |
| **B-15** | Valid form, network disconnected. | 1. Turn on Airplane mode.<br>2. Tap `Build My Checklist →`. | 1. Alert appears: `Couldn't finish setup` / `Check your connection and try again. Your on-device personal info is unchanged.`<br>2. Form state is preserved.<br>3. Re-enabling network and submitting succeeds without duplicate account errors. |
| **B-16** | Small screen (Pixel 4a / iPhone SE). | 1. Focus input and scroll form. | 1. Form scrolls smoothly; submit button is not clipped.<br>2. Keyboard dismisses appropriately when interacting with pickers (`keyboardShouldPersistTaps="handled"`). |

---

### Suite C — Re-consent Lifecycle & Account Teardown

| Test ID | Prerequisites | Step-by-Step Actions | Expected Visual & Functional Assertions |
| --- | --- | --- | --- |
| **C-01** | User profile exists, backend consent version bumped (or user `consent_version` fixture set to `1.0`). | 1. Launch ReloGo. | 1. Root router intercepts startup.<br>2. Routes directly to `/(auth)/reconsent`.<br>3. Checklist and Profile tabs are completely blocked. |
| **C-02** | Re-consent screen. | 1. Inspect visual layout. | 1. Blue banner title: `Policy update`.<br>2. Body: `Please review the current Privacy Policy and Terms of Service before continuing to your checklist.`<br>3. Blue info card: `Sensitive details stay on this device`.<br>4. Checkbox unticked, submit button grey.<br>5. Divider line with `Delete My Data` and `Sign out` options. |
| **C-03** | Re-consent screen, unticked checkbox. | 1. Tap `Accept and continue`. | 1. Native alert: `Consent Required` / `Please agree to the current Privacy Policy and Terms of Service to continue.` |
| **C-04** | Re-consent screen. | 1. Tick consent checkbox.<br>2. Tap `Accept and continue`. | 1. Spinner displays on button.<br>2. `accept_current_policies` RPC records server-authored timestamp and version `1.1`.<br>3. Navigates to Checklist tab. |
| **C-05** | Re-consent screen. | 1. Tap `Delete My Data`. | 1. Destructive alert appears:<br>   Title: `Delete My Data`<br>   Message: `This permanently deletes your anonymous account, checklist progress, and all personal info stored on this device. This cannot be undone.`<br>   Buttons: `Cancel` (cancel style), `Delete Everything` (red destructive). |
| **C-06** | On C-05 alert. | 1. Tap `Cancel`. | 1. Alert closes; no data deleted; user remains on Re-consent screen. |
| **C-07** | On C-05 alert. | 1. Tap `Delete Everything`. | 1. Local PII vault wiped from SecureStore.<br>2. Server-side profile, progress, and auth user deleted via `delete_current_user` RPC.<br>3. Routes to Onboarding screen as a brand-new user. |
| **C-08** | Re-consent screen. | 1. Tap `Sign out`. | 1. Warning alert appears:<br>   Title: `Sign out`<br>   Message: `Signing out removes personal info and filled PDFs from this device. Because your account is anonymous, its checklist progress may not be recoverable. Continue?`<br>   Buttons: `Cancel`, `Sign Out` (destructive). |
| **C-09** | On C-08 alert. | 1. Tap `Sign Out`. | 1. Local SecureStore wiped.<br>2. Anonymous session cleared.<br>3. Routes to Onboarding screen. |
| **C-10** | Re-consent screen, network disconnected. | 1. Tap `Delete My Data` → `Delete Everything`. | 1. Native alert: `Deletion failed` / `Couldn't delete your account. Check your connection and try again.`<br>2. Local session remains active so deletion can be retried. |
| **C-11** | Deep link attempt while consent is stale. | 1. Trigger deep link: `relogo://checklist`. | 1. Router redirects to `/(auth)/reconsent`. Tab is never rendered. |

---

### Suite D — Checklist Navigator & Dynamic Rules

| Test ID | Prerequisites | Step-by-Step Actions | Expected Visual & Functional Assertions |
| --- | --- | --- | --- |
| **D-01** | Profile created with D1 corridor (ON → BC, Move date = Today + 10 days, Vehicle=Yes, Kids=Yes). | 1. View Checklist tab. | 1. Header displays `Checklist`.<br>2. Route summary: `Ontario` `→` `British Columbia` `· Moving <Date>`.<br>3. Progress header: `0 of N tasks done · 0%`.<br>4. Progress bar displays empty track with 0% blue fill. |
| **D-02** | D1 corridor loaded. | 1. Inspect section groupings. | 1. Sections render in strict order:<br>   - `DUE SOON`<br>   - `NO DEADLINE`<br>2. Each section displays an uppercase title, pill counter, and hairline divider rule.<br>3. Incomplete tasks appear before completed tasks. |
| **D-03** | Past move date fixture (D4: Move date = Today - 30 days). | 1. Load Checklist tab. | 1. `OVERDUE` section header appears at the top in **red font** (`#dc2626`).<br>2. Overdue count pill has light red background (`bg-red-50 text-red-700`).<br>3. Header progress displays red counter: `<N> overdue · `. |
| **D-04** | Inspecting an overdue task card. | 1. Observe badge styling. | 1. Overdue badge shows red alert-circle icon + red chip: `Overdue · <FormattedDate>` (`bg-red-50 text-red-700`).<br>2. Requirement badge displays `Required` (amber) or `Optional` (grey). |
| **D-05** | Boundary test (D6: Move date = Today, deadline days = 0). | 1. Inspect task card due today. | 1. Deadline chip displays `Due Today` or `Due <Date>`.<br>2. Task is categorized in **Due soon**, NOT Overdue. |
| **D-06** | Task with null deadline. | 1. Inspect task card. | 1. Chip displays `No fixed deadline` in grey (`bg-slate-100 text-slate-500`).<br>2. Placed under `NO DEADLINE` section. |
| **D-07** | Any task card. | 1. Tap card title/chevron. | 1. Chevron animates from down to up.<br>2. Task description expands smoothly.<br>3. Official sources container appears below description. |
| **D-08** | Any task card. | 1. Expand Card 1.<br>2. Expand Card 2. | 1. Card 1 remains expanded while Card 2 expands.<br>2. Multiple cards can be expanded simultaneously. |
| **D-09** | Expanded task card. | 1. Inspect official source link. | 1. Section title: `OFFICIAL SOURCE` (or `OFFICIAL SOURCES`).<br>2. Row displays agency name, external link icon (`open-outline`), and brand blue text.<br>3. If no source: `No official link is listed for this task yet.` |
| **D-10** | Expanded task card. | 1. Tap official source button. | 1. Opens verified HTTPS link in system default browser (Safari/Chrome).<br>2. Non-HTTPS links are blocked by `safeOfficialUrl`. |
| **D-11** | Unsafe URL fixture (malformed URL in source). | 1. Tap source button with unsafe link. | 1. Alert: `Couldn't open the official website` / `This official link is not available right now.` |
| **D-12** | Any available task. | 1. Tap circular checkbox. | 1. Checkbox instantly turns solid blue with white checkmark.<br>2. Title gains strikethrough styling (`text-slate-400 line-through`).<br>3. Task animates down into the `COMPLETED` section.<br>4. Header progress count and percentage update immediately (Optimistic UI). |
| **D-13** | Any completed task. | 1. Tap circular checkbox again. | 1. Checkmark clears.<br>2. Title strikethrough removed.<br>3. Task animates back up to its original urgency section (`Due soon`, `Overdue`, etc.). |
| **D-14** | Network disconnected. | 1. Toggle task checkbox. | 1. Task optimistically checks.<br>2. Within network timeout, change rolls back.<br>3. Alert appears: `Update failed` / `Couldn't save your progress. Please try again.` |
| **D-15** | All tasks completed. | 1. Check every task on the checklist (100%). | 1. Blue celebration card appears above list:<br>   - Trophy icon<br>   - Title: `All set for the move!`<br>   - Subtitle: `Every task on your checklist is complete.`<br>2. Progress bar reads `100%`. |
| **D-16** | 100% complete state. | 1. Uncheck any one task. | 1. Celebration card disappears immediately.<br>2. Progress bar updates to reflect partial completion. |
| **D-17** | Checklist tab. | 1. Perform pull-to-refresh gesture. | 1. Native blue pull-to-refresh spinner appears.<br>2. Re-fetches corridor rules and progress; completes smoothly. |
| **D-18** | Vehicle switch OFF (D3 corridor). | 1. Inspect checklist. | 1. Driver's licence and vehicle registration tasks are **omitted**. |
| **D-19** | Dependents switch OFF (D2 corridor). | 1. Inspect checklist. | 1. School enrollment and child tax benefit tasks are **omitted**. |
| **D-20** | Empty corridor fixture (corridor with 0 rules). | 1. View Checklist. | 1. Empty state card displays:<br>   - Checkmark icon<br>   - `No tasks yet`<br>   - `We don't have tasks for your corridor yet. Pull down to refresh — new rules are added regularly.`<br>2. Progress bar is hidden. |

---

### Suite E — Profile & Local PII Vault

| Test ID | Prerequisites | Step-by-Step Actions | Expected Visual & Functional Assertions |
| --- | --- | --- | --- |
| **E-01** | Signed in with existing profile. | 1. Navigate to `Profile` tab. | 1. Native navigation bar reads `My Profile`.<br>2. Three clear sections:<br>   - `Move details`<br>   - `Personal info`<br>   - `Account`<br>3. Bottom tabs show `Checklist` and `Profile` only (Contact is hidden). |
| **E-02** | Profile screen. | 1. Inspect Move details section. | 1. Moving from & Moving to pickers reflect current profile provinces.<br>2. Move date reflects profile date.<br>3. Vehicle and Dependents switches reflect stored profile flags. |
| **E-03** | Profile screen. | 1. Change destination to match origin (e.g. ON → ON).<br>2. Tap `Save Move Details`. | 1. Alert appears: `Same jurisdiction` / `Origin and destination must be different provinces or territories.`<br>2. No network update is sent. |
| **E-04** | Profile screen. | 1. Change destination to a new province.<br>2. Tap `Save Move Details`. | 1. Button shows spinner.<br>2. Alert appears: `Saved` / `Your move details have been updated.`<br>3. Returning to Checklist shows updated corridor and rules without requiring manual refresh. |
| **E-05** | Profile screen. | 1. Inspect `Personal info` section. | 1. Green lock icon + `Stored only on this device — never uploaded to our servers.`<br>2. Exactly 5 input fields in order:<br>   - `Full name`<br>   - `Date of birth`<br>   - `New street address`<br>   - `Health card number`<br>   - `Driver's licence number`<br>3. Health card and Driver's licence fields mask typed characters (`secureTextEntry={true}`). |
| **E-06** | Profile screen. | 1. Type dummy test data into all 5 fields:<br>   - Full name: `Jane Doe`<br>   - DOB: `1990-05-15`<br>   - Address: `123 Maple St, Calgary`<br>   - Health card: `9876-543-210`<br>   - Driver's licence: `D1234-56789-01234`<br>2. Tap `Save On Device`. | 1. Alert appears: `Saved on device` / `Your personal info is stored securely on this device only.`<br>2. Data stored in `expo-secure-store` with prefix `relogo_pii_`.<br>3. **Server Verification**: Zero PII rows inserted into Supabase. |
| **E-07** | On-device PII saved (E-06). | 1. Force kill and relaunch app.<br>2. Navigate to Profile tab. | 1. All 5 fields restore their saved values into the form inputs.<br>2. SecureStore persists across cold restarts. |
| **E-08** | Profile screen. | 1. Clear the "Full name" field.<br>2. Tap `Save On Device`. | 1. Alert: `Saved on device`.<br>2. `deletePII` removes `FULL_NAME` from SecureStore.<br>3. Relaunch confirms the field remains empty. |
| **E-09** | Profile screen. | 1. Tap `Help & support` button in Account section. | 1. Pushes `/(tabs)/contact` screen onto navigation stack. |
| **E-10** | Profile screen. | 1. Tap `Sign Out`. | 1. Alert: `Sign out` / `Signing out removes all personal info and filled PDFs stored on this device. Anonymous checklist progress may not be recoverable. Continue?`<br>2. Confirming wipes SecureStore and routes to Onboarding. |
| **E-11** | Profile screen. | 1. Tap `Delete My Data`. | 1. Destructive alert: `Delete My Data` / `This permanently deletes your account, checklist progress, and all personal info stored on this device. This cannot be undone.`<br>2. Confirming calls `delete_current_user` RPC, wipes SecureStore, and routes to Onboarding. |

---

### Suite F — Support Chat & AI Grounding

| Test ID | Prerequisites | Step-by-Step Actions | Expected Visual & Functional Assertions |
| --- | --- | --- | --- |
| **F-01** | Signed-in user. | 1. Profile → Tap `Help & support`. | 1. Header displays chevron back button and `Help`.<br>2. Green privacy banner visible at top.<br>3. Empty state card: `How can we help?` with chat icon.<br>4. `Talk to a human` button displayed.<br>5. Exactly 6 question buttons displayed in 2-column grid.<br>6. **Zero free-text input fields exist**. |
| **F-02** | Support screen. | 1. Tap back chevron (iOS) or swipe back or press Android back button. | 1. Returns cleanly to Profile screen. |
| **F-03** | Support screen. | 1. Verify exact copy of all 6 buttons. | 1. `What should I do first for my move?`<br>2. `Which tasks are mandatory for my move?`<br>3. `What deadlines should I know about?`<br>4. `Which documents should I prepare?`<br>5. `What vehicle-related tasks apply to me?`<br>6. `How do I update my health coverage?` |
| **F-04** | Fresh support thread. | 1. Tap question #1: `What should I do first for my move?`. | 1. Optimistic user bubble appears immediately on the right in brand blue (`bg-blue-600`).<br>2. Question buttons turn grey and disabled.<br>3. AI typing indicator bubble appears on the left: small spinner + `Typing…` with label `AI assistant`. |
| **F-05** | Waiting for AI reply. | 1. Observe response arrival. | 1. AI reply bubble arrives on the left in grey (`bg-slate-200 text-slate-900`).<br>2. Typing indicator disappears.<br>3. Optimistic user bubble transitions to confirmed state without duplicates.<br>4. Scroll view smoothly scrolls to newest message. |
| **F-06** | Support screen. | 1. Tap `Talk to a human`. | 1. Button shows spinner while escalating.<br>2. Status updates to `AWAITING_HUMAN`.<br>3. `Talk to a human` button is **removed** from view.<br>4. Amber banner appears at top: `We'll reply right here. The AI assistant has stepped aside.` |
| **F-07** | Thread in `AWAITING_HUMAN` or `HUMAN` status. | 1. Tap another question button. | 1. User message is recorded.<br>2. **No AI reply is triggered** (AI remains stepped aside). |
| **F-08** | Simulated Edge function failure (or offline during invocation). | 1. Tap a question when `support-ai` is unreachable. | 1. User message saves.<br>2. Local fallback bubble appears: `Our assistant is unavailable right now — a member of the support team will follow up here.`<br>3. Thread status auto-escalates to `AWAITING_HUMAN`.<br>4. Amber banner appears. **No raw API errors shown**. |
| **F-09** | Admin replies via Admin Dashboard. | 1. Observe support screen while open. | 1. Inbound message appears in real time via Supabase Realtime.<br>2. White bubble with grey border (`bg-white border-slate-200`), aligned left, labelled `Support`. |
| **F-10** | Admin resolves thread (status = `RESOLVED`). | 1. Observe support screen. | 1. Grey banner appears: `This conversation is closed. Send a message to reopen it.` |
| **F-11** | Thread is `RESOLVED`. | 1. Tap any question button. | 1. Thread status reopens to `AI`.<br>2. Grey banner disappears.<br>3. Question is delivered and answered. |

---

### Suite G — Adversarial Privacy & Security Verification

| Test ID | Steps & Verification | Expected Security & Privacy Invariants |
| --- | --- | --- |
| **G-01** | Inspect device SecureStore vs. Supabase database tables. | Verify that `FULL_NAME`, `DATE_OF_BIRTH`, `STREET_ADDRESS`, `HEALTH_CARD_NUMBER`, and `DRIVERS_LICENCE_NUMBER` exist **only** in SecureStore. Supabase `user_profiles`, `support_messages`, and audit logs contain **zero** PII rows. |
| **G-02** | Sign-out and account deletion audit. | Performing Sign Out or Delete My Data completely clears all prefixed keys (`relogo_pii_*`) from device storage. |
| **G-03** | Error sanitization sweep across all error triggers. | Disconnect network and trigger all error paths. Zero SQLSTATE codes (`23505`, `42501`), project URLs, or internal function names are surfaced to the user. |
| **G-04** | Support message injection test. | Verify that client is strictly restricted to the 6 predefined questions. Attempting to insert arbitrary text via client RPC fails database CHECK constraint `support_messages_body_allowlist`. |
| **G-05** | URL scheme sanitizer verification. | Attempting to launch links with `javascript:`, `data:`, `file:`, or `http:` (non-loopback) are rejected by `safeOfficialUrl`. Only public `https:` URLs are opened. |

---

### Suite H — Visual Matrix & Responsive Layouts

_Execute across CFG-01 through CFG-08:_

| Test ID | Layout Area | Expected Visual Assertions |
| --- | --- | --- |
| **H-01** | Safe Area Insets (Notch & Island) | Checklist header clears Dynamic Island/notch; Support chat composer clears iOS home indicator and Android navigation bar. |
| **H-02** | Dynamic Type (Font Size XXXL) | Button text does not clip; chips wrap onto multiple lines; task titles reflow cleanly without overlapping chevrons. |
| **H-03** | Dark Appearance | Background stays light (`bg-slate-50`); cards remain white; all typography meets minimum 4.5:1 contrast against light cards. |
| **H-04** | Compact Device (iPhone SE / Pixel 4a) | Forms scroll completely to the bottom; submit button is fully accessible above the screen edge. |
| **H-05** | Orientation Lock | Rotating device to landscape maintains fixed portrait orientation on real device builds (`orientation: "portrait"`). |

---

### Suite I — Accessibility & VoiceOver / TalkBack

| Test ID | Assistive Technology | Focus Flow & Announcements |
| --- | --- | --- |
| **I-01** | VoiceOver / TalkBack on Onboarding | 1. Pickers announce `Moving from: <value>, Button`.<br>2. Date picker announces `Move date, <date>, Button, Opens the date picker`.<br>3. Switches announce `Bringing a vehicle?, Switch, on/off`.<br>4. Checkbox announces `I agree to the Privacy Policy and Terms of Service, Checkbox, checked/unchecked`. |
| **I-02** | VoiceOver on Checklist | 1. Section headers announce `<Label>, <N> tasks, Header`.<br>2. Checkboxes announce `Mark "<Title>" as done, Checkbox, checked/unchecked`.<br>3. Card body announces `Button, Expanded/Collapsed, Shows or hides the task details`. |
| **I-03** | VoiceOver on Profile | 1. Masked PII inputs announce field labels but do not speak sensitive numbers in plaintext.<br>2. Action buttons announce appropriate roles (`Button`). |
| **I-04** | Touch Target Verification | All interactive buttons, checkboxes, pickers, and switches meet minimum **44 × 44 pt** touch target guidelines. |

---

### Suite J — Network Fault Injection & Resiliency

| Test ID | Fault Injected | Expected Resiliency Assertion |
| --- | --- | --- |
| **J-01** | Offline at cold launch | Graceful timeout within 3s for session or 5s for profile; clean retry UI rendered. |
| **J-02** | Network drops during checklist refresh | Existing cached tasks remain displayed; non-destructive toast or silent pull-to-refresh reset. |
| **J-03** | Network drops during task toggle | Optimistic checkmark flips, rolls back upon request timeout, and alerts `Update failed`. |
| **J-04** | Flaky high-latency 3G connection | TanStack Query bounds stale time and avoids query cascading or screen flicker. |

---

### Suite K — Landing Marketing Site (Browser)

| Test ID | Viewport | Steps | Expected Visual & Functional Assertions |
| --- | --- | --- | --- |
| **K-01** | Desktop (1440×900) | Load `/` | Header with truck icon + `ReloGo` + `Coming soon` pill; hero section with 3-step cards; waitlist form; footer. |
| **K-02** | Mobile (390×844) | Load `/` | Responsive single-column layout; no horizontal overflow; touch targets ≥44px. |
| **K-03** | Waitlist Form | Select same province (ON → ON) | Inline notice displays: `Pick two different provinces or territories to see your relocation checklist.` Email input remains hidden. |
| **K-04** | Waitlist Form | Select valid corridor (AB → BC) | Email input and submit button animate into view (`opacity-100 transition-all duration-500`). |
| **K-05** | Waitlist Form | Enter invalid email (`test@`, `abc`) | Inline error: `That email address doesn't look right. Please double-check it (e.g. you@example.com).` |
| **K-06** | Waitlist Form | Submit valid email | Form replaces with success card: Check icon + `You're on the list!` + `AB → BC`. |
| **K-07** | Waitlist Form | Submit duplicate email in fresh session | Shows same success card (`accepted`, enumeration-safe; never reveals if email existed). |
| **K-08** | Legal Pages | Load `/privacy`, `/terms`, `/support` | Each route renders properly with full legal copy, shared header, and footer. No 404s. |

---

### Suite L — Admin Operations Dashboard (Browser)

| Test ID | Prerequisites | Steps | Expected Visual & Functional Assertions |
| --- | --- | --- | --- |
| **L-01** | Unauthenticated | Navigate to `http://localhost:5173` | Dark theme login card with email and password inputs. |
| **L-02** | Invalid credentials | Submit wrong password | Generic error message; no database enumeration or stack trace. |
| **L-03** | Non-admin session | Authenticate with non-admin user | `Not Authorized` screen displays with shield-alert icon and `Sign out` button. |
| **L-04** | Admin session (`admin@relogo.ca`) | Log in | Dark navigation bar: `ReloGo Admin`, tabs: `Alerts`, `Users`, `Messages`, `Waitlist`, user email, and `Log out`. |
| **L-05** | Alerts Tab | View pending alerts | Table shows `Agency`, `URL`, `Old Hash`, `New Hash`, `Detected At`, and action buttons `Dismiss` and `Edit Rules`. |
| **L-06** | Alerts Tab | Click `Edit Rules` | `EditRuleModal` opens. Shows Task Name, Description, editable `Days Deadline` (number or empty for NULL), `Mandatory` checkbox, and buttons `Cancel` and `Save & Approve`. |
| **L-07** | Alerts Tab | Edit deadline, click `Save & Approve` | Modal closes, `approve_rule_change` RPC executes, alert row leaves pending list. |
| **L-08** | Users Tab | View user list | Stats strip (Total users, vehicle, kids, top corridors). Table with non-PII move details only. "View Details" opens modal with task checklist. |
| **L-09** | Messages Tab | View support inbox | List of threads with status pills (`AI`, `Awaiting human`, `Human`, `Resolved`). Realtime updates reflect incoming user messages. |
| **L-10** | Messages Tab | Click `View Thread` | `ThreadModal` displays full chat transcript. Buttons for `Take Over`, `Resolve`, and an admin reply textarea with `Send Reply`. |
| **L-11** | Waitlist Tab | View waitlist entries | Paginated table showing email, origin, destination, and signup date. |

---

### Suite M — Platform, Packaging, Deep Links & Gestures

| Test ID | Platform / Steps | Expected Assertions |
| --- | --- | --- |
| **M-01** | Deep link: `relogo://checklist` | App opens and routes directly to Checklist tab when authenticated. |
| **M-02** | Deep link while unauthenticated | App safely redirects to Onboarding (no crash, no blank screen). |
| **M-03** | Invalid deep link: `relogo://invalid-path` | Falls back to root routing gate without crashing. |
| **M-04** | Background app for 10+ minutes, then foreground | Session validates smoothly; no duplicate splash or app freeze. |
| **M-05** | Android hardware back button on Support Chat | Pops view back to Profile tab; does not exit app. |
| **M-06** | iOS swipe-from-left gesture on Support Chat | Transitions smoothly back to Profile tab. |
| **M-07** | System timezone shift (e.g. Pacific to Newfoundland) | Checklist deadlines calculate anchored to local midnight; calendar date does not drift by ±1 day. |

---

## Suite Z — Release Sign-off Gates

To declare a build **Release-Ready**, the executing agent or QA engineer must verify 100% compliance with these gates:

```text
[ ] GATE-Z01: Suites A through J executed on iOS Simulator (iPhone 16 Pro) — 100% P0/P1 PASS.
[ ] GATE-Z02: Suites A through J executed on Android Emulator (Pixel 7) — 100% P0/P1 PASS.
[ ] GATE-Z03: Suite H (Visual Matrix) executed on all 10 device/font configurations with zero clipping or layout collapse.
[ ] GATE-Z04: Suite G (Privacy) PASS: Automated assertion confirming zero PII rows in Supabase backend tables.
[ ] GATE-Z05: Suite K (Landing) PASS: Responsive waitlist form and legal pages verified on desktop and mobile.
[ ] GATE-Z06: Suite L (Admin) PASS: Rule approval, user inspection, and support reply verified with seeded admin account.
[ ] GATE-Z07: Zero open P0 (blocker/crash/PII) or P1 (core flow failure) issues.
[ ] GATE-Z08: Full screenshot artifact bundle archived under `qa-artifacts/` matching documented baseline screens.
```

---

## 7. Standardized Evidence & Defect Reporting Template

When documenting test execution or filing a defect, autonomous agents must use this exact structure:

```markdown
### QA Test Result: [TEST-ID] — [STATUS: PASS / FAIL / BLOCKED]

- **Configuration**: [e.g. CFG-01 (iPhone 16 Pro, iOS 18, Dynamic Type Medium)]
- **Backend Target**: [Local Supabase (127.0.0.1:54321)]
- **Corridor Tested**: [e.g. D1 (ON → BC, Vehicle=Yes, Kids=Yes)]
- **Steps Executed**:
  1. ...
  2. ...
- **Expected Outcome**: [Exact copy/behavior from Playbook]
- **Observed Outcome**: [Exact visual/functional behavior observed]
- **Visual Evidence**: `qa-artifacts/<suite>/<id>/<step>-<config>.png`
- **Severity** (if FAIL): [P0 - Blocker/PII Leak | P1 - Flow Failure | P2 - Visual Defect | P3 - Polish]
```

---

## 8. Resolution of Environmental Blockers & Open Questions

The following answers resolve previous open questions for fully autonomous agent runs:

1. **Target Backend**: The autonomous agent must execute against **Local Supabase** (`supabase start` on `http://127.0.0.1:54321`). This prevents rate limiting, protects production read-only integrity, and allows full execution of destructive cases (account deletion, database resetting).
2. **Admin Credentials for Suite L**: Use the pre-seeded admin account `admin@relogo.ca` / `AdminTestPassword123!` created via `seed.sql` and migration 017. Suite L is fully executable and unblocked.
3. **Binary Packaging**: For simulator runs, use the Expo local runner (`npx expo start --ios` / `npx expo start --android`) or a local development build. Production standalone Hermes export verification is handled via `npx expo export --platform ios/android`.
4. **Visual Artifact Handling**: Screenshots containing dummy test names (e.g. "Jane Doe") and non-PII move corridors are permitted in local `qa-artifacts/`. Never use real personal data during testing.

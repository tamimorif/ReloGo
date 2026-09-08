# ReloGo 1.0.1 Store Submission & Verification Package

> **Authoritative Specification & Operational Runbook**
> Current as of: 2026-09-08 | Target Version: 1.0.1 (Recovery Release)
> Repository Root: `/Users/tamimorif/Documents/GitHub/ReloGo`
> Exclusively Governs: Mobile App Store Submission, Privacy Disclosure Reconciliation, and Real-Device Release Verification.

---

## 1. EAS 1.0.1 Production Build Audit

### 1.1 Executive Summary & Target Environment
The ReloGo 1.0.1 mobile recovery release provides cross-Canada relocation checklists and official government navigation across all 13 provinces and territories. The shipped App Store 1.0 binary (Apple ID `6781947478`, bundle ID `com.relogo.app`) was compiled against Expo SDK 51 and bundled the deleted Supabase project `fxrynmgaymslwcklfena`. Because that binary contains no OTA update capability, recovery requires releasing new store binaries compiled from Expo SDK 55 against active production Supabase (`yskknolxbxfxakgvrcmg`).

Both 1.0.1 production release candidates have been built, archived, and verified via Expo Application Services (EAS) from exact green commit `cd3a87c5433c18d57509af6b0d4d23b1b4e5fe9e`.

### 1.2 iOS Production Build 8 Specifications
- **Platform**: iOS
- **EAS Build ID**: `daa8e42a-c12d-4365-b6ca-ff36732cd858`
- **Status**: `finished`
- **Build Profile**: `production`
- **Release Channel**: `production`
- **Expo SDK Version**: `55.0.0`
- **Runtime Version**: `1.0.1` (pinned via `appVersion` policy)
- **App Version (CFBundleShortVersionString)**: `1.0.1`
- **Build Number (CFBundleVersion)**: `8`
- **Git Commit**: `cd3a87c5433c18d57509af6b0d4d23b1b4e5fe9e`
- **Commit Message**: `Recovery candidate cd3a87c`
- **Archive URL**: `https://expo.dev/artifacts/eas/LMDVJlHLm_WIVSHJQOdUuWrK3ijMbVj1la1aCUW6Ib0.ipa`
- **Archive SHA-256**: `22514a7ee6672aa2b27942994b21a10a9a64b23a24eba17b7a845afd518d7bfc`
- **Archive Size**: 19,516,089 bytes (~18.6 MB)
- **Apple Bundle Identifier**: `com.relogo.app`
- **Non-Exempt Encryption**: `false` (`ITSAppUsesNonExemptEncryption: false`)
- **Submission State**: Archive verified and intact. Not yet uploaded to App Store Connect / TestFlight.

### 1.3 Android Production Build 5 Specifications
- **Platform**: Android
- **EAS Build ID**: `f839dede-1f83-4c6a-a928-de258597e6d0`
- **Status**: `finished`
- **Build Profile**: `production`
- **Release Channel**: `production`
- **Expo SDK Version**: `55.0.0`
- **Runtime Version**: `1.0.1` (pinned via `appVersion` policy)
- **App Version (versionName)**: `1.0.1`
- **Version Code**: `5`
- **Git Commit**: `cd3a87c5433c18d57509af6b0d4d23b1b4e5fe9e`
- **Commit Message**: `Recovery candidate cd3a87c`
- **Archive URL**: `https://expo.dev/artifacts/eas/YE5K0m3-pHxUcPSAenPpB9NCrI1h9ZQG9o3x5_c1Q5A.aab`
- **Archive SHA-256**: `afad9d7cd505c2f0c0e516a1f7eddb02ef71748de2e21d0125b735e4b1a15343`
- **Archive Size**: 68,966,684 bytes (~65.8 MB)
- **Android Package Name**: `com.relogo.app`
- **Submission State**: Archive verified and intact. Not yet uploaded to Google Play Console (service account key pending or manual upload required).

### 1.4 Historical Build Deprecation & Audit Comparison
| Attribute | Historical iOS Build 7 | Release Candidate iOS Build 8 | Historical Android Build 4 | Release Candidate Android Build 5 |
| :--- | :--- | :--- | :--- | :--- |
| **EAS ID** | `765965d7-c7c1-432c-ac1d-302d2f0c5116` | `daa8e42a-c12d-4365-b6ca-ff36732cd858` | `28076f35-1495-466b-af77-97a9339c5ea2` | `f839dede-1f83-4c6a-a928-de258597e6d0` |
| **Commit** | `e75f449` | `cd3a87c` | `e75f449` | `cd3a87c` |
| **Build Number** | `7` | `8` | `4` | `5` |
| **App Store Status** | `VALID` / `IN_BETA_TESTING` (TestFlight) | Pending Upload | Never uploaded | Pending Upload |
| **Startup Prefetch Fixes** | Missing | **Included** (`cd3a87c`) | Missing | **Included** (`cd3a87c`) |
| **SDK 55 Dependency Audit** | Unpatched | **Patched & Verified** | Unpatched | **Patched & Verified** |
| **Candidate Verdict** | **DEPRECATED** (Do not ship) | **APPROVED RELEASE CANDIDATE** | **DEPRECATED** (Do not ship) | **APPROVED RELEASE CANDIDATE** |

### 1.5 Configuration Invariants & Pre-Submission Contracts
All mobile builds enforce the following strict configuration invariants:
1. **Target Supabase Project**: `mobile/scripts/check-release-config.js` programmatically validates that production bundles embed exclusively production Supabase ref `yskknolxbxfxakgvrcmg` (`https://yskknolxbxfxakgvrcmg.supabase.co`). It strictly rejects retired ref `fxrynmgaymslwcklfena` and preview ref `uwfblgllkibbupqyofkl`.
2. **Channel & Environment**: `mobile/eas.json` locks profile `production` to `channel: "production"` and `environment: "production"`.
3. **App Identifiers**: `mobile/app.json` defines `bundleIdentifier: "com.relogo.app"` for iOS and `package: "com.relogo.app"` for Android.
4. **Encryption Compliance**: `ios.config.usesNonExemptEncryption` is explicitly set to `false`. Standard HTTPS/TLS network communication does not require an Export Administration Regulations (EAR) encryption registration.

---

## 2. Zero-PII Off-Device Privacy Architecture Audit

ReloGo implements a rigorous zero-PII off-device privacy architecture. No Personally Identifiable Information (PII) is ever transmitted over the network, stored in cloud databases, logged in telemetry, or forwarded to AI services.

```
+-------------------------------------------------------------------------------+
|                            CLIENT DEVICE ENCLAVE                              |
|                                                                               |
|  +-------------------------------------------------------------------------+  |
|  | Hardware Secure Enclave (Keychain / Keystore via expo-secure-store)     |  |
|  | - Full Name                 - Driver's Licence Number                   |  |
|  | - Date of Birth             - Health Card Number                        |  |
|  | - Street Address                                                        |  |
|  +-------------------------------------------------------------------------+  |
|                                      |                                        |
|                          (Local RAM read only)                                |
|                                      v                                        |
|  +-------------------------------------------------------------------------+  |
|  | Local AcroForm Engine (pdf-lib)                                         |  |
|  | 1. Download official blank PDF via HTTPS                                |  |
|  | 2. Verify SHA-256 checksum against pinned hash                          |  |
|  | 3. Fill form fields strictly in device RAM                              |  |
|  | 4. Ephemeral cache: iOS immediate wipe; Android 10-min grace cleanup    |  |
|  +-------------------------------------------------------------------------+  |
+-------------------------------------------------------------------------------+
                                       |
                   (ZERO PII TRANSMITTED OFF-DEVICE)
                                       v
+-------------------------------------------------------------------------------+
|                         SUPABASE CLOUD INFRASTRUCTURE                         |
|                                                                               |
|  +-------------------------------------------------------------------------+  |
|  | auth.users (Anonymous UUID only, no email, no name, no phone)           |  |
|  +-------------------------------------------------------------------------+  |
|                                      |                                        |
|                                      v                                        |
|  +-------------------------------------------------------------------------+  |
|  | user_profiles (Non-PII move metadata only)                              |  |
|  | - id (UUID)                 - has_vehicle (Boolean)                     |  |
|  | - origin_prov (Char 2)       - has_dependents (Boolean)                  |  |
|  | - dest_prov (Char 2)         - consent_version & timestamp               |  |
|  | - move_date (Date)          - created_at / updated_at                   |  |
|  +-------------------------------------------------------------------------+  |
|                                      |                                        |
|                                      v                                        |
|  +-------------------------------------------------------------------------+  |
|  | support_messages (Fixed-Question Allowlist Boundary)                   |  |
|  | - Exactly 6 pre-approved questions (Migration 010 RLS enforced)         |  |
|  | - Any client-authored free text rejected with error 42501               |  |
|  +-------------------------------------------------------------------------+  |
|                                      |                                        |
|                                      v                                        |
|  +-------------------------------------------------------------------------+  |
|  | Edge Function support-ai (Google Gemini Grounding)                      |  |
|  | - Transcript scanned; non-allowlisted text fails closed to human        |  |
|  | - Only non-PII move metadata + official corridor rules sent to Gemini   |  |
|  +-------------------------------------------------------------------------+  |
+-------------------------------------------------------------------------------+
```

### 2.1 Hardware-Backed Secure Enclave Vault
- **Implementation**: Located in `mobile/lib/secureStore.ts`.
- **Security Primitives**: Utilizes `expo-secure-store` configured with `{ keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY }`. On iOS, data is encrypted by the OS Secure Enclave and accessible only while the physical device is unlocked. On Android, keys are protected by the Android Keystore system.
- **Enclave Keys**:
  - `relogo_pii_FULL_NAME`
  - `relogo_pii_DATE_OF_BIRTH`
  - `relogo_pii_STREET_ADDRESS`
  - `relogo_pii_DRIVERS_LICENCE_NUMBER`
  - `relogo_pii_HEALTH_CARD_NUMBER`
- **Access Scope**: Accessed solely for on-device viewing/editing in `mobile/app/(tabs)/profile.tsx` and for populating official PDF forms in `mobile/lib/pdfEngine.ts`. No network APIs accept or consume these keys.

### 2.2 Cloud Database Schema & Strict Zero-PII Isolation
The Supabase PostgreSQL database contains no fields or tables capable of storing identity documents or personal contact details:
- **`auth.users` Table**: Employs Supabase Anonymous Authentication (`supabase.auth.signInAnonymously()`). Users are assigned an opaque v4 UUID without requiring an email address, password, or phone number.
- **`user_profiles` Table** (`mobile/types/database.ts:287-316`):
  Columns are strictly limited to non-PII move planning parameters:
  - `id` (`UUID`, primary key matching `auth.uid()`)
  - `origin_prov` (`VARCHAR(2)`)
  - `dest_prov` (`VARCHAR(2)`)
  - `move_date` (`DATE`)
  - `has_vehicle` (`BOOLEAN`)
  - `has_dependents` (`BOOLEAN`)
  - `consent_version` (`TEXT`, currently `1.1`)
  - `consent_timestamp` (`TIMESTAMPTZ`)
  - `created_at` / `updated_at` (`TIMESTAMPTZ`)
- **`user_task_progress` Table** (`mobile/types/database.ts:317-334`):
  Stores only `user_id` (`UUID`), `task_rule_id` (`UUID`), `status` (`AVAILABLE` or `COMPLETED`), and timestamp.
- **Row-Level Security (RLS)**: Strict RLS policies on all user tables restrict SELECT, INSERT, and UPDATE operations to `auth.uid() = id` (or `user_id`). Anonymous users cannot enumerate or access any other user's records.

### 2.3 Customer Support Fixed-Vocabulary Privacy Boundary
To eliminate the risk of users accidentally typing sensitive identifiers (such as SIN, health cards, or credit cards) into support chats, ReloGo enforces a fixed-vocabulary boundary:
- **Allowlist Definition**: `mobile/lib/supportQuestions.ts` defines an immutable list of exactly 6 pre-approved questions:
  1. *"What should I do first for my move?"*
  2. *"How long do I have to switch my driver's licence?"*
  3. *"When does my new provincial health coverage start?"*
  4. *"Do I need an inspection for my vehicle?"*
  5. *"How do I update my address with the CRA?"*
  6. *"Where do I find official government forms for my move?"*
- **Database Engine RLS Enforcement** (`supabase/migrations/010_support_question_privacy_boundary.sql`):
  ```sql
  CREATE POLICY "support_messages: users can insert approved questions"
    ON public.support_messages FOR INSERT TO authenticated
    WITH CHECK (
      sender = 'user'
      AND body = ANY (ARRAY[
        'What should I do first for my move?',
        'How long do I have to switch my driver''s licence?',
        'When does my new provincial health coverage start?',
        'Do I need an inspection for my vehicle?',
        'How do I update my address with the CRA?',
        'Where do I find official government forms for my move?'
      ])
    );
  ```
  Any attempt by a compromised client or script to insert arbitrary text into `support_messages` is blocked at the database engine level with PostgreSQL error `42501` (insufficient_privilege).
- **Metadata Lockdown**: Migration 012 revokes client write access to thread subjects, preventing arbitrary text injection via thread headers.

### 2.4 Edge Function & Gemini AI Boundary
The customer support AI assistant is executed via a server-side Deno Edge Function (`supabase/functions/support-ai/index.ts`):
- **Invocation**: The client triggers the assistant by sending only `{ body: { thread_id } }` with an authenticated user JWT. No personal identifiers are passed in the request.
- **Grounded Context**: The Edge Function queries only the user's move corridor (`origin_prov`, `dest_prov`, `move_date`, `has_vehicle`, `has_dependents`) and official rule URLs via `resolve_corridor_rules(origin, dest)`.
- **Transcript Safety Scan**: Before calling Gemini, `threadHasOnlyAllowedUserQuestions` scans every historical user message in the thread. If any turn contains non-allowlisted text (e.g. legacy test records), the function aborts AI execution immediately, sets thread status to `AWAITING_HUMAN`, and fails closed without transmitting data to Google.
- **Model Guardrails**: The system prompt strictly prohibits the model from soliciting, requesting, or echoing personal identification numbers, names, or addresses.

### 2.5 Official Government PDF Form Engine
ReloGo assists users with filling official government PDFs (such as the British Columbia Application for Health Coverage, form `101fil.pdf`):
- **Download Integrity Gate**: The app downloads the blank form directly from the official ministry portal (`https://www2.gov.bc.ca/assets/gov/health/forms/101fil.pdf`).
- **Cryptographic Hash Validation**: `mobile/lib/pdfEngine.ts` computes the SHA-256 checksum of the downloaded file and verifies it against the pinned hash `30de754d48f2e90e9c8b49b1d4339ddc54be3d5fc913aab1ac45738c3e719f81`. It also enforces a strict 10 MB maximum size limit.
- **Fail-Closed Execution**: If the digest mismatches or the file exceeds 10 MB, execution terminates with an error **before** reading any PII from the Secure Enclave.
- **In-Memory Population**: Form field mapping is executed purely in local device RAM using `pdf-lib`. Filled forms are never uploaded to ReloGo or any third-party server.

### 2.6 Ephemeral Cache Hygiene & Android 10-Minute Share Grace Window
- **iOS Cleanup**: On iOS, the native share sheet (`expo-sharing`) retains synchronous access to the file. Immediately upon dismissal of the share sheet, `pdfEngine.ts` deletes the filled PDF from the app cache.
- **Android Share Grace Window**: Android share targets (e.g. Google Drive, Gmail) operate as asynchronous background processes. Deleting the file immediately causes external applications to fail with `FileNotFoundException`.
  To ensure privacy while supporting Android background handlers, `mobile/lib/pdfEngine.ts` applies a persisted expiry marker (`.expiry`) and grants a 10-minute grace window (`ANDROID_SHARE_GRACE_MS = 10 * 60 * 1000 = 600,000 ms`).
  `sweepTemporaryPDFs()` automatically unlinks expired files on startup, upon sign-out, or during cache maintenance.

### 2.7 PII-Safe Error Sanitization & Zero External Telemetry
- **Zero External Analytics**: ReloGo bundles no third-party crash reporting or user analytics SDKs (no Sentry, no Firebase Crashlytics, no Mixpanel, no Datadog).
- **Client-Side Redaction**: `mobile/lib/errorReporting.ts` intercepts uncaught errors and applies regular expression scrubbers:
  - Emails: `[\w.+-]+@[\w-]+\.[\w.-]+` -> `[REDACTED_EMAIL]`
  - Opaque tokens / UUIDs: `\b[A-Za-z0-9]{16,}\b` -> `[REDACTED_ID]`
  - Long digit strings (SIN, cards): `\d[\d\s./-]{4,}\d` -> `[REDACTED_NUM]`
- Sanitized diagnostics are written only to the local console during `__DEV__` mode and are never transmitted off the device.

### 2.8 PIPEDA "Delete My Data" Clean-Slate Erasure Cascade
Under the Personal Information Protection and Electronic Documents Act (PIPEDA) and App Store Guidelines, users possess the absolute right to complete erasure:
1. **Trigger**: User selects "Delete My Data" in the Profile tab.
2. **Local Vault Destruction**: `deleteAllPII()` purges all 5 SecureStore keys from the hardware Keystore/Keychain.
3. **Cache Sweeping**: `wipeFilledPDFs()` deletes all temporary PDF artifacts and `.expiry` markers.
4. **Database Cascade RPC**: The client executes `supabase.rpc("delete_current_user")`. This `SECURITY DEFINER` routine deletes the user from `auth.users WHERE id = auth.uid()`.
   PostgreSQL `ON DELETE CASCADE` constraints automatically and immediately delete:
   - `public.user_profiles` (move metadata)
   - `public.user_task_progress` (checklist state)
   - `public.support_messages` (support messages)
   - `public.support_threads` (support threads)
5. **Session Destruction**: `supabase.auth.signOut({ scope: "local" })` wipes the local session JWT from `AsyncStorage`.
6. **Result**: Complete, irrecoverable clean-slate erasure across client and cloud.

---

## 3. Live Store Disclosure Reconciliation

### 3.1 Live App Store Discrepancy & Regulatory Risk Analysis
- **Current Live Store State**: Version 1.0 (Apple ID `6781947478`) currently displays **"Data Not Collected"** on the live Apple App Store product page.
- **Discrepancy Analysis**: Under Apple App Store Review Guideline 5.1.1 (Data Collection and Storage) and Google Play Data Safety policies:
  1. ReloGo creates an anonymous user record (`auth.users.id`). Apple defines an account identifier as personal data under **Identifiers -> User ID**.
  2. ReloGo stores move planning parameters (origin, destination, date, vehicle, dependents) and checklist task completion states linked to this User ID. Apple defines this as **User Content -> Other User Content**.
  3. ReloGo stores support question selections and generates AI replies. Apple defines this as **User Content -> Customer Support**.
- **Regulatory & Rejection Risk**: Submitting 1.0.1 with "Data Not Collected" will cause immediate rejection under Apple Guideline 5.1.1 and Google Play Data Safety enforcement. The disclosure must be formally reconciled in both developer consoles.

### 3.2 Apple App Store Connect — App Privacy Questionnaire
To reconcile the discrepancy, configure the App Privacy questionnaire in App Store Connect as follows:

- **Question**: *"Do you or your third-party partners collect data from this app?"*
  - **Answer**: **YES**

| Data Category | Data Type | Collected? | Linked to User? | Used for Tracking? | Disclosed Purposes |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Identifiers** | **User ID** | **Yes** | **Yes** (linked to anonymous app account) | **No** | **App Functionality** (Account authentication and cross-device state persistence) |
| **User Content** | **Customer Support** | **Yes** | **Yes** | **No** | **App Functionality** (Fixed support question selection, automated relocation answers, human support escalation) |
| **User Content** | **Other User Content** | **Yes** | **Yes** | **No** | **App Functionality** (Origin and destination provinces, planned move date, vehicle/dependent flags, checklist task completion checkmarks) |
| **Location** | Precise / Coarse | **No** | N/A | **No** | *Not Collected* |
| **Contact Info** | Name, Email, Phone, Physical Address | **No** | N/A | **No** | *Not Collected* (Stored exclusively in local on-device Secure Enclave) |
| **Financial Info** | Payment / Credit Info | **No** | N/A | **No** | *Not Collected* |
| **Health & Fitness** | Health / Medical Data | **No** | N/A | **No** | *Not Collected* (Health card numbers stored exclusively in local on-device Secure Enclave) |
| **Diagnostics** | Crash Data / Performance | **No** | N/A | **No** | *Not Collected* (No third-party SDKs) |
| **Usage Data** | Product Interaction / Advertising | **No** | N/A | **No** | *Not Collected* |

#### App Store Connect App Review Information Note
When submitting 1.0.1, paste the following explanation into the **Review Notes**:
```text
PRIVACY & DATA COLLECTION NOTES:
ReloGo utilizes Supabase anonymous authentication. The app collects an anonymous User ID, relocation corridor parameters (provinces, move date, vehicle/dependent flags), checklist task checkmarks, and selected pre-set customer support questions strictly for core App Functionality.

SENSITIVE PERSONAL VAULT:
ReloGo features an optional on-device Personal Vault (Full Name, Date of Birth, Address, Driver's Licence Number, Health Card Number) used exclusively to assist users with filling official government PDF forms (e.g. BC Health Application). This sensitive data is stored strictly in the device's hardware-backed Secure Enclave (Keychain) via expo-secure-store. It is NEVER transmitted off-device, NEVER stored on ReloGo servers, and is permanently wiped when the user signs out or uses the in-app 'Delete My Data' feature.

DEMO CREDENTIALS:
The app uses anonymous instant onboarding. No username or password is required to test the full feature set.
```

### 3.3 Google Play Console — Data Safety Questionnaire
Configure the Google Play Console Data Safety section with the following exact selections:

1. **Data Collection & Security Declarations**:
   - *Does your app collect or share any of the required user data types?* -> **Yes**
   - *Is all user data collected by your app encrypted in transit?* -> **Yes** (enforced over TLS 1.3/HTTPS)
   - *Do you provide a way for users to request that their data be deleted?* -> **Yes**
   - *Deletion Request URL*: `https://relogo-two.vercel.app/privacy`

2. **Data Types Declared**:
   - **Personal Info -> User IDs**:
     - *Collected*: **Yes** | *Shared*: **No**
     - *Ephemeral*: **No** (retained until user requests deletion)
     - *Required*: **Yes**
     - *Purposes*: **App functionality**, **Account management**
   - **Messages -> Other in-app messages**:
     - *Collected*: **Yes** | *Shared*: **Yes** (Shared with service provider Google Cloud / Gemini API via server-side Edge Function to generate relocation answers)
     - *Ephemeral*: **No**
     - *Required*: **No** (Optional feature accessed only when user views Support tab)
     - *Purposes*: **App functionality**, **Customer support**
   - **App Activity -> Other user-generated content & in-app actions**:
     - *Collected*: **Yes** | *Shared*: **No**
     - *Ephemeral*: **No**
     - *Required*: **Yes**
     - *Purposes*: **App functionality** (Relocation province selection and task completion tracking)

3. **Explicitly Excluded Categories (Declared as "No")**:
   - Location (No), Personal Info: Name/Email/Address/Phone (No), Financial Info (No), Health & Fitness (No), Photos & Videos (No), Audio Files (No), Files & Documents (No), Calendar (No), Contacts (No), Device or Other IDs (No).

### 3.4 Government App Status Declaration
- **Question**: *"Is your app developed by, or on behalf of, a government agency?"*
- **Declaration**: **No**
- **Public Disclosure**: ReloGo is an independent consumer guide and moving utility. It aggregates and organizes publicly accessible official government rules and links directly to verified provincial ministry portals. It is not affiliated with, endorsed by, or representing any government body.

---

## 4. Comprehensive 7-Step Real-Device QA Test Runbook

This runbook must be executed on physical hardware prior to public rollout.

### Test Environment Setup
- **iOS Test Device**: Physical iPhone running iOS 17.0+ or iOS 18.0+, installed via TestFlight (Build 8).
- **Android Test Device**: Physical Android smartphone running Android 13.0+, installed from Build 5 AAB/APK.
- **Backend Target**: Active Supabase Production (`https://yskknolxbxfxakgvrcmg.supabase.co`).

---

### Step 1: Cold Startup & Native Splash Dismissal
1. Terminate the app completely from the app switcher.
2. Tap the ReloGo icon on the home screen.
3. **Verify**:
   - The native blue splash screen (`#2563EB`) displays immediately without artifacting.
   - Splash dismisses within <1.0 second as Hermes runtime initializes.
   - The loading indicator ("Getting your checklist ready…") appears smoothly.
   - First-time launch transitions cleanly to the Onboarding screen without visual flashes or hangs.

---

### Step 2: Offline Startup & Network Recovery UI
1. Enable **Airplane Mode** on the device (disconnecting all Wi-Fi and cellular connections).
2. Force quit and launch ReloGo cold.
3. **Verify**:
   - The app does not crash or display a blank white screen.
   - Within 8 seconds (governed by 3-second session timeout and 5-second profile timeout in `mobile/lib/startupTimeout.ts`), the controlled Recovery UI appears:
     - Header: *"Couldn't restore your session"* or *"Couldn't reach ReloGo"*
     - Body: *"Your local data is unchanged. Please try again."* / *"Check your connection and try again."*
     - Action: Interactive *"Retry"* button is rendered.
4. Disable Airplane Mode (restore active internet connection).
5. Tap the *"Retry"* button.
6. **Verify**:
   - The app resolves network connectivity immediately and transitions into Onboarding (or Checklist).

---

### Step 3: Onboarding & Legal Consent Enforcement
1. From the clean Onboarding screen:
   - Tap *"Get My Move Checklist"* without selecting provinces.
     - **Verify**: Alert appears: *"Missing Info: Please select your origin province or territory."*
   - Select Origin: *Alberta (AB)*, Destination: *Alberta (AB)*. Tap submit.
     - **Verify**: Alert appears: *"Same jurisdiction: Origin and destination must be different provinces or territories."*
   - Select Destination: *British Columbia (BC)*.
   - Leave the legal consent checkbox **UNCHECKED**. Tap submit.
     - **Verify**: Alert appears: *"Consent Required: Please agree to the Privacy Policy and Terms of Service to continue."*
     - **Verify**: Database check confirms exactly 0 users and 0 profiles were created.
   - Tap the *"Privacy Policy"* and *"Terms of Service"* inline text links.
     - **Verify**: Links open `https://relogo-two.vercel.app/privacy` and `https://relogo-two.vercel.app/terms` in the system browser.
2. Check the legal consent box (agreeing to version 1.1).
3. Select a move date 45 days in the future. Toggle *Has Vehicle* to **Yes** and *Has Dependents* to **Yes**.
4. Tap *"Get My Move Checklist"*.
5. **Verify**:
   - Button displays loading indicator.
   - App navigates directly to the Checklist tab.
   - Cloud audit confirms 1 anonymous user created in `auth.users` and 1 corresponding row in `user_profiles` containing non-PII fields only.

---

### Step 4: Checklist Navigation & Optimistic Completion
1. On the Checklist tab:
   - **Verify**: Header displays *"Alberta to British Columbia"*, formatted move date, and progress counter (*"0 of X tasks completed"*).
   - **Verify**: Urgency countdown badges display relative timelines (e.g. *"Within 90 days"*, *"Within 30 days"*).
2. Tap a task card (e.g. *"Switch driver's licence"*):
   - **Verify**: Accordion expands smoothly, revealing document preparation instructions.
   - **Verify**: *"Official Source"* button points to verified provincial URL (e.g. ICBC portal) and opens securely in in-app browser.
3. Tap the completion checkmark button:
   - **Verify**: Immediate optimistic UI toggle (button turns solid green, task strikes through, header counter increments to *"1 of X completed"*).
4. Perform pull-to-refresh on the checklist list:
   - **Verify**: Refresh spinner completes; completed status remains saved.
5. Force quit and relaunch the app:
   - **Verify**: App resumes directly on Checklist tab; completed task status persists accurately.

---

### Step 5: On-Device Personal Vault & BC Health PDF Assistance
1. Navigate to the **Profile** tab.
2. Scroll to *"Personal Vault (Stored on Device Only)"* and enter sample test data:
   - Full Name: `Jane Doe`
   - Date of Birth: `1990-05-14`
   - Street Address: `123 Government Way, Victoria, BC`
   - Driver's Licence Number: `1234567`
   - Health Card Number: `9876543210`
3. Tap *"Save Vault"*.
   - **Verify**: Confirmation alert confirms data was securely saved to device enclave.
4. Switch to the **Checklist** tab and locate the British Columbia *"Apply for MSP health coverage"* task.
5. Tap *"Fill Official Form"*:
   - **Verify**: Review Warning Modal appears, reminding the user that ReloGo provides local assistance only and all fields must be reviewed.
   - Tap *"Proceed"*.
   - **Verify**: App downloads official BC blank PDF, verifies SHA-256 hash (`30de754d...`), fills AcroForm fields in device RAM, and opens the native OS Share Sheet.
6. **Verify Cache Hygiene**:
   - On iOS: Dismiss the share sheet. Inspect app sandbox cache (`FileSystem.cacheDirectory`) -> filled PDF is deleted immediately.
   - On Android: Cancel chooser or share to Google Drive. Check cache -> `.expiry` marker is created; file is deleted after 10-minute grace window.

---

### Step 6: Customer Support Fixed Questions & AI Reply
1. Navigate to the **Support** tab.
2. **Verify**: There is **no free-text input box** or custom keyboard prompt.
3. Tap the allowlisted question: *"What should I do first for my move?"*.
4. **Verify**:
   - Question immediately appends to transcript with user bubble.
   - AI typing indicator displays.
   - Grounded response appears within 2–5 seconds, referencing official provincial portals and advising against sharing personal IDs in chat.
5. Tap *"Talk to a human"*:
   - **Verify**: Thread status transitions to *"Awaiting team follow-up"* and locks further automated processing.

---

### Step 7: PIPEDA Account Deletion ("Delete My Data")
1. Navigate to the **Profile** tab.
2. Scroll to the bottom and tap *"Delete My Data"* (red destructive button).
3. **Verify**: Confirmation modal warns: *"This permanently deletes your account, checklist progress, and all personal info stored on this device. This cannot be undone."*
4. Tap *"Delete Everything"*.
5. **Verify**:
   - The app clears local SecureStore PII keys.
   - The app sweeps temporary PDF cache files.
   - The app calls `delete_current_user` RPC, destroying cloud records.
   - The app signs out and transitions to the clean Onboarding screen.
6. **Verify Clean Slate**:
   - Force quit and relaunch: boots cleanly into Onboarding.
   - Query database: `auth.users`, `user_profiles`, `user_task_progress`, `support_threads`, and `support_messages` for this user contain **0 rows**.

---

## 5. Step-by-Step Store Submission Execution Guide

### 5.1 Apple App Store Submission (iOS Build 8)

#### Step 1: Pre-Submission Verification
Ensure all mobile repository checks pass before uploading:
```bash
cd /Users/tamimorif/Documents/GitHub/ReloGo/mobile
npm run check:release
npm test -- --runInBand
npm run lint
npm run typecheck
```

#### Step 2: Upload Binary via EAS Submit
Submit verified iOS Build 8 directly to App Store Connect:
```bash
cd /Users/tamimorif/Documents/GitHub/ReloGo/mobile
eas submit --profile production --platform ios \
  --id daa8e42a-c12d-4365-b6ca-ff36732cd858 \
  --non-interactive --no-wait
```

#### Step 3: Configure App Store Connect Metadata
Log into [App Store Connect](https://appstoreconnect.apple.com):
1. **Select App**: `ReloGo` (Apple ID: `6781947478`).
2. **Create Release**: Click `+` to add Version `1.0.1`.
3. **Select Build**: Under *Build*, select Build `8` (commit `cd3a87c`).
4. **What's New in This Version**:
   ```text
   ReloGo 1.0.1 provides a standardized Relocation Navigator & Moving Checklist across all 13 Canadian provinces and territories:
   - Tailored checklist with countdown deadlines based on your move date.
   - Document preparation guides and direct links to official provincial portals.
   - Local PDF assistance for compatible forms with zero off-device PII transmission.
   - Resilient offline mode and instant account deletion under PIPEDA.
   ```
5. **App Privacy Updates**: Complete the questionnaire strictly according to Section 3.2 (Declare User ID, Customer Support, and Other User Content under App Functionality).
6. **Export Compliance**: Select **No** for non-exempt encryption.
7. **App Review Information**: Paste the Demo Credentials and Privacy Review Notes from Section 3.2.

#### Step 4: Internal TestFlight & Final Review
1. Enable Build 8 for internal testing.
2. Complete the 7-Step Real-Device QA Runbook.
3. Click **"Submit for Review"**.

---

### 5.2 Google Play Store Submission (Android Build 5)

#### Step 1: Binary Submission Options
- **Option A (Manual Console Upload)**:
  1. Download verified release AAB: `https://expo.dev/artifacts/eas/YE5K0m3-pHxUcPSAenPpB9NCrI1h9ZQG9o3x5_c1Q5A.aab`
  2. Log into [Google Play Console](https://play.google.com/console).
  3. Navigate to `ReloGo` (`com.relogo.app`) -> *Testing* -> *Internal testing* (or *Production*).
  4. Create new release, upload the AAB file, and enter release notes.
- **Option B (Automated via EAS Submit)**:
  Once the Google Play Service Account JSON key is provisioned:
  ```bash
  cd /Users/tamimorif/Documents/GitHub/ReloGo/mobile
  eas submit --profile production --platform android \
    --id f839dede-1f83-4c6a-a928-de258597e6d0 \
    --non-interactive --no-wait
  ```

#### Step 2: Configure Google Play Data Safety
1. Navigate to *Policy and programs* -> *App content* -> *Data safety*.
2. Populate the questionnaire strictly matching Section 3.3 (User IDs, In-app messages, In-app actions).
3. Confirm data is encrypted in transit and link to deletion policy URL (`https://relogo-two.vercel.app/privacy`).

#### Step 3: Government App Declaration
Under *App content* -> *Government apps*, select:
**"My app is NOT developed by or on behalf of a government agency."**

#### Step 4: Staged Rollout
1. Roll out release to Internal Testing track.
2. Complete the 7-Step Real-Device QA Runbook on physical Android hardware.
3. Promote to Production with a staged rollout (20% -> 50% -> 100%).

---

### 5.3 Production Store Listing Metadata & Copy

| Field | Content |
| :--- | :--- |
| **App Name** | `ReloGo — Canadian Move Guide` |
| **Subtitle (iOS)** | `Canadian move checklist` (30 chars) |
| **Short Description (Android)** | `A personal checklist for moving across Canada.` (45 chars) |
| **Promotional Text** | `Keep common government updates, suggested timing, and official sources in one clear move checklist for all 13 provinces and territories.` |
| **Keywords (iOS)** | `canada,moving,relocation,checklist,provinces,territories,health card,driving,icbc,serviceontario` |
| **Primary Category** | `Utilities` |
| **Secondary Category** | `Productivity` |
| **Privacy Policy URL** | `https://relogo-two.vercel.app/privacy` |
| **Support URL** | `https://relogo-two.vercel.app/support` |
| **Marketing URL** | `https://relogo-two.vercel.app` |

#### Full App Description (iOS & Android)
```text
Moving between Canadian provinces or territories? ReloGo organizes official government updates, deadline timing, and document preparation guides into a clear, personalized relocation checklist.

Whether you are moving for work, school, or family, ReloGo helps you navigate the essential administrative steps across all 13 Canadian provinces and territories.

KEY FEATURES:

• Personalized Moving Checklist: Select your origin and destination provinces, move date, and whether you have a vehicle or dependents to generate a tailored task list.
• Urgency Countdowns & Suggested Timing: Track time-sensitive requirements with countdown badges based on official provincial regulations.
• Direct Official Sources: Every task card links directly to the verified government portal (e.g., ServiceOntario, ICBC, RAMQ, Health PEI) for authoritative information.
• Local Document Assistance: For supported forms—including British Columbia's Medical Services Plan application—fill standard fields directly on your device before sharing or printing.
• Zero-PII Hardware Security: Your personal details (name, date of birth, address, health card number, driver's licence number) are stored exclusively in your device's hardware-backed Secure Enclave. Sensitive identity details are never sent to ReloGo servers.
• Anonymous Onboarding: Start building your move checklist immediately with zero email registration or password friction.
• Complete Data Control: Exercise your PIPEDA rights anytime with our one-tap "Delete My Data" feature, completely wiping your device vault and cloud records.

Supported Jurisdictions:
Alberta, British Columbia, Manitoba, New Brunswick, Newfoundland and Labrador, Northwest Territories, Nova Scotia, Nunavut, Ontario, Prince Edward Island, Quebec, Saskatchewan, Yukon.
```

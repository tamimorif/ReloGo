# **ReloGo — Unified Enterprise Architecture & Phased Implementation Plan**

This master document merges the strict data privacy and agent directives from the Structure.pdf specification with a highly scalable, senior-level monorepo architecture.

It defines exactly **what** tools to use, **how** they interact, and provides a strict **phased implementation plan** to build the application down to the last detail.

> ⚠️ **STATUS RECONCILIATION (updated 2026-06-11).** The repository as committed **does not yet match the original monorepo blueprint below**. Sections 1 & 2 have been corrected to describe what is *actually on disk*; the original aspirational targets are preserved inline as "Planned →". Per-phase ✅/🟡/🔲 status markers and a **Critical Issues** list (Section 4) have been added. Read those before starting any agent work.
>
> **Quick reality check (updated 2026-06-12):**
> - There is **no Turborepo / pnpm workspace** — the repo is a flat collection of independent folders (`mobile/`, `landing/`, `admin/`, `worker/`, `supabase/`), each with its own `package.json` and no shared linkage.
> - Shared TS types are **duplicated but identical** in `mobile/types/database.ts` and `admin/src/types/database.ts` (verified by diff; keep both in sync until #C2 lands).
> - The **admin dashboard is a Vite + React SPA**, not Next.js 14. Only the **landing** app is Next.js.
> - **Phases 1–6 are code-complete and build-verified** (mobile `tsc`, admin `vite build`, landing static export, SQL parsed with libpg_query, plus two multi-agent adversarial review passes). **Phase 7 configs exist** (`eas.json`, `vercel.json`×2, CI workflow, `docs/DEPLOYMENT.md`) but **nothing has been deployed or run against a live Supabase project yet** — that requires credentials/dashboards (see docs/DEPLOYMENT.md runbook).

## **1\. Enterprise Tech Stack & Paradigm**

We are utilizing a **BaaS** approach. Supabase handles the database and Auth with strict Row Level Security (RLS), allowing the mobile app to securely query data directly without needing a middleman REST API for standard CRUD operations.

* **Repo layout (ACTUAL):** Flat multi-folder repo — **no** monorepo manager installed. *(Planned → Turborepo + pnpm workspaces. Not yet adopted; each app installs deps independently.)*
* **Database & Auth (Agent 1):** Supabase (PostgreSQL). Strict RLS policies. ✅ scaffolded.
* **Mobile Client (Agent 2):** Expo React Native (**SDK 51**), Expo Router, NativeWind v4 (Tailwind), pdf-lib, expo-secure-store, expo-file-system, expo-sharing. ⚠️ **TanStack Query is NOT yet a dependency** despite being mandated in Phase 3 — it must be added before building the checklist.
* **Worker/Scraper (Agent 3):** Python 3.11, Playwright (Headless), tenacity (for retry logic). ✅ scaffolded.
* **Web — Landing (Agent 4):** Next.js 14 (App Router), Tailwind CSS, lucide-react. 🟡 config only, no `app/` code yet.
* **Web — Admin (Agent 4):** **Vite + React 18 SPA** + Tailwind + `@supabase/supabase-js`. *(Planned → Next.js 14; actual implementation chose Vite SPA. Keep Vite unless there's a reason to converge.)* 🟡 components scaffolded.
* **Deployment:** Vercel (Web), Railway (Python Worker), EAS (Mobile). 🔲 not started.

## **2\. Repository Structure**

**ACTUAL (on disk today):**

ReloGo/  
├── mobile/               \# Expo React Native (SDK 51) — the core product  
│   ├── app/(auth)/       \# onboarding.tsx, _layout.tsx  ✅  
│   ├── app/(tabs)/       \# _layout.tsx ONLY — checklist/profile/index screens MISSING 🔲  
│   ├── lib/              \# supabase.ts, secureStore.ts, pdfEngine.ts ✅  
│   └── types/database.ts \# DUPLICATED copy of DB types ⚠️  
├── landing/              \# Next.js 14 — config only, no app/ code yet 🟡  
├── admin/                \# Vite + React SPA (NOT Next.js)  
│   └── src/{App,main}.tsx, components/{AlertsTable,EditRuleModal,LoginForm}.tsx,  
│       lib/supabase.ts, types/database.ts (DUPLICATED ⚠️) ✅  
├── worker/               \# Python Playwright scraper (main.py, Dockerfile, requirements.txt) ✅  
├── supabase/migrations/  \# 001_init.sql (7 tables incl. waitlist) ✅  
└── ReloGo Master Plan.md \# this file

**Planned → (NOT yet created — adopt only if/when you migrate to a monorepo):** a root `package.json` + `turbo.json` + pnpm workspaces; `apps/` wrapper; `packages/shared` (Zod schemas, province lists), `packages/ui` (shared components), `packages/database` (single source of generated types to **replace the two duplicated `database.ts` files**); a `docs/` directory.

## **3\. Phased Implementation Strategy**

Do not build random screens. Build one complete vertical feature from the database up to the UI before moving to the next.

### **Phase 1: Database Architecture & Security (Agent 1\)** — ✅ DONE (2026-06-12)

**Status:** `001_init.sql` (7 tables incl. `waitlist`, RLS) + **`002_hardening_and_user_deletion.sql`**: fixes the `VARCHAR(2)` vs `'ANY'` wildcard bug, adds `requires_vehicle`/`requires_dependents` (Phase 3 filtering), `official_sources.last_content_hash` (scraper baseline), province/email CHECK constraints, corridor uniqueness, FK indexes, `updated_at` triggers, `delete_current_user()` RPC, `admin_users` + `is_admin()` admin RLS, and statement-level `(SELECT auth.uid())` policies. Both migrations validated with libpg_query. **Remaining:** apply to a live Supabase project (`npx supabase db push` or SQL editor) — Docker/CLI unavailable on this machine, so they have not run against a real database yet.

**Goal:** Establish the foundational data layer with strict types and RLS policies. **Tools:** Supabase CLI, PostgreSQL.

1. **Initialize Supabase Local Dev:** Run npx supabase init and npx supabase start.  
2. **Create 001\_init.sql Migration:** Exactly matching the Structure.pdf requirements:  
   * **global\_tasks**: id, task\_key, title\_en, base\_description\_en.  
   * **corridor\_task\_rules**: id, task\_id, origin\_province, dest\_province, days\_deadline, is\_mandatory.  
   * **official\_sources**: id, corridor\_rule\_id, agency\_name, official\_url.  
   * **rule\_change\_alerts**: For scraper. old\_hash, new\_hash, status (PENDING/APPROVED/DISMISSED).  
   * **user\_profiles**: Maps to auth.users(id). move\_date, origin\_prov, dest\_prov, has\_vehicle, has\_dependents.  
   * **user\_task\_progress**: Composite PK (user\_id, task\_rule\_id). Status: LOCKED/AVAILABLE/COMPLETED.  
3. **Implement RLS (Row Level Security):**  
   * *Public Tables* (global\_tasks, corridor\_task\_rules, official\_sources): SELECT for anon/authenticated. NO insert/update.  
   * *Private Tables* (user\_profiles, user\_task\_progress): Policy auth.uid() \= id.  
   * *Admin Tables* (rule\_change\_alerts): service\_role only.  
4. **Generate Types:** Run Supabase CLI to generate TS types and output them to packages/database/types.ts.

### **Phase 2: Mobile Foundation & PIPEDA Compliance (Agent 2\)** — ✅ BACKEND DONE (2026-06-12) / 🔲 profile screen pending

**Status:** Data layer complete: `lib/supabase.ts` (typed client, AES-encrypted session storage via the LargeSecureStore pattern, foreground-only token refresh), `lib/secureStore.ts` (PII enclave wrapper), `lib/account.ts` (`deleteAccount()`: RPC → PII wipe → local sign-out). Onboarding now uses `signInAnonymously()` (enable **anonymous sign-ins** in the Supabase dashboard) and inserts the correct `user_profiles` columns. **Remaining (front, deferred):** the `(tabs)/profile.tsx` screen with the "Delete My Data" button wired to `deleteAccount()`.

**Goal:** Setup the Expo app, Supabase Auth, and the strict on-device PII storage. **Tools:** Expo Router, expo-secure-store, @supabase/supabase-js.

1. **Expo Setup:** Initialize apps/mobile with Expo Router and NativeWind.  
2. **Auth Flow:** Build /(auth)/onboarding.tsx to collect origin, dest, date, vehicle, kids. On submit, insert into user\_profiles.  
3. **Secure Store Wrapper (lib/secureStore.ts):** \* **CRITICAL:** Create a wrapper for expo-secure-store.  
   * Define keys: HEALTH\_CARD\_NUMBER, DRIVERS\_LICENCE\_NUMBER, STREET\_ADDRESS.  
   * *Rule:* These values must **never** be passed to the Supabase client. They live solely in the device's secure enclave.  
4. **Data Deletion:** In app/(tabs)/profile.tsx, add a "Delete My Data" button that wipes the SecureStore and calls a Supabase RPC to delete the auth.users record.

### **Phase 3: The Relocation Engine & Checklist (Agent 2\)** — ✅ DONE (2026-06-12)

**Status:** `(tabs)/checklist.tsx` implemented: profile-driven corridor query with `'ANY'`-wildcard matching (two AND-ed `.or()` filters), `requires_vehicle`/`requires_dependents` filtering, deadline computation (`move_date + days_deadline`, overdue chips), optimistic completion toggles via TanStack Query v5 (row-scoped rollback), LOCKED-status guard, pull-to-refresh, loading/error/empty states. `(tabs)/profile.tsx` also done (move details editing, on-device PII vault UI, sign-out, Delete My Data). **Note:** `@tanstack/react-query` is pinned to exactly `5.45.0` — newer 5.x d.ts requires TS ≥5.4 and silently degrades generics to `any` under the project's TS 5.3 (bump `typescript` to ~5.4+ before unpinning).

**Goal:** Render the dynamic, personalized relocation checklist based on the user's profile. **Tools:** TanStack Query (React Query), Supabase JS Client.

1. **The Query Logic:** In app/(tabs)/checklist.tsx:  
   * Fetch the user's user\_profiles data.  
   * Query corridor\_task\_rules where origin\_province and dest\_province match the user.  
   * *Filter:* If has\_vehicle is false, filter out vehicle-related rules via client-side or DB view logic.  
2. **UI Implementation:** Render tasks in a DAG/FlatList. Use React Query's useMutation with optimistic updates to instantly toggle the status in user\_task\_progress from AVAILABLE to COMPLETED.

### **Phase 4: The PDF Generation Engine (Agent 2\)** — ✅ DONE (2026-06-12; real gov PDFs pending)

**Status:** `lib/pdfEngine.ts` hardened (PII-laden filled PDFs live in a dedicated cache dir wiped at app start / before each fill / on iOS post-share / on account deletion — Android defers to avoid breaking share targets; chunked base64 to avoid stack overflow). A sample AcroForm template (`assets/pdfs/sample-form.pdf`, field names matching `FIELD_TO_PII`) is registered under `UPDATE_HEALTH_CARD`, and every checklist row has a "Fill & Share PDF" action (serialized — one share flow at a time). **Remaining:** source real government PDFs per task and register them in `TASK_PDF_ASSETS` (keyed by `task_key`).

**Goal:** Auto-fill government forms entirely on the device to maintain absolute privacy. **Tools:** pdf-lib, expo-file-system, expo-sharing.

1. **Asset Management:** Store blank government PDFs as static assets or fetch them securely.  
2. **lib/pdfEngine.ts:** \* Create an async function fillAndSharePDF(taskId).  
   * Fetch required PII from lib/secureStore.ts.  
   * Load the blank PDF into memory using pdf-lib.  
   * Map the local PII text into the PDF form fields.  
   * Save the modified PDF temporarily to FileSystem.cacheDirectory.  
   * Call Sharing.shareAsync() to open the native iOS/Android share sheet.

### **Phase 5: Automated Scraper Worker (Agent 3\)** — ✅ MOSTLY DONE (contract fixed 2026-06-12)

**Status:** `worker/main.py` previously wrote to columns that don't exist (`source_id`, `corridor_rule_id` on `rule_change_alerts`); now aligned with the real schema (`official_source_id`), uses `official_sources.last_content_hash` as the change-detection baseline (first scrape records a baseline silently instead of spamming alerts), and has plan-mandated `tenacity` retries (3 attempts, exponential backoff). **Remaining:** run end-to-end against a live Supabase project.

**Goal:** Automate the monitoring of Canadian government URLs for hidden rule changes. **Tools:** Python 3.11, playwright, supabase-py, tenacity.

1. **Setup apps/worker/main.py:** Use SUPABASE\_SERVICE\_ROLE\_KEY to bypass RLS.  
2. **Scraping Loop:** \* Fetch all rows from official\_sources.  
   * Use Playwright headless to visit each URL. Extract document.body.innerText.  
   * Apply tenacity retry decorators to handle flaky government websites (e.g., retry 3 times on timeout).  
3. **Change Detection:**  
   * Generate a SHA-256 hash of the extracted text.  
   * Compare against the latest hash in the database.  
   * If different: INSERT a row into rule\_change\_alerts with status PENDING. *Never update live rules directly.*

### **Phase 6: Web Platforms (Agent 4\)** — ✅ DONE (2026-06-12)

**Status:** **Landing** (`landing/`): full hero + 13-province "Moving from / Moving to" selects revealing the email capture, submitting via the `join_waitlist()` RPC (direct table inserts are RLS-denied to prevent email enumeration); "How it works" + privacy sections; static export (`out/`) build-verified with no env vars present. **Admin** (`admin/`): authorization is now server-side — `App.tsx` gates the dashboard behind the `is_admin()` RPC (fails closed) with a `NotAuthorized` screen; the client-side email allowlist was **removed** (it leaked admin emails in the public bundle); "Save & Approve" is atomic via the `approve_rule_change()` RPC and NULL deadlines round-trip correctly; `diff_summary` shown per alert. Note the real paths are `landing/` and `admin/`, not `apps/web-*`.

**Added 2026-06-12 — Admin "Users" page:** a second tab in the admin dashboard lists every user (corridor, move date, vehicle/kids flags, checklist progress, joined / last sign-in) with a click-through detail modal showing per-task status. Backed by migration `003_admin_user_views.sql`: admin-read RLS on `user_profiles`/`user_task_progress` + `admin_list_users()` / `admin_get_user_detail()` SECURITY DEFINER RPCs (the only bridge to `auth.users` metadata). Read-only by design; **no PII is or can be shown** — identity documents exist only on user devices (PIPEDA).

**Goal:** Build the public marketing face and the private admin controls. **Tools:** Next.js 14 (landing) + Vite/React SPA (admin), Tailwind CSS.

1. **Landing Page (`landing/`):**  
   * Must use output: 'export' in next.config.js.  
   * Hero section with hook: Two \<select\> dropdowns (Moving From, Moving To).  
   * When selected, reveal email input \-\> INSERT into waitlist table.  
2. **Admin Dashboard (`admin/` — Vite SPA):**  
   * Protected by Supabase Auth (gate access to specific admin emails).  
   * Render a Data Table querying rule\_change\_alerts where status \= PENDING.  
   * Provide two actions: "Dismiss" (Updates status to DISMISSED) and "Edit Rules" (Opens a modal to manually update corridor\_task\_rules).

### **Phase 7: Deployment & Hardening** — 🟡 CONFIGS DONE (2026-06-12), NOT YET DEPLOYED

**Status:** `mobile/eas.json` (dev/preview/production profiles), `landing/vercel.json` + `admin/vercel.json` (SPA fallback rewrite), `.github/workflows/ci.yml` (mobile typecheck, admin/landing builds, worker py_compile), `docs/DEPLOYMENT.md` (full runbook: Supabase link/push + anonymous sign-ins toggle + admin seeding, Vercel, Railway, EAS/OTA), and a real root `README.md`. **Remaining (requires accounts/credentials):** actually apply migrations to a live Supabase project, create the Vercel/Railway/EAS projects, and run the post-deploy smoke checklist in docs/DEPLOYMENT.md.

**Goal:** Push to production automatically.

1. **Database:** Apply 001\_init.sql to production Supabase project.  
2. **Mobile (EAS):** Initialize eas.json. Configure for iOS/Android builds. Set up Over-The-Air (OTA) updates so PDF mapping fixes can be pushed instantly without app store review.  
3. **Worker (Railway):** Deploy the Python worker as a cron job or continuous background service via Dockerfile.  
4. **Web (Vercel):** Connect GitHub to Vercel. Deploy `landing/` and `admin/` as separate projects pointing to their respective directories. (Admin is a Vite SPA — use the Vite/static build preset, not the Next.js preset.)

## **4\. Critical Issues & Decisions Needed**

These are blockers or inconsistencies found while reconciling the plan against the committed code. Resolve before the relevant phase.

* **#C1 — Missing user-deletion RPC — ✅ RESOLVED (2026-06-12).** `002_hardening_and_user_deletion.sql` adds `delete_current_user()` (SECURITY DEFINER, authenticated-only), and `mobile/lib/account.ts` implements the full flow: RPC → on-device PII wipe → local sign-out. The Phase 2.4 profile screen just needs to call `deleteAccount()`.
* **#C2 — Architecture mismatch: monorepo vs. flat repo.** Sections 1–2 originally assumed Turborepo/pnpm workspaces and `apps/`+`packages/`. The code is a flat repo with no workspace wiring. **Decision needed:** either (a) adopt the monorepo now (move folders under `apps/`, add root `package.json`/`turbo.json`/`pnpm-workspace.yaml`, extract `packages/database|shared|ui`), or (b) accept the flat layout and stop referencing the monorepo. The plan now documents the flat layout as ACTUAL.
* **#C3 — Duplicated DB types — 🟡 MITIGATED (2026-06-12).** Both files were rewritten to an identical, schema-accurate `Database` interface (they previously described two different imaginary schemas). They are still two copies — centralize when the monorepo decision (#C2) lands; until then both carry a KEEP IN SYNC header.
* **#C4 — Admin is Vite, not Next.js.** The plan repeatedly said "Next.js 14 for both web apps." Reality: admin is a Vite + React SPA. This is fine, but Vercel deploy config, env-var prefixing (`VITE_` vs `NEXT_PUBLIC_`), and any shared-UI assumptions must account for two different frameworks. Confirm you want to keep them split.
* **#C5 — TanStack Query not installed — ✅ RESOLVED (2026-06-12).** Installed (pinned exactly `5.45.0` — see Phase 3 note about the TS 5.3 compatibility trap), `QueryClientProvider` wraps the root layout, and the checklist/profile screens use it with optimistic updates.
* **#C6 — Admin auth gating — ✅ RESOLVED (2026-06-12).** Migration 002 adds an `admin_users` table + `is_admin()` SECURITY DEFINER function, with RLS policies letting admin members SELECT/UPDATE `rule_change_alerts` and UPDATE `corridor_task_rules` via the anon key. `App.tsx` gates the dashboard behind the `is_admin()` RPC (fails closed) with a `NotAuthorized` screen; the client-side `VITE_ADMIN_EMAILS` allowlist was **removed entirely** (it leaked admin emails into the public bundle). Grant access with: `INSERT INTO admin_users (user_id) SELECT id FROM auth.users WHERE email = '…';` (service_role).
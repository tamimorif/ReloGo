# **ReloGo — Unified Enterprise Architecture & Phased Implementation Plan**

This master document merges the strict data privacy and agent directives from the Structure.pdf specification with a highly scalable, senior-level monorepo architecture.

It defines exactly **what** tools to use, **how** they interact, and provides a strict **phased implementation plan** to build the application down to the last detail.

## **1\. Enterprise Tech Stack & Paradigm**

We are utilizing a **BaaS \+ Monorepo** approach. Supabase handles the database and Auth with strict Row Level Security (RLS), allowing the mobile app to securely query data directly without needing a middleman REST API for standard CRUD operations.

* **Monorepo Manager:** Turborepo (pnpm workspaces)  
* **Database & Auth (Agent 1):** Supabase (PostgreSQL). Strict RLS policies.  
* **Mobile Client (Agent 2):** Expo React Native (SDK 50+), Expo Router, NativeWind (Tailwind), TanStack Query, pdf-lib, expo-secure-store.  
* **Worker/Scraper (Agent 3):** Python 3.11, Playwright (Headless), tenacity (for retry logic).  
* **Web Apps (Agents 3 & 4):** Next.js 14 (App Router), Tailwind CSS, lucide-react. Used for both the Landing Page and the Admin Dashboard.  
* **Deployment:** Vercel (Web), Railway (Python Worker), EAS (Mobile).

## **2\. Master Monorepo Structure**

ReloGo/  
├── apps/  
│   ├── mobile/           \# Expo React Native App (The core product)  
│   ├── web-landing/      \# Next.js Static Export (Marketing & Waitlist)  
│   ├── web-admin/        \# Next.js SPA (Rule Change Review Dashboard)  
│   └── worker/           \# Python Playwright Scraper  
├── packages/  
│   ├── shared/           \# Zod schemas, shared constants (e.g., Province Lists)  
│   ├── ui/               \# Shared React/Tailwind UI components  
│   └── database/         \# Auto-generated Supabase TypeScript types  
├── docs/                 \# Single source of truth (Product, API, DB docs)  
├── supabase/  
│   └── migrations/       \# Raw SQL schemas (001\_init.sql)  
└── package.json          \# Root workspace config

## **3\. Phased Implementation Strategy**

Do not build random screens. Build one complete vertical feature from the database up to the UI before moving to the next.

### **Phase 1: Database Architecture & Security (Agent 1\)**

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

### **Phase 2: Mobile Foundation & PIPEDA Compliance (Agent 2\)**

**Goal:** Setup the Expo app, Supabase Auth, and the strict on-device PII storage. **Tools:** Expo Router, expo-secure-store, @supabase/supabase-js.

1. **Expo Setup:** Initialize apps/mobile with Expo Router and NativeWind.  
2. **Auth Flow:** Build /(auth)/onboarding.tsx to collect origin, dest, date, vehicle, kids. On submit, insert into user\_profiles.  
3. **Secure Store Wrapper (lib/secureStore.ts):** \* **CRITICAL:** Create a wrapper for expo-secure-store.  
   * Define keys: HEALTH\_CARD\_NUMBER, DRIVERS\_LICENCE\_NUMBER, STREET\_ADDRESS.  
   * *Rule:* These values must **never** be passed to the Supabase client. They live solely in the device's secure enclave.  
4. **Data Deletion:** In app/(tabs)/profile.tsx, add a "Delete My Data" button that wipes the SecureStore and calls a Supabase RPC to delete the auth.users record.

### **Phase 3: The Relocation Engine & Checklist (Agent 2\)**

**Goal:** Render the dynamic, personalized relocation checklist based on the user's profile. **Tools:** TanStack Query (React Query), Supabase JS Client.

1. **The Query Logic:** In app/(tabs)/checklist.tsx:  
   * Fetch the user's user\_profiles data.  
   * Query corridor\_task\_rules where origin\_province and dest\_province match the user.  
   * *Filter:* If has\_vehicle is false, filter out vehicle-related rules via client-side or DB view logic.  
2. **UI Implementation:** Render tasks in a DAG/FlatList. Use React Query's useMutation with optimistic updates to instantly toggle the status in user\_task\_progress from AVAILABLE to COMPLETED.

### **Phase 4: The PDF Generation Engine (Agent 2\)**

**Goal:** Auto-fill government forms entirely on the device to maintain absolute privacy. **Tools:** pdf-lib, expo-file-system, expo-sharing.

1. **Asset Management:** Store blank government PDFs as static assets or fetch them securely.  
2. **lib/pdfEngine.ts:** \* Create an async function fillAndSharePDF(taskId).  
   * Fetch required PII from lib/secureStore.ts.  
   * Load the blank PDF into memory using pdf-lib.  
   * Map the local PII text into the PDF form fields.  
   * Save the modified PDF temporarily to FileSystem.cacheDirectory.  
   * Call Sharing.shareAsync() to open the native iOS/Android share sheet.

### **Phase 5: Automated Scraper Worker (Agent 3\)**

**Goal:** Automate the monitoring of Canadian government URLs for hidden rule changes. **Tools:** Python 3.11, playwright, supabase-py, tenacity.

1. **Setup apps/worker/main.py:** Use SUPABASE\_SERVICE\_ROLE\_KEY to bypass RLS.  
2. **Scraping Loop:** \* Fetch all rows from official\_sources.  
   * Use Playwright headless to visit each URL. Extract document.body.innerText.  
   * Apply tenacity retry decorators to handle flaky government websites (e.g., retry 3 times on timeout).  
3. **Change Detection:**  
   * Generate a SHA-256 hash of the extracted text.  
   * Compare against the latest hash in the database.  
   * If different: INSERT a row into rule\_change\_alerts with status PENDING. *Never update live rules directly.*

### **Phase 6: Web Platforms (Agents 3 & 4\)**

**Goal:** Build the public marketing face and the private admin controls. **Tools:** Next.js 14, Tailwind CSS.

1. **Landing Page (apps/web-landing):**  
   * Must use output: 'export' in next.config.js.  
   * Hero section with hook: Two \<select\> dropdowns (Moving From, Moving To).  
   * When selected, reveal email input \-\> INSERT into waitlist table.  
2. **Admin Dashboard (apps/web-admin):**  
   * Protected by Supabase Auth (gate access to specific admin emails).  
   * Render a Data Table querying rule\_change\_alerts where status \= PENDING.  
   * Provide two actions: "Dismiss" (Updates status to DISMISSED) and "Edit Rules" (Opens a modal to manually update corridor\_task\_rules).

### **Phase 7: Deployment & Hardening**

**Goal:** Push to production automatically.

1. **Database:** Apply 001\_init.sql to production Supabase project.  
2. **Mobile (EAS):** Initialize eas.json. Configure for iOS/Android builds. Set up Over-The-Air (OTA) updates so PDF mapping fixes can be pushed instantly without app store review.  
3. **Worker (Railway):** Deploy the Python worker as a cron job or continuous background service via Dockerfile.  
4. **Web (Vercel):** Connect GitHub to Vercel. Deploy web-landing and web-admin as separate projects pointing to their respective directories.
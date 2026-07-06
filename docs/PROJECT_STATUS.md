# ReloGo — Project Status

_Last updated: 2026-07-06_

This is a snapshot of what is built, verified, and outstanding. For deployment
steps see [`DEPLOYMENT.md`](DEPLOYMENT.md); for the file map + agent guide see
[`ai/`](ai/).

## Summary

All seven planned phases are **code-complete and build-verified**, plus an
added admin **Users** page and an in-app **support chat + AI** feature. This is a
complete **MVP codebase** — but "100%" for a *launched, compliant, scalable*
product is a larger surface than the MVP.

Roughly: the **build** is ~95% done; the **product** (deployed, content-filled,
monitored, compliant, in stores) is ~50% done — further along now that all 13
provinces/territories are seeded (migration 005) and the Supabase project is
provisioned. The remaining gap is deployment, content *verification*, hardening,
and compliance — laid out in the [Implementation Map](#implementation-map),
[Remaining to reach 100%](#remaining-to-reach-100), and the
[Roadmap](#roadmap-senior-architecture-view) below.

| Phase | Area | Status |
| --- | --- | --- |
| 1 | Database architecture & RLS | ✅ Done |
| 2 | Mobile foundation & PIPEDA (auth, secure store, account deletion) | ✅ Backend done · profile screen done |
| 3 | Relocation engine & checklist | ✅ Done |
| 4 | On-device PDF generation | ✅ Done (sample template; real gov PDFs pending) |
| 5 | Automated scraper worker | ✅ Done (pending live run) |
| 6 | Web platforms (landing + admin) | ✅ Done |
| 7 | Deployment & hardening configs | 🟡 Configs done · Supabase project created & linked · not yet fully deployed |
| + | Admin "Users" page | ✅ Done |
| + | Support chat + AI (in-app chat, admin Messages tab, Gemini Edge Function) | ✅ Done |

## What was built

### Database (`supabase/migrations/`)
- **001_init.sql** — 7 tables (`global_tasks`, `corridor_task_rules`,
  `official_sources`, `rule_change_alerts`, `user_profiles`,
  `user_task_progress`, `waitlist`), RLS on every table, ON→AB seed data.
- **002_hardening_and_user_deletion.sql** — fixed the `VARCHAR(2)` vs `'ANY'`
  wildcard bug; added `requires_vehicle`/`requires_dependents`,
  `official_sources.last_content_hash`, province/email CHECK constraints,
  uniqueness, FK indexes, `updated_at` triggers; `delete_current_user()`
  (PIPEDA right-to-erasure); `admin_users` + `is_admin()` + admin RLS; atomic
  `approve_rule_change()`; enumeration-safe `join_waitlist()`; statement-level
  `(SELECT auth.uid())` policies.
- **003_admin_user_views.sql** — admin-read RLS on `user_profiles` /
  `user_task_progress`; `admin_list_users()` and `admin_get_user_detail()`
  SECURITY DEFINER RPCs (the only bridge to `auth.users` metadata).
- **004_support_messages.sql** — `support_threads` + `support_messages` chat
  tables (+ RLS), with Supabase **Realtime** enabled on both so the app and admin
  see new messages live. Backs the in-app support chat and the admin Messages tab.
- **005_seed_all_corridors.sql** — expands checklist coverage from the single
  ON→AB seed to **all 13 provinces & territories**: core destination tasks
  (driver's licence, vehicle registration, health card, school enrollment) for
  every destination plus a federal CRA address-change task, with deadlines +
  official-source URLs researched June 2026. Its header flags the data as a
  *starting point to verify* before relying on it.

### Mobile (`mobile/`)
- Typed Supabase client with AES-encrypted session storage (LargeSecureStore),
  foreground-only token refresh.
- `lib/secureStore.ts` PII vault, `lib/account.ts` `deleteAccount()`
  (RPC → PII wipe → filled-PDF wipe → local sign-out).
- `lib/pdfEngine.ts` — on-device PDF form fill + share, with cache hygiene that
  never lets a PII-laden PDF outlive its use.
- Screens: onboarding, **checklist** (corridor/wildcard matching, vehicle/kids
  filtering, deadline computation, optimistic completion toggles via TanStack
  Query), **profile** (move details, on-device PII vault, Delete My Data), and
  **contact** (in-app support chat — see Support chat + AI below).
- Static assets (placeholder icons/splash) + a sample AcroForm PDF template.

### Landing (`landing/`)
- Next.js 14 static export: hero, corridor picker that reveals the waitlist
  signup (`join_waitlist()` RPC), "How it works", privacy section.

### Admin (`admin/`)
- Server-side `is_admin()` gate with a `NotAuthorized` screen.
- **Alerts** tab — review/dismiss/approve rule-change alerts; atomic
  Save & Approve via `approve_rule_change()`; NULL deadlines round-trip.
- **Users** tab — user list (corridor, move date, flags, progress, joined /
  last sign-in) + detail modal (account meta, move details, per-task checklist).
  Read-only; displays no PII by construction.
- **Messages** tab — support-chat inbox: review threads, take over from the AI
  (`AWAITING_HUMAN` / `HUMAN`), reply, and resolve. Live via Supabase Realtime.

### Worker (`worker/`)
- Playwright scraper aligned to the real schema; uses
  `official_sources.last_content_hash` as the baseline (first scrape records
  silently); tenacity retries (3×, exponential backoff).

### Support chat + AI (`supabase/functions/support-ai/`)
- In-app chat threads answered by a Supabase **Edge Function** (Deno) calling
  **Gemini** — but only while a thread's `status = 'AI'`. Once escalated or a
  human takes over, the function returns without ever sending the conversation to
  Gemini. No email collected; PII is refused by the AI and never leaves the
  device. Data model + deploy steps in
  [DEPLOYMENT.md](DEPLOYMENT.md#support-chat-threads--messages).

### Tooling / repo hygiene
- `.env.example` in all four apps (documented, with where-to-find guidance).
- Root + per-app `.gitignore` (node_modules, builds, `.env`, `__pycache__`);
  removed a committed `.DS_Store`.
- `.github/workflows/ci.yml`, `mobile/eas.json`, `landing/vercel.json`,
  `admin/vercel.json`, `docs/DEPLOYMENT.md`.
- iOS store screenshots captured (`store-screenshots/`, iphone + ipad).
- **2026-07-05:** removed an unused `react-native-picker-select` (defused a
  missing native peer-dependency landmine) and a redundant `@types/react-native`
  from `mobile/`; lockfile regenerated, typecheck still clean.
- `docs/ai/` — AI-agent handoff folder (`AGENTS.md`, `PROJECT_MAP.md`, `HANDOFF.md`).
- **2026-07-06:** first automated tests — `mobile/lib/dateHelpers.ts` extracted +
  jest/ts-jest with 20 deadline/timezone tests (`mobile-test` job); `worker/changedetect.py`
  extracted + 14 pytest cases (`worker-test` job); plus a free daily worker cron
  (`.github/workflows/worker.yml`; needs repo secrets).

## How it was verified

- **Static checks:** mobile `tsc --noEmit`, admin `vite build`, landing static
  export build, worker `py_compile`; all three migrations parsed with
  libpg_query; the `Database` type interface confirmed byte-identical between
  `mobile/types/database.ts` and `admin/src/types/database.ts`.
- **Adversarial multi-agent review** (several passes): independent lenses
  (SQL/RLS security, contract consistency, runtime correctness, PIPEDA,
  deploy-readiness) each raised findings that were then majority-voted by
  refuter agents; only confirmed findings were fixed.
- **Notable bugs caught & fixed:** an app-bundle-breaking polyfill import;
  admin silently corrupting NULL deadlines to 0; a timezone off-by-one on move
  dates; PII-laden PDFs surviving account deletion; waitlist email enumeration;
  an onboarding race; non-atomic rule approval; admin emails leaking in the
  bundle; and a user-progress count that disagreed with the mobile checklist.
- **Live smoke:** the landing page was run locally (`next dev`) and exercised
  end-to-end in a browser (corridor select → waitlist reveal). The waitlist
  *submission* itself needs a live Supabase project.

## Implementation Map

The ordered path from "MVP codebase" to "live product." Do these top-to-bottom;
each step links to the how-to in [DEPLOYMENT.md](DEPLOYMENT.md). Steps 0–1 are
mechanical (hours); the real work is steps 2–5.

0. **Turn it on** — `supabase db push` (migrations 001–005), enable anonymous
   sign-ins, seed `admin_users`, and fill each app's `.env` from `.env.example`.
   → [DEPLOYMENT §1](DEPLOYMENT.md#1-supabase-database)
1. **Deploy the surfaces** — Vercel (landing + admin), deploy the `support-ai`
   function + set `GEMINI_API_KEY`, EAS build the mobile app (or Expo Go to test).
   → [DEPLOYMENT §2–4](DEPLOYMENT.md#2-landing-page-nextjs-14-static-export-vercel)
2. **Legal & consent** — publish Privacy Policy, ToS, PIPEDA statement; add an
   onboarding consent step. *A privacy-first product cannot launch without these.*
3. **Content pass** — verify each seeded deadline/URL against its official source;
   add real government PDF forms for the highest-value tasks.
4. **Hardening** — automated tests, monitoring (Sentry), backups, account recovery
   (email/OTP), and schedule the worker on **GitHub Actions (free)**.
5. **Engagement** — push / deadline reminders, bilingual FR, analytics, accessibility.

The detailed breakdown of each gate is below; the longer-range view is in the
[Roadmap](#roadmap-senior-architecture-view).

## Remaining to reach 100%

What "done MVP code" does **not** yet cover. Grouped by gate, hardest-first.
Items map to the [Roadmap](#roadmap-senior-architecture-view) phases.

### A. Launch-blocking — needed before the first real user
- **Finish provisioning** — a Supabase project (**"ReloGo"**) already exists and is
  linked, an EAS project is registered, and Vercel is configured. Remaining:
  `supabase db push` (migrations **001–005**), enable **anonymous sign-ins**, seed
  `admin_users`, deploy the `support-ai` function + set `GEMINI_API_KEY`, then
  deploy Vercel (landing + admin) and an EAS build (mobile). Optionally a separate
  **staging** project. The worker host is optional (see D) — **GitHub Actions is
  free**; Railway/Fly are not needed. Secrets live in each platform's env store,
  never committed.
- **Fill `.env` files** from each app's `.env.example`.
- **Real branding** — production app icon/splash/favicon (current ones are flat
  placeholders) → required for store submission.
- **Legal & consent** — Privacy Policy, Terms of Service, a PIPEDA
  data-handling statement, and a consent step in onboarding. A
  privacy-first product cannot launch without these published.

### B. Content & data — the actual product value
- **Corridor content** — *breadth is done:* migration `005` seeds **all 13
  provinces/territories** with core destination tasks + a federal CRA task,
  deadlines, and official URLs. The remaining work is **depth + verification**:
  independently confirm each seeded deadline/URL against its official source
  (005's header explicitly marks the data a "starting point"), and add tasks
  beyond the core set where a corridor needs them. Ongoing/operational, not code.
- **Real government PDF templates** — only a sample AcroForm exists. Source the
  actual forms, map their field names into `FIELD_TO_PII`, and register them in
  `mobile/lib/pdfEngine.ts` keyed by `task_key`.
- **Bilingual content (FR/EN)** — the schema's `_en` columns imply French is
  coming. For a Canadian government-adjacent product this is effectively
  expected: add `title_fr` / `*_fr` columns + locale switching.

### C. Production hardening — reliability & safety at runtime
- **Automated tests** — CI currently only typechecks/builds. Add: pgTAP/SQL
  tests for RLS policies and the SECURITY DEFINER RPCs (the security boundary),
  unit tests for deadline/date logic, and an e2e smoke (Detox or Maestro for
  mobile, Playwright for web).
- **Observability** — Sentry (mobile + web + worker), structured worker logs,
  uptime/cron-failure alerting, Supabase log drains.
- **Abuse protection** — rate-limit waitlist signups and anonymous sign-ins;
  add a captcha or turnstile on the public waitlist.
- **Backups & DR** — confirm Supabase PITR/backups; document a restore drill.
- **Worker operationalization** — a real schedule (cron), and admin
  notification (email/Slack) when a PENDING alert is filed.
- **Account durability** — anonymous sign-in means a lost device = lost data.
  Add email/OTP auth and link anonymous → permanent accounts for recovery and
  multi-device sync.

### D. Engagement & scale — to be a *good* product, not just a live one
- **Push notifications / deadline reminders** — the defining feature for a
  deadline-driven app (`expo-notifications`); currently absent.
- **Worker at scale** — per-source scheduling, concurrency/queue, robots.txt
  politeness, and structured diffing (beyond a single content hash) once it
  watches hundreds of sources.
- **AI diff summaries** — populate `rule_change_alerts.diff_summary` with an LLM
  summary of what changed, and auto-classify cosmetic vs substantive changes to
  cut admin review noise. (Column exists but unused; the `support-ai` Edge
  Function already shows the AI plumbing — the worker just doesn't use it yet.)
- **Analytics** — activation/completion funnels, corridor demand from the
  waitlist, to drive content priorities.
- **Admin depth** — pagination, an audit log of admin actions, and full CRUD for
  `official_sources` / `global_tasks` / `corridor_task_rules` (today rules are
  only editable via an alert).
- **Accessibility** — a WCAG / mobile-a11y pass.

---

## Roadmap (senior-architecture view)

Continues from Phases 1–7 (all complete — see “What was built”). Each phase has a **goal**, **workstreams**,
and **exit criteria** (the bar for calling it done). Phases are sequenced by
dependency, not calendar — 8 gates the rest.

### Phase 8 — Production Readiness & Soft Launch
**Goal:** the existing MVP feature set, live to real users, in a small set of
high-demand corridors, observable and legally sound.
**Workstreams**
- *Infra & environments:* provision prod + staging across Supabase / Vercel /
  Railway / EAS; secrets management; backups + a tested restore.
- *Observability:* Sentry everywhere, structured logs, uptime + cron-failure
  alerts.
- *Launch content:* author the top ~5–10 corridors with verified tasks,
  deadlines, official URLs; real PDF templates for the highest-value forms with
  field-mapping QA.
- *Testing:* RLS/RPC policy tests (pgTAP), deadline-logic unit tests, one e2e
  smoke per surface.
- *Compliance:* publish Privacy Policy + ToS + PIPEDA statement; onboarding
  consent; data-retention policy.
- *Worker ops:* daily cron + new-alert notification to admins.
- *Store prep:* real branding, screenshots, listings; TestFlight / Play internal.

**Exit:** landing live; mobile in TestFlight/internal track; worker running
daily and monitored; legal pages published; a real user can complete a corridor
end-to-end including a real auto-filled PDF.

### Phase 9 — Retention, Trust & Reach
**Goal:** make it sticky and recoverable, and broaden who it serves.
**Workstreams**
- *Reminders:* push notifications + deadline reminders (`expo-notifications`).
- *Account durability:* email/OTP auth; link anonymous → permanent; multi-device
  sync; account-recovery flow.
- *Bilingual:* `*_fr` content columns + UI i18n (EN/FR); locale switch.
- *Accessibility:* WCAG / mobile-a11y pass.
- *Coverage:* expand toward all 156 province/territory pairs.
- *Admin depth:* pagination, admin-action audit log, full source/task/rule CRUD.

**Exit:** reminders shipped; data survives device loss; EN+FR throughout; a clear
majority of corridors covered; admins can manage all content without a DB client.

### Phase 10 — Scale & Intelligence
**Goal:** scale the monitoring pipeline and cut manual admin load as source
count grows into the hundreds.
**Workstreams**
- *Worker scale:* per-source scheduling, concurrency/queue, robots.txt
  politeness, structured diffing, dead-letter handling.
- *AI assist:* LLM `diff_summary` + cosmetic-vs-substantive auto-classification
  so admins review only what matters.
- *Analytics:* product funnels (activation, task completion), corridor demand
  insights.
- *Perf & security:* load testing, caching/CDN, index review at scale, and an
  independent security review / RLS fuzzing.

**Exit:** hundreds of sources monitored reliably; admin reviews only substantive
changes; analytics inform content; a clean external security review.

### Phase 11 — Growth & Platform _(future / optional)_
**Goal:** turn a working product into a growing business.
**Workstreams (candidates):** partnerships (movers, real estate, insurance) +
referrals; a document wallet and calendar export; possible monetization
(premium concierge, B2B); and the harder frontier of cross-border / international
relocation.

**Exit:** sustainable growth loop and/or revenue; defined per chosen bet.

---

## Definition of "100%"

ReloGo is **100%** when: it is published in both app stores and on the web;
serves real users across the major Canadian corridors in **English and French**;
sends deadline reminders; lets users recover their account and erase their data
(PIPEDA); the worker autonomously monitors sources at scale with AI-assisted,
low-noise admin review; the whole system is tested, monitored, backed up, and
has passed an independent security review; and the legal/compliance surface is
published and current.

By that bar, today's state is a **validated, reviewed MVP codebase** — Phases
1–7 complete — with Phases 8–10 remaining to make it a launched, durable
product.

# ReloGo E2E Testing Infrastructure (TEST_INFRA.md)

This document details the architecture, design principles, test case methodology, and execution instructions for the ReloGo End-to-End (E2E) test suite.

---

## 1. Objective and Scope

The ReloGo E2E test suite validates the full interprovincial move assistant platform. Following the **Opaque-Box Requirement-Driven** testing principle, the tests verify client-facing behavior and backend policies (RLS/RPCs) strictly via external API boundaries (the local Supabase API gateway at `http://127.0.0.1:54321`). No internal implementation details are assumed.

The scope covers:
- Waitlist signup flow, constraints, and throttling.
- Anonymous onboarding, legal consent, and profile creation.
- Checklist generation, corridor matching, and dynamic deadline calculations.
- Progress tracking, state updates, and updates persistence.
- Local PII protection validation and filled PDF caching.
- Support thread lifecycle, AI chat fallback, fixed question checks, and human takeover.

---

## 2. Test Infrastructure Architecture

The E2E suite is written in **Python 3.11** using **pytest** and the official **supabase** python package.

### Configuration
The test suite connects to the local Supabase container. The connection variables are configured in code or loaded via environment variables:
- `SUPABASE_URL` = `http://127.0.0.1:54321`
- `SUPABASE_ANON_KEY` = `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0`
- `SUPABASE_SERVICE_ROLE_KEY` = `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU`

### Architecture Components
1. **Client Isolation**: The test runner instantiates distinct Supabase clients representing different actors:
   - **Anonymous / Authenticated Client**: Emulates the mobile or web client.
   - **Service Role Client (Admin/Bypass)**: Acts as the database owner to perform setup, teardown, seeding, and out-of-band assertions.
2. **Transactional Cleanliness**: Since Supabase doesn't natively support rolling back transactions across API boundaries, the E2E suite uses explicit teardown fixtures to delete created test users, waitlist entries, support threads, and profiles.
3. **Fixed-Question Sync**: Validates that all support message inserts conform to the allowed set of 6 questions defined in migration 010.

---

## 3. Test Case Design Methodology

The suite implements **exactly 71 test cases** partitioned across three logical test files, structured around four tiers:

### Tier 1: Feature Coverage (>= 5 tests per feature)
Verifies the core happy-path requirements of the 6 features.
1. **Waitlist**: Basic signup, validation of valid email & corridor formats.
2. **Auth/Consent**: Anonymous login, profile upsert, legal terms rejection.
3. **Checklist/Deadlines**: Generation of corridor rules, mapping of vehicle and dependent tasks.
4. **Progress**: Toggling task status between AVAILABLE and COMPLETED.
5. **PII/PDF**: Simulating local secure storage and filled PDF caching lifecycle.
6. **Support AI Chat**: Thread creation, fixed question posting, and AI response persistence.

### Tier 2: Boundary & Corner Cases (>= 5 tests per feature)
Exercises the edge cases, validation boundaries, and adversarial security constraints.
- Waitlist signup duplicates, throttle limits, and SQL injection payloads.
- Profile moves with past dates, invalid provinces, and unauthenticated writes.
- RLS boundaries (users accessing other users' profiles/support threads).
- Fixed-question strictness: rejecting free-text user messages or unauthorized questions.
- Support thread status lock: preventing AI response when human takeover is active.

### Tier 3: Cross-Feature Combinations (Pairwise Coverage)
Evaluates interactions between features (6 tests).
- Waitlist signup transition to onboarded profile.
- Checklist generation changes when user modifies profile mid-move.
- Support questions reflecting checklist status.

### Tier 4: Real-World Application Scenarios (5 tests)
Simulates end-to-end multi-step user journeys.
- Scenario A: Standard User Onboarding, Checklist Completion, and Sign-out.
- Scenario B: High-Risk Move (Vehicle & Dependents), Custom Deadlines, Support AI Fallback.
- Scenario C: Rule Update Scraping Alert and Admin Approval Flow.
- Scenario D: Privacy Hardening Verification (Account Deletion & Data Wipe).
- Scenario E: Concurrent Support Thread Racing and Human Takeover.

---

## 4. Execution and Verification

### Prerequisites
Ensure the local Supabase container is running:
```bash
supabase status
```

### Running the Test Suite
Run the suite from the repository root:
```bash
python3.11 -m pytest tests/e2e/
```

This E2E verification is a mandatory quality gate before release approval.

# Original User Request

## 2026-09-08T02:19:06Z

ReloGo 1.0.1 Recovery Release & Operational Readiness: Finalize and verify the Phase 1 MVP checklist simplification, audit store submission readiness for mobile recovery builds (iOS Build 8 and Android Build 5), and validate the Migration 027 worker source-monitoring fix.

Working directory: /Users/tamimorif/Documents/GitHub/ReloGo
Integrity mode: development

## Reference Documentation
- Architecture, verification commands, and operational boundaries: docs/ai/AI_HANDOFF.md
- Canonical project roadmap: docs/PLAN.md
- Store submission requirements: docs/STORE.md
- Operational runbooks: docs/DEPLOYMENT.md and docs/BACKUP_RESTORE.md

## Requirements

### R1. Phase 1 Checklist Simplification & Working Tree Validation
Preserve and finalize the user's uncommitted changes on branch `tamim` in `mobile/app/(tabs)/checklist.tsx` and documentation (`README.md`, `docs/PLAN.md`, `docs/ai/AI_HANDOFF.md`, `docs/ai/PROJECT_MAP.md`). Ensure all task cards consistently guide users directly to official provincial portals across all 13 jurisdictions. Verify that cross-app contracts, mobile lint, TypeScript compilation, Jest test suites, admin build, landing build, and worker tests pass without regressions.

### R2. Mobile 1.0.1 Store Submission & Verification Package
Audit release readiness for the existing EAS 1.0.1 production builds (iOS build 8 `daa8e42a-c12d-4365-b6ca-ff36732cd858` and Android build 5 `f839dede-1f83-4c6a-a928-de258597e6d0`). Reconcile the live App Store "Data Not Collected" discrepancy against the actual privacy architecture (anonymous user identifiers, non-PII move metadata, on-device PII vault, and Gemini AI processing). Generate an actionable, step-by-step real-device QA and store submission execution guide in `docs/STORE.md`.

### R3. Migration 027 & Worker Monitoring Rollout Validation
Validate the local Migration 027 schema changes and coordinated Python worker updates (`worker/changedetect.py`, `worker/reporting.py`, `worker/main.py`). Ensure that the 9 automatic first-party monitor targets and 2 manual assignments (Yukon driver's licence and vehicle registration) satisfy local reachability and fail-closed security constraints without altering canonical public URLs. Formulate the deployment order required to prevent the scheduled GitHub Actions worker on `main` from regressing baselines.

### R4. Operations & Security Assessment
Audit the outstanding operational requirements: verify that no secret keys or credentials are leaked in recent commits, verify that the database types between mobile and admin remain synchronized, and document the exact prerequisite steps for PITR backup configuration and alert webhook setup.

## Acceptance Criteria

### Code & Contract Verification
- [ ] `bash scripts/check-database-types-sync.sh` exits with code 0.
- [ ] `bash scripts/check-support-questions-sync.sh` exits with code 0.
- [ ] `bash scripts/check-consent-version-sync.sh` exits with code 0.
- [ ] Mobile tests pass: `npm test` in `mobile/` passes 133/133 tests with zero failures.
- [ ] Mobile lint and typecheck pass: `npm run lint` and `npm run typecheck` exit with code 0.
- [ ] Admin build succeeds: `npm run lint && npm run build` in `admin/` exits with code 0.
- [ ] Landing build succeeds: `npm run lint && npm run build` in `landing/` exits with code 0.
- [ ] Worker tests pass: `python3.11 -m pytest` in `worker/` passes 106/106 tests with zero failures.
- [ ] Deno function tests pass: `deno test` in `supabase/functions/support-ai` passes 16/16 tests with zero failures.

### Privacy & Store Readiness
- [ ] No PII (full name, DOB, street address, driver's licence, health card) is transmitted off-device or stored in Supabase.
- [ ] Store disclosure documentation accurately matches app runtime behavior (anonymous auth, non-PII move metadata, Gemini AI processing, local PII vault).
- [ ] An explicit real-device test script is documented covering cold startup, offline retry, checklist navigation, and PIPEDA account deletion.

### Migration & Worker Safety
- [ ] Migration 027 retains canonical public `official_url` links for the corridor resolver.
- [ ] Worker scraping maintains fail-closed behavior on managed challenges and CAPTCHAs.
- [ ] Rollout sequence is documented to prevent scheduled default-branch worker from overwriting baselines.

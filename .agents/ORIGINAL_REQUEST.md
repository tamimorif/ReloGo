# Original User Request

## Initial Request — 2026-07-13T23:42:21Z

Implement the remaining automated configuration, setup, coding, and testing tasks for Phases 1 through 5 of the ReloGo project. This includes admin setup, web deployment configuration, CI/CD, mobile build prep, PDF filling integration, legal consent versioning, observability/monitoring setup, full E2E testing, and updating the canonical documentation. (Note: Exclude Gemini API key provisioning as the user will handle that manually).

Working directory: /Users/tamimorif/Documents/GitHub/ReloGo
Integrity mode: development

## Requirements

### R1. Admin and Deployment Setup (Phases 1-3)
- Create the first admin identity in the Supabase database (`admin_users`).
- Prepare `landing` and `admin` apps for Vercel deployment (environment variables documented, build scripts verified).
- Finalize GitHub Actions workflow for the scheduled Python worker.
- Prepare EAS configurations for iOS and Android preview builds.

### R2. Content, PDF, and Legal Readiness (Phase 4)
- Implement a real production government PDF template fill/share workflow in the mobile app, ensuring on-device PII caching and cleanup is secure.
- Add legal consent versioning and a re-consent flow to the mobile onboarding.
- Draft necessary App Store and Play Store descriptions, privacy nutrition labels, and data-safety answers as markdown artifacts.

### R3. Observability and Monitoring (Phase 5)
- Implement application-level error and crash monitoring (e.g., integrating a standard crashlytics/monitoring library if appropriate, or documenting the setup).
- Create an incident runbook and document support ownership in `docs/DEPLOYMENT.md`.

### R4. Testing and Documentation Update
- Write and run comprehensive automated tests to verify the entire flow.
- Update `docs/PLAN.md` and `docs/ai/AI_HANDOFF.md` to reflect the completion of these phases.

## Acceptance Criteria

### Implementation Verification
- [ ] Mobile, landing, and admin apps build successfully without errors.
- [ ] Database tests (`pgTAP`) and worker tests (`pytest`) pass locally.
- [ ] PDF integration code is present and relies strictly on local device storage (no PII sent to Supabase).
- [ ] Legal consent logic tracks acceptance timestamps and versions.

### Documentation Verification
- [ ] An incident runbook exists in `docs/DEPLOYMENT.md`.
- [ ] Store metadata (descriptions, privacy labels) exists in a markdown artifact.
- [ ] `docs/PLAN.md` is updated to mark Phases 1-5 as complete or ready for final manual deployment.

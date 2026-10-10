# ReloGo — opencode project skills

opencode auto-loads every `.opencode/skills/*/SKILL.md`. Each skill is a focused
runbook: when to load it, the hard rules, the exact commands, and the currently
known issues. Keep them short and factual; update the date/commit when the
facts change.

## Which skill do I load?

| If the task is about… | Load |
| --- | --- |
| Running tests, lint, typecheck, builds, contract scripts; anything "is this green?" | [`relogo-verify`](relogo-verify/SKILL.md) |
| The Expo app: startup/auth, onboarding, re-consent, checklist, PII vault, profile, support chat, navigation | [`relogo-mobile`](relogo-mobile/SKILL.md) |
| Migrations, RLS, RPCs, pgTAP, the `support-ai` Edge function, the Python worker, DB type sync | [`relogo-backend`](relogo-backend/SKILL.md) |
| The QA playbook, `qa-artifacts` evidence, Suite Z gates, EAS/App Store builds, Vercel deploys | [`relogo-release-qa`](relogo-release-qa/SKILL.md) |

## Before any task

1. Read `AGENTS.md` → `docs/ai/AI_HANDOFF.md` (agent brief) and `docs/PLAN.md`
   (roadmap). The handoff wins on architecture/rules.
2. `git status --short --branch` — never discard existing or user-authored work.
3. Pick the skill above; run only the checks proportional to the change.

## Ground rules that apply everywhere

- PII (name, DOB, address, licence, health card) stays on device.
- RLS/RPCs are the authorization boundary; `service_role` keys are server-only.
- Never push, merge, migrate/deploy production, rotate credentials, or submit
  store builds without explicit owner authorization.
- Report observations; do not fix while "verifying" unless asked.

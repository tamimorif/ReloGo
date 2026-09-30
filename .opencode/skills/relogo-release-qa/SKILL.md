---
name: relogo-release-qa
description: Use when executing ReloGo QA or release workflows — running the docs/QA_TEST_PLAYBOOK.md suites, writing qa-artifacts evidence, checking Suite Z release gates, preparing EAS/App Store/Google Play builds, or deploying the landing/admin Vercel sites.
---

# ReloGo release & QA

**Spec** — `docs/QA_TEST_PLAYBOOK.md` (suites A–M + Z, data D1–D7, configs CFG-01–CFG-10).
**Related** — `relogo-verify` · `relogo-mobile` · `relogo-backend`.

## Rules of engagement

- **Never invent UI.** Missing element → FAIL (missing UI).
- **Never write PII.** Fixtures only (`Jane Doe`, `123 Main St`); PII stays on
  device and never reaches Supabase, logs, or support chats.
- **Never mask errors.** A raw stack trace, SQLSTATE, project URL, or API key on
  screen → FAIL (privacy/security leak).
- **Enforce timeouts** (3 s session, 5 s profile, 8 s checklist, 10 s
  onboarding); a spinner past its bound → FAIL (hang).
- **Do not edit** app/backend/migrations to force a pass.

## Evidence conventions

```
qa-artifacts/<suite>/<test-id>/<step-number>-<device-config>-<timestamp>.png
qa-artifacts/results.json    # per-test result rows
qa-artifacts/README.md       # ledger + interpretation
```

Record PASS / FAIL / **BLOCKED** (BLOCKED = prerequisite or assertion not
verified).

## Intentional non-features — do NOT report as bugs

No PDF/fill button in 1.0.1 · no free-text support input · no email/password
sign-up in mobile · tablet renders phone layout · app stays light in system dark
mode · landing "Coming soon" badge.

## Prior run context — 2026-09-13, partial, NOT a sign-off

121 tests + 8 gates → 63 PASS / 11 FAIL / 55 BLOCKED. Re-check, do not trust:

| ID | Verdict |
| --- | --- |
| F-02 back nav, H-02 XXXL clipping, H-03 dark status bar | real defects → see `relogo-mobile` |
| D-18 vehicle flag | expected behavior; playbook assertion is wrong |
| F-11, G-04 | expected behavior / playbook discrepancy |
| L-10 admin thread labels | differ from playbook but function correctly |
| Expo Go | cannot certify standalone splash, `relogo://` deep links, or release error sanitization — use a standalone/EAS build |

## Release gates (Suite Z)

Release-ready requires A–J on iOS + Android, the full visual matrix, the privacy
suite (zero PII rows in backend), landing + admin suites, zero open P0/P1, and
an archived screenshot bundle. Last run: **GATE-Z01–Z08 all BLOCKED**.

## Store / deploy facts

| Item | Fact |
| --- | --- |
| EAS | project `@tamimorif/relogo`, production channel/runtime 1.0.1 |
| Current artifacts | iOS build 8 `daa8e42a-…`, Android build 5 `f839dede-…`, both `FINISHED` from `cd3a87c` — recorded before the 2026-09-08 commits (`d64c4cb` Phase 1 checklist cards, `df3535b` Expo 55.0.31 pins), so they predate branch tip `0c78e56`; neither uploaded/submitted; commit the 2026-09-14 tree and settle the rebuild-or-record decision first |
| Shipped 1.0 | broken and unrecoverable (deleted Supabase ref baked into the Hermes bundle); recovery needs a new 1.0.1 store binary |
| Vercel | `relogo` → `landing/`, `relo-go` → `admin/`. `admin/.vercel` names the wrong project `admin`; target `relo-go` explicitly. The 2026-09-24 probe shows `relo-go` still serving SPA HTML for missing assets — the local favicon/404 fix needs an explicit deploy |
| Mailbox | no monitored public mailbox/domain — do not publish a support/privacy address until owned and monitored |

## Hard stops

Never push, merge, migrate production, deploy production, rotate credentials, or
submit store builds without explicit owner authorization. Never run
`supabase config push` (committed localhost Auth URLs).

---
name: relogo-release-qa
description: Use when executing ReloGo QA or release workflows — running the docs/QA_TEST_PLAYBOOK.md suites, writing qa-artifacts evidence, checking Suite Z release gates, preparing EAS/App Store/Google Play builds, or deploying the landing/admin Vercel sites.
---

# ReloGo release & QA

**Spec** — `docs/QA_TEST_PLAYBOOK.md` (suites A–M + Z, data D1–D7, configs CFG-01–CFG-10).
**Related** — `relogo-verify` · `relogo-mobile` · `relogo-backend`.

> **Current-tree notice (2026-11-16):** The playbook and release facts below
> mostly describe the earlier account/date/PDF/AI recovery build. The current
> unbuilt mobile source also asks optional vehicle-registration and school-age
> children questions, keeps route/preferences/checkmarks local, and uses
> human-only support. Use `docs/ai/SIMULATOR_TESTING_GUIDE.md` for current
> mobile behavior and `docs/ai/AI_HANDOFF.md` for the source boundary.

## Rules of engagement

- **Never invent UI.** Missing element → FAIL (missing UI).
- **Do not enter identifying details.** Current onboarding has no name, email,
  or address fields. Checklist details stay local; support questions are fixed
  options and the conversation is stored on the server for human replies.
- **Never mask errors.** A raw stack trace, SQLSTATE, project URL, or API key on
  screen → FAIL (privacy/security leak).
- **Enforce current network timeouts** (8 s for rules, 10 s for support); a
  stalled request must reach the retry/error state instead of spinning forever.
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

No AI, map, PDF fill, move-date field, name/account form, or free-text support
composer in the current mobile MVP. The optional vehicle and school-age
children questions each offer Yes / No / Skip. Explicit No hides matching
tasks; Skip leaves them visible with an applicability label. Route details,
answers, and checkmarks stay on-device; support threads are server-stored and
cached locally. Use `docs/ai/SIMULATOR_TESTING_GUIDE.md` for current user-run
iPhone coverage.

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
an archived screenshot bundle. Last full run: **GATE-Z01–Z08 all BLOCKED** (2026-09-13). The 2026-10-09/10 iPhone-simulator continuation runs passed most cases but are **not** a sign-off; no Android suite and no release-build QA exist yet. Note: `qa-artifacts/` is staged-deleted in the working tree — decide commit-vs-restore before the Z08 archive gate.

## Store / deploy facts

| Item | Fact |
| --- | --- |
| EAS | project `@tamimorif/relogo`, production channel/runtime 1.0.1 |
| Google Play | Listing 404s for `com.relogo.app`; Console record/listing not configured. Required: 512 icon (draft `store-assets/play-icon-512.png`), 1024×500 feature graphic (draft `store-assets/play-feature-graphic-1024x500.png`), ≥2 phone-format screenshots, Data safety, content rating, target audience, government declaration, deletion URL, monitored contact email. No service-account key: manual upload or drop `mobile/google-play-service-account.json` (uncommitted working-tree prep, pending commit; gitignored; `eas.json` points at it). Personal-account closed-testing rule (12+ testers / 14+ days) must be confirmed by the owner |
| Current artifacts | **None from the current tree.** iOS build 8 `daa8e42a-…` / Android build 5 `f839dede-…` were `FINISHED` from `cd3a87c` (SDK 55) and are superseded by `main` `69ff576` (PR #7, 2026-10-10, SDK 57); neither uploaded/submitted. Rebuild from `main` (expected iOS build 9 / Android versionCode 6) before store QA; the SDK 57 tree has never produced an EAS build |
| Shipped 1.0 | broken and unrecoverable (deleted Supabase ref baked into the Hermes bundle); recovery needs a new 1.0.1 store binary |
| Vercel | `relogo` → `landing/`, `relo-go` → `admin/`. The local `admin/.vercel/project.json` already names project `relo-go` (root `admin`), so no relink is needed. The 2026-09-24 probe shows `relo-go` still serving SPA HTML for missing assets; the committed `fff31da` favicon/404 fix needs an explicit deploy |
| Mailbox | no monitored public mailbox/domain — do not publish a support/privacy address until owned and monitored |

## Hard stops

Never push, merge, migrate production, deploy production, rotate credentials, or
submit store builds without explicit owner authorization. Never run
`supabase config push` (committed localhost Auth URLs).

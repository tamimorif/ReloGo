---
name: relogo-mobile
description: Use when working on the ReloGo Expo mobile app under mobile/ — startup/session recovery, onboarding and re-consent, the checklist navigator, the on-device PII SecureStore vault, profile, support chat, navigation, or its known UI/accessibility defects (F-02 back navigation, H-02 XXXL text clipping, H-03 dark-mode status bar).
---

# ReloGo mobile (`mobile/`)

**Stack** — Expo SDK 55 · RN 0.83 · React 19 · expo-router · NativeWind · TanStack Query. iOS/Android only.
**Read first** — `docs/ai/AI_HANDOFF.md` → "Authentication, startup, profile, and checklist" and "Local PII, Privacy, and Unified Navigation".
**Related** — `relogo-verify` · `relogo-backend` · `relogo-release-qa`.

## Timeout bounds

| Stage | Bound |
| --- | --- |
| Session restore | 3 s |
| Consent / profile bootstrap | 5 s |
| Checklist read (`retry: false`) | 8 s abort deadline |
| Onboarding steps | 10 s each |

A spinner past its bound is a FAIL (hang).

## Layout

| Path | Role |
| --- | --- |
| `app/(auth)/` | onboarding, fail-closed re-consent |
| `app/(tabs)/` | checklist, profile, contact (support) |
| `components/` | PII-safe crash / recovery boundary |
| `lib/` | startup, auth, PII, PDF, legal, dates |
| `scripts/` | release-configuration + audit preflight |
| `types/database.ts` | must stay **byte-identical** to `admin/src/types/database.ts` |

## Hard rules

- **PII never leaves the device.** Full name, DOB, street address, driver's
  licence number, health-card number exist only in `lib/secureStore.ts` and
  ephemeral local PDF memory/cache. Never in a Supabase row/query, prompt, log,
  error, analytics event, or admin view. Test with dummy fixtures only
  (`Jane Doe`, `123 Main St`).
- **Privacy-safe errors only.** `AppErrorBoundary` shows generic recovery UI;
  `lib/errorReporting.ts` redacts identifiers/emails/tokens. Never surface raw
  SQLSTATE, project URLs, keys, or stack traces.
- **Support is not free text** — exactly six allowlisted questions, kept in sync
  with the DB (`scripts/check-support-questions-sync.sh`).
- **Sign-out / account deletion** wipe the local PII vault and PDF cache;
  deletion also removes the server account and session.

## Known defects — verified in source, 2026-09-14

Rerun before relying on any of these.

| ID | Issue | Evidence / fix |
| --- | --- | --- |
| **F-02** | Support back always returns to Checklist, not Profile. | `profile.tsx` pushes `/(tabs)/contact`; `contact` is a sibling tab with `href={null}` and `contact.tsx` uses `router.back()`; tab default `backBehavior='firstRoute'` lands on tab 0. Fix: `router.navigate("/(tabs)/profile")`, a return param, or `backBehavior="history"`. |
| **H-02** | Dynamic Type XXXL clips headings/labels mid-word. | No `maxFontSizeMultiplier`/wrapping. Native header title `numberOfLines: 1`; row text lacks `flexShrink`; question buttons fixed `w-[49%]`. Affects "My Profile", "Help & support", "Sign Out", section headers, question labels. |
| **H-03** | Dark Mode status bar vanishes (white-on-white). | `_layout.tsx` uses `<StatusBar style="auto" />`; `app.json` allows `userInterfaceStyle: "automatic"` but UI is hardcoded light. Fix: `style="dark"` or lock `userInterfaceStyle` to `light`. |
| Copy | Vehicle switch says "Adds licence & registration tasks". | Only registration is vehicle-gated (`migrations/002`); licence is mandatory for all destinations (`migrations/005`). Overstated. |
| Timeout | Re-consent RPCs are unbounded. | `reconsent.tsx` calls `supabase.rpc(...)` without the `withStartupTimeout`/`withAbortableTimeout` wrappers used by onboarding — a stalled connection hangs the submit spinner. |
| Errors | Legal links lack `.catch()`. | `Linking.openURL(...)` returned from `onPress` in onboarding/re-consent (checklist does this correctly). |
| Logging | Raw `console.error` logs error objects. | `_layout.tsx` profile/consent path bypasses `errorReporting`; this is the dev-only LogBox exposure seen in QA test A-06. No PII leak proven. |

**Update 2026-09-14 (committed in `fff31da`):** the F-02/H-02/H-03 fixes (tab
history, large-text layout, explicit light appearance/status bar), the bounded
re-consent/profile/support waits, and the PII-safe error reporter are
implemented in `fff31da`. Re-verify before relying on this table; a
fresh simulator/device visual pass is still outstanding.

## Verify

Use `relogo-verify`. Mobile checks: `npm run check:release`, `npm run lint`,
`npm run typecheck`, `npm test -- --runInBand` (161 tests on committed
`fff31da`; 133 on `0c78e56`), and `npm run audit:production`. The audit was
green in `fff31da` but is now **red** (2026-10-05) from new upstream `braces`/
`node-forge` advisories; do not weaken the gate — see `relogo-verify`.

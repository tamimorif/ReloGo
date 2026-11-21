---
name: relogo-mobile
description: Use when working on the ReloGo Expo mobile app under mobile/ — city/province onboarding, the local checklist, on-device checkmarks, human support chat, navigation, or mobile accessibility.
---

# ReloGo mobile (`mobile/`)

**Stack** — Expo SDK 57.0.27 · RN 0.86.3 · React 19.2.3 · expo-router · NativeWind · TanStack Query. iOS/Android only.
**Current MVP (2026-11-16)** — Setup asks for origin/destination city and province, plus optional Yes / No / Skip questions for vehicle registration and school-age children. An explicit No hides matching tasks; Skip keeps them visible with an applicability label. Route, answers, and checkmarks stay in AsyncStorage; only province codes go to the public task resolver. Help lazily creates an anonymous support identity; fixed-question chats are stored on the server for Admin replies and cached on-device. There is no user profile/account form, move date, PDF feature, map, or AI call. The deployed legacy AI function is not the current mobile product.
**Read first** — `docs/ai/AI_HANDOFF.md` → "Current MVP scope" and "Local checklist data and support boundary".
**Related** — `relogo-verify` · `relogo-backend` · `relogo-release-qa`.

## Timeout bounds

| Stage | Bound |
| --- | --- |
| Local route load | Local AsyncStorage read; no auth/session restore |
| Checklist rules request | 8 s abortable deadline |
| Support requests | 10 s abortable deadline |

A spinner past its bound is a FAIL (hang).

## Layout

| Path | Role |
| --- | --- |
| `app/(auth)/` | onboarding, fail-closed re-consent |
| `app/(tabs)/` | checklist, profile, contact (support) |
| `components/` | shared move-preference questions and PII-safe recovery boundary |
| `lib/` | local journey, checklist rules, support, legal consent, request timeouts |
| `scripts/` | release-configuration + audit preflight |
| `types/database.ts` | must stay **byte-identical** to `admin/src/types/database.ts` |

## Hard rules

- **Checklist data is local.** City/province and checkmarks live in AsyncStorage;
  the resolver receives province codes only. Do not add identity or address
  collection to the MVP.
- **Support is the deliberate server-side exception.** It uses a random
  anonymous identity, six fixed questions, and human replies; chat is cached on
  the device as well. There is no free-text user composer or user login.
- **Privacy-safe errors only.** `AppErrorBoundary` shows generic recovery UI;
  `lib/errorReporting.ts` redacts identifiers/emails/tokens. Never surface raw
  SQLSTATE, project URLs, keys, or stack traces.
- **No AI or map in the current mobile client.** Do not re-connect the legacy
  support-AI function as part of this checklist scope.

## Historical UI defects — verified in source, 2026-09-14

These findings predate the simplified MVP. Re-check the current source before
using any as an open defect or adding it to a release checklist.

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

**Update 2026-10-16 (merged to `main` `69ff576`):** the F-02/H-02/H-03 fixes
(tab history, large-text layout, explicit light appearance/status bar), the
bounded re-consent/profile/support waits, and the PII-safe error reporter are
implemented. The 2026-10-09/10 iPhone simulator runs re-verified H-03 (S-01) and
F-02 (E-10) and passed standard XXXL (S-02); one accessibility-size "My Profile"
title clip remains a defect candidate. A release-build (EAS) and real-device
pass is still outstanding; Expo Go cannot certify standalone splash, deep
links, or release error sanitization.

## Verify

Use `relogo-verify`. Mobile checks: `npm run check:release`, `npm run lint`,
`npm run typecheck`, `npm test -- --runInBand` (16 suites / 178 tests on the
merged recovery tree; 161 on `fff31da`), and `npm run audit:production`, which
**passes** as of 2026-10-10 with two owner-approved, time-boxed exceptions
(`braces` GHSA-vfj7-8cjw-p6xm, `node-forge` GHSA-86w9-cpqp-85rv; re-review by
2026-12-01). The gate still fails closed on anything outside those entries —
do not weaken it; see `relogo-verify`.

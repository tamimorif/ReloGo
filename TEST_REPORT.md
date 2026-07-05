# ReloGo — Project Test Report

**Date:** 2026-07-05
**Scope:** `mobile/`, `admin/`, `landing/`, `worker/`
**Method:** Ran the same checks as CI (`.github/workflows/ci.yml`) against each sub-project — install dependencies, then typecheck/build/compile — and additionally ran `expo-doctor` against the mobile app for a deeper dependency audit.

## Summary

Four sub-projects, four clean builds. No blocking bugs. Two real dependency issues in `mobile/` worth fixing before they bite you, plus a couple of environment notes that aren't bugs but are worth knowing about.

## Issues found

### 1. Missing peer dependency: `@react-native-picker/picker` (mobile)

`mobile/package.json` depends on `react-native-picker-select`, which in turn requires `@react-native-picker/picker` as a peer dependency. That peer isn't installed. `expo-doctor` flags this directly:

```
Missing peer dependency: @react-native-picker/picker
Required by: react-native-picker-select
Your app may crash outside of Expo Go without this dependency.
```

I checked the app code and nothing currently imports or renders the picker component, so this isn't causing failures today. It's a latent landmine — the day someone wires up a picker screen, it'll build fine in Expo Go (which bundles common native modules) and then crash on a standalone/EAS build, which is the worst possible time to discover a missing native dependency.

**Fix:**
```bash
cd mobile
npx expo install @react-native-picker/picker
```

### 2. Stray type package: `@types/react-native` (mobile)

`mobile/package.json` lists `@types/react-native` directly in `devDependencies`. React Native has shipped its own TypeScript types since 0.71, so this package is redundant. `expo-doctor` calls this out under "packages that should not be installed directly." At best it's dead weight; at worst it can shadow or conflict with the types RN ships internally, causing confusing type errors that don't reflect the actual API.

**Fix:** remove `@types/react-native` from `mobile/package.json`'s `devDependencies` and reinstall.

## What passed clean

- **Admin** (Vite + React + TS): `npm install` and `npm run build` — zero TypeScript errors, builds in ~1.3s.
- **Landing** (Next.js 14, static export): `npm install` and `next build` — compiles, typechecks, and statically generates all 5 pages successfully.
- **Mobile** (Expo/React Native): `npx tsc --noEmit` — zero type errors across the app.
- **Worker** (Python/Playwright): all pinned dependencies install cleanly; `main.py` compiles with no syntax errors; and when required env vars (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`) are absent, it fails fast with a clear log message and exit code instead of crashing with a stack trace. That's exactly the behavior you want from an unattended worker.

## Noise — not real issues, ignore these

- `npm run lint` fails with `eslint: not found` in both `admin/` and `mobile/`. Neither project has `eslint` in its `devDependencies`, but that's consistent with your CI: `ci.yml` only runs typecheck/build/compile, never lint. So this isn't a broken setup, just an unwired script — worth knowing in case you intended to enforce lint at some point.
- `expo-doctor`'s two checks that hit `exp.host` and `api.expo.dev` failed with DNS errors. That's this sandbox having no outbound internet access to Expo's servers, not a project problem.
- A second `landing` build attempt threw `EPERM` errors trying to delete files under `.next/`. That's the sandbox's filesystem permissions on rewriting build output on a second pass — the first build completed successfully and generated all pages before this ever came up.

## Recommended next step

```bash
cd mobile
npx expo install @react-native-picker/picker
# then manually remove "@types/react-native" from devDependencies in package.json
npm install
npx tsc --noEmit   # re-confirm still clean
```

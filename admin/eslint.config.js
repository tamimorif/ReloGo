// Flat ESLint config for the Vite + React 18 admin dashboard.
// Mirrors the gate the mobile and landing apps already have in CI.
import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: ["dist/**", "node_modules/**"],
  },
  {
    files: ["**/*.{ts,tsx}"],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": [
        "warn",
        { allowConstantExport: true },
      ],
      // Reported as a warning, not an error. This rule ships in
      // eslint-plugin-react-hooks v7's compiler-aware ruleset and targets
      // React 19 + React Compiler; this dashboard is React 18. Every hit is
      // the same mount-time data fetch (`useEffect(() => { fetchX(); }, ...)`)
      // whose only synchronous setState is a `setLoading(true)` before an
      // await. That costs one extra render on mount and is not a correctness
      // bug, so it is surfaced rather than silenced -- and rewriting five
      // working table components is deliberately not a pre-launch change.
      // Revisit (and fix properly) if admin moves to React 19.
      "react-hooks/set-state-in-effect": "warn",
      // Purely stylistic (Array<T> vs T[]). Disabled for the same reason as in
      // the mobile app: scripts/check-database-types-sync.sh requires
      // src/types/database.ts to stay byte-identical to mobile/types/database.ts,
      // and an autofix applied in only one app would break that CI contract.
      "@typescript-eslint/array-type": "off",
    },
  },
);

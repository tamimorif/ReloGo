// Flat ESLint config for the Expo SDK 55 mobile app.
// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require("eslint/config");
const expoConfig = require("eslint-config-expo/flat");

module.exports = defineConfig([
  expoConfig,
  {
    ignores: [
      "dist/*",
      ".expo/*",
      "expo-env.d.ts",
      "nativewind-env.d.ts",
      "babel.config.js",
      "metro.config.js",
      "tailwind.config.js",
    ],
  },
  {
    rules: {
      // React Native's <Text> renders apostrophes/quotes literally; this rule
      // targets HTML-in-JSX and does not apply to a native app.
      "react/no-unescaped-entities": "off",
      // Purely stylistic (Array<T> vs T[]). Disabled so the CI-enforced
      // byte-identical types/database.ts stays in lockstep with admin's copy
      // instead of being reformatted by lint.
      "@typescript-eslint/array-type": "off",
    },
  },
]);

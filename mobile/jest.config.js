/**
 * Jest config for mobile unit tests.
 *
 * Scope: pure, framework-free logic (e.g. lib/dateHelpers.ts) — so we run under
 * a plain Node environment with ts-jest, rather than the heavier jest-expo
 * preset. The transform carries a self-contained tsconfig override so tests are
 * insulated from the app's Expo/Metro tsconfig (bundler resolution, JSX, etc.).
 * If component tests are added later, switch to `preset: "jest-expo"`.
 */
/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: "node",
  testMatch: ["**/__tests__/**/*.test.ts"],
  moduleFileExtensions: ["ts", "tsx", "js", "json"],
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/$1",
  },
  transform: {
    "^.+\\.tsx?$": [
      "ts-jest",
      {
        // ts-jest type-checks the tests here (with jest globals), since the
        // app's tsconfig excludes __tests__ from `tsc --noEmit`.
        tsconfig: {
          module: "commonjs",
          moduleResolution: "node",
          esModuleInterop: true,
          skipLibCheck: true,
          jsx: "react-jsx",
          verbatimModuleSyntax: false,
          types: ["jest", "node"],
        },
      },
    ],
  },
};

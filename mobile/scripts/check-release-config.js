const fs = require("node:fs");
const path = require("node:path");

// npm/EAS lifecycle scripts execute with the package root as cwd. Also accept
// direct invocation from the repository root so the check is easy to run in CI
// and during local recovery work.
const invocationRoot = process.cwd();
const mobileRoot = fs.existsSync(path.join(invocationRoot, "app.json"))
  ? invocationRoot
  : path.join(invocationRoot, "mobile");
const appJson = JSON.parse(
  fs.readFileSync(path.join(mobileRoot, "app.json"), "utf8"),
).expo;
const packageJson = JSON.parse(
  fs.readFileSync(path.join(mobileRoot, "package.json"), "utf8"),
);
const easJson = JSON.parse(
  fs.readFileSync(path.join(mobileRoot, "eas.json"), "utf8"),
);

const PRODUCTION_REF = "yskknolxbxfxakgvrcmg";
const RETIRED_REF = "fxrynmgaymslwcklfena";
const PREVIEW_REF = "uwfblgllkibbupqyofkl";
const EXPECTED_EAS_PROJECT_ID = "d0916701-38d5-48e9-a446-b01eb3cba1cc";
const EXPECTED_LEGAL_ORIGIN = "https://relogo-two.vercel.app";

function fail(message) {
  console.error(`ERROR: ${message}`);
  process.exitCode = 1;
}

function versionParts(value) {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(value ?? "");
  return match ? match.slice(1).map(Number) : null;
}

const version = versionParts(appJson.version);
if (!version || version[0] < 1 || (version[0] === 1 && version[1] === 0 && version[2] < 1)) {
  fail("mobile marketing version must be at least 1.0.1");
}
if (packageJson.version !== appJson.version) {
  fail("package.json and app.json versions must match");
}
if (appJson.runtimeVersion?.policy !== "appVersion") {
  fail("runtimeVersion must remain tied to appVersion");
}
if (appJson.extra?.eas?.projectId !== EXPECTED_EAS_PROJECT_ID) {
  fail("unexpected EAS project id");
}
if (appJson.updates?.url !== `https://u.expo.dev/${EXPECTED_EAS_PROJECT_ID}`) {
  fail("Expo Updates URL does not match the ReloGo project");
}
if (
  easJson.build?.production?.environment !== "production" ||
  easJson.build?.production?.channel !== "production" ||
  easJson.build?.production?.autoIncrement !== true
) {
  fail("production EAS profile must use production env/channel and autoIncrement");
}

for (const relativePath of ["app.json", "eas.json", "lib/supabase.ts"]) {
  const contents = fs.readFileSync(path.join(mobileRoot, relativePath), "utf8");
  if (contents.includes(RETIRED_REF)) {
    fail(`${relativePath} still references the retired backend`);
  }
}

const legalSource = fs.readFileSync(
  path.join(mobileRoot, "lib/legalConsent.ts"),
  "utf8",
);
if (!legalSource.includes(`"${EXPECTED_LEGAL_ORIGIN}"`)) {
  fail("mobile legal-link fallback does not use the verified legal-site origin");
}

if (process.env.EAS_BUILD_PROFILE === "production") {
  const rawUrl = (process.env.EXPO_PUBLIC_SUPABASE_URL ?? "").trim();
  const publicKey = (process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? "").trim();
  const expectedOrigin = `https://${PRODUCTION_REF}.supabase.co`;
  try {
    new URL(rawUrl);
  } catch {
    fail("production Supabase URL is missing or invalid");
  }

  if (rawUrl !== expectedOrigin && rawUrl !== `${expectedOrigin}/`) {
    fail("production build must use the exact intended Supabase origin");
  }
  if (rawUrl.includes(PREVIEW_REF) || rawUrl.includes(RETIRED_REF)) {
    fail("production build contains a preview or retired backend reference");
  }
  if (!publicKey) {
    fail("production build is missing its public Supabase key");
  }
  const legalOverride = process.env.EXPO_PUBLIC_LEGAL_SITE_URL?.replace(
    /\/+$/,
    "",
  );
  if (legalOverride && legalOverride !== EXPECTED_LEGAL_ORIGIN) {
    fail("production build overrides the verified legal-site origin");
  }
}

if (!process.exitCode) {
  console.log("OK: mobile release configuration contract passed");
}

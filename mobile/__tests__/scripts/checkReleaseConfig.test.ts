import { spawnSync } from "node:child_process";
import path from "node:path";

const mobileRoot = path.resolve(__dirname, "../..");
const releaseCheck = path.join(mobileRoot, "scripts/check-release-config.js");
const productionOrigin = "https://yskknolxbxfxakgvrcmg.supabase.co";

function runProductionCheck(
  url: string,
  publicKey = "sb_publishable_test-only",
) {
  return spawnSync(process.execPath, [releaseCheck], {
    cwd: mobileRoot,
    encoding: "utf8",
    env: {
      ...process.env,
      EAS_BUILD_PROFILE: "production",
      EXPO_PUBLIC_SUPABASE_URL: url,
      EXPO_PUBLIC_SUPABASE_ANON_KEY: publicKey,
      EXPO_PUBLIC_LEGAL_SITE_URL: "https://relogo-two.vercel.app",
    },
  });
}

describe("production release URL contract", () => {
  it.each([productionOrigin, `${productionOrigin}/`])(
    "accepts the exact production origin: %s",
    (url) => {
      expect(runProductionCheck(url).status).toBe(0);
    },
  );

  it.each([
    "https://uwfblgllkibbupqyofkl.supabase.co",
    `${productionOrigin}/rest/v1`,
    `${productionOrigin}?preview=true`,
    `${productionOrigin}#fragment`,
    "https://user@yskknolxbxfxakgvrcmg.supabase.co",
    "https://yskknolxbxfxakgvrcmg.supabase.co:8443",
    "https://yskknolxbxfxakgvrcmg.supabase.co.attacker.example",
  ])("rejects a non-origin or non-production URL: %s", (url) => {
    const result = runProductionCheck(url);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      "production build must use the exact intended Supabase origin",
    );
  });

  it("rejects a whitespace-only public key", () => {
    const result = runProductionCheck(productionOrigin, "   ");
    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      "production build is missing its public Supabase key",
    );
  });
});

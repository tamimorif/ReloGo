// The release gate is a CommonJS script executed directly by Node.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { evaluateProductionAudit } = require("../../scripts/production-audit-policy");

function report(severity?: string) {
  return {
    auditReportVersion: 2,
    vulnerabilities: severity ? { dependency: { severity } } : {},
    metadata: { vulnerabilities: {
      high: severity === "high" ? 1 : 0,
      critical: severity === "critical" ? 1 : 0,
    } },
  };
}

type AuditEntry = { severity: string; via?: unknown };

function auditReport(
  vulnerabilities: Record<string, AuditEntry>,
  counts: { high: number; critical: number } = { high: 0, critical: 0 },
) {
  return {
    auditReportVersion: 2,
    vulnerabilities,
    metadata: { vulnerabilities: { high: counts.high, critical: counts.critical } },
  };
}

const BRACES_ADVISORY = "https://github.com/advisories/GHSA-vfj7-8cjw-p6xm";
const NODE_FORGE_ADVISORY = "https://github.com/advisories/GHSA-86w9-cpqp-85rv";

describe("production audit policy", () => {
  it("passes a complete report with no blocking findings", () => {
    expect(evaluateProductionAudit(report()).ok).toBe(true);
    expect(evaluateProductionAudit(report("moderate")).ok).toBe(true);
  });

  it.each(["high", "critical"])("rejects every %s finding", (severity) => {
    expect(evaluateProductionAudit(report(severity)).ok).toBe(false);
  });

  it("rejects the former Metro/image-size advisory exception", () => {
    const audit = report("high");
    audit.vulnerabilities = { "image-size": {
      severity: "high",
      via: [{ url: "https://github.com/advisories/GHSA-w3rx-r6r6-pgpr" }],
    } } as typeof audit.vulnerabilities;
    expect(evaluateProductionAudit(audit).ok).toBe(false);
  });

  it("fails when the vulnerabilities map is missing", () => {
    expect(evaluateProductionAudit({ ...report(), vulnerabilities: undefined }).ok).toBe(false);
  });

  it("fails on malformed vulnerability entries even with zero blocking counts", () => {
    expect(evaluateProductionAudit(report("unknown")).ok).toBe(false);
    expect(evaluateProductionAudit({ ...report(), vulnerabilities: { dependency: null } }).ok).toBe(false);
  });

  it("fails when metadata and entries disagree", () => {
    const audit = report("high");
    audit.metadata.vulnerabilities.high = 0;
    expect(evaluateProductionAudit(audit).ok).toBe(false);
  });

  it("fails on operational errors and unsupported report versions", () => {
    expect(evaluateProductionAudit({ ...report(), error: { summary: "network unavailable" } }).ok).toBe(false);
    expect(evaluateProductionAudit({ ...report(), auditReportVersion: 3 }).ok).toBe(false);
    expect(evaluateProductionAudit(null).ok).toBe(false);
  });

  it.each([-1, 0.5, undefined, "0"])("fails on malformed counts: %s", (high) => {
    const audit = { ...report(), metadata: { vulnerabilities: { high, critical: 0 } } };
    expect(evaluateProductionAudit(audit).ok).toBe(false);
  });
});

describe("reviewed advisory exceptions", () => {
  it("allows a reviewed advisory together with its propagation chain", () => {
    const audit = auditReport(
      {
        braces: { severity: "high", via: [{ url: BRACES_ADVISORY, severity: "high" }] },
        micromatch: { severity: "high", via: ["braces"] },
        tailwindcss: { severity: "high", via: ["micromatch"] },
      },
      { high: 3, critical: 0 },
    );
    expect(evaluateProductionAudit(audit).ok).toBe(true);
  });

  it("allows the reviewed node-forge advisory through its Expo tooling chain", () => {
    const audit = auditReport(
      {
        "node-forge": {
          severity: "high",
          via: [{ url: NODE_FORGE_ADVISORY, severity: "high" }],
        },
        "@expo/code-signing-certificates": { severity: "high", via: ["node-forge"] },
        "expo-updates": {
          severity: "high",
          via: ["@expo/code-signing-certificates"],
        },
      },
      { high: 3, critical: 0 },
    );
    expect(evaluateProductionAudit(audit).ok).toBe(true);
  });

  it("rejects an unlisted advisory and keeps its chain failing closed", () => {
    const audit = auditReport(
      {
        braces: {
          severity: "high",
          via: [
            {
              url: "https://github.com/advisories/GHSA-aaaa-bbbb-cccc",
              severity: "high",
            },
          ],
        },
        micromatch: { severity: "high", via: ["braces"] },
      },
      { high: 2, critical: 0 },
    );
    expect(evaluateProductionAudit(audit).ok).toBe(false);
  });

  it("fails closed on a reference to a package without a blocking entry", () => {
    const audit = auditReport(
      { micromatch: { severity: "high", via: ["braces"] } },
      { high: 1, critical: 0 },
    );
    expect(evaluateProductionAudit(audit).ok).toBe(false);
  });

  it("does not apply a reviewed advisory to a different package", () => {
    const audit = auditReport(
      {
        chokidar: {
          severity: "high",
          via: [{ url: BRACES_ADVISORY, severity: "high" }],
        },
      },
      { high: 1, critical: 0 },
    );
    expect(evaluateProductionAudit(audit).ok).toBe(false);
  });

  it("never allows a critical finding even when the advisory is listed", () => {
    const audit = auditReport(
      {
        braces: {
          severity: "critical",
          via: [{ url: BRACES_ADVISORY, severity: "high" }],
        },
      },
      { high: 0, critical: 1 },
    );
    expect(evaluateProductionAudit(audit).ok).toBe(false);
  });

  it("fails closed on cyclic references with no reviewed root", () => {
    const audit = auditReport(
      {
        "react-native": {
          severity: "high",
          via: ["@react-native/virtualized-lists"],
        },
        "@react-native/virtualized-lists": { severity: "high", via: ["react-native"] },
      },
      { high: 2, critical: 0 },
    );
    expect(evaluateProductionAudit(audit).ok).toBe(false);
  });

  it("fails when covered and uncovered findings are mixed", () => {
    const audit = auditReport(
      {
        braces: { severity: "high", via: [{ url: BRACES_ADVISORY, severity: "high" }] },
        "image-size": {
          severity: "high",
          via: [{ url: "https://github.com/advisories/GHSA-w3rx-r6r6-pgpr", severity: "high" }],
        },
      },
      { high: 2, critical: 0 },
    );
    expect(evaluateProductionAudit(audit).ok).toBe(false);
  });

  it("fails closed when a listed advisory object carries no url", () => {
    const audit = auditReport(
      { braces: { severity: "high", via: [{ severity: "high" }] } },
      { high: 1, critical: 0 },
    );
    expect(evaluateProductionAudit(audit).ok).toBe(false);
  });

  it("fails closed when an approved advisory is mixed with a malformed via object", () => {
    const audit = auditReport(
      {
        braces: {
          severity: "high",
          via: [{ url: BRACES_ADVISORY, severity: "high" }, { severity: "high" }],
        },
      },
      { high: 1, critical: 0 },
    );
    expect(evaluateProductionAudit(audit).ok).toBe(false);
  });

  it("fails closed when an approved advisory is mixed with an unknown package reference", () => {
    const audit = auditReport(
      {
        braces: {
          severity: "high",
          via: [
            { url: BRACES_ADVISORY, severity: "high" },
            "not-a-blocking-package",
          ],
        },
      },
      { high: 1, critical: 0 },
    );
    expect(evaluateProductionAudit(audit).ok).toBe(false);
  });

  it("fails closed when an approved advisory is mixed with an unresolved reference", () => {
    const audit = auditReport(
      {
        braces: {
          severity: "high",
          via: [{ url: BRACES_ADVISORY, severity: "high" }, "chokidar"],
        },
        chokidar: { severity: "high", via: ["unknown-package"] },
      },
      { high: 2, critical: 0 },
    );
    expect(evaluateProductionAudit(audit).ok).toBe(false);
  });

  it("treats references to non-blocking entries as resolved", () => {
    const audit = auditReport(
      {
        braces: {
          severity: "high",
          via: [{ url: BRACES_ADVISORY, severity: "high" }, "postcss-nested"],
        },
        "postcss-nested": { severity: "moderate", via: ["postcss-selector-parser"] },
        "postcss-selector-parser": {
          severity: "moderate",
          via: [
            {
              url: "https://github.com/advisories/GHSA-rj75-hqrm-r3gf",
              severity: "moderate",
            },
          ],
        },
      },
      { high: 1, critical: 0 },
    );
    expect(evaluateProductionAudit(audit).ok).toBe(true);
  });
});

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

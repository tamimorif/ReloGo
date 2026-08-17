// The release gate is a CommonJS script executed directly by Node.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { evaluateProductionAudit } = require("../../scripts/production-audit-policy");

const reviewedUrls = [
  "https://github.com/advisories/GHSA-w3rx-r6r6-pgpr",
  "https://github.com/advisories/GHSA-5p2g-fcmc-qvqq",
];
const reviewedGraph: Record<string, string[]> = {
  "@expo/cli": ["@expo/metro", "@expo/metro-config"],
  "@expo/metro": ["metro", "metro-config", "metro-transform-worker"],
  "@expo/metro-config": ["@expo/metro"],
  "@react-native/community-cli-plugin": ["metro", "metro-config"],
  expo: ["@expo/cli", "@expo/metro", "@expo/metro-config"],
  "image-size": [],
  metro: ["image-size", "metro-config", "metro-transform-worker"],
  "metro-config": ["metro"],
  "metro-transform-worker": ["metro"],
  "react-native": ["@react-native/community-cli-plugin"],
};

type AdvisoryReason = {
  name: string;
  dependency: string;
  severity: string;
  url: string;
};

type VulnerabilityFixture = {
  name: string;
  severity: string;
  isDirect: boolean;
  via: Array<string | AdvisoryReason>;
};

function reviewedAdvisories(): AdvisoryReason[] {
  return reviewedUrls.map((url) => ({
    name: "image-size",
    dependency: "image-size",
    severity: "high",
    url,
  }));
}

function cleanReport() {
  return {
    auditReportVersion: 2,
    vulnerabilities: {},
    metadata: { vulnerabilities: { high: 0, critical: 0 } },
  };
}

function reviewedReport() {
  const vulnerabilities: Record<string, VulnerabilityFixture> = {};
  for (const [name, via] of Object.entries(reviewedGraph)) {
    vulnerabilities[name] = {
      name,
      severity: "high",
      isDirect: name === "expo" || name === "react-native",
      via: name === "image-size" ? reviewedAdvisories() : via,
    };
  }

  return {
    auditReportVersion: 2,
    vulnerabilities,
    metadata: { vulnerabilities: { high: 10, critical: 0 } },
  };
}

function reviewedLockfile(version = "1.2.1") {
  return {
    packages: {
      "": { name: "relogo-mobile" },
      "node_modules/metro/node_modules/image-size": { version },
    },
  };
}

describe("production audit policy", () => {
  it("passes a valid report with no blocking findings", () => {
    expect(evaluateProductionAudit(cleanReport(), reviewedLockfile())).toEqual(
      expect.objectContaining({ ok: true }),
    );
  });

  it("passes only the exact reviewed advisory graph and lock version", () => {
    expect(
      evaluateProductionAudit(reviewedReport(), reviewedLockfile()),
    ).toEqual(expect.objectContaining({ ok: true }));
  });

  it("fails when the vulnerabilities map is missing despite high metadata", () => {
    const report = { ...cleanReport(), vulnerabilities: undefined };
    report.metadata.vulnerabilities.high = 1;

    expect(evaluateProductionAudit(report, reviewedLockfile()).ok).toBe(false);
  });

  it("fails when metadata and vulnerability entries disagree", () => {
    const report = reviewedReport();
    report.metadata.vulnerabilities.high = 1;

    expect(evaluateProductionAudit(report, reviewedLockfile()).ok).toBe(false);
  });

  it("fails on operational errors and unsupported report versions", () => {
    expect(
      evaluateProductionAudit(
        { ...cleanReport(), error: { summary: "network unavailable" } },
        reviewedLockfile(),
      ).ok,
    ).toBe(false);
    expect(
      evaluateProductionAudit(
        { ...cleanReport(), auditReportVersion: 3 },
        reviewedLockfile(),
      ).ok,
    ).toBe(false);
  });

  it("fails on an unexpected advisory or changed image-size version", () => {
    const report = reviewedReport();
    report.vulnerabilities["image-size"].via.push({
      name: "image-size",
      dependency: "image-size",
      severity: "high",
      url: "https://github.com/advisories/GHSA-new-unreviewed",
    });

    expect(evaluateProductionAudit(report, reviewedLockfile()).ok).toBe(false);
    expect(
      evaluateProductionAudit(reviewedReport(), reviewedLockfile("2.0.2")).ok,
    ).toBe(false);
  });

  it("fails closed on any critical finding", () => {
    const report = reviewedReport();
    report.vulnerabilities.metro.severity = "critical";
    report.metadata.vulnerabilities.high = 9;
    report.metadata.vulnerabilities.critical = 1;

    expect(evaluateProductionAudit(report, reviewedLockfile()).ok).toBe(false);
  });

  it("rejects the same advisory URLs on an unrelated runtime package", () => {
    const report = reviewedReport();
    report.vulnerabilities["unrelated-runtime-package"] = {
      name: "unrelated-runtime-package",
      severity: "high",
      isDirect: true,
      via: reviewedAdvisories(),
    };
    report.metadata.vulnerabilities.high = 11;

    expect(evaluateProductionAudit(report, reviewedLockfile()).ok).toBe(false);
  });

  it("rejects changes to the reviewed Metro dependency graph", () => {
    const report = reviewedReport();
    report.vulnerabilities.expo.via = reviewedAdvisories();

    expect(evaluateProductionAudit(report, reviewedLockfile()).ok).toBe(false);
  });

  it("rejects a hoisted image-size lock entry", () => {
    const lockfile = {
      packages: {
        "": { name: "relogo-mobile" },
        "node_modules/image-size": { version: "1.2.1" },
      },
    };

    expect(evaluateProductionAudit(reviewedReport(), lockfile).ok).toBe(false);
  });
});

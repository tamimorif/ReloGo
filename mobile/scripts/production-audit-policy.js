const REVIEWED_IMAGE_SIZE_VERSION = "1.2.1";
const REVIEWED_IMAGE_SIZE_LOCK_PATH =
  "node_modules/metro/node_modules/image-size";
const REVIEWED_ADVISORIES = new Set([
  "https://github.com/advisories/GHSA-w3rx-r6r6-pgpr",
  "https://github.com/advisories/GHSA-5p2g-fcmc-qvqq",
]);
const REVIEWED_BLOCKING_GRAPH = new Map([
  ["image-size", []],
  ["metro", ["image-size", "metro-config", "metro-transform-worker"]],
  ["metro-config", ["metro"]],
  ["metro-transform-worker", ["metro"]],
]);
const REVIEWED_DIRECT_PACKAGES = new Set();

function verdict(ok, message) {
  return { ok, message };
}

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function sameStringSet(actual, expected) {
  return (
    actual.size === expected.size &&
    [...expected].every((value) => actual.has(value))
  );
}

function evaluateProductionAudit(report, lockfile) {
  if (!isRecord(report) || report.auditReportVersion !== 2) {
    return verdict(false, "npm audit returned an unsupported report schema.");
  }
  if (report.error) {
    return verdict(false, "npm audit returned an operational error.");
  }
  if (!isRecord(report.vulnerabilities)) {
    return verdict(false, "npm audit omitted the vulnerabilities map.");
  }

  const counts = report.metadata?.vulnerabilities;
  if (
    !isRecord(counts) ||
    !Number.isInteger(counts.high) ||
    counts.high < 0 ||
    !Number.isInteger(counts.critical) ||
    counts.critical < 0
  ) {
    return verdict(false, "npm audit omitted valid high/critical metadata.");
  }

  const vulnerabilities = report.vulnerabilities;
  const blockingEntries = Object.entries(vulnerabilities).filter(([, value]) =>
    value?.severity === "high" || value?.severity === "critical",
  );
  if (blockingEntries.length !== counts.high + counts.critical) {
    return verdict(false, "npm audit vulnerability metadata did not match its entries.");
  }
  if (counts.critical !== 0) {
    return verdict(false, "npm audit reported a critical vulnerability.");
  }
  if (blockingEntries.length === 0) {
    return verdict(
      true,
      "Production dependency audit passed with no high/critical findings.",
    );
  }

  const blockingNames = new Set(blockingEntries.map(([name]) => name));
  const reviewedNames = new Set(REVIEWED_BLOCKING_GRAPH.keys());
  if (!sameStringSet(blockingNames, reviewedNames)) {
    return verdict(
      false,
      "the high-severity dependency graph changed and requires a new review.",
    );
  }

  for (const [name, expectedVia] of REVIEWED_BLOCKING_GRAPH) {
    const vulnerability = vulnerabilities[name];
    if (
      !isRecord(vulnerability) ||
      vulnerability.name !== name ||
      vulnerability.severity !== "high" ||
      vulnerability.isDirect !== REVIEWED_DIRECT_PACKAGES.has(name) ||
      !Array.isArray(vulnerability.via)
    ) {
      return verdict(
        false,
        `the reviewed audit entry changed for ${name}.`,
      );
    }

    if (name === "image-size") {
      const advisoryUrls = new Set();
      for (const reason of vulnerability.via) {
        if (
          !isRecord(reason) ||
          reason.name !== "image-size" ||
          reason.dependency !== "image-size" ||
          reason.severity !== "high" ||
          typeof reason.url !== "string"
        ) {
          return verdict(false, "the image-size advisory details changed.");
        }
        advisoryUrls.add(reason.url);
      }
      if (
        vulnerability.via.length !== REVIEWED_ADVISORIES.size ||
        !sameStringSet(advisoryUrls, REVIEWED_ADVISORIES)
      ) {
        return verdict(
          false,
          "the image-size advisory set changed and requires a new review.",
        );
      }
      continue;
    }

    if (vulnerability.via.some((reason) => typeof reason !== "string")) {
      return verdict(false, `the reviewed dependency path changed for ${name}.`);
    }
    const actualVia = new Set(vulnerability.via);
    if (!sameStringSet(actualVia, new Set(expectedVia))) {
      return verdict(false, `the reviewed dependency path changed for ${name}.`);
    }
  }

  if (!isRecord(lockfile) || !isRecord(lockfile.packages)) {
    return verdict(false, "package-lock.json has an unsupported schema.");
  }
  const lockedImageSizeEntries = Object.entries(lockfile.packages).filter(
    ([path]) =>
      path === "node_modules/image-size" ||
      path.endsWith("/node_modules/image-size"),
  );
  if (
    lockedImageSizeEntries.length !== 1 ||
    lockedImageSizeEntries[0][0] !== REVIEWED_IMAGE_SIZE_LOCK_PATH ||
    lockedImageSizeEntries[0][1]?.version !== REVIEWED_IMAGE_SIZE_VERSION
  ) {
    return verdict(
      false,
      `the reviewed image-size exception requires one locked ${REVIEWED_IMAGE_SIZE_VERSION} package.`,
    );
  }

  function collectAdvisories(name, visited = new Set()) {
    if (visited.has(name)) return new Set();
    visited.add(name);

    const vulnerability = vulnerabilities[name];
    if (!isRecord(vulnerability)) return new Set();

    const urls = new Set();
    for (const reason of vulnerability.via ?? []) {
      if (typeof reason === "string") {
        for (const url of collectAdvisories(reason, visited)) urls.add(url);
      } else if (isRecord(reason) && typeof reason.url === "string") {
        urls.add(reason.url);
      }
    }
    return urls;
  }

  const unexpected = [];
  for (const [name] of blockingEntries) {
    const advisoryUrls = collectAdvisories(name);
    if (
      advisoryUrls.size === 0 ||
      [...advisoryUrls].some((url) => !REVIEWED_ADVISORIES.has(url))
    ) {
      unexpected.push(name);
    }
  }
  if (unexpected.length > 0) {
    return verdict(
      false,
      `unreviewed high/critical findings affect: ${unexpected.join(", ")}.`,
    );
  }

  return verdict(
    true,
    "Production dependency audit passed with the two reviewed Metro/image-size build-time advisories only.",
  );
}

module.exports = {
  evaluateProductionAudit,
};

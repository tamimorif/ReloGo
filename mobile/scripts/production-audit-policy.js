function verdict(ok, message) {
  return { ok, message };
}

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

// Reviewed, owner-approved exceptions for advisories that have no patched
// release. The gate still fails closed on every high/critical finding that is
// not listed here, and critical findings are never allowed. Remove each entry
// as soon as a patched release ships; re-review by the stated date.
const REVIEWED_ADVISORY_EXCEPTIONS = [
  {
    advisory: "GHSA-vfj7-8cjw-p6xm",
    packageName: "braces",
    justification:
      "No patched release published (latest 3.0.3 is still affected). Reached only through build-time tooling chains (file watching and glob matching used by Tailwind/NativeWind and Metro transforms); not imported by the app runtime bundle.",
    reviewBy: "2026-12-01",
  },
  {
    advisory: "GHSA-86w9-cpqp-85rv",
    packageName: "node-forge",
    justification:
      "No patched release published (latest 1.4.0 is still affected). Reached only through Expo CLI/code-signing tooling (expo-updates cli scripts, @expo/cli iOS signing); the expo-updates runtime build output does not import it.",
    reviewBy: "2026-12-01",
  },
];

const ADVISORY_ID_PATTERN = /GHSA-[0-9a-z-]+/i;

function advisoryObjectId(value) {
  if (!isRecord(value) || typeof value.url !== "string") return null;
  const match = value.url.match(ADVISORY_ID_PATTERN);
  return match ? match[0].toUpperCase() : null;
}

function isCoveredByReviewedExceptions(name, entry, resolution) {
  const { allNames, knownNames, covered, exceptionByAdvisory } = resolution;
  const via = Array.isArray(entry.via) ? entry.via : [];
  if (via.length === 0) return false;

  const advisories = [];
  const references = [];
  for (const item of via) {
    if (typeof item === "string") {
      references.push(item);
      continue;
    }
    const advisoryId = advisoryObjectId(item);
    // A malformed or unrecognized via object is unaccounted evidence: fail closed.
    if (advisoryId === null) return false;
    advisories.push({ advisoryId, severity: item.severity });
  }

  // Every reference must at least name an entry that exists in the report.
  // References to names that do not exist are unaccounted evidence: fail closed.
  const referencesAccountedFor = references.every((reference) =>
    allNames.has(reference),
  );

  if (advisories.length > 0) {
    // Every advisory must be reviewed for this exact package; references are
    // evaluated as their own entries (an unresolved blocking reference fails
    // the gate there).
    const advisoriesCovered = advisories.every((advisory) => {
      if (advisory.severity !== "high") return false;
      const exception = exceptionByAdvisory.get(advisory.advisoryId);
      return !!exception && exception.packageName === name;
    });
    return advisoriesCovered && referencesAccountedFor;
  }

  // A propagation-only entry is covered when every reference is accounted for
  // and at least one referenced blocking entry is covered; entries in an
  // unexplained cycle stay fail-closed.
  return (
    referencesAccountedFor &&
    references.some(
      (reference) => knownNames.has(reference) && covered.get(reference) === true,
    )
  );
}

function evaluateProductionAudit(report) {
  if (!isRecord(report)) {
    return verdict(false, "npm audit returned an unsupported report schema.");
  }
  if (report.error) {
    return verdict(false, "npm audit returned an operational error.");
  }
  if (report.auditReportVersion !== 2) {
    return verdict(false, "npm audit returned an unsupported report schema.");
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
  if (Object.values(vulnerabilities).some((value) =>
    !isRecord(value) || !["info", "low", "moderate", "high", "critical"].includes(value.severity),
  )) {
    return verdict(false, "npm audit returned an invalid vulnerability entry.");
  }
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

  const resolution = {
    allNames: new Set(Object.keys(vulnerabilities)),
    knownNames: new Set(blockingEntries.map(([name]) => name)),
    covered: new Map(),
    exceptionByAdvisory: new Map(
      REVIEWED_ADVISORY_EXCEPTIONS.map((exception) => [
        exception.advisory.toUpperCase(),
        exception,
      ]),
    ),
  };
  let changed = true;
  while (changed) {
    changed = false;
    for (const [name, entry] of blockingEntries) {
      if (resolution.covered.get(name)) continue;
      if (isCoveredByReviewedExceptions(name, entry, resolution)) {
        resolution.covered.set(name, true);
        changed = true;
      }
    }
  }

  const uncovered = blockingEntries
    .map(([name]) => name)
    .filter((name) => !resolution.covered.get(name));
  if (uncovered.length > 0) {
    return verdict(
      false,
      `npm audit reported high-severity vulnerabilities outside reviewed exceptions: ${uncovered.join(", ")}.`,
    );
  }

  const activeExceptions = REVIEWED_ADVISORY_EXCEPTIONS.filter((exception) =>
    blockingEntries.some(
      ([name, entry]) =>
        name === exception.packageName &&
        (Array.isArray(entry.via) ? entry.via : []).some(
          (advisory) =>
            advisoryObjectId(advisory) === exception.advisory.toUpperCase(),
        ),
    ),
  );
  return verdict(
    true,
    `Production dependency audit passed with ${activeExceptions.length} reviewed exception(s) in effect: ${activeExceptions
      .map(
        (exception) =>
          `${exception.packageName} ${exception.advisory} (re-review by ${exception.reviewBy})`,
      )
      .join("; ")}.`,
  );
}

module.exports = { evaluateProductionAudit };

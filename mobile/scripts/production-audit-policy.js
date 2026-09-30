function verdict(ok, message) {
  return { ok, message };
}

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
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

  return verdict(false, "npm audit reported a high-severity vulnerability.");
}

module.exports = { evaluateProductionAudit };

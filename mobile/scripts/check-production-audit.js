#!/usr/bin/env node

// Fail closed when the advisory service is unavailable or reports any
// high/critical finding. The former Metro/image-size exception is retired.
const { spawnSync } = require("node:child_process");
const { evaluateProductionAudit } = require("./production-audit-policy");

function fail(message) {
  console.error(`Production dependency audit failed: ${message}`);
  process.exit(1);
}

const audit = spawnSync(
  process.platform === "win32" ? "npm.cmd" : "npm",
  ["audit", "--omit=dev", "--json"],
  { encoding: "utf8", maxBuffer: 10 * 1024 * 1024 },
);

if (audit.error) {
  fail("npm audit could not run.");
}
if (audit.status !== 0 && audit.status !== 1) {
  fail("npm audit exited unexpectedly.");
}

let report;
try {
  report = JSON.parse(audit.stdout);
} catch {
  fail("npm audit did not return valid JSON.");
}

const result = evaluateProductionAudit(report);
if (!result.ok) fail(result.message);
console.log(result.message);

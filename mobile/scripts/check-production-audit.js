#!/usr/bin/env node

/**
 * Keep npm's high/critical production audit as a release gate while narrowly
 * accounting for two upstream image-size findings pulled in by Metro.
 *
 * Metro uses image-size only while bundling repository-controlled assets. It
 * is not part of the shipped React Native JavaScript bundle and never parses
 * a user's image. npm currently offers only incompatible Expo/React Native
 * downgrades, and image-size has no patched release. This checker therefore
 * accepts exactly the two reviewed advisory URLs below at the exact reviewed
 * transitive version, and fails closed for every other high/critical path.
 */
const { spawnSync } = require("node:child_process");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
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

let lockfile;
try {
  lockfile = JSON.parse(readFileSync(join(process.cwd(), "package-lock.json"), "utf8"));
} catch {
  fail("package-lock.json could not be read.");
}

const result = evaluateProductionAudit(report, lockfile);
if (!result.ok) fail(result.message);
console.log(result.message);

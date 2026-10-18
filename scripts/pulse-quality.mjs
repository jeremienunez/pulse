#!/usr/bin/env node

import { parseArgs } from "node:util";
import { runQuality } from "./lib/pulse-quality.mjs";

try {
  const { values } = parseArgs({ options: {
    profile: { type: "string" }, "repo-root": { type: "string", default: process.cwd() }, json: { type: "boolean", default: false },
  } });
  if (!["commit", "ci"].includes(values.profile)) throw new Error("Usage: pulse-quality.mjs --profile commit|ci [--repo-root PATH] [--json]");
  const report = await runQuality(values["repo-root"], values.profile, {
    onStep: values.json ? undefined : id => { if (!id.startsWith("syntax:")) process.stderr.write(`quality: ${id}\n`); },
  });
  process.stdout.write(values.json ? `${JSON.stringify(report, null, 2)}\n`
    : `Quality ${report.profile}: ${report.status}\nTree: ${report.tree}\nReport: ${report.report_path}\n${report.reason ? `${report.reason}\n` : ""}`);
  process.exitCode = report.status === "passed" ? 0 : report.status === "failed" ? 1 : 2;
} catch (error) {
  process.stderr.write(`Quality unavailable: ${error.message}\n`);
  process.exitCode = 2;
}

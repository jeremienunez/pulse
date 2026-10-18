import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { pathToFileURL, fileURLToPath } from "node:url";
import { captureCandidate, QualityUnavailable } from "./pulse-quality-candidate.mjs";

export function checkEnvironmentPaths(entries) {
  return entries.filter(entry => /^\.env/u.test(path.posix.basename(entry.path))
    && path.posix.basename(entry.path) !== ".env.example").map(entry => entry.path);
}

export function verifyCandidate(candidate, checks, { profile, timeoutMs = 120000, onStep = () => {} } = {}) {
  const reportDir = path.join(candidate.gitDir, "pulse-quality", `${candidate.tree}-${randomUUID()}`);
  fs.mkdirSync(reportDir, { recursive: true });
  const report = { schema_version: "1.0", tree: candidate.tree, profile, status: "passed", checks: [],
    started_at: new Date().toISOString(), finished_at: "", report_dir: reportDir };
  try {
    const forbidden = checkEnvironmentPaths(candidate.entries);
    if (forbidden.length) {
      report.status = "failed";
      report.reason = `Indexed environment files are not allowed: ${forbidden.join(", ")}`;
    }
    if (!checks.length && report.status === "passed") throw new QualityUnavailable("No verification commands were declared.");
    for (const [index, check] of checks.entries()) {
      if (report.status !== "passed") break;
      onStep(check.id);
      const result = spawnSync(check.command, check.args, { cwd: candidate.root, env: candidate.env,
        encoding: "utf8", timeout: timeoutMs, maxBuffer: 4 * 1024 * 1024, shell: false });
      const log = `${String(index).padStart(4, "0")}.log`;
      fs.writeFileSync(path.join(reportDir, log), `${result.stdout || ""}${result.stderr || ""}${result.error ? `\n${result.error.message}\n` : ""}`);
      const status = result.error || result.signal || result.status === null ? "unavailable" : result.status === 0 ? "passed" : "failed";
      report.checks.push({ id: check.id, command: check.command, args: check.args, status, exit_code: result.status,
        signal: result.signal, log });
      if (status !== "passed") report.status = status;
    }
    if (!candidate.current()) {
      report.status = "failed";
      report.reason = "The source Git index changed during verification; verify the new candidate before committing.";
    }
  } catch (error) {
    report.status = "unavailable";
    report.reason = error.message;
  }
  report.finished_at = new Date().toISOString();
  const reportPath = path.join(reportDir, "result.json");
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, { flag: "wx" });
  return { ...report, report_path: reportPath };
}

export async function runQuality(repoRoot, profile, options = {}) {
  const candidate = captureCandidate(repoRoot);
  try {
    const runtimeRoot = fileURLToPath(new URL("../../", import.meta.url));
    const runtime = ["scripts/pulse-quality.mjs", "scripts/lib/pulse-quality.mjs",
      "scripts/lib/pulse-quality-candidate.mjs", "scripts/lib/pulse-quality-profile.mjs"];
    for (const file of runtime) {
      if (!fs.readFileSync(path.join(runtimeRoot, file)).equals(fs.readFileSync(path.join(candidate.root, file)))) {
        throw new QualityUnavailable(`The running quality verifier differs from the indexed candidate; stage or select the matching verifier: ${file}`);
      }
    }
    const { qualityChecks } = await import(pathToFileURL(path.join(candidate.root, "scripts/lib/pulse-quality-profile.mjs")));
    return verifyCandidate(candidate, qualityChecks(profile, candidate.entries), { ...options, profile });
  } finally { candidate.dispose(); }
}

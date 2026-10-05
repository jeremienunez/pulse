#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ADAPTERS_PATH = path.join(REPO_ROOT, "workflow", "skill-adapters.json");

function renderDependencies(dependencies) {
  if (!Array.isArray(dependencies) || dependencies.length === 0) {
    return "  dependencies: []";
  }
  const lines = ["  dependencies:"];
  for (const dependency of dependencies) {
    lines.push(`    - id: ${dependency.id}`);
    lines.push(`      kind: ${dependency.kind}`);
    if (dependency.command) lines.push(`      command: ${dependency.command}`);
    if (dependency.server_names) {
      lines.push(`      server_names: [${dependency.server_names.join(", ")}]`);
    }
    if (dependency.config_sources) {
      lines.push(`      config_sources: [${dependency.config_sources.join(", ")}]`);
    }
    lines.push(`      missing_effect: ${dependency.missing_effect}`);
    lines.push(`      reason: ${dependency.reason}`);
  }
  return lines.join("\n");
}

function renderSkill(adapter) {
  const contractPath = path.join(REPO_ROOT, adapter.contract);
  const contract = fs.readFileSync(contractPath, "utf8").trim();
  return [
    "---",
    `name: ${adapter.name}`,
    `description: ${JSON.stringify(adapter.description)}`,
    "metadata:",
    `  version: '${adapter.version}'`,
    "  ecosystem: pulse",
    `  generated_from: '${adapter.contract}'`,
    renderDependencies(adapter.dependencies),
    "---",
    "",
    "<!-- GENERATED FROM PULSE ICM WORKFLOW. EDIT THE CANONICAL CONTRACT, NOT THIS FILE. -->",
    "",
    `# ${adapter.name}`,
    "",
    "## Runtime Selection",
    "",
    "1. Resolve the installed Pulse plugin root from this `SKILL.md` path.",
    "2. Run `node <plugin-root>/workflow/scripts/pulse_icm.mjs status --repo-root <repo-root>`.",
    "3. If status is `icm-v2`, follow the embedded canonical contract below and do not load legacy guidance.",
    "4. If status is `legacy-v1`, read `references/legacy-v1.md` and follow that frozen contract without rewriting history.",
    "5. If status is `conflict`, stop and surface the conflicting v2 and legacy surfaces.",
    adapter.name === "using-pulse"
      ? "6. If status is `none`, follow the router contract below to initialize a new ICM v2 run."
      : "6. If status is `none`, route to `pulse:using-pulse`; this stage must not invent a run.",
    "",
    "## ICM v2 Contract",
    "",
    contract,
    "",
  ].join("\n");
}

function main() {
  const check = process.argv.slice(2).includes("--check");
  const adapters = JSON.parse(fs.readFileSync(ADAPTERS_PATH, "utf8"));
  const stale = [];

  for (const adapter of adapters.skills || []) {
    const target = path.join(REPO_ROOT, "skills", adapter.name, "SKILL.md");
    const expected = renderSkill(adapter);
    const current = fs.existsSync(target) ? fs.readFileSync(target, "utf8") : "";
    if (current === expected) continue;
    if (check) {
      stale.push(path.relative(REPO_ROOT, target));
      continue;
    }
    fs.writeFileSync(target, expected, "utf8");
    process.stdout.write(`wrote ${path.relative(REPO_ROOT, target)}\n`);
  }

  if (check && stale.length > 0) {
    process.stderr.write(`Generated workflow skills are stale:\n- ${stale.join("\n- ")}\n`);
    process.exitCode = 1;
    return;
  }
  if (check) process.stdout.write("workflow skills are up to date\n");
}

main();

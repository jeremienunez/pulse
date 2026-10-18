#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";

import { readPulseStatus } from "../skills/using-pulse/scripts/pulse_state.mjs";
import { conditionFromFiles, prepareEvidence, caseDefinition, runnerPacket, validateEvidence } from "./lib/pulse-skill-evidence.mjs";
import { prepareCreativeSession, recordCreativeEvent, checkCreativeSession, finalizeCreativeSession } from "./lib/pulse-creative-session.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");
const DEFAULT_WORKSPACE = path.join(repoRoot, "pulse-eval-workspace");
const DEFAULT_CONFIG = path.join(repoRoot, ".plugin-eval", "benchmark.json");
const PHASE_ORDER = ["static", "runtime", "scout", "benchmark", "scenarios"];
const DEFAULT_EVIDENCE_FILE = "benchmark-evidence.json";
const DEFAULT_PACKET_FILE = "benchmark-packet.md";
const CHAT_RUN_NOTE = "chat-run benchmark: scenario execution and scoring were captured in the interactive session, not spawned headlessly by the evaluator.";
const DISCRIMINATION_NOTE = "non-discriminating signal unavailable in chat-run mode: no normalized baseline is collected by the evaluator.";
const REQUIRED_RUNNER_PROFILE_FIELDS = ["model_id", "model_version", "reasoning_effort", "runtime"];
const EVIDENCE_KIND = "pulse-chat-benchmark-evidence";
const EVIDENCE_SCHEMA_VERSION = 3;

function parseArgs(argv) {
  const subcommands = new Set(["run", "analyze", "scout", "benchmark", "creative"]);
  const args = {
    command: "run",
    workspace: DEFAULT_WORKSPACE,
    config: DEFAULT_CONFIG,
    runCmd: null,
    iteration: null,
    evalIds: null,
    evidence: null,
    runtime: null,
    skipStatic: false,
    skipRuntime: false,
    skipScenarios: false,
    strict: false,
    json: false,
    help: false,
    legacyAudit: false,
    executionKind: "native",
    condition: null,
    references: [],
    creativePhase: null,
    creativeInput: null,
  };

  let index = 0;
  if (argv[0] && subcommands.has(argv[0])) {
    args.command = argv[0];
    index = 1;
  }

  for (; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--workspace") args.workspace = path.resolve(argv[++index]);
    else if (token === "--config") args.config = path.resolve(argv[++index]);
    else if (token === "--run-cmd") args.runCmd = argv[++index];
    else if (token === "--iteration") args.iteration = argv[++index];
    else if (token === "--eval-ids") args.evalIds = argv[++index];
    else if (token === "--evidence") args.evidence = path.resolve(argv[++index]);
    else if (token === "--runtime") args.runtime = argv[++index];
    else if (token === "--skip-static") args.skipStatic = true;
    else if (token === "--skip-runtime") args.skipRuntime = true;
    else if (token === "--skip-scenarios") args.skipScenarios = true;
    else if (token === "--strict") args.strict = true;
    else if (token === "--json") args.json = true;
    else if (token === "--help" || token === "-h") args.help = true;
    else if (token === "--legacy-audit") args.legacyAudit = true;
    else if (token === "--execution-kind") args.executionKind = argv[++index];
    else if (token === "--condition") args.condition = path.resolve(argv[++index]);
    else if (token === "--references") args.references = argv[++index].split(",").filter(Boolean);
    else if (args.command === "creative" && token === "--phase") args.creativePhase = argv[++index];
    else if (args.command === "creative" && token === "--input") args.creativeInput = path.resolve(argv[++index]);
    else throw new Error(`Unknown option: ${token}`);
  }

  return args;
}

function printHelp() {
  console.log(`Pulse plugin evaluation runner

Usage:
  node scripts/pulse-plugin-eval.mjs [options]
  node scripts/pulse-plugin-eval.mjs run [options]
  node scripts/pulse-plugin-eval.mjs analyze [options]
  node scripts/pulse-plugin-eval.mjs scout [options]
  node scripts/pulse-plugin-eval.mjs benchmark [options]
  node scripts/pulse-plugin-eval.mjs creative --phase prepare|record|check|finalize --input JSON --json

Commands:
  run                     Run all evaluator stages (default)
  analyze                 Run static and runtime checks only
  scout                   Run Pulse readiness scout only
  benchmark               Prepare chat benchmark artifacts or finalize from evidence

Options:
  --workspace <path>      Eval workspace (default: pulse-eval-workspace)
  --config <path>         Benchmark config (default: .plugin-eval/benchmark.json)
  --run-cmd <command>     Optional command to execute during runtime checks
  --iteration <name|num>  Explicit iteration (e.g. iteration-6 or 6)
  --eval-ids <list>       Comma-separated eval IDs to select (e.g. 7,8,19)
  --evidence <path>       Filled benchmark evidence JSON to finalize into benchmark artifacts
  --runtime <value>       Deprecated in chat-run mode; accepted but ignored
  --skip-static           Skip static checks (run only)
  --skip-runtime          Skip runtime/scout checks (run only)
  --skip-scenarios        Skip benchmark/scenario checks (run only)
  --strict                Exit non-zero when any WARN occurs
  --json                  Print JSON summary only
  --help                  Show this help
  --legacy-audit          Use historical v3 workflow; never eligible for promotion
  --execution-kind <kind> native (default) or fixture; fixtures cannot certify a model
  --condition <path>     Explicit frozen condition JSON instead of source SKILL.md
  --references <paths>   Comma-separated declared references to include inline
`);
}

function exists(targetPath) {
  return fs.existsSync(targetPath);
}

function readJson(targetPath) {
  return JSON.parse(fs.readFileSync(targetPath, "utf8"));
}

function writeJson(targetPath, value) {
  fs.writeFileSync(targetPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function addResult(results, phase, name, status, detail) {
  results.push({ phase, name, status, detail });
}

function commandOnPath(command) {
  const out = spawnSync("sh", ["-c", `command -v ${command}`], { encoding: "utf8" });
  return out.status === 0 ? out.stdout.trim().split("\n")[0] || "" : "";
}

function runCommand(command, args, options = {}) {
  return spawnSync(command, args, {
    encoding: "utf8",
    cwd: options.cwd ?? repoRoot,
    env: options.env ?? process.env,
    maxBuffer: 20 * 1024 * 1024,
  });
}

function normalizeIterationName(iterationArg) {
  if (!iterationArg) return null;
  if (iterationArg.startsWith("iteration-")) return iterationArg;
  if (/^\d+$/.test(iterationArg)) return `iteration-${iterationArg}`;
  return iterationArg;
}

function listIterations(workspacePath) {
  if (!exists(workspacePath)) return [];
  return fs
    .readdirSync(workspacePath, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && /^iteration-\d+$/.test(entry.name))
    .map((entry) => entry.name)
    .sort((a, b) => Number(a.split("-")[1]) - Number(b.split("-")[1]));
}

function findLatestIteration(workspacePath) {
  const iterations = listIterations(workspacePath);
  return iterations[iterations.length - 1] ?? null;
}

function nextIterationName(workspacePath) {
  const iterations = listIterations(workspacePath);
  const last = iterations[iterations.length - 1];
  if (!last) return "iteration-1";
  return `iteration-${Number(last.split("-")[1]) + 1}`;
}

function parseEvalIds(csv) {
  if (!csv) return null;
  return csv
    .split(",")
    .map((value) => Number(value.trim()))
    .filter((value) => Number.isInteger(value) && value > 0);
}

function relativeToRepo(targetPath) {
  return path.relative(repoRoot, targetPath) || ".";
}

function buildOutputSnippet(text) {
  const normalized = String(text || "").trim();
  if (normalized.length <= 600) return normalized;
  return `${normalized.slice(0, 600)}…`;
}

function loadBenchmarkConfig(configPath) {
  if (!exists(configPath)) {
    throw new Error(`Benchmark config not found: ${relativeToRepo(configPath)}`);
  }
  return readJson(configPath);
}

function loadScenarioLibrary(config, workspacePath) {
  const sourcePath = config.scenarioSource
    ? path.resolve(repoRoot, config.scenarioSource)
    : path.join(workspacePath, "evals.json");
  if (!exists(sourcePath)) {
    throw new Error(`Scenario source not found: ${relativeToRepo(sourcePath)}`);
  }
  const payload = readJson(sourcePath);
  return { sourcePath, scenarios: Array.isArray(payload.evals) ? payload.evals : [] };
}

function selectScenarios(scenarios, requestedIds, defaultIds) {
  const selectedIds = requestedIds && requestedIds.length > 0 ? requestedIds : defaultIds;
  if (!selectedIds || selectedIds.length === 0) {
    return scenarios;
  }
  const byId = new Map(scenarios.map((scenario) => [scenario.id, scenario]));
  return selectedIds.map((id) => byId.get(id)).filter(Boolean);
}

function runVerifierCommands(commands, cwd) {
  return (commands || []).map((command) => {
    const out = runCommand("sh", ["-c", command], { cwd });
    return {
      command,
      status: out.status === 0 ? "PASS" : "FAIL",
      exit_status: out.status ?? 1,
      stdout: buildOutputSnippet(out.stdout),
      stderr: buildOutputSnippet(out.stderr),
    };
  });
}

function buildEvidencePath(args, iterationPath) {
  return args.evidence || path.join(iterationPath, DEFAULT_EVIDENCE_FILE);
}

function buildPacketMarkdown({ iterationName, evidencePath, selectedScenarios }) {
  const lines = [
    `# Pulse Benchmark Packet ${iterationName}`,
    "",
    "Run each scenario in the current interactive chat.",
    "",
    "Before the first scenario:",
    "1. fill `runner.model_id`, `runner.model_version`, `runner.reasoning_effort`, and `runner.runtime` in `benchmark-evidence.json`",
    "2. use the exact declared profile values reported by the runtime; do not infer or inherit them from an earlier run",
    "",
    "After each answer:",
    "1. paste the assistant response into the matching scenario entry",
    "2. fill the `judge` block from the same interactive session",
    "3. rerun `node scripts/pulse-plugin-eval.mjs benchmark --evidence <path>` to compile final artifacts",
    "",
    `Evidence template: ${relativeToRepo(evidencePath)}`,
    "",
  ];

  for (const scenario of selectedScenarios) {
    lines.push(`## Scenario #${scenario.id} — ${scenario.skill}`, "");
    lines.push("### User prompt", "", scenario.prompt, "");
    lines.push("### Expected output", "", scenario.expected_output || "(none)", "");
    lines.push("### Checklist", "");
    for (const expectation of scenario.expectations || []) {
      lines.push(`- ${expectation}`);
    }
    lines.push("");
  }

  return `${lines.join("\n")}\n`;
}

function scenarioBindingPayload(selectedScenarios) {
  return selectedScenarios.map((scenario) => ({
    id: scenario.id,
    skill: scenario.skill,
    skill_path: scenario.skill_path,
    prompt: scenario.prompt,
    expected_output: scenario.expected_output,
    expectations: scenario.expectations,
  }));
}

function buildScenarioDigest(selectedScenarios) {
  const payload = JSON.stringify(scenarioBindingPayload(selectedScenarios));
  return `sha256:${createHash("sha256").update(payload, "utf8").digest("hex")}`;
}

function buildEvidenceTemplate({ configPath, sourcePath, iterationName, selectedScenarios }) {
  return {
    kind: EVIDENCE_KIND,
    schemaVersion: EVIDENCE_SCHEMA_VERSION,
    created_at: new Date().toISOString(),
    iteration: iterationName,
    config_path: relativeToRepo(configPath),
    scenario_source: relativeToRepo(sourcePath),
    selected_scenario_ids: selectedScenarios.map((scenario) => scenario.id),
    scenario_digest: buildScenarioDigest(selectedScenarios),
    runner: {
      mode: "chat",
      label: "current interactive chat",
      model_id: "",
      model_version: "",
      reasoning_effort: "",
      runtime: "",
    },
    notes: [],
    scenarios: selectedScenarios.map((scenario) => ({
      id: scenario.id,
      skill: scenario.skill,
      skill_path: scenario.skill_path,
      prompt: scenario.prompt,
      expected_output: scenario.expected_output,
      expectations: scenario.expectations,
      response: "",
      judge: {
        passed: null,
        score: null,
        summary: "",
        satisfied: [],
        missed: [],
        warnings: [],
      },
      notes: [],
    })),
  };
}

function sanitizeStringList(value) {
  if (!Array.isArray(value)) return [];
  return value.map((entry) => String(entry)).filter(Boolean);
}

function sanitizeRunnerProfile(rawRunner) {
  const raw = rawRunner && typeof rawRunner === "object" ? rawRunner : {};
  return {
    mode: "chat",
    label: typeof raw.label === "string" && raw.label.trim() ? raw.label.trim() : "current interactive chat",
    model_id: typeof raw.model_id === "string" ? raw.model_id.trim() : "",
    model_version: typeof raw.model_version === "string" ? raw.model_version.trim() : "",
    reasoning_effort: typeof raw.reasoning_effort === "string" ? raw.reasoning_effort.trim() : "",
    runtime: typeof raw.runtime === "string" ? raw.runtime.trim() : "",
  };
}

function missingRunnerProfileFields(runner) {
  return REQUIRED_RUNNER_PROFILE_FIELDS.filter((field) => !runner[field]);
}

function exactArrayMatch(left, right) {
  return Array.isArray(left)
    && left.length === right.length
    && left.every((value, index) => value === right[index]);
}

function evidenceBindingErrors({ evidence, configPath, sourcePath, iterationName, selectedScenarios }) {
  const errors = [];
  const expectedIds = selectedScenarios.map((scenario) => scenario.id);
  const scenarioEntries = Array.isArray(evidence?.scenarios) ? evidence.scenarios : [];
  const scenarioEntryIds = scenarioEntries.map((entry) => entry?.id);

  if (evidence?.kind !== EVIDENCE_KIND) errors.push(`kind must be ${EVIDENCE_KIND}`);
  if (evidence?.schemaVersion !== EVIDENCE_SCHEMA_VERSION) {
    errors.push(`schemaVersion must be ${EVIDENCE_SCHEMA_VERSION}`);
  }
  if (evidence?.iteration !== iterationName) errors.push(`iteration must be ${iterationName}`);
  if (evidence?.config_path !== relativeToRepo(configPath)) {
    errors.push(`config_path must be ${relativeToRepo(configPath)}`);
  }
  if (evidence?.scenario_source !== relativeToRepo(sourcePath)) {
    errors.push(`scenario_source must be ${relativeToRepo(sourcePath)}`);
  }
  if (!exactArrayMatch(evidence?.selected_scenario_ids, expectedIds)) {
    errors.push(`selected_scenario_ids must exactly equal ${expectedIds.join(",")}`);
  }
  if (!exactArrayMatch(scenarioEntryIds, expectedIds)) {
    errors.push(`scenario entry IDs must exactly equal ${expectedIds.join(",")}`);
  }
  if (new Set(scenarioEntryIds).size !== scenarioEntryIds.length) {
    errors.push("scenario entry IDs must be unique");
  }
  const expectedDigest = buildScenarioDigest(selectedScenarios);
  if (evidence?.scenario_digest !== expectedDigest) {
    errors.push(`scenario_digest must be ${expectedDigest}`);
  }

  return errors;
}

function sanitizeJudge(rawJudge) {
  if (!rawJudge || typeof rawJudge !== "object") return null;
  if (typeof rawJudge.passed !== "boolean") return null;
  const summary = typeof rawJudge.summary === "string" ? rawJudge.summary.trim() : "";
  if (!summary) return null;
  return {
    passed: rawJudge.passed,
    score: typeof rawJudge.score === "number" ? rawJudge.score : null,
    summary,
    satisfied: sanitizeStringList(rawJudge.satisfied),
    missed: sanitizeStringList(rawJudge.missed),
    warnings: sanitizeStringList(rawJudge.warnings),
  };
}

function buildScenarioEntries(selectedScenarios, evidence) {
  const evidenceEntries = Array.isArray(evidence?.scenarios) ? evidence.scenarios : [];
  const evidenceById = new Map(evidenceEntries.map((entry) => [entry.id, entry]));

  return selectedScenarios.map((scenario) => {
    const evidenceEntry = evidenceById.get(scenario.id) || {};
    const response = typeof evidenceEntry.response === "string" ? evidenceEntry.response.trim() : "";
    const judge = sanitizeJudge(evidenceEntry.judge);
    const notes = sanitizeStringList(evidenceEntry.notes);
    let status = "pending";
    if (response && judge) status = "completed";
    else if (response) status = "partial";

    return {
      id: scenario.id,
      skill: scenario.skill,
      skill_path: scenario.skill_path,
      prompt: scenario.prompt,
      expected_output: scenario.expected_output,
      expectations: scenario.expectations,
      status,
      response,
      response_snippet: buildOutputSnippet(response),
      judge,
      notes,
    };
  });
}

function buildScenarioSummary(entries) {
  const count = entries.length;
  const completedEntries = entries.filter((entry) => entry.status === "completed");
  const passed = completedEntries.filter((entry) => entry.judge?.passed).length;
  const failed = completedEntries.filter((entry) => entry.judge && !entry.judge.passed).length;
  const partial = entries.filter((entry) => entry.status === "partial").length;
  const pending = entries.filter((entry) => entry.status === "pending").length;
  const completed = completedEntries.length;
  const incomplete = count - completed;
  return {
    count,
    completed,
    passed,
    failed,
    partial,
    pending,
    incomplete,
    pass_rate: completed > 0 ? Number((passed / completed).toFixed(4)) : null,
  };
}

function buildCoverage(selectedScenarios, evidence) {
  const selectedIds = new Set(selectedScenarios.map((scenario) => scenario.id));
  const evidenceIds = new Set(Array.isArray(evidence?.scenarios) ? evidence.scenarios.map((entry) => entry.id) : []);
  return {
    missing: [...selectedIds].filter((id) => !evidenceIds.has(id)),
    extra: [...evidenceIds].filter((id) => !selectedIds.has(id)),
  };
}

function buildBenchmarkMarkdown(benchmark) {
  const summary = benchmark.run_summary || {};
  const lines = [
    `# Pulse Benchmark ${benchmark.iteration}`,
    "",
    `Generated: ${benchmark.created_at}`,
    `Scenario source: ${benchmark.scenario_source}`,
    `Evidence: ${benchmark.evidence_path || "(none)"}`,
    `Runner mode: ${benchmark.runner?.mode || "unknown"}`,
    `Model ID: ${benchmark.runner?.model_id || "unknown"}`,
    `Model version: ${benchmark.runner?.model_version || "unknown"}`,
    `Reasoning effort: ${benchmark.runner?.reasoning_effort || "unknown"}`,
    `Runtime: ${benchmark.runner?.runtime || "unknown"}`,
    `Selected scenario IDs: ${benchmark.selected_scenario_ids.join(", ") || "(all)"}`,
    "",
    "## Summary",
    "",
    "| Count | Completed | Passed | Failed | Partial | Pending | Pass rate |",
    "|---:|---:|---:|---:|---:|---:|---:|",
    `| ${summary.count ?? 0} | ${summary.completed ?? 0} | ${summary.passed ?? 0} | ${summary.failed ?? 0} | ${summary.partial ?? 0} | ${summary.pending ?? 0} | ${summary.pass_rate ?? "n/a"} |`,
    "",
    "## Scenario Results",
    "",
  ];

  for (const scenario of benchmark.scenarios || []) {
    const marker = scenario.status === "completed"
      ? scenario.judge?.passed ? "PASS" : "FAIL"
      : scenario.status === "partial"
        ? "PARTIAL"
        : "PENDING";
    lines.push(`- [${marker}] #${scenario.id} ${scenario.skill} — ${scenario.judge?.summary || scenario.status}`);
    if (scenario.judge?.missed?.length) {
      lines.push(`  - Missed: ${scenario.judge.missed.join("; ")}`);
    }
    if (scenario.judge?.warnings?.length) {
      lines.push(`  - Warnings: ${scenario.judge.warnings.join("; ")}`);
    }
    if (scenario.notes?.length) {
      lines.push(`  - Notes: ${scenario.notes.join("; ")}`);
    }
  }

  lines.push("", "## Notes", "");
  for (const note of benchmark.notes || []) {
    lines.push(`- ${note}`);
  }

  return `${lines.join("\n")}\n`;
}

function buildBenchmarkHtml(benchmark) {
  const summary = benchmark.run_summary || {};
  const scenarioRows = (benchmark.scenarios || [])
    .map((scenario) => {
      const status = scenario.status === "completed"
        ? scenario.judge?.passed ? "PASS" : "FAIL"
        : scenario.status.toUpperCase();
      return `<tr><td>#${scenario.id}</td><td>${escapeHtml(scenario.skill)}</td><td>${escapeHtml(status)}</td><td>${escapeHtml(scenario.judge?.summary || scenario.status)}</td></tr>`;
    })
    .join("");
  const notes = (benchmark.notes || []).map((note) => `<li>${escapeHtml(note)}</li>`).join("");

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Pulse Eval Review</title>
  <style>
    body { font-family: ui-sans-serif, system-ui, sans-serif; margin: 2rem; }
    table { border-collapse: collapse; width: 100%; margin-bottom: 1.5rem; }
    th, td { border: 1px solid #d4d4d8; padding: 0.5rem; text-align: left; vertical-align: top; }
    th { background: #f4f4f5; }
    code { background: #f4f4f5; padding: 0.1rem 0.3rem; }
  </style>
</head>
<body>
  <h1>Pulse Eval Review</h1>
  <p><strong>Iteration:</strong> ${escapeHtml(benchmark.iteration)}</p>
  <p><strong>Generated:</strong> ${escapeHtml(benchmark.created_at)}</p>
  <p><strong>Scenario source:</strong> <code>${escapeHtml(benchmark.scenario_source)}</code></p>
  <p><strong>Evidence:</strong> <code>${escapeHtml(benchmark.evidence_path || "(none)")}</code></p>
  <p><strong>Runner mode:</strong> ${escapeHtml(benchmark.runner?.mode || "unknown")}</p>
  <p><strong>Model ID:</strong> <code>${escapeHtml(benchmark.runner?.model_id || "unknown")}</code></p>
  <p><strong>Model version:</strong> ${escapeHtml(benchmark.runner?.model_version || "unknown")}</p>
  <p><strong>Reasoning effort:</strong> ${escapeHtml(benchmark.runner?.reasoning_effort || "unknown")}</p>
  <p><strong>Runtime:</strong> ${escapeHtml(benchmark.runner?.runtime || "unknown")}</p>
  <h2>Summary</h2>
  <table>
    <thead>
      <tr><th>Count</th><th>Completed</th><th>Passed</th><th>Failed</th><th>Partial</th><th>Pending</th><th>Pass rate</th></tr>
    </thead>
    <tbody>
      <tr>
        <td>${summary.count ?? 0}</td>
        <td>${summary.completed ?? 0}</td>
        <td>${summary.passed ?? 0}</td>
        <td>${summary.failed ?? 0}</td>
        <td>${summary.partial ?? 0}</td>
        <td>${summary.pending ?? 0}</td>
        <td>${summary.pass_rate ?? "n/a"}</td>
      </tr>
    </tbody>
  </table>
  <h2>Scenario Results</h2>
  <table>
    <thead>
      <tr><th>Scenario</th><th>Skill</th><th>Status</th><th>Summary</th></tr>
    </thead>
    <tbody>${scenarioRows}</tbody>
  </table>
  <h2>Notes</h2>
  <ul>${notes}</ul>
</body>
</html>
`;
}

function escapeHtml(text) {
  return String(text)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function prepareBenchmark(results, args, config, sourcePath, selectedScenarios, iterationName, iterationPath) {
  const evidencePath = buildEvidencePath(args, iterationPath);
  const packetPath = path.join(iterationPath, DEFAULT_PACKET_FILE);
  fs.mkdirSync(iterationPath, { recursive: true });

  const packet = buildPacketMarkdown({ iterationName, evidencePath, selectedScenarios });
  fs.writeFileSync(packetPath, packet, "utf8");
  addResult(results, "benchmark", "artifact:benchmark-packet", "PASS", relativeToRepo(packetPath));

  if (!exists(evidencePath)) {
    const template = buildEvidenceTemplate({
      configPath: args.config,
      sourcePath,
      iterationName,
      selectedScenarios,
    });
    writeJson(evidencePath, template);
    addResult(results, "benchmark", "artifact:benchmark-evidence-template", "PASS", relativeToRepo(evidencePath));
  } else {
    addResult(results, "benchmark", "artifact:benchmark-evidence-template", "WARN", `${relativeToRepo(evidencePath)} already exists; left unchanged`);
  }

  addResult(
    results,
    "benchmark",
    "benchmark-ready",
    "WARN",
    `Run scenarios in chat, fill ${relativeToRepo(evidencePath)}, then rerun with --evidence ${relativeToRepo(evidencePath)}`,
  );

  return {
    mode: "prepared",
    iterationName,
    iterationPath,
    scenarioSourcePath: sourcePath,
    packetPath,
    evidencePath,
    benchmarkJsonPath: null,
  };
}

function finalizeBenchmark(results, args, config, sourcePath, selectedScenarios, iterationName, iterationPath, evidencePath) {
  if (!exists(evidencePath)) {
    throw new Error(`Evidence file not found: ${relativeToRepo(evidencePath)}. Run benchmark without --evidence first to generate a template.`);
  }

  const evidence = readJson(evidencePath);
  const packetPath = path.join(iterationPath, DEFAULT_PACKET_FILE);
  const bindingErrors = evidenceBindingErrors({
    evidence,
    configPath: args.config,
    sourcePath,
    iterationName,
    selectedScenarios,
  });
  addResult(
    results,
    "benchmark",
    "evidence-binding",
    bindingErrors.length === 0 ? "PASS" : "FAIL",
    bindingErrors.length === 0 ? evidence.scenario_digest : bindingErrors.join("; "),
  );
  if (bindingErrors.length > 0) {
    return {
      mode: "rejected",
      iterationName,
      iterationPath,
      scenarioSourcePath: sourcePath,
      evidencePath,
      packetPath: exists(packetPath) ? packetPath : null,
      benchmarkJsonPath: null,
    };
  }

  const runner = sanitizeRunnerProfile(evidence.runner);
  const missingProfileFields = missingRunnerProfileFields(runner);

  addResult(
    results,
    "benchmark",
    "evidence-profile",
    missingProfileFields.length === 0 ? "PASS" : "FAIL",
    missingProfileFields.length === 0
      ? `${runner.model_id} ${runner.model_version} / ${runner.reasoning_effort} / ${runner.runtime}`
      : `missing required runner fields: ${missingProfileFields.join(", ")}`,
  );

  if (missingProfileFields.length > 0) {
    return {
      mode: "rejected",
      iterationName,
      iterationPath,
      scenarioSourcePath: sourcePath,
      evidencePath,
      packetPath: exists(path.join(iterationPath, DEFAULT_PACKET_FILE))
        ? path.join(iterationPath, DEFAULT_PACKET_FILE)
        : null,
      benchmarkJsonPath: null,
    };
  }

  const coverage = buildCoverage(selectedScenarios, evidence);
  const scenarioEntries = buildScenarioEntries(selectedScenarios, evidence);
  const summary = buildScenarioSummary(scenarioEntries);

  addResult(results, "benchmark", "artifact:benchmark-evidence", "PASS", relativeToRepo(evidencePath));
  addResult(
    results,
    "benchmark",
    "evidence-selected-ids",
    coverage.missing.length === 0 && summary.incomplete === 0 ? "PASS" : "FAIL",
    coverage.missing.length === 0 && summary.incomplete === 0
      ? "all selected scenarios have complete evidence entries"
      : `missing entries: ${coverage.missing.join(",") || "none"}; incomplete scenarios: ${summary.incomplete}`,
  );
  if (coverage.extra.length > 0) {
    addResult(results, "benchmark", "evidence-extra-ids", "WARN", `extra evidence entries: ${coverage.extra.join(",")}`);
  }

  if (coverage.missing.length > 0 || summary.incomplete > 0) {
    addResult(
      results,
      "benchmark",
      "benchmark-summary",
      "FAIL",
      `completed=${summary.completed}, passed=${summary.passed}, failed=${summary.failed}, incomplete=${summary.incomplete}`,
    );
    return {
      mode: "rejected",
      iterationName,
      iterationPath,
      scenarioSourcePath: sourcePath,
      evidencePath,
      packetPath: exists(packetPath) ? packetPath : null,
      benchmarkJsonPath: null,
    };
  }

  const benchmark = {
    kind: "pulse-benchmark-result",
    schemaVersion: 3,
    created_at: new Date().toISOString(),
    iteration: iterationName,
    config_path: relativeToRepo(args.config),
    scenario_source: relativeToRepo(sourcePath),
    evidence_path: relativeToRepo(evidencePath),
    selected_scenario_ids: selectedScenarios.map((scenario) => scenario.id),
    runner,
    scenarios: scenarioEntries,
    verifiers: runVerifierCommands(config.shared?.verifiers || [], repoRoot),
    run_summary: summary,
    notes: [
      ...(config.notes || []),
      ...sanitizeStringList(evidence.notes),
      CHAT_RUN_NOTE,
      DISCRIMINATION_NOTE,
    ],
  };

  for (const verifier of benchmark.verifiers) {
    addResult(results, "benchmark", `verifier:${verifier.command}`, verifier.status, verifier.stderr || verifier.stdout || "");
  }

  const benchmarkJsonPath = path.join(iterationPath, "benchmark.json");
  const benchmarkMdPath = path.join(iterationPath, "benchmark.md");
  const reviewHtmlPath = path.join(args.workspace, "pulse-eval-review.html");
  writeJson(benchmarkJsonPath, benchmark);
  fs.writeFileSync(benchmarkMdPath, buildBenchmarkMarkdown(benchmark), "utf8");
  fs.writeFileSync(reviewHtmlPath, buildBenchmarkHtml(benchmark), "utf8");

  if (exists(packetPath)) {
    addResult(results, "benchmark", "artifact:benchmark-packet", "PASS", relativeToRepo(packetPath));
  }
  addResult(results, "benchmark", "artifact:benchmark-json", "PASS", relativeToRepo(benchmarkJsonPath));
  addResult(results, "benchmark", "artifact:benchmark-md", "PASS", relativeToRepo(benchmarkMdPath));
  addResult(results, "benchmark", "artifact:review-html", "PASS", relativeToRepo(reviewHtmlPath));
  addResult(
    results,
    "benchmark",
    "benchmark-summary",
    summary.failed > 0 ? "FAIL" : "PASS",
    `completed=${summary.completed}, passed=${summary.passed}, failed=${summary.failed}, incomplete=${summary.incomplete}`,
  );

  return {
    mode: "finalized",
    iterationName,
    iterationPath,
    scenarioSourcePath: sourcePath,
    evidencePath,
    packetPath: exists(packetPath) ? packetPath : null,
    benchmarkJsonPath,
  };
}

function captureV4Conditions(scenarios, args, config) {
  const explicit = args.condition ? readJson(args.condition) : null;
  return Object.fromEntries(scenarios.map(scenario => {
    const def = caseDefinition(scenario);
    if (explicit) {
      const condition = conditionFromFiles(explicit.owner, explicit.files);
      if (explicit.digest !== condition.digest) throw new Error("Explicit condition digest mismatch.");
      const expectedOwner = scenario.skill_path.endsWith("SKILL.md") ? scenario.skill_path : `${scenario.skill_path}/SKILL.md`;
      if (condition.owner !== expectedOwner) throw new Error("Condition owner differs from selected skill.");
      return [def.case_id, condition];
    }
    const owner = scenario.skill_path.endsWith("SKILL.md") ? scenario.skill_path : `${scenario.skill_path}/SKILL.md`;
    const paths = [owner, ...(config.skillReferences?.[scenario.skill] || []), ...args.references];
    const files = [...new Set(paths)].map(file => {
      const target = path.resolve(repoRoot, file);
      const relative = path.relative(repoRoot, target);
      if (!file || path.isAbsolute(file) || relative.startsWith("..") || path.isAbsolute(relative)) throw new Error("Condition path escapes repository.");
      const stat = fs.lstatSync(target);
      if (!stat.isFile() || stat.isSymbolicLink() || !fs.realpathSync(target).startsWith(`${fs.realpathSync(repoRoot)}${path.sep}`)) throw new Error("Condition must be a regular in-repository file.");
      const content = fs.readFileSync(target, "utf8");
      return { path:file, content };
    });
    return [def.case_id, conditionFromFiles(owner, files)];
  }));
}

function runV4Benchmark(results, args, config, sourcePath, scenarios, iterationName, iterationPath) {
  const manifestPath = path.join(iterationPath, "preparation.json");
  const evidencePath = args.evidence || path.join(iterationPath, DEFAULT_EVIDENCE_FILE);
  const packetsPath = path.join(iterationPath, "runner-packet.json");
  const conditions = captureV4Conditions(scenarios,args,config);
  const paths = { configPath:relativeToRepo(args.config), sourcePath:relativeToRepo(sourcePath) };
  if (!args.evidence) {
    if (fs.existsSync(manifestPath) || fs.existsSync(evidencePath)) throw new Error("Preparation already exists; use a new iteration. Frozen evidence is never overwritten.");
    const prepared = prepareEvidence({ iteration:iterationName, ...paths, scenarios, conditions, executionKind:args.executionKind });
    fs.mkdirSync(iterationPath,{recursive:true});
    writeJson(manifestPath,prepared.manifest);
    writeJson(evidencePath,prepared.evidence);
    writeJson(packetsPath,{kind:"pulse-runner-packets",schemaVersion:4,cases:prepared.packets});
    writeJson(path.join(iterationPath,"judge-packet.json"),prepared.judge);
    const runnerMarkdown = prepared.packets.map(packet => `## ${packet.case_id}\n\n${packet.request}`).join("\n");
    fs.writeFileSync(path.join(iterationPath,"runner-packet.md"),runnerMarkdown);
    fs.writeFileSync(path.join(iterationPath,DEFAULT_PACKET_FILE),runnerMarkdown);
    addResult(results,"benchmark","v4-prepared","PASS","Runner guidance inline; judge packet separate; no model invoked.");
    addResult(results,"benchmark","benchmark-ready","WARN","Capture each exact submitted request and native response separately, then fill criterion results outside the replay context.");
    return {mode:"prepared",schemaVersion:4,iterationName,iterationPath,scenarioSourcePath:sourcePath,packetPath:packetsPath,evidencePath,manifestPath,benchmarkJsonPath:null};
  }
  const manifest = readJson(manifestPath);
  const evidence = readJson(evidencePath);
  const definitions = scenarios.map(caseDefinition);
  const packets = definitions.map(def => runnerPacket(def,conditions[def.case_id]));
  const checked = validateEvidence(manifest,evidence,definitions,packets);
  const bindingPathsCurrent = manifest.iteration===iterationName && manifest.config_path===paths.configPath && manifest.scenario_source===paths.sourcePath;
  if (!bindingPathsCurrent) checked.errors.push("Requested preparation paths or iteration differ.");
  checked.ok = checked.ok && bindingPathsCurrent;
  const base = {schemaVersion:4,iterationName,iterationPath,scenarioSourcePath:sourcePath,packetPath:packetsPath,evidencePath,manifestPath};
  if (!checked.ok) {
    addResult(results,"benchmark","v4-evidence","FAIL",checked.errors.join("; "));
    return {...base,mode:"rejected",benchmarkJsonPath:null};
  }
  const benchmarkPath = path.join(iterationPath,"benchmark.json");
  if (fs.existsSync(benchmarkPath)) throw new Error("Final result already exists; it is never replaced by another attempt.");
  const failed = checked.scenarios.filter(item=>item.content_verdict!=='pass').length;
  const runSummary = {count:checked.scenarios.length,completed:checked.scenarios.length,incomplete:0,
    passed:checked.scenarios.length-failed,failed,qualified_passed:checked.qualification.status==='complete' ? checked.scenarios.length-failed : 0,
    diagnostic:checked.qualification.status==='diagnostic' ? checked.scenarios.length : 0,
    pass_rate:checked.qualification.status==='complete' ? (checked.scenarios.length-failed)/checked.scenarios.length : null};
  const benchmark = {kind:"pulse-benchmark-result",schemaVersion:4,iteration:iterationName,
    scenario_digest:manifest.scenario_digest,preparation_digest:manifest.preparation_digest,
    evidence_path:relativeToRepo(evidencePath),runner:evidence.runner,provenance:evidence.provenance,
    execution_kind:evidence.execution_kind,qualification:checked.qualification,
    promotion_eligible:checked.promotion_eligible,scenarios:checked.scenarios,run_summary:runSummary,
    verifiers:runVerifierCommands(config.shared?.verifiers||[],repoRoot),
    notes:["Content verdict is distinct from proof qualification; no authentication of externally supplied transcripts is claimed."]};
  for (const verifier of benchmark.verifiers) addResult(results,"benchmark",`verifier:${verifier.command}`,verifier.status,verifier.stderr||verifier.stdout);
  if (benchmark.verifiers.some(verifier=>verifier.status!=='PASS')) benchmark.promotion_eligible=false;
  writeJson(benchmarkPath,benchmark);
  const rows = benchmark.scenarios.map(item=>`${item.case_id}: ${item.content_verdict} / ${item.qualification_status}`);
  const report = [`# Pulse benchmark ${iterationName}`,"",`Proof qualification: ${checked.qualification.status}`,`Promotion eligible: ${benchmark.promotion_eligible}`,"",...rows].join("\n")+"\n";
  fs.writeFileSync(path.join(iterationPath,"benchmark.md"),report);
  fs.writeFileSync(path.join(args.workspace,"pulse-eval-review.html"),`<!doctype html><html lang="en"><meta charset="utf-8"><title>Pulse evidence review</title><h1>Pulse evidence review</h1><pre>${escapeHtml(report)}</pre></html>`);
  addResult(results,"benchmark","v4-content",failed ? "FAIL" : "PASS",`content passed=${runSummary.passed}, failed=${failed}`);
  addResult(results,"benchmark","proof-qualification",checked.qualification.status==='complete' ? "PASS" : "WARN",checked.qualification.reasons.join(", ")||"complete");
  return {...base,mode:"finalized",benchmarkJsonPath:benchmarkPath};
}

function runBenchmark(results, args) {
  const config = loadBenchmarkConfig(args.config);
  const { sourcePath, scenarios } = loadScenarioLibrary(config, args.workspace);
  const requestedIds = parseEvalIds(args.evalIds);
  const selectedScenarios = selectScenarios(scenarios, requestedIds, config.pilotScenarioIds);

  if (selectedScenarios.length === 0) {
    throw new Error("No scenarios selected for benchmark run.");
  }

  addResult(results, "benchmark", "benchmark-config", exists(args.config) ? "PASS" : "FAIL", relativeToRepo(args.config));
  addResult(results, "benchmark", "scenario-source", "PASS", relativeToRepo(sourcePath));
  addResult(results, "benchmark", "scenario-count", "PASS", `count=${selectedScenarios.length}`);
  addResult(results, "benchmark", "benchmark-mode", "PASS", "chat evidence workflow");
  if (args.runtime) {
    addResult(results, "benchmark", "deprecated-runtime-option", "WARN", `ignored in chat-run mode: ${args.runtime}`);
  }

  const iterationName = normalizeIterationName(args.iteration) || nextIterationName(args.workspace);
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(iterationName)) throw new Error("Iteration must be a single safe directory name.");
  const iterationPath = path.join(args.workspace, iterationName);
  if (!args.legacyAudit) return runV4Benchmark(results,args,config,sourcePath,selectedScenarios,iterationName,iterationPath);
  if (fs.existsSync(path.join(iterationPath,"benchmark.json")) || fs.existsSync(path.join(args.workspace,"pulse-eval-review.html"))) throw new Error("Legacy audit needs a fresh output workspace; historical results remain untouched.");
  addResult(results,"benchmark","legacy-audit","WARN","Historical v3 evidence only; no new promotion eligibility.");
  fs.mkdirSync(iterationPath, { recursive: true });

  if (!args.evidence) {
    return prepareBenchmark(results, args, config, sourcePath, selectedScenarios, iterationName, iterationPath);
  }

  const audited = finalizeBenchmark(results, args, config, sourcePath, selectedScenarios, iterationName, iterationPath, args.evidence);
  if (audited.benchmarkJsonPath) {
    const historical = readJson(audited.benchmarkJsonPath);
    historical.promotion_eligible = false;
    historical.audit_only = true;
    writeJson(audited.benchmarkJsonPath,historical);
    fs.appendFileSync(path.join(iterationPath,"benchmark.md"),"\nLegacy audit only: not eligible for a new promotion or certification.\n");
    fs.appendFileSync(path.join(args.workspace,"pulse-eval-review.html"),"<!-- Legacy audit only: no promotion or certification eligibility. -->");
  }
  return audited;
}

function findSkillCountClaims(raw) {
  const claims = [];
  const lines = raw.split(/\r?\n/);
  const claimPattern = /\b(\d{1,4})\b(?:\s+[A-Za-z][\w-]*){0,2}\s+skills?\b/gi;

  lines.forEach((line, index) => {
    let match;
    while ((match = claimPattern.exec(line)) !== null) {
      claims.push({
        count: Number(match[1]),
        line: index + 1,
        snippet: line.trim(),
      });
    }
  });

  return claims;
}

function findMissingMarkers(raw, markers) {
  return markers.filter(({ pattern }) => !pattern.test(raw)).map(({ label }) => label);
}

function runMemorySkillBoundaryChecks(results, skillsRoot) {
  const contracts = [
    {
      name: "dev-note",
      filePath: path.join(skillsRoot, "dev-note", "SKILL.md"),
      markers: [
        { label: "explicit user request boundary", pattern: /explicit user request/i },
        { label: "never auto-capture rule", pattern: /never auto-capture/i },
        { label: "current conversation scope", pattern: /current conversation/i },
      ],
    },
    {
      name: "dev-note-distil",
      filePath: path.join(skillsRoot, "dev-note-distil", "SKILL.md"),
      markers: [
        { label: "reader-facing scope", pattern: /reader-facing/i },
        { label: "runtime-memory exclusion", pattern: /not for runtime memory consolidation/i },
        { label: "compounding exclusion", pattern: /not for post-cycle compounding/i },
      ],
    },
    {
      name: "dream",
      filePath: path.join(skillsRoot, "dream", "SKILL.md"),
      markers: [
        { label: "machine-readable scope", pattern: /machine-readable/i },
        { label: "runtime artifact scope", pattern: /runtime artifacts/i },
        { label: "reader-facing exclusion", pattern: /not for reader-facing dev-note synthesis/i },
        { label: "compounding contrast", pattern: /does not replace compounding after completed Pulse work/i },
      ],
    },
    {
      name: "compounding",
      filePath: path.join(skillsRoot, "compounding", "SKILL.md"),
      markers: [
        { label: "post-cycle scope", pattern: /post-cycle/i },
        { label: "machine-readable scope", pattern: /machine-readable/i },
        { label: "completed Pulse work scope", pattern: /completed Pulse work/i },
        { label: "dream contrast", pattern: /Use `pulse:dream` for runtime-artifact consolidation outside that post-cycle moment\./i },
      ],
    },
  ];

  const issues = [];

  for (const contract of contracts) {
    if (!exists(contract.filePath)) {
      issues.push(`${contract.name} missing file`);
      continue;
    }

    const raw = fs.readFileSync(contract.filePath, "utf8");
    const missing = findMissingMarkers(raw, contract.markers);
    if (missing.length > 0) {
      issues.push(`${contract.name} missing ${missing.join(", ")}`);
    }
  }

  const usingPulsePath = path.join(skillsRoot, "using-pulse", "SKILL.md");
  if (!exists(usingPulsePath)) {
    issues.push("using-pulse missing file");
  } else {
    const usingPulseRaw = fs.readFileSync(usingPulsePath, "utf8");
    const routingMissing = findMissingMarkers(usingPulseRaw, [
      { label: "dev-note route", pattern: /Note this learning from this conversation/i },
      { label: "dev-note-distil route", pattern: /Distill accumulated dev notes for reading/i },
      { label: "dream route", pattern: /Consolidate runtime artifacts into machine memory/i },
      { label: "compounding route", pattern: /Capture post-cycle machine learnings/i },
    ]);
    if (routingMissing.length > 0) {
      issues.push(`using-pulse missing ${routingMissing.join(", ")}`);
    }
  }

  addResult(
    results,
    "static",
    "memory-skill-boundary-contract",
    issues.length === 0 ? "PASS" : "WARN",
    issues.length === 0 ? "memory skill boundaries are explicit" : issues.join("; "),
  );
}

function runStaticChecks(results) {
  const pluginManifestPath = path.join(repoRoot, ".codex-plugin/plugin.json");
  const claudePluginPath = path.join(repoRoot, ".claude-plugin/plugin.json");
  const claudeMarketplacePath = path.join(repoRoot, ".claude-plugin/marketplace.json");
  const marketplacePath = path.join(repoRoot, ".agents/plugins/marketplace.json");
  const benchmarkConfigPath = path.join(repoRoot, ".plugin-eval/benchmark.json");
  const scenarioLibraryPath = path.join(repoRoot, "pulse-eval-workspace/evals.json");
  const mcpPath = path.join(repoRoot, ".mcp.json");
  const skillsRoot = path.join(repoRoot, "skills");
  const executingSkillPath = path.join(skillsRoot, "executing", "SKILL.md");
  const planningSkillPath = path.join(skillsRoot, "planning", "SKILL.md");
  const validatingSkillPath = path.join(skillsRoot, "validating", "SKILL.md");
  const workflowGraphPath = path.join(repoRoot, "workflow", "graph.json");
  const workflowAdaptersPath = path.join(repoRoot, "workflow", "skill-adapters.json");
  const workflowRuntimePath = path.join(skillsRoot, "using-pulse", "scripts", "pulse_icm.mjs");

  const required = [
    pluginManifestPath,
    claudePluginPath,
    claudeMarketplacePath,
    marketplacePath,
    mcpPath,
    skillsRoot,
    workflowGraphPath,
    workflowAdaptersPath,
    workflowRuntimePath,
  ];
  for (const targetPath of required) {
    addResult(results, "static", `exists:${relativeToRepo(targetPath)}`, exists(targetPath) ? "PASS" : "FAIL", "");
  }

  if (!required.every(exists)) return;

  const manifest = readJson(pluginManifestPath);
  const claudePlugin = readJson(claudePluginPath);
  const claudeMarketplace = readJson(claudeMarketplacePath);
  const marketplace = readJson(marketplacePath);
  const mcp = readJson(mcpPath);

  const manifestVersion = manifest?.plugins?.[0]?.version ?? manifest?.version;
  // Only the local Codex cache may append its documented timestamp build tag.
  const codexReleaseVersion = typeof manifestVersion === "string"
    ? manifestVersion.match(/^(\d+\.\d+\.\d+)(?:\+codex\.\d{14})?$/u)?.[1]
    : undefined;
  const pluginVersion = claudePlugin?.version;
  const marketplaceVersion = marketplace?.plugins?.find((entry) => entry.name === "pulse")?.version;
  const claudeMarketplaceVersion = claudeMarketplace?.plugins?.find((entry) => entry.name === "pulse")?.version;
  const claudeMarketplaceSource = claudeMarketplace?.plugins?.find((entry) => entry.name === "pulse")?.source;
  const marketplaceSourceRaw = marketplace?.plugins?.find((entry) => entry.name === "pulse")?.source;
  const marketplaceSource =
    typeof marketplaceSourceRaw === "string"
      ? marketplaceSourceRaw
      : marketplaceSourceRaw?.source === "url"
        ? marketplaceSourceRaw?.url
        : marketplaceSourceRaw?.path;

  addResult(
    results,
    "static",
    "version-sync",
    manifestVersion &&
      pluginVersion &&
      marketplaceVersion &&
      claudeMarketplaceVersion &&
      codexReleaseVersion === pluginVersion &&
      pluginVersion === marketplaceVersion &&
      marketplaceVersion === claudeMarketplaceVersion
      ? "PASS"
      : "WARN",
    `codex_plugin=${manifestVersion ?? "n/a"}, claude_plugin=${pluginVersion ?? "n/a"}, codex_marketplace=${marketplaceVersion ?? "n/a"}, claude_marketplace=${claudeMarketplaceVersion ?? "n/a"}`,
  );
  addResult(
    results,
    "static",
    "automatic-hook-absence",
    !Object.hasOwn(manifest, "hooks")
      && !Object.hasOwn(claudePlugin, "hooks")
      && !exists(path.join(repoRoot, "hooks"))
      ? "PASS"
      : "FAIL",
    "Pulse 4 must not package lifecycle orchestration hooks",
  );
  addResult(
    results,
    "static",
    "claude-plugin-path-contract",
    claudePlugin?.skills === "./skills/" && claudePlugin?.mcpServers === "./.mcp.json" ? "PASS" : "WARN",
    `skills=${claudePlugin?.skills ?? "n/a"}, mcpServers=${claudePlugin?.mcpServers ?? "n/a"}`,
  );
  const executingSkill = exists(executingSkillPath) ? fs.readFileSync(executingSkillPath, "utf8") : "";
  addResult(
    results,
    "static",
    "investigate-debug-owner-contract",
    /`pulse:systematic-debug-fix` is the authoritative owner/u.test(executingSkill)
      ? "PASS"
      : "FAIL",
    "investigate mode must route reproduction and tracing through pulse:systematic-debug-fix",
  );
  const planningSkill = exists(planningSkillPath) ? fs.readFileSync(planningSkillPath, "utf8") : "";
  const validatingSkill = exists(validatingSkillPath) ? fs.readFileSync(validatingSkillPath, "utf8") : "";
  const governanceRoutingPasses = [
    /Classify governance fitness as exactly `strong`, `light`, or `none`/u.test(planningSkill),
    /use `pulse:governed-feature` when the persisted value is `strong`/u.test(planningSkill),
    /absence is never interpreted as `light` or `none`/u.test(validatingSkill),
    /persisted governance fitness is `strong`/u.test(validatingSkill),
  ].every(Boolean);
  addResult(
    results,
    "static",
    "mandatory-governance-fitness-contract",
    governanceRoutingPasses ? "PASS" : "FAIL",
    "planning must persist strong|light|none before shape creation and validating must enforce that decision",
  );
  addResult(
    results,
    "static",
    "claude-marketplace-source",
    claudeMarketplaceSource === "." || claudeMarketplaceSource === "./" ? "PASS" : "WARN",
    `source=${claudeMarketplaceSource ?? "n/a"}`,
  );
  addResult(
    results,
    "static",
    "codex-marketplace-source",
    marketplaceSource === "https://github.com/jeremienunez/pulse.git"
      && marketplaceSourceRaw?.ref === "tuned/main" ? "PASS" : "WARN",
    `source=${marketplaceSource ?? "n/a"}, ref=${marketplaceSourceRaw?.ref ?? "n/a"}`,
  );

  const skillDirs = fs.readdirSync(skillsRoot, { withFileTypes: true }).filter((entry) => entry.isDirectory());
  const missingSkillFiles = skillDirs
    .map((entry) => path.join(skillsRoot, entry.name, "SKILL.md"))
    .filter((targetPath) => !exists(targetPath));

  const actualSkillCount = skillDirs.length;
  const skillCountClaimFiles = [
    path.join(repoRoot, "README.md"),
    path.join(repoRoot, "CONTRIBUTING.md"),
    path.join(repoRoot, "CLAUDE.md"),
    marketplacePath,
  ];
  const driftDetails = [];

  for (const filePath of skillCountClaimFiles) {
    if (!exists(filePath)) {
      driftDetails.push(`${relativeToRepo(filePath)} (missing)`);
      continue;
    }

    const raw = fs.readFileSync(filePath, "utf8");
    const claims = findSkillCountClaims(raw);
    for (const claim of claims) {
      if (claim.count !== actualSkillCount) {
        driftDetails.push(`${relativeToRepo(filePath)}:${claim.line} claims ${claim.count} skills (actual=${actualSkillCount})`);
      }
    }
  }

  addResult(results, "static", "skills-discovered", skillDirs.length > 0 ? "PASS" : "FAIL", `count=${skillDirs.length}`);
  addResult(
    results,
    "static",
    "skill-count-claims-sync",
    driftDetails.length === 0 ? "PASS" : "WARN",
    driftDetails.length === 0 ? `all checked claims match actual=${actualSkillCount}` : driftDetails.join("; "),
  );
  addResult(
    results,
    "static",
    "skill-markdown-contract",
    missingSkillFiles.length === 0 ? "PASS" : "FAIL",
    missingSkillFiles.length === 0 ? "all skill dirs include SKILL.md" : missingSkillFiles.map(relativeToRepo).join(", "),
  );
  runMemorySkillBoundaryChecks(results, skillsRoot);

  const scenarioIssues = [];
  if (!exists(scenarioLibraryPath)) {
    scenarioIssues.push(`${relativeToRepo(scenarioLibraryPath)} is missing`);
  } else if (!exists(benchmarkConfigPath)) {
    scenarioIssues.push(`${relativeToRepo(benchmarkConfigPath)} is missing`);
  } else {
    const scenarioLibrary = readJson(scenarioLibraryPath);
    const benchmarkConfig = readJson(benchmarkConfigPath);
    const scenarios = Array.isArray(scenarioLibrary?.evals) ? scenarioLibrary.evals : [];
    const ids = new Set();

    if (JSON.stringify(benchmarkConfig?.requiredRunnerProfileFields) !== JSON.stringify(REQUIRED_RUNNER_PROFILE_FIELDS)) {
      scenarioIssues.push(`required runner profile fields must be: ${REQUIRED_RUNNER_PROFILE_FIELDS.join(", ")}`);
    }

    for (const scenario of scenarios) {
      if (!Number.isInteger(scenario?.id) || ids.has(scenario.id)) {
        scenarioIssues.push(`invalid or duplicate scenario id: ${scenario?.id ?? "n/a"}`);
      } else {
        ids.add(scenario.id);
      }

      const skillPath = typeof scenario?.skill_path === "string" ? scenario.skill_path : "";
      if (!skillPath || !exists(path.join(repoRoot, skillPath, "SKILL.md"))) {
        scenarioIssues.push(`scenario ${scenario?.id ?? "n/a"} has missing skill path: ${skillPath || "n/a"}`);
      }
    }

    for (const pilotId of benchmarkConfig?.pilotScenarioIds || []) {
      if (!ids.has(pilotId)) scenarioIssues.push(`pilot scenario id is missing: ${pilotId}`);
    }
  }

  addResult(
    results,
    "static",
    "scenario-library-contract",
    scenarioIssues.length === 0 ? "PASS" : "FAIL",
    scenarioIssues.length === 0 ? "all scenario skill paths and pilot ids are valid" : scenarioIssues.join("; "),
  );

  const catalogCheck = runCommand(process.execPath, [path.join(repoRoot, "scripts/build-skill-catalog.mjs"), "--check"]);
  addResult(
    results,
    "static",
    "skill-catalog-generated",
    catalogCheck.status === 0 ? "PASS" : "FAIL",
    [catalogCheck.stdout, catalogCheck.stderr].filter(Boolean).join("\n").trim() || "(no output)",
  );

  const workflowSkillsCheck = runCommand(
    process.execPath,
    [path.join(repoRoot, "scripts/build-workflow-skills.mjs"), "--check"],
  );
  addResult(
    results,
    "static",
    "workflow-skills-generated",
    workflowSkillsCheck.status === 0 ? "PASS" : "FAIL",
    [workflowSkillsCheck.stdout, workflowSkillsCheck.stderr].filter(Boolean).join("\n").trim() || "(no output)",
  );

  const mcpServers = Object.keys(mcp?.mcpServers || {});
  addResult(
    results,
    "static",
    "mcp-servers-parse",
    ["gitnexus", "MCP_DOCKER", "morph-mcp"].every((name) => mcpServers.includes(name)) ? "PASS" : "FAIL",
    `servers=${mcpServers.join(", ") || "none"}`,
  );
}

function runRuntimeChecks(results, runCmd) {
  for (const command of ["git", "br", "bv"]) {
    addResult(results, "runtime", `command:${command}`, commandOnPath(command) ? "PASS" : "WARN", "");
  }

  if (runCmd) {
    const out = runCommand("sh", ["-c", runCmd]);
    const status = out.status === 0 ? "PASS" : "FAIL";
    const detail = [out.stdout, out.stderr].filter(Boolean).join("\n").trim().slice(0, 2000);
    addResult(results, "runtime", "scenario-run-command", status, detail || "(no output)");
  }
}

async function runScoutChecks(results) {
  const status = await readPulseStatus(repoRoot);
  addResult(
    results,
    "scout",
    "onboarding-status",
    status.onboarding.status === "complete" ? "PASS" : "WARN",
    `status=${status.onboarding.status || "missing"}, plugin_version=${status.onboarding.plugin_version || "n/a"}`,
  );
  addResult(
    results,
    "scout",
    "tooling-status",
    status.tooling_status.status && status.tooling_status.status.toLowerCase() !== "fail" ? "PASS" : "WARN",
    `status=${status.tooling_status.status || "missing"}, recommended_mode=${status.tooling_status.recommended_mode || "n/a"}`,
  );
  addResult(
    results,
    "scout",
    "gitnexus-readiness",
    status.gitnexus_readiness.configured ? "PASS" : "WARN",
    status.gitnexus_readiness.recommended_action || "n/a",
  );
  return status;
}

function runScenarioChecks(results, workspacePath, iterationArg, evalIdsArg, scenarioSourcePath = null) {
  const evalsPath = scenarioSourcePath || path.join(workspacePath, "evals.json");
  const reviewPath = path.join(workspacePath, "pulse-eval-review.html");

  addResult(results, "scenarios", "evals-json", exists(evalsPath) ? "PASS" : "FAIL", relativeToRepo(evalsPath));
  addResult(results, "scenarios", "review-ui", exists(reviewPath) ? "PASS" : "WARN", relativeToRepo(reviewPath));
  if (!exists(evalsPath)) return;

  const evals = readJson(evalsPath);
  const evalIds = new Set((evals.evals || []).map((entry) => entry.id));
  addResult(results, "scenarios", "scenario-count", evalIds.size > 0 ? "PASS" : "FAIL", `count=${evalIds.size}`);

  const requestedIds = parseEvalIds(evalIdsArg);
  if (requestedIds && requestedIds.length > 0) {
    const missing = requestedIds.filter((id) => !evalIds.has(id));
    addResult(
      results,
      "scenarios",
      "requested-eval-ids",
      missing.length === 0 ? "PASS" : "FAIL",
      missing.length === 0 ? `all present: ${requestedIds.join(",")}` : `missing: ${missing.join(",")}`,
    );
  }

  const pickedIteration = normalizeIterationName(iterationArg) || findLatestIteration(workspacePath);
  if (!pickedIteration) {
    addResult(results, "scenarios", "iteration-detected", "WARN", "no iteration-* directories found");
    return;
  }

  const iterationPath = path.join(workspacePath, pickedIteration);
  const benchmarkJsonPath = path.join(iterationPath, "benchmark.json");
  const benchmarkMdPath = path.join(iterationPath, "benchmark.md");
  const benchmarkPacketPath = path.join(iterationPath, DEFAULT_PACKET_FILE);
  const benchmarkEvidencePath = path.join(iterationPath, DEFAULT_EVIDENCE_FILE);

  addResult(results, "scenarios", "iteration-detected", exists(iterationPath) ? "PASS" : "FAIL", pickedIteration);
  addResult(results, "scenarios", "benchmark-packet", exists(benchmarkPacketPath) ? "PASS" : "WARN", relativeToRepo(benchmarkPacketPath));
  addResult(results, "scenarios", "benchmark-evidence", exists(benchmarkEvidencePath) ? "PASS" : "WARN", relativeToRepo(benchmarkEvidencePath));
  addResult(results, "scenarios", "benchmark-json", exists(benchmarkJsonPath) ? "PASS" : "WARN", relativeToRepo(benchmarkJsonPath));
  addResult(results, "scenarios", "benchmark-md", exists(benchmarkMdPath) ? "PASS" : "WARN", relativeToRepo(benchmarkMdPath));

  if (!exists(benchmarkJsonPath)) return;

  const benchmark = readJson(benchmarkJsonPath);
  if (benchmark.schemaVersion===4) {
    addResult(results,"scenarios","v4-qualification",benchmark.qualification?.status==='complete' ? "PASS" : "WARN",benchmark.qualification?.status||"unavailable");
    addResult(results,"scenarios","v4-summary",benchmark.run_summary.failed ? "FAIL" : "PASS",`content cases=${benchmark.run_summary.count}; promotion eligible=${benchmark.promotion_eligible}`);
    return;
  }
  if (benchmark.runner?.mode) {
    addResult(results, "scenarios", "benchmark-runner-mode", benchmark.runner.mode === "chat" ? "PASS" : "WARN", benchmark.runner.mode);
  }
  const runner = sanitizeRunnerProfile(benchmark.runner);
  const missingProfileFields = missingRunnerProfileFields(runner);
  addResult(
    results,
    "scenarios",
    "benchmark-runner-profile",
    missingProfileFields.length === 0 ? "PASS" : "FAIL",
    missingProfileFields.length === 0
      ? `${runner.model_id} ${runner.model_version} / ${runner.reasoning_effort} / ${runner.runtime}`
      : `missing required runner fields: ${missingProfileFields.join(", ")}`,
  );
  if (benchmark.evidence_path) {
    addResult(results, "scenarios", "benchmark-evidence-path", "PASS", benchmark.evidence_path);
  }

  const runSummary = benchmark.run_summary || {};
  if (typeof runSummary.count === "number") {
    addResult(
      results,
      "scenarios",
      "benchmark-summary",
      (runSummary.failed ?? 0) > 0 || (runSummary.incomplete ?? 0) > 0 ? "FAIL" : "PASS",
      `pass_rate=${runSummary.pass_rate ?? "n/a"}, passed=${runSummary.passed ?? 0}, failed=${runSummary.failed ?? 0}, incomplete=${runSummary.incomplete ?? 0}`,
    );
  } else if (runSummary.combined) {
    const combined = runSummary.combined;
    addResult(
      results,
      "scenarios",
      "benchmark-summary",
      "PASS",
      `combined_pass_rate=${combined.pass_rate ?? "n/a"}, passed=${combined.passed ?? "n/a"}, failed=${combined.failed ?? "n/a"}`,
    );
  } else {
    const withSkillPassRate = runSummary.with_skill?.pass_rate?.mean;
    const withoutSkillPassRate = runSummary.without_skill?.pass_rate?.mean;
    const deltaTime = runSummary.delta?.time_seconds;
    addResult(
      results,
      "scenarios",
      "benchmark-summary",
      "PASS",
      `with_skill_pass_rate=${withSkillPassRate ?? "n/a"}, without_skill_pass_rate=${withoutSkillPassRate ?? "n/a"}, delta_time=${deltaTime ?? "n/a"}`,
    );
  }

  const discriminationNote = Array.isArray(benchmark.notes)
    ? benchmark.notes.find((note) => /non-discriminating|discriminating/i.test(note))
    : null;
  addResult(
    results,
    "scenarios",
    "discrimination-signal",
    discriminationNote ? "PASS" : "WARN",
    discriminationNote || "no explicit discrimination note found",
  );
}

function finalize(results, strict) {
  const counts = {
    PASS: results.filter((entry) => entry.status === "PASS").length,
    WARN: results.filter((entry) => entry.status === "WARN").length,
    FAIL: results.filter((entry) => entry.status === "FAIL").length,
  };
  return {
    counts,
    shouldFail: counts.FAIL > 0 || (strict && counts.WARN > 0),
  };
}

function printText(results, counts) {
  const phases = PHASE_ORDER.filter((phase) => results.some((entry) => entry.phase === phase));
  for (const phase of phases) {
    const items = results.filter((entry) => entry.phase === phase);
    console.log(`\n[${phase}]`);
    for (const item of items) {
      const suffix = item.detail ? ` — ${item.detail}` : "";
      console.log(`${item.status.padEnd(4)} ${item.name}${suffix}`);
    }
  }
  console.log(`\nSummary: PASS=${counts.PASS} WARN=${counts.WARN} FAIL=${counts.FAIL}`);
}

async function main() {
  let args;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error(String(error.message || error));
    process.exit(2);
  }

  if (args.help) {
    printHelp();
    return;
  }

  if (args.command === "creative") {
    try {
      if (!args.creativeInput || !args.creativePhase) throw new Error("Creative phase and input are required.");
      const stat = fs.lstatSync(args.creativeInput);
      if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 2 * 1024 * 1024) throw new Error("Creative input must be a bounded regular JSON file.");
      const input = readJson(args.creativeInput);
      let result;
      if (args.creativePhase === "prepare") result = prepareCreativeSession(input);
      else if (args.creativePhase === "record") result = recordCreativeEvent(input.root, input.event);
      else if (args.creativePhase === "check") result = checkCreativeSession(input.root, input.brief_id, input.target || "research");
      else if (args.creativePhase === "finalize") result = finalizeCreativeSession(input.root);
      else throw new Error("Unknown creative phase.");
      console.log(JSON.stringify(result, null, 2));
      if (result.ok === false || ["invalid-evidence", "partial", "budget-exhausted"].includes(result.status)) process.exitCode = 1;
    } catch (error) {
      console.log(JSON.stringify({ kind: "pulse-creative-error", schema_version: "1.0", error: String(error.message || error), promotion_eligible: false }, null, 2));
      process.exitCode = 1;
    }
    return;
  }

  const results = [];
  let scoutStatus = null;
  let benchmarkInfo = null;

  try {
    if (args.command === "analyze") {
      runStaticChecks(results);
      runRuntimeChecks(results, args.runCmd);
    } else if (args.command === "scout") {
      scoutStatus = await runScoutChecks(results);
    } else if (args.command === "benchmark") {
      benchmarkInfo = runBenchmark(results, args);
      if (benchmarkInfo?.benchmarkJsonPath) {
        runScenarioChecks(results, args.workspace, benchmarkInfo.iterationName, args.evalIds, benchmarkInfo.scenarioSourcePath);
      }
    } else {
      if (!args.skipStatic) runStaticChecks(results);
      if (!args.skipRuntime) {
        runRuntimeChecks(results, args.runCmd);
        scoutStatus = await runScoutChecks(results);
      }
      if (!args.skipScenarios) {
        benchmarkInfo = runBenchmark(results, args);
        if (benchmarkInfo?.benchmarkJsonPath) {
          runScenarioChecks(results, args.workspace, benchmarkInfo.iterationName, args.evalIds, benchmarkInfo.scenarioSourcePath);
        }
      }
    }
  } catch (error) {
    addResult(results, "benchmark", "exception", "FAIL", String(error.message || error));
  }

  const { counts, shouldFail } = finalize(results, args.strict);
  const output = {
    workspace: args.workspace,
    config: args.config,
    command: args.command,
    strict: args.strict,
    counts,
    status: shouldFail ? "FAIL" : "PASS",
    scout: scoutStatus,
    benchmark: benchmarkInfo,
    checks: results,
  };

  if (args.json) {
    console.log(JSON.stringify(output, null, 2));
  } else {
    printText(results, counts);
    console.log(`Overall: ${output.status}`);
  }

  process.exit(shouldFail ? 1 : 0);
}

await main();

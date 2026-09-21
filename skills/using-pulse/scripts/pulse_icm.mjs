#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const ICM_RUN_SCHEMA_VERSION = "2.0";
export const ICM_WORKFLOW_VERSION = "1.0";

export const ICM_STAGES = Object.freeze([
  "01_explore",
  "02_plan",
  "03_validate",
  "04_execute",
  "05_review",
  "06_compound",
]);

const STAGE_SKILLS = Object.freeze({
  "01_explore": "pulse:exploring",
  "02_plan": "pulse:planning",
  "03_validate": "pulse:validating",
  "04_execute": "pulse:executing",
  "05_review": "pulse:reviewing",
  "06_compound": "pulse:compounding",
  complete: "",
});

const GATE_STAGE = Object.freeze({
  GATE_1: "01_explore",
  GATE_2: "02_plan",
  GATE_3: "03_validate",
  GATE_4: "05_review",
});

const GATE_NEXT_STAGE = Object.freeze({
  GATE_1: "02_plan",
  GATE_2: "03_validate",
  GATE_3: "04_execute",
  GATE_4: "06_compound",
});

const FEATURE_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const NODE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*$/u;
const GLOB_PATTERN = /[*?\[\]{}!]/u;

function utcNow() {
  return new Date().toISOString();
}

function toPosix(relativePath) {
  return relativePath.split(path.sep).join("/");
}

function ensureDirectory(directory) {
  fs.mkdirSync(directory, { recursive: true });
}

function readJson(targetPath, label = targetPath) {
  let raw;
  try {
    raw = fs.readFileSync(targetPath, "utf8");
  } catch (error) {
    throw new Error(`Unable to read ${label}: ${error.message}`);
  }

  try {
    return JSON.parse(raw);
  } catch (error) {
    throw new Error(`Invalid JSON in ${label}: ${error.message}`);
  }
}

function writeJsonAtomic(targetPath, value) {
  ensureDirectory(path.dirname(targetPath));
  const temporaryPath = `${targetPath}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  fs.renameSync(temporaryPath, targetPath);
}

function writeTextAtomic(targetPath, value) {
  ensureDirectory(path.dirname(targetPath));
  const temporaryPath = `${targetPath}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(temporaryPath, value, "utf8");
  fs.renameSync(temporaryPath, targetPath);
}

function isInsideRoot(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function resolveRepoRelative(repoRoot, relativePath, label) {
  if (typeof relativePath !== "string" || !relativePath.trim()) {
    throw new Error(`${label} must be a non-empty repo-relative path.`);
  }
  const normalized = relativePath.trim();
  if (path.isAbsolute(normalized) || normalized.includes("\\")) {
    throw new Error(`${label} must be a normalized repo-relative path.`);
  }
  const absolutePath = path.resolve(repoRoot, normalized);
  if (!isInsideRoot(repoRoot, absolutePath)) {
    throw new Error(`${label} escapes the repository root.`);
  }
  return absolutePath;
}

function runRelativePath(feature) {
  return `history/${feature}/run.json`;
}

function stageOutputRelative(feature, stage, basename) {
  return `history/${feature}/stages/${stage}/output/${basename}`;
}

function emptyGate() {
  return {
    status: "pending",
    artifacts: [],
    decided_at: "",
  };
}

export function initIcmRun(repoRoot, feature, requestText, options = {}) {
  const root = path.resolve(repoRoot);
  if (typeof feature !== "string" || !FEATURE_SLUG_PATTERN.test(feature)) {
    throw new Error("Feature slug must be lowercase hyphen-case.");
  }
  if (typeof requestText !== "string" || !requestText.trim()) {
    throw new Error("Run request must be non-empty.");
  }

  const featureRoot = path.join(root, "history", feature);
  const runPath = path.join(featureRoot, "run.json");
  if (fs.existsSync(runPath)) {
    throw new Error(`An ICM run already exists for feature ${feature}.`);
  }
  if (fs.existsSync(featureRoot) && fs.readdirSync(featureRoot).length > 0) {
    throw new Error(`Feature history already exists for ${feature}; create a distinct v2 run slug.`);
  }

  const pointerPath = path.join(root, ".pulse", "active-run");
  if (fs.existsSync(pointerPath)) {
    const existingPointer = fs.readFileSync(pointerPath, "utf8").trim();
    if (existingPointer && existingPointer !== runRelativePath(feature)) {
      throw new Error(`Another ICM run is already active: ${existingPointer}.`);
    }
  }

  ensureDirectory(featureRoot);
  for (const stage of ICM_STAGES) {
    const outputDirectory = path.join(featureRoot, "stages", stage, "output");
    ensureDirectory(outputDirectory);
    if (stage === "04_execute") {
      ensureDirectory(path.join(outputDirectory, "verification"));
    }
  }

  const now = options.now || utcNow();
  const requestPath = `history/${feature}/request.md`;
  const run = {
    schema_version: ICM_RUN_SCHEMA_VERSION,
    workflow_version: ICM_WORKFLOW_VERSION,
    feature,
    request_path: requestPath,
    current_stage: "01_explore",
    gates: {
      GATE_1: emptyGate(),
      GATE_2: emptyGate(),
      GATE_3: emptyGate(),
      GATE_4: emptyGate(),
    },
    execution: {
      recommendation: "",
      approved_strategy: "",
      component_count: 0,
      max_workers: 1,
    },
    resume_path: "",
    created_at: now,
    updated_at: now,
    completed_at: "",
  };

  writeTextAtomic(path.join(root, requestPath), `# Request\n\n${requestText.trim()}\n`);
  writeJsonAtomic(runPath, run);
  writeTextAtomic(pointerPath, `${runRelativePath(feature)}\n`);

  return {
    repo_root: root,
    run_path: runRelativePath(feature),
    run,
  };
}

function validateFileScope(scope, nodeId) {
  if (typeof scope !== "string" || !scope.trim()) {
    return `Node ${nodeId} has an empty file scope.`;
  }
  const normalized = scope.trim();
  if (
    path.isAbsolute(normalized)
    || normalized.includes("\\")
    || normalized.split("/").includes("..")
    || normalized.startsWith("./")
    || GLOB_PATTERN.test(normalized)
  ) {
    return `Node ${nodeId} file scope ${JSON.stringify(scope)} must be a normalized repo-relative path without globs.`;
  }
  return "";
}

function findCycle(nodeMap) {
  const state = new Map();
  const stack = [];

  function visit(id) {
    const current = state.get(id) || "unvisited";
    if (current === "visiting") {
      const start = stack.indexOf(id);
      return [...stack.slice(start), id];
    }
    if (current === "visited") return null;

    state.set(id, "visiting");
    stack.push(id);
    for (const dependency of nodeMap.get(id).depends_on) {
      if (!nodeMap.has(dependency)) continue;
      const cycle = visit(dependency);
      if (cycle) return cycle;
    }
    stack.pop();
    state.set(id, "visited");
    return null;
  }

  for (const id of [...nodeMap.keys()].sort()) {
    const cycle = visit(id);
    if (cycle) return cycle;
  }
  return null;
}

export function validateWorkGraph(workGraph) {
  const errors = [];
  if (!workGraph || typeof workGraph !== "object" || Array.isArray(workGraph)) {
    return ["Work graph must be an object."];
  }
  if (workGraph.schema_version !== "1.0") {
    errors.push("Work graph schema_version must be 1.0.");
  }
  if (!Array.isArray(workGraph.nodes) || workGraph.nodes.length === 0) {
    errors.push("Work graph nodes must be a non-empty array.");
    return errors;
  }

  const nodeMap = new Map();
  for (const [index, candidate] of workGraph.nodes.entries()) {
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
      errors.push(`Node at index ${index} must be an object.`);
      continue;
    }
    if (typeof candidate.id !== "string" || !NODE_ID_PATTERN.test(candidate.id)) {
      errors.push(`Node at index ${index} has an invalid id.`);
      continue;
    }
    if (nodeMap.has(candidate.id)) {
      errors.push(`Duplicate node id: ${candidate.id}.`);
      continue;
    }
    if (typeof candidate.title !== "string" || !candidate.title.trim()) {
      errors.push(`Node ${candidate.id} must have a non-empty title.`);
    }
    if (!Array.isArray(candidate.depends_on)) {
      errors.push(`Node ${candidate.id} depends_on must be an array.`);
    }
    if (!Array.isArray(candidate.files) || candidate.files.length === 0) {
      errors.push(`Node ${candidate.id} files must be a non-empty array.`);
    }
    if (!Array.isArray(candidate.verification) || candidate.verification.length === 0) {
      errors.push(`Node ${candidate.id} verification must be a non-empty array.`);
    }
    nodeMap.set(candidate.id, candidate);
  }

  for (const [id, candidate] of nodeMap) {
    const dependencies = Array.isArray(candidate.depends_on) ? candidate.depends_on : [];
    if (new Set(dependencies).size !== dependencies.length) {
      errors.push(`Node ${id} contains duplicate dependencies.`);
    }
    for (const dependency of dependencies) {
      if (!nodeMap.has(dependency)) {
        errors.push(`Node ${id} references unknown dependency ${dependency}.`);
      }
      if (dependency === id) {
        errors.push(`Node ${id} cannot depend on itself.`);
      }
    }

    const files = Array.isArray(candidate.files) ? candidate.files : [];
    if (new Set(files).size !== files.length) {
      errors.push(`Node ${id} contains duplicate file scopes.`);
    }
    for (const file of files) {
      const error = validateFileScope(file, id);
      if (error) errors.push(error);
    }

    const verification = Array.isArray(candidate.verification) ? candidate.verification : [];
    if (verification.some((item) => typeof item !== "string" || !item.trim())) {
      errors.push(`Node ${id} verification entries must be non-empty strings.`);
    }
  }

  const cycle = findCycle(nodeMap);
  if (cycle) {
    errors.push(`Work graph contains a cycle: ${cycle.join(" -> ")}.`);
  }

  return errors;
}

function fileScopesOverlap(left, right) {
  if (left === right) return true;
  if (left.endsWith("/") && right.startsWith(left)) return true;
  if (right.endsWith("/") && left.startsWith(right)) return true;
  return false;
}

export function analyzeWorkGraph(workGraph) {
  const errors = validateWorkGraph(workGraph);
  if (errors.length > 0) {
    return {
      valid: false,
      errors,
      component_count: 0,
      components: [],
      file_conflicts: [],
      swarm_eligible: false,
      recommendation: "blocked",
      max_workers: 0,
    };
  }

  const nodeMap = new Map(workGraph.nodes.map((item) => [item.id, item]));
  const adjacency = new Map([...nodeMap.keys()].map((id) => [id, new Set()]));
  for (const candidate of workGraph.nodes) {
    for (const dependency of candidate.depends_on) {
      adjacency.get(candidate.id).add(dependency);
      adjacency.get(dependency).add(candidate.id);
    }
  }

  const components = [];
  const componentByNode = new Map();
  const visited = new Set();
  for (const start of [...nodeMap.keys()].sort()) {
    if (visited.has(start)) continue;
    const queue = [start];
    const component = [];
    visited.add(start);
    while (queue.length > 0) {
      const current = queue.shift();
      component.push(current);
      for (const neighbor of [...adjacency.get(current)].sort()) {
        if (visited.has(neighbor)) continue;
        visited.add(neighbor);
        queue.push(neighbor);
      }
    }
    component.sort();
    const componentIndex = components.length;
    for (const id of component) componentByNode.set(id, componentIndex);
    components.push(component);
  }

  const fileConflicts = [];
  for (let leftIndex = 0; leftIndex < workGraph.nodes.length; leftIndex += 1) {
    const leftNode = workGraph.nodes[leftIndex];
    for (let rightIndex = leftIndex + 1; rightIndex < workGraph.nodes.length; rightIndex += 1) {
      const rightNode = workGraph.nodes[rightIndex];
      if (componentByNode.get(leftNode.id) === componentByNode.get(rightNode.id)) continue;
      for (const leftScope of leftNode.files) {
        for (const rightScope of rightNode.files) {
          if (!fileScopesOverlap(leftScope, rightScope)) continue;
          fileConflicts.push({
            left_node: leftNode.id,
            right_node: rightNode.id,
            left_scope: leftScope,
            right_scope: rightScope,
          });
        }
      }
    }
  }

  const swarmEligible = components.length >= 2 && fileConflicts.length === 0;
  const recommendation = "single-worker";

  return {
    valid: true,
    errors: [],
    component_count: components.length,
    components,
    file_conflicts: fileConflicts,
    swarm_eligible: swarmEligible,
    recommendation,
    max_workers: swarmEligible ? Math.min(components.length, 4) : 1,
  };
}

function activeLegacyHandoffs(repoRoot) {
  const manifestPath = path.join(repoRoot, ".pulse", "handoffs", "manifest.json");
  if (!fs.existsSync(manifestPath)) return [];
  try {
    const manifest = readJson(manifestPath, ".pulse/handoffs/manifest.json");
    return Array.isArray(manifest.active) ? manifest.active : [];
  } catch {
    return [{ invalid: true }];
  }
}

function hasLegacyState(repoRoot) {
  return fs.existsSync(path.join(repoRoot, ".pulse", "state.json"))
    || fs.existsSync(path.join(repoRoot, ".pulse", "STATE.md"))
    || fs.existsSync(path.join(repoRoot, ".pulse", "current-feature.json"))
    || activeLegacyHandoffs(repoRoot).length > 0;
}

function readActivePointer(repoRoot) {
  const pointerPath = path.join(repoRoot, ".pulse", "active-run");
  if (!fs.existsSync(pointerPath)) return null;
  const relativePath = fs.readFileSync(pointerPath, "utf8").trim();
  const absolutePath = resolveRepoRelative(repoRoot, relativePath, ".pulse/active-run");
  return { relative_path: relativePath, absolute_path: absolutePath };
}

export function detectPulseRuntime(repoRoot) {
  const root = path.resolve(repoRoot);
  let pointer = null;
  try {
    pointer = readActivePointer(root);
  } catch (error) {
    return { kind: "conflict", reason: error.message };
  }
  const activeHandoffs = activeLegacyHandoffs(root);

  if (pointer) {
    if (!fs.existsSync(pointer.absolute_path)) {
      return { kind: "conflict", reason: `Active ICM run is missing: ${pointer.relative_path}.` };
    }
    let run;
    try {
      run = readJson(pointer.absolute_path, pointer.relative_path);
    } catch (error) {
      return { kind: "conflict", reason: error.message };
    }
    if (run.schema_version !== ICM_RUN_SCHEMA_VERSION) {
      return { kind: "conflict", reason: `Active run has unsupported schema ${run.schema_version || "(missing)"}.` };
    }
    if (activeHandoffs.length > 0) {
      return {
        kind: "conflict",
        reason: "An active ICM v2 run and active legacy handoff both exist; choose explicitly before continuing.",
      };
    }
    return {
      kind: "icm-v2",
      run_path: pointer.relative_path,
      run,
    };
  }

  if (hasLegacyState(root)) {
    return { kind: "legacy-v1" };
  }
  return { kind: "none" };
}

function requireIcmRun(repoRoot) {
  const detected = detectPulseRuntime(repoRoot);
  if (detected.kind !== "icm-v2") {
    throw new Error(`Expected an active ICM v2 run, found ${detected.kind}.`);
  }
  return {
    root: path.resolve(repoRoot),
    runPath: resolveRepoRelative(repoRoot, detected.run_path, "active run"),
    runRelativePath: detected.run_path,
    run: detected.run,
  };
}

export function hashFile(targetPath) {
  const content = fs.readFileSync(targetPath);
  return crypto.createHash("sha256").update(content).digest("hex");
}

function gateArtifacts(run, gate) {
  const feature = run.feature;
  if (gate === "GATE_1") {
    return [stageOutputRelative(feature, "01_explore", "decisions.md")];
  }
  if (gate === "GATE_2") {
    return [
      stageOutputRelative(feature, "02_plan", "plan.md"),
      stageOutputRelative(feature, "02_plan", "work-graph.json"),
    ];
  }
  if (gate === "GATE_3") {
    return [
      stageOutputRelative(feature, "02_plan", "work-graph.json"),
      stageOutputRelative(feature, "03_validate", "validation.json"),
    ];
  }
  if (gate === "GATE_4") {
    return [
      stageOutputRelative(feature, "05_review", "review.json"),
      stageOutputRelative(feature, "05_review", "uat.md"),
    ];
  }
  throw new Error(`Unknown gate: ${gate}.`);
}

function requireArtifactHashes(repoRoot, artifactPaths) {
  return artifactPaths.map((relativePath) => {
    const absolutePath = resolveRepoRelative(repoRoot, relativePath, "gate artifact");
    if (!fs.existsSync(absolutePath) || !fs.statSync(absolutePath).isFile()) {
      throw new Error(`Required gate artifact is missing: ${relativePath}.`);
    }
    return { path: relativePath, sha256: hashFile(absolutePath) };
  });
}

function validateReview(repoRoot, run) {
  const reviewPath = resolveRepoRelative(
    repoRoot,
    stageOutputRelative(run.feature, "05_review", "review.json"),
    "review artifact",
  );
  const review = readJson(reviewPath, "review.json");
  const findings = Array.isArray(review.findings) ? review.findings : [];
  const blocking = findings.filter((finding) => (
    String(finding?.severity || "").toUpperCase() === "P1"
    && String(finding?.status || "open").toLowerCase() !== "closed"
  ));
  if (review.status !== "ready" || blocking.length > 0) {
    throw new Error("Gate 4 requires review status ready with no open P1 findings.");
  }
}

export function approveGate(repoRoot, gate, options = {}) {
  const { root, runPath, run } = requireIcmRun(repoRoot);
  if (!Object.hasOwn(GATE_STAGE, gate)) {
    throw new Error(`Unknown gate: ${gate}.`);
  }
  if (run.current_stage !== GATE_STAGE[gate]) {
    throw new Error(`${gate} belongs to ${GATE_STAGE[gate]}, but current stage is ${run.current_stage}.`);
  }

  const artifactPaths = gateArtifacts(run, gate);
  const artifacts = requireArtifactHashes(root, artifactPaths);

  if (gate === "GATE_2" || gate === "GATE_3") {
    const graphPath = resolveRepoRelative(
      root,
      stageOutputRelative(run.feature, "02_plan", "work-graph.json"),
      "work graph",
    );
    const workGraph = readJson(graphPath, "work-graph.json");
    const analysis = analyzeWorkGraph(workGraph);
    if (!analysis.valid) {
      throw new Error(`Work graph is invalid: ${analysis.errors.join(" ")}`);
    }

    if (gate === "GATE_3") {
      const validationPath = resolveRepoRelative(
        root,
        stageOutputRelative(run.feature, "03_validate", "validation.json"),
        "validation artifact",
      );
      const validation = readJson(validationPath, "validation.json");
      if (validation.status !== "ready") {
        throw new Error("Gate 3 requires validation status ready.");
      }

      const strategy = options.strategy;
      if (!new Set(["single-worker", "swarm"]).has(strategy)) {
        throw new Error("Gate 3 requires an explicit single-worker or swarm strategy.");
      }
      if (strategy === "swarm" && !analysis.swarm_eligible) {
        throw new Error("Cannot approve swarm when the work graph is not swarm-eligible.");
      }
      run.execution = {
        recommendation: analysis.recommendation,
        approved_strategy: strategy,
        component_count: analysis.component_count,
        max_workers: strategy === "swarm" ? analysis.max_workers : 1,
      };
    }
  }

  if (gate === "GATE_4") {
    validateReview(root, run);
  }

  const now = options.now || utcNow();
  run.gates[gate] = {
    status: "approved",
    artifacts,
    decided_at: now,
  };
  run.current_stage = GATE_NEXT_STAGE[gate];
  run.updated_at = now;
  writeJsonAtomic(runPath, run);

  return { run_path: toPosix(path.relative(root, runPath)), run };
}

function findStaleApproval(repoRoot, run) {
  for (const gate of ["GATE_1", "GATE_2", "GATE_3", "GATE_4"]) {
    const record = run.gates?.[gate];
    if (record?.status !== "approved") continue;
    for (const artifact of Array.isArray(record.artifacts) ? record.artifacts : []) {
      let absolutePath;
      try {
        absolutePath = resolveRepoRelative(repoRoot, artifact.path, `${gate} artifact`);
      } catch {
        return gate;
      }
      if (!fs.existsSync(absolutePath) || hashFile(absolutePath) !== artifact.sha256) {
        return gate;
      }
    }
  }
  return "";
}

export function readIcmStatus(repoRoot) {
  const detected = detectPulseRuntime(repoRoot);
  if (detected.kind === "conflict") {
    return { status: "conflict", blocker_code: "runtime_conflict", reason: detected.reason };
  }
  if (detected.kind === "legacy-v1") {
    return { status: "legacy", runtime: "legacy-v1" };
  }
  if (detected.kind === "none") {
    return { status: "idle", runtime: "none" };
  }

  const root = path.resolve(repoRoot);
  const staleGate = findStaleApproval(root, detected.run);
  if (staleGate) {
    return {
      status: "blocked",
      runtime: "icm-v2",
      blocker_code: "approval_hash_mismatch",
      stale_gate: staleGate,
      current_stage: detected.run.current_stage,
      next_skill: "",
      run_path: detected.run_path,
    };
  }

  return {
    status: detected.run.current_stage === "complete" ? "complete" : "ready",
    runtime: "icm-v2",
    current_stage: detected.run.current_stage,
    next_skill: STAGE_SKILLS[detected.run.current_stage] || "",
    run_path: detected.run_path,
    execution: detected.run.execution,
    completed_at: detected.run.completed_at || "",
  };
}

function requireExecutionComplete(repoRoot, run) {
  const statePath = resolveRepoRelative(
    repoRoot,
    stageOutputRelative(run.feature, "04_execute", "execution-state.json"),
    "execution-state",
  );
  const reportPath = resolveRepoRelative(
    repoRoot,
    stageOutputRelative(run.feature, "04_execute", "execution-report.md"),
    "execution report",
  );
  if (!fs.existsSync(statePath)) {
    throw new Error("04_execute requires execution-state.json.");
  }
  if (!fs.existsSync(reportPath)) {
    throw new Error("04_execute requires execution-report.md.");
  }
  const state = readJson(statePath, "execution-state.json");
  const values = state?.nodes && typeof state.nodes === "object" && !Array.isArray(state.nodes)
    ? Object.values(state.nodes)
    : [];
  if (values.length === 0 || values.some((value) => value !== "complete")) {
    throw new Error("Every execution-state node must be complete before review.");
  }
}

export function completeStage(repoRoot, stage, options = {}) {
  const { root, runPath, run } = requireIcmRun(repoRoot);
  if (run.current_stage !== stage) {
    throw new Error(`Cannot complete ${stage}; current stage is ${run.current_stage}.`);
  }
  const now = options.now || utcNow();

  if (stage === "04_execute") {
    requireExecutionComplete(root, run);
    run.current_stage = "05_review";
  } else if (stage === "06_compound") {
    const compoundingPath = resolveRepoRelative(
      root,
      stageOutputRelative(run.feature, "06_compound", "compounding.md"),
      "compounding artifact",
    );
    if (!fs.existsSync(compoundingPath)) {
      throw new Error("06_compound requires compounding.md.");
    }
    run.current_stage = "complete";
    run.completed_at = now;
  } else {
    throw new Error(`${stage} advances through a human gate, not completeStage.`);
  }

  run.updated_at = now;
  writeJsonAtomic(runPath, run);
  return { run_path: toPosix(path.relative(root, runPath)), run };
}

function parseCliArgs(argv) {
  const args = { command: argv[0] || "status" };
  for (let index = 1; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) continue;
    const key = token.slice(2).replace(/-/gu, "_");
    args[key] = argv[index + 1] || "";
    index += 1;
  }
  return args;
}

function printJson(value) {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

export function runCli(argv = process.argv.slice(2)) {
  const args = parseCliArgs(argv);
  const repoRoot = path.resolve(args.repo_root || process.cwd());

  if (args.command === "init") {
    printJson(initIcmRun(repoRoot, args.feature, args.request || ""));
    return;
  }
  if (args.command === "status") {
    printJson(readIcmStatus(repoRoot));
    return;
  }
  if (args.command === "approve") {
    const approved = approveGate(repoRoot, args.gate, { strategy: args.strategy || undefined });
    printJson({
      run_path: approved.run_path,
      gate: args.gate,
      current_stage: approved.run.current_stage,
      next_skill: STAGE_SKILLS[approved.run.current_stage] || "",
      execution: approved.run.execution,
    });
    return;
  }
  if (args.command === "complete") {
    const completed = completeStage(repoRoot, args.stage);
    printJson({
      run_path: completed.run_path,
      current_stage: completed.run.current_stage,
      next_skill: STAGE_SKILLS[completed.run.current_stage] || "",
      execution: completed.run.execution,
      completed_at: completed.run.completed_at || "",
    });
    return;
  }
  if (args.command === "analyze") {
    const graphPath = resolveRepoRelative(repoRoot, args.graph, "work graph");
    printJson(analyzeWorkGraph(readJson(graphPath, args.graph)));
    return;
  }
  throw new Error(`Unknown command: ${args.command}.`);
}

function isDirectExecution() {
  if (!process.argv[1]) return false;
  try {
    return fs.realpathSync.native(process.argv[1]) === fs.realpathSync.native(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}

if (isDirectExecution()) {
  try {
    runCli();
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}

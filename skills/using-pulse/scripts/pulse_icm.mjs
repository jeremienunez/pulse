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
  writeTextAtomic(targetPath, `${JSON.stringify(value, null, 2)}\n`);
}

function writeTextAtomic(targetPath, value) {
  ensureDirectory(path.dirname(targetPath));
  const temporaryPath = `${targetPath}.tmp-${crypto.randomUUID()}`;
  fs.writeFileSync(temporaryPath, value, { encoding: "utf8", flag: "wx" });
  try { fs.renameSync(temporaryPath, targetPath); }
  finally { if (fs.existsSync(temporaryPath)) fs.unlinkSync(temporaryPath); }
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


const CONTINUITY_SCHEMA_VERSION = "2.1";
const SHA256_PATTERN = /^[a-f0-9]{64}$/u;
const NODE_STATES = new Set(["pending", "in_progress", "complete", "blocked"]);

function ownedPath(root, relativePath, label) {
  const absolute = resolveRepoRelative(root, relativePath, label);
  if (relativePath.split("/").some(part => !part || part === "." || part === "..")) {
    throw new Error(`${label} must be a normalized repo-relative path.`);
  }
  let current = root;
  for (const part of relativePath.split("/")) {
    current = path.join(current, part);
    try {
      if (fs.lstatSync(current).isSymbolicLink()) throw new Error(`${label} contains a symlink: ${relativePath}.`);
    } catch (error) {
      if (error.code === "ENOENT") break;
      throw error;
    }
  }
  return absolute;
}

function bytesHash(bytes) {
  return crypto.createHash("sha256").update(bytes).digest("hex");
}

function validateContinuity(root, run) {
  if (![ICM_RUN_SCHEMA_VERSION, CONTINUITY_SCHEMA_VERSION].includes(run.schema_version)) {
    throw new Error(`Active run has unsupported schema ${run.schema_version || "(missing)"}.`);
  }
  if ((run.revision !== undefined || run.parent_run !== undefined) && run.schema_version !== CONTINUITY_SCHEMA_VERSION) {
    throw new Error("Continuity metadata requires schema 2.1.");
  }
  if (run.resume_path) ownedPath(root, run.resume_path, "resume_path");
  if (run.parent_run !== undefined) {
    const parent = run.parent_run;
    if (!parent || typeof parent.path !== "string" || !/^history\/[a-z0-9]+(?:-[a-z0-9]+)*\/run\.json$/u.test(parent.path)
        || !SHA256_PATTERN.test(parent.sha256) || parent.path === runRelativePath(run.feature)
        || Object.keys(parent).some(key => !["path", "sha256"].includes(key))) {
      throw new Error("Invalid parent_run metadata.");
    }
    ownedPath(root, parent.path, "parent run");
  }
  if (run.revision !== undefined) {
    const revision = run.revision;
    const prefix = `history/${run.feature}/revisions/`;
    if (!revision || typeof revision.path !== "string" || !revision.path.startsWith(prefix)
        || !/^[a-f0-9]{64}\/manifest\.json$/u.test(revision.path.slice(prefix.length))
        || !["prepared", "applied"].includes(revision.phase)
        || Object.keys(revision).some(key => !["path", "phase"].includes(key))) {
      throw new Error("Invalid revision metadata.");
    }
    const file = ownedPath(root, revision.path, "revision manifest");
    const id = revision.path.split("/").at(-2);
    if (hashFile(file) !== id) throw new Error("Revision manifest digest binding changed.");
  }
}

function lockFile(root) {
  return ownedPath(root, ".pulse/lifecycle.lock", "lifecycle lock");
}

function ownerIsLive(pid) {
  if (!Number.isInteger(pid) || pid < 1) return true;
  try { process.kill(pid, 0); return true; }
  catch (error) { return error.code !== "ESRCH"; }
}

function withLifecycleLock(repoRoot, action, recoveryId = "") {
  const root = fs.realpathSync(repoRoot), file = lockFile(root);
  ensureDirectory(path.dirname(file));
  if (fs.existsSync(file) && recoveryId) {
    const oldBytes = fs.readFileSync(file), old = readJson(file, "lifecycle lock");
    const { run } = requireIcmRun(root, { allowPrepared: true, allowStaleApprovals: true });
    const revision = readRevision(root, run, recoveryId);
    if (old.revision_id !== recoveryId || old.run_sha256 !== revision.manifest.run_before.sha256
        || ownerIsLive(old.pid) || !fs.readFileSync(file).equals(oldBytes)) {
      throw new Error("A live or unbound lifecycle owner blocks recovery.");
    }
    fs.unlinkSync(file); // Only explicit recovery may release this bound, dead owner.
  }
  let fd;
  try { fd = fs.openSync(file, "wx", 0o600); }
  catch (error) {
    if (error.code === "EEXIST") throw new Error("Another lifecycle writer owns the lock.");
    throw error;
  }
  const owner = { pid: process.pid, token: crypto.randomUUID(), revision_id: null, run_sha256: null };
  try { fs.writeFileSync(fd, `${JSON.stringify(owner)}\n`); }
  finally { fs.closeSync(fd); }
  const context = {
    root,
    bindRevision(id, sourceHash) {
      if (readJson(file).token !== owner.token) throw new Error("Lifecycle lock ownership changed.");
      owner.revision_id = id;
      owner.run_sha256 = sourceHash;
      writeJsonAtomic(file, owner);
    },
  };
  try { return action(context); }
  finally {
    if (fs.existsSync(file)) {
      if (readJson(file).token !== owner.token) throw new Error("Lifecycle lock ownership changed.");
      fs.unlinkSync(file);
    }
  }
}

function assertGateCurrent(root, run, gate) {
  const record = run.gates?.[gate], expected = gateArtifacts(run, gate);
  const records = record?.artifacts;
  if (record?.status !== "approved" || !Array.isArray(records) || records.length !== expected.length
      || new Set(records.map(item => item.path)).size !== expected.length
      || records.some(item => !expected.includes(item.path) || !SHA256_PATTERN.test(item.sha256)
        || !fs.existsSync(ownedPath(root, item.path, gate))
        || hashFile(ownedPath(root, item.path, gate)) !== item.sha256)) {
    throw new Error(`Retained ${gate} is stale or lacks its approved artifacts.`);
  }
}

function executionState(root, run) {
  const relative = stageOutputRelative(run.feature, "04_execute", "execution-state.json");
  const file = ownedPath(root, relative, "execution-state");
  if (!fs.existsSync(file)) return null;
  const value = readJson(file, "execution-state.json");
  if (value.schema_version !== "1.0" || !value.nodes || Array.isArray(value.nodes)
      || typeof value.nodes !== "object" || Object.values(value.nodes).some(state => !NODE_STATES.has(state))) {
    throw new Error("Invalid execution-state node states.");
  }
  return { relative, file, value, bytes: fs.readFileSync(file) };
}

function graphState(root, run, state) {
  const file = ownedPath(root, stageOutputRelative(run.feature, "02_plan", "work-graph.json"), "work graph");
  const workGraph = readJson(file, "work-graph.json"), errors = validateWorkGraph(workGraph);
  if (errors.length) throw new Error(`Work graph is invalid: ${errors.join(" ")}`);
  const ids = workGraph.nodes.map(node => node.id).sort(), actual = Object.keys(state.value.nodes).sort();
  if (JSON.stringify(ids) !== JSON.stringify(actual)) throw new Error("Execution-state node membership differs from the approved graph.");
  return workGraph;
}

function revisionTarget(run, stage) {
  const target = ICM_STAGES.indexOf(stage), current = ICM_STAGES.indexOf(run.current_stage);
  if (current < 0 || target < 0 || target >= current) {
    throw new Error("Revision requires an earlier stage in an unfinished run; completed runs need a successor.");
  }
  return target;
}

function retainedGates(root, run, target) {
  const retained = [];
  for (const gate of Object.keys(GATE_STAGE)) {
    if (ICM_STAGES.indexOf(GATE_STAGE[gate]) < target) {
      assertGateCurrent(root, run, gate);
      retained.push(gate);
    }
  }
  return retained;
}

function correctionClosure(workGraph, requested) {
  if (!Array.isArray(requested) || !requested.length || new Set(requested).size !== requested.length
      || requested.some(id => !workGraph.nodes.some(node => node.id === id))) {
    throw new Error("Execution revision requires unique, known node IDs.");
  }
  const closure = new Set(requested);
  const dependents = new Map(workGraph.nodes.map(node => [node.id, []]));
  for (const node of workGraph.nodes) {
    for (const dependency of node.depends_on) dependents.get(dependency).push(node.id);
  }
  const queue = [...requested];
  for (let index = 0; index < queue.length; index += 1) {
    for (const id of dependents.get(queue[index])) {
      if (!closure.has(id)) { closure.add(id); queue.push(id); }
    }
  }
  return [...closure].sort();
}

function snapshotOutputs(root, run, target, directory) {
  const files = [];
  function capture(relative) {
    const source = ownedPath(root, relative, "revision evidence"), stat = fs.lstatSync(source);
    if (stat.isDirectory()) {
      for (const name of fs.readdirSync(source).sort()) capture(`${relative}/${name}`);
    } else if (stat.isFile()) {
      const bytes = fs.readFileSync(source), snapshot = `files/${String(files.length).padStart(6, "0")}`;
      const dest = path.join(directory, snapshot);
      ensureDirectory(path.dirname(dest));
      fs.writeFileSync(dest, bytes, { flag: "wx" });
      files.push({ source: relative, snapshot, sha256: bytesHash(bytes) });
    } else throw new Error("Revision evidence must be a regular file or directory.");
  }
  for (const stage of ICM_STAGES.slice(target)) {
    const relative = `history/${run.feature}/stages/${stage}/output`;
    if (fs.existsSync(ownedPath(root, relative, "stage output"))) capture(relative);
  }
  return files;
}

function revisionRun(before, manifest, relative, phase) {
  const run = structuredClone(before);
  run.schema_version = CONTINUITY_SCHEMA_VERSION;
  run.revision = { path: relative, phase };
  run.updated_at = manifest.created_at;
  if (phase === "applied") {
    run.current_stage = manifest.to_stage;
    run.resume_path = relative.replace(/manifest\.json$/u, "handoff.md");
    const target = ICM_STAGES.indexOf(manifest.to_stage);
    for (const gate of Object.keys(GATE_STAGE)) {
      if (ICM_STAGES.indexOf(GATE_STAGE[gate]) >= target) run.gates[gate] = emptyGate();
    }
    if (target <= ICM_STAGES.indexOf("03_validate")) {
      run.execution = { recommendation: "", approved_strategy: "", component_count: 0, max_workers: 1 };
    }
  }
  return run;
}

function readRevision(root, run, id) {
  if (run.revision?.phase !== "prepared" || !SHA256_PATTERN.test(id)
      || run.revision.path.split("/").at(-2) !== id) throw new Error("No matching prepared revision to recover.");
  const file = ownedPath(root, run.revision.path, "revision manifest");
  if (hashFile(file) !== id) throw new Error("Revision manifest digest binding changed.");
  const directory = path.dirname(file), manifest = readJson(file);
  if (manifest.kind !== "pulse-icm-revision" || manifest.schema_version !== "1.0"
      || manifest.feature !== run.feature || !Array.isArray(manifest.files)
      || manifest.run_before?.snapshot !== "run-before.json") throw new Error("Invalid revision manifest.");
  const beforeFile = ownedPath(root, toPosix(path.relative(root, path.join(directory, "run-before.json"))), "run preimage");
  if (hashFile(beforeFile) !== manifest.run_before.sha256) throw new Error("Revision run preimage binding changed.");
  const before = readJson(beforeFile);
  revisionTarget(before, manifest.to_stage);
  if (before.feature !== run.feature || manifest.from_stage !== before.current_stage
      || typeof manifest.created_at !== "string" || !Number.isFinite(Date.parse(manifest.created_at))) {
    throw new Error("Revision source identity changed.");
  }
  const expected = revisionRun(before, manifest, run.revision.path, "prepared");
  if (JSON.stringify(run) !== JSON.stringify(expected)) throw new Error("Prepared run changed since its revision.");
  for (const entry of manifest.files) {
    if (!/^files\/[0-9]{6}$/u.test(entry.snapshot) || !SHA256_PATTERN.test(entry.sha256)
        || !entry.source.startsWith(`history/${run.feature}/stages/`)) throw new Error("Invalid snapshot binding.");
    const archived = ownedPath(root, toPosix(path.relative(root, path.join(directory, entry.snapshot))), "snapshot");
    if (hashFile(archived) !== entry.sha256) throw new Error("Revision snapshot binding changed.");
  }
  const change = manifest.state_change;
  if (change) {
    if (change.path !== stageOutputRelative(run.feature, "04_execute", "execution-state.json")
        || !SHA256_PATTERN.test(change.before_sha256)
        || ![null, "execution-after.json"].includes(change.after_snapshot)
        || (change.after_snapshot !== null && !SHA256_PATTERN.test(change.after_sha256))) {
      throw new Error("Invalid execution-state change binding.");
    }
  }
  return { directory, manifest, before };
}

function finishRevision(root, runPath, run, revision) {
  const { manifest, before, directory } = revision, change = manifest.state_change;
  retainedGates(root, before, ICM_STAGES.indexOf(manifest.to_stage));
  if (JSON.stringify(readJson(runPath)) !== JSON.stringify(run)) throw new Error("Prepared run changed; recovery refused.");
  if (change?.after_snapshot) {
    const file = ownedPath(root, toPosix(path.relative(root, path.join(directory, change.after_snapshot))), "execution after-image");
    if (hashFile(file) !== change.after_sha256) throw new Error("Execution after-image binding changed.");
  }
  // Refuse changes to any archived live evidence other than the declared state delta.
  for (const entry of manifest.files) {
    if (entry.source === change?.path) continue;
    const file = ownedPath(root, entry.source, "live revision evidence");
    if (!fs.existsSync(file) || hashFile(file) !== entry.sha256) throw new Error("Live revision evidence changed; recovery refused.");
  }
  if (change) {
    const file = ownedPath(root, change.path, "execution-state");
    const current = fs.existsSync(file) ? hashFile(file) : null;
    if (![change.before_sha256, change.after_sha256].includes(current)) throw new Error("Execution-state diverged; recovery refused.");
    if (current !== change.after_sha256) {
      if (change.after_snapshot === null) fs.unlinkSync(file);
      else {
        const after = ownedPath(root, toPosix(path.relative(root, path.join(directory, change.after_snapshot))), "execution after-image");
        if (hashFile(after) !== change.after_sha256) throw new Error("Execution after-image binding changed.");
        writeTextAtomic(file, fs.readFileSync(after, "utf8"));
      }
    }
  }
  const after = revisionRun(before, manifest, run.revision.path, "applied");
  if (JSON.stringify(readJson(runPath)) !== JSON.stringify(run)) throw new Error("Prepared run changed before commit; recovery refused.");
  writeJsonAtomic(runPath, after);
  return { run_path: toPosix(path.relative(root, runPath)), run: after, revision_id: run.revision.path.split("/").at(-2) };
}

export function reviseIcmRun(repoRoot, options = {}) {
  return withLifecycleLock(repoRoot, context => {
    const { root, runPath, run } = requireIcmRun(context.root, { allowStaleApprovals: true });
    const target = revisionTarget(run, options.stage);
    if (typeof options.reason !== "string" || !options.reason.trim()) throw new Error("Revision reason must be non-empty.");
    retainedGates(root, run, target);
    const state = executionState(root, run);
    if (state && Object.values(state.value.nodes).some(value => ["blocked", "in_progress"].includes(value))) {
      throw new Error("Settle blocked or in-progress nodes before revision; do not replay unresolved effects.");
    }
    let reopened = [], afterBytes = null, change = null;
    if (options.stage === "04_execute") {
      if (!state) throw new Error("Execution revision requires execution-state.");
      reopened = correctionClosure(graphState(root, run, state), options.nodes);
      const after = structuredClone(state.value);
      for (const id of reopened) after.nodes[id] = "pending";
      afterBytes = Buffer.from(`${JSON.stringify(after, null, 2)}\n`);
    } else if (options.nodes !== undefined) throw new Error("Node selection belongs only to execution revisions.");
    if (state && (options.stage === "04_execute" || target <= ICM_STAGES.indexOf("02_plan"))) {
      change = { path: state.relative, before_sha256: bytesHash(state.bytes),
        after_sha256: afterBytes === null ? null : bytesHash(afterBytes), after_snapshot: afterBytes === null ? null : "execution-after.json" };
    }
    const base = ownedPath(root, `history/${run.feature}/revisions`, "revision directory");
    ensureDirectory(base);
    const staging = path.join(base, `.prepared-${crypto.randomUUID()}`);
    fs.mkdirSync(staging);
    const beforeBytes = fs.readFileSync(runPath);
    fs.writeFileSync(path.join(staging, "run-before.json"), beforeBytes, { flag: "wx" });
    const files = snapshotOutputs(root, run, target, staging);
    if (afterBytes !== null) fs.writeFileSync(path.join(staging, "execution-after.json"), afterBytes, { flag: "wx" });
    const manifest = { kind: "pulse-icm-revision", schema_version: "1.0", feature: run.feature,
      created_at: options.now || utcNow(), from_stage: run.current_stage, to_stage: options.stage, reason: options.reason.trim(),
      selected_nodes: options.nodes || [], reopened_nodes: reopened,
      run_before: { snapshot: "run-before.json", sha256: bytesHash(beforeBytes) }, files, state_change: change };
    const manifestBytes = Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`), id = bytesHash(manifestBytes);
    fs.writeFileSync(path.join(staging, "manifest.json"), manifestBytes, { flag: "wx" });
    fs.writeFileSync(path.join(staging, "handoff.md"),
      `# Recorded revision\n\nReason: ${manifest.reason}\n\nFrom: ${manifest.from_stage}\nTo: ${manifest.to_stage}\nCorrection nodes: ${reopened.join(", ") || "(stage revision)"}\n\nRead the archived evidence before corrections. Settle uncertain effects; do not replay them.\n`,
      { flag: "wx" });
    const destination = ownedPath(root, `history/${run.feature}/revisions/${id}`, "revision destination");
    if (fs.existsSync(destination)) throw new Error("Revision snapshot already exists.");
    if (!fs.readFileSync(runPath).equals(beforeBytes)) throw new Error("Run changed during revision preparation.");
    for (const entry of files) {
      if (hashFile(ownedPath(root, entry.source, "revision source")) !== entry.sha256) throw new Error("Evidence changed during revision preparation.");
    }
    fs.renameSync(staging, destination);
    context.bindRevision(id, manifest.run_before.sha256);
    const relative = `history/${run.feature}/revisions/${id}/manifest.json`;
    const prepared = revisionRun(run, manifest, relative, "prepared");
    if (!fs.readFileSync(runPath).equals(beforeBytes)) throw new Error("Run changed before revision publication.");
    writeJsonAtomic(runPath, prepared);
    return finishRevision(root, runPath, prepared, { directory: destination, manifest, before: run });
  });
}

export function recoverIcmRevision(repoRoot, id) {
  return withLifecycleLock(repoRoot, context => {
    const { root, runPath, run } = requireIcmRun(context.root, { allowPrepared: true, allowStaleApprovals: true });
    const revision = readRevision(root, run, id);
    context.bindRevision(id, revision.manifest.run_before.sha256);
    return finishRevision(root, runPath, run, revision);
  }, id);
}

function emptyGate() {
  return {
    status: "pending",
    artifacts: [],
    decided_at: "",
  };
}

export function initIcmRun(repoRoot, feature, requestText, options = {}) {
  return withLifecycleLock(repoRoot, ({ root }) => initIcmRunUnlocked(root, feature, requestText, options));
}

function initIcmRunUnlocked(repoRoot, feature, requestText, options = {}) {
  const root = path.resolve(repoRoot);
  if (typeof feature !== "string" || !FEATURE_SLUG_PATTERN.test(feature)) {
    throw new Error("Feature slug must be lowercase hyphen-case.");
  }
  if (typeof requestText !== "string" || !requestText.trim()) {
    throw new Error("Run request must be non-empty.");
  }

  const runPath = ownedPath(root, runRelativePath(feature), "new run path");
  const featureRoot = path.dirname(runPath);
  if (fs.existsSync(runPath)) {
    throw new Error(`An ICM run already exists for feature ${feature}.`);
  }
  if (fs.existsSync(featureRoot) && fs.readdirSync(featureRoot).length > 0) {
    throw new Error(`Feature history already exists for ${feature}; create a distinct v2 run slug.`);
  }

  const pointerPath = ownedPath(root, ".pulse/active-run", "active pointer");
  if (activeLegacyHandoffs(root).length) throw new Error("Active legacy handoff blocks new v2 ownership.");
  const pointerBytes = fs.existsSync(pointerPath) ? fs.readFileSync(pointerPath) : null;
  const pointer = readActivePointer(root);
  if ((pointer?.relative_path || "") !== (pointerBytes?.toString("utf8").trim() || "")) throw new Error("Active pointer changed during creation.");
  let parentPath = options.fromRun || "";
  if (pointer) {
    const runtime = detectPulseRuntime(root);
    if (runtime.kind !== "icm-v2") throw new Error(`Active run conflict: ${runtime.reason || runtime.kind}.`);
    if (runtime.run.revision?.phase === "prepared") throw new Error("A prepared revision blocks init.");
    if (runtime.run.current_stage !== "complete") throw new Error(`Another ICM run is already active and unfinished: ${pointer.relative_path}.`);
    parentPath ||= pointer.relative_path;
  }
  let parent = null;
  if (parentPath) {
    if (!/^history\/[a-z0-9]+(?:-[a-z0-9]+)*\/run\.json$/u.test(parentPath)) throw new Error("Parent path must be a normalized repo-relative run path.");
    const parentFile = ownedPath(root, parentPath, "parent path");
    const parentBytes = fs.readFileSync(parentFile);
    const parentRun = JSON.parse(parentBytes.toString("utf8"));
    validateContinuity(root, parentRun);
    if (parentPath !== runRelativePath(parentRun.feature)) throw new Error("Parent path and feature identity differ.");
    if (parentRun.current_stage !== "complete" || !parentRun.completed_at || parentRun.revision?.phase === "prepared") throw new Error("Parent run must be complete.");
    for (const gate of Object.keys(GATE_STAGE)) assertGateCurrent(root, parentRun, gate);
    parent = { path: parentPath, sha256: bytesHash(parentBytes) };
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

  if (parent) {
    run.schema_version = CONTINUITY_SCHEMA_VERSION;
    run.parent_run = parent;
  }

  const parentContext = parent ? `\n## Parent run\n\n${parent.path}\n\nSource SHA-256: ${parent.sha256}\nSelect relevant evidence and compounded learnings; approvals are not inherited.\n` : "";
  writeTextAtomic(path.join(root, requestPath), `# Request\n\n${requestText.trim()}\n${parentContext}`);
  writeJsonAtomic(runPath, run);
  const currentPointer = fs.existsSync(pointerPath) ? fs.readFileSync(pointerPath) : null;
  if ((pointerBytes === null) !== (currentPointer === null) || (pointerBytes !== null && !pointerBytes.equals(currentPointer))) throw new Error("Active pointer changed during creation; inspect the unselected new run.");
  if (parent && hashFile(ownedPath(root, parent.path, "parent path")) !== parent.sha256) throw new Error("Parent run changed during successor creation.");
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
  const pointerPath = ownedPath(repoRoot, ".pulse/active-run", "active pointer");
  if (!fs.existsSync(pointerPath)) return null;
  const relativePath = fs.readFileSync(pointerPath, "utf8").trim();
  const absolutePath = ownedPath(repoRoot, relativePath, ".pulse/active-run");
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
    try {
      validateContinuity(root, run);
      if (!FEATURE_SLUG_PATTERN.test(run.feature) || pointer.relative_path !== runRelativePath(run.feature)) throw new Error("Active run path and feature identity differ.");
    }
    catch (error) { return { kind: "conflict", reason: error.message }; }
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

function requireIcmRun(repoRoot, options = {}) {
  const detected = detectPulseRuntime(repoRoot);
  if (detected.kind !== "icm-v2") {
    throw new Error(`Expected an active ICM v2 run, found ${detected.kind}: ${detected.reason || ""}`);
  }
  if (!options.allowPrepared && detected.run.revision?.phase === "prepared") throw new Error("A prepared revision requires explicit recovery before advancement.");
  // Revisions validate only the approvals they retain; advancement needs the full prior prefix.
  if (!options.allowStaleApprovals) {
    const stageIndex = detected.run.current_stage === "complete"
      ? ICM_STAGES.length : ICM_STAGES.indexOf(detected.run.current_stage);
    retainedGates(repoRoot, detected.run, stageIndex);
  }
  return {
    root: path.resolve(repoRoot),
    runPath: ownedPath(repoRoot, detected.run_path, "active run"),
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
    const absolutePath = ownedPath(repoRoot, relativePath, "gate artifact");
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
  return withLifecycleLock(repoRoot, ({ root }) => approveGateUnlocked(root, gate, options));
}

function approveGateUnlocked(repoRoot, gate, options = {}) {
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
  run.resume_path = "";
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
        absolutePath = ownedPath(repoRoot, artifact.path, `${gate} artifact`);
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
  const details = {
    run_path: detected.run_path,
    current_stage: detected.run.current_stage,
    resume_path: detected.run.resume_path || "",
    ...(detected.run.revision ? { revision: detected.run.revision } : {}),
    ...(detected.run.parent_run ? { parent_run: detected.run.parent_run } : {}),
  };
  if (detected.run.revision?.phase === "prepared") {
    return { ...details, status: "blocked", runtime: "icm-v2", blocker_code: "revision_prepared", next_skill: "",
      recovery: { command: "revise", revision_id: detected.run.revision.path.split("/").at(-2) } };
  }
  try {
    if (fs.existsSync(lockFile(root))) return { ...details, status: "blocked", runtime: "icm-v2", blocker_code: "lifecycle_writer_active", next_skill: "" };
  } catch (error) { return { status: "conflict", blocker_code: "lifecycle_lock_conflict", reason: error.message }; }
  const staleGate = findStaleApproval(root, detected.run);
  if (staleGate) {
    return {
      ...details,
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
    ...details,
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
  const statePath = ownedPath(
    repoRoot,
    stageOutputRelative(run.feature, "04_execute", "execution-state.json"),
    "execution-state",
  );
  const reportPath = ownedPath(
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
  const parsed = executionState(repoRoot, run);
  graphState(repoRoot, run, parsed);
  const values = state?.nodes && typeof state.nodes === "object" && !Array.isArray(state.nodes)
    ? Object.values(state.nodes)
    : [];
  if (values.length === 0 || values.some((value) => value !== "complete")) {
    throw new Error("Every execution-state node must be complete before review.");
  }
}

export function completeStage(repoRoot, stage, options = {}) {
  return withLifecycleLock(repoRoot, ({ root }) => completeStageUnlocked(root, stage, options));
}

function completeStageUnlocked(repoRoot, stage, options = {}) {
  const { root, runPath, run } = requireIcmRun(repoRoot);
  if (run.current_stage !== stage) {
    throw new Error(`Cannot complete ${stage}; current stage is ${run.current_stage}.`);
  }
  const now = options.now || utcNow();

  if (stage === "04_execute") {
    requireExecutionComplete(root, run);
    run.current_stage = "05_review";
  } else if (stage === "06_compound") {
    const compoundingPath = ownedPath(
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
  run.resume_path = "";
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
    printJson(initIcmRun(repoRoot, args.feature, args.request || "", { fromRun: args.from_run || undefined }));
    return;
  }
  if (args.command === "revise") {
    const result = args.recover
      ? recoverIcmRevision(repoRoot, args.recover)
      : reviseIcmRun(repoRoot, { stage: args.stage, reason: args.reason, nodes: args.nodes === undefined ? undefined : args.nodes.split(",").map(id => id.trim()) });
    printJson({ run_path: result.run_path, revision_id: result.revision_id,
      current_stage: result.run.current_stage, next_skill: STAGE_SKILLS[result.run.current_stage] || "",
      revision: result.run.revision, resume_path: result.run.resume_path });
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

#!/usr/bin/env node

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import * as icm from "./pulse_icm.mjs";

import {
  analyzeWorkGraph,
  approveGate,
  completeStage,
  detectPulseRuntime,
  initIcmRun,
  readIcmStatus,
  validateWorkGraph,
} from "./pulse_icm.mjs";
import { applyRepo } from "../../skills/using-pulse/scripts/onboard_pulse.mjs";

const REPO_ROOT = fileURLToPath(new URL("../../", import.meta.url));

function approvedFixture(stage = "05_review") {
  const root = makeRepo(), feature = "revision-case";
  const result = initIcmRun(root, feature, "Bounded correction fixture.");
  const output = (s, file) => path.join(root, "history", feature, "stages", s, "output", file);
  fs.writeFileSync(output("01_explore", "decisions.md"), "# Decisions\n");
  approveGate(root, "GATE_1");
  fs.writeFileSync(output("02_plan", "plan.md"), "# Plan\n");
  writeJson(output("02_plan", "work-graph.json"), graph([
    node("A", [], ["src/a.ts"]), node("B", ["A"], ["src/b.ts"]), node("C", [], ["src/c.ts"]),
  ]));
  approveGate(root, "GATE_2");
  writeJson(output("03_validate", "validation.json"), { schema_version: "1.0", status: "ready" });
  approveGate(root, "GATE_3", { strategy: "single-worker" });
  writeJson(output("04_execute", "execution-state.json"), { schema_version: "1.0", nodes: { A: "complete", B: "complete", C: "complete" } });
  fs.writeFileSync(output("04_execute", "execution-report.md"), "# Execution\n");
  fs.mkdirSync(output("04_execute", "verification"), { recursive: true });
  fs.writeFileSync(output("04_execute", "verification/prior.txt"), "prior proof\n");
  if (stage !== "04_execute") completeStage(root, "04_execute");
  if (stage === "06_compound" || stage === "complete") {
    writeJson(output("05_review", "review.json"), { schema_version: "1.0", status: "ready", findings: [] });
    fs.writeFileSync(output("05_review", "uat.md"), "# UAT\n");
    approveGate(root, "GATE_4");
  }
  if (stage === "complete") {
    fs.writeFileSync(output("06_compound", "compounding.md"), "# Learning\n");
    completeStage(root, "06_compound");
  }
  return { root, output, runPath: path.join(root, result.run_path) };
}

test("R1: resume status returns its handoff without changing partial progress", () => {
  const f = approvedFixture("04_execute");
  try {
    const run = JSON.parse(fs.readFileSync(f.runPath));
    run.resume_path = "history/revision-case/stages/04_execute/output/handoff.md";
    fs.writeFileSync(path.join(f.root, run.resume_path), "# Resume B\n");
    writeJson(f.runPath, run);
    const state = f.output("04_execute", "execution-state.json");
    writeJson(state, { schema_version: "1.0", nodes: { A: "complete", B: "pending", C: "complete" } });
    const before = [fs.readFileSync(f.runPath, "utf8"), fs.readFileSync(state, "utf8")];
    assert.equal(readIcmStatus(f.root).resume_path, run.resume_path);
    assert.equal(readIcmStatus(f.root).current_stage, "04_execute");
    assert.deepEqual([fs.readFileSync(f.runPath, "utf8"), fs.readFileSync(state, "utf8")], before);
  } finally { fs.rmSync(f.root, { recursive: true, force: true }); }
});

test("R2: review correction reopens only the requested dependency closure and keeps approved scope", () => {
  const f = approvedFixture();
  try {
    const before = JSON.parse(fs.readFileSync(f.runPath));
    const graphBytes = fs.readFileSync(f.output("02_plan", "work-graph.json"), "utf8");
    const revised = icm.reviseIcmRun(f.root, { stage: "04_execute", reason: "Correct checkbox styling", nodes: ["A"] });
    assert.equal(revised.run.current_stage, "04_execute");
    assert.equal(revised.run.schema_version, "2.1");
    assert.equal(revised.run.revision.phase, "applied");
    assert.deepEqual(revised.run.execution, before.execution);
    for (const gate of ["GATE_1", "GATE_2", "GATE_3"]) assert.deepEqual(revised.run.gates[gate], before.gates[gate]);
    assert.equal(revised.run.gates.GATE_4.status, "pending");
    assert.deepEqual(JSON.parse(fs.readFileSync(f.output("04_execute", "execution-state.json"))).nodes, { A: "pending", B: "pending", C: "complete" });
    assert.equal(fs.readFileSync(f.output("02_plan", "work-graph.json"), "utf8"), graphBytes);
    const manifestPath = path.join(f.root, revised.run.revision.path);
    const manifest = JSON.parse(fs.readFileSync(manifestPath));
    const prior = manifest.files.find(file => file.source.endsWith("verification/prior.txt"));
    assert.equal(fs.readFileSync(path.join(path.dirname(manifestPath), prior.snapshot), "utf8"), "prior proof\n");
    assert.equal(readIcmStatus(f.root).resume_path, revised.run.resume_path);
    assert.throws(() => completeStage(f.root, "04_execute"), /complete/i);
  } finally { fs.rmSync(f.root, { recursive: true, force: true }); }
});

test("R3/R4: revising a stale plan clears its downstream authority and archived execution state", () => {
  const f = approvedFixture();
  try {
    fs.appendFileSync(f.output("02_plan", "plan.md"), "A changed requirement\n");
    const before = fs.readFileSync(f.runPath, "utf8");
    assert.throws(() => icm.reviseIcmRun(f.root, { stage: "04_execute", reason: "Fix", nodes: ["A"] }), /GATE_2.*stale|stale.*GATE_2/i);
    assert.equal(fs.readFileSync(f.runPath, "utf8"), before);
    const revised = icm.reviseIcmRun(f.root, { stage: "02_plan", reason: "Renew changed plan" });
    assert.equal(revised.run.gates.GATE_1.status, "approved");
    for (const gate of ["GATE_2", "GATE_3", "GATE_4"]) assert.equal(revised.run.gates[gate].status, "pending");
    assert.equal(revised.run.execution.approved_strategy, "");
    assert.equal(fs.existsSync(f.output("04_execute", "execution-state.json")), false);
    assert.equal(readIcmStatus(f.root).status, "ready");
  } finally { fs.rmSync(f.root, { recursive: true, force: true }); }
});

test("R4: invalid transition and node requests do not change the run", () => {
  const f = approvedFixture();
  try {
    assert.equal(typeof icm.reviseIcmRun, "function");
    const before = fs.readFileSync(f.runPath, "utf8");
    for (const options of [
      { stage: "05_review", reason: "same" }, { stage: "06_compound", reason: "future" },
      { stage: "bad", reason: "bad" }, { stage: "02_plan", reason: " " },
      { stage: "04_execute", reason: "missing nodes" },
      { stage: "04_execute", reason: "unknown", nodes: ["FOREIGN"] },
      { stage: "04_execute", reason: "duplicate", nodes: ["A", "A"] },
    ]) assert.throws(() => icm.reviseIcmRun(f.root, options));
    assert.equal(fs.readFileSync(f.runPath, "utf8"), before);
    assert.equal(fs.existsSync(path.join(f.root, "history/revision-case/revisions")), false);
  } finally { fs.rmSync(f.root, { recursive: true, force: true }); }
});

function interruptRevision(f) {
  const rename = fs.renameSync;
  fs.renameSync = (source, target) => {
    if (target === f.runPath && JSON.parse(fs.readFileSync(source)).revision?.phase === "applied") throw new Error("injected final commit failure");
    return rename(source, target);
  };
  try {
    assert.throws(() => icm.reviseIcmRun(f.root, { stage: "04_execute", reason: "Review correction", nodes: ["A"] }), /injected final commit failure/);
  } finally { fs.renameSync = rename; }
  return JSON.parse(fs.readFileSync(f.runPath)).revision.path.split("/").at(-2);
}

test("R5: interrupted commit blocks advancement and explicit recovery completes only that revision", () => {
  const f = approvedFixture();
  try {
    const id = interruptRevision(f);
    assert.equal(readIcmStatus(f.root).blocker_code, "revision_prepared");
    assert.throws(() => approveGate(f.root, "GATE_4"), /prepared/i);
    assert.throws(() => completeStage(f.root, "04_execute"), /prepared/i);
    assert.throws(() => initIcmRun(f.root, "another", "New work"), /prepared/i);
    assert.throws(() => icm.recoverIcmRevision(f.root, "wrong"), /revision/i);
    const recovered = icm.recoverIcmRevision(f.root, id);
    assert.equal(recovered.run.current_stage, "04_execute");
    assert.equal(recovered.run.revision.phase, "applied");
    const after = fs.readFileSync(f.runPath, "utf8");
    assert.throws(() => icm.recoverIcmRevision(f.root, id), /prepared/i);
    assert.equal(fs.readFileSync(f.runPath, "utf8"), after);
  } finally { fs.rmSync(f.root, { recursive: true, force: true }); }
});

test("R5: recovery refuses changed execution state or modified manifest without overwrite", () => {
  for (const tamper of ["state", "manifest"]) {
    const f = approvedFixture();
    try {
      const id = interruptRevision(f), run = JSON.parse(fs.readFileSync(f.runPath));
      const target = tamper === "state" ? f.output("04_execute", "execution-state.json") : path.join(f.root, run.revision.path);
      fs.appendFileSync(target, tamper === "state" ? "external edit" : "\n");
      const before = fs.readFileSync(target, "utf8");
      assert.throws(() => icm.recoverIcmRevision(f.root, id), /changed|binding|digest|diverg/i);
      assert.equal(fs.readFileSync(target, "utf8"), before);
      assert.equal(JSON.parse(fs.readFileSync(f.runPath)).revision.phase, "prepared");
    } finally { fs.rmSync(f.root, { recursive: true, force: true }); }
  }
});

test("R6/R7: a completed pointer starts a fresh linked successor and preserves parent bytes", () => {
  const f = approvedFixture("complete");
  try {
    const before = fs.readFileSync(f.runPath, "utf8");
    const next = initIcmRun(f.root, "successor", "Apply the next improvement");
    assert.equal(next.run.current_stage, "01_explore");
    assert.equal(next.run.schema_version, "2.1");
    assert.equal(next.run.parent_run.path, "history/revision-case/run.json");
    assert.equal(next.run.parent_run.sha256, icm.hashFile(f.runPath));
    assert.equal(fs.readFileSync(f.runPath, "utf8"), before);
    for (const gate of Object.values(next.run.gates)) assert.deepEqual(gate, { status: "pending", artifacts: [], decided_at: "" });
    assert.match(fs.readFileSync(path.join(f.root, next.run.request_path), "utf8"), /history\/revision-case\/run\.json/);
    assert.throws(() => initIcmRun(f.root, "third", "An unfinished run owns this repository"), /active|unfinished/i);
  } finally { fs.rmSync(f.root, { recursive: true, force: true }); }
});

test("R6: explicit parents must be completed, valid and inside the owner", () => {
  const f = approvedFixture();
  try {
    const before = fs.readFileSync(f.runPath, "utf8");
    assert.throws(() => initIcmRun(f.root, "next", "Work", { fromRun: "history/revision-case/run.json" }), /active|unfinished|complete/i);
    assert.throws(() => initIcmRun(f.root, "next", "Work", { fromRun: "../outside/run.json" }), /path|relative|escape|active/i);
    assert.equal(fs.readFileSync(f.runPath, "utf8"), before);
    assert.equal(fs.existsSync(path.join(f.root, "history/next")), false);
    fs.unlinkSync(path.join(f.root, ".pulse", "active-run"));
    assert.throws(() => initIcmRun(f.root, "next", "Work", { fromRun: "history/revision-case/run.json" }), /complete/i);
    assert.throws(() => initIcmRun(f.root, "next", "Work", { fromRun: "../outside/run.json" }), /path|relative|escape/i);
    assert.equal(fs.existsSync(path.join(f.root, "history/next")), false);
  } finally { fs.rmSync(f.root, { recursive: true, force: true }); }
});

test("R7: malformed continuity metadata and future schemas cannot route", () => {
  const f = approvedFixture();
  try {
    const initial = JSON.parse(fs.readFileSync(f.runPath));
    for (const patch of [
      { schema_version: "9.0" },
      { schema_version: "2.0", revision: { path: "outside", phase: "prepared" } },
      { schema_version: "2.1", revision: { path: "../outside", phase: "prepared" } },
      { schema_version: "2.1", parent_run: { path: "history/parent/run.json", sha256: "wrong" } },
    ]) {
      writeJson(f.runPath, { ...initial, ...patch });
      assert.equal(readIcmStatus(f.root).status, "conflict");
    }
  } finally { fs.rmSync(f.root, { recursive: true, force: true }); }
});

test("R8: missing and foreign graph-state keys cannot certify execution", () => {
  for (const states of [{ A: "complete" }, { A: "complete", B: "complete", C: "complete", FOREIGN: "complete" }]) {
    const f = approvedFixture("04_execute");
    try {
      writeJson(f.output("04_execute", "execution-state.json"), { schema_version: "1.0", nodes: states });
      assert.throws(() => completeStage(f.root, "04_execute"), /graph|membership|node/i);
      assert.equal(readIcmStatus(f.root).current_stage, "04_execute");
    } finally { fs.rmSync(f.root, { recursive: true, force: true }); }
  }
});

test("R8: blocked or in-progress corrections require settlement before reopening", () => {
  for (const state of ["blocked", "in_progress"]) {
    const f = approvedFixture();
    try {
      writeJson(f.output("04_execute", "execution-state.json"), { schema_version: "1.0", nodes: { A: state, B: "complete", C: "complete" } });
      const before = fs.readFileSync(f.runPath, "utf8");
      assert.throws(() => icm.reviseIcmRun(f.root, { stage: "04_execute", reason: "Do not replay unknown effects", nodes: ["A"] }), /settle|blocked|progress/i);
      assert.equal(fs.readFileSync(f.runPath, "utf8"), before);
    } finally { fs.rmSync(f.root, { recursive: true, force: true }); }
  }
});

test("R9: symlink escapes and competing writers are refused without outside writes", () => {
  const f = approvedFixture(), outside = fs.mkdtempSync(path.join(os.tmpdir(), "pulse-outside-"));
  try {
    const sentinel = path.join(outside, "sentinel.txt");
    fs.writeFileSync(sentinel, "untouched");
    fs.symlinkSync(outside, f.output("04_execute", "verification/escape"));
    const before = fs.readFileSync(f.runPath, "utf8");
    assert.throws(() => icm.reviseIcmRun(f.root, { stage: "04_execute", reason: "Fix", nodes: ["A"] }), /symlink|symbolic/i);
    assert.equal(fs.readFileSync(sentinel, "utf8"), "untouched");
    assert.equal(fs.readFileSync(f.runPath, "utf8"), before);
    fs.unlinkSync(f.output("04_execute", "verification/escape"));
    const lock = path.join(f.root, ".pulse", "lifecycle.lock");
    writeJson(lock, { pid: process.pid, token: "competing-owner", revision_id: null });
    assert.throws(() => icm.reviseIcmRun(f.root, { stage: "04_execute", reason: "Fix", nodes: ["A"] }), /writer|lock|owner/i);
    assert.equal(JSON.parse(fs.readFileSync(lock)).token, "competing-owner");
    assert.equal(fs.readFileSync(f.runPath, "utf8"), before);
  } finally { fs.rmSync(f.root, { recursive: true, force: true }); fs.rmSync(outside, { recursive: true, force: true }); }
});

function makeRepo() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "pulse-icm-"));
  fs.mkdirSync(path.join(root, ".git"), { recursive: true });
  return root;
}

function writeJson(targetPath, value) {
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.writeFileSync(targetPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function graph(nodes) {
  return { schema_version: "1.0", nodes };
}

function node(id, dependsOn, files) {
  return {
    id,
    title: `Task ${id}`,
    depends_on: dependsOn,
    files,
    verification: [`verify ${id}`],
  };
}

test("R3: feasibility revalidation retains completion when its approved graph has not changed", () => {
  const f = approvedFixture();
  try {
    const bytes = fs.readFileSync(f.output("04_execute", "execution-state.json"), "utf8");
    const result = icm.reviseIcmRun(f.root, { stage: "03_validate", reason: "Recheck feasibility" });
    assert.equal(result.run.gates.GATE_2.status, "approved");
    assert.equal(result.run.gates.GATE_3.status, "pending");
    assert.equal(result.run.execution.approved_strategy, "");
    assert.equal(fs.readFileSync(f.output("04_execute", "execution-state.json"), "utf8"), bytes);
  } finally { fs.rmSync(f.root, { recursive: true, force: true }); }
});

test("R5/R9: a killed writer leaves a bound lock; recovery refuses a live owner then handles the dead owner", () => {
  const f = approvedFixture();
  try {
    const moduleUrl = new URL("../../skills/using-pulse/scripts/pulse_icm.mjs", import.meta.url).href;
    const program = `import fs from 'node:fs'; import {reviseIcmRun} from ${JSON.stringify(moduleUrl)};
      const rename=fs.renameSync;
      fs.renameSync=(from,to)=>{if(to===${JSON.stringify(f.runPath)} && JSON.parse(fs.readFileSync(from)).revision?.phase==='applied')process.exit(86); return rename(from,to);};
      reviseIcmRun(${JSON.stringify(f.root)},{stage:'04_execute',reason:'Crash fixture',nodes:['A']});`;
    const child = spawnSync(process.execPath, ["--input-type=module", "-e", program], { encoding: "utf8" });
    assert.equal(child.status, 86, child.stderr);
    const run = JSON.parse(fs.readFileSync(f.runPath)), id = run.revision.path.split("/").at(-2);
    const lockPath = path.join(f.root, ".pulse", "lifecycle.lock");
    const deadLock = JSON.parse(fs.readFileSync(lockPath));
    assert.equal(deadLock.revision_id, id);
    writeJson(lockPath, { ...deadLock, pid: process.pid });
    assert.throws(() => icm.recoverIcmRevision(f.root, id), /live|owner/i);
    assert.equal(JSON.parse(fs.readFileSync(f.runPath)).revision.phase, "prepared");
    writeJson(lockPath, deadLock);
    assert.equal(icm.recoverIcmRevision(f.root, id).run.revision.phase, "applied");
    assert.equal(fs.existsSync(lockPath), false);
    assert.deepEqual(JSON.parse(fs.readFileSync(f.output("04_execute", "execution-state.json"))).nodes, { A: "pending", B: "pending", C: "complete" });
  } finally { fs.rmSync(f.root, { recursive: true, force: true }); }
});

test("R9: snapshot collision preserves the existing archive and current run", () => {
  const f = approvedFixture();
  try {
    const before = fs.readFileSync(f.runPath), state = f.output("04_execute", "execution-state.json"), stateBytes = fs.readFileSync(state);
    const options = { stage: "04_execute", reason: "Same frozen revision", nodes: ["A"], now: "2026-10-08T16:30:00.000Z" };
    const first = icm.reviseIcmRun(f.root, options), manifestFile = path.join(f.root, first.run.revision.path);
    const archive = fs.readFileSync(manifestFile);
    fs.writeFileSync(f.runPath, before); fs.writeFileSync(state, stateBytes);
    assert.throws(() => icm.reviseIcmRun(f.root, options), /already exists/i);
    assert.deepEqual(fs.readFileSync(f.runPath), before);
    assert.deepEqual(fs.readFileSync(manifestFile), archive);
  } finally { fs.rmSync(f.root, { recursive: true, force: true }); }
});

test("CLI: revise flags and the human status renderer expose the recorded correction", () => {
  const f = approvedFixture();
  try {
    const cli = path.join(REPO_ROOT, "workflow/scripts/pulse_icm.mjs");
    const result = JSON.parse(execFileSync(process.execPath, [cli, "revise", "--repo-root", f.root, "--stage", "04_execute", "--nodes", "A", "--reason", "CLI correction"], { encoding: "utf8" }));
    assert.equal(result.current_stage, "04_execute");
    const status = execFileSync(process.execPath, [path.join(REPO_ROOT, "skills/using-pulse/scripts/pulse_status.mjs"), "--repo-root", f.root], { encoding: "utf8" });
    assert.match(status, /Resume context:/);
    assert.match(status, /Revision: applied/);
  } finally { fs.rmSync(f.root, { recursive: true, force: true }); }
});


test("R9: revision refuses a run edit made after snapshot publication", () => {
  const f = approvedFixture(), rename = fs.renameSync;
  try {
    let injected = false;
    fs.renameSync = (from, to) => {
      const result = rename(from, to);
      if (!injected && path.basename(from).startsWith(".prepared-")) {
        injected = true;
        const run = JSON.parse(fs.readFileSync(f.runPath));
        run.updated_at = "2099-01-01T00:00:00.000Z";
        writeJson(f.runPath, run);
      }
      return result;
    };
    assert.throws(() => icm.reviseIcmRun(f.root, { stage: "04_execute", reason: "Concurrent edit", nodes: ["A"] }), /run changed/i);
    assert.equal(JSON.parse(fs.readFileSync(f.runPath)).updated_at, "2099-01-01T00:00:00.000Z");
  } finally { fs.renameSync = rename; fs.rmSync(f.root, { recursive: true, force: true }); }
});

test("R9: successor refuses an active pointer changed during creation", () => {
  const f = approvedFixture("complete"), rename = fs.renameSync;
  try {
    const pointer = path.join(f.root, ".pulse", "active-run");
    const other = { ...JSON.parse(fs.readFileSync(f.runPath)), feature: "other", request_path: "history/other/request.md", current_stage: "01_explore", completed_at: "" };
    writeJson(path.join(f.root, "history/other/run.json"), other);
    fs.renameSync = (from, to) => {
      const result = rename(from, to);
      if (to === path.join(f.root, "history/next/run.json")) fs.writeFileSync(pointer, "history/other/run.json\n");
      return result;
    };
    assert.throws(() => initIcmRun(f.root, "next", "Concurrent pointer edit"), /pointer changed/i);
    assert.equal(fs.readFileSync(pointer, "utf8"), "history/other/run.json\n");
  } finally { fs.renameSync = rename; fs.rmSync(f.root, { recursive: true, force: true }); }
});

test("R1: advancing stages retires the old handoff and keeps revision history", () => {
  const f = approvedFixture();
  try {
    const revised = icm.reviseIcmRun(f.root, { stage: "04_execute", reason: "Correction", nodes: ["A"] });
    writeJson(f.output("04_execute", "execution-state.json"), { schema_version: "1.0", nodes: { A: "complete", B: "complete", C: "complete" } });
    const reviewed = completeStage(f.root, "04_execute").run;
    assert.equal(reviewed.resume_path, "");
    assert.deepEqual(reviewed.revision, revised.run.revision);
    writeJson(f.output("05_review", "review.json"), { schema_version: "1.0", status: "ready", findings: [] });
    fs.writeFileSync(f.output("05_review", "uat.md"), "# UAT\n");
    reviewed.resume_path = "history/revision-case/stages/05_review/output/uat.md";
    writeJson(f.runPath, reviewed);
    assert.equal(approveGate(f.root, "GATE_4").run.resume_path, "");
  } finally { fs.rmSync(f.root, { recursive: true, force: true }); }
});

test("initIcmRun creates only the v2 run pointer and six-stage artifact layout", () => {
  const root = makeRepo();
  try {
    const result = initIcmRun(root, "email-inbox", "Add inbound email support.", {
      now: "2026-08-24T10:00:00.000Z",
    });

    assert.equal(result.run.schema_version, "2.0");
    assert.equal(result.run.current_stage, "01_explore");
    assert.equal(result.run.request_path, "history/email-inbox/request.md");
    assert.equal(
      fs.readFileSync(path.join(root, ".pulse", "active-run"), "utf8"),
      "history/email-inbox/run.json\n",
    );
    for (const stage of [
      "01_explore",
      "02_plan",
      "03_validate",
      "04_execute",
      "05_review",
      "06_compound",
    ]) {
      assert.ok(fs.statSync(path.join(root, "history", "email-inbox", "stages", stage, "output")).isDirectory());
    }
    for (const legacyMirror of ["state.json", "STATE.md", "current-feature.json", "runtime-snapshot.json"]) {
      assert.equal(fs.existsSync(path.join(root, ".pulse", legacyMirror)), false);
    }
    assert.throws(
      () => initIcmRun(root, "email-inbox", "Duplicate run."),
      /already exists/i,
    );
    assert.throws(
      () => initIcmRun(root, "../escape", "Unsafe feature."),
      /feature slug/i,
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("work graph validation rejects malformed dependencies, unsafe files, and cycles", () => {
  assert.deepEqual(validateWorkGraph(graph([node("A", [], ["src/a.ts"])])), []);
  assert.match(
    validateWorkGraph(graph([node("A", ["MISSING"], ["src/a.ts"])]))[0],
    /unknown dependency/i,
  );
  assert.match(
    validateWorkGraph(graph([node("A", [], ["../outside.ts"])]))[0],
    /repo-relative/i,
  );
  assert.match(
    validateWorkGraph(graph([
      node("A", ["B"], ["src/a.ts"]),
      node("B", ["A"], ["src/b.ts"]),
    ]))[0],
    /cycle/i,
  );
});

test("BDD B2-B4: Given graph boundaries, when analyzed, then cost-first defaults preserve safe eligibility", () => {
  const connected = analyzeWorkGraph(graph([
    node("A", [], ["src/a.ts"]),
    node("B", ["A"], ["src/b.ts"]),
  ]));
  assert.equal(connected.valid, true);
  assert.equal(connected.component_count, 1);
  assert.equal(connected.recommendation, "single-worker");
  assert.equal(connected.max_workers, 1);
  assert.equal(connected.swarm_eligible, false);

  const disconnected = analyzeWorkGraph(graph([
    node("A", [], ["src/a.ts"]),
    node("B", [], ["src/b.ts"]),
  ]));
  assert.equal(disconnected.valid, true);
  assert.equal(disconnected.component_count, 2);
  assert.equal(disconnected.recommendation, "single-worker");
  assert.equal(disconnected.swarm_eligible, true);
  assert.equal(disconnected.max_workers, 2);

  const overlapping = analyzeWorkGraph(graph([
    node("A", [], ["src/auth/"]),
    node("B", [], ["src/auth/session.ts"]),
  ]));
  assert.equal(overlapping.component_count, 2);
  assert.equal(overlapping.recommendation, "single-worker");
  assert.equal(overlapping.swarm_eligible, false);
  assert.equal(overlapping.max_workers, 1);
  assert.equal(overlapping.file_conflicts.length, 1);
});

test("BDD B10: Given an approved artifact changes, when status is read, then routing blocks as stale", () => {
  const root = makeRepo();
  try {
    initIcmRun(root, "hash-bound", "Create a hash-bound run.", {
      now: "2026-08-24T10:00:00.000Z",
    });
    const featureRoot = path.join(root, "history", "hash-bound");
    const decisions = path.join(featureRoot, "stages", "01_explore", "output", "decisions.md");
    fs.writeFileSync(decisions, "# Decisions\n\nApproved direction.\n", "utf8");

    approveGate(root, "GATE_1", { now: "2026-08-24T10:05:00.000Z" });
    let status = readIcmStatus(root);
    assert.equal(status.status, "ready");
    assert.equal(status.current_stage, "02_plan");
    assert.equal(status.next_skill, "pulse:planning");

    fs.appendFileSync(decisions, "Changed after approval.\n", "utf8");
    status = readIcmStatus(root);
    assert.equal(status.status, "blocked");
    assert.equal(status.blocker_code, "approval_hash_mismatch");
    assert.equal(status.stale_gate, "GATE_1");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("BDD B6-B7: Gate 3 preserves explicit eligible swarm and rejects ineligible swarm", () => {
  const root = makeRepo();
  try {
    initIcmRun(root, "execution-mode", "Choose an execution mode.");
    const featureRoot = path.join(root, "history", "execution-mode");
    const runPath = path.join(featureRoot, "run.json");
    const run = JSON.parse(fs.readFileSync(runPath, "utf8"));
    run.current_stage = "03_validate";
    writeJson(runPath, run);

    const graphPath = path.join(featureRoot, "stages", "02_plan", "output", "work-graph.json");
    const validationPath = path.join(featureRoot, "stages", "03_validate", "output", "validation.json");
    writeJson(graphPath, graph([
      node("A", [], ["src/a.ts"]),
      node("B", [], ["src/b.ts"]),
    ]));
    writeJson(validationPath, { schema_version: "1.0", status: "ready" });

    const approved = approveGate(root, "GATE_3", {
      strategy: "swarm",
      now: "2026-08-24T10:10:00.000Z",
    });
    assert.equal(approved.run.execution.recommendation, "single-worker");
    assert.equal(approved.run.execution.approved_strategy, "swarm");
    assert.equal(approved.run.execution.max_workers, 2);
    assert.equal(approved.run.current_stage, "04_execute");

    const singleRoot = makeRepo();
    try {
      initIcmRun(singleRoot, "connected", "Connected graph.");
      const connectedFeature = path.join(singleRoot, "history", "connected");
      const connectedRunPath = path.join(connectedFeature, "run.json");
      const connectedRun = JSON.parse(fs.readFileSync(connectedRunPath, "utf8"));
      connectedRun.current_stage = "03_validate";
      writeJson(connectedRunPath, connectedRun);
      writeJson(
        path.join(connectedFeature, "stages", "02_plan", "output", "work-graph.json"),
        graph([node("A", [], ["src/a.ts"]), node("B", ["A"], ["src/b.ts"])]),
      );
      writeJson(
        path.join(connectedFeature, "stages", "03_validate", "output", "validation.json"),
        { schema_version: "1.0", status: "ready" },
      );
      assert.throws(
        () => approveGate(singleRoot, "GATE_3", { strategy: "swarm" }),
        /cannot approve swarm/i,
      );
    } finally {
      fs.rmSync(singleRoot, { recursive: true, force: true });
    }
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("execution and compounding completion advance only after required outputs exist", () => {
  const root = makeRepo();
  try {
    initIcmRun(root, "stage-completion", "Complete mechanical stages.");
    const featureRoot = path.join(root, "history", "stage-completion");
    const runPath = path.join(featureRoot, "run.json");
    const run = JSON.parse(fs.readFileSync(runPath, "utf8"));
    run.current_stage = "04_execute";
    writeJson(runPath, run);

    assert.throws(() => completeStage(root, "04_execute"), /execution-state/i);
    writeJson(path.join(featureRoot, "stages", "02_plan", "output", "work-graph.json"), graph([node("A", [], ["src/a.ts"])]));
    writeJson(
      path.join(featureRoot, "stages", "04_execute", "output", "execution-state.json"),
      { schema_version: "1.0", nodes: { A: "complete" } },
    );
    fs.writeFileSync(
      path.join(featureRoot, "stages", "04_execute", "output", "execution-report.md"),
      "# Execution report\n",
      "utf8",
    );
    assert.equal(completeStage(root, "04_execute").run.current_stage, "05_review");

    const nextRun = JSON.parse(fs.readFileSync(runPath, "utf8"));
    nextRun.current_stage = "06_compound";
    writeJson(runPath, nextRun);
    fs.writeFileSync(
      path.join(featureRoot, "stages", "06_compound", "output", "compounding.md"),
      "# Compounding\n",
      "utf8",
    );
    const completed = completeStage(root, "06_compound", { now: "2026-08-24T11:00:00.000Z" });
    assert.equal(completed.run.current_stage, "complete");
    assert.equal(completed.run.completed_at, "2026-08-24T11:00:00.000Z");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("v2 takes precedence over inactive mirrors while active legacy handoffs produce a conflict", () => {
  const root = makeRepo();
  try {
    writeJson(path.join(root, ".pulse", "state.json"), {
      active_feature: "old-complete",
      next_action: "",
    });
    assert.equal(detectPulseRuntime(root).kind, "legacy-v1");

    initIcmRun(root, "new-run", "Start v2.");
    assert.equal(detectPulseRuntime(root).kind, "icm-v2");

    writeJson(path.join(root, ".pulse", "handoffs", "manifest.json"), {
      schema_version: "1.0",
      active: [{ owner: "legacy-worker", file: ".pulse/handoffs/legacy-worker.json" }],
    });
    const conflict = detectPulseRuntime(root);
    assert.equal(conflict.kind, "conflict");
    assert.match(conflict.reason, /legacy handoff/i);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("packaged pulse_status dispatches v2 without writing legacy mirrors", () => {
  const root = makeRepo();
  try {
    initIcmRun(root, "status-dispatch", "Render v2 status.");
    const stdout = execFileSync(
      "node",
      [
        path.join(REPO_ROOT, "skills", "using-pulse", "scripts", "pulse_status.mjs"),
        "--repo-root",
        root,
        "--json",
        "--sync",
      ],
      { encoding: "utf8" },
    );
    const status = JSON.parse(stdout);
    assert.equal(status.runtime, "icm-v2");
    assert.equal(status.current_stage, "01_explore");
    assert.equal(status.next_skill, "pulse:exploring");
    for (const legacyMirror of ["state.json", "STATE.md", "current-feature.json", "runtime-snapshot.json"]) {
      assert.equal(fs.existsSync(path.join(root, ".pulse", legacyMirror)), false);
    }
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("explicit onboarding of an active v2 run installs helpers without legacy state", () => {
  const root = makeRepo();
  try {
    initIcmRun(root, "v2-onboarding", "Install optional helpers.");
    const applied = applyRepo(root, false);
    assert.equal(applied.result.status, "complete");
    assert.ok(fs.existsSync(path.join(root, ".pulse", "scripts", "pulse_icm.mjs")));
    assert.ok(fs.existsSync(path.join(root, ".pulse", "scripts", "pulse_status.mjs")));
    for (const legacyMirror of ["state.json", "STATE.md", "current-feature.json", "runtime-snapshot.json"]) {
      assert.equal(fs.existsSync(path.join(root, ".pulse", legacyMirror)), false);
    }
    assert.equal(fs.existsSync(path.join(root, ".pulse", "checkpoints")), false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("BDD B1: Given invalid graphs, when analyzed, then they are blocked and swarm-ineligible", () => {
  const invalidGraphs = [
    graph([node("A", ["MISSING"], ["src/a.ts"])]),
    graph([node("A", [], ["../outside.ts"])]),
    graph([
      node("A", ["B"], ["src/a.ts"]),
      node("B", ["A"], ["src/b.ts"]),
    ]),
  ];

  for (const invalidGraph of invalidGraphs) {
    const analysis = analyzeWorkGraph(invalidGraph);
    assert.equal(analysis.valid, false);
    assert.equal(analysis.recommendation, "blocked");
    assert.equal(analysis.swarm_eligible, false);
    assert.equal(analysis.max_workers, 0);
  }
});

test("BDD B5: Given five independent components, when analyzed, then swarm stays capped at four", () => {
  const capped = analyzeWorkGraph(graph([
    node("A", [], ["src/a.ts"]),
    node("B", [], ["src/b.ts"]),
    node("C", [], ["src/c.ts"]),
    node("D", [], ["src/d.ts"]),
    node("E", [], ["src/e.ts"]),
  ]));
  assert.equal(capped.recommendation, "single-worker");
  assert.equal(capped.swarm_eligible, true);
  assert.equal(capped.max_workers, 4);
});

test("BDD B8: Given independent work, when single-worker is approved, then the root remains the sole worker", () => {
  const root = makeRepo();
  try {
    initIcmRun(root, "single-root", "Keep execution root-owned.");
    const featureRoot = path.join(root, "history", "single-root");
    const runPath = path.join(featureRoot, "run.json");
    const run = JSON.parse(fs.readFileSync(runPath, "utf8"));
    run.current_stage = "03_validate";
    writeJson(runPath, run);
    writeJson(
      path.join(featureRoot, "stages", "02_plan", "output", "work-graph.json"),
      graph([node("A", [], ["src/a.ts"]), node("B", [], ["src/b.ts"])]),
    );
    writeJson(
      path.join(featureRoot, "stages", "03_validate", "output", "validation.json"),
      { schema_version: "1.0", status: "ready" },
    );

    const approved = approveGate(root, "GATE_3", { strategy: "single-worker" });
    assert.equal(approved.run.execution.recommendation, "single-worker");
    assert.equal(approved.run.execution.approved_strategy, "single-worker");
    assert.equal(approved.run.execution.max_workers, 1);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("BDD B9: Given lifecycle transitions, when the CLI responds, then hashes persist but leave routine stdout", () => {
  const root = makeRepo();
  try {
    initIcmRun(root, "quiet-hash", "Keep hash safety without narrating hashes.");
    const decisions = path.join(
      root,
      "history",
      "quiet-hash",
      "stages",
      "01_explore",
      "output",
      "decisions.md",
    );
    fs.writeFileSync(decisions, "# Decisions\n\nApproved direction.\n", "utf8");

    const stdout = execFileSync(
      "node",
      [
        path.join(REPO_ROOT, "workflow", "scripts", "pulse_icm.mjs"),
        "approve",
        "--repo-root",
        root,
        "--gate",
        "GATE_1",
      ],
      { encoding: "utf8" },
    );
    assert.doesNotMatch(stdout, /sha256/i);

    const persisted = JSON.parse(
      fs.readFileSync(path.join(root, "history", "quiet-hash", "run.json"), "utf8"),
    );
    assert.match(persisted.gates.GATE_1.artifacts[0].sha256, /^[a-f0-9]{64}$/u);

    persisted.current_stage = "04_execute";
    writeJson(path.join(root, "history", "quiet-hash", "run.json"), persisted);
    writeJson(path.join(root, "history", "quiet-hash", "stages", "02_plan", "output", "work-graph.json"), graph([node("A", [], ["src/a.ts"])]));
    writeJson(
      path.join(root, "history", "quiet-hash", "stages", "04_execute", "output", "execution-state.json"),
      { schema_version: "1.0", nodes: { A: "complete" } },
    );
    fs.writeFileSync(
      path.join(root, "history", "quiet-hash", "stages", "04_execute", "output", "execution-report.md"),
      "# Execution report\n",
      "utf8",
    );

    const completeStdout = execFileSync(
      "node",
      [
        path.join(REPO_ROOT, "workflow", "scripts", "pulse_icm.mjs"),
        "complete",
        "--repo-root",
        root,
        "--stage",
        "04_execute",
      ],
      { encoding: "utf8" },
    );
    assert.doesNotMatch(completeStdout, /sha256/i);
    assert.equal(JSON.parse(completeStdout).current_stage, "05_review");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

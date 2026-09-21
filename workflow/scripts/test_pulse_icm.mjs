#!/usr/bin/env node

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

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

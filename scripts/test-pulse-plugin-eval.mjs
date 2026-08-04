#!/usr/bin/env node

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..");
const evaluatorPath = path.join(scriptDir, "pulse-plugin-eval.mjs");

function runEvaluator(args) {
  return spawnSync(process.execPath, [evaluatorPath, ...args, "--json"], {
    cwd: repoRoot,
    encoding: "utf8",
  });
}

function prepareCase(root, caseName, mutateEvidence) {
  const iteration = `case-${caseName}`;
  const commonArgs = [
    "benchmark",
    "--workspace",
    root,
    "--iteration",
    iteration,
    "--eval-ids",
    "21",
  ];
  const prepared = runEvaluator(commonArgs);
  assert.equal(prepared.status, 0, prepared.stderr || prepared.stdout);

  const iterationPath = path.join(root, iteration);
  const evidencePath = path.join(iterationPath, "benchmark-evidence.json");
  const evidence = JSON.parse(fs.readFileSync(evidencePath, "utf8"));
  evidence.runner = {
    mode: "chat",
    label: "evaluator regression",
    model_id: "test-model",
    model_version: "1.0",
    reasoning_effort: "low",
    runtime: "node:test",
  };
  mutateEvidence(evidence);
  fs.writeFileSync(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, "utf8");

  const result = runEvaluator([...commonArgs, "--evidence", evidencePath]);
  return {
    result,
    output: JSON.parse(result.stdout),
    iterationPath,
    reviewPath: path.join(root, "pulse-eval-review.html"),
  };
}

function assertNoFinalArtifacts(run) {
  assert.equal(fs.existsSync(path.join(run.iterationPath, "benchmark.json")), false);
  assert.equal(fs.existsSync(path.join(run.iterationPath, "benchmark.md")), false);
  assert.equal(fs.existsSync(run.reviewPath), false);
}

test("evaluator rejects a selected scenario with no response or verdict", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "pulse-eval-test-"));
  try {
    const run = prepareCase(root, "pending", () => {});
    assert.equal(run.result.status, 1);
    assert.equal(run.output.status, "FAIL");
    assert.equal(run.output.benchmark.mode, "rejected");
    assertNoFinalArtifacts(run);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("evaluator rejects a response without a valid verdict", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "pulse-eval-test-"));
  try {
    const run = prepareCase(root, "partial", (evidence) => {
      evidence.scenarios[0].response = "A real response without a completed judge.";
    });
    assert.equal(run.result.status, 1);
    assert.equal(run.output.benchmark.mode, "rejected");
    assertNoFinalArtifacts(run);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("evaluator finalizes complete passing evidence", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "pulse-eval-test-"));
  try {
    const run = prepareCase(root, "pass", (evidence) => {
      evidence.scenarios[0].response = "Complete passing response.";
      evidence.scenarios[0].judge = {
        passed: true,
        score: 1,
        summary: "All frozen expectations passed.",
        satisfied: evidence.scenarios[0].expectations,
        missed: [],
        warnings: [],
      };
    });
    assert.equal(run.result.status, 0, run.result.stderr || run.result.stdout);
    assert.equal(run.output.benchmark.mode, "finalized");
    assert.equal(fs.existsSync(path.join(run.iterationPath, "benchmark.json")), true);
    assert.equal(fs.existsSync(path.join(run.iterationPath, "benchmark.md")), true);
    assert.equal(fs.existsSync(run.reviewPath), true);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("evaluator publishes complete failing evidence but returns failure", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "pulse-eval-test-"));
  try {
    const run = prepareCase(root, "fail", (evidence) => {
      evidence.scenarios[0].response = "Complete response with a behavioral miss.";
      evidence.scenarios[0].judge = {
        passed: false,
        score: 0,
        summary: "One frozen expectation failed.",
        satisfied: [],
        missed: evidence.scenarios[0].expectations,
        warnings: [],
      };
    });
    assert.equal(run.result.status, 1);
    assert.equal(run.output.status, "FAIL");
    assert.equal(run.output.benchmark.mode, "finalized");
    assert.equal(fs.existsSync(path.join(run.iterationPath, "benchmark.json")), true);
    assert.equal(fs.existsSync(path.join(run.iterationPath, "benchmark.md")), true);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

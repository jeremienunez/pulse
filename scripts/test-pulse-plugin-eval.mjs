#!/usr/bin/env node

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { buildPluginDist } from "./build-plugin-dist.mjs";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..");
const evaluatorPath = path.join(scriptDir, "pulse-plugin-eval.mjs");

test("packaged evaluator requires the Tuned fork and its explicit distribution branch", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "pulse-source-sync-"));
  try {
    const dist = path.join(root, "plugin");
    buildPluginDist(repoRoot, dist);
    const catalogPath = path.join(dist, ".agents/plugins/marketplace.json");
    const catalog = JSON.parse(fs.readFileSync(catalogPath, "utf8"));
    for (const [source, expected] of [
      [{ source: "url", url: "https://github.com/jeremienunez/pulse.git", ref: "tuned/main" }, "PASS"],
      [{ source: "url", url: "https://github.com/quanpersie2001/pulse.git", ref: "tuned/main" }, "WARN"],
      [{ source: "url", url: "https://github.com/jeremienunez/pulse.git", ref: "main" }, "WARN"],
      [{ source: "url", url: "https://github.com/jeremienunez/pulse.git" }, "WARN"],
      [{ source: "local", path: "./" }, "WARN"],
    ]) {
      catalog.plugins.find((entry) => entry.name === "pulse").source = source;
      fs.writeFileSync(catalogPath, JSON.stringify(catalog));
      const out = spawnSync(process.execPath, [path.join(dist, "scripts/pulse-plugin-eval.mjs"), "analyze", "--json"], { cwd: dist, encoding: "utf8" });
      assert.ok(out.stdout, out.stderr);
      const check = JSON.parse(out.stdout).checks.find((entry) => entry.name === "codex-marketplace-source");
      assert.equal(check?.status, expected, JSON.stringify(source));
    }
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test("packaged evaluator accepts only same-release Codex cache metadata", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "pulse-version-sync-"));
  try {
    const dist = path.join(root, "plugin");
    buildPluginDist(repoRoot, dist);
    const manifestPath = path.join(dist, ".codex-plugin/plugin.json");
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    const release = manifest.version;
    for (const [version, expected] of [
      [release, "PASS"],
      [`${release}+codex.20261009114442`, "PASS"],
      [`${release}+codex.invalid`, "WARN"],
      ["999.0.0+codex.20261009114442", "WARN"],
    ]) {
      fs.writeFileSync(manifestPath, JSON.stringify({ ...manifest, version }));
      const out = spawnSync(process.execPath, [path.join(dist, "scripts/pulse-plugin-eval.mjs"), "analyze", "--json"], { cwd: dist, encoding: "utf8" });
      const report = JSON.parse(out.stdout);
      const check = report.checks.find(entry => entry.name === "version-sync");
      assert.ok(check, out.stdout);
      assert.equal(check.status, expected, version);
    }
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("creative command rejects incomplete input with its own typed error and no legacy outputs", () => {
  const out = spawnSync(process.execPath, [evaluatorPath, "creative", "--phase", "prepare", "--json"], { cwd: os.tmpdir(), encoding: "utf8" });
  assert.equal(out.status, 1);
  const value = JSON.parse(out.stdout);
  assert.equal(value.kind, "pulse-creative-error");
  assert.equal(value.promotion_eligible, false);
});

function runEvaluator(args) {
  return spawnSync(process.execPath, [evaluatorPath, ...args, "--json"], {
    cwd: repoRoot,
    encoding: "utf8",
  });
}

function prepareCase(root, caseName, mutateEvidence, options = {}) {
  const iteration = `case-${caseName}`;
  const evalIds = options.evalIds || "21";
  const commonArgs = [
    "benchmark",
    "--workspace",
    root,
    "--iteration",
    iteration,
    "--eval-ids",
    evalIds,
    "--execution-kind",
    "fixture",
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
  for (const entry of evidence.scenarios) {
    if (!entry.response || !entry.judge) continue;
    entry.criterion_results = entry.criteria.map(criterion => ({
      criterion_id: criterion.criterion_id,
      verdict: entry.judge.missed?.includes(criterion.expectation) ? "fail" : "pass",
      quote: entry.response,
      reason: "Explicit structural fixture verdict; not a model result.",
    }));
  }
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
    const benchmark = JSON.parse(fs.readFileSync(path.join(run.iterationPath,"benchmark.json"),"utf8"));
    assert.equal(benchmark.schemaVersion,4);
    assert.equal(benchmark.promotion_eligible,false);
    assert.equal(benchmark.qualification.status,"diagnostic");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("prepared runner packet supplies exact guidance without the test oracle", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "pulse-eval-test-"));
  try {
    const result = runEvaluator(["benchmark","--workspace",root,"--iteration","blind","--eval-ids","21"]);
    assert.equal(result.status,0,result.stderr);
    const directory=path.join(root,"blind");
    const packets=JSON.parse(fs.readFileSync(path.join(directory,"runner-packet.json"),"utf8"));
    const request=JSON.parse(packets.cases[0].request);
    assert.equal(request.guidance[0].content,fs.readFileSync(path.join(repoRoot,"skills/preflight/SKILL.md"),"utf8"));
    assert.equal("expectations" in request,false);
    assert.equal("expected_output" in request,false);
    assert.equal("criteria" in request,false);
    assert.ok(fs.existsSync(path.join(directory,"judge-packet.json")));
    assert.notEqual(packets.cases[0].submitted_request_sha256,"");
    const again=runEvaluator(["benchmark","--workspace",root,"--iteration","blind","--eval-ids","21"]);
    assert.equal(again.status,1);
  } finally { fs.rmSync(root,{recursive:true,force:true}); }
});

test("legacy audit uses a new workspace and preserves the original evidence bytes", () => {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),"pulse-legacy-audit-"));
  try {
    const original=path.join(root,"original"),audit=path.join(root,"audit");
    const args=["benchmark","--iteration","historical","--eval-ids","21","--legacy-audit"];
    const prepared=runEvaluator([...args,"--workspace",original]);
    assert.equal(prepared.status,0,prepared.stderr);
    const evidencePath=JSON.parse(prepared.stdout).benchmark.evidencePath;
    const evidence=JSON.parse(fs.readFileSync(evidencePath,"utf8"));
    assert.equal(evidence.schemaVersion,3);
    evidence.runner={mode:"chat",model_id:"historical-fixture",model_version:"fixture-version",reasoning_effort:"low",runtime:"node:test"};
    evidence.scenarios[0].response="Historical structural fixture, no model run.";
    evidence.scenarios[0].judge={passed:true,summary:"Explicit fixture.",satisfied:evidence.scenarios[0].expectations,missed:[]};
    fs.writeFileSync(evidencePath,JSON.stringify(evidence));
    const before=fs.readFileSync(evidencePath);
    const finalized=runEvaluator([...args,"--workspace",audit,"--evidence",evidencePath]);
    assert.equal(finalized.status,0,finalized.stderr||finalized.stdout);
    assert.deepEqual(fs.readFileSync(evidencePath),before);
    const benchmark=JSON.parse(fs.readFileSync(JSON.parse(finalized.stdout).benchmark.benchmarkJsonPath,"utf8"));
    assert.equal(benchmark.audit_only,true);assert.equal(benchmark.promotion_eligible,false);
    assert.equal(runEvaluator([...args,"--workspace",audit,"--evidence",evidencePath]).status,1);
  } finally {fs.rmSync(root,{recursive:true,force:true});}
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

test("evaluator rejects evidence not bound to the exact schema and corpus", async (t) => {
  const cases = [
    ["kind", (evidence) => { evidence.kind = "other-evidence"; }, "21"],
    ["schema", (evidence) => { evidence.schemaVersion = 2; }, "21"],
    ["iteration", (evidence) => { evidence.iteration = "case-old"; }, "21"],
    ["config", (evidence) => { evidence.config_path = "other-config.json"; }, "21"],
    ["source", (evidence) => { evidence.scenario_source = "other-evals.json"; }, "21"],
    ["selected-ids", (evidence) => { evidence.selected_scenario_ids.reverse(); }, "21,2"],
    ["scenario-digest", (evidence) => { evidence.scenario_digest = "sha256:stale"; }, "21"],
    ["duplicate-ids", (evidence) => { evidence.scenarios.push({ ...evidence.scenarios[0] }); }, "21"],
  ];

  for (const [name, mutateEvidence, evalIds] of cases) {
    await t.test(name, () => {
      const root = fs.mkdtempSync(path.join(os.tmpdir(), "pulse-eval-test-"));
      try {
        const run = prepareCase(root, `binding-${name}`, mutateEvidence, { evalIds });
        assert.equal(run.result.status, 1);
        assert.equal(run.output.status, "FAIL");
        assert.equal(run.output.benchmark.mode, "rejected");
        assertNoFinalArtifacts(run);
      } finally {
        fs.rmSync(root, { recursive: true, force: true });
      }
    });
  }
});

test("evaluator rejects a modified prompt and oracle despite an unchanged corpus header", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "pulse-eval-test-"));
  try {
    const run = prepareCase(root, "prompt-divergence", (evidence) => {
      const entry = evidence.scenarios[0];
      entry.prompt = "A different prompt was presented.";
      entry.expected_output = "A different oracle.";
      entry.response = "Complete passing response.";
      entry.judge = { passed: true, summary: "Passing fixture.", satisfied: entry.expectations, missed: [] };
    });
    assert.equal(run.result.status, 1);
    assert.equal(run.output.benchmark.mode, "rejected");
    assertNoFinalArtifacts(run);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("evaluator rejects success when required expectations are reported missed", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "pulse-eval-test-"));
  try {
    const run = prepareCase(root, "contradictory-judge", (evidence) => {
      const entry = evidence.scenarios[0];
      entry.response = "Complete response with missed behavior.";
      entry.judge = { passed: true, score: 0, summary: "Contradictory fixture.", satisfied: [], missed: entry.expectations };
    });
    assert.equal(run.result.status, 1);
    assert.equal(run.output.benchmark.mode, "rejected");
    assertNoFinalArtifacts(run);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

#!/usr/bin/env node

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const REPO_ROOT = fileURLToPath(new URL("../../", import.meta.url));

test("canonical workflow declares exactly six numbered stages and four gates", () => {
  const graph = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, "workflow", "graph.json"), "utf8"));
  assert.equal(graph.schema_version, "1.0");
  assert.deepEqual(graph.stages.map((stage) => stage.id), [
    "01_explore",
    "02_plan",
    "03_validate",
    "04_execute",
    "05_review",
    "06_compound",
  ]);
  assert.deepEqual(
    graph.stages.filter((stage) => stage.gate_after).map((stage) => stage.gate_after),
    ["GATE_1", "GATE_2", "GATE_3", "GATE_4"],
  );
  assert.equal(graph.manual_diagnostics.includes("pulse:preflight"), true);
  assert.equal(graph.execution_strategies.includes("pulse:swarming"), true);
});

test("every canonical stage contract exposes Inputs, Process, Outputs, and Exit", () => {
  const graph = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, "workflow", "graph.json"), "utf8"));
  for (const stage of graph.stages) {
    const contract = fs.readFileSync(path.join(REPO_ROOT, stage.contract), "utf8");
    for (const heading of ["## Inputs", "## Process", "## Outputs", "## Exit"]) {
      assert.match(contract, new RegExp(`^${heading}$`, "m"), `${stage.id} missing ${heading}`);
    }
  }
});

test("generated core skills dispatch v2 without loading frozen legacy guidance", () => {
  execFileSync("node", [path.join(REPO_ROOT, "scripts", "build-workflow-skills.mjs"), "--check"], {
    cwd: REPO_ROOT,
    encoding: "utf8",
  });

  for (const skill of [
    "using-pulse",
    "exploring",
    "planning",
    "validating",
    "executing",
    "reviewing",
    "compounding",
  ]) {
    const skillRoot = path.join(REPO_ROOT, "skills", skill);
    const generated = fs.readFileSync(path.join(skillRoot, "SKILL.md"), "utf8");
    assert.match(generated, /GENERATED FROM PULSE ICM WORKFLOW/);
    assert.match(generated, /references\/legacy-v1\.md/);
    assert.ok(fs.existsSync(path.join(skillRoot, "references", "legacy-v1.md")));
  }

  const usingPulse = fs.readFileSync(path.join(REPO_ROOT, "skills", "using-pulse", "SKILL.md"), "utf8");
  assert.match(usingPulse, /Do not invoke `pulse:preflight` unless the user explicitly requests it\./);
  assert.match(usingPulse, /active ICM v2 run/);

  const validating = fs.readFileSync(path.join(REPO_ROOT, "skills", "validating", "SKILL.md"), "utf8");
  assert.match(validating, /weakly connected components/i);
  assert.match(validating, /Gate 3/i);

  const executing = fs.readFileSync(path.join(REPO_ROOT, "skills", "executing", "SKILL.md"), "utf8");
  assert.match(executing, /approved_strategy/);
  assert.match(executing, /pulse:swarming/);
});

test("workflow schemas and graph JSON parse cleanly", () => {
  for (const file of [
    "workflow/graph.json",
    "workflow/skill-adapters.json",
    "workflow/schemas/run.schema.json",
    "workflow/schemas/work-graph.schema.json",
    "workflow/schemas/validation.schema.json",
    "workflow/schemas/execution-state.schema.json",
    "workflow/schemas/review.schema.json",
  ]) {
    assert.doesNotThrow(() => JSON.parse(fs.readFileSync(path.join(REPO_ROOT, file), "utf8")), file);
  }
});

test("BDD B11-B13: v2 contracts keep execution root-owned and reject unjustified machinery", () => {
  const planning = fs.readFileSync(path.join(REPO_ROOT, "workflow", "stages", "02_plan", "CONTEXT.md"), "utf8");
  const validating = fs.readFileSync(path.join(REPO_ROOT, "workflow", "stages", "03_validate", "CONTEXT.md"), "utf8");
  const executing = fs.readFileSync(path.join(REPO_ROOT, "workflow", "stages", "04_execute", "CONTEXT.md"), "utf8");
  const reviewing = fs.readFileSync(path.join(REPO_ROOT, "workflow", "stages", "05_review", "CONTEXT.md"), "utf8");
  const guidanceFiles = [path.join(REPO_ROOT, "AGENTS.template.md")];
  const repoAgents = path.join(REPO_ROOT, "AGENTS.md");
  if (fs.existsSync(repoAgents)) {
    guidanceFiles.push(repoAgents);
  }
  const guidanceDocuments = guidanceFiles.map((file) => fs.readFileSync(file, "utf8"));

  assert.match(
    planning,
    /avoid building.*reuse existing code.*standard library.*native platform.*installed dependenc.*minimal local code/isu,
  );
  assert.match(validating, /swarm eligibility/iu);
  assert.match(validating, /cost-first default.*single-worker/isu);
  assert.match(validating, /status: revise.*simpler alternative.*missing evidence/isu);
  assert.match(executing, /single-worker.*do not spawn/isu);
  assert.match(reviewing, /root-owned.*default/isu);
  assert.match(reviewing, /specialist agents.*explicit operator request/isu);
  assert.match(reviewing, /deletable complexity/iu);

  for (const guidance of guidanceDocuments) {
    assert.match(guidance, /scenario-first BDD/iu);
    assert.match(guidance, /root-owned.*review/isu);
  }
});

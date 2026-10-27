import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { listTargets, normalizeOutput, prepareRequest, runRequest } from "../skills/cli-bridge/scripts/cli_bridge.mjs";

const fakeCli = `#!/usr/bin/env node
const fs = require('node:fs'), path = require('node:path');
const name = path.basename(process.argv[1]), args = process.argv.slice(2);
let prompt = name === 'codex' ? fs.readFileSync(0, 'utf8') : args[args.indexOf('--print') + 1];
if (prompt.includes('fixture:timeout')) { setInterval(() => {}, 1000); }
else if (prompt.includes('fixture:overflow')) { process.stdout.write('x'.repeat(3 * 1024 * 1024)); }
else {
 let answer = prompt;
 if (prompt.includes('fixture:write')) {
  try { fs.writeFileSync(path.join(process.cwd(),'changed.txt'),'authorized isolated work'); answer = 'write succeeded'; }
  catch (error) { answer = 'write refused: ' + error.code; }
 }
 let output;
 if (name === 'codex') output = JSON.stringify({type:'item.completed',item:{type:'agent_message',text:answer}})+'\\n'+JSON.stringify({type:'turn.completed'})+'\\n';
 else if (name === 'claude') output = JSON.stringify({type:'result',is_error:false,result:answer,permission_denials:[]});
 else output = JSON.stringify({status:'SUCCESS',response:answer});
 if (prompt.includes('fixture:unicode')) {
  output = JSON.stringify({status:'SUCCESS',response:'préservé 🧪'});
  const bytes = Buffer.from(output), index = bytes.indexOf(Buffer.from('🧪')) + 1;
  process.stdout.write(bytes.subarray(0,index));setTimeout(()=>process.stdout.write(bytes.subarray(index)),15);
 } else process.stdout.write(output);
}
`;

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "pulse-cli-bridge-"));
  const bin = path.join(root, "bin"), cwd = path.join(root, "project"), owner = path.join(root, "owner");
  for (const p of [bin, cwd, owner]) fs.mkdirSync(p);
  for (const name of ["agy", "claude", "codex", "gemini", "opencode"]) fs.writeFileSync(path.join(bin, name), fakeCli, { mode: 0o755 });
  const env = { ...process.env, PATH: `${bin}${path.delimiter}${process.env.PATH}`, PULSE_CLI_BRIDGE_CHAIN: "" };
  const request = (target, prompt = "Review supplied data", name = target) => ({ caller: target === "codex" ? "claude" : "codex", target, cwd, prompt, output_dir: path.join(root, "calls", name), timeout_ms: 5000 });
  return { root, cwd, owner, env, request, cleanup: () => fs.rmSync(root, { recursive: true, force: true }) };
}

test("three maintained CLI adapters pass prompts as data and keep task acceptance with the caller", async () => {
  const f = fixture();
  try {
    for (const target of ["antigravity", "claude", "codex"]) {
      const request = f.request(target);
      const marker = path.join(request.output_dir, "injected");
      const attack = `Literal $(touch ${marker}) and backticks: \`touch ${marker}\``;
      request.prompt = attack;
      const result = await runRequest(request, { env: f.env, ownerCwd: f.owner });
      assert.equal(result.status, "completed", fs.readFileSync(path.join(request.output_dir, "stderr.log"), "utf8"));
      assert.ok(result.response.includes(attack));
      assert.equal(result.task_verified, false);
      assert.equal(result.retry_performed, false);
      assert.equal(fs.existsSync(marker), false);
      assert.equal(result.filesystem.project, "read-only");
      assert.equal(fs.statSync(path.join(request.output_dir, "request.json")).mode & 0o777, 0o600);
    }
  } finally { f.cleanup(); }
});

test("consult filesystem refuses writes while explicitly isolated work permits the authorized file", async () => {
  const f = fixture();
  try {
    const consult = await runRequest(f.request("antigravity", "fixture:write", "read-only"), { env: f.env, ownerCwd: f.owner });
    assert.match(consult.response, /write refused: (?:EROFS|EACCES)/u);
    assert.equal(fs.existsSync(path.join(f.cwd, "changed.txt")), false);
    const request = { ...f.request("antigravity", "fixture:write", "work"), mode: "work" };
    assert.throws(() => prepareRequest(request, { env: f.env, ownerCwd: f.cwd }), /separate workspace/u);
    const work = await runRequest(request, { env: f.env, ownerCwd: f.owner });
    assert.equal(work.status, "completed");
    assert.equal(work.task_verified, false);
    assert.equal(fs.readFileSync(path.join(f.cwd, "changed.txt"), "utf8"), "authorized isolated work");
  } finally { f.cleanup(); }
});

test("submitted operations are preserved and cannot be replayed after a timeout", async () => {
  const f = fixture();
  try {
    const request = { ...f.request("antigravity", "fixture:timeout"), timeout_ms: 250 };
    const result = await runRequest(request, { env: f.env, ownerCwd: f.owner });
    assert.equal(result.status, "timed_out");
    assert.equal(result.effect_uncertain, true);
    const before = fs.readFileSync(path.join(request.output_dir, "request.json"));
    await assert.rejects(runRequest(request, { env: f.env, ownerCwd: f.owner }), /EEXIST/u);
    assert.ok(before.equals(fs.readFileSync(path.join(request.output_dir, "request.json"))));
    assert.equal(JSON.parse(fs.readFileSync(path.join(request.output_dir, "result.json"))).status, "timed_out");
  } finally { f.cleanup(); }
});

test("cycles, malformed chains, depth overflow and arbitrary executable arguments are rejected before submission", () => {
  const f = fixture();
  try {
    const request = f.request("claude");
    assert.throws(() => prepareRequest(request, { env: { ...f.env, PULSE_CLI_BRIDGE_CHAIN: '["claude","codex"]' } }), /cycle/u);
    assert.throws(() => prepareRequest(request, { env: { ...f.env, PULSE_CLI_BRIDGE_CHAIN: '["antigravity"]' } }), /match/u);
    assert.throws(() => prepareRequest(f.request("deepseek"), { env: { ...f.env, PULSE_CLI_BRIDGE_CHAIN: '["claude","antigravity","claude","codex"]' } }), /depth/u);
    assert.throws(() => prepareRequest({ ...request, extra_args: ["--dangerously-skip-permissions"] }, { env: f.env }), /Unknown request field/u);
    assert.equal(fs.existsSync(request.output_dir), false);
  } finally { f.cleanup(); }
});

test("DeepSeek retains its direct MCP route without spawning another provider", async () => {
  const f = fixture();
  try {
    for (const [target, server] of [["deepseek", "deepseek-coder"]]) {
      const request = f.request(target);
      const result = await runRequest(request, { env: f.env, ownerCwd: f.owner });
      assert.equal(result.status, "requires_mcp");
      assert.equal(result.route.server, server);
      assert.equal(fs.existsSync(request.output_dir), false);
    }
    assert.deepEqual(listTargets({ env: f.env }).targets.map(t => t.target), ["antigravity", "claude", "codex", "deepseek"]);
  } finally { f.cleanup(); }
});

test("output flooding is bounded and cannot be confused with a complete response", async () => {
  const f = fixture();
  try {
    const request = f.request("antigravity", "fixture:overflow");
    const result = await runRequest(request, { env: f.env, ownerCwd: f.owner });
    assert.equal(result.status, "output_limit");
    assert.equal(result.effect_uncertain, true);
    assert.ok(fs.statSync(path.join(request.output_dir, "stdout.log")).size <= 2 * 1024 * 1024);
  } finally { f.cleanup(); }
});

test("UTF-8 characters split across process chunks remain intact", async () => {
  const f = fixture();
  try {
    const result = await runRequest(f.request("antigravity", "fixture:unicode"), { env: f.env, ownerCwd: f.owner });
    assert.equal(result.response, "préservé 🧪");
  } finally { f.cleanup(); }
});

test("status normalization distinguishes partial denial and process success from task verification", () => {
  const envelope = (value) => ({ stdout: JSON.stringify(value), exitCode: 0 });
  const denied = normalizeOutput("antigravity", { ...envelope({ status: "SUCCESS", response: "Tests could not run" }), stderr: "run_command soft-denied" });
  assert.equal(denied.status, "denied"); assert.equal(denied.task_verified, false);
  assert.equal(normalizeOutput("claude", envelope({ type: "result", is_error: false, result: "text", permission_denials: [{ tool_name: "Bash" }] })).status, "denied");
  assert.equal(normalizeOutput("antigravity", envelope({ status: "ERROR", response: "partial", error: "failed" })).status, "failed");
  assert.equal(normalizeOutput("antigravity", { ...envelope({ status: "SUCCESS", response: "text" }), exitCode: 1 }).status, "failed");
  const partial = normalizeOutput("codex", { stdout: JSON.stringify({ type: "item.completed", item: { type: "agent_message", text: "partial" } }), exitCode: 0 });
  assert.equal(partial.status, "invalid_output"); assert.equal(partial.response, "partial"); assert.equal(partial.effect_uncertain, true);
  assert.equal(normalizeOutput("antigravity", { stdout: '{"status":', exitCode: 0 }).status, "invalid_output");
});

test("native Antigravity denied_actions overrides SUCCESS and preserves uncertainty and partial output", () => {
  for (const response of ["", "Some steps completed before the refusal"]) {
    const result = normalizeOutput("antigravity", {
      stdout: JSON.stringify({ status: "SUCCESS", response, denied_actions: [{ action: "read_file", display_name: "ReadFile" }] }), exitCode: 0,
    });
    assert.equal(result.status, "denied");
    assert.equal(result.tool_denied, true);
    assert.equal(result.effect_uncertain, true);
    assert.equal(result.task_verified, false);
    assert.equal(result.response, response);
    assert.equal(result.exit_code, 0);
  }
});

test("native Antigravity refusal keeps terminal process evidence", () => {
  const result = normalizeOutput("antigravity", {
    stdout: JSON.stringify({ status: "ERROR", response: "partial", denied_actions: [{ action: "run_command" }] }), exitCode: 3, signal: "SIGTERM",
  });
  assert.equal(result.status, "denied");
  assert.equal(result.effect_uncertain, true);
  assert.equal(result.response, "partial");
  assert.equal(result.exit_code, 3);
  assert.equal(result.signal, "SIGTERM");
});

test("empty or malformed Antigravity denied_actions does not invent a refusal", () => {
  for (const denied_actions of [undefined, [], {}, "denied"]) {
    const result = normalizeOutput("antigravity", { stdout: JSON.stringify({ status: "SUCCESS", response: "ok", denied_actions }), exitCode: 0 });
    assert.equal(result.status, "completed");
    assert.equal(result.tool_denied, false);
    assert.equal(result.effect_uncertain, false);
  }
});

test("retired CLI names and aliases are rejected even when matching binaries exist in PATH", async () => {
  const f = fixture();
  try {
    for (const target of ["gemini", "gemini-cli", "opencode", "opencode-models"]) {
      const request = f.request(target);
      assert.throws(() => prepareRequest(request, { env: f.env }), /Unknown caller or target/u);
      await assert.rejects(runRequest(request, { env: f.env, ownerCwd: f.owner }), /Unknown caller or target/u);
      assert.throws(() => normalizeOutput(target, { stdout: '{"response":"text"}', exitCode: 0 }), /Unsupported/u);
      assert.equal(fs.existsSync(request.output_dir), false);
    }
    assert.throws(() => prepareRequest({ ...f.request("claude"), caller: "gemini" }, { env: f.env }), /Unknown caller/u);
  } finally { f.cleanup(); }
});

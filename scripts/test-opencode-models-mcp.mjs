#!/usr/bin/env node
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const serverPath = fileURLToPath(new URL("./opencode-models-mcp.mjs", import.meta.url));

test("stdio MCP discovers tools and preserves its client/session headers across transport paths offline", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "pulse-opencode-offline-"));
  try {
    const capture = path.join(root, "requests.jsonl");
    const auth = path.join(root, "auth.json");
    fs.writeFileSync(auth, JSON.stringify({ opencode: { key: "fixture" }, "opencode-go": { key: "fixture" } }));
    const preload = path.join(root, "fetch-fixture.mjs");
    fs.writeFileSync(preload, `import fs from 'node:fs';
globalThis.fetch = async (url, options) => {
  const body = options.body ? JSON.parse(options.body) : null;
  fs.appendFileSync(${JSON.stringify(capture)}, JSON.stringify({ url, headers: options.headers, body })+String.fromCharCode(10));
  if(url.endsWith('/models')) return new Response(JSON.stringify({ data: [{ id: 'glm-fixture' }] }));
  if(url.endsWith('/responses') && body.model === 'glm-fixture') return new Response(JSON.stringify({ error: { message: 'Unsupported endpoint' } }), { status: 404 });
  if(url.endsWith('/chat/completions')) return new Response(JSON.stringify({ choices: [{ message: { content: 'CHAT_OK' } }] }));
  return new Response(JSON.stringify({ output_text: 'RESPONSES_OK' }));
};`);
    const messages = [
      { id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "offline-test", version: "1" } } },
      { id: 2, method: "tools/list" },
      { id: 3, method: "tools/call", params: { name: "list_models", arguments: { provider: "go" } } },
      { id: 4, method: "tools/call", params: { name: "ask_model", arguments: { model: "opencode-go/glm-fixture", prompt: "Bounded fixture", reasoning_effort: "low", max_output_tokens: 64 } } },
      { id: 5, method: "tools/call", params: { name: "ask_model", arguments: { model: "opencode-go/luna-fixture", prompt: "Bounded fixture", reasoning_effort: "low", max_output_tokens: 32 } } },
    ];
    const out = spawnSync(process.execPath, ["--import", preload, serverPath], {
      input: messages.map(message => JSON.stringify({ jsonrpc: "2.0", ...message })).join("\n")+"\n",
      encoding: "utf8", timeout: 10000, env: { ...process.env, OPENCODE_AUTH_PATH: auth },
    });
    assert.equal(out.status, 0, out.stderr);
    const results = new Map(out.stdout.trim().split("\n").map(line => { const value = JSON.parse(line); return [value.id, value.result]; }));
    assert.deepEqual(results.get(2).tools.map(tool => tool.name).sort(), ["ask_model", "compare_models", "list_models"]);
    assert.equal(results.get(4).structuredContent.api, "chat_completions");
    assert.equal(results.get(4).structuredContent.text, "CHAT_OK");
    assert.equal(results.get(5).structuredContent.api, "responses");
    assert.equal(results.get(5).structuredContent.text, "RESPONSES_OK");
    const requests = fs.readFileSync(capture, "utf8").trim().split("\n").map(line => JSON.parse(line));
    assert.equal(requests.length, 4);
    const sessions = new Set(requests.map(request => request.headers["x-opencode-session"]));
    assert.equal(sessions.size, 1);
    assert.match([...sessions][0], /^[a-f0-9-]{36}$/);
    for (const request of requests) assert.equal(request.headers["User-Agent"], "pulse-opencode-models/1.0.1");
    assert.equal(requests[2].body.reasoning_effort, "low");
    assert.equal(requests[3].body.reasoning.effort, "low");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

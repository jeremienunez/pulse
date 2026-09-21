#!/usr/bin/env node

import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const serverPath = fileURLToPath(new URL("./opencode-models-mcp.mjs", import.meta.url));

async function callAskModel(argumentsValue) {
  const child = spawn(process.execPath, [serverPath], {
    stdio: ["pipe", "pipe", "inherit"],
  });
  const responses = [];
  let buffered = "";

  child.stdout.setEncoding("utf8");
  child.stdout.on("data", (chunk) => {
    buffered += chunk;
    while (true) {
      const newline = buffered.indexOf("\n");
      if (newline < 0) break;
      const line = buffered.slice(0, newline).trim();
      buffered = buffered.slice(newline + 1);
      if (line) responses.push(JSON.parse(line));
    }
  });

  child.stdin.write(
    `${JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2025-06-18",
        capabilities: {},
        clientInfo: { name: "opencode-models-regression", version: "1" },
      },
    })}\n`,
  );
  child.stdin.write(
    `${JSON.stringify({
      jsonrpc: "2.0",
      id: 2,
      method: "tools/call",
      params: { name: "ask_model", arguments: argumentsValue },
    })}\n`,
  );
  child.stdin.end();

  const exitCode = await new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("close", resolve);
  });
  assert.equal(exitCode, 0, "MCP server must exit cleanly");
  const result = responses.find((message) => message.id === 2)?.result;
  assert.ok(result, "tools/call response is missing");
  assert.equal(result.isError ?? false, false, result.content?.[0]?.text);
  return result.structuredContent;
}

const glm = await callAskModel({
  model: "opencode-go/glm-5.3-flash",
  prompt: "Réponds uniquement par OK.",
  reasoning_effort: "low",
  max_output_tokens: 64,
  timeout_ms: 30_000,
});
assert.equal(glm.text, "OK");
assert.equal(glm.api, "chat_completions");

const luna = await callAskModel({
  model: "opencode-go/gpt-5.6-luna",
  prompt: "Réponds uniquement par OK.",
  reasoning_effort: "low",
  max_output_tokens: 32,
  timeout_ms: 30_000,
});
assert.equal(luna.text, "OK");
assert.equal(luna.api, "responses");

console.log("PASS: GLM uses Chat Completions fallback; Luna stays on Responses.");

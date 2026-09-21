#!/usr/bin/env node

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { buildPluginDist, comparePluginDist } from "./build-plugin-dist.mjs";

const REPO_ROOT = fileURLToPath(new URL("../", import.meta.url));

test("plugin distribution contains only reviewed runtime surfaces and a replayable manifest", () => {
  const outputRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pulse-dist-"));
  const output = path.join(outputRoot, "pulse");
  try {
    const result = buildPluginDist(REPO_ROOT, output);
    assert.equal(result.file_count > 20, true);
    for (const required of [
      ".codex-plugin/plugin.json",
      ".claude-plugin/plugin.json",
      ".mcp.json",
      "AGENTS.template.md",
      "skills/using-pulse/SKILL.md",
      "skills/using-pulse/scripts/pulse_icm.mjs",
      "skills/opencode-models/SKILL.md",
      "scripts/opencode-models-mcp.mjs",
      "workflow/graph.json",
      "workflow/stages/03_validate/CONTEXT.md",
      "dist-manifest.json",
    ]) {
      assert.ok(fs.existsSync(path.join(output, required)), required);
    }
    for (const excluded of [".git", ".gitnexus", ".pulse", ".beads", "history", "hooks"]) {
      assert.equal(fs.existsSync(path.join(output, excluded)), false, excluded);
    }

    const mcp = JSON.parse(fs.readFileSync(path.join(output, ".mcp.json"), "utf8"));
    assert.deepEqual(Object.keys(mcp.mcpServers).sort(), ["MCP_DOCKER", "gitnexus", "morph-mcp", "opencode-models"]);
    assert.deepEqual(mcp.mcpServers["opencode-models"].includeTools, ["list_models", "ask_model", "compare_models"]);
    assert.deepEqual(comparePluginDist(output, output), { ok: true, differences: [] });
  } finally {
    fs.rmSync(outputRoot, { recursive: true, force: true });
  }
});

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { buildAntigravityDist } from "./build-antigravity-dist.mjs";

const source = fileURLToPath(new URL("../", import.meta.url));

test("native package retains the full Pulse runtime and binds MCP to the final installation", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "pulse-agy-package-"));
  try {
    const output = path.join(root, "stage");
    const installed = path.join(root, "installed", "pulse");
    const result = buildAntigravityDist(source, output, { installRoot: installed });
    const manifest = JSON.parse(fs.readFileSync(path.join(output, "plugin.json")));
    assert.deepEqual(Object.keys(manifest).sort(), ["description", "name"]);
    assert.equal(manifest.name, "pulse");
    assert.equal(result.metadata.version, JSON.parse(fs.readFileSync(path.join(source, ".codex-plugin/plugin.json"))).version);
    assert.match(result.metadata.source_commit, /^[a-f0-9]{40,64}$/u);
    assert.match(result.metadata.source_snapshot_sha256, /^[a-f0-9]{64}$/u);
    const mcp = JSON.parse(fs.readFileSync(path.join(output, "mcp_config.json")));
    const canonical = JSON.parse(fs.readFileSync(path.join(source, ".mcp.json")));
    assert.deepEqual(Object.keys(mcp.mcpServers).sort(), Object.keys(canonical.mcpServers).sort());
    assert.deepEqual(mcp.mcpServers["opencode-models"].args, [path.join(installed, "scripts/opencode-models-mcp.mjs")]);
    assert.deepEqual(mcp.mcpServers.gitnexus, canonical.mcpServers.gitnexus);
    for (const entry of result.manifest.files) {
      const actual = createHash("sha256").update(fs.readFileSync(path.join(output, entry.path))).digest("hex");
      assert.equal(actual, entry.sha256, entry.path);
      assert.equal(/^(?:history|\.git|\.pulse|\.beads)\//u.test(entry.path), false, entry.path);
    }
    fs.cpSync(output, installed, { recursive: true });
    const owner = path.join(root, "project");
    fs.mkdirSync(owner);
    const status = spawnSync(process.execPath, [path.join(installed, "workflow/scripts/pulse_icm.mjs"), "status", "--repo-root", owner], {
      cwd: owner, encoding: "utf8", timeout: 10000,
    });
    assert.equal(status.status, 0, status.stderr);
    assert.equal(JSON.parse(status.stdout).runtime, "none");
    assert.ok(fs.existsSync(path.join(installed, "skills/using-pulse/SKILL.md")));
    assert.ok(fs.existsSync(mcp.mcpServers["opencode-models"].args[0]));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("existing output and invalid identities are rejected before overwriting user data", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "pulse-agy-preserve-"));
  try {
    const output = path.join(root, "existing");
    fs.mkdirSync(output);
    fs.writeFileSync(path.join(output, "user.txt"), "preserve me");
    assert.throws(() => buildAntigravityDist(source, output, { installRoot: path.join(root, "final") }), /already exists/u);
    assert.equal(fs.readFileSync(path.join(output, "user.txt"), "utf8"), "preserve me");
    const fresh = path.join(root, "fresh");
    assert.throws(() => buildAntigravityDist(source, fresh, { installRoot: "relative" }), /absolute/u);
    assert.throws(() => buildAntigravityDist(source, fresh, { installRoot: path.join(root, "final"), sourceCommit: "unknown" }), /commit/u);
    assert.equal(fs.existsSync(fresh), false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("a retired optional MCP can be excluded without changing the common Pulse source", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "pulse-agy-exclude-"));
  try {
    const output = path.join(root, "package");
    const before = fs.readFileSync(path.join(source, ".mcp.json"));
    const result = buildAntigravityDist(source, output, { installRoot: path.join(root, "final"), excludeMcpServers: ["opencode-models"] });
    const mcp = JSON.parse(fs.readFileSync(path.join(output, "mcp_config.json")));
    assert.equal(Object.hasOwn(mcp.mcpServers, "opencode-models"), false);
    assert.deepEqual(Object.keys(mcp.mcpServers).sort(), ["MCP_DOCKER", "gitnexus", "morph-mcp"]);
    assert.deepEqual(result.metadata.excluded_mcp_servers, ["opencode-models"]);
    assert.ok(before.equals(fs.readFileSync(path.join(source, ".mcp.json"))));
    assert.throws(() => buildAntigravityDist(source, path.join(root, "invalid"), { installRoot: root, excludeMcpServers: ["missing"] }), /existing canonical/u);
    assert.equal(fs.existsSync(path.join(root, "invalid")), false);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

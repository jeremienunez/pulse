import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { installCliBridge } from "./install-cli-bridge.mjs";

const source = fileURLToPath(new URL("../skills/cli-bridge/", import.meta.url));
function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "pulse-cli-install-"));
  return { root, source, dataRoot: path.join(root, "snapshots"), targets: { agents: path.join(root, "agents"), claude: path.join(root, "claude") } };
}

test("standalone installation carries every helper resource and works through discovery links", () => {
  const f = fixture();
  try {
    const planned = installCliBridge({ ...f, dryRun: true });
    assert.equal(fs.existsSync(f.dataRoot), false);
    const installed = installCliBridge(f);
    assert.equal(installed.snapshot, planned.snapshot);
    for (const root of Object.values(f.targets)) {
      const skill = path.join(root, "cli-bridge");
      assert.equal(fs.realpathSync(skill), installed.snapshot);
      assert.ok(fs.existsSync(path.join(skill, "references/transports.md")));
      const result = spawnSync(process.execPath, [path.join(skill, "scripts/cli_bridge.mjs"), "list"], { cwd: f.root, encoding: "utf8", timeout: 10000 });
      assert.equal(result.status, 0, result.stderr);
      assert.equal(JSON.parse(result.stdout).targets.some((t) => t.target === "antigravity"), true);
    }
    assert.equal(installCliBridge(f).digest, installed.digest);
  } finally { fs.rmSync(f.root, { recursive: true, force: true }); }
});

test("foreign skill content is preserved before any shared snapshot or other link is created", () => {
  const f = fixture();
  try {
    const foreign = path.join(f.targets.claude, "cli-bridge");
    fs.mkdirSync(foreign, { recursive: true });
    fs.writeFileSync(path.join(foreign, "user.txt"), "keep this work");
    assert.throws(() => installCliBridge(f), /Foreign skill destination preserved/u);
    assert.equal(fs.readFileSync(path.join(foreign, "user.txt"), "utf8"), "keep this work");
    assert.equal(fs.existsSync(f.dataRoot), false);
    assert.equal(fs.existsSync(f.targets.agents), false);
  } finally { fs.rmSync(f.root, { recursive: true, force: true }); }
});

test("an altered managed snapshot is detected and preserved rather than silently overwritten", () => {
  const f = fixture();
  try {
    const installed = installCliBridge(f);
    fs.writeFileSync(path.join(installed.snapshot, "scripts/cli_bridge.mjs"), "user alteration");
    assert.throws(() => installCliBridge(f), /differs/u);
    assert.equal(fs.readFileSync(path.join(installed.snapshot, "scripts/cli_bridge.mjs"), "utf8"), "user alteration");
  } finally { fs.rmSync(f.root, { recursive: true, force: true }); }
});

test("only maintained discovery roots are installed and the retired Gemini option is rejected", () => {
  const f = fixture();
  try {
    const script = fileURLToPath(new URL("./install-cli-bridge.mjs", import.meta.url));
    const result = spawnSync(process.execPath, [script, "--dry-run", "--source", source, "--data-root", f.dataRoot,
      "--agents-root", f.targets.agents, "--claude-root", f.targets.claude], { encoding: "utf8", timeout: 10000 });
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(JSON.parse(result.stdout).targets.map((t) => t.surface), ["agents", "claude"]);
    assert.equal(fs.existsSync(f.dataRoot), false);
    const preservedData = path.join(f.root, ".gemini");
    fs.mkdirSync(preservedData);
    const sentinel = path.join(preservedData, "antigravity-data.json");
    fs.writeFileSync(sentinel, "keep Antigravity credentials and history");
    const before = fs.statSync(sentinel);
    const rejected = spawnSync(process.execPath, [script, "--source", source, "--data-root", f.dataRoot,
      "--agents-root", f.targets.agents, "--claude-root", f.targets.claude, "--gemini-root", preservedData], { encoding: "utf8", timeout: 10000 });
    assert.equal(rejected.status, 1);
    assert.match(rejected.stderr, /Unknown option/u);
    assert.equal(fs.existsSync(f.dataRoot), false);
    assert.equal(fs.readFileSync(sentinel, "utf8"), "keep Antigravity credentials and history");
    assert.equal(fs.statSync(sentinel).mtimeMs, before.mtimeMs);
  } finally { fs.rmSync(f.root, { recursive: true, force: true }); }
});

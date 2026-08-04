#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const bumpScript = path.join(repoRoot, "scripts/bump-version.sh");
const surfacePaths = [
  ".claude-plugin/plugin.json",
  ".codex-plugin/plugin.json",
  ".agents/plugins/marketplace.json",
  ".claude-plugin/marketplace.json",
  "README.md",
];

function writeJson(targetPath, value, compact = false) {
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.writeFileSync(targetPath, compact ? JSON.stringify(value) : `${JSON.stringify(value, null, 2)}\n`);
}

function makeFixture({ compact = false, malformed = false } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "pulse-version-test-"));
  writeJson(path.join(root, ".claude-plugin/plugin.json"), { name: "pulse", version: "3.6.0" }, compact);
  writeJson(path.join(root, ".codex-plugin/plugin.json"), { name: "pulse", version: "3.6.0" }, !compact);
  const plugins = [
    { name: "unrelated", version: "9.4.1" },
    { name: "pulse", version: "3.6.0" },
  ];
  writeJson(path.join(root, ".agents/plugins/marketplace.json"), { name: "test", plugins }, compact);
  writeJson(path.join(root, ".claude-plugin/marketplace.json"), { name: "test", plugins: structuredClone(plugins) }, !compact);
  fs.writeFileSync(path.join(root, "README.md"), "badge version-3.6.0-green\n");
  if (malformed) fs.writeFileSync(path.join(root, ".codex-plugin/plugin.json"), "{not-json\n");
  return root;
}

function run(root, bump) {
  return spawnSync("bash", [bumpScript, bump], {
    cwd: repoRoot,
    env: { ...process.env, PULSE_VERSION_ROOT: root },
    encoding: "utf8",
  });
}

function readVersions(root) {
  const claude = JSON.parse(fs.readFileSync(path.join(root, ".claude-plugin/plugin.json"), "utf8"));
  const codex = JSON.parse(fs.readFileSync(path.join(root, ".codex-plugin/plugin.json"), "utf8"));
  const agents = JSON.parse(fs.readFileSync(path.join(root, ".agents/plugins/marketplace.json"), "utf8"));
  const marketplace = JSON.parse(fs.readFileSync(path.join(root, ".claude-plugin/marketplace.json"), "utf8"));
  return {
    versions: [
      claude.version,
      codex.version,
      agents.plugins.find((entry) => entry.name === "pulse").version,
      marketplace.plugins.find((entry) => entry.name === "pulse").version,
    ],
    unrelated: [agents.plugins[0].version, marketplace.plugins[0].version],
    readme: fs.readFileSync(path.join(root, "README.md"), "utf8"),
  };
}

for (const [bump, expected] of [["patch", "3.6.1"], ["minor", "3.7.0"], ["major", "4.0.0"]]) {
  test(`${bump} updates compact and formatted JSON structurally`, () => {
    const root = makeFixture({ compact: bump !== "minor" });
    try {
      const result = run(root, bump);
      assert.equal(result.status, 0, result.stderr);
      const actual = readVersions(root);
      assert.deepEqual(actual.versions, [expected, expected, expected, expected]);
      assert.deepEqual(actual.unrelated, ["9.4.1", "9.4.1"]);
      assert.match(actual.readme, new RegExp(`version-${expected}-`, "u"));
      assert.match(result.stdout, new RegExp(`3\\.6\\.0 → ${expected.replaceAll(".", "\\.")}`, "u"));
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
}

test("validation failure leaves every version surface byte-for-byte unchanged", () => {
  const root = makeFixture({ malformed: true });
  try {
    const before = new Map(surfacePaths.map((relativePath) => [
      relativePath,
      fs.readFileSync(path.join(root, relativePath)),
    ]));
    const result = run(root, "patch");
    assert.notEqual(result.status, 0);
    assert.doesNotMatch(result.stdout, /updated:/u);
    for (const [relativePath, content] of before) {
      assert.deepEqual(fs.readFileSync(path.join(root, relativePath)), content, relativePath);
    }
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("misaligned versions fail before any surface is written", () => {
  const root = makeFixture();
  try {
    const target = path.join(root, ".codex-plugin/plugin.json");
    fs.writeFileSync(target, JSON.stringify({ name: "pulse", version: "3.5.9" }));
    const before = new Map(surfacePaths.map((relativePath) => [
      relativePath,
      fs.readFileSync(path.join(root, relativePath)),
    ]));
    const result = run(root, "minor");
    assert.notEqual(result.status, 0);
    for (const [relativePath, content] of before) {
      assert.deepEqual(fs.readFileSync(path.join(root, relativePath)), content, relativePath);
    }
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

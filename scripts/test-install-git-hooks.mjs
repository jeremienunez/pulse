import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { installGitHooks, PRE_COMMIT } from "./install-git-hooks.mjs";

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "pulse-hook-install-"));
  const env = { ...process.env, GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1",
    GIT_AUTHOR_NAME: "Fixture", GIT_AUTHOR_EMAIL: "fixture@example.invalid", GIT_COMMITTER_NAME: "Fixture", GIT_COMMITTER_EMAIL: "fixture@example.invalid" };
  for (const key of ["GIT_DIR", "GIT_WORK_TREE", "GIT_INDEX_FILE", "GIT_COMMON_DIR", "GIT_PREFIX"]) delete env[key];
  const git = (args, options = {}) => spawnSync("git", args, { cwd: root, env, encoding: "utf8", ...options });
  assert.equal(git(["init", "-q"]).status, 0);
  fs.mkdirSync(path.join(root, "scripts"));
  fs.writeFileSync(path.join(root, "scripts/pulse-quality.mjs"),
    "import fs from 'node:fs';fs.writeFileSync('.git/hook-args.json',JSON.stringify(process.argv.slice(2)));process.exit(Number(process.env.FIXTURE_QUALITY_EXIT||0));\n");
  assert.equal(git(["add", "scripts"]).status, 0);
  assert.equal(git(["commit", "-qm", "fixture base"]).status, 0);
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return { root, env, git, install: options => installGitHooks(root, { env, ...options }) };
}

test("the tracked pre-commit adapter matches the installer's exact managed template", () => {
  const hook = fileURLToPath(new URL("../.githooks/pre-commit", import.meta.url));
  assert.equal(fs.readFileSync(hook, "utf8"), PRE_COMMIT);
  assert.ok((fs.statSync(hook).mode & 0o111) !== 0);
});

test("dry-run leaves both hook paths and Git configuration unchanged", t => {
  const f = fixture(t), config = fs.readFileSync(path.join(f.root, ".git/config"));
  const result = f.install({ dryRun: true });
  assert.equal(result.status, "would_install");
  assert.equal(fs.existsSync(path.join(f.root, ".githooks")), false);
  assert.deepEqual(fs.readFileSync(path.join(f.root, ".git/config")), config);
});

test("explicit installation is idempotent and the effective Git hook blocks a real commit", t => {
  const f = fixture(t);
  assert.equal(f.install().status, "installed");
  const config = fs.readFileSync(path.join(f.root, ".git/config"));
  assert.equal(f.install().status, "already_installed");
  assert.deepEqual(fs.readFileSync(path.join(f.root, ".git/config")), config);
  fs.writeFileSync(path.join(f.root, "candidate.txt"), "new candidate\n");
  assert.equal(f.git(["add", "candidate.txt"]).status, 0);
  const head = f.git(["rev-parse", "HEAD"]).stdout.trim();
  const blocked = f.git(["commit", "-qm", "must refuse"], { env: { ...f.env, FIXTURE_QUALITY_EXIT: "1" } });
  assert.notEqual(blocked.status, 0);
  assert.equal(f.git(["rev-parse", "HEAD"]).stdout.trim(), head);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(f.root, ".git/hook-args.json"))), ["--profile", "commit"]);
  assert.equal(f.git(["commit", "-qm", "accepted fixture"]).status, 0);
  assert.notEqual(f.git(["rev-parse", "HEAD"]).stdout.trim(), head);
});

test("a foreign hooksPath is preserved before any hook file is written", t => {
  const f = fixture(t);
  assert.equal(f.git(["config", "core.hooksPath", ".husky"]).status, 0);
  const config = fs.readFileSync(path.join(f.root, ".git/config"));
  assert.throws(() => f.install(), /Foreign core.hooksPath/u);
  assert.equal(fs.existsSync(path.join(f.root, ".githooks")), false);
  assert.deepEqual(fs.readFileSync(path.join(f.root, ".git/config")), config);
});

test("existing default Git hooks are not silently sidelined", t => {
  const f = fixture(t), hook = path.join(f.root, ".git/hooks/pre-push");
  fs.writeFileSync(hook, "#!/bin/sh\nexit 0\n");
  const config = fs.readFileSync(path.join(f.root, ".git/config"));
  assert.throws(() => f.install(), /Existing Git hooks preserved/u);
  assert.equal(fs.readFileSync(hook, "utf8"), "#!/bin/sh\nexit 0\n");
  assert.deepEqual(fs.readFileSync(path.join(f.root, ".git/config")), config);
});

test("foreign or modified managed pre-commit bytes are never overwritten", t => {
  const f = fixture(t), hook = path.join(f.root, ".githooks/pre-commit");
  fs.mkdirSync(path.dirname(hook));
  for (const bytes of ["#!/bin/sh\necho foreign\n", `${PRE_COMMIT}# user edit\n`]) {
    fs.writeFileSync(hook, bytes);
    assert.throws(() => f.install(), /Foreign pre-commit/u);
    assert.equal(fs.readFileSync(hook, "utf8"), bytes);
    assert.equal(f.git(["config", "--get", "core.hooksPath"]).status, 1);
  }
});

test("symlinked hook directories cannot redirect installer writes", t => {
  const f = fixture(t), outside = path.join(f.root, "outside");
  fs.mkdirSync(outside);
  fs.symlinkSync(outside, path.join(f.root, ".githooks"));
  assert.throws(() => f.install(), /Foreign .githooks/u);
  assert.deepEqual(fs.readdirSync(outside), []);
});

test("multiple worktrees without per-worktree configuration refuse shared mutations", t => {
  const f = fixture(t), linked = path.join(f.root, "linked");
  assert.equal(f.git(["worktree", "add", "-qb", "linked", linked]).status, 0);
  const config = fs.readFileSync(path.join(f.root, ".git/config"));
  assert.throws(() => installGitHooks(linked, { env: f.env }), /Multiple worktrees/u);
  assert.equal(fs.existsSync(path.join(linked, ".githooks")), false);
  assert.deepEqual(fs.readFileSync(path.join(f.root, ".git/config")), config);
});

test("an opted-in worktree installs locally without changing the owner's hooksPath", t => {
  const f = fixture(t), linked = path.join(f.root, "linked");
  assert.equal(f.git(["worktree", "add", "-qb", "linked", linked]).status, 0);
  assert.equal(f.git(["config", "extensions.worktreeConfig", "true"]).status, 0);
  const config = fs.readFileSync(path.join(f.root, ".git/config"));
  const result = installGitHooks(linked, { env: f.env });
  assert.equal(result.scope, "--worktree");
  assert.equal(result.status, "installed");
  assert.equal(f.git(["config", "--get", "core.hooksPath"]).status, 1);
  assert.deepEqual(fs.readFileSync(path.join(f.root, ".git/config")), config);
  assert.equal(spawnSync("git", ["config", "--get", "core.hooksPath"], { cwd: linked, env: f.env, encoding: "utf8" }).stdout.trim(), ".githooks");
});

#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { parseArgs } from "node:util";
import { fileURLToPath } from "node:url";

export const PRE_COMMIT = "#!/bin/sh\n# Pulse managed Git quality hook v1\nset -eu\nexec node scripts/pulse-quality.mjs --profile commit\n";

function git(repoRoot, args, env, allowMissing = false) {
  const result = spawnSync("git", args, { cwd: repoRoot, env, encoding: "utf8" });
  if (allowMissing && result.status === 1) return "";
  if (result.error || result.status !== 0) throw new Error(result.error?.message || result.stderr.trim() || "Git configuration unavailable.");
  return result.stdout.trim();
}

export function installGitHooks(repoRoot, { dryRun = false, env = process.env } = {}) {
  const root = fs.realpathSync(git(repoRoot, ["rev-parse", "--show-toplevel"], env));
  if (!fs.statSync(path.join(root, "scripts/pulse-quality.mjs"), { throwIfNoEntry: false })?.isFile()) {
    throw new Error("This pilot requires the Pulse quality entrypoint in the target checkout.");
  }
  const config = git(root, ["config", "--get-all", "core.hooksPath"], env, true);
  if (config && config !== ".githooks") throw new Error(`Foreign core.hooksPath preserved: ${config}`);
  const directory = path.join(root, ".githooks"), hook = path.join(directory, "pre-commit");
  const directoryStat = fs.lstatSync(directory, { throwIfNoEntry: false });
  if (directoryStat && (!directoryStat.isDirectory() || directoryStat.isSymbolicLink())) throw new Error("Foreign .githooks path preserved.");
  const hookStat = fs.lstatSync(hook, { throwIfNoEntry: false });
  if (hookStat && (!hookStat.isFile() || hookStat.isSymbolicLink() || fs.readFileSync(hook, "utf8") !== PRE_COMMIT)) {
    throw new Error("Foreign pre-commit hook preserved; integrate it explicitly before installation.");
  }
  if (!config) {
    const oldDirectory = git(root, ["rev-parse", "--path-format=absolute", "--git-path", "hooks"], env);
    if (fs.existsSync(oldDirectory) && fs.readdirSync(oldDirectory).some(name => !name.endsWith(".sample"))) {
      throw new Error("Existing Git hooks preserved; no hooksPath change was made.");
    }
  }
  const worktreeConfig = git(root, ["config", "--bool", "extensions.worktreeConfig"], env, true) === "true";
  const multipleWorktrees = git(root, ["worktree", "list", "--porcelain"], env).split("\n").filter(line => line.startsWith("worktree ")).length > 1;
  if (!config && multipleWorktrees && !worktreeConfig) {
    throw new Error("Multiple worktrees share Git configuration. Enable worktree-specific configuration explicitly before installing this hook.");
  }
  const scope = worktreeConfig ? "--worktree" : "--local";
  const ready = config === ".githooks" && hookStat && (hookStat.mode & 0o111) !== 0;
  const result = { root, hook, scope, status: ready ? "already_installed" : dryRun ? "would_install" : "installed" };
  if (ready || dryRun) return result;
  fs.mkdirSync(directory, { recursive: true });
  if (!hookStat) fs.writeFileSync(hook, PRE_COMMIT, { flag: "wx", mode: 0o755 });
  fs.chmodSync(hook, 0o755);
  if (!config) git(root, ["config", scope, "core.hooksPath", ".githooks"], env);
  if (git(root, ["config", "--get", "core.hooksPath"], env) !== ".githooks") throw new Error("Hook configuration readback failed.");
  return result;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const { values } = parseArgs({ options: {
      "repo-root": { type: "string", default: process.cwd() }, "dry-run": { type: "boolean", default: false },
    } });
    process.stdout.write(`${JSON.stringify(installGitHooks(values["repo-root"], { dryRun: values["dry-run"] }), null, 2)}\n`);
  } catch (error) {
    process.stderr.write(`Git hooks unchanged or installation incomplete: ${error.message}\n`);
    process.exitCode = 1;
  }
}

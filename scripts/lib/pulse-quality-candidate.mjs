import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

export class QualityUnavailable extends Error {}

function git(cwd, args, env = process.env, input) {
  const result = spawnSync("git", args, { cwd, env, input, maxBuffer: 128 * 1024 * 1024 });
  if (result.error || result.status !== 0) {
    throw new QualityUnavailable(`git ${args[0]}: ${result.error?.message || result.stderr?.toString().trim() || "command failed"}`);
  }
  return result.stdout;
}

export function indexTree(repoRoot, env = process.env) {
  return git(repoRoot, ["write-tree"], env).toString().trim();
}

function writeBlob(repoRoot, oid, target, env) {
  const fd = fs.openSync(target, 'wx');
  try {
    const result = spawnSync('git', ['cat-file', 'blob', oid], { cwd: repoRoot, env,
      stdio: ['ignore', fd, 'pipe'], maxBuffer: 8 * 1024 * 1024 });
    if (result.error || result.status !== 0) throw new QualityUnavailable(`git cat-file: ${result.error?.message || result.stderr?.toString().trim() || 'failed'}`);
  } finally { fs.closeSync(fd); }
}

export function captureCandidate(repoRoot, { env = process.env, ref } = {}) {
  const source = fs.realpathSync(git(repoRoot, ["rev-parse", "--show-toplevel"], env).toString().trim());
  const activeTree = indexTree(source, env);
  const tree = ref === "empty" ? git(source, ["hash-object", "-t", "tree", "--stdin"], env, "").toString().trim()
    : ref ? git(source, ["rev-parse", "--verify", "--end-of-options", `${ref}^{tree}`], env).toString().trim() : activeTree;
  const gitDir = git(source, ["rev-parse", "--absolute-git-dir"], env).toString().trim();
  const records = ref === "empty" ? [] : git(source, ["ls-tree", "-rz", "--full-tree", tree], env).toString("utf8").split("\0").filter(Boolean);
  const entries = records.map(record => {
    const match = record.match(/^(100644|100755) blob ([a-f0-9]+)\t([\s\S]+)$/u);
    if (!match) throw new QualityUnavailable("The quality pilot supports regular files only; symlinks and submodules require an explicit adapter.");
    const [, mode, oid, name] = match;
    if (name.includes("\uFFFD") || name.split("/").some(part => !part || part === "." || part === ".." || part.toLowerCase() === ".git")) {
      throw new QualityUnavailable("Unsupported Git candidate path.");
    }
    return { mode, oid, path: name };
  });
  if (!entries.length && ref !== "empty") throw new QualityUnavailable("There are no indexed files to verify.");
  const cleanEnv = { ...env, GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1" };
  for (const name of git(source, ["rev-parse", "--local-env-vars"], env).toString().trim().split("\n")) delete cleanEnv[name];
  cleanEnv.GIT_CONFIG_GLOBAL = "/dev/null";
  cleanEnv.GIT_CONFIG_NOSYSTEM = "1";
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "pulse-quality-"));
  try {
    for (const entry of entries) {
      const target = path.join(root, entry.path);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      writeBlob(source, entry.oid, target, env);
      fs.chmodSync(target, entry.mode === "100755" ? 0o755 : 0o644);
    }
    const objects = git(source, ["rev-parse", "--path-format=absolute", "--git-path", "objects"], env).toString().trim();
    if (/[\r\n]/u.test(objects)) throw new QualityUnavailable("Unsupported object-directory path.");
    const format = git(source, ["rev-parse", "--show-object-format"], env).toString().trim();
    git(root, ["-c", "init.templateDir=", "init", "--quiet", `--object-format=${format}`, "--initial-branch=pulse-quality"], cleanEnv);
    fs.writeFileSync(path.join(root, ".git/objects/info/alternates"), `${objects}\n`);
    git(root, ["config", "core.hooksPath", "/dev/null"], cleanEnv);
    if (ref === "empty") git(root, ["mktree"], cleanEnv, "");
    git(root, ["read-tree", tree], cleanEnv);
    const identity = { ...cleanEnv, GIT_AUTHOR_NAME: "Pulse quality", GIT_AUTHOR_EMAIL: "quality@example.invalid",
      GIT_COMMITTER_NAME: "Pulse quality", GIT_COMMITTER_EMAIL: "quality@example.invalid",
      GIT_AUTHOR_DATE: "2000-01-01T00:00:00Z", GIT_COMMITTER_DATE: "2000-01-01T00:00:00Z" };
    const commit = git(root, ["commit-tree", tree], identity, `Quality candidate ${tree}\n`).toString().trim();
    git(root, ["update-ref", "refs/heads/pulse-quality", commit], cleanEnv);
    return { source, root, tree, gitDir, entries, env: cleanEnv,
      current: () => indexTree(source, env) === activeTree,
      dispose: () => fs.rmSync(root, { recursive: true, force: true }) };
  } catch (error) {
    fs.rmSync(root, { recursive: true, force: true });
    throw error;
  }
}

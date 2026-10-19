import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { captureCandidate, indexTree } from "./lib/pulse-quality-candidate.mjs";
import { checkEnvironmentPaths, verifyCandidate, runQuality } from "./lib/pulse-quality.mjs";
import { qualityChecks } from "./lib/pulse-quality-profile.mjs";

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "quality case #-"));
  const env = { ...process.env, GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1",
    GIT_AUTHOR_NAME: "Fixture", GIT_AUTHOR_EMAIL: "fixture@example.invalid", GIT_COMMITTER_NAME: "Fixture", GIT_COMMITTER_EMAIL: "fixture@example.invalid" };
  for (const name of ["GIT_DIR", "GIT_WORK_TREE", "GIT_INDEX_FILE", "GIT_COMMON_DIR", "GIT_PREFIX"]) delete env[name];
  const git = (...args) => {
    const result = spawnSync("git", args, { cwd: root, env, encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr);
    return result.stdout.trim();
  };
  git("init", "-q");
  fs.writeFileSync(path.join(root, "program.mjs"), "export const valid = true;\n");
  git("add", "program.mjs");
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return { root, env, git, capture: () => { const candidate = captureCandidate(root, { env }); t.after(() => candidate.dispose()); return candidate; } };
}
const syntax = file => ({ id: "syntax", command: process.execPath, args: ["--check", file] });

test("indexed syntax fails even when the working copy has already been repaired", t => {
  const f = fixture(t), file = path.join(f.root, "program.mjs");
  fs.writeFileSync(file, "export const valid = ;\n");
  f.git("add", "program.mjs");
  fs.writeFileSync(file, "export const valid = true;\n");
  const staged = f.git("ls-files", "--stage"), candidate = f.capture();
  const report = verifyCandidate(candidate, [syntax("program.mjs")], { profile: "fixture" });
  assert.equal(report.status, "failed");
  assert.equal(report.checks[0].exit_code, 1);
  assert.equal(fs.readFileSync(file, "utf8"), "export const valid = true;\n");
  assert.equal(f.git("ls-files", "--stage"), staged);
});

test("a valid staged candidate ignores dirty and untracked copies and keeps its own Git tree", t => {
  const f = fixture(t), tree = indexTree(f.root, f.env);
  fs.writeFileSync(path.join(f.root, "program.mjs"), "dirty invalid syntax");
  fs.writeFileSync(path.join(f.root, "untracked.mjs"), "local-only");
  const candidate = f.capture();
  const report = verifyCandidate(candidate, [syntax("program.mjs")], { profile: "fixture" });
  assert.equal(report.status, "passed");
  assert.equal(report.tree, tree);
  assert.equal(fs.existsSync(path.join(candidate.root, "untracked.mjs")), false);
  assert.equal(fs.readFileSync(path.join(f.root, "program.mjs"), "utf8"), "dirty invalid syntax");
  const identity = spawnSync("git", ["rev-parse", "HEAD^{tree}"], { cwd: candidate.root, env: candidate.env, encoding: "utf8" });
  assert.equal(identity.status, 0, identity.stderr);
  assert.equal(identity.stdout.trim(), tree);
});

test("an alternate Git index is captured and removed from child verification context", t => {
  const f = fixture(t), alternate = path.join(f.root, "alternate-index");
  fs.copyFileSync(path.join(f.root, ".git/index"), alternate);
  const normalTree = indexTree(f.root, f.env);
  const alternateEnv = { ...f.env, GIT_INDEX_FILE: alternate };
  fs.writeFileSync(path.join(f.root, "program.mjs"), "export const fromAlternate = 42;\n");
  assert.equal(spawnSync("git", ["add", "program.mjs"], { cwd: f.root, env: alternateEnv }).status, 0);
  const candidate = captureCandidate(f.root, { env: alternateEnv });
  t.after(() => candidate.dispose());
  assert.notEqual(candidate.tree, normalTree);
  assert.equal(indexTree(f.root, f.env), normalTree);
  assert.equal(candidate.env.GIT_INDEX_FILE, undefined);
  assert.equal(fs.readFileSync(path.join(candidate.root, "program.mjs"), "utf8"), "export const fromAlternate = 42;\n");
});

test("raw blobs preserve binary bytes and Git attributes cannot transform the candidate", t => {
  const f = fixture(t), bytes = Buffer.from([0, 255, 13, 10, 36, 70, 111, 114, 109, 97, 116, 58, 36]);
  fs.writeFileSync(path.join(f.root, "raw.bin"), bytes);
  f.git("add", "raw.bin");
  fs.writeFileSync(path.join(f.root, ".gitattributes"), "raw.bin export-ignore export-subst -text\n");
  f.git("add", ".gitattributes");
  const candidate = f.capture();
  assert.deepEqual(fs.readFileSync(path.join(candidate.root, "raw.bin")), bytes);
});

test("filenames with spaces, newlines and shell text are passed literally", t => {
  const f = fixture(t), name = "literal ; touch PWN\n#.mjs";
  fs.writeFileSync(path.join(f.root, name), "export const ok = true;\n");
  f.git("add", "--", name);
  const candidate = f.capture();
  const report = verifyCandidate(candidate, [syntax(name)], { profile: "fixture" });
  assert.equal(report.status, "passed");
  assert.equal(fs.existsSync(path.join(candidate.root, "PWN")), false);
  assert.equal(report.checks[0].args[1], name);
});

test("a source index changed during checks invalidates a previously passing command", t => {
  const f = fixture(t), candidate = f.capture();
  fs.writeFileSync(path.join(f.root, "program.mjs"), "export const changed = true;\n");
  const program = `require('node:child_process').execFileSync('git',['-C',${JSON.stringify(f.root)},'add','program.mjs']);`;
  const report = verifyCandidate(candidate, [{ id: "external-index-edit", command: process.execPath, args: ["-e", program] }], { profile: "fixture" });
  assert.equal(report.checks[0].status, "passed");
  assert.equal(report.status, "failed");
  assert.match(report.reason, /index changed/u);
  assert.notEqual(indexTree(f.root, f.env), candidate.tree);
});

test("missing tooling and deadlines are unavailable and stop subsequent checks", t => {
  const f = fixture(t);
  for (const check of [
    { id: "missing", command: "pulse-quality-missing-executable", args: [] },
    { id: "deadline", command: process.execPath, args: ["-e", "setTimeout(()=>{},5000)"] },
  ]) {
    const candidate = f.capture();
    const report = verifyCandidate(candidate, [check, syntax("program.mjs")], { profile: "fixture", timeoutMs: 40 });
    assert.equal(report.status, "unavailable");
    assert.equal(report.checks.length, 1);
    assert.equal(JSON.parse(fs.readFileSync(report.report_path)).tree, candidate.tree);
  }
});

test("symlinks and submodules cannot silently qualify an incomplete candidate", t => {
  const f = fixture(t);
  fs.symlinkSync("program.mjs", path.join(f.root, "link.mjs"));
  f.git("add", "link.mjs");
  assert.throws(() => f.capture(), /symlinks and submodules/u);
  f.git("rm", "--cached", "link.mjs");
  f.git("commit", "-qm", "fixture base");
  f.git("update-index", "--add", "--cacheinfo", `160000,${f.git("rev-parse", "HEAD")},submodule`);
  assert.throws(() => f.capture(), /symlinks and submodules/u);
});

test("environment policy covers nested paths and has an exact example-file exception", () => {
  const names = [".env", "apps/api/.env.local", "nested/.envrc", ".env.example", "nested/.env.example", ".env.example.local", "src/environment.mjs"];
  assert.deepEqual(checkEnvironmentPaths(names.map(name => ({ path: name }))), [".env", "apps/api/.env.local", "nested/.envrc", ".env.example.local"]);
});

test("an indexed environment file fails before any command while an untracked one is excluded", t => {
  const f = fixture(t);
  fs.writeFileSync(path.join(f.root, ".env.local"), "SYNTHETIC=true\n");
  assert.equal(checkEnvironmentPaths(f.capture().entries).length, 0);
  f.git("add", ".env.local");
  const report = verifyCandidate(f.capture(), [syntax("program.mjs")], { profile: "fixture" });
  assert.equal(report.status, "failed");
  assert.deepEqual(report.checks, []);
  assert.match(report.reason, /\.env.local/u);
});

test("receipts are unique per run and empty verification cannot return green", t => {
  const f = fixture(t), candidate = f.capture();
  const first = verifyCandidate(candidate, [syntax("program.mjs")], { profile: "fixture" });
  const second = verifyCandidate(candidate, [], { profile: "fixture" });
  assert.notEqual(first.report_path, second.report_path);
  assert.equal(second.status, "unavailable");
  assert.match(second.reason, /No verification commands/u);
  assert.ok(first.report_path.startsWith(path.join(candidate.gitDir, "pulse-quality")));
});

test("CI extends the same mandatory core profile with packages and evidence", () => {
  const commit = qualityChecks("commit", [{ path: "scripts/example.mjs" }]);
  const ci = qualityChecks("ci", [{ path: "scripts/example.mjs" }]);
  assert.deepEqual(ci.slice(0, commit.length), commit);
  assert.ok(commit.some(check => check.id === "core-contracts"));
  assert.deepEqual(ci.slice(commit.length).map(check => check.id), ["packages", "evidence"]);
  assert.throws(() => qualityChecks("unknown", []), /Profile/u);
});

test("CLI rejects unknown options and profiles before touching any repository", () => {
  const cli = fileURLToPath(new URL("./pulse-quality.mjs", import.meta.url));
  for (const args of [["--profile", "unknown"], ["--profile", "ci", "--arbitrary-command", "touch PWN"]]) {
    const out = spawnSync(process.execPath, [cli, ...args], { cwd: os.tmpdir(), encoding: "utf8" });
    assert.equal(out.status, 2);
    assert.match(out.stderr, /Quality unavailable/u);
  }
});

test("a verifier launched from another checkout cannot silently verify a different tool version", async t => {
  const f = fixture(t);
  const runtime = ["scripts/pulse-quality.mjs", "scripts/lib/pulse-quality.mjs", "scripts/lib/pulse-quality-candidate.mjs", "scripts/lib/pulse-quality-profile.mjs"];
  const source = fileURLToPath(new URL("../", import.meta.url));
  for (const file of runtime) {
    fs.mkdirSync(path.dirname(path.join(f.root, file)), { recursive: true });
    fs.copyFileSync(path.join(source, file), path.join(f.root, file));
  }
  fs.appendFileSync(path.join(f.root, "scripts/lib/pulse-quality.mjs"), "\n// another verifier version\n");
  f.git("add", "scripts");
  await assert.rejects(runQuality(f.root, "commit"), /quality verifier|verifier version/u);
});

test('capturing a large regular blob does not accumulate the repository in a bounded stdout buffer', t => {
  const f = fixture(t), target = path.join(f.root, 'large.bin'), length = 129 * 1024 * 1024;
  const fd = fs.openSync(target, 'w'); fs.ftruncateSync(fd, length); fs.writeSync(fd, Buffer.from([1,2,3,4]), 0, 4, length - 4); fs.closeSync(fd);
  f.git('add', 'large.bin'); const candidate = f.capture(), copied = path.join(candidate.root, 'large.bin');
  assert.equal(fs.statSync(copied).size, length); const read = fs.openSync(copied, 'r'), tail = Buffer.alloc(4); fs.readSync(read, tail, 0, 4, length - 4); fs.closeSync(read); assert.deepEqual(tail, Buffer.from([1,2,3,4]));
  assert.equal(indexTree(f.root, f.env), candidate.tree);
});

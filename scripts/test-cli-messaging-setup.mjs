import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync, execFileSync } from 'node:child_process';
import { setup } from './cli-messaging/setup.mjs';
function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pulse-messaging-setup-')); fs.chmodSync(root, 0o700);
  const program = path.join(root, 'runtime-double.mjs'); fs.writeFileSync(program, 'console.log(JSON.stringify(process.argv.slice(2)))');
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return { root, input: { client: 'claude', directory: path.join(root, 'state'), output: path.join(root, 'launchers'), program } };
}
test('dry-run shows exact create-only changes, defaults and removal without creating state or launching a model', t => {
  const { input } = fixture(t), plan = setup({ ...input, dryRun: true });
  assert.equal(plan.changes.length, 2); assert.deepEqual(plan.backups, []); assert.equal(plan.defaults.delivery, 'inbox-only'); assert.deepEqual(plan.defaults.allowedRecipients, []);
  assert.equal(plan.globalProfilesChanged, false); assert.equal(fs.existsSync(input.output), false); assert.equal(fs.existsSync(input.directory), false);
  assert.ok(plan.changes.every(c => c.before === null && c.after.length > 20));
});
test('install is idempotent and generated launcher preserves explicit scope; removal keeps state and foreign files', t => {
  const { input } = fixture(t); fs.mkdirSync(input.directory, { mode: 0o700 }); fs.writeFileSync(path.join(input.directory, 'messages-preserved'), 'keep');
  const plan = setup(input); assert.equal(plan.created.length, 2); assert.equal(setup(input).changed, false);
  const launcher = path.join(input.output, 'pulse-claude.mjs');
  const result = spawnSync(process.execPath, [launcher, '--workspace', input.directory, '--allow', 'codex'], { encoding: 'utf8' }); assert.equal(result.status, 0, result.stderr);
  const args = JSON.parse(result.stdout); assert.deepEqual(args.slice(0, 6), ['launch', 'claude', '--state', input.directory, '--alias', 'claude']); assert.equal(args.includes('--delivery'), false);
  fs.writeFileSync(path.join(input.output, 'foreign'), 'preserve');
  const remove = spawnSync(process.execPath, [launcher, '--remove'], { encoding: 'utf8' }); assert.equal(remove.status, 0, remove.stderr);
  assert.equal(fs.readFileSync(path.join(input.output, 'foreign'), 'utf8'), 'preserve'); assert.equal(fs.readFileSync(path.join(input.directory, 'messages-preserved'), 'utf8'), 'keep'); assert.equal(fs.existsSync(launcher), false);
});
test('foreign or edited files are never overwritten or removed', t => {
  const { input } = fixture(t); fs.mkdirSync(input.output, { mode: 0o700 }); const file = path.join(input.output, 'pulse-claude.mjs'); fs.writeFileSync(file, 'foreign', { mode: 0o600 });
  assert.equal(setup({ ...input, dryRun: true }).conflicts.length, 1); assert.throws(() => setup(input), /preserved/u); assert.equal(fs.readFileSync(file, 'utf8'), 'foreign'); assert.equal(fs.existsSync(path.join(input.output, 'pulse-launcher.json')), false);
});
test('removal refuses an edited generated launcher', t => {
  const { input } = fixture(t); setup(input); const file = path.join(input.output, 'pulse-claude.mjs'); fs.appendFileSync(file, '\n// local edit\n');
  const result = spawnSync(process.execPath, [file, '--remove'], { encoding: 'utf8' }); assert.notEqual(result.status, 0); assert.equal(fs.existsSync(file), true); assert.equal(fs.existsSync(path.join(input.output, 'pulse-launcher.json')), true);
});
test('symlink destinations, public directories and repository/native-profile destinations are rejected', t => {
  const { root, input } = fixture(t); fs.mkdirSync(input.output, { mode: 0o700 }); const link = path.join(root, 'link'); fs.symlinkSync(input.output, link);
  assert.throws(() => setup({ ...input, output: link, dryRun: true }), /symlinks/u);
  fs.chmodSync(input.output, 0o755); assert.throws(() => setup({ ...input, dryRun: true }), /0700/u);
  assert.throws(() => setup({ ...input, output: path.join(root, '.gemini', 'output'), dryRun: true }), /profiles/u);
  const repo = path.join(root, 'repo'); fs.mkdirSync(repo); fs.mkdirSync(path.join(repo, '.git')); assert.throws(() => setup({ ...input, output: path.join(repo, 'output'), dryRun: true }), /repositories/u);
});


test('removal rejects a symlinked manifest before opening its FIFO target', { skip: process.platform === 'win32' }, t => {
  const { root, input } = fixture(t); setup(input);
  const launcher = path.join(input.output, 'pulse-claude.mjs'), manifest = path.join(input.output, 'pulse-launcher.json'), fifo = path.join(root, 'foreign-fifo');
  execFileSync('mkfifo', ['-m', '600', fifo]); fs.unlinkSync(manifest); fs.symlinkSync(fifo, manifest);
  const result = spawnSync(process.execPath, [launcher, '--remove'], { encoding: 'utf8', timeout: 750 });
  assert.equal(result.error, undefined, 'A manifest symlink must be rejected before a blocking read.');
  assert.notEqual(result.status, 0); assert.match(result.stderr, /Foreign launcher manifest/u);
  assert.equal(fs.existsSync(launcher), true); assert.equal(fs.lstatSync(manifest).isSymbolicLink(), true);
});

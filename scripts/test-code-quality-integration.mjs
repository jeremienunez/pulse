import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { runCodeQuality } from './lib/pulse-quality.mjs';
const tools = process.env.PULSE_QUALITY_TOOLCHAIN;
function fixture(t, source = 'export const value = 1;\n') {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'code-quality staged #-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const env = {
    ...process.env,
    GIT_CONFIG_GLOBAL: '/dev/null',
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_AUTHOR_NAME: 'Quality fixture',
    GIT_AUTHOR_EMAIL: 'quality@example.invalid',
    GIT_COMMITTER_NAME: 'Quality fixture',
    GIT_COMMITTER_EMAIL: 'quality@example.invalid',
  };
  for (const k of ['GIT_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE', 'GIT_COMMON_DIR', 'GIT_PREFIX'])
    delete env[k];
  const git = (...args) => {
    const p = spawnSync('git', args, { cwd: root, env, encoding: 'utf8' });
    assert.equal(p.status, 0, p.stderr);
    return p.stdout.trim();
  };
  git('init', '-q');
  fs.writeFileSync(path.join(root, 'program.mjs'), source);
  fs.writeFileSync(
    path.join(root, 'pulse-quality.config.json'),
    JSON.stringify({
      schema_version: '1.0',
      mode: 'enforce-new',
      profiles: ['javascript'],
      include: ['*.mjs'],
      baseline: 'pulse-quality.baseline.json',
    }),
  );
  git('add', '.');
  return { root, env, git, options: { toolchainRoot: tools, evaluationDate: '2026-10-19' } };
}
async function seed(f) {
  const p = path.join(f.root, 'pulse-quality.baseline.json');
  const r = await runCodeQuality(f.root, 'commit', {
    ...f.options,
    baselineFrom: 'empty',
    exportBaseline: p,
  });
  assert.equal(r.exit_code, 0, r.reason);
  f.git('add', 'pulse-quality.baseline.json');
  return r;
}
test(
  'strict file and Python complexity budgets cannot pass through an adapter that does not measure them',
  { skip: !tools },
  async (t) => {
    for (const [profiles, filename, metric, source] of [
      [['javascript'], 'program.mjs', 'file_lines', 'export const value=1;\n'],
      [['python'], 'program.py', 'complexity', 'def read_value():\n    return 1\n'],
    ]) {
      const f = fixture(t);
      if (filename !== 'program.mjs') f.git('rm', '-f', 'program.mjs');
      fs.writeFileSync(path.join(f.root, filename), source);
      fs.writeFileSync(
        path.join(f.root, 'pulse-quality.config.json'),
        JSON.stringify({
          schema_version: '1.0',
          mode: 'observe',
          profiles,
          include: [filename],
          strictBudgets: [metric],
        }),
      );
      f.git('add', filename, 'pulse-quality.config.json');
      const result = await runCodeQuality(f.root, 'commit', f.options);
      assert.equal(result.exit_code, 2, result.reason);
      assert.ok(result.coverage.some((row) => row.id === `policy/strict-${metric}` && row.required));
    }
  },
);
test(
  'required ownership cannot be satisfied by a partial or failed optional native binding',
  { skip: !tools },
  async (t) => {
    for (const broken of [false, true]) {
      const f = fixture(t);
      f.git('rm', '-f', 'program.mjs');
      for (const name of ['a.py', 'b.py'])
        fs.writeFileSync(path.join(f.root, name), 'def read_value():\n    return 1\n');
      fs.writeFileSync(
        path.join(f.root, 'emit.mjs'),
        `process.stdout.write(JSON.stringify({success:${!broken},findings:[]}));`,
      );
      fs.writeFileSync(
        path.join(f.root, 'pulse-quality.config.json'),
        JSON.stringify({
          schema_version: '1.0',
          mode: 'observe',
          profiles: ['python', 'native'],
          include: ['*.py'],
          ownership: { required: true, zones: [{ id: 'domain', patterns: ['*.py'], allows: [] }] },
          checks: [
            {
              id: 'native-owner',
              language: 'python',
              patterns: [broken ? '*.py' : 'a.py'],
              profile: 'commit',
              format: 'json',
              required: false,
              capabilities: ['ownership'],
              command: [process.execPath, 'emit.mjs'],
            },
          ],
        }),
      );
      f.git('add', 'a.py', 'b.py', 'emit.mjs', 'pulse-quality.config.json');
      const result = await runCodeQuality(f.root, 'commit', f.options);
      assert.equal(result.exit_code, 2, result.reason);
      assert.deepEqual(
        result.coverage.find((row) => row.id === 'policy/ownership').files,
        broken ? ['a.py', 'b.py'] : ['b.py'],
      );
    }
  },
);
test(
  'full index path blocks staged violations even with a repaired working copy; no user bytes are rewritten',
  { skip: !tools },
  async (t) => {
    const f = fixture(t);
    await seed(f);
    fs.writeFileSync(path.join(f.root, 'program.mjs'), 'export const value=1; debugger;\n');
    f.git('add', 'program.mjs');
    fs.writeFileSync(path.join(f.root, 'program.mjs'), 'export const value=1;\n');
    const before = f.git('write-tree');
    const r = await runCodeQuality(f.root, 'commit', f.options);
    assert.equal(r.exit_code, 1, r.reason);
    assert.ok(r.findings.some((x) => x.ruleId === 'eslint/no-debugger' && x.disposition === 'new'));
    assert.equal(f.git('write-tree'), before);
    assert.equal(fs.readFileSync(path.join(f.root, 'program.mjs'), 'utf8'), 'export const value=1;\n');
  },
);
test(
  'a clean index ignores broken unindexed source and is repeatable across temporary roots',
  { skip: !tools },
  async (t) => {
    const f = fixture(t);
    await seed(f);
    fs.writeFileSync(path.join(f.root, 'program.mjs'), 'broken unindexed syntax');
    const a = await runCodeQuality(f.root, 'commit', f.options),
      b = await runCodeQuality(f.root, 'commit', f.options);
    assert.equal(a.exit_code, 0, a.reason);
    assert.deepEqual(a.findings, b.findings);
    assert.equal(a.tree, b.tree);
    assert.equal(fs.readFileSync(path.join(f.root, 'program.mjs'), 'utf8'), 'broken unindexed syntax');
  },
);
test(
  'baseline export uses the explicit historical tree, never silently accepts current new errors',
  { skip: !tools },
  async (t) => {
    const f = fixture(t);
    f.git('commit', '-qm', 'base');
    const base = f.git('rev-parse', 'HEAD^{tree}');
    fs.writeFileSync(path.join(f.root, 'program.mjs'), 'export const value=1; debugger;\n');
    f.git('add', 'program.mjs');
    const destination = path.join(f.root, 'pulse-quality.baseline.json');
    const seed = await runCodeQuality(f.root, 'commit', {
      ...f.options,
      baselineFrom: 'HEAD',
      exportBaseline: destination,
    });
    assert.equal(seed.exit_code, 0, seed.reason);
    assert.equal(seed.baseline.source_tree, base);
    f.git('add', 'pulse-quality.baseline.json');
    const r = await runCodeQuality(f.root, 'commit', f.options);
    assert.equal(r.exit_code, 1, r.reason);
    await assert.rejects(
      runCodeQuality(f.root, 'commit', { ...f.options, baselineFrom: 'HEAD', exportBaseline: destination }),
      /exist/u,
    );
  },
);
test(
  'missing tooling yields durable unavailable coverage and never installs dependencies',
  { skip: !tools },
  async (t) => {
    const f = fixture(t);
    const r = await runCodeQuality(f.root, 'commit', { ...f.options, toolchainRoot: '' });
    assert.equal(r.exit_code, 2);
    assert.ok(r.coverage.some((x) => x.status === 'unavailable'));
    assert.equal(fs.existsSync(path.join(f.root, 'node_modules')), false);
    assert.ok(fs.existsSync(r.report_path));
  },
);
test(
  'alternate index is preserved and runtime identity uses its own index, not the target override',
  { skip: !tools },
  async (t) => {
    const f = fixture(t);
    await seed(f);
    const normal = f.git('write-tree'),
      alternate = path.join(f.root, '.git/alternate-index');
    fs.copyFileSync(path.join(f.root, '.git/index'), alternate);
    fs.writeFileSync(path.join(f.root, 'program.mjs'), 'export const value=1; debugger;');
    assert.equal(
      spawnSync('git', ['add', 'program.mjs'], { cwd: f.root, env: { ...f.env, GIT_INDEX_FILE: alternate } })
        .status,
      0,
    );
    const r = await runCodeQuality(f.root, 'commit', {
      ...f.options,
      env: { ...f.env, GIT_INDEX_FILE: alternate },
    });
    assert.equal(r.exit_code, 1, r.reason);
    assert.equal(f.git('write-tree'), normal);
  },
);

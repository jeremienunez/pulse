import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { validatePolicy } from './code-quality/policy.mjs';
import { toolContext } from './code-quality/adapters.mjs';
import { collectMetrics, strictBudgetCoverage } from './code-quality/metrics.mjs';
const tools = process.env.PULSE_QUALITY_TOOLCHAIN;
test('strict budgets require the actual metric capability and respect native schedules and class applicability', () => {
  const policy = validatePolicy({
    schema_version: '1.0',
    mode: 'observe',
    profiles: ['python'],
    include: ['**/*'],
    strictBudgets: ['complexity', 'class_lines', 'file_lines'],
  });
  const rows = [
    {
      id: 'python/ast-and-lint',
      status: 'checked',
      files: ['a.py'],
      supported_metrics: ['class_lines', 'parameters'],
    },
  ];
  const missing = strictBudgetCoverage(['a.py', 'a.rs'], policy, rows);
  assert.deepEqual(
    missing.map((row) => [row.id, row.files]),
    [
      ['policy/strict-complexity', ['a.py', 'a.rs']],
      ['policy/strict-file_lines', ['a.py', 'a.rs']],
    ],
  );
  assert.ok(missing.every((row) => row.required && row.status === 'unsupported'));
  rows.push({
    id: 'native',
    status: 'not_scheduled',
    files: ['a.py', 'a.rs'],
    capabilities: ['size/complexity', 'size/file_lines'],
  });
  assert.deepEqual(strictBudgetCoverage(['a.py', 'a.rs'], policy, rows), []);
  rows[1].status = 'unavailable';
  assert.equal(strictBudgetCoverage(['a.py', 'a.rs'], policy, rows).length, 2);
});
test(
  'real counter includes explicitly indexed hidden/ignored source and no fake comment parser',
  { skip: !tools },
  async (t) => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'quality metrics-'));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    fs.mkdirSync(path.join(root, '.hidden'));
    fs.writeFileSync(
      path.join(root, '.hidden/example.py'),
      '# comment\ndef value():\n    return "# not a comment"\n',
    );
    fs.writeFileSync(path.join(root, '.gitignore'), '.hidden/\n');
    const candidate = { root, env: process.env, entries: [{ path: '.hidden/example.py' }] };
    const ctx = toolContext(candidate, tools, path.join(root, 'logs'));
    const policy = validatePolicy({
      schema_version: '1.0',
      mode: 'observe',
      profiles: ['metrics'],
      include: ['**/*'],
    });
    const r = await collectMetrics(ctx, ['.hidden/example.py'], policy);
    assert.equal(r.metrics.length, 1);
    assert.equal(r.metrics[0].code, 2);
    assert.equal(r.metrics[0].comments, 1);
    assert.equal(r.coverage[0].status, 'checked');
  },
);
test('missing metrics tool is unavailable rather than empty green', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'quality no-tool-'));
  try {
    const ctx = toolContext(
      { root, env: { PATH: '' }, entries: [{ path: 'a.py' }] },
      null,
      path.join(root, 'logs'),
    );
    await assert.rejects(
      collectMetrics(
        ctx,
        ['a.py'],
        validatePolicy({ schema_version: '1.0', mode: 'observe', profiles: ['metrics'], include: ['**/*'] }),
      ),
      /unavailable/u,
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  validatePolicy,
  selectedFiles,
  metricFinding,
  dateValid,
  relativePath,
  stableJSON,
} from './code-quality/policy.mjs';
const minimal = () => ({
  schema_version: '1.0',
  mode: 'enforce-new',
  profiles: ['metrics'],
  include: ['src/**'],
});
test('policy rejects unknown modes, rules, profiles and broad unexplained exclusions', () => {
  for (const input of [
    { ...minimal(), mode: 'auto-fix' },
    { ...minimal(), profiles: ['unknown'] },
    { ...minimal(), surprise: true },
    { ...minimal(), exclude: ['**'] },
    { ...minimal(), strictBudgets: ['imaginary'] },
  ])
    assert.throws(() => validatePolicy(input));
});
test('selection follows staged paths and explained exclusions', () => {
  const p = validatePolicy({
    ...minimal(),
    exclude: [{ pattern: 'src/generated/**', reason: 'published generated manifest' }],
  });
  assert.deepEqual(
    selectedFiles(
      ['src/a.rs', 'src/generated/a.rs', 'docs/a.md'].map((path) => ({ path })),
      p,
    ),
    ['src/a.rs'],
  );
});
test('LOC warns by default, hard budgets require explicit opt-in', () => {
  const p = validatePolicy(minimal());
  const detail = { path: 'src/a.py', language: 'python', symbol: 'a' };
  assert.equal(metricFinding('function_lines', 200, detail, p).severity, 'warning');
  assert.equal(
    metricFinding('function_lines', 200, detail, { ...p, strictBudgets: ['function_lines'] }).severity,
    'error',
  );
  assert.throws(() => metricFinding('function_lines', NaN, detail, p));
});
test('policy guards paths, expiry dates and mutating bindings', () => {
  for (const p of ['../x', '/tmp/x', 'src/../x', '.git/config', 'src\\x'])
    assert.throws(() => relativePath(p));
  assert.equal(dateValid('2026-02-30'), false);
  assert.equal(dateValid('2026-10-19'), true);
  assert.throws(() =>
    validatePolicy({
      ...minimal(),
      checks: [{ id: 'lint', language: 'any', command: ['lint', '--fix'], profile: 'ci', format: 'sarif' }],
    }),
  );
  assert.equal(stableJSON({ b: 1, a: 2 }), stableJSON({ a: 2, b: 1 }));
});
test('explicit malformed optional sections cannot silently disable rules', () => {
  for (const value of [
    { ownership: false },
    { tokens: null },
    { budgets: null },
    { naming: [] },
    { checks: {} },
    { rules: { 'owner/improt': 'error' } },
    { ownership: { required: true, zones: [] } },
  ])
    assert.throws(() => validatePolicy({ ...minimal(), ...value }));
});
test('rule overrides are explicit and cannot elevate a review into an automatic semantic violation', async () => {
  const { ruleOverrides } = await import('./code-quality/policy.mjs');
  const p = validatePolicy({
    ...minimal(),
    rules: { 'naming/file': 'error', 'abstraction/public-class': 'error' },
  });
  const rows = ruleOverrides(
    [
      { ruleId: 'naming/file', severity: 'warning', kind: 'violation' },
      { ruleId: 'abstraction/public-class', severity: 'info', kind: 'review' },
    ],
    p.rules,
  );
  assert.equal(rows[0].severity, 'error');
  assert.equal(rows[1].kind, 'review');
  assert.throws(() => validatePolicy({ ...minimal(), rules: { 'owner/typo': 'error' } }));
});
test('file naming roles work independently of a language parser', async () => {
  const { fileNameFindings } = await import('./code-quality/policy.mjs');
  const p = validatePolicy({
    ...minimal(),
    naming: {
      typescript: { files: 'kebab', overrides: [{ patterns: ['src/ui/**/*.tsx'], files: 'pascal' }] },
      python: { files: 'snake' },
    },
  });
  assert.equal(fileNameFindings('src/ui/View.tsx', 'typescript', p).length, 0);
  assert.equal(fileNameFindings('src/BadModule.ts', 'typescript', p).length, 1);
  assert.equal(fileNameFindings('src/bad-module.py', 'python', p).length, 1);
});

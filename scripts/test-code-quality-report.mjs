import test from 'node:test';
import assert from 'node:assert/strict';
import { fingerprint, createBaseline, settleFindings } from './code-quality/report.mjs';
const item = (extra) => ({
  ruleId: 'owner/import',
  language: 'typescript',
  path: 'src/a.ts',
  symbol: 'a',
  target: 'storage',
  kind: 'violation',
  severity: 'error',
  message: 'Boundary violation',
  ...extra,
});
const identity = { source_tree: 'a'.repeat(40), policy_hash: 'b'.repeat(64), toolchain_hash: 'c'.repeat(64) };
const options = { mode: 'enforce-new', evaluationDate: '2026-10-19' };
test('baseline survives unrelated body/message/line edits but not a new relation or occurrence', () => {
  const baseline = createBaseline([item()], identity);
  assert.equal(
    settleFindings([item({ line: 99, message: 'translated' })], baseline, options).status,
    'passed',
  );
  assert.equal(settleFindings([item(), item({ line: 100 })], baseline, options).counts.new_errors, 1);
  assert.equal(settleFindings([item({ target: 'network' })], baseline, options).status, 'failed');
});
test('metric worsening fails even at constant count and severity/kind cannot turn review into a waiver', () => {
  const prior = item({ kind: 'metric', metric: 'complexity', value: 18 });
  const baseline = createBaseline([prior], identity);
  assert.equal(settleFindings([{ ...prior, value: 17 }], baseline, options).status, 'passed');
  assert.equal(settleFindings([{ ...prior, value: 19 }], baseline, options).status, 'failed');
  assert.notEqual(fingerprint(item({ kind: 'review' })), fingerprint(item()));
});
test('exception is exact, finite and time-bound; review never blocks', () => {
  const empty = createBaseline([], identity),
    e = {
      id: 'temporary',
      ruleId: 'owner/import',
      path: 'src/a.ts',
      owner: 'team',
      reason: 'migration',
      expires: '2026-10-19',
    };
  assert.equal(settleFindings([item()], empty, { ...options, exceptions: [e] }).status, 'passed');
  assert.equal(
    settleFindings([item()], empty, { ...options, evaluationDate: '2026-10-20', exceptions: [e] }).status,
    'failed',
  );
  assert.equal(settleFindings([item({ kind: 'review' })], empty, options).status, 'passed');
});
test('settlement is order-independent and malformed baseline never qualifies', () => {
  const list = [item({ value: 9, metric: 'complexity' }), item({ value: 12, metric: 'complexity' })];
  const baseline = createBaseline([list[0]], identity);
  assert.deepEqual(
    settleFindings(list, baseline, options),
    settleFindings([...list].reverse(), baseline, options),
  );
  assert.throws(() => settleFindings([], null, options));
  assert.throws(() =>
    settleFindings([], { ...baseline, entries: [...baseline.entries, ...baseline.entries] }, options),
  );
  assert.throws(() => createBaseline([item({ value: null })], identity));
  assert.equal(settleFindings(list, null, { ...options, mode: 'observe' }).status, 'observed');
});
test('severity escalation cannot inherit a warning waiver or depend on duplicate input order', () => {
  const baseline = createBaseline([item({ severity: 'warning' })], identity);
  assert.equal(settleFindings([item()], baseline, options).status, 'failed');
  const rows = [item({ severity: 'warning' }), item()];
  assert.deepEqual(
    settleFindings(rows, baseline, options),
    settleFindings([...rows].reverse(), baseline, options),
  );
});
test('one larger accepted occurrence cannot conceal worsening of a smaller occurrence', () => {
  const rows = [
    item({ kind: 'metric', metric: 'complexity', value: 20 }),
    item({ kind: 'metric', metric: 'complexity', value: 100 }),
  ];
  const b = createBaseline(rows, identity);
  assert.equal(settleFindings([{ ...rows[0], value: 50 }, rows[1]], b, options).counts.new_errors, 1);
});

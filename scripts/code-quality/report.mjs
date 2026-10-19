import { hash, dateValid, requireObject } from './policy.mjs';

const compare = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
export function validateFinding(f) {
  requireObject(f, 'finding');
  for (const k of ['ruleId', 'language', 'path', 'message'])
    if (typeof f[k] !== 'string' || !f[k]) throw new Error(`Finding needs ${k}`);
  if (
    !['violation', 'metric', 'review'].includes(f.kind) ||
    !['error', 'warning', 'info'].includes(f.severity)
  )
    throw new Error('Invalid finding kind/severity');
  for (const k of ['symbol', 'target', 'metric'])
    if (f[k] !== undefined && typeof f[k] !== 'string') throw new Error(`Invalid finding ${k}`);
  for (const key of ['line', 'column'])
    if (f[key] !== undefined && (!Number.isSafeInteger(f[key]) || f[key] < 1))
      throw new Error(`Invalid finding ${key}`);
  if (f.kind === 'metric' && (typeof f.metric !== 'string' || !f.metric || !Number.isFinite(f.value)))
    throw new Error('Metric findings require a name and finite value');
  if (f.value !== undefined && !Number.isFinite(f.value)) throw new Error('Finding value must be finite');
}
export function fingerprint(f) {
  validateFinding(f);
  return hash(
    JSON.stringify([
      f.ruleId,
      f.language,
      f.path,
      f.symbol ?? '',
      f.target ?? '',
      f.metric ?? '',
      f.kind,
      f.severity,
    ]),
  );
}
function order(a, b) {
  return (
    compare(a.path, b.path) ||
    compare(a.ruleId, b.ruleId) ||
    compare(a.symbol ?? '', b.symbol ?? '') ||
    compare(a.fingerprint, b.fingerprint) ||
    compare(a.value ?? -Infinity, b.value ?? -Infinity) ||
    compare(a.line ?? 0, b.line ?? 0) ||
    compare(a.column ?? 0, b.column ?? 0) ||
    compare(a.message, b.message)
  );
}
export function validateBaseline(baseline) {
  requireObject(baseline, 'baseline');
  if (baseline.schema_version !== '1.0' || !Array.isArray(baseline.entries))
    throw new Error('Invalid baseline schema');
  for (const k of ['source_tree', 'policy_hash', 'toolchain_hash'])
    if (typeof baseline[k] !== 'string' || !baseline[k]) throw new Error(`Baseline needs ${k}`);
  const seen = new Set();
  for (const e of baseline.entries) {
    if (
      !e ||
      !/^[a-f0-9]{64}$/u.test(e.fingerprint) ||
      !Number.isSafeInteger(e.count) ||
      e.count < 1 ||
      (e.max_value !== undefined && !Number.isFinite(e.max_value)) ||
      seen.has(e.fingerprint)
    )
      throw new Error('Invalid or duplicate baseline entry');
    if (
      e.ceilings !== undefined &&
      (!Array.isArray(e.ceilings) ||
        e.ceilings.length > e.count ||
        e.ceilings.some((v) => !Number.isFinite(v)) ||
        (e.ceilings.length && e.max_value !== Math.max(...e.ceilings)))
    )
      throw new Error('Invalid numeric baseline ceilings');
    if (e.count > 1 && e.max_value !== undefined && e.ceilings === undefined)
      throw new Error('Numeric multiplicity needs explicit ceilings');
    seen.add(e.fingerprint);
  }
  return baseline;
}
export function createBaseline(findings, identity) {
  if (!Array.isArray(findings)) throw new Error('findings must be an array');
  const groups = new Map();
  for (const f of findings) {
    const fp = fingerprint(f);
    const e = groups.get(fp) ?? { fingerprint: fp, count: 0 };
    e.count += 1;
    if (f.value !== undefined) {
      e.max_value = Math.max(e.max_value ?? -Infinity, f.value);
      e.ceilings = [...(e.ceilings ?? []), f.value].sort((a, b) => a - b);
    }
    groups.set(fp, e);
  }
  return validateBaseline({
    schema_version: '1.0',
    ...identity,
    entries: [...groups.values()].sort((a, b) => compare(a.fingerprint, b.fingerprint)),
  });
}
function activeExceptions(exceptions, date) {
  if (!Array.isArray(exceptions)) throw new Error('Invalid exceptions');
  return exceptions.filter((e) => {
    if (
      !e ||
      !dateValid(e.expires) ||
      ['owner', 'reason', 'ruleId', 'path'].some((k) => typeof e[k] !== 'string' || !e[k].trim()) ||
      (e.symbol !== undefined && typeof e.symbol !== 'string')
    )
      throw new Error('Invalid exception');
    return e.expires >= date;
  });
}
export function settleFindings(findings, baseline, { mode, evaluationDate, exceptions = [] } = {}) {
  if (!Array.isArray(findings) || !['observe', 'enforce-new'].includes(mode) || !dateValid(evaluationDate))
    throw new Error('Invalid settlement inputs');
  if (baseline === null && mode !== 'observe') throw new Error('Baseline required in enforce-new mode');
  const accepted = new Map(
    baseline === null ? [] : validateBaseline(baseline).entries.map((e) => [e.fingerprint, e]),
  );
  const waivers = activeExceptions(exceptions, evaluationDate),
    groups = new Map();
  for (const f of findings) {
    const fp = fingerprint(f);
    const row = { ...f, fingerprint: fp };
    groups.set(fp, [...(groups.get(fp) ?? []), row]);
  }
  const result = [];
  for (const [fp, rows] of groups) {
    const prior = accepted.get(fp);
    const ceilings = [...(prior?.ceilings ?? (prior?.max_value === undefined ? [] : [prior.max_value]))];
    let slots = (prior?.count ?? 0) - ceilings.length;
    for (const f of rows.sort(order)) {
      let disposition = 'new';
      if (f.value !== undefined) {
        const index = ceilings.findIndex((v) => v >= f.value);
        if (index >= 0) {
          disposition = 'legacy';
          ceilings.splice(index, 1);
        }
      } else if (slots > 0) {
        disposition = 'legacy';
        slots -= 1;
      }
      if (
        disposition === 'new' &&
        waivers.some(
          (e) =>
            e.ruleId === f.ruleId && e.path === f.path && (e.symbol === undefined || e.symbol === f.symbol),
        )
      )
        disposition = 'excepted';
      result.push({ ...f, disposition });
    }
  }
  result.sort(order);
  const counts = { new_errors: 0, warnings: 0, review: 0, legacy: 0, excepted: 0 };
  for (const f of result) {
    if (f.disposition === 'legacy') counts.legacy += 1;
    else if (f.disposition === 'excepted') counts.excepted += 1;
    else if (f.kind === 'review') counts.review += 1;
    else if (f.severity === 'error') counts.new_errors += 1;
    else if (f.severity === 'warning') counts.warnings += 1;
  }
  return {
    findings: result,
    counts,
    status: mode === 'observe' ? 'observed' : counts.new_errors ? 'failed' : 'passed',
    exit_code: mode === 'enforce-new' && counts.new_errors ? 1 : 0,
  };
}

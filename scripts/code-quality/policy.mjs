import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';

export const DEFAULT_BUDGETS = Object.freeze({
  file_lines: { warning: 400, error: 600 },
  function_lines: { warning: 50, error: 80 },
  class_lines: { warning: 250, error: 400 },
  complexity: { warning: 10, error: 15 },
  nesting: { warning: 3, error: 4 },
  parameters: { warning: 4, error: 6 },
  public_methods: { warning: 10, error: null },
});
export const PROFILES = ['metrics', 'javascript', 'frontend', 'python', 'rust', 'native'];
export const hash = (value) => createHash('sha256').update(value).digest('hex');
export function stableJSON(value) {
  if (Array.isArray(value)) return `[${value.map(stableJSON).join(',')}]`;
  if (value && typeof value === 'object')
    return `{${Object.keys(value)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${stableJSON(value[k])}`)
      .join(',')}}`;
  return JSON.stringify(value);
}
export function requireObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error(`${label} must be an object`);
}
function keys(value, allowed, label) {
  requireObject(value, label);
  for (const key of Object.keys(value))
    if (!allowed.includes(key)) throw new Error(`Unknown ${label} field: ${key}`);
}
function strings(value, label, { nonempty = false } = {}) {
  if (
    !Array.isArray(value) ||
    value.some((v) => typeof v !== 'string' || !v.trim() || v.includes('\0')) ||
    (nonempty && !value.length)
  )
    throw new Error(`${label} must be an array of nonempty strings`);
  return value;
}
export function relativePath(value, label = 'path') {
  if (
    typeof value !== 'string' ||
    !value ||
    value.includes('\0') ||
    value.includes('\\') ||
    path.posix.isAbsolute(value) ||
    value.split('/').some((p) => !p || p === '.' || p === '..' || p.toLowerCase() === '.git')
  )
    throw new Error(`${label} must be a normalized repo-relative path`);
  return value;
}
export function dateValid(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/u.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === value;
}
function validateBudget(value, label) {
  keys(value, ['warning', 'error'], label);
  if (
    !Number.isFinite(value.warning) ||
    value.warning < 1 ||
    (value.error !== null && (!Number.isFinite(value.error) || value.error < value.warning))
  )
    throw new Error(`Invalid budget: ${label}`);
}
function validateOwnership(value) {
  keys(value, ['zones', 'required'], 'ownership');
  if (!Array.isArray(value.zones)) throw new Error('ownership.zones must be an array');
  if (value.required !== undefined && typeof value.required !== 'boolean')
    throw new Error('Invalid ownership.required');
  if (value.required && !value.zones.length) throw new Error('Required ownership needs declared zones');
  const ids = value.zones.map((z) => z.id);
  if (new Set(ids).size !== ids.length) throw new Error('Duplicate ownership zone');
  for (const z of value.zones) {
    keys(z, ['id', 'patterns', 'allows', 'io', 'forbidPackages'], 'zone');
    if (typeof z.id !== 'string' || !z.id) throw new Error('Invalid zone id');
    strings(z.patterns, 'zone.patterns', { nonempty: true });
    strings(z.allows, 'zone.allows');
    if (z.io !== undefined && typeof z.io !== 'boolean') throw new Error('zone.io must be boolean');
    strings(z.forbidPackages ?? [], 'zone.forbidPackages');
    if (z.allows.some((id) => !ids.includes(id))) throw new Error('Unknown allowed ownership zone');
  }
}
export function validatePolicy(raw) {
  keys(
    raw,
    [
      'schema_version',
      'mode',
      'profiles',
      'include',
      'exclude',
      'budgets',
      'strictBudgets',
      'ownership',
      'naming',
      'tokens',
      'checks',
      'baseline',
      'exceptions',
      'unused',
      'clones',
      'rules',
    ],
    'policy',
  );
  if (raw.schema_version !== '1.0') throw new Error('Unsupported policy schema_version');
  if (!['observe', 'enforce-new'].includes(raw.mode)) throw new Error('Invalid policy mode');
  strings(raw.profiles, 'profiles', { nonempty: true });
  if (new Set(raw.profiles).size !== raw.profiles.length || raw.profiles.some((p) => !PROFILES.includes(p)))
    throw new Error('Unknown or duplicate profile');
  strings(raw.include, 'include', { nonempty: true });
  if (raw.exclude !== undefined) {
    if (!Array.isArray(raw.exclude)) throw new Error('exclude must be an array');
    for (const x of raw.exclude) {
      keys(x, ['pattern', 'reason'], 'exclusion');
      if (typeof x.pattern !== 'string' || !x.pattern || typeof x.reason !== 'string' || !x.reason.trim())
        throw new Error('Exclusions require a pattern and reason');
    }
  }
  if (raw.budgets !== undefined) requireObject(raw.budgets, 'budgets');
  const budgets = { ...DEFAULT_BUDGETS, ...raw.budgets };
  keys(budgets, Object.keys(DEFAULT_BUDGETS), 'budgets');
  for (const [key, value] of Object.entries(budgets)) validateBudget(value, key);
  strings(raw.strictBudgets ?? [], 'strictBudgets');
  if ((raw.strictBudgets ?? []).some((k) => !Object.hasOwn(budgets, k)))
    throw new Error('Unknown strict budget');
  if (raw.ownership !== undefined) validateOwnership(raw.ownership);
  if (raw.naming !== undefined) {
    requireObject(raw.naming, 'naming');
    for (const [language, rule] of Object.entries(raw.naming)) {
      keys(rule, ['files', 'symbols', 'booleans', 'overrides'], `naming.${language}`);
      if (rule.files && !['kebab', 'snake', 'pascal', 'camel', 'lower'].includes(rule.files))
        throw new Error('Unknown file naming convention');
      for (const key of ['symbols', 'booleans'])
        if (rule[key] !== undefined && typeof rule[key] !== 'boolean') throw new Error('Invalid naming flag');
      if (rule.overrides !== undefined) {
        if (!Array.isArray(rule.overrides)) throw new Error('Invalid naming overrides');
        for (const o of rule.overrides) {
          keys(o, ['patterns', 'files', 'symbols', 'booleans'], 'naming override');
          strings(o.patterns, 'naming override patterns', { nonempty: true });
          if (o.files && !['kebab', 'snake', 'pascal', 'camel', 'lower'].includes(o.files))
            throw new Error('Invalid naming override convention');
          for (const flag of ['symbols', 'booleans'])
            if (o[flag] !== undefined && typeof o[flag] !== 'boolean')
              throw new Error('Invalid naming override flag');
        }
      }
    }
  }
  if (raw.tokens !== undefined) {
    keys(
      raw.tokens,
      ['files', 'include', 'properties', 'allowedValues', 'localPattern', 'requiredDynamic', 'namePattern'],
      'tokens',
    );
    strings(raw.tokens.files, 'tokens.files', { nonempty: true });
    raw.tokens.files.forEach((p) => relativePath(p));
    strings(raw.tokens.include, 'tokens.include', { nonempty: true });
    strings(raw.tokens.properties ?? [], 'tokens.properties');
    if (Array.isArray(raw.tokens.allowedValues) || raw.tokens.allowedValues === undefined)
      strings(raw.tokens.allowedValues ?? [], 'tokens.allowedValues');
    else {
      requireObject(raw.tokens.allowedValues, 'tokens.allowedValues');
      for (const values of Object.values(raw.tokens.allowedValues))
        strings(values, 'property allowed values');
    }
    for (const key of ['localPattern', 'namePattern'])
      if (raw.tokens[key] !== undefined) {
        if (typeof raw.tokens[key] !== 'string') throw new Error('Invalid token naming pattern');
        new RegExp(raw.tokens[key], 'u');
      }
    if (raw.tokens.requiredDynamic !== undefined && typeof raw.tokens.requiredDynamic !== 'boolean')
      throw new Error('Invalid requiredDynamic flag');
  }
  if (raw.checks !== undefined && !Array.isArray(raw.checks)) throw new Error('checks must be an array');
  for (const c of raw.checks ?? []) {
    keys(
      c,
      ['id', 'language', 'command', 'format', 'profile', 'required', 'patterns', 'capabilities'],
      'check',
    );
    if (
      typeof c.id !== 'string' ||
      !/^[a-zA-Z0-9_.-]+$/u.test(c.id) ||
      typeof c.language !== 'string' ||
      !c.language
    )
      throw new Error('Invalid native check identity');
    strings(c.command, 'check.command', { nonempty: true });
    if (c.patterns !== undefined) strings(c.patterns, 'check.patterns', { nonempty: true });
    if (c.capabilities !== undefined) strings(c.capabilities, 'check.capabilities', { nonempty: true });
    if (!['ci', 'commit'].includes(c.profile) || !['sarif', 'json'].includes(c.format))
      throw new Error('Invalid native check schedule/format');
    if (c.required !== undefined && typeof c.required !== 'boolean')
      throw new Error('check.required must be boolean');
    if (c.command.some((a) => ['--fix', '--write', '--update-baseline', '--unsafe-fixes'].includes(a)))
      throw new Error('Mutating native check flags are not allowed');
  }
  relativePath(raw.baseline ?? 'pulse-quality.baseline.json', 'baseline');
  if (raw.exceptions !== undefined && !Array.isArray(raw.exceptions))
    throw new Error('exceptions must be an array');
  for (const e of raw.exceptions ?? []) {
    keys(e, ['id', 'ruleId', 'path', 'symbol', 'expires', 'reason', 'owner'], 'exception');
    for (const k of ['id', 'ruleId', 'reason', 'owner'])
      if (typeof e[k] !== 'string' || !e[k].trim()) throw new Error(`Exception needs ${k}`);
    relativePath(e.path);
    if (e.symbol !== undefined && typeof e.symbol !== 'string') throw new Error('Invalid exception symbol');
    if (!dateValid(e.expires)) throw new Error('Invalid exception date');
  }
  if (raw.rules !== undefined) {
    requireObject(raw.rules, 'rules');
    for (const [id, severity] of Object.entries(raw.rules))
      if (!KNOWN_RULES.has(id) || !['off', 'info', 'warning', 'error'].includes(severity))
        throw new Error(`Unknown rule override: ${id}`);
  }
  if ((raw.checks ?? []).some((c) => c.capabilities?.length) && !raw.profiles.includes('native'))
    throw new Error('Delegated capabilities require the native profile');
  for (const flag of ['unused', 'clones'])
    if (raw[flag] !== undefined && typeof raw[flag] !== 'boolean') throw new Error(`${flag} must be boolean`);
  return {
    ...raw,
    exclude: raw.exclude ?? [],
    budgets,
    strictBudgets: raw.strictBudgets ?? [],
    exceptions: raw.exceptions ?? [],
    checks: raw.checks ?? [],
    baseline: raw.baseline ?? 'pulse-quality.baseline.json',
  };
}
export function loadPolicy(root, filename = 'pulse-quality.config.json') {
  relativePath(filename, 'policy filename');
  const full = path.join(root, filename);
  if (fs.statSync(full).size > 1024 * 1024) throw new Error('Policy exceeds 1 MiB');
  const source = fs.readFileSync(full, 'utf8');
  const policy = validatePolicy(JSON.parse(source));
  return { policy, policyHash: hash(stableJSON(policy)), sourceHash: hash(source), filename };
}
export const matches = (filename, pattern) => path.matchesGlob(filename, pattern);
export function selectedFiles(entries, policy) {
  return entries
    .map((e) => e.path)
    .filter(
      (p) => policy.include.some((g) => matches(p, g)) && !policy.exclude.some((x) => matches(p, x.pattern)),
    )
    .sort();
}
export function metricFinding(metric, value, detail, policy) {
  const budget = policy.budgets[metric];
  if (!budget || !Number.isFinite(value) || value < 0) throw new Error(`Invalid metric ${metric}`);
  const severity =
    policy.strictBudgets.includes(metric) && budget.error !== null && value > budget.error
      ? 'error'
      : value > budget.warning
        ? 'warning'
        : 'info';
  return {
    ...detail,
    ruleId: `size/${metric}`,
    metric,
    value,
    kind: 'metric',
    severity,
    message: `${metric}: ${value} (warning ${budget.warning}${budget.error === null ? '' : `; strict ${budget.error}`})`,
  };
}

export const KNOWN_RULES = new Set([
  ...Object.keys(DEFAULT_BUDGETS).map((k) => `size/${k}`),
  'size/*',
  'owner/import',
  'owner/package',
  'owner/cycle',
  'naming/file',
  'naming/symbol',
  'naming/boolean',
  'tokens/unknown',
  'tokens/literal',
  'tokens/definition-owner',
  'tokens/name',
  'tokens/dynamic-review',
  'tokens/arbitrary-class-review',
  'abstraction/scope-ambiguity',
  'abstraction/public-state',
  'abstraction/public-type',
  'abstraction/public-function',
  'abstraction/public-class',
  'abstraction/class',
  'abstraction/static-class',
  'abstraction/generic-utility',
  'eslint/no-debugger',
  'eslint/no-restricted-globals',
  'eslint/@typescript-eslint/no-unused-vars',
  'eslint/*',
  'ruff/*',
  'ruff/N*',
  'ruff/F*',
  'ruff/C90*',
  'ruff/PLR*',
  'rust/*',
  'native/*',
  'stylelint/*',
  'audit/*',
  'unused/*',
  'duplication/*',
]);
export function ruleOverrides(findings, rules = {}) {
  return findings.flatMap((f) => {
    const prefix = Object.keys(rules)
      .filter((k) => k.endsWith('*') && f.ruleId.startsWith(k.slice(0, -1)))
      .sort((a, b) => b.length - a.length)[0];
    const value = rules[f.ruleId] ?? rules[prefix];
    if (value === 'off') return [];
    if (!value || (f.kind === 'metric' && f.severity === 'info')) return [f];
    return [{ ...f, severity: value }];
  });
}

export function namingRule(policy, language, filename) {
  const rule = policy.naming?.[language];
  if (!rule) return null;
  return { ...rule, ...rule.overrides?.find((o) => o.patterns.some((p) => matches(filename, p))) };
}

export function fileNameFindings(filename, language, policy) {
  const rule = namingRule(policy, language, filename);
  if (!rule?.files) return [];
  const base = path.posix
    .basename(filename)
    .replace(/\.[^.]+$/u, '')
    .replace(/\.(?:test|spec|config|server|client)$/u, '');
  const patterns = {
    kebab: /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/u,
    snake: /^[a-z_][a-z0-9_]*$/u,
    pascal: /^[A-Z][A-Za-z0-9]*$/u,
    camel: /^[a-z][A-Za-z0-9]*$/u,
    lower: /^[a-z0-9_]+$/u,
  };
  if (patterns[rule.files].test(base) || ['index', 'main', '__init__'].includes(base)) return [];
  return [
    {
      ruleId: 'naming/file',
      language,
      path: filename,
      symbol: base,
      kind: 'violation',
      severity: 'warning',
      message: `Expected ${rule.files} filename`,
    },
  ];
}

export function hashFile(filename) {
  const digest = createHash('sha256'),
    fd = fs.openSync(filename, 'r'),
    buffer = Buffer.allocUnsafe(1024 * 1024);
  try {
    let length;
    while ((length = fs.readSync(fd, buffer, 0, buffer.length, null)) > 0)
      digest.update(buffer.subarray(0, length));
  } finally {
    fs.closeSync(fd);
  }
  return digest.digest('hex');
}

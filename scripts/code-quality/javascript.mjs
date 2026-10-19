import fs from 'node:fs';
import path from 'node:path';
import { isJavaScript, languageOf } from './metrics.mjs';
import { coverage, loadPackage, resolveBinary, runTool, readJSON, sourcePath } from './adapters.mjs';
import { metricFinding, matches, hash, namingRule } from './policy.mjs';
import { collectFacts } from './eslint-plugin.mjs';

export async function javascriptFacts(ctx, filename) {
  const key = `ast:${filename}`;
  if (ctx.cache.has(key)) return ctx.cache.get(key);
  const typescript = await loadPackage(ctx, 'typescript-eslint');
  const facts = collectFacts(
    fs.readFileSync(path.join(ctx.candidate.root, filename), 'utf8'),
    filename,
    typescript.parser,
  );
  ctx.cache.set(key, facts);
  return facts;
}
export function zoneFor(filename, ownership) {
  return ownership?.zones.find((z) => z.patterns.some((p) => matches(filename, p)));
}
export function namingFindings(filename, language, facts, policy) {
  const result = [],
    rule = namingRule(policy, language, filename);
  if (!rule) return result;
  const add = (ruleId, message, extra = {}) =>
    result.push({
      ruleId,
      language,
      path: filename,
      kind: 'violation',
      severity: 'warning',
      message,
      ...extra,
    });
  if (rule.symbols)
    for (const item of facts.names) {
      const allowed =
        item.role === 'type' ? /^[A-Z][A-Za-z0-9]*$/u : /^(?:[a-z_$][A-Za-z0-9_$]*|[A-Z][A-Z0-9_]*)$/u;
      if (
        !item.name.startsWith('anonymous-') &&
        !allowed.test(item.name) &&
        !(item.role === 'function' && /^[A-Z][A-Za-z0-9]*$/u.test(item.name))
      )
        add('naming/symbol', `Unexpected ${item.role} name`, { symbol: item.name, line: item.line });
      if (rule.booleans && item.boolean && !/^(?:is|has|can|should|did|will|was|must)[A-Z_]/u.test(item.name))
        add('naming/boolean', 'Boolean names should describe a predicate', {
          symbol: item.name,
          line: item.line,
        });
    }
  return result;
}
async function dependencyFindings(ctx, files, policy) {
  const findings = [],
    notes = [],
    zones = policy.ownership?.zones ?? [];
  if (!zones.length)
    return {
      findings,
      coverage: [
        coverage('javascript/ownership', 'not_applicable', files, {
          reason: 'No project ownership contract declared',
        }),
      ],
    };
  const config = path.join(ctx.outputRoot, 'dependency-cruiser.json');
  fs.writeFileSync(
    config,
    JSON.stringify({
      forbidden: [{ name: 'no-cycles', severity: 'error', from: {}, to: { circular: true } }],
      options: {
        doNotFollow: { path: 'node_modules' },
        tsPreCompilationDeps: true,
        ...(fs.existsSync(path.join(ctx.candidate.root, 'tsconfig.json'))
          ? { tsConfig: { fileName: path.join(ctx.candidate.root, 'tsconfig.json') } }
          : {}),
      },
    }),
  );
  const tool = resolveBinary(ctx, 'depcruise');
  const process = runTool(
    ctx,
    'dependency-cruiser',
    tool,
    ['--config', config, '--output-type', 'json', ...files],
    { validCodes: [0, 1] },
  );
  const data = readJSON(process.stdout, 'dependency graph');
  if (!Array.isArray(data.modules)) throw new Error('Incomplete dependency graph');
  const seen = new Set(),
    external = new Set(),
    internalPackages = new Set();
  for (const entry of ctx.candidate.entries.filter((e) => path.posix.basename(e.path) === 'package.json')) {
    const pkg = JSON.parse(fs.readFileSync(path.join(ctx.candidate.root, entry.path), 'utf8'));
    if (pkg.name) internalPackages.add(pkg.name);
    for (const group of ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies'])
      for (const [name, version] of Object.entries(pkg[group] ?? {}))
        if (typeof version === 'string' && !/^(?:workspace:|file:|link:)/u.test(version)) external.add(name);
  }
  for (const module of data.modules) {
    const from = sourcePath(ctx.candidate.root, module.source);
    seen.add(from);
    const owner = zoneFor(from, policy.ownership);
    if (!owner && policy.ownership.required && files.includes(from))
      throw new Error(`No declared owner for ${from}`);
    for (const dependency of module.dependencies ?? []) {
      const denied = [
        ...(owner?.forbidPackages ?? []),
        ...(owner?.io === false
          ? ['fs', 'node:fs', 'http', 'node:http', 'https', 'node:https', 'electron', 'axios']
          : []),
      ];
      if (denied.some((name) => dependency.module === name || dependency.module?.startsWith(`${name}/`)))
        findings.push({
          ruleId: 'owner/package',
          language: languageOf(from),
          path: from,
          symbol: owner.id,
          target: dependency.module,
          kind: 'violation',
          severity: 'error',
          message: `Package ${dependency.module} is outside ${owner.id} contract`,
        });
      const packageName = dependency.module?.startsWith('@')
        ? dependency.module.split('/').slice(0, 2).join('/')
        : dependency.module?.split('/')[0];
      const declaredExternal = external.has(packageName) && !internalPackages.has(packageName);
      if (dependency.couldNotResolve && !dependency.coreModule && !declaredExternal) {
        if (policy.ownership.required)
          throw new Error(`Unresolved internal import: ${from} -> ${dependency.module}`);
        notes.push(
          coverage('javascript/ownership-unresolved', 'unsupported', [from], {
            required: false,
            reason: `Unresolved static/dynamic import ${dependency.module}`,
          }),
        );
        continue;
      }
      if (declaredExternal && dependency.couldNotResolve) continue;
      if (dependency.coreModule || dependency.dependencyTypes?.some((t) => t.startsWith('npm'))) continue;
      if (dependency.resolved?.startsWith('node_modules/')) continue;
      const to = sourcePath(ctx.candidate.root, dependency.resolved);
      const target = zoneFor(to, policy.ownership);
      if (owner && target && owner.id !== target.id && !owner.allows.includes(target.id))
        findings.push({
          ruleId: 'owner/import',
          language: languageOf(from),
          path: from,
          symbol: owner.id,
          target: to,
          kind: 'violation',
          severity: 'error',
          message: `Owner ${owner.id} may not import ${target.id}: ${to}`,
        });
      if (dependency.circular)
        findings.push({
          ruleId: 'owner/cycle',
          language: languageOf(from),
          path: from,
          target: to,
          kind: 'violation',
          severity: 'error',
          message: `Circular dependency through ${to}`,
        });
    }
  }
  if (files.some((f) => !seen.has(f))) throw new Error('Dependency graph omitted selected source');
  return {
    findings,
    coverage: [
      coverage('javascript/ownership', 'checked', files, {
        method: 'dependency-cruiser-local-graph',
        dynamic_resolution: false,
        capabilities: ['ownership'],
      }),
      ...notes,
    ],
  };
}
export async function collectJavaScript(ctx, allFiles, policy, profile) {
  const files = allFiles.filter(isJavaScript),
    findings = [];
  if (!files.length) return { findings, coverage: [coverage('javascript', 'not_applicable', [])] };
  const eslint = await loadPackage(ctx, 'eslint'),
    typescript = await loadPackage(ctx, 'typescript-eslint');
  const linter = new eslint.Linter();
  for (const filename of files) {
    const zone = zoneFor(filename, policy.ownership);
    const noIO = zone?.io === false;
    const language = languageOf(filename),
      source = fs.readFileSync(path.join(ctx.candidate.root, filename), 'utf8');
    const messages = linter.verify(
      source,
      {
        files: ['**/*.{js,mjs,cjs,jsx,ts,tsx,mts,cts}'],
        languageOptions: {
          parser: typescript.parser,
          parserOptions: { ecmaFeatures: { jsx: true } },
          sourceType: filename.endsWith('.cjs') ? 'commonjs' : 'module',
          globals: Object.fromEntries(
            [
              'fetch',
              'WebSocket',
              'EventSource',
              'localStorage',
              'sessionStorage',
              'window',
              'globalThis',
            ].map((k) => [k, 'readonly']),
          ),
        },
        plugins: { '@typescript-eslint': typescript.plugin },
        rules: {
          'no-debugger': 'error',
          ...(noIO
            ? {
                'no-restricted-globals': [
                  'error',
                  'fetch',
                  'WebSocket',
                  'EventSource',
                  'localStorage',
                  'sessionStorage',
                  'window',
                  'globalThis',
                ],
              }
            : {}),
          '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
        },
      },
      { filename },
    );
    if (messages.some((m) => m.fatal || m.ruleId === null))
      throw new Error(`JavaScript/TypeScript parsing failed: ${filename}`);
    const facts = await javascriptFacts(ctx, filename);
    for (const message of messages)
      findings.push({
        ruleId: `eslint/${message.ruleId}`,
        language,
        path: filename,
        kind: 'violation',
        severity: message.severity === 2 ? 'error' : 'warning',
        message: message.message,
        line: message.line,
        symbol: facts.functions.find((f) => f.start <= message.line && message.line <= f.end)?.symbol ?? '',
        target: message.message,
      });
    for (const f of facts.functions) {
      for (const [metric, value] of [
        ['function_lines', f.nloc],
        ['parameters', f.parameters],
        ['complexity', f.complexity],
        ['nesting', f.nesting],
      ])
        findings.push(
          metricFinding(
            metric,
            value,
            {
              path: filename,
              language,
              symbol: f.symbol,
              line: f.start,
              target: 'typescript-eslint-ast-control-v1',
            },
            policy,
          ),
        );
      if (f.exported)
        findings.push({
          ruleId: 'abstraction/public-function',
          language,
          path: filename,
          symbol: f.symbol,
          target: f.signature,
          kind: 'review',
          severity: 'info',
          line: f.start,
          message: 'Review ownership and caller-side simplicity of this exported function',
        });
    }
    for (const c of facts.classes) {
      for (const [metric, value] of [
        ['class_lines', c.nloc],
        ['public_methods', c.public_methods],
      ])
        findings.push(
          metricFinding(metric, value, { path: filename, language, symbol: c.symbol, line: c.start }, policy),
        );
      if (c.exported || c.static_only)
        findings.push({
          ruleId: c.static_only ? 'abstraction/static-class' : 'abstraction/public-class',
          language,
          path: filename,
          symbol: c.symbol,
          target: c.signature,
          kind: 'review',
          severity: 'info',
          line: c.start,
          message: 'Review state/invariants/resource ownership; do not extract or reject mechanically',
        });
    }
    for (const c of facts.classes)
      for (const field of c.public_fields ?? [])
        if (!field.readonly)
          findings.push({
            ruleId: 'abstraction/public-state',
            language,
            path: filename,
            symbol: `${c.symbol}.${field.name}`,
            target: field.signature,
            line: field.line,
            kind: 'review',
            severity: 'info',
            message:
              'Review exposed mutable state and invariant ownership; DTOs may intentionally expose data',
          });
    for (const type of facts.interfaces)
      if (type.exported)
        findings.push({
          ruleId: 'abstraction/public-type',
          language,
          path: filename,
          symbol: type.symbol,
          target: type.signature,
          line: type.line,
          kind: 'review',
          severity: 'info',
          message: 'Review the explicit public type/port contract and its consumers',
        });
    findings.push(...namingFindings(filename, language, facts, policy));
    if (/(?:^|\/)(?:utils|helpers|common|misc)(?:\.|\/)/u.test(filename))
      findings.push({
        ruleId: 'abstraction/generic-utility',
        language,
        path: filename,
        kind: 'review',
        severity: 'info',
        message: 'Review whether this utility belongs to a feature owner or a cohesive shared contract',
      });
  }
  const dependencies = await dependencyFindings(ctx, files, policy);
  findings.push(...dependencies.findings);
  const extra = [];
  for (const [enabled, id, args] of [
    [policy.unused, 'knip', ['--reporter', 'json', '--no-progress']],
    [
      policy.clones,
      'jscpd',
      [
        '--absolute',
        '--reporters',
        'json',
        '--output',
        path.join(ctx.outputRoot, 'clones'),
        '--min-tokens',
        '70',
        '--min-lines',
        '8',
        ...files,
      ],
    ],
  ]) {
    if (!enabled) continue;
    if (profile !== 'ci') {
      extra.push(coverage(`javascript/${id}`, 'not_scheduled', files, { reason: 'Explicit CI-only audit' }));
      continue;
    }
    if (id === 'jscpd') {
      const config = path.join(ctx.outputRoot, 'jscpd-config.json');
      fs.writeFileSync(
        config,
        JSON.stringify({
          semantic: false,
          absolute: true,
          mode: 'mild',
          minTokens: 70,
          minLines: 8,
          reporters: ['json'],
          output: path.join(ctx.outputRoot, 'clones'),
          ignore: [],
          gitignore: false,
        }),
      );
      args.unshift('--config', config);
    }
    const tool = resolveBinary(ctx, id);
    const process = runTool(ctx, id, tool, args, { validCodes: [0, 1] });
    const report =
      id === 'knip'
        ? readJSON(process.stdout, id)
        : readJSON(fs.readFileSync(path.join(ctx.outputRoot, 'clones/jscpd-report.json'), 'utf8'), id);
    ctx.cache.set(`audit:${id}`, report);
    extra.push(
      coverage(`javascript/${id}`, 'checked', files, { method: 'native-ci-audit', required: false }),
    );
    findings.push(...auditFindings(report, id, ctx));
  }
  return {
    findings,
    coverage: [
      coverage('javascript/ast', 'checked', files, {
        method: 'typescript-eslint',
        type_resolution: false,
        complexity_variant: 'ast-control-v1',
        supported_metrics: [
          'function_lines',
          'parameters',
          'complexity',
          'nesting',
          'class_lines',
          'public_methods',
        ],
      }),
      ...dependencies.coverage,
      ...extra,
    ],
  };
}

function auditFindings(report, id, ctx) {
  const result = [],
    captured = new Set(ctx.candidate.entries.map((e) => e.path));
  const normalize = (name) => {
    const p = sourcePath(ctx.candidate.root, name);
    if (!captured.has(p)) throw new Error(`Audit source not captured: ${p}`);
    return p;
  };
  if (id === 'knip') {
    if (!Array.isArray(report.issues)) throw new Error('Incomplete Knip report');
    for (const issue of report.issues)
      for (const [category, items] of Object.entries(issue)) {
        if (category === 'file') continue;
        if (!Array.isArray(items)) throw new Error('Unknown Knip issue structure');
        for (const item of items) {
          const filename = normalize(issue.file);
          if (typeof item.name !== 'string') throw new Error('Malformed Knip issue');
          result.push({
            ruleId: `unused/${category}`,
            language: 'javascript',
            path: filename,
            symbol: item.name,
            target: item.name,
            kind: 'review',
            severity: 'warning',
            ...(item.line ? { line: item.line } : {}),
            message: `Review ${category}: ${item.name}; entrypoints and external consumers may justify it`,
          });
        }
      }
  } else {
    if (!Array.isArray(report.duplicates)) throw new Error('Incomplete clone report');
    for (const clone of report.duplicates) {
      if (!clone.firstFile || !clone.secondFile || typeof clone.fragment !== 'string')
        throw new Error('Malformed clone pair');
      const first = normalize(clone.firstFile.name),
        second = normalize(clone.secondFile.name),
        pair = [first, second].sort();
      result.push({
        ruleId: 'duplication/block',
        language: 'javascript',
        path: pair[0],
        target: `${pair[1]}:${hash(
          clone.fragment
            .replace(/\r\n/gu, '\n')
            .split('\n')
            .map((s) => s.trim())
            .join('\n'),
        )}`,
        kind: 'review',
        severity: 'warning',
        value: clone.lines,
        line: pair[0] === first ? clone.firstFile.start : clone.secondFile.start,
        message: `Review shared behavior with ${pair[1]}; ${clone.lines} similar lines do not mandate extraction`,
      });
    }
  }
  return result;
}

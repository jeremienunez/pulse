import fs from 'node:fs';
import path from 'node:path';
import { pythonFacts, languageOf } from './metrics.mjs';
import { coverage, parseSARIF, readJSON, resolveBinary, runTool, sourcePath } from './adapters.mjs';
import { metricFinding } from './policy.mjs';
import { validateFinding } from './report.mjs';

export function nativeJSON(text, root, language, files) {
  const data = readJSON(text, 'native check');
  if (!data || data.success !== true || !Array.isArray(data.findings))
    throw new Error('Native JSON must explicitly report success and findings');
  return data.findings.map((f) => {
    if (
      !f ||
      typeof f.ruleId !== 'string' ||
      !f.ruleId ||
      typeof f.message !== 'string' ||
      !['violation', 'metric', 'review'].includes(f.kind) ||
      !['error', 'warning', 'info'].includes(f.severity)
    )
      throw new Error('Malformed native finding');
    const p = f.path === '.' ? '.' : sourcePath(root, f.path);
    if (p !== '.' && !files.has(p)) throw new Error('Native diagnostic outside captured source selection');
    const finding = { ...f, ruleId: `native/${f.ruleId}`, path: p, language };
    validateFinding(finding);
    return finding;
  });
}
export async function collectPython(ctx, allFiles, policy) {
  const files = allFiles.filter((f) => languageOf(f) === 'python'),
    findings = [];
  if (!files.length) return { findings, coverage: [coverage('python', 'not_applicable', [])] };
  const facts = pythonFacts(ctx, files);
  for (const row of facts) {
    for (const f of row.functions) {
      for (const [metric, value] of [
        ['function_lines', f.nloc],
        ['parameters', f.parameters],
      ])
        findings.push(
          metricFinding(
            metric,
            value,
            {
              path: row.path,
              language: 'python',
              symbol: f.symbol,
              line: f.start,
              target: 'python-ast-token-lines-v1',
            },
            policy,
          ),
        );
      if (f.exported)
        findings.push({
          ruleId: 'abstraction/public-function',
          language: 'python',
          path: row.path,
          symbol: f.symbol,
          line: f.start,
          kind: 'review',
          severity: 'info',
          message: 'Review the public function contract and its owner',
        });
    }
    for (const c of row.classes) {
      for (const [metric, value] of [
        ['class_lines', c.nloc],
        ['public_methods', c.public_methods],
      ])
        findings.push(
          metricFinding(
            metric,
            value,
            { path: row.path, language: 'python', symbol: c.symbol, line: c.start },
            policy,
          ),
        );
      findings.push({
        ruleId: c.static_only ? 'abstraction/static-class' : 'abstraction/class',
        language: 'python',
        path: row.path,
        symbol: c.symbol,
        kind: 'review',
        severity: 'info',
        line: c.start,
        message: 'Review cohesive state/invariants/resource ownership; one consumer is not an error',
      });
    }
  }
  const tool = resolveBinary(ctx, 'ruff');
  const process = runTool(
    ctx,
    'ruff',
    tool,
    [
      'check',
      '--isolated',
      '--no-cache',
      '--no-fix',
      '--output-format',
      'json',
      '--select',
      'F,N,C90,PLR0912',
      ...files.map((f) => `./${f}`),
    ],
    { validCodes: [0, 1] },
  );
  const data = readJSON(process.stdout, 'Ruff');
  if (!Array.isArray(data)) throw new Error('Incomplete Ruff result');
  for (const d of data) {
    if (typeof d.code !== 'string' || !d.location || typeof d.message !== 'string')
      throw new Error('Malformed Ruff diagnostic');
    const filename = sourcePath(ctx.candidate.root, d.filename);
    if (!files.includes(filename)) throw new Error('Unexpected Ruff source');
    const fn = facts
      .find((f) => f.path === filename)
      ?.functions.filter((f) => f.start <= d.location.row && d.location.row <= f.end)
      .sort((a, b) => b.start - a.start)[0];
    findings.push({
      ruleId: `ruff/${d.code}`,
      language: 'python',
      path: filename,
      symbol: fn?.symbol ?? '',
      target: d.message,
      line: d.location.row,
      column: d.location.column,
      kind: 'violation',
      severity: d.code.startsWith('F') ? 'error' : 'warning',
      message: d.message,
    });
  }
  const ownership = policy.ownership?.zones.some((z) =>
    files.some((f) => z.patterns.some((p) => path.matchesGlob(f, p))),
  );
  return {
    findings,
    coverage: [
      coverage('python/ast-and-lint', 'checked', files, {
        method: 'python-ast-tokenize+ruff',
        type_resolution: false,
        supported_metrics: ['function_lines', 'parameters', 'class_lines', 'public_methods'],
      }),
      ...(ownership &&
      !policy.checks.some(
        (c) => c.capabilities?.includes('ownership') && files.some((f) => bindingMatches(c, f)),
      )
        ? [
            coverage('python/ownership', 'unsupported', files, {
              required: policy.ownership.required === true,
              reason: 'Use a native project architecture binding for Python import/layer contracts',
            }),
          ]
        : []),
    ],
  };
}
export async function collectRust(ctx, allFiles, _policy, profile) {
  const files = allFiles.filter((f) => languageOf(f) === 'rust'),
    findings = [];
  if (!files.length) return { findings, coverage: [coverage('rust', 'not_applicable', [])] };
  if (profile !== 'ci')
    return {
      findings,
      coverage: [
        coverage('rust/clippy', 'not_scheduled', files, {
          reason: 'Build-bound check is explicitly CI-only; lexical metrics remain separate',
        }),
      ],
    };
  if (!fs.existsSync(path.join(ctx.candidate.root, 'Cargo.toml')))
    throw new Error('Rust Clippy needs a captured Cargo.toml and prepared offline dependencies');
  const { tool, env: rustEnv } = preparedRust(ctx);
  const target = path.join(ctx.outputRoot, 'cargo-target');
  const metadataRun = runTool(
    ctx,
    'cargo-metadata',
    tool,
    ['metadata', '--offline', '--locked', '--no-deps', '--format-version', '1'],
    { env: { ...rustEnv, CARGO_TARGET_DIR: target } },
  );
  const metadata = readJSON(metadataRun.stdout, 'Cargo metadata');
  for (const pkg of metadata.packages ?? [])
    if (
      pkg.source === null &&
      !path.resolve(pkg.manifest_path).startsWith(`${ctx.candidate.root}${path.sep}`)
    )
      throw new Error('Cargo workspace source escapes captured snapshot');
  const process = runTool(
    ctx,
    'clippy',
    tool,
    [
      'clippy',
      '--offline',
      '--locked',
      '--all-targets',
      '--message-format=json',
      '--',
      '-W',
      'clippy::too_many_arguments',
      '-W',
      'clippy::too_many_lines',
      '-W',
      'clippy::type_complexity',
    ],
    { validCodes: [0, 101], env: { ...rustEnv, CARGO_TARGET_DIR: target } },
  );
  let terminal = false;
  for (const line of process.stdout.split(/\r?\n/u).filter(Boolean)) {
    const d = readJSON(line, 'Cargo message');
    if (d.reason === 'build-finished') terminal = d.success === true;
    if (d.reason !== 'compiler-message') continue;
    const m = d.message;
    if (!['error', 'warning'].includes(m?.level)) continue;
    const span = m.spans?.find((s) => s.is_primary),
      filename = span ? sourcePath(ctx.candidate.root, span.file_name) : '.';
    if (filename !== '.' && !allFiles.includes(filename))
      throw new Error('Cargo diagnostic source is outside selected policy roots');
    findings.push({
      ruleId: `rust/${m.code?.code ?? 'compiler'}`,
      language: 'rust',
      path: filename,
      kind: 'violation',
      severity: m.level,
      line: span?.line_start ?? 1,
      target: m.message,
      message: m.message,
    });
  }
  if (!terminal && !findings.some((f) => f.severity === 'error'))
    throw new Error('Cargo did not produce a complete build or source diagnostic');
  const ownership =
    _policy.ownership?.required &&
    _policy.ownership.zones.some((z) => files.some((f) => z.patterns.some((p) => path.matchesGlob(f, p))));
  const delegated = _policy.checks.some(
    (c) => c.capabilities?.includes('ownership') && files.some((f) => bindingMatches(c, f)),
  );
  return {
    findings,
    coverage: [
      coverage('rust/clippy', terminal ? 'checked' : 'unavailable', files, {
        method: 'offline-locked-cargo',
        module_graph: false,
        ...(terminal
          ? {}
          : {
              required: true,
              reason: 'Compilation failed; diagnostics retained but complete analysis cannot be claimed',
            }),
      }),
      ...(ownership && !delegated
        ? [
            coverage('rust/ownership', 'unsupported', files, {
              required: true,
              reason: 'Use an explicit native architecture binding for module ownership',
            }),
          ]
        : []),
    ],
  };
}
function bindingMatches(check, filename) {
  return check.patterns?.length
    ? check.patterns.some((p) => path.matchesGlob(filename, p))
    : check.language === '*' || languageOf(filename) === check.language;
}
export async function collectBindings(ctx, files, policy, profile) {
  const findings = [],
    rows = [],
    known = new Set(files);
  for (const check of policy.checks) {
    const applicable = files.filter((f) => bindingMatches(check, f));
    if (!applicable.length) {
      rows.push(coverage(check.id, 'not_applicable', [], { required: check.required !== false }));
      continue;
    }
    if (check.profile !== profile) {
      rows.push(
        coverage(check.id, 'not_scheduled', applicable, {
          reason: `${check.profile}-only project binding`,
          capabilities: check.capabilities ?? [],
        }),
      );
      continue;
    }
    try {
      const [name, ...args] = check.command;
      if (['agy', 'claude', 'codex', 'gemini', 'opencode', 'npx', 'pip', 'uv'].includes(path.basename(name)))
        throw new Error('Provider/install commands are not quality analyzers');
      if (path.basename(name) === 'npm' && !['run', 'test'].includes(args[0]))
        throw new Error('Only prepared project npm run/test bindings are allowed');
      const tool = resolveBinary(ctx, name);
      const process = runTool(ctx, check.id, tool, args, { validCodes: [0, 1] });
      const data =
        check.format === 'sarif'
          ? parseSARIF(process.stdout, ctx.candidate.root, check.language, known)
          : nativeJSON(process.stdout, ctx.candidate.root, check.language, known);
      if (process.status !== 0 && !data.some((f) => f.kind !== 'review' && f.severity === 'error'))
        throw new Error('Native command failed without a complete source diagnostic');
      findings.push(...data);
      rows.push(
        coverage(check.id, 'checked', applicable, {
          method: check.format,
          required: check.required !== false,
          capabilities: check.capabilities ?? [],
        }),
      );
    } catch (error) {
      rows.push(
        coverage(check.id, 'unavailable', applicable, {
          required: check.required !== false,
          reason: error.message,
        }),
      );
    }
  }
  const nativeFiles = files.filter(
    (f) => !['javascript', 'typescript', 'python', 'rust', 'css', 'scss'].includes(languageOf(f)),
  );
  for (const filename of nativeFiles)
    if (!policy.checks.some((c) => bindingMatches(c, filename)))
      rows.push(
        coverage('native/binding', 'unsupported', [filename], {
          required: true,
          reason: 'No native analyzer binding declared for this language',
        }),
      );
  return { findings, coverage: rows };
}

function preparedRust(ctx) {
  const requested = ctx.candidate.env.RUSTUP_TOOLCHAIN;
  if (
    !requested &&
    ['rust-toolchain', 'rust-toolchain.toml'].some((p) => fs.existsSync(path.join(ctx.candidate.root, p)))
  )
    throw new Error(
      'Select an explicitly prepared RUSTUP_TOOLCHAIN; checks never auto-install a project toolchain',
    );
  const rustup = resolveBinary(ctx, 'rustup');
  const listing = runTool(ctx, 'rustup-installed', rustup, ['toolchain', 'list', '--verbose']);
  const rows = listing.stdout
    .split(/\r?\n/u)
    .filter((s) => s.trim())
    .map((s) => ({ name: s.split(/\s+/u)[0], active: /\((?:[^)]*active|[^)]*default)/u.test(s) }));
  const candidates = requested
    ? rows.filter((r) => r.name === requested || r.name.startsWith(`${requested}-`))
    : rows.filter((r) => r.active);
  if (candidates.length !== 1)
    throw new Error(
      'Rust toolchain is missing or ambiguous; prepare/select an installed toolchain outside checks',
    );
  const selected = candidates[0].name;
  const located = runTool(ctx, 'rustup-installed-cargo', rustup, ['which', '--toolchain', selected, 'cargo']);
  const tool = located.stdout.trim(),
    bin = path.dirname(tool);
  for (const name of ['cargo', 'cargo-clippy', 'rustc', 'clippy-driver'])
    if (!fs.existsSync(path.join(bin, name))) throw new Error(`Prepared Rust component missing: ${name}`);
  const identified = resolveBinary(ctx, tool);
  ctx.identities.set('rust-toolchain', { id: 'rust-toolchain', version: selected });
  return {
    tool: identified,
    env: {
      RUSTUP_TOOLCHAIN: selected,
      PATH: `${bin}${path.delimiter}${ctx.candidate.env.PATH ?? ''}`,
      RUSTC: path.join(bin, 'rustc'),
      RUSTDOC: path.join(bin, 'rustdoc'),
    },
  };
}

import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { captureCandidate, QualityUnavailable } from './pulse-quality-candidate.mjs';

export function checkEnvironmentPaths(entries) {
  return entries
    .filter(
      (entry) =>
        /^\.env/u.test(path.posix.basename(entry.path)) && path.posix.basename(entry.path) !== '.env.example',
    )
    .map((entry) => entry.path);
}

export function verifyCandidate(
  candidate,
  checks,
  { profile, timeoutMs = 120000, onStep = () => {}, reportDir: selectedReportDir, codeQuality } = {},
) {
  const reportDir =
    selectedReportDir ?? path.join(candidate.gitDir, 'pulse-quality', `${candidate.tree}-${randomUUID()}`);
  fs.mkdirSync(reportDir, { recursive: true });
  const report = {
    schema_version: '1.0',
    tree: candidate.tree,
    profile,
    status: 'passed',
    checks: [],
    started_at: new Date().toISOString(),
    finished_at: '',
    report_dir: reportDir,
  };
  try {
    const forbidden = checkEnvironmentPaths(candidate.entries);
    if (forbidden.length) {
      report.status = 'failed';
      report.reason = `Indexed environment files are not allowed: ${forbidden.join(', ')}`;
    }
    if (!checks.length && report.status === 'passed')
      throw new QualityUnavailable('No verification commands were declared.');
    for (const [index, check] of checks.entries()) {
      if (report.status !== 'passed') break;
      onStep(check.id);
      const result = spawnSync(check.command, check.args, {
        cwd: candidate.root,
        env: candidate.env,
        encoding: 'utf8',
        timeout: timeoutMs,
        maxBuffer: 4 * 1024 * 1024,
        shell: false,
      });
      const log = `${String(index).padStart(4, '0')}.log`;
      fs.writeFileSync(
        path.join(reportDir, log),
        `${result.stdout || ''}${result.stderr || ''}${result.error ? `\n${result.error.message}\n` : ''}`,
      );
      const status =
        result.error || result.signal || result.status === null
          ? 'unavailable'
          : result.status === 0
            ? 'passed'
            : 'failed';
      report.checks.push({
        id: check.id,
        command: check.command,
        args: check.args,
        status,
        exit_code: result.status,
        signal: result.signal,
        log,
      });
      if (status !== 'passed') report.status = status;
    }
    if (codeQuality) {
      report.code_quality = codeQuality;
      if (codeQuality.status === 'unavailable') report.status = 'unavailable';
      else if (codeQuality.status === 'failed' && report.status === 'passed') report.status = 'failed';
    }
    if (!candidate.current()) {
      report.status = 'failed';
      report.reason =
        'The source Git index changed during verification; verify the new candidate before committing.';
    }
  } catch (error) {
    report.status = 'unavailable';
    report.reason = error.message;
  }
  report.finished_at = new Date().toISOString();
  const reportPath = path.join(reportDir, 'result.json');
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, { flag: 'wx' });
  return { ...report, report_path: reportPath };
}

export async function runQuality(repoRoot, profile, options = {}) {
  if (options.scope === 'code') return runCodeQuality(repoRoot, profile, options);
  if (options.scope && options.scope !== 'pulse') throw new QualityUnavailable('Unknown quality scope');
  const candidate = captureCandidate(repoRoot);
  try {
    const runtimeRoot = fileURLToPath(new URL('../../', import.meta.url));
    const runtime = [
      'scripts/pulse-quality.mjs',
      'scripts/lib/pulse-quality.mjs',
      'scripts/lib/pulse-quality-candidate.mjs',
      'scripts/lib/pulse-quality-profile.mjs',
    ];
    for (const file of runtime) {
      if (
        !fs
          .readFileSync(path.join(runtimeRoot, file))
          .equals(fs.readFileSync(path.join(candidate.root, file)))
      ) {
        throw new QualityUnavailable(
          `The running quality verifier differs from the indexed candidate; stage or select the matching verifier: ${file}`,
        );
      }
    }
    const { qualityChecks } = await import(
      pathToFileURL(path.join(candidate.root, 'scripts/lib/pulse-quality-profile.mjs'))
    );
    const reportDir = path.join(candidate.gitDir, 'pulse-quality', `${candidate.tree}-${randomUUID()}`);
    const codeQuality = fs.existsSync(
      path.join(candidate.root, options.policyFile ?? 'pulse-quality.config.json'),
    )
      ? await analyzeCode(candidate, profile, { ...options, reportDir })
      : undefined;
    return verifyCandidate(candidate, qualityChecks(profile, candidate.entries), {
      ...options,
      profile,
      reportDir,
      codeQuality,
    });
  } finally {
    candidate.dispose();
  }
}

async function runtimeIdentity() {
  const { hash, stableJSON } = await import('../code-quality/policy.mjs');
  const { execFileSync } = await import('node:child_process');
  const root = fileURLToPath(new URL('../../', import.meta.url));
  const files = [
    'scripts/pulse-quality.mjs',
    'scripts/lib/pulse-quality.mjs',
    'scripts/lib/pulse-quality-profile.mjs',
    'scripts/lib/pulse-quality-candidate.mjs',
  ];
  function walk(directory) {
    for (const item of fs.readdirSync(path.join(root, directory), { withFileTypes: true })) {
      if (item.name === 'node_modules' || item.name === '__pycache__') continue;
      const relative = `${directory}/${item.name}`;
      if (item.isSymbolicLink()) throw new Error(`Runtime contains a symlink: ${relative}`);
      if (item.isDirectory()) walk(relative);
      else if (item.isFile()) files.push(relative);
    }
  }
  walk('scripts/code-quality');
  const manifestFile = path.join(root, 'dist-manifest.json');
  const manifest = fs.existsSync(manifestFile)
    ? new Map(JSON.parse(fs.readFileSync(manifestFile)).files.map((f) => [f.path, f.sha256]))
    : null;
  const gitEnv = { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1' };
  for (const key of execFileSync('git', ['rev-parse', '--local-env-vars'], { encoding: 'utf8' })
    .trim()
    .split('\n'))
    delete gitEnv[key];
  gitEnv.GIT_CONFIG_GLOBAL = '/dev/null';
  gitEnv.GIT_CONFIG_NOSYSTEM = '1';
  const rows = [];
  for (const file of files.sort()) {
    const bytes = fs.readFileSync(path.join(root, file)),
      digest = hash(bytes);
    const expected = manifest
      ? manifest.get(file)
      : hash(
          execFileSync('git', ['-C', root, 'show', `:${file}`], {
            maxBuffer: 8 * 1024 * 1024,
            stdio: ['ignore', 'pipe', 'pipe'],
            env: gitEnv,
          }),
        );
    if (digest !== expected)
      throw new Error(
        `Runtime differs from ${manifest ? 'distribution manifest' : 'its own Git index'}: ${file}`,
      );
    rows.push({ path: file, sha256: digest });
  }
  return {
    root,
    node: process.versions.node,
    platform: process.platform,
    arch: process.arch,
    kind: manifest ? 'distribution-manifest' : 'git-index',
    sha256: hash(stableJSON(rows)),
    files: rows,
  };
}

async function analyzeCode(candidate, profile, options) {
  const {
    loadPolicy,
    hash,
    hashFile,
    stableJSON,
    selectedFiles,
    dateValid,
    matches,
    ruleOverrides,
    fileNameFindings,
  } = await import('../code-quality/policy.mjs');
  const { toolContext, assertUnchanged, coverage } = await import('../code-quality/adapters.mjs');
  const { createBaseline, settleFindings, validateBaseline } = await import('../code-quality/report.mjs');
  const reportDir = options.reportDir;
  fs.mkdirSync(reportDir, { recursive: true, mode: 0o700 });
  const result = {
    schema_version: '1.0',
    tree: candidate.tree,
    profile,
    status: 'unavailable',
    exit_code: 2,
    coverage: [],
    findings: [],
    runtime: {},
    toolchain: [],
    checks: [],
    started_at: new Date().toISOString(),
  };
  let ctx;
  try {
    if (Number(process.versions.node.split('.')[0]) < 24)
      throw new Error('Code quality requires Node 24 or newer; no global runtime upgrade is performed');
    if (!['commit', 'ci'].includes(profile)) throw new Error('Unknown quality profile');
    const environmentFiles = checkEnvironmentPaths(candidate.entries);
    if (environmentFiles.length)
      throw new Error(`Indexed environment files are not allowed: ${environmentFiles.join(', ')}`);
    result.runtime = await runtimeIdentity();
    const loaded =
      options.preparedPolicy ?? loadPolicy(candidate.root, options.policyFile ?? 'pulse-quality.config.json');
    const { policy, policyHash } = loaded;
    result.policy_hash = policyHash;
    result.policy_source_hash = loaded.sourceHash;
    result.mode = options.mode ?? policy.mode;
    if (!['observe', 'enforce-new'].includes(result.mode)) throw new Error('Unknown enforcement mode');
    const date = options.evaluationDate ?? new Date().toISOString().slice(0, 10);
    if (!dateValid(date)) throw new Error('Invalid evaluation date');
    result.evaluation_date = date;
    const files = selectedFiles(candidate.entries, policy);
    result.selected_files = files;
    if (!files.length && !options.exportingBaseline)
      throw new Error('No captured source files selected for code verification');
    for (const exclusion of policy.exclude)
      result.coverage.push(
        coverage(
          'policy/exclusion',
          'excluded',
          candidate.entries.filter((e) => matches(e.path, exclusion.pattern)).map((e) => e.path),
          { reason: exclusion.reason },
        ),
      );
    const before = new Map(
      candidate.entries.map((e) => [e.path, hashFile(path.join(candidate.root, e.path))]),
    );
    const preparationFile = path.join(candidate.gitDir, 'pulse-quality', 'toolchain.json');
    const preparation = fs.existsSync(preparationFile)
      ? JSON.parse(fs.readFileSync(preparationFile, 'utf8'))
      : null;
    const toolchainRoot = options.toolchainRoot ?? process.env.PULSE_QUALITY_TOOLCHAIN ?? preparation?.root;
    result.toolchain_selection =
      options.toolchainRoot !== undefined
        ? 'explicit'
        : process.env.PULSE_QUALITY_TOOLCHAIN
          ? 'environment'
          : preparation
            ? 'project-preparation-record'
            : 'missing';
    ctx = toolContext(candidate, toolchainRoot, path.join(reportDir, 'code'), options.timeoutMs);
    const operations = {
      metrics: ['metrics', 'collectMetrics'],
      javascript: ['javascript', 'collectJavaScript'],
      python: ['native', 'collectPython'],
      rust: ['native', 'collectRust'],
      frontend: ['frontend', 'collectFrontend'],
      native: ['native', 'collectBindings'],
    };
    for (const id of policy.profiles) {
      try {
        const [moduleName, method] = operations[id];
        const adapter = await import(`../code-quality/${moduleName}.mjs`);
        const data = await adapter[method](ctx, files, policy, profile);
        if (!Array.isArray(data.findings) || !Array.isArray(data.coverage))
          throw new Error('Malformed adapter result');
        result.findings.push(...data.findings);
        result.coverage.push(...data.coverage);
        if (data.metrics) result.metrics = data.metrics;
      } catch (error) {
        result.coverage.push(coverage(id, 'unavailable', files, { required: true, reason: error.message }));
      }
    }
    const { languageOf, strictBudgetCoverage } = await import('../code-quality/metrics.mjs');
    result.coverage.push(...strictBudgetCoverage(files, policy, result.coverage));
    if (policy.ownership?.required) {
      const programFiles = files.filter(
        (file) => !['css', 'scss', 'sass', 'less'].includes(languageOf(file)),
      );
      const missing = programFiles.filter(
        (file) =>
          !policy.ownership.zones.some((zone) => zone.patterns.some((pattern) => matches(file, pattern))) ||
          !result.coverage.some(
            (row) =>
              ['checked', 'not_scheduled'].includes(row.status) &&
              row.files.includes(file) &&
              row.capabilities?.includes('ownership'),
          ),
      );
      if (missing.length)
        result.coverage.push(
          coverage('policy/ownership', 'unsupported', missing, {
            required: true,
            reason:
              'Required ownership needs a declared owner and a checked or explicitly scheduled architecture analyzer for every program file',
          }),
        );
    }
    for (const filename of files) {
      const binding = policy.checks.find((c) => c.patterns?.some((p) => matches(filename, p)));
      const language =
        binding?.language ??
        result.metrics?.find((m) => m.path === filename)?.language ??
        languageOf(filename);
      result.findings.push(...fileNameFindings(filename, language, policy));
    }
    assertUnchanged(candidate, before);
    result.findings = ruleOverrides(result.findings, policy.rules);
    result.measurements = result.findings
      .filter((f) => f.kind === 'metric')
      .map(({ path, language, symbol, metric, value }) => ({
        path,
        language,
        ...(symbol ? { symbol } : {}),
        metric,
        value,
      }));
    result.findings = result.findings.filter((f) => f.kind !== 'metric' || f.severity !== 'info');
    result.toolchain = [...ctx.identities.values()].sort((a, b) => a.id.localeCompare(b.id));
    result.checks = ctx.checks;
    const declaredToolchain = path.join(result.runtime.root, 'scripts/code-quality/toolchain.json');
    result.toolchain_hash = hash(
      stableJSON({ runtime: result.runtime.sha256, declaration: hash(fs.readFileSync(declaredToolchain)) }),
    );
    const unhandled = files.filter(
      (file) =>
        !result.coverage.some(
          (c) => ['checked', 'not_scheduled', 'excluded'].includes(c.status) && c.files.includes(file),
        ),
    );
    if (unhandled.length)
      result.coverage.push(
        coverage('policy/source-coverage', 'unsupported', unhandled, {
          required: true,
          reason: 'No selected adapter checked or explicitly scheduled these source files',
        }),
      );
    const unavailable = result.coverage.filter(
      (c) => ['unavailable', 'unsupported'].includes(c.status) && c.required !== false,
    );
    if (unavailable.length)
      throw new Error(`Required code coverage unavailable: ${unavailable.map((c) => c.id).join(', ')}`);
    if (options.exportingBaseline) {
      result.baseline = createBaseline(result.findings, {
        source_tree: candidate.tree,
        policy_hash: policyHash,
        toolchain_hash: result.toolchain_hash,
      });
      result.status = 'observed';
      result.exit_code = 0;
    } else {
      const baselinePath = path.join(candidate.root, policy.baseline);
      const baseline = fs.existsSync(baselinePath)
        ? validateBaseline(JSON.parse(fs.readFileSync(baselinePath, 'utf8')))
        : null;
      if (
        baseline &&
        (baseline.policy_hash !== policyHash || baseline.toolchain_hash !== result.toolchain_hash)
      )
        throw new Error(
          'Baseline policy/runtime identity differs; review and regenerate explicitly from the intended base',
        );
      Object.assign(
        result,
        settleFindings(result.findings, baseline, {
          mode: result.mode,
          evaluationDate: date,
          exceptions: policy.exceptions,
        }),
      );
      if (!result.coverage.some((c) => c.status === 'checked')) {
        result.status = 'observed';
        result.exit_code = 0;
        result.reason = 'No code checks scheduled/applicable in this profile; coverage is not a pass claim';
      }
    }
    if (!candidate.current()) throw new Error('Source Git index changed during code verification');
  } catch (error) {
    result.status = 'unavailable';
    result.exit_code = 2;
    result.reason = error.message;
    if (ctx) {
      result.toolchain = [...ctx.identities.values()];
      result.checks = ctx.checks;
    }
  }
  result.finished_at = new Date().toISOString();
  return result;
}

export async function runCodeQuality(repoRoot, profile, options = {}) {
  const { loadPolicy } = await import('../code-quality/policy.mjs');
  if (options.exportBaseline && fs.existsSync(path.resolve(options.exportBaseline)))
    throw new QualityUnavailable('Baseline export destination already exists');
  const active = captureCandidate(repoRoot, { env: options.env ?? process.env });
  let source = active;
  const reportDir = path.join(active.gitDir, 'pulse-quality', `${active.tree}-${randomUUID()}`);
  try {
    const preparedPolicy = loadPolicy(active.root, options.policyFile ?? 'pulse-quality.config.json');
    if (options.baselineFrom) {
      if (!options.exportBaseline)
        throw new QualityUnavailable('baseline-from requires an explicit new export destination');
      source = captureCandidate(repoRoot, { ref: options.baselineFrom, env: options.env ?? process.env });
    } else if (options.exportBaseline)
      throw new QualityUnavailable(
        'Baseline export requires an explicit baseline-from reference; cannot baseline the current new implementation silently',
      );
    const result = await analyzeCode(source, profile, {
      ...options,
      preparedPolicy,
      exportingBaseline: Boolean(options.exportBaseline),
      reportDir,
    });
    result.index_tree = active.tree;
    result.base_reference = options.baselineFrom ?? null;
    if (!active.current()) {
      result.status = 'unavailable';
      result.exit_code = 2;
      result.reason = 'Source Git index changed during verification';
    }
    if (options.exportBaseline && result.exit_code === 0)
      fs.writeFileSync(
        path.resolve(options.exportBaseline),
        `${JSON.stringify(result.baseline, null, 2)}\n`,
        { flag: 'wx', mode: 0o600 },
      );
    fs.mkdirSync(reportDir, { recursive: true, mode: 0o700 });
    const reportPath = path.join(reportDir, 'result.json');
    result.report_path = reportPath;
    fs.writeFileSync(reportPath, `${JSON.stringify(result, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
    return result;
  } catch (error) {
    const result = {
      schema_version: '1.0',
      tree: active.tree,
      profile,
      status: 'unavailable',
      exit_code: 2,
      reason: error.message,
      coverage: [],
      findings: [],
      runtime: {},
      toolchain: [],
      checks: [],
    };
    fs.mkdirSync(reportDir, { recursive: true, mode: 0o700 });
    result.report_path = path.join(reportDir, 'result.json');
    fs.writeFileSync(result.report_path, `${JSON.stringify(result, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
    return result;
  } finally {
    if (source !== active) source.dispose();
    active.dispose();
  }
}

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { hash, hashFile, relativePath } from './policy.mjs';

export function toolContext(candidate, toolchainRoot, outputRoot, timeoutMs = 120000) {
  const root = toolchainRoot ? fs.realpathSync(toolchainRoot) : null;
  const context = {
    candidate,
    toolchainRoot: root,
    outputRoot,
    timeoutMs,
    identities: new Map(),
    checks: [],
    cache: new Map(),
  };
  fs.mkdirSync(outputRoot, { recursive: true, mode: 0o700 });
  if (root) {
    const lock = path.join(root, 'package-lock.json');
    if (fs.existsSync(lock)) context.identities.set('npm-lock', { id: 'npm-lock', sha256: hashFile(lock) });
  }
  return context;
}
export async function loadPackage(ctx, name) {
  const key = `package:${name}`;
  if (ctx.cache.has(key)) return ctx.cache.get(key);
  if (!ctx.toolchainRoot)
    throw new Error(`Prepared toolchain required for ${name}; no installation is attempted`);
  const req = createRequire(path.join(ctx.toolchainRoot, 'package.json')),
    entry = req.resolve(name);
  let dir = path.dirname(entry),
    metadata;
  while (true) {
    const p = path.join(dir, 'package.json');
    if (fs.existsSync(p)) {
      const m = JSON.parse(fs.readFileSync(p, 'utf8'));
      if (m.name === name) {
        metadata = m;
        break;
      }
    }
    const parent = path.dirname(dir);
    if (parent === dir) throw new Error(`No package identity for ${name}`);
    dir = parent;
  }
  const declared = JSON.parse(
    fs.readFileSync(fileURLToPath(new URL('./tools/package.json', import.meta.url)), 'utf8'),
  ).dependencies;
  if (declared[name] && metadata.version !== declared[name])
    throw new Error(`Unsupported ${name} version ${metadata.version}; profile requires ${declared[name]}`);
  ctx.identities.set(key, { id: key, version: metadata.version, path: entry, sha256: hashFile(entry) });
  const module = await import(pathToFileURL(entry).href);
  const value = module.default ?? module;
  ctx.cache.set(key, value);
  return value;
}
export function resolveBinary(ctx, name) {
  const paths = ctx.toolchainRoot
    ? ['native/bin', '.venv/bin', 'node_modules/.bin', 'bin'].map((p) =>
        path.join(ctx.toolchainRoot, p, name),
      )
    : [];
  if (path.isAbsolute(name)) paths.unshift(name);
  else
    for (const dir of (ctx.candidate.env.PATH ?? '').split(path.delimiter).filter(Boolean))
      paths.push(path.join(dir, name));
  const binary = paths.find((p) => {
    try {
      fs.accessSync(p, fs.constants.X_OK);
      return fs.statSync(p).isFile();
    } catch {
      return false;
    }
  });
  if (!binary) throw new Error(`Required executable unavailable: ${name}`);
  const real = fs.realpathSync(binary);
  const probes = {
    python: ['--version'],
    python3: ['--version'],
    ruff: ['--version'],
    tokei: ['--version'],
    cargo: ['--version'],
    depcruise: ['--version'],
    node: ['--version'],
    knip: ['--version'],
    jscpd: ['--version'],
  };
  let version;
  if (probes[name]) {
    const p = spawnSync(binary, probes[name], {
      encoding: 'utf8',
      timeout: 10000,
      shell: false,
      env: ctx.candidate.env,
    });
    if (p.status !== 0) throw new Error(`Cannot identify ${name} version`);
    version = `${p.stdout || p.stderr}`.trim().slice(0, 1000);
  }
  const declared = JSON.parse(
    fs.readFileSync(fileURLToPath(new URL('./toolchain.json', import.meta.url)), 'utf8'),
  );
  const expected =
    name === 'tokei' ? declared.tokei : name === 'ruff' ? declared.python_packages.ruff : undefined;
  if (expected && !version?.split(/\s+/u).includes(expected))
    throw new Error(`Unsupported ${name} version; profile requires ${expected}`);
  ctx.identities.set(`binary:${name}`, {
    id: `binary:${name}`,
    path: real,
    ...(version ? { version } : {}),
    sha256: hashFile(real),
  });
  return binary;
}
export function runTool(
  ctx,
  id,
  command,
  args,
  { input, validCodes = [0], cwd = ctx.candidate.root, env = {} } = {},
) {
  const prefix = `${String(ctx.checks.length).padStart(3, '0')}-${id.replace(/[^a-z0-9_.-]/giu, '_')}`;
  const result = spawnSync(command, args, {
    cwd,
    env: {
      ...ctx.candidate.env,
      CI: '1',
      CARGO_NET_OFFLINE: 'true',
      GOPROXY: 'off',
      GOSUMDB: 'off',
      npm_config_offline: 'true',
      PIP_NO_INDEX: '1',
      ...env,
    },
    input,
    encoding: 'utf8',
    shell: false,
    timeout: ctx.timeoutMs,
    maxBuffer: 8 * 1024 * 1024,
  });
  const stdout = path.join(ctx.outputRoot, `${prefix}.stdout.log`),
    stderr = path.join(ctx.outputRoot, `${prefix}.stderr.log`);
  fs.writeFileSync(stdout, result.stdout ?? '', { mode: 0o600 });
  fs.writeFileSync(stderr, `${result.stderr ?? ''}${result.error ? `\n${result.error.message}` : ''}`, {
    mode: 0o600,
  });
  ctx.checks.push({ id, command, args, exit_code: result.status, signal: result.signal, stdout, stderr });
  if (result.error || result.signal || !validCodes.includes(result.status))
    throw new Error(`${id} unavailable (exit ${result.status ?? 'none'}); see ${stderr}`);
  return result;
}
export function sourcePath(root, value, { uri = false } = {}) {
  if (typeof value !== 'string') throw new Error('Diagnostic has no source path');
  const input = value.startsWith('file:') ? fileURLToPath(value) : uri ? decodeURIComponent(value) : value;
  const absolute = path.isAbsolute(input) ? input : path.resolve(root, input);
  const relative = path.relative(root, absolute).split(path.sep).join('/');
  return relativePath(relative, 'diagnostic path');
}
export function readJSON(text, label) {
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`Invalid ${label} JSON`);
  }
}
export function parseSARIF(text, root, language, knownFiles) {
  const document = readJSON(text, 'SARIF');
  if (document.version !== '2.1.0' || !Array.isArray(document.runs) || !document.runs.length)
    throw new Error('Unsupported or empty SARIF envelope');
  const findings = [];
  for (const run of document.runs) {
    if (!run.tool?.driver?.name || !Array.isArray(run.results)) throw new Error('Incomplete SARIF run');
    if (
      run.invocations?.some(
        (i) =>
          i.executionSuccessful === false || i.toolExecutionNotifications?.some((n) => n.level === 'error'),
      )
    )
      throw new Error('SARIF tool execution was incomplete');
    for (const r of run.results) {
      if (['notApplicable', 'pass', 'informational'].includes(r.kind)) continue;
      if (r.kind !== undefined && !['fail', 'review', 'open'].includes(r.kind))
        throw new Error('Unknown SARIF result kind');
      if (r.level !== undefined && !['none', 'note', 'warning', 'error'].includes(r.level))
        throw new Error('Unknown SARIF result level');
      if (typeof r.ruleId !== 'string' || !r.message?.text) throw new Error('Incomplete SARIF diagnostic');
      const loc = r.locations?.[0]?.physicalLocation,
        filename = loc?.artifactLocation?.uri;
      const p = filename ? sourcePath(root, filename, { uri: true }) : '.';
      if (p !== '.' && !knownFiles.has(p))
        throw new Error(`SARIF source is outside captured selection: ${p}`);
      findings.push({
        ruleId: `native/${run.tool.driver.name}/${r.ruleId}`,
        language,
        path: p,
        kind: ['review', 'open'].includes(r.kind) ? 'review' : 'violation',
        severity: r.level === 'error' ? 'error' : ['none', 'note'].includes(r.level) ? 'info' : 'warning',
        target:
          r.partialFingerprints?.primaryLocationLineHash ??
          hash(
            JSON.stringify([
              r.message.text,
              loc?.region?.startLine
                ? fs
                    .readFileSync(path.join(root, p), 'utf8')
                    .split(/\r?\n/u)
                    [loc.region.startLine - 1]?.trim()
                : 'project',
            ]),
          ),
        message: r.message.text,
        ...(loc?.region?.startLine ? { line: loc.region.startLine } : {}),
        ...(loc?.region?.startColumn ? { column: loc.region.startColumn } : {}),
      });
    }
  }
  return findings;
}
export function coverage(id, status, files, extra = {}) {
  return { id, status, files: [...files].sort(), ...extra };
}
export function assertUnchanged(candidate, before) {
  for (const [name, digest] of before)
    if (
      !fs.existsSync(path.join(candidate.root, name)) ||
      hashFile(path.join(candidate.root, name)) !== digest
    )
      throw new Error(`Analysis changed captured input: ${name}`);
}

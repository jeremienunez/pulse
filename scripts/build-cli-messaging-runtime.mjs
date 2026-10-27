#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BANNER = 'import {createRequire as __pulseRequire} from "node:module";const require=__pulseRequire(import.meta.url);';
const PROFILE = 'pulse-messaging-node24-esm-v1';
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const requiredInputs = ['entry', 'contracts', 'store', 'broker', 'owner', 'mcp'].map(n => `scripts/cli-messaging/${n}.mjs`).concat(['claude', 'codex', 'codex-launcher', 'antigravity'].map(n => `scripts/cli-messaging/adapters/${n}.mjs`));
function toolsAt(toolchain, outdir) {
  if (!path.isAbsolute(toolchain) || !path.isAbsolute(outdir) || outdir === ROOT || outdir.startsWith(ROOT + path.sep)) throw new Error('Absolute external toolchain and output paths are required.');
  const require = createRequire(path.join(toolchain, 'package.json')), esbuild = require('esbuild');
  const sdk = JSON.parse(fs.readFileSync(path.join(toolchain, 'node_modules/@modelcontextprotocol/sdk/package.json'), 'utf8'));
  if (sdk.version !== '1.31.0' || esbuild.version !== '0.28.2') throw new Error('Build dependency version mismatch.');
  if (hash(fs.readFileSync(path.join(toolchain, 'package-lock.json'))) !== hash(fs.readFileSync(path.join(ROOT, 'scripts/cli-messaging-tools/package-lock.json')))) throw new Error('The external toolchain lock differs from the source lock.');
  fs.mkdirSync(outdir, { recursive: true, mode: 0o700 });
  return { esbuild, sdk };
}
export async function buildProbe({ toolchain, outdir, entry = 'channel-fixture' }) {
  if (!['channel-fixture', 'native-feasibility', 'codex-owner-launcher'].includes(entry)) throw new Error('Unknown probe entry.');
  const { esbuild, sdk } = toolsAt(toolchain, outdir), outfile = path.join(outdir, entry + '.mjs');
  await esbuild.build({ entryPoints: [path.join(ROOT, 'scripts/cli-messaging/probes', entry + '.mjs')], outfile, bundle: true, platform: 'node', format: 'esm', target: 'node24', nodePaths: [path.join(toolchain, 'node_modules')], banner: { js: BANNER } });
  return { outfile, sdk: sdk.version, esbuild: esbuild.version, scope: 'feasibility fixture only' };
}
export async function buildMessagingRuntime({ toolchain, outdir, entry = 'runtime' }) {
  if (!['runtime', 'mcp-component'].includes(entry)) throw new Error('Unknown messaging entry.');
  const { esbuild, sdk } = toolsAt(toolchain, outdir), outfile = path.join(outdir, entry === 'runtime' ? 'cli-messaging-runtime.mjs' : 'mcp-component.mjs');
  const result = await esbuild.build({ absWorkingDir: ROOT, entryPoints: [path.join(ROOT, 'scripts/cli-messaging', entry === 'runtime' ? 'entry.mjs' : 'mcp.mjs')], outfile, metafile: true, bundle: true, platform: 'node', format: 'esm', target: 'node24', nodePaths: [path.join(toolchain, 'node_modules')], banner: { js: BANNER }, plugins: [{ name: 'separate-operator-setup', setup(build) { build.onResolve({ filter: /^\.\/setup\.mjs$/ }, () => ({ path: './cli-messaging/setup.mjs', external: true })); } }] });
  const sourceFiles = Object.keys(result.metafile.inputs).map(p => path.resolve(ROOT, p)).filter(p => p.startsWith(ROOT + path.sep)).map(p => ({ path: path.relative(ROOT, p).split(path.sep).join('/'), sha256: hash(fs.readFileSync(p)) })).sort((a, b) => a.path.localeCompare(b.path));
  const manifest = { schemaVersion: 1, purpose: entry, profile: PROFILE, runtimeSha256: hash(fs.readFileSync(outfile)), sdk: sdk.version, esbuild: esbuild.version, sourceFiles, lockSha256: hash(fs.readFileSync(path.join(ROOT, 'scripts/cli-messaging-tools/package-lock.json'))), noticesSha256: hash(fs.readFileSync(path.join(ROOT, 'scripts/cli-messaging/THIRD_PARTY_NOTICES.md'))) };
  fs.writeFileSync(outfile + '.manifest.json', JSON.stringify(manifest, null, 2) + '\n');
  return { outfile, manifest };
}

// Packaging promotes an explicit built artifact; it never downloads or executes a compiler.
export function verifyMessagingRuntime(sourceRoot, file) {
  if (!file || !path.isAbsolute(file) || !fs.lstatSync(file).isFile() || fs.lstatSync(file).isSymbolicLink()) throw new Error('Build the messaging runtime outside source and set PULSE_MESSAGING_RUNTIME_BUNDLE.');
  const manifest = JSON.parse(fs.readFileSync(file + '.manifest.json', 'utf8'));
  if (manifest.schemaVersion !== 1 || manifest.purpose !== 'runtime' || manifest.profile !== PROFILE || manifest.sdk !== '1.31.0' || manifest.esbuild !== '0.28.2' || manifest.runtimeSha256 !== hash(fs.readFileSync(file))) throw new Error('Messaging runtime artifact or profile mismatch.');
  if (!Array.isArray(manifest.sourceFiles) || new Set(manifest.sourceFiles.map(f => f.path)).size !== manifest.sourceFiles.length || requiredInputs.some(p => !manifest.sourceFiles.some(f => f.path === p))) throw new Error('Incomplete messaging runtime source attestation.');
  for (const input of manifest.sourceFiles) {
    if (typeof input.path !== 'string' || !input.path.startsWith('scripts/cli-messaging/') || input.path.includes('..') || path.isAbsolute(input.path) || hash(fs.readFileSync(path.join(sourceRoot, input.path))) !== input.sha256) throw new Error('Messaging runtime does not match the source inputs.');
  }
  if (manifest.lockSha256 !== hash(fs.readFileSync(path.join(sourceRoot, 'scripts/cli-messaging-tools/package-lock.json'))) || manifest.noticesSha256 !== hash(fs.readFileSync(path.join(sourceRoot, 'scripts/cli-messaging/THIRD_PARTY_NOTICES.md')))) throw new Error('Messaging lock or notices differ from the built artifact.');
  return { file, manifest };
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { values } = parseArgs({ options: { toolchain: { type: 'string' }, out: { type: 'string' }, entry: { type: 'string', default: 'runtime' } } });
  const fn = ['runtime', 'mcp-component'].includes(values.entry) ? buildMessagingRuntime : buildProbe;
  fn({ toolchain: values.toolchain, outdir: values.out, entry: values.entry }).then(r => process.stdout.write(JSON.stringify(r) + '\n')).catch(e => { process.stderr.write(e.message + '\n'); process.exitCode = 1; });
}

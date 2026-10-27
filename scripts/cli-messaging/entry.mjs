import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { serveOwner, connectOwner, ownerPaths, readPrivateJson, readNativeBinding, processIdentity, sameProcess } from './owner.mjs';
import { MessagingError, newId } from './contracts.mjs';

export const NATIVE_FACTORIES = {
  claude: () => import('./adapters/claude.mjs'),
  codex: () => import('./adapters/codex.mjs'),
  antigravity: () => import('./adapters/antigravity.mjs'),
};
export { serveOwner };
const HELP = 'pulse-messaging serve|status|stop|attach|retire|abandon|launch|mcp|setup\nState: --state /absolute/private/directory (default XDG state/pulse/messaging).\nAttach: --family claude|codex|antigravity --alias NAME --connection-file FILE --delivery inbox-only|notify|wake --allow alias1,alias2\nLaunch: launch FAMILY --alias NAME --workspace DIR [--delivery MODE] [--allow ALIASES]\nMCP is started by a verified native launcher with --family and --binding-file.\nSetup --dry-run prepares configuration; it does not start models or change installed clients.';
export function defaultDirectory() { return path.join(process.env.XDG_STATE_HOME || path.join(os.homedir(), '.local', 'state'), 'pulse', 'messaging'); }
function parse(argv) {
  const flags = {}, positional = [];
  const allowed = new Set(['state', 'family', 'alias', 'connection-file', 'binding-file', 'delivery', 'allow', 'workspace', 'attempt', 'reason', 'client', 'dry-run', 'output', 'binary', 'replace']);
  for (let i = 0; i < argv.length; i++) {
    const value = argv[i];
    if (!value.startsWith('--')) { positional.push(value); continue; }
    const key = value.slice(2);
    if (!allowed.has(key) || Object.hasOwn(flags, key)) throw new MessagingError('BAD_INPUT', 'Unknown or repeated option: ' + key);
    if (['dry-run', 'replace'].includes(key)) flags[key] = true;
    else { if (i + 1 >= argv.length || argv[i + 1].startsWith('--')) throw new MessagingError('BAD_INPUT', 'Missing option value.'); flags[key] = argv[++i]; }
  }
  return { flags, positional };
}
export async function run(argv = process.argv.slice(2)) {
  if (!argv.length || argv.includes('--help') || argv[0] === 'help') { process.stdout.write(HELP + '\n'); return; }
  const { flags, positional } = parse(argv), command = positional[0], directory = path.resolve(flags.state || defaultDirectory());
  const policy = { deliveryMode: flags.delivery || 'inbox-only', allowedRecipients: flags.allow ? flags.allow.split(',').filter(Boolean) : [], replace: !!flags.replace };
  if (command === 'serve') {
    const owner = await serveOwner({ directory, factories: NATIVE_FACTORIES });
    process.stderr.write('Pulse messaging owner ready.\n');
    const stop = () => owner.close().catch(() => { process.exitCode = 1; });
    process.once('SIGINT', stop); process.once('SIGTERM', stop); return;
  }
  if (command === 'status' && !fs.existsSync(ownerPaths(directory).metadata)) return { running: false, stateDirectory: directory };
  if (command === 'status' || command === 'stop') {
    const metadata = readPrivateJson(ownerPaths(directory).metadata, 'pulse-messaging-owner/v1');
    if (!sameProcess(metadata.process)) return { running: false, stateDirectory: directory, staleOwnedState: true };
    const client = await connectOwner(directory);
    try { return await client.request(command === 'status' ? 'owner.status' : 'owner.stop', {}); }
    finally { await client.close(); }
  }
  if (command === 'attach') {
    if (!flags.family || !flags.alias || !flags['connection-file'] || !flags['binding-file']) throw new MessagingError('BAD_INPUT', 'Attach needs family, alias, a private connection file and a private output binding file.');
    const client = await connectOwner(directory, null, { timeoutMs: 30000 });
    try {
      const registration = await client.request('owner.attach', { family: flags.family, alias: flags.alias, connection: readPrivateJson(path.resolve(flags['connection-file'])), policy, bindingFile: path.resolve(flags['binding-file']) });
      const { credential, ...publicRegistration } = registration; return { ...publicRegistration, bindingFile: path.resolve(flags['binding-file']) };
    } finally { await client.close(); }
  }
  if (command === 'retire' || command === 'abandon') {
    const client = await connectOwner(directory);
    try { return await client.request(command === 'retire' ? 'owner.retire' : 'owner.abandon', command === 'retire' ? { alias: flags.alias } : { attemptId: flags.attempt, reason: flags.reason }); }
    finally { await client.close(); }
  }
  if (command === 'launch') {
    const family = positional[1] || flags.family;
    if (!NATIVE_FACTORIES[family] || !flags.alias || !flags.workspace) throw new MessagingError('BAD_INPUT', 'Launch needs a maintained family, alias and workspace.');
    const module = await NATIVE_FACTORIES[family]();
    if (typeof module.launch !== 'function') throw new MessagingError('NATIVE_UNAVAILABLE', 'This native launch connector is unavailable.');
    return module.launch({ directory, alias: flags.alias, workspace: path.resolve(flags.workspace), policy, binary: flags.binary, program: path.resolve(process.argv[1]) });
  }
  if (command === 'setup') {
    const { setup } = await import('./setup.mjs'); return setup({ client: flags.client, directory, dryRun: !!flags['dry-run'], output: flags.output, program: path.resolve(process.argv[1]) });
  }
  if (command !== 'mcp') throw new MessagingError('BAD_INPUT', 'Unknown messaging command.');
  if (!NATIVE_FACTORIES[flags.family] || !flags['binding-file']) throw new MessagingError('NATIVE_PROOF_REQUIRED', 'MCP needs a maintained native family and a private binding file.');
  const bindingFile = path.resolve(flags['binding-file']), module = await NATIVE_FACTORIES[flags.family]();
  const { createMessagingMcp } = await import('./mcp.mjs');
  const { StdioServerTransport } = await import('@modelcontextprotocol/sdk/server/stdio.js');
  let client = null, connecting = null, server, initialized = false, closed = false, reconnectTimer = null, reconnectDelay = 1000;
  async function ensureClient() {
    if (closed) throw new MessagingError('SERVICE_UNAVAILABLE', 'The native frontend is closed.');
    if (client?.connected) return client;
    if (client) client = null;
    if (connecting) return connecting;
    connecting = (async () => {
      const deadline = Date.now() + 15000;
      while (!fs.existsSync(bindingFile) && Date.now() < deadline) await delay(70 + Math.floor(Math.random() * 70));
      const binding = readNativeBinding(bindingFile, { verifyParent: true });
      if (binding.family !== flags.family) throw new MessagingError('NATIVE_PROOF_REQUIRED', 'The binding belongs to a different native family.');
      const connected = await connectOwner(directory, binding.credential, { timeoutMs: 20000, namespaceMappedAncestors: binding.family === 'antigravity' });
      try {
        connected.onEvent(async event => {
          if (event.event !== 'native-command') return;
          try {
            const result = await hooks.onCommand(event.kind, event.payload, server);
            await connected.request('native.result', { commandId: event.commandId, result });
          } catch { await connected.request('native.result', { commandId: event.commandId, error: { code: 'NATIVE_TRANSPORT_ERROR' } }).catch(() => {}); }
        });
        await connected.request('native.attach', { bindingFile, metadata: { clientVersion: server?.getClientVersion()?.version ?? 'unknown' } });
        client = connected;
        if (initialized) await connected.request('native.ready', {});
        return connected;
      } catch (error) { if (client === connected) client = null; await connected.close(); throw error; }
    })().finally(() => { connecting = null; });
    return connecting;
  }
  const hooks = await module.frontendHooks?.({ bindingFile, directory, request: async (method, args, invocation) => (await ensureClient()).request('native.extra', { method, arguments: args }, invocation) }) ?? {};
  function maintainConnection() {
    if (closed) return;
    // Reconnect only the verified transport. Mutating operations are never replayed.
    const work = initialized && !client?.connected ? ensureClient().then(() => { reconnectDelay = 1000; }, () => { reconnectDelay = Math.min(30000, reconnectDelay * 2); }) : Promise.resolve();
    work.finally(() => { if (!closed) { reconnectTimer = setTimeout(maintainConnection, Math.floor(reconnectDelay * (0.8 + Math.random() * 0.4))); reconnectTimer.unref(); } });
  }
  server = createMessagingMcp({ channel: flags.family === 'claude', eagerTools: flags.family === 'antigravity', extraTools: hooks.extraTools ?? [], resolveInvocation: hooks.resolveInvocation, invoke: async (op, args, invocation) => {
    const connected = await ensureClient(), binding = readNativeBinding(bindingFile, { verifyParent: true });
    if (!sameProcess(binding.nativeOwner)) throw new MessagingError('NATIVE_PROOF_REQUIRED', 'The original native harness is no longer running.');
    return connected.request(op, args, invocation);
  }, onInitialized: async () => { initialized = true; maintainConnection(); await ensureClient(); } });
  await server.connect(new StdioServerTransport());
  async function close() { if (closed) return; closed = true; clearTimeout(reconnectTimer); await client?.close(); await server.close(); }
  process.stdin.once('end', () => close().then(() => process.exit(0)));
  process.once('SIGTERM', () => close().then(() => process.exit(0)));
  process.once('SIGINT', () => close().then(() => process.exit(0)));
}

const entryFile = fileURLToPath(import.meta.url);
if (['entry.mjs', 'cli-messaging-runtime.mjs'].includes(path.basename(entryFile)) && process.argv[1] && path.resolve(process.argv[1]) === entryFile) {
  run().then(result => { if (result !== undefined) process.stdout.write(JSON.stringify(result, null, 2) + '\n'); }).catch(error => { process.stderr.write((error.code ? error.code + ': ' : '') + error.message + '\n'); process.exitCode = 1; });
}

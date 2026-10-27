import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { pathToFileURL } from 'node:url';
import { spawn } from 'node:child_process';
import { BrokerClient, serveOwner, connectOwner, processIdentity, ownerCredential } from './cli-messaging/owner.mjs';

const toolchain = process.env.PULSE_MESSAGING_TOOLCHAIN, modulePath = process.env.PULSE_MESSAGING_MCP_BUILD;
if (!toolchain || !modulePath) throw new Error('MCP verification needs the explicit external toolchain and built MCP module');
const sdk = relative => import(pathToFileURL(path.join(toolchain, 'node_modules/@modelcontextprotocol/sdk/dist/esm', relative)).href);
const [{ Client }, { InMemoryTransport }, { StdioClientTransport }, { createMessagingMcp }] = await Promise.all([sdk('client/index.js'), sdk('inMemory.js'), sdk('client/stdio.js'), import(pathToFileURL(modulePath).href)]);
const temporary = prefix => { const directory = fs.mkdtempSync(path.join(os.tmpdir(), prefix)); fs.chmodSync(directory, 0o700); return directory; };
async function hostFixture(t) {
  const directory = temporary('pulse-mcp-owner-');
  const factory = {
    async createAdapter({ connection, peer }) { return { transportPeerCoupled: true, observe: async () => ({ family: 'claude', nativeId: connection.nativeId, owner: processIdentity(process.pid), capabilities: { notify: 'unknown', wake: 'unsupported', existingConversation: 'supported' }, evidence: { kind: 'test-double', version: 'fixture' } }), isConnected: () => !peer.closed, deliver: async () => ({ outcome: 'not_emitted' }) }; },
    async connectFrontend({ binding, peer }) { return this.createAdapter({ connection: binding.connection, peer }); },
  };
  const owner = await serveOwner({ directory, factories: { claude: factory } }), admin = await connectOwner(directory);
  const clients = [];
  t.after(async () => { for (const client of clients) await client.close(); await admin.close(); await owner.close(); fs.rmSync(directory, { recursive: true, force: true }); });
  async function binding(alias, allowedRecipients = []) {
    const file = path.join(directory, alias + '-binding.json');
    const registration = await admin.request('owner.attach', { family: 'claude', alias, connection: { nativeId: 'test-native-' + alias }, policy: { allowedRecipients }, bindingFile: file });
    const client = await connectOwner(directory, registration.credential); clients.push(client);
    await client.request('native.attach', { bindingFile: file });
    return { client, registration, file };
  }
  return { directory, owner, admin, binding };
}

async function mcpClient(t, invoke, options = {}) {
  const server = createMessagingMcp({ invoke, ...options }), client = new Client({ name: 'claude-code', version: 'forged-display-name' }, { capabilities: {} });
  const [left, right] = InMemoryTransport.createLinkedPair();
  await server.connect(left); await client.connect(right);
  t.after(async () => { await client.close(); await server.close(); });
  return { client, server };
}
const call = async (client, name, args) => { const result = await client.callTool({ name, arguments: args }); return { result, value: JSON.parse(result.content[0].text) }; };

test('real MCP peers preserve attribution, scope, receipts and replyTo through the private owner', async t => {
  const h = await hostFixture(t), source = await h.binding('source', ['target']), target = await h.binding('target', ['source']);
  const a = await mcpClient(t, (op, params, evidence) => source.client.request(op, params, evidence));
  const b = await mcpClient(t, (op, params, evidence) => target.client.request(op, params, evidence));
  const captures = [];
  const send = await call(a.client, 'pulse_message_send', { requestId: 'hello', recipient: 'target', text: 'Bonjour' }); captures.push(send);
  assert.equal(send.value.stored, true); assert.equal(send.value.sender, 'source'); assert.equal(send.value.delivery.policy, 'inbox-only'); assert.equal(send.value.delivery.available, false);
  const inbox = await call(b.client, 'pulse_message_read', {}); captures.push(inbox); assert.equal(inbox.value.items.length, 1);
  const status = await call(a.client, 'pulse_message_status', { requestId: 'hello' }); captures.push(status); assert.equal(status.value.receiptStage, 'stored');
  const spoof = await call(a.client, 'pulse_message_send', { requestId: 'spoof', recipient: 'target', text: 'x', sender: 'target' }); assert.equal(spoof.result.isError, true);
  const foreignAck = await call(a.client, 'pulse_message_ack', { messageId: send.value.messageId, stage: 'received' }); assert.equal(foreignAck.value.error.code, 'FORBIDDEN');
  const ack = await call(b.client, 'pulse_message_ack', { messageId: send.value.messageId, stage: 'consumed' }); captures.push(ack); assert.equal(ack.value.receiptStage, 'consumed');
  const reply = await call(b.client, 'pulse_message_send', { requestId: 'reply', recipient: 'source', text: 'Reçu', replyTo: send.value.messageId }); captures.push(reply); assert.equal(reply.value.replyTo, send.value.messageId);
  const back = await call(a.client, 'pulse_message_read', {}); captures.push(back); assert.equal(back.value.items[0].text, 'Reçu');
  const serialized = JSON.stringify(captures);
  for (const credential of [source.registration.credential, target.registration.credential, ownerCredential(h.directory)]) assert.equal(serialized.includes(credential), false);
});

test('displayed client identity grants no binding and model credentials grant no operator operations', async t => {
  const h = await hostFixture(t), source = await h.binding('source');
  await assert.rejects(source.client.request('owner.status', {}), e => e.code === 'FORBIDDEN');
  await assert.rejects(source.client.request('owner.stop', {}), e => e.code === 'FORBIDDEN');
  await assert.rejects(source.client.request('native.attach', { bindingFile: source.file, nativeId: 'declared-by-model' }), e => e.code === 'BAD_INPUT');
  const unbound = await connectOwner(h.directory, source.registration.credential); t.after(() => unbound.close());
  await assert.rejects(unbound.request('read', {}), e => e.code === 'NATIVE_PROOF_REQUIRED');
  const { client } = await mcpClient(t, undefined);
  const result = await call(client, 'pulse_message_read', {});
  assert.equal(result.value.error.code, 'NATIVE_PROOF_REQUIRED');
  const listed = await client.listTools(); assert.equal(listed.tools.length, 5); assert.ok(listed.tools.every(tool => tool.inputSchema.additionalProperties === false));
});

test('channel capability never opts into permission relay', async t => {
  const { client } = await mcpClient(t, undefined, { channel: true });
  assert.deepEqual(client.getServerCapabilities().experimental, { 'claude/channel': {} });
  assert.equal(Object.hasOwn(client.getServerCapabilities().experimental, 'claude/channel/permission'), false);
});

test('code-owned native metadata resolver runs before a tool can use its binding', async t => {
  let invoked = 0;
  const { client } = await mcpClient(t, async () => { invoked++; return {}; }, { resolveInvocation: metadata => { if (metadata.threadId !== 'real-harness-thread') throw Object.assign(new Error('Native thread metadata mismatch'), { code: 'NATIVE_PROOF_REQUIRED' }); return { kind: 'native_turn', nativeSessionId: metadata.threadId, nativeTurnId: 'native-turn' }; } });
  const response = await call(client, 'pulse_message_read', {});
  assert.equal(response.value.error.code, 'NATIVE_PROOF_REQUIRED'); assert.equal(invoked, 0);
});

test('an old native launcher cannot retire a newer generation under the same alias', async t => {
  const h = await hostFixture(t), old = await h.binding('source');
  const renewed = await h.admin.request('owner.attach', { family: 'claude', alias: 'source', connection: { nativeId: 'test-native-source' }, bindingFile: path.join(h.directory, 'renewed-binding.json') });
  assert.ok(renewed.generation > old.registration.generation);
  const result = await h.admin.request('owner.retire', { alias: 'source', bindingId: old.registration.bindingId, generation: old.registration.generation });
  assert.equal(result.retired, false);
  assert.equal((await h.admin.request('owner.status', {})).sessions.find(s => s.alias === 'source').generation, renewed.generation);
});

test('client keeps partial UTF8, out-of-order receipts and events separate, including throwing listeners', async t => {
  const directory = temporary('pulse-mcp-framing-'), socketPath = path.join(directory, 'broker.sock');
  const sockets = new Set();
  const server = net.createServer(socket => {
    sockets.add(socket); socket.on('close', () => sockets.delete(socket)); socket.setEncoding('utf8'); let text = '', requests = [];
    socket.on('data', chunk => { text += chunk; while (text.includes('\n')) { const offset = text.indexOf('\n'), line = text.slice(0, offset); text = text.slice(offset + 1); requests.push(JSON.parse(line)); }
      if (requests.length === 3) {
        const data = Buffer.from(JSON.stringify({ event: 'tick' }) + '\n' + requests.reverse().map(r => JSON.stringify({ id: r.id, result: r.op + ' préservé 🧪' })).join('\n') + '\n');
        const offset = data.indexOf(Buffer.from('🧪')) + 1; socket.write(data.subarray(0, offset)); setTimeout(() => socket.write(data.subarray(offset)), 5);
      }
    });
  });
  await new Promise(resolve => server.listen(socketPath, resolve)); fs.chmodSync(socketPath, 0o600);
  const client = new BrokerClient({ socketPath, auth: 'test-framing-credential' });
  t.after(async () => { await client.close(); for (const socket of sockets) socket.destroy(); await new Promise(resolve => server.close(resolve)); fs.rmSync(directory, { recursive: true, force: true }); });
  let ticks = 0; client.onEvent(() => { ticks++; throw new Error('test listener'); }); client.onEvent(async () => { throw new Error('async listener'); }); await client.connect();
  assert.deepEqual(await Promise.all(['first', 'second', 'third'].map(op => client.request(op))), ['first préservé 🧪', 'second préservé 🧪', 'third préservé 🧪']); assert.equal(ticks, 1);
});

test('a missing receipt or malformed connection is never automatically reconnected or replayed', async t => {
  const directory = temporary('pulse-mcp-loss-'), socketPath = path.join(directory, 'broker.sock'); let requests = 0, peer;
  const server = net.createServer(socket => { peer = socket; socket.on('data', () => requests++); });
  await new Promise(resolve => server.listen(socketPath, resolve)); fs.chmodSync(socketPath, 0o600);
  const client = new BrokerClient({ socketPath, auth: 'test-loss', timeoutMs: 40 });
  t.after(async () => { await client.close(); peer?.destroy(); await new Promise(resolve => server.close(resolve)); fs.rmSync(directory, { recursive: true, force: true }); });
  await client.connect(); await assert.rejects(client.request('send', { requestId: 'preserve' }), e => e.code === 'EUNKNOWN_RECEIPT');
  assert.equal(requests, 1);
  const pending = client.request('status', {}); peer.write('invalid-json\n');
  await assert.rejects(pending, e => e.code === 'EUNKNOWN_RECEIPT'); assert.equal(client.connected, false);
  await assert.rejects(client.request('send', {}), e => e.code === 'ENOTCONNECTED');
  await client.close(); await client.close();
});

test('MCP stdio remains protocol-only and the component never manufactures a native identity', async t => {
  const directory = temporary('pulse-mcp-stdio-'), script = path.join(directory, 'fixture.mjs');
  fs.writeFileSync(script, `import{serveMessagingMcp}from ${JSON.stringify(pathToFileURL(modulePath).href)};const s=await serveMessagingMcp();process.stdin.once('end',()=>s.close());`);
  const transport = new StdioClientTransport({ command: process.execPath, args: [script], stderr: 'pipe' }); let stderr = ''; transport.stderr?.on('data', data => stderr += data);
  const client = new Client({ name: 'claude-code', version: 'test' }, { capabilities: {} });
  t.after(async () => { await client.close(); fs.rmSync(directory, { recursive: true, force: true }); });
  await client.connect(transport); assert.equal((await client.listTools()).tools.length, 5);
  const result = await call(client, 'pulse_message_read', {}); assert.equal(result.value.error.code, 'NATIVE_PROOF_REQUIRED'); assert.equal(stderr, '');
});

test('owner refuses foreign stale sockets and status on an absent service creates no data', async t => {
  const parent = temporary('pulse-owner-boundary-'), absent = path.join(parent, 'not-created'); t.after(() => fs.rmSync(parent, { recursive: true, force: true }));
  const cli = spawn(process.execPath, ['scripts/pulse-messaging.mjs', 'status', '--state', absent], { stdio: ['ignore', 'pipe', 'pipe'] }); let stdout = ''; cli.stdout.on('data', data => stdout += data);
  assert.equal(await new Promise(resolve => cli.once('exit', resolve)), 0); assert.equal(JSON.parse(stdout).running, false); assert.equal(fs.existsSync(absent), false);
  const directory = path.join(parent, 'state'); fs.mkdirSync(directory, { mode: 0o700 }); const socketPath = path.join(directory, 'broker.sock');
  const foreign = net.createServer(); await new Promise(resolve => foreign.listen(socketPath, resolve)); fs.chmodSync(socketPath, 0o600);
  await assert.rejects(serveOwner({ directory }), e => e.code === 'SOCKET_OWNERSHIP'); assert.ok(fs.lstatSync(socketPath).isSocket());
  await new Promise(resolve => foreign.close(resolve));
});

test('closing twice waits for the same owned shutdown before releasing the store', async t => {
  const directory = temporary('pulse-owner-shutdown-'); t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  let release, entered;
  const gate = new Promise(resolve => { release = resolve; }), closingAdapter = new Promise(resolve => { entered = resolve; });
  const owner = await serveOwner({ directory, factories: { claude: { createAdapter: async () => ({ observe: async () => ({ family: 'claude', nativeId: 'shutdown-fixture', owner: processIdentity(process.pid), capabilities: { notify: 'unknown', wake: 'unsupported', existingConversation: 'supported' }, evidence: { kind: 'test-double' } }), close: async () => { entered(); await gate; } }) } } });
  const admin = await connectOwner(directory); await admin.request('owner.attach', { family: 'claude', alias: 'fixture', connection: {} });
  const first = owner.close(); await closingAdapter;
  let secondDone = false; const second = owner.close().then(() => { secondDone = true; });
  try { await Promise.resolve(); assert.equal(secondDone, false); assert.equal(owner.store.closed, false); }
  finally { release(); await Promise.all([first, second]); await admin.close(); }
  assert.equal(owner.store.closed, true);
});

test('a killed owner can recover only its recorded stale socket and keeps the private operator credential', { timeout: 10000 }, async t => {
  const directory = temporary('pulse-owner-restart-'); let child;
  t.after(async () => { if (child && child.exitCode === null && !child.signalCode) { child.kill('SIGTERM'); await new Promise(resolve => child.once('exit', resolve)); } fs.rmSync(directory, { recursive: true, force: true }); });
  async function start() {
    child = spawn(process.execPath, ['scripts/pulse-messaging.mjs', 'serve', '--state', directory], { stdio: ['ignore', 'ignore', 'pipe'] }); child.stderr.resume();
    const deadline = Date.now() + 3000;
    while (Date.now() < deadline) {
      try { const client = await connectOwner(directory); const status = await client.request('owner.status', {}); await client.close(); if (status.process.pid === child.pid) return; } catch {}
      await new Promise(resolve => setTimeout(resolve, 15));
    }
    throw new Error('Owned server did not become ready');
  }
  await start(); const credential = ownerCredential(directory), firstPid = child.pid;
  child.kill('SIGKILL'); await new Promise(resolve => child.once('exit', resolve));
  assert.ok(fs.existsSync(path.join(directory, 'broker.sock')));
  await start(); assert.notEqual(child.pid, firstPid); assert.equal(ownerCredential(directory), credential);
  const client = await connectOwner(directory); assert.equal((await client.request('owner.status', {})).protocolVersion, '1.0'); await client.close();
});

test('Antigravity receives the five common tool schemas eagerly while other clients keep their metadata', async t => {
  const eager = await mcpClient(t, undefined, { eagerTools: true });
  const listed = await eager.client.listTools();
  assert.equal(listed.tools.length, 5);
  assert.ok(listed.tools.every(tool => tool._meta?.['antigravity/alwaysLoad'] === true));
  const normal = await mcpClient(t, undefined);
  assert.ok((await normal.client.listTools()).tools.every(tool => !tool._meta?.['antigravity/alwaysLoad']));
});

test('a verified native namespace client can read an existing host-owned private socket without weakening store creation', { skip: !fs.existsSync('/usr/bin/bwrap') }, async t => {
  const h = await hostFixture(t);
  const source = `import {connectOwner} from ${JSON.stringify(new URL('./cli-messaging/owner.mjs', import.meta.url).href)}; import {MailboxStore} from ${JSON.stringify(new URL('./cli-messaging/store.mjs', import.meta.url).href)};import assert from 'node:assert/strict';assert.throws(()=>new MailboxStore({directory:${JSON.stringify(h.directory + '/forbidden-store')}}),e=>e.code==='PRIVATE_PATH_REQUIRED');const c=await connectOwner(${JSON.stringify(h.directory)},null,{namespaceMappedAncestors:true});try{console.log(JSON.stringify(await c.request('owner.status',{})))}finally{await c.close()}`;
  const child = spawn('/usr/bin/bwrap', ['--bind', '/', '/', '--', process.execPath, '--input-type=module', '-e', source], { stdio: ['ignore', 'pipe', 'pipe'] }); let out = '', err = ''; child.stdout.on('data', d => out += d); child.stderr.on('data', d => err += d);
  assert.equal(await new Promise(r => child.once('exit', r)), 0, err);
  assert.equal(JSON.parse(out).protocolVersion, '1.0');
  await assert.rejects(connectOwner(h.directory, null, { namespaceMappedAncestors: true }), e => e.code === 'PRIVATE_PATH_REQUIRED');
});

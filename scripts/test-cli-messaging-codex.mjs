import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { CodexAdapter, codexInvocation, inspectCodexOwner, resolveCodexBinary, launch } from './cli-messaging/adapters/codex.mjs';
import { processIdentity, writePrivateJson, serveOwner } from './cli-messaging/owner.mjs';

function fixture(t, { loaded = true, explicit = false } = {}) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'pulse-codex-adapter-')); fs.chmodSync(directory, 0o700); t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const ownerFile = path.join(directory, 'owner.json'); writePrivateJson(ownerFile, { format: 'pulse-codex-owner/v1', process: processIdentity(process.pid), binary: process.execPath, url: 'ws://127.0.0.1:1', tokenFile: path.join(directory, 'private-token'), version: 'test-double' });
  const calls = [], progress = []; let started = false, listener;
  const client = { socket: { readyState: 1 }, requests: [{ method: 'item/commandExecution/requestApproval' }], close() {}, async rpc(method, params, timeout, onSent) {
    calls.push({ method, params });
    if (method === 'thread/loaded/list') return { data: loaded ? ['expected-thread'] : [] };
    if (method === 'thread/read') return { thread: { id: 'expected-thread', turns: [{ id: 'seed', status: 'completed', items: [] }, ...(started ? [{ id: 'actual-native-turn', status: 'completed', items: [{ type: 'agentMessage', text: 'native answer' }] }] : [])] } };
    if (method === 'turn/start') { started = true; onSent?.('real-rpc-id'); if (explicit) listener?.({ type: 'stored', message: { senderBindingId: 'binding', senderGeneration: 1, replyTo: 'message' } }); return { turn: { id: 'actual-native-turn' } }; }
    throw new Error('Unexpected method ' + method);
  } };
  const host = { broker: { subscribe(fn) { listener = fn; return () => {}; } } };
  const adapter = new CodexAdapter({ connection: { ownerFile, threadId: 'expected-thread' }, host, inspect: () => {}, connect: async () => client });
  adapter.bind({ registration: { bindingId: 'binding', generation: 1 }, host });
  return { adapter, calls, progress, async deliver(replyTo = null) { return adapter.deliver({ message: { messageId: 'message', sender: 'source', replyTo }, attempt: {}, progress: (...args) => progress.push(args), beforeEmit: () => true, signal: new AbortController().signal }); } };
}

test('native MCP metadata binds the exact conversation and real native turn, not model arguments', () => {
  const valid = { threadId: 'thread', sessionId: 'thread', callId: 'native-call', 'x-codex-turn-metadata': { thread_id: 'thread', session_id: 'thread', turn_id: 'native-turn' } };
  assert.deepEqual(codexInvocation(valid, 'thread', { requestId: 0 }), { kind: 'native_turn', nativeSessionId: 'thread', nativeTurnId: 'native-turn', nativeCallId: 'native-call' });
  assert.throws(() => codexInvocation({}, 'thread', { requestId: 0 }), e => e.code === 'NATIVE_PROOF_REQUIRED');
  assert.throws(() => codexInvocation({ ...valid, threadId: 'foreign' }, 'thread', { requestId: 0 }), e => e.code === 'NATIVE_PROOF_REQUIRED');
});

test('native adapter never creates or resumes a substitute for an unloaded target', async t => {
  const f = fixture(t, { loaded: false });
  await assert.rejects(f.adapter.observe(), e => e.code === 'NATIVE_PROOF_REQUIRED');
  assert.ok(f.calls.every(c => !['thread/start', 'thread/resume', 'thread/fork'].includes(c.method)));
});

test('delivery keeps thread and turn correlation, preserves pending native approvals and never invents consumed', async t => {
  const f = fixture(t), result = await f.deliver();
  assert.equal(result.outcome, 'confirmed'); assert.equal(result.reply.nativeTurnId, 'actual-native-turn');
  assert.equal(f.calls.find(c => c.method === 'turn/start').params.threadId, 'expected-thread');
  assert.deepEqual(f.progress.map(p => p[0]), ['transport_accepted', 'harness_ack', 'harness_ack']);
  assert.equal(f.progress.some(p => p[0] === 'consumed'), false);
  assert.equal(f.calls.some(c => /approve|requestApproval|resolve/iu.test(c.method)), false);
});

test('an explicit MCP reply suppresses the redundant final-text reply', async t => {
  const f = fixture(t, { explicit: true }), result = await f.deliver();
  assert.equal(result.outcome, 'confirmed'); assert.equal(result.reply, undefined);
});

test('a response notification never creates an automatic response-to-response loop', async t => {
  const f = fixture(t), result = await f.deliver('original-message');
  assert.equal(result.outcome, 'confirmed'); assert.equal(result.reply, undefined);
});

test('parent identity is checked independently of supplied client names', () => {
  assert.throws(() => inspectCodexOwner({ process: processIdentity(process.pid), binary: process.execPath, url: 'ws://127.0.0.1:1' }), e => e.code === 'NATIVE_PROOF_REQUIRED');
});

test('official launcher layout resolves an existing vendor binary without installing a CLI', t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'pulse-codex-layout-')); t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const launcher = path.join(directory, 'bin/codex.js'), native = path.join(directory, 'vendor', process.arch === 'x64' ? 'x86_64-unknown-linux-musl' : 'aarch64-unknown-linux-musl', 'bin/codex');
  fs.mkdirSync(path.dirname(launcher), { recursive: true }); fs.mkdirSync(path.dirname(native), { recursive: true });
  fs.writeFileSync(path.join(directory, 'package.json'), '{}'); fs.writeFileSync(launcher, 'fixture', { mode: 0o700 }); fs.writeFileSync(native, 'fixture', { mode: 0o700 });
  assert.equal(resolveCodexBinary(launcher), native);
});


test('a stop during endpoint startup cancels before opening a native UI or model turn and closes owned resources', async t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'pulse-codex-cancel-')); fs.chmodSync(directory, 0o700);
  const owner = await serveOwner({ directory }); t.after(async () => { await owner.close(); fs.rmSync(directory, { recursive: true, force: true }); });
  let entered, release, closed = 0; const started = new Promise(r => entered = r), resume = new Promise(r => release = r);
  const result = launch({ directory, alias: 'cancelled', workspace: directory, policy: { deliveryMode: 'inbox-only' }, binary: process.execPath, program: '/test/runtime.mjs', startEndpoint: async () => { entered(); await resume; return { close: async () => { closed++; } }; } });
  await started; process.emit('SIGTERM'); release();
  assert.equal((await result).cancelledBeforeUi, true); assert.equal(closed, 1);
  assert.equal(fs.readdirSync(path.join(directory, 'native')).length, 0);
  assert.equal(owner.store.db.prepare('SELECT count(*) AS n FROM sessions').get().n, 0);
});

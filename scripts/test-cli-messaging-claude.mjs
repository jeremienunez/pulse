import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { MailboxStore } from './cli-messaging/store.mjs';
import { MessagingBroker } from './cli-messaging/broker.mjs';
import { observeNativeContext } from './cli-messaging/contracts.mjs';
import { processIdentity } from './cli-messaging/owner.mjs';
import { ClaudeAdapter, inspectClaude, frontendHooks, claudeLaunchArgs } from './cli-messaging/adapters/claude.mjs';

async function fixture(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'pulse-claude-adapter-')); fs.chmodSync(directory, 0o700);
  const store = new MailboxStore({ directory }), broker = new MessagingBroker(store), commands = [];
  const host = { store, broker, refresh: (credential, adapter) => broker.restore(credential, adapter) };
  const connection = { ...processIdentity(process.pid), sessionId: 'fixture-native-session', binary: process.execPath, version: 'test fixture' };
  const adapter = new ClaudeAdapter({ connection, host, alias: 'claude', inspect: () => ({ owner: processIdentity(process.pid), nativeId: connection.sessionId, optedIn: true }), receiptTimeoutMs: 1500 });
  const peer = { closed: false, command: async (kind, payload) => { commands.push({ kind, payload }); return { written: true }; } };
  adapter.setPeer(peer, { clientVersion: '2.1.310' });
  const registration = await broker.attach('claude', adapter, { deliveryMode: 'notify', allowedRecipients: ['source'] });
  function bind() {
    const context = broker.adapters.get(registration.bindingId).context;
    adapter.bind({ registration, host, invoke: (op, input, evidence) => {
      const actor = store.nativeActor(registration.bindingId, registration.generation, context, evidence);
      return op === 'ack' ? broker.ack(actor, input) : broker.send(actor, input);
    } });
  }
  bind();
  const actor = () => store.authenticate(registration.credential, { kind: 'native_call', nativeCallId: 'fixture-native-call' });
  async function ready() { await adapter.onReady(); await adapter.handleFrontendCall('channel-start', {}, actor()); await adapter.handleFrontendCall('channel-ready', { probeId: adapter.probeId }, actor()); }
  async function source() {
    const context = await observeNativeContext({ observe: async () => ({ family: 'codex', nativeId: 'fixture-source', owner: processIdentity(process.pid), capabilities: { notify: 'unknown', wake: 'unknown', existingConversation: 'supported' }, evidence: { kind: 'test-double' } }) });
    return store.authenticate(store.enroll('source', context, { allowedRecipients: ['claude'] }).credential);
  }
  t.after(async () => { await broker.close(); store.close(); fs.rmSync(directory, { recursive: true, force: true }); });
  return { store, broker, adapter, peer, registration, commands, actor, ready, source, bind };
}
async function until(predicate) {
  const deadline = Date.now() + 1000;
  while (!predicate()) { if (Date.now() > deadline) throw new Error('Expected adapter state not observed'); await new Promise(resolve => setImmediate(resolve)); }
}

test('native channel flags and version do not grant supported delivery before a correlated recipient declaration', async t => {
  const f = await fixture(t);
  assert.equal(f.store.session(f.registration.bindingId).capabilities.notify, 'unknown');
  await f.adapter.onReady(); await f.adapter.onReady();
  assert.equal(f.commands.filter(c => c.kind === 'probe').length, 0);
  await assert.rejects(f.adapter.handleFrontendCall('channel-start', {}, f.store.authenticate(f.registration.credential)), e => e.code === 'BAD_EVIDENCE');
  assert.equal(f.commands.filter(c => c.kind === 'probe').length, 0);
  await f.adapter.handleFrontendCall('channel-start', {}, f.actor());
  await f.adapter.handleFrontendCall('channel-start', {}, f.actor());
  assert.equal(f.commands.filter(c => c.kind === 'probe').length, 1);
  assert.equal(f.store.session(f.registration.bindingId).capabilities.notify, 'unknown');
  await assert.rejects(f.adapter.handleFrontendCall('channel-ready', { probeId: 'guessed' }, f.actor()), e => e.code === 'BAD_EVIDENCE');
  await f.adapter.handleFrontendCall('channel-ready', { probeId: f.adapter.probeId }, f.actor());
  assert.equal(f.store.session(f.registration.bindingId).capabilities.notify, 'supported');
  assert.equal(f.store.session(f.registration.bindingId).generation, f.registration.generation);
});

test('native notification write remains transport-only until the actual recipient acknowledges it', async t => {
  const f = await fixture(t); await f.ready(); const source = await f.source();
  const message = await f.broker.send(source, { requestId: 'hello', recipient: 'claude', text: 'bounded message' });
  await until(() => f.store.message(message.messageId).receiptStage === 'transport_accepted');
  assert.equal(f.store.message(message.messageId).receipts.some(r => ['received', 'consumed'].includes(r.stage)), false);
  f.broker.ack(f.actor(), { messageId: message.messageId, stage: 'consumed' }); await f.broker.idle();
  assert.equal(f.store.message(message.messageId).receiptStage, 'consumed');
  assert.equal(f.store.message(message.messageId).deliveryState, 'native_done');
});

test('lost peer fences delivery and a matching late recipient declaration reconciles without another notification', async t => {
  const f = await fixture(t); await f.ready(); const source = await f.source();
  const message = await f.broker.send(source, { requestId: 'loss', recipient: 'claude', text: 'preserve uncertainty' });
  await until(() => f.store.message(message.messageId).receiptStage === 'transport_accepted');
  f.adapter.onPeerClosed(f.peer); await f.broker.idle(); assert.equal(f.store.listUncertain().length, 1);
  const newPeer = { closed: false, command: f.peer.command }; f.adapter.setPeer(newPeer);
  await f.broker.restore(f.registration.credential, f.adapter); f.bind();
  f.broker.ack(f.actor(), { messageId: message.messageId, stage: 'consumed' }); await f.broker.idle();
  assert.equal(f.store.listUncertain().length, 0);
  assert.equal(f.commands.filter(c => c.kind === 'notify').length, 1);
});

test('production parent inspector rejects a declared Claude identity on a non-Claude process', () => {
  assert.throws(() => inspectClaude({ ...processIdentity(process.pid), sessionId: 'declared-session', binary: process.execPath, version: 'Claude Code' }), e => e.code === 'NATIVE_PROOF_REQUIRED');
});

test('frontend writes only native channel notifications and keeps readiness separate from message acknowledgements', async () => {
  const calls = [], requests = [];
  const hooks = await frontendHooks({ request: async (...args) => { requests.push(args); return { channel: 'supported' }; } });
  const server = { notification: async value => calls.push(value) };
  await hooks.onCommand('probe', { probeId: 'local-probe', content: 'local handshake' }, server);
  await hooks.onCommand('notify', { content: 'message', meta: { message_id: 'public-message' } }, server);
  assert.ok(calls.every(c => c.method === 'notifications/claude/channel'));
  assert.equal(calls[0].params.meta.probe_id, 'local-probe');
  await hooks.extraTools[0].call({ probeId: 'local-probe' }, { kind: 'native_call', nativeCallId: 'call-one' });
  assert.equal(requests[0][0], 'channel-ready');
  assert.throws(() => hooks.extraTools[0].call({ probeId: 'local-probe', sender: 'fake' }, {}), e => e.code === 'BAD_INPUT');
});


test('the native startup prompt follows the option terminator so the variadic channel flag cannot consume it', () => {
  const args = claudeLaunchArgs({ sessionId: 'native-session', configFile: '/private/mcp.json', policy: { deliveryMode: 'notify' } });
  const end = args.indexOf('--'); assert.ok(end > args.indexOf('--dangerously-load-development-channels'));
  assert.equal(args[end - 1], 'server:pulse-messaging'); assert.match(args[end + 1], /pulse_channel_start/u);
  assert.ok(args[args.indexOf('--allowedTools') + 1].includes('mcp__pulse-messaging__pulse_channel_start'));
  const inbox = claudeLaunchArgs({ sessionId: 'native-session', configFile: '/private/mcp.json', policy: { deliveryMode: 'inbox-only' } });
  assert.equal(inbox.includes('--'), false); assert.equal(inbox.includes('--dangerously-load-development-channels'), false);
});

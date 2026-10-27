import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { observeNativeContext } from './cli-messaging/contracts.mjs';
import { MailboxStore } from './cli-messaging/store.mjs';
import { MessagingBroker } from './cli-messaging/broker.mjs';

function fixture(t, options = {}) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'pulse-mailbox-')); fs.chmodSync(directory, 0o700);
  const store = new MailboxStore({ directory, ...options });
  t.after(() => { store.close(); fs.rmSync(directory, { recursive: true, force: true }); });
  return { directory, store };
}
const native = async (id, family = 'codex') => observeNativeContext({ observe: async () => ({ family, nativeId: id, owner: { pid: process.pid, startId: 'test-native-owner' }, capabilities: { notify: 'supported', wake: 'supported', existingConversation: 'supported' }, evidence: { kind: 'test-double', version: 'fixture', reference: id } }) });
async function pair(store) {
  const a = store.enroll('claude', await native('native-claude', 'claude'), { allowedRecipients: ['codex'] });
  const b = store.enroll('codex', await native('native-codex'), { deliveryMode: 'wake', allowedRecipients: ['claude'] });
  return { a, b, actorA: store.authenticate(a.credential), actorB: store.authenticate(b.credential, { kind: 'native_call', nativeCallId: 'harness-call-1' }) };
}
const send = (store, actor, requestId = 'bonjour', text = 'Bonjour depuis Claude') => store.send(actor, { requestId, recipient: 'codex', text });

test('stored messages are scoped and idempotent; reading never fabricates an acknowledgement', async t => {
  const { store } = fixture(t), { actorA, actorB } = await pair(store);
  assert.throws(() => store.enroll('fake', { family: 'claude', nativeId: 'declared-by-model' }), e => e.code === 'NATIVE_PROOF_REQUIRED');
  const one = send(store, actorA), retry = send(store, actorA);
  assert.equal(retry.messageId, one.messageId);
  assert.equal(one.receiptStage, 'stored');
  assert.throws(() => send(store, actorA, 'bonjour', 'Changed under the same request'), e => e.code === 'REQUEST_CONFLICT');
  assert.throws(() => store.send(actorA, { requestId: 'fake', recipient: 'codex', text: 'x', sender: 'another-session' }), e => e.code === 'BAD_INPUT');
  const page = store.read(actorB, {});
  assert.equal(page.items.length, 1);
  assert.equal(store.status(actorA, { messageId: one.messageId }).receiptStage, 'stored');
  assert.equal(store.read(actorA, {}).items.length, 0);
  const third = store.enroll('foreign', await native('native-foreign'));
  assert.throws(() => store.status(store.authenticate(third.credential), { messageId: one.messageId }), e => e.code === 'FORBIDDEN');
  assert.throws(() => store.ack(actorA, { messageId: one.messageId, stage: 'received' }), e => e.code === 'FORBIDDEN');
  assert.equal(store.ack(actorB, { messageId: one.messageId, stage: 'received' }).receiptStage, 'received');
  assert.equal(store.ack(actorB, { messageId: one.messageId, stage: 'consumed' }).receiptStage, 'consumed');
});

test('consumed requires a native invocation and stale generations cannot acknowledge or replay', async t => {
  const { store } = fixture(t), { actorA, actorB, b } = await pair(store);
  const one = send(store, actorA);
  assert.throws(() => store.ack(store.authenticate(b.credential), { messageId: one.messageId, stage: 'consumed' }), e => e.code === 'NATIVE_TURN_REQUIRED');
  const rotated = store.enroll('codex', await native('native-codex'), { deliveryMode: 'wake', allowedRecipients: ['claude'] });
  assert.throws(() => store.ack(actorB, { messageId: one.messageId, stage: 'received' }), e => e.code === 'STALE_GENERATION');
  assert.throws(() => store.ack(store.authenticate(rotated.credential, { kind: 'native_call', nativeCallId: 'new-call' }), { messageId: one.messageId, stage: 'received' }), e => e.code === 'STALE_GENERATION');
});

test('native writes and harness receipts never imply model consumption', async t => {
  const { store } = fixture(t), { actorA } = await pair(store);
  const one = send(store, actorA), attempt = store.prepareAttempt(one.messageId);
  store.progress(attempt.attemptId, 'transport_accepted', { kind: 'native-write' });
  assert.equal(store.status(actorA, { messageId: one.messageId }).receiptStage, 'transport_accepted');
  store.progress(attempt.attemptId, 'harness_ack', { kind: 'native-rpc-response' });
  store.finishAttempt(attempt.attemptId, 'confirmed', { kind: 'native-terminal-result' });
  assert.equal(store.status(actorA, { messageId: one.messageId }).receiptStage, 'harness_ack');
  assert.throws(() => store.progress(attempt.attemptId, 'consumed', {}), e => e.code === 'BAD_INPUT');
});

test('an emitted attempt cannot become not-emitted or clear uncertainty through ordinary completion', async t => {
  const { store } = fixture(t), { actorA } = await pair(store);
  const one = send(store, actorA), attempt = store.prepareAttempt(one.messageId);
  store.progress(attempt.attemptId, 'transport_accepted', { kind: 'native-write' });
  assert.throws(() => store.finishAttempt(attempt.attemptId, 'not_emitted', { kind: 'contradictory-adapter-result' }), e => e.code === 'BAD_STATE');
  store.markUnknown(attempt.attemptId);
  assert.throws(() => store.finishAttempt(attempt.attemptId, 'confirmed', { kind: 'uncorrelated-result' }), e => e.code === 'BAD_STATE');
  assert.equal(store.listUncertain().length, 1);
});

test('native correlation survives unknown state and only matching observed native readback reconciles it', async t => {
  const { store } = fixture(t), { actorA } = await pair(store);
  const one = send(store, actorA), attempt = store.prepareAttempt(one.messageId);
  store.progress(attempt.attemptId, 'harness_ack', { kind: 'native-start-receipt', nativeSessionId: 'native-codex', nativeTurnId: 'original-turn' });
  store.markUnknown(attempt.attemptId);
  assert.equal(store.message(one.messageId).attempts[0].evidence.nativeTurnId, 'original-turn');
  store.enroll('codex', await native('native-codex'), { deliveryMode: 'wake' });
  const context = await native('native-codex');
  assert.throws(() => store.reconcileNative(attempt.attemptId, context, { kind: 'native-terminal-result', nativeSessionId: 'native-codex', nativeTurnId: 'another-turn' }), e => e.code === 'BAD_EVIDENCE');
  assert.throws(() => store.reconcileNative(attempt.attemptId, JSON.parse(JSON.stringify(context)), { kind: 'native-terminal-result', nativeSessionId: 'native-codex', nativeTurnId: 'original-turn' }), e => e.code === 'NATIVE_PROOF_REQUIRED');
  const result = store.reconcileNative(attempt.attemptId, context, { kind: 'native-terminal-result', nativeSessionId: 'native-codex', nativeTurnId: 'original-turn' });
  assert.equal(result.deliveryState, 'native_reconciled');
  assert.equal(result.receiptStage, 'harness_ack');
  assert.equal(store.listUncertain().length, 0);
});

test('unknown effects fence the recipient across a new request, generation, alias and restart', async t => {
  const { directory, store } = fixture(t), { actorA } = await pair(store);
  const one = send(store, actorA), attempt = store.prepareAttempt(one.messageId);
  store.progress(attempt.attemptId, 'transport_accepted', { kind: 'native-write' });
  store.close();
  const recovered = new MailboxStore({ directory }); t.after(() => recovered.close());
  const a = recovered.authenticate((await pair(recovered)).a.credential);
  const two = send(recovered, a, 'another-request');
  assert.throws(() => recovered.prepareAttempt(two.messageId), e => e.code === 'TARGET_BLOCKED_UNKNOWN');
  recovered.enroll('another-name', await native('native-codex'), { deliveryMode: 'wake' });
  const permitted = recovered.enroll('claude', await native('native-claude', 'claude'), { allowedRecipients: ['another-name', 'codex'] });
  const three = recovered.send(recovered.authenticate(permitted.credential), { requestId: 'another-alias', recipient: 'another-name', text: 'still fenced' });
  assert.throws(() => recovered.prepareAttempt(three.messageId), e => e.code === 'TARGET_BLOCKED_UNKNOWN');
  recovered.enroll('codex', await native('different-native-codex'), { deliveryMode: 'wake', replace: true });
  const four = recovered.send(recovered.authenticate(permitted.credential), { requestId: 'new-binding', recipient: 'codex', text: 'same public target remains fenced' });
  assert.throws(() => recovered.prepareAttempt(four.messageId), e => e.code === 'TARGET_BLOCKED_UNKNOWN');
  recovered.abandonAttempt(attempt.attemptId, 'Operator deliberately abandons uncertainty; no rollback claimed');
  assert.ok(recovered.prepareAttempt(four.messageId).attemptId);
});

test('capacity rejects before commit, while retrying an already stored request still succeeds', async t => {
  const { store } = fixture(t, { maxQueuedPerTarget: 1 }), { actorA } = await pair(store);
  const one = send(store, actorA);
  assert.equal(send(store, actorA).messageId, one.messageId);
  assert.throws(() => send(store, actorA, 'over-capacity'), e => e.code === 'QUEUE_FULL');
  assert.equal(store.read(actorA, { direction: 'outbox' }).items.length, 1);
});

test('an explicitly acknowledged inbox message is never emitted later', async t => {
  const { store } = fixture(t), { actorA, actorB } = await pair(store);
  const one = send(store, actorA);
  store.ack(actorB, { messageId: one.messageId, stage: 'consumed' });
  assert.equal(store.prepareAttempt(one.messageId).prepared, false);
  assert.equal(store.readyMessages().length, 0);
});

test('native preflight checks a recipient acknowledgement before crossing the emission boundary', async t => {
  const { store } = fixture(t), broker = new MessagingBroker(store); t.after(() => broker.close());
  let entered, release, emissions = 0;
  const started = new Promise(resolve => { entered = resolve; });
  const gate = new Promise(resolve => { release = resolve; });
  const target = await broker.attach('target', { observe: async () => ({ family: 'codex', nativeId: 'preflight-target', owner: { pid: process.pid, startId: 'test' }, capabilities: { notify: 'supported', wake: 'supported', existingConversation: 'supported' }, evidence: { kind: 'test-double' } }), deliver: async ({ beforeEmit }) => { entered(); await gate; if (!beforeEmit({ kind: 'native-preflight-complete' })) return { outcome: 'not_emitted', evidence: { kind: 'recipient-already-processed' } }; emissions++; return { outcome: 'confirmed' }; } }, { deliveryMode: 'wake' });
  const source = store.enroll('source', await native('preflight-source', 'claude'), { allowedRecipients: ['target'] });
  const one = await broker.send(store.authenticate(source.credential), { requestId: 'preflight', recipient: 'target', text: 'read before the native connection is ready' });
  await started;
  broker.ack(store.authenticate(target.credential, { kind: 'native_call', nativeCallId: 'recipient-call' }), { messageId: one.messageId, stage: 'consumed' });
  release(); await broker.idle();
  assert.equal(emissions, 0);
  assert.notEqual(store.message(one.messageId).deliveryState, 'blocked_unknown');
});

test('replyTo binds to the original recipient and sender rather than an arbitrary known message', async t => {
  const { store } = fixture(t), { actorA, actorB } = await pair(store);
  const one = send(store, actorA);
  const reply = store.send(actorB, { requestId: 'reply-one', recipient: 'claude', text: 'Reçu', replyTo: one.messageId });
  assert.equal(reply.replyTo, one.messageId);
  assert.throws(() => store.send(actorA, { requestId: 'fake-reply', recipient: 'codex', text: 'x', replyTo: one.messageId }), e => e.code === 'FORBIDDEN');
});

test('exclusive ownership and private paths fail closed without deleting foreign state', t => {
  const { directory } = fixture(t);
  assert.throws(() => new MailboxStore({ directory, busyTimeoutMs: 20 }), /locked|owner/i);
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'pulse-mailbox-link-')); t.after(() => fs.rmSync(parent, { recursive: true, force: true }));
  const link = path.join(parent, 'alias'); fs.symlinkSync(directory, link);
  assert.throws(() => new MailboxStore({ directory: link }), /symlink|private|owned/i);
  assert.ok(fs.lstatSync(link).isSymbolicLink());
  const foreign = path.join(parent, 'foreign'); fs.mkdirSync(foreign, { mode: 0o700 });
  const foreignFile = path.join(foreign, 'messaging.sqlite'); fs.writeFileSync(foreignFile, 'foreign bytes', { mode: 0o600 });
  assert.throws(() => new MailboxStore({ directory: foreign }), e => e.code === 'UNRECOGNIZED_STORE');
  assert.equal(fs.readFileSync(foreignFile, 'utf8'), 'foreign bytes');
  const repository = path.join(parent, 'repo'); fs.mkdirSync(repository, { mode: 0o700 }); fs.mkdirSync(path.join(repository, '.git'));
  assert.throws(() => new MailboxStore({ directory: path.join(repository, 'mailbox') }), e => e.code === 'PRIVATE_PATH_REQUIRED');
  assert.equal(fs.existsSync(path.join(repository, 'mailbox')), false);
});

test('recorded native replies survive owner restart and publishing them is idempotent data recovery', async t => {
  const { directory, store } = fixture(t), { actorA, a } = await pair(store);
  const one = send(store, actorA), attempt = store.prepareAttempt(one.messageId);
  store.finishAttempt(attempt.attemptId, 'confirmed', { kind: 'native-terminal-result', nativeSessionId: 'native-codex', nativeTurnId: 'durable-turn' }, { text: 'durable native answer', nativeTurnId: 'durable-turn' });
  store.close(); const recovered = new MailboxStore({ directory });
  try {
    assert.equal(recovered.pendingNativeReplies()[0].text, 'durable native answer');
    const reply = recovered.publishNativeReply(attempt.attemptId);
    assert.equal(recovered.publishNativeReply(attempt.attemptId).messageId, reply.messageId);
    const actor = recovered.authenticate(a.credential);
    assert.equal(recovered.read(actor, {}).items[0].text, 'durable native answer');
    assert.equal(recovered.status(actor, { messageId: one.messageId }).receiptStage, 'received');
  } finally { recovered.close(); }
});

test('crash before commit stores nothing; crash after prepared native delivery fences recovery', async t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'pulse-mailbox-crash-')); fs.chmodSync(directory, 0o700);
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const module = fileURLToPath(new URL('./cli-messaging/store.mjs', import.meta.url));
  async function crash(phase) {
    const code = `import{MailboxStore}from ${JSON.stringify(new URL('./cli-messaging/store.mjs', import.meta.url).href)};import{observeNativeContext}from ${JSON.stringify(new URL('./cli-messaging/contracts.mjs', import.meta.url).href)};const s=new MailboxStore({directory:${JSON.stringify(directory)}});const c=await observeNativeContext({observe:async()=>({family:'codex',nativeId:'crash-target',owner:{pid:process.pid,startId:'test'},capabilities:{notify:'supported',wake:'supported',existingConversation:'supported'},evidence:{kind:'test-double'}})});const b=s.enroll('target',c,{deliveryMode:'wake',allowedRecipients:['target']});const actor=s.authenticate(b.credential);${phase === 'before' ? `s.db.exec('BEGIN IMMEDIATE');s.db.prepare('INSERT INTO metadata(key,value) VALUES(?,?)').run('uncommitted','x');` : `const m=s.send(actor,{requestId:'crash-message',recipient:'target',text:'preserve me'});s.prepareAttempt(m.messageId);`}process.kill(process.pid,'SIGKILL');`;
    const child = spawn(process.execPath, ['--input-type=module', '-e', code], { stdio: ['ignore', 'ignore', 'pipe'] }); let stderr = ''; child.stderr.on('data', d => stderr += d);
    const result = await new Promise(resolve => child.once('exit', (code, signal) => resolve({ code, signal })));
    assert.equal(result.signal, 'SIGKILL', stderr + module);
  }
  await crash('before'); let recovered = new MailboxStore({ directory }); assert.equal(recovered.db.prepare("SELECT count(*) AS n FROM metadata WHERE key='uncommitted'").get().n, 0); recovered.close();
  await crash('after'); recovered = new MailboxStore({ directory });
  assert.equal(recovered.listUncertain().length, 1);
  assert.equal(recovered.listUncertain()[0].state, 'blocked_unknown'); recovered.close();
});

test('broker keeps inbox-only as default, bounds concurrency and never re-emits uncertainty', async t => {
  const { store } = fixture(t), broker = new MessagingBroker(store, { maxConcurrency: 2 }); t.after(() => broker.close());
  let calls = 0;
  const adapter = { observe: async () => ({ family: 'codex', nativeId: 'broker-target', owner: { pid: process.pid, startId: 'test' }, capabilities: { notify: 'supported', wake: 'supported', existingConversation: 'supported' }, evidence: { kind: 'test-double' } }), deliver: async ({ progress }) => { calls++; progress('transport_accepted', { kind: 'write' }); throw new Error('ack lost after emission'); } };
  const source = store.enroll('source', await native('source', 'claude'), { allowedRecipients: ['target'] });
  await broker.attach('target', adapter);
  const actor = store.authenticate(source.credential);
  await broker.send(actor, { requestId: 'one', recipient: 'target', text: 'inbox only' }); await broker.idle(); assert.equal(calls, 0);
  await broker.attach('target', adapter, { deliveryMode: 'wake' });
  await broker.send(actor, { requestId: 'two', recipient: 'target', text: 'owned native wake enabled' }); await broker.idle(); assert.equal(calls, 1);
  await broker.send(actor, { requestId: 'three', recipient: 'target', text: 'must remain stored' }); await broker.idle(); assert.equal(calls, 1);
});

test('confirmed native delivery stays confirmed and retains its reply when the return mailbox is full', async t => {
  const { store } = fixture(t, { maxQueuedPerTarget: 1 }), broker = new MessagingBroker(store); t.after(() => broker.close());
  const source = store.enroll('source', await native('reply-source', 'claude'), { allowedRecipients: ['target'] });
  const filler = store.enroll('filler', await native('filler'), { allowedRecipients: ['source'] });
  const fill = store.send(store.authenticate(filler.credential), { requestId: 'fill', recipient: 'source', text: 'already queued' });
  await broker.attach('target', { observe: async () => ({ family: 'codex', nativeId: 'reply-target', owner: { pid: process.pid, startId: 'test' }, capabilities: { notify: 'supported', wake: 'supported', existingConversation: 'supported' }, evidence: { kind: 'test-double' } }), deliver: async () => ({ outcome: 'confirmed', evidence: { kind: 'native-terminal-result', nativeTurnId: 'reply-turn' }, reply: { text: 'native answer', nativeTurnId: 'reply-turn' } }) }, { deliveryMode: 'wake', allowedRecipients: ['source'] });
  const actor = store.authenticate(source.credential);
  const one = await broker.send(actor, { requestId: 'native-roundtrip', recipient: 'target', text: 'request' }); await broker.idle();
  assert.equal(store.status(actor, { messageId: one.messageId }).deliveryState, 'native_done');
  assert.equal(store.pendingNativeReplies().length, 1);
  assert.equal(store.pendingNativeReplies()[0].text, 'native answer');
  broker.ack(actor, { messageId: fill.messageId, stage: 'received' }); await broker.idle();
  assert.equal(store.pendingNativeReplies().length, 0);
  assert.equal(store.read(actor, {}).items.find(m => m.replyTo === one.messageId).text, 'native answer');
});

test('broker enforces the global limit and one native delivery per target while independent targets progress', async t => {
  const { store } = fixture(t), broker = new MessagingBroker(store, { maxConcurrency: 2 }); t.after(() => broker.close());
  let active = 0, maximum = 0, releaseAll = false, calls = 0;
  const perTarget = new Map(), maximumPerTarget = new Map(), releases = [];
  for (const alias of ['first', 'second', 'third']) {
    await broker.attach(alias, { observe: async () => ({ family: 'codex', nativeId: 'native-' + alias, owner: { pid: process.pid, startId: 'test' }, capabilities: { notify: 'supported', wake: 'supported', existingConversation: 'supported' }, evidence: { kind: 'test-double' } }), deliver: async () => {
      calls++; active++; maximum = Math.max(maximum, active); perTarget.set(alias, (perTarget.get(alias) ?? 0) + 1); maximumPerTarget.set(alias, Math.max(maximumPerTarget.get(alias) ?? 0, perTarget.get(alias)));
      if (!releaseAll) await new Promise(resolve => releases.push(resolve));
      active--; perTarget.set(alias, perTarget.get(alias) - 1); return { outcome: 'confirmed', evidence: { kind: 'test-native-terminal' } };
    } }, { deliveryMode: 'wake' });
  }
  const source = store.enroll('source', await native('concurrent-source', 'claude'), { allowedRecipients: ['first', 'second', 'third'] }), actor = store.authenticate(source.credential);
  for (const [index, recipient] of ['first', 'first', 'second', 'third'].entries()) await broker.send(actor, { requestId: 'request-' + index, recipient, text: 'ordered target queue' });
  const deadline = Date.now() + 1000;
  while (calls < 2 && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(calls, 2); assert.equal(active, 2);
  releaseAll = true; for (const release of releases) release(); await broker.idle();
  assert.equal(calls, 4); assert.equal(maximum, 2);
  assert.ok([...maximumPerTarget.values()].every(n => n === 1));
});

test('verified reconnect preserves credentials and generation while refreshing capabilities and keeping unknown attempts fenced', async t => {
  const { directory, store } = fixture(t), original = new MessagingBroker(store);
  let emissions = 0;
  const port = (startId = 'original-process', wake = 'supported') => ({ observe: async () => ({ family: 'codex', nativeId: 'restore-target', owner: { pid: process.pid, startId }, capabilities: { notify: 'supported', wake, existingConversation: 'supported' }, evidence: { kind: 'test-double', version: 'fixture' } }), deliver: async () => { emissions++; return { outcome: 'confirmed' }; } });
  const target = await original.attach('target', port(), { deliveryMode: 'wake' });
  const source = store.enroll('source', await native('restore-source', 'claude'), { allowedRecipients: ['target'] });
  const one = store.send(store.authenticate(source.credential), { requestId: 'before-restart', recipient: 'target', text: 'possible native effect' });
  const attempt = store.prepareAttempt(one.messageId); store.progress(attempt.attemptId, 'transport_accepted', { kind: 'write' });
  await original.close(); store.close();
  const recovered = new MailboxStore({ directory }), broker = new MessagingBroker(recovered);
  try {
    const restored = await broker.restore(target.credential, port('original-process', 'unknown')); await broker.idle();
    assert.equal(restored.generation, target.generation);
    assert.equal(recovered.authenticate(target.credential).generation, target.generation);
    assert.equal(restored.capabilities.wake, 'unknown');
    assert.equal(recovered.listUncertain().length, 1); assert.equal(emissions, 0);
    await assert.rejects(broker.restore(target.credential, port('different-process')), e => e.code === 'STALE_GENERATION');
  } finally { await broker.close(); recovered.close(); }
});

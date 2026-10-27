import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const runtimeFile = process.env.PULSE_MESSAGING_RUNTIME_BUNDLE;
if (!runtimeFile) throw new Error('E2E component tests need the exact built messaging runtime');
const runtime = await import(pathToFileURL(runtimeFile).href);
const waitFor = async predicate => { const deadline = Date.now() + 3000; while (!await predicate()) { if (Date.now() > deadline) throw new Error('Expected runtime state not reached'); await new Promise(resolve => setTimeout(resolve, 15)); } };

test('the built runtime runs after relocation without the source tree or a node_modules copy', async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pulse-runtime-extracted-')); fs.chmodSync(root, 0o700);
  const script = path.join(root, 'cli-messaging-runtime.mjs'), state = path.join(root, 'state'); fs.copyFileSync(runtimeFile, script);
  const child = spawn(process.execPath, [script, 'serve', '--state', state], { stdio: ['ignore', 'pipe', 'pipe'] }); let stderr = ''; child.stderr.on('data', data => stderr += data); child.stdout.resume();
  t.after(async () => { if (child.exitCode === null && !child.signalCode) { child.kill('SIGTERM'); await new Promise(resolve => child.once('exit', resolve)); } fs.rmSync(root, { recursive: true, force: true }); });
  await waitFor(() => fs.existsSync(path.join(state, 'owner.json')));
  const status = spawn(process.execPath, [script, 'status', '--state', state], { stdio: ['ignore', 'pipe', 'pipe'] }); let stdout = ''; status.stdout.on('data', data => stdout += data); status.stderr.resume();
  assert.equal(await new Promise(resolve => status.once('exit', resolve)), 0, stderr);
  assert.equal(JSON.parse(stdout).protocolVersion, '1.0'); assert.equal(fs.existsSync(path.join(root, 'node_modules')), false);
});

test('real production factory rejects a model-declared native identity without replacing the session', async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pulse-runtime-authority-')); fs.chmodSync(root, 0o700);
  const owner = await runtime.serveOwner({ directory: root, factories: runtime.NATIVE_FACTORIES });
  t.after(async () => { await owner.close(); fs.rmSync(root, { recursive: true, force: true }); });
  assert.equal(owner.store.db.prepare('SELECT count(*) AS n FROM sessions').get().n, 0);
  const module = await runtime.NATIVE_FACTORIES.claude();
  const adapter = await module.createAdapter({ connection: { pid: process.pid, startId: 'declared', sessionId: 'declared-by-model', binary: process.execPath }, host: owner.host, alias: 'fake' });
  await assert.rejects(owner.broker.attach('fake', adapter), error => ['NATIVE_PROOF_REQUIRED', 'NATIVE_UNAVAILABLE'].includes(error.code));
  assert.equal(owner.store.db.prepare('SELECT count(*) AS n FROM sessions').get().n, 0);
});

test('exact packaged runtime fences a possibly emitted message after SIGKILL, reconnection and a new generation', async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pulse-runtime-crash-')); fs.chmodSync(root, 0o700);
  const state = path.join(root, 'state'), credentialsFile = path.join(root, 'bindings.json');
  // Code-owned test doubles exercise compiled recovery; they certify no native CLI capability.
  const source = `import fs from 'node:fs';
    const runtime = await import(${JSON.stringify(pathToFileURL(runtimeFile).href)});
    const fixture = (family,id) => ({observe: async()=>({family,nativeId:id,owner:{pid:${process.pid},startId:'compiled-test-double'},capabilities:{wake:'supported',notify:'unknown',existingConversation:'supported'},evidence:{kind:'test-double'}}),deliver:async({progress})=>{progress('transport_accepted',{kind:'test-double-write'});process.stdout.write('emitted\\n');return new Promise(()=>{});}});
    const owner=await runtime.serveOwner({directory:${JSON.stringify(state)}});
    const a=await owner.broker.attach('claude',fixture('claude','test-claude'),{allowedRecipients:['codex']});
    const b=await owner.broker.attach('codex',fixture('codex','test-codex'),{deliveryMode:'wake'});
    fs.writeFileSync(${JSON.stringify(credentialsFile)},JSON.stringify({a,b}),{mode:0o600});
    await owner.broker.send(owner.store.authenticate(a.credential),{requestId:'first',recipient:'codex',text:'test double only'});`;
  const child = spawn(process.execPath, ['--input-type=module', '-e', source], { stdio: ['ignore', 'pipe', 'pipe'] }); let stdout = '', stderr = ''; child.stdout.on('data', d => stdout += d); child.stderr.on('data', d => stderr += d);
  let restarted;
  t.after(async () => { if (child.exitCode === null && !child.signalCode) { child.kill('SIGKILL'); await new Promise(r => child.once('exit', r)); } await restarted?.close(); fs.rmSync(root, { recursive: true, force: true }); });
  await waitFor(() => { if (child.exitCode !== null) throw new Error(stderr); return stdout.includes('emitted'); });
  child.kill('SIGKILL'); await new Promise(r => child.once('exit', r));
  const saved = JSON.parse(fs.readFileSync(credentialsFile, 'utf8'));
  restarted = await runtime.serveOwner({ directory: state });
  let emissions = 0;
  const fixture = (family, id) => ({ observe: async () => ({ family, nativeId: id, owner: { pid: process.pid, startId: 'compiled-test-double' }, capabilities: { wake: 'supported', notify: 'unknown', existingConversation: 'supported' }, evidence: { kind: 'test-double' } }), deliver: async () => { emissions++; return { outcome: 'not_emitted' }; } });
  await restarted.broker.restore(saved.a.credential, fixture('claude', 'test-claude'));
  await restarted.broker.restore(saved.b.credential, fixture('codex', 'test-codex'));
  const actor = restarted.store.authenticate(saved.a.credential);
  assert.equal(restarted.store.listUncertain().length, 1);
  const second = await restarted.broker.send(actor, { requestId: 'fresh-request', recipient: 'codex', text: 'must stay queued' });
  await restarted.broker.attach('codex', fixture('codex', 'test-codex'), { deliveryMode: 'wake' });
  await restarted.broker.idle();
  assert.equal(emissions, 0);
  assert.equal(restarted.store.status(actor, { messageId: second.messageId }).receiptStage, 'stored');
  assert.throws(() => restarted.store.prepareAttempt(second.messageId), e => e.code === 'TARGET_BLOCKED_UNKNOWN');
});


test('the positive live driver waits for native terminal receipts after both replies were consumed', async () => {
  const { roundtripComplete } = await import('./cli-messaging/probes/live-roundtrip.mjs');
  const messages = [{ id: 'one', sender_alias: 'claude', recipient_alias: 'codex', request_id: 'essai-code' }, { id: 'two', sender_alias: 'claude', recipient_alias: 'argon', request_id: 'essai-argon' }, { id: 'three', recipient_alias: 'claude', reply_to: 'one' }, { id: 'four', recipient_alias: 'claude', reply_to: 'two' }].map(m => ({ ...m, receipt_stage: 'consumed' }));
  assert.equal(roundtripComplete(messages, [{ message_id: 'one', settled: 1 }, { message_id: 'two', settled: 0 }]), false);
  assert.equal(roundtripComplete(messages, messages.map(m => ({ message_id: m.id, settled: 1 }))), true);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, execFileSync } from 'node:child_process';
import { ControlledAntigravity, AntigravityAdapter, scopedMcpArguments, messagingNativePolicy, inspectAntigravity } from './cli-messaging/adapters/antigravity.mjs';
import { processIdentity } from './cli-messaging/owner.mjs';

async function streamFixture(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'pulse-go-stream-')); fs.chmodSync(directory, 0o700);
  const script = path.join(directory, 'native-double.mjs');
  fs.writeFileSync(script, `import{createInterface}from'node:readline';console.log(JSON.stringify({event:'init',conversation_id:'native-conversation',init:{model:'test-double'}}));let turn=0;createInterface({input:process.stdin}).on('line',line=>{const r=JSON.parse(line);turn++;setTimeout(()=>console.log(JSON.stringify({event:'result',result:{conversation_id:r.message.content==='wrong'?'foreign':'native-conversation',num_turns:turn,status:'SUCCESS',response:r.message.content==='deny'?'':r.message.content,denied_actions:r.message.content==='deny'?[{action:'read_file'}]:[]}})),20);});`);
  const child = spawn(process.execPath, [script], { stdio: ['pipe', 'pipe', 'pipe'] });
  const stream = new ControlledAntigravity(child, { version: 'test-double', timeoutMs: 1000 });
  t.after(async () => { await stream.stop(); fs.rmSync(directory, { recursive: true, force: true }); });
  await stream.initialized; return stream;
}

test('controlled native stream accepts one turn at a time and cached results never emit another prompt', async t => {
  const stream = await streamFixture(t);
  const first = stream.ask({ attemptId: 'one', text: 'premier', expectedTurn: 1 });
  assert.equal((await stream.ask({ attemptId: 'parallel', text: 'must not emit', expectedTurn: 1 })).notEmitted, true);
  assert.equal((await first).nativeTurnId, 'native-conversation:turn:1');
  assert.equal((await stream.ask({ attemptId: 'two', text: 'second', expectedTurn: 2 })).numTurns, 2);
  assert.equal((await stream.ask({ attemptId: 'one', text: 'premier', expectedTurn: 1 })).response, 'premier');
  assert.equal(stream.results, 2);
});

test('SUCCESS with denied_actions keeps refusal and uncertainty instead of inventing task success', async t => {
  const stream = await streamFixture(t), result = await stream.ask({ attemptId: 'denied', text: 'deny', expectedTurn: 1 });
  assert.deepEqual(result.deniedActions, ['read_file']); assert.equal(result.effectUncertain, true); assert.equal(result.response, '');
});

test('a native conversation mismatch poisons the stream and prevents a second input', async t => {
  const stream = await streamFixture(t);
  await assert.rejects(stream.ask({ attemptId: 'wrong', text: 'wrong', expectedTurn: 1 }), e => e.code === 'NATIVE_RECEIPT_UNKNOWN');
  assert.equal((await stream.ask({ attemptId: 'new-key', text: 'no replay', expectedTurn: 1 })).notEmitted, true);
  assert.equal(stream.results, 0);
});

test('adapter records native correlation before command emission and distinguishes native denial', async () => {
  const calls = [], progress = [];
  const state = { nativeId: 'native', process: processIdentity(process.pid), version: 'test', resultCount: 0, inFlight: false };
  const peer = { closed: false, command: async (kind, payload) => { calls.push({ kind, payload }); return kind === 'status' ? state : { nativeId: 'native', nativeTurnId: 'native:turn:1', status: 'SUCCESS', response: 'partial answer', numTurns: 1, deniedActions: ['read_file'], effectUncertain: true }; } };
  const adapter = new AntigravityAdapter({ connection: { binary: process.execPath, wrapper: processIdentity(process.pid), workspace: '/fixture' }, host: {}, peer, inspect: () => {} });
  await adapter.observe();
  const result = await adapter.deliver({ message: { messageId: 'message', sender: 'source' }, attempt: { attemptId: 'attempt' }, beforeEmit: evidence => { assert.equal(evidence.nativeTurnId, 'native:turn:1'); assert.equal(calls.filter(c => c.kind === 'prompt').length, 0); return true; }, progress: (...args) => progress.push(args), signal: new AbortController().signal });
  assert.equal(result.evidence.kind, 'native-result-denied'); assert.equal(result.reply.text, 'partial answer');
  assert.equal(progress.some(p => p[0] === 'consumed'), false);
});

test('native inspector never treats an arbitrary process as an owned Antigravity conversation', () => {
  assert.throws(() => inspectAntigravity({ nativeId: 'declared', process: processIdentity(process.pid) }, { binary: process.execPath, wrapper: processIdentity(process.pid) }), e => e.code === 'NATIVE_PROOF_REQUIRED');
});

test('MCP config overlay is scoped to the child and preserves the original file bytes', { skip: !fs.existsSync('/usr/bin/bwrap') }, t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'pulse-go-config-')); fs.chmodSync(directory, 0o700); t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const globalFile = path.join(directory, 'global.json'), mergedFile = path.join(directory, 'merged.json');
  fs.writeFileSync(globalFile, '{}'); fs.writeFileSync(mergedFile, JSON.stringify({ mcpServers: { 'pulse-messaging': { command: 'node', args: ['private-config'] } } }));
  const output = execFileSync('/usr/bin/bwrap', [...scopedMcpArguments({ globalFile, mergedFile }), '--', process.execPath, '-e', 'const fs=require("node:fs");console.log(Object.keys(JSON.parse(fs.readFileSync(process.argv[1],"utf8")).mcpServers).join(","));', globalFile], { encoding: 'utf8' });
  assert.equal(output.trim(), 'pulse-messaging'); assert.equal(fs.readFileSync(globalFile, 'utf8'), '{}');
});


test('opt-in native policy permits only the five messaging tools and preserves stronger Ask/Deny and model settings', () => {
  const base = { model: 'existing-model', toolPermission: 'request-review', permissions: { allow: ['command(git)'], ask: ['mcp(*)'], deny: ['mcp(pulse-messaging/pulse_message_send)'] } };
  const before = structuredClone(base), scoped = messagingNativePolicy(base);
  assert.deepEqual(base, before); assert.equal(scoped.model, base.model); assert.equal(scoped.toolPermission, base.toolPermission);
  assert.deepEqual(scoped.permissions.ask, base.permissions.ask); assert.deepEqual(scoped.permissions.deny, base.permissions.deny);
  assert.equal(scoped.permissions.allow.length, 6);
  assert.ok(scoped.permissions.allow.includes('mcp(pulse-messaging/pulse_message_read)'));
  assert.equal(scoped.permissions.allow.includes('mcp(pulse-messaging/*)'), false);
  assert.deepEqual(messagingNativePolicy(scoped), scoped);
  assert.throws(() => messagingNativePolicy({ permissions: { deny: 'foreign-shape' } }), e => e.code === 'INVALID_PRIVATE_FILE');
});

test('two process-scoped overlays retain MCP and exact tool policies together without changing either original', { skip: !fs.existsSync('/usr/bin/bwrap') }, t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'pulse-go-two-configs-')); fs.chmodSync(directory, 0o700); t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const mcp = path.join(directory, 'mcp.json'), settings = path.join(directory, 'settings.json'), newMcp = path.join(directory, 'new-mcp.json'), newSettings = path.join(directory, 'new-settings.json');
  fs.writeFileSync(mcp, '{}'); fs.writeFileSync(settings, '{"model":"preserved"}');
  fs.writeFileSync(newMcp, '{"ownServer":true}'); fs.writeFileSync(newSettings, JSON.stringify(messagingNativePolicy({ model: 'preserved' })));
  const result = execFileSync('/usr/bin/bwrap', [...scopedMcpArguments({ globalFile: mcp, mergedFile: newMcp }), ...scopedMcpArguments({ globalFile: settings, mergedFile: newSettings, rootBind: false }), '--', process.execPath, '-e', 'const fs=require("node:fs");console.log(JSON.stringify(process.argv.slice(1).map(p=>JSON.parse(fs.readFileSync(p,"utf8")))));', mcp, settings], { encoding: 'utf8' });
  const [a, b] = JSON.parse(result); assert.equal(a.ownServer, true); assert.equal(b.model, 'preserved'); assert.equal(b.permissions.allow.length, 5);
  assert.equal(fs.readFileSync(mcp, 'utf8'), '{}'); assert.equal(fs.readFileSync(settings, 'utf8'), '{"model":"preserved"}');
});

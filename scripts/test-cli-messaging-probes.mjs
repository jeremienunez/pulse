import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { channelAction, runArgonFixture } from './cli-messaging/probes/native-feasibility.mjs';

const toolchain = process.env.PULSE_MESSAGING_TOOLCHAIN;
const built = process.env.PULSE_MESSAGING_PROBE_BUILD;
if (!toolchain || !built) throw new Error('N01 tests require explicit external toolchain and built fixture paths');
const load = p => import(pathToFileURL(path.join(toolchain, 'node_modules/@modelcontextprotocol/sdk/dist/esm', p)).href);
const [{ Client }, { StdioClientTransport }] = await Promise.all([load('client/index.js'), load('client/stdio.js')]);

test('Channel fixture: a transport write stays unreceived until the connected recipient replies', { timeout: 10000 }, async t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'pulse-channel-test-'));
  fs.chmodSync(directory, 0o700);
  const sessionId = randomUUID(), socketPath = path.join(directory, 'channel.sock');
  const transport = new StdioClientTransport({ command: process.execPath, args: [path.join(built, 'channel-fixture.mjs')], env: { PULSE_PROBE_DIRECTORY: directory, PULSE_PROBE_CLAUDE_SESSION: sessionId }, stderr: 'pipe' });
  let stderr = '';
  const client = new Client({ name: 'N01-test-client', version: '0.0.0' }, { capabilities: {} });
  t.after(async () => { await client.close(); fs.rmSync(directory, { recursive: true, force: true }); });
  await client.connect(transport);
  if (transport.stderr) transport.stderr.on('data', d => { stderr += d; });
  const caps = client.getServerCapabilities();
  assert.deepEqual(caps.experimental, { 'claude/channel': {} });
  assert.equal((await client.listTools()).tools.length, 1);
  const sent = await channelAction(socketPath, { action: 'send', id: 'message-one', text: 'Un message local de test.' });
  assert.equal(sent.messages[0].state, 'transport_written');
  assert.equal(sent.replies.length, 0);
  assert.match(sent.nativeRegistration, /unproven/);
  await assert.rejects(client.callTool({ name: 'pulse_probe_reply', arguments: { replyTo: 'unknown-message', text: 'reçu' } }), /Unmatched message/);
  assert.equal((await channelAction(socketPath, { action: 'status' })).replies.length, 0);
  await assert.rejects(client.callTool({ name: 'pulse_probe_reply', arguments: { replyTo: 'message-one', text: 'reçu', sender: 'another-session' } }), /invalid reply/);
  const reply = await client.callTool({ name: 'pulse_probe_reply', arguments: { replyTo: 'message-one', text: 'reçu' } });
  assert.notEqual(reply.isError, true);
  const status = await channelAction(socketPath, { action: 'status' });
  assert.equal(status.replies.length, 1);
  assert.equal(status.replies[0].binding.sessionId, sessionId);
  assert.equal(status.replies[0].binding.parentPid, process.pid);
  await assert.rejects(channelAction(socketPath, { action: 'send', id: 'message-one', text: 'duplicate' }), /duplicate/);
  assert.equal(stderr, '');
});

test('Operator connection without a receipt rejects instead of hanging or retrying', { timeout: 5000 }, async () => {
  const net = await import('node:net');
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'pulse-channel-eof-'));
  const socketPath = path.join(directory, 'channel.sock');
  // Drain the deliberately unanswered request so close() can observe peer EOF.
  const server = net.createServer(s => { s.resume(); s.end(); });
  try {
    await new Promise(resolve => server.listen(socketPath, resolve)); fs.chmodSync(socketPath, 0o600);
    await assert.rejects(channelAction(socketPath, { action: 'send' }), /without receipt/);
  } finally { await new Promise(resolve => server.close(resolve)); fs.rmSync(directory, { recursive: true, force: true }); }
});

async function argonDouble(t, identity) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'pulse-argon-protocol-'));
  fs.chmodSync(directory, 0o700);
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const binary = path.join(directory, 'fake-argon.mjs');
  fs.writeFileSync(binary, `#!/usr/bin/node
import {createInterface} from 'node:readline';
const identity = ${JSON.stringify(identity)};
if(identity)console.log(JSON.stringify({event:'init',conversation_id:'owned-test-conversation',init:{model:'test-double'}}));
let turns=0,busy=false;
createInterface({input:process.stdin}).on('line',line=>{
 const frame=JSON.parse(line);
 if(busy||frame.event!=='user')process.exit(4);
 busy=true;turns++;
 setTimeout(()=>{busy=false;console.log(JSON.stringify({event:'result',result:{...(identity?{conversation_id:'owned-test-conversation'}:{}),status:'SUCCESS',response:'pomme',num_turns:turns}}));},35);
});
`, { mode: 0o700 });
  return runArgonFixture({ directory, reportFile: path.join(directory, 'result.json'), binary });
}

test('Antigravity probe queues its second prompt only after a terminal native result', { timeout: 5000 }, async t => {
  const report = await argonDouble(t, true);
  assert.equal(report.status, 'two_ordered_turns_observed', JSON.stringify({ error: report.error, exit: report.exit, stderrBytes: report.stderrBytes }));
  assert.equal(report.promptsEmitted, 2);
  assert.equal(report.exit.code, 0);
});

test('Antigravity probe with missing native identity must stop before its second prompt', { timeout: 5000 }, async t => {
  const report = await argonDouble(t, false);
  assert.equal(report.status, 'blocked_unknown');
  assert.equal(report.promptsEmitted, 1);
});

test('Antigravity probe settles when the native executable cannot be started', { timeout: 3000 }, async t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'pulse-argon-unavailable-'));
  fs.chmodSync(directory, 0o700);
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const report = await runArgonFixture({ directory, reportFile: path.join(directory, 'result.json'), binary: path.join(directory, 'missing-cli') });
  assert.equal(report.status, 'blocked_unknown');
  assert.equal(report.exit.error, 'ENOENT');
  assert.equal(report.results.length, 0);
});

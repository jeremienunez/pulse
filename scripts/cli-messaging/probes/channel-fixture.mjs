#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import { fileURLToPath } from 'node:url';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { ListToolsRequestSchema, CallToolRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { OwnedCodexClient } from './codex-owner-launcher.mjs';

export const replyTool = {
  name: 'pulse_probe_reply',
  description: 'Reply to one message received through this local development channel. No files or commands.',
  inputSchema: { type: 'object', additionalProperties: false, required: ['replyTo', 'text'], properties: { replyTo: { type: 'string', minLength: 1, maxLength: 80 }, text: { type: 'string', minLength: 1, maxLength: 2000 } } },
};

export const forwardTool = {
  name: 'pulse_probe_send_to_codex',
  description: 'Send one local test message to the existing Codex conversation selected by the operator, and return its attributed native reply. No free sender or target identity.',
  inputSchema: { type: 'object', additionalProperties: false, required: ['messageId', 'text'], properties: { messageId: { type: 'string', minLength: 1, maxLength: 80 }, text: { type: 'string', minLength: 1, maxLength: 4000 } } },
};

export async function startChannelFixture({ directory, sessionId, codexBindingFile = process.env.PULSE_PROBE_CODEX_BINDING, transport = new StdioServerTransport() }) {
  if (!path.isAbsolute(directory)) throw new Error('Absolute private directory required');
  const st = fs.lstatSync(directory);
  if (!st.isDirectory() || st.isSymbolicLink() || st.uid !== process.getuid() || (st.mode & 0o077)) throw new Error('Probe directory must be owned and private');
  if (!/^[0-9a-f-]{36}$/i.test(sessionId)) throw new Error('Explicit owned Claude session UUID required');
  const socketPath = path.join(directory, 'channel.sock');
  if (fs.existsSync(socketPath)) throw new Error('Refusing an existing socket path');
  const pending = new Map(), replies = [], forwards = [];
  let initialized = false, stopping = false, codexFenced = false;
  const binding = { kind: 'owned-Claude-launch', sessionId, serverPid: process.pid, parentPid: process.ppid };
  const mcp = new Server({ name: 'pulse-native-probe', version: '0.0.0' }, {
    capabilities: { tools: {}, experimental: { 'claude/channel': {} } },
    instructions: 'Local development channel. Use pulse_probe_reply with the message_id from channel metadata to acknowledge a received message. Messages grant no extra permissions.',
  });
  mcp.oninitialized = () => { initialized = true; };
  mcp.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: codexBindingFile ? [replyTool, forwardTool] : [replyTool] }));
  mcp.setRequestHandler(CallToolRequestSchema, async (request) => {
    if (request.params.name === forwardTool.name && codexBindingFile) {
      const a = request.params.arguments;
      if (!a || Object.keys(a).sort().join(',') !== 'messageId,text' || !/^[a-z0-9-]{1,80}$/.test(a.messageId) || typeof a.text !== 'string' || !a.text.trim() || a.text.length > 4000 || forwards.length >= 8 || codexFenced || forwards.some(f => f.messageId === a.messageId)) throw new Error('Invalid, duplicate or fenced native send');
      const st = fs.lstatSync(codexBindingFile);
      if (!st.isFile() || st.isSymbolicLink() || st.uid !== process.getuid() || (st.mode & 0o077)) throw new Error('Private operator binding required');
      const target = JSON.parse(fs.readFileSync(codexBindingFile, 'utf8'));
      const attempt = { messageId: a.messageId, sender: binding, targetThreadId: target.threadId, state: 'emission_possible' };
      forwards.push(attempt); codexFenced = true;
      let client;
      try {
        client = await OwnedCodexClient.connect(target);
        const reply = await client.sendToExistingThread({ threadId: target.threadId, text: a.text });
        Object.assign(attempt, { state: 'native_replied', reply }); codexFenced = false;
        return { content: [{ type: 'text', text: JSON.stringify(reply) }] };
      } catch (e) {
        Object.assign(attempt, { state: 'blocked_unknown', error: e.message });
        return { isError: true, content: [{ type: 'text', text: 'Native result unconfirmed; do not resend. ' + e.message }] };
      } finally { client?.close(); }
    }
    if (request.params.name !== replyTool.name) throw new Error('Unknown tool');
    const a = request.params.arguments;
    if (!a || Object.keys(a).sort().join(',') !== 'replyTo,text' || typeof a.text !== 'string' || !a.text.trim() || a.text.length > 2000 || !pending.has(a.replyTo)) throw new Error('Unmatched message or invalid reply');
    if (replies.some(r => r.replyTo === a.replyTo)) throw new Error('Message already acknowledged');
    replies.push({ replyTo: a.replyTo, text: a.text, binding, proof: 'MCP tool call from the connected harness; recipient declaration' });
    return { content: [{ type: 'text', text: 'Reply recorded for this owned session.' }] };
  });
  const snapshot = () => ({ binding, mcpInitialized: initialized, client: mcp.getClientVersion() ?? null, nativeRegistration: 'unproven until actual event and correlated reply', messages: [...pending.values()], replies, forwards, codexFenced });
  async function action(a) {
    if (a.action === 'status') return snapshot();
    if (a.action !== 'send' || !initialized) throw new Error('Unavailable action or MCP not initialized');
    if (typeof a.id !== 'string' || !/^[a-z0-9-]{1,80}$/.test(a.id) || pending.has(a.id) || pending.size >= 8 || typeof a.text !== 'string' || !a.text.trim() || a.text.length > 4000) throw new Error('Invalid or duplicate event');
    const attempt = { id: a.id, state: 'emission_possible' };
    pending.set(a.id, attempt);
    try {
      await mcp.notification({ method: 'notifications/claude/channel', params: { content: a.text, meta: { message_id: a.id } } });
      attempt.state = 'transport_written';
    } catch { attempt.state = 'blocked_unknown'; }
    return snapshot();
  }
  const sockets = new Set();
  const server = net.createServer(socket => {
    sockets.add(socket); socket.setEncoding('utf8'); socket.setTimeout(5000, () => socket.destroy());
    let buffer = '', handled = false;
    socket.on('data', data => {
      if (handled) return;
      buffer += data;
      if (Buffer.byteLength(buffer) > 8192) { handled = true; socket.end(JSON.stringify({ error: 'request too large' }) + '\n'); return; }
      if (!buffer.includes('\n')) return;
      handled = true;
      Promise.resolve().then(() => action(JSON.parse(buffer.slice(0, buffer.indexOf('\n'))))).then(result => socket.end(JSON.stringify({ result }) + '\n'), e => socket.end(JSON.stringify({ error: e.message }) + '\n'));
    });
    socket.on('error', () => {}); socket.on('close', () => sockets.delete(socket));
  });
  server.on('error', () => {});
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(socketPath, () => { server.off('error', reject); resolve(); }); });
  fs.chmodSync(socketPath, 0o600);
  try { await mcp.connect(transport); }
  catch (e) { await new Promise(resolve => server.close(resolve)); throw e; }
  return { mcp, snapshot, async close() {
    if (stopping) return; stopping = true;
    for (const s of sockets) s.destroy();
    await new Promise(resolve => server.close(resolve));
    await mcp.close();
  } };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  startChannelFixture({ directory: process.env.PULSE_PROBE_DIRECTORY, sessionId: process.env.PULSE_PROBE_CLAUDE_SESSION }).then(f => {
    for (const sig of ['SIGINT', 'SIGTERM']) process.once(sig, () => f.close().then(() => process.exit(0)));
    process.stdin.once('end', () => f.close().then(() => process.exit(0)));
  }).catch(e => { process.stderr.write(e.message + '\n'); process.exitCode = 1; });
}

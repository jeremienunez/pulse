#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import { randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

// Owned native app-server transport shared by production and feasibility probes.
export class OwnedCodexClient {
  constructor(socket) {
    this.socket = socket; this.nextId = 0; this.pending = new Map(); this.events = [];
    this.listeners = new Set(); this.requests = [];
    socket.addEventListener('message', event => {
      let frame;
      try { frame = JSON.parse(event.data); } catch { return; }
      if (Object.hasOwn(frame, 'id') && !frame.method) {
        const p = this.pending.get(frame.id);
        if (p) { this.pending.delete(frame.id); clearTimeout(p.timer); frame.error ? p.reject(Object.assign(new Error(frame.error.message), { rpcError: frame.error })) : p.resolve(frame.result); }
        return;
      }
      if (frame.method && Object.hasOwn(frame, 'id')) {
        // Never synthesize tool approvals. Keep requests visible to the owner.
        this.requests.push(frame); return;
      }
      if (frame.method) {
        if (this.events.length >= 3000) this.events.shift();
        this.events.push(frame); for (const listener of this.listeners) listener(frame);
      }
    });
    socket.addEventListener('close', () => {
      for (const p of this.pending.values()) { clearTimeout(p.timer); p.reject(new Error('Native connection lost; effect may be unknown, do not replay')); }
      this.pending.clear();
    });
    socket.addEventListener('error', () => {});
  }
  static async connect({ url, tokenFile }) {
    const u = new URL(url);
    if (u.protocol !== 'ws:' || u.hostname !== '127.0.0.1' || u.username || u.password) throw new Error('Only the owned loopback endpoint is admitted');
    const st = fs.lstatSync(tokenFile);
    if (!st.isFile() || st.isSymbolicLink() || st.uid !== process.getuid() || (st.mode & 0o077)) throw new Error('Private owner token file required');
    // Node 24.15 supports headers in its native WebSocketInit options.
    const socket = new WebSocket(url, { headers: { Authorization: 'Bearer ' + fs.readFileSync(tokenFile, 'utf8').trim() } });
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => { socket.close(); reject(new Error('Native endpoint connection timed out')); }, 5000);
      socket.addEventListener('open', () => { clearTimeout(timer); resolve(); }, { once: true });
      socket.addEventListener('error', () => { clearTimeout(timer); reject(new Error('Native endpoint connection rejected')); }, { once: true });
    });
    const client = new OwnedCodexClient(socket);
    try {
      client.initialized = await client.rpc('initialize', { clientInfo: { name: 'pulse_messaging', title: 'Pulse messaging native owner', version: '0.1.0' }, capabilities: { experimentalApi: true } });
      socket.send(JSON.stringify({ method: 'initialized', params: {} }));
      return client;
    } catch (e) { socket.close(); throw e; }
  }
  rpc(method, params, timeoutMs = 10000, onSent = null) {
    if (!['initialize', 'thread/loaded/list', 'thread/read', 'turn/start', 'turn/steer'].includes(method)) return Promise.reject(new Error('Method outside the N01 fixture scope'));
    if (this.socket.readyState !== WebSocket.OPEN) return Promise.reject(new Error('Native endpoint closed before emission'));
    const id = 'pulse-probe-' + (++this.nextId);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error('Native RPC receipt missing; effect unknown, do not replay')); }, timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      try { this.socket.send(JSON.stringify({ id, method, params })); onSent?.(id); }
      catch (e) { clearTimeout(timer); this.pending.delete(id); reject(e); }
    });
  }
  async sendToExistingThread({ threadId, text, deadlineMs = 80000 }) {
    if (typeof threadId !== 'string' || typeof text !== 'string' || text.length > 6000 || !text.trim()) throw new Error('Invalid native message');
    const before = await this.rpc('thread/read', { threadId, includeTurns: true });
    if (before.thread?.id !== threadId || !before.thread.turns?.some(t => t.status === 'completed')) throw new Error('A real prior completed thread turn is required');
    const started = await this.rpc('turn/start', { threadId, input: [{ type: 'text', text, text_elements: [] }] });
    const turnId = started.turn?.id;
    if (!turnId) throw new Error('Missing native turn identity after possible emission');
    const deadline = Date.now() + deadlineMs;
    while (Date.now() < deadline) {
      // A second native client may not receive the TUI's event subscription.
      // Read the same native turn; polling never starts or resumes a model turn.
      const after = await this.rpc('thread/read', { threadId, includeTurns: true });
      const turn = after.thread?.turns?.find(t => t.id === turnId);
      if (turn && turn.status !== 'inProgress') {
        if (turn.status !== 'completed') throw new Error('Native turn did not complete successfully');
        const response = turn?.items?.filter(i => i.type === 'agentMessage').map(i => i.text).join('\n').trim();
        if (!response || after.thread.id !== before.thread.id) throw new Error('No attributed reply in the original thread');
        return { threadId, turnId, response, priorTurnCount: before.thread.turns.length, source: 'actual app-server thread/turn identifiers and readback', receivedByNativeThread: true };
      }
      await delay(320 + Math.floor(Math.random() * 230));
    }
    throw new Error('Native reply unknown; no new prompt or thread was created');
  }
  close() { this.socket.close(); }
}

export async function startOwnedEndpoint({ directory, binary, overrides = [] }) {
  const st = fs.lstatSync(directory);
  if (!st.isDirectory() || st.isSymbolicLink() || st.uid !== process.getuid() || (st.mode & 0o077)) throw new Error('Private owned directory required');
  const tokenFile = path.join(directory, 'codex-capability');
  fs.writeFileSync(tokenFile, randomBytes(32).toString('hex') + '\n', { mode: 0o600, flag: 'wx' });
  const reservation = net.createServer();
  await new Promise(resolve => reservation.listen(0, '127.0.0.1', resolve));
  const port = reservation.address().port;
  await new Promise(resolve => reservation.close(resolve));
  const url = `ws://127.0.0.1:${port}`;
  const args = ['app-server', '--listen', url, '--ws-auth', 'capability-token', '--ws-token-file', tokenFile, ...overrides.flatMap(value => ['-c', value])];
  const child = spawn(binary, args, { cwd: directory, stdio: ['ignore', 'pipe', 'pipe'] });
  let stderr = ''; child.stderr.on('data', d => { if (stderr.length < 20000) stderr += d; }); child.stdout.resume();
  let exit = null; child.once('exit', (code, signal) => { exit = { code, signal }; });
  child.once('error', error => { exit = { code: error.code, signal: null }; });
  let client;
  try {
    const deadline = Date.now() + 15000;
    while (Date.now() < deadline) {
      if (exit) throw new Error('Owned app-server exited before readiness: ' + JSON.stringify(exit));
      try { client = await OwnedCodexClient.connect({ url, tokenFile }); break; } catch { await delay(160 + Math.floor(Math.random() * 180)); }
    }
    if (!client) throw new Error('Owned app-server did not become ready');
    client.close();
    return { child, url, tokenFile, stderr: () => stderr, async close() {
      if (!exit) child.kill('SIGTERM');
      const deadline = Date.now() + 4000; while (!exit && Date.now() < deadline) await delay(50);
      if (!exit) { child.kill('SIGKILL'); await new Promise(resolve => child.once('exit', resolve)); }
    } };
  } catch (e) {
    if (!exit) child.kill('SIGTERM');
    const deadline = Date.now() + 4000; while (!exit && Date.now() < deadline) await delay(50);
    if (!exit) { child.kill('SIGKILL'); await new Promise(resolve => child.once('exit', resolve)); }
    fs.writeFileSync(path.join(directory, 'startup-stderr.txt'), stderr, { mode: 0o600, flag: 'wx' });
    fs.unlinkSync(tokenFile);
    throw e;
  }
}


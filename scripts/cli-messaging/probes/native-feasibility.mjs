#!/usr/bin/env node
import net from 'node:net';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync, spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { setTimeout as delay } from 'node:timers/promises';
import { OwnedCodexClient } from './codex-owner-launcher.mjs';

export function channelAction(socketPath, request, timeoutMs = 5000) {
  const st = fs.lstatSync(socketPath);
  if (!st.isSocket() || st.uid !== process.getuid() || (st.mode & 0o077)) throw new Error('Owned private probe socket required');
  return new Promise((resolve, reject) => {
    const socket = net.createConnection(socketPath); let buffer = '', settled = false;
    const timer = setTimeout(() => socket.destroy(new Error('Operator response unknown; do not replay send')), timeoutMs);
    socket.setEncoding('utf8');
    socket.once('connect', () => socket.write(JSON.stringify(request) + '\n'));
    socket.on('data', data => {
      buffer += data;
      if (Buffer.byteLength(buffer) > 131072) return socket.destroy(new Error('Probe response too large'));
      if (buffer.includes('\n')) {
        try { const msg = JSON.parse(buffer.slice(0, buffer.indexOf('\n'))); settled = true; clearTimeout(timer); socket.destroy(); msg.error ? reject(new Error(msg.error)) : resolve(msg.result); }
        catch (e) { socket.destroy(e); }
      }
    });
    socket.once('error', e => { clearTimeout(timer); reject(e); });
    socket.once('close', () => { clearTimeout(timer); if (!settled) reject(new Error('Operator connection closed without receipt; do not replay send')); });
  });
}

export async function runCrossFixture({ directory, reportFile }) {
  const socket = path.join(directory, 'channel.sock');
  const sid = JSON.parse(fs.readFileSync(path.join(directory, 'claude-cross-session.json'), 'utf8')).sessionId;
  const target = JSON.parse(fs.readFileSync(path.join(directory, 'codex-binding.json'), 'utf8'));
  const client = await OwnedCodexClient.connect(target);
  let before;
  try { before = await client.rpc('thread/read', { threadId: target.threadId, includeTurns: true }); }
  finally { client.close(); }
  const pids = execFileSync('ps', ['-eo', 'pid=,args='], { encoding: 'utf8' }).split('\n')
    .filter(s => s.includes('--remote ' + target.url + ' ') && s.includes('resume ' + target.threadId))
    .map(s => Number(s.trim().split(/\s+/)[0]));
  if (pids.length !== 1 || before.thread?.id !== target.threadId) throw new Error('Expected the selected existing thread in one live native TUI');
  let status;
  const deadline = Date.now() + 18000;
  while (Date.now() < deadline) {
    if (fs.existsSync(socket)) { try { status = await channelAction(socket, { action: 'status' }); if (status.mcpInitialized) break; } catch {} }
    await delay(200 + Math.floor(Math.random() * 140));
  }
  if (!status?.mcpInitialized || status.binding.sessionId !== sid) throw new Error('Native Claude MCP is not bound; no message emitted');
  const report = {
    status: 'emission_prepared', scope: 'N01 fixture, not final product or the current user VS Code chat',
    claude: status.binding, claudeClient: status.client, codexThreadId: target.threadId, codexNativeTuiPid: pids[0],
    priorCompletedTurnId: before.thread.turns.find(t => t.status === 'completed')?.id,
    sourceOrigin: 'Claude-spawned MCP server binding', responseOrigin: 'actual native app-server threadId/turnId readback',
    eventCount: 1, hiddenForkOrReplay: false,
    explicitResume: 'The exact fixture thread was reopened with native TUI resume after its bounded startup capture; no seed prompt replay',
  };
  if (!report.priorCompletedTurnId) throw new Error('Prior completed conversation turn required');
  // An existing attempt file blocks rerunning this driver, including after a crash.
  fs.writeFileSync(reportFile, JSON.stringify(report, null, 2) + '\n', { mode: 0o600, flag: 'wx' });
  try {
    await channelAction(socket, { action: 'send', id: 'aller-retour-local', text: 'Essai de messagerie locale. Utilise une seule fois pulse_probe_send_to_codex avec messageId « message-vers-codex » et ce texte : « Réponds exactement : salut Claude depuis Codex. N’utilise aucun outil. » Quand tu reçois sa réponse, appelle pulse_probe_reply avec replyTo « aller-retour-local » et copie la réponse de Codex dans text. Aucun autre outil ni fichier.' });
    process.stdout.write('One channel event emitted; waiting for native Codex reply and Claude acknowledgement.\n');
    const replyDeadline = Date.now() + 105000;
    while (Date.now() < replyDeadline) {
      status = await channelAction(socket, { action: 'status' });
      if (status.replies.some(r => r.replyTo === 'aller-retour-local') || status.forwards.some(f => f.state === 'blocked_unknown')) break;
      await delay(260 + Math.floor(Math.random() * 230));
    }
    const forward = status.forwards.find(f => f.messageId === 'message-vers-codex');
    const ack = status.replies.find(r => r.replyTo === 'aller-retour-local');
    const complete = forward?.state === 'native_replied' && forward.reply.threadId === target.threadId && forward.reply.response.includes('salut Claude depuis Codex') && ack?.text.includes('salut Claude depuis Codex');
    Object.assign(report, { status: complete ? 'roundtrip_observed' : 'blocked_unknown', forwards: status.forwards, finalClaudeReplies: status.replies });
  } catch (e) { Object.assign(report, { status: 'blocked_unknown', error: e.message, lastObservedState: status }); }
  finally {
    fs.writeFileSync(reportFile, JSON.stringify(report, null, 2) + '\n');
    const cmd = fs.readFileSync('/proc/' + status.binding.parentPid + '/cmdline', 'utf8');
    if (cmd.includes(sid)) process.kill(status.binding.parentPid, 'SIGTERM');
  }
  return report;
}

export async function runArgonFixture({ directory, reportFile, binary = '/home/jerem/.local/bin/agy' }) {
  const st = fs.lstatSync(directory);
  if (!st.isDirectory() || st.isSymbolicLink() || st.uid !== process.getuid() || (st.mode & 0o077)) throw new Error('Private owned fixture directory required');
  const report = { status: 'prepared', scope: 'N01 controlled Antigravity stream; not attachment to an arbitrary active TUI', requestedModel: 'gemini-4-argon-medium', results: [], promptsEmitted: 0, initEvents: 0, stepTypes: {} };
  fs.writeFileSync(reportFile, JSON.stringify(report, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
  const args = ['--input-format', 'stream-json', '--output-format', 'stream-json', '--model', report.requestedModel, '--mode', 'plan'];
  const child = spawn(binary, args, { cwd: directory, stdio: ['pipe', 'pipe', 'pipe'] });
  report.nativePid = child.pid;
  let pending = null, exit = null, invalid = null, outputBytes = 0;
  const stopPending = error => { if (pending) { clearTimeout(pending.timer); pending.reject(error); pending = null; } };
  child.once('error', error => { exit = { code: null, signal: null, error: error.code }; invalid = 'Native process failed: ' + error.code; stopPending(new Error(invalid)); });
  child.once('exit', (code, signal) => { exit = { code, signal }; stopPending(new Error('Native process ended before a terminal result')); });
  child.stdin.on('error', () => stopPending(new Error('Native input closed; do not replay')));
  let stderrBytes = 0; child.stderr.on('data', data => { stderrBytes += data.length; });
  const lines = createInterface({ input: child.stdout });
  lines.on('line', line => {
    outputBytes += Buffer.byteLength(line);
    if (!line.trim()) return;
    if (outputBytes > 500000) { invalid = 'Native output budget exceeded'; stopPending(new Error(invalid)); return; }
    let event;
    try { event = JSON.parse(line); } catch { invalid = 'Invalid native JSON stream'; stopPending(new Error(invalid)); return; }
    if (event.event === 'init') { report.initEvents++; report.conversationId = event.conversation_id; report.nativeModel = event.init?.model ?? null; }
    if (event.event === 'step_update' && typeof event.step_update?.step_type === 'string') {
      const type = event.step_update.step_type;
      if (Object.keys(report.stepTypes).length < 30 || report.stepTypes[type]) report.stepTypes[type] = (report.stepTypes[type] ?? 0) + 1;
    }
    if (event.event === 'result') {
      if (!pending) { invalid = 'Unsolicited native result'; return; }
      const p = pending; pending = null; clearTimeout(p.timer); p.resolve(event.result);
    }
  });
  const ask = text => new Promise((resolve, reject) => {
    if (pending || invalid || exit) return reject(new Error(invalid ?? 'Native stream is unavailable'));
    const timer = setTimeout(() => { pending = null; reject(new Error('Native result unknown after emission; do not replay')); }, 90000);
    pending = { resolve, reject, timer }; report.promptsEmitted++;
    child.stdin.write(JSON.stringify({ event: 'user', message: { content: text } }) + '\n');
  });
  const cancel = () => { invalid = 'Owned scenario cancelled'; stopPending(new Error(invalid)); };
  process.once('SIGTERM', cancel); process.once('SIGINT', cancel);
  try {
    for (const text of ['Pour ce bref essai de dialogue, réponds uniquement : pomme. N’utilise aucun outil.', 'Quel mot t’ai-je demandé de répondre juste avant ? Réponds avec ce mot uniquement, sans outil.']) {
      const native = await ask(text);
      const result = { conversationId: native?.conversation_id, status: native?.status, response: native?.response, numTurns: native?.num_turns, deniedActions: Array.isArray(native?.denied_actions) ? native.denied_actions.map(a => a.action) : [] };
      report.results.push(result);
      if (report.initEvents !== 1 || typeof report.conversationId !== 'string' || !report.conversationId || native?.status !== 'SUCCESS' || typeof native.response !== 'string' || !/^pomme[.!]?$/iu.test(native.response.trim()) || result.deniedActions.length || result.conversationId !== report.conversationId || result.numTurns !== report.results.length) throw new Error('Native terminal result did not prove the expected ordered same-session dialogue');
      process.stdout.write('Observed native result ' + report.results.length + ' in the same controlled session.\n');
    }
    child.stdin.end();
    const deadline = Date.now() + 10000; while (!exit && Date.now() < deadline) await delay(80);
    if (!exit || exit.code !== 0 || report.initEvents !== 1 || invalid) throw new Error(invalid ?? 'Native process did not close cleanly');
    report.status = 'two_ordered_turns_observed';
  } catch (e) { report.status = 'blocked_unknown'; report.error = e.message; }
  finally {
    if (!exit) child.kill('SIGTERM');
    const deadline = Date.now() + 4000; while (!exit && Date.now() < deadline) await delay(50);
    if (!exit) { child.kill('SIGKILL'); await new Promise(resolve => child.once('exit', resolve)); }
    process.off('SIGTERM', cancel); process.off('SIGINT', cancel); lines.close();
    Object.assign(report, { exit, stderrBytes, outputBytes, automaticReplay: false, sourceBinding: 'owned process PID plus native init/result conversation_id, no sender argument' });
    fs.writeFileSync(reportFile, JSON.stringify(report, null, 2) + '\n');
  }
  return report;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [, , socketPath, action, id, text] = process.argv;
  Promise.resolve().then(() => socketPath === 'cross' ? runCrossFixture({ directory: action, reportFile: id }) : socketPath === 'argon' ? runArgonFixture({ directory: action, reportFile: id }) : channelAction(socketPath, { action, id, text })).then(r => { process.stdout.write(JSON.stringify(r) + '\n'); if (r.status === 'blocked_unknown') process.exitCode = 2; }).catch(e => { process.stderr.write(e.message + '\n'); process.exitCode = 1; });
}

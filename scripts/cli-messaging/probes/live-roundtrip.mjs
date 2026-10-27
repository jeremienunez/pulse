#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';

export async function buildVerifiedRuntime({ sourceRoot, toolchain, outdir }) {
  const require = createRequire(path.join(toolchain, 'package.json'));
  fs.mkdirSync(outdir, { recursive: true, mode: 0o700 });
  const outfile = path.join(outdir, 'cli-messaging-runtime.mjs');
  await require('esbuild').build({ entryPoints: [path.join(sourceRoot, 'scripts/cli-messaging/entry.mjs')], outfile, bundle: true, platform: 'node', format: 'esm', target: 'node24', nodePaths: [path.join(toolchain, 'node_modules')], banner: { js: 'import {createRequire as __pulseRequire} from "node:module";const require=__pulseRequire(import.meta.url);' }, plugins: [{ name: 'separate-operator-setup', setup(build) { build.onResolve({ filter: /^\.\/setup\.mjs$/ }, () => ({ path: './cli-messaging/setup.mjs', external: true })); } }] });
  return { outfile, sha256: createHash('sha256').update(fs.readFileSync(outfile)).digest('hex') };
}

export function roundtripComplete(messages, attempts) {
  const originals = messages.filter(m => m.sender_alias === 'claude' && ['essai-code', 'essai-argon'].includes(m.request_id));
  const replies = messages.filter(m => m.recipient_alias === 'claude' && originals.some(o => o.id === m.reply_to));
  const relevant = [...originals, ...replies];
  return originals.length === 2 && replies.length >= 2 && relevant.every(m => m.receipt_stage === 'consumed' && attempts.some(a => a.message_id === m.id) && attempts.filter(a => a.message_id === m.id).every(a => a.settled));
}

export async function liveRoundtrip({ runtimeFile, reportFile, captureDirectory, reaPackage }) {
  if (fs.existsSync(reportFile)) throw new Error('An existing live attempt must be reconciled; this driver never replays it.');
  const require = createRequire(path.join(reaPackage, 'package.json')), pty = require('@lydell/node-pty');
  const { Terminal } = require('@xterm/headless');
  const runtime = await import(pathToFileURL(runtimeFile).href);
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pulse-live-')); fs.chmodSync(root, 0o700);
  const directory = path.join(root, 'state'), workspace = path.join(root, 'workspace'); fs.mkdirSync(workspace, { mode: 0o700 });
  fs.mkdirSync(captureDirectory, { recursive: true, mode: 0o700 });
  const owner = await runtime.serveOwner({ directory, factories: runtime.NATIVE_FACTORIES });
  const children = [], report = { terminalActions: [], status: 'prepared', root, runtimeFile, runtimeSha256: createHash('sha256').update(fs.readFileSync(runtimeFile)).digest('hex'), operatorPromptEmitted: false, plannedNativeInputsMaximum: 8, currentUserChatUsed: false };
  fs.writeFileSync(reportFile, JSON.stringify(report, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
  function launch(family, alias, delivery) {
    const terminal = pty.spawn(process.execPath, [runtimeFile, 'launch', family, '--state', directory, '--alias', alias, '--workspace', workspace, '--delivery', delivery, '--allow', ['claude', 'codex', 'argon'].filter(a => a !== alias).join(',')], { name: 'xterm-256color', cols: 120, rows: 36, cwd: workspace, env: { ...process.env, TERM: 'xterm-256color' } });
    const child = { family, alias, terminal, screen: new Terminal({ cols: 120, rows: 36, scrollback: 120, allowProposedApi: true }), startedAt: Date.now(), raw: '', trust: false, trustSelected: false, development: false, exited: false };
    children.push(child);
    // Real terminal replies must reach the native startup handshake before keys.
    child.screen.onData(reply => { if (!child.exited) terminal.write(reply); });
    function key(action, data) { report.terminalActions.push({ alias, action, at: new Date().toISOString() }); fs.writeFileSync(reportFile, JSON.stringify(report, null, 2) + '\n'); terminal.write(data); process.stdout.write(action + ' for owned ' + alias + '.\n'); }
    terminal.onExit(event => { child.exited = true; child.exit = event; });
    terminal.onData(data => {
      fs.appendFileSync(path.join(captureDirectory, child.alias + '.terminal.live.txt'), data, { mode: 0o600 });
      child.raw += data; if (child.raw.length > 200000) child.raw = child.raw.slice(-200000);
      child.screen.write(data, drive);
    });
    // Native startup controls were proved with REA at 3s, independently of model requests.
    // Rendering the dialog alone precedes input readiness; do not inject during that handshake.
    const startupControl = setInterval(drive, 150); startupControl.unref();
    terminal.onExit(() => { clearInterval(startupControl); child.screen.dispose(); });
    function drive() {
      if (child.exited || Date.now() - child.startedAt < 3000) return;
      const buffer = child.screen.buffer.active;
      const text = Array.from({ length: child.screen.rows }, (_, i) => buffer.getLine(buffer.viewportY + i)?.translateToString(true) ?? '').join('\n');
      if (!child.trust && family === 'claude' && text.includes('Yes, I trust this folder') && text.includes('No, exit')) {
        if (/❯\s+Yes, I trust this folder/u.test(text)) { child.trust = true; key('Confirm workspace trust', '\r'); }
        else if (!child.trustSelected) { child.trustSelected = true; key('Select trusted workspace', '\x1b[B'); }
      }
      if (!child.trust && family === 'codex' && text.includes('Trust and continue')) { child.trust = true; key('Confirm workspace trust', '\r'); }
      if (!child.development && family === 'claude' && text.includes('I am using this for local development')) { child.development = true; key('Confirm local development channel', '\r'); }
    }
    return child;
  }
  let success = false, aborted = false;
  const abort = () => { aborted = true; }; process.once('SIGTERM', abort); process.once('SIGINT', abort);
  try {
    const claude = launch('claude', 'claude', 'notify'); launch('codex', 'codex', 'wake'); launch('antigravity', 'argon', 'wake');
    let deadline = Date.now() + 180000;
    while (Date.now() < deadline) {
      if (aborted) throw new Error('Owned live test was cancelled; no submission is replayed.');
      const sessions = ['claude', 'codex', 'argon'].map(alias => owner.store.resolve(alias));
      const ready = sessions.every(Boolean) && sessions.every(s => owner.broker.adapters.get(s.id)?.adapter.isConnected()) && owner.store.session(sessions[0].id).capabilities.notify === 'supported';
      if (ready) break;
      if (children.some(c => c.exited)) throw new Error('A native launcher ended before all verified bindings were ready.');
      await delay(200 + Math.floor(Math.random() * 180));
    }
    const slots = ['claude', 'codex', 'argon'].map(alias => owner.store.resolve(alias));
    if (!slots.every(Boolean) || owner.store.session(slots[0].id).capabilities.notify !== 'supported') throw new Error('Native bindings were not ready; no operator message was submitted.');
    report.nativeModelHints = slots.filter(s => s.alias === 'argon').map(s => ({ alias: s.alias, model: owner.broker.adapters.get(s.id)?.adapter.native?.model ?? null }));
    report.nativeSessions = slots.map(s => ({ alias: s.alias, bindingId: s.id, generation: s.generation, native: owner.store.nativeContext(s.id) }));
    report.operatorPromptEmitted = true; report.status = 'operator_emission_possible'; fs.writeFileSync(reportFile, JSON.stringify(report, null, 2) + '\n');
    const operatorPrompt = 'Essai local de la messagerie Pulse. Envoie une seule fois à codex avec requestId « essai-code » le texte « Réponds simplement bonjour depuis Codex par Pulse, puis accuse consumed. Aucun fichier ni autre action. ». Envoie aussi une seule fois à argon avec requestId « essai-argon » le texte « Réponds simplement bonjour depuis Argon par Pulse, puis accuse consumed. Aucun fichier ni autre action. ». Utilise pulse_message_send. Les réponses reçues doivent seulement être accusées consumed, sans message de courtoisie en retour. Ne relance aucun envoi dont le résultat serait inconnu.';
    claude.terminal.write('\x1b[200~' + operatorPrompt + '\x1b[201~');
    const pasteDeadline = Date.now() + 10000;
    while (Date.now() < pasteDeadline) {
      const buffer = claude.screen.buffer.active;
      const visible = Array.from({ length: claude.screen.rows }, (_, i) => buffer.getLine(buffer.viewportY + i)?.translateToString(true) ?? '').join('\n');
      if (visible.includes('serait inconnu.')) break;
      await delay(80);
    }
    claude.terminal.write('\r');
    process.stdout.write('One operator prompt submitted to actual Claude; two native recipients and correlated return receipts expected.\n');
    deadline = Date.now() + 420000;
    while (Date.now() < deadline) {
      if (aborted) throw new Error('Owned live test was cancelled after possible submission; do not replay.');
      const messages = owner.store.db.prepare('SELECT id,sender_alias,recipient_alias,request_id,reply_to,receipt_stage,delivery_state FROM messages ORDER BY sequence').all();
      if (roundtripComplete(messages, owner.store.db.prepare('SELECT message_id,settled FROM attempts').all())) { success = true; break; }
      const denied = owner.store.db.prepare("SELECT proof_json FROM attempts WHERE settled=1 AND state='native_done'").all().some(a => JSON.parse(a.proof_json).kind === 'native-result-denied');
      if (denied) throw new Error('A native client returned a terminal refusal; no message is replayed.');
      if (owner.store.listUncertain().length || children.some(c => c.exited)) throw new Error('An actual native result is unconfirmed; the test stopped without replay.');
      await delay(300 + Math.floor(Math.random() * 250));
    }
    report.status = success ? 'native_roundtrip_observed' : 'blocked_unknown';
    report.messages = owner.store.db.prepare('SELECT id,sender_id,sender_alias,sender_generation,recipient_id,recipient_alias,recipient_generation,request_id,text,reply_to,receipt_stage,delivery_state FROM messages ORDER BY sequence').all();
    report.uncertain = owner.store.listUncertain();
    if (!success) report.error = 'Expected native return declarations were not all observed before the phase deadline.';
  } catch (error) { report.status = 'blocked_unknown'; report.error = error.message; report.uncertain = owner.store.listUncertain(); fs.writeFileSync(reportFile, JSON.stringify(report, null, 2) + '\n'); }
  finally {
    process.off('SIGTERM', abort); process.off('SIGINT', abort);
    report.messages = owner.store.db.prepare('SELECT id,sender_id,sender_alias,sender_generation,recipient_id,recipient_alias,recipient_generation,request_id,text,reply_to,receipt_stage,delivery_state FROM messages ORDER BY sequence').all();
    report.attempts = owner.store.db.prepare('SELECT id,message_id,state,settled,proof_json FROM attempts').all().map(a => ({ ...a, evidence: JSON.parse(a.proof_json), proof_json: undefined }));
    for (const child of children) { fs.writeFileSync(path.join(captureDirectory, child.alias + '.terminal.txt'), child.raw, { mode: 0o600 }); if (!child.exited) child.terminal.kill('SIGTERM'); }
    const deadline = Date.now() + 10000; while (children.some(c => !c.exited) && Date.now() < deadline) await delay(100);
    for (const child of children) if (!child.exited) child.terminal.kill('SIGKILL');
    const killDeadline = Date.now() + 3000; while (children.some(c => !c.exited) && Date.now() < killDeadline) await delay(50);
    await owner.close();
    // Retain a small private recovery store when a live native receipt is unresolved.
    const unresolved = report.attempts.some(a => !a.settled);
    if (unresolved) { const recovery = path.join(captureDirectory, 'recovery'); fs.mkdirSync(recovery, { mode: 0o700 }); for (const name of ['messaging.sqlite', 'format']) fs.copyFileSync(path.join(directory, name), path.join(recovery, name)); report.recoveryDirectory = recovery; }
    report.launchers = children.map(c => ({ family: c.family, alias: c.alias, exited: c.exited, exit: c.exit }));
    fs.writeFileSync(reportFile, JSON.stringify(report, null, 2) + '\n');
    if (children.every(c => c.exited)) { fs.rmSync(root, { recursive: true, force: true }); report.ownedTemporaryDirectoryRemoved = true; fs.writeFileSync(reportFile, JSON.stringify(report, null, 2) + '\n'); }
  }
  return report;
}

if (process.argv[2] === 'run') {
  liveRoundtrip({ runtimeFile: process.argv[3], reportFile: process.argv[4], captureDirectory: process.argv[5], reaPackage: process.argv[6] }).then(result => { process.stdout.write(JSON.stringify({ status: result.status, error: result.error ?? null, messageCount: result.messages?.length ?? 0 }) + '\n'); if (result.status !== 'native_roundtrip_observed') process.exitCode = 2; }).catch(error => { process.stderr.write(error.message + '\n'); process.exitCode = 1; });
}

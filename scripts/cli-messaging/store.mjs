import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { LIMITS, RECEIPT_RANK, MessagingError, fail, hash, newId, newCredential, nativeKey, isObservedContext, label, closed, sendInput, readInput, ackInput, publicEvidence, policyInput } from './contracts.mjs';

const APPLICATION_ID = 0x50554c53;
function mergeEvidence(prior, next) {
  const before = publicEvidence(prior), after = publicEvidence(next);
  for (const key of ['nativeSessionId', 'nativeTurnId', 'nativeCallId']) {
    if (before[key] && after[key] && before[key] !== after[key]) fail('BAD_EVIDENCE', 'Native correlation identity cannot change within an attempt.');
  }
  return { ...before, ...after };
}
export function privateDirectory(directory) {
  if (!path.isAbsolute(directory)) fail('PRIVATE_PATH_REQUIRED', 'An absolute private state directory is required.');
  let current = path.parse(directory).root;
  for (const part of directory.slice(current.length).split(path.sep).filter(Boolean)) {
    current = path.join(current, part);
    if (['.pulse', '.codex', '.claude', '.gemini', 'compagnion', 'companion'].includes(part.toLowerCase()) || fs.existsSync(path.join(current, '.git'))) fail('PRIVATE_PATH_REQUIRED', 'Messaging state must stay outside source repositories, ICM and native client state.');
    if (fs.existsSync(current) || fs.lstatSync(path.dirname(current)).isSymbolicLink()) {
      const st = fs.lstatSync(current);
      if (st.isSymbolicLink() || !st.isDirectory() || ![0, process.getuid()].includes(st.uid)) fail('PRIVATE_PATH_REQUIRED', 'State paths must be owned directories without symlinks.');
    } else fs.mkdirSync(current, { mode: 0o700 });
  }
  const st = fs.lstatSync(directory);
  if (st.uid !== process.getuid() || (st.mode & 0o077)) fail('PRIVATE_PATH_REQUIRED', 'The state directory must be owned and private.');
  return directory;
}
export function privateFile(file) {
  if (!fs.existsSync(file)) { try { fs.lstatSync(file); } catch (e) { if (e.code === 'ENOENT') return; throw e; } }
  const st = fs.lstatSync(file);
  if (!st.isFile() || st.isSymbolicLink() || st.uid !== process.getuid() || (st.mode & 0o077)) fail('PRIVATE_PATH_REQUIRED', 'State files must be owned private regular files.');
}

export class MailboxStore {
  #actors = new WeakSet();
  constructor({ directory, maxQueuedPerTarget = LIMITS.queuedPerTarget, maxTextBytes = LIMITS.textBytes, busyTimeoutMs = 1000 }) {
    if (!Number.isInteger(maxQueuedPerTarget) || maxQueuedPerTarget < 1 || maxQueuedPerTarget > 4096 || !Number.isInteger(maxTextBytes) || maxTextBytes < 1 || maxTextBytes > 65536 || !Number.isInteger(busyTimeoutMs) || busyTimeoutMs < 1 || busyTimeoutMs > 5000) fail('BAD_INPUT', 'Invalid store limits.');
    this.directory = privateDirectory(directory); this.file = path.join(directory, 'messaging.sqlite');
    this.maxQueuedPerTarget = maxQueuedPerTarget; this.maxTextBytes = maxTextBytes; this.closed = false;
    for (const suffix of ['', '-wal', '-shm']) privateFile(this.file + suffix);
    const existed = fs.existsSync(this.file);
    const marker = path.join(directory, 'format'); privateFile(marker);
    if (fs.existsSync(marker)) {
      if (fs.readFileSync(marker, 'utf8') !== 'pulse-messaging/v1\n') fail('UNRECOGNIZED_STORE', 'The existing state directory is not a supported Pulse messaging store.');
    } else {
      if (existed) fail('UNRECOGNIZED_STORE', 'The existing database has no messaging ownership marker.');
      fs.writeFileSync(marker, 'pulse-messaging/v1\n', { mode: 0o600, flag: 'wx' });
    }
    try {
      this.db = new DatabaseSync(this.file, { enableForeignKeyConstraints: true, allowExtension: false });
      fs.chmodSync(this.file, 0o600);
      // One connection owns all reads/writes. OS file locks release on crash;
      // there is no stale PID lock or socket to delete to seize ownership.
      this.db.exec(`PRAGMA busy_timeout=${busyTimeoutMs}; PRAGMA locking_mode=EXCLUSIVE; PRAGMA foreign_keys=ON; PRAGMA trusted_schema=OFF;`);
      if (existed && (this.db.prepare('PRAGMA application_id').get().application_id !== APPLICATION_ID || this.db.prepare('PRAGMA user_version').get().user_version !== 1)) fail('UNRECOGNIZED_STORE', 'The existing database is not a supported Pulse messaging store.');
      this.db.exec('PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;');
      if (!existed) this.#initialize();
      if (this.db.prepare("SELECT value FROM metadata WHERE key='format'").get()?.value !== 'pulse-messaging/v1') fail('UNRECOGNIZED_STORE', 'The existing store format is not supported.');
      this.#recover();
    } catch (e) { this.db?.close(); this.closed = true; throw e; }
  }
  #initialize() {
    this.db.exec(`BEGIN IMMEDIATE;
      PRAGMA application_id=${APPLICATION_ID}; PRAGMA user_version=1;
      CREATE TABLE metadata(key TEXT PRIMARY KEY,value TEXT NOT NULL);
      INSERT INTO metadata VALUES('format','pulse-messaging/v1');
      CREATE TABLE sessions(id TEXT PRIMARY KEY,native_key TEXT NOT NULL UNIQUE,alias TEXT NOT NULL,family TEXT NOT NULL,native_id TEXT NOT NULL,generation INTEGER NOT NULL,active INTEGER NOT NULL,credential_digest TEXT NOT NULL UNIQUE,context_json TEXT NOT NULL,mode TEXT NOT NULL,allowed_json TEXT NOT NULL);
      CREATE TABLE aliases(alias TEXT PRIMARY KEY,session_id TEXT NOT NULL REFERENCES sessions(id));
      CREATE TABLE messages(sequence INTEGER PRIMARY KEY AUTOINCREMENT,id TEXT NOT NULL UNIQUE,sender_id TEXT NOT NULL REFERENCES sessions(id),sender_alias TEXT NOT NULL,sender_generation INTEGER NOT NULL,recipient_id TEXT NOT NULL REFERENCES sessions(id),recipient_alias TEXT NOT NULL,recipient_generation INTEGER NOT NULL,request_id TEXT NOT NULL,payload_digest TEXT NOT NULL,text TEXT NOT NULL,reply_to TEXT REFERENCES messages(id),receipt_stage TEXT NOT NULL,delivery_state TEXT NOT NULL,created_ms INTEGER NOT NULL,UNIQUE(sender_id,request_id));
      CREATE INDEX mailbox_inbox ON messages(recipient_id,sequence);
      CREATE INDEX pending_by_alias ON messages(recipient_alias,receipt_stage,delivery_state);
      CREATE INDEX pending_by_native ON messages(recipient_id,receipt_stage,delivery_state);
      CREATE TABLE attempts(id TEXT PRIMARY KEY,message_id TEXT NOT NULL REFERENCES messages(id),recipient_id TEXT NOT NULL REFERENCES sessions(id),recipient_alias TEXT NOT NULL,generation INTEGER NOT NULL,state TEXT NOT NULL,settled INTEGER NOT NULL,proof_json TEXT NOT NULL);
      CREATE UNIQUE INDEX one_native_attempt ON attempts(recipient_id) WHERE settled=0;
      CREATE UNIQUE INDEX one_target_attempt ON attempts(recipient_alias) WHERE settled=0;
      CREATE TABLE receipts(sequence INTEGER PRIMARY KEY AUTOINCREMENT,message_id TEXT NOT NULL REFERENCES messages(id),attempt_id TEXT REFERENCES attempts(id),stage TEXT NOT NULL,proof_json TEXT NOT NULL,created_ms INTEGER NOT NULL);
      CREATE TABLE native_replies(attempt_id TEXT PRIMARY KEY REFERENCES attempts(id),message_id TEXT NOT NULL REFERENCES messages(id),native_turn_id TEXT NOT NULL,text TEXT NOT NULL,state TEXT NOT NULL,error_code TEXT,reply_message_id TEXT REFERENCES messages(id));
      COMMIT;`);
  }
  transaction(fn) {
    if (this.closed) fail('STORE_CLOSED', 'Messaging store is closed.');
    this.db.exec('BEGIN IMMEDIATE');
    try { const value = fn(); this.db.exec('COMMIT'); return value; }
    catch (e) { try { this.db.exec('ROLLBACK'); } catch {} throw e; }
  }
  #receipt(messageId, stage, evidence = {}, attemptId = null) {
    this.db.prepare('INSERT INTO receipts(message_id,attempt_id,stage,proof_json,created_ms) VALUES(?,?,?,?,?)').run(messageId, attemptId, stage, JSON.stringify(publicEvidence(evidence)), Date.now());
    if (Object.hasOwn(RECEIPT_RANK, stage)) {
      const row = this.db.prepare('SELECT receipt_stage FROM messages WHERE id=?').get(messageId);
      if (RECEIPT_RANK[stage] > RECEIPT_RANK[row.receipt_stage]) this.db.prepare('UPDATE messages SET receipt_stage=? WHERE id=?').run(stage, messageId);
    }
  }
  #recover() {
    this.transaction(() => {
      for (const attempt of this.db.prepare("SELECT * FROM attempts WHERE settled=0 AND state<>'blocked_unknown'").all()) this.#unknown(attempt.id, { kind: 'owner-recovery', reason: 'A terminal native receipt was not committed before owner restart.' });
    });
  }
  enroll(alias, context, options = {}) {
    label(alias, 'session alias');
    if (!isObservedContext(context)) fail('NATIVE_PROOF_REQUIRED', 'A code-owned native observation is required before enrollment.');
    const policy = policyInput(options), credential = newCredential(), key = nativeKey(context);
    return this.transaction(() => {
      let row = this.db.prepare('SELECT * FROM sessions WHERE native_key=?').get(key);
      const previous = this.db.prepare('SELECT session_id FROM aliases WHERE alias=?').get(alias);
      if (previous && previous.session_id !== row?.id) {
        if (!policy.replace) fail('ALIAS_IN_USE', 'This alias is already bound to another native conversation.');
        this.db.prepare('UPDATE sessions SET active=0,generation=generation+1 WHERE id=?').run(previous.session_id);
      }
      if (row) {
        this.db.prepare('UPDATE sessions SET alias=?,generation=generation+1,active=1,credential_digest=?,context_json=?,mode=?,allowed_json=? WHERE id=?').run(alias, hash(credential), JSON.stringify(context), policy.deliveryMode, JSON.stringify(policy.allowedRecipients), row.id);
      } else {
        row = { id: newId() };
        this.db.prepare('INSERT INTO sessions VALUES(?,?,?,?,?,1,1,?,?,?,?)').run(row.id, key, alias, context.family, context.nativeId, hash(credential), JSON.stringify(context), policy.deliveryMode, JSON.stringify(policy.allowedRecipients));
      }
      this.db.prepare('INSERT INTO aliases VALUES(?,?) ON CONFLICT(alias) DO UPDATE SET session_id=excluded.session_id').run(alias, row.id);
      return { ...this.session(row.id), credential };
    });
  }
  #actor(row, evidence) {
    const actor = Object.freeze({ sessionId: row.id, generation: row.generation, family: row.family, nativeId: row.native_id, alias: row.alias, callEvidence: evidence ? Object.freeze(publicEvidence(evidence)) : null });
    this.#actors.add(actor); return actor;
  }
  authenticate(credential, callEvidence = null) {
    if (typeof credential !== 'string' || credential.length < 32 || credential.length > 256) fail('FORBIDDEN', 'The native binding credential is unavailable.');
    const row = this.db.prepare('SELECT * FROM sessions WHERE credential_digest=? AND active=1').get(hash(credential));
    if (!row) fail('FORBIDDEN', 'The native binding is not active.');
    return this.#actor(row, callEvidence);
  }
  nativeActor(sessionId, generation, context, evidence) {
    if (!isObservedContext(context)) fail('NATIVE_PROOF_REQUIRED', 'Native adapter context is required.');
    const row = this.db.prepare('SELECT * FROM sessions WHERE id=?').get(sessionId);
    const owner = row ? JSON.parse(row.context_json).owner : null;
    if (!row?.active || row.generation !== generation || row.native_key !== nativeKey(context) || owner.pid !== context.owner.pid || owner.startId !== context.owner.startId) fail('STALE_GENERATION', 'The native adapter binding changed.');
    return this.#actor(row, evidence);
  }
  refreshNativeContext(actor, context) {
    this.#current(actor); this.nativeActor(actor.sessionId, actor.generation, context);
    return this.transaction(() => { this.db.prepare('UPDATE sessions SET context_json=? WHERE id=?').run(JSON.stringify(context), actor.sessionId); return this.session(actor.sessionId); });
  }
  #current(actor) {
    if (!this.#actors.has(actor)) fail('FORBIDDEN', 'A native binding credential is required.');
    const row = this.db.prepare('SELECT * FROM sessions WHERE id=?').get(actor.sessionId);
    if (!row?.active || row.generation !== actor.generation) fail('STALE_GENERATION', 'The native session generation changed.');
    return row;
  }
  session(id) {
    const r = this.db.prepare('SELECT * FROM sessions WHERE id=?').get(id);
    if (!r) fail('NOT_FOUND', 'Unknown messaging session.');
    const c = JSON.parse(r.context_json);
    return { bindingId: r.id, alias: r.alias, family: r.family, generation: r.generation, active: !!r.active, deliveryMode: r.mode, capabilities: c.capabilities, evidence: c.evidence };
  }
  nativeContext(id) { return JSON.parse(this.db.prepare('SELECT context_json FROM sessions WHERE id=?').get(id).context_json); }
  resolve(alias) { return this.db.prepare('SELECT s.* FROM aliases a JOIN sessions s ON s.id=a.session_id WHERE a.alias=?').get(alias); }
  retire(id) { return this.transaction(() => this.db.prepare('UPDATE sessions SET active=0,generation=generation+1 WHERE id=?').run(id)); }
  #message(id) {
    const row = this.db.prepare('SELECT * FROM messages WHERE id=?').get(id);
    if (!row) fail('NOT_FOUND', 'Unknown message.');
    return row;
  }
  #public(row) {
    const blocked = this.db.prepare('SELECT id,state FROM attempts WHERE settled=0 AND (recipient_id=? OR recipient_alias=?) LIMIT 1').get(row.recipient_id, row.recipient_alias);
    const reply = this.db.prepare('SELECT state,error_code,reply_message_id FROM native_replies WHERE message_id=?').get(row.id);
    return { messageId: row.id, sequence: row.sequence, requestId: row.request_id, sender: row.sender_alias, recipient: row.recipient_alias, senderBindingId: row.sender_id, senderGeneration: row.sender_generation, recipientBindingId: row.recipient_id, recipientGeneration: row.recipient_generation, text: row.text, replyTo: row.reply_to, stored: true, receiptStage: row.receipt_stage, deliveryState: row.delivery_state, createdAt: new Date(row.created_ms).toISOString(), blockedBy: blocked ? { attemptId: blocked.id, state: blocked.state } : null, nativeReply: reply ? { state: reply.state, errorCode: reply.error_code, messageId: reply.reply_message_id } : null,
      attempts: this.db.prepare('SELECT id,state,settled,proof_json FROM attempts WHERE message_id=?').all(row.id).map(a => ({ attemptId: a.id, state: a.state, settled: !!a.settled, evidence: JSON.parse(a.proof_json) })),
      receipts: this.db.prepare('SELECT sequence,stage,proof_json FROM receipts WHERE message_id=? ORDER BY sequence DESC LIMIT 32').all(row.id).reverse().map(r => ({ sequence: r.sequence, stage: r.stage, evidence: JSON.parse(r.proof_json) })),
      receiptHistoryTruncated: this.db.prepare('SELECT count(*) AS n FROM receipts WHERE message_id=?').get(row.id).n > 32 };
  }
  message(id) { return this.#public(this.#message(id)); } // owner/internal API, never exposed as an unscoped model operation
  #record({ senderId, senderAlias, senderGeneration, recipientId, recipientAlias, recipientGeneration, requestId, text, replyTo, evidence = { kind: 'committed-message' } }) {
    const digest = hash(JSON.stringify({ requestId, recipient: recipientAlias, text, replyTo }));
    const existing = this.db.prepare('SELECT * FROM messages WHERE sender_id=? AND request_id=?').get(senderId, requestId);
    if (existing) { if (existing.payload_digest !== digest) fail('REQUEST_CONFLICT', 'This requestId was already used with different content.'); return this.#public(existing); }
    const queued = this.db.prepare("SELECT count(*) AS n FROM messages WHERE (recipient_id=? OR recipient_alias=?) AND receipt_stage IN('stored','transport_accepted','harness_ack') AND delivery_state NOT IN('operator_abandoned','operator_cancelled','unavailable')").get(recipientId, recipientAlias).n;
    if (queued >= this.maxQueuedPerTarget) fail('QUEUE_FULL', 'The recipient queue is full; this message was not stored.');
    const id = newId();
    this.db.prepare("INSERT INTO messages(id,sender_id,sender_alias,sender_generation,recipient_id,recipient_alias,recipient_generation,request_id,payload_digest,text,reply_to,receipt_stage,delivery_state,created_ms) VALUES(?,?,?,?,?,?,?,?,?,?,?,'stored','stored',?)").run(id, senderId, senderAlias, senderGeneration, recipientId, recipientAlias, recipientGeneration, requestId, digest, text, replyTo, Date.now());
    this.#receipt(id, 'stored', evidence); return this.message(id);
  }
  send(actor, value) {
    const sender = this.#current(actor), input = sendInput(value, this.maxTextBytes), digest = hash(JSON.stringify(input));
    return this.transaction(() => {
      const existing = this.db.prepare('SELECT * FROM messages WHERE sender_id=? AND request_id=?').get(sender.id, input.requestId);
      if (existing) { if (existing.payload_digest !== digest) fail('REQUEST_CONFLICT', 'This requestId was already used with different content.'); return this.#public(existing); }
      if (!JSON.parse(sender.allowed_json).includes(input.recipient)) fail('FORBIDDEN', 'This recipient is not allowed by the operator policy.');
      let recipient = this.resolve(input.recipient), generation = recipient?.generation;
      if (input.replyTo) {
        const original = this.#message(input.replyTo);
        if (original.recipient_id !== sender.id || original.recipient_generation !== sender.generation || original.sender_alias !== input.recipient) fail('FORBIDDEN', 'A reply must target the original sender from the original receiving session.');
        recipient = this.db.prepare('SELECT * FROM sessions WHERE id=?').get(original.sender_id); generation = original.sender_generation;
      } else if (!recipient?.active) fail('RECIPIENT_UNAVAILABLE', 'The recipient has no active native binding.');
      return this.#record({ senderId: sender.id, senderAlias: sender.alias, senderGeneration: sender.generation, recipientId: recipient.id, recipientAlias: input.recipient, recipientGeneration: generation, requestId: input.requestId, text: input.text, replyTo: input.replyTo });
    });
  }
  read(actor, value = {}) {
    const binding = this.#current(actor), input = readInput(value), field = input.direction === 'inbox' ? 'recipient_id' : 'sender_id';
    const rows = this.db.prepare(`SELECT * FROM messages WHERE ${field}=? AND sequence>? ORDER BY sequence LIMIT ?`).all(binding.id, input.cursor, input.limit);
    const items = []; let bytes = 0;
    for (const row of rows) {
      const message = this.#public(row), size = Buffer.byteLength(JSON.stringify(message));
      if (bytes + size > LIMITS.readBytes) { if (!items.length) fail('READ_LIMIT', 'This message needs an operator inspection because its diagnostic history exceeds the response limit.'); break; }
      items.push(message); bytes += size;
    }
    return { items, nextCursor: items.at(-1)?.sequence ?? input.cursor, byteLimited: items.length < rows.length };
  }
  capabilities(actor, input = {}) {
    const current = this.#current(actor); closed(input, ['recipient']);
    const allowed = [current.alias, ...JSON.parse(current.allowed_json)];
    if (input.recipient !== undefined && !allowed.includes(label(input.recipient))) fail('FORBIDDEN', 'This recipient is outside the binding policy.');
    return { sessions: [...new Set(input.recipient ? [input.recipient] : allowed)].map(alias => { const row = this.resolve(alias); return row ? this.session(row.id) : { alias, active: false, availability: 'unavailable' }; }) };
  }
  status(actor, input) {
    const binding = this.#current(actor); closed(input, ['messageId', 'requestId']);
    if ((input.messageId !== undefined) === (input.requestId !== undefined)) fail('BAD_INPUT', 'Provide exactly one messageId or requestId.');
    const row = input.messageId !== undefined ? this.#message(label(input.messageId)) : this.db.prepare('SELECT * FROM messages WHERE sender_id=? AND request_id=?').get(binding.id, label(input.requestId));
    if (!row) fail('NOT_FOUND', 'Unknown request.');
    if (row.sender_id !== binding.id && row.recipient_id !== binding.id) fail('FORBIDDEN', 'This message belongs to another mailbox.');
    return this.#public(row);
  }
  ack(actor, value) {
    const binding = this.#current(actor), input = ackInput(value);
    return this.transaction(() => {
      const row = this.#message(input.messageId);
      if (row.recipient_id !== binding.id) fail('FORBIDDEN', 'Only the bound recipient can acknowledge this message.');
      if (row.recipient_generation !== binding.generation) fail('STALE_GENERATION', 'This message targets an earlier native generation.');
      const e = actor.callEvidence;
      if (input.stage === 'consumed' && (!e || !['native_call', 'native_turn'].includes(e.kind) || !(e.nativeCallId || e.nativeTurnId) || (e.nativeSessionId && e.nativeSessionId !== binding.native_id))) fail('NATIVE_TURN_REQUIRED', 'Consumed needs a declaration from a native recipient invocation.');
      if (RECEIPT_RANK[input.stage] > RECEIPT_RANK[row.receipt_stage]) this.#receipt(row.id, input.stage, e ?? { kind: 'bound-recipient-declaration' });
      if (row.delivery_state === 'stored') this.db.prepare("UPDATE messages SET delivery_state='recipient_acknowledged' WHERE id=?").run(row.id);
      return this.message(row.id);
    });
  }
  readyMessages() { return this.db.prepare("SELECT id FROM messages WHERE delivery_state='stored' AND receipt_stage IN('stored','transport_accepted','harness_ack') ORDER BY sequence").all().map(r => this.message(r.id)); }
  prepareAttempt(messageId) {
    return this.transaction(() => {
      const m = this.#message(messageId);
      if (RECEIPT_RANK[m.receipt_stage] >= RECEIPT_RANK.received && m.delivery_state === 'recipient_acknowledged') return { prepared: false, reason: 'already_acknowledged' };
      const blocked = this.db.prepare('SELECT * FROM attempts WHERE settled=0 AND (recipient_id=? OR recipient_alias=?) LIMIT 1').get(m.recipient_id, m.recipient_alias);
      if (blocked) fail(blocked.state === 'blocked_unknown' ? 'TARGET_BLOCKED_UNKNOWN' : 'TARGET_BUSY', 'The target is waiting for a prior native delivery receipt.');
      if (m.delivery_state !== 'stored') fail('BAD_STATE', 'Only a stored, unattempted message can be emitted.');
      const binding = this.db.prepare('SELECT * FROM sessions WHERE id=?').get(m.recipient_id);
      if (!binding.active || binding.generation !== m.recipient_generation) { this.db.prepare("UPDATE messages SET delivery_state='blocked_generation' WHERE id=?").run(m.id); return { prepared: false, reason: 'stale_generation' }; }
      if (binding.mode === 'inbox-only') return { prepared: false, reason: 'inbox_only' };
      const id = newId();
      this.db.prepare("INSERT INTO attempts VALUES(?,?,?,?,?,'native_attempt_prepared',0,'{}')").run(id, m.id, m.recipient_id, m.recipient_alias, m.recipient_generation);
      this.db.prepare("UPDATE messages SET delivery_state='native_attempt_prepared' WHERE id=?").run(m.id);
      this.#receipt(m.id, 'native_attempt_prepared', { kind: 'committed-attempt-before-emission' }, id);
      return { prepared: true, attemptId: id, messageId: m.id, recipientId: m.recipient_id, generation: m.recipient_generation };
    });
  }
  beforeEmit(attemptId, evidence = {}) {
    return this.transaction(() => {
      const a = this.#attempt(attemptId), message = this.#message(a.message_id);
      if (a.settled || a.state !== 'native_attempt_prepared') fail('BAD_STATE', 'Native emission needs an un-emitted current attempt.');
      if (RECEIPT_RANK[message.receipt_stage] >= RECEIPT_RANK.received) return false;
      const proof = mergeEvidence(JSON.parse(a.proof_json), publicEvidence(evidence));
      this.db.prepare('UPDATE attempts SET proof_json=? WHERE id=?').run(JSON.stringify(proof), a.id);
      this.#receipt(a.message_id, 'native_attempt_prepared', proof, a.id);
      return true;
    });
  }
  #attempt(id, requireCurrent = true) {
    const a = this.db.prepare('SELECT * FROM attempts WHERE id=?').get(id);
    if (!a) fail('NOT_FOUND', 'Unknown native attempt.');
    if (requireCurrent) {
      const b = this.db.prepare('SELECT active,generation FROM sessions WHERE id=?').get(a.recipient_id);
      if (!b.active || b.generation !== a.generation) fail('STALE_GENERATION', 'The native delivery generation changed.');
    }
    return a;
  }
  progress(attemptId, stage, evidence = {}) {
    if (!['native_attempt_prepared', 'transport_accepted', 'harness_ack'].includes(stage)) fail('BAD_INPUT', 'Native progress does not declare recipient consumption.');
    const proof = publicEvidence(evidence);
    return this.transaction(() => {
      const a = this.#attempt(attemptId);
      if (a.settled || a.state === 'blocked_unknown') fail('BAD_STATE', 'An uncertain or terminal attempt needs explicit reconciliation.');
      const ranks = { native_attempt_prepared: 0, transport_accepted: 1, harness_ack: 2 };
      if (ranks[stage] < ranks[a.state]) return this.message(a.message_id);
      const merged = mergeEvidence(JSON.parse(a.proof_json), proof);
      this.db.prepare('UPDATE attempts SET state=?,proof_json=? WHERE id=?').run(stage, JSON.stringify(merged), a.id);
      this.db.prepare('UPDATE messages SET delivery_state=? WHERE id=?').run(stage, a.message_id);
      this.#receipt(a.message_id, stage, merged, a.id); return this.message(a.message_id);
    });
  }
  #unknown(attemptId, evidence) {
    const a = this.#attempt(attemptId, false);
    if (a.settled) return;
    const proof = mergeEvidence(JSON.parse(a.proof_json), evidence);
    this.db.prepare("UPDATE attempts SET state='blocked_unknown',proof_json=? WHERE id=?").run(JSON.stringify(proof), a.id);
    this.db.prepare("UPDATE messages SET delivery_state='blocked_unknown' WHERE id=?").run(a.message_id);
    this.#receipt(a.message_id, 'blocked_unknown', proof, a.id);
  }
  markUnknown(attemptId, evidence = { kind: 'native-result-unconfirmed' }) { return this.transaction(() => this.#unknown(attemptId, evidence)); }
  #saveNativeReply(attempt, reply, expectedNativeTurnId = null) {
    if (!reply) return;
    closed(reply, ['text', 'nativeTurnId'], ['text', 'nativeTurnId']);
    if (typeof reply.text !== 'string' || !reply.text.trim() || Buffer.byteLength(reply.text) > LIMITS.nativeReplyBytes || typeof reply.nativeTurnId !== 'string' || !reply.nativeTurnId || reply.nativeTurnId.length > 256) fail('BAD_EVIDENCE', 'Native reply or native turn identity exceeds the supported bounds.');
    if (expectedNativeTurnId && reply.nativeTurnId !== expectedNativeTurnId) fail('BAD_EVIDENCE', 'The recorded reply must belong to the original native turn.');
    this.db.prepare("INSERT INTO native_replies VALUES(?,?,?,?,'pending',NULL,NULL)").run(attempt.id, attempt.message_id, reply.nativeTurnId, reply.text);
    this.#receipt(attempt.message_id, 'received', { kind: 'attributed-native-response', nativeTurnId: reply.nativeTurnId }, attempt.id);
  }
  finishAttempt(attemptId, outcome, evidence = {}, reply = null) {
    if (!['confirmed', 'not_emitted'].includes(outcome)) fail('BAD_INPUT', 'A native attempt needs a known terminal disposition.');
    const proof = publicEvidence(evidence);
    return this.transaction(() => {
      const a = this.#attempt(attemptId);
      if (a.settled) {
        if ((outcome === 'confirmed' && ['native_done', 'native_reconciled', 'recipient_confirmed'].includes(a.state)) || (outcome === 'not_emitted' && a.state === 'unavailable')) return this.message(a.message_id);
        fail('BAD_STATE', 'The attempt already has a different terminal disposition.');
      }
      if (a.state === 'blocked_unknown' || (outcome === 'not_emitted' && a.state !== 'native_attempt_prepared')) fail('BAD_STATE', 'An emitted or uncertain attempt cannot be cleared by an uncorrelated disposition.');
      const state = outcome === 'confirmed' ? 'native_done' : 'unavailable';
      const merged = mergeEvidence(JSON.parse(a.proof_json), proof);
      if (outcome === 'confirmed') this.#saveNativeReply(a, reply, merged.nativeTurnId);
      this.db.prepare('UPDATE attempts SET settled=1,state=?,proof_json=? WHERE id=?').run(state, JSON.stringify(merged), a.id);
      this.db.prepare('UPDATE messages SET delivery_state=? WHERE id=?').run(state, a.message_id);
      this.#receipt(a.message_id, outcome === 'confirmed' ? 'harness_ack' : 'unavailable', merged, a.id);
      return this.message(a.message_id);
    });
  }
  reconcileNative(attemptId, context, evidence, reply = null) {
    if (!isObservedContext(context)) fail('NATIVE_PROOF_REQUIRED', 'Reconciliation requires an observed native adapter.');
    const proof = publicEvidence(evidence);
    return this.transaction(() => {
      const a = this.#attempt(attemptId, false), binding = this.db.prepare('SELECT native_key FROM sessions WHERE id=?').get(a.recipient_id), prior = JSON.parse(a.proof_json);
      if (a.settled || a.state !== 'blocked_unknown') fail('BAD_STATE', 'Only an unresolved uncertain attempt can be reconciled.');
      if (binding.native_key !== nativeKey(context) || proof.kind !== 'native-terminal-result' || proof.nativeSessionId !== context.nativeId || !prior.nativeTurnId || proof.nativeTurnId !== prior.nativeTurnId) fail('BAD_EVIDENCE', 'Native readback must match the original session and recorded native turn exactly.');
      this.#saveNativeReply(a, reply, proof.nativeTurnId);
      this.db.prepare("UPDATE attempts SET settled=1,state='native_reconciled',proof_json=? WHERE id=?").run(JSON.stringify({ ...prior, ...proof }), a.id);
      this.db.prepare("UPDATE messages SET delivery_state='native_reconciled' WHERE id=?").run(a.message_id);
      this.#receipt(a.message_id, 'harness_ack', proof, a.id); return this.message(a.message_id);
    });
  }
  reconcileRecipient(actor, attemptId) {
    const binding = this.#current(actor);
    return this.transaction(() => {
      const a = this.#attempt(attemptId), message = this.#message(a.message_id), e = actor.callEvidence;
      if (a.recipient_id !== binding.id || a.generation !== binding.generation || message.receipt_stage !== 'consumed' || !e || !['native_call', 'native_turn'].includes(e.kind) || !(e.nativeCallId || e.nativeTurnId)) fail('BAD_EVIDENCE', 'A matching consumed declaration from the current native recipient is required.');
      if (a.settled) return this.message(message.id);
      this.db.prepare("UPDATE attempts SET settled=1,state='recipient_confirmed',proof_json=? WHERE id=?").run(JSON.stringify(publicEvidence(e)), a.id);
      this.db.prepare("UPDATE messages SET delivery_state='recipient_confirmed' WHERE id=?").run(message.id);
      this.#receipt(message.id, 'consumed', e, a.id); return this.message(message.id);
    });
  }
  pendingNativeReplies() { return this.db.prepare("SELECT attempt_id AS attemptId,message_id AS messageId,text,state,error_code AS errorCode FROM native_replies WHERE state<>'stored' LIMIT 16").all(); }
  pendingNativeReplyHeaders() { return this.db.prepare("SELECT r.attempt_id AS attemptId,m.sender_id AS recipientId,m.sender_alias AS recipientAlias,m.recipient_id AS senderId FROM native_replies r JOIN messages m ON m.id=r.message_id WHERE r.state<>'stored'").all(); }
  publishNativeReply(attemptId) {
    return this.transaction(() => {
      const r = this.db.prepare('SELECT * FROM native_replies WHERE attempt_id=?').get(attemptId), a = this.#attempt(attemptId, false);
      if (!r || !a.settled || !['native_done', 'native_reconciled'].includes(a.state)) fail('BAD_STATE', 'No verified recorded native reply is available.');
      if (r.state === 'stored') return this.message(r.reply_message_id);
      const original = this.#message(r.message_id), sender = this.db.prepare('SELECT allowed_json,native_id FROM sessions WHERE id=?').get(original.recipient_id);
      if (!JSON.parse(sender.allowed_json).includes(original.sender_alias)) fail('FORBIDDEN', 'The native reply route is not allowed by the operator policy.');
      const input = sendInput({ requestId: 'native-reply:' + original.id, recipient: original.sender_alias, text: r.text, replyTo: original.id }, this.maxTextBytes);
      const message = this.#record({ senderId: original.recipient_id, senderAlias: original.recipient_alias, senderGeneration: a.generation, recipientId: original.sender_id, recipientAlias: original.sender_alias, recipientGeneration: original.sender_generation, requestId: input.requestId, text: input.text, replyTo: input.replyTo, evidence: { kind: 'recorded-native-reply', nativeSessionId: sender.native_id, nativeTurnId: r.native_turn_id } });
      this.db.prepare("UPDATE native_replies SET state='stored',error_code=NULL,reply_message_id=? WHERE attempt_id=?").run(message.messageId, a.id);
      return message;
    });
  }
  blockNativeReply(attemptId, code) { return this.transaction(() => this.db.prepare("UPDATE native_replies SET state='blocked',error_code=? WHERE attempt_id=? AND state<>'stored'").run(String(code).slice(0,100), attemptId)); }
  abandonAttempt(attemptId, reason) {
    if (typeof reason !== 'string' || !reason.trim() || reason.length > 1000) fail('BAD_INPUT', 'An explicit operator reason is required.');
    return this.transaction(() => {
      const a = this.#attempt(attemptId, false);
      if (a.settled || a.state !== 'blocked_unknown') fail('BAD_STATE', 'Only an unresolved uncertain attempt can be abandoned.');
      this.db.prepare("UPDATE attempts SET settled=1,state='operator_abandoned' WHERE id=?").run(a.id);
      this.db.prepare("UPDATE messages SET delivery_state='operator_abandoned' WHERE id=?").run(a.message_id);
      this.#receipt(a.message_id, 'operator_abandoned', { kind: 'explicit-operator-disposition', reason }, a.id);
      return this.message(a.message_id);
    });
  }
  listUncertain() { return this.db.prepare("SELECT id AS attemptId,message_id AS messageId,recipient_alias AS recipient,state,generation FROM attempts WHERE settled=0 AND state='blocked_unknown'").all(); }
  close() { if (!this.closed) { this.closed = true; this.db.close(); } }
}

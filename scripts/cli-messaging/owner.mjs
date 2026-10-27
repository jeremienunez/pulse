import { MailboxStore, privateDirectory, privateFile } from './store.mjs';
import { MessagingBroker } from './broker.mjs';
import { MessagingError, closed, fail, hash, newId, newCredential, publicEvidence } from './contracts.mjs';
import net from 'node:net';
import fs from 'node:fs';
import path from 'node:path';

const MAX_PENDING = 64;
const MAX_WRITE_BUFFER = 4 * 1024 * 1024;

export class BrokerError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'BrokerError';
    this.code = code;
  }
}

export class BrokerClient {
  #socketPath; #auth; #timeoutMs; #maxFrameBytes; #namespaceMappedAncestors;
  #state = 'idle';              // idle | connecting | open | closing | closed
  #socket = null;
  #pending = new Map();
  #listeners = new Set();
  #connSeq = 0;
  #reqSeq = 0;
  #closePromise = null;

  constructor({ socketPath, auth, timeoutMs = 5000, maxFrameBytes = 2097152, namespaceMappedAncestors = false } = {}) {
    if (typeof socketPath !== 'string' || !path.isAbsolute(socketPath)) throw new BrokerError('EINVAL_SOCKET', 'socketPath must be a non-empty string');
    if (!Number.isInteger(timeoutMs) || timeoutMs <= 0) throw new BrokerError('EINVAL_TIMEOUT', 'timeoutMs must be a positive integer');
    if (!Number.isInteger(maxFrameBytes) || maxFrameBytes <= 0) throw new BrokerError('EINVAL_MAXFRAME', 'maxFrameBytes must be a positive integer');
    this.#namespaceMappedAncestors = namespaceMappedAncestors === true;
    this.#socketPath = socketPath;
    this.#auth = auth ?? null;
    this.#timeoutMs = timeoutMs;
    this.#maxFrameBytes = maxFrameBytes;
  }

  setAuth(credential) { this.#auth = credential ?? null; }
  get connected() { return this.#state === 'open'; }

  onEvent(callback) {
    if (typeof callback !== 'function') throw new BrokerError('EINVAL_CALLBACK', 'onEvent requires a function');
    this.#listeners.add(callback);
    return () => { this.#listeners.delete(callback); };
  }

  async connect() {
    if (this.#state === 'open') return;
    if (this.#state !== 'idle') throw new BrokerError('ESTATE', `cannot connect in state ${this.#state}`);
    this.#checkFilesystem();
    this.#state = 'connecting';
    this.#connSeq += 1;
    this.#reqSeq = 0;

    const socket = net.createConnection({ path: this.#socketPath });
    this.#socket = socket;
    socket.setEncoding('utf8'); // Node StringDecoder handles split UTF-8 sequences

    await new Promise((resolve, reject) => {
      let settled = false;
      const done = (fn, arg) => { if (settled) return; settled = true; clearTimeout(timer); fn(arg); };
      const timer = setTimeout(() => {
        done(() => { this.#state = 'closed'; this.#socket = null; socket.destroy(); reject(new BrokerError('ECONNTIMEOUT', 'connect timed out')); });
      }, this.#timeoutMs);
      timer.unref?.();
      socket.once('connect', () => done(() => { this.#state = 'open'; this.#attach(socket); resolve(); }));
      socket.once('error', (err) => done(() => { this.#state = 'closed'; this.#socket = null; socket.destroy(); reject(new BrokerError('ECONN', err?.code || 'ECONN')); }));
      socket.once('close', () => done(() => { this.#state = 'closed'; this.#socket = null; reject(new BrokerError('ECONNCLOSED', 'socket closed before connect')); }));
    });
  }

  async request(op, params = {}, invocation = null) {
    if (this.#state !== 'open') throw new BrokerError('ENOTCONNECTED', 'client is not connected');
    if (typeof op !== 'string' || op === '') throw new BrokerError('EINVAL_OP', 'op must be a non-empty string');
    const socket = this.#socket;
    if (!socket || socket.destroyed || !socket.writable) throw new BrokerError('ENOTCONNECTED', 'client is not connected');
    if (this.#pending.size >= MAX_PENDING) throw new BrokerError('EBUSY', 'too many outstanding requests');

    const id = `${this.#connSeq}:${++this.#reqSeq}`;
    const frame = { id, auth: this.#auth, op, params };
    if (invocation !== null) frame.invocation = invocation;

    let line;
    try { line = JSON.stringify(frame) + '\n'; } catch { throw new BrokerError('EINVAL_SERIALIZE', 'request could not be serialized'); }
    const bytes = Buffer.byteLength(line, 'utf8');
    if (bytes > this.#maxFrameBytes) throw new BrokerError('EFRAME_TOOBIG', 'request exceeds maxFrameBytes');
    if (socket.writableLength + bytes > MAX_WRITE_BUFFER) throw new BrokerError('EBACKPRESSURE', 'write buffer limit exceeded');

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.#settle(id, { ok: false, error: new BrokerError('EUNKNOWN_RECEIPT', 'request timed out; operation effect unknown') });
      }, this.#timeoutMs);
      timer.unref?.();
      this.#pending.set(id, { resolve, reject, timer });
      socket.write(line, (err) => {
        if (!err) return;
        this.#settle(id, { ok: false, error: new BrokerError('EUNKNOWN_RECEIPT', 'write failed; operation effect unknown') });
        this.#failClosed('EWRITE');
      });
    });
  }

  close() {
    if (this.#closePromise) return this.#closePromise;
    this.#closePromise = this.#close();
    return this.#closePromise;
  }

  async #close() {
    const socket = this.#socket;
    this.#socket = null;
    this.#state = 'closing';
    const err = new BrokerError('ECLOSED', 'client closed; operation effect unknown');
    for (const [, entry] of this.#pending) { clearTimeout(entry.timer); entry.reject(err); }
    this.#pending.clear();
    if (socket) {
      await new Promise((resolve) => {
        if (socket.destroyed) return resolve();
        socket.once('close', resolve);
        socket.destroy();
      });
    }
    this.#state = 'closed';
  }

  #attach(socket) {
    let buffer = '';
    socket.on('data', (chunk) => {
      if (this.#state !== 'open') return;
      buffer += chunk;
      let idx;
      while ((idx = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 1);
        if (line === '') continue;
        if (Buffer.byteLength(line, 'utf8') > this.#maxFrameBytes) return this.#failClosed('EFRAME_TOOBIG');
        this.#dispatch(line);
        if (this.#state !== 'open') return;
      }
      if (Buffer.byteLength(buffer, 'utf8') > this.#maxFrameBytes) this.#failClosed('EFRAME_TOOBIG');
    });
    socket.on('end', () => this.#failClosed('EEOF'));
    socket.on('error', () => this.#failClosed('ESOCKET'));
    socket.on('close', () => this.#failClosed('ECLOSED'));
  }

  #dispatch(line) {
    let frame;
    try { frame = JSON.parse(line); } catch { return this.#failClosed('EFRAME_MALFORMED'); }
    if (!frame || typeof frame !== 'object' || Array.isArray(frame)) return this.#failClosed('EFRAME_MALFORMED');

    if (Object.hasOwn(frame, 'event') && Object.hasOwn(frame, 'id')) return this.#failClosed('EFRAME_MALFORMED');
    if (typeof frame.event === 'string') {
      for (const cb of [...this.#listeners]) { try { Promise.resolve(cb(frame)).catch(() => {}); } catch { /* listener faults must not break framing */ } }
      return;
    }
    if (typeof frame.id !== 'string') return this.#failClosed('EFRAME_MALFORMED');
    if (!this.#pending.has(frame.id)) return this.#failClosed('EUNKNOWN_RECEIPT');

    const hasResult = Object.prototype.hasOwnProperty.call(frame, 'result');
    const hasError = Object.prototype.hasOwnProperty.call(frame, 'error');
    if (hasResult === hasError) return this.#failClosed('EFRAME_MALFORMED');
    this.#settle(frame.id, hasResult
      ? { ok: true, result: frame.result }
      : { ok: false, error: this.#toError(frame.error) });
  }

  #toError(err) {
    const code = typeof err?.code === 'string' || typeof err?.code === 'number' ? String(err.code) : 'EUNKNOWN';
    const message = typeof err?.message === 'string' ? err.message : 'broker error';
    return new BrokerError(code, message);
  }

  #settle(id, outcome) {
    const entry = this.#pending.get(id);
    if (!entry) return;
    this.#pending.delete(id);
    clearTimeout(entry.timer);
    if (outcome.ok) entry.resolve(outcome.result);
    else entry.reject(outcome.error);
  }

  #failClosed(reason) {
    if (this.#state === 'closed' || this.#state === 'closing' || this.#state === 'idle') return;
    this.#state = 'closed';
    const socket = this.#socket;
    this.#socket = null;
    if (socket) { try { socket.destroy(); } catch { /* ignore */ } }
    const err = new BrokerError('EUNKNOWN_RECEIPT', `connection failed closed (${reason}); operation effect unknown`);
    for (const [, entry] of this.#pending) { clearTimeout(entry.timer); entry.reject(err); }
    this.#pending.clear();
  }

  #checkFilesystem() {
    const parent = path.dirname(this.#socketPath);
    const sock = this.#lstat(this.#socketPath, 'ESOCK');
    if (!sock.isSocket()) throw new BrokerError('ESOCK_TYPE', 'socket path is not a socket');
    if (sock.uid !== process.getuid?.()) throw new BrokerError('ESOCK_OWNER', 'socket is owned by another uid');
    if ((sock.mode & 0o777) !== 0o600) throw new BrokerError('ESOCK_MODE', 'socket mode must be 0600');
    const dir = this.#lstat(parent, 'EPARENT');
    if (this.#namespaceMappedAncestors) validateNativeNamespaceAncestors(parent);
    else privateDirectory(parent);
    if (!dir.isDirectory()) throw new BrokerError('EPARENT_TYPE', 'parent is not a directory');
    if (dir.uid !== process.getuid?.()) throw new BrokerError('EPARENT_OWNER', 'parent is owned by another uid');
    if ((dir.mode & 0o777) !== 0o700) throw new BrokerError('EPARENT_MODE', 'parent mode must be 0700');
  }

  #lstat(p, code) {
    let st;
    try { st = fs.lstatSync(p); } catch { throw new BrokerError(code, 'path could not be inspected'); }
    if (st.isSymbolicLink()) throw new BrokerError(`${code}_SYMLINK`, 'symlink rejected');
    return st;
  }
}

// Only an existing socket client may traverse host-root ancestors whose UIDs
// are unmapped in its native user namespace. The leaf and socket remain owned
// and private. The host broker still validates the original binding path before
// authorizing any model operation; store creation never uses this exception.
function validateNativeNamespaceAncestors(directory) {
  const overflow = Number(fs.readFileSync('/proc/sys/kernel/overflowuid', 'utf8').trim());
  const ranges = fs.readFileSync('/proc/self/uid_map', 'utf8').trim().split('\n').map(line => line.trim().split(/\s+/u).map(Number));
  if (!Number.isSafeInteger(overflow) || ranges.some(r => r.length !== 3 || r.some(v => !Number.isSafeInteger(v))) || ranges.some(([inside, , size]) => inside === 0 && size > 0) || fs.lstatSync('/').uid !== overflow || process.getuid() === overflow) fail('PRIVATE_PATH_REQUIRED', 'The native client does not have an unmapped host-root namespace view.');
  let current = path.parse(directory).root;
  for (const part of directory.slice(current.length).split(path.sep).filter(Boolean)) {
    current = path.join(current, part); const st = fs.lstatSync(current);
    if (!st.isDirectory() || st.isSymbolicLink() || ![0, process.getuid(), overflow].includes(st.uid)) fail('PRIVATE_PATH_REQUIRED', 'Native namespace paths must be existing directories without symlinks.');
  }
}

const OWNER_FORMAT = 'pulse-messaging-owner/v1';
const BINDING_FORMAT = 'pulse-native-binding/v1';
export function processIdentity(pid) {
  if (!Number.isSafeInteger(pid) || pid < 1) fail('NATIVE_PROOF_REQUIRED', 'Invalid native process.');
  try {
    const status = fs.readFileSync(`/proc/${pid}/stat`, 'utf8');
    return { pid, startId: status.slice(status.lastIndexOf(')') + 2).split(' ')[19] };
  } catch { fail('NATIVE_UNAVAILABLE', 'The native process is no longer available.'); }
}
export function sameProcess(identity) {
  try { return processIdentity(identity.pid).startId === identity.startId; } catch { return false; }
}
export function readPrivateJson(file, format) {
  privateFile(file);
  let value;
  try { value = JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch { fail('INVALID_PRIVATE_FILE', 'The private messaging configuration could not be read.'); }
  if (format && value?.format !== format) fail('INVALID_PRIVATE_FILE', 'The private messaging configuration has an unsupported format.');
  return value;
}
export function writePrivateJson(file, value, { replace = false } = {}) {
  privateFile(file);
  if (!replace) fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n', { mode: 0o600, flag: 'wx' });
  else {
    const temporary = file + '.tmp-' + newId();
    try { fs.writeFileSync(temporary, JSON.stringify(value, null, 2) + '\n', { mode: 0o600, flag: 'wx' }); fs.renameSync(temporary, file); }
    finally { if (fs.existsSync(temporary)) fs.unlinkSync(temporary); }
  }
}
export function ownerPaths(directory) { return { directory, socketPath: path.join(directory, 'broker.sock'), metadata: path.join(directory, 'owner.json'), authFile: path.join(directory, 'owner-auth.json') }; }
export function ownerCredential(directory) {
  const credential = readPrivateJson(ownerPaths(directory).authFile, 'pulse-owner-auth/v1').credential;
  if (typeof credential !== 'string' || credential.length < 32 || credential.length > 256) fail('INVALID_PRIVATE_FILE', 'The private operator credential has an invalid format.');
  return credential;
}
export function bindingLocation(directory, file) {
  if (typeof file !== 'string' || !path.isAbsolute(file) || path.resolve(file) !== file || !file.startsWith(directory + path.sep)) fail('PRIVATE_PATH_REQUIRED', 'Native bindings must remain inside the private messaging state directory.');
  const parent = path.dirname(file); privateDirectory(parent); return file;
}
export async function connectOwner(directory, auth = null, options = {}) {
  const paths = ownerPaths(directory), metadata = readPrivateJson(paths.metadata, OWNER_FORMAT);
  if (!sameProcess(metadata.process)) fail('SERVICE_UNAVAILABLE', 'The recorded messaging owner is not running.');
  const client = new BrokerClient({ socketPath: paths.socketPath, auth: auth ?? ownerCredential(directory), ...options });
  await client.connect(); return client;
}
export function readNativeBinding(file, { verifyParent = false } = {}) {
  const binding = readPrivateJson(file, BINDING_FORMAT);
  if (!['claude', 'codex', 'antigravity'].includes(binding.family) || typeof binding.credential !== 'string' || !binding.connection || !binding.nativeOwner || !sameProcess(binding.nativeOwner)) fail('NATIVE_PROOF_REQUIRED', 'The native binding is not live.');
  if (verifyParent && binding.nativeOwner.pid !== process.ppid) fail('NATIVE_PROOF_REQUIRED', 'The MCP frontend was not started by its enrolled native harness.');
  return binding;
}

export async function serveOwner({ directory, factories = {}, maxConcurrency, storeOptions = {} }) {
  const store = new MailboxStore({ directory, ...storeOptions }), broker = new MessagingBroker(store, { maxConcurrency });
  const paths = ownerPaths(directory), peers = new Set();
  let stopping = false, closing = null, server;
  try {
    if (fs.existsSync(paths.authFile)) readPrivateJson(paths.authFile, 'pulse-owner-auth/v1');
    else writePrivateJson(paths.authFile, { format: 'pulse-owner-auth/v1', credential: newCredential() });
    const adminCredential = ownerCredential(directory);
    let previous = null;
    if (fs.existsSync(paths.metadata)) previous = readPrivateJson(paths.metadata, OWNER_FORMAT);
    if (fs.existsSync(paths.socketPath)) {
      const st = fs.lstatSync(paths.socketPath);
      if (!st.isSocket() || st.uid !== process.getuid() || (st.mode & 0o077) || !previous || previous.socket?.inode !== st.ino || previous.socket?.device !== st.dev || sameProcess(previous.process)) fail('SOCKET_OWNERSHIP', 'The existing socket cannot be safely recovered.');
      fs.unlinkSync(paths.socketPath); // exact stale owned inode, under SQLite's exclusive owner lock
    }
    const decorate = message => {
      const recipient = store.session(message.recipientBindingId), transport = broker.adapters.get(message.recipientBindingId);
      const connected = !!transport && transport.registration.generation === recipient.generation && (transport.adapter.isConnected?.() ?? true);
      return { ...message, delivery: { policy: recipient.deliveryMode, connected, nativeCapability: recipient.deliveryMode === 'inbox-only' ? 'not-requested' : recipient.capabilities[recipient.deliveryMode], available: connected && recipient.deliveryMode !== 'inbox-only' && recipient.capabilities[recipient.deliveryMode] === 'supported' } };
    };
    async function invoke(actor, op, params) {
      if (op === 'send') return decorate(await broker.send(actor, params));
      if (op === 'read') { const page = broker.read(actor, params); return { ...page, items: page.items.map(decorate) }; }
      if (op === 'ack') return decorate(broker.ack(actor, params));
      if (op === 'status') return decorate(broker.status(actor, params));
      if (op === 'capabilities') {
        const result = broker.capabilities(actor, params);
        for (const session of result.sessions) { const target = broker.adapters.get(session.bindingId); session.connected = !!target && target.registration.generation === session.generation && (target.adapter.isConnected?.() ?? true) && !!session.active; }
        return result;
      }
      fail('UNKNOWN_OPERATION', 'This operation is not available to a message frontend.');
    }
    const host = {
      directory, store, broker, invoke,
      bind(adapter, registration) {
        const context = broker.adapters.get(registration.bindingId).context;
        adapter.bind?.({ registration, invoke: (op, params, evidence) => invoke(store.nativeActor(registration.bindingId, registration.generation, context, evidence), op, params), host });
      },
      refresh: async (credential, adapter) => broker.restore(credential, adapter),
    };
    async function factory(family) {
      if (!['claude', 'codex', 'antigravity'].includes(family) || !factories[family]) fail('NATIVE_UNAVAILABLE', 'This native adapter is not available.');
      return typeof factories[family] === 'function' ? await factories[family]() : factories[family];
    }
    async function dispatch(peer, request) {
      if (stopping) fail('SERVICE_UNAVAILABLE', 'The messaging owner is stopping.');
      closed(request, ['id', 'auth', 'op', 'params', 'invocation'], ['id', 'auth', 'op', 'params']);
      if (typeof request.id !== 'string' || request.id.length > 128 || typeof request.op !== 'string' || request.op.length > 80 || typeof request.auth !== 'string' || request.auth.length > 256) fail('FORBIDDEN', 'A valid private request credential is required.');
      const admin = hash(request.auth) === hash(adminCredential);
      if (request.op.startsWith('owner.')) {
        if (!admin) fail('FORBIDDEN', 'This operation requires the operator credential.');
        if (request.op === 'owner.status') return { protocolVersion: '1.0', process: processIdentity(process.pid), strategy: 'single-owner', limits: { textBytes: store.maxTextBytes, queuedPerTarget: store.maxQueuedPerTarget, nativeConcurrency: broker.maxConcurrency }, sessions: store.db.prepare('SELECT id FROM sessions WHERE active=1').all().map(r => ({ ...store.session(r.id), connected: broker.adapters.has(r.id) })), uncertain: store.listUncertain(), failure: broker.failure?.code ?? null };
        if (request.op === 'owner.stop') { closed(request.params, []); setImmediate(() => close().catch(() => {})); return { shutdownRequested: true }; }
        if (request.op === 'owner.attach') {
          closed(request.params, ['family', 'alias', 'connection', 'policy', 'bindingFile'], ['family', 'alias', 'connection']);
          if (request.params.bindingFile) bindingLocation(directory, request.params.bindingFile);
          const module = await factory(request.params.family);
          const adapter = await module.createAdapter({ connection: request.params.connection, host, peer, alias: request.params.alias });
          try {
            let registration;
            if (request.params.bindingFile && fs.existsSync(request.params.bindingFile)) {
              const saved = readNativeBinding(request.params.bindingFile);
              if (saved.family !== request.params.family || saved.alias !== request.params.alias) fail('NATIVE_PROOF_REQUIRED', 'The saved native binding does not match this adapter.');
              registration = await broker.restore(saved.credential, adapter);
              registration.credential = saved.credential;
            } else registration = await broker.attach(request.params.alias, adapter, request.params.policy ?? {});
            host.bind(adapter, registration);
            peer.adapters.add(adapter);
            if (request.params.bindingFile) {
              const context = store.nativeContext(registration.bindingId);
              writePrivateJson(request.params.bindingFile, { format: BINDING_FORMAT, stateDirectory: directory, family: request.params.family, alias: registration.alias, bindingId: registration.bindingId, generation: registration.generation, credential: registration.credential, nativeOwner: context.owner, nativeId: context.nativeId, connection: request.params.connection }, { replace: fs.existsSync(request.params.bindingFile) });
            }
            return registration; // operator only; CLI writes a private file and redacts stdout
          } catch (e) { await adapter.close?.(); throw e; }
        }
        if (request.op === 'owner.retire') {
          closed(request.params, ['alias', 'bindingId', 'generation'], ['alias']);
          const session = store.resolve(request.params.alias); if (!session) fail('NOT_FOUND', 'Unknown alias.');
          if ((request.params.bindingId !== undefined && request.params.bindingId !== session.id) || (request.params.generation !== undefined && request.params.generation !== session.generation)) return { retired: false, reason: 'binding_replaced' };
          const target = broker.adapters.get(session.id); broker.adapters.delete(session.id);
          const job = broker.jobs.get(session.id); if (job) { store.markUnknown(job.attempt.attemptId); job.controller.abort(); }
          store.retire(session.id); await target?.adapter.close?.(); return { retired: true };
        }
        if (request.op === 'owner.abandon') { closed(request.params, ['attemptId', 'reason'], ['attemptId', 'reason']); const result = store.abandonAttempt(request.params.attemptId, request.params.reason); broker.schedule(); return result; }
        if (request.op === 'owner.nativeResult') return peer.resolveNative(request.params);
        fail('UNKNOWN_OPERATION', 'Unknown operator operation.');
      }
      if (admin) fail('FORBIDDEN', 'Message operations require a native binding, not an operator identity.');
      const invocation = request.invocation === undefined ? null : publicEvidence(request.invocation);
      const actor = store.authenticate(request.auth, invocation);
      if (request.op === 'native.attach') {
        closed(request.params, ['bindingFile', 'metadata'], ['bindingFile']);
        bindingLocation(directory, request.params.bindingFile);
        const binding = readNativeBinding(request.params.bindingFile);
        if (binding.credential !== request.auth || binding.bindingId !== actor.sessionId || binding.generation !== actor.generation) fail('NATIVE_PROOF_REQUIRED', 'The private binding does not match this connection.');
        const module = await factory(binding.family);
        if (typeof module.connectFrontend !== 'function') fail('NATIVE_UNAVAILABLE', 'This harness requires its native owner connector.');
        const adapter = await module.connectFrontend({ binding, host, peer, metadata: request.params.metadata ?? {} });
        const registration = await broker.restore(request.auth, adapter); host.bind(adapter, registration);
        peer.binding = { id: actor.sessionId, generation: actor.generation, adapter }; peer.adapters.add(adapter);
        return { ...registration, protocolVersion: '1.0' };
      }
      if (!peer.binding || peer.binding.id !== actor.sessionId || peer.binding.generation !== actor.generation) fail('NATIVE_PROOF_REQUIRED', 'This frontend has not verified its native harness connection.');
      if (request.op === 'native.result') return peer.resolveNative(request.params);
      if (request.op === 'native.ready') { closed(request.params, []); await peer.binding.adapter.onReady?.(); return { ready: true }; }
      if (request.op === 'native.extra') { closed(request.params, ['method', 'arguments'], ['method', 'arguments']); if (!peer.binding.adapter.handleFrontendCall) fail('UNKNOWN_OPERATION', 'No adapter-specific call is available.'); return peer.binding.adapter.handleFrontendCall(request.params.method, request.params.arguments, actor); }
      return invoke(actor, request.op, request.params);
    }
    const write = (socket, frame) => {
      const line = JSON.stringify(frame) + '\n';
      if (Buffer.byteLength(line) > 2097152 || socket.writableLength > 4194304 || socket.destroyed) { socket.destroy(); throw new MessagingError('CONNECTION_UNAVAILABLE', 'The private response could not be written.'); }
      socket.write(line);
    };
    server = net.createServer(socket => {
      let buffer = '', outstanding = 0;
      const pendingNative = new Map();
      const peer = {
        socket, binding: null, adapters: new Set(),
        command(kind, payload, timeoutMs = 90000) {
          if (pendingNative.size >= 4) return Promise.reject(new MessagingError('NATIVE_BUSY', 'The native transport queue is full.'));
          const commandId = newId();
          return new Promise((resolve, reject) => {
            const timer = setTimeout(() => { pendingNative.delete(commandId); reject(new MessagingError('NATIVE_RECEIPT_UNKNOWN', 'The native transport did not report a receipt; do not resend.')); }, timeoutMs);
            pendingNative.set(commandId, { resolve, reject, timer });
            try { write(socket, { event: 'native-command', commandId, kind, payload }); }
            catch (e) { clearTimeout(timer); pendingNative.delete(commandId); reject(e); }
          });
        },
        resolveNative(params) {
          closed(params, ['commandId', 'result', 'error'], ['commandId']);
          const p = pendingNative.get(params.commandId);
          if (!p) fail('NATIVE_RECEIPT_UNKNOWN', 'No matching native command remains outstanding.');
          pendingNative.delete(params.commandId); clearTimeout(p.timer);
          params.error ? p.reject(new MessagingError('NATIVE_TRANSPORT_ERROR', 'The native transport reported an error.')) : p.resolve(params.result);
          return { accepted: true };
        },
        get closed() { return socket.destroyed; },
      };
      peers.add(peer); socket.setEncoding('utf8');
      socket.on('data', chunk => {
        buffer += chunk;
        while (buffer.includes('\n')) {
          const offset = buffer.indexOf('\n'), line = buffer.slice(0, offset); buffer = buffer.slice(offset + 1);
          if (Buffer.byteLength(line) > 2097152 || outstanding >= 64) { socket.destroy(); return; }
          if (!line.trim()) continue;
          let request;
          try { request = JSON.parse(line); } catch { socket.destroy(); return; }
          outstanding++;
          Promise.resolve().then(() => dispatch(peer, request)).then(result => write(socket, { id: request.id, result }), error => write(socket, { id: typeof request?.id === 'string' ? request.id : 'invalid', error: { code: error instanceof MessagingError ? error.code : 'OPERATION_FAILED', message: error instanceof MessagingError ? error.message : 'The operation could not be completed. Check the owner status.' } })).catch(() => socket.destroy()).finally(() => outstanding--);
        }
        if (Buffer.byteLength(buffer) > 2097152) socket.destroy();
      });
      socket.on('error', () => {});
      socket.on('close', () => {
        peers.delete(peer);
        for (const p of pendingNative.values()) { clearTimeout(p.timer); p.reject(new MessagingError('NATIVE_RECEIPT_UNKNOWN', 'Native peer disconnected after possible emission.')); }
        pendingNative.clear();
        for (const adapter of peer.adapters) {
          const ownsTransport = adapter.transportPeerCoupled && (!adapter.ownsPeer || adapter.ownsPeer(peer));
          try { Promise.resolve(adapter.onPeerClosed?.(peer)).catch(() => {}); } catch {}
          if (!ownsTransport) continue;
          for (const [id, target] of broker.adapters) if (target.adapter === adapter) {
            broker.adapters.delete(id);
            const job = broker.jobs.get(id); if (job && !store.closed) { store.markUnknown(job.attempt.attemptId); job.controller.abort(); }
          }
        }
      });
    });
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(paths.socketPath, () => { server.off('error', reject); resolve(); }); });
    fs.chmodSync(paths.socketPath, 0o600);
    const socketStat = fs.lstatSync(paths.socketPath);
    writePrivateJson(paths.metadata, { format: OWNER_FORMAT, protocolVersion: '1.0', process: processIdentity(process.pid), socket: { inode: socketStat.ino, device: socketStat.dev } }, { replace: !!previous });
    function close() {
      if (closing) return closing; stopping = true;
      closing = (async () => {
        try { await broker.close(); }
        finally {
          for (const peer of peers) peer.socket.destroy();
          await new Promise(resolve => server.close(resolve)); store.close();
        }
      })();
      return closing;
    }
    return { store, broker, paths, close, host };
  } catch (e) { for (const p of peers) p.socket.destroy(); if (server?.listening) await new Promise(resolve => server.close(resolve)); await broker.close(); store.close(); throw e; }
}

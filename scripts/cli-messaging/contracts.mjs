import crypto from 'node:crypto';

export const LIMITS = Object.freeze({ textBytes: 16384, nativeReplyBytes: 1048576, readBytes: 1048576, queuedPerTarget: 64, readPage: 100, nativeConcurrency: 2 });
export const RECEIPT_RANK = Object.freeze({ stored: 0, transport_accepted: 1, harness_ack: 2, received: 3, consumed: 4 });
const observed = new WeakSet();
export class MessagingError extends Error {
  constructor(code, message) { super(message); this.name = 'MessagingError'; this.code = code; }
}
export const fail = (code, message) => { throw new MessagingError(code, message); };
export const hash = value => crypto.createHash('sha256').update(value).digest('hex');
export const newId = () => crypto.randomUUID();
export const newCredential = () => crypto.randomBytes(32).toString('base64url');
export const nativeKey = context => JSON.stringify([context.family, context.nativeId]);

export function closed(value, allowed, required = []) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(k => !allowed.includes(k)) || required.some(k => !Object.hasOwn(value, k))) fail('BAD_INPUT', 'Unexpected or missing message fields.');
  return value;
}
export function label(value, field = 'identifier') {
  if (typeof value !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,127}$/u.test(value)) fail('BAD_INPUT', 'Invalid ' + field + '.');
  return value;
}
export function sendInput(value, maxTextBytes = LIMITS.textBytes) {
  closed(value, ['requestId', 'recipient', 'text', 'replyTo'], ['requestId', 'recipient', 'text']);
  label(value.requestId, 'requestId'); label(value.recipient, 'recipient');
  if (typeof value.text !== 'string' || !value.text.trim() || value.text.includes('\0') || Buffer.byteLength(value.text) > maxTextBytes) fail('BAD_INPUT', 'Message text is empty or exceeds the configured limit.');
  if (value.replyTo !== undefined) label(value.replyTo, 'replyTo');
  return { requestId: value.requestId, recipient: value.recipient, text: value.text, replyTo: value.replyTo ?? null };
}
export function readInput(value = {}) {
  closed(value, ['cursor', 'limit', 'direction']);
  const cursor = value.cursor ?? 0, limit = value.limit ?? 20, direction = value.direction ?? 'inbox';
  if (!Number.isSafeInteger(cursor) || cursor < 0 || !Number.isSafeInteger(limit) || limit < 1 || limit > LIMITS.readPage || !['inbox', 'outbox'].includes(direction)) fail('BAD_INPUT', 'Invalid mailbox page.');
  return { cursor, limit, direction };
}
export function ackInput(value) {
  closed(value, ['messageId', 'stage'], ['messageId', 'stage']); label(value.messageId, 'messageId');
  if (!['received', 'consumed'].includes(value.stage)) fail('BAD_INPUT', 'A recipient may acknowledge received or consumed.');
  return value;
}
export function publicEvidence(value = {}) {
  const keys = ['kind', 'nativeCallId', 'nativeTurnId', 'nativeSessionId', 'reference', 'version', 'reason'];
  closed(value, keys);
  if (Object.values(value).some(v => typeof v !== 'string' || v.length > 1000 || v.includes('\0'))) fail('BAD_EVIDENCE', 'Invalid native evidence.');
  return { ...value };
}

// This accepts a code-owned adapter port, never a model/IPC identity declaration.
// Each production adapter is responsible for observing its real native endpoint.
export async function observeNativeContext(adapter) {
  if (typeof adapter?.observe !== 'function') fail('NATIVE_PROOF_REQUIRED', 'A native adapter observation is required.');
  const value = await adapter.observe();
  closed(value, ['family', 'nativeId', 'owner', 'capabilities', 'evidence'], ['family', 'nativeId', 'owner', 'capabilities', 'evidence']);
  if (!['claude', 'codex', 'antigravity'].includes(value.family) || typeof value.nativeId !== 'string' || !value.nativeId || value.nativeId.length > 256) fail('NATIVE_PROOF_REQUIRED', 'Native session identity is unavailable.');
  closed(value.owner, ['pid', 'startId'], ['pid', 'startId']);
  if (!Number.isSafeInteger(value.owner.pid) || value.owner.pid < 1 || typeof value.owner.startId !== 'string' || !value.owner.startId) fail('NATIVE_PROOF_REQUIRED', 'Native owner identity is unavailable.');
  closed(value.capabilities, ['notify', 'wake', 'existingConversation'], ['notify', 'wake', 'existingConversation']);
  if (Object.values(value.capabilities).some(v => !['supported', 'unsupported', 'unknown'].includes(v))) fail('NATIVE_PROOF_REQUIRED', 'Native capability must retain unknown or unsupported.');
  const result = Object.freeze({ ...value, owner: Object.freeze({ ...value.owner }), capabilities: Object.freeze({ ...value.capabilities }), evidence: Object.freeze(publicEvidence(value.evidence)) });
  observed.add(result); return result;
}
export const isObservedContext = value => observed.has(value);

export function policyInput(value = {}) {
  closed(value, ['deliveryMode', 'allowedRecipients', 'replace']);
  const deliveryMode = value.deliveryMode ?? 'inbox-only', allowedRecipients = value.allowedRecipients ?? [];
  if (!['inbox-only', 'notify', 'wake'].includes(deliveryMode) || !Array.isArray(allowedRecipients) || allowedRecipients.length > 128 || (value.replace !== undefined && typeof value.replace !== 'boolean')) fail('BAD_INPUT', 'Invalid operator delivery policy.');
  for (const recipient of allowedRecipients) label(recipient, 'allowed recipient');
  return { deliveryMode, allowedRecipients: [...new Set(allowedRecipients)], replace: value.replace ?? false };
}

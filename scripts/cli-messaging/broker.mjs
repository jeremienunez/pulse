import { setTimeout as delay } from 'node:timers/promises';
import { LIMITS, observeNativeContext, fail } from './contracts.mjs';

export class MessagingBroker {
  constructor(store, { maxConcurrency = LIMITS.nativeConcurrency } = {}) {
    if (!Number.isInteger(maxConcurrency) || maxConcurrency < 1 || maxConcurrency > 4) fail('BAD_INPUT', 'Native concurrency must be between one and four.');
    this.store = store; this.maxConcurrency = maxConcurrency; this.adapters = new Map(); this.jobs = new Map(); this.listeners = new Set(); this.closed = false; this.scheduled = false;
  }
  async attach(alias, adapter, policy = {}) {
    const context = await observeNativeContext(adapter), registration = this.store.enroll(alias, context, policy);
    this.adapters.set(registration.bindingId, { adapter, context, registration }); this.schedule(); return registration;
  }
  async restore(credential, adapter) {
    const actor = this.store.authenticate(credential), context = await observeNativeContext(adapter);
    const registration = this.store.refreshNativeContext(actor, context);
    this.adapters.set(registration.bindingId, { adapter, context, registration }); this.schedule(); return registration;
  }
  async send(actor, input) { if (this.closed || this.failure) fail('SERVICE_UNAVAILABLE', 'The messaging owner is unavailable.'); const message = this.store.send(actor, input); this.emit({ type: 'stored', message }); this.schedule(); return message; }
  read(actor, input) { return this.store.read(actor, input); }
  status(actor, input) { return this.store.status(actor, input); }
  capabilities(actor, input) {
    const result = this.store.capabilities(actor, input);
    for (const session of result.sessions) session.connected = this.adapters.get(session.bindingId)?.registration.generation === session.generation && !!session.active;
    return result;
  }
  ack(actor, input) {
    const message = this.store.ack(actor, input);
    this.emit({ type: 'recipient_ack', message, actor });
    this.schedule(); return message;
  }
  subscribe(listener) { this.listeners.add(listener); return () => this.listeners.delete(listener); }
  emit(event) { for (const listener of this.listeners) { try { listener(event); } catch {} } }
  schedule() {
    if (this.closed || this.scheduled || this.failure) return;
    this.scheduled = true;
    queueMicrotask(() => { this.scheduled = false; if (!this.closed && !this.store.closed) { try { this.#pump(); } catch (e) { this.failure = e; this.emit({ type: 'owner_error', code: e.code ?? 'STORE_FAILURE' }); } } });
  }
  #pump() {
    const fullRecipients = new Set(), fullAliases = new Set();
    for (const reply of this.store.pendingNativeReplyHeaders()) {
      if (fullRecipients.has(reply.recipientId) || fullAliases.has(reply.recipientAlias)) continue;
      try { const message = this.store.publishNativeReply(reply.attemptId); this.emit({ type: 'stored', message }); }
      catch (e) {
        this.store.blockNativeReply(reply.attemptId, e.code ?? 'REPLY_STORE_FAILURE');
        if (e.code === 'QUEUE_FULL') { fullRecipients.add(reply.recipientId); fullAliases.add(reply.recipientAlias); }
      }
    }
    for (const message of this.store.readyMessages()) {
      if (this.jobs.size >= this.maxConcurrency) break;
      const target = this.adapters.get(message.recipientBindingId);
      if (!target || this.jobs.has(message.recipientBindingId)) continue;
      const current = this.store.session(message.recipientBindingId), mode = current.deliveryMode;
      if (mode === 'inbox-only' || current.capabilities[mode] !== 'supported' || target.registration.generation !== current.generation) continue;
      let attempt;
      try { attempt = this.store.prepareAttempt(message.messageId); }
      catch (e) { if (['TARGET_BLOCKED_UNKNOWN', 'TARGET_BUSY'].includes(e.code)) continue; throw e; }
      if (!attempt.prepared) continue;
      const controller = new AbortController();
      const job = { attempt, controller, promise: null };
      this.jobs.set(message.recipientBindingId, job);
      job.promise = this.#deliver(target, message, attempt, controller.signal).catch(e => { this.failure = e; this.emit({ type: 'owner_error', code: e.code ?? 'STORE_FAILURE' }); }).finally(() => { this.jobs.delete(message.recipientBindingId); this.schedule(); });
    }
  }
  async #deliver(target, message, attempt, signal) {
    const progress = (stage, evidence) => { if (this.closed) return; const result = this.store.progress(attempt.attemptId, stage, evidence); this.emit({ type: 'native_progress', message: result }); };
    try {
      const beforeEmit = evidence => !this.closed && !signal.aborted && this.store.beforeEmit(attempt.attemptId, evidence);
      const result = await target.adapter.deliver({ message, attempt, progress, beforeEmit, signal });
      if (this.closed) return;
      if (result?.outcome === 'confirmed') {
        // Commit the native terminal fact and recorded response together.
        // Publishing that response has its own queue/ACL outcome and cannot
        // turn an already confirmed native delivery into an unknown effect.
        const terminal = this.store.finishAttempt(attempt.attemptId, 'confirmed', result.evidence ?? { kind: 'native-terminal-result' }, result.reply ?? null);
        this.emit({ type: 'native_terminal', message: terminal });
      } else if (result?.outcome === 'not_emitted') {
        this.store.finishAttempt(attempt.attemptId, 'not_emitted', result.evidence ?? { kind: 'native-preflight-refusal' });
      } else if (result?.outcome !== 'written') this.store.markUnknown(attempt.attemptId);
      // 'written' remains unsettled until an attributed receipt reconciles it.
    } catch (e) {
      if (!this.closed && !this.store.closed) this.store.markUnknown(attempt.attemptId, { kind: 'native-result-unconfirmed', reason: e.code === 'STALE_GENERATION' ? 'Native session generation changed.' : 'Native delivery did not produce a committed terminal receipt.' });
    }
  }
  async idle() {
    while (this.scheduled || this.jobs.size) { await delay(0); await Promise.all([...this.jobs.values()].map(j => j.promise)); }
    if (this.failure) throw this.failure;
  }
  async close() {
    if (this.closed) return; this.closed = true;
    for (const job of this.jobs.values()) {
      if (!this.store.closed) this.store.markUnknown(job.attempt.attemptId, { kind: 'owner-shutdown', reason: 'A native result was still outstanding at shutdown.' });
      job.controller.abort();
    }
    let timer;
    await Promise.race([Promise.allSettled([...this.jobs.values()].map(j => j.promise)), new Promise(resolve => { timer = setTimeout(resolve, 3000); })]);
    clearTimeout(timer);
    for (const target of this.adapters.values()) await target.adapter.close?.();
    this.listeners.clear();
  }
}

/** Experimental stream reducer: no files, process handles, model-use or billing inference. */
import { createHash } from 'node:crypto';
import { parseTrustKey, selectOwnHookMetadata } from './codex-hooks.js';
import { codexRecallDigest, parseCodexRecallFrame } from './codex-recall-frame.js';
export const CODEX_RECALL_OBSERVER_VERSION = '0.160.1';
export const CODEX_RECALL_OBSERVER_MAX_RECORDS = 32;
export const CODEX_RECALL_OBSERVER_MAX_TURNS = 16;
export const CODEX_RECALL_OBSERVER_MAX_ITEMS = 32;
export const CODEX_RECALL_OBSERVER_MAX_RETAINED_BYTES = 1_048_576;
export const codexRecallObject = (v) => typeof v === 'object' && v !== null && !Array.isArray(v);
const opaque = (v) => typeof v === 'string' && v.length > 0 && Buffer.byteLength(v) <= 512 && !/[\x00-\x1f\x7f]/u.test(v);
const alias = (kind, value) => createHash('sha256').update(JSON.stringify([kind, value])).digest('hex').slice(0, 32);
const scope = (thread, turn) => JSON.stringify([thread, turn]);
const once = (text, part) => { const i = text.indexOf(part); return i >= 0 && text.indexOf(part, i + 1) < 0; };
/** Callers feed only their owned child stdout. Persisted DTOs never feed this authority path. */
export class CodexRecallObserver {
    observerId;
    nonce;
    runtime = null;
    handler;
    epoch = 0;
    connected = true;
    reason = 'unsupported-runtime';
    current;
    currentStage = 'unknown';
    currentScope;
    records = [];
    turns = new Map();
    invalidated = new Set();
    closed = new Set();
    disabled = false;
    constructor(observerId, nonce) {
        this.observerId = observerId;
        this.nonce = nonce;
    }
    setRuntime(version) { this.runtime = version; this.reason = version === CODEX_RECALL_OBSERVER_VERSION ? 'hook-unverified' : 'unsupported-runtime'; }
    /** A new request/turn has no current accounting until its own evidence arrives. */
    beginTurn() {
        this.current = undefined;
        this.currentStage = 'unknown';
        this.currentScope = undefined;
        if (!this.disabled)
            this.reason = this.runtime === CODEX_RECALL_OBSERVER_VERSION ? 'pending' : 'unsupported-runtime';
    }
    /** Uniqueness includes source/key/command, generated helper verified separately by the owner. */
    setHooks(hooks, entries, registryPath) {
        this.handler = undefined;
        if (this.disabled)
            return;
        if (this.runtime !== CODEX_RECALL_OBSERVER_VERSION) {
            this.reason = 'unsupported-runtime';
            return;
        }
        this.reason = 'hook-unverified';
        const own = selectOwnHookMetadata(hooks, entries, { registryPath }).find(r => r.id === 'codex-recall');
        if (own === undefined || !own.meta.enabled || own.meta.source !== 'user'
            || !['trusted', 'managed'].includes(own.meta.trustStatus)) {
            this.reason = 'hook-unverified';
            return;
        }
        const meta = own.meta;
        const parsed = parseTrustKey(meta.key);
        // displayOrder maps native hook runs, rather than assuming key indices equal run IDs.
        if (parsed === null || typeof meta.displayOrder !== 'number' || !Number.isSafeInteger(meta.displayOrder) || meta.displayOrder < 0
            || hooks.filter(h => h.sourcePath === meta.sourcePath && h.eventName === meta.eventName && h.displayOrder === meta.displayOrder).length !== 1)
            return;
        this.handler = { sourcePath: meta.sourcePath, source: meta.source, displayOrder: meta.displayOrder,
            runId: `user-prompt-submit:${meta.displayOrder}:${meta.sourcePath}` };
        this.reason = 'pending';
    }
    /** Invalidate before forwarding lifecycle requests, including those that ultimately fail. */
    invalidate() {
        for (const key of this.turns.keys())
            this.invalidated.add(key);
        this.turns.clear();
        this.current = undefined;
        this.currentStage = 'unknown';
        this.currentScope = undefined;
        this.epoch++;
        this.reason = 'scope-invalidated';
        if (this.invalidated.size + this.closed.size > 256)
            this.fail('limit-exceeded');
    }
    disconnect() { this.invalidate(); this.connected = false; this.reason = 'disconnected'; }
    fail(reason) { this.disabled = true; this.turns.clear(); this.current = undefined; this.currentStage = 'unknown'; this.reason = reason; }
    snapshot(now = Date.now()) {
        return { schema: 'codex-recall-observer/1', observerId: this.observerId, label: 'recorded-local-experimental', runtime: this.runtime,
            connection: this.connected ? 'connected' : 'disconnected', epoch: this.epoch, updatedAt: now,
            currentStage: this.currentStage,
            current: this.current === undefined ? { state: 'unknown', reason: this.reason } : { state: 'accounted-input', record: this.current },
            historical: this.records.map(r => ({ ...r, completeLessonIds: [...r.completeLessonIds], unknownLessonIds: [...r.unknownLessonIds] })) };
    }
    turn(thread, turn, canStart) {
        const key = scope(thread, turn);
        if (this.invalidated.has(key) || this.closed.has(key))
            return undefined;
        let entry = this.turns.get(key);
        if (entry === undefined) {
            if (!canStart)
                return undefined;
            if (this.turns.size >= CODEX_RECALL_OBSERVER_MAX_TURNS) {
                this.fail('limit-exceeded');
                return undefined;
            }
            this.beginTurn();
            this.currentScope = key;
            entry = { thread, turn, ambiguous: false, foreignContexts: [], items: new Map(), responses: new Set() };
            this.turns.set(key, entry);
        }
        return entry;
    }
    ambiguous(t) {
        t.ambiguous = true;
        t.items.clear();
        const threadAlias = alias('thread', t.thread), turnAlias = alias('turn', t.turn);
        if (this.currentScope === scope(t.thread, t.turn)) {
            this.current = undefined;
            this.currentStage = 'unknown';
            this.reason = 'ambiguous-context';
        }
        // Later contradictory native evidence retracts the facts for this turn as well.
        for (let i = this.records.length - 1; i >= 0; i--) {
            if (this.records[i].threadAlias === threadAlias && this.records[i].turnAlias === turnAlias)
                this.records.splice(i, 1);
        }
    }
    consume(event) {
        if (!this.connected || this.disabled || !codexRecallObject(event) || typeof event.method !== 'string' || !codexRecallObject(event.params))
            return;
        const p = event.params;
        if (['thread/compacted', 'thread/rolledBack', 'thread/resumed'].includes(event.method)
            || (event.method === 'item/completed' && codexRecallObject(p.item) && p.item.type === 'contextCompaction')) {
            this.invalidate();
            return;
        }
        if (this.runtime !== CODEX_RECALL_OBSERVER_VERSION)
            return;
        const thread = p.threadId;
        const turnId = ['turn/started', 'turn/completed'].includes(event.method) && codexRecallObject(p.turn) ? p.turn.id : p.turnId;
        if (!opaque(thread) || !opaque(turnId))
            return;
        const key = scope(thread, turnId);
        if (event.method === 'turn/started') {
            this.beginTurn();
            this.currentScope = key;
            return;
        }
        if (event.method === 'turn/completed') {
            this.turns.delete(key);
            this.closed.add(key);
            if (this.closed.size + this.invalidated.size > 256)
                this.fail('limit-exceeded');
            return;
        }
        if (!['hook/started', 'hook/completed', 'rawResponseItem/completed', 'rawResponse/completed'].includes(event.method))
            return;
        const t = this.turn(thread, turnId, event.method === 'hook/started');
        if (t === undefined)
            return;
        if (event.method.startsWith('hook/')) {
            if (!codexRecallObject(p.run))
                return;
            const run = p.run;
            const own = this.handler !== undefined && run.sourcePath === this.handler.sourcePath && run.source === this.handler.source
                && run.displayOrder === this.handler.displayOrder && run.id === this.handler.runId && run.eventName === 'userPromptSubmit'
                && run.handlerType === 'command' && run.executionMode === 'sync' && run.scope === 'turn';
            if (event.method === 'hook/started') {
                if (own && run.status === 'running') {
                    if (t.ownRun !== undefined)
                        this.ambiguous(t);
                    else
                        t.ownRun = run.id;
                }
                return;
            }
            if (run.status === 'blocked' || run.status === 'failed' || run.status === 'cancelled') {
                this.ambiguous(t);
                return;
            }
            if (run.status !== 'completed' || !Array.isArray(run.entries))
                return;
            const texts = run.entries.flatMap(v => codexRecallObject(v) && v.kind === 'context' && typeof v.text === 'string' ? [v.text] : []);
            if (own && run.id === t.ownRun) {
                if (t.frame !== undefined) {
                    this.ambiguous(t);
                    return;
                }
                else
                    t.frame = texts.length === 1 ? parseCodexRecallFrame(texts[0], this.nonce) : undefined;
                if (this.currentScope === key) {
                    this.currentStage = 'hook-completed';
                    this.reason = t.frame === undefined ? 'context-unavailable' : 'pending';
                }
            }
            else {
                if (texts.length + t.foreignContexts.length > CODEX_RECALL_OBSERVER_MAX_ITEMS) {
                    this.fail('limit-exceeded');
                    return;
                }
                t.foreignContexts.push(...texts);
                if (t.frame !== undefined && texts.some(c => c.includes(t.frame.context) || t.frame.segments.some(s => c.includes(s.bytes))))
                    this.ambiguous(t);
            }
            this.checkMemory();
            return;
        }
        if (t.ambiguous || t.frame === undefined)
            return;
        if (event.method === 'rawResponseItem/completed') {
            const item = p.item;
            if (!codexRecallObject(item) || item.type !== 'message' || item.role !== 'developer' || !opaque(item.id)
                || !codexRecallObject(item.internal_chat_message_metadata_passthrough) || !Array.isArray(item.content))
                return;
            const meta = item.internal_chat_message_metadata_passthrough;
            if (meta.turn_id !== turnId || !Array.isArray(meta.content_item_kinds) || !meta.content_item_kinds.includes('hooks.additional_context'))
                return;
            if (item.content.some(c => !codexRecallObject(c) || c.type !== 'input_text' || typeof c.text !== 'string'))
                return;
            const text = item.content.map(c => c.text).join('');
            if (t.items.has(item.id) || t.items.size >= CODEX_RECALL_OBSERVER_MAX_ITEMS) {
                this.ambiguous(t);
                return;
            }
            const frame = t.frame;
            // Same bytes in a sibling context make attribution ambiguous, including identical frames.
            if (t.foreignContexts.some(c => c.includes(frame.context) || frame.segments.some(s => c.includes(s.bytes)))) {
                this.ambiguous(t);
                return;
            }
            const full = once(text, frame.context);
            const kept = frame.segments.filter(s => once(text, s.bytes));
            if (!full && kept.length === 0) {
                this.reason = 'context-unavailable';
                return;
            }
            t.items.set(item.id, { digest: codexRecallDigest(text), coverage: full ? 'full' : 'partial',
                ids: kept.flatMap(s => s.id === undefined ? [] : [s.id]),
                missing: frame.segments.filter(s => s.id !== undefined && !kept.includes(s)).map(s => s.id),
                unaddressableCount: frame.segments.filter(s => s.id === undefined).length });
            if (this.currentScope === key) {
                this.currentStage = 'context-recorded';
                this.reason = 'attribution-unavailable';
            }
            return;
        }
        if (!opaque(p.responseId) || t.responses.has(p.responseId))
            return;
        if (this.currentScope === key) {
            this.current = undefined;
            this.currentStage = t.items.size > 0 ? 'context-recorded' : 'hook-completed';
        }
        if (t.responses.size >= CODEX_RECALL_OBSERVER_MAX_ITEMS) {
            this.fail('limit-exceeded');
            return;
        }
        t.responses.add(p.responseId);
        const usage = codexRecallObject(p.usageMetadata) && codexRecallObject(p.usageMetadata.metadata) ? p.usageMetadata.metadata : undefined;
        const items = usage !== undefined && codexRecallObject(usage.attribution) && codexRecallObject(usage.attribution.items) ? usage.attribution.items : undefined;
        if (items === undefined) {
            if (this.currentScope === key)
                this.reason = 'attribution-unavailable';
            return;
        }
        for (const [id, retained] of t.items) {
            const entry = items[id];
            const tokens = codexRecallObject(entry) ? entry.input_tokens : undefined;
            if (typeof tokens !== 'number' || !Number.isSafeInteger(tokens) || tokens <= 0)
                continue;
            const record = { epoch: this.epoch, threadAlias: alias('thread', thread), turnAlias: alias('turn', turnId),
                itemAlias: alias('item', id), responseAlias: alias('response', p.responseId), eventId: t.frame.eventId,
                contextItemInputTokens: tokens, contextDigest: retained.digest, coverage: retained.coverage,
                completeLessonIds: [...retained.ids], unknownLessonIds: [...retained.missing], unaddressableCount: retained.unaddressableCount };
            this.records.push(record);
            if (this.records.length > CODEX_RECALL_OBSERVER_MAX_RECORDS)
                this.records.shift();
            if (this.currentScope === key) {
                this.current = record;
                this.currentStage = 'accounted-input';
            }
        }
    }
    checkMemory() {
        let bytes = 0;
        for (const t of this.turns.values())
            bytes += Buffer.byteLength(t.frame?.context ?? '')
                + (t.frame?.segments.reduce((n, s) => n + Buffer.byteLength(s.bytes), 0) ?? 0)
                + t.foreignContexts.reduce((n, s) => n + Buffer.byteLength(s), 0);
        if (bytes > CODEX_RECALL_OBSERVER_MAX_RETAINED_BYTES)
            this.fail('limit-exceeded');
    }
}
//# sourceMappingURL=codex-recall-observer.js.map
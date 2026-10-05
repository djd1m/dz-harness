/** Local hook facts only: bounded private storage, exact-session reads, no host acknowledgment. */
import { createHash, randomBytes } from 'node:crypto';
import { closeSync, constants, fstatSync, lstatSync, mkdirSync, openSync, readFileSync, readSync, realpathSync, renameSync, unlinkSync, writeFileSync, } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { homedir } from 'node:os';
import { withProjectLockSync } from './named-lock.js';
export const RECALL_OBSERVATION_MAX_BYTES = 65_536;
export const RECALL_OBSERVATION_MAX_SESSIONS = 32;
export const RECALL_OBSERVATION_MAX_ITEMS = 16;
export const RECALL_OBSERVATION_TTL_MS = 24 * 60 * 60 * 1000;
export const RECALL_OBSERVATION_CLOCK_SKEW_MS = 30_000;
export const RECALL_EMISSION_TIMEOUT_MS = 50;
const SNAPSHOT = 'recall-observation.json';
const TEMP = '.recall-observation.tmp';
const ALIAS = /^[a-f0-9]{32}$/;
const LESSON_ID = /^teach:[a-f0-9]{16}$/;
const hostUnknown = () => ({ state: 'unknown', reason: 'host-ack-unavailable' });
const object = (value) => typeof value === 'object' && value !== null && !Array.isArray(value);
const integer = (value) => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
const opaque = (value) => typeof value === 'string' && value.length > 0 && Buffer.byteLength(value) <= 512 && !/[\x00-\x1f\x7f-\x9f]/u.test(value);
const producer = (value) => value === 'claude-hook' || value === 'codex-hook';
const alias = (domain, ...values) => createHash('sha256').update(JSON.stringify([domain, ...values])).digest('hex').slice(0, 32);
const epoch = (value, now) => integer(value) && value <= now + RECALL_OBSERVATION_CLOCK_SKEW_MS;
const reasons = ['pending', 'daemon-unavailable', 'core-unavailable', 'selection-failed', 'telemetry-unavailable',
    'session-unavailable', 'project-unavailable', 'store-unavailable', 'observation-unavailable', 'invalid-selector', 'turn-mismatch',
    'stale', 'unsafe-source', 'unreadable', 'corrupt', 'oversize'];
/** Find an invoking project without crossing its repository boundary or the home directory. */
export function resolveRecallObservationProjectRoot(start) {
    try {
        let root = realpathSync(resolve(start));
        const home = realpathSync(homedir());
        for (let i = 0; i < 64; i++) {
            if (root === home)
                return undefined;
            // A present but unsafe store is also a fence; begin/read reject it without a parent fallback.
            try {
                lstatSync(join(root, '.dz'));
                return root;
            }
            catch (error) {
                if (error.code !== 'ENOENT')
                    return undefined;
            }
            // Any present .git is an attribution fence, even when HEAD/gitdir is malformed.
            // This observation boundary does not activate recall or validate a repository.
            try {
                const isRepoBoundary = lstatSync(join(root, '.git'));
                if (isRepoBoundary)
                    return root;
            }
            catch (error) {
                if (error.code !== 'ENOENT')
                    return undefined;
            }
            const parent = dirname(root);
            if (parent === root)
                return undefined;
            root = parent;
        }
    }
    catch { /* unresolved input is unknown */ }
    return undefined;
}
/** Raw session identity never enters storage; a tuple is domain-separated and unambiguous. */
export function recallSessionAlias(projectRoot, runtime, sessionId) {
    try {
        return producer(runtime) && opaque(sessionId) ? alias('recall-session-v1', alias('recall-project-v1', realpathSync(projectRoot)), runtime, sessionId) : undefined;
    }
    catch {
        return undefined;
    }
}
function unknown(reason, projectAlias, sessionAlias) {
    return { version: 1, availability: 'unknown', reason,
        ...(projectAlias === undefined ? {} : { projectAlias }), ...(sessionAlias === undefined ? {} : { sessionAlias }),
        selected: { state: 'unknown', reason }, emitted: { state: 'unknown', reason: 'telemetry-unavailable' }, hostConfirmation: hostUnknown() };
}
class SourceError extends Error {
    reason;
    constructor(reason) {
        super(reason);
        this.reason = reason;
    }
}
function directory(path) {
    const stat = lstatSync(path);
    if (!stat.isDirectory() || stat.isSymbolicLink() || realpathSync(path) !== path)
        throw new SourceError('unsafe-source');
}
function store(root) {
    const path = join(root, '.dz');
    try {
        directory(path);
    }
    catch (error) {
        if (error instanceof SourceError)
            throw error;
        throw new SourceError(error.code === 'ENOENT' ? 'store-unavailable' : 'unreadable');
    }
    return path;
}
function privateFile(stat) {
    if (!stat.isFile() || stat.isSymbolicLink() || (stat.mode & 0o077) !== 0)
        throw new SourceError('unsafe-source');
    if (stat.size > RECALL_OBSERVATION_MAX_BYTES)
        throw new SourceError('oversize');
}
function boundedRead(path) {
    let fd;
    try {
        try {
            privateFile(lstatSync(path));
        }
        catch (error) {
            if (error.code === 'ENOENT')
                return undefined;
            throw error;
        }
        fd = openSync(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
        privateFile(fstatSync(fd));
        const buffer = Buffer.alloc(RECALL_OBSERVATION_MAX_BYTES + 1);
        let bytes = 0;
        while (bytes < buffer.length) {
            const n = readSync(fd, buffer, bytes, buffer.length - bytes, null);
            if (n === 0)
                break;
            bytes += n;
        }
        if (bytes > RECALL_OBSERVATION_MAX_BYTES)
            throw new SourceError('oversize');
        return buffer.subarray(0, bytes).toString('utf8');
    }
    catch (error) {
        if (error instanceof SourceError)
            throw error;
        throw new SourceError('unreadable');
    }
    finally {
        if (fd !== undefined)
            closeSync(fd);
    }
}
function selection(value) {
    if (!object(value))
        return undefined;
    if (value.state === 'unknown' && reasons.includes(value.reason))
        return { state: 'unknown', reason: value.reason };
    if (value.state !== 'known' || !integer(value.count) || value.count > RECALL_OBSERVATION_MAX_ITEMS
        || !integer(value.unaddressableCount) || !Array.isArray(value.items) || value.items.length > RECALL_OBSERVATION_MAX_ITEMS
        || value.count !== value.items.length + value.unaddressableCount
        || !['selected-by-policy', 'selection-empty', 'no-candidates', 'empty-prompt'].includes(String(value.reason))
        || (value.count > 0) !== (value.reason === 'selected-by-policy')
        || (value.quarantinedExcluded !== undefined && !integer(value.quarantinedExcluded)))
        return undefined;
    const items = [];
    for (const item of value.items) {
        if (!object(item) || typeof item.id !== 'string' || !LESSON_ID.test(item.id) || item.reason !== 'selected-by-policy')
            return undefined;
        items.push({ id: item.id, reason: 'selected-by-policy' });
    }
    return { state: 'known', count: value.count, items, unaddressableCount: value.unaddressableCount, reason: value.reason,
        ...(value.quarantinedExcluded === undefined ? {} : { quarantinedExcluded: value.quarantinedExcluded }) };
}
function emission(value, selected, eventId) {
    if (!object(value))
        return undefined;
    if (value.state === 'unknown' && ['pending', 'emit-failed', 'telemetry-unavailable'].includes(String(value.reason)))
        return { state: 'unknown', reason: value.reason };
    if (value.state === 'not-emitted' && selected.state === 'known' && value.count === 0 && ['no-selected-context', 'render-failed'].includes(String(value.reason)))
        return { state: 'not-emitted', count: 0, reason: value.reason };
    if (value.state === 'emitted' && selected.state === 'known' && selected.count > 0 && value.count === selected.count && value.eventId === eventId)
        return { state: 'emitted', count: selected.count, eventId };
    return undefined;
}
function slot(value, projectAlias, now) {
    if (!object(value) || value.projectAlias !== projectAlias || !producer(value.producer)
        || typeof value.sessionAlias !== 'string' || !ALIAS.test(value.sessionAlias)
        || typeof value.eventId !== 'string' || !ALIAS.test(value.eventId)
        || !integer(value.sequence) || value.sequence === 0 || !epoch(value.startedAt, now) || !epoch(value.updatedAt, now)
        || value.updatedAt < value.startedAt)
        return undefined;
    for (const key of ['turnAlias', 'knowledgeStoreAlias'])
        if (value[key] !== undefined && (typeof value[key] !== 'string' || !ALIAS.test(value[key])))
            return undefined;
    const selected = selection(value.selected);
    const emitted = selected === undefined ? undefined : emission(value.emitted, selected, value.eventId);
    if (selected === undefined || emitted === undefined)
        return undefined;
    return { projectAlias, producer: value.producer, sessionAlias: value.sessionAlias, eventId: value.eventId,
        sequence: value.sequence, startedAt: value.startedAt, updatedAt: value.updatedAt,
        ...(value.turnAlias === undefined ? {} : { turnAlias: value.turnAlias }),
        ...(value.knowledgeStoreAlias === undefined ? {} : { knowledgeStoreAlias: value.knowledgeStoreAlias }), selected, emitted };
}
function snapshot(text, projectAlias, now) {
    if (text === undefined)
        return { version: 1, sequence: 0, slots: [] };
    try {
        const value = JSON.parse(text);
        if (!object(value) || value.version !== 1 || !integer(value.sequence) || !Array.isArray(value.slots) || value.slots.length > RECALL_OBSERVATION_MAX_SESSIONS)
            throw new SourceError('corrupt');
        const slots = [];
        for (const raw of value.slots) {
            const parsed = slot(raw, projectAlias, now);
            if (parsed === undefined || parsed.sequence > value.sequence || slots.some(s => s.sessionAlias === parsed.sessionAlias || s.sequence === parsed.sequence || s.eventId === parsed.eventId))
                throw new SourceError('corrupt');
            slots.push(parsed);
        }
        return { version: 1, sequence: value.sequence, slots };
    }
    catch (error) {
        if (error instanceof SourceError)
            throw error;
        throw new SourceError('corrupt');
    }
}
function transaction(projectRoot, now, action) {
    if (!integer(now))
        throw new SourceError('corrupt');
    const root = realpathSync(projectRoot);
    const dir = store(root);
    const lockDir = join(dir, 'locks');
    try {
        directory(lockDir);
    }
    catch (error) {
        if (error.code !== 'ENOENT')
            throw error;
        mkdirSync(lockDir, { mode: 0o700 });
        directory(lockDir);
    }
    const projectAlias = alias('recall-project-v1', root);
    return withProjectLockSync(root, 'recall-observation', () => {
        directory(dir);
        directory(lockDir);
        const current = snapshot(boundedRead(join(dir, SNAPSHOT)), projectAlias, now);
        const result = action(current, projectAlias);
        if (result.next === undefined)
            return result.value;
        const text = JSON.stringify(result.next) + '\n';
        if (Buffer.byteLength(text) > RECALL_OBSERVATION_MAX_BYTES)
            throw new SourceError('oversize');
        const temp = join(dir, TEMP);
        try {
            privateFile(lstatSync(temp));
            unlinkSync(temp);
        }
        catch (error) {
            if (error.code !== 'ENOENT')
                throw error;
        }
        const fd = openSync(temp, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | (constants.O_NOFOLLOW ?? 0), 0o600);
        try {
            writeFileSync(fd, text, 'utf8');
        }
        finally {
            closeSync(fd);
        }
        directory(dir);
        renameSync(temp, join(dir, SNAPSHOT));
        return result.value;
    }, { timeoutMs: 1, pollMs: 1 });
}
/** Throws on telemetry failure; generated hooks swallow only at their observation boundary. */
export function beginRecallObservation(projectRoot, input, now = Date.now()) {
    if (!producer(input.producer) || !opaque(input.sessionId) || (input.turnId !== undefined && !opaque(input.turnId)))
        return undefined;
    const root = realpathSync(projectRoot);
    const projectAlias = alias('recall-project-v1', root);
    const sessionAlias = recallSessionAlias(root, input.producer, input.sessionId);
    const turnAlias = input.turnId === undefined ? undefined : alias('recall-turn-v1', projectAlias, input.producer, sessionAlias, input.turnId);
    let knowledgeStoreAlias;
    if (input.knowledgeStoreRoot !== undefined)
        knowledgeStoreAlias = alias('recall-store-v1', projectAlias, realpathSync(input.knowledgeStoreRoot));
    return transaction(root, now, current => {
        if (current.sequence === Number.MAX_SAFE_INTEGER)
            throw new SourceError('telemetry-unavailable');
        const sequence = current.sequence + 1;
        const eventId = randomBytes(16).toString('hex');
        const entry = { projectAlias, producer: input.producer, sessionAlias, sequence, eventId, startedAt: now, updatedAt: now,
            ...(turnAlias === undefined ? {} : { turnAlias }), ...(knowledgeStoreAlias === undefined ? {} : { knowledgeStoreAlias }),
            selected: { state: 'unknown', reason: 'pending' }, emitted: { state: 'unknown', reason: 'pending' } };
        const kept = current.slots.filter(s => s.sessionAlias !== sessionAlias && now - s.updatedAt <= RECALL_OBSERVATION_TTL_MS).sort((a, b) => a.sequence - b.sequence);
        if (kept.length >= RECALL_OBSERVATION_MAX_SESSIONS)
            kept.shift();
        return { value: { projectAlias, producer: input.producer, sessionAlias, sequence, eventId }, next: { version: 1, sequence, slots: [...kept, entry] } };
    });
}
function update(projectRoot, event, now, change) {
    return transaction(projectRoot, now, (current, projectAlias) => {
        const entry = current.slots.find(s => projectAlias === event.projectAlias && s.sessionAlias === event.sessionAlias
            && s.producer === event.producer && s.eventId === event.eventId && s.sequence === event.sequence);
        if (entry === undefined || now < entry.updatedAt || now - entry.updatedAt > RECALL_OBSERVATION_TTL_MS)
            return { value: false };
        const next = change(entry);
        if (next === undefined)
            return { value: false };
        return { value: true, next: { version: 1, sequence: current.sequence, slots: current.slots.map(s => s === entry ? { ...next, updatedAt: now } : s) } };
    });
}
export function updateRecallSelection(projectRoot, event, input, now = Date.now()) {
    let selected;
    if ('unknown' in input) {
        if (!['daemon-unavailable', 'core-unavailable', 'selection-failed'].includes(input.unknown))
            throw new SourceError('corrupt');
        selected = { state: 'unknown', reason: input.unknown };
    }
    else {
        if (!Array.isArray(input.hits) || input.hits.length > RECALL_OBSERVATION_MAX_ITEMS)
            throw new SourceError('oversize');
        const items = input.hits.flatMap(h => object(h) && typeof h.dzId === 'string' && LESSON_ID.test(h.dzId)
            ? [{ id: h.dzId, reason: 'selected-by-policy' }] : []);
        const normalized = selection({ state: 'known', count: input.hits.length, items, unaddressableCount: input.hits.length - items.length,
            reason: input.hits.length > 0 ? 'selected-by-policy' : input.reason ?? 'selection-empty',
            ...(input.quarantinedExcluded === undefined ? {} : { quarantinedExcluded: input.quarantinedExcluded }) });
        if (normalized === undefined)
            throw new SourceError('corrupt');
        selected = normalized;
    }
    return update(projectRoot, event, now, current => current.selected.state === 'unknown' && current.selected.reason === 'pending'
        ? { ...current, selected, emitted: selected.state === 'known' && selected.count === 0
                ? { state: 'not-emitted', count: 0, reason: 'no-selected-context' } : current.emitted } : undefined);
}
export function updateRecallEmission(projectRoot, event, result, now = Date.now()) {
    return update(projectRoot, event, now, current => {
        if (current.emitted.state !== 'unknown' || current.emitted.reason !== 'pending'
            || (current.selected.state === 'unknown' && current.selected.reason === 'pending'))
            return undefined;
        if (result === 'emitted')
            return current.selected.state === 'known' && current.selected.count > 0
                ? { ...current, emitted: { state: 'emitted', count: current.selected.count, eventId: current.eventId } } : undefined;
        if (result === 'render-failed' || result === 'no-selected-context')
            return current.selected.state === 'known'
                ? { ...current, emitted: { state: 'not-emitted', count: 0, reason: result } } : undefined;
        return result === 'emit-failed' ? { ...current, emitted: { state: 'unknown', reason: 'emit-failed' } } : undefined;
    });
}
/** No locks, pruning, directory creation, database opens or host assertion imports. */
export function readRecallObservation(projectRoot, selector = {}, now = Date.now()) {
    let projectAlias;
    let sessionAlias;
    try {
        const root = realpathSync(projectRoot);
        projectAlias = alias('recall-project-v1', root);
        if (selector.sessionAlias !== undefined) {
            if (!ALIAS.test(selector.sessionAlias))
                return unknown('invalid-selector', projectAlias);
            sessionAlias = selector.sessionAlias;
        }
        else {
            if (!producer(selector.producer) || !opaque(selector.sessionId))
                return unknown('session-unavailable', projectAlias);
            sessionAlias = recallSessionAlias(root, selector.producer, selector.sessionId);
        }
        if (!integer(now))
            return unknown('corrupt', projectAlias, sessionAlias);
        const dir = store(root);
        const current = snapshot(boundedRead(join(dir, SNAPSHOT)), projectAlias, now);
        const entry = current.slots.find(s => s.sessionAlias === sessionAlias);
        if (entry === undefined)
            return unknown('observation-unavailable', projectAlias, sessionAlias);
        if (selector.turnId !== undefined) {
            if (!opaque(selector.turnId))
                return unknown('invalid-selector', projectAlias, sessionAlias);
            if (entry.turnAlias !== alias('recall-turn-v1', projectAlias, entry.producer, entry.sessionAlias, selector.turnId))
                return unknown('turn-mismatch', projectAlias, sessionAlias);
        }
        if (now - entry.updatedAt > RECALL_OBSERVATION_TTL_MS)
            return unknown('stale', projectAlias, sessionAlias);
        // Construct every exposed field. Stored positive-confirmation or arbitrary keys never escape.
        return { version: 1, availability: 'observed', reason: 'last-observed', projectAlias, producer: entry.producer,
            sessionAlias: entry.sessionAlias, eventId: entry.eventId, startedAt: entry.startedAt, updatedAt: entry.updatedAt,
            ...(entry.turnAlias === undefined ? {} : { turnAlias: entry.turnAlias }),
            ...(entry.knowledgeStoreAlias === undefined ? {} : { knowledgeStoreAlias: entry.knowledgeStoreAlias }),
            selected: entry.selected, emitted: entry.emitted, hostConfirmation: hostUnknown() };
    }
    catch (error) {
        return unknown(error instanceof SourceError ? error.reason : 'project-unavailable', projectAlias, sessionAlias);
    }
}
/** Pure renderer tolerates hostile callers; it never renders caller-provided acknowledgment. */
export function renderRecallObservationLine(observation) {
    const value = object(observation) && observation.availability === 'observed' ? observation : undefined;
    const selected = value === undefined ? undefined : selection(value.selected);
    const emitted = value !== undefined && typeof value.eventId === 'string' && ALIAS.test(value.eventId) && selected !== undefined
        ? emission(value.emitted, selected, value.eventId) : undefined;
    return `Recall (last observed): selected ${selected?.state === 'known' ? selected.count : 'unknown'} | emitted ${emitted?.state === 'emitted' || emitted?.state === 'not-emitted' ? emitted.count : 'unknown'} | host-confirmed unknown`;
}
export function renderRecallObservationDetails(observation) {
    if (observation.availability !== 'observed')
        return [renderRecallObservationLine(observation), `Recall diagnostic: ${observation.reason} | host-ack-unavailable`];
    return [renderRecallObservationLine(observation),
        `Recall report: ${new Date(observation.updatedAt).toISOString()} | ${observation.producer} | session ${observation.sessionAlias}`,
        `Recall reasons: ${observation.selected.reason} | ${observation.emitted.state === 'emitted' ? 'stdout-callback-completed' : observation.emitted.reason} | host-ack-unavailable`,
        ...(observation.selected.state === 'known' ? [`Recall IDs: ${observation.selected.items.map(item => item.id).join(', ') || 'none'} | unaddressable ${observation.selected.unaddressableCount}${observation.selected.quarantinedExcluded === undefined ? '' : ` | quarantined excluded ${observation.selected.quarantinedExcluded}`}`] : [])];
}
/** A write's boolean return says backpressure, never completion; deadline/error remains unknown. */
export function writeRecallEnvelope(text, sink = process.stdout, timeoutMs = RECALL_EMISSION_TIMEOUT_MS) {
    return new Promise(resolve => {
        let settled = false;
        let timer;
        const finish = (result) => {
            if (settled)
                return;
            settled = true;
            if (timer !== undefined)
                clearTimeout(timer);
            sink.off?.('error', failed);
            resolve(result);
        };
        const failed = () => finish('emit-failed');
        try {
            sink.on?.('error', failed);
            timer = setTimeout(() => finish('pending'), Number.isFinite(timeoutMs) && timeoutMs > 0 ? Math.min(timeoutMs, 1000) : RECALL_EMISSION_TIMEOUT_MS);
            sink.write(text, error => finish(error ? 'emit-failed' : 'emitted'));
        }
        catch {
            finish('emit-failed');
        }
    });
}
//# sourceMappingURL=recall-observation.js.map
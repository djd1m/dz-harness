/** Native QE is surviving local evidence, not reviewer authentication or an atomic repo snapshot. */
import { closeSync, constants, fstatSync, fsyncSync, lstatSync, mkdirSync, openSync, readSync, opendirSync, realpathSync, renameSync, writeSync } from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import { join, relative } from 'node:path';
import { performance } from 'node:perf_hooks';
import { withDirLockSync } from './named-lock.js';
export const NATIVE_QE_HISTORY_API_VERSION = 1;
const ceiling = 3;
const sha = (value) => createHash('sha256').update(value).digest('hex');
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const hash = (v) => typeof v === 'string' && /^[a-f0-9]{64}$/.test(v);
const uuid = (v) => typeof v === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(v);
const text = (v) => typeof v === 'string' && v.length > 0 && v.length <= 65536;
const record = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const shape = (v, keys) => record(v) && Object.keys(v).length === keys.length && keys.every(k => Object.hasOwn(v, k));
const fail = (reason) => { throw Error(reason); };
function present(path) { try {
    lstatSync(path);
    return true;
}
catch (e) {
    if (e.code === 'ENOENT')
        return false;
    throw e;
} }
function snapshotValid(v) {
    if (!shape(v, ['nonce', 'revision', 'manifest']) || !record(v) || !text(v.nonce) || !hash(v.revision) || !Array.isArray(v.manifest) || v.manifest.length > 256)
        return false;
    const paths = new Set();
    for (const p of v.manifest) {
        if (!shape(p, ['path', 'digest']) || !record(p) || !text(p.path) || p.path.startsWith('/') || /[\\\x00-\x1f]/.test(p.path) || p.path.split('/').some(s => !s || s === '.' || s === '..') || paths.has(p.path) || !(p.digest === null || hash(p.digest)))
            return false;
        paths.add(p.path);
    }
    return sha(JSON.stringify(v.manifest)) === v.revision;
}
function resultValid(v, snapshot) {
    const required = ['schema', 'phase', 'verdict', 'revision', 'unresolved', 'reasons'];
    const allowed = required.concat(['nonce', 'manifest', 'reviewers', 'conditions', 'checkpointDigest', 'checkpointClosure']);
    if (!record(v) || !required.every(k => Object.hasOwn(v, k)) || Object.keys(v).some(k => !allowed.includes(k)) || v.schema !== 'fa-review-convergence-1' || v.phase !== 'qe' || !['prepared', 'closed', 'unresolved', 'not-established'].includes(String(v.verdict)) || v.revision !== snapshot.revision)
        return false;
    if (![v.unresolved, v.reasons].every(a => Array.isArray(a) && a.length <= 512 && a.every(text)))
        return false;
    if (v.verdict === 'prepared')
        return Object.keys(v).length === required.length + 5 && v.nonce === snapshot.nonce && same(v.manifest, snapshot.manifest) && Array.isArray(v.reviewers) && v.reviewers.length > 0 && v.reviewers.length <= 16 && v.reviewers.every(r => shape(r, ['id', 'family']) && text(r.id) && ['codex', 'claude', 'owner-exception'].includes(r.family)) && new Set(v.reviewers.map(r => r.id)).size === v.reviewers.length && Array.isArray(v.conditions) && v.conditions.length <= 512 && (v.checkpointDigest === null || hash(v.checkpointDigest));
    if (Object.hasOwn(v, 'checkpointClosure')) {
        const c = v.checkpointClosure;
        return v.verdict === 'closed' && Object.keys(v).length === required.length + 1 && shape(c, ['checkpointDigest', 'checkpoint', 'revision']) && record(c) && hash(c.checkpointDigest) && record(c.checkpoint) && c.revision === snapshot.revision;
    }
    return Object.keys(v).length === required.length;
}
function hostValid(v, snapshot) {
    return shape(v, ['schema', 'phase', 'reviewers', 'snapshot', 'conditions', 'reviewSeen', 'rework', 'changedPaths']) && record(v) && v.schema === 'fa-review-convergence-1' && v.phase === 'qe' && same(v.snapshot, snapshot) && Array.isArray(v.reviewers) && v.reviewers.length > 0 && v.reviewers.length <= 16 && v.reviewers.every(r => shape(r, ['id', 'family']) && text(r.id) && ['codex', 'claude', 'owner-exception'].includes(r.family)) && new Set(v.reviewers.map(r => r.id)).size === v.reviewers.length && Array.isArray(v.conditions) && v.conditions.length <= 512 && typeof v.reviewSeen === 'boolean' && typeof v.rework === 'boolean' && Array.isArray(v.changedPaths) && v.changedPaths.length <= 256 && v.changedPaths.every(text);
}
// Bounded descriptor reads also reject FIFOs, symlinks and replacement during open.
function readBounded(file, limit) {
    if (!present(file))
        return null;
    const st = lstatSync(file);
    if (!st.isFile() || st.isSymbolicLink())
        return fail('unsafe-native-file:' + file);
    if (st.size > limit)
        return fail('native-file-limit:' + file);
    const fd = openSync(file, constants.O_RDONLY | constants.O_NOFOLLOW);
    try {
        const opened = fstatSync(fd);
        if (!opened.isFile() || opened.ino !== st.ino || opened.dev !== st.dev)
            return fail('native-file-changed:' + file);
        const data = Buffer.alloc(limit + 1);
        let n = 0;
        while (n <= limit) {
            const got = readSync(fd, data, n, data.length - n, null);
            if (!got)
                break;
            n += got;
        }
        if (n > limit)
            return fail('native-file-limit:' + file);
        return data.subarray(0, n);
    }
    finally {
        closeSync(fd);
    }
}
function names(dir) {
    if (!present(dir))
        return [];
    if (!lstatSync(dir).isDirectory() || lstatSync(dir).isSymbolicLink())
        return fail('unsafe-native-directory:' + dir);
    const items = [], fd = opendirSync(dir);
    try {
        let entry;
        while ((entry = fd.readSync())) {
            items.push(entry.name);
            if (items.length > 256)
                return fail('native-directory-candidate-limit:' + dir);
        }
    }
    finally {
        fd.closeSync();
    }
    return items.sort();
}
function syncDir(dir) {
    const fd = openSync(dir, constants.O_RDONLY);
    try {
        fsyncSync(fd);
    }
    finally {
        closeSync(fd);
    }
}
function writeAll(fd, bytes) {
    let offset = 0;
    while (offset < bytes.length) {
        const n = writeSync(fd, bytes, offset, bytes.length - offset);
        if (!n)
            fail('native-short-write');
        offset += n;
    }
}
function publish(file, bytes, fault, label) {
    const tmp = file + '.' + randomUUID() + '.tmp';
    fault(label + '-open');
    const fd = openSync(tmp, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
    try {
        fault(label + '-write');
        writeAll(fd, bytes);
        fault(label + '-fsync');
        fsyncSync(fd);
    }
    finally {
        closeSync(fd);
    }
    fault(label + '-rename');
    renameSync(tmp, file);
    fault(label + '-directory-fsync');
    syncDir(join(file, '..'));
}
/** A versioned capability supplied to the CLI-owned installed helper. No generic counter writes. */
export function createNativeQeHistoryApi(options) {
    if (!record(options) || Object.keys(options).some(k => !['projectRoot', 'featurePath', 'fault', 'now'].includes(k)))
        fail('native-factory-options-invalid');
    const projectRoot = realpathSync(options.projectRoot);
    const featurePath = realpathSync(options.featurePath);
    const rel = relative(projectRoot, featurePath);
    if (!rel || rel.startsWith('..') || rel.startsWith('/'))
        fail('native-feature-binding-invalid');
    const stateDir = join(featurePath, '.fa-state');
    const journal = join(stateDir, 'native-qe-history.jsonl');
    const headPath = join(stateDir, 'native-qe-head.json');
    const hostPath = join(stateDir, 'review-convergence-qe-host.json');
    const bridge = join(stateDir, 'qe-bridge');
    const now = options.now ?? (() => performance.now());
    const fault = options.fault ?? (() => { });
    const locations = { journal, head: headPath, host: hostPath, bridge };
    const collision = () => {
        const candidates = names(bridge).filter(n => /^(signoff-|failed-).*\.json$/.test(n));
        if (candidates.length && (present(journal) || present(headPath)))
            fail('native-bridge-source-collision:' + journal + ':' + bridge);
    };
    const replay = () => {
        collision();
        const fragments = names(stateDir).filter(n => /^native-qe-(history\.jsonl|head\.json)\..*\.tmp$/.test(n));
        if (fragments.length)
            fail('native-temporary-fragment:' + fragments.join(','));
        const jb = readBounded(journal, 8 * 1024 * 1024), hb = readBounded(headPath, 256 * 1024);
        if (!jb && !hb)
            return null;
        if (!jb || !hb)
            return fail('native-authority-missing:' + journal + ':' + headPath);
        if (!jb.length || jb[jb.length - 1] !== 10)
            return fail('native-journal-torn');
        let journalText;
        try {
            journalText = new TextDecoder('utf8', { fatal: true, ignoreBOM: true }).decode(jb);
        }
        catch {
            return fail('native-journal-invalid-utf8');
        }
        const lines = journalText.split('\n');
        lines.pop();
        if (lines.length > 1024)
            return fail('native-journal-event-limit');
        let head;
        try {
            head = JSON.parse(new TextDecoder('utf8', { fatal: true, ignoreBOM: true }).decode(hb));
        }
        catch {
            return fail('native-head-malformed');
        }
        if (!shape(head, ['schema', 'journalId', 'projectRoot', 'featurePath', 'ceiling', 'sequence', 'eventDigest', 'activeCycle', 'hostProjectionDigest']) || head.schema !== 'native-qe-head-1' || !uuid(head.journalId) || head.projectRoot !== projectRoot || head.featurePath !== featurePath || head.ceiling !== ceiling || !Number.isInteger(head.sequence) || !hash(head.eventDigest) || !uuid(head.activeCycle) || !hash(head.hostProjectionDigest))
            return fail('native-head-identity-invalid');
        const events = [], witnessed = new Set(), eventIds = new Set(), cycles = new Set();
        let roster = [];
        let previous, previousDigest = null;
        for (const line of lines) {
            let e;
            try {
                e = JSON.parse(line);
            }
            catch {
                return fail('native-journal-malformed');
            }
            if (!shape(e, ['schema', 'journalId', 'projectRoot', 'featurePath', 'ceiling', 'sequence', 'eventId', 'cycleId', 'previousDigest', 'kind', 'timestamp', 'nonce', 'revision', 'snapshot', 'hostProjectionDigest', 'origins', 'receiptDigest', 'reason', 'observationDigest', 'result']) || e.schema !== 'native-qe-history-1' || e.journalId !== head.journalId || e.projectRoot !== projectRoot || e.featurePath !== featurePath || e.ceiling !== ceiling || e.sequence !== events.length + 1 || !uuid(e.eventId) || eventIds.has(e.eventId) || !uuid(e.cycleId) || e.previousDigest !== previousDigest || !['prepare', 'evaluate', 'begin-repair'].includes(e.kind) || !text(e.timestamp) || new Date(e.timestamp).toISOString() !== e.timestamp || !snapshotValid(e.snapshot) || e.nonce !== e.snapshot.nonce || e.revision !== e.snapshot.revision || !hash(e.hostProjectionDigest) || !Array.isArray(e.origins) || e.origins.length > 16 || !e.origins.every(o => shape(o, ['reviewer', 'family']) && text(o.reviewer) && ['codex', 'claude', 'owner-exception'].includes(o.family)) || new Set(e.origins.map(o => o.reviewer)).size !== e.origins.length || !(e.receiptDigest === null || hash(e.receiptDigest)) || !(e.reason === null || text(e.reason)) || !hash(e.observationDigest) || !resultValid(e.result, e.snapshot))
                return fail('native-event-invalid');
            if ((e.kind === 'evaluate') === (e.result.verdict === 'prepared'))
                return fail('native-replayed-action-result-invalid');
            if (e.kind !== 'evaluate')
                roster = e.result.reviewers;
            if (e.origins.some(o => !roster.some(r => r.id === o.reviewer && r.family === o.family)))
                return fail('native-replayed-origin-roster-unbound');
            if (e.origins.length && (e.kind !== 'evaluate' || !e.receiptDigest || e.reason !== null))
                return fail('native-origin-invalid');
            if (!previous) {
                if (e.kind !== 'prepare' || e.origins.length)
                    return fail('native-initial-transition-invalid');
                cycles.add(e.cycleId);
            }
            else if (e.cycleId !== previous.cycleId) {
                if (e.kind !== 'begin-repair' || !witnessed.has(previous.cycleId) || cycles.has(e.cycleId) || witnessed.size >= ceiling || e.revision === previous.revision || e.origins.length)
                    return fail('native-repair-transition-invalid');
                cycles.add(e.cycleId);
            }
            else {
                if (e.kind === 'begin-repair' || (e.revision !== previous.revision && (e.kind !== 'prepare' || witnessed.has(e.cycleId))) || (e.revision === previous.revision && !same(e.snapshot, previous.snapshot)))
                    return fail('native-cycle-transition-invalid');
            }
            if (e.origins.length)
                witnessed.add(e.cycleId);
            eventIds.add(e.eventId);
            events.push(e);
            previous = e;
            previousDigest = sha(line);
        }
        if (!previous || head.sequence !== events.length || head.eventDigest !== previousDigest || head.activeCycle !== previous.cycleId || head.hostProjectionDigest !== previous.hostProjectionDigest)
            return fail('native-head-journal-gap');
        const host = readBounded(hostPath, 256 * 1024);
        if (!host || sha(host) !== head.hostProjectionDigest)
            return fail('native-host-projection-mismatch');
        let parsedHost;
        try {
            parsedHost = JSON.parse(new TextDecoder('utf8', { fatal: true, ignoreBOM: true }).decode(host));
        }
        catch {
            return fail('native-host-projection-malformed');
        }
        if (!hostValid(parsedHost, previous.snapshot))
            return fail('native-host-projection-invalid');
        return { head, events, active: previous, witnessed: witnessed.has(previous.cycleId), rounds: witnessed.size };
    };
    const summary = (s) => ({ source: 'native', history: 'complete', status: s.rounds >= ceiling ? 'at-or-over-ceiling' : 'under-ceiling', ceiling, rounds: s.rounds, failedAttempts: s.events.filter(e => e.reason !== null).map(e => ({ eventId: e.eventId, cycleId: e.cycleId, reason: e.reason })), journalId: s.head.journalId, cycleId: s.head.activeCycle, nonce: s.active.nonce, revision: s.active.revision, sequence: s.head.sequence, stopReason: s.rounds >= ceiling ? 'native-fixed-ceiling-reached' : null, locations });
    const refusal = (reason, partialCommit = false) => ({ source: 'native', history: 'incomplete', status: 'not-established', verdict: 'not-established', ceiling, reasons: [reason], notEstablishedReason: reason, partialCommit, locations });
    return {
        version: NATIVE_QE_HISTORY_API_VERSION, projectRoot, featurePath,
        read() {
            try {
                const s = replay();
                return s ? summary(s) : refusal('native-history-absent-not-zero');
            }
            catch (error) {
                return refusal(error.message);
            }
        },
        transact(action, observe) {
            if (!['prepare', 'evaluate', 'begin-repair'].includes(action))
                return refusal('native-action-invalid');
            let partialCommit = false;
            try {
                if (process.platform === 'win32' || constants.O_NOFOLLOW === undefined)
                    return refusal('native-durability-unsupported');
                if (present(stateDir) && (lstatSync(stateDir).isSymbolicLink() || !lstatSync(stateDir).isDirectory()))
                    return refusal('unsafe-native-state-directory');
                mkdirSync(stateDir, { recursive: true });
                // Prove directory fsync support before publishing any authority.
                try {
                    syncDir(stateDir);
                }
                catch (e) {
                    return refusal('native-durability-unsupported:' + String(e.code ?? 'fsync'));
                }
                const output = withDirLockSync(stateDir, 'native-qe-history', () => {
                    const started = now();
                    const s = replay();
                    const p = observe(s ? { snapshot: s.active.snapshot, witnessed: s.witnessed, rounds: s.rounds, cycleId: s.active.cycleId } : null);
                    if (!hash(p.observationDigest) || !snapshotValid(p.snapshot) || !hostValid(p.host, p.snapshot) || !resultValid(p.result, p.snapshot) || !Array.isArray(p.origins) || p.origins.length > 16 || !p.origins.every(o => shape(o, ['reviewer', 'family']) && text(o.reviewer) && ['codex', 'claude', 'owner-exception'].includes(o.family)) || new Set(p.origins.map(o => o.reviewer)).size !== p.origins.length || !(p.receiptDigest === null || hash(p.receiptDigest)) || !(p.reason === null || text(p.reason)) || p.origins.length && (!p.receiptDigest || p.reason !== null || action !== 'evaluate'))
                        fail('native-observation-invalid');
                    if ((action === 'evaluate') === (p.result.verdict === 'prepared'))
                        fail('native-action-result-invalid');
                    if (p.origins.some(o => !p.host.reviewers.some(r => r.id === o.reviewer && r.family === o.family)))
                        fail('native-origin-roster-unbound');
                    if (!s && (action !== 'prepare' || !p.admission))
                        fail('native-initial-admission-refused');
                    if (s && p.admission)
                        fail('native-existing-authority-cannot-bootstrap');
                    const changed = s && !same(p.snapshot.manifest, s.active.snapshot.manifest);
                    let cycleId = s?.active.cycleId ?? randomUUID();
                    if (s && action === 'begin-repair') {
                        if (!s.witnessed && !changed)
                            return { ...s.active.result, ...summary(s), verdict: 'prepared', replayed: true };
                        if (!s.witnessed)
                            fail('native-repair-predecessor-unwitnessed');
                        if (!changed)
                            fail('native-repair-delta-missing');
                        if (s.rounds >= ceiling)
                            fail('native-fourth-cycle-refused');
                        cycleId = randomUUID();
                    }
                    else if (s && changed && (s.witnessed || action !== 'prepare'))
                        fail('native-repair-required');
                    if (s && !changed && !same(p.snapshot, s.active.snapshot))
                        fail('native-admitted-snapshot-changed');
                    const hostBytes = Buffer.from(JSON.stringify(p.host, null, 2) + '\n');
                    if (hostBytes.length > 256 * 1024)
                        fail('native-host-limit');
                    const projection = sha(hostBytes);
                    const priorEvaluation = s && action === 'evaluate' ? [...s.events].reverse().find(e => e.kind === 'evaluate' && e.cycleId === cycleId && e.observationDigest === p.observationDigest && e.receiptDigest === p.receiptDigest && same(e.snapshot, p.snapshot)) : null;
                    if (s && priorEvaluation && projection === s.head.hostProjectionDigest)
                        return { ...priorEvaluation.result, ...summary(s), replayed: true };
                    if (s && action === s.active.kind && same(p.snapshot, s.active.snapshot) && p.receiptDigest === s.active.receiptDigest && projection === s.active.hostProjectionDigest && same(p.origins, s.active.origins) && p.reason === s.active.reason && p.observationDigest === s.active.observationDigest && same(p.result, s.active.result))
                        return { ...s.active.result, ...summary(s), replayed: true };
                    const identity = s ? { journalId: s.head.journalId, projectRoot, featurePath, ceiling } : { journalId: randomUUID(), projectRoot, featurePath, ceiling };
                    const e = { ...identity, schema: 'native-qe-history-1', sequence: (s?.head.sequence ?? 0) + 1, eventId: randomUUID(), cycleId, previousDigest: s?.head.eventDigest ?? null, kind: action, timestamp: new Date().toISOString(), nonce: p.snapshot.nonce, revision: p.snapshot.revision, snapshot: p.snapshot, hostProjectionDigest: projection, origins: p.origins, receiptDigest: p.receiptDigest, reason: p.reason, observationDigest: p.observationDigest, result: p.result };
                    const line = JSON.stringify(e), bytes = Buffer.from(line + '\n');
                    if (e.sequence > 1024 || (readBounded(journal, 8 * 1024 * 1024)?.length ?? 0) + bytes.length > 8 * 1024 * 1024)
                        fail('native-journal-limit');
                    const head = { ...identity, schema: 'native-qe-head-1', sequence: e.sequence, eventDigest: sha(line), activeCycle: cycleId, hostProjectionDigest: projection };
                    const headBytes = Buffer.from(JSON.stringify(head, null, 2) + '\n');
                    collision();
                    if (!s && names(bridge).some(n => /^(signoff-|failed-).*\.json$/.test(n)))
                        fail('native-bridge-source-collision:' + journal + ':' + bridge);
                    fault('before-first-write');
                    if (now() - started > 2000)
                        fail('native-commit-budget-exceeded-before-first-write');
                    // After this fence no expensive observation runs. Failure is conservatively possibly partial.
                    fault('journal-open');
                    partialCommit = true;
                    const fd = openSync(journal, constants.O_WRONLY | constants.O_APPEND | constants.O_CREAT | constants.O_NOFOLLOW, 0o600);
                    try {
                        fault('journal-write');
                        writeAll(fd, bytes);
                        fault('journal-fsync');
                        fsyncSync(fd);
                    }
                    finally {
                        closeSync(fd);
                    }
                    publish(headPath, headBytes, fault, 'head');
                    publish(hostPath, hostBytes, fault, 'host');
                    const complete = replay();
                    if (!complete)
                        return fail('native-commit-authority-missing');
                    fault('before-lock-release');
                    return { ...p.result, ...summary(complete), replayed: false };
                }, { staleMs: 30000, timeoutMs: 5000 });
                return output;
            }
            catch (error) {
                const code = error.code;
                return refusal(code === 'ECOMPROMISED' ? 'native-lock-compromised-possible-partial-commit' : error.message, partialCommit);
            }
        },
    };
}
//# sourceMappingURL=native-review-history.js.map
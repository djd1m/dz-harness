/**
 * Durable high-water mark for the two dz learning stores.
 *
 * The mark deliberately lives under the user's home directory, outside the
 * project: deleting `<project>/.dz` must not delete the evidence that a store
 * existed there.
 *
 * @packageDocumentation
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, realpathSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { withNamedLockSync } from './named-lock.js';
export const STORE_GUARD_VERSION = 1;
/**
 * A fall of more than 10% from the lifetime maximum is anomalous. A second,
 * absolute threshold below catches a sharp recent loss before it reaches 10%.
 * Basis: across 55 days and 9 measured snapshots the counter never decreased
 * (190 -> 1385), measured 2026-09-06.
 */
export const STORE_COLLAPSE_MAX_FRACTION = 0.10;
/** See {@link STORE_COLLAPSE_MAX_FRACTION} for the measured basis. */
export const STORE_COLLAPSE_LAST_ROWS = 50;
/** Fractional collapse detection is too noisy below this observed population. */
export const STORE_COLLAPSE_MIN_ROWS = 10;
function canonicalProjectRoot(projectRoot) {
    const absolute = resolve(projectRoot);
    return existsSync(absolute) ? realpathSync(absolute) : absolute;
}
function projectHash(projectRoot) {
    return createHash('sha256').update(canonicalProjectRoot(projectRoot)).digest('hex').slice(0, 16);
}
/** External high-water-mark path for one canonical project root. */
export function storeGuardPath(projectRoot) {
    return join(homedir(), '.dz-store-guard', `${projectHash(projectRoot)}.json`);
}
/** External directory populated by `scripts/dz-store-snapshot.sh` for this project. */
export function storeSnapshotPath(projectRoot) {
    return join(homedir(), '.dz-store-snapshots', projectHash(projectRoot));
}
function isCount(value) {
    return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}
function isStoreCountSource(value) {
    return value === 'jsonl' || value === 'sqlite';
}
function isStoreCountSnapshot(value) {
    if (typeof value !== 'object' || value === null || Array.isArray(value))
        return false;
    const candidate = value;
    return isCount(candidate.lexicalRows) && isCount(candidate.vectorRows)
        && isStoreCountSource(candidate.lexicalSource);
}
function parseStoreMark(raw, path, projectRoot) {
    let value;
    try {
        value = JSON.parse(raw);
    }
    catch {
        throw new Error(`store guard mark is not valid JSON: ${path}`);
    }
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        throw new Error(`store guard mark is not an object: ${path}`);
    }
    const candidate = value;
    const canonical = canonicalProjectRoot(projectRoot);
    if (candidate.project !== canonical)
        throw new Error(`store guard project mismatch in ${path}`);
    if (!isCount(candidate.lexicalMax) || !isCount(candidate.vectorMax)
        || !isCount(candidate.lexicalLast) || !isCount(candidate.vectorLast)) {
        throw new Error(`store guard mark has invalid row counts: ${path}`);
    }
    if (typeof candidate.updatedAt !== 'string' || Number.isNaN(Date.parse(candidate.updatedAt))) {
        throw new Error(`store guard mark has invalid updatedAt: ${path}`);
    }
    if (candidate.version !== STORE_GUARD_VERSION) {
        throw new Error(`unsupported store guard version ${String(candidate.version)} in ${path}`);
    }
    if (candidate.lexicalSource !== undefined
        && candidate.lexicalSource !== 'jsonl' && candidate.lexicalSource !== 'sqlite') {
        throw new Error(`store guard mark has invalid lexicalSource: ${path}`);
    }
    if (candidate.acceptedShrinkAt !== undefined) {
        const accepted = candidate.acceptedShrinkAt;
        if (typeof accepted !== 'object' || accepted === null || Array.isArray(accepted)
            || typeof accepted.at !== 'string' || Number.isNaN(Date.parse(accepted.at))
            || typeof accepted.reason !== 'string' || accepted.reason.trim() === '') {
            throw new Error(`store guard mark has invalid acceptedShrinkAt: ${path}`);
        }
        const structured = accepted.command !== undefined || accepted.kind !== undefined
            || accepted.before !== undefined || accepted.after !== undefined;
        if (structured && (typeof accepted.command !== 'string' || accepted.command.trim() === ''
            || !['measured-deletion', 'source-transition', 'operator-reset', 'cold-start-override'].includes(accepted.kind ?? '')
            || !isStoreCountSnapshot(accepted.before) || !isStoreCountSnapshot(accepted.after))) {
            throw new Error(`store guard mark has invalid reconciliation receipt: ${path}`);
        }
    }
    if (candidate.sourceChangedAt !== undefined
        && (typeof candidate.sourceChangedAt !== 'string' || Number.isNaN(Date.parse(candidate.sourceChangedAt)))) {
        throw new Error(`store guard mark has invalid sourceChangedAt: ${path}`);
    }
    if (candidate.resetAt !== undefined) {
        const reset = candidate.resetAt;
        if (typeof reset !== 'object' || reset === null || Array.isArray(reset)
            || typeof reset.at !== 'string' || Number.isNaN(Date.parse(reset.at))
            || typeof reset.command !== 'string' || reset.command.trim() === ''
            || reset.decision !== 'manual operator decision'
            || !isStoreCountSnapshot(reset.before) || !isStoreCountSnapshot(reset.after)
            || typeof reset.reason !== 'string' || reset.reason.trim() === '') {
            throw new Error(`store guard mark has invalid resetAt receipt: ${path}`);
        }
    }
    return {
        ...candidate,
        lexicalSource: candidate.lexicalSource ?? 'unknown',
    };
}
/** Read the external mark; absence is the only condition represented by `undefined`. */
export function readStoreMark(projectRoot) {
    const path = storeGuardPath(projectRoot);
    if (!existsSync(path))
        return undefined;
    return parseStoreMark(readFileSync(path, 'utf8'), path, projectRoot);
}
function validateObservation(observation) {
    if (!isCount(observation.lexicalRows) || !isCount(observation.vectorRows)) {
        throw new Error('store guard observation has invalid row counts');
    }
    if (typeof observation.observedAt !== 'string' || Number.isNaN(Date.parse(observation.observedAt))) {
        throw new Error('store guard observation has invalid observedAt');
    }
    if (observation.lexicalSource !== 'jsonl' && observation.lexicalSource !== 'sqlite') {
        throw new Error('store guard observation has invalid lexical source');
    }
    if (observation.command !== undefined && observation.command.trim() === '') {
        throw new Error('store guard observation command must not be empty');
    }
}
function persistStoreMark(path, mark) {
    const temp = `${path}.${process.pid}.${Date.now()}.tmp`;
    try {
        writeFileSync(temp, `${JSON.stringify(mark, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
        renameSync(temp, path);
    }
    finally {
        try {
            unlinkSync(temp);
        }
        catch { /* renamed or never created */ }
    }
    return mark;
}
/**
 * Atomically record an ordinary observation. Both maxima are monotonic by
 * construction: no command label, measured deletion, override, or source
 * transition can lower them. A first source transition is recorded as
 * metadata only; a later low-population transition requires an explicit reset.
 */
export function writeStoreMark(projectRoot, observation, options = {}) {
    const project = canonicalProjectRoot(projectRoot);
    const path = storeGuardPath(project);
    const guardRoot = dirname(path);
    validateObservation(observation);
    mkdirSync(guardRoot, { recursive: true, mode: 0o700 });
    return withNamedLockSync(guardRoot, `store-guard-${basename(path, '.json')}`, () => {
        const previous = readStoreMark(project);
        if (options.expectedPreviousLexicalSource !== undefined
            && previous?.lexicalSource !== options.expectedPreviousLexicalSource) {
            throw new Error(`lexical source-change allowance was already consumed; expected ${options.expectedPreviousLexicalSource}, found ${previous?.lexicalSource ?? 'no mark'}`);
        }
        const sourceChanged = previous !== undefined && previous.lexicalSource !== 'unknown'
            && previous.lexicalSource !== observation.lexicalSource;
        if (sourceChanged && previous.sourceChangedAt !== undefined
            && observation.lexicalRows < previous.lexicalMax) {
            throw new Error('lexical source changed again below the recorded maximum; run dz store-guard --reset');
        }
        const next = {
            project,
            lexicalSource: observation.lexicalSource,
            lexicalMax: Math.max(previous?.lexicalMax ?? 0, observation.lexicalRows),
            vectorMax: Math.max(previous?.vectorMax ?? 0, observation.vectorRows),
            lexicalLast: observation.lexicalRows,
            vectorLast: observation.vectorRows,
            ...(sourceChanged ? { sourceChangedAt: previous?.sourceChangedAt ?? observation.observedAt }
                : previous?.sourceChangedAt === undefined ? {} : { sourceChangedAt: previous.sourceChangedAt }),
            ...(previous?.resetAt === undefined ? {} : { resetAt: previous.resetAt }),
            updatedAt: observation.observedAt,
            version: STORE_GUARD_VERSION,
        };
        return persistStoreMark(path, next);
    }, { ...(options.timeoutMs === undefined ? {} : { timeoutMs: options.timeoutMs }) });
}
/** Explicit lowering primitive. Callers must obtain operator confirmation first. */
export function resetStoreMark(projectRoot, observation) {
    const project = canonicalProjectRoot(projectRoot);
    const path = storeGuardPath(project);
    const guardRoot = dirname(path);
    validateObservation(observation);
    if (observation.command?.trim() !== 'dz store-guard --reset') {
        throw new Error('store guard reset requires command dz store-guard --reset');
    }
    mkdirSync(guardRoot, { recursive: true, mode: 0o700 });
    return withNamedLockSync(guardRoot, `store-guard-${basename(path, '.json')}`, () => {
        const previous = readStoreMark(project);
        const before = {
            lexicalRows: previous?.lexicalMax ?? observation.lexicalRows,
            vectorRows: previous?.vectorMax ?? observation.vectorRows,
            lexicalSource: previous?.lexicalSource === 'jsonl' || previous?.lexicalSource === 'sqlite'
                ? previous.lexicalSource
                : observation.lexicalSource,
        };
        const after = {
            lexicalRows: observation.lexicalRows,
            vectorRows: observation.vectorRows,
            lexicalSource: observation.lexicalSource,
        };
        const resetAt = {
            at: observation.observedAt,
            command: 'dz store-guard --reset',
            decision: 'manual operator decision',
            before,
            after,
            reason: `dz store-guard --reset: manual operator decision; before lexical=${before.lexicalRows}, vector=${before.vectorRows}; after lexical=${after.lexicalRows}, vector=${after.vectorRows}`,
        };
        return persistStoreMark(path, {
            project,
            lexicalSource: observation.lexicalSource,
            lexicalMax: observation.lexicalRows,
            vectorMax: observation.vectorRows,
            lexicalLast: observation.lexicalRows,
            vectorLast: observation.vectorRows,
            resetAt,
            updatedAt: observation.observedAt,
            version: STORE_GUARD_VERSION,
        });
    });
}
function collapsedTier(name, rows, maximum, last) {
    if (maximum >= STORE_COLLAPSE_MIN_ROWS && rows < maximum * (1 - STORE_COLLAPSE_MAX_FRACTION)) {
        return `${name} rows ${rows} are more than ${STORE_COLLAPSE_MAX_FRACTION * 100}% below maximum ${maximum}`;
    }
    if (last - rows > STORE_COLLAPSE_LAST_ROWS) {
        return `${name} rows ${rows} are more than ${STORE_COLLAPSE_LAST_ROWS} below previous ${last}`;
    }
    return undefined;
}
/** Pure classification of current row counts against the external mark. */
export function checkStoreHealth(input) {
    const { projectRoot, lexicalRows, lexicalSource, vectorRows, mark } = input;
    const unreadable = [
        ...(lexicalRows === 'unreadable' ? ['lexical'] : []),
        ...(vectorRows === 'unreadable' ? ['vector'] : []),
    ];
    if (unreadable.length > 0) {
        return {
            verdict: 'unreadable',
            reason: `${unreadable.join(' and ')} store${unreadable.length > 1 ? 's are' : ' is'} unreadable`,
        };
    }
    if (lexicalRows === 'busy' || vectorRows === 'busy') {
        return {
            verdict: 'busy',
            reason: 'lexical store busy — another writer holds it; health not measured this run',
        };
    }
    if (mark === undefined)
        return { verdict: 'no-mark', reason: 'no store mark exists for this project' };
    const lexicalCount = lexicalRows;
    const vectorCount = vectorRows;
    const sourceChanged = mark.lexicalSource !== lexicalSource;
    const cold = [];
    if (mark.lexicalMax > 0 && lexicalCount === 0)
        cold.push(`lexical had ${mark.lexicalMax}`);
    if (mark.vectorMax > 0 && vectorCount === 0)
        cold.push(`vector had ${mark.vectorMax}`);
    if (cold.length > 0) {
        return {
            verdict: 'cold-start-over-existing',
            reason: `${resolve(projectRoot)} is empty over an existing mark (${cold.join(', ')})`,
        };
    }
    const repeatedLowSourceChange = sourceChanged && mark.sourceChangedAt !== undefined
        && lexicalCount < mark.lexicalMax
        ? `lexical source changed again after ${mark.sourceChangedAt} with rows ${lexicalCount} below maximum ${mark.lexicalMax}`
        : undefined;
    const collapse = repeatedLowSourceChange
        ?? (sourceChanged ? undefined : collapsedTier('lexical', lexicalCount, mark.lexicalMax, mark.lexicalLast))
        ?? collapsedTier('vector', vectorCount, mark.vectorMax, mark.vectorLast);
    if (collapse !== undefined)
        return { verdict: 'collapsed', reason: collapse };
    if (sourceChanged) {
        return {
            verdict: 'source-changed',
            reason: `lexical source changed from ${mark.lexicalSource} to ${lexicalSource}; one writer may record the migration without lowering maximum ${mark.lexicalMax}, then use dz store-guard --reset if the new baseline is intentional`,
        };
    }
    return { verdict: 'ok', reason: 'row counts are within the recorded high-water bounds' };
}
//# sourceMappingURL=store-guard.js.map
/** Fast, readonly row counts for the two learning-store tiers. */
import { createRequire } from 'node:module';
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { patternRecordId, recordToPattern } from './patterns.js';
import { isMirrorableRecord } from './vector-tier.js';
function rowMetadata(row) {
    if (typeof row.metadata === 'object' && row.metadata !== null)
        return row.metadata;
    if (typeof row.metadata !== 'string')
        return {};
    try {
        const parsed = JSON.parse(row.metadata);
        return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
            ? parsed
            : {};
    }
    catch {
        return {};
    }
}
function identityMetadata(value) {
    if (typeof value !== 'string')
        return undefined;
    try {
        const parsed = JSON.parse(value);
        return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
            ? parsed : undefined;
    }
    catch {
        return undefined;
    }
}
function lessonParity(lexical, mirror) {
    const lexicalKeys = new Map();
    for (const identity of lexical) {
        for (const key of identity.aliases) {
            if (lexicalKeys.has(key))
                return undefined;
            lexicalKeys.set(key, identity);
        }
    }
    const mirrorKeys = new Set();
    const matched = new Set();
    let mirrorOnly = 0;
    for (const identity of mirror) {
        if (mirrorKeys.has(identity.primary))
            return undefined;
        mirrorKeys.add(identity.primary);
        const lexicalIdentity = lexicalKeys.get(identity.primary);
        if (lexicalIdentity === undefined)
            mirrorOnly += 1;
        else {
            // Two mirror rows under own-id and derived-id are ambiguous, not clean parity.
            if (matched.has(lexicalIdentity))
                return undefined;
            matched.add(lexicalIdentity);
        }
    }
    let quarantinedLexicalOnly = 0;
    for (const identity of lexical) {
        if (identity.quarantined === true && !matched.has(identity))
            quarantinedLexicalOnly += 1;
    }
    return { both: matched.size, lexicalOnly: lexical.length - matched.size, mirrorOnly, quarantinedLexicalOnly };
}
function quarantineIdentities(rows) {
    const identities = new Map();
    for (const row of rows) {
        const metadata = rowMetadata(row);
        const quarantined = row.quarantined === true
            || row.qStatus === 'quarantined'
            || metadata['qStatus'] === 'quarantined';
        if (!quarantined)
            continue;
        const candidates = [row.dzId, metadata['dzId'], row.id, row.patternRecordId]
            .filter((id) => typeof id === 'string' && id !== '');
        const primary = candidates[0];
        if (primary === undefined)
            continue;
        identities.set(primary, { primary, aliases: new Set(candidates) });
    }
    return [...identities.values()];
}
/** Pure dual-key comparison for active quarantine labels in the lexical and mirror tiers. */
export function quarantineTierParity(lexicalRows, mirrorRows) {
    const lexical = quarantineIdentities(lexicalRows);
    const mirror = quarantineIdentities(mirrorRows);
    const lexicalKeys = new Set(lexical.flatMap((identity) => [...identity.aliases]));
    const mirrorKeys = new Set(mirror.flatMap((identity) => [...identity.aliases]));
    const both = [...new Set(lexical.flatMap((identity) => {
            const matched = [...identity.aliases].find((id) => mirrorKeys.has(id));
            return matched === undefined ? [] : [matched];
        }))].sort();
    const lexicalOnly = lexical
        .filter((identity) => ![...identity.aliases].some((id) => mirrorKeys.has(id)))
        .map((identity) => identity.primary)
        .sort();
    const mirrorOnly = mirror
        .filter((identity) => ![...identity.aliases].some((id) => lexicalKeys.has(id)))
        .map((identity) => identity.primary)
        .sort();
    return {
        both: both.length,
        lexicalOnly: lexicalOnly.length,
        mirrorOnly: mirrorOnly.length,
        ids: { both, lexicalOnly, mirrorOnly },
    };
}
function isBusy(error) {
    return typeof error === 'object' && error !== null
        && error.code === 'SQLITE_BUSY';
}
function isInitializing(error) {
    return typeof error === 'object' && error !== null
        && error.code === 'SQLITE_ERROR'
        && typeof error.message === 'string'
        && error.message.includes('no such table');
}
const INITIALIZATION_RETRY_WAIT = new Int32Array(new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT));
function waitForInitializationRetry(busyTimeoutMs) {
    Atomics.wait(INITIALIZATION_RETRY_WAIT, 0, 0, busyTimeoutMs);
}
function normalizedOptions(options) {
    return {
        busyTimeoutMs: options.busyTimeoutMs ?? 100,
        attempts: options.attempts ?? 1,
    };
}
function countJsonlRowsReadonly(path) {
    if (!existsSync(path))
        return 0;
    try {
        return readFileSync(path, 'utf-8').split('\n').filter((line) => line.trim() !== '').length;
    }
    catch {
        return 'unreadable';
    }
}
export function countSqliteRowsReadonly(sqlitePath, table, options, requireModule = createRequire(import.meta.url)) {
    const legacyUndefined = options === undefined;
    const { busyTimeoutMs, attempts } = normalizedOptions(options ?? {});
    for (let attempt = 0; attempt < attempts; attempt += 1) {
        try {
            const Database = requireModule('better-sqlite3');
            const db = new Database(sqlitePath, { readonly: true });
            try {
                db.pragma(`busy_timeout = ${busyTimeoutMs}`);
                const row = db.prepare(`SELECT COUNT(*) as cnt FROM ${table}`).get();
                return typeof row?.cnt === 'number' ? row.cnt : (legacyUndefined ? undefined : 'unreadable');
            }
            finally {
                db.close();
            }
        }
        catch (error) {
            if (isBusy(error)) {
                if (attempt + 1 < attempts)
                    continue;
                return legacyUndefined ? undefined : 'busy';
            }
            if (isInitializing(error)) {
                if (attempt + 1 < attempts) {
                    waitForInitializationRetry(busyTimeoutMs);
                    continue;
                }
                return legacyUndefined ? undefined : 'unreadable';
            }
            return legacyUndefined ? undefined : 'unreadable';
        }
    }
    return legacyUndefined ? undefined : 'busy';
}
function lexicalMirrorPopulation(db) {
    let rows;
    let idsEstablished = true;
    let lessonIdsEstablished = true;
    try {
        rows = db.prepare(`SELECT id, skill_id, text, score, outcome, timestamp, metadata,
      CASE WHEN json_valid(metadata) THEN EXISTS (
        SELECT 1 FROM json_each(memory_records.metadata) GROUP BY key HAVING COUNT(*) > 1
      ) ELSE 0 END AS metadata_ambiguous FROM memory_records`).all();
    }
    catch {
        lessonIdsEstablished = false;
        try {
            rows = db.prepare('SELECT id, text, metadata FROM memory_records').all();
        }
        catch {
            idsEstablished = false;
            try {
                rows = db.prepare('SELECT text, metadata FROM memory_records').all();
            }
            catch {
                try {
                    // Legacy/minimal schemas can still establish the class exclusion. With no text column there
                    // is no observable noise payload, so every non-class row stays in the comparable population.
                    rows = db.prepare("SELECT '' AS text, metadata FROM memory_records").all();
                }
                catch {
                    return undefined;
                }
            }
        }
    }
    let mirrorableRows = 0;
    let mirrorableQuarantinedRows = 0;
    let excludedClassRows = 0;
    let excludedNoiseRows = 0;
    const quarantinedRows = [];
    const lessonIdentities = [];
    for (const value of rows) {
        const row = value;
        const parsedMetadata = identityMetadata(row.metadata);
        const metadata = parsedMetadata ?? {};
        const identityFieldsValid = ['domain', 'source', 'lessonForm', 'lessonPairId', 'rewardSource', 'qStatus']
            .every((key) => metadata[key] === undefined || typeof metadata[key] === 'string');
        if (parsedMetadata === undefined || row.metadata_ambiguous === 1
            || !identityFieldsValid || typeof row.text !== 'string')
            lessonIdsEstablished = false;
        const text = typeof row.text === 'string' ? row.text : '';
        const lessonForm = metadata['lessonForm'] === 'class' ? 'class' : undefined;
        const record = { pattern: text, ...(lessonForm === undefined ? {} : { lessonForm }) };
        if (!isMirrorableRecord(record)) {
            if (lessonForm === 'class')
                excludedClassRows += 1;
            else
                excludedNoiseRows += 1;
            continue;
        }
        mirrorableRows += 1;
        let derivedId;
        // Historical quarantine aliases hash the stored timestamp verbatim, including legacy date labels.
        // Derive them independently of the stricter evidence required to establish full lesson parity.
        if (typeof row.id === 'string' && row.id !== '' && typeof row.text === 'string'
            && typeof row.score === 'number' && typeof row.outcome === 'string' && typeof row.timestamp === 'string') {
            const record = {
                id: row.id, skillId: typeof row.skill_id === 'string' ? row.skill_id : '', text: row.text, score: row.score,
                outcome: row.outcome, timestamp: row.timestamp,
                metadata: Object.fromEntries(Object.entries(metadata).filter((entry) => typeof entry[1] === 'string')),
            };
            derivedId = patternRecordId(recordToPattern(record));
        }
        if (typeof row.id === 'string' && row.id.trim() !== '' && typeof row.skill_id === 'string'
            && typeof row.text === 'string' && typeof row.score === 'number' && Number.isFinite(row.score)
            && typeof row.outcome === 'string' && typeof row.timestamp === 'string'
            && Number.isFinite(Date.parse(row.timestamp)) && parsedMetadata !== undefined
            && row.metadata_ambiguous !== 1 && identityFieldsValid && derivedId !== undefined) {
            lessonIdentities.push({ primary: row.id, aliases: new Set([row.id, derivedId]), quarantined: metadata['qStatus'] === 'quarantined' });
        }
        else {
            lessonIdsEstablished = false;
        }
        if (metadata['qStatus'] === 'quarantined') {
            mirrorableQuarantinedRows += 1;
            if (typeof row.id !== 'string' || row.id === '') {
                idsEstablished = false;
                continue;
            }
            quarantinedRows.push({
                id: row.id,
                ...(derivedId === undefined ? {} : { patternRecordId: derivedId }),
                qStatus: 'quarantined',
            });
        }
    }
    return {
        mirrorableRows,
        mirrorableQuarantinedRows,
        excludedClassRows,
        excludedNoiseRows,
        ...(idsEstablished ? { quarantinedIdentities: quarantinedRows } : {}),
        ...(lessonIdsEstablished ? { lessonIdentities } : {}),
    };
}
function vectorLessonIdentities(db) {
    try {
        const rows = db.prepare(`SELECT metadata,
      CASE WHEN json_valid(metadata) THEN EXISTS (
        SELECT 1 FROM json_each(reasoning_patterns.metadata) GROUP BY key HAVING COUNT(*) > 1
      ) ELSE 0 END AS metadata_ambiguous
      FROM reasoning_patterns WHERE task_type IN ('dz-teach', 'dz-learning')`).all();
        const identities = [];
        for (const value of rows) {
            const row = value;
            if (row.metadata_ambiguous === 1)
                return undefined;
            const metadata = identityMetadata(row.metadata);
            if (metadata === undefined || typeof metadata['dzId'] !== 'string' || metadata['dzId'].trim() === '')
                return undefined;
            const id = metadata['dzId'];
            identities.push({ primary: id, aliases: new Set([id]) });
        }
        return identities;
    }
    catch {
        return undefined;
    }
}
function vectorQuarantinedIds(db) {
    try {
        const rows = db.prepare(`SELECT metadata FROM reasoning_patterns
      WHERE task_type IN ('dz-teach', 'dz-learning')
        AND json_valid(metadata)
        AND json_extract(metadata, '$.qStatus') = 'quarantined'`).all();
        const rowsWithIds = [];
        for (const row of rows) {
            const metadata = rowMetadata({ metadata: typeof row.metadata === 'string' ? row.metadata : null });
            if (typeof metadata['dzId'] !== 'string' || metadata['dzId'] === '')
                return undefined;
            rowsWithIds.push({ dzId: metadata['dzId'], qStatus: 'quarantined' });
        }
        return rowsWithIds;
    }
    catch {
        return undefined;
    }
}
/** One aggregate query on the healthy path; an unsupported metadata shape falls back to total-only. */
function countSqliteRowsWithQuarantineReadonly(sqlitePath, table, options, requireModule) {
    const { busyTimeoutMs, attempts } = normalizedOptions(options);
    for (let attempt = 0; attempt < attempts; attempt += 1) {
        try {
            const Database = requireModule('better-sqlite3');
            const db = new Database(sqlitePath, { readonly: true });
            try {
                db.pragma(`busy_timeout = ${busyTimeoutMs}`);
                try {
                    const sql = table === 'memory_records'
                        ? `SELECT COALESCE(SUM(n), 0) AS cnt,
              COALESCE(SUM(CASE WHEN q_status = 'quarantined' THEN n ELSE 0 END), 0) AS quarantined
            FROM (
              SELECT CASE WHEN json_valid(metadata) THEN json_extract(metadata, '$.qStatus') END AS q_status,
                COUNT(*) AS n
              FROM memory_records GROUP BY 1
            )`
                        : `SELECT COUNT(*) AS cnt,
              COALESCE(SUM(CASE WHEN task_type IN ('dz-teach', 'dz-learning') THEN 1 ELSE 0 END), 0) AS lessons,
              COALESCE(SUM(CASE WHEN task_type IN ('dz-teach', 'dz-learning')
                AND json_valid(metadata)
                AND json_extract(metadata, '$.qStatus') = 'quarantined' THEN 1 ELSE 0 END), 0) AS quarantined
            FROM reasoning_patterns`;
                    const row = db.prepare(sql).get();
                    if (typeof row?.cnt !== 'number' || typeof row.quarantined !== 'number')
                        return 'unreadable';
                    const lexical = table === 'memory_records' ? lexicalMirrorPopulation(db) : undefined;
                    const { lessonIdentities: lexicalIdentities, ...lexicalCounts } = lexical ?? {};
                    const populationConsistent = lexical !== undefined && (lexical.mirrorableRows ?? 0)
                        + (lexical.excludedClassRows ?? 0) + (lexical.excludedNoiseRows ?? 0) === row.cnt;
                    const quarantinedRows = table === 'reasoning_patterns' ? vectorQuarantinedIds(db) : undefined;
                    const lessonIdentities = table === 'reasoning_patterns' ? vectorLessonIdentities(db) : undefined;
                    return {
                        rows: row.cnt,
                        quarantinedRows: row.quarantined,
                        ...lexicalCounts,
                        ...(populationConsistent && lexicalIdentities !== undefined ? { lessonIdentities: lexicalIdentities } : {}),
                        ...(quarantinedRows === undefined ? {} : { quarantinedIdentities: quarantinedRows }),
                        ...(lessonIdentities === undefined || lessonIdentities.length !== row.lessons ? {} : { lessonIdentities }),
                        ...(typeof row.lessons === 'number' ? { lessonRows: row.lessons } : {}),
                    };
                }
                catch (error) {
                    if (isBusy(error) || isInitializing(error))
                        throw error;
                    // Запасной путь: общий объём берём всегда, а разложение по родам пробуем ОТДЕЛЬНО —
                    // схема без `metadata`, но с `task_type` уроки различает, и терять это не за что.
                    // Если не различает и её — lessonRows остаётся неизвестным, и показатель обязан сказать
                    // «не читается» вместо мнимого совпадения.
                    const row = db.prepare(`SELECT COUNT(*) AS cnt FROM ${table}`).get();
                    if (typeof row?.cnt !== 'number')
                        return 'unreadable';
                    if (table !== 'reasoning_patterns')
                        return { rows: row.cnt };
                    try {
                        const lesson = db.prepare(`SELECT COUNT(*) AS cnt FROM reasoning_patterns
              WHERE task_type IN ('dz-teach', 'dz-learning')`).get();
                        return typeof lesson?.cnt === 'number'
                            ? { rows: row.cnt, lessonRows: lesson.cnt }
                            : { rows: row.cnt };
                    }
                    catch (lessonError) {
                        if (isBusy(lessonError) || isInitializing(lessonError))
                            throw lessonError;
                        return { rows: row.cnt };
                    }
                }
            }
            finally {
                db.close();
            }
        }
        catch (error) {
            if (isBusy(error)) {
                if (attempt + 1 < attempts)
                    continue;
                return 'busy';
            }
            if (isInitializing(error)) {
                if (attempt + 1 < attempts) {
                    waitForInitializationRetry(busyTimeoutMs);
                    continue;
                }
                return 'unreadable';
            }
            return 'unreadable';
        }
    }
    return 'busy';
}
/**
 * Count both protected store populations without opening either store writable.
 * Missing tiers count as zero; an existing tier that cannot be counted is
 * explicitly `unreadable`.
 */
export function countLearningStoreRowsReadonly(projectRoot, options = {}, requireModule = createRequire(import.meta.url)) {
    const root = resolve(projectRoot);
    const lexicalPath = join(root, '.dz', 'memory', 'patterns.sqlite');
    const jsonlPath = join(root, '.dz', 'patterns.jsonl');
    const vectorPath = join(root, '.dz', 'agentdb.db');
    const vectorExists = existsSync(vectorPath);
    const lexicalSource = existsSync(lexicalPath) ? 'sqlite' : 'jsonl';
    const lexicalSqlite = lexicalSource === 'sqlite'
        ? countSqliteRowsWithQuarantineReadonly(lexicalPath, 'memory_records', options, requireModule)
        : undefined;
    let lexicalRows;
    if (lexicalSource === 'sqlite') {
        lexicalRows = typeof lexicalSqlite === 'object' ? lexicalSqlite.rows : lexicalSqlite ?? 'unreadable';
    }
    else {
        lexicalRows = countJsonlRowsReadonly(jsonlPath);
    }
    const vectorSqlite = vectorExists
        ? countSqliteRowsWithQuarantineReadonly(vectorPath, 'reasoning_patterns', options, requireModule)
        : undefined;
    const ignoredJsonl = lexicalSource === 'sqlite' && existsSync(jsonlPath)
        ? countJsonlRowsReadonly(jsonlPath)
        : undefined;
    const quarantineParity = typeof lexicalSqlite === 'object'
        && lexicalSqlite.quarantinedIdentities !== undefined
        && typeof vectorSqlite === 'object'
        && vectorSqlite.quarantinedIdentities !== undefined
        ? quarantineTierParity(lexicalSqlite.quarantinedIdentities, vectorSqlite.quarantinedIdentities)
        : undefined;
    const lexicalIdentities = typeof lexicalSqlite === 'object' ? lexicalSqlite.lessonIdentities
        : lexicalSource === 'jsonl' && !existsSync(jsonlPath) ? [] : undefined;
    const mirrorIdentities = vectorExists
        ? typeof vectorSqlite === 'object' ? vectorSqlite.lessonIdentities : undefined
        : [];
    const parity = lexicalIdentities !== undefined && mirrorIdentities !== undefined
        ? lessonParity(lexicalIdentities, mirrorIdentities) : undefined;
    return {
        lexicalRows,
        ...(typeof lexicalSqlite !== 'object' || lexicalSqlite.mirrorableRows === undefined ? {} : {
            lexicalMirrorableRows: lexicalSqlite.mirrorableRows,
            lexicalMirrorableQuarantinedRows: lexicalSqlite.mirrorableQuarantinedRows ?? 0,
            lexicalExcludedClassRows: lexicalSqlite.excludedClassRows ?? 0,
            lexicalExcludedNoiseRows: lexicalSqlite.excludedNoiseRows ?? 0,
        }),
        ...(typeof lexicalSqlite !== 'object' || lexicalSqlite.quarantinedRows === undefined ? {} : {
            lexicalQuarantinedRows: lexicalSqlite.quarantinedRows,
        }),
        lexicalSource,
        lexicalSourcePath: lexicalSource === 'sqlite' ? lexicalPath : jsonlPath,
        ...(ignoredJsonl === undefined ? {} : {
            lexicalIgnoredRows: ignoredJsonl,
            lexicalIgnoredSourcePath: jsonlPath,
        }),
        vectorRows: vectorExists
            ? (typeof vectorSqlite === 'object' ? vectorSqlite.rows : vectorSqlite ?? 'unreadable')
            : 0,
        ...(typeof vectorSqlite !== 'object' || vectorSqlite.lessonRows === undefined
            ? {} : { vectorLessonRows: vectorSqlite.lessonRows }),
        ...(typeof vectorSqlite !== 'object' || vectorSqlite.quarantinedRows === undefined ? {} : {
            vectorQuarantinedRows: vectorSqlite.quarantinedRows,
        }),
        ...(vectorExists ? { vectorSourcePath: vectorPath } : {}),
        ...(quarantineParity === undefined ? {} : { quarantineTierParity: quarantineParity }),
        ...(parity === undefined ? {} : { lessonTierParity: parity }),
    };
}
//# sourceMappingURL=store-counts.js.map
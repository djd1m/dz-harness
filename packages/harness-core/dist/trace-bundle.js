/**
 * Portable workflow trace bundles — the PURE half.
 *
 * The caller owns every external read and write. This module owns the decisions that must be
 * replayable in a test: which ledger rows belong to a run, whether the harness-record layout is
 * recognised, whether an import may touch a destination, and the exact relative writes it permits.
 * Keeping those decisions independent of the host makes a refusal a value rather than a partially
 * completed mutation.
 */
import { traceValidateEvent } from './loop-trace.js';
/** The version is part of the wire contract: readers refuse versions they do not understand. */
export const TRACE_BUNDLE_SCHEMA = 'trace-bundle/1';
/** Native shelves used by both local runs and imported runs. */
export const TRACE_BUNDLE_LEDGER_PATH = '.dz/feature-adr/run-cost-ledger.jsonl';
export const TRACE_BUNDLE_RUN_META_FILE = 'run-meta.json';
const ATTRIBUTION_RULE = 'last-writer-wins by timestamp is a CHOICE: a run whose phases used different models has no single honest answer; this reports "who ran it last"';
function isObject(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function nonEmptyString(value) {
    return typeof value === 'string' && value.trim() !== '';
}
function nonNegativeInteger(value) {
    return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}
/** A member origin must remain below the root to which the caller applies the plan. */
function safeRelativePath(value) {
    if (!nonEmptyString(value) || value.includes('\0') || value.includes('\\'))
        return false;
    if (value.startsWith('/') || /^[A-Za-z]:/.test(value))
        return false;
    return value.split('/').every((part) => part !== '' && part !== '.' && part !== '..');
}
function memberShape(value) {
    if (!isObject(value))
        return false;
    return safeRelativePath(value['origin']) && typeof value['content'] === 'string';
}
function memberSlotShape(value) {
    if (!isObject(value) || typeof value['present'] !== 'boolean')
        return false;
    if (value['present'] === true)
        return memberShape(value['member']);
    return nonEmptyString(value['reason']);
}
function normalizedSlot(value, absentReason) {
    try {
        if (memberSlotShape(value))
            return value;
        if (memberShape(value))
            return { present: true, member: value };
    }
    catch {
        // A hostile value is simply not a readable member; exporting the other facts remains useful.
    }
    return { present: false, reason: absentReason };
}
/**
 * Select only rows attributable to this logical run. Slug fallback is deliberately disabled when
 * a row carries any run id: otherwise a foreign loop run sharing a slug leaks into the slice.
 */
export function selectLedgerRows(lines, identity) {
    const selected = [];
    let scanned = 0;
    let malformed = 0;
    const source = Array.isArray(lines) ? lines : [];
    const targetRunId = identity !== null && identity !== undefined && typeof identity.runId === 'string' ? identity.runId : null;
    const targetSlug = identity !== null && identity !== undefined && typeof identity.slug === 'string' ? identity.slug : null;
    for (const line of source) {
        scanned++;
        if (typeof line !== 'string') {
            malformed++;
            continue;
        }
        let row;
        try {
            row = JSON.parse(line);
        }
        catch {
            malformed++;
            continue;
        }
        if (!isObject(row))
            continue;
        const rowRunId = row['runId'];
        const carriesRunId = nonEmptyString(rowRunId);
        const byRunId = carriesRunId && targetRunId !== null && rowRunId === targetRunId;
        const bySlug = !carriesRunId && targetSlug !== null && row['slug'] === targetSlug;
        if (byRunId || bySlug)
            selected.push(line);
    }
    return { lines: selected, scanned, matched: selected.length, malformed };
}
function readRecord(value) {
    let parsed = value;
    if (typeof value === 'string') {
        try {
            parsed = JSON.parse(value);
        }
        catch {
            return { ok: false };
        }
    }
    return isObject(parsed) ? { ok: true, record: parsed } : { ok: false };
}
function readArgsSlug(value) {
    let args = value;
    if (typeof value === 'string') {
        try {
            args = JSON.parse(value);
        }
        catch {
            return { ok: false };
        }
    }
    if (args === null || args === undefined)
        return { ok: true, slug: null };
    if (!isObject(args))
        return { ok: true, slug: null };
    return { ok: true, slug: typeof args['slug'] === 'string' ? args['slug'] : null };
}
function modelsUsedShape(value) {
    if (!isObject(value))
        return false;
    const entries = Object.entries(value);
    return entries.length > 0 && entries.every(([stage, model]) => stage !== '' && nonEmptyString(model));
}
const HISTORICAL_FEATURE_ADR_RESULT_KEYS = [
    'slug',
    'tier',
    'artifactsDir',
    'qeGrade',
    'design',
    'codeWrote',
    'gaps',
];
function historicalFeatureAdrResultShape(value) {
    if (!isObject(value))
        return false;
    // Older feature-ADR result fields drifted across versions, so require a recognisable threshold
    // rather than an exact key set while still refusing arbitrary objects.
    const recognisedKeys = HISTORICAL_FEATURE_ADR_RESULT_KEYS.filter((key) => (Object.prototype.hasOwnProperty.call(value, key)));
    return recognisedKeys.length >= 3;
}
function recordPredatesModelRouting(record) {
    const result = record['result'];
    if (result === null || result === undefined)
        return true;
    if (!isObject(result) || modelsUsedShape(result['modelsUsed']))
        return false;
    return historicalFeatureAdrResultShape(result);
}
function harnessRecordShape(value) {
    if (!isObject(value))
        return false;
    if (!nonEmptyString(value['runId']) || !nonEmptyString(value['timestamp']))
        return false;
    if (typeof value['agentCount'] !== 'number' || !Number.isFinite(value['agentCount']))
        return false;
    const result = value['result'];
    if (!isObject(result) || !modelsUsedShape(result['modelsUsed']))
        return false;
    return !('usageEvents' in result) || Array.isArray(result['usageEvents']);
}
/**
 * Join persisted harness records without guessing through an unfamiliar layout. Returning no
 * records on a joined shape failure prevents a model-blind record from appearing model-aware.
 */
export function resolveRunMeta(records, slug) {
    try {
        if (!Array.isArray(records) || records.length === 0) {
            return { resolved: false, reason: 'records-absent' };
        }
        const joined = [];
        for (const source of records) {
            const read = readRecord(source);
            if (!read.ok)
                return { resolved: false, reason: 'unreadable' };
            const args = readArgsSlug(read.record['args']);
            if (!args.ok)
                return { resolved: false, reason: 'unreadable' };
            if (slug !== null && args.slug === slug)
                joined.push(read.record);
        }
        if (joined.length === 0)
            return { resolved: false, reason: 'no-match' };
        // The unit of judgement is the RECORD, not the slug: the two-phase L/XL flow puts an older
        // first phase and a newer re-invoke under ONE slug, so refusing the slug because one sibling
        // predates model routing throws away data that is right there (MEASURED: 1 slug of 32).
        const recognised = [];
        const notUsable = [];
        for (const record of joined) {
            if (harnessRecordShape(record))
                recognised.push(record);
            else
                notUsable.push(record);
        }
        if (recognised.length === 0) {
            const reason = notUsable.every(recordPredatesModelRouting)
                ? 'predates-model-routing'
                : 'layout-unrecognised';
            return { resolved: false, reason };
        }
        const historical = notUsable.filter(recordPredatesModelRouting).length;
        const skipped = {
            count: notUsable.length,
            historical,
            unrecognised: notUsable.length - historical,
        };
        const ordered = recognised
            .map((record, index) => ({ record, index }))
            .sort((a, b) => {
            const byTimestamp = a.record.timestamp < b.record.timestamp ? -1 : a.record.timestamp > b.record.timestamp ? 1 : 0;
            return byTimestamp === 0 ? a.index - b.index : byTimestamp;
        })
            .map(({ record }) => record);
        return { resolved: true, records: ordered, skipped };
    }
    catch {
        return { resolved: false, reason: 'unreadable' };
    }
}
/**
 * Fold the labelled convenience view alongside its source records. Last-writer-wins is explicitly
 * a policy choice, and the source ids let a later consumer choose and audit a different policy.
 */
export function foldAttribution(records) {
    if (!Array.isArray(records) || records.length === 0)
        return { derived: false, reason: 'no-runmeta' };
    try {
        const ordered = records
            .map((record, index) => ({ record, index }))
            .sort((a, b) => {
            const left = typeof a.record.timestamp === 'string' ? a.record.timestamp : '';
            const right = typeof b.record.timestamp === 'string' ? b.record.timestamp : '';
            const byTimestamp = left < right ? -1 : left > right ? 1 : 0;
            return byTimestamp === 0 ? a.index - b.index : byTimestamp;
        });
        const byStage = {};
        const fromRecordIds = [];
        for (const { record } of ordered) {
            if (nonEmptyString(record.runId))
                fromRecordIds.push(record.runId);
            const models = isObject(record.result) ? record.result.modelsUsed : undefined;
            if (!isObject(models))
                continue;
            for (const [stage, model] of Object.entries(models)) {
                if (stage === '' || !nonEmptyString(model))
                    continue;
                Object.defineProperty(byStage, stage, {
                    value: model,
                    writable: true,
                    enumerable: true,
                    configurable: true,
                });
            }
        }
        return { derived: true, rule: ATTRIBUTION_RULE, fromRecordIds, byStage };
    }
    catch {
        return { derived: false, reason: 'unreadable-runmeta' };
    }
}
function emptyBundle() {
    return {
        schema: TRACE_BUNDLE_SCHEMA,
        provenance: {
            sourceRoot: '',
            runAddress: '',
            slug: null,
            runId: null,
            toolVersion: '',
            createdAt: null,
        },
        trace: { present: false, reason: 'invalid-input' },
        checkpoints: { present: false, reason: 'invalid-input' },
        ledger: {
            present: false,
            scanned: 0,
            matched: 0,
            malformed: 0,
            lines: [],
            reason: 'invalid-input',
        },
        pairs: { included: false, reason: 'not-requested' },
        runMeta: { resolved: false, reason: 'records-absent' },
        attribution: { derived: false, reason: 'no-runmeta' },
    };
}
/** Assemble a bundle solely from facts the caller has already read. Malformed facts degrade safely. */
export function buildBundle(input) {
    try {
        const slug = typeof input.slug === 'string' ? input.slug : null;
        const runId = typeof input.runId === 'string' ? input.runId : null;
        const trace = normalizedSlot(input.trace, 'not-provided');
        const checkpoints = normalizedSlot(input.checkpoints, 'not-provided');
        let ledger;
        if (Array.isArray(input.ledgerLines)) {
            const selection = selectLedgerRows(input.ledgerLines, { runId, slug });
            ledger = { present: true, ...selection };
        }
        else {
            ledger = {
                present: false,
                scanned: 0,
                matched: 0,
                malformed: 0,
                lines: [],
                reason: nonEmptyString(input.ledgerReason) ? input.ledgerReason : 'not-provided',
            };
        }
        let pairs;
        if (input.includePairs !== true) {
            pairs = { included: false, reason: 'not-requested' };
        }
        else {
            const files = Array.isArray(input.pairFiles) ? input.pairFiles.filter(memberShape) : [];
            pairs = files.length === 0
                ? { included: false, reason: 'no-pairs-found' }
                : { included: true, files: [...files] };
        }
        const runMeta = resolveRunMeta(input.records, slug);
        return {
            schema: TRACE_BUNDLE_SCHEMA,
            provenance: {
                sourceRoot: typeof input.sourceRoot === 'string' ? input.sourceRoot : '',
                runAddress: typeof input.runAddress === 'string' ? input.runAddress : '',
                slug,
                runId,
                toolVersion: typeof input.toolVersion === 'string' ? input.toolVersion : '',
                createdAt: typeof input.createdAt === 'string' ? input.createdAt : null,
            },
            trace,
            checkpoints,
            ledger,
            pairs,
            runMeta,
            attribution: foldAttribution(runMeta.resolved ? runMeta.records : []),
        };
    }
    catch {
        return emptyBundle();
    }
}
/** JSON escaping changes only the container representation; member content round-trips verbatim. */
export function serializeBundle(bundle) {
    try {
        const text = JSON.stringify(bundle);
        return typeof text === 'string' ? text : '';
    }
    catch {
        return '';
    }
}
function provenanceShape(value) {
    if (!isObject(value))
        return false;
    return (typeof value['sourceRoot'] === 'string' &&
        typeof value['runAddress'] === 'string' &&
        (typeof value['slug'] === 'string' || value['slug'] === null) &&
        (typeof value['runId'] === 'string' || value['runId'] === null) &&
        typeof value['toolVersion'] === 'string' &&
        (typeof value['createdAt'] === 'string' || value['createdAt'] === null));
}
function ledgerShape(value) {
    if (!isObject(value) || typeof value['present'] !== 'boolean')
        return false;
    if (!nonNegativeInteger(value['scanned']) || !nonNegativeInteger(value['matched']) || !nonNegativeInteger(value['malformed']))
        return false;
    if (!Array.isArray(value['lines']) || !value['lines'].every((line) => typeof line === 'string' && jsonObjectLine(line)))
        return false;
    if (value['matched'] !== value['lines'].length || value['scanned'] < value['matched'] + value['malformed'])
        return false;
    return value['present'] === true || nonEmptyString(value['reason']);
}
function jsonObjectLine(line) {
    try {
        return isObject(JSON.parse(line));
    }
    catch {
        return false;
    }
}
function jsonlShape(content, validate) {
    for (const line of content.split('\n')) {
        if (line.trim() === '')
            continue;
        let value;
        try {
            value = JSON.parse(line);
        }
        catch {
            return false;
        }
        if (!validate(value))
            return false;
    }
    return true;
}
function traceContentShape(slot) {
    return !slot.present || jsonlShape(slot.member.content, (event) => traceValidateEvent(event) === null);
}
function checkpointContentShape(slot) {
    return !slot.present || jsonlShape(slot.member.content, (entry) => (isObject(entry) &&
        nonEmptyString(entry['stage']) &&
        nonEmptyString(entry['inputHash']) &&
        'result' in entry &&
        entry['result'] !== null &&
        entry['result'] !== undefined));
}
function pairContentShape(member) {
    return jsonlShape(member.content, (pair) => (isObject(pair) &&
        nonEmptyString(pair['schema']) &&
        nonEmptyString(pair['slug']) &&
        nonEmptyString(pair['stage']) &&
        typeof pair['input'] === 'string' &&
        typeof pair['output'] === 'string'));
}
function pairsShape(value) {
    if (!isObject(value) || typeof value['included'] !== 'boolean')
        return false;
    if (value['included'] === false)
        return value['reason'] === 'not-requested' || value['reason'] === 'no-pairs-found';
    return Array.isArray(value['files']) && value['files'].length > 0 && value['files'].every((file) => memberShape(file) && pairContentShape(file));
}
function runMetaShape(value) {
    if (!isObject(value) || typeof value['resolved'] !== 'boolean')
        return false;
    if (value['resolved'] === false) {
        return value['reason'] === 'records-absent' || value['reason'] === 'no-match' || value['reason'] === 'unreadable' || value['reason'] === 'predates-model-routing' || value['reason'] === 'layout-unrecognised';
    }
    return Array.isArray(value['records']) && value['records'].every(harnessRecordShape);
}
function stringRecordShape(value) {
    return isObject(value) && Object.entries(value).every(([key, item]) => key !== '' && typeof item === 'string');
}
function attributionShape(value) {
    if (!isObject(value) || typeof value['derived'] !== 'boolean')
        return false;
    if (value['derived'] === false)
        return nonEmptyString(value['reason']);
    return (nonEmptyString(value['rule']) &&
        Array.isArray(value['fromRecordIds']) &&
        value['fromRecordIds'].every(nonEmptyString) &&
        stringRecordShape(value['byStage']));
}
/**
 * Recognise the complete current format or refuse it. Validation finishes before the bundle is
 * returned, so an importer can never receive a valid-looking subset of a corrupt artifact.
 */
export function parseBundle(text) {
    let parsed;
    try {
        parsed = JSON.parse(text);
    }
    catch {
        return { ok: false, reason: 'unparseable' };
    }
    if (!isObject(parsed))
        return { ok: false, reason: 'unknown-schema', found: 'undefined' };
    if (parsed['schema'] !== TRACE_BUNDLE_SCHEMA) {
        let found;
        try {
            found = String(parsed['schema']);
        }
        catch {
            found = 'unreadable';
        }
        return { ok: false, reason: 'unknown-schema', found };
    }
    if (!provenanceShape(parsed['provenance']))
        return { ok: false, reason: 'member-shape', member: 'provenance' };
    if (!memberSlotShape(parsed['trace']) || !traceContentShape(parsed['trace']))
        return { ok: false, reason: 'member-shape', member: 'trace' };
    if (!memberSlotShape(parsed['checkpoints']) || !checkpointContentShape(parsed['checkpoints']))
        return { ok: false, reason: 'member-shape', member: 'checkpoints' };
    if (!ledgerShape(parsed['ledger']))
        return { ok: false, reason: 'member-shape', member: 'ledger' };
    if (!pairsShape(parsed['pairs']))
        return { ok: false, reason: 'member-shape', member: 'pairs' };
    if (!runMetaShape(parsed['runMeta']))
        return { ok: false, reason: 'member-shape', member: 'runMeta' };
    if (!attributionShape(parsed['attribution']))
        return { ok: false, reason: 'member-shape', member: 'attribution' };
    return { ok: true, bundle: parsed };
}
function canonicalRunDir(bundle) {
    if (nonEmptyString(bundle.provenance.slug) && safeRelativePath(bundle.provenance.slug)) {
        return 'features/' + bundle.provenance.slug;
    }
    if (nonEmptyString(bundle.provenance.runId) && safeRelativePath(bundle.provenance.runId)) {
        return '.dz/loop-trace/' + bundle.provenance.runId;
    }
    return null;
}
function mismatchReason(bundle, destination) {
    if (destination === null)
        return null;
    const bundleSlug = bundle.provenance.slug;
    const bundleRunId = bundle.provenance.runId;
    if (destination.slug !== null && destination.slug !== bundleSlug) {
        return `destination slug "${destination.slug}" disagrees with bundle provenance slug "${String(bundleSlug)}"`;
    }
    if (destination.runId !== null && destination.runId !== bundleRunId) {
        return `destination runId "${destination.runId}" disagrees with bundle provenance runId "${String(bundleRunId)}"`;
    }
    return null;
}
function joinRelative(base, child) {
    if (!safeRelativePath(base) || !safeRelativePath(child))
        return null;
    return base + '/' + child;
}
function listingHasRunContent(paths, runDir) {
    if (paths === undefined)
        return false;
    for (const path of paths) {
        if (path.startsWith(runDir + '/'))
            return true;
    }
    return false;
}
function runMetaContent(bundle, bundleName) {
    return JSON.stringify({
        schema: TRACE_BUNDLE_SCHEMA,
        sourceBundle: bundleName,
        provenance: bundle.provenance,
        runMeta: bundle.runMeta,
        attribution: bundle.attribution,
    });
}
/**
 * Plan native-layout reconstruction without touching the destination. Every fatal check is
 * completed before writes are returned, preserving the all-or-nothing refusal boundary.
 */
export function planImport(bundle, destFacts) {
    const refusals = [];
    try {
        const canonical = canonicalRunDir(bundle);
        const suppliedRunDir = nonEmptyString(destFacts.runDir) ? destFacts.runDir : null;
        const runDir = suppliedRunDir ?? canonical;
        if (runDir === null || !safeRelativePath(runDir)) {
            refusals.push({ path: suppliedRunDir ?? '.', reason: 'bundle provenance does not identify a safe native run directory' });
        }
        else if (canonical !== null && suppliedRunDir !== null && suppliedRunDir !== canonical) {
            refusals.push({ path: suppliedRunDir, reason: `bundle provenance identifies run directory "${canonical}", not "${suppliedRunDir}"` });
        }
        const mismatch = mismatchReason(bundle, destFacts.runIdentity);
        if (mismatch !== null)
            refusals.push({ path: runDir ?? '.', reason: mismatch });
        const runDirHasContent = runDir !== null && (destFacts.runDirHasContent || listingHasRunContent(destFacts.existingPaths, runDir));
        if (runDir !== null && runDirHasContent) {
            if (destFacts.force !== true) {
                refusals.push({ path: runDir, reason: 'destination run directory already has content; force is required for the bundle own run' });
            }
            else if (destFacts.runIdentity === null || (destFacts.runIdentity.slug === null && destFacts.runIdentity.runId === null)) {
                refusals.push({ path: runDir, reason: 'destination identity is unavailable, so bundle ownership cannot be established even under force' });
            }
        }
        if (!nonEmptyString(destFacts.bundleName)) {
            refusals.push({ path: runDir ?? '.', reason: 'source bundle name is required for the run-meta sidecar' });
        }
        if (refusals.length > 0 || runDir === null)
            return { writes: [], refusals, ok: false };
        const writes = [];
        const addRunMember = (slot, label) => {
            if (!slot.present)
                return;
            const path = joinRelative(runDir, slot.member.origin);
            if (path === null)
                refusals.push({ path: slot.member.origin, reason: `${label} origin is not a safe relative path` });
            else
                writes.push({ path, content: slot.member.content });
        };
        addRunMember(bundle.trace, 'trace');
        addRunMember(bundle.checkpoints, 'checkpoints');
        if (bundle.ledger.present) {
            writes.push({ path: TRACE_BUNDLE_LEDGER_PATH, content: bundle.ledger.lines.join('\n') });
        }
        if (bundle.pairs.included && destFacts.withPairs === true) {
            for (const file of bundle.pairs.files) {
                if (!memberShape(file))
                    refusals.push({ path: 'pairs', reason: 'pair origin is not a safe relative path' });
                else
                    writes.push({ path: file.origin, content: file.content });
            }
        }
        const runMetaPath = joinRelative(runDir, TRACE_BUNDLE_RUN_META_FILE);
        if (runMetaPath === null)
            refusals.push({ path: runDir, reason: 'run-meta path is not safe' });
        else
            writes.push({ path: runMetaPath, content: runMetaContent(bundle, destFacts.bundleName) });
        if (refusals.length > 0)
            return { writes: [], refusals, ok: false };
        return { writes, refusals: [], ok: true };
    }
    catch {
        return { writes: [], refusals: [{ path: '.', reason: 'destination facts are unreadable' }], ok: false };
    }
}
//# sourceMappingURL=trace-bundle.js.map
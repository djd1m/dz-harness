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

export interface BundleMember {
  /** path relative to the run directory, or the well-known source for non-run members */
  readonly origin: string;
  /** raw file content, verbatim — never re-serialised, never re-ordered */
  readonly content: string;
}

/** Absence is data: a portable bundle must explain every source it could not carry. */
export type MemberSlot =
  | { readonly present: true; readonly member: BundleMember }
  | { readonly present: false; readonly reason: string };

export interface HarnessRecordResult {
  readonly modelsUsed: Record<string, string>;
  readonly usageEvents?: unknown[];
  readonly [key: string]: unknown;
}

/**
 * The harness record is kept whole so a consumer can recompute attribution from the transported
 * facts. These are only the fields this adapter recognises; extra persisted fields remain intact.
 */
export interface HarnessRecord {
  readonly runId: string;
  readonly timestamp: string;
  readonly agentCount: number;
  readonly args: unknown;
  readonly result: HarnessRecordResult;
  readonly [key: string]: unknown;
}

/**
 * Closed degradation vocabulary: callers can make strict-mode policy exhaustive.
 * Only `layout-unrecognised` is ACTIONABLE; `records-absent`, `no-match`, `unreadable`, and
 * `predates-model-routing` are not. The historical split follows a real-store measurement where
 * 3 of 32 distinct slugs were valid older feature-ADR runs without per-stage model routing.
 */
export type RunMetaReason =
  | 'records-absent'
  | 'no-match'
  | 'unreadable'
  | 'predates-model-routing'
  | 'layout-unrecognised';

export type RunMeta =
  | {
      resolved: true;
      records: HarnessRecord[];
      /** Joined records that were NOT usable, so attribution can never silently fold fewer
       * records than the run actually had. */
      skipped: { count: number; historical: number; unrecognised: number };
    }
  | { resolved: false; reason: RunMetaReason };

export type Attribution =
  | { derived: true; rule: string; fromRecordIds: string[]; byStage: Record<string, string> }
  | { derived: false; reason: string };

export interface TraceBundle {
  schema: string;
  provenance: {
    sourceRoot: string;
    runAddress: string;
    slug: string | null;
    runId: string | null;
    toolVersion: string;
    createdAt: string | null;
  };
  trace: MemberSlot;
  checkpoints: MemberSlot;
  ledger: {
    present: boolean;
    scanned: number;
    matched: number;
    malformed: number;
    lines: string[];
    reason?: string;
  };
  pairs:
    | { included: false; reason: 'not-requested' | 'no-pairs-found' }
    | { included: true; files: BundleMember[] };
  runMeta: RunMeta;
  attribution: Attribution;
}

/** Counts make an honestly empty slice distinguishable from an unread ledger. */
export interface LedgerSelection {
  lines: string[];
  scanned: number;
  matched: number;
  malformed: number;
}

/** All external facts needed to build a bundle; optional values degrade to named absence. */
export interface BuildBundleInput {
  readonly sourceRoot: string;
  readonly runAddress: string;
  readonly slug?: string | null;
  readonly runId?: string | null;
  readonly toolVersion: string;
  readonly createdAt?: string | null;
  readonly trace?: MemberSlot | BundleMember | null;
  readonly checkpoints?: MemberSlot | BundleMember | null;
  /** null means the ledger itself was absent; each array item is one raw JSONL row. */
  readonly ledgerLines?: readonly string[] | null;
  readonly ledgerReason?: string;
  readonly includePairs?: boolean;
  readonly pairFiles?: readonly BundleMember[] | null;
  /** Each item is an already-read record file body, or an already-parsed record. */
  readonly records?: readonly unknown[] | null;
}

/** Refusals are deliberately small and discriminated so an importer cannot accidentally continue. */
export type ParseResult =
  | { ok: true; bundle: TraceBundle }
  | { ok: false; reason: 'unparseable' }
  | { ok: false; reason: 'unknown-schema'; found: string }
  | { ok: false; reason: 'member-shape'; member: string };

/** The two identities used by the existing run-addressing schemes. */
export interface RunIdentity {
  readonly slug: string | null;
  readonly runId: string | null;
}

/** Facts observed by the I/O caller; no path in the resulting plan is absolute. */
export interface ImportDestinationFacts {
  /** Target run directory relative to the explicitly supplied destination root. */
  readonly runDir?: string;
  readonly existingPaths?: readonly string[] | ReadonlySet<string>;
  readonly runDirHasContent: boolean;
  /** Identity read from the target run, or null when a fresh target has none. */
  readonly runIdentity: RunIdentity | null;
  readonly force?: boolean;
  readonly withPairs?: boolean;
  /** File name/address of the imported bundle, persisted in the run-meta sidecar. */
  readonly bundleName: string;
}

/** A caller executes writes only when ok is true; fatal refusals therefore produce no writes. */
export interface ImportPlan {
  writes: { path: string; content: string }[];
  refusals: { path: string; reason: string }[];
  ok: boolean;
}

const ATTRIBUTION_RULE =
  'last-writer-wins by timestamp is a CHOICE: a run whose phases used different models has no single honest answer; this reports "who ran it last"';

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim() !== '';
}

function nonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

/** A member origin must remain below the root to which the caller applies the plan. */
function safeRelativePath(value: unknown): value is string {
  if (!nonEmptyString(value) || value.includes('\0') || value.includes('\\')) return false;
  if (value.startsWith('/') || /^[A-Za-z]:/.test(value)) return false;
  return value.split('/').every((part) => part !== '' && part !== '.' && part !== '..');
}

function memberShape(value: unknown): value is BundleMember {
  if (!isObject(value)) return false;
  return safeRelativePath(value['origin']) && typeof value['content'] === 'string';
}

function memberSlotShape(value: unknown): value is MemberSlot {
  if (!isObject(value) || typeof value['present'] !== 'boolean') return false;
  if (value['present'] === true) return memberShape(value['member']);
  return nonEmptyString(value['reason']);
}

function normalizedSlot(value: MemberSlot | BundleMember | null | undefined, absentReason: string): MemberSlot {
  try {
    if (memberSlotShape(value)) return value;
    if (memberShape(value)) return { present: true, member: value };
  } catch {
    // A hostile value is simply not a readable member; exporting the other facts remains useful.
  }
  return { present: false, reason: absentReason };
}

/**
 * Select only rows attributable to this logical run. Slug fallback is deliberately disabled when
 * a row carries any run id: otherwise a foreign loop run sharing a slug leaks into the slice.
 */
export function selectLedgerRows(
  lines: readonly string[] | null | undefined,
  identity: { readonly runId: string | null; readonly slug: string | null } | null | undefined,
): LedgerSelection {
  const selected: string[] = [];
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
    let row: unknown;
    try {
      row = JSON.parse(line);
    } catch {
      malformed++;
      continue;
    }
    if (!isObject(row)) continue;

    const rowRunId = row['runId'];
    const carriesRunId = nonEmptyString(rowRunId);
    const byRunId = carriesRunId && targetRunId !== null && rowRunId === targetRunId;
    const bySlug = !carriesRunId && targetSlug !== null && row['slug'] === targetSlug;
    if (byRunId || bySlug) selected.push(line);
  }

  return { lines: selected, scanned, matched: selected.length, malformed };
}

function readRecord(value: unknown): { ok: true; record: Record<string, unknown> } | { ok: false } {
  let parsed = value;
  if (typeof value === 'string') {
    try {
      parsed = JSON.parse(value);
    } catch {
      return { ok: false };
    }
  }
  return isObject(parsed) ? { ok: true, record: parsed } : { ok: false };
}

function readArgsSlug(value: unknown): { ok: true; slug: string | null } | { ok: false } {
  let args = value;
  if (typeof value === 'string') {
    try {
      args = JSON.parse(value);
    } catch {
      return { ok: false };
    }
  }
  if (args === null || args === undefined) return { ok: true, slug: null };
  if (!isObject(args)) return { ok: true, slug: null };
  return { ok: true, slug: typeof args['slug'] === 'string' ? args['slug'] : null };
}

function modelsUsedShape(value: unknown): value is Record<string, string> {
  if (!isObject(value)) return false;
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
] as const;

function historicalFeatureAdrResultShape(value: unknown): boolean {
  if (!isObject(value)) return false;
  // Older feature-ADR result fields drifted across versions, so require a recognisable threshold
  // rather than an exact key set while still refusing arbitrary objects.
  const recognisedKeys = HISTORICAL_FEATURE_ADR_RESULT_KEYS.filter((key) => (
    Object.prototype.hasOwnProperty.call(value, key)
  ));
  return recognisedKeys.length >= 3;
}

function recordPredatesModelRouting(record: Record<string, unknown>): boolean {
  const result = record['result'];
  if (result === null || result === undefined) return true;
  if (!isObject(result) || modelsUsedShape(result['modelsUsed'])) return false;
  return historicalFeatureAdrResultShape(result);
}

function harnessRecordShape(value: unknown): value is HarnessRecord {
  if (!isObject(value)) return false;
  if (!nonEmptyString(value['runId']) || !nonEmptyString(value['timestamp'])) return false;
  if (typeof value['agentCount'] !== 'number' || !Number.isFinite(value['agentCount'])) return false;
  const result = value['result'];
  if (!isObject(result) || !modelsUsedShape(result['modelsUsed'])) return false;
  return !('usageEvents' in result) || Array.isArray(result['usageEvents']);
}

/**
 * Join persisted harness records without guessing through an unfamiliar layout. Returning no
 * records on a joined shape failure prevents a model-blind record from appearing model-aware.
 */
export function resolveRunMeta(records: readonly unknown[] | null | undefined, slug: string | null): RunMeta {
  try {
    if (!Array.isArray(records) || records.length === 0) {
      return { resolved: false, reason: 'records-absent' };
    }

    const joined: Record<string, unknown>[] = [];
    for (const source of records) {
      const read = readRecord(source);
      if (!read.ok) return { resolved: false, reason: 'unreadable' };
      const args = readArgsSlug(read.record['args']);
      if (!args.ok) return { resolved: false, reason: 'unreadable' };
      if (slug !== null && args.slug === slug) joined.push(read.record);
    }

    if (joined.length === 0) return { resolved: false, reason: 'no-match' };

    // The unit of judgement is the RECORD, not the slug: the two-phase L/XL flow puts an older
    // first phase and a newer re-invoke under ONE slug, so refusing the slug because one sibling
    // predates model routing throws away data that is right there (MEASURED: 1 slug of 32).
    const recognised: HarnessRecord[] = [];
    const notUsable: Record<string, unknown>[] = [];
    for (const record of joined) {
      if (harnessRecordShape(record)) recognised.push(record as HarnessRecord);
      else notUsable.push(record);
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
  } catch {
    return { resolved: false, reason: 'unreadable' };
  }
}

/**
 * Fold the labelled convenience view alongside its source records. Last-writer-wins is explicitly
 * a policy choice, and the source ids let a later consumer choose and audit a different policy.
 */
export function foldAttribution(records: readonly HarnessRecord[] | null | undefined): Attribution {
  if (!Array.isArray(records) || records.length === 0) return { derived: false, reason: 'no-runmeta' };

  try {
    const ordered = records
      .map((record, index) => ({ record, index }))
      .sort((a, b) => {
        const left = typeof a.record.timestamp === 'string' ? a.record.timestamp : '';
        const right = typeof b.record.timestamp === 'string' ? b.record.timestamp : '';
        const byTimestamp = left < right ? -1 : left > right ? 1 : 0;
        return byTimestamp === 0 ? a.index - b.index : byTimestamp;
      });
    const byStage: Record<string, string> = {};
    const fromRecordIds: string[] = [];
    for (const { record } of ordered) {
      if (nonEmptyString(record.runId)) fromRecordIds.push(record.runId);
      const models = isObject(record.result) ? record.result.modelsUsed : undefined;
      if (!isObject(models)) continue;
      for (const [stage, model] of Object.entries(models)) {
        if (stage === '' || !nonEmptyString(model)) continue;
        Object.defineProperty(byStage, stage, {
          value: model,
          writable: true,
          enumerable: true,
          configurable: true,
        });
      }
    }
    return { derived: true, rule: ATTRIBUTION_RULE, fromRecordIds, byStage };
  } catch {
    return { derived: false, reason: 'unreadable-runmeta' };
  }
}

function emptyBundle(): TraceBundle {
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
export function buildBundle(input: BuildBundleInput): TraceBundle {
  try {
    const slug = typeof input.slug === 'string' ? input.slug : null;
    const runId = typeof input.runId === 'string' ? input.runId : null;
    const trace = normalizedSlot(input.trace, 'not-provided');
    const checkpoints = normalizedSlot(input.checkpoints, 'not-provided');

    let ledger: TraceBundle['ledger'];
    if (Array.isArray(input.ledgerLines)) {
      const selection = selectLedgerRows(input.ledgerLines, { runId, slug });
      ledger = { present: true, ...selection };
    } else {
      ledger = {
        present: false,
        scanned: 0,
        matched: 0,
        malformed: 0,
        lines: [],
        reason: nonEmptyString(input.ledgerReason) ? input.ledgerReason : 'not-provided',
      };
    }

    let pairs: TraceBundle['pairs'];
    if (input.includePairs !== true) {
      pairs = { included: false, reason: 'not-requested' };
    } else {
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
  } catch {
    return emptyBundle();
  }
}

/** JSON escaping changes only the container representation; member content round-trips verbatim. */
export function serializeBundle(bundle: TraceBundle): string {
  try {
    const text = JSON.stringify(bundle);
    return typeof text === 'string' ? text : '';
  } catch {
    return '';
  }
}

function provenanceShape(value: unknown): value is TraceBundle['provenance'] {
  if (!isObject(value)) return false;
  return (
    typeof value['sourceRoot'] === 'string' &&
    typeof value['runAddress'] === 'string' &&
    (typeof value['slug'] === 'string' || value['slug'] === null) &&
    (typeof value['runId'] === 'string' || value['runId'] === null) &&
    typeof value['toolVersion'] === 'string' &&
    (typeof value['createdAt'] === 'string' || value['createdAt'] === null)
  );
}

function ledgerShape(value: unknown): value is TraceBundle['ledger'] {
  if (!isObject(value) || typeof value['present'] !== 'boolean') return false;
  if (!nonNegativeInteger(value['scanned']) || !nonNegativeInteger(value['matched']) || !nonNegativeInteger(value['malformed'])) return false;
  if (!Array.isArray(value['lines']) || !value['lines'].every((line) => typeof line === 'string' && jsonObjectLine(line))) return false;
  if (value['matched'] !== value['lines'].length || value['scanned'] < value['matched'] + value['malformed']) return false;
  return value['present'] === true || nonEmptyString(value['reason']);
}

function jsonObjectLine(line: string): boolean {
  try {
    return isObject(JSON.parse(line));
  } catch {
    return false;
  }
}

function jsonlShape(content: string, validate: (value: unknown) => boolean): boolean {
  for (const line of content.split('\n')) {
    if (line.trim() === '') continue;
    let value: unknown;
    try {
      value = JSON.parse(line);
    } catch {
      return false;
    }
    if (!validate(value)) return false;
  }
  return true;
}

function traceContentShape(slot: MemberSlot): boolean {
  return !slot.present || jsonlShape(slot.member.content, (event) => traceValidateEvent(event) === null);
}

function checkpointContentShape(slot: MemberSlot): boolean {
  return !slot.present || jsonlShape(slot.member.content, (entry) => (
    isObject(entry) &&
    nonEmptyString(entry['stage']) &&
    nonEmptyString(entry['inputHash']) &&
    'result' in entry &&
    entry['result'] !== null &&
    entry['result'] !== undefined
  ));
}

function pairContentShape(member: BundleMember): boolean {
  return jsonlShape(member.content, (pair) => (
    isObject(pair) &&
    nonEmptyString(pair['schema']) &&
    nonEmptyString(pair['slug']) &&
    nonEmptyString(pair['stage']) &&
    typeof pair['input'] === 'string' &&
    typeof pair['output'] === 'string'
  ));
}

function pairsShape(value: unknown): value is TraceBundle['pairs'] {
  if (!isObject(value) || typeof value['included'] !== 'boolean') return false;
  if (value['included'] === false) return value['reason'] === 'not-requested' || value['reason'] === 'no-pairs-found';
  return Array.isArray(value['files']) && value['files'].length > 0 && value['files'].every((file) => memberShape(file) && pairContentShape(file));
}

function runMetaShape(value: unknown): value is RunMeta {
  if (!isObject(value) || typeof value['resolved'] !== 'boolean') return false;
  if (value['resolved'] === false) {
    return value['reason'] === 'records-absent' || value['reason'] === 'no-match' || value['reason'] === 'unreadable' || value['reason'] === 'predates-model-routing' || value['reason'] === 'layout-unrecognised';
  }
  return Array.isArray(value['records']) && value['records'].every(harnessRecordShape);
}

function stringRecordShape(value: unknown): value is Record<string, string> {
  return isObject(value) && Object.entries(value).every(([key, item]) => key !== '' && typeof item === 'string');
}

function attributionShape(value: unknown): value is Attribution {
  if (!isObject(value) || typeof value['derived'] !== 'boolean') return false;
  if (value['derived'] === false) return nonEmptyString(value['reason']);
  return (
    nonEmptyString(value['rule']) &&
    Array.isArray(value['fromRecordIds']) &&
    value['fromRecordIds'].every(nonEmptyString) &&
    stringRecordShape(value['byStage'])
  );
}

/**
 * Recognise the complete current format or refuse it. Validation finishes before the bundle is
 * returned, so an importer can never receive a valid-looking subset of a corrupt artifact.
 */
export function parseBundle(text: string): ParseResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, reason: 'unparseable' };
  }
  if (!isObject(parsed)) return { ok: false, reason: 'unknown-schema', found: 'undefined' };
  if (parsed['schema'] !== TRACE_BUNDLE_SCHEMA) {
    let found: string;
    try {
      found = String(parsed['schema']);
    } catch {
      found = 'unreadable';
    }
    return { ok: false, reason: 'unknown-schema', found };
  }
  if (!provenanceShape(parsed['provenance'])) return { ok: false, reason: 'member-shape', member: 'provenance' };
  if (!memberSlotShape(parsed['trace']) || !traceContentShape(parsed['trace'])) return { ok: false, reason: 'member-shape', member: 'trace' };
  if (!memberSlotShape(parsed['checkpoints']) || !checkpointContentShape(parsed['checkpoints'])) return { ok: false, reason: 'member-shape', member: 'checkpoints' };
  if (!ledgerShape(parsed['ledger'])) return { ok: false, reason: 'member-shape', member: 'ledger' };
  if (!pairsShape(parsed['pairs'])) return { ok: false, reason: 'member-shape', member: 'pairs' };
  if (!runMetaShape(parsed['runMeta'])) return { ok: false, reason: 'member-shape', member: 'runMeta' };
  if (!attributionShape(parsed['attribution'])) return { ok: false, reason: 'member-shape', member: 'attribution' };
  return { ok: true, bundle: parsed as unknown as TraceBundle };
}

function canonicalRunDir(bundle: TraceBundle): string | null {
  if (nonEmptyString(bundle.provenance.slug) && safeRelativePath(bundle.provenance.slug)) {
    return 'features/' + bundle.provenance.slug;
  }
  if (nonEmptyString(bundle.provenance.runId) && safeRelativePath(bundle.provenance.runId)) {
    return '.dz/loop-trace/' + bundle.provenance.runId;
  }
  return null;
}

function mismatchReason(bundle: TraceBundle, destination: RunIdentity | null): string | null {
  if (destination === null) return null;
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

function joinRelative(base: string, child: string): string | null {
  if (!safeRelativePath(base) || !safeRelativePath(child)) return null;
  return base + '/' + child;
}

function listingHasRunContent(paths: readonly string[] | ReadonlySet<string> | undefined, runDir: string): boolean {
  if (paths === undefined) return false;
  for (const path of paths) {
    if (path.startsWith(runDir + '/')) return true;
  }
  return false;
}

function runMetaContent(bundle: TraceBundle, bundleName: string): string {
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
export function planImport(bundle: TraceBundle, destFacts: ImportDestinationFacts): ImportPlan {
  const refusals: ImportPlan['refusals'] = [];
  try {
    const canonical = canonicalRunDir(bundle);
    const suppliedRunDir = nonEmptyString(destFacts.runDir) ? destFacts.runDir : null;
    const runDir = suppliedRunDir ?? canonical;
    if (runDir === null || !safeRelativePath(runDir)) {
      refusals.push({ path: suppliedRunDir ?? '.', reason: 'bundle provenance does not identify a safe native run directory' });
    } else if (canonical !== null && suppliedRunDir !== null && suppliedRunDir !== canonical) {
      refusals.push({ path: suppliedRunDir, reason: `bundle provenance identifies run directory "${canonical}", not "${suppliedRunDir}"` });
    }

    const mismatch = mismatchReason(bundle, destFacts.runIdentity);
    if (mismatch !== null) refusals.push({ path: runDir ?? '.', reason: mismatch });

    const runDirHasContent = runDir !== null && (
      destFacts.runDirHasContent || listingHasRunContent(destFacts.existingPaths, runDir)
    );
    if (runDir !== null && runDirHasContent) {
      if (destFacts.force !== true) {
        refusals.push({ path: runDir, reason: 'destination run directory already has content; force is required for the bundle own run' });
      } else if (destFacts.runIdentity === null || (destFacts.runIdentity.slug === null && destFacts.runIdentity.runId === null)) {
        refusals.push({ path: runDir, reason: 'destination identity is unavailable, so bundle ownership cannot be established even under force' });
      }
    }

    if (!nonEmptyString(destFacts.bundleName)) {
      refusals.push({ path: runDir ?? '.', reason: 'source bundle name is required for the run-meta sidecar' });
    }
    if (refusals.length > 0 || runDir === null) return { writes: [], refusals, ok: false };

    const writes: ImportPlan['writes'] = [];
    const addRunMember = (slot: MemberSlot, label: string): void => {
      if (!slot.present) return;
      const path = joinRelative(runDir, slot.member.origin);
      if (path === null) refusals.push({ path: slot.member.origin, reason: `${label} origin is not a safe relative path` });
      else writes.push({ path, content: slot.member.content });
    };
    addRunMember(bundle.trace, 'trace');
    addRunMember(bundle.checkpoints, 'checkpoints');

    if (bundle.ledger.present) {
      writes.push({ path: TRACE_BUNDLE_LEDGER_PATH, content: bundle.ledger.lines.join('\n') });
    }
    if (bundle.pairs.included && destFacts.withPairs === true) {
      for (const file of bundle.pairs.files) {
        if (!memberShape(file)) refusals.push({ path: 'pairs', reason: 'pair origin is not a safe relative path' });
        else writes.push({ path: file.origin, content: file.content });
      }
    }

    const runMetaPath = joinRelative(runDir, TRACE_BUNDLE_RUN_META_FILE);
    if (runMetaPath === null) refusals.push({ path: runDir, reason: 'run-meta path is not safe' });
    else writes.push({ path: runMetaPath, content: runMetaContent(bundle, destFacts.bundleName) });

    if (refusals.length > 0) return { writes: [], refusals, ok: false };
    return { writes, refusals: [], ok: true };
  } catch {
    return { writes: [], refusals: [{ path: '.', reason: 'destination facts are unreadable' }], ok: false };
  }
}

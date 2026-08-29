/**
 * Pure recall-usage accounting for the dz APPLY leg.
 *
 * The live hook writes one JSONL event when a learned pattern is actually injected into a prompt.
 * This module parses that append-only log, folds it into per-pattern usage stats, and compacts it
 * into aggregate JSONL rows when it crosses a bounded size. It deliberately knows nothing about the
 * filesystem; callers own reads/writes so the hook and statusline can keep their never-block rules.
 *
 * Compaction RE-CHAINS everything it writes and records what it measured in its input, so that a
 * rewrite which counts an event twice fails `verifyEventChain` instead of producing a well-formed
 * lie — the 2 → 4 → 6 defect below is the reason (see `event-chain.ts`, ADR-002).
 *
 * @packageDocumentation
 */

// STATIC node: imports, deliberately (2026-08-19). A deferred `require('node:fs')` here compiled
// into an ESM dist, where `require` is NOT in scope: every call from the emitted `.cjs` hook threw
// ReferenceError into `appendRecallUsage`'s own catch and returned **0 rows appended, silently**.
// The Codex recall leg looked wired and correctly-silent for exactly the reason AM-4's forced-hit
// canary exists to expose. Importing node: modules at the top costs nothing — they are built in.
import { appendFileSync, closeSync, existsSync, fstatSync, mkdirSync, openSync, readFileSync, readSync } from 'node:fs';
import { dirname, join } from 'node:path';

import {
  EMPTY_LOG_TAIL,
  EVENT_CHAIN_FIELD_OVERHEAD_BYTES,
  EVENT_CHAIN_LEDGER_KIND,
  EVENT_CHAIN_TAIL_BYTES,
  appendChainedLines,
  chainRewrite,
  defaultEventWeight,
  readTailInfo,
  verifyEventChainText,
  type EventChainDefect,
  type LogTail,
} from './event-chain.js';

export const RECALL_USAGE_LOG_RELATIVE = '.dz/recall-usage.jsonl';
export const RECALL_USAGE_LOG_MAX_BYTES = 1_048_576;
export const RECALL_USAGE_COMPACT_TARGET_BYTES = Math.floor(RECALL_USAGE_LOG_MAX_BYTES * 0.75);
/** Newest query-bearing read rows survive compaction verbatim — they are the replay corpus. */
export const RECALL_USAGE_REPLAY_KEEP = 500;

export interface RecallUsageReadRecord {
  readonly dzId: string;
  readonly score: number;
  readonly ts: string;
  /**
   * The PROMPT the lesson was injected into (truncated). Without it the log can say a lesson was
   * used but never say FOR WHAT — which made cold-vs-warm replay unbuildable from 39 recorded
   * events (MEASURED, compounding data inventory 2026-07-28). `.dz/` is git-ignored, so a truncated
   * query stays on this machine.
   */
  readonly query?: string;
  /** The session/run the injection happened in — lets replay group events into runs. */
  readonly runId?: string;
  /** One id per PROMPT (the hook writes one row per injected hit — up to 3 per prompt). */
  readonly eventId?: string;
  /** True when the stored query is a PREFIX of the real prompt — not replayable. */
  readonly queryTruncated?: boolean;
  /**
   * WHICH HOST injected the lesson (ADR-003 §1, H-B additive). Absent ⇒ `claude-code`, so every row
   * written before the Codex leg keeps its meaning without a migration.
   */
  readonly runtime?: Runtime;
}

/** The hosts that run the apply leg. Additive by design: an old reader ignores the field. */
export type Runtime = 'claude-code' | 'codex';

export const RUNTIMES: readonly Runtime[] = ['claude-code', 'codex'];

/** A row without `runtime` predates the Codex leg and is Claude Code's by construction. */
export function runtimeOf(record: RecallUsageReadRecord): Runtime {
  return record.runtime ?? 'claude-code';
}

function normalizeRuntime(value: unknown): Runtime | undefined {
  return value === 'claude-code' || value === 'codex' ? value : undefined;
}

function normalizeRuntimes(value: unknown): readonly Runtime[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const set = new Set<Runtime>();
  for (const v of value) {
    const r = normalizeRuntime(v);
    if (r !== undefined) set.add(r);
  }
  return set.size === 0 ? undefined : [...set].sort();
}

/** Query text is capped so a pasted wall of text cannot bloat the log. */
export const RECALL_USAGE_QUERY_MAX_CHARS = 200;

export interface RecallUsageAggregateRecord {
  readonly kind: 'aggregate';
  readonly dzId: string;
  readonly reads: number;
  readonly firstReadAt: string;
  readonly lastReadAt: string;
  readonly maxScore: number;
  readonly totalScore: number;
  readonly compactedAt: string;
  /**
   * The SET UNION of the runtimes whose reads were folded into this record (sorted, deduped).
   *
   * AM-27, and the whole reason it exists: `compactVerifiedRecallUsageLog` keeps verbatim only the
   * newest {@link RECALL_USAGE_REPLAY_KEEP} read rows that carry a `query`. Everything else — a
   * *fresh* row without `query` included — is folded into this record, whose merge key is `dzId`
   * alone. The allowlist on the READ record therefore never touches the path where provenance is
   * actually lost. The union does.
   *
   * Residual accepted loss, registered in `architecture/degradations.md`: this says WHICH runtimes
   * used a lesson, not HOW OFTEN each did. Widening the merge key to `(dzId, runtime)` would split
   * the stats rows `buildRecallUsageReport` looks up by `dzId` alone — a cross-feature blast radius
   * this leg has no mandate for.
   */
  readonly runtimes?: readonly Runtime[];
}

export type RecallUsageRecord = RecallUsageReadRecord | RecallUsageAggregateRecord;

export interface ParsedRecallUsageLog {
  readonly records: readonly RecallUsageRecord[];
  readonly validLines: number;
  readonly invalidLines: number;
}

export interface RecallUsageStat {
  readonly dzId: string;
  readonly reads: number;
  readonly firstReadAt: string;
  readonly lastReadAt: string;
  readonly maxScore: number;
  readonly avgScore: number;
  /** Set union of contributing runtimes (AM-27). Empty ⇒ nothing carried provenance. */
  readonly runtimes: readonly Runtime[];
}

export interface RecallPatternUsageRef {
  readonly dzId: string;
  readonly pattern: string;
  readonly domain?: string;
  readonly reward?: number;
}

export interface RecallUsagePatternRow extends RecallPatternUsageRef {
  readonly reads: number;
  readonly firstReadAt?: string;
  readonly lastReadAt?: string;
  readonly maxScore?: number;
  readonly avgScore?: number;
}

export interface RecallUsageReport {
  readonly totalPatterns: number;
  readonly usedPatterns: number;
  readonly neverReadPatterns: number;
  readonly totalReads: number;
  readonly unknownReadPatterns: number;
  readonly invalidLines: number;
  readonly top: readonly RecallUsagePatternRow[];
  readonly neverRead: readonly RecallUsagePatternRow[];
  readonly unknown: readonly RecallUsageStat[];
  readonly all: readonly RecallUsagePatternRow[];
}

interface Acc {
  dzId: string;
  reads: number;
  firstReadAt: string;
  firstMs: number;
  lastReadAt: string;
  lastMs: number;
  maxScore: number;
  totalScore: number;
  runtimes: Set<Runtime>;
}

export interface RecallUsageRecordInput {
  readonly dzId?: unknown;
  readonly score?: unknown;
  readonly ts?: unknown;
  readonly query?: unknown;
  readonly runId?: unknown;
  readonly eventId?: unknown;
  readonly queryTruncated?: unknown;
  readonly runtime?: unknown;
}

/**
 * The normalized RECORD, before serialization — the writer needs the object so it can hang the
 * event-chain fields off it (`seq`/`prevHash`, ADR-001) instead of string-splicing a finished line.
 */
export function buildRecallUsageRecord(input: RecallUsageRecordInput): RecallUsageReadRecord | undefined {
  return normalizeReadRecord(input);
}

export function formatRecallUsageRecord(input: RecallUsageRecordInput): string | undefined {
  const rec = buildRecallUsageRecord(input);
  return rec === undefined ? undefined : `${JSON.stringify(rec)}\n`;
}

export function parseRecallUsageLog(text: string): ParsedRecallUsageLog {
  const records: RecallUsageRecord[] = [];
  let invalidLines = 0;
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (trimmed === '') continue;
    try {
      const parsed = JSON.parse(trimmed) as unknown;
      // The compaction ledger (ADR-002) is chain bookkeeping, not a usage record. Counting it as an
      // invalid line would make `invalidLines` — a health number the report prints — lie by one per
      // compaction generation.
      if (isRecord(parsed) && parsed['kind'] === EVENT_CHAIN_LEDGER_KIND) continue;
      const record = normalizeRecord(parsed);
      if (record === undefined) {
        invalidLines += 1;
      } else {
        records.push(record);
      }
    } catch {
      invalidLines += 1;
    }
  }
  return { records, validLines: records.length, invalidLines };
}

export function aggregateRecallUsage(records: readonly RecallUsageRecord[]): readonly RecallUsageStat[] {
  const byId = new Map<string, Acc>();
  for (const rec of records) {
    if (isAggregate(rec)) {
      mergeAggregate(byId, rec);
    } else {
      mergeRead(byId, rec);
    }
  }
  return [...byId.values()]
    .map((a) => ({
      dzId: a.dzId,
      reads: a.reads,
      firstReadAt: a.firstReadAt,
      lastReadAt: a.lastReadAt,
      maxScore: a.maxScore,
      avgScore: a.totalScore / a.reads,
      runtimes: [...a.runtimes].sort(),
    }))
    .sort(compareStats);
}

export function buildRecallUsageReport(
  patterns: readonly RecallPatternUsageRef[],
  parsed: ParsedRecallUsageLog,
): RecallUsageReport {
  const stats = aggregateRecallUsage(parsed.records);
  const statsById = new Map(stats.map((s) => [s.dzId, s]));
  const patternIds = new Set<string>();
  const all: RecallUsagePatternRow[] = [];

  for (const p of patterns) {
    if (p.dzId.trim() === '') continue;
    if (patternIds.has(p.dzId)) continue;
    patternIds.add(p.dzId);
    const stat = statsById.get(p.dzId);
    const base = patternRef(p);
    if (stat === undefined) {
      all.push({ ...base, reads: 0 });
    } else {
      all.push({
        ...base,
        reads: stat.reads,
        firstReadAt: stat.firstReadAt,
        lastReadAt: stat.lastReadAt,
        maxScore: stat.maxScore,
        avgScore: stat.avgScore,
      });
    }
  }

  const top = all.filter((r) => r.reads > 0).sort(compareRows);
  const neverRead = all.filter((r) => r.reads === 0).sort((a, b) => a.dzId.localeCompare(b.dzId));
  const unknown = stats.filter((s) => !patternIds.has(s.dzId)).sort(compareStats);

  return {
    totalPatterns: all.length,
    usedPatterns: top.length,
    neverReadPatterns: neverRead.length,
    totalReads: stats.reduce((sum, s) => sum + s.reads, 0),
    unknownReadPatterns: unknown.length,
    invalidLines: parsed.invalidLines,
    top,
    neverRead,
    unknown,
    all: all.sort(compareRows),
  };
}

export function shouldCompactRecallUsageLogSize(
  sizeBytes: number,
  maxBytes: number = RECALL_USAGE_LOG_MAX_BYTES,
): boolean {
  return Number.isFinite(sizeBytes) && sizeBytes > validMax(maxBytes);
}

export interface CompactRecallUsageOptions {
  readonly maxBytes?: number;
  readonly targetBytes?: number;
  readonly compactedAt?: string;
  /**
   * Compact even when the input's chain is already defective. OFF by default and never set by any
   * automatic caller — see {@link compactRecallUsageLogChecked} for why.
   */
  readonly force?: boolean;
}

export type CompactRecallUsageStatus = 'compacted' | 'refused-dirty' | 'too-large';

export interface CompactRecallUsageResult {
  readonly status: CompactRecallUsageStatus;
  /** Empty unless `status === 'compacted'`. */
  readonly text: string;
  /** The input defects that caused a refusal. */
  readonly defects: readonly EventChainDefect[];
}

/**
 * Compaction with its verdict attached.
 *
 * AM-2 (Codex QE HIGH-2) — A REWRITER MUST NOT LAUNDER. Compaction parses the input, drops what it
 * cannot read and re-chains from genesis, so a file carrying a `BrokenLink` or a `DoubleCounted`
 * came out the other side verifying `ok: true`. The strongest evidence check in the system was
 * being erased by the routine that runs automatically at a size threshold — corruption converted
 * into a clean chain, with no record that it ever existed.
 *
 * So: the input is VERIFIED FIRST, and a defective chained region REFUSES. The pre-chain prefix is
 * legal and never blocks anything (FR-5); only real defects do.
 *
 * ACCEPTED CONSEQUENCE, stated because it is the cost: a log that stays defective stops being
 * compacted and grows past its cap. That is the right way round — the size cap is a convenience,
 * the evidence is the product — and it is not silent: `dz doctor` and `dz compounding` both report
 * the chain defect, and the caller logs the refusal.
 */
export function compactRecallUsageLogChecked(
  text: string,
  opts: CompactRecallUsageOptions = {},
): CompactRecallUsageResult {
  if (opts.force !== true) {
    const v = verifyEventChainText(typeof text === 'string' ? text : '');
    if (!v.ok) return { status: 'refused-dirty', text: '', defects: v.defects };
  }
  const out = compactVerifiedRecallUsageLog(text, opts);
  return out === ''
    ? { status: 'too-large', text: '', defects: [] }
    : { status: 'compacted', text: out, defects: [] };
}

/**
 * Back-compatible wrapper: the compacted text, or `''` when the rewrite is REFUSED (a defective
 * input) or cannot fit. Callers that need to tell those apart use
 * {@link compactRecallUsageLogChecked}.
 */
export function compactRecallUsageLog(text: string, opts: CompactRecallUsageOptions = {}): string {
  return compactRecallUsageLogChecked(text, opts).text;
}

function compactVerifiedRecallUsageLog(text: string, opts: CompactRecallUsageOptions): string {
  const maxBytes = validMax(opts.maxBytes ?? RECALL_USAGE_LOG_MAX_BYTES);
  const targetBytes = validTarget(opts.targetBytes ?? Math.floor(maxBytes * 0.75), maxBytes);
  const compactedAt = validTs(opts.compactedAt) ? opts.compactedAt : new Date(0).toISOString();
  const parsed = parseRecallUsageLog(text).records;
  // The query-bearing read rows are the ONLY inputs a cold-vs-warm replay has — aggregating them
  // away silently reset the accruing corpus at the size threshold (Codex #4). Keep the NEWEST ones
  // (bounded) VERBATIM — and aggregate ONLY the rest: folding a retained row into an aggregate AND
  // re-emitting it counted the same event twice per compaction (re-review: reads grew 2→4→6).
  const replayRows = parsed
    .filter((r): r is RecallUsageReadRecord => !('kind' in r) && typeof (r as RecallUsageReadRecord).query === 'string')
    .sort((a, b) => a.ts.localeCompare(b.ts))
    .slice(-RECALL_USAGE_REPLAY_KEEP);
  const retained = new Set(replayRows);
  const toAggregate = parsed.filter((r) => !retained.has(r as RecallUsageReadRecord));
  const stats = aggregateRecallUsage(toAggregate);
  // Replay rows are budgeted FIRST: they are irreplaceable (the corpus), aggregates are re-derivable.
  const candidates: RecallUsageRecord[] = [...replayRows, ...stats.map((s) => aggregateRecord(s, compactedAt))];

  // The event weight of the INPUT, measured before aggregation. It must come from the input — a
  // total derived from the output could never disagree with it (ADR-002), which is exactly how a
  // double-counting rewrite went unseen until a human re-read the code.
  let sourceEvents = 0;
  for (const rec of parsed) sourceEvents += defaultEventWeight(rec as unknown as Record<string, unknown>);

  // SELECT, then chain (ADR-002 decision 5): trimming a chain after building it punches holes in it.
  // Each candidate is charged its own bytes plus a fixed allowance for the chain fields it will get.
  let selected = candidates;
  if (byteLength(joinLines(candidates.map(serializeWithChainAllowance))) > maxBytes) {
    const kept: RecallUsageRecord[] = [];
    let used = 0;
    for (const rec of candidates) {
      const cost = byteLength(`${serializeWithChainAllowance(rec)}\n`);
      if (kept.length > 0 && used + cost > targetBytes) continue;
      if (cost > maxBytes) continue;
      if (used + cost <= maxBytes) {
        kept.push(rec);
        used += cost;
      }
    }
    selected = kept;
  }

  // Final shrink: drop from the TAIL and re-chain, so the survivors are always a valid chain.
  for (;;) {
    const out = joinLines(chainRewrite(selected, { sourceEvents, droppedEvents: droppedEvents(sourceEvents, selected), compactedAt }));
    if (byteLength(out) <= maxBytes) return out;
    if (selected.length === 0) return '';
    selected = selected.slice(0, -1);
  }
}

/**
 * What the byte budget discarded — so a deliberate trim is never mistaken for lost records.
 *
 * The `Math.max(0, …)` is LOAD-BEARING, not defensive tidiness: it is what stops a rewrite that
 * emits MORE events than it read from explaining its own inflation away with a negative "dropped"
 * figure. Over-accounting therefore always reaches {@link verifyEventChain} as `DoubleCounted`.
 */
function droppedEvents(sourceEvents: number, selected: readonly RecallUsageRecord[]): number {
  let accounted = 0;
  for (const rec of selected) accounted += defaultEventWeight(rec as unknown as Record<string, unknown>);
  return Math.max(0, sourceEvents - accounted);
}

/** A record's serialized size plus the allowance for the chain fields it will carry. */
function serializeWithChainAllowance(rec: RecallUsageRecord): string {
  return JSON.stringify(rec) + ' '.repeat(EVENT_CHAIN_FIELD_OVERHEAD_BYTES);
}

function normalizeRecord(value: unknown): RecallUsageRecord | undefined {
  if (!isRecord(value)) return undefined;
  if (value['kind'] === 'aggregate') return normalizeAggregateRecord(value);
  return normalizeReadRecord(value);
}

function normalizeReadRecord(value: unknown): RecallUsageReadRecord | undefined {
  if (!isRecord(value)) return undefined;
  const dzId = value['dzId'];
  const score = value['score'];
  const ts = value['ts'];
  if (typeof dzId !== 'string' || dzId.trim() === '') return undefined;
  if (typeof score !== 'number' || !Number.isFinite(score)) return undefined;
  if (!validTs(ts)) return undefined;
  const query = value['query'];
  const runId = value['runId'];
  return {
    dzId: dzId.trim(),
    score,
    ts,
    ...(typeof query === 'string' && query.trim() !== ''
      ? { query: query.slice(0, RECALL_USAGE_QUERY_MAX_CHARS) }
      : {}),
    ...(typeof runId === 'string' && runId.trim() !== '' ? { runId: runId.trim() } : {}),
    ...(typeof value['eventId'] === 'string' && (value['eventId'] as string).trim() !== '' ? { eventId: (value['eventId'] as string).trim() } : {}),
    ...(value['queryTruncated'] === true ? { queryTruncated: true } : {}),
    // ALLOWLIST (AM-20): the normaliser is an allowlist and `compactVerifiedRecallUsageLog`
    // re-serialises every retained row through it — a non-allowlisted field dies at the first
    // compaction. Necessary, but NOT sufficient: see `runtimes` on the aggregate (AM-27).
    ...(normalizeRuntime(value['runtime']) !== undefined ? { runtime: normalizeRuntime(value['runtime'])! } : {}),
  };
}

function normalizeAggregateRecord(value: Record<string, unknown>): RecallUsageAggregateRecord | undefined {
  const dzId = value['dzId'];
  const reads = value['reads'];
  const firstReadAt = value['firstReadAt'];
  const lastReadAt = value['lastReadAt'];
  const maxScore = value['maxScore'];
  const totalScore = value['totalScore'];
  const compactedAt = value['compactedAt'];
  if (typeof dzId !== 'string' || dzId.trim() === '') return undefined;
  if (typeof reads !== 'number' || !Number.isInteger(reads) || reads <= 0) return undefined;
  if (!validTs(firstReadAt) || !validTs(lastReadAt) || !validTs(compactedAt)) return undefined;
  if (typeof maxScore !== 'number' || !Number.isFinite(maxScore)) return undefined;
  if (typeof totalScore !== 'number' || !Number.isFinite(totalScore)) return undefined;
  const runtimes = normalizeRuntimes(value['runtimes']);
  return {
    kind: 'aggregate',
    dzId: dzId.trim(),
    reads,
    firstReadAt,
    lastReadAt,
    maxScore,
    totalScore,
    compactedAt,
    ...(runtimes !== undefined ? { runtimes } : {}),
  };
}

function mergeRead(byId: Map<string, Acc>, rec: RecallUsageReadRecord): void {
  const ms = Date.parse(rec.ts);
  const prev = byId.get(rec.dzId);
  if (prev === undefined) {
    byId.set(rec.dzId, {
      dzId: rec.dzId,
      reads: 1,
      firstReadAt: rec.ts,
      firstMs: ms,
      lastReadAt: rec.ts,
      lastMs: ms,
      maxScore: rec.score,
      totalScore: rec.score,
      runtimes: new Set<Runtime>([runtimeOf(rec)]),
    });
    return;
  }
  prev.runtimes.add(runtimeOf(rec));
  prev.reads += 1;
  prev.totalScore += rec.score;
  prev.maxScore = Math.max(prev.maxScore, rec.score);
  if (ms < prev.firstMs) {
    prev.firstMs = ms;
    prev.firstReadAt = rec.ts;
  }
  if (ms >= prev.lastMs) {
    prev.lastMs = ms;
    prev.lastReadAt = rec.ts;
  }
}

function mergeAggregate(byId: Map<string, Acc>, rec: RecallUsageAggregateRecord): void {
  const firstMs = Date.parse(rec.firstReadAt);
  const lastMs = Date.parse(rec.lastReadAt);
  const prev = byId.get(rec.dzId);
  if (prev === undefined) {
    byId.set(rec.dzId, {
      dzId: rec.dzId,
      reads: rec.reads,
      firstReadAt: rec.firstReadAt,
      firstMs,
      lastReadAt: rec.lastReadAt,
      lastMs,
      maxScore: rec.maxScore,
      totalScore: rec.totalScore,
      runtimes: new Set<Runtime>(rec.runtimes ?? []),
    });
    return;
  }
  for (const r of rec.runtimes ?? []) prev.runtimes.add(r);
  prev.reads += rec.reads;
  prev.totalScore += rec.totalScore;
  prev.maxScore = Math.max(prev.maxScore, rec.maxScore);
  if (firstMs < prev.firstMs) {
    prev.firstMs = firstMs;
    prev.firstReadAt = rec.firstReadAt;
  }
  if (lastMs >= prev.lastMs) {
    prev.lastMs = lastMs;
    prev.lastReadAt = rec.lastReadAt;
  }
}

function aggregateRecord(stat: RecallUsageStat, compactedAt: string): RecallUsageAggregateRecord {
  return {
    kind: 'aggregate',
    dzId: stat.dzId,
    reads: stat.reads,
    firstReadAt: stat.firstReadAt,
    lastReadAt: stat.lastReadAt,
    maxScore: stat.maxScore,
    totalScore: stat.avgScore * stat.reads,
    compactedAt,
    // AM-27's mutant: dropping this union silently destroys per-runtime provenance at the first
    // compaction, and the READ-record allowlist cannot save it because this path never sees one.
    ...(stat.runtimes.length > 0 ? { runtimes: [...stat.runtimes].sort() } : {}),
  };
}

function patternRef(p: RecallPatternUsageRef): RecallPatternUsageRef {
  return {
    dzId: p.dzId,
    pattern: p.pattern,
    ...(p.domain !== undefined ? { domain: p.domain } : {}),
    ...(p.reward !== undefined ? { reward: p.reward } : {}),
  };
}

function compareStats(a: RecallUsageStat, b: RecallUsageStat): number {
  return b.reads - a.reads || Date.parse(b.lastReadAt) - Date.parse(a.lastReadAt) || a.dzId.localeCompare(b.dzId);
}

function compareRows(a: RecallUsagePatternRow, b: RecallUsagePatternRow): number {
  const aLast = a.lastReadAt === undefined ? 0 : Date.parse(a.lastReadAt);
  const bLast = b.lastReadAt === undefined ? 0 : Date.parse(b.lastReadAt);
  return b.reads - a.reads || bLast - aLast || a.dzId.localeCompare(b.dzId);
}

function isAggregate(rec: RecallUsageRecord): rec is RecallUsageAggregateRecord {
  return 'kind' in rec && rec.kind === 'aggregate';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function validTs(value: unknown): value is string {
  return typeof value === 'string' && value.trim() !== '' && !Number.isNaN(Date.parse(value));
}

function validMax(value: number): number {
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : RECALL_USAGE_LOG_MAX_BYTES;
}

function validTarget(value: number, maxBytes: number): number {
  if (!Number.isFinite(value) || value <= 0) return Math.floor(maxBytes * 0.75);
  return Math.min(Math.floor(value), maxBytes);
}

function joinLines(lines: readonly string[]): string {
  return lines.length === 0 ? '' : `${lines.join('\n')}\n`;
}

function byteLength(text: string): number {
  return text.length;
}

/* ========================================================================== */
/* The SHARED writer (`crossrt-2-codex-hooks`, ADR-003 · AM-6/AM-7)           */
/* ========================================================================== */
/*
 * Everything above this line is pure. What follows is the ONE writer both hosts call, and it is
 * here rather than in a helper because the alternative — a second inline appender per runtime — is
 * exactly the drift AM-7 forbids: the Claude helper had the only implementation for 19 days and the
 * Codex leg could not exist without either importing it or copying it.
 *
 * It NEVER throws. A hook that dies on a logging failure costs the user their turn, and the log is
 * telemetry: losing a row is a smaller harm than losing a prompt.
 */

export interface AppendRecallUsageHit {
  readonly dzId: unknown;
  readonly score: unknown;
}

export interface AppendRecallUsageInput {
  /** Project ROOT (the helper walks up to it; a cwd-relative writer splits the log — AM-5). */
  readonly projectRoot: string;
  readonly hits: readonly AppendRecallUsageHit[];
  /** The host that injected. Omitted ⇒ `claude-code`, matching every pre-Codex row. */
  readonly runtime?: Runtime;
  readonly query?: string | undefined;
  readonly runId?: string | undefined;
  /** One id per PROMPT. Generated when absent so a multi-hit prompt still counts as one event. */
  readonly eventId?: string | undefined;
  readonly now?: string;
  /** Test seam. Production leaves it unset and the path is derived from `projectRoot`. */
  readonly logPath?: string;
}

/**
 * Append one prompt's injected hits as CHAINED rows.
 *
 * @returns the number of rows appended; **0** on any failure (unwritable directory, unreadable
 *          tail, empty input). Never throws.
 */
export function appendRecallUsage(input: AppendRecallUsageInput): number {
  try {
    const hits = Array.isArray(input?.hits) ? input.hits : [];
    if (hits.length === 0) return 0;
    const ts = validTs(input.now) ? input.now : new Date().toISOString();
    const eventId =
      typeof input.eventId === 'string' && input.eventId.trim() !== ''
        ? input.eventId.trim()
        : `${ts}:${Math.random().toString(36).slice(2, 10)}`;
    const full = typeof input.query === 'string' ? input.query.trim() : '';
    const query = full !== '' ? full.slice(0, RECALL_USAGE_QUERY_MAX_CHARS) : undefined;
    const queryTruncated = full.length > RECALL_USAGE_QUERY_MAX_CHARS ? true : undefined;

    const records: RecallUsageReadRecord[] = [];
    for (const hit of hits) {
      const rec = normalizeReadRecord({
        dzId: hit?.dzId,
        score: hit?.score,
        ts,
        query,
        runId: input.runId,
        eventId,
        queryTruncated,
        runtime: input.runtime ?? 'claude-code',
      });
      if (rec !== undefined) records.push(rec);
    }
    if (records.length === 0) return 0;

    const logPath = input.logPath ?? join(input.projectRoot, ...RECALL_USAGE_LOG_RELATIVE.split('/'));
    const payload = appendChainedLines(records, readLogTailSync(logPath));
    if (payload === '') return 0;
    mkdirSync(dirname(logPath), { recursive: true });
    appendFileSync(logPath, payload, 'utf-8');
    return records.length;
  } catch {
    return 0; // never-block outranks telemetry completeness
  }
}

/** Read the chain tail. An UNREADABLE tail is a torn tail, never an empty one (event-chain AM-6). */
function readLogTailSync(file: string): LogTail {
  try {
    if (!existsSync(file)) return EMPTY_LOG_TAIL;
    const fd = openSync(file, 'r');
    try {
      const size = fstatSync(fd).size;
      if (!Number.isFinite(size) || size <= 0) return EMPTY_LOG_TAIL;
      const want = Math.min(size, EVENT_CHAIN_TAIL_BYTES);
      const buf = Buffer.alloc(want);
      readSync(fd, buf, 0, want, size - want);
      return readTailInfo(buf.toString('utf-8'), { partial: want < size });
    } finally {
      try { closeSync(fd); } catch { /* nothing to do */ }
    }
  } catch {
    return EMPTY_LOG_TAIL;
  }
}

/**
 * Recall events recorded for one run key — DISTINCT prompts, not rows.
 *
 * Why this exists: the /feature-adr live panel asserted `--recalled 3` as a LITERAL at three call
 * sites, because the fallback writer that lights the panel had nowhere to get a real number. Now
 * that `dz recall` records its own reads, the number is derivable — this is the derivation.
 *
 * Counted by `eventId`, not by row: one prompt that surfaced four lessons writes four rows sharing
 * one eventId, and "recalled 4" would overstate what the operator did by a factor of hits-per-query.
 * Rows predating eventIds (the log's schema grew) count one each — their rows WERE one-per-event.
 *
 * Returns null when the log cannot be read — the caller must record "unknown", never zero: an
 * unreadable log and a run that recalled nothing are different facts (the dz sync 0/0 class).
 */
export function countRecallEventsForRun(projectRoot: string, runId: string): number | null {
  const wanted = runId.trim();
  if (wanted === '') return null;
  const path = join(projectRoot, ...RECALL_USAGE_LOG_RELATIVE.split('/'));
  if (!existsSync(path)) return 0;   // a real, readable absence: nothing has ever been recorded
  let text: string;
  try {
    text = readFileSync(path, 'utf-8');
  } catch {
    return null;
  }
  const events = new Set<string>();
  let preEventRows = 0;
  for (const line of text.split('\n')) {
    if (line.trim() === '') continue;
    let row: Record<string, unknown>;
    try {
      row = JSON.parse(line) as Record<string, unknown>;
    } catch {
      continue;   // a torn row is the chain verifier's business, not a reason to fail the count
    }
    if (row['runId'] !== wanted) continue;
    const ev = row['eventId'];
    if (typeof ev === 'string' && ev !== '') events.add(ev);
    else preEventRows += 1;
  }
  return events.size + preEventRows;
}

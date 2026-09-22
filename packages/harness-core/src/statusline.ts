/**
 * `dz statusline` data source — the FAST, best-effort read behind the live
 * self-learning panel Claude Code renders in its status bar (modeled on
 * agentic-qe's "🎓 12 patterns" statusline, showing dz's OWN counts).
 *
 * Claude Code refreshes a `statusLine` command up to every ~300ms, so this MUST
 * be fast (<~50ms) and MUST NEVER throw or hang — a broken statusline garbles the
 * terminal bar. Every read is therefore:
 * - **readonly + short busy_timeout** — a live MCP writer holding the store lock
 *   must never make the panel wait; we back off immediately, not block.
 * - **best-effort** — any error (absent/corrupt `.dz`, missing native module,
 *   locked db) collapses to `0` / an omitted field, never an exception.
 *
 * @packageDocumentation
 */

import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { createRequire } from 'node:module';

import { listBrain } from './brain.js';
import { withProjectLockSync } from './named-lock.js';
import { RECALL_USAGE_LOG_RELATIVE, aggregateRecallUsage, parseRecallUsageLog } from './recall-usage.js';
import { countLearningStoreRowsReadonly, countSqliteRowsReadonly } from './store-counts.js';
import {
  checkStoreHealth,
  readStoreMark,
  storeSnapshotPath,
  type StoreHealthVerdict,
} from './store-guard.js';

/**
 * Live learning state for one in-flight `/feature-adr` run — the per-run visibility panel
 * that surfaces the Pattern memory loop (POOL learned, RECALLED for this run, STORED this run).
 * Written by the pipeline at Steps 0/8/9 via `writeFeatureAdrState`; read back on the render
 * path (readonly, best-effort) by `readFeatureAdrState`.
 */
export interface FeatureAdrState {
  /** Producer of this panel state. Missing/invalid legacy values are treated as `feature-adr`. */
  readonly kind?: 'feature-adr' | 'loop';
  /** The feature slug the pipeline is working on (kebab-case). */
  readonly slug: string;
  /** Human-readable step label (e.g. "Step 0", "Step 8 QE"). */
  readonly step: string;
  /** Total learned-pattern POOL (all patterns available to recall from) at write time. */
  readonly pool: number;
  /** How many patterns this run RECALLED / used to inform its work. */
  readonly recalled: number;
  /** How many NEW patterns this run STORED back into the pool. */
  readonly stored: number;
  /** How many candidate lessons reinforced an existing pattern instead of writing a duplicate. */
  readonly reinforced?: number;
  /** ISO timestamp of the write — drives the freshness window on the render path. */
  readonly ts: string;
  /** Identity of one pipeline invocation. The monotonic guard never crosses two distinct runs. */
  readonly runId?: string;
  /** Optional run mode (e.g. "reference", "full-qe", "full-qe-extended"). */
  readonly mode?: string;
  /** Complexity tier of the run (S/M/L/XL) — drives done/total on the phase line. Carried forward
   *  by the write path when a later record omits it. */
  readonly tier?: string;
  /** ISO timestamp of the CURRENT phase's start — reset by the write path when the step label
   *  changes, carried forward while it stays the same. Drives the phase line's elapsed minutes. */
  readonly phaseStartTs?: string;
}

/** A snapshot of dz's self-learning state for one project (all fields best-effort). */
export interface StatuslineData {
  /** Count of learned patterns in the project's unified memory store. */
  readonly patterns: number;
  /** Absent on parity; missing/unreadable mirror is explicitly unavailable. */
  readonly patternMirror?:
    | {
      readonly state: 'in-sync' | 'different';
      readonly lexicalMirrorable: number;
      readonly vector: number;
      readonly excluded: { readonly class: number; readonly noise: number };
    }
    | { readonly state: 'unavailable' };
  /** Vector-mirror inventory; absence is explicit instead of being encoded as a missing field. */
  readonly mirror: {
    readonly available: boolean;
    readonly rows: number;
    readonly lessons: number;
    readonly pending: number;
    readonly source: 'agentdb';
  };
  /** Exact lexical-tier availability split; omitted when the enhanced readonly count cannot be established. */
  readonly patternBreakdown?: {
    readonly source: 'lexical' | 'lexical+mirror';
    readonly active: number;
    readonly quarantined: number;
    /** True once quarantine contains at least one third of the lexical pool. */
    readonly attention: boolean;
    /** Exact label drift by dzId; present only when both tiers expose readable identities. */
    readonly tierParity?: { readonly lexicalOnly: number; readonly mirrorOnly: number };
    /** Absolute lexical/vector quarantine-label delta, present only above the tolerated drift threshold. */
    readonly tierDelta?: number;
  };
  /** Count of learned patterns that the live recall hook has actually injected at least once. */
  readonly usedPatterns?: number;
  /** Number of sources registered in the durable cross-project knowledge brain. */
  readonly brainSources: number;
  /**
   * KU-объём КАЖДОГО источника, в том же порядке, что их перечисляет brain. Владелец 2026-09-09:
   * одно число источников не говорит, велик ли корпус и не пуст ли какой-то из них.
   * Пустой массив означает «перечислить не удалось», а не «источников нет» — их число рядом.
   */
  readonly brainKuCounts: readonly number[];
  /** Hours since the last `dz consolidate` run, if a watermark is present. */
  readonly consolidatedAgeH?: number;
  /** Live `/feature-adr` learning state — present ONLY when a fresh run is in flight. */
  readonly featureAdr?: FeatureAdrState;
  /** Persistent owner-facing store warning; healthy/no-mark/error paths omit it. */
  readonly storeHealth?: StatuslineStoreHealth;
}

/** Render-ready details for a non-healthy store verdict. */
export interface StatuslineStoreHealth {
  readonly verdict: Exclude<StoreHealthVerdict, 'ok' | 'no-mark'>;
  /** Explanation for a health verdict that cannot be inferred from counts alone. */
  readonly reason?: string;
  /** Previous maximum for the affected store tier. */
  readonly previousMax?: number;
  /** Snapshot directory used by cold-start recovery guidance. */
  readonly snapshotPath?: string;
  /** Basenames of store files whose readonly count failed. */
  readonly unreadableFiles?: readonly string[];
}

const QUARANTINE_TIER_DRIFT_TOLERANCE = 5;

/** Path of the SQLite pattern store (the Tier-3 backend). */
function sqlitePatternPath(projectRoot: string): string {
  return join(projectRoot, '.dz', 'memory', 'patterns.sqlite');
}

/** The `dz consolidate` watermark (max processed transcript timestamp). */
function consolidateWatermarkPath(projectRoot: string): string {
  return join(projectRoot, '.dz', 'memory', 'consolidate.json');
}

/** Directory of the per-slug live `/feature-adr` learning-state slots. */
export function featureAdrStateDir(projectRoot: string): string {
  return join(projectRoot, '.dz', 'feature-adr', 'learning-state');
}

/** Make a slug safe as one bounded filename component (never `/`, `..`, or leading dot/dash). */
function featureAdrStateSlug(slug: string): string {
  const safe = slug
    .replace(/[^A-Za-z0-9._-]/g, '_')
    .replace(/^[.-]+/, '_')
    .replace(/\.{2,}/g, '_')
    .slice(0, 60);
  return safe.length > 0 ? safe : '_unnamed';
}

/**
 * Path of a live `/feature-adr` learning-state file. With a slug this is its namespaced slot;
 * without one this remains the legacy single-slot path for backward-compatible readers/callers.
 */
export function featureAdrStatePath(projectRoot: string, slug?: string): string {
  return slug === undefined
    ? join(projectRoot, '.dz', 'feature-adr', 'learning-state.json')
    : join(featureAdrStateDir(projectRoot), `${featureAdrStateSlug(slug)}.json`);
}

/**
 * Freshness window for the `/feature-adr` panel: a run older than this is considered finished, so
 * its state must NOT keep showing a stale panel in the status bar. 90 minutes (in ms).
 *
 * fa-phase-statusline (ADR-001 D4): extended 30→90 min as an EXPLICIT behaviour change so the phase
 * line can fade in stages — the renderer shows `⚠ <N>м без отчёта` from 30 min of slot silence and
 * nothing at all from 90. One window for the reader; the staging lives in
 * {@link renderFeatureAdrPhaseLine}.
 */
const FEATURE_ADR_FRESH_MS = 90 * 60 * 1_000;

/** Slot silence (ms) after which the phase line renders `⚠ <N>м без отчёта` instead of progress. */
const FEATURE_ADR_WARN_MS = 30 * 60 * 1_000;

/** Valid complexity tiers for the phase line — anything else renders as `[?]` with `?/?`. */
const FEATURE_ADR_TIERS = new Set(['S', 'M', 'L', 'XL']);

/**
 * Active-step lists per tier (mirrors the Step-0 router bands in the /feature-adr SKILL):
 * done/total on the phase line is the label's step-number POSITION in its tier's list. A label
 * whose number is not in the list renders `?/?` — the panel never guesses progress.
 */
const FEATURE_ADR_ACTIVE_STEPS: Record<string, readonly number[]> = {
  S: [0, 1, 6, 7, 8],
  M: [0, 1, 3, 3.5, 5, 6, 7, 8],
  L: [0, 1, 2, 3, 3.5, 4, 5, 6, 7, 8, 9],
  XL: [0, 1, 2, 3, 3.5, 4, 5, 6, 7, 8, 9],
};

/**
 * Count the legacy/default `.dz/patterns.jsonl` store by reading the FILE directly — READONLY, no
 * backend open, no FTS rebuild, no schema write. Used only when the SQLite readonly COUNT is
 * unavailable (no SQLite tier, or a transient lock). Best-effort → 0 on any error.
 */
function countJsonlPatternsReadonly(projectRoot: string): number {
  const path = join(projectRoot, '.dz', 'patterns.jsonl');
  if (!existsSync(path)) return 0;
  try {
    return readFileSync(path, 'utf-8').split('\n').filter((l) => l.trim() !== '').length;
  } catch {
    return 0;
  }
}

/**
 * Learned-pattern count for the panel: the fast **readonly** SQLite `COUNT(*)`, else a **readonly**
 * jsonl line-count, else `0`. NEVER opens the store read-write (the render path must not run the
 * mutating FTS rebuild `loadStorePatternsSync` does). This counts the durable SQLite tier and so
 * tracks `dz recall --all` in steady state (jsonl folds into SQLite on consolidate); it is a fast
 * approximation, not a deduped union, by design — a status bar must stay readonly + sub-50ms.
 */
function countLearnedPatterns(projectRoot: string): number {
  const sqlitePath = sqlitePatternPath(projectRoot);
  if (existsSync(sqlitePath)) {
    const fast = countSqliteRowsReadonly(sqlitePath, 'memory_records');
    if (fast !== undefined) return fast;
  }
  return countJsonlPatternsReadonly(projectRoot);
}

function countUsedPatternsReadonly(projectRoot: string): number | undefined {
  const path = join(projectRoot, RECALL_USAGE_LOG_RELATIVE);
  if (!existsSync(path)) return undefined;
  try {
    const parsed = parseRecallUsageLog(readFileSync(path, 'utf-8'));
    if (parsed.records.length === 0) return undefined;
    return aggregateRecallUsage(parsed.records).length;
  } catch {
    return undefined;
  }
}

/** Hours since the last consolidation, or `undefined` when never consolidated / unreadable. */
function consolidatedAgeHours(projectRoot: string, now: number): number | undefined {
  const path = consolidateWatermarkPath(projectRoot);
  if (!existsSync(path)) return undefined;
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf-8')) as { lastConsolidatedTs?: unknown };
    const ts = typeof parsed.lastConsolidatedTs === 'string' ? Date.parse(parsed.lastConsolidatedTs) : Number.NaN;
    if (Number.isNaN(ts)) return undefined;
    return Math.max(0, Math.round((now - ts) / 3_600_000));
  } catch {
    return undefined;
  }
}

/**
 * Read the live `/feature-adr` learning state for one project — the source of the per-run panel.
 *
 * RENDER-PATH DISCIPLINE (statusline pattern #1): this runs inside the ~300ms status-bar refresh, so
 * it is a plain **readonly** file read, **best-effort**, and NEVER throws — an absent, unreadable, or
 * corrupt state file collapses to `undefined`, not an exception.
 *
 * FRESHNESS: a run whose `ts` is older than {@link FEATURE_ADR_FRESH_MS} is treated as finished and
 * returns `undefined`, so a stale run can never keep a panel pinned in the status bar.
 *
 * @param projectRoot Absolute (or cwd-relative) project directory.
 * @param now Injectable clock (epoch ms) for the freshness check — defaults to `Date.now()`.
 */
export function readFeatureAdrState(projectRoot: string, now: number = Date.now()): FeatureAdrState | undefined {
  const root = resolve(projectRoot);
  const candidates: string[] = [];

  // Keep the legacy single slot in the candidate set: an older dz may still be writing it while a
  // newer statusline renders. Directory discovery is guarded separately because this is the hot,
  // readonly ~300ms render path; it never performs housekeeping or any other write.
  try {
    const legacyPath = featureAdrStatePath(root);
    if (existsSync(legacyPath)) candidates.push(legacyPath);
  } catch { /* best-effort candidate discovery */ }
  try {
    const remaining = 64 - candidates.length;
    if (remaining > 0) {
      const dir = featureAdrStateDir(root);
      const names = readdirSync(dir)
        .filter((name) => name.endsWith('.json'))
        .map((name) => {
          let mtimeMs = -Infinity;
          try {
            mtimeMs = statSync(join(dir, name)).mtimeMs;
          } catch { /* a disappearing/unreadable entry sorts last */ }
          return { name, mtimeMs };
        })
        // Truncation may only drop the least recent slots: kind-rank arbitration cannot rescue a non-candidate.
        .sort((a, b) => b.mtimeMs - a.mtimeMs)
        .slice(0, remaining);
      for (const { name } of names) candidates.push(join(dir, name));
    }
  } catch { /* absent/unreadable per-slug directory is normal */ }

  const parseCandidate = (path: string): { state: FeatureAdrState; tsMs: number; rank: number } | undefined => {
    try {
      const parsed = JSON.parse(readFileSync(path, 'utf-8')) as Partial<FeatureAdrState>;
      if (typeof parsed.slug !== 'string' || parsed.slug.length === 0) return undefined;
      if (typeof parsed.step !== 'string' || parsed.step.length === 0) return undefined;
      if (parsed.step.trim() === 'done') return undefined; // terminal slots never enter arbitration
      if (typeof parsed.ts !== 'string') return undefined;
      const tsMs = Date.parse(parsed.ts);
      if (Number.isNaN(tsMs)) return undefined;
      if (now - tsMs > FEATURE_ADR_FRESH_MS) return undefined; // stale run — do not surface a panel
      const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
      // The panel exists to surface the /feature-adr Pattern-memory loop. A generated loop writes
      // zero recalled/stored counters far more often, so freshest-wins would recreate F5 by making
      // a live pipeline's meaningful counters disappear. Missing/invalid legacy markers therefore
      // retain the historical `feature-adr` rank, which outranks every loop slot regardless of ts.
      const kind: 'feature-adr' | 'loop' = parsed.kind === 'loop' ? 'loop' : 'feature-adr';
      const state: FeatureAdrState = {
        kind,
        slug: parsed.slug,
        step: parsed.step,
        pool: num(parsed.pool),
        recalled: num(parsed.recalled),
        stored: num(parsed.stored),
        ...(num(parsed.reinforced) > 0 ? { reinforced: num(parsed.reinforced) } : {}),
        ts: parsed.ts,
        ...(typeof parsed.runId === 'string' && parsed.runId.trim() !== '' ? { runId: parsed.runId } : {}),
        ...(typeof parsed.mode === 'string' && parsed.mode.length > 0 ? { mode: parsed.mode } : {}),
        ...(typeof parsed.tier === 'string' && FEATURE_ADR_TIERS.has(parsed.tier) ? { tier: parsed.tier } : {}),
        ...(typeof parsed.phaseStartTs === 'string' && !Number.isNaN(Date.parse(parsed.phaseStartTs))
          ? { phaseStartTs: parsed.phaseStartTs } : {}),
      };
      return { state, tsMs, rank: kind === 'feature-adr' ? 1 : 0 };
    } catch {
      return undefined;
    }
  };

  let winner: ReturnType<typeof parseCandidate>;
  for (const path of candidates) {
    const candidate = parseCandidate(path);
    if (candidate === undefined) continue;
    if (winner === undefined
      || candidate.rank > winner.rank
      || (candidate.rank === winner.rank && candidate.tsMs > winner.tsMs)) {
      winner = candidate;
    }
  }
  return winner?.state;
}

/** Fields the `/feature-adr` pipeline supplies when recording its live learning state. */
export interface WriteFeatureAdrStateInput {
  readonly kind?: 'feature-adr' | 'loop';
  readonly slug: string;
  readonly step: string;
  readonly recalled: number;
  readonly stored: number;
  readonly reinforced?: number;
  readonly mode?: string;
  /** Identity of one pipeline invocation. Empty strings are not identities. */
  readonly runId?: string;
  /** Complexity tier (S/M/L/XL). Invalid/absent → the previous slot's tier is carried forward. */
  readonly tier?: string;
  /**
   * TEST-ONLY seam (ADR-002 C2 RED half): run the slot transaction WITHOUT the
   * `fa-phase-slot` named lock, so `statusline-phase-lock.test.ts` can reproduce the lost update
   * the lock prevents. Never set by any shipped caller — `statusline-phase-lock.test.ts` asserts
   * `grep -c _unsafeSkipLock` on the CLI source is 0, so this cannot be reached from `dz`.
   */
  readonly _unsafeSkipLock?: boolean;
  /**
   * TEST-ONLY seam, the twin of `_unsafeSkipLock`: busy-hold this many ms INSIDE the transition,
   * between reading the previous slot and writing the new one. Without it the read-modify-write
   * window is sub-millisecond and the RED half would be reproducing a race by LUCK — a flaky test
   * is not a proof. With it the interleaving is deterministic in both halves: unlocked, two writers
   * provably observe the same previous slot; locked, they provably do not. Never set by any shipped
   * caller (same grep assertion as `_unsafeSkipLock`).
   */
  readonly _unsafeHoldMs?: number;
  /**
   * TEST-ONLY seam: fail after phase telemetry has been appended but before the slot is written.
   * This makes the partial-write receipt deterministic without fabricating a phase row from a
   * missing previous slot. Never set by a shipped caller.
   */
  readonly _unsafeFailSlotWrite?: boolean;
}

/**
 * The outcome of a slot write. `state` is the slot as written; `refused` is a SHORT machine-ish
 * reason when the operation did not complete. `refusedEffect` says whether no disk effect is known
 * (`none`, callback never began) or a partial effect is possible (`unknown`, callback began).
 * Exactly one of `state` and `refused` is present. The CLI prints `refused` on stderr.
 */
export interface WriteFeatureAdrStateResult {
  readonly state?: FeatureAdrState;
  readonly refused?: string;
  /** Known disk effect of a refusal: `none` before the transaction, `unknown` once it began. */
  readonly refusedEffect?: 'none' | 'unknown';
}

/**
 * Read ONE slot file raw (no freshness window, no arbitration) — the write path's "previous state".
 * Best-effort: absent/corrupt → `undefined`.
 */
function readPreviousSlot(root: string, slug: string): Partial<FeatureAdrState> | undefined {
  try {
    const parsed = JSON.parse(readFileSync(featureAdrStatePath(root, slug), 'utf-8')) as Partial<FeatureAdrState>;
    if (typeof parsed.step !== 'string' || typeof parsed.ts !== 'string') return undefined;
    return parsed;
  } catch {
    return undefined;
  }
}

/**
 * fa-phase-statusline (ADR-001 D3): when a step label CHANGES, the phase that just ended leaves one
 * telemetry row in the EXISTING `.dz/feature-adr/run-cost-ledger.jsonl`:
 * `{"_schema":"feature-adr-phase/1","kind":"phase",slug,tier,mode,step,wallSec,ts}`.
 * DELIBERATE field choices, both load-bearing:
 * - `ts`, never `date` — cadence.ts skips ledger rows without a string `date`, so shipment dating
 *   is untouched by construction (pinned in cadence.test.ts);
 * - `wallSec` (wall seconds of the ended phase), never `minutes` — 1-3 minute phases keep resolution.
 * The ledger is NEVER created here: phase rows enrich the existing witness file, they are not a new
 * store. Append-only (`appendFileSync`, one line) — not a read-modify-write, so no named lock owed.
 * Best-effort: any failure is swallowed (the panel write must never break the pipeline).
 */
function appendPhaseRow(
  root: string,
  prev: Partial<FeatureAdrState>,
  resolved: { slug: string; tier?: string; mode?: string },
  now: number,
): void {
  try {
    const ledger = join(root, '.dz', 'feature-adr', 'run-cost-ledger.jsonl');
    if (!existsSync(ledger)) return; // append to the EXISTING ledger only — never create one
    const startedMs = Date.parse(prev.phaseStartTs ?? prev.ts ?? '');
    if (Number.isNaN(startedMs)) return; // an unmeasurable phase leaves no row — never a guess
    const wallSec = Math.max(0, Math.round((now - startedMs) / 1000));
    const row = {
      _schema: 'feature-adr-phase/1',
      kind: 'phase',
      slug: resolved.slug,
      tier: resolved.tier ?? null,
      mode: prev.mode ?? resolved.mode ?? null,
      step: prev.step,
      wallSec,
      ts: new Date(now).toISOString(),
    };
    appendFileSync(ledger, `${JSON.stringify(row)}\n`);
  } catch { /* best-effort telemetry — never blocks the slot write */ }
}

/**
 * Record the live `/feature-adr` learning state — called by the pipeline at Steps 0/8/9. Computes
 * `pool` as the total learned-pattern count (via the same readonly {@link countLearnedPatterns} the
 * panel uses) and writes the JSON with a fresh `ts`. Best-effort: returns the written state, or
 * `undefined` on any I/O error (this must never break the pipeline).
 *
 * @param now Injectable clock (epoch ms) for the write timestamp — defaults to `Date.now()`.
 */
export function writeFeatureAdrState(
  projectRoot: string,
  input: WriteFeatureAdrStateInput,
  now: number = Date.now(),
): FeatureAdrState | undefined {
  return writeFeatureAdrStateDetailed(projectRoot, input, now).state;
}

/**
 * The same write as {@link writeFeatureAdrState}, but it SAYS WHY it did not complete and what is
 * known about its disk effect. A refusal before the transition returns `refusedEffect:'none'`; once
 * the callback begins, a refusal returns `refusedEffect:'unknown'` because an append or slot write
 * may already have landed. The pipeline still never breaks — the caller decides, this never throws.
 */
export function writeFeatureAdrStateDetailed(
  projectRoot: string,
  input: WriteFeatureAdrStateInput,
  now: number = Date.now(),
): WriteFeatureAdrStateResult {
  const root = resolve(projectRoot);
  let transactionStarted = false;
  let pool = 0;
  try {
    pool = countLearnedPatterns(root);
  } catch {
    pool = 0;
  }

  try {
    const dir = featureAdrStateDir(root);
    mkdirSync(dir, { recursive: true });

    // Housekeeping belongs only on this write path, never the ~300ms render path. Every file is
    // independently guarded so an unreadable/racing entry cannot prevent the live state write.
    // Kept OUTSIDE the lock below: it is per-file guarded and takes no part in the transition race.
    try {
      const cutoff = Date.now() - 24 * 60 * 60 * 1_000;
      for (const name of readdirSync(dir)) {
        if (!name.endsWith('.json')) continue;
        const stalePath = join(dir, name);
        try {
          if (statSync(stalePath).mtimeMs < cutoff) unlinkSync(stalePath);
        } catch { /* best-effort per-file cleanup */ }
      }
    } catch { /* best-effort directory cleanup */ }

    // fa-phase-statusline QE fix (P2, cross-family review of 656d6903): read/compare/append/write
    // is a read-modify-write over a shared slot — two concurrent design-sibling ckpt agents both
    // read the same previous slot, both see a label change, and both append a phase row, breaking
    // the one-row-per-transition promise. So the whole transaction runs under the repo's named
    // per-store lock (cross-runtime-concurrency rule) — a short, fully synchronous critical
    // section, no subprocess, no model turn. A lock timeout throws → the outer catch refuses the
    // write (returns undefined): no new claim rather than a raced one.
    const transition = (): FeatureAdrState => {
      transactionStarted = true;
      // ADR-001 D3/D5: the previous slot is the phase clock. Same step label → the phase start
      // carries forward; a CHANGED label ends the previous phase (one telemetry row) and starts a
      // new one now. Tier is stored state, carried forward when a record omits it.
      const prev = readPreviousSlot(root, input.slug);
      const tier = typeof input.tier === 'string' && FEATURE_ADR_TIERS.has(input.tier)
        ? input.tier
        : (typeof prev?.tier === 'string' && FEATURE_ADR_TIERS.has(prev.tier) ? prev.tier : undefined);
      const nowIso = new Date(now).toISOString();
      const prevRunId = typeof prev?.runId === 'string' && prev.runId.trim() !== '' ? prev.runId.trim() : undefined;
      const runId = typeof input.runId === 'string' && input.runId.trim() !== '' ? input.runId.trim() : undefined;
      const sameRun = prevRunId !== undefined && runId !== undefined && prevRunId === runId;
      const legacyRunScope = prevRunId === undefined && runId === undefined;
      const sameRunScope = sameRun || legacyRunScope;

      // MONOTONIC STEP GUARD (P1, cross-family review of 656d6903): the pipeline's pre-existing
      // fallback recorder fires AFTER the router checkpoint, so "Step 0 recall" used to overwrite
      // "Step 1 Design" and the panel deterministically regressed to Step 0 for the whole design
      // fan (with the design time mis-attributed to Step 0 in telemetry). A plain step label whose
      // number goes BACKWARDS within the SAME identified invocation is a stale duplicate of an
      // earlier step: its counters/tier/mode/ts are absorbed, but the step and phase clock stand,
      // and no phase row is written. Two absent identities retain the legacy fresh-slot behavior.
      // Distinct identities, a one-sided identity, an explicit gate/waiting label (⛔/⏸), or an
      // unparseable label never authorizes the guard to cross an unproven run boundary.
      let step = input.step;
      const isGateLabel = input.step.trimStart().startsWith('⛔') || input.step.trimStart().startsWith('⏸');
      if (prev !== undefined && input.kind !== 'loop' && prev.kind !== 'loop' && !isGateLabel) {
        const prevTsMs = Date.parse(prev.ts ?? '');
        const prevFresh = !Number.isNaN(prevTsMs) && now - prevTsMs <= FEATURE_ADR_FRESH_MS;
        const prevNum = parseStepNumber(prev.step ?? '');
        const newNum = parseStepNumber(input.step);
        const guardThisRun = sameRun || (legacyRunScope && prevFresh);
        if (guardThisRun && prevNum !== undefined && newNum !== undefined && newNum < prevNum) {
          step = prev.step as string; // stale duplicate — the run is further along than this record
        }
      }

      // TEST-ONLY hold (see WriteFeatureAdrStateInput._unsafeHoldMs): widens the read→write window
      // so the lost update is deterministic instead of lucky. Zero cost when unset.
      if (typeof input._unsafeHoldMs === 'number' && input._unsafeHoldMs > 0) {
        const until = Date.now() + input._unsafeHoldMs;
        while (Date.now() < until) { /* deliberate busy hold — test seam only */ }
      }

      const samePhase = prev !== undefined && sameRunScope && prev.step === step;
      const phaseStartTs = samePhase ? (prev.phaseStartTs ?? prev.ts ?? nowIso) : nowIso;
      // Phase telemetry is a /feature-adr concept — loop slots never leave phase rows in the ledger.
      if (prev !== undefined && sameRunScope && !samePhase && input.kind !== 'loop' && prev.kind !== 'loop') {
        appendPhaseRow(root, prev, { slug: input.slug, ...(tier !== undefined ? { tier } : {}), ...(input.mode !== undefined && input.mode.length > 0 ? { mode: input.mode } : {}) }, now);
      }

      const state: FeatureAdrState = {
        kind: input.kind === 'loop' ? 'loop' : 'feature-adr',
        slug: input.slug,
        step,
        pool,
        recalled: Number.isFinite(input.recalled) ? input.recalled : 0,
        stored: Number.isFinite(input.stored) ? input.stored : 0,
        ...(input.reinforced !== undefined && Number.isFinite(input.reinforced) ? { reinforced: input.reinforced } : {}),
        ts: nowIso,
        ...(runId !== undefined ? { runId } : {}),
        ...(input.mode !== undefined && input.mode.length > 0 ? { mode: input.mode } : {}),
        ...(tier !== undefined ? { tier } : {}),
        phaseStartTs,
      };
      if (input._unsafeFailSlotWrite === true) {
        throw new Error('test-only slot write failure after phase append');
      }
      writeFileSync(featureAdrStatePath(root, input.slug), `${JSON.stringify(state, null, 2)}\n`);
      return state;
    };

    // The seam is TEST-ONLY (see WriteFeatureAdrStateInput._unsafeSkipLock): it exists so the RED
    // half of the lock test can reproduce the lost update. Shipped callers never pass it.
    const written = input._unsafeSkipLock === true
      ? transition()
      : withProjectLockSync(root, 'fa-phase-slot', transition);
    return { state: written };
  } catch (err) {
    // A refusal is REPORTED, never mistaken for success. A lock timeout before the callback proves
    // effect `none`; once the callback began, append/write progress is unknowable after an error.
    const reason = err instanceof Error && err.message.trim() !== '' ? err.message : String(err);
    return { refused: reason, refusedEffect: transactionStarted ? 'unknown' : 'none' };
  }
}

/** First `Step <n>` number in a label, or `undefined` — shared by the guard and the renderer. */
function parseStepNumber(label: string): number | undefined {
  const m = /Step\s+(\d+(?:\.\d+)?)/.exec(label);
  return m !== null ? Number(m[1]) : undefined;
}

/**
 * Gather dz's self-learning counts for one project. FAST + best-effort: every read
 * is guarded so a missing/corrupt `.dz`, absent native module, or locked store
 * yields `0` / an omitted field — this function NEVER throws.
 *
 * @param projectRoot Absolute (or cwd-relative) project directory.
 * @param now Injectable clock (epoch ms) for the consolidation age — defaults to `Date.now()`.
 */
export function statuslineData(projectRoot: string, now: number = Date.now()): StatuslineData {
  const root = resolve(projectRoot);

  let patterns = 0;
  let storeRows: ReturnType<typeof countLearningStoreRowsReadonly> | undefined;
  try {
    storeRows = countLearningStoreRowsReadonly(root);
    patterns = typeof storeRows.lexicalRows === 'number'
      ? storeRows.lexicalRows
      : countJsonlPatternsReadonly(root);
  } catch {
    patterns = 0;
  }

  let storeHealth: StatuslineStoreHealth | undefined;
  try {
    if (storeRows === undefined) throw new Error('store row counts unavailable');
    const rows = storeRows;
    const mark = readStoreMark(root);
    const health = checkStoreHealth({
      projectRoot: root,
      lexicalRows: rows.lexicalRows,
      lexicalSource: rows.lexicalSource,
      vectorRows: rows.vectorRows,
      mark,
    });
    if (health.verdict === 'collapsed') {
      const vectorAffected = health.reason.startsWith('vector ');
      const previousMax = vectorAffected ? mark?.vectorMax : mark?.lexicalMax;
      storeHealth = {
        verdict: health.verdict,
        ...(previousMax === undefined ? {} : { previousMax }),
      };
    } else if (health.verdict === 'cold-start-over-existing') {
      const previousMax = mark === undefined
        ? undefined
        : rows.lexicalRows === 0 && mark.lexicalMax > 0 ? mark.lexicalMax : mark.vectorMax;
      storeHealth = {
        verdict: health.verdict,
        ...(previousMax === undefined ? {} : { previousMax }),
        snapshotPath: storeSnapshotPath(root),
      };
    } else if (health.verdict === 'unreadable') {
      storeHealth = {
        verdict: health.verdict,
        unreadableFiles: [
          ...(rows.lexicalRows === 'unreadable' ? [basename(rows.lexicalSourcePath)] : []),
          ...(rows.vectorRows === 'unreadable' && rows.vectorSourcePath !== undefined
            ? [basename(rows.vectorSourcePath)] : []),
        ],
      };
    } else if (health.verdict === 'busy') {
      storeHealth = { verdict: health.verdict, reason: health.reason };
    } else if (health.verdict === 'source-changed') {
      storeHealth = { verdict: health.verdict };
    }
  } catch {
    storeHealth = undefined;
  }

  // Сравнивать можно только сравнимое: слева уроки лексического слоя, справа уроки зеркала.
  // Полный объём зеркала (`vectorRows`) для этого не годится — в него входят идеи бэклога и
  // книжные единицы, и показатель на нём горел бы всегда. Неизвестное число уроков — это
  // ТРЕТЬЕ состояние «не читается», а не молчание: молчание означает «величины сошлись».
  // ОТСУТСТВИЕ зеркала и НЕЧИТАЕМОСТЬ зеркала — разные положения (решение владельца 2026-09-09).
  // Зеркала нет вовсе: сравнивать не с чем, показатель молчит — иначе у любого проекта, который
  // зеркалом не пользуется, он горел бы всегда, а вечно горящий показатель не несёт сведений.
  // Зеркало ЕСТЬ, но прочитать или разложить его не удалось: это отказ инструмента, и он горит.
  const mirrorLessons = storeRows?.vectorLessonRows;
  const mirrorRows = storeRows?.vectorRows;
  const mirrorAbsent = storeRows !== undefined && storeRows.vectorSourcePath === undefined;
  const lexicalMirrorable = storeRows?.lexicalMirrorableRows;
  const excluded = {
    class: storeRows?.lexicalExcludedClassRows ?? 0,
    noise: storeRows?.lexicalExcludedNoiseRows ?? 0,
  };
  const mirrorAvailable = storeRows?.vectorSourcePath !== undefined
    && typeof mirrorRows === 'number'
    && mirrorLessons !== undefined;
  const patternMirror: StatuslineData['patternMirror'] = mirrorAbsent
    ? undefined
    : storeRows === undefined || storeRows.vectorRows === 'unreadable' || storeRows.vectorRows === 'busy'
      || mirrorLessons === undefined || lexicalMirrorable === undefined
      ? { state: 'unavailable' }
      : {
        state: mirrorLessons !== lexicalMirrorable ? 'different' : 'in-sync',
        lexicalMirrorable,
        vector: mirrorLessons,
        excluded,
      };
  const mirror: StatuslineData['mirror'] = {
    available: mirrorAvailable,
    rows: typeof mirrorRows === 'number' ? mirrorRows : 0,
    lessons: mirrorAvailable ? mirrorLessons : 0,
    pending: mirrorAbsent && lexicalMirrorable !== undefined
      ? lexicalMirrorable
      : mirrorAvailable && lexicalMirrorable !== undefined
        ? Math.max(0, lexicalMirrorable - mirrorLessons)
        : 0,
    source: 'agentdb',
  };

  let patternBreakdown: StatuslineData['patternBreakdown'];
  try {
    if (storeRows !== undefined
      && typeof storeRows.lexicalRows === 'number'
      && typeof storeRows.lexicalQuarantinedRows === 'number') {
      const quarantined = storeRows.lexicalQuarantinedRows;
      const tierDelta = mirrorAvailable
        && typeof storeRows.lexicalMirrorableQuarantinedRows === 'number'
        && typeof storeRows.vectorQuarantinedRows === 'number'
        ? Math.abs(storeRows.lexicalMirrorableQuarantinedRows - storeRows.vectorQuarantinedRows)
        : undefined;
      patternBreakdown = {
        source: mirrorAvailable ? 'lexical+mirror' : 'lexical',
        active: storeRows.lexicalRows - quarantined,
        quarantined,
        attention: quarantined > 0 && quarantined * 3 >= storeRows.lexicalRows,
        ...(storeRows.quarantineTierParity === undefined ? {} : {
          tierParity: {
            lexicalOnly: storeRows.quarantineTierParity.lexicalOnly,
            mirrorOnly: storeRows.quarantineTierParity.mirrorOnly,
          },
        }),
        ...(tierDelta !== undefined && tierDelta > QUARANTINE_TIER_DRIFT_TOLERANCE ? { tierDelta } : {}),
      };
    }
  } catch {
    patternBreakdown = undefined;
  }

  let brainSources = 0;
  let brainKuCounts: readonly number[] = [];
  try {
    const sources = listBrain();
    brainSources = sources.length;
    brainKuCounts = sources.map((s) => (typeof s.kuCount === 'number' ? s.kuCount : 0));
  } catch {
    brainSources = 0;
    brainKuCounts = [];
  }

  let usedPatterns: number | undefined;
  try {
    usedPatterns = countUsedPatternsReadonly(root);
  } catch {
    usedPatterns = undefined;
  }

  const ageH = consolidatedAgeHours(root, now);

  // Live /feature-adr panel — attached ONLY when a fresh run is in flight (readonly, never throws).
  let featureAdr: FeatureAdrState | undefined;
  try {
    featureAdr = readFeatureAdrState(root, now);
  } catch {
    featureAdr = undefined;
  }

  return {
    patterns,
    mirror,
    ...(patternMirror !== undefined ? { patternMirror } : {}),
    ...(patternBreakdown !== undefined ? { patternBreakdown } : {}),
    ...(usedPatterns !== undefined ? { usedPatterns } : {}),
    brainSources,
    brainKuCounts,
    ...(ageH !== undefined ? { consolidatedAgeH: ageH } : {}),
    ...(featureAdr !== undefined ? { featureAdr } : {}),
    ...(storeHealth !== undefined ? { storeHealth } : {}),
  };
}

/**
 * Render the /feature-adr PHASE line (line format B, fa-phase-statusline ADR-001) — the second
 * status-bar line:
 *
 *   `📐 <slug> [<tier>] <done>/<total> ▶ <step label> · <N>м/—`
 *
 * States, in precedence order:
 * - `undefined` (no line): a loop slot, the terminal label `done`, or ≥90 min of slot silence;
 * - `⚠ <N>м без отчёта` from 30 min of slot silence (counted from the last report `ts`);
 * - a label starting `⛔` or `⏸` replaces the `▶ <label>` portion VERBATIM (failure/waiting states
 *   are reported by the pipeline through the label itself, never synthesised here);
 * - otherwise `▶ <label>` with elapsed minutes counted from the PHASE start (`phaseStartTs`).
 *
 * done/total is the label's step-number position in its tier's active-step list; an unknown tier,
 * an unparseable label, or a number outside the list renders `?/?` — the panel never guesses.
 * The estimate slot is fixed-width at the tail: v1 defers estimates entirely, so it is always `/—`
 * (a future median would be computed on the WRITE path and stored in the slot as a ready number —
 * this render path stays a pure function over the slot, no DB, no subprocess, no features/* sweep).
 *
 * @param state A fresh slot from {@link readFeatureAdrState} (the ONLY source of "in progress").
 * @param now Injectable clock (epoch ms) — defaults to `Date.now()`.
 */
export function renderFeatureAdrPhaseLine(state: FeatureAdrState, now: number = Date.now()): string | undefined {
  if (state.kind === 'loop') return undefined;
  const label = state.step.trim();
  if (label === 'done') return undefined; // a finished run leaves the bar immediately

  const tsMs = Date.parse(state.ts);
  if (Number.isNaN(tsMs)) return undefined;
  const silenceMs = now - tsMs;
  const silenceMin = Math.floor(silenceMs / 60_000);
  if (silenceMs >= FEATURE_ADR_FRESH_MS) return undefined; // fully faded (90 min)

  const tier = state.tier !== undefined && FEATURE_ADR_TIERS.has(state.tier) ? state.tier : undefined;
  const steps = tier !== undefined ? FEATURE_ADR_ACTIVE_STEPS[tier] : undefined;
  const stepNum = parseStepNumber(label);
  const idx = steps !== undefined && stepNum !== undefined ? steps.indexOf(stepNum) : -1;
  const ratio = idx >= 0 && steps !== undefined ? `${idx}/${steps.length}` : '?/?';
  const head = `📐 ${state.slug} [${tier ?? '?'}] ${ratio}`;

  if (silenceMs >= FEATURE_ADR_WARN_MS) return `${head} ⚠ ${silenceMin}м без отчёта`;

  const phaseStartMs = Date.parse(state.phaseStartTs ?? state.ts);
  const elapsedMin = Number.isNaN(phaseStartMs) ? 0 : Math.max(0, Math.floor((now - phaseStartMs) / 60_000));
  // ⛔ (a gate failure) and ⏸ (a waiting state) labels carry their own marker — verbatim, no ▶.
  const stepPart = label.startsWith('⛔') || label.startsWith('⏸') ? label : `▶ ${label}`;
  return `${head} ${stepPart} · ${elapsedMin}м/—`;
}

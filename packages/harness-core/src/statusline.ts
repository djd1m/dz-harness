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

import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { createRequire } from 'node:module';

import { listBrain } from './brain.js';
import { RECALL_USAGE_LOG_RELATIVE, aggregateRecallUsage, parseRecallUsageLog } from './recall-usage.js';

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
  /** Optional run mode (e.g. "reference", "full-qe", "full-qe-extended"). */
  readonly mode?: string;
}

/** A snapshot of dz's self-learning state for one project (all fields best-effort). */
export interface StatuslineData {
  /** Count of learned patterns in the project's unified memory store. */
  readonly patterns: number;
  /** Count of learned patterns that the live recall hook has actually injected at least once. */
  readonly usedPatterns?: number;
  /** Number of sources registered in the durable cross-project knowledge brain. */
  readonly brainSources: number;
  /** Hours since the last `dz consolidate` run, if a watermark is present. */
  readonly consolidatedAgeH?: number;
  /** Live `/feature-adr` learning state — present ONLY when a fresh run is in flight. */
  readonly featureAdr?: FeatureAdrState;
}

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
 * its state must NOT keep showing a stale panel in the status bar. 30 minutes (in ms).
 */
const FEATURE_ADR_FRESH_MS = 30 * 60 * 1_000;

interface ReadonlyCountDb {
  pragma: (s: string) => void;
  prepare: (q: string) => { get: (...a: unknown[]) => unknown };
  close: () => void;
}

/**
 * Count learned patterns via a direct **readonly** `COUNT(*)` with a short
 * `busy_timeout` — no FTS rebuild, no schema write, no waiting on a live writer.
 * Returns `undefined` (not `0`) when the fast path is unavailable so the caller
 * can fall back to a readonly jsonl line-count; any error → `undefined`.
 */
function countSqlitePatternsReadonly(sqlitePath: string): number | undefined {
  try {
    const require = createRequire(import.meta.url);
    const Database = require('better-sqlite3') as new (p: string, o?: object) => ReadonlyCountDb;
    const db = new Database(sqlitePath, { readonly: true });
    try {
      db.pragma('busy_timeout = 100'); // back off fast — never block the 300ms refresh on a write lock
      const row = db.prepare('SELECT COUNT(*) as cnt FROM memory_records').get() as { cnt?: unknown };
      return typeof row?.cnt === 'number' ? row.cnt : undefined;
    } finally {
      db.close();
    }
  } catch {
    return undefined;
  }
}

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
    const fast = countSqlitePatternsReadonly(sqlitePath);
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
        ...(typeof parsed.mode === 'string' && parsed.mode.length > 0 ? { mode: parsed.mode } : {}),
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
  const root = resolve(projectRoot);
  let pool = 0;
  try {
    pool = countLearnedPatterns(root);
  } catch {
    pool = 0;
  }
  const state: FeatureAdrState = {
    kind: input.kind === 'loop' ? 'loop' : 'feature-adr',
    slug: input.slug,
    step: input.step,
    pool,
    recalled: Number.isFinite(input.recalled) ? input.recalled : 0,
    stored: Number.isFinite(input.stored) ? input.stored : 0,
    ...(input.reinforced !== undefined && Number.isFinite(input.reinforced) ? { reinforced: input.reinforced } : {}),
    ts: new Date(now).toISOString(),
    ...(input.mode !== undefined && input.mode.length > 0 ? { mode: input.mode } : {}),
  };
  try {
    const dir = featureAdrStateDir(root);
    mkdirSync(dir, { recursive: true });

    // Housekeeping belongs only on this write path, never the ~300ms render path. Every file is
    // independently guarded so an unreadable/racing entry cannot prevent the live state write.
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

    const path = featureAdrStatePath(root, input.slug);
    writeFileSync(path, `${JSON.stringify(state, null, 2)}\n`);
  } catch {
    return undefined;
  }
  return state;
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
  try {
    patterns = countLearnedPatterns(root);
  } catch {
    patterns = 0;
  }

  let brainSources = 0;
  try {
    brainSources = listBrain().length;
  } catch {
    brainSources = 0;
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
    ...(usedPatterns !== undefined ? { usedPatterns } : {}),
    brainSources,
    ...(ageH !== undefined ? { consolidatedAgeH: ageH } : {}),
    ...(featureAdr !== undefined ? { featureAdr } : {}),
  };
}

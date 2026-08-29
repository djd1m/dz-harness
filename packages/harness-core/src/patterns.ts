/**
 * Learn-loop read path — the synchronous reader that closes the write-only
 * "learn" loop (audit finding #2).
 *
 * `dz teach` writes {@link PatternRecord} lines to `.dz/patterns.jsonl` and the
 * session hooks write {@link SessionRecord} lines to `.dz/sessions.jsonl`, but
 * nothing read them back. This module is that read half: it loads the records
 * (graceful + retention-trimmed) and turns matching patterns into a bounded,
 * monotonic ranking boost for `recommend()`.
 *
 * Design constraints (see features/wire-learn-loop/):
 * - **Synchronous** — keeps `recommend()` sync (no Promise/async ripple).
 * - **No `@dzhechkov/memory` import** — Tier 1 is dependency-free by design.
 * - **Graceful** — absent/empty/corrupt store yields `[]` / zero boost, never throws.
 * - **Shared schema** — {@link PatternRecord}/{@link SessionRecord} are the single
 *   source of truth, imported by the writers (`cmdTeach`, session hooks) so a
 *   field rename is a compile error, not a silently re-muted loop.
 *
 * @packageDocumentation
 */

import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { homedir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';

import { JsonFileBackend, SqliteBackend, harvestDreamPatterns, isNoiseInsight, type MemoryRecord, type DreamPattern } from '@dzhechkov/memory';
import { resolveAgentdbPath } from './agentdb-index.js';
import type { VectorEntry } from './vector-tier.js';
import { rankLessonsByDelta, type LessonHistory } from './safla-delta.js';
import { withStoreLock, withStoreLockSync, StoreLockTimeoutError, StoreLockCompromisedError } from './store-lock.js';
import { describeNativeDep, exerciseSqliteOpen, probeNativeDep } from './native-dep-probe.js';

/** A learned pattern as written by `dz teach` to `.dz/patterns.jsonl`. */
export interface PatternRecord {
  /** The pattern / rule text. */
  readonly pattern: string;
  /** Classification: actionable rule, a success pattern, or a lesson learned. */
  readonly type: 'rule' | 'success-pattern' | 'lesson-learned';
  /** Reward signal in [0, 1]. */
  readonly reward: number;
  /** Domain tag (e.g. "performance", "api", "general"). */
  readonly domain: string;
  /** ISO-8601 timestamp the record was written. */
  readonly ts: string;
  /** Origin of the record (e.g. "dz-teach"). */
  readonly source: string;
}

/** A session lifecycle event as written by the session hooks to `.dz/sessions.jsonl`. */
export interface SessionRecord {
  /** Session lifecycle event. */
  readonly event: 'start' | 'end';
  /** ISO-8601 timestamp. */
  readonly ts: string;
  /** Set when the record was written via the agentdb-backend hook's JSONL fallback. */
  readonly backend?: 'agentdb';
}

/** Maximum total boost a learned-pattern set can add to one skill's score. */
export const BOOST_CAP = 50;

/** Points awarded per matching pattern, scaled by its reward (≈ one keyword topic). */
const PER_MATCH_WEIGHT = 10;

/** Default retention window when `.dz/config.json` does not specify one. */
const DEFAULT_RETENTION_DAYS = 90;

const MS_PER_DAY = 86_400_000;

/** Store backend selection mode (Tier-3). */
export type SqliteBackendMode = 'auto' | 'json' | 'sqlite';

/** Resolved learning config from `.dz/config.json` (defaults applied). */
export interface LearningConfig {
  /** Days to keep records at read time; `0` = keep forever. */
  readonly retentionDays: number;
  /** Whether `recommend()` should apply the learned-pattern boost. Absent ⇒ true. */
  readonly recommendBoost: boolean;
  /** Store backend: `auto` = SQLite if available else JSON; `json`/`sqlite` force. Absent ⇒ `auto`. */
  readonly sqliteBackend: SqliteBackendMode;
}

export interface MemoryLearningConfig {
  readonly backend: 'native' | 'off' | 'ruvector-gnn';
  readonly onRecallHits: boolean;
  readonly usesSat: number;
  readonly halfLifeDays: number;
  readonly reinforceThreshold: number;
  /**
   * SAFLA delta re-rank (rUv-scout #2 Phase 3). When true, recall blends each lesson's payoff SLOPE
   * (from its reinforce history) into the re-rank as a bounded ± term — rising lessons nudge up, stale
   * ones nudge down. Default FALSE: absent config is byte-identical to the reinforce-only re-rank.
   */
  readonly deltaRerank: boolean;
  /**
   * Lesson quarantine (feature lesson-quarantine, ADR-001). When true, a freshly taught lesson is
   * a HYPOTHESIS, not knowledge: marked `qStatus: 'quarantined'`, excluded from the auto-inject
   * hook, damped + ⚠q-marked in interactive recall, and promoted only by an EARNED signal
   * (reinforce or an explicit `dz recall --promote`). Default FALSE: absent config is
   * byte-identical to today.
   */
  readonly quarantine: boolean;
  /** Interactive-recall rank damp for quarantined hits, (0,1]; default 0.5. */
  readonly quarantineDamp: number;
  /** Days after which an unreinforced quarantined lesson is an EXPIRY CANDIDATE (informational). */
  readonly quarantineExpireDays: number;
  /**
   * Bandit payoff re-rank (feature lesson-bandit-rerank, ADR-001). When true, recall adds a BOUNDED
   * term derived from each lesson's measured payoff posterior — "has this lesson ever actually
   * helped", the axis similarity cannot answer. ADDITIVE alongside {@link deltaRerank}, never a
   * replacement, and capped at the same `REINFORCE_RRF_CAP`: similarity still decides WHICH lessons
   * are candidates; the bandit only reorders WITHIN them. Default FALSE: absent config is
   * byte-identical to today — no file read, no file written, no term applied.
   */
  readonly banditRerank: boolean;
  /**
   * Bandit EXPLORATION (feature lesson-bandit-rerank, ADR-003). When true, an arm with no evidence
   * may receive a bounded trial lift so it can accumulate some. This deliberately weakens the
   * view-does-not-promote posture, so it SHIPS DISARMED and is a separate flag: enabling payoff
   * re-ranking must never silently mean "start surfacing unproven lessons". Quarantined lessons are
   * NEVER explored in any configuration. Default FALSE; `true` with `banditRerank: false` is a
   * warned no-op.
   */
  readonly banditExploration: boolean;
}

/**
 * Read the `learning` block of `.dz/config.json`, applying defaults. Never throws —
 * a missing or corrupt config yields the defaults (retention 90d, boost on, store auto).
 */
export function readLearningConfig(projectRoot: string): LearningConfig {
  const fallback: LearningConfig = {
    retentionDays: DEFAULT_RETENTION_DAYS,
    recommendBoost: true,
    sqliteBackend: 'auto',
  };
  const configPath = join(projectRoot, '.dz', 'config.json');
  if (!existsSync(configPath)) return fallback;
  try {
    const parsed = JSON.parse(readFileSync(configPath, 'utf-8')) as {
      learning?: { retentionDays?: number; recommendBoost?: boolean; sqliteBackend?: string };
    };
    const learning = parsed.learning ?? {};
    const mode = learning.sqliteBackend;
    return {
      retentionDays:
        typeof learning.retentionDays === 'number' && learning.retentionDays >= 0
          ? learning.retentionDays
          : DEFAULT_RETENTION_DAYS,
      // absent ⇒ true, so existing projects gain read-back automatically (audit #2)
      recommendBoost: learning.recommendBoost !== false,
      sqliteBackend: mode === 'json' || mode === 'sqlite' ? mode : 'auto',
    };
  } catch {
    return fallback;
  }
}

export function readMemoryLearningConfig(projectRoot: string): MemoryLearningConfig {
  const fallback: MemoryLearningConfig = { backend: 'native', onRecallHits: true, usesSat: 64, halfLifeDays: 30, reinforceThreshold: 0.95, deltaRerank: false, quarantine: false, quarantineDamp: 0.5, quarantineExpireDays: 30, banditRerank: false, banditExploration: false };
  try {
    const parsed = JSON.parse(readFileSync(join(projectRoot, '.dz', 'config.json'), 'utf-8')) as {
      memory?: { learning?: { backend?: string; onRecallHits?: boolean; usesSat?: number; halfLifeDays?: number; reinforceThreshold?: number; deltaRerank?: boolean; quarantine?: boolean; quarantineDamp?: number; quarantineExpireDays?: number; banditRerank?: boolean; banditExploration?: boolean } };
    };
    const learning = parsed.memory?.learning ?? {};
    const backend = learning.backend === 'off' || learning.backend === 'ruvector-gnn' || learning.backend === 'native' ? learning.backend : 'native';
    return {
      backend,
      onRecallHits: learning.onRecallHits !== false,
      usesSat: typeof learning.usesSat === 'number' && learning.usesSat > 1 ? learning.usesSat : fallback.usesSat,
      halfLifeDays: typeof learning.halfLifeDays === 'number' && learning.halfLifeDays > 0 ? learning.halfLifeDays : fallback.halfLifeDays,
      reinforceThreshold:
        typeof learning.reinforceThreshold === 'number' && learning.reinforceThreshold >= 0.95 && learning.reinforceThreshold <= 1
          ? learning.reinforceThreshold
          : fallback.reinforceThreshold,
      deltaRerank: learning.deltaRerank === true, // opt-in; absent/invalid ⇒ false (byte-identical to today)
      quarantine: learning.quarantine === true, // opt-in (byte-identical to today when absent)
      // Number.isFinite clamps (the recurring Infinity lesson): non-finite/out-of-range ⇒ default.
      quarantineDamp:
        typeof learning.quarantineDamp === 'number' && Number.isFinite(learning.quarantineDamp) && learning.quarantineDamp > 0 && learning.quarantineDamp <= 1
          ? learning.quarantineDamp
          : fallback.quarantineDamp,
      quarantineExpireDays:
        typeof learning.quarantineExpireDays === 'number' && Number.isFinite(learning.quarantineExpireDays) && learning.quarantineExpireDays > 0
          ? Math.floor(learning.quarantineExpireDays)
          : fallback.quarantineExpireDays,
      // Same `=== true` discipline as deltaRerank/quarantine: absent, null, "true" (a string), 1, or
      // any legacy value ⇒ false. That is what makes "flag absent ⇒ byte-identical" true BY
      // CONSTRUCTION rather than by care (ADR-001 R1).
      banditRerank: learning.banditRerank === true,
      banditExploration: learning.banditExploration === true,
    };
  } catch {
    return fallback;
  }
}

/** Options for the loaders (clock is injectable so retention is testable). */
export interface LoadOptions {
  /** "Now" in epoch ms used for the retention window. Defaults to `Date.now()`. */
  readonly now?: number;
}

/**
 * Parse a `.jsonl` file with per-line tolerance: one malformed line is skipped,
 * never fatal. Returns `[]` for an absent file or any top-level I/O failure.
 */
function readJsonl<T>(path: string, keep: (value: unknown) => value is T): T[] {
  if (!existsSync(path)) return [];
  let content: string;
  try {
    content = readFileSync(path, 'utf-8');
  } catch {
    return [];
  }
  const out: T[] = [];
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (trimmed.length === 0) continue;
    try {
      const value: unknown = JSON.parse(trimmed);
      if (keep(value)) out.push(value);
    } catch {
      /* skip a single corrupt line, keep going */
    }
  }
  return out;
}

/** Drop records whose `ts` is older than the retention window (`0` = keep forever). */
function applyRetention<T extends { ts: string }>(records: T[], retentionDays: number, now: number): T[] {
  if (retentionDays <= 0) return records;
  const cutoff = now - retentionDays * MS_PER_DAY;
  return records.filter((r) => {
    const t = Date.parse(r.ts);
    // keep records with an unparseable ts rather than silently dropping data
    return Number.isNaN(t) ? true : t >= cutoff;
  });
}

function isPatternRecord(v: unknown): v is PatternRecord {
  if (typeof v !== 'object' || v === null) return false;
  const r = v as Record<string, unknown>;
  return (
    typeof r['pattern'] === 'string' &&
    typeof r['reward'] === 'number' &&
    r['reward'] >= 0 &&
    r['reward'] <= 1 &&
    typeof r['ts'] === 'string'
  );
}

function isSessionRecord(v: unknown): v is SessionRecord {
  if (typeof v !== 'object' || v === null) return false;
  const r = v as Record<string, unknown>;
  return (r['event'] === 'start' || r['event'] === 'end') && typeof r['ts'] === 'string';
}

/**
 * Load taught patterns from `.dz/patterns.jsonl`. Graceful (absent ⇒ `[]`),
 * per-line corruption-tolerant, drops out-of-range rewards, and applies the
 * configured retention window at read time (never mutates the file on disk).
 */
export function loadPatterns(projectRoot: string, opts: LoadOptions = {}): PatternRecord[] {
  // Tier-2: read the unified @dzhechkov/memory store, unioned with the legacy
  // .dz/patterns.jsonl tail so no taught data is lost. Dedup by (pattern,ts) so a
  // record migrated into the store never double-counts its legacy origin.
  const legacy = readJsonl(join(projectRoot, '.dz', 'patterns.jsonl'), isPatternRecord);
  const stored = loadStorePatternsSync(projectRoot);
  const byKey = new Map<string, PatternRecord>();
  for (const r of [...legacy, ...stored]) byKey.set(`${r.pattern}\u0000${r.ts}`, r);
  const { retentionDays } = readLearningConfig(projectRoot);
  return applyRetention([...byKey.values()], retentionDays, opts.now ?? Date.now());
}

/**
 * Load session lifecycle events from `.dz/sessions.jsonl`. Same I/O discipline
 * as {@link loadPatterns}; retention applied for consistency.
 */
export function loadSessions(projectRoot: string, opts: LoadOptions = {}): SessionRecord[] {
  const records = readJsonl(join(projectRoot, '.dz', 'sessions.jsonl'), isSessionRecord);
  const { retentionDays } = readLearningConfig(projectRoot);
  return applyRetention(records, retentionDays, opts.now ?? Date.now());
}

/**
 * Compute the ranking boost a set of learned patterns contributes to one skill.
 *
 * Monotonic (≥ 0 — only ever raises a skill's score) and bounded by
 * {@link BOOST_CAP}, so a large `patterns.jsonl` nudges but never dominates or
 * inverts keyword scoring. An empty pattern set yields exactly `0` — the
 * graceful invariant that keeps `recommend()` deterministic when memory is empty.
 */
export function computePatternBoost(
  skillId: string,
  description: string,
  patterns: readonly PatternRecord[],
): number {
  if (patterns.length === 0) return 0;
  const id = skillId.toLowerCase();
  const haystack = `${skillId} ${description}`.toLowerCase();
  let boost = 0;
  for (const p of patterns) {
    const text = p.pattern.toLowerCase();
    let matched = false;
    // strong: the skill id appears verbatim in the pattern text
    if (id.length >= 3 && text.includes(id)) {
      matched = true;
    } else {
      // medium: a meaningful word from the pattern appears in the skill haystack
      // `\p{L}\p{N}`, not `a-z0-9`: the ASCII-only class made every non-Latin word invisible to
      // the boost, so a Cyrillic pattern could never match a skill haystack. The `>= 5` rule below
      // is this site's OWN threshold and is deliberately unchanged — only the alphabet moved.
      for (const word of text.split(/[^\p{L}\p{N}]+/u)) {
        if (word.length >= 5 && haystack.includes(word)) {
          matched = true;
          break;
        }
      }
    }
    // domain alignment: a non-generic domain tag present in the skill haystack
    if (!matched && p.domain && p.domain.length >= 3 && p.domain !== 'general' && haystack.includes(p.domain.toLowerCase())) {
      matched = true;
    }
    if (matched) boost += Math.round(p.reward * PER_MATCH_WEIGHT);
  }
  return Math.min(boost, BOOST_CAP);
}

/* ------------------------------------------------------------------ */
/*  Tier-2: the unified @dzhechkov/memory store (ADR-005)              */
/*                                                                     */
/*  WRITER INVENTORY (store-wide locking — review finding 5).          */
/*  Every function that WRITES the JSON store (.dz/memory/patterns.json)
/*  holds the store lock for its whole read-modify-write:              */
/*    - recordPattern        (JSON branch)   withStoreLock             */
/*    - reinforcePattern                     withStoreLock             */
/*    - updateReinforcementState             withStoreLock             */
/*    - promotePatterns                      withStoreLock             */
/*    - consolidateSessions  (JSON branch)   withStoreLock             */
/*    - pruneNoisePatterns   (JSON tier, live runs) withStoreLockSync  */
/*    - removePatternsByIds  (JSON tier)     withStoreLockSync         */
/*  Deliberately OUT of scope (reasoning):                             */
/*    - the SQLite tier — better-sqlite3 transactions serialize it;    */
/*    - snapshotStore — reads the atomically-renamed store file and    */
/*      writes a DIFFERENT file, so it cannot lose store updates;      */
/*    - the consolidate watermark + sessions.jsonl / patterns.jsonl    */
/*      appends — separate append-only/idempotent files (an older      */
/*      watermark merely causes an idempotent re-scan, dedup by        */
/*      deterministic ids);                                            */
/*    - dry-run prune paths — read-only by construction.               */
/* ------------------------------------------------------------------ */

/** Map a lock failure to the best-effort writers' `{ error }` channel (still loud —
 * the caller SEES the failure and nothing was silently dropped), rethrow anything else. */
function lockErrorMessage(err: unknown): string {
  if (err instanceof StoreLockTimeoutError || err instanceof StoreLockCompromisedError) return err.message;
  throw err;
}

/** Path of the JSON store (the deterministic fallback backend). */
function storePath(projectRoot: string): string {
  return join(projectRoot, '.dz', 'memory', 'patterns.json');
}

/** Path of the SQLite store (the Tier-3 scale/FTS5 backend). */
function sqlitePath(projectRoot: string): string {
  return join(projectRoot, '.dz', 'memory', 'patterns.sqlite');
}

/**
 * Open the SQLite store backend if the configured mode allows it AND the native
 * `better-sqlite3` is loadable. Returns `undefined` to fall back to JSON (the
 * cascade's deterministic last resort). `mode: 'sqlite'` throws if unavailable.
 */
function tryOpenSqlite(projectRoot: string, mode: SqliteBackendMode): SqliteBackend | undefined {
  if (mode === 'json') return undefined;
  try {
    return SqliteBackend.open(sqlitePath(projectRoot));
  } catch (err) {
    if (mode === 'sqlite') {
      // Distinguish a missing native module from other failures (e.g. a filesystem
      // error opening the db) so the forced-mode error names the real cause.
      const code = (err as { code?: string } | undefined)?.code;
      const msg = err instanceof Error ? err.message : String(err);
      const reason =
        code === 'MODULE_NOT_FOUND' || /better-sqlite3/.test(msg)
          ? `better-sqlite3 is unavailable: ${msg}`
          : `failed to open the SQLite store: ${msg}`;
      throw new Error(`learning.sqliteBackend is "sqlite" but ${reason}`);
    }
    return undefined; // auto → graceful JSON fallback
  }
}

/**
 * Canonical identity of a taught pattern — its full semantic content. Two records
 * that differ in ANY field (including reward/domain/type) have distinct identities,
 * so a re-teach with a corrected reward is retained as a distinct, retrievable
 * record rather than silently overwriting the prior one. Identical records share an
 * identity, keeping migration/import an idempotent upsert.
 */
function patternIdentity(p: PatternRecord): string {
  return `${p.pattern}|${p.ts}|${p.reward}|${p.domain}|${p.type}`;
}

/** Deterministic store id derived from the full-content {@link patternIdentity}. */
function recordId(p: PatternRecord): string {
  return `teach:${createHash('sha1').update(patternIdentity(p)).digest('hex').slice(0, 16)}`;
}

/**
 * Public alias of the deterministic store id for a taught pattern — the vector tier's dzId
 * join key (D4/V-2): the SAME content always maps to the SAME id, so a re-mirror dedups to 0.
 */
export function patternRecordId(p: PatternRecord): string {
  return recordId(p);
}

/** Public alias of {@link patternIdentity} — the logical-identity key the hybrid merge dedups on. */
export function patternIdentityOf(p: PatternRecord): string {
  return patternIdentity(p);
}

/** Logical identity of a stored MemoryRecord (the inverse of {@link recordId}'s key). */
function recordIdentity(r: MemoryRecord): string {
  return patternIdentity(recordToPattern(r));
}

const PATTERN_TYPES: ReadonlySet<string> = new Set(['rule', 'success-pattern', 'lesson-learned']);

/** Anti-corruption mapping: harness `PatternRecord` → canonical `MemoryRecord`. */
export function patternToRecord(p: PatternRecord): MemoryRecord {
  return {
    id: recordId(p),
    skillId: '', // taught patterns are free-text, not tied to one skill
    text: p.pattern,
    score: p.reward,
    // Defensive: a legacy PatternRecord (written before `type` existed) has
    // `type === undefined`, which would store as NULL and violate the SQLite
    // `outcome NOT NULL` constraint — bricking `dz teach` for the whole project
    // the moment such a record is folded in. Coerce to a safe default (mirrors
    // recordToPattern's inverse guard) so one partial legacy record can't crash
    // the learn-loop write path.
    outcome: PATTERN_TYPES.has(p.type) ? p.type : 'lesson-learned',
    timestamp: p.ts,
    metadata: { domain: p.domain ?? 'general', source: p.source ?? 'dz-teach' },
  };
}

/** Anti-corruption mapping: canonical `MemoryRecord` → harness `PatternRecord`. */
export function recordToPattern(r: MemoryRecord): PatternRecord {
  return {
    pattern: r.text,
    type: PATTERN_TYPES.has(r.outcome) ? (r.outcome as PatternRecord['type']) : 'lesson-learned',
    reward: r.score,
    domain: r.metadata?.['domain'] ?? 'general',
    ts: r.timestamp,
    source: r.metadata?.['source'] ?? 'dz-teach',
  };
}

/**
 * Quarantine state of a learned record (feature lesson-quarantine, ADR-001). Carried in the SAME
 * record metadata as reinforcement state — no schema migration, no second store. ABSENCE of the
 * field = promoted (every pre-feature record is grandfathered), and AM-1 fail-safe points TOWARD
 * knowledge: any unparseable/unknown `qStatus` reads as promoted — a metadata glitch must never
 * isolate a proven lesson (the conservative side here is NOT quarantining).
 */
export interface QuarantineState {
  readonly quarantined: boolean;
  readonly quarantinedAt?: string;
}

export function readQuarantineState(r: MemoryRecord): QuarantineState {
  const meta = r.metadata ?? {};
  if (meta['qStatus'] !== 'quarantined') return { quarantined: false }; // AM-1 fail-safe
  const at = typeof meta['quarantinedAt'] === 'string' ? meta['quarantinedAt'] : undefined;
  return { quarantined: true, ...(at !== undefined ? { quarantinedAt: at } : {}) };
}

export function encodeQuarantineState(ts: string): Record<string, string> {
  return { qStatus: 'quarantined', quarantinedAt: ts };
}

export interface ReinforcementState {
  readonly uses: number;
  readonly lastUsedTs?: string;
  readonly avgReward: number;
  readonly mergedFrom: readonly string[];
}

export function readReinforcementState(r: MemoryRecord): ReinforcementState {
  const meta = r.metadata ?? {};
  const usesRaw = Number(meta['uses']);
  const avgRaw = Number(meta['avgReward'] ?? meta['avg_reward']);
  let mergedFrom: string[] = [];
  const rawMerged = meta['mergedFrom'];
  if (typeof rawMerged === 'string') {
    try {
      const parsed = JSON.parse(rawMerged) as unknown;
      if (Array.isArray(parsed)) mergedFrom = parsed.filter((v): v is string => typeof v === 'string');
    } catch { /* corrupt metadata is zero-state */ }
  }
  const lastUsedTs = typeof meta['lastUsedTs'] === 'string' ? meta['lastUsedTs'] : undefined;
  return {
    uses: Number.isFinite(usesRaw) && usesRaw > 0 ? Math.floor(usesRaw) : 0,
    ...(lastUsedTs !== undefined ? { lastUsedTs } : {}),
    avgReward: Number.isFinite(avgRaw) && avgRaw >= 0 && avgRaw <= 1 ? avgRaw : 0,
    mergedFrom,
  };
}

export function encodeReinforcementState(state: ReinforcementState): Record<string, string> {
  return {
    uses: String(Math.max(0, Math.floor(state.uses))),
    avgReward: String(Math.max(0, Math.min(1, state.avgReward))),
    ...(state.lastUsedTs !== undefined ? { lastUsedTs: state.lastUsedTs } : {}),
    ...(state.mergedFrom.length > 0 ? { mergedFrom: JSON.stringify([...new Set(state.mergedFrom)].slice(0, 50)) } : {}),
  };
}

/**
 * Read every store record synchronously, unioning the SQLite tier (if present)
 * with the JSON store. Dedup is by LOGICAL IDENTITY ({@link recordIdentity}), not by
 * raw store id, so a record persisted under an older id scheme and a re-folded copy
 * under the current scheme collapse to one on read — no duplication across an
 * id-scheme change or a JSON→SQLite migration. Graceful: any failure yields `[]`.
 */
function loadStoreRecordsSync(projectRoot: string): MemoryRecord[] {
  const byIdentity = new Map<string, MemoryRecord>();
  const add = (r: MemoryRecord): void => {
    const key = recordIdentity(r);
    if (!byIdentity.has(key)) byIdentity.set(key, r);
  };
  const { sqliteBackend } = readLearningConfig(projectRoot);
  // SQLite tier (only if the db file exists — avoid creating one on a pure read)
  if (sqliteBackend !== 'json' && existsSync(sqlitePath(projectRoot))) {
    try {
      const db = SqliteBackend.open(sqlitePath(projectRoot));
      try { for (const r of db.allSync()) add(r); } finally { db.close(); }
    } catch { /* native unavailable — fall through to JSON */ }
  }
  // JSON store (the deterministic fallback; also the source during migration)
  try {
    for (const r of JsonFileBackend.openSync(storePath(projectRoot)).allSync()) add(r);
  } catch { /* absent / corrupt — ignore */ }
  return [...byIdentity.values()];
}

/**
 * Read every unified-store record WITH its canonical store id (`teach:…`/`dream:…`) — the
 * vector tier's backfill diff + dzId→record resolution surface. Graceful: `[]` on any failure.
 */
export function loadStoreRecords(projectRoot: string): MemoryRecord[] {
  try {
    return loadStoreRecordsSync(projectRoot);
  } catch {
    return [];
  }
}

/** Write one record through the backend cascade. CALLER HOLDS THE STORE LOCK — every
 * caller (reinforce / updateReinforcementState / promote) wraps its whole read-modify-write
 * in `withStoreLock`; taking the (non-reentrant) lock here as well would deadlock. */
async function putStoreRecord(projectRoot: string, rec: MemoryRecord): Promise<{ ok: true } | { error: string }> {
  const { sqliteBackend } = readLearningConfig(projectRoot);
  if (sqliteBackend !== 'json') {
    try {
      const db = tryOpenSqlite(projectRoot, sqliteBackend);
      if (db !== undefined) {
        try {
          await db.put(rec);
          return { ok: true };
        } finally {
          db.close();
        }
      }
    } catch (err) {
      if (sqliteBackend === 'sqlite') return { error: err instanceof Error ? err.message : String(err) };
    }
  }
  try {
    const backend = await JsonFileBackend.open(storePath(projectRoot));
    await backend.put(rec);
    await backend.save();
    return { ok: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
}

export interface ReinforcePatternResult {
  readonly ok: boolean;
  readonly dzId?: string;
  readonly uses?: number;
  readonly error?: string;
  /** The reward value actually observed for this reinforcement, clamped to [0,1]. */
  readonly reward?: number;
}

export async function reinforcePattern(projectRoot: string, dzIdOrText: string, opts: { reward?: number; ts?: string; mergedFrom?: readonly string[]; exposure?: boolean; domain?: string } = {}): Promise<ReinforcePatternResult> {
  // The WHOLE read-modify-write holds the store lock (finding 5): two concurrent
  // reinforces would otherwise both read uses=N and both write back N+1.
  let result: ReinforcePatternResult;
  try {
    result = await withStoreLock(projectRoot, async () => reinforcePatternLocked(projectRoot, dzIdOrText, opts));
  } catch (err) {
    return { ok: false, error: lockErrorMessage(err) };
  }
  // ── Bandit reward emission (feature lesson-bandit-rerank, ADR-001 D-5 / architecture §4) ──
  //
  // WHERE: here, in `reinforcePattern`, and NOT inside `reinforcePatternLocked` — that body runs
  // under `withStoreLock`, and the bandit takes a DIFFERENT named lock. Lock nesting is AVOIDED,
  // not managed: the bandit call is made after the store lock is released, from the result the
  // locked section already returns. A crash between the two leaves the bandit one reward behind —
  // a tolerable, self-correcting inconsistency for a ranking hint, and explicitly NOT tolerable for
  // the store itself, which is why the store write is the one inside the lock.
  //
  // WHEN: only on the non-exposure branch — the SAME predicate that decides quarantine promotion
  // eleven lines below. Hanging both on one predicate means the two can never disagree; the
  // exposure≠reward distinction has ONE implementation, not two that must be kept in sync (INV-2).
  //
  // The store write is authoritative; the bandit is a derived index. Its failure is counted inside
  // `recordReward` and can never fail a reinforce.
  if (result.ok && result.dzId !== undefined && opts.exposure !== true) {
    try {
      if (readMemoryLearningConfig(projectRoot).banditRerank) {
        // Dynamic import so the module is not even LOADED on the disarmed path (INV-1), and so
        // patterns.ts keeps no static edge to a module that imports it.
        const payoff = await import('./lesson-payoff.js');
        const ev = payoff.makeRewardEvent(
          result.dzId,
          // HONEST LIMIT: a confirmation carries no memory of WHICH recall surfaced the lesson, so
          // without an explicit `domain` the reward lands in the `general` bucket — the same bucket
          // an undomained recall reads. A caller that knows the recall context should name it.
          payoff.contextKeyFor(opts.domain),
          result.reward ?? 1,
          opts.ts ?? new Date().toISOString(),
        );
        if (ev !== null) payoff.recordReward(projectRoot, ev);
      }
    } catch { /* counted inside the payoff module; a derived index never fails a reinforce */ }
  }
  return result;
}

async function reinforcePatternLocked(projectRoot: string, dzIdOrText: string, opts: { reward?: number; ts?: string; mergedFrom?: readonly string[]; exposure?: boolean }): Promise<ReinforcePatternResult> {
  const records = loadStoreRecords(projectRoot);
  const rec = records.find((r) => r.id === dzIdOrText || r.text === dzIdOrText);
  if (rec === undefined) return { ok: false, error: `no learned pattern matches ${JSON.stringify(dzIdOrText)}` };
  const prev = readReinforcementState(rec);
  const ts = opts.ts ?? new Date().toISOString();
  const observed = opts.reward !== undefined && Number.isFinite(opts.reward) ? Math.max(0, Math.min(1, opts.reward)) : rec.score;
  const totalObserved = prev.uses + 1;
  const avgReward = totalObserved > 0 ? ((prev.avgReward * prev.uses) + observed) / totalObserved : observed;
  const nextState: ReinforcementState = {
    uses: totalObserved,
    lastUsedTs: ts,
    avgReward,
    mergedFrom: [...prev.mergedFrom, ...(opts.mergedFrom ?? [])],
  };
  // Reinforcement IS the earned promotion signal (FR-6a): CONFIRMING a lesson lifts quarantine.
  // EXPOSURE (a recall-hit sample) is not confirmation — stats update, quarantine stays (the
  // no-promotion-by-exposure invariant; found by cross-model QE as a live hole: recall-hit
  // flushes were routed through this same function and silently promoted every viewed lesson).
  const promotedMeta = { ...(rec.metadata ?? {}), ...encodeReinforcementState(nextState) };
  if (opts.exposure !== true) {
    delete promotedMeta['qStatus'];
    delete promotedMeta['quarantinedAt'];
  }
  const next: MemoryRecord = {
    ...rec,
    metadata: promotedMeta,
  };
  const put = await putStoreRecord(projectRoot, next);
  if ('error' in put) return { ok: false, dzId: rec.id, error: put.error };
  try {
    appendFileSync(join(projectRoot, '.dz', 'sessions.jsonl'), JSON.stringify({ event: 'reinforce', ts, dzId: rec.id, uses: nextState.uses }) + '\n');
  } catch { /* best-effort */ }
  return { ok: true, dzId: rec.id, uses: nextState.uses, reward: observed };
}

export async function updateReinforcementState(projectRoot: string, dzId: string, state: ReinforcementState): Promise<ReinforcePatternResult> {
  try {
    return await withStoreLock(projectRoot, async () => {
      const rec = loadStoreRecords(projectRoot).find((r) => r.id === dzId);
      if (rec === undefined) return { ok: false, error: `no learned pattern matches ${JSON.stringify(dzId)}` };
      const next: MemoryRecord = {
        ...rec,
        metadata: { ...(rec.metadata ?? {}), ...encodeReinforcementState(state) },
      };
      const put = await putStoreRecord(projectRoot, next);
      if ('error' in put) return { ok: false, dzId, error: put.error };
      return { ok: true, dzId, uses: state.uses };
    });
  } catch (err) {
    return { ok: false, dzId, error: lockErrorMessage(err) };
  }
}

/** Result of a promotion (dz recall --promote). */
export interface PromoteResult {
  readonly ok: boolean;
  readonly promoted: readonly string[];
  readonly notFound: readonly string[];
  readonly notQuarantined: readonly string[];
  readonly error?: string;
}

/**
 * FR-6b: EXPLICIT promotion — lift quarantine from the named records. The other earned path is
 * reinforcement ({@link reinforcePattern} clears the state as part of confirming the lesson).
 * There is deliberately NO exposure-based auto-promotion: `uses` grows from recall HITS, and
 * promoting by exposure would be a self-fulfilling prophecy (ADR).
 */
export async function promotePatterns(projectRoot: string, dzIds: readonly string[]): Promise<PromoteResult> {
  try {
    return await withStoreLock(projectRoot, async () => {
      const records = loadStoreRecords(projectRoot);
      const promoted: string[] = [];
      const notFound: string[] = [];
      const notQuarantined: string[] = [];
      for (const id of dzIds) {
        const rec = records.find((r) => r.id === id);
        if (rec === undefined) { notFound.push(id); continue; }
        if (!readQuarantineState(rec).quarantined) { notQuarantined.push(id); continue; }
        const meta = { ...(rec.metadata ?? {}) };
        delete meta['qStatus'];
        delete meta['quarantinedAt'];
        const put = await putStoreRecord(projectRoot, { ...rec, metadata: meta });
        if ('error' in put) return { ok: false, promoted, notFound, notQuarantined, error: put.error };
        promoted.push(id);
      }
      return { ok: true, promoted, notFound, notQuarantined };
    });
  } catch (err) {
    return { ok: false, promoted: [], notFound: [], notQuarantined: [], error: lockErrorMessage(err) };
  }
}

/** One quarantined-and-stale record, surfaced for review (informational — FR-7). */
export interface QuarantineExpiryCandidate {
  readonly dzId: string;
  readonly text: string;
  readonly quarantinedAt: string;
  readonly ageDays: number;
}

/**
 * FR-7 (informational-first, per the recalled decay-vs-noise lesson): quarantined records older
 * than `expireDays` with ZERO reinforcement are EXPIRY CANDIDATES — reported, never auto-deleted.
 * Deletion happens only through {@link pruneQuarantinePatterns} (explicit, snapshotted).
 */
export function quarantineExpiryCandidates(projectRoot: string, expireDays: number, now: Date = new Date()): QuarantineExpiryCandidate[] {
  const out: QuarantineExpiryCandidate[] = [];
  // Codex-QE fix (finding 6): the destructive API clamps its own input — a zero/negative/NaN
  // expireDays would make FRESH lessons instantly deletable through the exported surface.
  const days = Number.isFinite(expireDays) && expireDays > 0 ? expireDays : 30;
  for (const r of loadStoreRecords(projectRoot)) {
    const q = readQuarantineState(r);
    if (!q.quarantined) continue;
    // NO uses-based immunity (Codex-QE finding 1): a TRULY reinforced record is no longer
    // quarantined at all (reinforce clears qStatus), so any uses on a still-quarantined record
    // are EXPOSURE — and exposure must not immortalize a hypothesis.
    const at = q.quarantinedAt ?? r.timestamp;
    let ageMs = now.getTime() - new Date(at).getTime();
    if (!Number.isFinite(ageMs)) ageMs = now.getTime() - new Date(r.timestamp).getTime(); // finding 7: fall back
    if (!Number.isFinite(ageMs)) {
      // Both timestamps corrupt: surface for human review (ageDays -1 renders as "?") — an
      // unparseable age must not make the record IMMORTAL in quarantine (finding 7).
      out.push({ dzId: r.id, text: r.text, quarantinedAt: at, ageDays: -1 });
      continue;
    }
    const ageDays = ageMs / 86_400_000;
    if (ageDays >= days) out.push({ dzId: r.id, text: r.text, quarantinedAt: at, ageDays: Math.floor(ageDays) });
  }
  return out;
}

/**
 * Destructive half of expiry — a SEPARATE, explicit gate (never coupled to --prune-noise; AM-3).
 * Dry-run by default; a live run snapshots the store first ({@link snapshotStore}) then removes
 * exactly the expiry candidates via {@link removePatternsByIds}.
 */
export function pruneQuarantinePatterns(
  projectRoot: string,
  opts: { dryRun?: boolean; expireDays: number; now?: Date },
): { candidates: QuarantineExpiryCandidate[]; removed: number; snapshot?: string; error?: string } {
  const now = opts.now ?? new Date();
  const candidates = quarantineExpiryCandidates(projectRoot, opts.expireDays, now);
  if (opts.dryRun !== false || candidates.length === 0) return { candidates, removed: 0 };
  // Snapshot BEFORE the drop; a failed snapshot ABORTS the deletion (the harmonize precedent —
  // a destructive sweep with no receipt is exactly what the recalled decay lesson forbids).
  const snap = snapshotStore(projectRoot, join(projectRoot, '.dz', `patterns-pre-prune-quarantine-${now.getTime()}.json`));
  if (snap.error !== undefined) return { candidates, removed: 0, error: `aborted: ${snap.error}` };
  const res = removePatternsByIds(projectRoot, new Set(candidates.map((c) => c.dzId)));
  return { candidates, removed: res.removed, snapshot: snap.path, ...(res.error !== undefined ? { error: res.error } : {}) };
}

export interface StoreStats {
  readonly total: number;
  readonly perDomain: Record<string, number>;
  readonly topUses: readonly { dzId: string; uses: number; pattern: string; domain: string; reward: number }[];
  readonly exactDupGroups: number;
  readonly reinforceEvents: number;
  readonly teachEvents: number;
}

// ── SAFLA delta report (rUv-scout #2 Phase 2) ────────────────────────────────

/** One lesson's slope row in the delta report. */
export interface LessonDeltaRow {
  readonly dzId: string;
  readonly pattern: string;
  readonly domain: string;
  readonly delta: number;
  readonly pruneCandidate: boolean;
}

/** SAFLA-delta ranking over the store's reinforce history. INFORMATIONAL — deletes nothing (ADR-001). */
export interface LessonDeltaReport {
  /** Lessons with the strongest positive payoff slope (still paying off), highest first. */
  readonly rising: readonly LessonDeltaRow[];
  /** Lessons whose slope is ≤ 0 with enough history to judge — stale prune CANDIDATES (never deleted here). */
  readonly stale: readonly LessonDeltaRow[];
  /** How many lessons had ≥ 2 reinforce events (enough to compute a slope). */
  readonly scored: number;
}

/**
 * Rank the learning store's lessons by SAFLA payoff-slope from their `.dz/sessions.jsonl` reinforce
 * history ({@link rankLessonsByDelta}). Read-only, best-effort (never throws): the reinforce log is the
 * history; a lesson with < 2 reinforce events has no slope and is omitted (no-signal, not stale).
 *
 * Deliberately does NOT feed the destructive prune path — a stale-but-valid lesson is not "noise", so
 * delta candidates are surfaced for the operator to see, not auto-deleted (features/safla-delta-eval FR-5).
 */
function computeLessonDeltaRows(projectRoot: string): LessonDeltaRow[] {
  const meta = new Map<string, { reward: number; pattern: string; domain: string }>();
  try {
    for (const r of loadStoreRecords(projectRoot)) {
      const p = recordToPattern(r);
      meta.set(r.id, { reward: p.reward, pattern: p.pattern, domain: p.domain });
    }
  } catch { /* best-effort */ }

  const hist = new Map<string, { t: number; uses: number }[]>();
  const sessionsPath = join(projectRoot, '.dz', 'sessions.jsonl');
  if (existsSync(sessionsPath)) {
    try {
      for (const line of readFileSync(sessionsPath, 'utf-8').split('\n')) {
        if (line.trim() === '') continue;
        try {
          const o = JSON.parse(line) as { event?: unknown; ts?: unknown; dzId?: unknown; uses?: unknown };
          if (o.event !== 'reinforce' || typeof o.dzId !== 'string') continue;
          const t = Date.parse(String(o.ts));
          const uses = Number(o.uses);
          if (!Number.isFinite(t) || !Number.isFinite(uses)) continue;
          const arr = hist.get(o.dzId) ?? [];
          arr.push({ t, uses });
          hist.set(o.dzId, arr);
        } catch { /* skip corrupt line */ }
      }
    } catch { /* best-effort */ }
  }

  const lessons: LessonHistory[] = [];
  for (const [dzId, events] of hist) {
    const m = meta.get(dzId);
    if (m) lessons.push({ id: dzId, reward: m.reward, events });
  }
  return rankLessonsByDelta(lessons)
    .filter((d) => d.hasSignal)
    .map((d) => {
      const m = meta.get(d.id)!;
      return { dzId: d.id, pattern: m.pattern, domain: m.domain, delta: d.delta, pruneCandidate: d.pruneCandidate };
    });
}

/** {@link lessonDeltaReport}: top rising + stale prune-candidates (informational, deletes nothing). */
export function lessonDeltaReport(projectRoot: string, opts: { topN?: number } = {}): LessonDeltaReport {
  const topN = typeof opts.topN === 'number' && opts.topN > 0 ? Math.floor(opts.topN) : 5;
  const rows = computeLessonDeltaRows(projectRoot);
  return {
    rising: rows.filter((r) => r.delta > 0).slice(0, topN),
    stale: rows.filter((r) => r.pruneCandidate).slice(0, topN),
    scored: rows.length,
  };
}

/** dzId → payoff-slope delta, for the recall re-rank (Phase 3). Only lessons with slope signal appear. */
export function lessonDeltaMap(projectRoot: string): Map<string, number> {
  const m = new Map<string, number>();
  for (const r of computeLessonDeltaRows(projectRoot)) m.set(r.dzId, r.delta);
  return m;
}

export function storeStats(projectRoot: string): StoreStats {
  const records = loadStoreRecords(projectRoot);
  const perDomain: Record<string, number> = {};
  const byQuad = new Map<string, number>();
  const topUses = records
    .map((r) => {
      const p = recordToPattern(r);
      perDomain[p.domain] = (perDomain[p.domain] ?? 0) + 1;
      const key = `${p.pattern}|${p.reward}|${p.domain}|${p.type}`;
      byQuad.set(key, (byQuad.get(key) ?? 0) + 1);
      return { dzId: r.id, uses: readReinforcementState(r).uses, pattern: p.pattern, domain: p.domain, reward: p.reward };
    })
    .filter((r) => r.uses > 0)
    .sort((a, b) => b.uses - a.uses || a.dzId.localeCompare(b.dzId))
    .slice(0, 10);
  let reinforceEvents = 0;
  let teachEvents = records.length;
  const sessionsPath = join(projectRoot, '.dz', 'sessions.jsonl');
  if (existsSync(sessionsPath)) {
    try {
      for (const line of readFileSync(sessionsPath, 'utf-8').split('\n')) {
        if (line.trim() === '') continue;
        try {
          const event = (JSON.parse(line) as { event?: unknown }).event;
          if (event === 'reinforce') reinforceEvents += 1;
          if (event === 'teach') teachEvents += 1;
        } catch { /* skip corrupt lines */ }
      }
    } catch { /* best-effort stats */ }
  }
  return {
    total: records.length,
    perDomain,
    topUses,
    exactDupGroups: [...byQuad.values()].filter((n) => n > 1).length,
    reinforceEvents,
    teachEvents,
  };
}

/** Read the unified store as `PatternRecord[]`. Graceful — any failure yields `[]`. */
export function loadStorePatternsSync(projectRoot: string): PatternRecord[] {
  try {
    return loadStoreRecordsSync(projectRoot).map(recordToPattern);
  } catch {
    return [];
  }
}

/** Records to fold into a backend on first write: legacy jsonl + the JSON store. */
function migrationRecords(projectRoot: string): MemoryRecord[] {
  const out: MemoryRecord[] = [];
  for (const legacy of readJsonl(join(projectRoot, '.dz', 'patterns.jsonl'), isPatternRecord)) {
    out.push(patternToRecord(legacy));
  }
  try {
    for (const r of JsonFileBackend.openSync(storePath(projectRoot)).allSync()) out.push(r);
  } catch { /* no JSON store yet */ }
  return out;
}

/**
 * Persist a taught pattern to the unified store (async — runs in `dz teach`).
 * Routes through the selected backend (SQLite when available, else JSON — the
 * cascade). On first write it idempotently folds the legacy `.dz/patterns.jsonl`
 * AND any existing JSON store into the chosen backend (deterministic ids ⇒ no
 * duplicates), so migrating JSON→SQLite never loses or doubles a record, and the
 * JSON file is never deleted. Returns the total record count after the write.
 */
export async function recordPattern(projectRoot: string, p: PatternRecord, opts: { quarantine?: boolean } = {}): Promise<number> {
  const { sqliteBackend } = readLearningConfig(projectRoot);
  // lesson-quarantine: a fresh lesson is a HYPOTHESIS — mark it when the feature is on. Folded
  // legacy records are NEVER marked (they predate the feature: grandfathered as promoted).
  const rec = opts.quarantine === true
    ? { ...patternToRecord(p), metadata: { ...patternToRecord(p).metadata, ...encodeQuarantineState(p.ts) } }
    : patternToRecord(p);
  const sqlite = tryOpenSqlite(projectRoot, sqliteBackend);
  if (sqlite) {
    try {
      for (const r of migrationRecords(projectRoot)) await sqlite.put(r);
      await sqlite.put(rec);
      return await sqlite.count();
    } finally {
      sqlite.close();
    }
  }
  // JSON fallback. The load-mutate-save below MUST hold the store lock: the backend's
  // write is atomic (no torn file) but a teach is a read-modify-write, and two that
  // overlap each write back their own copy of the record set — the later rename wins and
  // the earlier lesson is silently gone while both processes report success. SQLite does
  // its own locking and never reaches here.
  return withStoreLock(projectRoot, async () => {
    const backend = await JsonFileBackend.open(storePath(projectRoot));
    for (const legacy of readJsonl(join(projectRoot, '.dz', 'patterns.jsonl'), isPatternRecord)) {
      await backend.put(patternToRecord(legacy));
    }
    await backend.put(rec);
    await backend.save();
    return backend.count();
  });
}

/** Outcome of a {@link recallPatterns} ranked search (or a hybrid merge — see `vector-tier.ts`). */
export interface RecallHit {
  /** The matched pattern. */
  readonly pattern: PatternRecord;
  /**
   * Backend that produced the ranking: `sqlite` = FTS5, `json` = keyword overlap;
   * `vector`/`both` appear ONLY in `recallHybrid` output (`recallPatterns` itself never
   * emits them — it stays the sync lexical baseline, AC-5).
   */
  readonly backend: 'sqlite' | 'json' | 'vector' | 'both';
  /** lesson-quarantine: set (true) only for a quarantined hit — display marks it ⚠q and ranking damps/sinks it. */
  readonly quarantined?: boolean;
}

/**
 * Ranked recall over the store (Tier-3): SQLite **FTS5** full-text ranking when
 * available, else JSON keyword-overlap. The synchronous CLI analogue of semantic
 * recall — note it is *lexical*, not vector similarity (true embedding/HNSW recall
 * lives in the `agentdb-memory` MCP skill, MCP-host only). Graceful: `[]` on failure.
 */
export function recallPatterns(projectRoot: string, query: string, limit = 10): RecallHit[] {
  const { sqliteBackend } = readLearningConfig(projectRoot);
  if (sqliteBackend !== 'json' && existsSync(sqlitePath(projectRoot))) {
    try {
      const db = SqliteBackend.open(sqlitePath(projectRoot));
      try {
        return sinkQuarantined(
          db.querySync({ text: query, limit: limit * 2 }).map((r) => ({
            pattern: recordToPattern(r),
            backend: 'sqlite' as const,
            ...(readQuarantineState(r).quarantined ? { quarantined: true as const } : {}),
          })),
          limit,
        );
      } finally {
        db.close();
      }
    } catch { /* fall through to JSON */ }
  }
  try {
    return sinkQuarantined(
      JsonFileBackend.openSync(storePath(projectRoot))
        .querySync({ text: query, limit: limit * 2 })
        .map((r) => ({
          pattern: recordToPattern(r),
          backend: 'json' as const,
          ...(readQuarantineState(r).quarantined ? { quarantined: true as const } : {}),
        })),
      limit,
    );
  } catch {
    return [];
  }
}

/**
 * Lexical recall has no numeric rank to damp, so quarantine "damping" is a STABLE sink: promoted
 * hits keep their relative order first, quarantined hits follow (still VISIBLE — hiding them would
 * make the loop a write-only log; ADR D2). Hybrid (scored) recall damps numerically instead.
 */
function sinkQuarantined<T extends { quarantined?: boolean }>(hits: readonly T[], limit?: number): T[] {
  // Codex-QE finding 2: the query OVERFETCHES (2×limit) before sinking, so quarantined hits in
  // the backend's top-K cannot crowd promoted knowledge out of the final window.
  const sunk = [...hits.filter((h) => h.quarantined !== true), ...hits.filter((h) => h.quarantined === true)];
  return limit !== undefined ? sunk.slice(0, limit) : sunk;
}

/* ------------------------------------------------------------------ */
/*  Tier-2.5: session consolidation (harvestDreamPatterns)            */
/* ------------------------------------------------------------------ */

/** Does `dir` exist and contain at least one `.jsonl` transcript? */
function hasTranscripts(dir: string): boolean {
  try {
    return existsSync(dir) && readdirSync(dir).some((f) => f.endsWith('.jsonl'));
  } catch {
    return false;
  }
}

/**
 * The host Claude-Code transcript directory for a project, derived the way Claude
 * Code encodes it: `<home>/.claude/projects/<abs-cwd with '/' → '-'>/`. Returns
 * `undefined` if that directory has no transcripts.
 */
function claudeTranscriptDir(projectRoot: string): string | undefined {
  const slug = resolve(projectRoot).replace(/\//g, '-');
  const dir = join(homedir(), '.claude', 'projects', slug);
  return hasTranscripts(dir) ? dir : undefined;
}

/** Where transcripts come from when `--sessions-dir` isn't given. */
export type SessionsSource = 'explicit' | 'dz-sessions' | 'claude-transcripts' | 'none';

/**
 * Resolve the transcript directory to consolidate, auto-discovering it when no
 * explicit dir is given: prefer `.dz/sessions` (if it has transcripts), else the
 * host Claude-Code transcript dir for this project. Returns the dir + its source.
 */
function discoverSessionsDir(projectRoot: string, explicit?: string): { dir: string; source: SessionsSource } {
  if (explicit !== undefined) return { dir: explicit, source: 'explicit' };
  const dzSessions = join(projectRoot, '.dz', 'sessions');
  if (hasTranscripts(dzSessions)) return { dir: dzSessions, source: 'dz-sessions' };
  const claude = claudeTranscriptDir(projectRoot);
  if (claude !== undefined) return { dir: claude, source: 'claude-transcripts' };
  return { dir: dzSessions, source: 'none' }; // nothing found — graceful no-op target
}

function watermarkPath(projectRoot: string): string {
  return join(projectRoot, '.dz', 'memory', 'consolidate.json');
}

/** Read the last-consolidated ISO timestamp, or `undefined` on first run. */
function readWatermark(projectRoot: string): string | undefined {
  const p = watermarkPath(projectRoot);
  if (!existsSync(p)) return undefined;
  try {
    const parsed = JSON.parse(readFileSync(p, 'utf-8')) as { lastConsolidatedTs?: unknown };
    return typeof parsed.lastConsolidatedTs === 'string' ? parsed.lastConsolidatedTs : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Deterministic id for a harvested dream pattern — keyed by its content, NOT by
 * `Date.now()` (as the package's `dreamPatternToRecord` is). Re-consolidating the
 * same transcripts is therefore an idempotent upsert, never a duplicate.
 */
export function dreamRecordId(d: DreamPattern): string {
  return `dream:${createHash('sha1').update(`${d.sessionFile}|${d.skillId}|${d.timestamp}|${d.insight}`).digest('hex').slice(0, 16)}`;
}

function dreamToStoreRecord(d: DreamPattern): MemoryRecord {
  return {
    id: dreamRecordId(d),
    skillId: d.skillId,
    text: d.insight,
    score: d.score,
    outcome: d.outcome,
    timestamp: d.timestamp,
    metadata: { sessionFile: d.sessionFile, source: 'consolidate' },
  };
}

/** Outcome of a {@link consolidateSessions} run. */
export interface ConsolidateResult {
  /** Directory scanned for transcripts. */
  readonly sessionsDir: string;
  /** How `sessionsDir` was chosen (explicit flag, .dz/sessions, or auto-discovered host transcripts). */
  readonly source: SessionsSource;
  /** Patterns harvested from the transcripts this run. */
  readonly harvested: number;
  /** Records newly added to the store (idempotent re-runs add 0). */
  readonly added: number;
  /** New watermark (max processed timestamp), or the prior one if nothing harvested. */
  readonly watermark: string | undefined;
  /** Learnings mirrored into the AgentDB vector index this run (Option C; 0 when mirroring is off/unavailable). */
  readonly mirrored: number;
  /** Why mirroring was skipped or partial (honest label; undefined when fully mirrored or intentionally off). */
  readonly mirrorError?: string | undefined;
}

/** Options for {@link consolidateSessions}. */
export interface ConsolidateOptions {
  /** Transcript directory to scan. When omitted, auto-discovered (`.dz/sessions`, then the host Claude-Code transcript dir). */
  readonly sessionsDir?: string;
  /**
   * Mirror this run's harvested learnings into the AgentDB vector index (Option C, ADR-003).
   * Default: auto — mirrors when `.dz/config.json` says `memory.backend === 'agentdb'` and the
   * project has `agentdb` + `better-sqlite3` installed. Pass `false` to disable (`--no-mirror`).
   */
  readonly mirrorAgentdb?: boolean;
}

/**
 * Consolidate Agent/Claude-Code session transcripts into the unified memory store
 * (Tier-2.5). Runs `harvestDreamPatterns` over the transcript dir, maps each pattern
 * to a deterministically-keyed `MemoryRecord`, and upserts it — so a learned outcome
 * surfaces in `recommend()` like a taught pattern. Idempotent (deterministic ids)
 * and incremental (a durable watermark skips already-processed transcripts).
 *
 * When `opts.sessionsDir` is omitted, the dir is **auto-discovered**: `.dz/sessions`
 * if it holds transcripts, else this project's host Claude-Code transcript directory
 * (`~/.claude/projects/<cwd>/`). A no-op when nothing harvestable is found.
 */
/** `memory.backend` from `.dz/config.json` ('' when absent/unreadable). */
function memoryBackendOf(projectRoot: string): string {
  try {
    const cfg = JSON.parse(readFileSync(join(projectRoot, '.dz', 'config.json'), 'utf-8')) as { memory?: { backend?: string } };
    return cfg.memory?.backend ?? '';
  } catch {
    return '';
  }
}

/** Dreams that carry a GENUINE reusable reward signal — the vector-mirror ingest gate.
 * Excludes (a) tool-use telemetry ("Tool X invoked during session", hardcoded score) and
 * (b) every insight `isNoiseInsight` rejects — notably bare-approval checkpoint echoes
 * ("ok", "продолжай"), which are reward signal, not a recallable pattern. Mirroring either
 * would recreate the pollution ADR-002 eliminated, so it is filtered at INGEST here — not
 * merely swept later by the retro-prune (scout #3). Exported: the vector tier's text-level
 * gate (`isVectorNoise` in `vector-tier.ts`) applies the identical predicate. */
export function isMirrorableLearning(d: DreamPattern): boolean {
  return !isNoiseInsight(d.insight) && !/^Tool \S+ invoked during session$/.test(d.insight);
}

/* ------------------------------------------------------------------ */
/*  Retro-prune: remove legacy noise from the learning store           */
/* ------------------------------------------------------------------ */

/** Outcome of a {@link pruneNoisePatterns} run. */
export interface PruneNoiseResult {
  /** Records removed from the lexical store (SQLite tier + JSON tier, summed). Counted, not removed, on a dry run. */
  readonly lexicalRemoved: number;
  /** Rows removed from the AgentDB vector mirror (`reasoning_patterns` + their embeddings). Counted, not removed, on a dry run. */
  readonly vectorRemoved: number;
  /** `true` ⇒ nothing was deleted; the counts and `candidates` describe what a live run WOULD delete. */
  readonly dryRun?: boolean;
  /** Exactly which records matched — the receipt. Present in both modes. */
  readonly candidates?: readonly { readonly id: string; readonly text: string }[];
  /** Honest reason when part of the prune could not run (best-effort — never throws). */
  readonly error?: string;
}

/** Minimal better-sqlite3 surface the vector prune uses (mirrors agentdb-index's NativeDb). */
interface PruneDb {
  pragma: (s: string) => void;
  prepare: (q: string) => {
    all: (...a: unknown[]) => unknown[];
    get: (...a: unknown[]) => unknown;
    run: (...a: unknown[]) => unknown;
  };
  transaction: <T>(fn: () => T) => () => T;
  close: () => void;
}

/**
 * Prune legacy noise from the AgentDB **vector mirror** (`.dz/agentdb.db`): rows written by the
 * consolidate mirror (`task_type = 'dz-learning'`) whose `approach` matches `isNoiseInsight`,
 * plus their `pattern_embeddings`. Native better-sqlite3, WAL, one transaction — mirroring
 * {@link indexPatternsToAgentdb}'s style. Best-effort: never throws, returns an honest error.
 */
/**
 * The read-only twin of {@link pruneNoiseVectors} — counts the mirror rows a live prune WOULD drop,
 * opening the store READ-ONLY so a preview can never write. Same predicate, same `task_type` filter,
 * so the dry-run count and the live removal count cannot drift apart. Never throws.
 */
function countNoiseVectors(projectRoot: string): { removed: number; error?: string } {
  const dbFile = resolveAgentdbPath(projectRoot);
  if (!existsSync(dbFile)) return { removed: 0 };
  let Database: new (p: string, o?: { readonly: boolean }) => PruneDb;
  try {
    const req = createRequire(join(projectRoot, 'package.json'));
    Database = req('better-sqlite3') as new (p: string, o?: { readonly: boolean }) => PruneDb;
  } catch {
    return { removed: 0, error: 'better-sqlite3 not installed in project (run: dz setup --memory agentdb)' };
  }
  try {
    const db = new Database(dbFile, { readonly: true });
    try {
      const tableExists = (name: string): boolean =>
        db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?").get(name) !== undefined;
      if (!tableExists('reasoning_patterns')) return { removed: 0 };
      const rows = db
        .prepare("SELECT id, approach FROM reasoning_patterns WHERE task_type = 'dz-learning'")
        .all() as Array<{ id: number; approach: string }>;
      return { removed: rows.filter((r) => isNoiseInsight(r.approach)).length };
    } finally {
      db.close();
    }
  } catch (err) {
    const verdict = probeNativeDep(projectRoot, 'better-sqlite3', exerciseSqliteOpen, 'sqlite-open');
    const message = verdict.state === 'unusable'
      ? describeNativeDep(verdict)
      : err instanceof Error ? err.message : String(err);
    return { removed: 0, error: `vector mirror: ${message}` };
  }
}

function pruneNoiseVectors(projectRoot: string): { removed: number; error?: string } {
  const dbFile = resolveAgentdbPath(projectRoot);
  if (!existsSync(dbFile)) return { removed: 0 }; // no vector mirror yet — nothing to prune
  let Database: new (p: string) => PruneDb;
  try {
    const req = createRequire(join(projectRoot, 'package.json'));
    Database = req('better-sqlite3') as new (p: string) => PruneDb;
  } catch {
    return { removed: 0, error: 'better-sqlite3 not installed in project (run: dz setup --memory agentdb)' };
  }
  try {
    const db = new Database(dbFile);
    try {
      db.pragma('journal_mode = WAL');
      db.pragma('busy_timeout = 5000'); // wait out a brief MCP-server write lock instead of failing
      const tableExists = (name: string): boolean =>
        db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?").get(name) !== undefined;
      if (!tableExists('reasoning_patterns')) return { removed: 0 };
      const rows = db
        .prepare("SELECT id, approach FROM reasoning_patterns WHERE task_type = 'dz-learning'")
        .all() as Array<{ id: number; approach: string }>;
      const ids = rows.filter((r) => isNoiseInsight(r.approach)).map((r) => r.id);
      if (ids.length === 0) return { removed: 0 };
      const hasEmb = tableExists('pattern_embeddings');
      const delEmb = hasEmb ? db.prepare('DELETE FROM pattern_embeddings WHERE pattern_id = ?') : undefined;
      const delPat = db.prepare('DELETE FROM reasoning_patterns WHERE id = ?');
      const commit = db.transaction(() => {
        for (const id of ids) {
          delEmb?.run(id); // explicit — ON DELETE CASCADE needs the foreign_keys pragma, which isn't guaranteed on
          delPat.run(id);
        }
        return ids.length;
      });
      return { removed: commit() };
    } finally {
      db.close();
    }
  } catch (err) {
    const verdict = probeNativeDep(projectRoot, 'better-sqlite3', exerciseSqliteOpen, 'sqlite-open');
    if (verdict.state === 'unusable') {
      return { removed: 0, error: `vector mirror: ${describeNativeDep(verdict)}` };
    }
    return { removed: 0, error: `vector prune failed: ${err instanceof Error ? err.message : String(err)}` };
  }
}

/**
 * RETRO-PRUNE of learning-store noise. Removes records the OLD harvester wrote before the
 * noise gate existed — tool-invocation telemetry and system-wrapper "user responses", as
 * defined by `isNoiseInsight` from `@dzhechkov/memory` (the shared prune contract) — from:
 *
 * 1. the **lexical** store (the same SQLite/JSON tiers `loadPatterns`/`consolidateSessions`
 *    use — both tiers are swept, since a migrated store can hold copies in each), and
 * 2. the **vector** mirror (`.dz/agentdb.db` `reasoning_patterns` rows with
 *    `task_type = 'dz-learning'`, plus their `pattern_embeddings`).
 *
 * Best-effort and idempotent: any tier that can't be pruned contributes an honest `error`
 * instead of throwing; a re-run removes 0.
 */
export function pruneNoisePatterns(projectRoot: string, opts: { dryRun?: boolean } = {}): PruneNoiseResult {
  const dryRun = opts.dryRun === true;
  let lexicalRemoved = 0;
  const errors: string[] = [];
  // What a dry run would delete. The store lives in a git-ignored `.dz/` and has no history, so the
  // only way to review a destructive sweep is to SEE it first. Collected in both modes: a live run
  // reports exactly what it removed, which is the receipt a user needs afterwards.
  const candidates: { id: string; text: string }[] = [];

  // Lexical store, SQLite tier
  const { sqliteBackend } = readLearningConfig(projectRoot);
  if (sqliteBackend !== 'json' && existsSync(sqlitePath(projectRoot))) {
    try {
      const db = SqliteBackend.open(sqlitePath(projectRoot));
      try {
        for (const r of db.allSync()) {
          // AM-3 (recalled decay-vs-noise lesson): a quarantined record is valid-but-unproven, not
          // garbage — noise-prune must NEVER touch it; its lifecycle belongs to prune-quarantine.
          if (readQuarantineState(r).quarantined) continue;
          if (isNoiseInsight(r.text)) {
            candidates.push({ id: r.id, text: r.text });
            if (!dryRun) db.removeSync(r.id);
            lexicalRemoved += 1;
          }
        }
      } finally {
        db.close();
      }
    } catch (err) {
      errors.push(`sqlite store: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // Lexical store, JSON tier (may hold pre-migration copies of the same noise).
  // A LIVE run is a read-modify-write of the whole store file, so it holds the store
  // lock (finding 5); a dry run reads the atomically-renamed file and is safe unlocked
  // (and must not error against a merely-busy store).
  const sweepJsonTier = (): void => {
    if (!existsSync(storePath(projectRoot))) return;
    const backend = JsonFileBackend.openSync(storePath(projectRoot));
    let removed = 0;
    for (const r of backend.allSync()) {
      if (readQuarantineState(r).quarantined) continue; // AM-3: never coupled to noise-prune
      if (isNoiseInsight(r.text)) {
        if (!candidates.some((c) => c.id === r.id)) candidates.push({ id: r.id, text: r.text });
        if (!dryRun) backend.removeSync(r.id);
        removed += 1;
      }
    }
    if (removed > 0 && !dryRun) void backend.save(); // physically synchronous (writeFileSync under the hood)
    lexicalRemoved += removed;
  };
  try {
    if (dryRun) sweepJsonTier();
    else withStoreLockSync(projectRoot, sweepJsonTier);
  } catch (err) {
    errors.push(`json store: ${err instanceof Error ? err.message : String(err)}`);
  }

  // Vector mirror. A dry run must not touch it either — the mirror and the lexical store are pruned
  // as one unit, so previewing half of it would misreport the outcome.
  const vector = dryRun ? countNoiseVectors(projectRoot) : pruneNoiseVectors(projectRoot);
  if (vector.error !== undefined) errors.push(vector.error);

  const base = { lexicalRemoved, vectorRemoved: vector.removed, dryRun, candidates };
  return errors.length > 0 ? { ...base, error: errors.join('; ') } : base;
}

/* ------------------------------------------------------------------ */
/*  Harmonize seams: id-keyed remove + restorable snapshot             */
/*  (features/dz-vector-harmonize-import M0.1/M0.2)                     */
/* ------------------------------------------------------------------ */

/** Outcome of {@link removePatternsByIds}. */
export interface RemovePatternsResult {
  /** Records removed across the SQLite + JSON tiers (summed). */
  readonly removed: number;
  /** Honest reason when a tier could not be swept (best-effort — never throws). */
  readonly error?: string;
}

/**
 * Remove store records by an EXPLICIT set of store ids ({@link patternRecordId}/`MemoryRecord.id`),
 * across BOTH lexical tiers — byte-for-byte the {@link pruneNoisePatterns} sweep, but keyed on an
 * id set instead of the `isNoiseInsight` predicate. This is harmonize `--apply`'s drop path: only
 * the named ids are touched; keepers and singletons are never removed. Best-effort and idempotent
 * (a re-run over an already-removed set removes 0); an empty/unknown set is a no-op. Never throws.
 */
export function removePatternsByIds(projectRoot: string, ids: ReadonlySet<string>): RemovePatternsResult {
  if (ids.size === 0) return { removed: 0 };
  let removed = 0;
  const errors: string[] = [];

  // Lexical store, SQLite tier
  const { sqliteBackend } = readLearningConfig(projectRoot);
  if (sqliteBackend !== 'json' && existsSync(sqlitePath(projectRoot))) {
    try {
      const db = SqliteBackend.open(sqlitePath(projectRoot));
      try {
        for (const r of db.allSync()) {
          if (ids.has(r.id)) {
            db.removeSync(r.id);
            removed += 1;
          }
        }
      } finally {
        db.close();
      }
    } catch (err) {
      errors.push(`sqlite store: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // Lexical store, JSON tier (may hold pre-migration copies of the same record).
  // Read-modify-write of the whole store file ⇒ holds the store lock (finding 5): an
  // unlocked remove overlapping a teach would write back a snapshot without the new
  // lesson. On lock failure NOTHING was written and the error says so.
  try {
    withStoreLockSync(projectRoot, () => {
      if (!existsSync(storePath(projectRoot))) return;
      const backend = JsonFileBackend.openSync(storePath(projectRoot));
      let localRemoved = 0;
      for (const r of backend.allSync()) {
        if (ids.has(r.id)) {
          backend.removeSync(r.id);
          localRemoved += 1;
        }
      }
      if (localRemoved > 0) void backend.save(); // physically synchronous (writeFileSync under the hood)
      removed += localRemoved;
    });
  } catch (err) {
    errors.push(`json store: ${err instanceof Error ? err.message : String(err)}`);
  }

  return errors.length > 0 ? { removed, error: errors.join('; ') } : { removed };
}

/** Outcome of {@link snapshotStore}. */
export interface SnapshotStoreResult {
  /** Where the snapshot was written. */
  readonly path: string;
  /** Number of patterns captured. */
  readonly count: number;
  /** Honest reason on failure — the caller (harmonize `--apply`) aborts the drop when set. */
  readonly error?: string;
}

/**
 * Write a restorable, `dz recall --all --json`-shaped snapshot of the WHOLE lexical store to
 * `dest` (a `PatternRecord[]` JSON array — the exact input `dz teach --from-json` consumes). This
 * is harmonize `--apply`'s pre-mutation BACKUP: a failed snapshot returns `{ error }` so the caller
 * aborts the drop and never leaves a partial mutation. Restore with `dz teach --from-json <dest>`
 * (exact-text dedup re-adds only the dropped rows; survivors are skipped). Never throws.
 */
export function snapshotStore(projectRoot: string, dest: string): SnapshotStoreResult {
  try {
    const patterns = loadStorePatternsSync(projectRoot);
    mkdirSync(dirname(dest), { recursive: true });
    writeFileSync(dest, JSON.stringify(patterns, null, 2));
    return { path: dest, count: patterns.length };
  } catch (err) {
    return { path: dest, count: 0, error: `snapshot failed: ${err instanceof Error ? err.message : String(err)}` };
  }
}

export async function consolidateSessions(
  projectRoot: string,
  opts: ConsolidateOptions = {},
): Promise<ConsolidateResult> {
  const { dir: sessionsDir, source } = discoverSessionsDir(projectRoot, opts.sessionsDir);
  const since = readWatermark(projectRoot);
  const harvested = harvestDreamPatterns(since !== undefined ? { sessionsDir, since } : { sessionsDir });

  // INGEST GATE (scout #3): drop NOISE before it ever reaches the lexical store. A bare-approval
  // checkpoint echo ("ok", "продолжай") is reward signal, not a recallable insight — `isNoiseInsight`
  // rejects it, so it must be filtered HERE, at ingest, not merely swept later by the retro-prune.
  // Without this, the next `dz consolidate` re-accumulates the exact bare-approval noise the prune
  // removed (the ADR's "gate runs on both ingest and prune" was only half-true). The watermark still
  // advances over EVERY harvested transcript (incl. dropped echoes) so they are not re-scanned.
  const dreams = harvested.filter((d) => !isNoiseInsight(d.insight));
  let maxTs = since;
  for (const d of harvested) {
    if (maxTs === undefined || d.timestamp > maxTs) maxTs = d.timestamp;
  }

  // Route through the selected backend (SQLite when available, else JSON — the cascade).
  const { sqliteBackend } = readLearningConfig(projectRoot);
  const sqlite = tryOpenSqlite(projectRoot, sqliteBackend);
  let added: number;
  // Track which dreams are GENUINELY NEW to the store (per-put count delta): the lexical store
  // dedups re-harvested boundary dreams by deterministic id, and the vector mirror must follow
  // the same truth — otherwise an inclusive watermark boundary re-mirrors the same learning
  // every run (duplicate vectors; caught by live e2e, see ADR-003).
  const newDreams: DreamPattern[] = [];
  if (sqlite) {
    try {
      for (const r of migrationRecords(projectRoot)) await sqlite.put(r);
      const before = await sqlite.count();
      let prev = before;
      for (const d of dreams) {
        await sqlite.put(dreamToStoreRecord(d));
        const now = await sqlite.count();
        if (now > prev) newDreams.push(d);
        prev = now;
      }
      added = prev - before;
    } finally {
      sqlite.close();
    }
  } else {
    // JSON fallback: the open→put→save below is a read-modify-write of the whole store
    // file, so it must hold the store lock (finding 5) — a consolidate overlapping a
    // teach would otherwise overwrite the teach's record and, because the watermark
    // advances afterwards, make the loss permanent.
    added = await withStoreLock(projectRoot, async () => {
      const backend = await JsonFileBackend.open(storePath(projectRoot));
      const before = await backend.count();
      let prev = before;
      for (const d of dreams) {
        await backend.put(dreamToStoreRecord(d));
        const now = await backend.count();
        if (now > prev) newDreams.push(d);
        prev = now;
      }
      await backend.save();
      return prev - before;
    });
  }

  if (maxTs !== undefined && maxTs !== since) {
    mkdirSync(dirname(watermarkPath(projectRoot)), { recursive: true });
    writeFileSync(watermarkPath(projectRoot), JSON.stringify({ lastConsolidatedTs: maxTs }, null, 2));
  }

  // Vector tier (dz-rvf-vector-bridge FR-1/FR-2, formerly "Option C"): mirror THIS run's NEW
  // learnings through the engine PORT — the ONE mirror seam (`mirrorEntriesToVector`), which
  // owns the noise gate, dzId dedup (I-5), pending-queue heal (QE P1: the lexical watermark
  // advances regardless of mirror outcome), timeout bounds (NC1), and honest receipts (I-1).
  // Auto when the project's memory backend is agentdb; explicit opts.mirrorAgentdb overrides
  // both ways. The dynamic import keeps the module graph acyclic (vector-tier statically
  // imports patterns.js).
  const wantMirror = opts.mirrorAgentdb ?? memoryBackendOf(projectRoot) === 'agentdb';
  let mirrored = 0;
  let mirrorError: string | undefined;
  if (wantMirror) {
    const { mirrorEntriesToVector, backfillVectorMirror, dreamVectorEntry } = await import('./vector-tier.js');
    const entries: VectorEntry[] = [];
    for (const d of newDreams.filter(isMirrorableLearning)) {
      const e = dreamVectorEntry(d);
      if (e !== undefined) entries.push(e);
    }
    const receipt = await mirrorEntriesToVector(projectRoot, entries);
    mirrored = receipt.mirrored;
    mirrorError = receipt.error;
    // Eventual consistency (FR-2, after the watermark write): heal any teach-time failures by
    // diffing lexical dzIds against the engine and draining the pending queue — bounded batch.
    if (receipt.error === undefined) {
      const backfill = await backfillVectorMirror(projectRoot);
      mirrored += backfill.mirrored;
      if (backfill.error !== undefined) mirrorError = backfill.error;
    }
  }

  return { sessionsDir, source, harvested: harvested.length, added, watermark: maxTs, mirrored, mirrorError };
}

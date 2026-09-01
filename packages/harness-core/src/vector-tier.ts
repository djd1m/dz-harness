/**
 * Vector Tier — the SEMANTIC half of the dz self-learning pattern store
 * (`features/dz-rvf-vector-bridge`, ADR-001 "Option A extended").
 *
 * One PORT ({@link VectorEngine}) with two adapters behind it:
 *
 * - **AgentdbVectorEngine** (default) — reuses the `.dz/agentdb.db` ReasoningBank store the
 *   consolidate Option-C mirror already writes (`agentdb-index.ts`), so semantic recall reads
 *   the vectors that exist today. Zero new dependencies: `agentdb`/`better-sqlite3` are
 *   dynamically resolved from the PROJECT, never imported at module top level.
 * - **RvfVectorEngine** (opt-in, `memory.vector.engine = "rvf"`) — the portable single-file
 *   VECTOR form (`.dz/memory/patterns.rvf` + `.idmap.json`/`.manifest.json` sidecars) via a
 *   lazily imported `@ruvector/rvf`. Never a `dependencies` entry (at most a documentation-only
 *   `peerDependenciesMeta`).
 *
 * HONEST-ERROR CONTRACT (load-bearing, Invariant I-1): every function in this module returns an
 * honest `{ …, error?: string }` receipt and NEVER throws or hangs — engine absence, a failed
 * embed, a locked DB, or a timeout all degrade to today's exact lexical behavior. The lexical
 * store (`patterns.sqlite`/`patterns.json`) is the SOURCE OF TRUTH; the vector tier is a
 * best-effort MIRROR that can be rebuilt from it at any time (`dz consolidate` backfill), and a
 * vector hit whose lexical twin is gone is DROPPED, never resurrected (Invariant V-1).
 *
 * Constraint 7 (QR-10, field-diagnosis discipline): when lexical and vector counts diverge,
 * **rule out local DB corruption before blaming the mirror** — check `dz doctor`'s store health
 * first; the mirror's own divergence line (`dz vector status`) reports BOTH counts plus the
 * `dz consolidate` backfill hint, and is informational, never an error.
 *
 * Both engine calls (read `search` AND write `upsert`/`listIds`) are wall-time bounded
 * ({@link DEFAULT_VECTOR_TIMEOUT_MS}); a write-side timeout (e.g. a first-run embedding-model
 * download) lands the batch in `.dz/mirror-pending.json` and never blocks `dz teach` (NC1).
 *
 * @packageDocumentation
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync, renameSync, appendFileSync, copyFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

import { isNoiseInsight } from '@dzhechkov/memory';
import type { DreamPattern, MemoryRecord } from '@dzhechkov/memory';

import {
  recallPatterns,
  recordToPattern,
  patternRecordId,
  patternIdentityOf,
  dreamRecordId,
  lessonDeltaMap,
  loadStoreRecords,
  readMemoryLearningConfig,
  readReinforcementState,
  readQuarantineState,
  removePatternsByIds,
  snapshotStore,
  updateReinforcementState,
  type PatternRecord,
  type RecallHit,
  type RecallPatternsOptions,
} from './patterns.js';
import {
  indexPatternsToAgentdb,
  searchAgentdbPatterns,
  listAgentdbDzIds,
  DZ_PATTERN_TASK_TYPES,
  resolveAgentdbEmbedder,
  cosineSimilarity,
  importVectorsToAgentdb,
  reindexAgentdbRows,
  readAgentdbRowsByTaskType,
  DZ_OWNED_TASK_TYPES,
} from './agentdb-index.js';
// smart-backlog (ADR-001/005 lifecycle): `dz vector reindex` must re-embed dz-backlog rows too, or
// they rot in a stale embedding space after a model bump. One-directional import — backlog.ts imports
// agentdb-index/compounding only, never vector-tier, so there is no cycle.
import { BACKLOG_TASK_TYPE } from './backlog.js';
import { currentEmbedManifest, guardEmbedSpace, DEFAULT_EMBED_DIM, resolveEmbedModel, type EmbedModelConfig } from './embedding-config.js';
import { applyLearningSignals, applyLearningSignalsWithDelta, applyLearningSignalsWithTerms, resolveLearningBackend, type LearningSignalBackend, type RerankTerm } from './learning-backend.js';
import {
  describeNativeDep,
  exerciseSqliteOpen,
  probeNativeDep,
  type NativeDepVerdict,
} from './native-dep-probe.js';
// lesson-bandit-rerank: the payoff axis. ONE-DIRECTIONAL — lesson-payoff imports patterns.js and
// nothing from here, so there is no cycle.
import {
  contextKeyFor,
  narrowBanditReport,
  payoffTermsFor,
  recordExposures,
  resolveBanditConfig,
  type BanditRecallReport,
} from './lesson-payoff.js';

/* ------------------------------------------------------------------ */
/*  Types (04_domain_model §3.4 / §4.1)                                */
/* ------------------------------------------------------------------ */

/** Which adapter sits behind the port. */
export type VectorEngineKind = 'agentdb' | 'rvf';

/** `memory.vector.engine` config modes (`.dz/config.json`). Absent/corrupt ⇒ `auto`. */
export type VectorEngineMode = 'auto' | 'agentdb' | 'rvf' | 'off';

/** One record on its way into the vector store (the ACL between dz records and engines). */
export interface VectorEntry {
  /** Join key back to the lexical store — the canonical `MemoryRecord.id` (`teach:…`/`dream:…`). */
  readonly dzId: string;
  /** The text that gets embedded (as `${taskType}: ${text}`) and stored. */
  readonly text: string;
  /** REAL reward signal in [0,1] — never a fabricated 1.0. */
  readonly score: number;
  /** ReasoningBank task_type: `dz-teach` for taught patterns, `dz-learning` for consolidate dreams. */
  readonly taskType: string;
  readonly tags?: readonly string[] | undefined;
  readonly metadata?: Record<string, unknown> | undefined;
  readonly uses?: number | undefined;
  readonly avgReward?: number | undefined;
}

/** One semantic search hit — a POINTER into the lexical store, never a pattern by itself. */
export interface VectorHit {
  readonly dzId: string;
  /** Cosine similarity (or engine-native score), higher = closer. */
  readonly similarity: number;
  readonly text?: string | undefined;
}

/** Honest outcome of a mirror attempt. Never thrown — always returned. */
export interface MirrorReceipt {
  /** Entries newly written to the vector store this call. */
  readonly mirrored: number;
  /** Entries skipped by the noise gate or the dzId dedup (already mirrored — I-5). */
  readonly skipped: number;
  /** Entries parked in `.dz/mirror-pending.json` for the next consolidate to heal (I-3). */
  readonly queued: number;
  readonly engine?: VectorEngineKind | undefined;
  readonly error?: string | undefined;
}

/** One precomputed vector to upsert by its content-addressed `dzId` (the `dz vector import` row). */
export interface ImportVectorRow {
  readonly dzId: string;
  readonly vector: Float32Array;
  readonly text: string;
  readonly taskType: string;
  readonly score: number;
  readonly metadata?: Record<string, unknown> | undefined;
}

/** The engine PORT — both adapters implement exactly this surface (04 §4.1). */
/**
 * Is this engine's `similarity` a real cosine, or only good enough to RANK by?
 *
 * `agentdb` computes a magnitude-normalised cosine over the stored vectors, so its number is
 * comparable and lives in the space the recall floors were calibrated in. The `rvf` adapter returns
 * `-distance` — unbounded, and the metric is not established — so its number may only order rows.
 * Printing it beside a 0.38 cosine floor would hand the reader a figure that looks calibrated and is
 * not; that is the one lie this feature must not tell (ADR, features/recall-true-closeness).
 */
export type SimilarityKind = 'cosine' | 'rank-only';

export interface VectorEngine {
  readonly kind: VectorEngineKind;
  /** Absent means `rank-only`: an engine must SAY its number is a cosine to have it shown as one. */
  readonly similarityKind?: SimilarityKind;
  upsert(entries: readonly VectorEntry[]): Promise<{ indexed: number; error?: string | undefined }>;
  search(query: string, limit: number): Promise<{ hits: VectorHit[]; error?: string | undefined }>;
  listIds(): Promise<{ ids: string[]; error?: string | undefined }>;
  /**
   * Ids of the PATTERN scope only — the task types `lexicalMirrorable` counts. Optional: an engine
   * that cannot narrow reports nothing and the caller degrades to `orphaned: undefined`, never to a
   * fabricated zero. Exists because `listIds()` deliberately enumerates the OWNED SUPERSET, which
   * also holds `dz-backlog` ideas — and reporting that number beside a pattern-only count once led a
   * reader to conclude half the index was orphaned when none of it was (ADR-001).
   */
  listPatternIds?(): Promise<{ ids: string[]; error?: string | undefined }>;
  /** Portable single-file checkpoint (RVF adapter only — `dz vector export`). */
  exportCheckpoint?(dest: string): Promise<{ error?: string | undefined }>;
  /**
   * Write precomputed `{ dzId, vector }` rows by id (`dz vector import`) — UPSERT-BY-dzId, never a
   * blind whole-store overwrite. Optional (like {@link VectorEngine.exportCheckpoint}): an engine
   * that cannot take a precomputed vector reports an honest reason; import degrades, never throws.
   */
  importVectors?(rows: readonly ImportVectorRow[]): Promise<{ imported: number; error?: string | undefined }>;
}

/** Outcome of {@link resolveVectorEngine}: an engine, or an honest reason why not. */
export interface ResolvedVectorEngine {
  readonly engine?: VectorEngine | undefined;
  readonly reason?: string | undefined;
}

/** Recall mode: `hybrid` (default), `semantic` (`--semantic`, 2× vector weight), `lexical` (`--no-semantic`). */
export type HybridRecallMode = 'hybrid' | 'semantic' | 'lexical';

/** One merged recall hit (RRF-scored). `pattern` ALWAYS comes from the lexical store (V-1). */
export interface HybridHit {
  readonly pattern: PatternRecord;
  readonly backend: RecallHit['backend'];
  /** Reciprocal-rank-fusion score (ranking only — NOT the pattern's reward). */
  readonly score: number;
  /** lesson-quarantine: set only for a quarantined hit — display marks ⚠q, ranking was damped. */
  readonly quarantined?: boolean;
  /** Form provenance from the lexical pair merge; semantic ranking never invents it. */
  readonly matchedForm?: NonNullable<RecallHit['matchedForm']>;
  /**
   * Raw closeness from the semantic leg, when the engine reports a genuine cosine. ABSENT for a
   * lexical-only hit and for an engine whose score is not a cosine — the honest display there is a
   * dash, never a substitute number. On a `both` hit this is the SEMANTIC leg's cosine, which
   * explains less of the ordering than it may appear to: the list is ranked by RRF plus learning
   * signals, not by this.
   */
  readonly similarity?: number;
}

/** Outcome of {@link recallHybrid}. With no engine this is content-identical to `recallPatterns`. */
export interface HybridRecall {
  readonly hits: HybridHit[];
  readonly lexicalBackend: 'sqlite' | 'json';
  readonly vectorEngine: VectorEngineKind | 'none';
  /** Why the vector tier did not participate (engine absent / disabled). */
  readonly vectorReason?: string | undefined;
  /** Engine was present but the search failed/timed out — lexical results returned instead. */
  readonly vectorError?: string | undefined;
  /**
   * How many candidates the engine RETURNED for this query. Zero on every lexical-only path.
   *
   * This and `semanticRanked` exist so the OUTPUT can state what the run did instead of what the
   * config allows. Every false claim this feature removed came from deriving a statement about the
   * run from `vectorEngine !== 'none'`, which is engine RESOLVABILITY (ADR-001).
   */
  readonly semanticCandidates: number;
  /**
   * How many of those candidates survived the orphan drop and entered the merge — the honest test of
   * "did a vector rank anything". It can be 0 while `semanticCandidates` is positive: an engine that
   * returns only ids the lexical store no longer has has participated in nothing.
   */
  readonly semanticRanked: number;
  /**
   * The bandit payoff explanation (feature lesson-bandit-rerank, FR-8/AC-11) — PRESENT only when
   * `memory.learning.banditRerank` is armed, ABSENT otherwise (not `null`, not `{}`): its mere
   * presence tells a reader the feature ran. `armsConsidered` describes the POST-cut list, and
   * `moved` — the honest headline — counts the candidates whose position the term actually changed.
   * An armed, silent re-ranker is indistinguishable from a broken one, which is why this exists.
   */
  readonly bandit?: BanditRecallReport | undefined;
  /** Present ONLY when `deferExposures` was requested and the bandit ran. Call it with the ids the
   * caller actually printed; until it is called, no exposure has been recorded for this recall. */
  readonly commitExposures?: ((shownDzIds: readonly string[]) => void) | undefined;
}


/**
 * How many of `mirrorable` are absent from the mirror, given the set of ids the mirror and the
 * pending queue account for.
 *
 * A record counts as mirrored under EITHER key, because there are two write seams and they do NOT
 * agree: `patternVectorEntry` (teach) writes the CONTENT-addressed `patternRecordId`, while
 * `memoryRecordVectorEntry` (backfill/dream) writes the record's own `r.id`. MEASURED on the real
 * store (2026-08-22): 270 of 272 records have the same value for both, and the 2 that differ — a
 * `dream:` record and one re-keyed teach record — are mirrored under their OWN id. Joining on the
 * derived key alone reported them as an unpaid debt and advised a reindex with nothing to do.
 *
 * Pure and exported so the divergent case is testable without a store: a `dream:`-prefixed id can
 * never equal `patternRecordId`, which always yields `teach:<hash>`.
 */
export function countUnmirrored(mirrorable: readonly MemoryRecord[], accounted: ReadonlySet<string>): number {
  return mirrorable.filter((r) => !accounted.has(r.id) && !accounted.has(patternRecordId(recordToPattern(r)))).length;
}

/** Field observability for `dz vector status` (I-2/I-5 in the field). */
export interface VectorTierStatus {
  readonly mode: VectorEngineMode;
  readonly kind?: VectorEngineKind | undefined;
  readonly available: boolean;
  readonly reason?: string | undefined;
  readonly embeddingModel?: string | undefined;
  readonly lexicalTotal: number;
  readonly lexicalMirrorable: number;
  /**
   * How many MIRRORABLE RECORDS are in the vector store, counted in the same scope
   * `lexicalMirrorable` counts — so the two may be read as a pair.
   *
   * `undefined` when the engine cannot report per-scope counts: under the narrower meaning this
   * field now carries, the unnarrowed store total is NOT an answer to the question it asks.
   */
  readonly mirrored?: number | undefined;
  readonly pending: number;
  /**
   * Whether the mirror WRITER is enabled — `vectorMirrorEnabled()`'s own answer, reported separately
   * from `available`, which is about the ENGINE. Conflating the two is what let an unconfigured
   * project print a fully-healthy status line over a dead writer (ADR-001).
   */
  readonly mirrorWriterEnabled: boolean;
  /** WHY it is on or off — so the surface printing it cannot invent a cause (see mirrorWriterReason). */
  readonly mirrorWriterState: MirrorWriterState;
  /**
   * Vectors of OTHER dz-owned task types (today: `dz-backlog`). Reported separately so a store of N
   * vectors can be fully accounted for, and never folded into `mirrored`, which must stay comparable
   * to `lexicalMirrorable`. `undefined` when the engine cannot narrow its listing.
   */
  readonly mirroredOther?: number | undefined;
  /**
   * Pattern-scope vectors matching NO record under either key — the real meaning of "orphan", and
   * until this feature nothing computed it. `undefined` when the engine cannot narrow its listing.
   */
  readonly orphaned?: number | undefined;
  /**
   * Mirrorable records present in NEITHER the mirror NOR the pending queue — an exact set difference
   * over ids, so an orphan vector can never make it negative.
   *
   * The name is deliberately `unmirrored`, not `unqueued`: the difference proves only that a record
   * is not in the mirror NOW. A vector that was written and later deleted, or a pending entry that
   * was cleared, is indistinguishable from one never offered — so claiming "never queued" would
   * overstate what was measured (raised by cross-family review, 2026-08-22).
   *
   * `undefined` means UNKNOWN — no engine, or an engine whose `listIds()` failed. It never means zero.
   */
  readonly unmirrored?: number | undefined;
}

/** Wall-time bound applied to EVERY engine call, read and write legs alike (ADR R1 + NC1). */
export const DEFAULT_VECTOR_TIMEOUT_MS = 10_000;

/** Default cosine cutoff for near-duplicate clustering (`--threshold` / config overrides). */
export const DEFAULT_HARMONIZE_THRESHOLD = 0.92;
export const REINFORCE_RRF_CAP = (1 / (60 + 1)) - (1 / (60 + 4));
/**
 * The bandit payoff term's bound (ADR-001 D-2). Deliberately the SAME constant the reinforcement and
 * SAFLA-delta terms use, not a new one: it keeps the "a learning signal is worth less than one RRF
 * rank step" invariant those terms already established, and makes the joint excursion of two payoff
 * terms auditable as exactly `2 × CAP`. Payoff reorders near-ties; it cannot overturn a real
 * relevance gap.
 */
export const BANDIT_RRF_CAP = REINFORCE_RRF_CAP;

/* ------------------------------------------------------------------ */
/*  Harmonize + import types (dz-vector-harmonize-import 05 §2.1/§2.2)  */
/* ------------------------------------------------------------------ */

/** One record in the harmonize pool — a lexical-store record mapped to its dzId + reward + ts. */
export interface HarmonizeItem {
  readonly dzId: string;
  readonly text: string;
  readonly reward: number;
  readonly ts: string;
  readonly taskType: string;
}

/** One near-duplicate cluster: the surviving keeper + the members that would be / were dropped. */
export interface HarmonizeCluster {
  readonly keep: { readonly dzId: string; readonly text: string; readonly reward: number; readonly ts: string };
  readonly drops: readonly { readonly dzId: string; readonly text: string; readonly reward: number; readonly cos: number }[];
}

/** Outcome of {@link harmonizeVectorStore}. */
export interface HarmonizeReport {
  readonly mode: 'dry-run' | 'apply';
  /** Resolved engine kind, or `'none'` when there is no engine. */
  readonly engine: string;
  /** True when semantic dedup was unavailable and the store was harmonized by EXACT text only. */
  readonly fellBackToExact: boolean;
  readonly threshold: number;
  readonly clusters: readonly HarmonizeCluster[];
  /** Number of clusters (size ≥ 2) — one keeper survives per cluster. */
  readonly kept: number;
  /** Total non-keeper members (previewed in dry-run, removed on `--apply`). */
  readonly dropped: number;
  /** Singleton (non-duplicate) patterns — NEVER touched. */
  readonly unique: number;
  /** Backup path written before an `--apply` drop (restorable via `dz teach --from-json`). */
  readonly backupPath?: string | undefined;
  /** Honest reason on failure (e.g. a backup write failed and the drop was aborted). */
  readonly error?: string | undefined;
}

/** Options for {@link harmonizeVectorStore}. */
export interface HarmonizeOptions extends VectorServiceOptions {
  /** Perform the drop (default `false` — dry-run previews and writes nothing). */
  readonly apply?: boolean | undefined;
  /** Cosine cutoff in `(0, 1]`; overrides config + the {@link DEFAULT_HARMONIZE_THRESHOLD} default. */
  readonly threshold?: number | undefined;
  /**
   * Inject an embedder (tests): a function ⇒ semantic path with these embeddings; `null` ⇒ force the
   * exact-text fallback; `undefined` ⇒ resolve the project's agentdb embedder.
   */
  readonly embed?: ((text: string) => Promise<Float32Array>) | null | undefined;
}

/** Outcome of {@link importRvfCheckpoint}. */
export interface ImportReport {
  /** Vectors upserted by dzId (new + replaced). */
  readonly imported: number;
  /** Source dzIds skipped because no local pattern exists (text must be imported first). */
  readonly skippedOrphans: number;
  /** Resolved target engine kind, or `'none'`. */
  readonly engine: string;
  /** The source `.rvf` path. */
  readonly source: string;
  readonly error?: string | undefined;
}

/** Options for {@link importRvfCheckpoint}. */
export interface ImportOptions extends VectorServiceOptions {
  /** Inject the source `{ dzId, vector }` rows (tests) — bypasses the `.rvf`/idmap file reads. */
  readonly sourceRows?: readonly { readonly dzId: string; readonly vector: Float32Array }[] | undefined;
  /** Inject an embedder (tests) for the local-text re-embed; else the project's agentdb embedder. */
  readonly embed?: ((text: string) => Promise<Float32Array>) | undefined;
}

export interface ReindexVectorReport {
  readonly reembedded: number;
  readonly model?: string;
  readonly version?: number;
  readonly backupPath?: string;
  readonly error?: string;
  /**
   * Task types this reindex does NOT own, whose vectors therefore remain in the previous embedding
   * space (e.g. `book-knowledge`, rebuilt by `dz brain reindex`). Safe — every read path filters by
   * task type, so no query compares across spaces — but the caller must SAY SO rather than leave it
   * silent, since a mixed store looks healthy right up until someone widens a query.
   */
  readonly staleTaskTypes?: readonly string[];
  /**
   * smart-backlog honest-skip status. Set ONLY on the non-agentdb-engine path: backlog code never touches
   * the shared manifest, so under a non-agentdb engine NOTHING is reindexed — `backlog:'skipped'` +
   * `generic:'skipped'` + a non-empty `error` say so (overall success is never claimed). Unset on the full
   * agentdb reindex path (which owns and re-embeds dz-backlog together with the other types) — behavior for
   * every other caller is unchanged.
   */
  readonly backlog?: 'skipped';
  readonly generic?: 'skipped';
}

export type TeachGuardResult =
  | { readonly action: 'teach'; readonly reason?: string }
  | { readonly action: 'reinforce'; readonly dzId: string; readonly cosine: number };

/* ------------------------------------------------------------------ */
/*  Timeout wrapper (both legs — NC1/QR-1)                             */
/* ------------------------------------------------------------------ */

/**
 * Bound `promise` to `ms` wall-clock milliseconds. On timeout, resolve with `onTimeout()`
 * instead — the underlying operation keeps running detached (its eventual write is later
 * deduplicated by dzId), but the CALLER's latency is bounded. A rejection also resolves via
 * `onTimeout()` (honest-error contract: this wrapper never throws). The timer is cleared /
 * unref'd so a fast path never keeps the process alive.
 */
export async function withVectorTimeout<T>(promise: Promise<T>, ms: number, onTimeout: () => T): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise.catch(() => onTimeout()),
      new Promise<T>((resolvePromise) => {
        timer = setTimeout(() => resolvePromise(onTimeout()), ms);
        timer.unref?.();
      }),
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

/**
 * Invoke an engine call so that BOTH a synchronous throw and an async rejection surface as an
 * honest `onError(message)` value (never as the timeout fallback — a throw and a timeout are
 * different diagnoses in the field). Pairs with {@link withVectorTimeout} at every call site.
 */
function safeEngineCall<T>(fn: () => Promise<T>, onError: (message: string) => T): Promise<T> {
  const msg = (err: unknown): string => (err instanceof Error ? err.message : String(err));
  try {
    return fn().then((v) => v, (err: unknown) => onError(msg(err)));
  } catch (err) {
    return Promise.resolve(onError(msg(err)));
  }
}

/* ------------------------------------------------------------------ */
/*  Noise gate + ACL mappers (I-6, V-3)                                */
/* ------------------------------------------------------------------ */

const TOOL_TELEMETRY_RE = /^Tool \S+ invoked during session$/;

/** Text that must never be embedded: bare-approval echoes + tool telemetry (V-3 / ADR-002). */
export function isVectorNoise(text: string): boolean {
  return isNoiseInsight(text) || TOOL_TELEMETRY_RE.test(text);
}

/**
 * ACL: taught {@link PatternRecord} → {@link VectorEntry}. Returns `undefined` for noise (the
 * ingest gate — I-6). Score is the record's REAL reward, never a fabricated 1.0.
 */
export function patternVectorEntry(p: PatternRecord, source = 'dz-teach', opts: { quarantined?: boolean } = {}): VectorEntry | undefined {
  if (p.lessonForm === 'class' || isVectorNoise(p.pattern)) return undefined;
  const dzId = patternRecordId(p);
  return {
    dzId,
    text: p.pattern,
    score: p.reward,
    taskType: 'dz-teach',
    tags: ['dz-teach', p.type],
    // FR-8: quarantine rides into the mirror so the HOOK DAEMON (which reads only the mirror's
    // sqlite metadata) can exclude unproven lessons from auto-injection.
    metadata: {
      dzId, source, ts: p.ts, domain: p.domain,
      ...(p.lessonForm !== undefined && p.lessonPairId !== undefined
        ? { lessonForm: p.lessonForm, lessonPairId: p.lessonPairId }
        : {}),
      ...(opts.quarantined === true ? { qStatus: 'quarantined' } : {}),
    },
  };
}

/**
 * ACL: harvested {@link DreamPattern} → {@link VectorEntry}. Byte-compatible with the
 * pre-feature consolidate mirror rows (same task_type `dz-learning`, same tags, `dreamId`
 * preserved in metadata — NFR-7); `dzId` is additive.
 */
export function dreamVectorEntry(d: DreamPattern): VectorEntry | undefined {
  if (isVectorNoise(d.insight)) return undefined;
  const dzId = dreamRecordId(d);
  return {
    dzId,
    text: d.insight,
    score: d.score,
    taskType: 'dz-learning',
    tags: ['dz-consolidate', d.outcome],
    metadata: { source: 'dz-consolidate', skillId: d.skillId, sessionFile: d.sessionFile, ts: d.timestamp, dreamId: dzId, dzId },
  };
}

/** ACL: stored {@link MemoryRecord} → {@link VectorEntry} (the consolidate-backfill mapper). */
export function memoryRecordVectorEntry(r: MemoryRecord): VectorEntry | undefined {
  if (r.metadata?.['lessonForm'] === 'class' || isVectorNoise(r.text)) return undefined;
  const state = readReinforcementState(r);
  return {
    dzId: r.id,
    text: r.text,
    score: r.score,
    taskType: r.id.startsWith('dream:') ? 'dz-learning' : 'dz-teach',
    tags: ['dz-backfill', r.outcome],
    metadata: {
      dzId: r.id, source: r.metadata?.['source'] ?? 'dz-backfill', ts: r.timestamp, skillId: r.skillId,
      ...(r.metadata?.['lessonForm'] === 'specific' && typeof r.metadata?.['lessonPairId'] === 'string'
        ? { lessonForm: 'specific', lessonPairId: r.metadata['lessonPairId'] }
        : {}),
    },
    uses: state.uses,
    avgReward: state.avgReward,
  };
}

/* ------------------------------------------------------------------ */
/*  Config + engine resolution cascade (05 §2.1)                       */
/* ------------------------------------------------------------------ */

/** Read `memory.vector.engine` from `.dz/config.json`. Absent/corrupt ⇒ `auto` (never throws). */
export function readVectorEngineMode(projectRoot: string): VectorEngineMode {
  try {
    const cfg = JSON.parse(readFileSync(join(projectRoot, '.dz', 'config.json'), 'utf-8')) as {
      memory?: { vector?: { engine?: string } };
    };
    const mode = cfg.memory?.vector?.engine;
    return mode === 'off' || mode === 'agentdb' || mode === 'rvf' || mode === 'auto' ? mode : 'auto';
  } catch {
    return 'auto';
  }
}

/**
 * Read `memory.vector.harmonizeThreshold` from `.dz/config.json`. Absent/corrupt/out-of-range ⇒
 * {@link DEFAULT_HARMONIZE_THRESHOLD} (never throws). `--threshold` overrides this at the call site.
 */
export function readHarmonizeThreshold(projectRoot: string): number {
  try {
    const cfg = JSON.parse(readFileSync(join(projectRoot, '.dz', 'config.json'), 'utf-8')) as {
      memory?: { vector?: { harmonizeThreshold?: unknown } };
    };
    const t = cfg.memory?.vector?.harmonizeThreshold;
    return typeof t === 'number' && t > 0 && t <= 1 ? t : DEFAULT_HARMONIZE_THRESHOLD;
  } catch {
    return DEFAULT_HARMONIZE_THRESHOLD;
  }
}

/**
 * Should `dz teach` attempt the best-effort vector mirror at all? True when the project opted
 * into the agentdb memory backend (`memory.backend === 'agentdb'`, the same gate consolidate
 * uses — D3) or explicitly configured a vector engine. A fresh, unconfigured project returns
 * `false`, so its `dz teach` output stays byte-identical to the pre-feature baseline (AC-1).
 */
export function vectorMirrorEnabled(projectRoot: string): boolean {
  return mirrorWriterReason(projectRoot).enabled;
}

/** Why the mirror writer is on or off — a CLOSED set, so a caller cannot invent a cause. */
export type MirrorWriterState =
  | 'on'
  /** No `.dz/config.json` at all — an unconfigured project, which is the normal quiet case. */
  | 'no-config'
  /** The config exists but could not be read or parsed. */
  | 'config-unreadable'
  /** The config is readable and simply does not enable a mirror. */
  | 'not-enabled'
  /** The config explicitly turns the vector tier off. */
  | 'engine-off';

/**
 * The mirror writer's state AND its real cause.
 *
 * Every failure used to collapse into `false`, and the one message printed above it named ONE
 * specific cause: "no memory.backend=agentdb". MEASURED 2026-08-24 with a config that sets
 * `memory.vector.engine: "off"` — the status line correctly said OFF and then blamed a setting the
 * config did not mention. A diagnosis that names the wrong cause sends the reader to fix something
 * that is not broken, which is worse than saying nothing.
 */
export function mirrorWriterReason(projectRoot: string): { enabled: boolean; state: MirrorWriterState } {
  const path = join(projectRoot, '.dz', 'config.json');
  if (!existsSync(path)) return { enabled: false, state: 'no-config' };
  let cfg: { memory?: { backend?: string; vector?: { engine?: string } } };
  try {
    cfg = JSON.parse(readFileSync(path, 'utf-8')) as typeof cfg;
  } catch {
    return { enabled: false, state: 'config-unreadable' };
  }
  const engine = cfg.memory?.vector?.engine;
  // An explicit `off` WINS over `memory.backend`, because that is what the engine resolution itself
  // does. With `{"memory":{"backend":"agentdb","vector":{"engine":"off"}}}` the same status output
  // printed `Engine: none — vector tier disabled` and `Mirror writer: ON` one line apart
  // (cross-family review, codex `gpt-5.6-sol`, 2026-08-24). A report that contradicts itself inside
  // one screen is worse than either half alone, and the half that was wrong is this one: nothing can
  // queue to a tier that is off.
  if (engine === 'off') return { enabled: false, state: 'engine-off' };
  if (cfg.memory?.backend === 'agentdb') return { enabled: true, state: 'on' };
  if (engine === 'agentdb' || engine === 'rvf') return { enabled: true, state: 'on' };
  return { enabled: false, state: 'not-enabled' };
}

/** The sentence a reader can act on, for each state. */
export function mirrorWriterExplanation(state: MirrorWriterState): string {
  switch (state) {
    case 'on': return 'teach is queueing to the mirror';
    // "has never configured" is a claim about HISTORY from an observation about the PRESENT: the
    // file may be tracked in git and merely deleted from the working tree (cross-family review,
    // codex gpt-5.6-sol, 2026-08-24). Absence proves only absence.
    case 'no-config': return 'no .dz/config.json here — memory is not configured in this working tree, and nothing is queueing';
    case 'config-unreadable': return '.dz/config.json exists but could not be read or parsed — fix the file, not the settings';
    case 'engine-off': return '.dz/config.json sets memory.vector.engine = "off" — the tier is deliberately disabled';
    case 'not-enabled': return '.dz/config.json enables no mirror (needs memory.backend=agentdb, or memory.vector.engine=agentdb|rvf) — teach is NOT queueing';
  }
}

/**
 * Engine selection cascade: config mode → project-local package gate → native usability probe
 * → adapter or an honest reason. A lexical-only project still pays nothing because
 * {@link isPackageInstalled} gates the probe; a project with the dependency installed pays one
 * require + one in-memory open per process (measured: agentdb 53.6 ms, better-sqlite3 8.6 ms,
 * 62.2 ms total, versus about 0.008 ms for the old existsSync-only check).
 * Never throws. `auto` prefers agentdb (it reads the vectors consolidate already wrote),
 * falling through to rvf.
 */
/**
 * Is `pkgName` installed for this PROJECT? A pure filesystem probe: walk `node_modules` up the
 * directory tree from `projectRoot` (the npm resolution chain) — deliberately NOT
 * `require.resolve`, which also consults process-global paths (`NODE_PATH`/global folders) and
 * would make a lexical-only project's engine availability depend on the HOST process instead
 * of the project (the I-1 determinism leak). No module is loaded (NFR-5).
 */
function isPackageInstalled(projectRoot: string, pkgName: string): boolean {
  let dir = projectRoot;
  for (;;) {
    if (existsSync(join(dir, 'node_modules', pkgName, 'package.json'))) return true;
    const parent = dirname(dir);
    if (parent === dir) return false;
    dir = parent;
  }
}

export function resolveVectorEngine(projectRoot: string): ResolvedVectorEngine {
  const mode = readVectorEngineMode(projectRoot);
  if (mode === 'off') return { reason: 'vector tier disabled (memory.vector.engine = "off")' };
  let autoAgentdbFailure: string | undefined;
  const probeIfInstalled = (id: string): NativeDepVerdict =>
    isPackageInstalled(projectRoot, id)
      ? id === 'better-sqlite3'
        ? probeNativeDep(projectRoot, id, exerciseSqliteOpen)
        : probeNativeDep(projectRoot, id)
      : { state: 'absent', pkg: id };
  if (mode === 'agentdb' || mode === 'auto') {
    const agentdb = probeIfInstalled('agentdb');
    if (agentdb.state === 'unusable') {
      const reason = describeNativeDep(agentdb);
      if (mode === 'agentdb') return { reason };
      autoAgentdbFailure = reason;
    }
    const sqlite = agentdb.state === 'usable' ? probeIfInstalled('better-sqlite3') : undefined;
    if (sqlite?.state === 'unusable') return { reason: describeNativeDep(sqlite) };
    if (agentdb.state === 'usable' && sqlite?.state === 'usable') {
      return { engine: agentdbVectorEngine(projectRoot) };
    }
    if (mode === 'agentdb') {
      return { reason: 'agentdb/better-sqlite3 not installed in project (run: dz setup --memory agentdb)' };
    }
  }
  if (mode === 'rvf' || mode === 'auto') {
    const rvf = probeIfInstalled('@ruvector/rvf');
    if (rvf.state === 'unusable') {
      const reason = describeNativeDep(rvf);
      return { reason: autoAgentdbFailure === undefined ? reason : `${autoAgentdbFailure}; ${reason}` };
    }
    if (rvf.state === 'usable') return { engine: rvfVectorEngine(projectRoot) };
    if (mode === 'rvf') {
      return { reason: '@ruvector/rvf not installed in project (npm i @ruvector/rvf) — vector tier inactive' };
    }
  }
  if (autoAgentdbFailure !== undefined) {
    return { reason: `${autoAgentdbFailure}; @ruvector/rvf not installed in project (npm i @ruvector/rvf) — vector tier inactive` };
  }
  return { reason: 'no vector engine available: agentdb/better-sqlite3 not installed in project (run: dz setup --memory agentdb)' };
}

/* ------------------------------------------------------------------ */
/*  Pending-mirror queue (generalized — one file for every source)     */
/* ------------------------------------------------------------------ */

/** Queue entry: a {@link VectorEntry} plus a legacy-compatible `insight` alias of `text`. */
type PendingEntry = VectorEntry & { readonly insight: string };

function pendingPath(projectRoot: string): string {
  return join(projectRoot, '.dz', 'mirror-pending.json');
}

function toPending(e: VectorEntry): PendingEntry {
  return { ...e, insight: e.text };
}

/** Legacy queue rows (pre-port `DreamPattern[]`) are converted on read — nothing is lost. */
function readVectorPending(projectRoot: string): PendingEntry[] {
  try {
    const arr = JSON.parse(readFileSync(pendingPath(projectRoot), 'utf-8')) as unknown[];
    if (!Array.isArray(arr)) return [];
    const out: PendingEntry[] = [];
    for (const item of arr) {
      if (typeof item !== 'object' || item === null) continue;
      const rec = item as Record<string, unknown>;
      if (typeof rec['dzId'] === 'string' && typeof rec['text'] === 'string') {
        out.push(toPending(rec as unknown as VectorEntry));
      } else if (typeof rec['insight'] === 'string' && typeof rec['timestamp'] === 'string') {
        const entry = dreamVectorEntry(rec as unknown as DreamPattern);
        if (entry !== undefined) out.push(toPending(entry));
      }
    }
    return out;
  } catch {
    return [];
  }
}

function writeVectorPending(projectRoot: string, entries: readonly PendingEntry[]): void {
  try {
    if (entries.length === 0) {
      if (existsSync(pendingPath(projectRoot))) rmSync(pendingPath(projectRoot));
    } else {
      const path = pendingPath(projectRoot);
      mkdirSync(dirname(path), { recursive: true });
      // Atomic write: a concurrent teach/consolidate must never observe a torn file. Write to a
      // temp sibling then rename() (atomic on POSIX). Recovery guarantee: even if a racing writer
      // clobbers the queue, backfillVectorMirror re-derives the missing set from the lexical store,
      // so a dropped entry is recovered on the next consolidate — no permanent loss.
      const tmp = `${path}.tmp`;
      writeFileSync(tmp, JSON.stringify(entries, null, 2));
      renameSync(tmp, path);
    }
  } catch { /* best-effort */ }
}

/** Honest failure note next to the session telemetry (the detached SessionEnd path is silent). */
function logMirrorNote(projectRoot: string, error: string, pending: number): void {
  try {
    appendFileSync(
      join(projectRoot, '.dz', 'sessions.jsonl'),
      JSON.stringify({ event: 'mirror', ts: new Date().toISOString(), error, pending }) + '\n',
    );
  } catch { /* best-effort */ }
}

/* ------------------------------------------------------------------ */
/*  VectorMirrorService — the ONE write seam (QR-6)                    */
/* ------------------------------------------------------------------ */

/** Options shared by the mirror/recall services. `engine: null` force-disables (tests). */
export interface VectorServiceOptions {
  readonly engine?: VectorEngine | null | undefined;
  readonly timeoutMs?: number | undefined;
}

function pickEngine(projectRoot: string, opts: VectorServiceOptions): ResolvedVectorEngine {
  if (opts.engine === null) return { reason: 'vector engine disabled (injected)' };
  if (opts.engine !== undefined) return { engine: opts.engine };
  return resolveVectorEngine(projectRoot);
}

/**
 * Mirror prepared {@link VectorEntry}s into the vector store — **the single write seam** that
 * teach, `teach --from-json`, consolidate, and the backfill all route through (QR-6). The
 * lexical write is ALWAYS already durable before this runs (I-3). Semantics:
 *
 * 1. noise-gate the entries (I-6), merge with the pending queue (dedup by dzId),
 * 2. nothing to do ⇒ `{mirrored:0}` with NO error and no queue file,
 * 3. engine absent ⇒ park the batch in the queue + honest reason (heals on the next consolidate),
 * 4. dedup against `engine.listIds()` (I-5 idempotency — a re-mirror adds 0 rows),
 * 5. time-bounded `engine.upsert` (NC1); failure/timeout ⇒ queue + `sessions.jsonl` note.
 *
 * NEVER throws; the caller's exit code is unaffected by any outcome here (I-1).
 */
export async function mirrorEntriesToVector(
  projectRoot: string,
  entries: readonly VectorEntry[],
  opts: VectorServiceOptions = {},
): Promise<MirrorReceipt> {
  try {
    let skipped = 0;
    const gated: VectorEntry[] = [];
    for (const e of entries) {
      if (isVectorNoise(e.text)) skipped += 1;
      else gated.push(e);
    }
    const byId = new Map<string, PendingEntry>();
    for (const e of [...readVectorPending(projectRoot), ...gated.map(toPending)]) {
      if (!byId.has(e.dzId)) byId.set(e.dzId, e);
    }
    const batch = [...byId.values()];
    if (batch.length === 0) return { mirrored: 0, skipped, queued: 0 };

    const resolved = pickEngine(projectRoot, opts);
    if (resolved.engine === undefined) {
      writeVectorPending(projectRoot, batch);
      const error = resolved.reason ?? 'no vector engine available';
      logMirrorNote(projectRoot, error, batch.length);
      return { mirrored: 0, skipped, queued: batch.length, error };
    }
    const engine = resolved.engine;
    const timeoutMs = opts.timeoutMs ?? DEFAULT_VECTOR_TIMEOUT_MS;

    // I-5 idempotency: skip what the store already holds (best-effort, time-bounded).
    let toSend: PendingEntry[] = batch;
    const listed = await withVectorTimeout(
      safeEngineCall(() => engine.listIds(), (m) => ({ ids: [] as string[], error: `vector listIds failed: ${m}` })),
      timeoutMs,
      () => ({ ids: [] as string[], error: 'vector listIds timed out' }),
    );
    if (listed.error === undefined) {
      const have = new Set(listed.ids);
      const before = toSend.length;
      toSend = toSend.filter((e) => !have.has(e.dzId));
      skipped += before - toSend.length;
    }
    if (toSend.length === 0) {
      writeVectorPending(projectRoot, []);
      return { mirrored: 0, skipped, queued: 0, engine: engine.kind };
    }

    const up = await withVectorTimeout(
      safeEngineCall(
        () => engine.upsert(toSend.map(({ insight: _insight, ...entry }) => entry)),
        (m) => ({ indexed: 0, error: `vector mirror failed: ${m}` }),
      ),
      timeoutMs,
      () => ({ indexed: 0, error: `vector mirror timed out after ${timeoutMs}ms (batch queued for the next consolidate)` }),
    );
    if (up.error !== undefined) {
      writeVectorPending(projectRoot, toSend);
      logMirrorNote(projectRoot, up.error, toSend.length);
      return { mirrored: up.indexed, skipped, queued: toSend.length, engine: engine.kind, error: up.error };
    }
    writeVectorPending(projectRoot, []);
    return { mirrored: up.indexed, skipped, queued: 0, engine: engine.kind };
  } catch (err) {
    // Belt-and-braces: the mirror must NEVER take the caller down (I-1/I-3).
    return { mirrored: 0, skipped: 0, queued: 0, error: `mirror failed: ${err instanceof Error ? err.message : String(err)}` };
  }
}

/** Convenience seam for taught patterns: ACL-map + delegate to {@link mirrorEntriesToVector}. */
export async function mirrorPatternsToVector(
  projectRoot: string,
  patterns: readonly PatternRecord[],
  source = 'dz-teach',
  opts: VectorServiceOptions = {},
): Promise<MirrorReceipt> {
  const entries: VectorEntry[] = [];
  let gatedOut = 0;
  for (const p of patterns) {
    const e = patternVectorEntry(p, source);
    if (e !== undefined) entries.push(e);
    else gatedOut += 1; // noise never maps (I-6) — reported honestly as skipped
  }
  const receipt = await mirrorEntriesToVector(projectRoot, entries, opts);
  return gatedOut === 0 ? receipt : { ...receipt, skipped: receipt.skipped + gatedOut };
}

/**
 * Eventual consistency (FR-2): diff `lexical dzIds ∖ engine.listIds()` and mirror the missing
 * set (bounded batch) + drain the pending queue. Run by `dz consolidate` after the watermark
 * write, so a teach-time mirror failure heals on the next consolidate (AC-3). Engine absent ⇒
 * silent no-op (the absent tier is a state, not an error).
 */
export async function backfillVectorMirror(
  projectRoot: string,
  opts: VectorServiceOptions & { readonly batchLimit?: number | undefined } = {},
): Promise<MirrorReceipt> {
  try {
    const resolved = pickEngine(projectRoot, opts);
    if (resolved.engine === undefined) {
      return { mirrored: 0, skipped: 0, queued: readVectorPending(projectRoot).length };
    }
    const engine = resolved.engine;
    const timeoutMs = opts.timeoutMs ?? DEFAULT_VECTOR_TIMEOUT_MS;
    const listed = await withVectorTimeout(
      safeEngineCall(() => engine.listIds(), (m) => ({ ids: [] as string[], error: `vector listIds failed: ${m}` })),
      timeoutMs,
      () => ({ ids: [] as string[], error: 'vector listIds timed out' }),
    );
    if (listed.error !== undefined) {
      return { mirrored: 0, skipped: 0, queued: readVectorPending(projectRoot).length, engine: engine.kind, error: listed.error };
    }
    const have = new Set(listed.ids);
    const limit = opts.batchLimit ?? 200;
    const missing: VectorEntry[] = [];
    for (const r of loadStoreRecords(projectRoot)) {
      if (have.has(r.id)) continue;
      const e = memoryRecordVectorEntry(r);
      if (e === undefined) continue;
      missing.push(e);
      if (missing.length >= limit) break;
    }
    // The seam drains the pending queue too (it merges + dedups internally).
    return mirrorEntriesToVector(projectRoot, missing, { engine, ...(opts.timeoutMs !== undefined ? { timeoutMs: opts.timeoutMs } : {}) });
  } catch (err) {
    return { mirrored: 0, skipped: 0, queued: 0, error: `backfill failed: ${err instanceof Error ? err.message : String(err)}` };
  }
}

/* ------------------------------------------------------------------ */
/*  HybridRecallService — the read seam (05 §2.3)                      */
/* ------------------------------------------------------------------ */

/** One ranked pattern feeding the RRF merge (exported so the merge is unit-testable pure). */
export interface RankedPattern {
  readonly id: string;
  readonly pattern: PatternRecord;
  readonly backend: RecallHit['backend'];
  readonly matchedForm?: NonNullable<RecallHit['matchedForm']>;
  /**
   * The semantic leg's raw closeness, when the engine reports a real cosine. Rides ALONGSIDE the RRF
   * score and never enters the ranking maths — four things depend on RRF magnitude (the reinforce
   * cap, quarantine damping, the learning uplift, and an ADR-level note in backlog.ts), so this is a
   * sibling field, never a repurposing.
   */
  readonly similarity?: number;
}

const RRF_K = 60;

/**
 * Reciprocal Rank Fusion merge: `score(p) = Σ 1/(60 + rank)` over the lists containing `p`
 * (semantic ranks weighted by `semanticWeight`). Dedup by id; `backend: 'both'` when a pattern
 *
 * Ordering: fused score, then EVIDENCE (`both` before lexical-only before semantic-only), then id.
 * When `semanticWeight > 1` the lexical top-1 is guaranteed a place in the result, taken from the
 * last seat unless that seat holds a `both` hit. See `features/semantic-keeps-exact-hits`.
 *
 * appears in both lists. DETERMINISTIC (AC-6): ties break on id, so fixed inputs always yield
 * the same ordering. Pure — no I/O.
 */
export function mergeHybridHits(
  lexical: readonly RankedPattern[],
  semantic: readonly RankedPattern[],
  opts: { readonly limit: number; readonly semanticWeight?: number | undefined },
): HybridHit[] {
  const weight = opts.semanticWeight ?? 1;
  interface Acc { pattern: PatternRecord; lex?: RecallHit['backend']; sem: boolean; score: number; similarity?: number; matchedForm?: NonNullable<RecallHit['matchedForm']> }
  const acc = new Map<string, Acc>();
  lexical.forEach((h, rank) => {
    const cur = acc.get(h.id) ?? { pattern: h.pattern, sem: false, score: 0 };
    cur.lex = h.backend;
    if (h.matchedForm !== undefined) cur.matchedForm = h.matchedForm;
    cur.score += 1 / (RRF_K + rank + 1);
    acc.set(h.id, cur);
  });
  semantic.forEach((h, rank) => {
    const cur = acc.get(h.id) ?? { pattern: h.pattern, sem: false, score: 0 };
    cur.sem = true;
    cur.score += weight / (RRF_K + rank + 1);
    // The cosine rides along untouched by the ranking maths. On a hit both legs found, this is the
    // SEMANTIC leg's number — stated in the field's own doc, because it explains less of the order
    // than it looks like it does.
    if (h.similarity !== undefined) cur.similarity = h.similarity;
    acc.set(h.id, cur);
  });
  // Ties break by EVIDENCE, not by the id alphabet: a hit both legs found outranks one only a single
  // leg found. Before this, an exact-term match lost a tie to an arbitrary semantic hit purely
  // because its id sorted later (ADR-001 AM-4).
  const evidence = (v: Acc): number => (v.lex !== undefined && v.sem ? 0 : v.lex !== undefined ? 1 : 2);
  const ordered = [...acc.entries()]
    .sort((a, b) => b[1].score - a[1].score
      || evidence(a[1]) - evidence(b[1])
      || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  const toHit = ([, v]: [string, Acc]): HybridHit => ({
    pattern: v.pattern,
    backend: v.lex !== undefined && v.sem ? ('both' as const) : v.lex ?? ('vector' as const),
    score: v.score,
    ...(v.matchedForm === undefined ? {} : { matchedForm: v.matchedForm }),
    ...(v.similarity === undefined ? {} : { similarity: v.similarity }),
  });
  // `slice(0, -1)` drops the LAST element instead of returning nothing, so a negative limit used to
  // return almost the whole list (MEASURED: limit -1 over 5 candidates returned 4). `dz recall`
  // clamps its own --limit, but this function is exported and the failure is silent, so it defends
  // itself. `Infinity` means NO limit and must keep meaning that — the first version of this clamp
  // rejected it along with NaN and returned nothing (found by independent review).
  const limit = opts.limit === Number.POSITIVE_INFINITY
    ? acc.size
    : Number.isFinite(opts.limit) ? Math.max(0, Math.trunc(opts.limit)) : 0;
  const cut = ordered.slice(0, limit);

  // The lexical TOP-1 gets a RESERVED SEAT — but ONLY when the caller asked to emphasise the
  // semantic leg. `--semantic` is meant to emphasise it, and instead REPLACES the lexical one: with
  // RRF_K=60 a lexical hit at rank r is beaten by every semantic hit at rank s <= 61+2r, and the
  // semantic list is capped at limit*2, so at any sane limit EVERY semantic hit outranks EVERY
  // lexical one and an exact match on a rare identifier vanishes (MEASURED: one exact hit + three
  // unrelated semantic hits at limit 3 → absent under weight 2, present under weight 1). Tuning the
  // weight cannot fix it: any weight above ~1.02 has the same total effect.
  //
  // Gated on `weight > 1` because in HYBRID mode there is nothing to repair and the seat does real
  // harm: at limit 1 it evicted a `both` hit scoring 0.0325 to seat a lexical-only hit scoring
  // 0.0164 — half the score, and a hit BOTH legs had found (MEASURED, found by independent review;
  // the first version of this ADR wrongly claimed the seat could not alter hybrid results).
  // A `both` hit is never evicted: it is the strongest evidence the merge has.
  const top = lexical[0];
  if (weight > 1 && top !== undefined && limit > 0 && !cut.some(([id]) => id === top.id)) {
    const seat = ordered.find(([id]) => id === top.id);
    // Evict the WEAKEST hit that is not `both` — not simply the last one. Checking only the last
    // seat meant a `both` hit sitting there blocked the reservation entirely, even when an evictable
    // semantic-only hit stood right beside it: lexical [TOP, SHARED], semantic [S0…S59, SHARED],
    // limit 2 → the cut is [S0, SHARED(both)] and TOP was dropped anyway (MEASURED, found by
    // cross-family review). If every seat holds a `both` hit there is nothing to take, and the
    // reservation is skipped: a hit both legs found is the strongest evidence the merge has.
    let victim = -1;
    for (let i = cut.length - 1; i >= 0; i -= 1) {
      const entry = cut[i];
      if (entry !== undefined && !(entry[1].lex !== undefined && entry[1].sem)) { victim = i; break; }
    }
    if (seat !== undefined && victim >= 0) cut[victim] = seat;
  }
  return cut.map(toHit);
}

/**
 * Emit the recall-hit telemetry for the hits a caller is about to see.
 *
 * `bandit` is passed ONLY when `memory.learning.banditRerank` is armed; when it is absent this
 * function is byte-identical to its pre-feature self — no state file, no lock, no allocation.
 */
function markRecallHits(
  projectRoot: string,
  backend: LearningSignalBackend,
  hits: readonly HybridHit[],
  idOf: (p: PatternRecord) => string,
  bandit?: {
    readonly contextKey: string; readonly explored: readonly string[]; readonly moved: number; readonly arms: number;
    /** TRUE ⇒ record the learning samples but NOT the bandit exposures; the caller commits them once
     * it knows which hits it actually printed. `dz recall --domain` over-fetches and truncates AGAIN
     * downstream, so committing here counted hits nobody ever saw as "seen" — inflating the health
     * metrics and mislabeling hidden candidates (cross-family QE, gpt-5.6-sol). */
    readonly deferred?: boolean;
  } | undefined,
): void {
  const cfg = readMemoryLearningConfig(projectRoot);
  if (cfg.backend === 'off' || cfg.onRecallHits === false) return;
  const ts = new Date().toISOString();
  for (const h of hits) backend.addSample({ dzId: idOf(h.pattern), kind: 'recall-hit', reward: h.pattern.reward, ts });
  if (bandit !== undefined && bandit.deferred === true) return;   // the caller will commit post-cut
  if (bandit !== undefined) {
    // EXPOSURE, not reward (INV-2): one BATCHED locked transaction per recall, and it touches only
    // our own counters — `alpha`/`beta`/`totalReward` are not passed to the engine at all. Taking
    // the lock once per HIT would be `limit` transactions per recall for bookkeeping.
    try {
      recordExposures(
        projectRoot,
        hits.map((h) => ({ dzId: idOf(h.pattern), contextKey: bandit.contextKey, ts })),
        bandit.explored,
        { moved: bandit.moved, arms: bandit.arms },
      );
    } catch { /* a derived index never blocks the recall return (NFR-5) */ }
  }
  void backend.train().catch(() => undefined);
}

/**
 * Hybrid recall (FR-3): lexical `recallPatterns` FIRST (always, sync, UNCHANGED — AC-5), then a
 * time-bounded semantic leg merged via RRF. Degradation contract (I-1): with no engine — or on
 * any engine error/timeout — the returned hits are CONTENT-IDENTICAL to plain `recallPatterns`
 * output, with the honest `vectorReason`/`vectorError` alongside. A vector hit whose dzId no
 * longer resolves in the lexical store is DROPPED (V-1 — pruned patterns never resurrect, QR-4).
 */
export async function recallHybrid(
  projectRoot: string,
  query: string,
  opts: VectorServiceOptions & {
    readonly limit?: number | undefined;
    readonly mode?: HybridRecallMode | undefined;
    /** Defer bandit EXPOSURE recording to the caller (default false ⇒ byte-identical to today).
     * A caller that over-fetches and truncates again — `dz recall --domain` does — must set this and
     * then call `commitExposures(shownDzIds)`, or hits nobody ever saw are counted as seen. */
    readonly deferExposures?: boolean | undefined;
    /**
     * The resolved recall domain (the axis `dz recall --domain` already boosts on). It becomes the
     * bandit's ContextKey (FR-5) — coarse on purpose, so posteriors accumulate instead of every arm
     * sitting at `pulls === 0` forever. Absent ⇒ `general`; it changes nothing while disarmed.
     */
    readonly domain?: string | undefined;
    readonly onClassDegraded?: RecallPatternsOptions['onClassDegraded'];
    readonly classMatcher?: RecallPatternsOptions['classMatcher'];
  } = {},
): Promise<HybridRecall> {
  // Config-surface note (QE P3, benign by design): recall resolves the engine directly, while teach
  // only mirrors when the memory backend is agentdb (or an engine is explicit). In the window where
  // the agentdb deps are INSTALLED but `memory.backend` hasn't been switched, the semantic leg reads a
  // store teach never populated → empty/foreign hits. That degrades honestly (orphan dzIds are dropped
  // against the lexical store, V-1) and lexical results are always returned, so it never misleads — it
  // only spends a bounded, cached read. Not gated on purpose: a read-only recall must not depend on the
  // write-side backend flag.
  const limit = opts.limit ?? 10;
  const mode = opts.mode ?? 'hybrid';
  const lexical = recallPatterns(projectRoot, query, limit, {
    ...(opts.onClassDegraded === undefined ? {} : { onClassDegraded: opts.onClassDegraded }),
    ...(opts.classMatcher === undefined ? {} : { classMatcher: opts.classMatcher }),
  });
  const lexicalBackend: 'sqlite' | 'json' = lexical[0]?.backend === 'sqlite' ? 'sqlite' : 'json';
  const records = loadStoreRecords(projectRoot);
  const idToRecord = new Map<string, MemoryRecord>();
  const identityToId = new Map<string, string>();
  for (const r of records) {
    idToRecord.set(r.id, r);
    identityToId.set(patternIdentityOf(recordToPattern(r)), r.id);
  }
  const idOf = (p: PatternRecord): string => identityToId.get(patternIdentityOf(p)) ?? patternRecordId(p);
  const learning = resolveLearningBackend(projectRoot);
  // Phase 3: opt-in SAFLA-delta re-rank. The map is built ONCE per recall (off ⇒ undefined ⇒ the
  // reinforce-only path, byte-identical to today).
  const memCfg = readMemoryLearningConfig(projectRoot);
  const deltaMap = memCfg.deltaRerank ? lessonDeltaMap(projectRoot) : undefined;
  // lesson-quarantine: damp read from the AUTHORITATIVE store records (idToRecord), never from
  // mirror metadata — the mirror may lag a promotion; the store cannot.
  const dampQuarantined = (hits: readonly HybridHit[]): HybridHit[] => {
    if (!memCfg.quarantine) return [...hits];
    return hits
      .map((h) => {
        const rec = idToRecord.get(idOf(h.pattern));
        const q = rec !== undefined && readQuarantineState(rec).quarantined;
        return q ? { ...h, score: h.score * memCfg.quarantineDamp, quarantined: true as const } : h;
      })
      .sort((a, b) => b.score - a.score);
  };
  // lesson-bandit-rerank (ADR-001): the payoff axis. Resolved ONCE per recall; `enabled:false` ⇒
  // the Lesson Payoff context is NEVER CONSTRUCTED — the branch is taken BEFORE any work, so the
  // disarmed path reads no file, takes no lock and allocates nothing (INV-1).
  const banditCfg = resolveBanditConfig(projectRoot, memCfg);
  const banditCtxKey = contextKeyFor(opts.domain);
  let banditReport: BanditRecallReport | undefined;
  let banditExplored: readonly string[] = [];
  const enhance = (hits: readonly HybridHit[]): HybridHit[] => {
    const candidates = hits.map((h) => {
      const dzId = idOf(h.pattern);
      const rec = idToRecord.get(dzId);
      return { dzId, score: h.score, reinforcement: rec !== undefined ? readReinforcementState(rec) : undefined };
    });
    if (banditCfg.enabled) {
      // Quarantine read from the AUTHORITATIVE store records (idToRecord), never from mirror
      // metadata — the mirror may lag a promotion; the store cannot (same rule as dampQuarantined).
      const quarantined = new Set<string>();
      for (const c of candidates) {
        const rec = idToRecord.get(c.dzId);
        if (rec !== undefined && readQuarantineState(rec).quarantined) quarantined.add(c.dzId);
      }
      // INV-3 / AC-3: with exploration disarmed a quarantined lesson is filtered out of the arm list
      // BEFORE the engine is called, so it literally never learns that arm exists. (The ACL applies
      // its own set-subtraction for the exploration lift as well — two independent gates, because
      // this is the property ADR-003 says may only be weakened by an explicit request.)
      const armKeys = candidates.map((c) => c.dzId).filter((id) => banditCfg.exploration || !quarantined.has(id));
      const payoff = payoffTermsFor(projectRoot, banditCtxKey, armKeys, {
        exploration: banditCfg.exploration,
        quarantined,
      });
      const baseTerms: RerankTerm[] = deltaMap === undefined
        ? []
        : [{ id: 'delta', byIndex: candidates.map((c) => deltaMap.get(c.dzId) ?? 0), cap: REINFORCE_RRF_CAP }];
      // The SAME ranking without the payoff term — the only honest way to say what the term moved.
      const before = dampQuarantined(applyLearningSignalsWithTerms(hits, learning, candidates, REINFORCE_RRF_CAP, baseTerms));
      const after = dampQuarantined(applyLearningSignalsWithTerms(hits, learning, candidates, REINFORCE_RRF_CAP, [
        ...baseTerms,
        // ADDED, never assigned, and pre-bounded to [-1,+1] by the ACL — so `squash` is identity and
        // `cap` is an EXACT bound on this term's contribution (INV-4).
        { id: 'bandit', byIndex: candidates.map((c) => payoff.terms.get(c.dzId)?.term ?? 0), cap: BANDIT_RRF_CAP, squash: (v) => v },
      ]));
      const beforeIds = before.map((h) => idOf(h.pattern));
      const afterIds = after.map((h) => idOf(h.pattern));
      const movedDzIds = afterIds.filter((id, i) => beforeIds[i] !== id);
      banditExplored = payoff.explored;
      banditReport = {
        contextKey: banditCtxKey,
        armsConsidered: armKeys.length,
        quarantinedExcluded: candidates.length - armKeys.length,
        unknownArms: payoff.unknownArms,
        moved: movedDzIds.length,
        exploration: banditCfg.exploration,
        explored: payoff.explored.length,
        reason: payoff.reason,
        armDzIds: armKeys,
        movedDzIds,
        unknownDzIds: payoff.unknownDzIds,
        exploredDzIds: payoff.explored,
        beforeOrder: beforeIds,
        afterOrder: afterIds,
      };
      return after;
    }
    if (deltaMap !== undefined) {
      const deltaByIndex = candidates.map((c) => deltaMap.get(c.dzId) ?? 0);
      return dampQuarantined(applyLearningSignalsWithDelta(hits, learning, candidates, REINFORCE_RRF_CAP, deltaByIndex, REINFORCE_RRF_CAP));
    }
    return dampQuarantined(applyLearningSignals(hits, learning, candidates, REINFORCE_RRF_CAP));
  };
  /** The exposure/telemetry payload for `markRecallHits` — `undefined` while disarmed (INV-1). */
  const banditEmission = (): { readonly contextKey: string; readonly explored: readonly string[]; readonly moved: number; readonly arms: number; readonly deferred?: boolean } | undefined =>
    banditReport === undefined
      ? undefined
      : {
          contextKey: banditReport.contextKey, explored: banditExplored,
          moved: banditReport.moved, arms: banditReport.armsConsidered,
          ...(opts.deferExposures === true ? { deferred: true } : {}),
        };
  const lexicalOnly = (extra: Partial<Pick<HybridRecall, 'vectorEngine' | 'vectorReason' | 'vectorError'>>): HybridRecall => {
    // `enhance` FIRST: it is what populates `banditReport` (the key is absent while disarmed).
    const hits = enhance(lexical.map((h, rank) => ({
      pattern: h.pattern,
      backend: h.backend,
      score: 1 / (RRF_K + rank + 1),
      ...(h.matchedForm === undefined ? {} : { matchedForm: h.matchedForm }),
    })));
    return {
      hits,
      lexicalBackend,
      vectorEngine: 'none',
      semanticCandidates: 0,
      semanticRanked: 0,
      ...extra,
      ...(banditReport !== undefined ? { bandit: banditReport } : {}),
      ...deferredCommit(),
    };
  };

  /**
   * The deferred-exposure commit, built ONCE and attached by EVERY return path.
   *
   * The first draft attached it only inside `lexicalOnly()` — the FALLBACK. On the main hybrid path
   * (a vector engine present, i.e. the normal case) the field was absent, so `markRecallHits` had
   * already returned early on `deferred: true` and NOTHING ever committed the exposures. MEASURED
   * the same day: an armed recall printed `bandit payoff: … state absent` while `.dz/lesson-bandit/`
   * was never created — the feature reported itself running while its reward feed was severed.
   * A ranking feature that quietly stops ranking looks exactly like one that works; that sentence is
   * in the vendored engine's own header, and the failure recurred one layer down anyway.
   */
  function deferredCommit(): { commitExposures?: (shownDzIds: readonly string[]) => void } {
    return banditReport !== undefined && opts.deferExposures === true
        ? {
            /** Record exposures for the hits the caller actually PRINTED. Everything it needs is in
             * the report plus the shown ids — no closure over the pre-cut hit list, so there is no
             * way for this to disagree with `narrowBanditReport` about which list is being described. */
            commitExposures: (shownDzIds: readonly string[]): void => {
              const narrowed = narrowBanditReport(banditReport!, shownDzIds);
              const ts2 = new Date().toISOString();
              try {
                recordExposures(
                  projectRoot,
                  shownDzIds.map((dzId) => ({ dzId, contextKey: narrowed.contextKey, ts: ts2 })),
                  narrowed.exploredDzIds,
                  { moved: narrowed.moved, arms: narrowed.armsConsidered },
                );
              } catch { /* a derived index never blocks the recall return (NFR-5) */ }
            },
          }
        : {};
  }

  if (mode === 'lexical') {
    const out = lexicalOnly({});
    markRecallHits(projectRoot, learning, out.hits, idOf, banditEmission());
    return out;
  }

  let resolved: ResolvedVectorEngine;
  try {
    resolved = pickEngine(projectRoot, opts);
  } catch (err) {
    const out = lexicalOnly({ vectorReason: err instanceof Error ? err.message : String(err) });
    markRecallHits(projectRoot, learning, out.hits, idOf, banditEmission());
    return out;
  }
  if (resolved.engine === undefined) {
    const out = lexicalOnly(resolved.reason !== undefined ? { vectorReason: resolved.reason } : {});
    markRecallHits(projectRoot, learning, out.hits, idOf, banditEmission());
    return out;
  }
  const engine = resolved.engine;
  const timeoutMs = opts.timeoutMs ?? DEFAULT_VECTOR_TIMEOUT_MS;

  const sr = await withVectorTimeout(
    safeEngineCall(
      () => engine.search(query, limit * 2),
      (m) => ({ hits: [] as VectorHit[], error: `vector search failed: ${m}` }),
    ),
    timeoutMs,
    () => ({ hits: [] as VectorHit[], error: `vector search timed out after ${timeoutMs}ms` }),
  );
  if (sr.error !== undefined) {
    // The engine answered with an error, so nothing was returned and nothing ranked — both zero.
    const out = { ...lexicalOnly({}), vectorEngine: engine.kind, vectorError: sr.error };
    markRecallHits(projectRoot, learning, out.hits, idOf, banditEmission());
    return out;
  }

  // Resolve dzId → the FULL lexical record (source of truth). Orphans are dropped (V-1/QR-4).
  const idToPattern = new Map<string, PatternRecord>();
  for (const r of records) {
    const p = recordToPattern(r);
    idToPattern.set(r.id, p);
  }
  // Only a declared cosine is allowed to travel as one (ADR: per-engine honesty gate).
  const cosineEngine = engine.similarityKind === 'cosine';
  const semantic: RankedPattern[] = [];
  const seen = new Set<string>();
  for (const h of sr.hits) {
    if (seen.has(h.dzId)) continue;
    const p = idToPattern.get(h.dzId);
    if (p === undefined) continue; // vector-only orphan — the store pruned/expired it; NEVER resurrect
    seen.add(h.dzId);
    // The cosine was computed by the engine and then thrown away here — `h.similarity` was read
    // nowhere in this function, and `relevance` in `--json` has been the RRF rank surrogate ever
    // since (MEASURED: a nonsense query and a meaningful one both score 1/61 at the top). It now
    // travels with the hit. Only a genuine cosine travels: an engine whose score is a negated
    // distance reports `similarityKind: 'rank-only'` and contributes nothing here.
    semantic.push({ id: h.dzId, pattern: p, backend: 'vector',
      ...(cosineEngine && Number.isFinite(h.similarity) ? { similarity: h.similarity } : {}) });
  }
  const lex: RankedPattern[] = lexical.map((h) => ({
    id: identityToId.get(patternIdentityOf(h.pattern)) ?? patternRecordId(h.pattern),
    pattern: h.pattern,
    backend: h.backend,
    ...(h.matchedForm === undefined ? {} : { matchedForm: h.matchedForm }),
  }));
  const hits = enhance(mergeHybridHits(lex, semantic, { limit, semanticWeight: mode === 'semantic' ? 2 : 1 }));
  markRecallHits(projectRoot, learning, hits, idOf, banditEmission());
  return {
    hits,
    lexicalBackend,
    vectorEngine: engine.kind,
    semanticCandidates: sr.hits.length,
    semanticRanked: semantic.length,
    ...(banditReport !== undefined ? { bandit: banditReport } : {}),
    ...deferredCommit(),
  };
}

export async function teachGuard(
  projectRoot: string,
  text: string,
  opts: VectorServiceOptions & { readonly reward?: number | undefined; readonly threshold?: number | undefined } = {},
): Promise<TeachGuardResult> {
  const cfg = readMemoryLearningConfig(projectRoot);
  const threshold = Math.max(0.95, opts.threshold ?? cfg.reinforceThreshold);
  const timeoutMs = opts.timeoutMs ?? DEFAULT_VECTOR_TIMEOUT_MS;
  const result = await withVectorTimeout(
    searchAgentdbPatterns(projectRoot, text, { limit: 1 }),
    timeoutMs,
    () => ({ hits: [], error: `teach guard timed out after ${timeoutMs}ms` }),
  );
  if (result.error !== undefined) return { action: 'teach', reason: result.error };
  const hit = result.hits[0];
  if (hit === undefined || hit.dzId === undefined || hit.similarity < threshold) return { action: 'teach' };
  const rec = loadStoreRecords(projectRoot).find((r) => r.id === hit.dzId);
  if (opts.reward !== undefined && rec !== undefined && Math.abs(rec.score - opts.reward) > 0.000001) {
    return { action: 'teach', reason: 'reward differs; preserving corrected-reward fork' };
  }
  return { action: 'reinforce', dzId: hit.dzId, cosine: hit.similarity };
}

/* ------------------------------------------------------------------ */
/*  Status (dz vector status / dz doctor divergence line)              */
/* ------------------------------------------------------------------ */

/** Field observability: engine availability + mirrored-vs-lexical counts + queue size. */
export async function vectorTierStatus(
  projectRoot: string,
  opts: VectorServiceOptions = {},
): Promise<VectorTierStatus> {
  const mode = readVectorEngineMode(projectRoot);
  const model = resolveEmbedModel(projectRoot);
  let records: MemoryRecord[];
  try {
    records = loadStoreRecords(projectRoot);
  } catch {
    records = [];
  }
  const mirrorableRecords = records.filter((r) => !isVectorNoise(r.text));
  const lexicalMirrorable = mirrorableRecords.length;
  const pendingEntries = readVectorPending(projectRoot);
  const pending = pendingEntries.length;
  const mirror = mirrorWriterReason(projectRoot);
  const mirrorWriterEnabled = mirror.enabled;
  const resolved = pickEngine(projectRoot, opts);
  if (resolved.engine === undefined) {
    // No engine to ask ⇒ the debt is UNKNOWN. Reporting 0 here is precisely the defect this feature
    // closes: a number nobody computed is not a number anyone may print (ADR-001, AM-5).
    return {
      mode,
      available: false,
      ...(resolved.reason !== undefined ? { reason: resolved.reason } : {}),
      ...(!('error' in model) ? { embeddingModel: model.model } : {}),
      lexicalTotal: records.length,
      lexicalMirrorable,
      pending,
      mirrorWriterEnabled,
      mirrorWriterState: mirror.state,
    };
  }
  const engine = resolved.engine;
  const listed = await withVectorTimeout(
    safeEngineCall(() => engine.listIds(), (m) => ({ ids: [] as string[], error: `vector listIds failed: ${m}` })),
    opts.timeoutMs ?? DEFAULT_VECTOR_TIMEOUT_MS,
    () => ({ ids: [] as string[], error: 'vector listIds timed out' }),
  );
  // The debt is a SET DIFFERENCE over the content-addressed ids the mirror actually writes under,
  // not `mirrorable - mirrored - pending`: a vector can outlive its record (an orphan left by a
  // harmonize), which makes the subtraction negative and the flooring a fresh lie (ADR-001 alt-b).
  const accounted = new Set<string>([...listed.ids, ...pendingEntries.map((e) => e.dzId)]);
  const unmirrored = listed.error === undefined
    ? countUnmirrored(mirrorableRecords, accounted)
    : undefined;

  // `listIds()` enumerates the OWNED SUPERSET — it also holds `dz-backlog` ideas — so its count may
  // not be printed beside a pattern-only lexical count. MEASURED on this repository: 547 ids against
  // 274 records, of which 273 were backlog idea ids and ZERO were true orphans; a reader took the
  // pair at face value and filed a task to prune a healthy index (ADR-001). Narrow it where the
  // engine can, and report `undefined` where it cannot — never a fabricated zero.
  const narrowed = listed.error === undefined && engine.listPatternIds !== undefined
    ? await withVectorTimeout(
        safeEngineCall(() => engine.listPatternIds!(), (m) => ({ ids: [] as string[], error: `vector listPatternIds failed: ${m}` })),
        opts.timeoutMs ?? DEFAULT_VECTOR_TIMEOUT_MS,
        () => ({ ids: [] as string[], error: 'vector listPatternIds timed out' }),
      )
    : undefined;
  // `known` is built from ALL records, not just the mirrorable ones: a vector written for a record
  // the noise gate later excluded still HAS a record, and calling it an orphan would send the user
  // pruning something that is merely un-mirrorable (found by cross-family review).
  const keysOf = (r: MemoryRecord): [string, string] => [r.id, patternRecordId(recordToPattern(r))];
  const known = new Set<string>();
  for (const r of records) for (const k of keysOf(r)) known.add(k);

  const scoped = narrowed !== undefined && narrowed.error === undefined ? narrowed.ids : undefined;
  const scopedSet = scoped !== undefined ? new Set(scoped) : undefined;
  // Count RECORDS, not ids. A record has two possible keys and the mirror may hold BOTH, which
  // counting ids turns into two mirrored records where there is one (found by cross-family review).
  const mirrored = scopedSet !== undefined
    ? mirrorableRecords.filter((r) => keysOf(r).some((k) => scopedSet.has(k))).length
    : undefined;
  const orphaned = scoped !== undefined ? scoped.filter((id) => !known.has(id)).length : undefined;
  const mirroredOther = scoped !== undefined && listed.error === undefined
    ? listed.ids.length - scoped.length
    : undefined;

  return {
    mode,
    kind: engine.kind,
    available: true,
    ...(listed.error !== undefined ? { reason: listed.error } : {}),
    ...(!('error' in model) ? { embeddingModel: model.model } : {}),
    lexicalTotal: records.length,
    lexicalMirrorable,
    mirrored,
    pending,
    mirrorWriterEnabled,
    mirrorWriterState: mirror.state,
    ...(unmirrored !== undefined ? { unmirrored } : {}),
    ...(mirroredOther !== undefined ? { mirroredOther } : {}),
    ...(orphaned !== undefined ? { orphaned } : {}),
  };
}

export async function reindexVectorStore(projectRoot: string, opts: VectorServiceOptions = {}): Promise<ReindexVectorReport> {
  // ARCHITECTURAL INVARIANT (smart-backlog): backlog code never PARTIALLY advances the SHARED agentdb
  // model manifest — no path re-stamps it to a new model while leaving a sibling task type un-re-embedded.
  // The FIRST backlog write legitimately establishes the manifest when the store is new (correct); a model
  // ADVANCE happens ONLY here, in a full reindex that re-embeds EVERY owned task type together atomically
  // (taskTypes = DZ_OWNED_TASK_TYPES, which owns dz-backlog — HIGH-3). The old backlog-only re-stamp path
  // spawned an endless class of edge cases (missing/corrupt/rollback/scan-error); it is REMOVED.
  const resolved = pickEngine(projectRoot, opts);
  if (resolved.engine === undefined || resolved.engine.kind !== 'agentdb') {
    // Non-agentdb (or absent) engine: the generic learned-pattern reindex can't run here, and backlog must
    // not advance the shared manifest partially. Touch NOTHING — honest skip with a UNIFORM shape (LOW-I:
    // always report backlog/generic skipped). Backlog's same-model writes already bind vectors to the
    // current model (HIGH-2); a model bump needs a FULL reindex under the agentdb engine.
    // A non-agentdb vector engine is CONFIGURED (rvf resolved, or requested-but-not-installed) ⇒ the
    // manifest-untouched message pointing to the full agentdb reindex. Only a genuinely absent engine
    // (no config, nothing resolvable) falls back to the bare reason.
    const nonAgentdbConfigured = resolved.engine !== undefined || readVectorEngineMode(projectRoot) === 'rvf';
    return {
      reembedded: 0,
      backlog: 'skipped',
      generic: 'skipped',
      error: nonAgentdbConfigured
        ? 'a non-agentdb vector engine (e.g. RVF) is configured; no reindex was performed and the shared model manifest was NOT touched. ' +
          'Run a full reindex under memory.vector.engine=agentdb/auto to re-embed every task type (dz-teach/dz-learning/dz-backlog) together.'
        : resolved.reason ?? 'no vector engine available',
    };
  }
  let records: MemoryRecord[];
  try {
    records = loadStoreRecords(projectRoot);
  } catch {
    records = [];
  }
  const rows = records
    .map(memoryRecordVectorEntry)
    .filter((r): r is VectorEntry => r !== undefined)
    .map((r) => ({
      taskType: r.taskType,
      text: r.text,
      score: r.score,
      ...(r.tags !== undefined ? { tags: r.tags } : {}),
      ...(r.metadata !== undefined ? { metadata: r.metadata } : {}),
    }));
  // HIGH-G: ownership is by STORE-PRESENCE. Read the dz-backlog rows that ACTUALLY EXIST IN THE STORE and
  // re-embed THOSE (their stored text) — never reconstruct them from ideas.jsonl, or an empty/unreadable
  // sidecar would advance the manifest while the store's real dz-backlog rows rot in the old model space.
  // Symmetric with dz-teach/dz-learning (re-embedded from their store of truth). Only widen the owned set
  // when the store actually holds dz-backlog rows — a store with none reindexes byte-identically to before.
  const backlogStoreRows = readAgentdbRowsByTaskType(projectRoot, BACKLOG_TASK_TYPE).rows;
  if (backlogStoreRows.length === 0) return reindexAgentdbRows(projectRoot, rows);
  return reindexAgentdbRows(projectRoot, [...rows, ...backlogStoreRows], { taskTypes: DZ_OWNED_TASK_TYPES });
}

/* ------------------------------------------------------------------ */
/*  Harmonize — SEMANTIC dedup of the lexical store (05 §2.1)          */
/* ------------------------------------------------------------------ */

/** Bounded, honest embed of one text — a throw/timeout surfaces as `{ error }`, never propagates. */
async function boundedEmbed(
  embed: (text: string) => Promise<Float32Array>,
  text: string,
  timeoutMs: number,
): Promise<Float32Array | { error: string }> {
  return withVectorTimeout(
    safeEngineCall<Float32Array | { error: string }>(() => embed(text), (m) => ({ error: m })),
    timeoutMs,
    () => ({ error: 'embed timed out' }),
  );
}

/**
 * Deterministic keeper INDEX within a near-dup cluster (a TOTAL order over fixed inputs — NFR-7):
 * (1) highest reward → (2) longer / more-specific text → (3) newer `ts` → (4) `dzId` (stable
 * final tiebreak). Pure — no I/O. The keeper survives; the other members are the drop set.
 */
export function selectClusterKeeper(members: readonly HarmonizeItem[]): number {
  let best = 0;
  for (let i = 1; i < members.length; i += 1) {
    if (isBetterKeeper(members[i]!, members[best]!)) best = i;
  }
  return best;
}

function isBetterKeeper(a: HarmonizeItem, b: HarmonizeItem): boolean {
  if (a.reward !== b.reward) return a.reward > b.reward; // (1) highest reward
  if (a.text.length !== b.text.length) return a.text.length > b.text.length; // (2) longer / more specific
  if (a.ts !== b.ts) return a.ts > b.ts; // (3) newer
  return a.dzId < b.dzId; // (4) stable, deterministic final tiebreak
}

/** Connected components over undirected `edges` (union-find) — transitive clusters (A~B,B~C ⇒ {A,B,C}). */
function connectedComponents(n: number, edges: readonly (readonly [number, number])[]): number[][] {
  const parent = Array.from({ length: n }, (_, i) => i);
  const find = (x: number): number => {
    let r = x;
    while (parent[r] !== r) r = parent[r]!;
    while (parent[x] !== r) {
      const next = parent[x]!;
      parent[x] = r;
      x = next;
    }
    return r;
  };
  for (const [a, b] of edges) {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent[ra] = rb;
  }
  const groups = new Map<number, number[]>();
  for (let i = 0; i < n; i += 1) {
    const r = find(i);
    const g = groups.get(r);
    if (g === undefined) groups.set(r, [i]);
    else g.push(i);
  }
  return [...groups.values()];
}

/** Build a {@link HarmonizeCluster} from a component's item indices + keeper's cosine to each drop. */
function buildCluster(
  items: readonly HarmonizeItem[],
  indices: readonly number[],
  cosToKeeper: (dropIdx: number, keeperIdx: number) => number,
): HarmonizeCluster {
  const members = indices.map((i) => items[i]!);
  const keeperIdx = indices[selectClusterKeeper(members)]!;
  const keeper = items[keeperIdx]!;
  // FORK-PRESERVATION CARVE-OUT (the ADR's #1 safety property — distinct-lesson-never-lost): a
  // SAME-TEXT member whose reward differs from the keeper's is a fork-on-corrected-reward
  // (patterns.ts:279-284 intent) — the CORRECTION must survive even when it is a DOWNGRADE
  // (keeper = max reward would otherwise delete it). Mirrors teachGuard's reward-diff ε. Scoped to
  // SAME TEXT only: semantically-similar-but-differently-worded near-dups still merge normally
  // (that IS harmonize's job; the keeper keeps max reward + provenance).
  const drops = indices
    .filter((i) => i !== keeperIdx)
    .filter((i) => !(items[i]!.text === keeper.text && Math.abs(items[i]!.reward - keeper.reward) > 0.000001))
    .map((i) => ({ dzId: items[i]!.dzId, text: items[i]!.text, reward: items[i]!.reward, cos: cosToKeeper(i, keeperIdx) }));
  return { keep: { dzId: keeper.dzId, text: keeper.text, reward: keeper.reward, ts: keeper.ts }, drops };
}

/** Semantic clusters: pairwise cosine ≥ θ (i<j) ⇒ union-find edge; components of size ≥ 2 are clusters. */
function semanticClusters(items: readonly HarmonizeItem[], vecs: readonly Float32Array[], threshold: number): HarmonizeCluster[] {
  const n = items.length;
  const edges: [number, number][] = [];
  for (let i = 0; i < n; i += 1) {
    for (let j = i + 1; j < n; j += 1) {
      if (cosineSimilarity(vecs[i]!, vecs[j]!) >= threshold) edges.push([i, j]);
    }
  }
  const clusters: HarmonizeCluster[] = [];
  for (const comp of connectedComponents(n, edges)) {
    if (comp.length < 2) continue;
    const c = buildCluster(items, comp, (d, k) => cosineSimilarity(vecs[d]!, vecs[k]!));
    if (c.drops.length > 0) clusters.push(c); // all members carved out as reward-forks ⇒ no-op cluster
  }
  return clusters;
}

/** Exact-text fallback: group by RAW pattern text (the identity `teach --from-json` dedups on); cos = 1.0. */
function exactClusters(items: readonly HarmonizeItem[]): HarmonizeCluster[] {
  const byText = new Map<string, number[]>();
  items.forEach((it, i) => {
    const g = byText.get(it.text);
    if (g === undefined) byText.set(it.text, [i]);
    else g.push(i);
  });
  const clusters: HarmonizeCluster[] = [];
  for (const indices of byText.values()) {
    if (indices.length < 2) continue;
    const c = buildCluster(items, indices, () => 1.0);
    if (c.drops.length > 0) clusters.push(c); // same-text reward-forks are preserved, not merged
  }
  return clusters;
}

/** Honest note next to the session telemetry (mirrors {@link logMirrorNote}). */
function logHarmonizeNote(projectRoot: string, info: { dropped: number; kept: number; engine: string; error?: string | undefined }): void {
  try {
    appendFileSync(
      join(projectRoot, '.dz', 'sessions.jsonl'),
      JSON.stringify({ event: 'harmonize', ts: new Date().toISOString(), ...info }) + '\n',
    );
  } catch { /* best-effort */ }
}

/**
 * SEMANTIC dedup of the learned-pattern store (`dz vector harmonize` / `dz teach --harmonize`) —
 * **NON-DESTRUCTIVE by contract**. Finds near-duplicate PAIRS via pairwise cosine over the embedder
 * both adapters share (θ default {@link DEFAULT_HARMONIZE_THRESHOLD}), union-finds them into clusters,
 * and within each cluster KEEPs the highest-signal member ({@link selectClusterKeeper}), dropping the
 * rest. Modes:
 *
 * - **dry-run (default)**: previews the clusters and returns — writes NOTHING (the store is
 *   byte-identical after).
 * - **`--apply`**: writes a restorable backup FIRST (`.dz/memory/patterns.pre-harmonize.json`); a
 *   failed backup ABORTS the drop (no partial mutation). Then removes the non-keepers from BOTH
 *   lexical tiers via {@link removePatternsByIds}. A UNIQUE (singleton) pattern is NEVER a drop.
 *
 * Degrades honestly: with no engine/embedder it falls back to EXACT-text dedup + a `fellBackToExact`
 * note, exits without throwing (dry-run still writes nothing). Reversal: `dz teach --from-json <backup>`.
 */
export async function harmonizeVectorStore(projectRoot: string, opts: HarmonizeOptions = {}): Promise<HarmonizeReport> {
  const apply = opts.apply === true;
  const threshold =
    opts.threshold !== undefined && opts.threshold > 0 && opts.threshold <= 1
      ? opts.threshold
      : readHarmonizeThreshold(projectRoot);
  const timeoutMs = opts.timeoutMs ?? DEFAULT_VECTOR_TIMEOUT_MS;

  // 1. LOAD the pool from the lexical source of truth (id = dzId).
  let records: MemoryRecord[];
  try {
    records = loadStoreRecords(projectRoot);
  } catch {
    records = [];
  }
  const items: HarmonizeItem[] = records
    .filter((r) => r.metadata?.['lessonForm'] !== 'class')
    .map((r) => ({
      dzId: r.id,
      text: r.text,
      reward: r.score,
      ts: r.timestamp,
      taskType: r.id.startsWith('dream:') ? 'dz-learning' : 'dz-teach',
    }));

  // 2. GATE: an embedder ⇒ SEMANTIC clustering; absence/failure ⇒ EXACT-text fallback (D4).
  let embed: ((text: string) => Promise<Float32Array>) | undefined;
  let engineKind = 'none';
  let fellBackToExact = false;
  if (opts.embed === null) {
    fellBackToExact = true;
  } else if (opts.embed !== undefined) {
    embed = opts.embed;
    engineKind = 'agentdb';
  } else {
    const resolved = pickEngine(projectRoot, opts);
    if (resolved.engine === undefined) {
      fellBackToExact = true;
    } else {
      engineKind = resolved.engine.kind;
      const emb = await resolveAgentdbEmbedder(projectRoot);
      if ('error' in emb) fellBackToExact = true;
      else embed = (t) => emb.embed(t);
    }
  }

  // 3. CLUSTER (nothing to cluster ⇒ no clusters, everything unique).
  let clusters: HarmonizeCluster[] | undefined;
  if (items.length >= 2 && !fellBackToExact && embed !== undefined) {
    const vecs: Float32Array[] = [];
    let ok = true;
    for (const it of items) {
      const v = await boundedEmbed(embed, `${it.taskType}: ${it.text}`, timeoutMs);
      if (!(v instanceof Float32Array)) {
        ok = false;
        break;
      }
      vecs.push(v);
    }
    if (ok) clusters = semanticClusters(items, vecs, threshold);
    else fellBackToExact = true; // embed failed/timed out — fall back to exact
  }
  if (clusters === undefined) {
    fellBackToExact = fellBackToExact || embed === undefined;
    clusters = items.length >= 2 ? exactClusters(items) : [];
  }

  // 4. TOTALS (a unique = a singleton; never a member of a drop set).
  const dropDzIds = new Set<string>();
  for (const c of clusters) for (const d of c.drops) dropDzIds.add(d.dzId);
  const kept = clusters.length;
  const dropped = dropDzIds.size;
  const unique = items.length - kept - dropped;
  const base: HarmonizeReport = {
    mode: apply ? 'apply' : 'dry-run',
    engine: engineKind,
    fellBackToExact,
    threshold,
    clusters,
    kept,
    dropped,
    unique,
  };

  // 5a. DRY-RUN (default): return — ZERO writes (the store is byte-identical after).
  if (!apply) return base;

  // 5b. --apply: BACKUP FIRST, then drop the non-keepers. Nothing to drop ⇒ no backup, no mutation.
  if (dropped === 0) {
    logHarmonizeNote(projectRoot, { dropped: 0, kept, engine: engineKind });
    return base;
  }
  const backupPath = join(projectRoot, '.dz', 'memory', 'patterns.pre-harmonize.json');
  const snap = snapshotStore(projectRoot, backupPath);
  if (snap.error !== undefined) {
    // Backup write failed ⇒ ABORT the drop (no partial mutation — the store is untouched).
    return { ...base, error: `backup failed — drop aborted: ${snap.error}` };
  }
  for (const c of clusters) {
    const keepRec = records.find((r) => r.id === c.keep.dzId);
    if (keepRec === undefined) continue;
    const keepState = readReinforcementState(keepRec);
    let uses = keepState.uses + c.drops.length;
    const rewards = [c.keep.reward];
    const mergedFrom = [...keepState.mergedFrom];
    for (const d of c.drops) {
      const rec = records.find((r) => r.id === d.dzId);
      const st = rec !== undefined ? readReinforcementState(rec) : undefined;
      uses += st?.uses ?? 0;
      rewards.push(d.reward);
      if (st !== undefined) mergedFrom.push(...st.mergedFrom);
      mergedFrom.push(d.dzId);
    }
    await updateReinforcementState(projectRoot, c.keep.dzId, {
      uses,
      lastUsedTs: new Date().toISOString(),
      avgReward: rewards.reduce((a, b) => a + b, 0) / rewards.length,
      mergedFrom,
    });
  }
  const removal = removePatternsByIds(projectRoot, dropDzIds);
  logHarmonizeNote(projectRoot, { dropped: removal.removed, kept, engine: engineKind, error: removal.error });
  return { ...base, backupPath, ...(removal.error !== undefined ? { error: removal.error } : {}) };
}

/* ------------------------------------------------------------------ */
/*  Import — RVF checkpoint ingest, UPSERT-BY-dzId (05 §2.2)           */
/* ------------------------------------------------------------------ */

/**
 * Ingest an external `.rvf` checkpoint's vectors into THIS project's vector store, **UPSERT-BY-dzId,
 * NON-DESTRUCTIVE** (`dz vector import <file.rvf>`). The `.idmap.json` sidecar is the dzId authority
 * (the shipped `@ruvector/rvf` SDK exposes no vector read-out — see rUv `rvf-backend-blocker.md`), so
 * for each checkpoint dzId that exists in the LOCAL lexical store the vector is reproduced by
 * re-embedding the local text (D7 — under the manifest guard the same model over the same text yields
 * the checkpoint's vector) and upserted by dzId via {@link VectorEngine.importVectors}. dzIds absent
 * locally are ORPHANS — skipped + counted (their text must be imported first via `dz teach --from-json`).
 *
 * Non-destructive: only the imported dzIds are inserted/replaced; re-importing the same file adds 0
 * duplicates and deletes nothing. A model/dim manifest mismatch is REFUSED (no cross-space merge). All
 * failure modes return an honest `{ error }`, never a throw.
 */
export async function importRvfCheckpoint(projectRoot: string, source: string, opts: ImportOptions = {}): Promise<ImportReport> {
  const fail = (error: string, engine = 'none'): ImportReport => ({ imported: 0, skippedOrphans: 0, engine, source, error });
  const timeoutMs = opts.timeoutMs ?? DEFAULT_VECTOR_TIMEOUT_MS;

  // 1. Source dzIds: the `.idmap.json` sidecar (dzId authority) — or injected rows (tests).
  const injected = new Map<string, Float32Array>();
  let sourceDzIds: string[];
  if (opts.sourceRows !== undefined) {
    for (const r of opts.sourceRows) injected.set(r.dzId, r.vector);
    sourceDzIds = [...injected.keys()];
  } else {
    if (!existsSync(source)) return fail(`no such file: ${source}`);
    const idmapPath = `${source}.idmap.json`;
    if (!existsSync(idmapPath)) {
      return fail(`missing sidecar ${basename(idmapPath)} — export writes it next to the .rvf (re-run: dz vector export)`);
    }
    let idmap: RvfIdmap;
    try {
      const parsed = JSON.parse(readFileSync(idmapPath, 'utf-8')) as RvfIdmap;
      idmap = typeof parsed === 'object' && parsed !== null && typeof parsed.slots === 'object' ? parsed : { version: 1, slots: {} };
    } catch {
      return fail(`unreadable idmap sidecar: ${basename(idmapPath)}`);
    }
    // Manifest guard (R-i1): refuse a foreign embedding model/dim — no silent cross-space merge.
    const manifestPath = `${source}.manifest.json`;
    if (existsSync(manifestPath)) {
      try {
        const m = JSON.parse(readFileSync(manifestPath, 'utf-8')) as { model?: unknown; dim?: unknown };
        const configured = resolveEmbedModel(projectRoot);
        if ('error' in configured) return fail(configured.error);
        const manifest = {
          model: typeof m.model === 'string' ? m.model : configured.model,
          dim: typeof m.dim === 'number' ? m.dim : configured.dim,
          version: 1,
        };
        if (manifest.model !== configured.model || manifest.dim !== configured.dim) {
          return fail(`manifest mismatch: checkpoint (${String(manifest.model)}/${String(manifest.dim)}) ≠ local (${configured.model}/${configured.dim}) — run dz vector reindex; refusing a cross-embedding-space merge`);
        }
      } catch { /* unreadable manifest — tolerate; the idmap is the authority */ }
    }
    sourceDzIds = [...new Set(Object.values(idmap.slots))];
  }

  // 2. Resolve the TARGET engine (agentdb default, or rvf if configured).
  const resolved = pickEngine(projectRoot, opts);
  if (resolved.engine === undefined) return fail(resolved.reason ?? 'no vector engine available');
  const engine = resolved.engine;
  if (engine.importVectors === undefined) {
    return { imported: 0, skippedOrphans: 0, engine: engine.kind, source, error: `the ${engine.kind} engine cannot import precomputed vectors` };
  }

  // 3. ORPHAN GATE against the lexical source of truth.
  let records: MemoryRecord[];
  try {
    records = loadStoreRecords(projectRoot);
  } catch {
    records = [];
  }
  const byId = new Map<string, MemoryRecord>();
  for (const r of records) byId.set(r.id, r);
  let skippedOrphans = 0;
  const kept: { dzId: string; rec: MemoryRecord }[] = [];
  for (const dzId of sourceDzIds) {
    const rec = byId.get(dzId);
    if (rec === undefined) skippedOrphans += 1;
    else kept.push({ dzId, rec });
  }
  if (kept.length === 0) return { imported: 0, skippedOrphans, engine: engine.kind, source };

  // 4. VECTOR per kept dzId: injected verbatim vector, else RE-EMBED the local text (D7).
  let embed = opts.embed;
  if (embed === undefined && kept.some((k) => !injected.has(k.dzId))) {
    const emb = await resolveAgentdbEmbedder(projectRoot);
    if ('error' in emb) return { imported: 0, skippedOrphans, engine: engine.kind, source, error: emb.error };
    embed = (t) => emb.embed(t);
  }
  const rows: ImportVectorRow[] = [];
  for (const { dzId, rec } of kept) {
    const taskType = dzId.startsWith('dream:') ? 'dz-learning' : 'dz-teach';
    let vector = injected.get(dzId);
    if (vector === undefined) {
      const v = await boundedEmbed(embed!, `${taskType}: ${rec.text}`, timeoutMs);
      if (!(v instanceof Float32Array)) {
        return { imported: 0, skippedOrphans, engine: engine.kind, source, error: `embed failed: ${(v as { error: string }).error}` };
      }
      vector = v;
    }
    rows.push({ dzId, vector, text: rec.text, taskType, score: rec.score, metadata: { dzId } });
  }

  // 5. UPSERT-BY-dzId (re-import of the same dzIds REPLACEs in place — 0 new rows, nothing deleted).
  const up = await engine.importVectors(rows);
  if (up.error !== undefined) return { imported: up.imported, skippedOrphans, engine: engine.kind, source, error: up.error };
  return { imported: up.imported, skippedOrphans, engine: engine.kind, source };
}

/* ------------------------------------------------------------------ */
/*  Adapter A (default): AgentdbVectorEngine                           */
/* ------------------------------------------------------------------ */

/**
 * Option A: the `.dz/agentdb.db` ReasoningBank store. `upsert` delegates to the very same
 * {@link indexPatternsToAgentdb} rows the consolidate Option-C mirror writes today (schema
 * unchanged — the `agentdb-memory` MCP skill keeps reading them, NFR-7); `search`/`listIds`
 * are the new READONLY halves in `agentdb-index.ts`.
 */
function agentdbVectorEngine(projectRoot: string): VectorEngine {
  return {
    kind: 'agentdb',
    // A magnitude-normalising cosine over the stored vectors — comparable, and in the same space the
    // recall floors were calibrated in.
    similarityKind: 'cosine',
    async upsert(entries) {
      const r = await indexPatternsToAgentdb(
        projectRoot,
        entries.map((e) => ({
          taskType: e.taskType,
          text: e.text,
          score: e.score,
          ...(e.tags !== undefined ? { tags: e.tags } : {}),
          ...(e.metadata !== undefined ? { metadata: e.metadata } : {}),
          ...(e.uses !== undefined ? { uses: e.uses } : {}),
          ...(e.avgReward !== undefined ? { avgReward: e.avgReward } : {}),
        })),
      );
      return { indexed: r.indexed, ...(r.error !== undefined ? { error: r.error } : {}) };
    },
    async search(query, limit) {
      const r = await searchAgentdbPatterns(projectRoot, query, { limit });
      const hits: VectorHit[] = [];
      for (const h of r.hits) {
        if (h.dzId !== undefined) hits.push({ dzId: h.dzId, similarity: h.similarity, text: h.text });
      }
      return { hits, ...(r.error !== undefined ? { error: r.error } : {}) };
    },
    async listIds() {
      return listAgentdbDzIds(projectRoot);
    },
    async listPatternIds() {
      // the NARROWED scope — what `lexicalMirrorable` counts, so the two numbers are comparable
      return listAgentdbDzIds(projectRoot, { taskTypes: DZ_PATTERN_TASK_TYPES });
    },
    async importVectors(rows) {
      return importVectorsToAgentdb(
        projectRoot,
        rows.map((r) => ({
          dzId: r.dzId,
          vector: r.vector,
          text: r.text,
          taskType: r.taskType,
          score: r.score,
          ...(r.metadata !== undefined ? { metadata: r.metadata } : {}),
        })),
      );
    },
  };
}

/* ------------------------------------------------------------------ */
/*  Adapter B (opt-in): RvfVectorEngine                                */
/* ------------------------------------------------------------------ */

interface RvfIdmap {
  version: 1;
  /** rvf slot/label → dzId. */
  slots: Record<string, string>;
}

function rvfBase(projectRoot: string): string {
  return join(projectRoot, '.dz', 'memory', 'patterns.rvf');
}

function readRvfIdmap(projectRoot: string): RvfIdmap {
  try {
    const parsed = JSON.parse(readFileSync(`${rvfBase(projectRoot)}.idmap.json`, 'utf-8')) as RvfIdmap;
    return typeof parsed === 'object' && parsed !== null && typeof parsed.slots === 'object' ? parsed : { version: 1, slots: {} };
  } catch {
    return { version: 1, slots: {} };
  }
}

function guardRvfEmbedSpace(projectRoot: string, idmap: RvfIdmap): { ok: true; configured: EmbedModelConfig; version: number } | { ok: false; error: string } {
  const configured = resolveEmbedModel(projectRoot);
  if ('error' in configured) return { ok: false, error: configured.error };
  const guard = guardEmbedSpace({
    storePath: rvfBase(projectRoot),
    configured,
    hasRows: Object.keys(idmap.slots).length > 0,
    reindexHint: 'dz vector reindex',
  });
  if (!guard.ok) return { ok: false, error: guard.error };
  return { ok: true, configured, version: guard.manifest.version };
}

function writeRvfSidecars(projectRoot: string, idmap: RvfIdmap, configured: EmbedModelConfig, version: number): void {
  const base = rvfBase(projectRoot);
  mkdirSync(dirname(base), { recursive: true });
  writeFileSync(`${base}.idmap.json`, JSON.stringify(idmap, null, 2));
  const manifest = currentEmbedManifest(configured, version, '@ruvector/rvf');
  writeFileSync(`${base}.manifest.json`, JSON.stringify(
    manifest,
    null,
    2,
  ));
}

interface RvfStoreHandle {
  ingest: (id: string, vec: Float32Array) => Promise<unknown> | unknown;
  query: (vec: Float32Array, k: number) => Promise<unknown> | unknown;
  close?: (() => Promise<void> | void) | undefined;
  exportCheckpoint?: ((dest: string) => Promise<unknown> | unknown) | undefined;
}

/**
 * Open a `@ruvector/rvf` store, pinned to the REAL published SDK surface (grounded in
 * ruvector/npm/packages/rvf/src/index.ts + a live linux-x64 smoke against @ruvector/rvf@0.2.3):
 * the canonical class is `RvfDatabase` with `create(path, { dimensions })` → `ingestBatch([{id,
 * vector}])` → `query(vector, k)` returning `[{ id, distance }]` → `close()`. A few tolerant
 * fallbacks (add/insert, search) keep older/alt shapes working; anything unrecognized returns an
 * HONEST error (the D8 no-go evidence), never a throw. NOTE: RVF stores the vector under the `id`
 * we pass (= the dzId), so no slot↔id mapping is needed — the query result's `id` IS the dzId.
 */
export async function openRvfStore(mod: Record<string, unknown>, path: string, dimensions: number): Promise<RvfStoreHandle | { error: string }> {
  try {
    const dflt = mod['default'] as Record<string, unknown> | undefined;
    const cls = (mod['RvfDatabase'] ?? dflt?.['RvfDatabase'] ?? mod['RvfStore'] ?? mod['Store'] ?? dflt?.['RvfStore'] ?? dflt ?? mod) as {
      create?: (p: string, o: { dimensions?: number; dimension?: number }) => unknown;
      open?: (p: string, o: { dimensions?: number; dimension?: number }) => unknown;
    };
    let db: Record<string, unknown> | undefined;
    if (typeof cls.create === 'function') db = (await cls.create(path, { dimensions, dimension: dimensions })) as Record<string, unknown>;
    else if (typeof cls.open === 'function') db = (await cls.open(path, { dimensions, dimension: dimensions })) as Record<string, unknown>;
    else if (typeof cls === 'function') db = new (cls as unknown as new (p: string, o: { dimensions: number }) => Record<string, unknown>)(path, { dimensions });
    if (db === undefined) return { error: 'unsupported @ruvector/rvf API (no RvfDatabase.create/open/constructor) — record a D8 no-go' };
    const ingestBatch = (db['ingestBatch'] ?? db['ingest'] ?? db['add'] ?? db['insert']) as ((rows: Array<{ id: string; vector: Float32Array }>) => unknown) | undefined;
    const query = (db['query'] ?? db['search']) as ((vec: Float32Array, k: number) => unknown) | undefined;
    if (typeof ingestBatch !== 'function' || typeof query !== 'function') {
      return { error: 'unsupported @ruvector/rvf store surface (no ingestBatch/ingest + query/search) — record a D8 no-go' };
    }
    const close = db['close'];
    const exp = db['exportCheckpoint'] ?? db['export_checkpoint'] ?? db['checkpoint'];
    return {
      ingest: (id, vec) => ingestBatch.call(db, [{ id, vector: vec }]),
      query: (vec, k) => query.call(db, vec, k),
      close: typeof close === 'function' ? (close as () => void).bind(db) : undefined,
      exportCheckpoint: typeof exp === 'function' ? (exp as (d: string) => unknown).bind(db) : undefined,
    };
  } catch (err) {
    return { error: `@ruvector/rvf store open failed: ${err instanceof Error ? err.message : String(err)}` };
  }
}

async function loadRvfModule(
  projectRoot: string,
): Promise<{ ok: true; mod: Record<string, unknown> } | { ok: false; error: string }> {
  try {
    const req = createRequire(join(projectRoot, 'package.json'));
    const mod = (await import(pathToFileURL(req.resolve('@ruvector/rvf')).href)) as Record<string, unknown>;
    return { ok: true, mod };
  } catch (err) {
    return { ok: false, error: `@ruvector/rvf failed to load: ${err instanceof Error ? err.message : String(err)}` };
  }
}

/**
 * Option B: the portable single-file VECTOR form (`.rvf`, magic `0x52564653`) with
 * `.idmap.json` (slot ↔ dzId) and `.manifest.json` (model/dim — Constraint 5 staleness
 * detection) sidecars. Embeddings come from agentdb's `EmbeddingService` when resolvable —
 * with NEITHER embedder the engine degrades gracefully with an honest reason (05 §3.6).
 */
function rvfVectorEngine(projectRoot: string): VectorEngine {
  const noEmbedder = 'rvf engine present but no embedder — install agentdb (dz setup --memory agentdb)';
  return {
    kind: 'rvf',
    // `-distance`, unbounded, metric not established: good for ORDER, never for a threshold.
    similarityKind: 'rank-only',
    async upsert(entries) {
      const idmap = readRvfIdmap(projectRoot);
      const guard = guardRvfEmbedSpace(projectRoot, idmap);
      if (!guard.ok) return { indexed: 0, error: guard.error };
      const emb = await resolveAgentdbEmbedder(projectRoot);
      if ('error' in emb) return { indexed: 0, error: noEmbedder };
      const loaded = await loadRvfModule(projectRoot);
      if (!loaded.ok) return { indexed: 0, error: loaded.error };
      const store = await openRvfStore(loaded.mod, rvfBase(projectRoot), DEFAULT_EMBED_DIM);
      if ('error' in store) return { indexed: 0, error: store.error };
      try {
        let indexed = 0;
        for (const e of entries) {
          const vec = await emb.embed(`${e.taskType}: ${e.text}`);
          await store.ingest(e.dzId, vec); // RVF stores the vector UNDER id = dzId (no slot mapping)
          idmap.slots[e.dzId] = e.dzId; // sidecar keeps the dzId set for listIds/observability
          indexed += 1;
        }
        await store.close?.();
        writeRvfSidecars(projectRoot, idmap, guard.configured, guard.version);
        return { indexed };
      } catch (err) {
        return { indexed: 0, error: `rvf upsert failed: ${err instanceof Error ? err.message : String(err)}` };
      }
    },
    async search(query, limit) {
      const emb = await resolveAgentdbEmbedder(projectRoot);
      if ('error' in emb) return { hits: [], error: noEmbedder };
      const idmap = readRvfIdmap(projectRoot);
      const guard = guardRvfEmbedSpace(projectRoot, idmap);
      if (!guard.ok) return { hits: [], error: guard.error };
      const loaded = await loadRvfModule(projectRoot);
      if (!loaded.ok) return { hits: [], error: loaded.error };
      const store = await openRvfStore(loaded.mod, rvfBase(projectRoot), DEFAULT_EMBED_DIM);
      if ('error' in store) return { hits: [], error: store.error };
      try {
        const raw = await store.query(await emb.embed(query), limit);
        await store.close?.();
        const hits: VectorHit[] = [];
        if (Array.isArray(raw)) {
          for (const item of raw as Array<Record<string, unknown> | [unknown, unknown]>) {
            const id = Array.isArray(item) ? item[0] : item['id'] ?? item['slot'] ?? item['label'];
            const distance = Array.isArray(item) ? item[1] : item['distance'] ?? item['score'] ?? item['similarity'];
            // RVF returns the id we ingested (= dzId); the sidecar is a safety join for alt shapes.
            const dzId = idmap.slots[String(id)] ?? (typeof id === 'string' ? id : undefined);
            // distance: lower = closer → negate so higher = better (RRF ranks by position regardless).
            if (dzId !== undefined) hits.push({ dzId, similarity: typeof distance === 'number' ? -distance : 0 });
          }
        }
        return { hits };
      } catch (err) {
        return { hits: [], error: `rvf search failed: ${err instanceof Error ? err.message : String(err)}` };
      }
    },
    async listIds() {
      // Sidecar-only read — no SDK load needed for observability/dedup.
      return { ids: [...new Set(Object.values(readRvfIdmap(projectRoot).slots))] };
    },
    async importVectors(rows) {
      const idmap = readRvfIdmap(projectRoot);
      const guard = guardRvfEmbedSpace(projectRoot, idmap);
      if (!guard.ok) return { imported: 0, error: guard.error };
      const loaded = await loadRvfModule(projectRoot);
      if (!loaded.ok) return { imported: 0, error: loaded.error };
      const store = await openRvfStore(loaded.mod, rvfBase(projectRoot), DEFAULT_EMBED_DIM);
      if ('error' in store) return { imported: 0, error: store.error };
      try {
        let imported = 0;
        for (const r of rows) {
          await store.ingest(r.dzId, r.vector); // RVF ingest is upsert-by-id (id = dzId) — no duplicates
          idmap.slots[r.dzId] = r.dzId;
          imported += 1;
        }
        await store.close?.();
        writeRvfSidecars(projectRoot, idmap, guard.configured, guard.version);
        return { imported };
      } catch (err) {
        return { imported: 0, error: `rvf import failed: ${err instanceof Error ? err.message : String(err)}` };
      }
    },
    async exportCheckpoint(dest) {
      try {
        const base = rvfBase(projectRoot);
        if (!existsSync(base)) return { error: `no ${base} yet — teach/consolidate with the rvf engine first` };
        const loaded = await loadRvfModule(projectRoot);
        let exported = false;
        if (loaded.ok) {
          const store = await openRvfStore(loaded.mod, base, 384);
          if (!('error' in store) && store.exportCheckpoint !== undefined) {
            await store.exportCheckpoint(dest);
            await store.close?.();
            exported = true;
          } else if (!('error' in store)) {
            await store.close?.();
          }
        }
        if (!exported) copyFileSync(base, dest); // append-only format — a file copy IS a checkpoint
        for (const sidecar of ['.idmap.json', '.manifest.json']) {
          if (existsSync(`${base}${sidecar}`)) copyFileSync(`${base}${sidecar}`, `${dest}${sidecar}`);
        }
        return {};
      } catch (err) {
        return { error: `rvf export failed: ${err instanceof Error ? err.message : String(err)}` };
      }
    },
  };
}

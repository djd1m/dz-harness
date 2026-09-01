/**
 * feature-adr durable checkpoints — the PURE half (backlog 49e4a95b).
 *
 * Problem: .claude/workflows/feature-adr.js restarts an L/XL run from scratch when its session dies
 * (the exact failure that forced usage-adaptive routing — one run cost 623k subagent tokens), and the
 * STANDARD L/XL two-phase flow (stop-after-plan → re-invoke) re-runs router+design+plan wholesale.
 * The Workflow harness's own resumeFromRunId is same-session only, so it cannot cover either case.
 *
 * Design: the heavyweight state is ALREADY durable — the 00–09 artifacts in features/<slug>/. The
 * checkpoint layer is deliberately THIN: after each expensive stage the workflow appends one JSONL
 * line { stage, inputHash, result } to features/<slug>/.fa-state/checkpoints.jsonl (via a cheap
 * effort-low agent — the workflow sandbox has no fs). On the next run with the same slug, a stage is
 * SKIPPED only when its recorded inputHash matches the freshly computed one AND its expected artifact
 * is still on disk. Granularity is per-STAGE, not per-agent-call: a death mid-Step-7 re-runs Step 7,
 * never Steps 0–6.
 *
 * Provenance: concept (checkpoint keyed by input hash + call cache) from ADR-157
 * darwin-checkpoints-durable-execution (status PROPOSED) in agent-harness-generator. Its "~39% resume
 * saving" figure is from a SYNTHETIC deterministic simulation — deliberately NOT quoted as expected
 * field saving anywhere in this feature.
 *
 * Everything here is pure and deterministic (no Date/random — the workflow sandbox forbids them);
 * the workflow script mirrors these functions inline (it is self-contained and cannot import), and
 * the wiring test asserts the mirror stays present.
 */

/** Blob version stamp read by scripts/gen-loop-blobs.mjs (feature loop-designer, ADR-004) — the
 * ONLY loop-designer change to this canonical file; bump when any blob-exported semantic changes. */
export const BLOB_VERSION = '1.2.0';

/** Stages the workflow checkpoints, in pipeline order. Cheap side-channel agents (usage probes,
 * fa-record, auto-cost selects) are never checkpointed; the opt-in Delivery gate re-runs by design
 * (advisory verdicts should reflect the CURRENT tree). */
export const CHECKPOINT_STAGES = ['router', 'design', 'plan', 'code', 'qe', 'fleet'] as const;
export type CheckpointStage = (typeof CHECKPOINT_STAGES)[number];

/** The artifact(s) (relative to features/<slug>/) whose PRESENCE a resume additionally requires in
 * 'auto' mode — EVERY listed path must exist. null = result-only stage (hash match suffices).
 * Tier-dependent stages (design) take extra artifacts at the call site via `extraArtifacts` —
 * an M+ design must probe its ADR/ideation/architecture files too, not just requirements
 * (Codex QE #2: a one-file probe accepted a materially incomplete design). */
export const STAGE_ARTIFACTS: Record<CheckpointStage, string | null> = {
  // Since 2026-08-21 Step 0 WRITES this, so the router stage has something to be witnessed by. It was
  // `null` — a stage that promises nothing verifiable — which is precisely how the tier came to be
  // recorded nowhere while a run was alive, and how C4 lost its input without anyone noticing.
  router: '00_complexity_assessment.md',
  design: '01_requirements.md',
  plan: '06_implementation_plan.md',
  code: '07_code_changes/change_manifest.md',
  qe: '08_qe_report.md',
  fleet: '09_fleet_qe_assessment.md',
};

/** A checkpoint line as persisted (one JSON object per line). */
export interface CheckpointEntry {
  stage: string;
  inputHash: string;
  result: unknown;
  /**
   * ISO-8601 UTC instant the checkpoint was WRITTEN, supplied by the writer.
   *
   * OPTIONAL by necessity and by design. The sandboxed workflow has no `Date` at all, so it cannot
   * stamp its own records — only the CLI that performs the append can, and only for the write, not
   * for the stage's start. Absent `ts` therefore means UNKNOWN, never zero and never "instant": a
   * pre-2026-08-25 record simply predates the field, and a reader must say so rather than compute a
   * duration from a missing number.
   *
   * Why this exists at all: until it was added, `.fa-state/checkpoints.jsonl` carried no time field
   * of any kind, so across 241 feature dirs the question "how long did this stage take" had no
   * answer for a single run — and no FUTURE run could answer it either. This is the whole of the
   * fix: one optional field, and every run from now on can be placed on a timeline.
   *
   * Deliberately NOT accompanied by a {@link CKPT_SCHEMA_VERSION} bump. The version is SALTED into
   * every input hash, so bumping it would hash every in-flight checkpoint stale and force each
   * feature to re-run router+design+plan. Stage semantics did not change; an additive optional field
   * that old readers ignore and new readers treat as unknown is not a format break.
   */
  ts?: string;
}

/** Oversize guard: a result JSON above this is NOT checkpointed (the stage simply re-runs on resume).
 * Keeps the read-back prompt bounded; artifacts on disk carry the heavy state anyway. */
export const CHECKPOINT_MAX_RESULT_CHARS = 12_000;

/** Checkpoint format/logic version — SALTED into every input hash. Bump it whenever the workflow's
 * stage semantics, prompts, or composite result shapes change: every pre-existing checkpoint then
 * hashes stale and re-runs, instead of an old-format entry resuming into new logic (Codex QE #5). */
/**
 * Bumped 'fa-ckpt-2' → 'fa-ckpt-3' on 2026-08-20: the `design` entry changed meaning. It used to be
 * the ONE record for the whole parallel design fan; it is now a completeness marker sitting above
 * four per-sibling records. A stale-format entry must hash stale rather than resume into new logic,
 * so every in-flight `.fa-state/` re-runs router+design+plan once. That is the intended one-time
 * price of the change, not an accident.
 */
export const CKPT_SCHEMA_VERSION = 'fa-ckpt-3';

/**
 * Router-stage hash token. Step 0's CONTRACT changed on 2026-08-21 — it must now WRITE
 * `00_complexity_assessment.md` with an acid table — and a contract change that leaves the hash
 * alone lets a pre-change router entry resume: the resume gate only asks whether the artifact is
 * PRESENT, and one of the 66 features that already had a (tableless) file satisfies it. Step 0 then
 * never re-runs, the acid table is never written, and C4 goes on skipping — the exact defect this
 * change exists to close, resurrected through the resume path.
 *
 * Scoped like `LANDING_HASH_TOKEN` (003-10) rather than bumping CKPT_SCHEMA_VERSION: only the router
 * stage re-runs once, while design/plan/code/qe checkpoints stay valid. A global bump would re-spend
 * every in-flight stage to fix one.
 */
export const ROUTER_CONTRACT_TOKEN = 'router-writes-00-v1';

/** FNV-1a 32-bit over UTF-16 code units, hex-encoded (one pass; building block for the 64-bit form). */
export function fnv1a(str: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

/** 64 bits from two independent FNV-1a passes (plain + salted). A single 32-bit hash admits
 * findable collisions (Codex QE #9 produced a real pair at `11a08b58`); two passes make the
 * single-pair collision odds ~2^-64 — adequate for one slug's checkpoint file. */
export function fnv1a64(str: string): string {
  return fnv1a(str) + fnv1a('fa-ckpt-salt' + str);
}

/** The stage's input fingerprint: a JSON-tuple (delimiter-ambiguity class — never a separator join)
 * of the schema version + stage name + every input that would change the stage's output, hashed.
 * Upstream stage RESULTS are included as their serialized form, so a stale upstream auto-invalidates
 * downstream. HONEST SCOPE: the hash proves the run INPUTS are unchanged — it does NOT fingerprint
 * the working tree (a crash-resume legitimately sees the dead run's uncommitted writes, so a tree
 * hash would invalidate every real resume). Tree-level staleness is out of the checkpoint contract:
 * use resume:'never' (or delete .fa-state/) after manual edits, and re-QE independently — the ADR
 * names this as the accepted limitation (Codex QE #1). */
export function checkpointInputHash(stage: string, parts: readonly unknown[]): string {
  return fnv1a64(JSON.stringify([CKPT_SCHEMA_VERSION, stage, ...parts.map((p) => (p === undefined ? null : p))]));
}

export type ResumeMode = 'auto' | 'never' | 'force';

/** Normalize args.resume: anything but the two explicit strings means the default 'auto'. */
export function resumeMode(raw: unknown): ResumeMode {
  return raw === 'never' ? 'never' : raw === 'force' ? 'force' : 'auto';
}

export interface ResumeDecision {
  resume: boolean;
  reason:
    | 'resumed'
    | 'resumed-force'
    | 'mode-never'
    | 'no-checkpoint'
    | 'stale-input'
    | 'artifact-missing';
}

/** The pure resume decision. 'auto' resumes only on (hash match AND every required artifact
 * present); 'force' trusts the hash alone; 'never' always runs live. A STALE-INPUT hash NEVER
 * resumes in any mode — force skips only the artifact probe, never the input check (a checkpoint
 * for different inputs is a different feature). A malformed/null recorded result is treated as
 * no-checkpoint (Codex QE #8 — a null result must not resume as a real one). */
/** The tier-active design sub-stages, in fan order. Namespaced keys are plain strings, so the
 *  checkpoint parser's last-wins-per-stage rule and its malformed-line erase rule work unchanged. */
export const DESIGN_SUBSTAGES = ['requirements', 'adr', 'qcsd', 'architecture'] as const;
export type DesignSubstage = (typeof DESIGN_SUBSTAGES)[number];

/** `design:requirements`, … — the checkpoint stage key for one sibling. */
export function designStageKey(sub: DesignSubstage | string): string {
  return 'design:' + sub;
}

export interface DesignFanVerdict {
  complete: boolean;
  missingSubstages: string[];
  missingArtifacts: string[];
  /** Why the fan is not complete — 'ok' when it is. Never collapse 'probe-not-established' into
   *  'ok': a gate that could not read its inputs is INCONCLUSIVE, and inconclusive is not a pass. */
  reason: 'ok' | 'substage-missing' | 'artifact-missing' | 'probe-not-established';
}

/**
 * SP-1 (completeness). The `design` stage may hand a value to Step 6 ONLY when every tier-required
 * sibling produced a result AND every tier-required design artifact is on disk.
 *
 * This is the property the old all-or-nothing WRITE gate was implementing by accident, and the
 * reason it must survive the split: a one-file probe once accepted a design missing its ADR and
 * architecture (Codex QE #2). Splitting the write gate without keeping this would reopen that hole,
 * so the two are landed together and tested together.
 *
 * It is deliberately a READ-side predicate. What may be WRITTEN (one sibling's completed work) and
 * what may be CONSUMED (a whole design) are different questions; the previous code answered the
 * second by crippling the first, which is how one dead agent discarded three finished artifacts.
 */
export function decideDesignFanResume(opts: {
  /**
   * The LIVE result of each required sibling, in `required` order — what the fan just returned.
   *
   * Round 1 of cross-family review graded this D and was right: the first version read the
   * START-OF-RUN checkpoint snapshot instead. That snapshot is wrong in both directions. A sibling
   * that succeeded THIS run is absent from it, and — the dangerous half — a stale non-null entry
   * from a PREVIOUS run stays in it even when this run's retry returned null, so an incomplete
   * design could be declared complete. That is the exact hole the old all-or-nothing write gate
   * existed to prevent, reopened by reading the wrong source.
   *
   * The live result is authoritative and free: a sibling that returns non-null wrote its artifact,
   * and a sibling that died returns null. Nothing needs to be re-probed to know that.
   */
  results: readonly unknown[];
  required: readonly string[];
  /** Every artifact the tier requires from this fan. Empty ⇒ the artifact half is not checked. */
  artifacts: readonly string[];
  /**
   * A listing taken AFTER the fan ran — never the start-of-run one, which is why the parameter is
   * named for that and not just `listing`. Rounds 2 and 3 pinned both halves of this:
   *   • round 2 — fed the START-OF-RUN listing, the probe called every fresh M+ fan incomplete,
   *     because a listing taken before the fan cannot contain what the fan is about to write;
   *   • round 3 — with the probe removed entirely, a sibling that returns non-null having written
   *     only its primary artifact (L-tier requirements writes 01_requirements.md and skips
   *     02_research.md) was accepted, and Step 6 planned with no research behind it. A non-null
   *     result is the agent's own word; it is not evidence that a file exists.
   * `null` means the probe could not be read. That is INCONCLUSIVE, not clean.
   */
  postRunListing: ReadonlySet<string> | null;
}): DesignFanVerdict {
  const missingSubstages: string[] = [];
  opts.required.forEach((sub, i) => {
    const r = opts.results[i];
    if (r === null || r === undefined) missingSubstages.push(sub);
  });
  const missingArtifacts: string[] = [];
  let probeMissing = false;
  if (opts.artifacts.length > 0) {
    if (opts.postRunListing === null) probeMissing = true;
    else for (const rel of opts.artifacts) if (!opts.postRunListing.has(rel)) missingArtifacts.push(rel);
  }
  // Substage first: a dead sibling explains its own missing artifacts, and naming the artifacts
  // instead would send the operator looking for a file when the agent is what died.
  const reason: DesignFanVerdict['reason'] =
    missingSubstages.length > 0 ? 'substage-missing'
    : probeMissing ? 'probe-not-established'
    : missingArtifacts.length > 0 ? 'artifact-missing'
    : 'ok';
  return { complete: reason === 'ok', missingSubstages, missingArtifacts, reason };
}

export function decideCheckpointResume(opts: {
  mode: ResumeMode;
  entry: CheckpointEntry | undefined;
  inputHash: string;
  artifactRel: string | readonly string[] | null;
  listing: ReadonlySet<string>;
}): ResumeDecision {
  if (opts.mode === 'never') return { resume: false, reason: 'mode-never' };
  if (!opts.entry || opts.entry.result === null || opts.entry.result === undefined) {
    return { resume: false, reason: 'no-checkpoint' };
  }
  if (opts.entry.inputHash !== opts.inputHash) return { resume: false, reason: 'stale-input' };
  if (opts.mode === 'force') return { resume: true, reason: 'resumed-force' };
  const required = opts.artifactRel === null ? [] : (typeof opts.artifactRel === 'string' ? [opts.artifactRel] : opts.artifactRel);
  for (const rel of required) {
    if (!opts.listing.has(rel)) return { resume: false, reason: 'artifact-missing' };
  }
  return { resume: true, reason: 'resumed' };
}

/** Serialize one checkpoint line, or null when the result is null/oversize/unserializable —
 * the caller logs the skip loudly; a missing checkpoint only costs a re-run, never corrupts.
 * A null result is never persisted (Codex QE #8: it would later parse as a resumable entry). */
export function serializeCheckpoint(stage: string, inputHash: string, result: unknown): string | null {
  if (result === null || result === undefined) return null;
  let line: string;
  try {
    line = JSON.stringify({ stage, inputHash, result });
  } catch {
    return null;
  }
  if (typeof line !== 'string' || line.length > CHECKPOINT_MAX_RESULT_CHARS) return null;
  return line;
}

export interface ParsedCheckpointRead {
  entries: Record<string, CheckpointEntry>;
  listing: Set<string>;
  malformedLines: number;
}

/** Sentinel separating the checkpoint file body from the artifact listing in the single read-back
 * command's stdout. */
export const CHECKPOINT_LS_SENTINEL = '---FA-CKPT-LS---';

/** Parse the read-back agent's stdout: JSONL entries (LAST occurrence of a stage wins — a re-run
 * overwrites by append), then the sentinel ON ITS OWN LINE, then one artifact path per line
 * (relative to the feature dir). The sentinel match is LINE-ANCHORED: JSON.stringify never emits
 * literal newlines, so a sentinel string INSIDE a recorded result shares its line with JSON syntax
 * and can never split the stream (Codex QE #10). Malformed JSONL lines are COUNTED, never silently
 * ignored (corruption is named); entries with a null result are malformed, not resumable. */
export function parseCheckpointRead(text: string): ParsedCheckpointRead {
  const out: ParsedCheckpointRead = { entries: {}, listing: new Set(), malformedLines: 0 };
  const raw = String(text ?? '');
  const lines = raw.split('\n');
  const sentinelAt = lines.findIndex((l) => l.trim() === CHECKPOINT_LS_SENTINEL);
  const body = sentinelAt === -1 ? lines : lines.slice(0, sentinelAt);
  const ls = sentinelAt === -1 ? [] : lines.slice(sentinelAt + 1);
  for (const line of body) {
    const t = line.trim();
    if (t === '') continue;
    try {
      const e = JSON.parse(t) as CheckpointEntry;
      if (e && typeof e === 'object' && typeof e.stage === 'string' && typeof e.inputHash === 'string' && 'result' in e && e.result !== null && e.result !== undefined) {
        out.entries[e.stage] = e;
      } else {
        // last-wins holds for BAD records too: a stage-identifiable null/invalid record ERASES the
        // older entry for that stage instead of silently reactivating it (Codex QE r2 #6).
        if (e && typeof e === 'object' && typeof (e as CheckpointEntry).stage === 'string') delete out.entries[(e as CheckpointEntry).stage];
        out.malformedLines++;
      }
    } catch {
      out.malformedLines++;
    }
  }
  for (const line of ls) {
    const t = line.trim();
    if (t !== '') out.listing.add(t);
  }
  return out;
}

/** Single-quote shell escaping (the workflow's shq twin). */
export function shellQuote(s: string): string {
  return "'" + String(s).replace(/'/g, "'\\''") + "'";
}

/** The one Bash command the read-back agent runs: checkpoint file body (absent file = empty),
 * the sentinel, then the artifact listing as feature-dir-relative paths (find prints them with a
 * leading ./ that sed strips). Never fails: every leg is || true. */
export function checkpointReadCmd(fdirAbs: string): string {
  const q = shellQuote(fdirAbs);
  return (
    'cat ' + q + '/.fa-state/checkpoints.jsonl 2>/dev/null || true; ' +
    "echo '" + CHECKPOINT_LS_SENTINEL + "'; " +
    'cd ' + q + ' 2>/dev/null && find . -maxdepth 2 -type f 2>/dev/null | sed "s|^\\./||" || true'
  );
}

/** The one Bash command the write agent runs: mkdir the state dir, then append ONE line. The line
 * is single-quote-escaped as a whole — JSON.stringify output never contains literal newlines, so
 * printf '%s\n' emits exactly one record. */
export function checkpointAppendCmd(fdirAbs: string, line: string): string {
  const dir = shellQuote(fdirAbs + '/.fa-state');
  const file = shellQuote(fdirAbs + '/.fa-state/checkpoints.jsonl');
  return 'mkdir -p ' + dir + " && printf '%s\\n' " + shellQuote(line) + ' >> ' + file;
}

// ─────────────────────────────────────────────────────────────────────────────
// Training-pair capture (backlog 70e0f083) — the PURE half.
//
// Goal: fully-local development on compact models in 4–6 months needs a dataset of
// STAGE INPUT (full context+prompt) → STAGE OUTPUT (artifact/result) → EVALUATION
// (QE grade + the lessons injected into context) records. Everything is already in
// hand at the moment each feature-adr stage completes — so capture is instrumented
// NOW (every un-captured run is a lost pair); the dataset itself is built later.
//
// Storage: ONE JSONL file per stage under .dz/fa-training/<slug>/<stage>.jsonl
// (owner decision 2026-08). Deliberately NOT gitignored (owner decision — pairs may
// contain target-repo code; the capture dir carries a README privacy note instead).
//
// Stage asymmetry (the reason provenance.family is load-bearing): the downstream
// dataset must honour the cross-model rule — QE pairs must come from a DIFFERENT
// family than the coder's pairs; router/plan distill easily, code is hardest.
//
// Pure and deterministic like the checkpoint half: ts is PASSED IN (never read from a clock
// — the workflow sandbox forbids Date, and tests must stay deterministic); the
// workflow mirrors these functions inline and fills ts shell-side via sed.
// ─────────────────────────────────────────────────────────────────────────────

export type CaptureMode = 'capture' | 'backfill' | 'skip-disabled' | 'skip-empty';

/** Decide whether this completion is captured. A resumed stage is backfilled rather than
 * skipped: its input (stage template + args) and checkpointed output are both in scope at the
 * capture site, so the pair is deterministically reconstructible. trainingPairBackfillCmd's
 * persistent atomic mark makes that write at-most-once, so concurrent invocations and later
 * runIds cannot double-append the same pair. */
export function decideCaptureMode(opts: { enabled: boolean; resumed: boolean; recordCount: number }): CaptureMode {
  if (!opts.enabled) return 'skip-disabled';
  if (!Number.isInteger(opts.recordCount) || opts.recordCount <= 0) return 'skip-empty';
  return opts.resumed ? 'backfill' : 'capture';
}

export type CaptureFailureReason = 'threw' | 'unserializable' | 'unverified' | 'backfill-unverified' | 'empty-output';

export interface CaptureFailureRecord {
  stage: string;
  mode: CaptureMode | null;
  reason: CaptureFailureReason;
  detail: string | null;
}

/** Normalize capture failures for collection by the caller. This recorder must never throw:
 * replacing the original capture failure with a reporting failure would hide the real cause. */
export function captureFailureRecord(stage: unknown, mode: unknown, reason: unknown, detail: unknown): CaptureFailureRecord {
  const normalizedStage = typeof stage === 'string' && stage.trim() !== '' ? stage : 'unknown';
  const normalizedMode: CaptureMode | null =
    mode === 'capture' || mode === 'backfill' || mode === 'skip-disabled' || mode === 'skip-empty'
      ? mode
      : null;
  const normalizedReason: CaptureFailureReason =
    reason === 'threw' || reason === 'unserializable' || reason === 'unverified' || reason === 'backfill-unverified' || reason === 'empty-output'
      ? reason
      : 'threw';
  let normalizedDetail: string | null = null;
  if (detail !== null && detail !== undefined) {
    try {
      const text = String(detail);
      if (text !== '') normalizedDetail = text.length > 500 ? text.slice(0, 500) + '…' : text;
    } catch {
      normalizedDetail = null;
    }
  }
  return { stage: normalizedStage, mode: normalizedMode, reason: normalizedReason, detail: normalizedDetail };
}

/** Training-pair record format version. Bump on any field-shape change. */
export const TRAINPAIR_SCHEMA_VERSION = 'fa-trainpair-3';

/** Oversize guard cap over input+output combined (same posture as
 * CHECKPOINT_MAX_RESULT_CHARS, sized for full stage prompts): an over-cap pair is
 * TRUNCATED with a named marker + a hash of the full text — never silently dropped
 * (a lost pair is a lost training sample), never unbounded (a 10MB line would make
 * the JSONL unusable and the write-agent prompt explode). */
export const TRAINPAIR_MAX_IO_CHARS = 48_000;

export type TrainingPairFamily = 'claude' | 'codex';

/** The family a model spec/label/runner-name belongs to. Family ∈ {claude, codex} —
 * the field the cross-model dataset rule stands on. Anything naming codex/gpt/openai
 * is 'codex' (incl. 'codex-fallback' — codex ACTUALLY produced that stage); everything
 * else (opus/sonnet/fable/haiku, role agentTypes, 'claude-fallback') is 'claude'. */
export function trainingPairFamily(spec: unknown): TrainingPairFamily {
  return /codex|gpt|openai/i.test(String(spec ?? '')) ? 'codex' : 'claude';
}

export interface TrainingPairEvaluation {
  /** The QE grade for this pair, or null when the stage honestly has none (router). */
  grade: string | null;
  /** Who graded it (runner + model label), or null when ungraded. */
  gradedBy: string | null;
  /** Lesson texts/ids recalled into THIS stage's context (Step-0 recall). */
  lessonsInjected: string[];
}

export interface TrainingPairProvenance {
  /** The model label that produced the stage output. */
  model: string;
  /** The model FAMILY — load-bearing for the cross-model dataset rule. */
  family: TrainingPairFamily;
  /** The stage role: 'router' | 'design:*' | 'planner' | 'coder' | 'reviewer' | 'fleet-qe'. */
  role: string;
  tokens: number | null;
  minutes: number | null;
}

/** Resolved routing axes captured with every pair for later Fable-vs-grade analysis. */
export interface TrainingPairBudget {
  primary: 'claude' | 'codex';
  claude: 'normal' | 'eco';
  codex: 'normal' | 'eco';
  preset: 'normal' | 'eco' | 'hybrid' | 'custom' | 'unset';
}

export interface TrainingPairTruncation {
  /** Original (pre-truncation) char counts + full-text hashes — what was cut is NAMED. */
  inputChars: number;
  outputChars: number;
  inputHash: string;
  outputHash: string;
}

/** One SFT-ready record: prompt → completion → evaluation, one JSON object per line. */
export interface TrainingPair {
  schema: string;
  slug: string;
  stage: string;
  /** ts is the CAPTURE time. On a record with captureMode: 'backfill' that is the RECONSTRUCTION time, NOT the stage's observation time — the original stage's timing lives in that run's .fa-state checkpoint. */
  ts: number | string | null;
  input: string;
  output: string;
  evaluation: TrainingPairEvaluation;
  provenance: TrainingPairProvenance;
  budgetMode: TrainingPairBudget | null;
  truncated: TrainingPairTruncation | null;
  captureMode: 'capture' | 'backfill';
  resumed: boolean;
}

/** Per-stage JSONL path, relative to the repo root. ONE file per stage. */
export function trainingPairPath(slug: string, stage: string): string {
  return '.dz/fa-training/' + slug + '/' + stage + '.jsonl';
}

/** README dropped once into the capture dir. The caveat is documented ON DISK because the
 * directory is deliberately not gitignored (explicit owner decision, 2026-08). */
export const TRAINPAIR_PRIVACY_NOTE =
  "feature-adr TRAINING PAIRS (backlog 70e0f083): per-stage SFT records - STAGE INPUT (full prompt/context) -> STAGE OUTPUT (artifact/result) -> EVALUATION (QE grade + injected lessons) with model+family provenance; one JSONL file per stage per slug. PRIVACY: pairs may contain TARGET-REPO CODE and full prompts. This directory is NOT gitignored yet by explicit owner decision - review contents before sharing or publishing anything that embeds it. ts is the CAPTURE time. On a record with captureMode: 'backfill' that is the RECONSTRUCTION time, NOT the stage's observation time — the original stage's timing lives in that run's .fa-state checkpoint.";

/** Coerce a stage input/output to text: strings pass through; objects serialize to JSON;
 * an unserializable value degrades to String(v) — buildTrainingPair NEVER throws (capture
 * is non-blocking by contract). */
/** Marker pair of the operator-profile block (feature operator-profile, ADR-001 Decision 5).
 * DELIBERATE LOCAL COPIES of profile.ts's PROFILE_MARKER_START/END: this module stays import-free
 * so the workflow can mirror it inline. `test/profile-redaction.test.ts` pins the pairs equal. */
export const TP_PROFILE_MARKER_START = '<!-- dz:profile:start -->';
export const TP_PROFILE_MARKER_END = '<!-- dz:profile:end -->';

/** What a redacted block is replaced with — visible in the dataset, so a missing profile is
 * distinguishable from a never-present one. */
export const TP_PROFILE_REDACTED = '[dz:profile REDACTED]';

/**
 * Strip every operator-profile block from `text` BEFORE a training pair is persisted.
 *
 * Why here and not "the guard already says never write the profile into a project": training-pair
 * capture records the FULL prompt as the model received it into `.dz/fa-training/`, which is
 * deliberately NOT gitignored — so a profile injected into context would reach a committable
 * directory, and the never-in-a-project guard would be defeated through this path (ADR-001
 * Decision 5, exit 3). Redaction at the single assembly seam closes it for capture AND backfill.
 *
 * Semantics: every complete `start…end` span is replaced (markers included) with
 * {@link TP_PROFILE_REDACTED}. A START marker with no matching END fails CLOSED — everything from
 * the marker to the end of the text is dropped (over-redaction is a lost training sample;
 * under-redaction is a personal-data leak). Text without markers passes through byte-identical.
 * Works on JSON-stringified payloads too: the marker literals contain no characters JSON escapes.
 */
export function redactProfileBlock(text: string): string {
  if (typeof text !== 'string' || text === '') return typeof text === 'string' ? text : '';
  let out = '';
  let rest = text;
  for (;;) {
    const start = rest.indexOf(TP_PROFILE_MARKER_START);
    if (start === -1) return out + rest;
    out += rest.slice(0, start) + TP_PROFILE_REDACTED;
    const end = rest.indexOf(TP_PROFILE_MARKER_END, start + TP_PROFILE_MARKER_START.length);
    if (end === -1) return out; // unterminated block: fail closed, drop the tail
    rest = rest.slice(end + TP_PROFILE_MARKER_END.length);
  }
}

/**
 * Deep redaction over an already-PARSED training-pair payload — the PERSIST-SIDE half of CF-6.
 *
 * Why a second entry point next to {@link redactProfileBlock}: the DEFAULT-ON capture in the
 * canonical workflow builds its pair with an INLINE mirror of buildTrainingPair and hands the
 * serialised JSON to `dz feature-adr-record` — a path that never passes through the core builder.
 * Redacting at the builder alone therefore guarded the path that does NOT run (Codex cross-family
 * finding, 2026-08-28: guard 1 defeated through guard 3, one seam further down — the exact shape
 * ADR-001 Decision 5 names). This function runs inside `decideRecordWrite` (run-records.ts), the
 * one decision every witnessed training-pair write funnels through, so a FUTURE pair builder is
 * covered without patching its caller.
 *
 * Semantics: every string leaf (keys included) goes through {@link redactProfileBlock} — same
 * fail-closed rule on an unterminated block; arrays and plain objects are walked; numbers,
 * booleans and null pass through untouched. A payload with no markers anywhere round-trips to a
 * deep-equal value.
 *
 * Two mechanics, both cross-family findings (2026-08-28), both load-bearing:
 *
 * - Rebuilt objects have a NULL prototype, so every JSON key — `__proto__` included — lands as an
 *   OWN property. The previous `{}` + assignment invoked the inherited `__proto__` SETTER for a
 *   payload like `{"slug":"s","stage":"code","__proto__":{"input":"i","output":"o"}}`: the result
 *   then INHERITED input/output (the shape check passed) while serialization dropped them — an
 *   invalid pair reported `written`. With own-key reconstruction the JSON keys round-trip exactly
 *   and that payload fails the shape check honestly.
 * - The walk is ITERATIVE (explicit stack), not recursive: ~5000 nested arrays is a ~10 KB payload
 *   that passes JSON.parse and sits under the line cap, but a recursive map hit RangeError before
 *   any size guard — a throw escaping a seam whose callers promise non-blocking verdicts. The
 *   iterative walk chose over a caught-RangeError→`refused` wrapper because it keeps the honest
 *   outcome for deep-but-valid payloads (they get redacted and judged on their merits) instead of
 *   refusing them at an arbitrary engine-dependent depth. A repeated container is walked once and
 *   reused (WeakMap), so a shared or cyclic reference can never loop the walk either.
 */
export function redactTrainingPayload(v: unknown): unknown {
  if (typeof v === 'string') return redactProfileBlock(v);
  if (v === null || typeof v !== 'object') return v;
  const makeDst = (src: object): Record<string, unknown> | unknown[] =>
    Array.isArray(src) ? new Array(src.length) : (Object.create(null) as Record<string, unknown>);
  const dstOf = new WeakMap<object, Record<string, unknown> | unknown[]>();
  const root = makeDst(v);
  dstOf.set(v, root);
  const stack: object[] = [v];
  const walkChild = (child: unknown): unknown => {
    if (typeof child === 'string') return redactProfileBlock(child);
    if (child === null || typeof child !== 'object') return child;
    let dst = dstOf.get(child);
    if (dst === undefined) {
      dst = makeDst(child);
      dstOf.set(child, dst);
      stack.push(child);
    }
    return dst;
  };
  while (stack.length > 0) {
    const src = stack.pop()!;
    const dst = dstOf.get(src)!;
    if (Array.isArray(src)) {
      const arr = dst as unknown[];
      for (let i = 0; i < src.length; i++) arr[i] = walkChild(src[i]);
    } else {
      const obj = dst as Record<string, unknown>;
      // null prototype ⇒ this assignment defines an OWN property even for the key '__proto__'
      for (const [key, value] of Object.entries(src)) obj[redactProfileBlock(key)] = walkChild(value);
    }
  }
  return root;
}

function coerceText(v: unknown): string {
  if (typeof v === 'string') return v;
  if (v === null || v === undefined) return '';
  try {
    const s = JSON.stringify(v);
    return typeof s === 'string' ? s : String(v);
  } catch {
    return String(v);
  }
}

/** Normalize routing metadata without ever blocking capture. Undefined means the operator supplied
 * neither axis; malformed/throwing inputs are explicit null, never a fabricated nearest preset.
 * An explicit `preset:'unset'` preserves primary while recording that no budget arg was supplied. */
function normalizeTrainingPairBudget(raw: unknown): TrainingPairBudget | null {
  try {
    if (raw === undefined) return { primary: 'claude', claude: 'normal', codex: 'normal', preset: 'unset' };
    if (raw === null || typeof raw !== 'object') return null;
    const value = raw as Record<string, unknown>;
    const primary = value.primary;
    const claude = value.claude;
    const codex = value.codex;
    if (primary !== 'claude' && primary !== 'codex') return null;
    if (claude !== 'normal' && claude !== 'eco') return null;
    if (codex !== 'normal' && codex !== 'eco') return null;
    if (value.preset === 'unset') return { primary, claude, codex, preset: 'unset' };
    let preset: TrainingPairBudget['preset'] = 'custom';
    if (claude === 'normal' && codex === 'normal') preset = 'normal';
    else if (claude === 'eco' && codex === 'eco') preset = 'eco';
    else if (claude === 'eco' && codex === 'normal') preset = 'hybrid';
    return { primary, claude, codex, preset };
  } catch {
    return null;
  }
}

/** Assemble one SFT-ready training pair. Deterministic (ts passed in). Applies the oversize
 * guard: when input+output exceed TRAINPAIR_MAX_IO_CHARS combined, each over-budget side is
 * truncated with a marker naming the cut char count + the fnv1a64 of its FULL text (the
 * budget flows to the smaller side, so a small prompt next to a huge output stays verbatim).
 * Evaluation honesty: an empty/whitespace grade normalizes to null — a stub never reads as
 * a real evaluation. Provenance: an explicit valid family wins; otherwise it is DERIVED from
 * the model spec via modelFamily (an invalid family never leaks into the dataset). */
export function buildTrainingPair(opts: {
  slug: string;
  stage: string;
  ts: number | string | null;
  input: unknown;
  output: unknown;
  evaluation?: Partial<TrainingPairEvaluation> | null;
  provenance?: Partial<TrainingPairProvenance> | null;
  budgetMode?: unknown;
  captureMode?: unknown;
  resumed?: unknown;
}): TrainingPair {
  // Operator-profile redaction FIRST — before the oversize guard, so the truncation hashes are
  // hashes of the redacted text and the full-text fnv1a64 never fingerprints personal data.
  let input = redactProfileBlock(coerceText(opts.input));
  let output = redactProfileBlock(coerceText(opts.output));
  let truncated: TrainingPairTruncation | null = null;
  if (input.length + output.length > TRAINPAIR_MAX_IO_CHARS) {
    truncated = { inputChars: input.length, outputChars: output.length, inputHash: fnv1a64(input), outputHash: fnv1a64(output) };
    const half = Math.floor(TRAINPAIR_MAX_IO_CHARS / 2);
    let inKeep = input.length;
    let outKeep = output.length;
    if (outKeep <= half) inKeep = TRAINPAIR_MAX_IO_CHARS - outKeep;
    else if (inKeep <= half) outKeep = TRAINPAIR_MAX_IO_CHARS - inKeep;
    else { inKeep = half; outKeep = TRAINPAIR_MAX_IO_CHARS - half; }
    if (inKeep < input.length) input = input.slice(0, inKeep) + '\n…[TRUNCATED ' + (truncated.inputChars - inKeep) + ' chars — full-text fnv1a64=' + truncated.inputHash + ']';
    if (outKeep < output.length) output = output.slice(0, outKeep) + '\n…[TRUNCATED ' + (truncated.outputChars - outKeep) + ' chars — full-text fnv1a64=' + truncated.outputHash + ']';
  }
  const ev = opts.evaluation || {};
  const pv = opts.provenance || {};
  return {
    schema: TRAINPAIR_SCHEMA_VERSION,
    slug: opts.slug,
    stage: opts.stage,
    ts: opts.ts === undefined ? null : opts.ts,
    input,
    output,
    evaluation: {
      grade: typeof ev.grade === 'string' && ev.grade.trim() !== '' ? ev.grade : null,
      gradedBy: typeof ev.gradedBy === 'string' && ev.gradedBy !== '' ? ev.gradedBy : null,
      lessonsInjected: Array.isArray(ev.lessonsInjected) ? ev.lessonsInjected.filter((s): s is string => typeof s === 'string' && s !== '') : [],
    },
    provenance: {
      model: typeof pv.model === 'string' && pv.model !== '' ? pv.model : 'unknown',
      family: pv.family === 'claude' || pv.family === 'codex' ? pv.family : trainingPairFamily(pv.model),
      role: typeof pv.role === 'string' && pv.role !== '' ? pv.role : 'unknown',
      tokens: typeof pv.tokens === 'number' && Number.isFinite(pv.tokens) ? pv.tokens : null,
      minutes: typeof pv.minutes === 'number' && Number.isFinite(pv.minutes) ? pv.minutes : null,
    },
    budgetMode: normalizeTrainingPairBudget(opts.budgetMode),
    truncated,
    captureMode: opts.captureMode === 'backfill' ? 'backfill' : 'capture',
    resumed: opts.resumed === true,
  };
}

/** Serialize one training pair to a JSONL line. The oversize guard already bounds the pair,
 * so this only fails on the impossible (all fields are plain data) — null on that, never a throw. */
export function serializeTrainingPair(pair: TrainingPair): string | null {
  try {
    const line = JSON.stringify(pair);
    return typeof line === 'string' ? line : null;
  } catch {
    return null;
  }
}

/** The one Bash command the write agent runs: mkdir the slug dir, drop the privacy README
 * once (if-absent guard), then append ONE line (single-quote-escaped byte-faithfully, same
 * idiom as checkpointAppendCmd). */
export function trainingPairAppendCmd(repoAbs: string, slug: string, stage: string, line: string): string {
  const dirAbs = repoAbs + '/.dz/fa-training/' + slug;
  const readmeAbs = repoAbs + '/.dz/fa-training/README.md';
  const fileAbs = dirAbs + '/' + stage + '.jsonl';
  return (
    'mkdir -p ' + shellQuote(dirAbs) +
    ' && { [ -f ' + shellQuote(readmeAbs) + ' ] || printf \'%s\\n\' ' + shellQuote(TRAINPAIR_PRIVACY_NOTE) + ' > ' + shellQuote(readmeAbs) + '; }' +
    " && printf '%s\\n' " + shellQuote(line) + ' >> ' + shellQuote(fileAbs)
  );
}

/** Readback sentinels for the caller to distinguish an at-most-once write from an existing pair. */
export const TP_BACKFILL_OK = 'TP-BACKFILL-OK';
export const TP_BACKFILL_SKIP = 'TP-BACKFILL-SKIP';
export const TP_BACKFILL_DUP = 'TP-BACKFILL-DUP';

/** Build the deterministic resume-backfill command. The persistent mkdir mark is the atomic
 * at-most-once primitive; the inner file-absence guard also protects pair files created before
 * marks existed. The mark is RELEASED when — and only when — the append fails, so a failed backfill
 * stays retryable. The `[ -f ]` path keeps the mark because the pair genuinely exists.
 * KNOWN RESIDUAL: a process killed (SIGKILL, sandbox timeout) between the `mkdir` claim and the end
 * of the append still leaves a poisoned mark. That window is strictly narrower than "any append
 * failure" and is the same externally-killed class this feature already names for the ledger row.
 * `TP_BACKFILL_SKIP` means "the per-stage pair file already existed"; `TP_BACKFILL_DUP` means
 * "another run already owns this content". The two strings are deliberately NON-PREFIXING because
 * the two producers parse the readback differently — the generated loop compares `===` after
 * `trim`, while the `feature-adr.js` twin tests an UNANCHORED regex; a prefixed name would be `DUP`
 * to one parser and `SKIP` to the other from the same bytes. The default `markKey` is per-CONTENT
 * only; a caller whose line embeds a per-run identifier must pass a run-independent `markKey`.
 * Marks are deliberately never pruned. */
export function trainingPairBackfillCmd(repoAbs: string, slug: string, stage: string, lines: readonly string[], markKey?: string): string | null {
  if (typeof repoAbs !== 'string' || repoAbs === '') return null;
  if (typeof slug !== 'string' || slug === '') return null;
  if (typeof stage !== 'string' || stage === '') return null;
  if (!Array.isArray(lines) || lines.length === 0 || !lines.every(line => typeof line === 'string' && line !== '')) return null;

  const dirAbs = repoAbs + '/.dz/fa-training/' + slug;
  const readmeAbs = repoAbs + '/.dz/fa-training/README.md';
  const fileAbs = dirAbs + '/' + stage + '.jsonl';
  const markDir = repoAbs + '/.dz/fa-training/.backfill-marks';
  const markStage = stage.replace(/\.\./g, '_').replace(/\//g, '_');
  const resolvedMarkKey = markKey === undefined ? fnv1a64(stage + '\0' + lines.join('\n')) : markKey;
  const markPath = markDir + '/' + markStage + '-' + resolvedMarkKey;
  const appends = lines
    .map(line => "printf '%s\\n' " + shellQuote(line) + ' >> ' + shellQuote(fileAbs))
    .join(' && ');
  return (
    'mkdir -p ' + shellQuote(dirAbs) +
    ' && { [ -f ' + shellQuote(readmeAbs) + ' ] || printf \'%s\\n\' ' + shellQuote(TRAINPAIR_PRIVACY_NOTE) + ' > ' + shellQuote(readmeAbs) + '; }' +
    ' && mkdir -p ' + shellQuote(markDir) +
    ' && if mkdir ' + shellQuote(markPath) + ' 2>/dev/null; then ' +
    'if [ -f ' + shellQuote(fileAbs) + ' ]; then echo ' + shellQuote(TP_BACKFILL_SKIP) +
    '; else { ' + appends + ' && echo ' + shellQuote(TP_BACKFILL_OK) + '; } || { rmdir ' + shellQuote(markPath) + ' 2>/dev/null; false; }; fi' +
    '; else echo ' + shellQuote(TP_BACKFILL_DUP) + '; fi'
  );
}

// ── ADR-003 Condition 3: the code-stage persist ALLOWLIST ────────────────────────────────────

/**
 * May the code stage's result be checkpointed?
 *
 * Pre-epoch this was a DENYLIST inlined in the workflow — `!/genuinely-not-landed/.test(landedNote)`
 * — which is fail-OPEN by construction: every state that is not that one string persists, including
 * a dead probe. MEASURED pre-fix: `node -e "console.log(!/genuinely-not-landed/.test('(landed-probe
 * failed)'))"` prints `true`, i.e. a run whose barrier never answered was checkpointed as landed.
 *
 * The replacement is an ALLOWLIST with exactly two admitted states, and `barrierRequired` is what
 * makes it non-forgeable: a codex run cannot LABEL itself `'synchronous'` past the gate, and a
 * Claude run cannot claim a barrier verdict it never ran. `barrierRequired` arrives as a BOOLEAN
 * (`needsCodeLandedBarrier(coderUsed)` at the call site) purely to avoid a routing↔checkpoints
 * module cycle — H6.
 */
export function codeCheckpointPersistAllowed(landingStatus: unknown, barrierRequired: boolean): boolean {
  if (landingStatus === 'landed') return barrierRequired === true
  if (landingStatus === 'synchronous') return barrierRequired === false
  return false
}

/**
 * Composite-shape validity for a code-stage checkpoint entry (consumer #3): the pre-existing shape
 * checks PLUS the landing fields. An entry written before this protocol carries no `landingStatus`
 * and no `landingProtocol`, so it reads as NO CHECKPOINT and the stage re-runs — the belt to R6's
 * hash-token invalidation, in case a hash somehow matches.
 */
export function codeStageResultShapeValid(r: unknown): boolean {
  if (!r || typeof r !== 'object') return false
  const v = r as { code?: unknown; coderUsed?: unknown; landedNote?: unknown; landingStatus?: unknown; landingProtocol?: unknown }
  if (!v.code || typeof v.code !== 'object') return false
  if (typeof v.coderUsed !== 'string') return false
  if (typeof v.landedNote !== 'string') return false
  if (v.landingProtocol !== 3) return false
  return v.landingStatus === 'landed' || v.landingStatus === 'genuinely-not-landed' || v.landingStatus === 'inconclusive' || v.landingStatus === 'synchronous'
}

/**
 * Parse the design artifact probe's stdout into "which required artifacts exist".
 *
 * The probe is relayed by a MODEL, not read from a pipe: the workflow sandbox cannot run a shell, so
 * an agent runs the command and hands back what it saw. That makes the transcript forgeable in
 * principle, and cross-family review round 7 showed it forgeable in PRACTICE by accident — an agent
 * that narrates ("Expected output when present: HAVE:01_requirements.md … Actual stdout: …") emits a
 * line identical to the real token, and a permissive parser took it for evidence. The gate then passed a
 * design whose artifact did not exist, which is the one thing this gate exists to prevent.
 *
 * So the transcript is validated STRICTLY, not scanned: after trimming blank lines, the output must be
 * exactly some subset of the known HAVE tokens followed by exactly one sentinel, and nothing else.
 * Anything unexpected — narration, a second sentinel, a shell error, a code fence — makes the probe
 * NOT ESTABLISHED (null), which is a refusal, never a pass.
 *
 * What this does NOT do, named plainly: it cannot stop an agent that deliberately emits precisely the
 * expected transcript and nothing else. That residual is the same trust the whole pipeline places in
 * a relaying agent (the checkpoint reader and the Step-7.5 landing barrier share it). What it does do
 * is make ACCIDENTAL forgery — the kind that actually happened — impossible rather than likely.
 *
 * @returns a Set of the required artifacts that exist, or `null` when the transcript is not trustworthy.
 */
export function parseArtifactProbe(opts: {
  stdout: string | null | undefined;
  sentinel: string;
  required: readonly string[];
}): Set<string> | null {
  if (opts.stdout === null || opts.stdout === undefined) return null;
  const known = new Map<string, string>();
  for (const rel of opts.required) known.set('HAVE:' + rel, rel);
  const found = new Set<string>();
  let sentinels = 0;
  for (const raw of String(opts.stdout).split('\n')) {
    const line = raw.trim();
    if (line === '') continue;
    if (line === opts.sentinel) { sentinels++; continue; }
    // A token AFTER the sentinel is as wrong as an unknown line: the command emits every check first.
    if (sentinels > 0) return null;
    const rel = known.get(line);
    if (rel === undefined) return null;
    found.add(rel);
  }
  // Exactly one. Zero means the command never completed (or never ran); two means something other
  // than the command produced output, and there is no way to tell which half was real.
  if (sentinels !== 1) return null;
  return found;
}

/** Why a checkpoint write was refused, or `ok` when it may proceed. */
export type CheckpointWriteVerdict =
  | { readonly ok: true; readonly line: string; readonly witnessed: readonly string[] }
  | { readonly ok: false; readonly reason: string };

/**
 * Decide whether a stage may be recorded — the WITNESS half of `dz feature-adr checkpoint`.
 *
 * Why this exists (2026-08-21). The workflow script runs sandboxed with no filesystem, so it
 * delegated checkpoint writes to a subagent by handing it a FINISHED JSON line and saying "append
 * this". The subagent was a courier: it verified nothing. Read from outside, that shape is one party
 * instructing another to declare a verification gate complete — which is what a safety classifier saw,
 * blocking NINE such writes in one run (router, four design substages, plan, code, qe, and the cost
 * ledger). MEASURED: `.fa-state/checkpoints.jsonl` was never created, while every stage had in fact
 * run and left its artifact on disk. So resume was silently dead and the run still reported success.
 *
 * The classifier's premise was wrong for those writes, but its instinct was not: nothing in the old
 * mechanism could tell a real completion from a fabricated one. A stage whose artifact does not exist
 * could be recorded as complete, and yesterday's cross-family reviewer flagged exactly that for the
 * `fleet` stage. So the fix is not a better-worded prompt — it is to stop hand-writing state at all.
 * The subagent now RUNS A COMMAND; this function is the check that command performs first.
 *
 * @param artifacts repo-relative paths the stage must have produced. EMPTY IS REFUSED: a stage that
 *        claims nothing verifiable has nothing to witness, and recording it would restore the very
 *        hole this replaces.
 * @param present   the subset of `artifacts` the caller MEASURED on disk (never what it planned).
 */
export function decideCheckpointWrite(opts: {
  stage: string;
  inputHash: string;
  result: unknown;
  artifacts: readonly string[];
  present: readonly string[];
}): CheckpointWriteVerdict {
  const stage = String(opts.stage ?? '').trim();
  if (stage === '') return { ok: false, reason: 'stage is empty' };
  if (String(opts.inputHash ?? '').trim() === '') return { ok: false, reason: 'inputHash is empty' };
  // A null result is what a DEAD stage returns. Recording it would mark a failure as a success.
  if (opts.result === null || opts.result === undefined) {
    return { ok: false, reason: `stage ${stage} produced no result — a dead stage is never recorded` };
  }
  if (opts.artifacts.length === 0) {
    return { ok: false, reason: `stage ${stage} declared no artifact to witness` };
  }
  const presentSet = new Set(opts.present.map((p) => String(p)));
  const missing = opts.artifacts.filter((a) => !presentSet.has(String(a)));
  if (missing.length > 0) {
    return { ok: false, reason: `stage ${stage} is missing its artifact(s): ${missing.join(', ')}` };
  }
  const line = serializeCheckpoint(stage, opts.inputHash, opts.result);
  if (line === null) {
    return { ok: false, reason: `stage ${stage} result is not serialisable within the size cap` };
  }
  return { ok: true, line, witnessed: [...opts.artifacts] };
}

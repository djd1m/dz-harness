/**
 * `dz backlog` — the Smart Backlog: a personal, goal-directed idea pipeline (feature smart-backlog).
 *
 * Capture an idea → semantic dedup against existing ideas via the EXISTING Brain vector engine
 * (agentdb + the shared embedder — ADR-001; NO second store) → score alignment against a GoalMap
 * (ADR-003) → weighted-roulette pick (ADR-004) → stage an idea2prd enrich hand-off → draft a Jira
 * issue through a configurable, stub-first adapter seam (ADR-006).
 *
 * ARCHITECTURE (05): every load-bearing decision is a PURE function tested on a layer-1 deterministic
 * test; the CLI handler (`cmdBacklog`) is a thin arg-parse + call. Semantic work (embedding, cosine,
 * vector search) is an OUTBOUND PORT to harness-core's Brain engine — this file defines NO embedder,
 * NO cosine, and imports NO MCP client (ADR-001 / ADR-006, both grep-guarded).
 *
 * Ideas carry `task_type:'dz-backlog'` in the shared `.dz/agentdb.db`, so they never surface in
 * `dz recall`'s lesson namespace (ADR-005 T-005b, the discriminating isolation test). Structured
 * records live in a dedicated `.dz/backlog/ideas.jsonl`, never in `.dz/memory/patterns.*`.
 */
export { BACKLOG_TASK_TYPE, DEDUP_EMBED_CAP, DEDUP_EMBED_FORM_VERSION, dedupEmbedText, dedupExcerpt, dedupPairBand, distinctiveTokens, lexicalContainment, type DedupBandConfig, type DedupPairBand, } from './backlog-embed.js';
export type IdeaStatus = 'new' | 'enriched' | 'in-progress' | 'shipped' | 'dropped';
/** The aggregate root — one captured idea. `id` is content-addressed (no `Date.now()` in identity). */
export interface IdeaRecord {
    readonly id: string;
    readonly text: string;
    status: IdeaStatus;
    readonly createdTs: string;
    effort: number;
    goalId: string | null;
    goalAlignment: number;
    relatedIds: string[];
    uses: number;
    proposal?: string;
    enrichedPath?: string;
    jiraKey?: string;
    tags: string[];
    /** ISO timestamp of the LAST explicit status transition (`dz backlog ship|drop|reopen`). */
    statusTs?: string;
    /** The `--reason` given at the LAST explicit transition — describes THAT transition only. */
    statusReason?: string;
}
/** The compass (ADR-003) — user-owned, edited as a file. */
export interface Goal {
    readonly id: string;
    readonly statement: string;
    readonly weight: number;
    readonly keywords: readonly string[];
}
export interface GoalMap {
    readonly version: number;
    readonly goals: readonly Goal[];
}
export type DedupAction = 'duplicate' | 'related' | 'new';
/** Pure output of the classifier (04) — consumed by capture. */
export interface DedupVerdict {
    readonly action: DedupAction;
    /** Ids excluded from VECTOR candidacy because their text was edited without a re-embed yet. A
     * consumer must read this before treating a `new` verdict as "compared against everything". */
    readonly staleExcluded?: string[];
    /** Top-1 raw cosine (ADR-002 — never an RRF score). `-1` when there is nothing to compare against. */
    readonly cosine: number;
    readonly matchedId: string | undefined;
    /**
     * The id of the TOP-1 candidate whatever band it landed in — the ADR-002 CALIBRATION surface (idea
     * ce914ac2). `matchedId` is only set for a DUPLICATE, so a RELATED verdict used to report a cosine with
     * no way to see WHICH idea produced it; a user calibrating the 0.92 band needs the pair, not the number.
     * Purely observational: it never changes the verdict.
     */
    readonly topMatchId: string | undefined;
    readonly relatedIds: readonly string[];
    /** True when the embedder was unavailable and dedup degraded to exact-text (ADR-002 §degrade). */
    readonly exactTextOnly: boolean;
    /** Lexical containment of the DECIDING candidate (matched for a duplicate, top-1 otherwise), when known. */
    readonly containment?: number;
    /**
     * Set when a candidate cleared the cosine threshold but FAILED lexical corroboration and was
     * demoted to the related band — the register-only false positive (zombie x publish-gate @ 0.941,
     * containment 0.077, MEASURED 2026-08-05/11). Observability: the CLI prints it, so a demotion is
     * never a silent judgment call.
     */
    readonly demoted?: {
        readonly id: string;
        readonly cosine: number;
        readonly containment: number;
    };
    /**
     * True when the duplicate verdict came from the SUBSET band (containment >= subsetContainment at
     * sub-threshold cosine) — the same idea re-captured at a different length.
     */
    readonly subsetMatch?: boolean;
}
/** The result of interpreting a `--effort` argument, with the note the CLI must ECHO when it altered it. */
export interface EffortParse {
    readonly effort: number;
    /** True when the parsed value was altered (clamped, floored, or rejected) — the CLI prints `note`. */
    readonly adjusted: boolean;
    /** Human line, e.g. `effort 13 → clamped to 5 (scale 1-5)`. Present iff `adjusted`. */
    readonly note?: string;
}
export declare const EFFORT_MIN = 1;
export declare const EFFORT_MAX = 5;
/**
 * PURE `--effort` interpreter. `dz backlog add --effort 13` used to store 5 and say NOTHING, so the user
 * kept a wrong mental model of the scale (idea 86096d6d). Every alteration now carries a printable note;
 * an in-range integer is returned untouched with `adjusted:false` (no noise on the happy path).
 */
export declare function parseEffort(raw: string | undefined, fallback: number): EffortParse;
export declare const DEFAULT_DUPLICATE_THRESHOLD = 0.92;
export declare const DEFAULT_RELATEDNESS_FLOOR = 0.35;
/**
 * Two-signal corroboration cuts (register-inflation fix, MEASURED 2026-08-11 on the real store —
 * see backlog-embed.ts for the full numbers). Containment on the labeled classes: register-only
 * false-positive pairs <= 0.171, true duplicates that also cleared the cosine threshold >= 0.538 —
 * 0.30 sits between with real margin on both sides. Subset band: long-vs-short same-idea pair
 * measured at containment 0.971 / cosine 0.8019; the nearest non-duplicate (a template-family pair
 * differing in ONE entity) at containment 0.889 — 0.95 splits them.
 */
export declare const DEFAULT_CORROBORATION_FLOOR = 0.3;
export declare const DEFAULT_SUBSET_CONTAINMENT = 0.95;
export declare const DEFAULT_SUBSET_COSINE_FLOOR = 0.75;
export declare const DEFAULT_ROULETTE_ALPHA = 1.5;
export declare const DEFAULT_HALF_LIFE_DAYS = 30;
export declare const DEFAULT_RECENCY_FLOOR = 0.3;
export declare const DEFAULT_EFFORT = 3;
export interface BacklogConfig {
    readonly dedup: {
        readonly duplicateThreshold: number;
        readonly relatednessFloor: number;
        readonly corroborationFloor: number;
        readonly subsetContainment: number;
        readonly subsetCosineFloor: number;
    };
    readonly roulette: {
        readonly alpha: number;
        readonly halfLifeDays: number;
        readonly recencyFloor: number;
        readonly defaultEffort: number;
    };
    readonly jira: {
        readonly adapter: BacklogBackend;
    };
}
export declare function readBacklogConfig(projectRoot: string): BacklogConfig;
export declare function backlogDir(projectRoot: string): string;
export declare function ideasPath(projectRoot: string): string;
export declare function goalsPath(projectRoot: string): string;
export declare function jiraOutboxDir(projectRoot: string): string;
/** Content-addressed id — `sha1(text|createdTs).slice(0,16)`; NO `Date.now()` (mirrors patterns.ts). */
export declare function ideaId(text: string, createdTs: string): string;
/**
 * Strict id whitelist (mirrors `dz score`'s slug guard) — the ONLY shape that may be interpolated into
 * a filesystem path (jira-outbox/<id>.json, enrich slug fallback). Rejects `.`/`..`/`/`/`\` and any
 * traversal, so an idea id like `../../../owned` from a hand-edited store can NEVER escape its dir
 * (HIGH-1). A content-addressed `ideaId()` (16 hex) always passes; anything else is refused, not sanitised
 * into a surprising path.
 */
export declare function isSafeId(id: unknown): id is string;
/** Read the append-only store. A corrupt line is SKIPPED (never fatal) — the whole store never throws. */
export declare function readIdeas(projectRoot: string): IdeaRecord[];
/** Atomic full rewrite (tmp + rename) so a crash mid-write never truncates the store. */
export declare function writeIdeas(projectRoot: string, ideas: readonly IdeaRecord[]): void;
export type TransitionVerb = 'ship' | 'drop' | 'reopen';
/**
 * THE transition table — the single source of truth for which statuses each verb may leave from.
 * `target` is where the verb lands. For the IDEMPOTENT verbs (ship/drop) a record ALREADY at
 * `target` is a no-op that SAYS so (not an error) — a cleanup batch may name already-marked ideas.
 * `reopen` is deliberately NOT idempotent: reopening an already-`new` idea almost always means the
 * user grabbed the wrong id (they believed it was shipped), so it is refused loudly. A status in
 * neither set is an ILLEGAL transition — notably `dropped → shipped` and `shipped → dropped` both
 * require an explicit `reopen` first; a terminal state never silently becomes the other terminal.
 */
export declare const IDEA_TRANSITIONS: Record<TransitionVerb, {
    readonly target: IdeaStatus;
    readonly from: readonly IdeaStatus[];
    readonly idempotent: boolean;
}>;
export type TransitionCheck = {
    readonly kind: 'transition';
    readonly to: IdeaStatus;
} | {
    readonly kind: 'noop';
} | {
    readonly kind: 'illegal';
    readonly message: string;
};
/** PURE transition legality check against {@link IDEA_TRANSITIONS}. */
export declare function checkTransition(verb: TransitionVerb, current: IdeaStatus): TransitionCheck;
export type PrefixResolution = {
    readonly kind: 'ok';
    readonly id: string;
} | {
    readonly kind: 'not-found';
    readonly prefix: string;
} | {
    readonly kind: 'ambiguous';
    readonly prefix: string;
    readonly matches: readonly string[];
};
/**
 * Resolve a (possibly short) id prefix against the store's ids — the roulette prints 8-char ids, so
 * the transition verbs accept them. An EXACT id always wins; otherwise a UNIQUE prefix resolves and
 * anything else (no match / several matches) is a loud error, never a silent no-op (the
 * inconclusive-≠-pass discipline from dz skills-verify).
 */
export declare function resolveIdPrefix(ids: readonly string[], prefix: string): PrefixResolution;
export interface TransitionChange {
    readonly id: string;
    readonly from: IdeaStatus;
    readonly to: IdeaStatus;
    readonly action: 'transitioned' | 'noop';
    /** First 70 chars of the idea text — for the human confirmation line. */
    readonly text: string;
}
export interface TransitionReport {
    /** True iff every requested id resolved and every transition was legal (no-ops count as ok). */
    readonly ok: boolean;
    readonly dryRun: boolean;
    readonly changes: readonly TransitionChange[];
    readonly errors: readonly string[];
    /** True iff the store file was actually rewritten. */
    readonly written: boolean;
}
/**
 * Apply a batch of status transitions to `.dz/backlog/ideas.jsonl`.
 *
 * ALL-OR-NOTHING: any unresolved/ambiguous prefix or illegal transition fails the WHOLE batch with
 * NO write (fail-closed — a partial batch that "mostly worked" is how shipped work silently stays
 * eligible). LINE-PRESERVING: untouched lines (including corrupt ones readIdeas would skip) are
 * emitted byte-for-byte; a transitioned line is re-serialized from ITS OWN parsed object, so
 * `JSON.parse`/`stringify` key-order preservation keeps every non-status field byte-identical —
 * unknown fields a future schema might add survive untouched. (Documented limit: exotic JSON
 * scalars — lone surrogates, -0, >2^53 integers — would not round-trip byte-identically; no schema
 * field has those shapes, ids are 16-hex.) ATOMIC: tmp + rename, same as {@link writeIdeas}, so a
 * crash never leaves a torn store. (Documented limit: the read-modify-write is NOT locked against a
 * concurrent writer — pre-existing across every backlog writer, same as writeIdeas.)
 */
export declare function transitionIdeas(projectRoot: string, verb: TransitionVerb, prefixes: readonly string[], opts?: {
    reason?: string;
    dryRun?: boolean;
    nowIso?: string;
}): TransitionReport;
/** Where an edit's PREVIOUS text is preserved. An edit destroys text and `reopen` cannot undo it the
 * way it undoes `drop`, so the old text is appended here before the store is rewritten. */
export declare function editsLogPath(projectRoot: string): string;
export interface EditReport {
    readonly ok: boolean;
    readonly dryRun: boolean;
    readonly id?: string;
    readonly previousText?: string;
    readonly newText?: string;
    readonly errors: string[];
    readonly written: boolean;
}
/**
 * Replace or extend ONE idea's text. Mirrors `transitionIdeas`' line discipline exactly: the file is
 * split without discarding anything, every untouched line — including a line the parser cannot read —
 * goes back BYTE-FOR-BYTE, and only the matched record's line is re-serialised. The store holds
 * dozens of records; a whole-file JSON round-trip would reformat all of them to change one.
 */
export declare function editIdea(projectRoot: string, prefix: string, opts?: {
    text?: string;
    append?: string;
    dryRun?: boolean;
    nowIso?: string;
}): EditReport;
/** Clear the stale marker after a successful re-embed. Separate from `editIdea` because the re-embed
 * is async and belongs to the caller; a marker cleared without a re-embed would be a lie. */
export declare function clearEmbedStale(projectRoot: string, id: string): boolean;
export type GitignoreAction = 'created' | 'appended' | 'already-covered' | 'user-opted-out' | 'skipped';
export interface GitignoreScaffold {
    readonly action: GitignoreAction;
    readonly path: string;
    /** Set for `skipped` (the I/O reason) and `user-opted-out` (the negation line we obeyed). */
    readonly reason?: string;
}
export type BacklogIgnoreStatus = 'covered' | 'negated' | 'uncovered';
/**
 * PURE .gitignore verdict for the backlog store. Deliberately NOT a full gitignore engine — it
 * recognises the plain-path spellings of the rule (`/.dz/`, `.dz/**`, `.dz/backlog`, …) and refuses to
 * interpret anything else, because a wrong-but-clever matcher either double-appends or silently
 * decides a store is private when it is not.
 *
 * `negated` wins over `covered`: a `!.dz/backlog/` line (anchored or not) is the user saying *"track
 * this on purpose"*. We obey it — appending a rule that overrides the user's explicit opt-out would be
 * this tool deciding it knows better.
 */
export declare function backlogIgnoreStatus(gitignoreText: string): BacklogIgnoreStatus;
/** Back-compat shim: "is it ignored?" — a negation is NOT coverage (the store is tracked on purpose). */
export declare function backlogIgnoreCovered(gitignoreText: string): boolean;
/**
 * Ensure the backlog store is gitignored, at the moment the feature FIRST creates it (idea ec4cd60d).
 * Creates a `.gitignore` when there is none; appends the entry (+ its comment) when the project has one
 * that does not cover the store; touches NOTHING when it is already covered OR when the user explicitly
 * negated the rule. The write is ATOMIC and preserves the file's dominant EOL.
 * Never throws — an unwritable .gitignore degrades to `skipped`, and the CALLER must say so out loud
 * (a silently un-ignored store is exactly the privacy leak this function exists to prevent).
 */
export declare function ensureBacklogGitignored(projectRoot: string): GitignoreScaffold;
/** Pre-mutation snapshot (NFR-6) — mirrors `snapshotStore`. A failed snapshot returns `{error}` so
 *  the caller ABORTS the mutation (no partial merge). */
export interface SnapshotResult {
    readonly path: string;
    readonly count: number;
    readonly error?: string;
}
export declare function snapshotIdeas(projectRoot: string, dest: string): SnapshotResult;
/**
 * One existing-idea comparison candidate: its id, the RAW cosine of the new idea against it, and
 * (when the candidate's text is available) the lexical containment of the pair. `containment`
 * undefined = corroboration unavailable (degraded search hit) ⇒ the cosine band decides alone,
 * exactly the pre-fix behavior.
 */
export interface DedupCandidate {
    readonly id: string;
    readonly cosine: number;
    readonly containment?: number;
    /** Set when the record's text was edited but its vector has not been rewritten yet (ADR-001,
     * idea 1fde7bf6). Such a candidate is excluded from VECTOR candidacy — its cosine describes text
     * the record no longer has. The exact-text net still applies: the marker degrades SIMILARITY,
     * never IDENTITY. */
    readonly embedStale?: boolean;
}
/**
 * THE LOAD-BEARING CLASSIFIER (ADR-002 T-002a, two-signal since the register-inflation fix) — PURE.
 * Bands via {@link dedupPairBand} (shared with harmonize):
 *   DUPLICATE  top-1 cosine ≥ duplicateThreshold AND corroborated (containment ≥ corroborationFloor
 *              or unknown) — OR any candidate in the SUBSET band (containment ≥ subsetContainment,
 *              cosine ≥ subsetCosineFloor): the same idea re-captured at a different length.
 *   RELATED    relatednessFloor ≤ cosine < dup, PLUS any DEMOTED candidate (≥ threshold cosine that
 *              failed corroboration — the register-only false positive) ⇒ create + attach relatedIds.
 *   NEW        cosine < relatednessFloor
 * Flip any cut and exactly one boundary fixture crosses a band — the test REDS.
 */
export declare function classifyDedup(candidates: readonly DedupCandidate[], cfg: BacklogConfig['dedup'], opts?: {
    exactTextOnly?: boolean;
}): DedupVerdict;
/** Injectable deps so the production dedup path is testable without a live agentdb. */
export interface DedupDeps {
    /** Semantic search over the `dz-backlog` namespace — defaults to the real `searchAgentdbPatterns`. */
    readonly search?: (projectRoot: string, query: string) => Promise<{
        hits: {
            dzId?: string | undefined;
            similarity: number;
        }[];
        error?: string | undefined;
    }>;
    /** Existing structured ideas (for the exact-text degrade path) — defaults to `readIdeas`. */
    readonly ideas?: readonly IdeaRecord[];
}
/**
 * Production dedup: embed+search the `dz-backlog` vectors (RAW COSINE via `searchAgentdbPatterns`,
 * NEVER the RRF `recallHybrid().score` — ADR-002 T-002c), then band via {@link classifyDedup}. If the
 * embedder/search is unavailable it DEGRADES to exact-text dedup (identical text ⇒ DUPLICATE), never
 * blocking capture (NFR-2 / ADR-002 T-002e).
 */
export declare function dedupIdea(projectRoot: string, text: string, cfg: BacklogConfig, deps?: DedupDeps): Promise<DedupVerdict>;
/** One goal entry the reader REFUSED, with the reason — the anti-vacuous-valid evidence (idea 960c9f26). */
export interface DroppedGoal {
    /** 0-based index of the entry in the file's `goals` array. */
    readonly index: number;
    /** Machine-stable reason, e.g. `missing "statement"`. */
    readonly reason: string;
}
/**
 * What the defensive read actually SAW. `readGoalMap` throws away the drops (correct for runtime paths —
 * a corrupt compass must never break capture), but `goals --validate` needs them: a goals.json whose every
 * entry was silently dropped previously reported *"valid (0 goal(s))"* — a vacuous pass that hid the user's
 * typo (`text` instead of `statement`). This variant is the validate-facing reader.
 */
export interface GoalMapRead {
    readonly goalMap: GoalMap;
    /** Entries present in the file's `goals` array (kept + dropped). */
    readonly present: number;
    readonly dropped: readonly DroppedGoal[];
    /**
     * Fields the reader REPAIRED to keep the runtime safe. The clamp happens BEFORE any validation could
     * see the original, so a `weight: 7` becomes a legal 1 and the validator's out-of-range branch is
     * unreachable — a silent repair reported as "valid". These carry the RAW value so `goals --validate`
     * can warn about what the user actually wrote while the runtime keeps the clamped value.
     */
    readonly repaired: readonly RepairedGoalField[];
    /** Set when the file exists but could not be parsed / has no `goals` array. */
    readonly parseError?: string;
}
/** One field the defensive reader clamped/replaced, with both the raw and the used value. */
export interface RepairedGoalField {
    readonly index: number;
    readonly id: string;
    readonly field: 'weight';
    readonly raw: unknown;
    readonly used: number;
    /** Human reason, e.g. `weight 7 is out of (0,1]`. */
    readonly reason: string;
}
/**
 * Detailed GoalMap read — never throws, and REPORTS what it dropped (idea 960c9f26). `readGoalMap` is the
 * lossy runtime view of this; both share one parser so they can never disagree about what a goal is.
 */
export declare function readGoalMapDetailed(projectRoot: string): GoalMapRead;
/** Defensive GoalMap reader — never throws; a missing/corrupt file ⇒ empty compass (the runtime path). */
export declare function readGoalMap(projectRoot: string): GoalMap;
/** The text embedded for a goal: statement + keywords (same convention across cache + score). */
export declare function goalEmbedText(goal: Goal): string;
export interface AlignmentResult {
    readonly goalId: string | null;
    readonly goalAlignment: number;
}
/** One goal with its precomputed embedding + weight — the input to the pure scorer. */
export interface GoalVector {
    readonly id: string;
    readonly vec: Float32Array;
    readonly weight: number;
}
/**
 * THE LOAD-BEARING ALIGNMENT SCORER (ADR-003 T-003a) — PURE. Alignment =
 * `max over goals of ( cosine(ideaVec, goalVec) * weight )`, clamped to [0,1]. Weighted-MAX (not
 * sum/mean) so a focused idea advancing ONE goal strongly scores high. No goals ⇒ 0 / null.
 */
export declare function scoreAlignment(ideaVec: Float32Array, goals: readonly GoalVector[]): AlignmentResult;
/** Injectable embedder so the production alignment path is testable. */
export interface AlignDeps {
    readonly embed?: (text: string) => Promise<Float32Array>;
}
/**
 * Production alignment: embed the idea + each goal (same reused embedder) and score. No embedder or no
 * GoalMap ⇒ `{goalId:null, goalAlignment:0}` — capture and roulette still work (ADR-003 T-003d).
 */
export declare function alignIdea(projectRoot: string, text: string, goalMap: GoalMap, deps?: AlignDeps): Promise<AlignmentResult>;
export interface GoalEmbedCache {
    readonly model: string;
    readonly dim: number;
    /** id → { hash of the embed text, vector as a plain number[] } */
    readonly goals: Record<string, {
        readonly hash: string;
        readonly vec: number[];
    }>;
}
/**
 * PURE cache validity check (ADR-003 T-003e): a cache is valid for a goal ONLY when the embed
 * model+dim manifest matches AND the goal's embed-text hash is unchanged. A model change (different
 * `model`/`dim`) invalidates EVERY cached goal vector — forcing a recompute, never a stale alignment.
 */
export declare function goalCacheHit(cache: GoalEmbedCache | undefined, model: string, dim: number, goal: Goal): Float32Array | undefined;
export declare function readGoalEmbedCache(projectRoot: string): GoalEmbedCache | undefined;
export declare function writeGoalEmbedCache(projectRoot: string, cache: GoalEmbedCache): void;
/** Tiny base added to the compass term so an unaligned idea keeps a non-zero weight (no starvation). */
export declare const ROULETTE_EPSILON = 0.02;
/** Ideas eligible for a spin: only `new` and `enriched` (ADR-004). */
export declare function eligibleIdeas(ideas: readonly IdeaRecord[]): IdeaRecord[];
/** Bounded recency decay ∈ [floor, 1]: `2^(-ageDays/halfLife)`, floored so old ideas are down-weighted, never zero. */
export declare function recencyDecay(ageMs: number, halfLifeDays: number, floor: number): number;
/**
 * THE selection weight (ADR-004): `(alignment^alpha + EPS) · recencyDecay(age) · (1/effort)`. Strictly
 * positive for every idea (EPS>0, floor>0, effort≥1) ⇒ no permanent starvation (T-004c). Equal
 * alignment+age+effort ⇒ equal weights ⇒ a uniform draw (the T-004a control).
 */
export declare function ideaWeight(idea: IdeaRecord, cfg: BacklogConfig['roulette'], nowMs: number): number;
/** Deterministic ranked shortlist (`--pick N`): by weight desc, id asc — no RNG. */
export declare function rankRoulette(ideas: readonly IdeaRecord[], cfg: BacklogConfig['roulette'], nowMs: number): IdeaRecord[];
/**
 * A single WEIGHTED-RANDOM spin over normalised weights, using an injected seeded RNG (`rng()∈[0,1)`).
 * Same seed ⇒ identical pick (ADR-004 T-004b determinism). Returns `undefined` when nothing is eligible.
 */
export declare function spinRoulette(ideas: readonly IdeaRecord[], cfg: BacklogConfig['roulette'], rng: () => number, nowMs: number): IdeaRecord | undefined;
/** Build a seeded RNG from a `--seed` integer (reuses the one repo mulberry32). */
export declare function seededRng(seed: number): () => number;
/** kebab-case, Latin-only, ≤40 chars (feature-adr slug convention). */
export declare function ideaSlug(idea: IdeaRecord): string;
export interface EnrichmentStaging {
    readonly slug: string;
    readonly scaffoldPath: string;
}
/**
 * Stage the idea2prd INPUT and hand off to the `idea2prd-manual` skill (an AGENT phase — 02 §R-G).
 * The CLI writes the scaffold ONLY; it never fabricates a PRD (idea2prd is a skill, not a synchronous
 * transform). Returns the hand-off target so the agent can pick it up.
 */
export declare function stageEnrichment(projectRoot: string, idea: IdeaRecord, related: readonly IdeaRecord[], goalMap: GoalMap): EnrichmentStaging;
export declare const BACKLOG_BACKENDS: readonly ["jira-mcp", "copilot-mcp", "none"];
export type BacklogBackend = (typeof BACKLOG_BACKENDS)[number];
export declare function isBacklogBackend(v: unknown): v is BacklogBackend;
/** Built by the domain from an IdeaRecord (+ enrichedPath if any). */
export interface JiraIssueDraft {
    readonly summary: string;
    readonly description: string;
    readonly labels: readonly string[];
    readonly sourceIdeaId: string;
}
export interface IssueRef {
    readonly backend: BacklogBackend;
    readonly key: string | null;
    readonly url?: string;
    readonly stub: boolean;
    readonly outboxPath: string;
}
export type VerifyForm = 'full' | 'manual';
export interface JiraVerifyResult {
    readonly form: VerifyForm;
    readonly ready: boolean;
    /** The exact wiring step the user must run — non-empty for a `manual` backend (T-006e). */
    readonly instruction: string;
}
/** The I/O the adapters need — injected so `createIssue` is testable without touching disk. */
export interface BacklogIO {
    /** Persist an outbox payload for `<ideaId>`; returns the path written. */
    writeOutbox(ideaId: string, payload: unknown): string;
}
/** THE SEAM (ADR-006): a port with pure methods; NO MCP client is imported here or by its impls. */
export interface JiraPort {
    readonly backend: BacklogBackend;
    createIssue(draft: JiraIssueDraft, io: BacklogIO): Promise<IssueRef>;
    verify(): Promise<JiraVerifyResult>;
}
/** Pure draft builder from an idea. */
export declare function buildJiraDraft(idea: IdeaRecord, goalMap: GoalMap): JiraIssueDraft;
/** The registry — coverage-tested (ADR-006 T-006a): keys ≡ BACKLOG_BACKENDS as a set. */
export declare const JIRA_ADAPTERS: Record<BacklogBackend, JiraPort>;
/** Factory: pick the configured adapter; an unknown value fell back to `none` in readBacklogConfig. */
export declare function resolveJiraAdapter(cfg: BacklogConfig): JiraPort;
/** Production BacklogIO — writes `.dz/backlog/jira-outbox/<id>.json`. */
export declare function makeBacklogIO(projectRoot: string): BacklogIO;
export interface BacklogHarmonizeReport {
    readonly mode: 'dry-run' | 'apply';
    /** True when no embedder was available and clustering fell back to EXACT text. */
    readonly fellBackToExact: boolean;
    readonly threshold: number;
    /** One cluster per group of size ≥ 2: the surviving keeper id + the merged-away ids. */
    readonly clusters: readonly {
        readonly keep: string;
        readonly drops: readonly string[];
    }[];
    readonly kept: number;
    readonly dropped: number;
    readonly unique: number;
    readonly snapshotPath?: string;
    readonly error?: string;
    /**
     * MED-E: set when the structured ideas were removed but their agentdb `dz-backlog` vectors could NOT be
     * pruned (locked/unavailable store). Backlog dedup stays correct (the membership guard drops orphans),
     * but the store is left with dangling vectors — a non-clean outcome the caller MUST surface, never a
     * silent success. `dz backlog harmonize` prints this as a warning; the idea removal still stands.
     */
    readonly pruneError?: string;
}
/**
 * Batch-dedup the backlog: cluster near-duplicate ideas (cosine ≥ threshold when an embedder is
 * available, EXACT text otherwise), keep one deterministic keeper per cluster, merge the others'
 * `uses` into it. DRY-RUN by default (writes nothing); `--apply` SNAPSHOTS FIRST then mutates and
 * ABORTS the mutation if the snapshot fails (NFR-6). Injectable `embed` for tests.
 */
export declare function harmonizeBacklog(projectRoot: string, opts?: {
    apply?: boolean;
    threshold?: number;
    embed?: ((t: string) => Promise<Float32Array>) | null;
}): Promise<BacklogHarmonizeReport>;
/**
 * Mirror one idea's vector into the SHARED `.dz/agentdb.db` under `task_type:'dz-backlog'`, written
 * DIRECTLY through `importVectorsToAgentdb` (upsert-by-dzId) — NOT the configurable vector engine.
 * This is the load-bearing single-store guarantee (ADR-001/005): dedup ALWAYS searches agentdb, so
 * the write must ALWAYS land in agentdb, no matter what `memory.vector.engine` says. Upsert-by-dzId
 * makes a re-mirror idempotent (0 duplicate rows). `guardEmbedSpace` inside `importVectorsToAgentdb`
 * covers the write (ADR-001 T-001c). Best-effort: NEVER blocks capture (I-1) — honest `{error}`.
 */
export declare function mirrorIdeaVector(projectRoot: string, idea: IdeaRecord): Promise<{
    mirrored: number;
    error?: string | undefined;
}>;
/** One absorbed capture: everything needed to audit — or reverse — a duplicate verdict later. */
export interface AbsorptionEntry {
    readonly ts: string;
    readonly matchedId: string;
    readonly cosine: number;
    readonly containment?: number;
    readonly subsetMatch?: boolean;
    /** The FULL incoming text that was absorbed (uses++ on the match, no record created). */
    readonly text: string;
}
export declare function absorbedLogPath(projectRoot: string): string;
/**
 * Append the absorbed capture to `.dz/backlog/absorbed.jsonl`. Until this log existed, a DUPLICATE
 * verdict was the only backlog path that DESTROYED user text: the 2026-08-05 zombie-process idea and
 * the 2026-08-11 patient-values idea were both false absorptions whose original wording is gone
 * forever (`uses++` keeps no copy). The log makes every absorption auditable and reversible
 * (`dz backlog add` the logged text again after fixing the config). Best-effort: never throws, never
 * blocks capture — an unwritable log returns `{error}` for the caller to surface.
 */
export declare function recordAbsorption(projectRoot: string, entry: AbsorptionEntry): {
    error?: string;
};
/** Marker recording which dedup embed FORM the mirrored vectors were built with. */
export declare function backlogEmbedFormPath(projectRoot: string): string;
/** The recorded embed-form version, or 1 (the pre-marker full-text form) when absent/corrupt. */
export declare function readBacklogEmbedFormVersion(projectRoot: string): number;
export interface EmbedFormReport {
    readonly action: 'current' | 'migrated' | 'deferred' | 'empty';
    /** The version the store is at AFTER this call. */
    readonly version: number;
    readonly remirrored?: number;
    readonly error?: string;
}
/**
 * Bring the mirrored dz-backlog vectors into the CURRENT embed form ({@link DEDUP_EMBED_FORM_VERSION}).
 * v1 vectors were full-text embeds; v2 queries are bounded excerpts — comparing across the two forms
 * is a query-vs-row space split for any idea longer than the cap (the exact "stale space rot" the
 * ADR-001 comments warn about). Re-mirrors every idea through the ONE seam (upsert-by-dzId, so it is
 * idempotent), and writes the marker ONLY after every re-mirror succeeded — a half-migrated store
 * keeps claiming the old version and is retried next time. Best-effort: NEVER blocks capture; a
 * `deferred` outcome must be surfaced by the caller (a silent stale space is the trap).
 */
export declare function ensureBacklogEmbedForm(projectRoot: string, deps?: {
    mirror?: (root: string, idea: IdeaRecord) => Promise<{
        mirrored: number;
        error?: string | undefined;
    }>;
}): Promise<EmbedFormReport>;
//# sourceMappingURL=backlog.d.ts.map
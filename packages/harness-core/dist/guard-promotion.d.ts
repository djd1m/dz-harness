/**
 * `dz guard promote` — lesson → guard-rule PROMOTION with a "win twice to promote" gate.
 *
 * The cost-of-detection ladder says: put every check on the strongest layer that can express it.
 * `dz compounding` MEASURED (2026-07-29) that this repo's learned store is ~82% write-only while the
 * rules that DID reach layer 1 collapsed their own violation rate (no-workspace-star 31→0,
 * readme-first 49→4). This module is the elevator: it moves a lesson from layer 5 (agent memory) to
 * layer 1 (a deterministic rule) — but only when real evidence earns it.
 *
 * Ported from rUv's `@claude-flow/guidance` ADR-G008 (optimizer-promotion-rule, ACCEPTED) +
 * `src/optimizer.ts` / `src/ledger.ts` (`score = frequency * cost`, promotionTracker, two
 * consecutive wins, one loss resets). IMPROVEMENT OVER SOURCE: ADR-G008's own Negative section
 * admits its A/B uses hard-coded SIMULATED reduction percentages. Here a "win" is a REPLAY of the
 * candidate's check over REAL commits — the firings are real or there is no win.
 *
 * PURE: zero imports, zero I/O, no wall clock. Callers inject lessons, existing rules, and the
 * change history; this module only computes. Same facts ⇒ byte-identical report.
 *
 * WHAT THIS DELIBERATELY IS NOT: a rule SYNTHESISER. Rule code is never generated from lesson text —
 * that is layer-4 model judgment wearing layer-1 clothing, and its failure mode is silent. The fixed
 * template vocabulary below is the entire executable surface (ADR-002).
 */
/**
 * The v1 templates. ALL THREE are CHANGE-SHAPED: predicates over the file list of one change, which
 * is exactly what `git log --name-only` replays and what `git status` supplies at publish time.
 *
 * `presence-check` (a repo-STATE predicate, e.g. "every skill dir must carry a SKILL.md") is
 * deliberately ABSENT. Shadow-replaying a state predicate would need a tree walk at every historical
 * commit; the cheap substitute — evaluating it against TODAY's tree once per period — returns the
 * same answer in every window and so MANUFACTURES two consecutive wins out of one observation.
 * A fabricated win is the one thing this gate must never produce, so presence-shaped lessons are
 * refused by name (see `classifyLesson`).
 */
export type RuleTemplate = 'pairing-check' | 'absence-check' | 'format-match';
export declare const TEMPLATES: readonly RuleTemplate[];
export declare function isOffsetIsoTimestamp(value: unknown): value is string;
export interface TemplateParams {
    /** pairing-check: the glob whose presence in a change ARMS the rule. */
    readonly when?: string;
    /** pairing-check: the glob that must ALSO be in the change. */
    readonly requires?: string;
    /** absence-check: a change touching this glob is itself the violation. */
    readonly forbid?: string;
    /** format-match: the glob whose changed files must contain `mustMatch`. */
    readonly file?: string;
    /** format-match: a LITERAL substring (never a regex — a lesson-derived regex is unbounded risk). */
    readonly mustMatch?: string;
}
/** One change under evaluation: a commit during shadow replay, or the working tree at guard time. */
export interface ChangeSet {
    /** commit sha, or a synthetic id for the working tree. */
    readonly id: string;
    readonly ts: string;
    readonly files: readonly string[];
    /** path → text. Only `format-match` reads it; absent ⇒ that template cannot be evaluated. */
    readonly contents?: Readonly<Record<string, string>>;
}
/** Params are well-formed for their template (a hand-edited config cannot smuggle a half-rule in). */
export declare function validTemplateParams(template: unknown, params: unknown): params is TemplateParams;
/**
 * `**` matches any run of characters (including `/`); `*` matches any run WITHOUT `/`. Every other
 * character is regex-escaped, so a lesson-derived token can never become an expression. Anchored at
 * both ends. Never throws.
 *
 * The leading `**​/` is OPTIONAL — `**​/package.json` matches BOTH `packages/a/package.json` and a
 * root-level `package.json`. A naive `.*` + `/` made the segment mandatory, so every promoted rule
 * silently missed root-level files: the shadow replay of a real 12-commit history scored 0 firings
 * and the candidate WAITED forever, looking like an honest verdict. A false gate is only ever found
 * by RUNNING it — the unit tests were green throughout.
 */
/**
 * The most wildcard groups a glob may contain. Our own classifier emits exactly ONE (`**​/<token>`),
 * so 2 is already generous; the cap exists because a regex built from `**a**a**a…` backtracks
 * catastrophically (Codex QE MEASURED >10 s on such a pattern). Collapsing adjacent `.*` does NOT
 * fix that — `.*a.*a.*a` is polynomial in the number of groups, so degree is the thing to bound.
 * Refusal is the right answer here: these params come from a classifier we control, and a glob
 * beyond the cap is a hand-edited config, not a promotion.
 */
export declare const MAX_GLOB_WILDCARDS = 2;
/** Longest path a glob is matched against; beyond this the input is not a repo path. */
export declare const MAX_GLOB_PATH_LENGTH = 4096;
/** Longest glob accepted. Mirrors the length bound in {@link validTemplateParams}. */
export declare const MAX_GLOB_LENGTH = 200;
/** Collapse `***`/`****`/… runs to `**`, so padding cannot inflate the wildcard count. */
export declare function normalizeGlob(glob: string): string;
/** How many wildcard groups (`**` or `*`) a NORMALIZED glob contains. */
export declare function globWildcardCount(glob: unknown): number;
/** A glob this module is willing to compile: bounded length AND bounded wildcard degree. */
export declare function isSafeGlob(glob: unknown): glob is string;
export declare function globMatch(glob: unknown, path: unknown): boolean;
export type FireOutcome = {
    readonly fired: boolean;
    readonly detail?: string;
} | {
    readonly undecidable: string;
};
/**
 * Does this (template, params) fire on this change? ONE definition, used by BOTH the historical
 * replay and `evaluateGuard`'s template checker — a second copy would let the promoter promise a
 * rule the guard then enforces differently, silently.
 *
 * `undecidable` (not `fired:false`) when the evidence the template needs is absent: a
 * `format-match` over a change whose contents were not fetched is NOT a clean change, and counting
 * it as a non-firing would convert missing data into a LOSS (the INSUFFICIENT_DATA discipline).
 */
export declare function templateFires(template: RuleTemplate, params: TemplateParams, change: ChangeSet): FireOutcome;
export interface ClassifiedLesson {
    readonly template: RuleTemplate;
    readonly params: TemplateParams;
    readonly tokens: readonly string[];
}
export interface ClassifyRefusal {
    readonly reason: string;
}
export declare function isClassified(x: ClassifiedLesson | ClassifyRefusal): x is ClassifiedLesson;
/** Artifact tokens in TEXT ORDER, deduped. A token with no `/` becomes a basename glob. */
export declare function artifactTokens(text: string): string[];
/** `README.md` → `**​/README.md`; `packages/x/README.md` → itself. */
export declare function tokenToGlob(token: string): string;
/**
 * Reduce a lesson to a (template, params) pair, or refuse WITH A REASON.
 *
 * Conservative by construction and asymmetric by design: a false negative costs a missed promotion
 * (the lesson stays exactly where it already was); a false positive is caught downstream by the
 * win-twice gate and the duplicate refusal, and even a survivor lands SOFT + advisory.
 */
export declare function classifyLesson(text: unknown): ClassifiedLesson | ClassifyRefusal;
/**
 * FNV-1a, 32-bit — a DISCRIMINATOR, not a security primitive, and labelled as one.
 *
 * It exists solely to keep two DIFFERENT rule bodies from claiming the same id after slug
 * normalisation (`a.b.json` and `a-b.json` both slug to `a-b-json`). Nothing trusts it for
 * integrity or authenticity; the key space is a few dozen self-generated rule bodies, so a
 * non-cryptographic 32-bit mix is ample. Kept in-module because this file is deliberately pure with
 * zero imports (NFR-1) — reaching for `node:crypto` here would buy nothing the threat model needs.
 */
export declare function fnv1a32(s: string): string;
/**
 * Stable rule id derived from the template + its bound params.
 *
 * The trailing hash is load-bearing (Codex QE MED-6): the slug lowercases and collapses every
 * non-alphanumeric run, so `a.b.json` and `a-b.json` — two genuinely different rules — produced the
 * SAME id and the second silently read as a duplicate of the first. The hash is taken over the
 * template and the actual PARAMS (not the pre-normalisation tokens), so two rules collide only if
 * they would enforce exactly the same thing.
 */
export declare function derivedRuleId(c: ClassifiedLesson): string;
/**
 * The character set a promoted rule id may use. Enforced wherever an id becomes part of a FILE PATH:
 * an id is data that has round-tripped through `.dz/promotion-state.json`, and a path segment built
 * from unvalidated data is an arbitrary-write primitive (Codex QE HIGH-1).
 */
export declare function isSafeRuleId(id: unknown): id is string;
/** The one place mini-ADR paths are defined (POSIX-relative, forward slashes). */
export declare const PROMOTIONS_REL_DIR = "features/guard-promotion/promotions";
/**
 * DERIVE a mini-ADR path from a validated id + an integer sequence — the only way a promotion
 * document path is ever produced (Codex QE HIGH-1). Returns `null` when either input fails
 * validation, so a caller that gets `null` writes nothing rather than falling back to a raw string.
 * The character set (`isSafeRuleId`) admits no `/`, no `.`, and no `..`, so the result cannot escape
 * {@link PROMOTIONS_REL_DIR}; callers still assert containment after resolving, because a derivation
 * that is correct today is not a substitute for checking the thing you are about to write.
 */
export declare function promotionAdrRelPath(ruleId: unknown, seq: unknown): string | null;
/**
 * Template-equivalents of the built-in guard rules that have one. Rule ids are plain literals — this
 * module must not import `guard.ts` (guard.ts imports THIS one).
 *
 * DELIBERATELY PARTIAL. `no-secrets` (content regexes), `readme-consistency` (numeric parity),
 * `no-skill-drift` (byte comparison) and `store-bloat-cap` (a counter) have no template equivalent
 * and are simply absent. Partiality errs in the SAFE direction only because over-refusing costs a
 * missed promotion while under-refusing ships a duplicate rule — so when in doubt, add an entry.
 */
export declare const BUILTIN_COVERAGE: Readonly<Record<string, {
    readonly template: RuleTemplate;
    readonly params: TemplateParams;
}>>;
/** Order-insensitive, whitespace-insensitive params key for equality. */
export declare function paramsKey(template: RuleTemplate, params: TemplateParams): string;
/**
 * Exact-byte discriminator of effective promoted-rule content. The ordered tuple keeps boundaries
 * unambiguous; only its two-part digest is persisted, so lesson-derived literals are not copied into
 * observational history. This is correlation identity, not authentication of a locally editable log.
 */
export declare function lessonRuleContentAnchor(template: RuleTemplate, params: TemplateParams): string;
export declare function isLessonRuleContentAnchor(value: unknown): value is string;
/** A rule already present in the engine or the config, in the shape the dedup check consumes. */
export interface ExistingRuleView {
    readonly id: string;
    readonly template?: RuleTemplate;
    readonly params?: TemplateParams;
}
/** The id of the rule that already covers this candidate, or `null`. */
export declare function coveringRule(c: ClassifiedLesson, existing: readonly ExistingRuleView[]): string | null;
export declare const DEFAULT_WINDOW_DAYS = 7;
export declare const DEFAULT_PERIODS = 4;
/** Below this many changes a window carries no information — it is SKIPPED, never counted a loss. */
export declare const MIN_CHANGES_PER_PERIOD = 5;
export declare const WINS_TO_PROMOTE = 2;
/** Cap on `git show` fetches per run; over it, a format-match candidate is insufficient-data. */
export declare const MAX_CONTENT_FETCHES = 200;
export interface Period {
    readonly start: string;
    readonly end: string;
    readonly changes: readonly ChangeSet[];
}
/**
 * Cut history into `periods` consecutive `windowDays` windows anchored at `nowMs`, walking BACKWARDS
 * and returned oldest→newest. Wall-clock windows, NOT per-invocation and NOT per-commit-count: an
 * operator's invocation frequency must never be an input to a safety gate (ADR-003 option A).
 */
export declare function buildPeriods(changes: readonly ChangeSet[], nowMs: number, windowDays?: number, periods?: number): Period[];
export type PeriodOutcome = 'win' | 'loss' | 'skipped';
export interface PeriodResult {
    readonly start: string;
    readonly end: string;
    readonly changes: number;
    readonly firings: number;
    readonly outcome: PeriodOutcome;
    /** first firing's evidence — a real commit id, so a win is always citable. */
    readonly evidence?: string;
}
export interface CandidateEvaluation {
    readonly periods: readonly PeriodResult[];
    readonly evaluatedPeriods: number;
    /** consecutive wins ENDING at the newest evaluated period. A loss resets to 0. */
    readonly wins: number;
    readonly totalFirings: number;
    /** set when a template could not be decided over the available evidence. */
    readonly undecidable?: string;
}
/**
 * Replay the candidate over each period.
 *
 * A period below {@link MIN_CHANGES_PER_PERIOD} is SKIPPED — a one-commit week that happens not to
 * touch package.json is NOT evidence the pairing rule is worthless, it is NO evidence, and absence
 * of data must never be converted into a negative observation.
 */
export declare function evaluateCandidate(c: ClassifiedLesson, periods: readonly Period[], minChanges?: number): CandidateEvaluation;
export type CandidateVerdict = 'promote' | 'wait' | 'insufficient-data' | 'duplicate' | 'not-promotable';
export interface LessonInput {
    readonly dzId: string;
    readonly text: string;
    readonly quarantined: boolean;
    /** reinforcement/use count — the `cost` PROXY (see `score`). */
    readonly uses: number;
}
export interface PromotionCandidate {
    readonly lessonId: string;
    readonly lessonText: string;
    /** False only for quarantined hypotheses; classification alone never makes them eligible. */
    readonly eligible: boolean;
    readonly ruleId: string | null;
    readonly template: RuleTemplate | null;
    readonly params: TemplateParams | null;
    readonly verdict: CandidateVerdict;
    readonly reason: string;
    /** `totalFirings × (1 + uses)`. `cost` is an explicitly named PROXY, not a token/dollar figure. */
    readonly score: number;
    readonly firings: number;
    readonly cost: number;
    readonly wins: number;
    readonly evaluatedPeriods: number;
    readonly periods: readonly PeriodResult[];
    /** the exact `.dz/guard.json` entry `--apply` would write (only for `promote`). */
    readonly proposedRule: PromotedRule | null;
    /** LOCAL-clock first observation (see {@link ELAPSED_WINDOWS_REQUIRED}); null until recorded. */
    readonly firstSeenTs: string | null;
    /** real elapsed ms since `firstSeenTs`, and the amount required, both for the report. */
    readonly elapsedMs: number;
    readonly elapsedRequiredMs: number;
}
export interface PromotionFacts {
    readonly lessons: readonly LessonInput[];
    readonly existingRules: readonly ExistingRuleView[];
    readonly changes: readonly ChangeSet[];
    readonly nowTs: string;
    readonly windowDays?: number;
    readonly periods?: number;
    /**
     * ruleId → the LOCAL-CLOCK timestamp at which this candidate was first recorded in
     * `.dz/promotion-state.json`. See {@link ELAPSED_WINDOWS_REQUIRED}. Absent ⇒ first observation
     * ⇒ the elapsed clock starts now, so nothing promotes on the very first recording run.
     */
    readonly firstSeen?: Readonly<Record<string, string>>;
}
/**
 * A promotion also needs this many WINDOW-LENGTHS of REAL elapsed time since the candidate was first
 * recorded — a defence Codex QE (MED-7) showed the window logic alone does not provide.
 *
 * The threat is not an attacker; it is ACCIDENTAL SELF-GAMING. Commit timestamps are author-supplied
 * (`GIT_COMMITTER_DATE`, a rebase, an import, a clock skew), so a repo whose history is minted in one
 * afternoon can present two full "windows" instantly, and the gate that is supposed to mean *"this
 * recurred over two separate stretches of work"* would mean nothing.
 *
 * THE HONEST SPLIT, stated so it is not mistaken for more than it is:
 *   • committer dates are trusted for firing ATTRIBUTION — which commit a violation belongs to;
 *   • the LOCAL clock, journalled in state, gates ELAPSED time — how long we have been watching.
 * This is not cryptographic and does not resist a determined forger (state is a local JSON file you
 * can edit). It resists the realistic failure: history that only LOOKS like it spans two windows.
 */
export declare const ELAPSED_WINDOWS_REQUIRED = 2;
export interface PromotionReport {
    readonly candidates: readonly PromotionCandidate[];
    readonly totalLessons: number;
    readonly quarantinedSkipped: number;
    readonly windowDays: number;
    readonly periodCount: number;
    readonly totalChanges: number;
    readonly verdict: string;
}
/** The rule object written into `.dz/guard.json`. SOFT always — see ADR-004 / `resolveRules`. */
export interface PromotedRule {
    readonly id: string;
    readonly severity: 'soft';
    readonly ops: readonly string[];
    readonly enabled: true;
    readonly template: RuleTemplate;
    readonly params: TemplateParams;
    readonly description: string;
}
export declare function promotedRuleObject(c: ClassifiedLesson, ruleId: string, lessonId: string): PromotedRule;
/**
 * Rank every lesson and decide. Deterministic: the sort is (score desc, ruleId asc, lessonId asc), so
 * ties never reorder between runs.
 */
export declare function assembleCandidates(facts: PromotionFacts): PromotionReport;
/** Enough prospective observations for multi-year monthly reporting without an unbounded journal. */
export declare const MAX_PROMOTION_RUN_EVIDENCE = 120;
/** A larger run is recorded as incomplete, so truncation becomes NOT MEASURED rather than a low count. */
export declare const MAX_PROMOTION_RUN_CANDIDATES = 10000;
export declare const MAX_PROMOTION_ACCEPTANCE_EVIDENCE = 10000;
export interface PromotionRunCandidateEvidence {
    readonly candidateAnchor: string;
    readonly eligible: boolean;
    readonly ruleContentAnchor: string | null;
    readonly verdict: CandidateVerdict;
}
export interface PromotionRunEvidence {
    readonly runId: string;
    readonly ts: string;
    readonly complete: boolean;
    readonly candidates: readonly PromotionRunCandidateEvidence[];
}
export interface PromotionAcceptanceEvidence {
    readonly ruleContentAnchor: string;
    readonly acceptedTs: string;
}
export interface PromotionStateEntry {
    readonly ruleId: string;
    readonly lessonId: string;
    readonly firstSeenTs: string;
    readonly lastRunTs: string;
    readonly wins: number;
    readonly evaluatedPeriods: number;
    readonly verdict: CandidateVerdict;
    /**
     * The mini-ADR's SEQUENCE NUMBER — never its path. The path is DERIVED from this integer and the
     * validated rule id at write time (Codex QE HIGH-1): a path read back out of state and handed to
     * `writeFileSync` is an arbitrary-write primitive, and a corrupted entry
     * (`"adr": "../../victim"` or `".dz/guard.json"`) would overwrite files with no `--apply` at all.
     */
    readonly adrSeq?: number;
    readonly appliedTs?: string;
}
export interface PromotionState {
    readonly version: 1;
    readonly nextAdrSeq: number;
    readonly entries: Readonly<Record<string, PromotionStateEntry>>;
    /** Optional so a legacy v1 state remains distinguishable from a recorded zero-candidate run. */
    readonly runs?: readonly PromotionRunEvidence[];
    /** Months whose oldest whole run records were pruned; their promote counts are not measurable. */
    readonly truncatedRunPeriods?: readonly string[];
    /** Compact durable join provenance, independent of bounded per-run retention. */
    readonly acceptances?: readonly PromotionAcceptanceEvidence[];
    /** False means an unmatched promoted firing may belong to pre-feature or pruned provenance. */
    readonly acceptanceHistoryComplete?: boolean;
}
export declare const EMPTY_PROMOTION_STATE: PromotionState;
/**
 * Read state defensively. `Object.hasOwn` (never `in`) so a prototype-polluted JSON cannot conjure an
 * entry; `Number.isInteger` on every counter because `1e400` parses to `Infinity`, passes `> 0`, and
 * this repo has already been bitten by exactly that twice (storeCap, auto-cost).
 */
export declare function normalizePromotionState(raw: unknown): PromotionState;
/**
 * Fold a report into the state journal.
 *
 * THE ANTI-GAMING PROPERTY (SP-3): `wins` is OVERWRITTEN with the freshly recomputed value — it is
 * never `prev.wins + …`. The state is a JOURNAL, not the source of truth, so running the promoter
 * ten times over unchanged history leaves the counter exactly where one run leaves it. (Recalled
 * lesson: "a learning loop's write path can promote by EXPOSURE without anyone noticing.")
 */
export declare function nextPromotionState(prev: PromotionState, report: PromotionReport, nowTs: string, adrSeqs?: Readonly<Record<string, number>>, newlyAllocated?: number): PromotionState;
/** Add one prospective observation without changing any promotion decision or candidate report. */
export declare function recordPromotionRunEvidence(state: PromotionState, report: PromotionReport, nowTs: string): PromotionState;
export declare function renderPromotionReport(r: PromotionReport, limit?: number): string;
/**
 * The mini-ADR for one decision. Written for PROMOTIONS and REJECTIONS alike (ADR-G008 requires
 * both) — a refusal is a decision about the harness's own capability, and it is what turns the
 * "not promotable" list into a roadmap instead of a shrug. `wait` / `insufficient-data` get NO
 * document: they are not decisions yet, and one per run would bury the real ones.
 */
export declare function renderPromotionAdr(c: PromotionCandidate, seq: number, nowTs: string): string;
//# sourceMappingURL=guard-promotion.d.ts.map
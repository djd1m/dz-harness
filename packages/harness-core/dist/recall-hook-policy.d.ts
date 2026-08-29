/**
 * Pure policy for the `dz recall` APPLY leg — the `UserPromptSubmit` hook that grounds a live prompt
 * against the learned-pattern store.
 *
 * ## Why a floor is the whole feature
 *
 * A store nobody reads is a write-only log; an apply-leg with no rank-leg is a noise generator. The
 * sibling failure is live in this repo: agentic-qe's per-prompt hook injects the same five static
 * guidance lines on every turn regardless of topic, and only 10 of its 198 stored patterns ever had
 * `usage_count > 0`. Beating that means one thing above all: **emit nothing when nothing is relevant.**
 *
 * ## Where the numbers come from (MEASURED, not chosen by feel)
 *
 * Calibrated 2026-07-09 on a 32-probe labeled set (16 RU + 16 EN, half relevant / half irrelevant),
 * embedded with `Xenova/paraphrase-multilingual-MiniLM-L12-v2` against the real 103-pattern store.
 * Fixture: `test/fixtures/recall-floor-probes.json`; the dep-gated test re-derives the separation.
 *
 * - **Absolute max-cosine separates perfectly** — a single global floor of `0.353` classified all 32
 *   probes correctly. Per language the safe window widens: RU `min(relevant)=0.415`,
 *   `max(irrelevant)=0.337`; EN `min(relevant)=0.369`, `max(irrelevant)=0.254`.
 * - **A z-score `(max − mean) / sd` FAILS** (69 % accuracy, negative margin). An off-topic query has a
 *   flat, low similarity profile, so its best hit stands out *relative to its own mean* — `"who won the
 *   world cup"` scored z = 3.60, higher than half the relevant probes. Distance from your own mean
 *   measures flatness, not relevance. This was the elegant idea; the data refuted it.
 * - The language baseline shift is **real but survivable**: an irrelevant Russian query reaches 0.337
 *   where an irrelevant English one reaches 0.254. A single floor still works, with a thin 0.032
 *   margin; per-language floors triple it. Hence the defaults below.
 *
 * The turns that must stay silent do (2026-07-09 numbers; re-measured 2026-08-24 — «спасибо» rose
 * to 0.416 but is cut by the SIGNAL gate before any floor, and «какой статус?» rose to 0.386, which
 * is what forced the recalibration above): both under
 * every floor here.
 *
 * @packageDocumentation
 */
/** Script family of a query — the only axis the floor is calibrated on. */
export type QueryLang = 'ru' | 'en';
/** Per-language relevance floors on the max cosine similarity, `[0,1]`. */
export interface RecallFloors {
    readonly ru: number;
    readonly en: number;
}
/**
 * MEASURED defaults. RU sits higher than EN because a multilingual encoder places any Cyrillic text
 * slightly closer to any Latin text than two unrelated Latin texts are to each other — the baseline,
 * not the signal, is what shifts.
 */
export declare const DEFAULT_RECALL_FLOORS: RecallFloors;
/** Max hits injected into a turn. Three is the ADR default; more is noise, not context. */
export declare const DEFAULT_RECALL_HOOK_LIMIT = 3;
/** Rough character budget for the injected block (~4 chars/token; Cyrillic runs denser, so this is conservative). */
export declare const DEFAULT_RECALL_HOOK_BUDGET_CHARS = 1200;
/**
 * Which floor applies to this prompt. Cyrillic anywhere ⇒ `'ru'`: a mixed prompt such as
 * `"почему codex барьер даёт ложный grade D"` carries the Russian baseline, so it must be judged by
 * the stricter floor. Never throws — a non-string is `'en'`.
 */
export declare function detectQueryLang(text: unknown): QueryLang;
/** The floor for a prompt, given (possibly partial, possibly garbage) configured overrides. */
export declare function relevanceFloorFor(text: unknown, floors: Partial<RecallFloors> | undefined): number;
/** Below this many characters a prompt carries too little signal to judge. */
export declare const MIN_PROMPT_CHARS = 10;
/** …and it must contain at least this many content tokens (length ≥ 3). */
export declare const MIN_CONTENT_TOKENS = 2;
/**
 * A prompt too short to judge. Found by dogfooding the live hook: `"тест"` and `"json"` cleared the
 * cosine floor (0.43) purely because a one-word technical token is genuinely close to technical
 * lessons — the similarity is real, the relevance is not. A floor cannot fix this; the query simply
 * carries no intent. Never throws.
 */
export declare function hasEnoughSignal(text: unknown): boolean;
/** One ranked candidate from the recall engine. `score` is the relevance in `[0,1]`, NOT the reward. */
export interface HookCandidate {
    /** Stable dz store id (`metadata.dzId` in the vector mirror), used only for usage accounting. */
    readonly dzId?: string;
    readonly pattern: string;
    readonly score: number;
    readonly domain?: string;
    /** lesson-quarantine: an unproven hypothesis — the AUTO-INJECT surface excludes it (FR-5). */
    readonly quarantined?: boolean;
}
export interface HookSelection {
    readonly hits: readonly HookCandidate[];
    /** The floor that was applied — reported so the hook's own output can explain its silence. */
    readonly floor: number;
    readonly lang: QueryLang;
    /**
     * lesson-quarantine AM-2: how many candidates were dropped for being quarantined — the
     * exclusion is OBSERVABLE (the hook logs it), never a silent shrink of the context.
     */
    readonly quarantinedExcluded: number;
}
/**
 * Apply the floor, the limit and the character budget. Returns an EMPTY hit list whenever nothing
 * clears the floor — the caller must then print nothing at all and exit 0. Pure, never throws:
 * malformed candidates (missing/NaN score, empty text) are dropped rather than crashing a turn.
 */
export declare function selectHookHits(prompt: unknown, candidates: readonly HookCandidate[] | null | undefined, opts?: {
    floors?: Partial<RecallFloors>;
    limit?: number;
    budgetChars?: number;
}): HookSelection;
/**
 * Render the `additionalContext` block. Returns `''` when there is nothing to say — the caller emits
 * NOTHING (not an empty JSON envelope) and exits 0, so an off-topic turn costs the reader zero tokens.
 */
export declare function renderHookContext(selection: HookSelection): string;
/**
 * The closeness token for one recall row: `sim=0.67▲` above the floor, `sim=0.29▽` below it,
 * `sim=—` when closeness was not measured for this row.
 *
 * The marker is the floor comparison DONE FOR THE READER, against the same per-language floors the
 * hook already trusts — calibrated 2026-07-09 on a 32-probe labeled set, not chosen by feel. A bare
 * cosine means nothing without that table, and the point of this token is a number the reader can
 * act on: `▲` is on-topic, `▽` is "ranked because something had to rank first", `—` is "unmeasured".
 *
 * A lexical-only hit and an engine whose score is not a cosine both get the dash. Substituting a
 * differently-scaled number there is the precise lie this exists to remove.
 */
export declare function closenessLine(similarity: number | undefined, query: unknown, floors?: Partial<RecallFloors>): string;
/** Did anything clear the floor? Used to say so ONCE, in words, instead of per row. */
export declare function anyAboveFloor(similarities: readonly (number | undefined)[], query: unknown, floors?: Partial<RecallFloors>): boolean;
//# sourceMappingURL=recall-hook-policy.d.ts.map
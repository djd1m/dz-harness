/**
 * Domain-aware recall re-ranking — the pure half of `dz recall --domain <name>`.
 *
 * WHY THIS EXISTS. `dz teach --domain <name>` has always recorded a domain, and
 * `dz recall --all --stats` prints the per-domain histogram — but the RANKING path
 * (`recallHybrid`: lexical FTS5 + optional vector leg merged by RRF) never looked at
 * the field. So a store shared by different KINDS of work returns them interleaved:
 * medical-research lessons dilute a coding recall and vice versa, and the dilution
 * gets worse as either side grows.
 *
 * WHY A BOOST AND NOT A FILTER. Cross-pollination here is real, not theoretical:
 * "a reviewer's evidence needs the same execute-don't-describe discipline as your
 * own claims" was learned reviewing code and applies verbatim to medical sources;
 * the medical report's core insight ("was the source ever opened?") is the same
 * principle as our claim-check. A hard filter would cut exactly the transfers that
 * make one store worth more than two. So: matching-domain hits move UP, foreign
 * ones stay in the list.
 *
 * THE PROMISE, NARROWLY: this reorders. It NEVER drops a hit, never invents one,
 * and never changes how many are returned. If the boost is wrong, the cost is
 * ordering; it can't hide a lesson from you.
 */
import type { RecallHit } from './patterns.js';
/** How many places a same-domain lesson may climb. STATED AS POSITIONS, not as a
 * score multiplier: "moves up at most two places" is a sentence a reader can check
 * against the output, while "index × 0.55" is an opaque constant whose behaviour
 * changes with position (it could not lift index 2 past index 1 at all, but did
 * lift index 3 past index 2 — an accident, not a design). A bounded lift keeps
 * lexical relevance dominant: a domain tag is a hint about relevance, not evidence
 * of it, so it breaks near-ties instead of overruling the ranking. */
export declare const DOMAIN_LIFT_EXACT = 2;
/** A prefix/suffix relative (`health-research` against `health`) climbs less. */
export declare const DOMAIN_LIFT_RELATED = 1;
export type DomainMatch = 'exact' | 'related' | 'none';
/** Normalize a domain tag for comparison: case- and separator-insensitive, so
 * `Health-Research`, `health_research` and `health research` are one domain. */
export declare function normalizeDomain(domain: string | null | undefined): string;
/** How a hit's domain relates to the requested one. `related` covers the common
 * hierarchy shapes (`health` ↔ `health-research`) without a taxonomy: a taxonomy
 * nobody maintains drifts, and a wrong taxonomy is worse than none. */
export declare function domainMatch(hitDomain: string | null | undefined, wanted: string | null | undefined): DomainMatch;
export interface DomainBoostResult<T extends RecallHit = RecallHit> {
    readonly hits: readonly T[];
    /** How many hits MATCHED the domain (exactly / relatedly). */
    readonly exact: number;
    readonly related: number;
    /** How many hits actually CHANGED position. Counted separately because the note
     * used to print the match counts as "lifted" — an exact match already at rank 0,
     * or a list that is entirely one domain, matches without moving, and calling that
     * "lifted" tells the reader the ranking changed when it did not. */
    readonly moved: number;
    /** True when NOTHING in the result matched: the caller says so out loud rather
     * than implying the ranking is domain-aware when it had nothing to work with. */
    readonly noMatches: boolean;
}
/**
 * Re-rank hits so same-domain lessons surface first, keeping every hit.
 *
 * Effective position = `index - lift`. The original relevance order dominates; the
 * domain only breaks near-ties, and the lift is BOUNDED so a tail match can never
 * teleport to the top. Ties keep the incoming order (stable sort), so the function
 * is deterministic — the same input always yields the same output, which is what
 * makes it testable at all.
 */
/**
 * Generic over the hit type so EXTRA FIELDS SURVIVE the boost. Narrowing to `RecallHit` silently
 * dropped `similarity` from a `HybridHit`, and the closeness a reader is meant to act on vanished
 * the moment `--domain` was passed. Note the deliberate asymmetry with `relevance`, which the CLI
 * nulls under a boost because the boost invalidates the RRF ordering: closeness is
 * ORDER-INDEPENDENT, so it stays populated.
 */
export declare function applyDomainBoost<T extends RecallHit>(hits: readonly T[], wanted: string | null | undefined): DomainBoostResult<T>;
/**
 * How many hits the CUT hid that an unboosted recall would have shown.
 *
 * WHY THIS EXISTS. `applyDomainBoost` never drops a hit — but the CLI still cuts the
 * list at `--limit`, and a promotion INTO the top N necessarily pushes something out
 * of it. Cross-model review found the resulting sentence to be a lie by omission: the
 * note said "foreign-domain lessons kept" while `foreign-B`, visible without
 * `--domain`, had vanished from the printed output. Both statements were true of
 * different lists, which is exactly how an honest tool ends up misleading its reader.
 *
 * The fix is not to stop promoting — that would be the filter we refused to build. It
 * is to COUNT what fell past the cut and say so, because the reader can act on that
 * (raise `--limit`) only if they know it happened.
 *
 * Compares by identity: both lists hold the same hit objects.
 */
export declare function countDisplacedByCut(original: readonly RecallHit[], boosted: readonly RecallHit[], limit: number): number;
/** The line that reports the cut. Empty when nothing was displaced, so the common
 * case stays quiet. */
export declare function renderDomainCutNote(displaced: number, limit: number): string;
/** One honest line about what the boost did — including the case where it did
 * nothing, which a silent reorder would hide.
 *
 * The two tail phrases below are a WIRE CONTRACT: `learning_bridge.py` in the
 * `goap-research-ed25519` skill detects whether the installed `dz` supports
 * `--domain` by looking for them, because an older CLI ignores the flag and exits 0
 * (so an exit code cannot tell the versions apart). A test pins both strings — if you
 * reword them, update the bridge in the same change or you switch that loop into
 * permanent degraded mode without a single test turning red. */
export declare function renderDomainBoostNote(result: DomainBoostResult, wanted: string): string;
//# sourceMappingURL=recall-domain-boost.d.ts.map
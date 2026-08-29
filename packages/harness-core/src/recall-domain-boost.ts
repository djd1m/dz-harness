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
export const DOMAIN_LIFT_EXACT = 2;

/** A prefix/suffix relative (`health-research` against `health`) climbs less. */
export const DOMAIN_LIFT_RELATED = 1;

export type DomainMatch = 'exact' | 'related' | 'none';

/** Normalize a domain tag for comparison: case- and separator-insensitive, so
 * `Health-Research`, `health_research` and `health research` are one domain. */
export function normalizeDomain(domain: string | null | undefined): string {
  return String(domain ?? '')
    .toLowerCase()
    .replace(/[\s_]+/g, '-')
    // COLLAPSE hyphen runs. `Health - Research` became `health---research`, which the
    // doc comment above calls one domain with `health-research` and the code then
    // treated as unrelated. Only ordering is at stake here — the export hold-out has its
    // own stricter key — but a comment that describes behaviour the code lacks is the
    // same defect wherever it sits.
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** How a hit's domain relates to the requested one. `related` covers the common
 * hierarchy shapes (`health` ↔ `health-research`) without a taxonomy: a taxonomy
 * nobody maintains drifts, and a wrong taxonomy is worse than none. */
export function domainMatch(hitDomain: string | null | undefined, wanted: string | null | undefined): DomainMatch {
  const a = normalizeDomain(hitDomain);
  const b = normalizeDomain(wanted);
  if (a === '' || b === '') return 'none';
  if (a === b) return 'exact';
  if (a.startsWith(`${b}-`) || b.startsWith(`${a}-`)) return 'related';
  return 'none';
}

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
export function applyDomainBoost<T extends RecallHit>(hits: readonly T[], wanted: string | null | undefined): DomainBoostResult<T> {
  const target = normalizeDomain(wanted);
  if (target === '' || hits.length === 0) {
    return { hits, exact: 0, related: 0, moved: 0, noMatches: true };
  }
  let exact = 0;
  let related = 0;
  const scored = hits.map((hit, index) => {
    const match = domainMatch(hit.pattern.domain, target);
    if (match === 'exact') exact += 1;
    else if (match === 'related') related += 1;
    const lift = match === 'exact' ? DOMAIN_LIFT_EXACT : match === 'related' ? DOMAIN_LIFT_RELATED : 0;
    return { hit, index, lift, effective: index - lift };
  });
  // Tie-break: at equal effective position the LIFTED hit goes first, then the
  // original order. Without this the foreign hit it landed level with won the tie
  // by having the lower original index, so a lift of N moved the hit only N-1
  // places — the code quietly delivered less than the constant promised. A test
  // asserting the documented bound caught it; the fix is here, not in the test.
  scored.sort((a, b) => (a.effective - b.effective) || (b.lift - a.lift) || (a.index - b.index));
  const reordered = scored.map((s) => s.hit);
  let moved = 0;
  scored.forEach((s, newIndex) => { if (s.index !== newIndex) moved += 1; });
  return { hits: reordered, exact, related, moved, noMatches: exact === 0 && related === 0 };
}

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
export function countDisplacedByCut(
  original: readonly RecallHit[],
  boosted: readonly RecallHit[],
  limit: number,
): number {
  if (!Number.isFinite(limit) || limit <= 0) return 0;
  const shownAfter = new Set(boosted.slice(0, limit));
  let displaced = 0;
  for (const hit of original.slice(0, limit)) {
    if (!shownAfter.has(hit)) displaced += 1;
  }
  return displaced;
}

/** The line that reports the cut. Empty when nothing was displaced, so the common
 * case stays quiet. */
export function renderDomainCutNote(displaced: number, limit: number): string {
  if (displaced <= 0) return '';
  const plural = displaced === 1 ? 'lesson' : 'lessons';
  return `  ${displaced} lower-ranked ${plural} fell past the --limit ${limit} cut to make room — raise --limit to see them (the boost promotes; the cut is what hides)`;
}

/** One honest line about what the boost did — including the case where it did
 * nothing, which a silent reorder would hide.
 *
 * The two tail phrases below are a WIRE CONTRACT: `learning_bridge.py` in the
 * `goap-research-ed25519` skill detects whether the installed `dz` supports
 * `--domain` by looking for them, because an older CLI ignores the flag and exits 0
 * (so an exit code cannot tell the versions apart). A test pins both strings — if you
 * reword them, update the bridge in the same change or you switch that loop into
 * permanent degraded mode without a single test turning red. */
export function renderDomainBoostNote(result: DomainBoostResult, wanted: string): string {
  if (result.noMatches) {
    return `  domain "${wanted}": no lesson in this result carries it — order unchanged, nothing was hidden`;
  }
  const parts = [`${result.exact} exact`];
  if (result.related > 0) parts.push(`${result.related} related`);
  const effect = result.moved === 0
    ? 'the order was already correct — nothing moved'
    : `${result.moved} changed position`;
  // The counts describe the CANDIDATES the boost ranked, which is a longer list than
  // the one printed (the caller over-fetches, then cuts at --limit). Saying "3 changed
  // position" above two printed lines reads as an arithmetic error unless the note
  // names the list it is talking about — so it does.
  return `  domain "${wanted}": among ${result.hits.length} candidate(s) — ${parts.join(', ')} match(es), ${effect}; foreign-domain lessons kept (a boost, not a filter)`;
}

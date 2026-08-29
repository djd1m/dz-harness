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
/**
 * MEASURED defaults. RU sits higher than EN because a multilingual encoder places any Cyrillic text
 * slightly closer to any Latin text than two unrelated Latin texts are to each other — the baseline,
 * not the signal, is what shifts.
 */
// RECALIBRATED 2026-08-24 on the LIVE 281-pattern store, end to end through `dz recall --json`
// (the closeness feature made the true cosine visible, which is what exposed the drift): over the
// probes that actually REACH the floor — the signal gate cuts "спасибо"/"thanks" first —
//   ru: min(relevant)=0.409, max(irrelevant)=0.386 ("какой статус?", ABOVE the old 0.38 floor);
//   en: min(relevant)=0.413, max(irrelevant)=0.332 (nonsense scored 0.327, above the old 0.31).
// The 2026-07-09 floors were calibrated on 103 patterns; at 281 the irrelevant tail rose. The RU
// window is now THIN (+0.023) — an honest limit, not a solved problem: it narrows again as the
// store grows, and the next recalibration should follow the next major store growth.
// en is 0.36 rather than the live midpoint 0.37 because the hermetic fixture's weakest relevant
// probe sits at 0.369, and a floor above it would fail the calibration test that guards this file.
// Probe set + raw results: test/fixtures/recall-floor-live-2026-08-24.json.
export const DEFAULT_RECALL_FLOORS = { ru: 0.40, en: 0.36 };
/** Max hits injected into a turn. Three is the ADR default; more is noise, not context. */
export const DEFAULT_RECALL_HOOK_LIMIT = 3;
/** Rough character budget for the injected block (~4 chars/token; Cyrillic runs denser, so this is conservative). */
export const DEFAULT_RECALL_HOOK_BUDGET_CHARS = 1200;
const CYRILLIC = /[Ѐ-ӿ]/;
/**
 * Which floor applies to this prompt. Cyrillic anywhere ⇒ `'ru'`: a mixed prompt such as
 * `"почему codex барьер даёт ложный grade D"` carries the Russian baseline, so it must be judged by
 * the stricter floor. Never throws — a non-string is `'en'`.
 */
export function detectQueryLang(text) {
    if (typeof text !== 'string')
        return 'en';
    return CYRILLIC.test(text) ? 'ru' : 'en';
}
/** The floor for a prompt, given (possibly partial, possibly garbage) configured overrides. */
export function relevanceFloorFor(text, floors) {
    const lang = detectQueryLang(text);
    const configured = floors?.[lang];
    const valid = typeof configured === 'number' && isFinite(configured) && configured >= 0 && configured <= 1;
    return valid ? configured : DEFAULT_RECALL_FLOORS[lang];
}
/** Below this many characters a prompt carries too little signal to judge. */
export const MIN_PROMPT_CHARS = 10;
/** …and it must contain at least this many content tokens (length ≥ 3). */
export const MIN_CONTENT_TOKENS = 2;
/**
 * A prompt too short to judge. Found by dogfooding the live hook: `"тест"` and `"json"` cleared the
 * cosine floor (0.43) purely because a one-word technical token is genuinely close to technical
 * lessons — the similarity is real, the relevance is not. A floor cannot fix this; the query simply
 * carries no intent. Never throws.
 */
export function hasEnoughSignal(text) {
    if (typeof text !== 'string')
        return false;
    const t = text.trim();
    if (t.length < MIN_PROMPT_CHARS)
        return false;
    const tokens = t.split(/[^\p{L}\p{N}]+/u).filter((w) => w.length >= 3);
    return tokens.length >= MIN_CONTENT_TOKENS;
}
/**
 * Apply the floor, the limit and the character budget. Returns an EMPTY hit list whenever nothing
 * clears the floor — the caller must then print nothing at all and exit 0. Pure, never throws:
 * malformed candidates (missing/NaN score, empty text) are dropped rather than crashing a turn.
 */
export function selectHookHits(prompt, candidates, opts = {}) {
    const lang = detectQueryLang(prompt);
    const floor = relevanceFloorFor(prompt, opts.floors);
    const limit = intOr(opts.limit, DEFAULT_RECALL_HOOK_LIMIT);
    const budget = intOr(opts.budgetChars, DEFAULT_RECALL_HOOK_BUDGET_CHARS);
    // A prompt with no intent gets no injection, whatever its cosine says.
    if (!hasEnoughSignal(prompt))
        return { hits: [], floor, lang, quarantinedExcluded: 0 };
    // FR-5: the auto-inject surface is the STRICTEST — a quarantined lesson (unproven hypothesis)
    // never rides into a prompt uninvited. Counted, not silent (AM-2).
    const quarantinedExcluded = (candidates ?? []).filter((c) => c !== null && typeof c === 'object' && c.quarantined === true).length;
    const clean = (candidates ?? [])
        .filter((c) => !(c !== null && typeof c === 'object' && c.quarantined === true))
        .filter((c) => c !== null &&
        typeof c === 'object' &&
        (c.dzId === undefined || typeof c.dzId === 'string') &&
        typeof c.pattern === 'string' &&
        c.pattern.trim() !== '' &&
        typeof c.score === 'number' &&
        isFinite(c.score))
        .filter((c) => c.score >= floor)
        .sort((a, b) => b.score - a.score);
    const hits = [];
    let used = 0;
    for (const c of clean) {
        if (hits.length >= limit)
            break;
        const cost = c.pattern.length;
        // Always admit the top hit even if it alone exceeds the budget — a truncated best lesson beats
        // silence. Subsequent hits must fit.
        if (hits.length > 0 && used + cost > budget)
            break;
        hits.push(c);
        used += cost;
    }
    return { hits, floor, lang, quarantinedExcluded };
}
function intOr(v, fallback) {
    return typeof v === 'number' && isFinite(v) && v > 0 ? Math.floor(v) : fallback;
}
/**
 * Render the `additionalContext` block. Returns `''` when there is nothing to say — the caller emits
 * NOTHING (not an empty JSON envelope) and exits 0, so an off-topic turn costs the reader zero tokens.
 */
export function renderHookContext(selection) {
    if (selection.hits.length === 0)
        return '';
    const lines = selection.hits.map((h) => `  - [${h.score.toFixed(2)}${h.domain ? ` / ${h.domain}` : ''}] ${h.pattern}`);
    return `Learned lessons that match this prompt (dz recall, relevance ≥ ${selection.floor.toFixed(2)}):\n${lines.join('\n')}`;
}
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
export function closenessLine(similarity, query, floors) {
    if (typeof similarity !== 'number' || !isFinite(similarity))
        return 'sim=—';
    const floor = relevanceFloorFor(query, floors);
    return `sim=${showCloseness(similarity, floor)}${similarity >= floor ? '▲' : '▽'}`;
}
/**
 * The cosine, printed with enough digits that it cannot LOOK equal to the floor when it is not.
 *
 * Two rounds of cross-family review (codex `gpt-5.6-sol`, 2026-08-24) landed on opposite sides of one
 * trade-off, and both were right. Comparing before rounding shows `sim=0.50▽` for 0.499 against a
 * 0.50 floor — a figure equal to the floor, marked below it. Comparing after rounding shows
 * `sim=0.50▲` for the same input — a marker that says on-topic for a value the calibrated floor
 * excludes. Choosing a side cannot fix this, because the contradiction lives in the DISPLAY, not in
 * the comparison: two decimals cannot always distinguish a value from its floor.
 *
 * So the comparison stays on the true value — the floors are calibrated on true cosines — and the
 * display widens until the number visibly differs from the floor. 0.499 against 0.50 prints as
 * `sim=0.499▽`: below the floor, and visibly so.
 */
function showCloseness(similarity, floor) {
    // Widen until the number and the FLOOR differ AS DISPLAYED at the same precision. Comparing the
    // shown value against the raw floor was not enough: 0.5009 against a floor of 0.501 stopped at two
    // digits and printed `0.50`, which reads as the floor once the floor is itself rounded for a human
    // (cross-family review round 3, 2026-08-24).
    for (let digits = 2; digits <= 6; digits++) {
        const shown = similarity.toFixed(digits);
        if (similarity === floor || shown !== floor.toFixed(digits))
            return shown;
    }
    // Even at full precision the two render alike — 0.4999999 and 0.5 both print `0.500000`, and the
    // contradiction the widening exists to remove survives the cap (cross-family review round 4,
    // 2026-08-24). At that distance the digits are not the answer: state the RELATION instead. The
    // reader learns "just below the floor", which is exactly what is true and what the marker says.
    // The floor is stated AS IT IS, never rounded: with a floor of 0.4999999 a value of 0.49999995 is
    // above the floor and below 0.50, so `>0.50` was literally false (cross-family review round 5,
    // 2026-08-24). `String(floor)` prints exactly what the comparison used.
    return `${similarity < floor ? '<' : '>'}${String(floor)}`;
}
/** Did anything clear the floor? Used to say so ONCE, in words, instead of per row. */
export function anyAboveFloor(similarities, query, floors) {
    const floor = relevanceFloorFor(query, floors);
    // The TRUE value, matching what each row's marker uses — the footer must never contradict the
    // markers above it, and "nothing clears the floor" printed under a visible ▲ would be worse than
    // either alone.
    return similarities.some((s) => typeof s === 'number' && isFinite(s) && s >= floor);
}
//# sourceMappingURL=recall-hook-policy.js.map
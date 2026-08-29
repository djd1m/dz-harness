/**
 * The `feature-adr.js` workflow's PARSER-SAFE REGION — the shared predicate, not a re-implementation.
 *
 * The Workflow runtime's parser is STRICTER than `node --check`: inside the routing block that runs
 * from `const MODELS =` to `const ROUTER =` a template literal is a hard parse error, so no backtick
 * may appear there. That constraint used to be enforced by a `not.toContain('`')` assertion written
 * inline in one test (`feature-adr-model-routing.test.ts:142`), which proves only that the SHIPPED
 * file is currently clean — delete the assertion and nothing goes red.
 *
 * ADR-001 / AM-1 asked for the other half: a guard that is PROVEN to fire on a real violation. Making
 * the predicate a shared export is what buys that — the same function decides the shipped file and the
 * deliberately mutated copy, so a test can inject one backtick into the region and watch it refuse.
 * Deleting the guard now deletes the thing the mutation test calls.
 *
 * Pure and dependency-free: string in, verdict out. No file I/O, no process state.
 *
 * @packageDocumentation
 */
/** Opening marker of the parser-safe region (the first line of the inlined routing block). */
export const PARSER_SAFE_REGION_START = 'const MODELS =';
/** Closing marker of the parser-safe region (the first declaration after the routing block). */
export const PARSER_SAFE_REGION_END = 'const ROUTER =';
/**
 * Decide whether `source` respects the parser-safe region.
 *
 * A source whose markers cannot be located is NOT quietly cleared — an unlocatable region is
 * `region-not-found`, never `ok`. That asymmetry is deliberate: a refactor that moves or renames the
 * markers must be loud, because a silently-skipped check is indistinguishable from a passing one.
 */
export function checkParserSafeRegion(source) {
    const start = source.indexOf(PARSER_SAFE_REGION_START);
    const end = source.indexOf(PARSER_SAFE_REGION_END);
    if (start === -1 || end === -1 || end <= start) {
        return { ok: false, refusal: 'region-not-found', index: null, line: null };
    }
    const offset = source.slice(start, end).indexOf('`');
    if (offset === -1)
        return { ok: true, refusal: null, index: null, line: null };
    const index = start + offset;
    return {
        ok: false,
        refusal: 'backtick-in-region',
        index,
        line: source.slice(0, index).split('\n').length,
    };
}
//# sourceMappingURL=parser-safe-region.js.map
/**
 * Stamp a checkpoint line with the instant it was WRITTEN.
 *
 * Deliberately NOT part of `feature-adr-checkpoints.ts`. That module's functions are mirrored
 * verbatim into the sandboxed workflow through the loop-blob registry, and the sandbox has no
 * `Date` — so a clock has no business inside a function the clockless copy also runs. Changing the
 * mirrored serializer would also drag the whole blob regeneration + region re-render behind a
 * one-field addition, which is a large machine for a small honest fact.
 *
 * The stamp belongs to the WRITER. Only the CLI performing the append has a clock, so only the CLI
 * stamps, here, at the boundary.
 *
 * WHY IT EXISTS (MEASURED 2026-08-25): `.fa-state/checkpoints.jsonl` carried no time field of any
 * kind, so across 241 feature dirs "how long did this stage take" had no answer for a single run —
 * and no future run could answer it either.
 *
 * @packageDocumentation
 */
/**
 * Return `line` with a `ts` field, or `line` UNCHANGED when the stamp is absent or malformed.
 *
 * Three properties, each a test:
 *  - an ABSENT stamp leaves the record with no `ts` — unknown, never zero and never "now". Inventing
 *    one would make every pre-existing record indistinguishable from a measured one.
 *  - a MALFORMED stamp is dropped. A wrong instant is worse than an absent one: only the absent one
 *    is readable as unmeasured.
 *  - an EXISTING `ts` is never overwritten, and a line that is not a JSON object is passed through
 *    untouched — this runs on the way to an append-only log.
 */
export declare function stampCheckpointLine(line: string, ts: string): string;
//# sourceMappingURL=checkpoint-stamp.d.ts.map
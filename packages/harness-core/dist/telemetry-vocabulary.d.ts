/**
 * One name per measured quantity — copied, not imported.
 *
 * THE PROBLEM (MEASURED 2026-08-25). Fifteen telemetry stores in this repo, each naming the same
 * thing differently: `durationMs` here, `minutes` there, `wallMs` in a third; `tokens` vs
 * `totalTokens` vs `tokensIn`/`tokensOut`. Joining two of them was interpretation, not lookup, which
 * is why cost-per-feature was 76% typed by a human.
 *
 * WHY LITERALS AND NOT A DEPENDENCY. OpenTelemetry's `gen_ai.*` conventions are the right vocabulary
 * and there is no package to depend on:
 *   • `@opentelemetry/semantic-conventions-genai` → 404 on npm (verified 2026-08-25);
 *   • in semconv v1.42.0 every `gen_ai.*` convention was DEPRECATED out of the main repo and moved
 *     to a new one with zero tags and zero releases;
 *   • 197 of 197 documents in that spec carry `stability: development`, which its own status page
 *     defines as "SHOULD NOT be used in production";
 *   • 40 fragments are queued, 6 of them breaking — and FOUR of those six are agent-layer.
 * So: copy the names, version the copy, and mark the volatile half. A rename upstream then becomes a
 * data migration against ONE file instead of a code change across call sites.
 *
 * WHAT THIS DOES NOT DO. It renames nothing. Migrating the existing stores onto these names is a
 * separate change with its own risk; this module only makes the join possible.
 *
 * NOT in the loop-blob registry, deliberately: a module mirrored into the sandboxed workflow drags a
 * registry regeneration and a region re-render behind every edit to it.
 *
 * @packageDocumentation
 */
/**
 * The contract's own version. Bump it when a name changes, and the change is then a migration
 * against a versioned file — which is the whole point of copying rather than depending.
 */
export declare const TELEMETRY_VOCAB_VERSION = "dz-telemetry-vocab-1";
/**
 * Where a name came from. This distinction is load-bearing and must not be flattened: `otel` means
 * copied verbatim from the upstream convention, so a future reader can look it up and a future tool
 * can consume it. `local` means OpenTelemetry carries the quantity as span STRUCTURE rather than as
 * an attribute, so there was nothing to copy and we named it ourselves. Presenting a name we invented
 * as a standard one would be the small lie that makes the whole contract untrustworthy.
 */
export type FieldSource = 'otel' | 'local';
export interface TelemetryField {
    /** The wire name to write into a record. */
    readonly field: string;
    readonly source: FieldSource;
    /** What it holds, in one line. */
    readonly means: string;
    /**
     * The UNIT the field is measured in, or `null` for a field that has none (an id, a label).
     *
     * Added after cross-family review found the hazard it closes: `minutes` was aliased onto a field
     * whose name ends `_ms`, so a consumer following the alias would write minutes into a
     * milliseconds field and nothing would say otherwise. A vocabulary that names a quantity without
     * naming its unit invites exactly that.
     */
    readonly unit: 'ms' | 'tokens' | null;
}
export type RunOutcome = 'completed' | 'completed-unverified' | 'refused-repo-root' | 'refused-design' | 'refused-plan' | 'paused-checkpoint' | 'crashed' | 'unclassified';
/** Every member of the closed set, as data for reachability checks. */
export declare const RUN_OUTCOMES: readonly ["completed", "completed-unverified", "refused-repo-root", "refused-design", "refused-plan", "paused-checkpoint", "crashed", "unclassified"];
export declare function runOutcomeOf(input: {
    phase: string | null | undefined;
    gates: Record<string, unknown> | null | undefined;
}): RunOutcome;
/**
 * The vocabulary. Keys are stable identifiers for OUR code to reference; `field` is what goes on
 * disk, so an upstream rename touches the value and never the call sites.
 */
export declare const TELEMETRY_FIELDS: Readonly<Record<string, TelemetryField>>;
/**
 * The names whose upstream churn is highest — the agent layer, where FOUR of the six queued breaking
 * changes land (`gen_ai.agent.version` removed from internal invoke_agent spans,
 * `gen_ai.provider.name` dropped as required, `gen_ai.agent.id` scope changed).
 *
 * Separated by NAME rather than by footnote so a reader can tell "safe to build on" from "expect this
 * to move" without reading a comment. Build on these only where a rename is cheap.
 */
export declare const PROVISIONAL_TELEMETRY_FIELDS: Readonly<Record<string, TelemetryField>>;
/**
 * What this repo already writes → which vocabulary key it means.
 *
 * Without this the contract is a glossary nobody can act on. With it, the cost join that was hand
 * work becomes a lookup. Wrong BY OMISSION for any store added without updating it — which is why
 * {@link telemetryFieldFor} returns nothing rather than guessing.
 */
export declare const LOCAL_FIELD_ALIASES: Readonly<Record<string, string>>;
/**
 * The vocabulary field a local name means, or `undefined` when we do not know.
 *
 * The unknown case is the load-bearing one. A vocabulary that invents a mapping for a field it has
 * never seen produces a join that is silently wrong; one that returns nothing makes the gap visible
 * at the call site, where somebody can fix it.
 */
export declare function telemetryFieldFor(localName: string): TelemetryField | undefined;
//# sourceMappingURL=telemetry-vocabulary.d.ts.map
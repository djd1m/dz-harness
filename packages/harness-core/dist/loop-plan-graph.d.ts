/**
 * loop-plan-graph (idea d25a3c8a) — the COMPLETENESS leg of loop-plan/1's closed-world checking.
 *
 * What existed before this module (the round-7 cross-family reviewer's ONE not-met bar item,
 * SIGNOFF's "B-not-A reason 1"): `KNOWN_KEYS === INJECT` and the honesty test's `SCANNED` roster
 * all compare artifacts DOWNSTREAM of FIELD_DOMAINS — equality proves the rosters are consistent
 * with each other, never that they are COMPLETE against the interface source. The reviewer's
 * constructive counterexample: declare `LoopStep.extra?: ExtraPolicy`, add only the parent
 * `{t:'record'}` domain entry, and `extra: { enabeld: true }` escapes every check while every
 * equality guard stays green — "a new record kind cannot escape is unproven and demonstrably
 * false" (verbatim). The shipped mitigation was a documented four-step extension discipline — a
 * layer-4 instruction, exactly the layer the cost-of-detection ladder says such a check must not
 * live on.
 *
 * THE FIX (this module, layer 1): walk the interface graph from `LoopPlan` in the SOURCE TEXT,
 * transitively collect every reachable named interface, and let the honesty test require that the
 * reachable set is exactly the wired set. An interface reachable from LoopPlan but absent from the
 * wiring fails BY CONSTRUCTION, naming itself — no memory, no discipline, no fourth manual step.
 *
 * PURE: operates on source text handed in by the caller; no fs, no clock. That is what lets the
 * acceptance test run the reviewer's counterexample against a SABOTAGED COPY of the source and
 * require a red, while the real source stays green.
 */
/** One parsed field: its name and the DECLARED interface names its type text references. */
export interface GraphField {
    readonly field: string;
    readonly refs: readonly string[];
}
/** interface name → its fields (index signatures like `[xKey: \`x-${string}\`]` are excluded:
 * they open no named-interface edge and are the extension escape hatch by design). */
export type InterfaceGraph = ReadonlyMap<string, readonly GraphField[]>;
/** Brace-matched interface extraction. A regex-only scan truncates at the first nested brace
 * (inline object fields are everywhere in this file), so bodies are cut by depth counting. */
export declare function parseInterfaceGraph(source: string): InterfaceGraph;
/** Every interface reachable from `root` (inclusive), via any field's declared-interface refs —
 * arrays, unions and nullables all count: `LoopStep[]`, `RetryProfile | null` open the same edge. */
export declare function reachableInterfaces(graph: InterfaceGraph, root: string): string[];
export interface GraphWiringReport {
    readonly ok: boolean;
    /** Reachable from the root but NOT in the wired roster — each one is exactly the reviewer's
     * counterexample: a record kind whose key space is open while every equality guard stays green. */
    readonly unwired: string[];
    readonly reachable: string[];
    /** Wired but no longer reachable — a stale roster entry (the reverse rot). */
    readonly stale: string[];
}
/** The completeness check the equality guards could not perform: reachable(source) vs wired. */
export declare function checkGraphWiring(source: string, wired: readonly string[], root?: string): GraphWiringReport;
//# sourceMappingURL=loop-plan-graph.d.ts.map
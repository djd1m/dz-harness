/** A verdict on one shell command. `limits` is always populated — see LIMITS below. */
export interface DestructiveVerdict {
    /** `refuse` = block it. `allow` = out of scope. `undecidable` = could not parse; consumer PASSES. */
    outcome: 'refuse' | 'allow' | 'undecidable';
    /** The literal path that triggered the refusal, as the SHELL would pass it to the program. */
    path: string | null;
    /** The id of the rule that fired — one of DESTRUCTIVE_RULES. */
    rule: string | null;
    /** One line naming what was decided and why. A refusal always names the path and the rule. */
    reason: string;
    /** What this guard does NOT decide. Printed on EVERY verdict, refusals included. */
    limits: readonly string[];
}
/** The complete rule table. A refusal always carries one of these ids. */
export declare const DESTRUCTIVE_RULES: readonly {
    id: string;
    what: string;
}[];
/**
 * Decide whether a shell command must be refused BEFORE it runs.
 *
 * Refuses only when it can name a concrete literal path and the rule that path broke. Everything
 * else is allowed, and every verdict prints the guard's limits (LIMITS) so it is never read as a
 * total guarantee.
 */
export declare function classifyDestructive(command: string): DestructiveVerdict;
//# sourceMappingURL=destructive-guard.d.ts.map
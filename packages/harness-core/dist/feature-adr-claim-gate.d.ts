/** The finding counts the Step-8 QE agent reported from `dz claim-check`. */
export interface Step8ClaimCounts {
    readonly findings: number;
    readonly high: number;
    readonly medium: number;
}
/** The additive Step-8 result field: the counts (or `null` when not run) plus a human summary line. */
export interface Step8ClaimGate {
    /** `null` ⇒ the QE agent did not / could not run claim-check — an HONEST gap, never a false zero. */
    readonly claimCheck: Step8ClaimCounts | null;
    /** One-line human summary folded into logs. */
    readonly note: string;
}
/**
 * Turn the claim-check counts the QE agent reported into the additive result field + a note.
 * `null`/absent counts yield an honest "not run" note — never a fabricated "0 findings" that would
 * read like a clean pass. Pure, never-throws. This body is inlined verbatim into the workflow.
 */
export declare function step8ClaimGate(counts: Step8ClaimCounts | null): Step8ClaimGate;
//# sourceMappingURL=feature-adr-claim-gate.d.ts.map
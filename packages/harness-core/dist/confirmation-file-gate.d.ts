export type ConfirmationFileGateResult = {
    readonly verdict: 'pass';
    readonly checked: readonly string[];
} | {
    readonly verdict: 'fail';
    readonly missing: readonly string[];
} | {
    readonly verdict: 'skipped';
    readonly reason: 'no-adr';
} | {
    readonly verdict: 'refused';
    readonly reason: string;
};
export type ConfirmationFileExists = (path: string) => boolean;
/**
 * Pure Step-8 policy. The caller owns filesystem access and injects a predicate that returns true
 * only for a readable regular file. Throwing is a named refusal, never laundered into a skip.
 */
export declare function checkConfirmationFiles(adrTexts: readonly string[], exists: ConfirmationFileExists): ConfirmationFileGateResult;
//# sourceMappingURL=confirmation-file-gate.d.ts.map
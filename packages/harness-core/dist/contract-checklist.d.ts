/**
 * Pure contract-checklist policy for feature-ADR artifacts.
 *
 * Markdown/JSON text and injected evidence reads go in; typed decisions come out. Filesystem
 * discovery, realpath confinement, rendering to a terminal, and process exits belong to the CLI.
 */
export declare const CONTRACT_CHECKLIST_SCHEMA: "contract-checklist/1";
export declare const CONTRACT_VERDICT_SCHEMA: "contract-checklist-verdict/1";
export type ContractSourceKind = 'acceptance-criterion' | 'adr-confirmation';
export type ContractVerdict = 'met' | 'unmet' | 'not-testable';
export type ContractObservedOutcome = 'pass' | 'fail' | 'not-testable';
export type ContractGrade = 'A' | 'B' | 'C' | 'D';
export interface ContractSourceArtifact {
    readonly path: string;
    readonly text: string;
}
export interface ContractChecklistSource {
    readonly requirements: ContractSourceArtifact;
    readonly adrs: readonly ContractSourceArtifact[];
}
export interface ContractItem {
    readonly id: string;
    readonly sourceId: string;
    readonly sourceKind: ContractSourceKind;
    readonly statement: string;
    readonly sourcePath: string;
    readonly sourceLine: number;
    readonly requiredAutomatedCheck?: string;
}
export interface ContractChecklist {
    readonly schema: typeof CONTRACT_CHECKLIST_SCHEMA;
    readonly items: readonly ContractItem[];
}
export interface ContractDiagnostic {
    readonly code: string;
    readonly message: string;
    readonly artifact?: string;
    readonly section?: string;
    readonly sourceId?: string;
    readonly contractId?: string;
    readonly observed?: string | number | readonly string[];
}
export type ContractChecklistResult = {
    readonly ok: true;
    readonly checklist: ContractChecklist;
    readonly diagnostics: readonly [];
} | {
    readonly ok: false;
    readonly diagnostics: readonly ContractDiagnostic[];
};
export interface ContractVerdictEvidence {
    readonly artifact: string;
    readonly quote: string;
    readonly observedOutcome: ContractObservedOutcome;
}
export interface ContractVerdictItem {
    readonly id: string;
    readonly verdict: ContractVerdict;
    readonly evidence: ContractVerdictEvidence;
    readonly reason?: string;
}
export interface ContractVerdictReport {
    readonly schema: typeof CONTRACT_VERDICT_SCHEMA;
    readonly overallGrade: ContractGrade;
    readonly items: readonly ContractVerdictItem[];
}
export type ContractVerdictParseResult = {
    readonly ok: true;
    readonly report: ContractVerdictReport;
    readonly humanGrade: ContractGrade;
    readonly diagnostics: readonly [];
} | {
    readonly ok: false;
    /** False only when no canonical verdict section exists at all. */
    readonly established: boolean;
    readonly diagnostics: readonly ContractDiagnostic[];
};
export type ContractEvidenceReadResult = {
    readonly ok: true;
    readonly text: string;
} | {
    readonly ok: false;
    readonly code: string;
    readonly detail: string;
};
export interface ContractEvidenceReader {
    /** Repository-relative QE report path, used to reject self-citation before reading. */
    readonly reportArtifact?: string;
    read(artifact: string): ContractEvidenceReadResult;
}
export interface ContractItemVerification {
    readonly id: string;
    readonly verdict: ContractVerdict | null;
    readonly evidence: 'valid' | 'invalid' | 'not-checked';
    readonly reason?: string;
    readonly diagnostics: readonly ContractDiagnostic[];
}
export interface ContractVerificationCounts {
    readonly contractItems: number;
    readonly verdictItems: number;
    readonly met: number;
    readonly unmet: number;
    readonly notTestable: number;
    readonly missing: number;
    readonly duplicate: number;
    readonly orphan: number;
    readonly invalidEvidence: number;
    readonly gradeConflicts: number;
}
export interface ContractVerification {
    readonly outcome: 'pass' | 'fail';
    readonly exitCode: 0 | 1;
    /** Null only when an untyped runtime caller bypasses the parser with an invalid report object. */
    readonly overallGrade: ContractGrade | null;
    readonly items: readonly ContractItemVerification[];
    readonly counts: ContractVerificationCounts;
    readonly diagnostics: readonly ContractDiagnostic[];
}
export declare function extractContractChecklist(input: ContractChecklistSource): ContractChecklistResult;
export declare function renderContractChecklist(checklist: ContractChecklist): string;
export declare function parseContractVerdictReport(text: string): ContractVerdictParseResult;
export declare function verifyContractVerdicts(checklist: ContractChecklist, report: ContractVerdictReport, evidence: ContractEvidenceReader): ContractVerification;
//# sourceMappingURL=contract-checklist.d.ts.map
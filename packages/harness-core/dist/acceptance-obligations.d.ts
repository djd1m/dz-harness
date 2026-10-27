/** Optional case and authority ledger for contract-check. No filesystem access. */
import { type ContractChecklist, type ContractEvidenceReader } from './contract-checklist.js';
export declare const ACCEPTANCE_OBLIGATIONS_SCHEMA: "acceptance-obligations/1";
export declare const ACCEPTANCE_OBLIGATION_REPORT_SCHEMA: "acceptance-obligations-verdict/1";
export type ObligationCase = 'positive' | 'negative' | 'malformed' | 'lifecycle' | `lifecycle:${string}`;
export type ObligationAuthority = 'static' | 'unit' | 'integration' | 'process';
export interface ObligationCitation {
    artifact: string;
    quote: string;
}
export interface AcceptanceObligation {
    contractId: string;
    revision: number;
    requiredCases: ObligationCase[];
    originalAuthority: ObligationAuthority;
    verifierAuthority: ObligationAuthority;
}
export interface AcceptanceObligations {
    schema: typeof ACCEPTANCE_OBLIGATIONS_SCHEMA;
    items: AcceptanceObligation[];
}
export interface AcceptanceObligationResult {
    contractId: string;
    revision: number;
    original: {
        authority: ObligationAuthority;
        evidence: ObligationCitation;
    };
    cases: Array<{
        kind: ObligationCase;
        authority: ObligationAuthority;
        passed: boolean;
        evidence: ObligationCitation;
    }>;
    verifier: {
        authority: ObligationAuthority;
        passed: boolean;
        evidence: ObligationCitation;
    };
    unresolvedQuestions: string[];
    contradictions: string[];
}
export interface AcceptanceObligationReport {
    schema: typeof ACCEPTANCE_OBLIGATION_REPORT_SCHEMA;
    items: AcceptanceObligationResult[];
}
export interface ObligationDiagnostic {
    code: string;
    message: string;
    contractId?: string;
}
export type ObligationParse<T> = {
    ok: true;
    value: T;
} | {
    ok: false;
    diagnostics: ObligationDiagnostic[];
};
export interface ObligationVerification {
    outcome: 'pass' | 'fail';
    diagnostics: ObligationDiagnostic[];
    checked: number;
}
export declare function parseAcceptanceObligations(text: string): ObligationParse<AcceptanceObligations>;
export declare function parseAcceptanceObligationReport(text: string): ObligationParse<AcceptanceObligationReport>;
export declare function verifyAcceptanceObligations(checklist: ContractChecklist, declaration: AcceptanceObligations, report: AcceptanceObligationReport, reader: ContractEvidenceReader): ObligationVerification;
//# sourceMappingURL=acceptance-obligations.d.ts.map
/**
 * Pure extraction, rendering, budget measurement, and drift detection for the
 * always-on policy projection written to the root AGENTS.md.
 *
 * Callers own filesystem I/O. Keeping this module string-in/string-out makes
 * the layer-1 drift guard deterministic and usable from both tests and CLI.
 */
export interface PolicySource {
    readonly id: string;
    readonly file: string;
    readonly heading: string;
    readonly why: string;
    /** Clause whose loss would turn the policy into a slogan rather than a rule. */
    readonly operativeClause: string;
}
/** Ordered by cold-start value; this order is also the deterministic emit order. */
export declare const POLICY_SOURCES: readonly PolicySource[];
export interface PolicyBlock {
    readonly id: string;
    readonly file: string;
    readonly heading: string;
    /** Verbatim anchor body after the documented minimal whitespace normalization. */
    readonly text: string;
    readonly sha: string;
}
export interface ExtractPolicyBlocksResult {
    readonly blocks: readonly PolicyBlock[];
    /** Registry ids whose source is absent/null or whose begin/end anchor is malformed. */
    readonly missing: readonly string[];
}
export type PolicyDriftStatus = 'ok' | 'stale' | 'missing-stamp' | 'missing-anchor' | 'orphan-stamp';
export interface PolicyDriftFinding {
    readonly id: string;
    readonly file: string;
    readonly status: PolicyDriftStatus;
    readonly expectedSha: string | null;
    readonly actualSha: string | null;
}
export interface PolicyDriftResult {
    readonly applicable: boolean;
    readonly findings: readonly PolicyDriftFinding[];
}
/** MEASURED 2026-08-18, codex-cli 0.147.0, project_doc_max_bytes unset: codex debug prompt-input included exactly 32768 bytes of a 414013-byte AGENTS.md and truncated mid-line with no notice. */
export declare const CODEX_PROJECT_DOC_MAX_BYTES = 32768;
export declare const AGENTS_MD_BUDGET_WARN_FRACTION = 0.9;
export interface AgentsMdBudget {
    readonly bytes: number;
    readonly cap: number;
    /** Percentage in the human convention, e.g. 50 means half the cap. */
    readonly pct: number;
    readonly overflow: boolean;
    /** UTF-8 byte offset immediately after the policy END marker, or -1 when absent. */
    readonly policyBlockEndsAtByte: number;
}
export declare function normalizePolicyText(text: string): string;
export declare function policyTextSha(text: string): string;
export declare function extractPolicyBlocks(files: ReadonlyMap<string, string | null>, sources?: readonly PolicySource[]): ExtractPolicyBlocksResult;
export declare function renderPolicySections(blocks: readonly PolicyBlock[], sources?: readonly PolicySource[]): readonly string[];
/**
 * Has this repository OPTED IN to policy sync? The `dz:policies` fence in `AGENTS.md` is the only
 * durable on-disk signal that `dz agents-sync` was ever run here. Keeping the marker knowledge in
 * this module means no caller has to re-spell the literal (a second spelling is a second surface).
 */
export declare function hasPolicyFence(fileText: string | null | undefined): boolean;
export declare function measureAgentsMdBudget(fileText: string): AgentsMdBudget;
export declare function detectPolicyDrift(sourceFiles: ReadonlyMap<string, string | null>, agentsMdText: string | null, sources?: readonly PolicySource[]): PolicyDriftResult;
//# sourceMappingURL=agents-policy.d.ts.map
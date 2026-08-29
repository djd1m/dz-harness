/**
 * `dz mcp-scan` — "npm audit for agent tools".
 *
 * A deterministic, static (no-execution) security scan of a project's agent
 * permission surface. It reads Claude-Code-style `.claude/settings*.json`
 * permission grants and MCP server declarations (`.mcp.json`, `.vscode/mcp.json`)
 * and emits a three-tier verdict (`clean` / `medium` / `high`) with findings.
 *
 * The rule set is adapted from the MetaHarness `threat-model` skill
 * (ruvnet/agent-harness-generator) and mapped onto the Claude Code permission
 * grammar. See `docs/research/metaharness-analysis.md` §1.
 *
 * Semantics (verified against the MetaHarness rules + Claude Code merge model):
 *  - settings.json and settings.local.json are evaluated as a MERGED surface
 *    (union of allow, union of deny); deny wins over allow.
 *  - findings are reported per CAPABILITY (one shell / network / write finding
 *    with a count + examples), not per individual grant.
 *  - secrets-reachability requires MCP to be active (per MetaHarness).
 *  - `low`-severity findings are informational and do NOT change the verdict.
 *
 * Verdict (highest non-low severity wins):
 *  - `high`   (exit 2): shell granted · default-deny off · secrets reachable ·
 *                       hardcoded secret in MCP env · all-MCP-servers enabled ·
 *                       MCP server runs an interpreter / package-runner
 *  - `medium` (exit 1): network granted · file-write granted · remote MCP server
 *  - `clean`  (exit 0): no high/medium findings (low/info may still be present)
 *
 * @packageDocumentation
 */
import { type CapabilityClass } from './capability-vocab.js';
/** Re-exported for back-compat (was historically exported from this module). */
export { parseGrant } from './capability-vocab.js';
/** Severity of a single finding. `low` is informational (verdict-neutral). */
export type McpSeverity = 'high' | 'medium' | 'low';
/** The capability class a finding concerns. */
export type McpCapability = CapabilityClass;
/** A single static-scan finding. */
export interface McpFinding {
    /** Stable rule id, e.g. `MS-SHELL-GRANT`. */
    readonly id: string;
    readonly severity: McpSeverity;
    readonly capability: McpCapability;
    /** Relative path / source the finding came from. */
    readonly source: string;
    /** Human-readable explanation. */
    readonly detail: string;
    /** The grant / value (or aggregated count + examples) that triggered the rule. */
    readonly evidence: string;
}
/** The overall verdict. `clean` when there are zero high/medium findings. */
export type McpVerdict = 'clean' | 'medium' | 'high';
/** Result of {@link scanMcp}. */
export interface McpScanReport {
    readonly verdict: McpVerdict;
    /** Process exit code: clean=0, medium=1, high=2. */
    readonly exitCode: 0 | 1 | 2;
    readonly findings: readonly McpFinding[];
    /** Relative paths actually read during the scan. */
    readonly scanned: readonly string[];
    /** Derived capability flags (for badges / `--json`). */
    readonly capabilities: {
        readonly shell: boolean;
        readonly network: boolean;
        readonly fileWrite: boolean;
        readonly secretsReachable: boolean;
        /** Scoped to the `.claude/settings*.json` surface. */
        readonly defaultDeny: boolean;
    };
}
/**
 * Statically scan a project/pack root for an unsafe agent permission surface.
 * Deterministic and read-only — never executes anything it finds.
 */
export declare function scanMcp(rootDir: string): McpScanReport;
//# sourceMappingURL=mcp-scan.d.ts.map
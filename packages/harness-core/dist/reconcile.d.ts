/**
 * `dz mcp-scan --reconcile` — static capability reconciliation (Phase 3).
 *
 * Joins two things `dz` can read deterministically:
 *  - the project's GRANT surface (`scanMcp` of `.claude/settings*.json` + `.mcp.json`), and
 *  - the aggregate DECLARED capabilities of the installed skills (`.claude/skills/<id>/SKILL.md`),
 * then REPORTS the gaps (under-grant / over-grant) and, optionally, EMITS a
 * least-privilege advisory policy artifact for a host to consume.
 *
 * HONESTY: `dz` is build-time / static. It does NOT run agents and CANNOT block,
 * time out, or rate-limit a tool call. The HOST (Claude Code enforcing
 * settings.json allow/deny; or an MCP server consuming a policy.json) is the only
 * thing that enforces at call time. Verbs here are REPORT / RECONCILE / EMIT /
 * CANDIDATE — never BLOCK / DENIED / ENFORCED.
 *
 * @packageDocumentation
 */
import type { McpScanReport } from './mcp-scan.js';
/** The honesty banner — repeated in --help, the report header, and the artifact $comment. */
export declare const RECONCILE_BANNER: string;
/** A reconcilable capability axis (the axes BOTH the grant surface and the manifest expose). */
export type ReconcileAxis = 'shell' | 'network' | 'file-write';
/** Per-axis reconciliation state. */
export interface AxisState {
    readonly axis: ReconcileAxis;
    /** Project permits this capability (from scanMcp). */
    readonly grant: boolean;
    /** At least one installed skill declares it needs this (declared === true). */
    readonly need: boolean;
    /** Skills that declared need (true) — for attribution. */
    readonly needSkills: readonly string[];
    /** Installed skills that are SILENT on this axis (declared === undefined). */
    readonly silentCount: number;
}
/** A single reconciliation finding. */
export interface ReconcileFinding {
    readonly id: string;
    readonly kind: 'under-grant' | 'over-grant';
    readonly severity: 'medium' | 'low' | 'info';
    readonly axis: ReconcileAxis;
    readonly detail: string;
    readonly skills: readonly string[];
}
/** Aggregated declared limits across installed skills (tightest values; inert). */
export interface LimitsRollup {
    readonly declaredBy: number;
    readonly toolTimeoutMs?: number;
    readonly maxToolCallsPerTurn?: number;
    readonly requireApprovalForDangerous?: boolean;
}
/** The least-privilege advisory policy artifact (only written with --emit-policy). */
export interface PolicyArtifact {
    readonly $comment: string;
    readonly version: 1;
    readonly defaultDeny: true;
    /** axis → true ONLY where an installed skill declared need; absent otherwise. */
    readonly allow: Partial<Record<ReconcileAxis, true>>;
    readonly limits?: LimitsRollup;
    readonly derivedFrom: {
        readonly grants: Record<ReconcileAxis, boolean>;
        readonly declaredNeed: Record<ReconcileAxis, boolean>;
        readonly skillsByAxis: Partial<Record<ReconcileAxis, readonly string[]>>;
    };
}
/** Result of {@link reconcileCapabilities}. */
export interface ReconcileReport {
    readonly skillsDir: string;
    readonly installedCount: number;
    readonly axes: readonly AxisState[];
    readonly findings: readonly ReconcileFinding[];
    readonly limits: LimitsRollup | null;
    readonly policy: PolicyArtifact;
}
/**
 * Statically reconcile a project's GRANT surface against the DECLARED needs of
 * its installed skills. Pure: same inputs → same report. No execution, no writes.
 */
export declare function reconcileCapabilities(report: McpScanReport, skillsDir: string): ReconcileReport;
//# sourceMappingURL=reconcile.d.ts.map
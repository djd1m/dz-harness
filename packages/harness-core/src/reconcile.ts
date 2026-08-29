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

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { parseDeclaredCapabilities, parseDeclaredLimits, type DeclaredLimits } from './capability-vocab.js';
import type { McpScanReport } from './mcp-scan.js';

/** The honesty banner — repeated in --help, the report header, and the artifact $comment. */
export const RECONCILE_BANNER =
  'dz is build-time/static: it REPORTS the grant-vs-declaration gap and may EMIT an advisory policy, ' +
  'but does NOT block, time out, or rate-limit anything. The HOST (Claude Code settings.json; or an MCP ' +
  'server consuming policy.json) is the only thing that enforces at call time.';

/** A reconcilable capability axis (the axes BOTH the grant surface and the manifest expose). */
export type ReconcileAxis = 'shell' | 'network' | 'file-write';
const AXES: readonly ReconcileAxis[] = ['shell', 'network', 'file-write'];

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

interface InstalledDecl {
  id: string;
  caps: ReturnType<typeof parseDeclaredCapabilities>;
  limits: DeclaredLimits;
}

function readInstalled(skillsDir: string): InstalledDecl[] {
  if (!existsSync(skillsDir)) return [];
  let entries: import('node:fs').Dirent[];
  try {
    entries = readdirSync(skillsDir, { withFileTypes: true });
  } catch {
    return [];
  }
  const out: InstalledDecl[] = [];
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    const md = join(skillsDir, e.name, 'SKILL.md');
    if (!existsSync(md)) continue;
    let content: string;
    try {
      content = readFileSync(md, 'utf-8');
    } catch {
      continue;
    }
    out.push({ id: e.name, caps: parseDeclaredCapabilities(content), limits: parseDeclaredLimits(content) });
  }
  return out.sort((a, b) => a.id.localeCompare(b.id));
}

function grantFor(report: McpScanReport, axis: ReconcileAxis): boolean {
  const c = report.capabilities;
  return axis === 'shell' ? c.shell : axis === 'network' ? c.network : c.fileWrite;
}

/**
 * Statically reconcile a project's GRANT surface against the DECLARED needs of
 * its installed skills. Pure: same inputs → same report. No execution, no writes.
 */
export function reconcileCapabilities(report: McpScanReport, skillsDir: string): ReconcileReport {
  const installed = readInstalled(skillsDir);

  const axes: AxisState[] = [];
  const findings: ReconcileFinding[] = [];
  const allow: Partial<Record<ReconcileAxis, true>> = {};
  const grants = {} as Record<ReconcileAxis, boolean>;
  const declaredNeed = {} as Record<ReconcileAxis, boolean>;
  const skillsByAxis: Partial<Record<ReconcileAxis, readonly string[]>> = {};

  for (const axis of AXES) {
    const grant = grantFor(report, axis);
    const needSkills = installed.filter((s) => s.caps[axis] === true).map((s) => s.id);
    const need = needSkills.length > 0;
    const silentCount = installed.filter((s) => s.caps[axis] === undefined).length;
    axes.push({ axis, grant, need, needSkills, silentCount });
    grants[axis] = grant;
    declaredNeed[axis] = need;
    if (need) {
      skillsByAxis[axis] = needSkills;
      allow[axis] = true;
    }

    if (need && !grant) {
      findings.push({
        id: `MS-UNDERGRANT-${axis.toUpperCase()}`,
        kind: 'under-grant',
        severity: 'medium',
        axis,
        detail: `${needSkills.length} installed skill(s) declare needing ${axis}, but the grant surface does not permit it — the host will starve them at runtime. Add the grant or remove the skill(s).`,
        skills: needSkills,
      });
    } else if (grant && !need) {
      // over-grant is ALWAYS advisory; downgrade to info when any skill is silent
      // (it may genuinely need the grant but didn't declare), or when there are
      // no installed skills at all.
      const downgrade = silentCount > 0 || installed.length === 0;
      findings.push({
        id: `MS-OVERGRANT-${axis.toUpperCase()}`,
        kind: 'over-grant',
        severity: downgrade ? 'info' : 'low',
        axis,
        detail: `The project permits ${axis} but no installed skill declares needing it${silentCount > 0 ? ` (${silentCount} skill(s) silent on ${axis})` : ''} — least-privilege CANDIDATE to revoke; may be for the operator or a non-skill MCP server.`,
        skills: [],
      });
    }
  }

  // limits roll-up (tightest values) — INERT, never a gate
  const withLimits = installed.filter((s) => Object.keys(s.limits).length > 0);
  let limits: LimitsRollup | null = null;
  if (withLimits.length > 0) {
    const tts = withLimits.map((s) => s.limits.toolTimeoutMs).filter((n): n is number => typeof n === 'number');
    const mcs = withLimits.map((s) => s.limits.maxToolCallsPerTurn).filter((n): n is number => typeof n === 'number');
    const ras = withLimits.some((s) => s.limits.requireApprovalForDangerous === true);
    limits = {
      declaredBy: withLimits.length,
      ...(tts.length > 0 ? { toolTimeoutMs: Math.min(...tts) } : {}),
      ...(mcs.length > 0 ? { maxToolCallsPerTurn: Math.min(...mcs) } : {}),
      ...(ras ? { requireApprovalForDangerous: true } : {}),
    };
  }

  const policy: PolicyArtifact = {
    $comment: `ADVISORY. ${RECONCILE_BANNER} A host MUST consume this; dz does not.`,
    version: 1,
    defaultDeny: true,
    allow,
    ...(limits ? { limits } : {}),
    derivedFrom: { grants, declaredNeed, skillsByAxis },
  };

  // stable ordering: under-grant (medium) first, then over-grant
  const order = { medium: 0, low: 1, info: 2 } as const;
  findings.sort((a, b) => order[a.severity] - order[b.severity] || a.axis.localeCompare(b.axis));

  return { skillsDir, installedCount: installed.length, axes, findings, limits, policy };
}

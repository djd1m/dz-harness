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

import { existsSync, lstatSync, readFileSync } from 'node:fs';
import { basename, join } from 'node:path';

import {
  SHELL_TOOLS,
  INTERPRETER_RE, PACKAGE_RUNNERS, INLINE_CODE_ARGS,
  SHELL_NET_RE, SHELL_WRITE_RE, SECRET_FILE_RE, MAX_FILE_BYTES,
  parseGrant, isWildcard, toolKind,
  type CapabilityClass,
} from './capability-vocab.js';

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

/** Compile a Claude arg glob (`*` wildcard) to a RegExp. */
function globToRe(arg: string): RegExp {
  const esc = arg.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
  return new RegExp(`^${esc}$`);
}

/** True when a deny rule covers a grant (deny wins). Case-insensitive on tool. */
function denyCovers(grant: string, denyList: string[]): boolean {
  const g = parseGrant(grant);
  return denyList.some((d) => {
    const dd = parseGrant(d);
    if (dd.tool === '*') return true;
    if (dd.tool.toLowerCase() !== g.tool.toLowerCase()) return false;
    if (dd.arg === null) return true; // bare-tool deny covers every arg
    if (g.arg === null) return false;
    try {
      return globToRe(dd.arg).test(g.arg);
    } catch {
      return dd.arg === g.arg;
    }
  });
}

/** True when the deny list actually protects secret FILE locations. */
function denyProtectsSecrets(denyList: string[]): boolean {
  return denyList.some((d) => {
    const { tool, arg } = parseGrant(d);
    const t = tool.toLowerCase();
    if (t !== 'read' && t !== 'glob' && t !== '*' && t !== 'bash') return false;
    return arg !== null && SECRET_FILE_RE.test(arg);
  });
}

/** Heuristic: does an MCP env value look like a hardcoded secret (not a `${VAR}` ref)? */
function looksLikeHardcodedSecret(key: string, value: unknown): boolean {
  if (typeof value !== 'string') return false;
  if (!/key|token|secret|password|api|credential|auth/i.test(key)) return false;
  const v = value.trim();
  if (v === '') return false;
  if (/^\$\{?\w+\}?$/.test(v)) return false; // pure ${VAR} / $VAR reference
  if (/^(true|false|production|development|test|none|null|\d+)$/i.test(v)) return false;
  return v.length >= 8;
}

// ---------------------------------------------------------------------------
// accumulator
// ---------------------------------------------------------------------------

interface Accumulator {
  findings: McpFinding[];
  scanned: string[];
  shellGrants: string[];
  networkGrants: string[];
  writeGrants: string[];
  shellArgNetwork: string[];
  shellArgWrite: string[];
  mcpToolGrants: string[];
  unknownTools: string[];
  denyRules: string[];
  hasReadGrant: boolean;
  hasSettings: boolean;
  hasDeny: boolean;
  wildcardAll: boolean;
  mcpActive: boolean;
  enableAllMcp: boolean;
  enableAllMcpSource: string;
  serverShell: boolean;
  serverNetwork: boolean;
  serverSecret: boolean;
}

function readJson(path: string): unknown | null {
  try {
    const st = lstatSync(path);
    if (st.isSymbolicLink() || !st.isFile() || st.size > MAX_FILE_BYTES) return null;
    return JSON.parse(readFileSync(path, 'utf-8'));
  } catch {
    return null;
  }
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((x): x is string => typeof x === 'string') : [];
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

// ---------------------------------------------------------------------------
// scanners
// ---------------------------------------------------------------------------

function scanSettings(root: string, rel: string, acc: Accumulator): void {
  const abs = join(root, rel);
  if (!existsSync(abs)) return;
  const data = readJson(abs);
  if (!isPlainObject(data)) return;
  acc.scanned.push(rel);
  acc.hasSettings = true;

  const perms = isPlainObject(data['permissions']) ? data['permissions'] : {};
  const allow = asStringArray(perms['allow']);
  const deny = asStringArray(perms['deny']);
  acc.denyRules.push(...deny);
  if (deny.length > 0) acc.hasDeny = true;

  for (const grant of allow) {
    const { tool, arg } = parseGrant(grant);
    if (grant.trim() === '*' || (SHELL_TOOLS.has(tool.toLowerCase()) && arg === null)) {
      acc.wildcardAll = true;
    }
    const kind = toolKind(tool);
    switch (kind) {
      case 'shell':
        acc.shellGrants.push(grant);
        if (arg !== null && SHELL_NET_RE.test(arg)) acc.shellArgNetwork.push(grant);
        if (arg !== null && SHELL_WRITE_RE.test(arg)) acc.shellArgWrite.push(grant);
        break;
      case 'network':
        acc.networkGrants.push(grant);
        break;
      case 'file-write':
        acc.writeGrants.push(grant);
        break;
      case 'read':
        acc.hasReadGrant = true;
        break;
      case 'mcp':
        acc.mcpToolGrants.push(grant);
        acc.mcpActive = true;
        break;
      case 'safe':
        break;
      default:
        acc.unknownTools.push(grant);
    }
  }

  if (data['enableAllProjectMcpServers'] === true) {
    acc.enableAllMcp = true;
    acc.enableAllMcpSource = rel;
    acc.mcpActive = true;
  }
  if (Array.isArray(data['enabledMcpjsonServers']) && data['enabledMcpjsonServers'].length > 0) {
    acc.mcpActive = true;
  }
}

function scanMcpServers(root: string, rel: string, acc: Accumulator): void {
  const abs = join(root, rel);
  if (!existsSync(abs)) return;
  const data = readJson(abs);
  if (!isPlainObject(data)) return;
  acc.scanned.push(rel);

  const merged: Record<string, unknown> = {};
  if (isPlainObject(data['mcpServers'])) Object.assign(merged, data['mcpServers']);
  if (isPlainObject(data['servers'])) Object.assign(merged, data['servers']);
  if (Object.keys(merged).length > 0) acc.mcpActive = true;

  for (const [name, raw] of Object.entries(merged)) {
    if (!isPlainObject(raw)) continue;
    const type = typeof raw['type'] === 'string' ? (raw['type'] as string) : '';
    const url = typeof raw['url'] === 'string' ? (raw['url'] as string) : '';
    const command = typeof raw['command'] === 'string' ? (raw['command'] as string) : '';
    const args = asStringArray(raw['args']);
    const env = isPlainObject(raw['env']) ? raw['env'] : {};

    if (type === 'sse' || type === 'http' || url !== '') {
      acc.serverNetwork = true;
      acc.findings.push({
        id: 'MS-MCP-REMOTE',
        severity: 'medium',
        capability: 'network',
        source: rel,
        detail: `MCP server "${name}" is remote (${type || 'url'}) — sends data to an external endpoint.`,
        evidence: url || type,
      });
    }

    const cmdBase = basename(command).toLowerCase();
    const isInterpreter = INTERPRETER_RE.test(cmdBase);
    const isRunner = PACKAGE_RUNNERS.has(cmdBase);
    const hasInlineCode = args.some((a) => INLINE_CODE_ARGS.has(a));
    if (command !== '' && (isInterpreter || isRunner || hasInlineCode)) {
      acc.serverShell = true;
      const why = isRunner
        ? `package runner "${cmdBase}" fetches and executes remote code`
        : hasInlineCode
          ? `inline-code argument`
          : `interpreter "${cmdBase}" can run arbitrary code`;
      acc.findings.push({
        id: 'MS-MCP-SHELL-CMD',
        severity: 'high',
        capability: 'shell',
        source: rel,
        detail: `MCP server "${name}" launches via ${why}.`,
        evidence: [command, ...args].join(' ').slice(0, 120),
      });
    }

    for (const [k, v] of Object.entries(env)) {
      if (looksLikeHardcodedSecret(k, v)) {
        acc.serverSecret = true;
        acc.findings.push({
          id: 'MS-SECRET-HARDCODED',
          severity: 'high',
          capability: 'secrets',
          source: rel,
          detail: `MCP server "${name}" env "${k}" appears to contain a hardcoded secret — use \${ENV_VAR} indirection instead.`,
          evidence: `${k}=${String(v).slice(0, 4)}…`,
        });
      }
    }
  }
}

// ---------------------------------------------------------------------------
// entry point
// ---------------------------------------------------------------------------

function aggregate(
  grants: string[],
  deny: string[],
  id: string,
  severity: McpSeverity,
  capability: McpCapability,
  label: string,
): McpFinding | null {
  const survivors = grants.filter((g) => !denyCovers(g, deny));
  if (survivors.length === 0) return null;
  const examples = survivors.slice(0, 3).join(', ');
  return {
    id,
    severity,
    capability,
    source: '.claude/settings*.json',
    detail: `${label} via ${survivors.length} allow rule(s) not covered by a deny rule.`,
    evidence: survivors.length > 3 ? `e.g. ${examples}, … (+${survivors.length - 3} more)` : examples,
  };
}

/**
 * Statically scan a project/pack root for an unsafe agent permission surface.
 * Deterministic and read-only — never executes anything it finds.
 */
export function scanMcp(rootDir: string): McpScanReport {
  const acc: Accumulator = {
    findings: [],
    scanned: [],
    shellGrants: [],
    networkGrants: [],
    writeGrants: [],
    shellArgNetwork: [],
    shellArgWrite: [],
    mcpToolGrants: [],
    unknownTools: [],
    denyRules: [],
    hasReadGrant: false,
    hasSettings: false,
    hasDeny: false,
    wildcardAll: false,
    mcpActive: false,
    enableAllMcp: false,
    enableAllMcpSource: '.claude/settings*.json',
    serverShell: false,
    serverNetwork: false,
    serverSecret: false,
  };

  // order is irrelevant to the result: all signals are merged before evaluation.
  scanSettings(rootDir, join('.claude', 'settings.json'), acc);
  scanSettings(rootDir, join('.claude', 'settings.local.json'), acc);
  scanMcpServers(rootDir, '.mcp.json', acc);
  scanMcpServers(rootDir, join('.vscode', 'mcp.json'), acc);

  const deny = acc.denyRules;

  // --- aggregated capability findings (merged surface, deny-suppressed) ---
  const shellSurvivors = acc.shellGrants.filter((g) => !denyCovers(g, deny));
  if (shellSurvivors.length > 0) {
    const anyWildcard = shellSurvivors.some((g) => isWildcard(parseGrant(g).arg));
    const examples = shellSurvivors.slice(0, 3).join(', ');
    acc.findings.push({
      id: anyWildcard ? 'MS-SHELL-WILDCARD' : 'MS-SHELL-GRANT',
      severity: 'high',
      capability: 'shell',
      source: '.claude/settings*.json',
      detail: anyWildcard
        ? `Wildcard shell grant — arbitrary command execution. ${shellSurvivors.length} shell allow rule(s).`
        : `Shell execution granted via ${shellSurvivors.length} allow rule(s).`,
      evidence: shellSurvivors.length > 3 ? `e.g. ${examples}, … (+${shellSurvivors.length - 3} more)` : examples,
    });
  }

  const netFinding = aggregate(
    [...acc.networkGrants, ...acc.shellArgNetwork],
    deny,
    'MS-NETWORK-GRANT',
    'medium',
    'network',
    'Outbound network access granted',
  );
  if (netFinding) acc.findings.push(netFinding);

  const writeFinding = aggregate(
    [...acc.writeGrants, ...acc.shellArgWrite],
    deny,
    'MS-FILEWRITE-GRANT',
    'medium',
    'file-write',
    'Filesystem write access granted',
  );
  if (writeFinding) acc.findings.push(writeFinding);

  // --- enable-all-mcp ---
  if (acc.enableAllMcp) {
    acc.findings.push({
      id: 'MS-MCP-ALL-ENABLED',
      severity: 'high',
      capability: 'mcp',
      source: acc.enableAllMcpSource,
      detail: `enableAllProjectMcpServers: true — every project MCP server is trusted unconditionally (no per-server gate).`,
      evidence: 'enableAllProjectMcpServers: true',
    });
  }

  // --- secrets reachability (MetaHarness: requires MCP active) ---
  const secretsReachable = acc.mcpActive && acc.hasReadGrant && !denyProtectsSecrets(deny);
  if (secretsReachable) {
    acc.findings.push({
      id: 'MS-SECRETS-REACHABLE',
      severity: 'high',
      capability: 'secrets',
      source: '.claude/settings*.json',
      detail: `MCP is active and a Read grant exists without a deny rule protecting secret files (.env, SSH keys, cloud creds) — secrets are reachable by tools.`,
      evidence: 'allow contains Read(...) ∧ MCP active ∧ deny lacks a secret-file guard',
    });
  }

  // --- default-deny posture (scoped to the settings surface) ---
  const defaultDeny = acc.hasSettings ? acc.hasDeny && !acc.wildcardAll : true;
  if (acc.hasSettings && !defaultDeny) {
    acc.findings.push({
      id: 'MS-DEFAULT-DENY-OFF',
      severity: 'high',
      capability: 'policy',
      source: '.claude/settings*.json',
      detail: acc.wildcardAll
        ? `An allow rule grants a bare wildcard — everything is permitted (no default-deny).`
        : `No deny rules declared — the permission surface has no guardrail (no default-deny baseline).`,
      evidence: acc.wildcardAll ? 'allow contains "*" / "Bash(*)"' : 'permissions.deny is empty',
    });
  }

  // --- informational (low) findings: verdict-neutral coverage signal ---
  if (acc.mcpToolGrants.length > 0) {
    acc.findings.push({
      id: 'MS-MCP-TOOLS-ALLOWED',
      severity: 'low',
      capability: 'mcp',
      source: '.claude/settings*.json',
      detail: `${acc.mcpToolGrants.length} MCP tool(s) explicitly allowed (per-tool gate — the safe pattern).`,
      evidence: acc.mcpToolGrants.slice(0, 3).join(', '),
    });
  }
  if (acc.unknownTools.length > 0) {
    acc.findings.push({
      id: 'MS-UNKNOWN-TOOL',
      severity: 'low',
      capability: 'policy',
      source: '.claude/settings*.json',
      detail: `${acc.unknownTools.length} grant(s) for tools not in the recognised capability sets — coverage gap, review manually.`,
      evidence: acc.unknownTools.slice(0, 3).join(', '),
    });
  }

  // --- verdict (low is verdict-neutral) ---
  const hasHigh = acc.findings.some((f) => f.severity === 'high');
  const hasMedium = acc.findings.some((f) => f.severity === 'medium');
  const verdict: McpVerdict = hasHigh ? 'high' : hasMedium ? 'medium' : 'clean';
  const exitCode: 0 | 1 | 2 = verdict === 'high' ? 2 : verdict === 'medium' ? 1 : 0;

  const order = { high: 0, medium: 1, low: 2 } as const;
  const findings = [...acc.findings].sort(
    (a, b) => order[a.severity] - order[b.severity] || a.id.localeCompare(b.id),
  );

  return {
    verdict,
    exitCode,
    findings,
    scanned: acc.scanned,
    capabilities: {
      shell: shellSurvivors.length > 0 || acc.serverShell,
      network: Boolean(netFinding) || acc.serverNetwork,
      fileWrite: Boolean(writeFinding),
      secretsReachable: secretsReachable || acc.serverSecret,
      defaultDeny,
    },
  };
}

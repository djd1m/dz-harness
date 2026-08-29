/**
 * Command-invocation accounting for `dz deadwood`.
 *
 * The write leg is a single best-effort append. The report leg is pure: callers
 * inject log text, inventory, an allowlist, and a clock. A usage report is
 * advisory only and never mutates the harness surface it describes.
 *
 * @packageDocumentation
 */

// Static node imports are load-bearing. A deferred `require` in the earlier
// recall-usage seam compiled into ESM without `require`, then failed inside its
// own never-block catch and silently wrote no evidence.
import {
  appendFileSync,
  existsSync,
  readFileSync,
  renameSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';

import { withNamedLockSync } from './named-lock.js';

export const CMD_USAGE_LOG_RELATIVE = '.dz/cmd-usage.jsonl';
export const CMD_USAGE_LOG_MAX_BYTES = 1_048_576;
export const CMD_USAGE_COMPACT_TARGET_BYTES = Math.floor(CMD_USAGE_LOG_MAX_BYTES * 0.75);
export const CMD_USAGE_SCHEMA = 1;
export const CMD_USAGE_V1_EPOCH_MS = Date.parse('2026-08-28T00:00:00.000Z');
export const DEADWOOD_FUTURE_TOLERANCE_MS = 86_400_000;
export const DEADWOOD_MIN_OBSERVED_DAYS = 28;
export const DEADWOOD_MIN_RECORDS = 100;

const DAY_MS = 86_400_000;

export type DeadwoodSurfaceKind = 'command' | 'skill' | 'rule';

export interface CmdUsageInvocationRecord {
  readonly kind: 'cmd';
  readonly cmd: string;
  readonly ts: string;
  readonly v: 1;
}

export interface CmdUsageAggregateRecord {
  readonly kind: 'agg';
  readonly cmd: string;
  readonly runs: number;
  readonly firstAt: string;
  readonly lastAt: string;
  readonly v: 1;
}

export type CmdUsageRecord = CmdUsageInvocationRecord | CmdUsageAggregateRecord;

export interface ParsedCmdUsage {
  readonly records: readonly CmdUsageRecord[];
  readonly skipped: number;
  readonly outOfRange: number;
}

export interface CmdUsageStat {
  readonly cmd: string;
  readonly runs: number;
  readonly runsInWindow: number;
  readonly firstAt: string;
  readonly lastAt: string;
}

export interface DeadwoodAllowlistEntry {
  readonly surface: string;
  readonly kind: DeadwoodSurfaceKind;
  readonly reason: string;
}

export interface DeadwoodInventoryItem {
  readonly surface: string;
  readonly kind: DeadwoodSurfaceKind;
  /** Alternate typed command tokens folded into this canonical command candidate. */
  readonly aliases?: readonly string[];
}

export type DeadwoodVerdict = 'insufficient-data' | 'ready';

export interface DeadwoodUsedSurface {
  readonly state: 'used';
  readonly surface: string;
  readonly kind: Exclude<DeadwoodSurfaceKind, 'skill'>;
  readonly runs: number;
  readonly runsInWindow: number;
  readonly firstAt: string;
  readonly lastAt: string;
}

export interface DeadwoodCandidate {
  readonly state: 'zero-usage';
  readonly surface: string;
  readonly kind: Exclude<DeadwoodSurfaceKind, 'skill'>;
  readonly runs: number;
  readonly runsInWindow: 0;
  readonly firstAt: string | null;
  readonly lastAt: string | null;
}

export interface DeadwoodExemptSurface {
  readonly state: 'excluded-safety';
  readonly surface: string;
  readonly kind: Exclude<DeadwoodSurfaceKind, 'skill'>;
  readonly reason: string;
  readonly runs: number;
  readonly runsInWindow: 0;
  readonly firstAt: string | null;
  readonly lastAt: string | null;
}

export interface DeadwoodUnjudgedSurface {
  readonly state: 'insufficient-data' | 'no-instrumentation';
  readonly surface: string;
  readonly kind: DeadwoodSurfaceKind;
  readonly reason: string;
}

export interface DeadwoodReport {
  readonly verdict: DeadwoodVerdict;
  readonly windowWeeks: number;
  readonly observedDays: number;
  readonly recordCount: number;
  readonly ruleObservedDays: number;
  readonly ruleAuditCount: number;
  readonly candidates: readonly DeadwoodCandidate[];
  readonly exempt: readonly DeadwoodExemptSurface[];
  readonly used: readonly DeadwoodUsedSurface[];
  readonly insufficient: readonly DeadwoodUnjudgedSurface[];
  readonly noInstrumentation: readonly DeadwoodUnjudgedSurface[];
  readonly staleAllowlist: readonly DeadwoodAllowlistEntry[];
  readonly skippedLines: number;
  readonly outOfRange: number;
}

export interface DeadwoodInput {
  readonly cmdUsageText: string;
  readonly guardAuditText?: string;
  readonly inventory: readonly DeadwoodInventoryItem[];
  readonly allowlistText: string;
  readonly weeks: number;
  readonly now: Date;
}

interface RuleUsage {
  readonly auditTimestamps: readonly string[];
  readonly stats: ReadonlyMap<string, CmdUsageStat>;
  readonly skipped: number;
  readonly outOfRange: number;
}

/** Walk up to the nearest `.dz` directory without ever making telemetry throw. */
export function resolveCmdUsageRoot(startDir: string): string {
  try {
    let dir = resolve(startDir);
    for (let level = 0; level < 64; level += 1) {
      try {
        if (statSync(join(dir, '.dz')).isDirectory()) return dir;
      } catch {
        /* not here; keep walking */
      }
      const parent = dirname(dir);
      if (parent === dir) return startDir;
      dir = parent;
    }
  } catch {
    /* fail open to the caller-provided root */
  }
  return startDir;
}

/** One append per parsed command, with no argv/cwd/env payload. Never throws. */
export function recordCommandInvocation(root: string, cmd: string, now: Date = new Date()): void {
  try {
    const resolvedRoot = resolveCmdUsageRoot(root);
    if (cmd === '' || cmd === 'deadwood') return;
    if (!existsSync(join(resolvedRoot, '.dz'))) return;
    const record: CmdUsageInvocationRecord = {
      kind: 'cmd',
      cmd,
      ts: now.toISOString(),
      v: CMD_USAGE_SCHEMA,
    };
    appendFileSync(join(resolvedRoot, CMD_USAGE_LOG_RELATIVE), `${JSON.stringify(record)}\n`, 'utf8');
  } catch {
    /* advisory telemetry must never affect the command it observes */
  }
}

/** ADR-compatible name retained for callers/tests written before the plan renamed the seam. */
export const appendCommandUsage = recordCommandInvocation;

function validTimestamp(value: unknown): value is string {
  return typeof value === 'string' && Number.isFinite(Date.parse(value));
}

function timestampRange(record: CmdUsageRecord): { first: number; last: number } {
  if (record.kind === 'cmd') {
    const ms = Date.parse(record.ts);
    return { first: ms, last: ms };
  }
  return { first: Date.parse(record.firstAt), last: Date.parse(record.lastAt) };
}

function parseCmdRecord(value: unknown): CmdUsageRecord | null {
  if (typeof value !== 'object' || value === null) return null;
  const row = value as Record<string, unknown>;
  if (row.v !== CMD_USAGE_SCHEMA || typeof row.cmd !== 'string' || row.cmd.trim() === '') return null;
  if (row.kind === 'cmd' && validTimestamp(row.ts)) {
    return { kind: 'cmd', cmd: row.cmd, ts: row.ts, v: CMD_USAGE_SCHEMA };
  }
  if (
    row.kind === 'agg' &&
    Number.isInteger(row.runs) &&
    typeof row.runs === 'number' &&
    row.runs > 0 &&
    validTimestamp(row.firstAt) &&
    validTimestamp(row.lastAt) &&
    Date.parse(row.firstAt) <= Date.parse(row.lastAt)
  ) {
    return {
      kind: 'agg',
      cmd: row.cmd,
      runs: row.runs,
      firstAt: row.firstAt,
      lastAt: row.lastAt,
      v: CMD_USAGE_SCHEMA,
    };
  }
  return null;
}

/** Parse independently per line; torn or schema-invalid rows are counted and skipped. */
export function parseCmdUsageLines(text: string, now: Date): ParsedCmdUsage {
  const records: CmdUsageRecord[] = [];
  let skipped = 0;
  let outOfRange = 0;
  const newestAllowed = now.getTime() + DEADWOOD_FUTURE_TOLERANCE_MS;
  for (const line of text.split('\n')) {
    if (line.trim() === '') continue;
    let record: CmdUsageRecord | null = null;
    try {
      record = parseCmdRecord(JSON.parse(line) as unknown);
    } catch {
      record = null;
    }
    if (record === null) {
      skipped += 1;
      continue;
    }
    const { first, last } = timestampRange(record);
    if (first < CMD_USAGE_V1_EPOCH_MS || last > newestAllowed) {
      outOfRange += 1;
      continue;
    }
    records.push(record);
  }
  return { records, skipped, outOfRange };
}

function recordWeight(record: CmdUsageRecord): number {
  return record.kind === 'agg' ? record.runs : 1;
}

function observedDays(records: readonly CmdUsageRecord[], now: Date): number {
  let first = Number.POSITIVE_INFINITY;
  for (const record of records) first = Math.min(first, timestampRange(record).first);
  return Number.isFinite(first) ? Math.max(0, (now.getTime() - first) / DAY_MS) : 0;
}

function recordCount(records: readonly CmdUsageRecord[]): number {
  return records.reduce((sum, record) => sum + recordWeight(record), 0);
}

/** Measured corpus span (first accepted event to last), or null when no event can be read. */
export function measureCmdUsageDepthDays(text: string, now: Date): number | null {
  const parsed = parseCmdUsageLines(text, now);
  let first = Number.POSITIVE_INFINITY;
  let last = Number.NEGATIVE_INFINITY;
  for (const record of parsed.records) {
    const range = timestampRange(record);
    first = Math.min(first, range.first);
    last = Math.max(last, range.last);
  }
  return Number.isFinite(first) && Number.isFinite(last)
    ? Math.max(0, (last - first) / DAY_MS)
    : null;
}

/** A verdict needs both a meaningful sample and history spanning the requested window. */
export function decideDeadwoodWindow(
  depthDays: number,
  count: number,
  weeks: number,
): { ok: boolean; reason: string } {
  const requestedDays = Number.isFinite(weeks) && weeks > 0 ? weeks * 7 : Number.POSITIVE_INFINITY;
  const requiredDays = Math.max(DEADWOOD_MIN_OBSERVED_DAYS, requestedDays);
  if (!Number.isFinite(depthDays) || depthDays < requiredDays) {
    return {
      ok: false,
      reason: `history is ${Math.max(0, Math.floor(depthDays))}d deep; ${requiredDays}d required for this window`,
    };
  }
  if (!Number.isFinite(count) || count < DEADWOOD_MIN_RECORDS) {
    return { ok: false, reason: `${Math.max(0, Math.floor(count))} records; ${DEADWOOD_MIN_RECORDS} required` };
  }
  return { ok: true, reason: 'enough history and records for an advisory classification' };
}

/** Fold raw and compacted rows into the same per-command accounting shape. */
export function foldCmdUsage(
  records: readonly CmdUsageRecord[],
  weeks: number,
  now: Date,
): Map<string, CmdUsageStat> {
  const windowStart = now.getTime() - Math.max(0, weeks) * 7 * DAY_MS;
  const mutable = new Map<string, { runs: number; runsInWindow: number; firstAt: string; lastAt: string }>();
  for (const record of records) {
    const firstAt = record.kind === 'agg' ? record.firstAt : record.ts;
    const lastAt = record.kind === 'agg' ? record.lastAt : record.ts;
    const runs = recordWeight(record);
    const runsInWindow = Date.parse(lastAt) >= windowStart ? runs : 0;
    const prior = mutable.get(record.cmd);
    if (prior === undefined) {
      mutable.set(record.cmd, { runs, runsInWindow, firstAt, lastAt });
      continue;
    }
    prior.runs += runs;
    prior.runsInWindow += runsInWindow;
    if (Date.parse(firstAt) < Date.parse(prior.firstAt)) prior.firstAt = firstAt;
    if (Date.parse(lastAt) > Date.parse(prior.lastAt)) prior.lastAt = lastAt;
  }
  return new Map(
    [...mutable.entries()].map(([cmd, stat]) => [cmd, { cmd, ...stat }]),
  );
}

/** Parse the committed safety allowlist; a reason-less exemption is refused, never skipped. */
export function loadDeadwoodAllowlist(json: string): DeadwoodAllowlistEntry[] {
  const parsed = JSON.parse(json) as unknown;
  const entries = Array.isArray(parsed)
    ? parsed
    : typeof parsed === 'object' && parsed !== null && Array.isArray((parsed as { entries?: unknown }).entries)
      ? (parsed as { entries: unknown[] }).entries
      : null;
  if (entries === null) throw new Error('deadwood allowlist must be an array or an object with entries[]');
  return entries.map((value, index) => {
    const row = typeof value === 'object' && value !== null ? value as Record<string, unknown> : {};
    const surface = typeof row.surface === 'string'
      ? row.surface
      : typeof row.name === 'string' ? row.name : `<entry ${index}>`;
    const kind = row.kind;
    const reason = row.reason;
    if (surface.trim() === '') throw new Error(`deadwood allowlist entry ${index} has an empty surface`);
    if (kind !== 'command' && kind !== 'skill' && kind !== 'rule') {
      throw new Error(`deadwood allowlist entry ${surface} has invalid kind`);
    }
    if (typeof reason !== 'string' || reason.trim() === '') {
      throw new Error(`deadwood allowlist entry ${surface} requires a non-empty reason`);
    }
    return { surface, kind, reason: reason.trim() };
  });
}

function parseGuardAuditUsage(text: string, weeks: number, now: Date): RuleUsage {
  const auditTimestamps: string[] = [];
  const hits: CmdUsageInvocationRecord[] = [];
  let skipped = 0;
  let outOfRange = 0;
  const newestAllowed = now.getTime() + DEADWOOD_FUTURE_TOLERANCE_MS;
  for (const line of text.split('\n')) {
    if (line.trim() === '') continue;
    let row: Record<string, unknown>;
    try {
      const value = JSON.parse(line) as unknown;
      if (typeof value !== 'object' || value === null) throw new Error('not an object');
      row = value as Record<string, unknown>;
    } catch {
      skipped += 1;
      continue;
    }
    if (!validTimestamp(row.ts)) {
      skipped += 1;
      continue;
    }
    const tsMs = Date.parse(row.ts);
    if (tsMs < CMD_USAGE_V1_EPOCH_MS || tsMs > newestAllowed) {
      outOfRange += 1;
      continue;
    }
    auditTimestamps.push(row.ts);
    const violations = Array.isArray(row.violations) ? row.violations : [];
    for (const value of violations) {
      const rule = typeof value === 'object' && value !== null
        ? (value as { rule?: unknown }).rule
        : undefined;
      if (typeof rule === 'string' && rule.trim() !== '') {
        hits.push({ kind: 'cmd', cmd: rule, ts: row.ts, v: CMD_USAGE_SCHEMA });
      }
    }
  }
  return { auditTimestamps, stats: foldCmdUsage(hits, weeks, now), skipped, outOfRange };
}

function timestampDepthDays(timestamps: readonly string[], now: Date): number {
  let first = Number.POSITIVE_INFINITY;
  for (const ts of timestamps) first = Math.min(first, Date.parse(ts));
  return Number.isFinite(first) ? Math.max(0, (now.getTime() - first) / DAY_MS) : 0;
}

function allowlistKey(kind: DeadwoodSurfaceKind, surface: string): string {
  return `${kind}\u0000${surface}`;
}

function emptyReport(
  input: DeadwoodInput,
  parsed: ParsedCmdUsage,
  rules: RuleUsage,
  allowlist: readonly DeadwoodAllowlistEntry[],
): DeadwoodReport {
  const inventoryKeys = new Set(input.inventory.map((item) => allowlistKey(item.kind, item.surface)));
  const insufficient: DeadwoodUnjudgedSurface[] = [];
  const noInstrumentation: DeadwoodUnjudgedSurface[] = [];
  for (const item of input.inventory) {
    if (item.kind === 'skill') {
      noInstrumentation.push({
        state: 'no-instrumentation',
        surface: item.surface,
        kind: item.kind,
        reason: 'no skill-invocation signal exists in dz; this report cannot judge the skill',
      });
    } else {
      insufficient.push({
        state: 'insufficient-data',
        surface: item.surface,
        kind: item.kind,
        reason: 'the command-usage corpus has not reached the requested history and sample floor',
      });
    }
  }
  return {
    verdict: 'insufficient-data',
    windowWeeks: input.weeks,
    observedDays: observedDays(parsed.records, input.now),
    recordCount: recordCount(parsed.records),
    ruleObservedDays: timestampDepthDays(rules.auditTimestamps, input.now),
    ruleAuditCount: rules.auditTimestamps.length,
    candidates: [],
    exempt: [],
    used: [],
    insufficient,
    noInstrumentation,
    staleAllowlist: allowlist.filter((entry) => !inventoryKeys.has(allowlistKey(entry.kind, entry.surface))),
    skippedLines: parsed.skipped + rules.skipped,
    outOfRange: parsed.outOfRange + rules.outOfRange,
  };
}

function classifyInstrumented(
  item: DeadwoodInventoryItem & { kind: 'command' | 'rule' },
  stat: CmdUsageStat | undefined,
  allowlist: ReadonlyMap<string, DeadwoodAllowlistEntry>,
  destination: {
    used: DeadwoodUsedSurface[];
    candidates: DeadwoodCandidate[];
    exempt: DeadwoodExemptSurface[];
  },
): void {
  if (stat !== undefined && stat.runsInWindow > 0) {
    destination.used.push({
      state: 'used',
      ...item,
      runs: stat.runs,
      runsInWindow: stat.runsInWindow,
      firstAt: stat.firstAt,
      lastAt: stat.lastAt,
    });
    return;
  }
  const runs = stat?.runs ?? 0;
  const firstAt = stat?.firstAt ?? null;
  const lastAt = stat?.lastAt ?? null;
  const allowed = allowlist.get(allowlistKey(item.kind, item.surface));
  if (allowed !== undefined) {
    destination.exempt.push({
      state: 'excluded-safety',
      ...item,
      reason: allowed.reason,
      runs,
      runsInWindow: 0,
      firstAt,
      lastAt,
    });
    return;
  }
  destination.candidates.push({
    state: 'zero-usage',
    ...item,
    runs,
    runsInWindow: 0,
    firstAt,
    lastAt,
  });
}

function commandStatForInventoryItem(
  item: DeadwoodInventoryItem,
  stats: ReadonlyMap<string, CmdUsageStat>,
): CmdUsageStat | undefined {
  const tokens = new Set([item.surface, ...(item.aliases ?? [])]);
  let merged: CmdUsageStat | undefined;
  for (const token of tokens) {
    const stat = stats.get(token);
    if (stat === undefined) continue;
    if (merged === undefined) {
      merged = { ...stat, cmd: item.surface };
      continue;
    }
    merged = {
      cmd: item.surface,
      runs: merged.runs + stat.runs,
      runsInWindow: merged.runsInWindow + stat.runsInWindow,
      firstAt: Date.parse(merged.firstAt) <= Date.parse(stat.firstAt) ? merged.firstAt : stat.firstAt,
      lastAt: Date.parse(merged.lastAt) >= Date.parse(stat.lastAt) ? merged.lastAt : stat.lastAt,
    };
  }
  return merged;
}

/** Build the single structure consumed by both the human and JSON renderers. */
export function buildDeadwoodReport(input: DeadwoodInput): DeadwoodReport {
  const allowlistEntries = loadDeadwoodAllowlist(input.allowlistText);
  const allowlist = new Map(
    allowlistEntries.map((entry) => [allowlistKey(entry.kind, entry.surface), entry]),
  );
  const parsed = parseCmdUsageLines(input.cmdUsageText, input.now);
  const rules = parseGuardAuditUsage(input.guardAuditText ?? '', input.weeks, input.now);
  const depth = observedDays(parsed.records, input.now);
  const count = recordCount(parsed.records);
  if (!decideDeadwoodWindow(depth, count, input.weeks).ok) {
    return emptyReport(input, parsed, rules, allowlistEntries);
  }

  const commandStats = foldCmdUsage(parsed.records, input.weeks, input.now);
  const ruleDepth = timestampDepthDays(rules.auditTimestamps, input.now);
  const ruleWindow = decideDeadwoodWindow(ruleDepth, rules.auditTimestamps.length, input.weeks);
  const candidates: DeadwoodCandidate[] = [];
  const exempt: DeadwoodExemptSurface[] = [];
  const used: DeadwoodUsedSurface[] = [];
  const insufficient: DeadwoodUnjudgedSurface[] = [];
  const noInstrumentation: DeadwoodUnjudgedSurface[] = [];
  const inventoryKeys = new Set<string>();

  for (const item of [...input.inventory].sort((a, b) =>
    a.kind.localeCompare(b.kind) || a.surface.localeCompare(b.surface))) {
    inventoryKeys.add(allowlistKey(item.kind, item.surface));
    if (item.kind === 'skill') {
      noInstrumentation.push({
        state: 'no-instrumentation',
        surface: item.surface,
        kind: item.kind,
        reason: 'no skill-invocation signal exists in dz; this report cannot judge the skill',
      });
      continue;
    }
    if (item.kind === 'rule' && !ruleWindow.ok) {
      insufficient.push({
        state: 'insufficient-data',
        ...item,
        reason: `guard-audit cannot support this window: ${ruleWindow.reason}`,
      });
      continue;
    }
    classifyInstrumented(
      { surface: item.surface, kind: item.kind },
      item.kind === 'command'
        ? commandStatForInventoryItem(item, commandStats)
        : rules.stats.get(item.surface),
      allowlist,
      { candidates, exempt, used },
    );
  }

  return {
    verdict: 'ready',
    windowWeeks: input.weeks,
    observedDays: depth,
    recordCount: count,
    ruleObservedDays: ruleDepth,
    ruleAuditCount: rules.auditTimestamps.length,
    candidates,
    exempt,
    used,
    insufficient,
    noInstrumentation,
    staleAllowlist: allowlistEntries.filter((entry) =>
      !inventoryKeys.has(allowlistKey(entry.kind, entry.surface))),
    skippedLines: parsed.skipped + rules.skipped,
    outOfRange: parsed.outOfRange + rules.outOfRange,
  };
}

function renderSurfaceLabel(item: { kind: DeadwoodSurfaceKind; surface: string }): string {
  return `${item.kind} ${item.surface}`;
}

const ADVISORY_CAVEAT =
  'zero usage != useless — this list is a candidate for a deprecation mark in --help, not for deletion.';

/** Render one report object as either human text or stable JSON. */
export function renderDeadwoodReport(report: DeadwoodReport, format: 'text' | 'json'): string {
  if (format === 'json') return JSON.stringify(report, null, 2);
  const out: string[] = [
    'dz deadwood — advisory unused harness surface report',
    `window: ${report.windowWeeks} week(s) · command history ${Math.floor(report.observedDays)}d / ${report.recordCount} invocation(s)`,
  ];
  if (report.verdict === 'insufficient-data') {
    out.push('VERDICT: INSUFFICIENT_DATA');
    out.push(`  accruing: ${Math.floor(report.observedDays)}d / ${report.recordCount} command record(s)`);
    out.push(`  ${ADVISORY_CAVEAT}`);
    out.push(`  ${report.noInstrumentation.length} skill(s): no invocation signal; not judged`);
    if (report.skippedLines > 0 || report.outOfRange > 0) {
      out.push(`  integrity: ${report.skippedLines} skipped malformed line(s) · ${report.outOfRange} out-of-range timestamp(s)`);
    }
    return out.join('\n');
  }

  out.push(`VERDICT: ${report.candidates.length === 0 ? 'NO_DEADWOOD' : 'CANDIDATES'}`);
  out.push('');
  out.push('DEPRECATION CANDIDATES (human review required):');
  if (report.candidates.length === 0) out.push('  none');
  for (const item of report.candidates) {
    out.push(`  zero-usage · ${renderSurfaceLabel(item)} · runs(all-time)=${item.runs} · last=${item.lastAt ?? 'never'}`);
    out.push(`    ${ADVISORY_CAVEAT}`);
  }
  out.push('');
  out.push('SAFETY EXCLUDED:');
  if (report.exempt.length === 0) out.push('  none');
  for (const item of report.exempt) {
    out.push(`  excluded-safety(${item.reason}) · ${renderSurfaceLabel(item)}`);
  }
  out.push('');
  out.push(`USED: ${report.used.length}`);
  for (const item of report.used) {
    out.push(`  used · ${renderSurfaceLabel(item)} · ${item.runsInWindow} run(s) in window`);
  }
  out.push(`INSUFFICIENT SIGNAL: ${report.insufficient.length}`);
  out.push(`NO INSTRUMENTATION: ${report.noInstrumentation.length} skill(s) — not candidates`);
  out.push(`INTEGRITY: ${report.skippedLines} skipped malformed line(s) · ${report.outOfRange} out-of-range timestamp(s)`);
  if (report.staleAllowlist.length > 0) {
    out.push(`STALE ALLOWLIST: ${report.staleAllowlist.map(renderSurfaceLabel).join(', ')}`);
  }
  return out.join('\n');
}

function compactedRows(records: readonly CmdUsageRecord[]): CmdUsageAggregateRecord[] {
  return [...foldCmdUsage(records, 0, new Date(0)).values()]
    .sort((a, b) => a.cmd.localeCompare(b.cmd))
    .map((stat) => ({
      kind: 'agg',
      cmd: stat.cmd,
      runs: stat.runs,
      firstAt: stat.firstAt,
      lastAt: stat.lastAt,
      v: CMD_USAGE_SCHEMA,
    }));
}

function compactedText(records: readonly CmdUsageRecord[]): string {
  const ordered = [...records].sort((a, b) =>
    timestampRange(a).last - timestampRange(b).last || a.cmd.localeCompare(b.cmd));
  const recent: CmdUsageRecord[] = [];
  let recentBytes = 0;
  const recentBudget = Math.floor(CMD_USAGE_COMPACT_TARGET_BYTES / 2);
  for (let index = ordered.length - 1; index >= 0; index -= 1) {
    const record = ordered[index]!;
    const bytes = Buffer.byteLength(JSON.stringify(record), 'utf8') + 1;
    if (recentBytes + bytes > recentBudget) break;
    recent.unshift(record);
    recentBytes += bytes;
  }
  const older = ordered.slice(0, ordered.length - recent.length);
  const rows: CmdUsageRecord[] = [...compactedRows(older), ...recent];
  const text = rows.map((row) => JSON.stringify(row)).join('\n');
  return text === '' ? '' : `${text}\n`;
}

/**
 * Lazily compact the invocation log on the cold read path.
 *
 * The named lock protects competing compactors. Emitters deliberately stay
 * lock-free; this advisory log accepts a possible racing row rather than making
 * every command wait on a lock. Every error is swallowed so compaction can never
 * turn `dz deadwood` into a gate.
 */
export function compactCmdUsageIfNeeded(root: string): void {
  try {
    const resolvedRoot = resolveCmdUsageRoot(root);
    const path = join(resolvedRoot, CMD_USAGE_LOG_RELATIVE);
    if (!existsSync(path) || statSync(path).size <= CMD_USAGE_LOG_MAX_BYTES) return;
    withNamedLockSync(resolvedRoot, 'cmd-usage', () => {
      if (!existsSync(path) || statSync(path).size <= CMD_USAGE_LOG_MAX_BYTES) return;
      const parsed = parseCmdUsageLines(readFileSync(path, 'utf8'), new Date());
      // Preserve a recent raw tail for accurate window counts and fold only the older prefix.
      // If high-cardinality aggregate rows still exceed the target, keep them all: the size target
      // is a convenience, while deleting a command's history would fabricate a zero-use candidate.
      const text = compactedText(parsed.records);
      const tmp = `${path}.compact-${process.pid}`;
      writeFileSync(tmp, text, { encoding: 'utf8', mode: 0o600 });
      renameSync(tmp, path);
    });
  } catch {
    /* advisory compaction is fail-open just like the writer and report */
  }
}

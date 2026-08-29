/**
 * `dz cadence` — the "what shipped" aggregator (backlog ef740b44), built on one spine:
 * A WINDOW DEEPER THAN THE RECORD IS REFUSED (ADR-001). The weekly-digest research (2026-08-22)
 * caught a «year» digest standing on 174 days of data — scale forgery by aggregation; an
 * aggregator that silently computes any requested period repeats it mechanically.
 *
 * Four sources, every degradation NAMED in the report, never a silent zero:
 *  - graded shipments: features/<slug>/08_qe_report.md through the hardened readQeGrade
 *    (prefix-negation aware, all measured real-world grade forms); ungraded reports are a COLUMN;
 *  - npm publishes: the dz recap registry-time cache (third-party timestamps);
 *  - guard repeat decay on a FIXED rule set: a rule enters only with events BEFORE the window
 *    start (the data-driven birth proxy — the no-stubs class of «zero repeats because the rule is
 *    young» is excluded by construction);
 *  - knowledge reuse: recall events per bucket from .dz/recall-usage.jsonl.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { readQeGrade } from './score.js';

export type CadenceWindow = 'day' | 'week' | 'month' | 'quarter' | 'halfyear' | 'year';

export const CADENCE_WINDOW_DAYS: Record<CadenceWindow, number> = {
  day: 1, week: 7, month: 30, quarter: 91, halfyear: 182, year: 365,
};

export interface CadenceWindowDecision {
  readonly ok: boolean;
  readonly reason: string;
  /** The largest window today's record CAN honestly carry, or null when even `day` cannot. */
  readonly largestAllowed: CadenceWindow | null;
}

/**
 * ADR-001: a window is accepted only when the record is at least TWO windows deep — two full units
 * are the minimum for the word «cadence»; one point has no rhythm.
 */
export function decideCadenceWindow(window: CadenceWindow, dataDepthDays: number): CadenceWindowDecision {
  const need = CADENCE_WINDOW_DAYS[window] * 2;
  const order: CadenceWindow[] = ['year', 'halfyear', 'quarter', 'month', 'week', 'day'];
  const largestAllowed = order.find((w) => dataDepthDays >= CADENCE_WINDOW_DAYS[w] * 2) ?? null;
  if (dataDepthDays >= need) return { ok: true, reason: `record depth ${dataDepthDays}d covers 2×${window}`, largestAllowed };
  return {
    ok: false,
    reason: `REFUSED: the record is ${dataDepthDays} day(s) deep and a ${window} cadence needs ${need} — a cadence computed from under two full windows is a scale forgery, not a number` +
      (largestAllowed ? `; the largest honest window today is «${largestAllowed}»` : '; even «day» is not established yet'),
    largestAllowed,
  };
}

/** ISO week key (YYYY-Www) for a ms timestamp. */
export function isoWeekOf(ms: number): string {
  const d = new Date(ms);
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = t.getUTCDay() === 0 ? 7 : t.getUTCDay();
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const yearStart = Date.UTC(t.getUTCFullYear(), 0, 1);
  const week = Math.ceil(((t.getTime() - yearStart) / 86400000 + 1) / 7);
  return `${t.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

export interface CadenceEvent { readonly ts: number; readonly kind: string; readonly detail?: string }

/** Bucket events into ISO weeks inside [windowStart, now]. */
export function weeklyBuckets(events: readonly CadenceEvent[], windowStartMs: number, nowMs: number): Map<string, CadenceEvent[]> {
  const out = new Map<string, CadenceEvent[]>();
  for (const e of events) {
    if (!isFinite(e.ts) || e.ts < windowStartMs || e.ts > nowMs) continue;
    const k = isoWeekOf(e.ts);
    const list = out.get(k) ?? [];
    list.push(e);
    out.set(k, list);
  }
  return out;
}

export interface GuardDecayRow { readonly rule: string; readonly before: number; readonly inWindow: number }

/**
 * Repeat decay over the FIXED set: only rules with at least one event BEFORE the window start
 * qualify (their existence predates the window); newborn rules are EXCLUDED by construction and
 * returned separately so the exclusion is visible.
 */
export function guardRepeatDecay(
  events: readonly { ts: number; rule: string }[],
  windowStartMs: number,
): { decay: GuardDecayRow[]; excludedNewborn: string[] } {
  const before = new Map<string, number>();
  const inWindow = new Map<string, number>();
  for (const e of events) {
    if (!isFinite(e.ts) || e.rule === '') continue;
    if (e.ts < windowStartMs) before.set(e.rule, (before.get(e.rule) ?? 0) + 1);
    else inWindow.set(e.rule, (inWindow.get(e.rule) ?? 0) + 1);
  }
  const decay: GuardDecayRow[] = [...before.entries()]
    .map(([rule, b]) => ({ rule, before: b, inWindow: inWindow.get(rule) ?? 0 }))
    .sort((a, b) => b.before - a.before);
  const excludedNewborn = [...inWindow.keys()].filter((r) => !before.has(r)).sort();
  return { decay, excludedNewborn };
}

export interface CadenceReport {
  readonly window: CadenceWindow;
  readonly decision: CadenceWindowDecision;
  readonly depthDays: number;
  readonly shipments: { graded: Record<string, number>; ungraded: number; gradedTotal: number; byGrade: Record<string, number> };
  readonly npmPublishes: { weekly: Record<string, number>; degraded: string | null };
  readonly guard: { decay: GuardDecayRow[]; excludedNewborn: string[]; degraded: string | null };
  readonly recalls: { weekly: Record<string, number>; degraded: string | null };
}

function safeJsonl(path: string): unknown[] {
  const out: unknown[] = [];
  try {
    for (const line of readFileSync(path, 'utf-8').split('\n')) {
      if (line.trim() === '') continue;
      try { out.push(JSON.parse(line)); } catch { /* torn line — skip, counted nowhere */ }
    }
  } catch { /* absent file — callers name the degradation */ }
  return out;
}

/** Build the full report. `now` injectable — the refusal decision must be testable. */
export function buildCadenceReport(root: string, window: CadenceWindow, now?: number): CadenceReport {
  const nowMs = typeof now === 'number' && isFinite(now) ? now : Date.now();

  // Shipment events: graded 08 reports, dated by the run-cost ledger (fallback: report mtime is
  // NOT used — an mtime moves on every touch; an undatable report lands in `ungraded`... no: in
  // its own named bucket via ledger-missing) — v1 keeps the honest subset: ledger-dated only.
  const ledger = safeJsonl(join(root, '.dz', 'feature-adr', 'run-cost-ledger.jsonl')) as Array<{ slug?: string; date?: string }>;
  const dateBySlug = new Map<string, number>();
  let earliest = nowMs;
  for (const r of ledger) {
    if (typeof r.slug !== 'string' || typeof r.date !== 'string') continue;
    const ts = Date.parse(r.date);
    if (!isFinite(ts)) continue;
    if (!dateBySlug.has(r.slug) || ts > (dateBySlug.get(r.slug) as number)) dateBySlug.set(r.slug, ts);
    if (ts < earliest) earliest = ts;
  }
  // Record depth is the UNION of sources — the npm registry reaches months past the ledger, and a
  // refusal computed from the shallowest source alone would under-admit honest windows.
  let unionEarliest = earliest;
  try {
    const cache = JSON.parse(readFileSync(join(root, '.dz', 'recap', 'npm-times.json'), 'utf-8')) as { packages?: Record<string, { versions?: Record<string, string> }> };
    for (const entry of Object.values(cache.packages ?? {})) for (const iso of Object.values(entry.versions ?? {})) {
      const ts = Date.parse(iso); if (isFinite(ts) && ts < unionEarliest) unionEarliest = ts;
    }
  } catch { /* cache absent — named later */ }
  for (const row of safeJsonl(join(root, '.dz', 'guard-audit.jsonl')) as Array<{ ts?: string }>) {
    const ts = Date.parse(String(row.ts ?? '')); if (isFinite(ts) && ts < unionEarliest) unionEarliest = ts;
  }
  const depthDays = Math.floor((nowMs - unionEarliest) / 86400000);
  const decision = decideCadenceWindow(window, depthDays);
  const windowStart = nowMs - CADENCE_WINDOW_DAYS[window] * 86400000;

  const gradedWeekly: Record<string, number> = {};
  const byGrade: Record<string, number> = {};
  let ungraded = 0;
  let gradedTotal = 0;
  const featuresDir = join(root, 'features');
  if (existsSync(featuresDir) && decision.ok) {
    for (const slug of readdirSync(featuresDir)) {
      const report = join(featuresDir, slug, '08_qe_report.md');
      if (!existsSync(report)) continue;
      const ts = dateBySlug.get(slug);
      if (ts === undefined || ts < windowStart || ts > nowMs) continue;
      const grade = readQeGrade(readFileSync(report, 'utf-8')).grade;
      if (grade === null) { ungraded += 1; continue; }
      gradedTotal += 1;
      byGrade[grade] = (byGrade[grade] ?? 0) + 1;
      const wk = isoWeekOf(ts);
      gradedWeekly[wk] = (gradedWeekly[wk] ?? 0) + 1;
    }
  }

  // npm publishes from the recap cache — third-party registry timestamps.
  const npmWeekly: Record<string, number> = {};
  let npmDegraded: string | null = null;
  const npmCache = join(root, '.dz', 'recap', 'npm-times.json');
  if (!existsSync(npmCache)) {
    npmDegraded = 'no npm-times cache — run `dz recap --refresh-publishes` first (registry timestamps are third-party data this command never fetches itself)';
  } else if (decision.ok) {
    try {
      const cache = JSON.parse(readFileSync(npmCache, 'utf-8')) as { packages?: Record<string, { versions?: Record<string, string> }> };
      for (const entry of Object.values(cache.packages ?? {})) {
        for (const iso of Object.values(entry.versions ?? {})) {
          const ts = Date.parse(iso);
          if (!isFinite(ts) || ts < windowStart || ts > nowMs) continue;
          const wk = isoWeekOf(ts);
          npmWeekly[wk] = (npmWeekly[wk] ?? 0) + 1;
        }
      }
    } catch { npmDegraded = 'npm-times cache unreadable — refresh it (`dz recap --refresh-publishes`)'; }
  }

  // Guard decay on the fixed set.
  const guardRows = (safeJsonl(join(root, '.dz', 'guard-audit.jsonl')) as Array<{ ts?: string; at?: string; rule?: string; violations?: Array<{ rule?: string }> }>)
    .flatMap((r) => {
      const ts = Date.parse(String(r.ts ?? r.at ?? ''));
      if (!isFinite(ts)) return [];
      // the live shape: one audit row carries violations[] each naming its rule
      if (Array.isArray(r.violations)) return r.violations.map((v) => ({ ts, rule: String(v?.rule ?? '') })).filter((x) => x.rule !== '');
      return typeof r.rule === 'string' && r.rule !== '' ? [{ ts, rule: r.rule }] : [];
    });
  const guard = decision.ok ? guardRepeatDecay(guardRows, windowStart) : { decay: [], excludedNewborn: [] };
  const guardDegraded = guardRows.length === 0 ? 'no guard-audit events on disk — decay has nothing to stand on' : null;

  // Knowledge reuse: recall events.
  const recallRows = (safeJsonl(join(root, '.dz', 'recall-usage.jsonl')) as Array<{ ts?: string; at?: string }>)
    .map((r) => Date.parse(String(r.ts ?? r.at ?? '')))
    .filter((t) => isFinite(t));
  const recallWeekly: Record<string, number> = {};
  if (decision.ok) for (const ts of recallRows) {
    if (ts < windowStart || ts > nowMs) continue;
    const wk = isoWeekOf(ts);
    recallWeekly[wk] = (recallWeekly[wk] ?? 0) + 1;
  }
  const recallDegraded = recallRows.length === 0 ? 'no recall-usage events — the reuse leg has nothing to stand on' : null;

  return {
    window, decision, depthDays,
    shipments: { graded: gradedWeekly, ungraded, gradedTotal, byGrade },
    npmPublishes: { weekly: npmWeekly, degraded: npmDegraded },
    guard: { ...guard, degraded: guardDegraded },
    recalls: { weekly: recallWeekly, degraded: recallDegraded },
  };
}

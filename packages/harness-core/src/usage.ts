/**
 * `dz usage` data source — a READONLY, never-throw, best-effort estimate of Claude SESSION
 * and WEEKLY token usage, aggregated from the local Claude Code transcript files under
 * `~/.claude/projects/<munged>/<session>.jsonl`.
 *
 * ## Honest-uncertainty contract (LOAD-BEARING)
 *
 * These percentages are ESTIMATES derived by aggregating local transcript token counts against
 * USER-CONFIGURED limits. There is no official Anthropic usage API being consulted; claude.ai is
 * authoritative. Therefore:
 *
 * - Every JSON payload emitted by the CLI carries `estimated: true`.
 * - When a limit is unconfigured, the corresponding `pct` is `null` — unknown, never 0.
 * - Weekly usage counts from a fixed configured reset anchor such as `Wed 08:59`, not from a
 *   rolling seven-day window.
 * - Session usage counts from the active fixed-length transcript block, not from a rolling
 *   last-N-hours window.
 *
 * ## Statusline discipline
 *
 * Modeled on {@link ./statusline.ts} and {@link ./vector-tier.ts}'s `readVectorEngineMode`:
 * - never-throw — missing/corrupt config, transcript directories, and jsonl lines collapse to
 *   best-effort zero/null values, never exceptions;
 * - readonly — `computeUsage` performs zero writes;
 * - bounded scanning via an mtime prefilter;
 * - injectable clock — `computeUsage(root, now?)` takes an optional epoch-ms clock.
 *
 * @packageDocumentation
 */

import { existsSync, lstatSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const HOUR_MS = 60 * 60 * 1000;
const DEFAULT_SESSION_BLOCK_HOURS = 5;
const DEFAULT_WEEKLY_RESET_ANCHOR = 'Wed 08:59';
// mtime prefilter slack (+1h) — guards against clock skew between the writer and this reader.
const MTIME_SLACK_MS = HOUR_MS;

/**
 * Per-token price ratios relative to base input, used to turn a raw token mix into INPUT-EQUIVALENT
 * tokens. Without this the metric is ~90-99% cache-read and measures context size, not work.
 * (Anthropic list pricing: 5m cache write 1.25x input, cache read 0.1x input, output 5x input.)
 */
export const TOKEN_WEIGHTS = { input: 1, cacheWrite: 1.25, cacheWrite1h: 2, cacheRead: 0.1, output: 5 } as const;

/** The four raw token buckets of one `message.usage` record, after clamping. */
export interface RawTokenMix {
  readonly input: number;
  /** Cache-CREATION tokens, already priced at their TTL rate inside {@link weightedTokensOf}. */
  readonly cacheWrite: number;
  readonly cacheRead: number;
  readonly output: number;
}

function positiveFinite(v: unknown): number {
  return typeof v === 'number' && isFinite(v) && v > 0 ? v : 0;
}

/**
 * The raw token buckets of an Anthropic `message.usage` object, clamped to finite non-negatives.
 * `cacheWrite` prefers the TTL breakdown (`cache_creation.ephemeral_*`) and falls back to the flat
 * `cache_creation_input_tokens` — reading only the flat field scored a nested-only record as ZERO.
 */
export function rawTokenMixOf(usage: unknown): RawTokenMix {
  if (typeof usage !== 'object' || usage === null) {
    return { input: 0, cacheWrite: 0, cacheRead: 0, output: 0 };
  }
  const u = usage as Record<string, unknown>;
  const cc = (typeof u['cache_creation'] === 'object' && u['cache_creation'] !== null
    ? (u['cache_creation'] as Record<string, unknown>)
    : {}) as Record<string, unknown>;
  const c5 = positiveFinite(cc['ephemeral_5m_input_tokens']);
  const c1h = positiveFinite(cc['ephemeral_1h_input_tokens']);
  const cacheWrite = c5 + c1h > 0 ? c5 + c1h : positiveFinite(u['cache_creation_input_tokens']);
  return {
    input: positiveFinite(u['input_tokens']),
    cacheWrite,
    cacheRead: positiveFinite(u['cache_read_input_tokens']),
    output: positiveFinite(u['output_tokens']),
  };
}

/**
 * THE estimator — cost-weighted "input-equivalent" tokens for one `message.usage` object.
 *
 * A flat token sum is 89-99.7% `cache_read` on this machine, which tracks CONVERSATION LENGTH
 * rather than work done. {@link TOKEN_WEIGHTS} are the published per-token price ratios relative to
 * base input, so the result tracks consumption instead of context size.
 *
 * Extracted verbatim from `computeUsage`'s per-sample arithmetic so that `dz usage` and the
 * per-stage cost ledger measure the same quantity (feature `cost-ledger`, ADR-002 — the invariant
 * only means something if both sides use ONE estimator). The return value is UNROUNDED; callers
 * that need exact integer identities round once at their own extraction point.
 */
export function weightedTokensOf(usage: unknown): number {
  if (typeof usage !== 'object' || usage === null) return 0;
  const mix = rawTokenMixOf(usage);
  const u = usage as Record<string, unknown>;
  const cc =
    typeof u['cache_creation'] === 'object' && u['cache_creation'] !== null
      ? (u['cache_creation'] as Record<string, unknown>)
      : {};
  const c5 = positiveFinite(cc['ephemeral_5m_input_tokens']);
  const c1h = positiveFinite(cc['ephemeral_1h_input_tokens']);
  const cacheWriteCost =
    c5 + c1h > 0
      ? c5 * TOKEN_WEIGHTS.cacheWrite + c1h * TOKEN_WEIGHTS.cacheWrite1h
      : mix.cacheWrite * TOKEN_WEIGHTS.cacheWrite;
  return (
    mix.input * TOKEN_WEIGHTS.input +
    cacheWriteCost +
    mix.cacheRead * TOKEN_WEIGHTS.cacheRead +
    mix.output * TOKEN_WEIGHTS.output
  );
}

export const CLAUDE_USAGE_MODELS = ['fable', 'opus', 'sonnet', 'haiku'] as const;
export type ClaudeUsageModel = (typeof CLAUDE_USAGE_MODELS)[number];

export interface UsageWindow {
  readonly startedAtMs: number;
  readonly resetsAtMs: number;
}

export interface WeeklyResetAnchor {
  readonly weekday: number; // local Date#getDay(): Sun=0, Mon=1, ...
  readonly hour: number;
  readonly minute: number;
  /** Explicit UTC offset in minutes (e.g. `+03:00` → 180). When present, the boundary is an
   * ABSOLUTE instant, immune to the server's timezone. When absent (legacy `Wed 08:59`), the
   * boundary is computed in server-local time — PROVEN wrong when the machine's tz differs from
   * the account's reset tz (idea c8513be9: the same wall-clock instant produced window starts a
   * WEEK apart under UTC vs Europe/Moscow, so the counter held the old week for hours after the
   * real reset while printing the "correct" clock time). */
  readonly offsetMinutes?: number;
}

/** Optional, plan-dependent calibration limits from `.dz/config.json`. Absent ⇒ pct is `null`. */
export interface UsageLimits {
  readonly sessionTokenLimit?: number;
  readonly weeklyTokenLimit?: number;
  readonly weeklyTokenLimitByModel?: Partial<Record<ClaudeUsageModel, number>>;
  readonly weeklyResetAnchor?: string;
  readonly sessionBlockHours?: number;
  readonly calibratedAt?: string;
  readonly source?: string;
  /** Routing must not read the estimated pcts (ADR-001 usage-honesty, FR-3). Legacy
   *  `_disabledReason` free-text also reads as true — the note WAS the switch, now it is data. */
  readonly routingDisabled?: boolean;
  /** Account identity captured at calibration time (FR-4); a login change stales the calibration. */
  readonly calibrationAccount?: string | null;
}

export interface UsageModelEstimate {
  readonly tokens: number;
  readonly pct: number | null;
}

/** A never-throw usage estimate. `estimated` is ALWAYS `true` (honest-uncertainty marker). */
export interface UsageEstimate {
  /** Active fixed-length session block token total (all projects). */
  readonly sessionTokens: number;
  /** Fixed weekly-reset-window token total (all projects). */
  readonly weeklyTokens: number;
  /** `null` ⇔ `sessionTokenLimit` unconfigured (unknown — never a guess). */
  readonly sessionPct: number | null;
  /** Binding weekly pct: per-model max when configured, otherwise all-model aggregate. */
  readonly weeklyPct: number | null;
  /** ISO — active block start + configured session hours; `null` when there is no active block. */
  readonly sessionResetsAt: string | null;
  /** ISO — next configured fixed weekly reset. */
  readonly weeklyResetsAt: string | null;
  /** ALWAYS `true` — these are estimates from local aggregation, not an official API. */
  readonly estimated: true;
  /** Present only when per-model weekly limits are configured. */
  readonly weeklyByModel?: Partial<Record<ClaudeUsageModel, UsageModelEstimate>>;
  /** Raw weekly model totals for calibration; CLI omits this from the compatibility JSON. */
  readonly weeklyTokensByModel: Partial<Record<ClaudeUsageModel, number>>;
  /** Model family that supplied the binding top-level weeklyPct, if any. */
  readonly weeklyBindingModel?: ClaudeUsageModel;
  /** Traceability for tests and calibration diagnostics. */
  readonly sessionStartedAt: string | null;
  readonly weeklyStartedAt: string | null;
  /**
   * Why the routed pcts are null (ADR-001 usage-honesty): empty ⇔ the numbers are established.
   * `scan-empty` — recent transcripts exist yet the scan extracted nothing (instrument failure);
   * `window-miss:*` — samples exist but the configured window filtered them all (misaligned
   * anchor); `routing-disabled` — config says the estimates must not steer; `calibration-stale` —
   * the account changed since calibration. A zero pct is legitimate ONLY on a machine with no
   * recent transcripts at all.
   */
  readonly notEstablished: readonly UsageNotEstablishedReason[];
  /**
   * The raw estimates when the routed pcts are nulled by `routing-disabled`/`calibration-stale` —
   * for HUMAN eyes (recalled lesson: an estimated pct must never drive routing until its window is
   * verified against the provider). Absent when the top-level pcts already carry the numbers.
   */
  readonly estimatesNotForRouting?: { readonly sessionPct: number | null; readonly weeklyPct: number | null };
}

export interface UsageCalibrationInput {
  readonly sessionPct?: unknown;
  readonly weeklyPct?: unknown;
  readonly modelPct?: Readonly<Record<string, unknown>>;
  readonly calibratedAt: string;
  readonly source: 'claude.ai/settings/usage';
}

export interface UsageCalibrationChange {
  readonly key: string;
  readonly before: number | null;
  readonly after: number;
  readonly tokens: number;
  readonly pct: number;
}

export interface UsageCalibrationPlan {
  readonly before: UsageLimits;
  readonly after: UsageLimits;
  readonly changes: readonly UsageCalibrationChange[];
  readonly skipped: readonly string[];
}

interface MutableUsageLimits {
  sessionTokenLimit?: number;
  weeklyTokenLimit?: number;
  weeklyTokenLimitByModel?: Partial<Record<ClaudeUsageModel, number>>;
  weeklyResetAnchor?: string;
  sessionBlockHours?: number;
  calibratedAt?: string;
  source?: string;
  routingDisabled?: boolean;
  calibrationAccount?: string | null;
}

const WEEKDAY_TO_DAY: Record<string, number> = {
  sun: 0,
  mon: 1,
  tue: 2,
  wed: 3,
  thu: 4,
  fri: 5,
  sat: 6,
};

const DAY_TO_WEEKDAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function positiveFiniteNumber(value: unknown): number | undefined {
  return typeof value === 'number' && isFinite(value) && value > 0 ? value : undefined;
}

function hasOwn(obj: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(obj, key);
}

function canonicalWeeklyResetAnchor(anchor: WeeklyResetAnchor): string {
  const base = `${DAY_TO_WEEKDAY[anchor.weekday] ?? 'Wed'} ${String(anchor.hour).padStart(2, '0')}:${String(anchor.minute).padStart(2, '0')}`;
  // The offset MUST survive canonicalization: this function silently dropped it on first
  // implementation, degrading a pinned absolute instant back to the server-tz form the offset
  // exists to escape (idea c8513be9 — caught live: the pin landed, the warning kept firing).
  if (anchor.offsetMinutes === undefined) return base;
  const sign = anchor.offsetMinutes < 0 ? '-' : '+';
  const abs = Math.abs(anchor.offsetMinutes);
  return `${base} ${sign}${String(Math.floor(abs / 60)).padStart(2, '0')}:${String(abs % 60).padStart(2, '0')}`;
}

export function parseWeeklyResetAnchor(anchor: string): WeeklyResetAnchor | null {
  const m = /^\s*(sun|mon|tue|wed|thu|fri|sat)\s+(\d{1,2}):(\d{2})(?:\s+([+-])(\d{2}):(\d{2}))?\s*$/i.exec(anchor);
  if (!m) return null;
  const weekday = WEEKDAY_TO_DAY[m[1]!.toLowerCase()];
  const hour = Number(m[2]);
  const minute = Number(m[3]);
  if (weekday === undefined || !Number.isInteger(hour) || !Number.isInteger(minute)) return null;
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  if (m[4] !== undefined) {
    const offH = Number(m[5]);
    const offM = Number(m[6]);
    if (!Number.isInteger(offH) || !Number.isInteger(offM) || offH > 14 || offM > 59) return null;
    const sign = m[4] === '-' ? -1 : 1;
    return { weekday, hour, minute, offsetMinutes: sign * (offH * 60 + offM) };
  }
  return { weekday, hour, minute };
}

export function weeklyWindowFor(nowMs: number, anchor: string): UsageWindow | null {
  if (!isFinite(nowMs)) return null;
  const parsed = parseWeeklyResetAnchor(anchor);
  if (!parsed) return null;

  if (parsed.offsetMinutes !== undefined) {
    // ABSOLUTE-instant math (idea c8513be9): shift into the anchor's fixed offset, do the weekday
    // arithmetic with UTC getters, shift back. No local-Date call ⇒ the boundary cannot move with
    // the server's timezone — the property the legacy branch below demonstrably lacks.
    const offMs = parsed.offsetMinutes * 60_000;
    const shifted = new Date(nowMs + offMs);
    const boundaryShifted = Date.UTC(
      shifted.getUTCFullYear(),
      shifted.getUTCMonth(),
      shifted.getUTCDate() + (parsed.weekday - shifted.getUTCDay()),
      parsed.hour,
      parsed.minute,
      0,
      0,
    );
    let startedAtMs = boundaryShifted - offMs;
    if (startedAtMs > nowMs) startedAtMs -= 7 * 24 * 60 * 60_000;
    return { startedAtMs, resetsAtMs: startedAtMs + 7 * 24 * 60 * 60_000 };
  }
  const now = new Date(nowMs);
  const candidate = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
    parsed.hour,
    parsed.minute,
    0,
    0,
  );
  candidate.setDate(candidate.getDate() + (parsed.weekday - now.getDay()));
  if (candidate.getTime() > nowMs) candidate.setDate(candidate.getDate() - 7);
  const next = new Date(candidate.getTime());
  next.setDate(next.getDate() + 7);
  return { startedAtMs: candidate.getTime(), resetsAtMs: next.getTime() };
}

/**
 * A simple fixed-duration grid helper kept exported for pure date-math tests. `computeUsage` uses
 * transcript-established session blocks per the feature requirements because no account-specific
 * session anchor is stored today.
 */
export function fixedBlockWindowFor(nowMs: number, blockHours: number): UsageWindow | null {
  if (!isFinite(nowMs)) return null;
  const hours = positiveFiniteNumber(blockHours);
  if (hours === undefined) return null;
  const blockMs = hours * HOUR_MS;
  const startedAtMs = Math.floor(nowMs / blockMs) * blockMs;
  return { startedAtMs, resetsAtMs: startedAtMs + blockMs };
}

export function normalizeClaudeUsageModel(raw: unknown): ClaudeUsageModel | null {
  if (typeof raw !== 'string') return null;
  const s = raw.toLowerCase();
  if (s.includes('fable')) return 'fable';
  if (s.includes('opus')) return 'opus';
  if (s.includes('sonnet')) return 'sonnet';
  if (s.includes('haiku')) return 'haiku';
  return null;
}

export function normalizeClaudeUsageModelKey(raw: unknown): ClaudeUsageModel | null {
  if (typeof raw !== 'string') return null;
  const key = raw.trim().toLowerCase();
  return (CLAUDE_USAGE_MODELS as readonly string[]).includes(key) ? (key as ClaudeUsageModel) : null;
}

/** Recursive .jsonl collector under a subagents tree — bounded depth, lstat-guarded. */
function walkTranscriptTree(dir: string, depthLeft: number, out: Array<{ path: string; mtimeMs: number }>): void {
  if (depthLeft <= 0) return;
  let entries: string[];
  try {
    if (!lstatSync(dir).isDirectory()) return; // symlinked dir ⇒ not walked
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const e of entries) {
    const p = join(dir, e);
    if (e.endsWith('.jsonl')) {
      const m = regularFileMtime(p);
      if (m !== null) out.push({ path: p, mtimeMs: m });
    } else {
      walkTranscriptTree(p, depthLeft - 1, out);
    }
  }
}

/**
 * The `~/.claude/projects` root (the account-wide transcript store). Overridable via
 * `DZ_CLAUDE_PROJECTS_ROOT` — used by tests to point at a temp tree. Never throws.
 */
/**
 * The logged-in account identity, from `~/.claude.json` (oauthAccount email or uuid). Honest null
 * when unreadable/absent — and null==null is NOT an account change (machines that never expose it
 * keep the pre-FR-4 behavior). Never throws.
 */
export function readClaudeAccountId(): string | null {
  try {
    const raw = JSON.parse(readFileSync(join(homedir(), '.claude.json'), 'utf-8')) as {
      oauthAccount?: { emailAddress?: unknown; accountUuid?: unknown };
    };
    const email = raw.oauthAccount?.emailAddress;
    if (typeof email === 'string' && email !== '') return email;
    const uuid = raw.oauthAccount?.accountUuid;
    if (typeof uuid === 'string' && uuid !== '') return uuid;
    return null;
  } catch {
    return null;
  }
}

/** Closed set of not-established reasons (ADR-001). */
export type UsageNotEstablishedReason =
  | 'scan-empty'
  | 'window-miss:weekly'
  | 'routing-disabled'
  | 'calibration-stale:account-changed'
  | 'calibration-stale:account-unverifiable';

export function claudeProjectsRoot(): string {
  const override = process.env['DZ_CLAUDE_PROJECTS_ROOT'];
  if (typeof override === 'string' && override.length > 0) return override;
  return join(homedir(), '.claude', 'projects');
}

/**
 * Read `memory.usage.*` from `<projectRoot>/.dz/config.json`. NEVER throws —
 * absent/corrupt/partial config ⇒ `{}` or only valid fields.
 */
export function readUsageLimits(projectRoot: string): UsageLimits {
  try {
    const cfg = JSON.parse(readFileSync(join(projectRoot, '.dz', 'config.json'), 'utf-8')) as unknown;
    if (!isRecord(cfg)) return {};
    const memory = cfg['memory'];
    if (!isRecord(memory)) return {};
    const u = memory['usage'];
    if (!isRecord(u)) return {};

    const out: MutableUsageLimits = {};
    const sessionLimit = positiveFiniteNumber(u['sessionTokenLimit']);
    const weeklyLimit = positiveFiniteNumber(u['weeklyTokenLimit']);
    const sessionBlockHours = positiveFiniteNumber(u['sessionBlockHours']);
    if (sessionLimit !== undefined) out.sessionTokenLimit = sessionLimit;
    if (weeklyLimit !== undefined) out.weeklyTokenLimit = weeklyLimit;
    if (sessionBlockHours !== undefined) out.sessionBlockHours = sessionBlockHours;

    const anchor = u['weeklyResetAnchor'];
    if (typeof anchor === 'string') {
      const parsed = parseWeeklyResetAnchor(anchor);
      if (parsed) out.weeklyResetAnchor = canonicalWeeklyResetAnchor(parsed);
    }

    const byModel = u['weeklyTokenLimitByModel'];
    if (isRecord(byModel)) {
      const modelLimits: Partial<Record<ClaudeUsageModel, number>> = {};
      for (const [key, value] of Object.entries(byModel)) {
        const model = normalizeClaudeUsageModelKey(key);
        const limit = positiveFiniteNumber(value);
        if (model && limit !== undefined) modelLimits[model] = limit;
      }
      if (Object.keys(modelLimits).length > 0) out.weeklyTokenLimitByModel = modelLimits;
    }

    if (typeof u['calibratedAt'] === 'string') out.calibratedAt = u['calibratedAt'];
    if (typeof u['source'] === 'string') out.source = u['source'];
    // routingDisabled: the boolean is authoritative; the legacy free-text note counts as true so
    // the fleet's existing config disables TODAY, without an edit.
    if (u['routingDisabled'] === true || typeof u['_disabledReason'] === 'string') out.routingDisabled = true;
    if (typeof u['calibrationAccount'] === 'string' || u['calibrationAccount'] === null) {
      out.calibrationAccount = u['calibrationAccount'] as string | null;
    }
    return out;
  } catch {
    return {};
  }
}

/** One extracted transcript sample. */
interface Sample {
  readonly ts: number; // ms epoch
  readonly tokens: number;
  readonly key: string; // dedup key: message.id + ':' + requestId
  readonly model: ClaudeUsageModel | null;
}

/**
 * List every `*.jsonl` under `~/.claude/projects/<dir>/`, best-effort. Never throws — an
 * unreadable dir/file is skipped. Returns absolute paths + their `mtimeMs` (the prefilter lever).
 */
/** A hard bound: a pathological tree must degrade to a partial estimate, never to a hang or an OOM. */
const MAX_TRANSCRIPT_FILES = 20_000;

/** Only a REGULAR file is readable transcript data. lstat (not stat) so a symlink is never followed —
 *  a FIFO blocks readFileSync forever and a symlink to a huge file explodes memory. */
function regularFileMtime(p: string): number | null {
  try {
    const st = lstatSync(p);
    return st.isFile() ? st.mtimeMs : null;
  } catch {
    return null;
  }
}

function listTranscriptFiles(root: string): Array<{ path: string; mtimeMs: number }> {
  const out: Array<{ path: string; mtimeMs: number }> = [];
  let dirs: string[];
  try {
    if (!existsSync(root)) return out;
    dirs = readdirSync(root);
  } catch {
    return out;
  }
  for (const d of dirs) {
    const projDir = join(root, d);
    let files: string[];
    try {
      // lstat, not stat: a symlinked project directory would otherwise be walked (Codex #3).
      const st = lstatSync(projDir);
      if (!st.isDirectory()) continue;
      files = readdirSync(projDir);
    } catch {
      continue;
    }
    for (const f of files) {
      // A session's SUBAGENT transcripts live under `<session>/subagents/` and carry real,
      // non-duplicated usage that was silently excluded (MEASURED: 27 such files in the first
      // round). The walk is RECURSIVE with a depth cap: workflow agents write to
      // `subagents/workflows/wf_*/agent-*.jsonl` — one level deeper than the first fix reached —
      // and that blind spot alone hid 283.62M weighted tokens across 551 files (MEASURED
      // 2026-08-24, 7-day window, this machine). Depth 4 covers today's deepest layout plus one
      // future level; lstat at EVERY step keeps symlinked directories unwalked.
      if (!f.endsWith('.jsonl')) {
        walkTranscriptTree(join(projDir, f, 'subagents'), 4, out);
        continue;
      }
      const p = join(projDir, f);
      const mt = regularFileMtime(p);
      if (mt !== null) out.push({ path: p, mtimeMs: mt });
    }
  }
  // Cap by RECENCY, not by enumeration order: capping as we walked could discard the very files that
  // hold current usage while keeping ancient ones (Codex #1).
  if (out.length > MAX_TRANSCRIPT_FILES) {
    out.sort((a, b) => b.mtimeMs - a.mtimeMs);
    out.length = MAX_TRANSCRIPT_FILES;
  }
  return out;
}

/**
 * Extract usage samples from one transcript file. Never throws — a corrupt line is skipped.
 * `scanCutoff` drops samples older than every window that could affect the estimate.
 */
function extractSamples(path: string, scanCutoff: number, into: Sample[], seen: Set<string>): void {
  let raw: string;
  try {
    raw = readFileSync(path, 'utf-8');
  } catch {
    return;
  }
  const lines = raw.split('\n');
  for (const line of lines) {
    if (line.length === 0) continue;
    if (line.indexOf('usage') === -1) continue; // cheap pre-filter before the parse
    let rec: {
      timestamp?: unknown;
      requestId?: unknown;
      model?: unknown;
      message?: {
        id?: unknown;
        model?: unknown;
        usage?: {
          input_tokens?: unknown;
          cache_creation_input_tokens?: unknown;
          /** TTL breakdown: 5m writes price at 1.25x, 1h writes at 2x. A nested-only record used to
           *  count as ZERO because only the flat field was read. */
          cache_creation?: { ephemeral_5m_input_tokens?: unknown; ephemeral_1h_input_tokens?: unknown };
          cache_read_input_tokens?: unknown;
          output_tokens?: unknown;
        };
      };
    };
    try {
      rec = JSON.parse(line) as typeof rec;
    } catch {
      continue; // corrupt line — skip, never throw
    }
    const usage = rec.message?.usage;
    if (!usage || typeof usage !== 'object') continue;
    const tsRaw = rec.timestamp;
    if (typeof tsRaw !== 'string' && typeof tsRaw !== 'number') continue;
    const ts = typeof tsRaw === 'number' ? tsRaw : Date.parse(tsRaw);
    if (!isFinite(ts)) continue;
    if (ts < scanCutoff) continue;
    const n = (v: unknown): number => (typeof v === 'number' && isFinite(v) && v > 0 ? v : 0);
    // COST-WEIGHTED, not a flat sum. A flat sum is 89-99.7% `cache_read` (MEASURED on this machine),
    // which grows with CONVERSATION LENGTH rather than with work done — two sessions doing identical
    // work differ by orders of magnitude, so no threshold over it can mean anything. These weights are
    // the published per-token price ratios relative to base input, so the total is "input-equivalent
    // tokens": a quantity that tracks consumption instead of context size.
    // Prefer the TTL breakdown when present (5m 1.25x / 1h 2x); fall back to the flat field at the
    // 5m rate. Reading only the flat field scored a nested-only record as ZERO.
    // ONE estimator, shared with the per-stage cost ledger (feature `cost-ledger`, ADR-002).
    const tokens = weightedTokensOf(usage);
    if (tokens <= 0) continue;
    // Dedup: streamed assistant messages repeat their usage object across chunks.
    const id = typeof rec.message?.id === 'string' ? rec.message.id : '';
    const reqId = typeof rec.requestId === 'string' ? rec.requestId : '';
    // With no ids, fall back to a CONTENT key (timestamp + weighted total): the same record copied
    // into both a main and a subagent transcript would otherwise be counted twice.
    // Include the raw vector + model: `{input:50}` and `{output:10}` both weigh 50, so a
    // total-only key silently merged distinct records (Codex #4).
    const key =
      id !== '' || reqId !== ''
        ? id + ':' + reqId
        : `anon:${ts}:${n(usage.input_tokens)}:${n(usage.cache_creation_input_tokens)}:${n(usage.cache_read_input_tokens)}:${n(usage.output_tokens)}:${String(rec.message?.model ?? rec.model ?? '')}`;
    if (seen.has(key)) continue;
    seen.add(key);
    into.push({ ts, tokens, key, model: normalizeClaudeUsageModel(rec.message?.model ?? rec.model) });
  }
}

function activeSessionBlock(
  samplesAsc: Sample[],
  nowMs: number,
  blockHours: number,
): { tokens: number; startedAtMs: number | null; resetsAtMs: number | null } {
  const hours = positiveFiniteNumber(blockHours) ?? DEFAULT_SESSION_BLOCK_HOURS;
  const blockMs = hours * HOUR_MS;
  let blockStart = -1;
  let blockEnd = -1;
  let tokens = 0;
  let activeStart: number | null = null;
  let activeEnd: number | null = null;
  let activeTokens = 0;

  for (const s of samplesAsc) {
    if (s.ts > nowMs) continue;
    if (blockStart === -1 || s.ts >= blockEnd) {
      blockStart = s.ts;
      blockEnd = blockStart + blockMs;
      tokens = 0;
    }
    tokens += s.tokens;
    if (nowMs >= blockStart && nowMs < blockEnd) {
      activeStart = blockStart;
      activeEnd = blockEnd;
      activeTokens = tokens;
    }
  }

  return { tokens: activeTokens, startedAtMs: activeStart, resetsAtMs: activeEnd };
}

function pct(tokens: number, limit?: number): number | null {
  return typeof limit === 'number' && limit > 0 ? Math.round((100 * tokens) / limit) : null;
}

function configuredModelLimits(
  limits?: Partial<Record<ClaudeUsageModel, number>>,
): Array<[ClaudeUsageModel, number]> {
  if (!limits) return [];
  const out: Array<[ClaudeUsageModel, number]> = [];
  for (const model of CLAUDE_USAGE_MODELS) {
    const limit = limits[model];
    if (typeof limit === 'number' && isFinite(limit) && limit > 0) out.push([model, limit]);
  }
  return out;
}

/**
 * Estimate SESSION + WEEKLY token usage from the local Claude transcript store. NEVER throws;
 * READONLY; `projectRoot` scopes ONLY the config (limits) read — measurement is account-wide
 * (all projects). `now` is injectable for tests.
 */
export function computeUsage(projectRoot: string, now?: number): UsageEstimate {
  // never-throw contract: a non-finite or out-of-range clock reached `toISOString()` and raised
  // RangeError. Clamp to the valid Date range instead of crashing the statusline (Codex #5).
  const MAX_TIME = 8.64e15;
  if (now !== undefined && (!isFinite(now) || Math.abs(now) > MAX_TIME)) {
    now = Date.now();
  }
  const nowMs = typeof now === 'number' && isFinite(now) ? now : Date.now();
  const limits = readUsageLimits(projectRoot);
  const sessionBlockHours = limits.sessionBlockHours ?? DEFAULT_SESSION_BLOCK_HOURS;
  const weeklyAnchor = limits.weeklyResetAnchor ?? DEFAULT_WEEKLY_RESET_ANCHOR;
  const weeklyWindow = weeklyWindowFor(nowMs, weeklyAnchor);
  // For transcript-established blocks, one previous block may be needed to prove that an event just
  // before the current boundary belongs to the prior block rather than opening the active one.
  const sessionScanCutoff = nowMs - 2 * sessionBlockHours * HOUR_MS;
  const weeklyScanCutoff = weeklyWindow?.startedAtMs ?? nowMs;
  const scanCutoff = Math.min(sessionScanCutoff, weeklyScanCutoff) - MTIME_SLACK_MS;

  const samples: Sample[] = [];
  const seen = new Set<string>();
  let scanFileCount = 0;
  try {
    const files = listTranscriptFiles(claudeProjectsRoot());
    for (const f of files) {
      // mtime prefilter: a file last written before every relevant cutoff cannot contribute.
      if (f.mtimeMs < scanCutoff) continue;
      scanFileCount += 1;
      extractSamples(f.path, scanCutoff, samples, seen);
    }
  } catch {
    // total scan failure ⇒ fall through with empty samples (nulls), never throw
  }

  let weeklyTokens = 0;
  const weeklyTokensByModel: Partial<Record<ClaudeUsageModel, number>> = {};
  if (weeklyWindow) {
    for (const s of samples) {
      if (s.ts < weeklyWindow.startedAtMs || s.ts >= weeklyWindow.resetsAtMs || s.ts > nowMs) continue;
      weeklyTokens += s.tokens;
      if (s.model) weeklyTokensByModel[s.model] = (weeklyTokensByModel[s.model] ?? 0) + s.tokens;
    }
  }

  const asc = samples.slice().sort((a, b) => a.ts - b.ts);
  const block = activeSessionBlock(asc, nowMs, sessionBlockHours);

  const modelLimits = configuredModelLimits(limits.weeklyTokenLimitByModel);
  let weeklyByModel: Partial<Record<ClaudeUsageModel, UsageModelEstimate>> | undefined;
  let weeklyPct = pct(weeklyTokens, limits.weeklyTokenLimit);
  let weeklyBindingModel: ClaudeUsageModel | undefined;
  if (modelLimits.length > 0) {
    weeklyByModel = {};
    weeklyPct = null;
    for (const [model, limit] of modelLimits) {
      const tokens = weeklyTokensByModel[model] ?? 0;
      const modelPct = pct(tokens, limit);
      weeklyByModel[model] = { tokens, pct: modelPct };
      if (modelPct !== null && (weeklyPct === null || modelPct > weeklyPct)) {
        weeklyPct = modelPct;
        weeklyBindingModel = model;
      }
    }
  }

  // ── Establishment gate (ADR-001): a number may only flow to the routed pct fields when the
  // scan actually established it. Fail-closed in exactly four named ways; the raw estimates stay
  // visible to humans under estimatesNotForRouting when policy (not measurement) nulls them.
  const reasons: UsageNotEstablishedReason[] = [];
  const recentFiles = scanFileCount > 0;
  if (recentFiles && samples.length === 0) reasons.push('scan-empty');
  // An IDLE session inside a busy week (block 0, weekly > 0) is a MEASURED zero, not a miss — the
  // first cut of this gate flagged it and four standing tests rightly reddened. Second narrowing
  // (cross-family review): a week that JUST reset over an idle machine still scans pre-reset
  // samples (the session cutoff reaches 10h back), and weekly 0 is then a healthy fresh week. The
  // true miss signature needs a sample AT or PAST the window start that the window still refuses —
  // future-stamped (clock skew) or beyond-reset (stale anchor) — exactly d3639bf0's shape.
  if (
    weeklyWindow !== null &&
    weeklyTokens <= 0 &&
    samples.some((smp) => smp.ts >= weeklyWindow.startedAtMs)
  ) {
    reasons.push('window-miss:weekly');
  }
  if (limits.routingDisabled === true) reasons.push('routing-disabled');
  const account = readClaudeAccountId();
  if (limits.calibrationAccount !== undefined && limits.calibrationAccount !== null) {
    // A stored identity DEMANDS verification (cross-family review: null-current was fail-open —
    // an unreadable ~/.claude.json silently reused another account's calibration). A stored null
    // stays exempt: those machines never claimed an identity to verify.
    if (account === null) reasons.push('calibration-stale:account-unverifiable');
    else if (account !== limits.calibrationAccount) reasons.push('calibration-stale:account-changed');
  }
  const rawSessionPct = pct(block.tokens, limits.sessionTokenLimit);
  const rawWeeklyPct = weeklyPct;
  const measurementBroken = reasons.some((r) => r === 'scan-empty' || r.startsWith('window-miss'));
  const policyNulled = reasons.some((r) => r === 'routing-disabled' || r.startsWith('calibration-stale'));
  const gatedSessionPct = measurementBroken || policyNulled ? null : rawSessionPct;
  const gatedWeeklyPct = measurementBroken || policyNulled ? null : rawWeeklyPct;

  return {
    sessionTokens: block.tokens,
    weeklyTokens,
    sessionPct: gatedSessionPct,
    weeklyPct: gatedWeeklyPct,
    sessionResetsAt: block.resetsAtMs === null ? null : new Date(block.resetsAtMs).toISOString(),
    weeklyResetsAt: weeklyWindow === null ? null : new Date(weeklyWindow.resetsAtMs).toISOString(),
    estimated: true,
    ...(weeklyByModel !== undefined ? { weeklyByModel } : {}),
    weeklyTokensByModel,
    ...(weeklyBindingModel !== undefined ? { weeklyBindingModel } : {}),
    sessionStartedAt: block.startedAtMs === null ? null : new Date(block.startedAtMs).toISOString(),
    weeklyStartedAt: weeklyWindow === null ? null : new Date(weeklyWindow.startedAtMs).toISOString(),
    notEstablished: reasons,
    ...(policyNulled && !measurementBroken
      ? { estimatesNotForRouting: { sessionPct: rawSessionPct, weeklyPct: rawWeeklyPct } }
      : {}),
  };
}

function validPct(label: string, value: unknown, skipped: string[]): number | null {
  const n = typeof value === 'number' ? value : typeof value === 'string' && value.trim() !== '' ? Number(value) : NaN;
  if (!isFinite(n) || n <= 0 || n > 100) {
    skipped.push(`${label}: skipped invalid percentage ${String(value)}`);
    return null;
  }
  return n;
}

function applyCalibrationLimit(opts: {
  label: string;
  tokens: number;
  rawPct: unknown;
  before: number | undefined;
  set: (limit: number) => void;
  skipped: string[];
  changes: UsageCalibrationChange[];
}): void {
  const suppliedPct = validPct(opts.label, opts.rawPct, opts.skipped);
  if (suppliedPct === null) return;
  if (!isFinite(opts.tokens) || opts.tokens <= 0) {
    opts.skipped.push(`${opts.label}: skipped because current token count is 0`);
    return;
  }
  const limit = Math.round(opts.tokens / (suppliedPct / 100));
  if (!isFinite(limit) || limit <= 0) {
    opts.skipped.push(`${opts.label}: skipped because derived limit is invalid`);
    return;
  }
  opts.set(limit);
  opts.changes.push({
    key: opts.label,
    before: opts.before ?? null,
    after: limit,
    tokens: opts.tokens,
    pct: suppliedPct,
  });
}

export function deriveUsageCalibration(
  current: UsageEstimate,
  before: UsageLimits,
  input: UsageCalibrationInput,
): UsageCalibrationPlan {
  const after: MutableUsageLimits = {
    ...before,
    ...(before.weeklyTokenLimitByModel !== undefined
      ? { weeklyTokenLimitByModel: { ...before.weeklyTokenLimitByModel } }
      : {}),
  };
  const skipped: string[] = [];
  const changes: UsageCalibrationChange[] = [];

  if (hasOwn(input, 'sessionPct')) {
    applyCalibrationLimit({
      label: 'session',
      tokens: current.sessionTokens,
      rawPct: input.sessionPct,
      before: before.sessionTokenLimit,
      set: (limit) => {
        after.sessionTokenLimit = limit;
      },
      skipped,
      changes,
    });
  }

  if (hasOwn(input, 'weeklyPct')) {
    applyCalibrationLimit({
      label: 'weekly',
      tokens: current.weeklyTokens,
      rawPct: input.weeklyPct,
      before: before.weeklyTokenLimit,
      set: (limit) => {
        after.weeklyTokenLimit = limit;
      },
      skipped,
      changes,
    });
  }

  if (input.modelPct !== undefined) {
    for (const [key, rawPct] of Object.entries(input.modelPct)) {
      const model = normalizeClaudeUsageModelKey(key);
      if (!model) {
        skipped.push(`model ${key}: skipped unknown model`);
        continue;
      }
      applyCalibrationLimit({
        label: model,
        tokens: current.weeklyTokensByModel[model] ?? 0,
        rawPct,
        before: before.weeklyTokenLimitByModel?.[model],
        set: (limit) => {
          if (after.weeklyTokenLimitByModel === undefined) after.weeklyTokenLimitByModel = {};
          after.weeklyTokenLimitByModel[model] = limit;
        },
        skipped,
        changes,
      });
    }
  }

  if (changes.length > 0) {
    after.calibratedAt = input.calibratedAt;
    after.source = input.source;
    // FR-4: a calibration is a claim about ONE account's limits. Stamp whose — a later login under
    // a different identity then stales it by itself (the 2026-08-24 re-login is the reproducer:
    // the old anchor kept printing 55% on the new account).
    after.calibrationAccount = readClaudeAccountId();
  }

  return { before, after, changes, skipped };
}

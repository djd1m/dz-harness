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
import { existsSync, lstatSync, readFileSync, readdirSync, realpathSync, statSync } from 'node:fs';
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
export const TOKEN_WEIGHTS = { input: 1, cacheWrite: 1.25, cacheWrite1h: 2, cacheRead: 0.1, output: 5 };
function positiveFinite(v) {
    return typeof v === 'number' && isFinite(v) && v > 0 ? v : 0;
}
/**
 * The raw token buckets of an Anthropic `message.usage` object, clamped to finite non-negatives.
 * `cacheWrite` prefers the TTL breakdown (`cache_creation.ephemeral_*`) and falls back to the flat
 * `cache_creation_input_tokens` — reading only the flat field scored a nested-only record as ZERO.
 */
export function rawTokenMixOf(usage) {
    if (typeof usage !== 'object' || usage === null) {
        return { input: 0, cacheWrite: 0, cacheRead: 0, output: 0 };
    }
    const u = usage;
    const cc = (typeof u['cache_creation'] === 'object' && u['cache_creation'] !== null
        ? u['cache_creation']
        : {});
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
export function weightedTokensOf(usage) {
    if (typeof usage !== 'object' || usage === null)
        return 0;
    const mix = rawTokenMixOf(usage);
    const u = usage;
    const cc = typeof u['cache_creation'] === 'object' && u['cache_creation'] !== null
        ? u['cache_creation']
        : {};
    const c5 = positiveFinite(cc['ephemeral_5m_input_tokens']);
    const c1h = positiveFinite(cc['ephemeral_1h_input_tokens']);
    const cacheWriteCost = c5 + c1h > 0
        ? c5 * TOKEN_WEIGHTS.cacheWrite + c1h * TOKEN_WEIGHTS.cacheWrite1h
        : mix.cacheWrite * TOKEN_WEIGHTS.cacheWrite;
    return (mix.input * TOKEN_WEIGHTS.input +
        cacheWriteCost +
        mix.cacheRead * TOKEN_WEIGHTS.cacheRead +
        mix.output * TOKEN_WEIGHTS.output);
}
export const CLAUDE_USAGE_MODELS = ['fable', 'opus', 'sonnet', 'haiku'];
const DAY_MS = 24 * HOUR_MS;
function emptySpendTotal() {
    return { weightedTokens: 0, input: 0, output: 0, cacheRead: 0, cacheWrite: 0, events: 0 };
}
/** Aggregate already-parsed transcript events into UTC calendar days. Pure: no fs, env, or clock reads. */
export function spendReport(events, options) {
    if (!Number.isFinite(options.nowMs) || !Number.isInteger(options.days) || options.days <= 0) {
        return { days: [], total7d: emptySpendTotal(), byModel: {}, daysByModel: [] };
    }
    const now = new Date(options.nowMs);
    const todayStart = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
    const startMs = todayStart - (options.days - 1) * DAY_MS;
    const days = Array.from({ length: options.days }, (_, index) => ({
        date: new Date(startMs + index * DAY_MS).toISOString().slice(0, 10),
        ...emptySpendTotal(),
    }));
    const daysByDate = new Map(days.map((day) => [day.date, day]));
    const modelTotals = new Map();
    // Per-day model totals (FR-1) — same fallback-to-'unknown' rule as `modelTotals`, kept in a
    // separate Map-of-Maps so the two aggregates stay independently derivable from the SAME loop
    // (one pass over events, not two) and therefore can never drift apart by construction.
    const dayModelTotals = new Map(days.map((day) => [day.date, new Map()]));
    for (const event of events) {
        if (!Number.isFinite(event.ts) || event.ts < startMs || event.ts > options.nowMs)
            continue;
        const date = new Date(event.ts).toISOString().slice(0, 10);
        const day = daysByDate.get(date);
        if (!day)
            continue;
        day.weightedTokens += event.weightedTokens;
        day.input += event.raw.input;
        day.output += event.raw.output;
        day.cacheRead += event.raw.cacheRead;
        day.cacheWrite += event.raw.cacheWrite;
        day.events += 1;
        const model = event.model ?? 'unknown';
        modelTotals.set(model, (modelTotals.get(model) ?? 0) + event.weightedTokens);
        const dayModels = dayModelTotals.get(date);
        if (dayModels)
            dayModels.set(model, (dayModels.get(model) ?? 0) + event.weightedTokens);
    }
    const total7d = days.reduce((total, day) => ({
        weightedTokens: total.weightedTokens + day.weightedTokens,
        input: total.input + day.input,
        output: total.output + day.output,
        cacheRead: total.cacheRead + day.cacheRead,
        cacheWrite: total.cacheWrite + day.cacheWrite,
        events: total.events + day.events,
    }), emptySpendTotal());
    const byModel = {};
    for (const [model, weightedTokens] of [...modelTotals].sort(([a], [b]) => a.localeCompare(b))) {
        byModel[model] = {
            weightedTokens,
            sharePct: total7d.weightedTokens > 0
                ? Math.round((weightedTokens / total7d.weightedTokens) * 1000) / 10
                : 0,
        };
    }
    const daysByModel = days.map((day) => {
        const models = {};
        const totals = dayModelTotals.get(day.date);
        if (totals) {
            for (const [model, weightedTokens] of [...totals].sort(([a], [b]) => a.localeCompare(b))) {
                models[model] = weightedTokens;
            }
        }
        return { date: day.date, models };
    });
    return { days, total7d, byModel, daysByModel };
}
/**
 * Fix-round-1 (Codex review, LOW #4): a mismatch is judged on a tolerance that SCALES with the
 * magnitude being compared — `max(1e-6, 1e-9·max(|a|,|b|))`. A fixed absolute `1e-6` is too tight
 * for large sums, where float addition accumulates noise proportional to magnitude, and it is
 * blind to corruption: `Math.abs(NaN - x) > 1e-6` is `false`, so a NaN/Infinity sum used to read as
 * "invariant holds" instead of the loud failure a corrupted report deserves.
 */
function invariantTolerance(a, b) {
    return Math.max(1e-6, 1e-9 * Math.max(Math.abs(a), Math.abs(b)));
}
/** `true` when `a`/`b` cannot be meaningfully compared (either is `NaN` or `±Infinity`). */
function isNonFiniteMismatch(a, b) {
    return !Number.isFinite(a) || !Number.isFinite(b);
}
/**
 * FR-2 invariant checker: for every day, `Σ daysByModel[day].models === days[day].weightedTokens`;
 * and `Σ byModel[*].weightedTokens === total7d.weightedTokens`. Pure, no fs/clock. Returns a
 * human-readable violation per mismatch; an empty array means the invariant holds. The tolerance is
 * relative ({@link invariantTolerance}), and a `NaN`/`Infinity` on either side of a comparison is
 * ALWAYS a violation ({@link isNonFiniteMismatch}) — never a silent pass.
 */
export function spendInvariantViolations(report) {
    const violations = [];
    const modelsByDate = new Map(report.daysByModel.map((entry) => [entry.date, entry.models]));
    for (const day of report.days) {
        const models = modelsByDate.get(day.date) ?? {};
        const sum = Object.values(models).reduce((a, b) => a + b, 0);
        const nonFinite = isNonFiniteMismatch(sum, day.weightedTokens);
        if (nonFinite || Math.abs(sum - day.weightedTokens) > invariantTolerance(sum, day.weightedTokens)) {
            violations.push(`day ${day.date}: Σ daysByModel=${sum} !== days.weightedTokens=${day.weightedTokens}` +
                (nonFinite ? ' (non-finite sum — NaN/Infinity corrupts the invariant)' : ''));
        }
    }
    const byModelSum = Object.values(report.byModel).reduce((a, row) => a + row.weightedTokens, 0);
    const byModelNonFinite = isNonFiniteMismatch(byModelSum, report.total7d.weightedTokens);
    if (byModelNonFinite ||
        Math.abs(byModelSum - report.total7d.weightedTokens) > invariantTolerance(byModelSum, report.total7d.weightedTokens)) {
        violations.push(`Σ byModel=${byModelSum} !== total7d.weightedTokens=${report.total7d.weightedTokens}` +
            (byModelNonFinite ? ' (non-finite sum — NaN/Infinity corrupts the invariant)' : ''));
    }
    return violations;
}
const WEEKDAY_TO_DAY = {
    sun: 0,
    mon: 1,
    tue: 2,
    wed: 3,
    thu: 4,
    fri: 5,
    sat: 6,
};
const DAY_TO_WEEKDAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
function isRecord(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function positiveFiniteNumber(value) {
    return typeof value === 'number' && isFinite(value) && value > 0 ? value : undefined;
}
function hasOwn(obj, key) {
    return Object.prototype.hasOwnProperty.call(obj, key);
}
function canonicalWeeklyResetAnchor(anchor) {
    const base = `${DAY_TO_WEEKDAY[anchor.weekday] ?? 'Wed'} ${String(anchor.hour).padStart(2, '0')}:${String(anchor.minute).padStart(2, '0')}`;
    // The offset MUST survive canonicalization: this function silently dropped it on first
    // implementation, degrading a pinned absolute instant back to the server-tz form the offset
    // exists to escape (idea c8513be9 — caught live: the pin landed, the warning kept firing).
    if (anchor.offsetMinutes === undefined)
        return base;
    const sign = anchor.offsetMinutes < 0 ? '-' : '+';
    const abs = Math.abs(anchor.offsetMinutes);
    return `${base} ${sign}${String(Math.floor(abs / 60)).padStart(2, '0')}:${String(abs % 60).padStart(2, '0')}`;
}
export function parseWeeklyResetAnchor(anchor) {
    const m = /^\s*(sun|mon|tue|wed|thu|fri|sat)\s+(\d{1,2}):(\d{2})(?:\s+([+-])(\d{2}):(\d{2}))?\s*$/i.exec(anchor);
    if (!m)
        return null;
    const weekday = WEEKDAY_TO_DAY[m[1].toLowerCase()];
    const hour = Number(m[2]);
    const minute = Number(m[3]);
    if (weekday === undefined || !Number.isInteger(hour) || !Number.isInteger(minute))
        return null;
    if (hour < 0 || hour > 23 || minute < 0 || minute > 59)
        return null;
    if (m[4] !== undefined) {
        const offH = Number(m[5]);
        const offM = Number(m[6]);
        if (!Number.isInteger(offH) || !Number.isInteger(offM) || offH > 14 || offM > 59)
            return null;
        const sign = m[4] === '-' ? -1 : 1;
        return { weekday, hour, minute, offsetMinutes: sign * (offH * 60 + offM) };
    }
    return { weekday, hour, minute };
}
export function weeklyWindowFor(nowMs, anchor) {
    if (!isFinite(nowMs))
        return null;
    const parsed = parseWeeklyResetAnchor(anchor);
    if (!parsed)
        return null;
    if (parsed.offsetMinutes !== undefined) {
        // ABSOLUTE-instant math (idea c8513be9): shift into the anchor's fixed offset, do the weekday
        // arithmetic with UTC getters, shift back. No local-Date call ⇒ the boundary cannot move with
        // the server's timezone — the property the legacy branch below demonstrably lacks.
        const offMs = parsed.offsetMinutes * 60_000;
        const shifted = new Date(nowMs + offMs);
        const boundaryShifted = Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate() + (parsed.weekday - shifted.getUTCDay()), parsed.hour, parsed.minute, 0, 0);
        let startedAtMs = boundaryShifted - offMs;
        if (startedAtMs > nowMs)
            startedAtMs -= 7 * 24 * 60 * 60_000;
        return { startedAtMs, resetsAtMs: startedAtMs + 7 * 24 * 60 * 60_000 };
    }
    const now = new Date(nowMs);
    const candidate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), parsed.hour, parsed.minute, 0, 0);
    candidate.setDate(candidate.getDate() + (parsed.weekday - now.getDay()));
    if (candidate.getTime() > nowMs)
        candidate.setDate(candidate.getDate() - 7);
    const next = new Date(candidate.getTime());
    next.setDate(next.getDate() + 7);
    return { startedAtMs: candidate.getTime(), resetsAtMs: next.getTime() };
}
/**
 * A simple fixed-duration grid helper kept exported for pure date-math tests. `computeUsage` uses
 * transcript-established session blocks per the feature requirements because no account-specific
 * session anchor is stored today.
 */
export function fixedBlockWindowFor(nowMs, blockHours) {
    if (!isFinite(nowMs))
        return null;
    const hours = positiveFiniteNumber(blockHours);
    if (hours === undefined)
        return null;
    const blockMs = hours * HOUR_MS;
    const startedAtMs = Math.floor(nowMs / blockMs) * blockMs;
    return { startedAtMs, resetsAtMs: startedAtMs + blockMs };
}
export function normalizeClaudeUsageModel(raw) {
    if (typeof raw !== 'string')
        return null;
    const s = raw.toLowerCase();
    if (s.includes('fable'))
        return 'fable';
    if (s.includes('opus'))
        return 'opus';
    if (s.includes('sonnet'))
        return 'sonnet';
    if (s.includes('haiku'))
        return 'haiku';
    return null;
}
export function normalizeClaudeUsageModelKey(raw) {
    if (typeof raw !== 'string')
        return null;
    const key = raw.trim().toLowerCase();
    return CLAUDE_USAGE_MODELS.includes(key) ? key : null;
}
/** Resolve one directory without revisiting a real path. Broken links and non-directories are skipped. */
function resolveDirectoryOnce(dir, visited) {
    try {
        const entry = lstatSync(dir);
        if (!entry.isDirectory() && !entry.isSymbolicLink())
            return null;
        const realDir = realpathSync(dir);
        if (entry.isSymbolicLink() && !statSync(realDir).isDirectory())
            return null;
        if (visited.has(realDir))
            return null;
        visited.add(realDir);
        return realDir;
    }
    catch {
        return null;
    }
}
/** Recursive .jsonl collector under a subagents tree — bounded depth and real-path deduplicated. */
function walkTranscriptTree(dir, depthLeft, out, visited) {
    if (depthLeft <= 0)
        return;
    const realDir = resolveDirectoryOnce(dir, visited);
    if (realDir === null)
        return;
    let entries;
    try {
        entries = readdirSync(realDir);
    }
    catch {
        return;
    }
    for (const e of entries) {
        const p = join(realDir, e);
        if (e.endsWith('.jsonl')) {
            const m = regularFileMtime(p);
            if (m !== null)
                out.push({ path: p, mtimeMs: m });
        }
        else {
            walkTranscriptTree(p, depthLeft - 1, out, visited);
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
export function readClaudeAccountId() {
    try {
        const raw = JSON.parse(readFileSync(join(homedir(), '.claude.json'), 'utf-8'));
        const email = raw.oauthAccount?.emailAddress;
        if (typeof email === 'string' && email !== '')
            return email;
        const uuid = raw.oauthAccount?.accountUuid;
        if (typeof uuid === 'string' && uuid !== '')
            return uuid;
        return null;
    }
    catch {
        return null;
    }
}
export function claudeProjectsRoot() {
    const override = process.env['DZ_CLAUDE_PROJECTS_ROOT'];
    if (typeof override === 'string' && override.length > 0)
        return override;
    return join(homedir(), '.claude', 'projects');
}
/**
 * Read `memory.usage.*` from `<projectRoot>/.dz/config.json`. NEVER throws —
 * absent/corrupt/partial config ⇒ `{}` or only valid fields.
 */
export function readUsageLimits(projectRoot) {
    try {
        const cfg = JSON.parse(readFileSync(join(projectRoot, '.dz', 'config.json'), 'utf-8'));
        if (!isRecord(cfg))
            return {};
        const memory = cfg['memory'];
        if (!isRecord(memory))
            return {};
        const u = memory['usage'];
        if (!isRecord(u))
            return {};
        const out = {};
        const sessionLimit = positiveFiniteNumber(u['sessionTokenLimit']);
        const weeklyLimit = positiveFiniteNumber(u['weeklyTokenLimit']);
        const sessionBlockHours = positiveFiniteNumber(u['sessionBlockHours']);
        if (sessionLimit !== undefined)
            out.sessionTokenLimit = sessionLimit;
        if (weeklyLimit !== undefined)
            out.weeklyTokenLimit = weeklyLimit;
        if (sessionBlockHours !== undefined)
            out.sessionBlockHours = sessionBlockHours;
        const anchor = u['weeklyResetAnchor'];
        if (typeof anchor === 'string') {
            const parsed = parseWeeklyResetAnchor(anchor);
            if (parsed)
                out.weeklyResetAnchor = canonicalWeeklyResetAnchor(parsed);
        }
        const byModel = u['weeklyTokenLimitByModel'];
        if (isRecord(byModel)) {
            const modelLimits = {};
            for (const [key, value] of Object.entries(byModel)) {
                const model = normalizeClaudeUsageModelKey(key);
                const limit = positiveFiniteNumber(value);
                if (model && limit !== undefined)
                    modelLimits[model] = limit;
            }
            if (Object.keys(modelLimits).length > 0)
                out.weeklyTokenLimitByModel = modelLimits;
        }
        if (typeof u['calibratedAt'] === 'string')
            out.calibratedAt = u['calibratedAt'];
        if (typeof u['source'] === 'string')
            out.source = u['source'];
        // routingDisabled: the boolean is authoritative; the legacy free-text note counts as true so
        // the fleet's existing config disables TODAY, without an edit.
        if (u['routingDisabled'] === true || typeof u['_disabledReason'] === 'string')
            out.routingDisabled = true;
        if (typeof u['calibrationAccount'] === 'string' || u['calibrationAccount'] === null) {
            out.calibrationAccount = u['calibrationAccount'];
        }
        return out;
    }
    catch {
        return {};
    }
}
/**
 * List every `*.jsonl` under `~/.claude/projects/<dir>/`, best-effort. Never throws — an
 * unreadable dir/file is skipped. Returns absolute paths + their `mtimeMs` (the prefilter lever).
 */
/** A hard bound: a pathological tree must degrade to a partial estimate, never to a hang or an OOM. */
const MAX_TRANSCRIPT_FILES = 20_000;
/** Only a REGULAR file is readable transcript data. lstat (not stat) so a symlink is never followed —
 *  a FIFO blocks readFileSync forever and a symlink to a huge file explodes memory. */
function regularFileMtime(p) {
    try {
        const st = lstatSync(p);
        return st.isFile() ? st.mtimeMs : null;
    }
    catch {
        return null;
    }
}
function listTranscriptFiles(root) {
    const out = [];
    const visitedDirectories = new Set();
    let dirs;
    try {
        if (!existsSync(root))
            return out;
        dirs = readdirSync(root);
    }
    catch {
        return out;
    }
    for (const d of dirs) {
        const projDir = join(root, d);
        const realProjDir = resolveDirectoryOnce(projDir, visitedDirectories);
        if (realProjDir === null)
            continue;
        let files;
        try {
            files = readdirSync(realProjDir);
        }
        catch {
            continue;
        }
        for (const f of files) {
            // A session's SUBAGENT transcripts live under `<session>/subagents/` and carry real,
            // non-duplicated usage that was silently excluded (MEASURED: 27 such files in the first
            // round). The walk is RECURSIVE with a depth cap: workflow agents write to
            // `subagents/workflows/wf_*/agent-*.jsonl` — one level deeper than the first fix reached —
            // and that blind spot alone hid 283.62M weighted tokens across 551 files (MEASURED
            // 2026-08-24, 7-day window, this machine). Depth 4 covers today's deepest layout plus one
            // future level; each real directory is visited once, so symlink aliases and loops stay bounded.
            if (!f.endsWith('.jsonl')) {
                walkTranscriptTree(join(realProjDir, f, 'subagents'), 4, out, visitedDirectories);
                continue;
            }
            const p = join(realProjDir, f);
            const mt = regularFileMtime(p);
            if (mt !== null)
                out.push({ path: p, mtimeMs: mt });
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
function extractSamples(path, scanCutoff, into, seen) {
    let raw;
    try {
        raw = readFileSync(path, 'utf-8');
    }
    catch {
        return;
    }
    const lines = raw.split('\n');
    for (const line of lines) {
        if (line.length === 0)
            continue;
        if (line.indexOf('usage') === -1)
            continue; // cheap pre-filter before the parse
        let rec;
        try {
            rec = JSON.parse(line);
        }
        catch {
            continue; // corrupt line — skip, never throw
        }
        const usage = rec.message?.usage;
        if (!usage || typeof usage !== 'object')
            continue;
        const tsRaw = rec.timestamp;
        if (typeof tsRaw !== 'string' && typeof tsRaw !== 'number')
            continue;
        const ts = typeof tsRaw === 'number' ? tsRaw : Date.parse(tsRaw);
        if (!isFinite(ts))
            continue;
        if (ts < scanCutoff)
            continue;
        const n = (v) => (typeof v === 'number' && isFinite(v) && v > 0 ? v : 0);
        // COST-WEIGHTED, not a flat sum. A flat sum is 89-99.7% `cache_read` (MEASURED on this machine),
        // which grows with CONVERSATION LENGTH rather than with work done — two sessions doing identical
        // work differ by orders of magnitude, so no threshold over it can mean anything. These weights are
        // the published per-token price ratios relative to base input, so the total is "input-equivalent
        // tokens": a quantity that tracks consumption instead of context size.
        // Prefer the TTL breakdown when present (5m 1.25x / 1h 2x); fall back to the flat field at the
        // 5m rate. Reading only the flat field scored a nested-only record as ZERO.
        // ONE estimator, shared with the per-stage cost ledger (feature `cost-ledger`, ADR-002).
        const raw = rawTokenMixOf(usage);
        const tokens = weightedTokensOf(usage);
        if (tokens <= 0)
            continue;
        // Dedup: streamed assistant messages repeat their usage object across chunks.
        const id = typeof rec.message?.id === 'string' ? rec.message.id : '';
        const reqId = typeof rec.requestId === 'string' ? rec.requestId : '';
        // With no ids, fall back to a CONTENT key (timestamp + weighted total): the same record copied
        // into both a main and a subagent transcript would otherwise be counted twice.
        // Include the raw vector + model: `{input:50}` and `{output:10}` both weigh 50, so a
        // total-only key silently merged distinct records (Codex #4).
        const key = id !== '' || reqId !== ''
            ? id + ':' + reqId
            : `anon:${ts}:${n(usage.input_tokens)}:${n(usage.cache_creation_input_tokens)}:${n(usage.cache_read_input_tokens)}:${n(usage.output_tokens)}:${String(rec.message?.model ?? rec.model ?? '')}`;
        if (seen.has(key))
            continue;
        seen.add(key);
        into.push({ ts, tokens, key, model: normalizeClaudeUsageModel(rec.message?.model ?? rec.model), raw });
    }
}
function scanSamples(scanCutoff) {
    const samples = [];
    const seen = new Set();
    let scanFileCount = 0;
    try {
        const files = listTranscriptFiles(claudeProjectsRoot());
        for (const file of files) {
            if (file.mtimeMs < scanCutoff)
                continue;
            scanFileCount += 1;
            extractSamples(file.path, scanCutoff, samples, seen);
        }
    }
    catch {
        // Best-effort transcript reads collapse to an empty report.
    }
    return { samples, scanFileCount };
}
/** Read local transcript events once, then delegate all aggregation to the pure spendReport. */
export function computeSpendReport(now, days = 7) {
    const MAX_TIME = 8.64e15;
    const nowMs = now === undefined || !Number.isFinite(now) || Math.abs(now) > MAX_TIME ? Date.now() : now;
    const today = new Date(nowMs);
    const todayStart = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
    const validDays = Number.isInteger(days) && days > 0 ? days : 7;
    const scanCutoff = todayStart - (validDays - 1) * DAY_MS - MTIME_SLACK_MS;
    const { samples } = scanSamples(scanCutoff);
    return spendReport(samples.map((sample) => ({
        ts: sample.ts,
        model: sample.model,
        raw: sample.raw,
        weightedTokens: sample.tokens,
    })), { nowMs, days: validDays });
}
function activeSessionBlock(samplesAsc, nowMs, blockHours) {
    const hours = positiveFiniteNumber(blockHours) ?? DEFAULT_SESSION_BLOCK_HOURS;
    const blockMs = hours * HOUR_MS;
    let blockStart = -1;
    let blockEnd = -1;
    let tokens = 0;
    let activeStart = null;
    let activeEnd = null;
    let activeTokens = 0;
    for (const s of samplesAsc) {
        if (s.ts > nowMs)
            continue;
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
function pct(tokens, limit) {
    return typeof limit === 'number' && limit > 0 ? Math.round((100 * tokens) / limit) : null;
}
function configuredModelLimits(limits) {
    if (!limits)
        return [];
    const out = [];
    for (const model of CLAUDE_USAGE_MODELS) {
        const limit = limits[model];
        if (typeof limit === 'number' && isFinite(limit) && limit > 0)
            out.push([model, limit]);
    }
    return out;
}
/**
 * Estimate SESSION + WEEKLY token usage from the local Claude transcript store. NEVER throws;
 * READONLY; `projectRoot` scopes ONLY the config (limits) read — measurement is account-wide
 * (all projects). `now` is injectable for tests.
 */
export function computeUsage(projectRoot, now) {
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
    const { samples, scanFileCount } = scanSamples(scanCutoff);
    let weeklyTokens = 0;
    const weeklyTokensByModel = {};
    if (weeklyWindow) {
        for (const s of samples) {
            if (s.ts < weeklyWindow.startedAtMs || s.ts >= weeklyWindow.resetsAtMs || s.ts > nowMs)
                continue;
            weeklyTokens += s.tokens;
            if (s.model)
                weeklyTokensByModel[s.model] = (weeklyTokensByModel[s.model] ?? 0) + s.tokens;
        }
    }
    const asc = samples.slice().sort((a, b) => a.ts - b.ts);
    const block = activeSessionBlock(asc, nowMs, sessionBlockHours);
    const modelLimits = configuredModelLimits(limits.weeklyTokenLimitByModel);
    let weeklyByModel;
    let weeklyPct = pct(weeklyTokens, limits.weeklyTokenLimit);
    let weeklyBindingModel;
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
    const reasons = [];
    const recentFiles = scanFileCount > 0;
    if (recentFiles && samples.length === 0)
        reasons.push('scan-empty');
    // An IDLE session inside a busy week (block 0, weekly > 0) is a MEASURED zero, not a miss — the
    // first cut of this gate flagged it and four standing tests rightly reddened. Second narrowing
    // (cross-family review): a week that JUST reset over an idle machine still scans pre-reset
    // samples (the session cutoff reaches 10h back), and weekly 0 is then a healthy fresh week. The
    // true miss signature needs a sample AT or PAST the window start that the window still refuses —
    // future-stamped (clock skew) or beyond-reset (stale anchor) — exactly d3639bf0's shape.
    if (weeklyWindow !== null &&
        weeklyTokens <= 0 &&
        samples.some((smp) => smp.ts >= weeklyWindow.startedAtMs)) {
        reasons.push('window-miss:weekly');
    }
    if (limits.routingDisabled === true)
        reasons.push('routing-disabled');
    const account = readClaudeAccountId();
    if (limits.calibrationAccount !== undefined && limits.calibrationAccount !== null) {
        // A stored identity DEMANDS verification (cross-family review: null-current was fail-open —
        // an unreadable ~/.claude.json silently reused another account's calibration). A stored null
        // stays exempt: those machines never claimed an identity to verify.
        if (account === null)
            reasons.push('calibration-stale:account-unverifiable');
        else if (account !== limits.calibrationAccount)
            reasons.push('calibration-stale:account-changed');
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
function validPct(label, value, skipped) {
    const n = typeof value === 'number' ? value : typeof value === 'string' && value.trim() !== '' ? Number(value) : NaN;
    if (!isFinite(n) || n <= 0 || n > 100) {
        skipped.push(`${label}: skipped invalid percentage ${String(value)}`);
        return null;
    }
    return n;
}
function applyCalibrationLimit(opts) {
    const suppliedPct = validPct(opts.label, opts.rawPct, opts.skipped);
    if (suppliedPct === null)
        return;
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
export function deriveUsageCalibration(current, before, input) {
    const after = {
        ...before,
        ...(before.weeklyTokenLimitByModel !== undefined
            ? { weeklyTokenLimitByModel: { ...before.weeklyTokenLimitByModel } }
            : {}),
    };
    const skipped = [];
    const changes = [];
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
                    if (after.weeklyTokenLimitByModel === undefined)
                        after.weeklyTokenLimitByModel = {};
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
//# sourceMappingURL=usage.js.map
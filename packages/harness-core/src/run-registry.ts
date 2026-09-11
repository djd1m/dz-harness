import { join } from 'node:path';

export const RUN_REGISTRY_BLOB_VERSION = '1.0.0';

export type RunEvent = {
  event: 'started' | 'heartbeat' | 'finished'; runId: string; ts: string;
  kind?: string; slug?: string; pid?: number; parentRunId?: string;
  outcome?: string; reason?: string; truncated?: boolean;
};
export type RegisteredRun = RunEvent & { heartbeat?: string; finished?: string };
export type RunLiveness = { state: 'live' | 'orphaned' | 'inconclusive' | 'stalled'; reason: string };
export type RunRegistry = { status: 'readable' | 'missing' | 'inconclusive'; reason?: string; runs: RegisteredRun[]; events?: RunEvent[] };
export type RunRegistryIO = {
  append(path: string, line: string): void;
  read(path: string): string;
  mkdir(dir: string): void;
};
export type PidProbe = (pid: number) => boolean | null;

export function probePid(pid: number, kill: (pid: number, signal: 0) => unknown = process.kill): boolean | null {
  if (!Number.isSafeInteger(pid) || pid <= 0) return null;
  try { kill(pid, 0); return true; }
  catch (error) { return (error as NodeJS.ErrnoException).code === 'ESRCH' ? false : null; }
}

export function validateRunEvent(raw: unknown): asserts raw is RunEvent {
  if (!raw || typeof raw !== 'object') throw new Error('invalid run event');
  const e = raw as RunEvent;
  const text = (s: unknown) => typeof s === 'string' && s.trim().length > 0;
  if (!['started', 'heartbeat', 'finished'].includes(e.event) || !text(e.runId) ||
      !text(e.ts) || !Number.isFinite(Date.parse(e.ts))) throw new Error('invalid run event identity/time');
  if (e.event === 'started' && (!text(e.kind) || !text(e.slug) || !Number.isSafeInteger(e.pid) || e.pid! <= 0))
    throw new Error('started requires kind, slug and positive PID');
  if (e.event === 'finished' && !text(e.outcome)) throw new Error('finished requires outcome');
  if (e.parentRunId !== undefined && (!text(e.parentRunId) || e.parentRunId === e.runId)) throw new Error('invalid parentRunId');
  if (e.reason !== undefined && typeof e.reason !== 'string') throw new Error('invalid reason');
}

export function appendRunEvent(root: string, ev: RunEvent, io: RunRegistryIO): void {
  validateRunEvent(ev);
  const bounded = { ...ev };
  let line = JSON.stringify(bounded) + '\n';
  if (Buffer.byteLength(line) >= 4096) {
    bounded.truncated = true;
    // Preserve identity and lifecycle fields. Only diagnostic text may be shortened.
    const chars = Array.from(bounded.reason ?? '');
    let lo = 0, hi = chars.length;
    bounded.reason = '';
    if (Buffer.byteLength(JSON.stringify(bounded) + '\n') >= 4096) throw new Error('run event identity exceeds PIPE_BUF');
    while (lo < hi) {
      const mid = Math.ceil((lo + hi) / 2);
      bounded.reason = chars.slice(0, mid).join('');
      if (Buffer.byteLength(JSON.stringify(bounded) + '\n') < 4096) lo = mid; else hi = mid - 1;
    }
    bounded.reason = chars.slice(0, lo).join('');
    line = JSON.stringify(bounded) + '\n';
  }
  io.mkdir(join(root, '.dz', 'runs'));
  io.append(join(root, '.dz', 'runs', 'registry.jsonl'), line);
}

export function readRunRegistry(root: string, io: RunRegistryIO): RunRegistry {
  const runs = new Map<string, RegisteredRun>();
  const events: RunEvent[] = [];
  try {
    const text = io.read(join(root, '.dz', 'runs', 'registry.jsonl'));
    for (const line of text.split('\n')) {
      if (!line.trim()) continue;
      const ev: unknown = JSON.parse(line);
      validateRunEvent(ev);
      events.push(ev);
      const run = runs.get(ev.runId);
      if (ev.event === 'started') {
        if (run) throw new Error('duplicate started: ' + ev.runId);
        runs.set(ev.runId, { ...ev });
      } else {
        if (!run) throw new Error('event without started: ' + ev.runId);
        if (ev.event === 'heartbeat') run.heartbeat = ev.ts;
        else Object.assign(run, { finished: ev.ts, ...(ev.outcome === undefined ? {} : { outcome: ev.outcome }) });
      }
    }
    return { status: 'readable', runs: [...runs.values()], events };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { status: 'missing', runs: [] };
    return { status: 'inconclusive', reason: 'registry-unreadable: ' + String(error), runs: [...runs.values()] };
  }
}

export function liveness(run: RegisteredRun | undefined, now: number, probe: PidProbe = probePid, opts: { stallMs?: number } = {}): RunLiveness {
  if (!run || run.event !== 'started') return { state: 'inconclusive', reason: 'missing-started' };
  if (run.finished) return { state: 'orphaned', reason: 'recorded-finished' };
  let alive: boolean | null = null;
  try { alive = run.pid === undefined ? null : probe(run.pid); } catch { /* inaccessible */ }
  if (alive === null) return { state: 'inconclusive', reason: 'pid-unavailable' };
  const stallMs = opts.stallMs ?? 120 * 60_000;
  if (alive && run.heartbeat && now - Date.parse(run.heartbeat) > stallMs) {
    return { state: 'stalled', reason: `heartbeat ${(now - Date.parse(run.heartbeat)) / 60_000}m > ${stallMs / 60_000}m, pid alive` };
  }
  return alive ? { state: 'live', reason: 'pid-alive' } : { state: 'orphaned', reason: 'pid-absent' };
}

export function liveParents(registry: RunRegistry, now: number, probe: PidProbe = probePid, opts: { stallMs?: number } = {}):
  Array<{ runId: string; parentRunId?: string; liveness: RunLiveness }> {
  const byId = new Map(registry.runs.map(run => [run.runId, run]));
  return registry.runs.map(run => {
    let decision: RunLiveness;
    if (registry.status !== 'readable') decision = { state: 'inconclusive', reason: registry.reason ?? 'registry-unreadable' };
    else if (run.parentRunId) {
      const parent = byId.get(run.parentRunId);
      decision = parent?.finished ? { state: 'orphaned', reason: 'parent-finished' } : liveness(parent, now, probe, opts);
    } else decision = liveness(run, now, probe, opts);
    return { runId: run.runId, ...(run.parentRunId === undefined ? {} : { parentRunId: run.parentRunId }), liveness: decision };
  });
}

/** Pure shell command assembly; projected into the Workflow sandbox by the blob generator. */
export function runRecordCommand(dz: string, root: string, event: string, runId: string,
  slug: string, pid: number | null, parentRunId: string | null, outcome: string): string {
  const quote = (s: string) => "'" + s.replace(/'/g, "'\\''") + "'";
  let cmd = dz + ' runs-record --project ' + quote(root) + ' --event ' + quote(event) + (runId ? ' --run-id ' + quote(runId) : '');
  if (event === 'started') {
    cmd += ' --kind feature-adr --slug ' + quote(slug);
    // Only an explicitly supplied host PID is authoritative. Never record the short-lived shell PID.
    cmd += ' --pid ' + quote(pid === null ? 'host' : String(pid));
    if (parentRunId) cmd += ' --parent-run-id ' + quote(parentRunId);
  }
  if (event === 'finished') cmd += ' --outcome ' + quote(outcome);
  return cmd + ' --json';
}

/** Confirmed absence alone permits a terminal event; callers append the returned events. */
export function settleDeadRuns(registry: RunRegistry, now: number, probe: PidProbe = probePid): RunEvent[] {
  if (registry.status !== 'readable') return [];
  const ts = new Date(now).toISOString();
  return registry.runs.filter(run => !run.finished && liveness(run, now, probe).state === 'orphaned')
    .map(run => ({ event: 'finished', runId: run.runId, ts, outcome: 'died',
      reason: `pid ${run.pid} absent, confirmed ${ts}` }));
}

/** Keep whole histories, using the newest event's timestamp rather than the start time. */
export function planRegistryArchive(registry: RunRegistry,
  opts: { now: number; retentionMs: number; probe: PidProbe }): { archive: RunEvent[]; keep: RunEvent[] } {
  const events = registry.events ?? [];
  if (registry.status !== 'readable') return { archive: [], keep: [...events] };
  const last = new Map<string, number>();
  for (const ev of events) last.set(ev.runId, Math.max(last.get(ev.runId) ?? -Infinity, Date.parse(ev.ts)));
  const eligible = new Set(registry.runs.filter(run => {
    const ts = last.get(run.runId);
    return ts !== undefined && opts.now - ts > opts.retentionMs &&
      (run.finished || liveness(run, opts.now, opts.probe).state === 'orphaned');
  }).map(run => run.runId));
  return { archive: events.filter(ev => eligible.has(ev.runId)), keep: events.filter(ev => !eligible.has(ev.runId)) };
}

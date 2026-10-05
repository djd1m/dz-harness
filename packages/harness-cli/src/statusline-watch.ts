/** Opt-in companion terminal. No stdin, writer commands, ETA corpus or global brain registry. */
import { existsSync, lstatSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  aggregateRecallUsage, checkStoreHealth, countLearningStoreRowsReadonly, parseRecallUsageLog,
  readFeatureAdrObservation, readStoreMark, renderFeatureAdrPhaseLine, storeGuardPath,
  type FeatureAdrObservation, type FeatureAdrSelector, type LearningStoreRowCounts,
} from '@dzhechkov/harness-core';

interface FrameData {
  readonly observation: FeatureAdrObservation;
  readonly learning: readonly string[];
  readonly branch?: string;
}

export interface StatuslineWatchOptions {
  readonly projectRoot: string;
  readonly brainRoot: string;
  readonly selector?: FeatureAdrSelector;
  readonly intervalSeconds?: number;
}

/** All lifecycle resources have test seams; production never touches stdin. */
export interface StatuslineWatchIo {
  readonly isTTY?: boolean;
  readonly dimensions?: () => { readonly columns?: number; readonly rows?: number };
  readonly write?: (text: string) => void;
  readonly writeErr?: (text: string) => void;
  readonly now?: () => number;
  readonly schedule?: (callback: () => void, delayMs: number) => unknown;
  readonly cancel?: (timer: unknown) => void;
  readonly subscribe?: (event: 'SIGINT' | 'SIGTERM' | 'resize' | 'error', callback: (error?: unknown) => void) => () => void;
  readonly readCounts?: (root: string) => LearningStoreRowCounts;
  readonly branch?: () => string | undefined;
  readonly refresh?: (now: number) => FrameData | Promise<FrameData>;
}

// ASCII is deliberate: cell width is exact, and data cannot carry executable terminal controls.
function safe(value: unknown): string {
  return String(value).replace(/[^\x20-\x7e]/gu, character => {
    const code = character.codePointAt(0)!;
    return code <= 0xffff ? `\\u${code.toString(16).padStart(4, '0')}` : `\\u{${code.toString(16)}}`;
  });
}
function number(value: number | undefined): string { return value === undefined ? 'unknown' : String(value); }

function learning(root: string, readCounts: StatuslineWatchIo['readCounts']): string[] {
  try {
    for (const path of [join(root, '.dz', 'patterns.jsonl'), join(root, '.dz', 'memory', 'patterns.sqlite'), join(root, '.dz', 'agentdb.db')]) {
      if (!existsSync(path)) continue;
      const stat = lstatSync(path);
      if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('nonregular learning source');
    }
    const counts = (readCounts ?? countLearningStoreRowsReadonly)(root);
    const sourcePresent = existsSync(counts.lexicalSourcePath);
    let lexical: number | 'unreadable' | 'busy' | 'absent' = sourcePresent ? counts.lexicalRows : 'absent';
    if (sourcePresent && counts.lexicalSource === 'jsonl') {
      // Legacy helpers count lines, even broken JSON. The watcher establishes a readable source.
      const stat = lstatSync(counts.lexicalSourcePath);
      if (!stat.isFile() || stat.isSymbolicLink()) lexical = 'unreadable';
      else {
        const lines = readFileSync(counts.lexicalSourcePath, 'utf8').split('\n').filter(line => line.trim() !== '');
        for (const line of lines) {
          const record: unknown = JSON.parse(line);
          if (typeof record !== 'object' || record === null || Array.isArray(record)) throw new Error('invalid JSONL record');
        }
        lexical = lines.length;
      }
    }
    const lines = [typeof lexical === 'number'
      ? `Pool: ${lexical} patterns | active ${counts.lexicalQuarantinedRows === undefined ? 'unknown' : lexical - counts.lexicalQuarantinedRows} | quarantined ${number(counts.lexicalQuarantinedRows)}`
      : `Pool: unavailable (${lexical})`];
    lines.push(counts.vectorSourcePath === undefined ? 'Mirror: unavailable (absent)'
      : typeof counts.vectorRows !== 'number' ? `Mirror: unavailable (${counts.vectorRows})`
      : `Mirror: ${counts.vectorRows} rows | lessons ${number(counts.vectorLessonRows)} | quarantined ${number(counts.vectorQuarantinedRows)}`);
    let used: number | undefined;
    try {
      const path = join(root, '.dz', 'recall-usage.jsonl');
      const stat = lstatSync(path);
      if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('not regular');
      const text = readFileSync(path, 'utf8');
      for (const line of text.split('\n').filter(line => line.trim() !== '')) JSON.parse(line);
      const parsed = parseRecallUsageLog(text);
      if (parsed.invalidLines === 0 && parsed.records.length > 0) used = aggregateRecallUsage(parsed.records).length;
    } catch { /* unknown auxiliary count never becomes zero */ }
    lines.push(`Used patterns: ${number(used)}`);
    try {
      const markPath = storeGuardPath(root);
      if (existsSync(markPath)) {
        const stat = lstatSync(markPath);
        if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('invalid store health source');
        const parsed: unknown = JSON.parse(readFileSync(markPath, 'utf8'));
        if (typeof parsed !== 'object' || parsed === null || readStoreMark(root) === undefined) throw new Error('invalid store health evidence');
      }
      const health = checkStoreHealth({ projectRoot: root, lexicalRows: lexical === 'absent' ? 'unreadable' : lexical,
        lexicalSource: counts.lexicalSource, vectorRows: counts.vectorRows, mark: readStoreMark(root) });
      if (health.verdict !== 'ok' && health.verdict !== 'no-mark') lines.push(`Store: ${health.verdict} | ${health.reason}`);
    } catch { lines.push('Store health: unavailable'); }
    return lines;
  } catch { return ['Pool: unavailable (read failed)', 'Mirror: unavailable (read failed)', 'Used patterns: unknown', 'Store health: unavailable']; }
}

function frame(data: FrameData, options: StatuslineWatchOptions, now: number, dimensions: { columns?: number; rows?: number }): string {
  const columns = dimensions.columns;
  const rows = dimensions.rows;
  const width = columns !== undefined && Number.isInteger(columns) && columns > 0 ? columns - 1 : 0;
  const height = rows !== undefined && Number.isInteger(rows) && rows > 0 ? rows - 1 : 0;
  const clip = (line: string): string => {
    const text = safe(line);
    return text.length <= width ? text : width >= 3 ? `${text.slice(0, width - 3)}...` : '.'.repeat(width);
  };
  if (width < 39 || height < 7) {
    const knownWidth = columns !== undefined && Number.isInteger(columns) && columns > 0;
    const knownHeight = rows !== undefined && Number.isInteger(rows) && rows > 0;
    const message = !knownWidth || !knownHeight ? 'Terminal size unavailable' : 'Terminal too small';
    // An unavailable height does not remove a known width's wrap boundary.
    const warning = knownHeight && height === 0 ? '' : knownWidth ? clip(message) : message;
    return `\x1b[2J\x1b[H${warning}`;
  }
  const observation = data.observation;
  const state = observation.state;
  const identity = options.selector;
  const automatic = identity?.slug === undefined && identity?.runId === undefined;
  const lines = [
    `dz companion | Selection: ${automatic ? 'automatic' : 'exact'}`,
    `Slug: ${state?.slug ?? identity?.slug ?? 'unknown'}`,
    `Run: ${state?.runId ?? identity?.runId ?? (state === undefined ? 'unknown' : 'unrecorded')}`,
    `Report: ${observation.status} | age ${observation.ageMs === undefined ? 'unknown' : `${Math.floor(observation.ageMs / 1000)}s`} (producer report)`,
    `Project: ${options.projectRoot} | branch ${data.branch ?? 'unknown'}`,
    `Brain: ${options.brainRoot}`,
  ];
  if (observation.reason !== undefined) lines.push(`Diagnostic: ${observation.reason}`);
  if (observation.limitedSearch === true) lines.push('Discovery: limited to 64 candidates');
  lines.push(...data.learning);
  if (state !== undefined) {
    lines.push(`Tier: ${state.tier ?? 'unknown'} | Reported phase: ${state.step}`);
    // Reuse the established tier/step position mapping; discard its decorative compact text.
    const phase = renderFeatureAdrPhaseLine({ ...state, pool: state.pool ?? 0, recalled: state.recalled ?? 0, stored: state.stored ?? 0 }, Date.parse(state.ts));
    const ratio = phase?.match(/\] (\d+\/\d+|\?\/\?)/)?.[1] ?? '?/?';
    lines.push(`Stage position: ${ratio} (not gate evidence)`);
    const elapsed = state.phaseStartTs === undefined ? 'unknown' : `${Math.floor(Math.max(0, now - Date.parse(state.phaseStartTs)) / 1000)}s`;
    lines.push(`Phase elapsed: ${elapsed} | ETA: unavailable`);
    lines.push(`Run learning: recalled ${number(state.recalled)} | stored ${number(state.stored)} | reinforced ${number(state.reinforced)}`);
  } else { lines.push('Phase elapsed: unknown | ETA: unavailable'); }
  let visible = lines.slice(0, height).map(clip);
  if (lines.length > height) visible[height - 1] = clip('[more rows omitted: resize terminal]');
  return `\x1b[2J\x1b[H${visible.join('\r\n')}`;
}

/** Serial, bounded companion watch; cancellation=0, broken output=1, usage=2. */
export async function watchStatusline(options: StatuslineWatchOptions, io: StatuslineWatchIo = {}): Promise<number> {
  const writeErr = io.writeErr ?? console.error;
  const interval = options.intervalSeconds ?? 2;
  if (!(io.isTTY ?? process.stdout.isTTY === true)) {
    writeErr('dz statusline --watch requires stdout TTY; use dz statusline or --json for piped output.');
    return 2;
  }
  if (!Number.isFinite(interval) || interval < 0.25 || interval > 60) {
    writeErr('dz statusline --watch: --interval must be 0.25 through 60 seconds.');
    return 2;
  }
  const write = io.write ?? ((text: string) => {
    if (process.stdout.destroyed || process.stdout.writableEnded) throw new Error('stdout unavailable');
    process.stdout.write(text);
  });
  const dimensions = io.dimensions ?? (() => ({ columns: process.stdout.columns, rows: process.stdout.rows }));
  const now = io.now ?? Date.now;
  const schedule = io.schedule ?? ((callback, delay) => setTimeout(callback, delay));
  const cancel = io.cancel ?? ((timer: unknown) => clearTimeout(timer as ReturnType<typeof setTimeout>));
  const subscribe = io.subscribe ?? ((event, callback) => {
    const emitter = event === 'error' || event === 'resize' ? process.stdout : process;
    emitter.on(event, callback);
    return () => { emitter.off(event, callback); };
  });
  const refresh = io.refresh ?? ((time: number): FrameData => ({
    observation: readFeatureAdrObservation(options.projectRoot, options.selector, time),
    learning: learning(options.brainRoot, io.readCounts),
    ...(io.branch === undefined ? {} : { branch: io.branch() ?? 'unknown' }),
  }));
  return new Promise<number>(resolve => {
    let stopped = false;
    let hidden = false;
    let timer: unknown;
    let last: { data: FrameData; now: number } | undefined;
    const disposers: Array<() => void> = [];
    const stop = (code: number): void => {
      if (stopped) return;
      stopped = true;
      if (timer !== undefined) { cancel(timer); timer = undefined; }
      // Keep the error listener installed while attempting terminal restoration.
      if (hidden) { try { write('\x1b[?25h\r\n'); } catch { /* failed output cannot restore physically */ } hidden = false; }
      for (const dispose of disposers) dispose();
      resolve(code);
    };
    const draw = (data: FrameData, time: number): void => {
      if (stopped) return;
      try {
        hidden = true;
        write(`\x1b[?25l${frame(data, options, time, dimensions())}`);
      } catch { stop(1); }
    };
    const tick = async (): Promise<void> => {
      timer = undefined;
      const time = now();
      let data: FrameData;
      try { data = await refresh(time); }
      catch (error) { data = { observation: { status: 'unreadable', reason: `refresh failed: ${String(error)}` }, learning: ['Learning: unavailable'] }; }
      if (stopped) return;
      last = { data, now: time };
      draw(data, time);
      if (!stopped) timer = schedule(() => { void tick(); }, interval * 1000);
    };
    disposers.push(subscribe('SIGINT', () => stop(0)), subscribe('SIGTERM', () => stop(0)),
      subscribe('error', () => stop(1)), subscribe('resize', () => {
        if (!stopped && last !== undefined) draw(last.data, last.now);
      }));
    void tick();
  });
}

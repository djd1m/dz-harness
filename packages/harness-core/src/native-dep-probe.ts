import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';

export type NativeDepState = 'usable' | 'absent' | 'unusable';

export interface NativeDepVerdict {
  readonly state: NativeDepState;
  readonly pkg: string;
  readonly reason?: string;
  readonly path?: string;
}

const verdictCache = new Map<string, NativeDepVerdict>();
const exerciseIds = new WeakMap<Function, string>();
let nextExerciseId = 1;

function exerciseIdentity(exercise: unknown): string {
  if (typeof exercise !== 'function') return `invalid-${typeof exercise}`;
  const existing = exerciseIds.get(exercise);
  if (existing) return existing;
  const identity = `function-${nextExerciseId++}`;
  exerciseIds.set(exercise, identity);
  return identity;
}

function formatError(error: unknown): string {
  try {
    const message = error instanceof Error ? error.message : String(error);
    const oneLine = message.replace(/\s+/g, ' ').trim() || 'unknown error';
    return oneLine.length > 400 ? `${oneLine.slice(0, 397)}...` : oneLine;
  } catch {
    return 'unknown error';
  }
}

export function exerciseSqliteOpen(mod: unknown): void {
  const defaultExport =
    typeof mod === 'object' && mod !== null && 'default' in mod
      ? (mod as { default: unknown }).default
      : mod;
  const Database = defaultExport as new (filename: string) => { close(): void };
  const database = new Database(':memory:');
  database.close();
}

export function probeNativeDep(
  projectRoot: string,
  pkg: string,
  exercise?: (mod: unknown) => unknown,
  exerciseId?: string,
): NativeDepVerdict {
  let cacheKey: string;
  try {
    const resolvedExerciseId =
      exerciseId ?? (exercise === undefined ? undefined : exerciseIdentity(exercise));
    cacheKey = `${resolve(projectRoot)}::${pkg}::${resolvedExerciseId ?? 'none'}`;
  } catch {
    return { state: 'absent', pkg };
  }

  const cached = verdictCache.get(cacheKey);
  if (cached) return cached;

  let resolvedPath: string;
  let projectRequire: ReturnType<typeof createRequire>;
  try {
    projectRequire = createRequire(join(projectRoot, 'package.json'));
    resolvedPath = projectRequire.resolve(pkg);
  } catch {
    const verdict: NativeDepVerdict = { state: 'absent', pkg };
    verdictCache.set(cacheKey, verdict);
    return verdict;
  }

  let verdict: NativeDepVerdict;
  try {
    const mod = projectRequire(resolvedPath);
    const exerciseResult = exercise?.(mod);
    const then =
      exerciseResult !== null &&
      (typeof exerciseResult === 'object' || typeof exerciseResult === 'function')
        ? (exerciseResult as { then?: unknown }).then
        : undefined;
    if (typeof then === 'function') {
      void Promise.resolve(exerciseResult).catch(() => {});
      verdict = {
        state: 'unusable',
        pkg,
        reason:
          'exercise returned a promise; probeNativeDep is synchronous and cannot await it',
        path: resolvedPath,
      };
    } else {
      verdict = { state: 'usable', pkg, path: resolvedPath };
    }
  } catch (error) {
    verdict = {
      state: 'unusable',
      pkg,
      reason: formatError(error),
      path: resolvedPath,
    };
  }

  verdictCache.set(cacheKey, verdict);
  return verdict;
}

export function describeNativeDep(verdict: NativeDepVerdict): string {
  if (verdict.state === 'usable') return '';
  if (verdict.state === 'absent') {
    if (verdict.pkg === 'agentdb' || verdict.pkg === 'better-sqlite3') {
      return `${verdict.pkg} not installed in project (run: dz setup --memory agentdb)`;
    }
    return `${verdict.pkg} not installed in project (run: npm i ${verdict.pkg})`;
  }
  return `${verdict.pkg} is installed at ${verdict.path ?? 'an unknown path'}, but its native part will not load on this Node: ${verdict.reason ?? 'unknown error'} (run: npm rebuild ${verdict.pkg})`;
}

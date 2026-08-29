import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';
const verdictCache = new Map();
const exerciseIds = new WeakMap();
let nextExerciseId = 1;
function exerciseIdentity(exercise) {
    if (typeof exercise !== 'function')
        return `invalid-${typeof exercise}`;
    const existing = exerciseIds.get(exercise);
    if (existing)
        return existing;
    const identity = `function-${nextExerciseId++}`;
    exerciseIds.set(exercise, identity);
    return identity;
}
function formatError(error) {
    try {
        const message = error instanceof Error ? error.message : String(error);
        const oneLine = message.replace(/\s+/g, ' ').trim() || 'unknown error';
        return oneLine.length > 400 ? `${oneLine.slice(0, 397)}...` : oneLine;
    }
    catch {
        return 'unknown error';
    }
}
export function exerciseSqliteOpen(mod) {
    const defaultExport = typeof mod === 'object' && mod !== null && 'default' in mod
        ? mod.default
        : mod;
    const Database = defaultExport;
    const database = new Database(':memory:');
    database.close();
}
export function probeNativeDep(projectRoot, pkg, exercise, exerciseId) {
    let cacheKey;
    try {
        const resolvedExerciseId = exerciseId ?? (exercise === undefined ? undefined : exerciseIdentity(exercise));
        cacheKey = `${resolve(projectRoot)}::${pkg}::${resolvedExerciseId ?? 'none'}`;
    }
    catch {
        return { state: 'absent', pkg };
    }
    const cached = verdictCache.get(cacheKey);
    if (cached)
        return cached;
    let resolvedPath;
    let projectRequire;
    try {
        projectRequire = createRequire(join(projectRoot, 'package.json'));
        resolvedPath = projectRequire.resolve(pkg);
    }
    catch {
        const verdict = { state: 'absent', pkg };
        verdictCache.set(cacheKey, verdict);
        return verdict;
    }
    let verdict;
    try {
        const mod = projectRequire(resolvedPath);
        const exerciseResult = exercise?.(mod);
        const then = exerciseResult !== null &&
            (typeof exerciseResult === 'object' || typeof exerciseResult === 'function')
            ? exerciseResult.then
            : undefined;
        if (typeof then === 'function') {
            void Promise.resolve(exerciseResult).catch(() => { });
            verdict = {
                state: 'unusable',
                pkg,
                reason: 'exercise returned a promise; probeNativeDep is synchronous and cannot await it',
                path: resolvedPath,
            };
        }
        else {
            verdict = { state: 'usable', pkg, path: resolvedPath };
        }
    }
    catch (error) {
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
export function describeNativeDep(verdict) {
    if (verdict.state === 'usable')
        return '';
    if (verdict.state === 'absent') {
        if (verdict.pkg === 'agentdb' || verdict.pkg === 'better-sqlite3') {
            return `${verdict.pkg} not installed in project (run: dz setup --memory agentdb)`;
        }
        return `${verdict.pkg} not installed in project (run: npm i ${verdict.pkg})`;
    }
    return `${verdict.pkg} is installed at ${verdict.path ?? 'an unknown path'}, but its native part will not load on this Node: ${verdict.reason ?? 'unknown error'} (run: npm rebuild ${verdict.pkg})`;
}
//# sourceMappingURL=native-dep-probe.js.map
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const STALE_RUN_ROOT_AGE_MS = 120 * 60 * 1_000;
const RUN_ROOT_USERS_ENV = 'DZ_VITEST_TMP_ROOT_USERS';
const RUN_ROOT_OWNER_FILE = '.dz-run-owner.json';
function countEntries(root) {
    let count = 0;
    const pending = [root];
    while (pending.length > 0) {
        const dir = pending.pop();
        let entries;
        try {
            entries = readdirSync(dir, { withFileTypes: true });
        }
        catch (error) {
            if (error.code === 'ENOENT')
                continue;
            throw error;
        }
        for (const entry of entries) {
            count += 1;
            if (entry.isDirectory())
                pending.push(join(dir, entry.name));
        }
    }
    return count;
}
function defaultIsAlive(pid) {
    try {
        process.kill(pid, 0);
        return true;
    }
    catch (error) {
        const code = error.code;
        if (code === 'ESRCH')
            return false;
        if (code === 'EPERM')
            return true;
        throw error;
    }
}
function errorReason(error) {
    return (error instanceof Error ? error.message : String(error)).split(/\r?\n/u, 1)[0];
}
function readRunRootOwner(candidate, log) {
    const marker = join(candidate, RUN_ROOT_OWNER_FILE);
    let value;
    try {
        value = JSON.parse(readFileSync(marker, 'utf8'));
    }
    catch (error) {
        if (error.code !== 'ENOENT') {
            log(`dz tmp-run-root: sweep skipped — cannot read owner marker ${marker}: ${errorReason(error)}`);
        }
        return null;
    }
    if (value === null || typeof value !== 'object')
        return null;
    const owner = value;
    // PID_MAX_LIMIT on Linux is 2^22; anything above 2^31-1 makes process.kill throw ERR_INVALID_ARG_TYPE, not ESRCH (review 2026-09-11)
    if (!Number.isSafeInteger(owner.pid) || (owner.pid ?? 0) <= 0 || owner.pid > 2 ** 31 - 1
        || typeof owner.startedAt !== 'string' || typeof owner.package !== 'string')
        return null;
    return owner;
}
export function sweepStaleRunRoots(systemTmp, options = {}) {
    const now = options.now ?? Date.now;
    const isAlive = options.isAlive ?? defaultIsAlive;
    const log = options.log ?? console.error;
    const staleBefore = now() - STALE_RUN_ROOT_AGE_MS;
    let swept = 0;
    let entries;
    try {
        entries = readdirSync(systemTmp, { withFileTypes: true });
    }
    catch (error) {
        log(`dz tmp-run-root: sweep skipped — ${errorReason(error)}`);
        return 0;
    }
    for (const entry of entries) {
        if (!entry.isDirectory() || !entry.name.startsWith('dz-vitest-'))
            continue;
        const candidate = join(systemTmp, entry.name);
        try {
            if (statSync(candidate).mtimeMs >= staleBefore)
                continue;
            const owner = readRunRootOwner(candidate, log);
            if (owner !== null && (owner.pid === process.pid || isAlive(owner.pid))) {
                log(`dz tmp-run-root: kept ${candidate} — owner pid ${owner.pid} alive`);
                continue;
            }
            rmSync(candidate, { recursive: true, force: true });
            swept += 1;
        }
        catch (error) {
            if (error.code !== 'ENOENT')
                throw error;
        }
    }
    log(`dz tmp-run-root: swept ${swept} stale run root(s)`);
    return swept;
}
export function dzTmpRunRoot(packageName) {
    const activeRunRoot = process.env.DZ_VITEST_TMP_ROOT;
    if (activeRunRoot !== undefined && existsSync(activeRunRoot)) {
        const users = Number.parseInt(process.env[RUN_ROOT_USERS_ENV] ?? '1', 10);
        process.env[RUN_ROOT_USERS_ENV] = String(users + 1);
        return () => teardownTmpRunRoot(activeRunRoot);
    }
    const systemTmp = tmpdir();
    sweepStaleRunRoots(systemTmp);
    const runRoot = mkdtempSync(join(systemTmp, `dz-vitest-${packageName}-`));
    writeFileSync(join(runRoot, RUN_ROOT_OWNER_FILE), `${JSON.stringify({
        pid: process.pid,
        startedAt: new Date().toISOString(),
        package: packageName,
    })}\n`);
    process.env.TMPDIR = runRoot;
    process.env.TMP = runRoot;
    process.env.TEMP = runRoot;
    process.env.DZ_VITEST_TMP_ROOT = runRoot;
    process.env[RUN_ROOT_USERS_ENV] = '1';
    return () => teardownTmpRunRoot(runRoot);
}
function teardownTmpRunRoot(runRoot) {
    const users = Number.parseInt(process.env[RUN_ROOT_USERS_ENV] ?? '1', 10);
    if (users > 1) {
        process.env[RUN_ROOT_USERS_ENV] = String(users - 1);
        return;
    }
    delete process.env[RUN_ROOT_USERS_ENV];
    const entries = countEntries(runRoot);
    rmSync(runRoot, { recursive: true, force: true });
    console.error(`dz tmp-run-root: removed ${runRoot} (${entries} entries)`);
}
/**
 * Containment for the .dz-debris class (backlog: dz-debris episodes 7-9): in-process runCli
 * tests default --project to process.cwd(), which under vitest is the PACKAGE root — the first
 * brain/lock write then creates <pkg>/.dz, cmd-usage logging re-anchors there, and a test plus
 * both mutation-gate baselines in the NEIGHBOUR package go red (measured three times 2026-08-30).
 *
 * This teardown does NOT fix the seeders (that is the backlog item's per-call work). It keeps the
 * contamination from OUTLIVING the run that caused it, and it is deliberately LOUD: silence here
 * would read as "no seeder left", which is not established.
 */
export function dzDebrisTeardown(packageRoot) {
    const debris = join(packageRoot, '.dz');
    const preExisting = existsSync(debris);
    return () => {
        if (preExisting)
            return; // not ours to judge — never delete state the run did not create
        if (existsSync(debris)) {
            rmSync(debris, { recursive: true, force: true });
            console.error(`[dz-debris] WARNING: this test run seeded ${debris} (an in-process runCli defaulted `
                + `--project to the package cwd). Removed so it cannot re-anchor cmd-usage logging and `
                + `redden the neighbour package's suite. The seeder itself is still unfixed — see the `
                + `dz-debris backlog item before trusting any per-call --project hygiene.`);
        }
    };
}
export function dzTestRunGuards(packageRoot, packageName) {
    const teardownTmpRunRoot = dzTmpRunRoot(packageName);
    const teardownDzDebris = dzDebrisTeardown(packageRoot);
    return () => {
        try {
            teardownDzDebris();
        }
        finally {
            teardownTmpRunRoot();
        }
    };
}
//# sourceMappingURL=vitest.dz-debris.shared.js.map
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { assertTempRootClean, diffTempRootHazards, findTempRootHazards, isBlockingHazard } from './temp-root-guard.js';
import type { Hazard } from './temp-root-guard.js';

export { assertTempRootClean, diffTempRootHazards, findTempRootHazards } from './temp-root-guard.js';

const STALE_RUN_ROOT_AGE_MS = 120 * 60 * 1_000;
const RUN_ROOT_USERS_ENV = 'DZ_VITEST_TMP_ROOT_USERS';
const RUN_ROOT_OWNER_FILE = '.dz-run-owner.json';

interface RunRootOwner {
  readonly pid: number;
  readonly startedAt: string;
  readonly package: string;
}

interface SweepOptions {
  readonly now?: () => number;
  readonly isAlive?: (pid: number) => boolean;
  readonly log?: (message: string) => void;
}

/** What the last-user teardown needs to name a hazard CREATED during this run (post-run check). */
interface PostRunContext {
  /** Scan target that OUTLIVES the run root: the system tmp, or the shared run root's parent. */
  readonly tmp: string;
  readonly before: readonly Hazard[];
  readonly packageName: string;
  /** Puts back the temp env vars this call set (a no-op on the shared branch, where none are ours). */
  readonly restoreEnv: () => void;
}

const TEMP_ENV_KEYS = ['TMPDIR', 'TMP', 'TEMP', 'DZ_VITEST_TMP_ROOT'] as const;

function captureTempEnv(): () => void {
  const original = Object.fromEntries(TEMP_ENV_KEYS.map((key) => [key, process.env[key]]));
  return () => {
    for (const key of TEMP_ENV_KEYS) {
      if (original[key] === undefined) delete process.env[key];
      else process.env[key] = original[key];
    }
  };
}

function countEntries(root: string): number {
  let count = 0;
  const pending = [root];
  while (pending.length > 0) {
    const dir = pending.pop()!;
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') continue;
      throw error;
    }
    for (const entry of entries) {
      count += 1;
      if (entry.isDirectory()) pending.push(join(dir, entry.name));
    }
  }
  return count;
}

function defaultIsAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === 'ESRCH') return false;
    if (code === 'EPERM') return true;
    throw error;
  }
}

function errorReason(error: unknown): string {
  return (error instanceof Error ? error.message : String(error)).split(/\r?\n/u, 1)[0]!;
}

function readRunRootOwner(candidate: string, log: (message: string) => void): RunRootOwner | null {
  const marker = join(candidate, RUN_ROOT_OWNER_FILE);
  let value: unknown;
  try {
    value = JSON.parse(readFileSync(marker, 'utf8'));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      log(`dz tmp-run-root: sweep skipped — cannot read owner marker ${marker}: ${errorReason(error)}`);
    }
    return null;
  }
  if (value === null || typeof value !== 'object') return null;
  const owner = value as Partial<RunRootOwner>;
  // PID_MAX_LIMIT on Linux is 2^22; anything above 2^31-1 makes process.kill throw ERR_INVALID_ARG_TYPE, not ESRCH (review 2026-09-11)
  if (!Number.isSafeInteger(owner.pid) || (owner.pid ?? 0) <= 0 || (owner.pid as number) > 2 ** 31 - 1
    || typeof owner.startedAt !== 'string' || typeof owner.package !== 'string') return null;
  return owner as RunRootOwner;
}

export function sweepStaleRunRoots(systemTmp: string, options: SweepOptions = {}): number {
  const now = options.now ?? Date.now;
  const isAlive = options.isAlive ?? defaultIsAlive;
  const log = options.log ?? console.error;
  const staleBefore = now() - STALE_RUN_ROOT_AGE_MS;
  let swept = 0;
  let entries;
  try {
    entries = readdirSync(systemTmp, { withFileTypes: true });
  } catch (error) {
    log(`dz tmp-run-root: sweep skipped — ${errorReason(error)}`);
    return 0;
  }
  for (const entry of entries) {
    if (!entry.isDirectory() || !entry.name.startsWith('dz-vitest-')) continue;
    const candidate = join(systemTmp, entry.name);
    try {
      if (statSync(candidate).mtimeMs >= staleBefore) continue;
      const owner = readRunRootOwner(candidate, log);
      if (owner !== null && (owner.pid === process.pid || isAlive(owner.pid))) {
        log(`dz tmp-run-root: kept ${candidate} — owner pid ${owner.pid} alive`);
        continue;
      }
      rmSync(candidate, { recursive: true, force: true });
      swept += 1;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
  }
  log(`dz tmp-run-root: swept ${swept} stale run root(s)`);
  return swept;
}

export function dzTmpRunRoot(packageName: string): () => void {
  const activeRunRoot = process.env.DZ_VITEST_TMP_ROOT;
  if (activeRunRoot !== undefined && existsSync(activeRunRoot)) {
    // The last user removes activeRunRoot before the post-run scan, so the snapshot and the rescan
    // both target its parent: the ancestor chain minus the node that is gone by then. One scan
    // covers both the refusal and the snapshot (FR-3).
    const sharedTmp = dirname(activeRunRoot);
    const before = assertTempRootClean(sharedTmp);
    const users = Number.parseInt(process.env[RUN_ROOT_USERS_ENV] ?? '1', 10);
    process.env[RUN_ROOT_USERS_ENV] = String(users + 1);
    return () => teardownTmpRunRoot(activeRunRoot, { tmp: sharedTmp, before, packageName, restoreEnv: () => {} });
  }

  const systemTmp = tmpdir();
  const before = assertTempRootClean(systemTmp);
  const restoreEnv = captureTempEnv();
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

  return () => teardownTmpRunRoot(runRoot, { tmp: systemTmp, before, packageName, restoreEnv });
}

const POST_RUN_REMEDY = 'remedy: move the entry aside or point TMPDIR at a clean root — this guard never deletes anything';

function teardownTmpRunRoot(runRoot: string, ctx: PostRunContext): void {
  const users = Number.parseInt(process.env[RUN_ROOT_USERS_ENV] ?? '1', 10);
  if (users > 1) {
    process.env[RUN_ROOT_USERS_ENV] = String(users - 1);
    return;
  }

  delete process.env[RUN_ROOT_USERS_ENV];
  const entries = countEntries(runRoot);
  rmSync(runRoot, { recursive: true, force: true });
  console.error(`dz tmp-run-root: removed ${runRoot} (${entries} entries)`);
  // A throwing post-run check must not leave TMPDIR & co. pointing at the run root just removed.
  try {
    assertNoHazardCreatedDuringRun(ctx);
  } finally {
    ctx.restoreEnv();
  }
}

/**
 * Post-run half of the temp-root guard (feature temp-root-post-run-check): the pre-run check
 * refuses a hazard left by an EARLIER run, so the run that CREATES `/tmp/.dz` finished green and
 * the next run paid (measured 11.09 and 23.09). One more ancestor-chain scan after the run root
 * is gone, diffed against the pre-run snapshot, names this run as the creator. It removes nothing
 * outside the run root that was already removed above.
 */
function assertNoHazardCreatedDuringRun({ tmp, before, packageName }: PostRunContext): void {
  const fresh = diffTempRootHazards(before, findTempRootHazards(tmp));
  const header = `CREATED DURING THIS RUN of ${packageName}`;
  const line = ({ path, kind, consequence }: Hazard): string => `${header} — ${path} — ${kind} — ${consequence}`;
  for (const hazard of fresh) {
    console.error(isBlockingHazard(hazard) ? `dz tmp-root: ${line(hazard)}` : `dz tmp-root: WARN — ${line(hazard)}`);
  }
  if (fresh.some(isBlockingHazard)) {
    throw new Error([...fresh.filter(isBlockingHazard).map((hazard) => `dz tmp-root: ${line(hazard)}`), POST_RUN_REMEDY].join('\n'));
  }
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
export function dzDebrisTeardown(packageRoot: string): () => void {
  const debris = join(packageRoot, '.dz');
  const preExisting = existsSync(debris);
  return () => {
    if (preExisting) return; // not ours to judge — never delete state the run did not create
    if (existsSync(debris)) {
      rmSync(debris, { recursive: true, force: true });
      console.error(
        `[dz-debris] WARNING: this test run seeded ${debris} (an in-process runCli defaulted `
        + `--project to the package cwd). Removed so it cannot re-anchor cmd-usage logging and `
        + `redden the neighbour package's suite. The seeder itself is still unfixed — see the `
        + `dz-debris backlog item before trusting any per-call --project hygiene.`,
      );
    }
  };
}

export function dzTestRunGuards(packageRoot: string, packageName: string): () => void {
  const teardownTmpRunRoot = dzTmpRunRoot(packageName);
  const teardownDzDebris = dzDebrisTeardown(packageRoot);
  return () => {
    try {
      teardownDzDebris();
    } finally {
      teardownTmpRunRoot();
    }
  };
}

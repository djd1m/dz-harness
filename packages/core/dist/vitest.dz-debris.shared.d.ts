export { assertTempRootClean, diffTempRootHazards, findTempRootHazards } from './temp-root-guard.js';
interface SweepOptions {
    readonly now?: () => number;
    readonly isAlive?: (pid: number) => boolean;
    readonly log?: (message: string) => void;
}
export declare function sweepStaleRunRoots(systemTmp: string, options?: SweepOptions): number;
export declare function dzTmpRunRoot(packageName: string): () => void;
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
export declare function dzDebrisTeardown(packageRoot: string): () => void;
export declare function dzTestRunGuards(packageRoot: string, packageName: string): () => void;
//# sourceMappingURL=vitest.dz-debris.shared.d.ts.map
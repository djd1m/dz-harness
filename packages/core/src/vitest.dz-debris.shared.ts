import { existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';

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

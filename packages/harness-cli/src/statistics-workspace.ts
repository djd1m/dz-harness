import { lstatSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

export type StatisticsWorkspaceResult =
  | { readonly ok: true; readonly root: string; readonly candidateCount: number }
  | { readonly ok: false; readonly root: string; readonly path?: string;
      readonly reason: 'root-missing' | 'root-type' | 'root-read' | 'empty'
        | 'manifest-type' | 'manifest-read' | 'manifest-json' };

const absent = (error: unknown): boolean => (error as NodeJS.ErrnoException | undefined)?.code === 'ENOENT';

/** CLI-private preflight. Manifest syntax is checked without imposing publication metadata. */
export function inspectStatisticsWorkspace(cwd: string): StatisticsWorkspaceResult {
  const baseDir = join(cwd, 'packages', '@dzhechkov');
  const fail = (path: string, reason: Extract<StatisticsWorkspaceResult, { ok: false }>['reason']): StatisticsWorkspaceResult =>
    ({ ok: false, root: cwd, path, reason });
  let entries;
  try {
    if (!statSync(baseDir).isDirectory()) return fail(baseDir, 'root-type');
  } catch (error) {
    return fail(baseDir, absent(error) ? 'root-missing'
      : (error as NodeJS.ErrnoException | undefined)?.code === 'ENOTDIR' ? 'root-type' : 'root-read');
  }
  try {
    entries = readdirSync(baseDir, { withFileTypes: true });
  } catch {
    return fail(baseDir, 'root-read');
  }

  let manifests = 0;
  for (const entry of entries) {
    const dir = join(baseDir, entry.name);
    try {
      // Follow package-directory links just as countPackageDirs does. Broken links contribute nothing.
      if (!statSync(dir).isDirectory()) continue;
    } catch {
      continue; // Match the counter: an unresolvable package directory contributes nothing.
    }
    const manifest = join(dir, 'package.json');
    try {
      // lstat distinguishes an absent folder decoy from a dangling manifest link.
      lstatSync(manifest);
    } catch (error) {
      if (absent(error)) continue;
      return fail(manifest, 'manifest-read');
    }
    let text: string;
    try {
      if (!statSync(manifest).isFile()) return fail(manifest, 'manifest-type');
      text = readFileSync(manifest, 'utf-8');
    } catch {
      return fail(manifest, 'manifest-read');
    }
    try {
      JSON.parse(text);
    } catch {
      return fail(manifest, 'manifest-json');
    }
    manifests += 1;
  }
  return manifests > 0 ? { ok: true, root: cwd, candidateCount: manifests } : fail(baseDir, 'empty');
}

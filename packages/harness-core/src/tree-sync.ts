/** File states shared by skill-tree producers. Extra target files are preserved. */
export type FileState = 'match' | 'missing' | 'diverged' | 'extra';

/** Compare relative-path → SHA-256 maps without reading or changing either tree. */
export function compareTrees(
  source: ReadonlyMap<string, string>,
  target: ReadonlyMap<string, string>,
): Map<string, FileState> {
  const states = new Map<string, FileState>();
  for (const [path, hash] of source) {
    states.set(path, !target.has(path) ? 'missing' : target.get(path) === hash ? 'match' : 'diverged');
  }
  for (const path of target.keys()) {
    if (!source.has(path)) states.set(path, 'extra');
  }
  return states;
}

/** Filesystem facts required to recognise a real Git repository boundary. */
export interface RepoBoundaryIo {
  exists(p: string): boolean;
  isDirectory(p: string): boolean;
  readText(p: string): string | null;
}

/**
 * A Git repository boundary is either a `.git` directory containing `HEAD`, or a worktree-style
 * `.git` file whose first bytes are the `gitdir:` redirect. An empty or unrelated `.git` entry is
 * not a boundary.
 */
export function isRepoBoundary(
  dir: string,
  io: RepoBoundaryIo,
  join: (...p: string[]) => string,
): boolean {
  const git = join(dir, '.git');
  if (!io.exists(git)) return false;
  if (io.isDirectory(git)) {
    const head = join(git, 'HEAD');
    return io.exists(head) && !io.isDirectory(head);
  }
  return io.readText(git)?.startsWith('gitdir:') === true;
}

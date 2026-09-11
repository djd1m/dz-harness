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
export declare function isRepoBoundary(dir: string, io: RepoBoundaryIo, join: (...p: string[]) => string): boolean;
//# sourceMappingURL=repo-boundary.d.ts.map
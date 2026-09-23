/** File states shared by skill-tree producers. Extra target files are preserved. */
export type FileState = 'match' | 'missing' | 'diverged' | 'extra';
/** Compare relative-path → SHA-256 maps without reading or changing either tree. */
export declare function compareTrees(source: ReadonlyMap<string, string>, target: ReadonlyMap<string, string>): Map<string, FileState>;
//# sourceMappingURL=tree-sync.d.ts.map
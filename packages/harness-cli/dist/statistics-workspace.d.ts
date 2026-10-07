export type StatisticsWorkspaceResult = {
    readonly ok: true;
    readonly root: string;
    readonly candidateCount: number;
} | {
    readonly ok: false;
    readonly root: string;
    readonly path?: string;
    readonly reason: 'root-missing' | 'root-type' | 'root-read' | 'empty' | 'manifest-type' | 'manifest-read' | 'manifest-json';
};
/** CLI-private preflight. Manifest syntax is checked without imposing publication metadata. */
export declare function inspectStatisticsWorkspace(cwd: string): StatisticsWorkspaceResult;
//# sourceMappingURL=statistics-workspace.d.ts.map
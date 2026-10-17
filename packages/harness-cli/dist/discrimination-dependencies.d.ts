import type { ClassifyResultRow } from '@dzhechkov/harness-core';
type Diagnosis = NonNullable<ClassifyResultRow['baselineDependency']>;
interface Preparation {
    externalReused: {
        path: string;
        target: string;
    }[];
    workspaceMapped: {
        path: string;
        target: string;
    }[];
    diagnostics: {
        path: string;
        detail: string;
        relevant: boolean | null;
    }[];
}
/** Local installed dependencies only. All mutations belong to the detached checker worktree. */
export declare function materializeDiscriminationDependencies(sourceRoot: string, baselineRoot: string): {
    preparation: Preparation;
    diagnose: (output: string, runner: string, runningTest: boolean) => Diagnosis | null;
    preflight: (file: string) => Diagnosis | null;
};
export {};
//# sourceMappingURL=discrimination-dependencies.d.ts.map
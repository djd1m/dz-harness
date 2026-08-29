/**
 * Pretrain — bootstrap intelligence by analyzing the target project.
 *
 * Scans the project's file structure, package.json, and tech stack to
 * automatically recommend the right skills and presets. Runs during
 * `dz init --pretrain` to eliminate manual preset selection.
 *
 * @packageDocumentation
 */
/** Detected technology in the project. */
export interface DetectedTech {
    readonly name: string;
    readonly category: string;
    readonly confidence: number;
    readonly source: string;
}
/** Pretrain analysis result. */
export interface PretrainResult {
    readonly projectName: string;
    readonly techs: readonly DetectedTech[];
    readonly recommendedPresets: readonly string[];
    readonly recommendedSkills: readonly string[];
    readonly projectType: string;
    readonly hasTests: boolean;
    readonly hasDocker: boolean;
    readonly hasCI: boolean;
    readonly hasTerraform: boolean;
    readonly hasKubernetes: boolean;
    readonly packageCount: number;
    /** Number of recorded session events in `.dz/sessions.jsonl` (audit #2 read-back). */
    readonly sessionCount?: number;
    /** ISO-8601 timestamp of the most recent session event, if any. */
    readonly lastSessionTs?: string;
}
/** Run pretrain analysis on a project. */
export declare function pretrain(projectRoot: string): PretrainResult;
//# sourceMappingURL=pretrain.d.ts.map
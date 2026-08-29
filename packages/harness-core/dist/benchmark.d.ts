/**
 * Skill benchmarking — Layer 0 deterministic checks + scoring.
 *
 * Runs structural validation checks against a skill directory,
 * producing a scored report. Checks are based on BTO Layer 0
 * (universal U1-U5 + skill-specific S1-S10).
 *
 * @packageDocumentation
 */
import { type CostEstimate } from './cost-scoring.js';
/** A single benchmark check result. */
export interface BenchmarkCheck {
    readonly id: string;
    readonly name: string;
    readonly passed: boolean;
    readonly detail?: string | undefined;
    /**
     * When true this check is informational ONLY — it is excluded from the
     * pass-rate / grade math (so it can ship without regressing existing grades).
     * Surfaced as a warning in output. Used by S16 (capability-declaration nudge).
     */
    readonly advisory?: boolean;
}
/** Score for a single skill benchmark. */
export interface BenchmarkScore {
    readonly skillId: string;
    readonly skillDir: string;
    readonly checks: readonly BenchmarkCheck[];
    readonly passed: number;
    readonly total: number;
    readonly passRate: number;
    readonly grade: 'A' | 'B' | 'C' | 'D' | 'F';
    /** Static cost band inferred from the skill's declared model usage. */
    readonly cost: CostEstimate;
}
/** Result of benchmarking one or more skills. */
export interface BenchmarkReport {
    readonly skills: readonly BenchmarkScore[];
    readonly totalPassed: number;
    readonly totalChecks: number;
    readonly overallPassRate: number;
}
/** Result of A/B comparison between two skills. */
export interface CompareResult {
    readonly skillA: BenchmarkScore;
    readonly skillB: BenchmarkScore;
    readonly winner: string;
    readonly deltaChecks: readonly {
        readonly id: string;
        readonly aPass: boolean;
        readonly bPass: boolean;
    }[];
}
/** Run Layer 0 benchmark checks on a single skill directory. */
export declare function benchmarkSkill(skillDir: string, skillId: string): BenchmarkScore;
/** Benchmark multiple skills. */
export declare function benchmarkSkills(skillDirs: {
    id: string;
    dir: string;
}[]): BenchmarkReport;
/** Compare two skills head-to-head. */
export declare function compareSkills(skillADir: string, skillAId: string, skillBDir: string, skillBId: string): CompareResult;
//# sourceMappingURL=benchmark.d.ts.map
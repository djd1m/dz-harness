/**
 * Deep content analyzer — downloads SKILL.md from top repos, parses content,
 * compares against our inventory, generates actionable recommendations.
 *
 * Activated by `dz scout --deep`. Only runs on repos with relevanceScore ≥ 50.
 *
 * @packageDocumentation
 */
import type { RepoProfile } from './types.js';
/** A skill discovered via deep content analysis. */
export interface DeepSkillAnalysis {
    /** Skill directory name. */
    readonly id: string;
    /** Parsed description from SKILL.md frontmatter. */
    readonly description: string;
    /** Closest matching skill in our inventory (by keyword overlap), or null. */
    readonly closestMatch: string | null;
    /** What this skill adds that our closest match doesn't. */
    readonly delta: string;
    /** Recommended integration path. */
    readonly integration: 'canonicalize' | 'merge' | 'new-preset' | 'skip';
    /** Human-readable integration rationale. */
    readonly rationale: string;
}
/** Deep analysis result for a single repository. */
export interface DeepRepoAnalysis {
    readonly repo: RepoProfile;
    readonly skillsAnalyzed: readonly DeepSkillAnalysis[];
    readonly gapSummary: string;
}
/** Result of a full deep analysis pass. */
export interface DeepAnalysisReport {
    readonly analyses: readonly DeepRepoAnalysis[];
    readonly gaps: readonly GapEntry[];
    readonly markdown: string;
}
/** A gap in our harness identified from ecosystem scan. */
export interface GapEntry {
    readonly category: string;
    readonly description: string;
    readonly frequency: number;
    readonly examples: readonly string[];
    readonly recommendation: string;
}
/**
 * Run deep analysis on top-scored repos.
 *
 * Downloads SKILL.md files, parses them, compares against our inventory,
 * and generates actionable integration recommendations.
 */
export declare function deepAnalyze(repos: readonly RepoProfile[], options?: {
    token?: string | undefined;
    minScore?: number | undefined;
}): Promise<DeepAnalysisReport>;
//# sourceMappingURL=deep-analyzer.d.ts.map
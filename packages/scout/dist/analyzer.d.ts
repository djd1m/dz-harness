/**
 * Repository analyzer — skill format detection + relevance scoring.
 *
 * @packageDocumentation
 */
import type { GitHubSearchItem, RepoProfile, SkillFormat, Recommendation } from './types.js';
/** Detect skill formats from repository topics and description. */
export declare function detectFormats(item: GitHubSearchItem): SkillFormat[];
/** Compute relevance score (0-100). */
export declare function computeRelevanceScore(formats: readonly SkillFormat[], stars: number, daysSinceCommit: number, noveltyRatio: number): number;
/** Determine recommendation based on score and stars. */
export declare function recommend(score: number, stars: number): Recommendation;
/** Extract potential skill IDs from topics (heuristic). */
export declare function extractSkillHints(item: GitHubSearchItem): string[];
/** Analyze a GitHub search item into a RepoProfile. */
export declare function analyzeRepo(item: GitHubSearchItem): RepoProfile;
//# sourceMappingURL=analyzer.d.ts.map
/**
 * Task recommender — decomposes a user task into harness capabilities.
 *
 * Maps a natural-language task description against the full inventory of
 * commands (23), skills (59), presets (10), and targets (5) to produce
 * a step-by-step plan using existing harness features.
 *
 * This module is deterministic (no LLM) — it uses topic extraction,
 * weighted scoring, and capability matching. The knowledge base is
 * auto-generated from the registry at runtime, so it stays current
 * as new skills/commands are added.
 *
 * @packageDocumentation
 */
import type { Registry } from './registry.js';
/** A recommended skill with relevance score. */
export interface SkillRecommendation {
    readonly id: string;
    readonly pack: string;
    readonly description: string;
    readonly category: string;
    readonly score: number;
    readonly reason: string;
}
/** A recommended CLI command. */
export interface CommandRecommendation {
    readonly command: string;
    readonly description: string;
    readonly example: string;
    readonly phase: string;
}
/** A recommended preset. */
export interface PresetRecommendation {
    readonly name: string;
    readonly skills: number;
    readonly coverage: number;
    readonly matchedSkills: string[];
}
/** A recommended npx toolkit (full pipeline). */
export interface ToolkitRecommendation {
    readonly name: string;
    readonly npmPackage: string;
    readonly install: string;
    readonly description: string;
    readonly reason: string;
}
/** Full recommendation report. */
export interface RecommendationReport {
    readonly task: string;
    readonly topics: readonly string[];
    readonly skills: readonly SkillRecommendation[];
    readonly presets: readonly PresetRecommendation[];
    readonly toolkits: readonly ToolkitRecommendation[];
    readonly commands: readonly CommandRecommendation[];
    readonly installCommand: string;
    readonly plan: readonly string[];
    /** Set when task was too generic and pretrain was used as fallback. */
    readonly pretrainFallback?: boolean;
}
/** Generate recommendation from a task and registry.
 *  When task is too generic (only 'general' topic), falls back to pretrain
 *  to analyze the actual project and recommend based on tech stack.
 */
export declare function recommend(task: string, registry: Registry, projectRoot?: string): RecommendationReport;
//# sourceMappingURL=recommend.d.ts.map
/**
 * AgentBox source scanner — fetches skills from github.com/DreamLab-AI/agentbox.
 *
 * Like {@link scanEcc}, this targets a single curated community repo (a 100+ skill
 * collection forked from VisionClaw — agentdb, deep-research, codebase-memory,
 * design-audit, github-code-review, …) and returns it as a RepoProfile for
 * comparison against the harness inventory.
 *
 * NOTE: the repo currently ships **no visible LICENSE**, so its `recommendation`
 * is `monitor`, not `integrate` — skills here must NOT be canonicalized/published
 * verbatim until the license is clarified (adapt the methodology clean-room, or
 * confirm the license first).
 *
 * @packageDocumentation
 */
import type { RepoProfile } from '../types.js';
interface AgentboxScanOptions {
    /** Maximum skill directories to fetch. Default 100 (GitHub API limit per page). */
    readonly limit?: number;
}
/**
 * Scan AgentBox for its skill inventory. Returns a single RepoProfile representing
 * the repo with skill count and a sample of skill names.
 */
export declare function scanAgentbox(options?: AgentboxScanOptions): Promise<RepoProfile[]>;
export {};
//# sourceMappingURL=agentbox.d.ts.map
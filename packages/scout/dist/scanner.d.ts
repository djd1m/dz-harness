/**
 * GitHub repository scanner — search + pagination + rate limiting.
 *
 * @packageDocumentation
 */
import type { GitHubSearchItem, ScanOptions } from './types.js';
/** Build search query for a single topic. GitHub doesn't support OR between topic qualifiers. */
export declare function buildSearchQuery(topic: string, since?: string): string;
/** Scan GitHub for repositories matching skill-related topics. Searches each topic separately and deduplicates. */
export declare function scanGitHub(options?: ScanOptions): Promise<{
    items: GitHubSearchItem[];
    totalCount: number;
}>;
//# sourceMappingURL=scanner.d.ts.map
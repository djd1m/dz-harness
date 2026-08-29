/**
 * OSSInsight trending repos scanner.
 *
 * API: GET https://api.ossinsight.io/v1/trends/repos/?period=past_week&language=All
 * No auth, 600 req/hr, returns top 100 trending repos by star velocity + activity.
 *
 * @packageDocumentation
 */
import type { RepoProfile } from '../types.js';
type Period = 'past_24_hours' | 'past_week' | 'past_month';
/** Fetch trending repos from OSSInsight, filtered by agent-skill signals. */
export declare function scanOssInsightTrending(options?: {
    period?: Period | undefined;
    language?: string | undefined;
    maxResults?: number | undefined;
}): Promise<RepoProfile[]>;
export {};
//# sourceMappingURL=ossinsight.d.ts.map
/**
 * Hacker News Algolia scanner — searches for agent-skill stories.
 *
 * API: GET https://hn.algolia.com/api/v1/search?query=... (no auth, no rate limit)
 *
 * @packageDocumentation
 */
import type { RepoProfile } from '../types.js';
/** Search HN for agent-skill stories. Returns as RepoProfiles with HN metadata. */
export declare function scanHN(options?: {
    maxPerQuery?: number | undefined;
    since?: string | undefined;
}): Promise<RepoProfile[]>;
//# sourceMappingURL=hn.d.ts.map
/**
 * npm Registry scanner — searches for agent-skill packages.
 *
 * API: GET /-/v1/search?text=keywords:<kw>&size=N (no auth, free)
 *
 * @packageDocumentation
 */
import type { RepoProfile } from '../types.js';
/** Search npm for agent-skill packages. Returns deduplicated RepoProfiles. */
export declare function scanNpm(options?: {
    maxPerKeyword?: number;
}): Promise<RepoProfile[]>;
//# sourceMappingURL=npm.d.ts.map
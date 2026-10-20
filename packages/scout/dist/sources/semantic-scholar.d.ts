/**
 * Semantic Scholar academic paper scanner.
 *
 * API: GET https://api.semanticscholar.org/graph/v1/paper/search?query=...
 * Free, 1 req/sec (auth), 5000/5min (unauth). JSON response.
 *
 * @packageDocumentation
 */
import type { RepoProfile } from '../types.js';
/** Search Semantic Scholar for agent-skill-related papers. */
export declare function scanSemanticScholar(options?: {
    maxPerQuery?: number | undefined;
    year?: string | undefined;
}): Promise<RepoProfile[]>;
//# sourceMappingURL=semantic-scholar.d.ts.map
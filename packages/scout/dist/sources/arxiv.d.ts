/**
 * arXiv preprint scanner.
 *
 * API: GET http://export.arxiv.org/api/query?search_query=...
 * Free, no auth, 3s delay between calls. Atom/XML response.
 *
 * @packageDocumentation
 */
import type { RepoProfile } from '../types.js';
/** Search arXiv for agent-skill-related preprints. */
export declare function scanArxiv(options?: {
    maxPerQuery?: number | undefined;
}): Promise<RepoProfile[]>;
//# sourceMappingURL=arxiv.d.ts.map
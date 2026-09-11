/**
 * arXiv preprint scanner.
 *
 * API: GET http://export.arxiv.org/api/query?search_query=...
 * Free, no auth, 3s delay between calls. Atom/XML response.
 *
 * @packageDocumentation
 */
import type { RepoProfile } from '../types.js';
/**
 * Пауза перед повтором при исчерпанном лимите: 5 с, затем 10 с.
 *
 * Вынесено ПАРАМЕТРОМ, а не спрятано в выражении, по одной причине: набор тестов, проверяющий
 * поведение при лимите, иначе ждал бы по-настоящему — и полминуты ожидания в наборе гарантированно
 * приводят к тому, что этот тест выключают.
 */
export declare const RATE_LIMIT_BACKOFF_MS = 5000;
/** Search arXiv for agent-skill-related preprints. */
export declare function scanArxiv(options?: {
    maxPerQuery?: number | undefined;
    backoffMs?: number | undefined;
}): Promise<RepoProfile[]>;
//# sourceMappingURL=arxiv.d.ts.map
/**
 * ECC source scanner — fetches skills from github.com/affaan-m/ECC.
 *
 * Unlike other sources that discover repos, this targets a single known repo
 * (ECC, 210K+ stars) and returns its skills as RepoProfiles for comparison
 * against the harness inventory.
 *
 * @packageDocumentation
 */
import type { RepoProfile } from '../types.js';
interface EccScanOptions {
    /** Maximum skill directories to fetch. Default 100 (GitHub API limit per page). */
    readonly limit?: number;
}
/**
 * Scan ECC for skill inventory. Returns a single RepoProfile representing the
 * ECC repo with skill count and novel skills list.
 */
export declare function scanEcc(options?: EccScanOptions): Promise<RepoProfile[]>;
export {};
//# sourceMappingURL=ecc.d.ts.map
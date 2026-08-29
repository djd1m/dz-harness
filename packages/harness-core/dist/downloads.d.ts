/**
 * npm download statistics — fetches weekly download counts for all published packages.
 *
 * @packageDocumentation
 */
/** Download stats for a single package. */
export interface PackageDownloads {
    readonly name: string;
    readonly downloads: number;
    readonly period: string;
    readonly error?: string | undefined;
}
/** Full downloads report. */
export interface DownloadsReport {
    readonly packages: readonly PackageDownloads[];
    readonly totalDownloads: number;
    readonly period: string;
    readonly fetchedAt: string;
}
/** Fetch downloads for all given package names. */
export declare function fetchAllDownloads(packageNames: string[]): Promise<DownloadsReport>;
//# sourceMappingURL=downloads.d.ts.map
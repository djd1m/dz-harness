/**
 * Upstream sync — fetches SKILL.md from origin repos defined in sources.json
 * and reports which skills have upstream changes.
 *
 * @packageDocumentation
 */
/** A single skill's source mapping. */
export interface SkillSource {
    readonly path: string;
    readonly version?: string | undefined;
    readonly trust?: string | undefined;
    readonly note?: string | undefined;
}
/** The origin repo metadata. */
export interface OriginMeta {
    readonly repo: string;
    readonly url: string;
    readonly branch: string;
    readonly license: string;
    readonly author: string;
    readonly canonicalized: string;
}
/** The sources.json schema. */
export interface SourcesManifest {
    readonly origin: OriginMeta;
    readonly skills: Record<string, SkillSource>;
}
/** Result of checking one skill against upstream. */
export interface UpstreamCheckResult {
    readonly skillId: string;
    readonly originPath: string;
    readonly status: 'up-to-date' | 'changed' | 'fetch-error' | 'local-missing';
    readonly localLines?: number | undefined;
    readonly upstreamLines?: number | undefined;
    readonly error?: string | undefined;
}
/** Result of a full upstream sync check. */
export interface SyncUpstreamReport {
    readonly origin: OriginMeta;
    readonly checked: number;
    readonly changed: number;
    readonly upToDate: number;
    readonly errors: number;
    readonly skills: readonly UpstreamCheckResult[];
}
/** Load sources.json from a skills package directory. */
export declare function loadSourcesManifest(packageDir: string): SourcesManifest | undefined;
/** Info about a package with external sources. */
export interface SourcePackageInfo {
    readonly name: string;
    readonly dir: string;
    readonly origin: OriginMeta;
    readonly skillCount: number;
}
/** Discover all packages with sources.json in the monorepo. */
export declare function discoverSourcePackages(monorepoRoot: string): SourcePackageInfo[];
/** Check all packages with sources.json against upstream. */
export declare function checkAllUpstream(monorepoRoot: string): Promise<SyncUpstreamReport[]>;
/**
 * Check all skills in a sources.json manifest against their upstream.
 * Compares line counts as a quick diff indicator (full diff would be too verbose).
 */
export declare function checkUpstream(packageDir: string): Promise<SyncUpstreamReport | undefined>;
//# sourceMappingURL=sync-upstream.d.ts.map
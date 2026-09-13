/**
 * Sibling-drift gate — feature `publish-sibling-drift-gate`, ADR-001 (Decision 1).
 *
 * `rewriteWorkspaceSpecs` (publish.ts) pins a sibling `workspace:^`/`workspace:~`/`workspace:*`
 * dependency to the EXACT version currently on disk. That version may be published on the
 * registry carrying an OLDER build than the workspace — the sibling changed without a version
 * bump. The pinned range then resolves at install time to a package that does not match the
 * workspace's current behavior, and a fresh `npm install` reproduces whatever regressed.
 *
 * Detection (ADR-001, Decision 1, alternative А3 — accepted): hash every file under the
 * published tarball's `dist/**` plus its `package.json` (with `version`/`gitHead`/`_*` fields
 * stripped, since those legitimately differ between the registry copy and the workspace copy),
 * and compare against the same hash of the workspace copy. Any difference is drift. A published
 * `dist/index.js` missing an export the workspace's `dist/index.js` declares is surfaced as a
 * SECOND, more readable signal (`missingExports`) — the exact shape of the 2026-09-13 incident
 * ("does not provide an export named …") — but the hash comparison is the load-bearing check:
 * it also catches behavior changes that keep every export name intact.
 *
 * Network access is NOT this module's concern (NFR-2: pure, no network, fixture-testable):
 * `fetchPublished` is injected. The CLI implementation packs the sibling from the registry via
 * `npm pack <name>@<version>` into a temp dir; tests inject a local directory. A fetch that
 * returns `null` (offline, 404, timeout) is reported as `'unavailable'` — never silently treated
 * as `'same'` (the "a gate that infers a pass from silence breaks on the next failure path"
 * lesson): the caller decides whether `'unavailable'` blocks or is overridden.
 *
 * @packageDocumentation
 */
export type SiblingDriftStatus = 'same' | 'drift' | 'unavailable';
export interface SiblingDriftResult {
    readonly name: string;
    readonly version: string;
    readonly status: SiblingDriftStatus;
    /** Relative paths (dist/** or package.json) whose hash differs, or is present on only one side. */
    readonly changedFiles: readonly string[];
    /** Export names the workspace's dist/index.js declares that the published one lacks (А2, secondary signal). */
    readonly missingExports: readonly string[];
    /** Present only when status === 'unavailable'. */
    readonly reason?: string;
}
export interface FetchedPublished {
    /** Directory holding the extracted published tarball (contains dist/, package.json). */
    readonly dir: string;
}
/** Fetch the published build of `name@version`. `null` = unavailable (network/404/timeout). */
export type FetchPublished = (name: string, version: string) => FetchedPublished | null;
export interface DetectSiblingDriftOptions {
    readonly dependencies: Record<string, string> | undefined;
    /** pnpm rewrites `workspace:` in peerDependencies too (mirrors findUnpublishedWorkspaceFloors). */
    readonly peerDependencies?: Record<string, string> | undefined;
    /** name -> version on DISK, for every package in the workspace. */
    readonly workspaceVersions: ReadonlyMap<string, string>;
    /** name -> absolute package dir on disk, for every package in the workspace. */
    readonly workspaceDirs: ReadonlyMap<string, string>;
    /** Names being published in THIS batch — they publish fresh, so drift cannot be measured against them. */
    readonly batch: ReadonlySet<string>;
    readonly fetchPublished: FetchPublished;
}
/**
 * For every `workspace:`-declared dependency of a package that is NOT part of `batch` (i.e. will
 * be pinned to whatever is already on the registry, not published fresh in this run), compare the
 * build that will be pinned against the workspace copy. Pure: all IO (fetch, fs) is either
 * injected or scoped to reading local dist/package.json files — no network call is made here.
 */
export declare function detectSiblingDrift(opts: DetectSiblingDriftOptions): SiblingDriftResult[];
//# sourceMappingURL=publish-sibling-drift.d.ts.map
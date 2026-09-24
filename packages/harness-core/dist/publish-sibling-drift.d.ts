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
/**
 * AM-6 (feature publish-gate-audit-durable): which mechanism produced BOTH sides' file inventory
 * for this comparison — named on every result, never left implicit. `'npm-pack'`: the caller
 * injected {@link DetectSiblingDriftOptions.localInventory} (the CLI's `npm pack --dry-run --json`
 * via {@link parseNpmPackInventory}); the workspace side is exactly what npm will ship, and the
 * published side is hashed by a FULL recursive walk of the already-unpacked tarball (AM-1 — the
 * two sides must be symmetric: "every file npm put there" on one side, "every file npm will put
 * there" on the other). `'readdir-approximation'`: no provider was injected — BOTH sides fall back
 * to the pre-existing `dist`/`files`/`bin` walk ({@link shippedInventoryDirs}), which stays
 * symmetric by construction (same function, same rules, both sides) but can miss a file
 * `.npmignore` excludes or include one npm would never ship.
 */
export type InventorySource = 'pack-artifact' | 'npm-pack' | 'pnpm-pack' | 'readdir-approximation';
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
    /**
     * AM-6: named per-result (not merely per-call) because `detectSiblingDrift` short-circuits to
     * `'unavailable'` before ever reaching the hashing step for some entries — those still carry the
     * source that WOULD have been used, so a reader never has to guess.
     */
    readonly inventorySource: InventorySource;
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
    /** AM-3: ships and pins exactly like `dependencies` — checked the same way. */
    readonly optionalDependencies?: Record<string, string> | undefined;
    /** name -> version on DISK, for every package in the workspace. */
    readonly workspaceVersions: ReadonlyMap<string, string>;
    /** name -> absolute package dir on disk, for every package in the workspace. */
    readonly workspaceDirs: ReadonlyMap<string, string>;
    /** Names being published in THIS batch — they publish fresh, so drift cannot be measured against them. */
    readonly batch: ReadonlySet<string>;
    readonly fetchPublished: FetchPublished;
    /**
     * FR-3 (feature publish-gate-audit-durable): the LOCAL (workspace) package's shipped-file
     * inventory, asked from npm instead of approximated by walking `dist`/`files`/`bin` by hand —
     * `.npmignore` and nested ignore rules make the hand-rolled walk wrong in both directions (a file
     * npm will never ship can still be read off disk, producing a false drift). No production default
     * lives in THIS module — core stays pure (never spawns `npm`, per the core-boundary import
     * ratchet). The CLI runs `npm pack --dry-run --json` and hands the stdout to
     * {@link parseNpmPackInventory}, then passes the resulting closure here; a caller that injects
     * nothing (`undefined`) makes `detectSiblingDrift` fall back to the named
     * `'readdir-approximation'` {@link InventorySource} on BOTH sides (AM-1) — never a silent "no
     * drift".
     */
    readonly localInventory?: LocalInventory;
    /** Label for the injected provider (default 'npm-pack'); CLI uses 'pack-artifact'. */
    readonly localInventorySource?: InventorySource;
}
/** The exact set of relative paths `npm pack` will ship for a package — no `.npmignore` guessing. */
export interface PackInventory {
    readonly paths: readonly string[];
}
/** `npm pack --dry-run --json` could not be run or answered in a shape this code cannot use. */
export interface PackInventoryUnavailable {
    readonly unavailable: string;
}
/**
 * Lead fix after the fix-round's live dry-run (2026-09-14 01:02): the workspace side PACKED BY THE
 * LIVE TRANSPORT (`pnpm pack`) and unpacked into `packedDir`. pnpm synthesises a LICENSE from the
 * workspace root into the tarball of a package whose own tree has none; `npm pack --dry-run --json`
 * never lists that file, so a `paths` inventory read every such sibling as "LICENSE only in the
 * published copy" — 2 false drifts (harness-presets, scout) on a tree unchanged since publication.
 * A packed tree is hashed by the SAME full walk as the published side, symmetric by construction.
 */
export interface PackedTree {
    readonly packedDir: string;
    /** Exact files from packArtifact().files; old providers may omit this. */
    readonly paths?: readonly string[];
}
export type LocalInventoryResult = PackInventory | PackedTree | PackInventoryUnavailable;
/** Ask what npm would ship for the package rooted at `dir`. Injected in tests (no subprocess). */
export type LocalInventory = (dir: string) => LocalInventoryResult;
/**
 * C-1/AM-4: `npm pack --dry-run --json` is a real subprocess call — the CLI caches its result per
 * absolute directory for the lifetime of ONE `dz publish` run (not per package being checked), so
 * a run that checks the same sibling from more than one dependent package packs it only once. Core
 * itself never runs the subprocess or owns the cache (core-boundary import ratchet) — this parser
 * is the pure half only.
 *
 * Parses `npm pack --dry-run --json`'s stdout (an array with one element; `files[]` holds
 * `{path,size,mode}` per shipped path, plus `integrity`/`shasum`/`entryCount`) into the exact set of
 * relative paths npm intends to ship, honouring `.npmignore`/`files`/default-ignore exactly the way
 * a real `npm publish` would. A failure to run, parse, or make sense of the shape — including a
 * malformed individual `files[]` element (AM-5: a corrupt entry is a reason to say the WHOLE
 * inventory is untrustworthy, never a file to silently drop) — is `{ unavailable: reason }`: an
 * input this gate cannot read is a reason to say so, never a silent "nothing to compare".
 */
export declare function parseNpmPackInventory(stdout: string): LocalInventoryResult;
/**
 * For every `workspace:`-declared dependency of a package that is NOT part of `batch` (i.e. will
 * be pinned to whatever is already on the registry, not published fresh in this run), compare the
 * build that will be pinned against the workspace copy. Pure: all IO (fetch, fs) is either
 * injected or scoped to reading local dist/package.json files — no network call is made here.
 */
export declare function detectSiblingDrift(opts: DetectSiblingDriftOptions): SiblingDriftResult[];
/** Named drift evidence for both the publish BLOCKED line and its durable audit row. */
export declare function formatDriftFiles(changedFiles: readonly string[], source: InventorySource, max?: number): string;
//# sourceMappingURL=publish-sibling-drift.d.ts.map
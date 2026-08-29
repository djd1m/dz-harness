/**
 * Automated publish — discovers changed packages, bumps patch versions,
 * builds, and publishes to npm.
 *
 * @packageDocumentation
 */
/** Result for a single package publish attempt. */
export interface PublishResult {
    readonly name: string;
    readonly oldVersion: string;
    readonly newVersion: string;
    readonly status: 'published' | 'skipped' | 'error';
    readonly error?: string | undefined;
    /**
     * Pre-publish claim-check summary for this package's README, present only when the
     * opt-in `claimCheck` gate ran (`'warn'`/`'block'`). Additive: absent by default so an
     * unmodified `publishPackages` call is byte-compatible with pre-gate behavior.
     */
    readonly claimCheck?: {
        readonly findings: number;
        readonly high: number;
    } | undefined;
}
/** Full publish report. */
export interface PublishReport {
    readonly packages: readonly PublishResult[];
    readonly published: number;
    readonly skipped: number;
    readonly errors: number;
    readonly dryRun: boolean;
}
/** Bump patch version: 0.3.11 → 0.3.12 */
export declare function bumpPatch(version: string): string;
/** Compare two x.y.z(-pre) versions by their core triple: >0 if a>b, <0 if a<b. */
export declare function compareVersions(a: string, b: string): number;
/**
 * Pure half: which `workspace:`-declared deps of a package would pack to a floor that is neither
 * being published in this batch nor already on the registry?
 *
 * Fail-closed by design: a probe that cannot answer (offline, 404) reports the floor as
 * unpublished — a publish needs the network anyway, and refusing beats shipping ETARGET.
 */
export declare function findUnpublishedWorkspaceFloors(opts: {
    readonly dependencies: Record<string, string> | undefined;
    /** pnpm rewrites `workspace:` in peerDependencies at pack time too (Codex P2) — same hazard. */
    readonly peerDependencies?: Record<string, string> | undefined;
    /** name → version on DISK, for every package in the workspace (what pnpm packs the floor from). */
    readonly workspaceVersions: ReadonlyMap<string, string>;
    /**
     * Names whose publish has LANDED (or, in a dry-run preview, would land) BEFORE this package.
     * Static batch membership is not enough (Codex P1): a sibling that failed its own gates earlier
     * in the batch has no published floor, and its dependents must fall through to the probe.
     */
    readonly batch: ReadonlySet<string>;
    readonly probe: (name: string, version: string) => boolean;
}): {
    name: string;
    version: string;
}[];
/**
 * `execSync` throws an Error whose `.message` is only `Command failed: <cmd>` — the child's real output
 * (the `npm ERR!` lines that say WHY a publish failed) sits on `.stdout` / `.stderr` and was being
 * dropped, so a failed release read as an undiagnosable dead end (observed: a provenance publish failed
 * in CI with nothing but "Command failed"). Fold the captured output into the reported error.
 */
export declare function formatPublishError(err: unknown): string;
export type ProvenanceMode = 'auto' | 'on' | 'off';
/**
 * The facts that mean an OIDC token can actually be minted.
 *
 * Cross-model review (codex exec, 2026-07-10): GitHub sets BOTH `ACTIONS_ID_TOKEN_REQUEST_URL` and
 * `ACTIONS_ID_TOKEN_REQUEST_TOKEN` when `permissions: id-token: write` is granted. Checking only the
 * URL would pass `--provenance` in a job where minting then fails.
 *
 * Honest limit: presence is not proof that a token can be minted (a stale or unreachable URL still
 * looks capable). npm fails loudly in that case; this guard only prevents the failure we can foresee.
 */
export declare function environmentCanMintProvenance(env: NodeJS.ProcessEnv): boolean;
export interface ProvenanceDecision {
    readonly useProvenance: boolean;
    readonly reason: string;
}
/**
 * `on` in an environment that cannot mint a token is an ERROR, not a downgrade: failing before the batch
 * starts beats failing halfway through 45 packages.
 *
 * `off` is an escape hatch for a registry outage, and it says so out loud — a safety check the caller can
 * quietly narrow is not a safety check.
 */
export declare function decideProvenance(mode: ProvenanceMode, env: NodeJS.ProcessEnv): ProvenanceDecision;
/** The exact command. A test asserts this string; nothing is assembled inline at the call site. */
export declare function publishArgv(mode: ProvenanceMode, env: NodeJS.ProcessEnv): string;
/** Discover all publishable @dzhechkov packages. */
export declare function discoverPackages(monorepoRoot: string): {
    name: string;
    dir: string;
    version: string;
}[];
/**
 * Find skill directories that exist on disk but are NOT covered by the package's
 * `files` whitelist — i.e. skills that would be **silently dropped** from the
 * published npm tarball (a `dz install` would not deliver them).
 *
 * A pack with no `files` array publishes everything, so nothing is missing. When a
 * `files` array is present, npm only ships the listed paths. A skill dir (`<name>/SKILL.md`)
 * is covered iff either its directory is selected, or EVERY regular file currently under that
 * skill has an exact/ancestor entry. Merely listing `SKILL.md` is not enough: that would let a
 * closed per-file allowlist silently drop a referenced script. Returns the sorted list of
 * incomplete skill directory names (empty = complete).
 */
export declare function findUnpackagedSkills(packDir: string): string[];
/**
 * Topologically order a publish set so every package is published AFTER its
 * `@dzhechkov` workspace dependencies **that are also in the set** (dependencies first).
 *
 * Why this matters: the loop bumps a package's version in its own package.json right
 * before publishing it, and `pnpm publish` rewrites a dependent's `workspace:*` to the
 * dependency's version *as it stands on disk at that moment*. If a dependent (harness-cli)
 * is published before its dependency (harness-core) is bumped, it pins the STALE version —
 * exactly the bug that shipped harness-cli@0.3.122 depending on harness-core@0.3.37 (which
 * lacked a newly-added export), crashing on startup. Deps-first ordering guarantees the
 * dependency is already bumped on disk when the dependent is published.
 *
 * Cycles (which the monorepo should not have) fall back to stable input order.
 */
export declare function orderByDependencies<T extends {
    name: string;
    dir: string;
}>(pkgs: T[]): T[];
/**
 * Sync a package's own README to a freshly-bumped version: every exact occurrence of the OLD
 * version token (optionally `v`-prefixed, word-bounded) becomes the new one.
 *
 * This kills the perpetual footer off-by-one: publish bumps package.json DURING publishing, so a
 * hand-synced "vX.Y.Z" status line was always one release behind on npmjs.com (or required
 * pre-setting the future version by hand). Exact-old-token matching keeps every other version
 * string (dependency pins, historical notes, examples citing other releases) untouched.
 * Returns the pre-sync README text for failure restore, or undefined when nothing was rewritten.
 *
 * Bootstrap invariant: exact-token matching MAINTAINS sync but cannot REPAIR pre-existing drift
 * (a footer already one release behind contains a token != oldVersion and is skipped). Bring the
 * footer to the current package.json version once; the mechanism owns it from then on.
 */
export declare function syncReadmeVersion(dir: string, oldVersion: string, newVersion: string): string | undefined;
/**
 * Is this line a CHANGELOG ENTRY for `version` — the heading that documents what that release was?
 *
 * The reason this predicate exists is a falsification measured on 2026-08-25. `syncReadmeVersion`
 * rewrote EVERY occurrence of the outgoing version, and its own comment claimed that "historical
 * notes citing other releases" stayed untouched. That is true for every version EXCEPT the one that
 * matters most: the entry describing the release being superseded. Publishing 0.7.6 → 0.7.7 rewrote
 * the `0.7.6` changelog heading to `0.7.7`, so the README shipped to npm claimed the previous
 * release's contents belonged to the new one — and it had been doing so for several releases, with
 * four headings in one file collapsed onto a single version.
 *
 * The shape is unambiguous in these READMEs: an entry opens its line with the version in backticks,
 * followed by an em- or en-dash. A footer sentence, a badge, an install example or a dependency pin
 * never looks like that, so the lock-step feature keeps working everywhere it was meant to.
 */
export declare function isChangelogEntryLine(line: string, version: string): boolean;
/**
 * The line indices of the CHANGELOG REGION: from the first entry heading to the next markdown
 * heading (or end of file). Every line in it is history and is never version-rewritten.
 *
 * Protecting only the entry's own LINE was not enough, and the gap was visible on npm within the
 * hour: `skills-feature-adr`'s entry for the Step-7 blocker fix opened with its heading and then
 * said in PROSE "`1.5.2` shipped a workflow that called three helpers it never defined". Two
 * successive publishes rewrote that citation forward, and the shipped README ended up claiming the
 * same version both introduced the bug and fixed it. A record's body is as much a record as its
 * title.
 *
 * The region ENDS at the next heading rather than at end-of-file on purpose: two of these READMEs
 * carry ordinary sections after Status, and over-protecting them would silently stop the lock-step
 * sync where it is still wanted.
 */
export declare function changelogRegion(lines: readonly string[]): Set<number>;
/** Publish packages that have changes since last publish. */
export declare function publishPackages(monorepoRoot: string, opts?: {
    dryRun?: boolean | undefined;
    filter?: string[] | undefined;
    bumpOnly?: boolean | undefined;
    /**
     * Path to the Ed25519 signing key, OUTSIDE the repository. A pack that carries a
     * `.dz-manifest.json` must be re-signed after publish's own bump and README sync, or the tarball
     * ships an inventory it already invalidated. Absent + a signed pack ⇒ publish REFUSES that pack.
     */
    signKey?: string | undefined;
    /**
     * How to actually re-sign. Injected rather than imported so this module stays free of the CLI's
     * manifest writer, and so a test can observe the call without touching a real key.
     */
    reSign?: ((packDir: string, keyPath: string) => void) | undefined;
    /**
     * Verify the pack against the trust root a CONSUMER would use, after re-signing. Injected for the
     * same reason as `reSign`: this module stays free of the verifier, and a test can drive both
     * outcomes without a real key.
     */
    verifyAfterSign?: ((packDir: string) => {
        ok: boolean;
        trustRootPresent: boolean;
        pack?: string;
    }) | undefined;
    /**
     * Pre-publish claim-check gate over each package's README (ADR-001). Default `'warn'`:
     * records the finding count on the result but NEVER changes publish status — additive, so the
     * existing publish path and its tests are unaffected. `'error'` flips ONLY a package with a
     * `high` finding to `status: 'error'`, leaving the rest of the batch unaffected. `'off'`
     * disables the gate entirely (no `claimCheck` field is emitted).
     */
    claimGate?: 'off' | 'warn' | 'error' | undefined;
    /** ADR-001: `auto` (default) decides from the environment; `on` fails where it cannot work. */
    provenance?: ProvenanceMode | undefined;
    /**
     * Floor probe injection for the workspace-floor preflight (see
     * `findUnpublishedWorkspaceFloors`). Default: a real `npm view` probe, which runs only on LIVE
     * publishes — dry-run stays offline, matching `maxPublished`. Injecting a probe also arms the
     * preflight under dry-run, which is how the wiring test drives it without network.
     */
    probeFloor?: ((name: string, version: string) => boolean) | undefined;
}): PublishReport;
//# sourceMappingURL=publish.d.ts.map
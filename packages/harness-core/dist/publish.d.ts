/**
 * Automated publish — discovers changed packages, bumps patch versions,
 * builds, and publishes to npm.
 *
 * @packageDocumentation
 */
import { execSync } from 'node:child_process';
type ExecSyncOptionsWithStringEncoding = NonNullable<Parameters<typeof execSync>[1]> & {
    encoding: 'utf-8';
};
export type ProbeOutcome = {
    readonly attempt: number;
    readonly ok: boolean;
    readonly stdout: string;
    readonly stderr: string;
    readonly code: number | null;
    readonly ms: number;
};
export declare const REGISTRY_PROBE_BUDGET = 90;
export declare const REGISTRY_PROBE_INTERVAL_MS = 10000;
export type RegistryProbe = {
    kind: 'published';
    version: string;
    scripted?: true;
} | {
    kind: 'never-published';
    scripted?: true;
} | {
    kind: 'unknown';
    reason: string;
    scripted?: true;
};
/**
 * Scripted registry seam for tests that spawn the REAL bin and therefore cannot inject `exec`
 * (first-publish-not-offline AM-A; same shape as `WF_RUN_DISPATCH_SCRIPT_ENV`). Value: path to a JSON
 * file `{ "<name>": "<x.y.z>" | "E404" | "<npm code>" }`. When set, no `npm view` runs at all and EVERY
 * row carries `probeOverride: true` — a scripted plan can never read as a verified one.
 */
export declare const PUBLISH_PROBE_SCRIPT_ENV = "DZ_PUBLISH_PROBE_SCRIPT";
/** Result for a single package publish attempt. */
export interface PublishResult {
    readonly name: string;
    readonly oldVersion: string;
    readonly newVersion: string;
    readonly status: 'published' | 'skipped' | 'error';
    readonly firstPublish?: boolean;
    readonly probe?: RegistryProbe['kind'];
    /** Present (true) only when `DZ_PUBLISH_PROBE_SCRIPT` answered instead of the registry. */
    readonly probeOverride?: boolean;
    readonly error?: string | undefined;
    /** Live publish only: how many registry probes were needed to confirm the exact new version. */
    readonly registryProbes?: number | undefined;
    /** Live publish only: complete evidence from every registry receipt probe. */
    readonly probeLog?: readonly ProbeOutcome[] | undefined;
    /**
     * Pre-publish claim-check summary for this package's README, present only when the
     * opt-in `claimCheck` gate ran (`'warn'`/`'block'`). Additive: absent by default so an
     * unmodified `publishPackages` call is byte-compatible with pre-gate behavior.
     */
    readonly claimCheck?: {
        readonly findings: number;
        readonly high: number;
    } | undefined;
    /**
     * FR-3 (feature publish-readme-stamp-scope): a preview of what `planReadmeVersionSync` would do
     * (dry-run) or already did (live) to this package's own README.md — never silent about the
     * lock-step sync. `lines` are the 1-based line numbers actually rewritten; `skippedHistorical` is
     * a TOKEN count (changelog-region entries + tokens outside every recognised ALLOWLIST shape), not
     * a line count; `historyLines` names WHERE those kept-as-history tokens sit (fix-round 1, Codex
     * HIGH: "history has only an aggregate count, not locations"). Absent when the package has no
     * README.md, or on an 'error' result where the sync never ran/mattered.
     */
    readonly readmeSync?: {
        readonly rewrittenLines: number;
        readonly lines: readonly number[];
        readonly skippedHistorical: number;
        readonly historyLines: readonly number[];
    } | undefined;
    /**
     * DRY-RUN ONLY, and the reason it exists is a measured incident. A dry run short-circuits
     * BEFORE build, sign and pack (see the `opts.dryRun` branch below), so the package's own
     * `prepublishOnly` gate never executes. On 2026-09-02 a clean dry run was read as evidence that
     * publication would succeed; the real gate was RED — a stale signature baseline plus six
     * `__pycache__/*.pyc` files already signed into the manifest. A preview that names only what it
     * DID check reads as a pass for everything it skipped, which is the same failure class as a gate
     * that infers success from silence. So a dry-run result carries the list of gates it did NOT run,
     * and the CLI prints it. Absent on a real publish, where every gate actually ran.
     */
    readonly notVerified?: readonly string[] | undefined;
    /**
     * AM-1 (feature publish-sibling-drift-gate): sha256 of the EXACT tarball bytes that were
     * packed-install-smoked AND handed to `npm publish` — present only when `opts.packedTransport`
     * was used for a live (non-dry-run) publish. Printed and audited so "the smoke tested the same
     * bytes that shipped" is a checkable claim, not an architectural assertion.
     */
    readonly sha256?: string | undefined;
}
/**
 * One package's packed, smoke-eligible artifact — the unit `opts.packedTransport.smoke` receives
 * (AM-1). Produced ONCE per package, after its OWN bump/build/sign steps, from a package.json
 * whose `workspace:` specs are already resolved to each sibling's PINNED version (the same
 * transformation `rewriteWorkspaceSpecs` performs) — so the tarball is exactly what `npm publish
 * <tgzPath>` will later ship, byte for byte.
 */
export interface PackedTarballArtifact {
    readonly name: string;
    readonly newVersion: string;
    readonly tgzPath: string;
    readonly sha256: string;
}
export interface PackedTransportSmokeVerdict {
    readonly ok: boolean;
    readonly reason?: string | undefined;
}
/** Positive read-back evidence returned by the configured public-mirror command. */
export interface MirrorReceipt {
    readonly manifestUrl: string;
    readonly confirmedAt: string;
    readonly waitedMs: number;
}
/**
 * State of the optional post-publish mirror epilogue. This is report data only: harness-core does
 * not execute the hook or perform mirror I/O.
 */
export interface MirrorEpilogue {
    readonly status: 'confirmed' | 'unconfirmed' | 'skipped' | 'not-configured';
    readonly command: string;
    readonly commit?: string | undefined;
    readonly receipt?: MirrorReceipt | undefined;
    readonly error?: string | undefined;
    readonly reason?: string | undefined;
    readonly warning?: string | undefined;
}
/** Full publish report. */
export interface PublishReport {
    readonly packages: readonly PublishResult[];
    readonly published: number;
    readonly skipped: number;
    readonly errors: number;
    readonly dryRun: boolean;
    /** Repo-relative README paths whose first joint core/CLI release line was rewritten. */
    readonly releaseLineSynced: readonly string[];
    /** Post-publication sync failures are warnings: registry-confirmed packages cannot be unpublished. */
    readonly warnings?: readonly string[] | undefined;
    /** CLI-owned command-hook outcome after a live publish; no transport logic lives in core. */
    readonly mirror?: MirrorEpilogue | undefined;
}
/** Bump patch version: 0.3.11 → 0.3.12 */
export declare function bumpPatch(version: string): string;
/** Compare two x.y.z(-pre) versions by their core triple: >0 if a>b, <0 if a<b. */
export declare function compareVersions(a: string, b: string): number;
type PublishExec = (command: string, options: ExecSyncOptionsWithStringEncoding) => string;
/** Only explicit npm absence signals establish that a package has never been published. */
export declare function classifyRegistryProbe(stderr: string, message: string): RegistryProbe;
/**
 * Mirror pnpm's package-time expansion of the three shorthand workspace dependency specs.
 * Pure by construction: callers provide both the source bytes and the sibling version table.
 */
export declare function rewriteWorkspaceSpecs(pkgJsonText: string, siblingVersions: ReadonlyMap<string, string>): string;
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
/** Registry probe: preserve the complete answer while checking for the exact `name@version`. */
export declare function probeVersion(name: string, version: string, exec?: PublishExec): Omit<ProbeOutcome, 'attempt'>;
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
/** Match substrings against package identity and path without including the checkout root. */
export declare function matchesPublishFilter(pkg: {
    name: string;
    dir: string;
}, filter: string, monorepoRoot: string): boolean;
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
/** One README line the sync touched: 1-based line number, and the line before/after the rewrite. */
export interface ReadmeSyncRewrite {
    readonly line: number;
    readonly before: string;
    readonly after: string;
}
/** The report `planReadmeVersionSync` returns — never silent about what it did and did not touch. */
export interface ReadmeVersionSyncPlan {
    readonly text: string;
    readonly rewritten: readonly ReadmeSyncRewrite[];
    /** Count of OLD-VERSION token OCCURRENCES left untouched as history (changelog region + every
     *  token outside every recognised ALLOWLIST shape — FR-1). */
    readonly skippedHistorical: number;
    /** The 1-based line numbers carrying at least one of those kept-as-history tokens (fix-round 1,
     *  Codex HIGH: "history has only an aggregate count, not locations; rewritten lines have
     *  numbers"). Deduplicated and sorted ascending — a line with two skipped tokens appears once. */
    readonly historyLines: readonly number[];
}
/**
 * Plan how a README's OLD-VERSION tokens would move to NEW-VERSION — a pure function, no I/O.
 *
 * FR-1 (allowlist, not denylist). Outside a changelog region (FR-2: EVERY entry-shaped run, not
 * only the first — see `changelogRegion`), a token rewrites ONLY when `isAllowlistedRewriteContext`
 * recognises its shape; every other token — historical prose of ANY form — is left untouched by
 * default. A `<!-- dz:version -->` marker on the line forces the rewrite regardless of either
 * protection (AC-3).
 *
 * FR-3 (never silent): every rewritten line is reported with its line number and before/after text;
 * every token left untouched as history is counted AND located, whether the reason was the
 * changelog region or simply not matching any allowlist shape.
 */
export declare function planReadmeVersionSync(text: string, oldVersion: string, newVersion: string): ReadmeVersionSyncPlan;
/**
 * Sync a package's own README to a freshly-bumped version — a thin, atomic-write wrapper around
 * `planReadmeVersionSync`. Returns the pre-sync README text for failure restore, or undefined when
 * nothing was rewritten (same contract as before this function grew a real plan underneath it —
 * `dz publish`'s report reads the plan via `planReadmeVersionSync` directly; this wrapper's return
 * value stays exactly what its callers already depend on).
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
 *
 * MEASURED 2026-09-15 (00_complexity_assessment.md, feature publish-readme-stamp-scope): this
 * function protected only the FIRST such run. A second `## Status` heading further down the SAME
 * README opens a SECOND entry-shaped run (`memory` 0.2.21/0.2.22 sat under a later `## Status`,
 * after an earlier `0.1.0` entry whose region had already ended) — and that second run was bare,
 * so its entries got relabelled by the next bump exactly like the 2026-08-25 incident this function
 * was written to stop. FR-2: EVERY entry-shaped run in the document is protected, not only the
 * first — the scan restarts after each run ends instead of stopping there.
 */
export declare function changelogRegion(lines: readonly string[]): Set<number>;
/** Publish packages that have changes since last publish. */
export declare function publishPackages(monorepoRoot: string, opts?: {
    dryRun?: boolean | undefined;
    filter?: string[] | undefined;
    /** Exact CLI-selected batch; an empty list means no targets. Discovery remains unfiltered. */
    targetNames?: readonly string[] | undefined;
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
     * publishes. Injecting a probe also arms this floor preflight under dry-run. The package's
     * own registry classification runs in both live and dry-run modes independently.
     */
    probeFloor?: ((name: string, version: string) => boolean) | undefined;
    /** Subprocess injection for tests; the default is Node's synchronous executor. */
    exec?: PublishExec | undefined;
    /** Post-publish receipt probe. The default asks npm for exactly `name@version`. */
    probe?: ((name: string, version: string) => boolean | Omit<ProbeOutcome, 'attempt'>) | undefined;
    /** Pause injection between receipt probes. The default blocks for the requested milliseconds. */
    sleep?: ((milliseconds: number) => void) | undefined;
    /**
     * AM-1 (feature publish-sibling-drift-gate). OPT-IN — omitted (the default), this function is
     * byte-identical to its pre-amendment self: every package still publishes via `pnpm publish`
     * FROM ITS DIRECTORY (`publishArgv`), exactly as every existing test of this function expects.
     *
     * When provided, the transport for THIS call's batch changes: each package is packed ONCE
     * (after its own bump/build/sign, workspace: specs resolved to each sibling's PINNED version —
     * a landed batch sibling's NEW version, an out-of-batch sibling's disk version, mirroring what
     * `rewriteWorkspaceSpecs`/pnpm itself would resolve), collected, and `smoke` is called with
     * EVERY package's packed artifact before ANY of them is published. Only on `smoke.ok === true`
     * does each artifact get `npm publish <tgzPath>` — the exact bytes that were smoked (a sha256
     * recheck immediately before that call refuses on any mismatch, defending the "same bytes"
     * claim against anything that could touch the tarball in between).
     */
    packedTransport?: {
        /** Absolute, pre-created directory to write tarballs into (this function never mkdirs it). */
        readonly packDestDir: string;
        /** Judge the WHOLE batch's packed artifacts together — nothing publishes until this passes. */
        readonly smoke: (artifacts: readonly PackedTarballArtifact[]) => PackedTransportSmokeVerdict;
    } | undefined;
}): PublishReport;
export {};
//# sourceMappingURL=publish.d.ts.map
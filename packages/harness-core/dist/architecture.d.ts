/**
 * Product architecture lens (feature product-architecture-lens, ADR-001).
 *
 * A deterministic, LLM-free extractor that renders the product as its INTENT layer — the curated
 * subsystems from `architecture/subsystems.manifest.json` (grounded in the harness-cli README's 5 jobs) —
 * merged with the code-derived workspace graph. It is pure (no I/O, no clock, no randomness) so the same
 * tree always yields byte-identical output (ADR-001 Decision 1) and it is cheap enough to rebuild at the
 * end of every feature-adr run (FR-3). The map/render/drift functions are pure; the load and scan
 * helpers at the bottom do the disk I/O for the CLI and the feature-adr end-of-run auto-update.
 */
/** One curated subsystem — the top-layer intent node. */
export interface Subsystem {
    readonly id: string;
    readonly label: string;
    /** The README "job" number (1–5), or null for foundation/arsenal/ops. */
    readonly job: number | null;
    readonly desc: string;
    /** Exact package names (without the `@dzhechkov/` scope) that belong here. */
    readonly packages: readonly string[];
    /** Prefix globs like `adapter-*`, `skills-*`. */
    readonly packagePatterns: readonly string[];
    /** dz command names that belong to this subsystem. */
    readonly commands: readonly string[];
}
export interface SubsystemManifest {
    readonly version: number;
    readonly subsystems: readonly Subsystem[];
}
/** A workspace package as scanned from disk (name minus scope + its internal `@dzhechkov/*` deps, unscoped). */
export interface ScannedPackage {
    readonly name: string;
    readonly internalDeps: readonly string[];
}
/** A subsystem populated with the packages/commands assigned to it. */
export interface MapSubsystem {
    readonly id: string;
    readonly label: string;
    readonly job: number | null;
    readonly desc: string;
    readonly packages: readonly string[];
    readonly commands: readonly string[];
}
/** A directed edge between two subsystems (aggregated from package-level deps; self-edges dropped). */
export interface SubsystemEdge {
    readonly from: string;
    readonly to: string;
}
export interface ArchitectureMap {
    readonly subsystems: readonly MapSubsystem[];
    readonly edges: readonly SubsystemEdge[];
    /** Packages present on disk that matched NO subsystem — the "product grew, map doesn't know it" signal. */
    readonly unassigned: readonly string[];
}
/** Which subsystem owns a package? First match in manifest order wins (deterministic). null ⇒ unassigned. */
export declare function subsystemOf(manifest: SubsystemManifest, pkg: string): string | null;
/**
 * Build the product map from the curated manifest + the scanned workspace. PURE + deterministic:
 * every list is sorted, no clock/random, so two runs on the same inputs are byte-identical (ADR-001 §1).
 */
export declare function buildArchitectureMap(manifest: SubsystemManifest, packages: readonly ScannedPackage[]): ArchitectureMap;
/** A drift finding: the product on disk diverged from the curated map (FR-1/FR-6). */
export interface DriftReport {
    /** Git-tracked packages present on disk that matched NO subsystem (the "product grew" signal). */
    readonly unassigned: readonly string[];
    /** A dz command claimed by more than one subsystem in the manifest (an intent contradiction). */
    readonly duplicateCommands: readonly {
        readonly command: string;
        readonly subsystems: readonly string[];
    }[];
    /** True ⇔ no drift of either kind. */
    readonly clean: boolean;
}
/**
 * Compare a built map against reality and report drift. PURE (ADR-001 §1). Two signals:
 *  1. Unassigned packages — but ONLY those that are git-TRACKED (`trackedPackages`), so a scratch or
 *     gitignored package dir never manufactures false drift (FR-6, the git-aware requirement).
 *  2. A command owned by ≥2 subsystems — a manifest contradiction (one command can't be two jobs).
 * Everything is sorted, so the report is deterministic.
 */
export declare function findArchitectureDrift(map: ArchitectureMap, trackedPackages: ReadonlySet<string>): DriftReport;
/** Human render of a DriftReport for `dz architecture --revise`. Deterministic. */
export declare function renderDriftReport(report: DriftReport): string;
/**
 * Scan `packages/@dzhechkov/*` into `ScannedPackage[]` (unscoped name + unscoped internal deps). Impure
 * I/O helper (lazy `require`, never throws) shared by the CLI and the feature-adr end-of-run auto-update
 * (FR-3), so both build the map from the identical scan. Deterministic: output is sorted.
 */
export declare function scanWorkspacePackages(repoRoot: string): ScannedPackage[];
/** A proposed feature, as known at feature-adr Step 0 (before it exists). */
export interface FeatureDescriptor {
    readonly slug: string;
    readonly description: string;
    /** Command names this feature proposes to ADD (the strong drift signal is an exact collision). */
    readonly proposedCommands?: readonly string[];
    /** The subsystem this feature targets, if the router knows it (sharpens the duplicate check). */
    readonly targetSubsystem?: string;
}
export type ArchSignal = 'ok' | 'soft-warn' | 'block';
export interface ArchCheckResult {
    readonly signal: ArchSignal;
    /** 0..1 — the strongest single tension found. */
    readonly confidence: number;
    readonly reason: string;
    /** Every tension line, for the panel. */
    readonly details: readonly string[];
}
/** Confidence knobs. Exposed so the mutation test can lower the bar and prove false-positives appear (FR-8). */
export interface ArchCheckThresholds {
    /** ≥ this ⇒ `block` (hard-stop). Default 0.85 — only exact command duplication clears it. */
    readonly hardStop: number;
    /** ≥ this (and < hardStop) ⇒ `soft-warn`. Default 0.5. */
    readonly softWarn: number;
}
export declare const DEFAULT_ARCH_THRESHOLDS: ArchCheckThresholds;
/**
 * Сверка: compare a proposed feature against the product map + vision. PURE + deterministic. Returns
 * `{signal, confidence, reason, details}`. CATEGORY-gated (Decision 3, hardened after cross-model QE):
 * a `block` fires ONLY from a block-eligible signal — an EXACT command duplication — whose confidence
 * clears `hardStop`. Boundary tension and stem overlap are structurally advisory: they can never block
 * at ANY threshold (confidence alone is not policy-safe — a low custom `hardStop` must not promote soft
 * evidence to a hard-stop). FR-8: on the current product's real features this yields ZERO blocks.
 */
export declare function checkFeatureAgainstArchitecture(feature: FeatureDescriptor, map: ArchitectureMap, vision: string | null, thresholds?: ArchCheckThresholds): ArchCheckResult;
/** Human render of a сверка result for the feature-adr Step-0 panel. Deterministic. */
export declare function renderArchCheck(result: ArchCheckResult): string;
/** Load the curated subsystem manifest (`architecture/subsystems.manifest.json`). Impure; null when absent/invalid. */
export declare function loadSubsystemManifest(repoRoot: string): SubsystemManifest | null;
/**
 * Load the curated product vision (`architecture/vision.md`) — the human-readable compass feature-adr
 * folds into Step 0 (FR-4/FR-5). Thin I/O helper: never throws; returns the text, or null when absent.
 */
export declare function loadProductVision(repoRoot: string): string | null;
/** Compact human view — the "picture back in your head in 30 seconds" render (FR-2). Deterministic. */
export declare function renderMapHuman(map: ArchitectureMap): string;
//# sourceMappingURL=architecture.d.ts.map
/**
 * Target-parity model (`dz parity`, feature target-parity-matrix, ADR-001).
 *
 * The honest map of "which harness feature works on which target, and HOW". The matrix does NOT
 * exist as a hand-written document anywhere (the sitedoc lesson, b57e686: a hand-maintained
 * duplicate list is a second drift surface) — this declarative model is the ONLY source, and the
 * table is always COMPUTED from it.
 *
 * Honesty contract (FR-6): a capability flag states only what has been VERIFIED, each with its
 * source in a comment. Unknown support is NOT flagged — a feature falsely promised on a target
 * is worse than one conservatively marked absent.
 *
 * Derivation anchor (FR-4): `TARGET_CAPABILITIES` is typed `Record<TargetName, …>`, so ADDING an
 * 11th target to the registry refuses to compile until it is classified here; the model test
 * re-asserts coverage at runtime and validates every capability reference.
 *
 * @packageDocumentation
 */
import type { TargetName } from './targets.js';
/** Runtime capabilities a target platform can provide to harness features. */
export type RuntimeCapability = 'shell' | 'skills' | 'hooks-write' | 'hooks-shell' | 'hooks-prompt' | 'mcp' | 'mcp-configured' | 'workflows' | 'statusline';
/** All declared capabilities — the closed vocabulary the model test validates references against. */
export declare const RUNTIME_CAPABILITIES: readonly RuntimeCapability[];
/**
 * What each target has been VERIFIED to provide (FR-6: source per line; conservative — an
 * unverified capability stays absent until proven, never assumed).
 */
export declare const TARGET_CAPABILITIES: Record<TargetName, readonly RuntimeCapability[]>;
/**
 * WHY each capability grant is believed, as machine-readable DATA (AM-22).
 *
 * `parity.ts` has declared an honesty contract in prose since day one — *"a capability flag states
 * only what has been VERIFIED, each with its source in a comment"*. A comment is documentation, not
 * a gate. The pinned map in `parity.test.ts` catches an ACCIDENTAL capability, but updating a pin is
 * a mechanical edit that demands no evidence, so the contract had no layer-1 half.
 *
 * This is that half. `parity_no_capability_grant_without_evidence` fails when a target declares a
 * capability with no record here, when a `transcript` record points at a file that does not exist,
 * or when **any cell computes `full` on a target whose deciding capability has no transcript**.
 *
 * `kind: 'transcript'` means a recorded live run is on disk at `evidence`; `kind: 'reproducer'`
 * means `evidence` is a command anyone can re-run.
 */
export interface CapabilityEvidence {
    readonly evidence: string;
    readonly kind: 'transcript' | 'reproducer';
    /** ISO date the evidence was produced. Stale evidence is still evidence — silence is not. */
    readonly at: string;
    /**
     * The RUNTIME VERSION the evidence was measured on, verbatim from the runtime's own `--version`
     * (e.g. `codex-cli 0.147.0`).
     *
     * ADR-006 pins capability grants to a runtime version, and the gate enforced only that a record
     * existed and its file was on disk — so evidence recorded on codex 0.147 kept a grant alive on
     * the installed 0.148 (independent review, finding 3). A hook registry is exactly the kind of
     * surface a minor version moves. When this is set and the caller supplies a PROBED version that
     * differs, the grant is reported `stale-runtime-version` — INCONCLUSIVE, not revoked: the fix is
     * a fresh probe, and an absent probe flips nothing.
     */
    readonly runtimeVersion?: string;
}
export declare const CAPABILITY_EVIDENCE: Record<TargetName, Partial<Record<RuntimeCapability, CapabilityEvidence>>>;
export interface UnbackedCapability {
    readonly target: TargetName;
    readonly capability: RuntimeCapability;
    /**
     * `stale-runtime-version` is INCONCLUSIVE, not a refutation: the grant was proven, on a runtime
     * that is no longer the installed one. It clears when a current-version probe is recorded.
     */
    readonly reason: 'no-evidence-record' | 'dangling-transcript' | 'stale-runtime-version';
    readonly evidence?: string;
    /** `recorded → probed`, for the stale case. */
    readonly recordedVersion?: string;
    readonly probedVersion?: string;
}
/**
 * Runtime versions observed NOW, keyed by target — injected, never probed here (this module is
 * pure). An absent entry means "not probed", which flips nothing.
 */
export type ProbedRuntimeVersions = Partial<Record<TargetName, string>>;
/**
 * Every capability grant that is NOT backed by usable evidence.
 *
 * PURE, with the filesystem injected as `transcriptExists`. That is deliberate: the property this
 * enforces — *a grant with a dangling transcript is not a grant* — has to be provable without a
 * repository on disk, or the mutation gate (which copies the PACKAGE, not the repo) could never
 * turn its mutant red, and an unkillable mutant is a false green wearing a gate's clothes.
 */
export declare function findUnbackedCapabilities(transcriptExists: (path: string) => boolean, capabilities?: Record<TargetName, readonly RuntimeCapability[]>, evidence?: Record<TargetName, Partial<Record<RuntimeCapability, CapabilityEvidence>>>, probedVersions?: ProbedRuntimeVersions): UnbackedCapability[];
/**
 * The newest runtime version recorded among a target's TRANSCRIPT evidence, or `null`.
 *
 * This is what makes staleness detectable WITHOUT running anything: the records date themselves
 * against each other. `dz parity` computes a matrix and must keep doing so deterministically — a
 * `codex --version` subprocess inside it would make a pure report depend on the machine it prints
 * on. Re-probing one capability is what dates the others (fix round 2, R2-3).
 */
export declare function newestRecordedRuntimeVersion(target: TargetName, evidence?: Record<TargetName, Partial<Record<RuntimeCapability, CapabilityEvidence>>>): string | null;
/**
 * Transcript evidence that is out of date with the newest record for its own target.
 *
 * SCOPE, stated because it is a judgement and not a derivation: the version rule applies to
 * `kind: 'transcript'` records only. A transcript FREEZES one runtime moment, so it can go stale; a
 * `reproducer` is a command anyone can re-run, and calling it stale would report `dz --version` as
 * expired. A transcript with NO `runtimeVersion` is stale too — an undated observation cannot be
 * shown to be current.
 *
 * INCONCLUSIVE, never a refutation: the grant is not withdrawn, it is awaiting its re-probe.
 */
export declare function findStaleTranscriptEvidence(capabilities?: Record<TargetName, readonly RuntimeCapability[]>, evidence?: Record<TargetName, Partial<Record<RuntimeCapability, CapabilityEvidence>>>): UnbackedCapability[];
/** How a feature manifests on a platform: a concrete FORM with its runtime requirements. */
export interface FeatureForm {
    /** Human-readable name of the form, shown as the `via` of a parity cell (AM-2). */
    readonly form: string;
    readonly requires: readonly RuntimeCapability[];
    /** `full` = the complete experience; `manual` = works, but the user drives it by hand. */
    readonly level: 'full' | 'manual';
}
export interface ParityFeature {
    readonly id: string;
    readonly title: string;
    readonly forms: readonly FeatureForm[];
}
/**
 * The harness feature inventory for the parity map. A feature may carry SEVERAL forms — parity
 * for a target is the BEST form whose requirements the target provides (e.g. claim-check: the
 * hook form is automatic on every Write/Edit; the CLI form works anywhere but must be invoked).
 */
export declare const PARITY_FEATURES: readonly ParityFeature[];
/**
 * Short column labels for the grid renderer — kept NEXT TO the model and covered by the same
 * coverage test (a hand map in the CLI would be a second, unchecked target registry).
 */
export declare const TARGET_SHORT_LABELS: Record<TargetName, string>;
/**
 * The quality-GATE class of features — what the scaffolded gates doc lists under "Gates runnable
 * here" (a full parity dump put "Skill packs — full" under a gates heading; delivery finding).
 * Must stay a subset of PARITY_FEATURES ids (pinned by test).
 */
export declare const GATE_FEATURE_IDS: readonly string[];
/** One computed parity cell: the best available form for a feature on a target. */
export interface ParityCell {
    readonly level: 'full' | 'manual' | 'none';
    /** Which form delivers it (absent only when level is `none`) — AM-2: "partial" must name its path. */
    readonly via?: string | undefined;
}
/** Compute the parity cell for one feature on one target (pure; best form wins, `full` first). */
export declare function computeParity(feature: ParityFeature, capabilities: readonly RuntimeCapability[]): ParityCell;
/**
 * A parity cell AS REPORTED — the computed level, plus the one thing the computation cannot know:
 * whether the evidence behind the deciding capability is still current.
 *
 * `inconclusive` is a REPORTING level, not a model level: `computeParity` keeps answering the
 * capability question, and this layer answers the evidence question. Keeping them apart is what
 * lets the matrix stay a pure function of the capability model.
 */
export interface ParityReportCell {
    readonly level: 'full' | 'manual' | 'none' | 'inconclusive';
    readonly via?: string | undefined;
    /** The stale capabilities the deciding form depends on (present only when `inconclusive`). */
    readonly staleEvidence?: readonly RuntimeCapability[];
}
/**
 * Downgrade a cell whose DECIDING form rests on stale evidence to `inconclusive`.
 *
 * The round-1 gate could tell that `hooks-prompt` evidence was stale and nothing a user runs ever
 * asked it (fix round 2, R2-3): `dz parity` printed `full` for the auto-recall leg on codex off a
 * transcript recorded on a runtime that is no longer installed. A cell that says `full` on evidence
 * nobody has re-confirmed is the same class of claim this whole feature exists to refuse.
 */
export declare function downgradeForStaleEvidence(feature: ParityFeature, cell: ParityCell, staleCapabilities: readonly RuntimeCapability[]): ParityReportCell;
export interface ParityMatrixRow {
    readonly feature: ParityFeature;
    readonly cells: Readonly<Record<TargetName, ParityCell>>;
}
/** The full computed matrix over every declared feature × every registered target. */
export declare function buildParityMatrix(): ParityMatrixRow[];
//# sourceMappingURL=parity.d.ts.map
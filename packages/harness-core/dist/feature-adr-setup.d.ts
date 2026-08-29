/**
 * Guided feature-adr onboarding (feature guided-feature-adr-setup, ADR-001).
 *
 * The `configure-feature-adr` SKILL runs a short interview and fills a `SetupSpec`; `dz feature-adr-setup`
 * scaffolds the project-awareness files from that spec — so a user configures feature-adr WITHOUT knowing
 * any manifest schema ("complex inside, simple outside"). The plan/render/scaffold builders are PURE +
 * deterministic (sorted, no clock/random); the scan helper does disk I/O with TOP-LEVEL node:fs (ESM).
 *
 * SAFETY PROPERTY (ADR-001 §2, load-bearing): `scaffoldFromSpec` NEVER emits a full overwrite of an existing
 * file. A structured file (manifest / project-skills) is UNION-merged (existing content preserved); a prose
 * doc (vision.md / testing.md) that already exists is left untouched (`unchanged`), never clobbered.
 */
import type { Subsystem, SubsystemManifest } from './architecture.js';
import type { ProjectSkillManifest, ExtraSkill } from './project-skills.js';
import type { TargetName } from './targets.js';
export interface VisionSpec {
    readonly core: string;
    readonly direction?: string;
    readonly boundaries?: readonly string[];
    readonly principles?: readonly string[];
}
export interface TestingSpec {
    readonly commands?: readonly string[];
    readonly doneDefinition?: string;
    readonly gates?: readonly string[];
}
export type SubsystemSpec = Subsystem;
export interface SetupSpec {
    readonly vision?: VisionSpec;
    readonly subsystems?: readonly SubsystemSpec[];
    readonly testing?: TestingSpec;
    /** critic: 'auto' ⇒ a generated project-critic skill; a path ⇒ that file. brand/impl-bar: a path. */
    readonly roles?: Partial<Record<'critic' | 'brand' | 'impl-bar', string>>;
    readonly extra?: readonly ExtraSkill[];
    /** scaffold a starter `architecture/degradations.md` — the accepted-degradations registry the R6
     *  challenge panel (C1) reads so it does not re-flag debt you already own. Create-if-absent. */
    readonly degradations?: boolean;
    /** P3 (fa-improvements): scaffold DETERMINISTIC guard tests into the project — a declarative
     *  `guards.config.json` + a zero-dependency Node runner `check.mjs` (LOC cap, secret scan, frozen-file
     *  sha256 pins, each with an explicit waiver mechanism). `true` for defaults, or `{ locCap }` to tune.
     *  Moves rules a reviewer "might notice" down to layer 1 of the cost-of-detection ladder. Create-if-absent. */
    readonly guards?: boolean | {
        readonly locCap?: number;
    };
    /** portable-gates (direction b): scaffold a zero-config `architecture/gates/delivery-check.md` — the
     *  portable Step-10 Delivery Gate protocol for AGENTS.md-class targets that read repo docs rather than
     *  invoking dz interactively. The "runnable here" gate list is COMPUTED from `buildParityMatrix()` for
     *  the target being scaffolded (AM-12), never hand-typed. Opt-in, create-if-absent. */
    readonly gates?: boolean;
}
export interface SetupScan {
    readonly visionExists: boolean;
    readonly manifestExists: boolean;
    readonly projectSkillsExists: boolean;
    readonly testingExists: boolean;
    readonly packages: readonly string[];
    readonly reviewCorpus: boolean;
}
export interface SetupPlan {
    readonly exists: {
        readonly vision: boolean;
        readonly manifest: boolean;
        readonly projectSkills: boolean;
        readonly testing: boolean;
    };
    readonly discoveredPackages: readonly string[];
    readonly hasReviewCorpus: boolean;
    readonly missing: readonly string[];
    readonly suggestions: readonly string[];
}
export interface ScaffoldFile {
    readonly path: string;
    readonly action: 'create' | 'augment' | 'unchanged';
    readonly content: string;
    readonly note?: string;
}
export interface ScaffoldResult {
    readonly files: readonly ScaffoldFile[];
}
/** One existing on-disk file: `exists` distinguishes ABSENT from EXISTS-BUT-UNREADABLE (never clobber either). */
export interface ExistingFile {
    readonly exists: boolean;
    readonly content?: string;
}
/** The existing files the scaffold compares against. */
export interface ExistingScaffoldFiles {
    readonly vision: ExistingFile;
    readonly manifest: ExistingFile;
    readonly projectSkills: ExistingFile;
    readonly testing: ExistingFile;
    readonly degradations?: ExistingFile;
    readonly guardsConfig?: ExistingFile;
    readonly guardsRunner?: ExistingFile;
    readonly gatesDoc?: ExistingFile;
}
export declare const P_VISION = "architecture/vision.md";
export declare const P_TESTING = "architecture/testing.md";
export declare const P_MANIFEST = "architecture/subsystems.manifest.json";
export declare const P_PROJECT_SKILLS = "architecture/project-skills.json";
export declare const P_CRITIC = "architecture/project-critic/SKILL.md";
export declare const P_DEGRADATIONS = "architecture/degradations.md";
export declare const P_GUARDS_CONFIG = "architecture/guards/guards.config.json";
export declare const P_GUARDS_RUNNER = "architecture/guards/check.mjs";
export declare const P_GATES_DOC = "architecture/gates/delivery-check.md";
/** What exists, what is discoverable, what is still missing — the read-only "which docs, and where?" answer (FR-2). PURE. */
export declare function buildSetupPlan(scan: SetupScan): SetupPlan;
/** Suggest a starter subsystem grouping from discovered packages (deterministic heuristic — user refines). PURE. */
export declare function suggestSubsystems(packages: readonly string[]): SubsystemSpec[];
/** architecture/vision.md from the spec. Deterministic. */
export declare function renderVisionDoc(v: VisionSpec): string;
/** architecture/testing.md from the spec — the project's verification procedure (feeds Step 8 QE). Deterministic. */
export declare function renderTestingDoc(t: TestingSpec): string;
/** Starter accepted-degradations registry (R6 challenge panel C1 reads this). PURE. */
export declare function renderDegradationsDoc(): string;
/** Build a subsystem manifest from the spec's subsystems. PURE. */
export declare function buildManifestFromSpec(subs: readonly SubsystemSpec[]): SubsystemManifest;
/** Wire the project-skills manifest from the spec: product-vision + testing point at the scaffolded docs;
 *  critic/brand/impl-bar are added when the spec supplies them; extra is carried through. PURE. */
export declare function buildProjectSkillsFromSpec(spec: SetupSpec): ProjectSkillManifest;
/**
 * Build the scaffold plan from the spec + what already exists. PURE + deterministic. AUGMENT-NEVER-CLOBBER
 * (ADR-001 §2, load-bearing): a file that EXISTS is never replaced — prose is left as-is; structured files
 * are append-only merged (existing content, order, and unknown keys preserved). A file only gets `create`
 * when it is genuinely ABSENT. Malformed existing content never crashes and never clobbers.
 */
/** Default LOC (lines of code) cap for the scaffolded guard — the classic god-object threshold. */
export declare const DEFAULT_GUARD_LOC_CAP = 700;
/** Render the declarative guard config. Data, not behavior — the owner edits caps/waivers here. */
export declare function renderGuardsConfig(opts?: {
    locCap?: number;
}): string;
/**
 * Render the ZERO-DEPENDENCY guard runner (plain Node ≥18, no framework, no install): LOC cap + high-signal
 * secret scan + frozen-file sha256 pins, waivers with required reasons, `--json`, exit 1 on violation.
 * Deliberately a portable .mjs, not a vitest/pytest file — it runs in ANY stack's CI with just Node.
 */
export declare function renderGuardsRunner(): string;
/**
 * Render the ZERO-CONFIG portable Delivery Gate doc for `target` (portable-gates, direction b). Unlike the
 * workflow script, `feature-adr-setup.ts` is an ordinary ESM module, so it does a REAL `import` of
 * {@link PLANE_SPECS} (FR-9 "computed, not hand-typed"). Per AM-12 it TAKES the target and COMPUTES the
 * "gates runnable here" list from `buildParityMatrix()` for that target's declared capabilities (full/manual
 * cells with their `via`) — never a hand-typed static list. Deterministic; no clock/random.
 */
export declare function renderGatesDoc(target: TargetName): string;
export declare function scaffoldFromSpec(spec: SetupSpec, existing: ExistingScaffoldFiles, target?: TargetName): ScaffoldResult;
/** Human preview of the scaffold plan. Deterministic. */
export declare function renderScaffoldPreview(result: ScaffoldResult): string;
/** Scan the repo for the setup plan: what exists + discovered packages + a review corpus. Impure; never throws. */
export declare function scanForSetup(repoRoot: string): SetupScan;
/** Read the existing files the scaffold needs to compare against. Impure; never throws. */
export declare function readExistingForScaffold(repoRoot: string): ExistingScaffoldFiles;
//# sourceMappingURL=feature-adr-setup.d.ts.map
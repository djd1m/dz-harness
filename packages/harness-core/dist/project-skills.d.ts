/**
 * Polymorphic feature-adr (feature polymorphic-feature-adr, ADR-001).
 *
 * A COMMITTED per-project manifest (`architecture/project-skills.json`) declares the project-specific
 * skills feature-adr should fold into its pipeline — so a generic pipeline becomes project-aware WITHOUT
 * editing pipeline code (the Copilot `Orchestrates:` anti-pattern) and WITHOUT the skill self-declaring
 * where it attaches (orchestration is the parent's job). Hybrid model: a CLOSED core-role enum with a
 * fixed role→stage map, plus an open `extra` list. Guidance injection only in this release; `extra-phase`
 * is accepted but skipped (fail-open, forward-compatible).
 *
 * The build/plan/render functions are PURE + deterministic (sorted, no clock/random) so the same manifest
 * yields byte-identical plans; the load/resolve helpers do the disk I/O with TOP-LEVEL node:fs imports
 * (harness-core is ESM — a lazy require() is undefined at runtime; the R1 footgun).
 *
 * SAFETY PROPERTY (ADR-001 Decision 3, load-bearing): with NO manifest the plan is empty and
 * `guidanceForStage` returns '' — so `prompt + guidanceForStage(...)` is byte-identical to today. Every
 * injection that DOES happen is named in the report (no silent injection).
 */
/** The injectable pipeline stages a project skill can target. */
export type Stage = 'design' | 'code' | 'qe';
/** The CLOSED core-role enum (each has a fixed stage mapping). */
export type CoreRole = 'product-vision' | 'critic' | 'brand' | 'impl-bar' | 'testing';
export declare const CORE_ROLES: readonly CoreRole[];
/**
 * Fixed role→stage map. product-vision informs design + QE; impl-bar the code; critic + testing the QE;
 * brand the code. `testing` (R5) is the project's verification procedure (test commands, "done", gates) —
 * distinct from `critic` (the review lens): different SOURCE (testing = interview, critic = auto-mined).
 */
export declare const ROLE_STAGES: Readonly<Record<CoreRole, readonly Stage[]>>;
/** Default doc for the product-vision role when the manifest omits it (the R1 seam). */
export declare const PRODUCT_VISION_DEFAULT = "architecture/vision.md";
export interface ExtraSkill {
    readonly skill: string;
    readonly phase: Stage;
    readonly as: 'guidance' | 'extra-phase';
    readonly position?: 'before' | 'after';
}
export interface ProjectSkillManifest {
    readonly version: number;
    readonly roles?: Partial<Record<CoreRole, string>>;
    readonly extra?: readonly ExtraSkill[];
}
/** A validated manifest + the entries that were dropped (fail-open, NFR-2). */
export interface ValidatedManifest {
    readonly manifest: ProjectSkillManifest | null;
    readonly errors: readonly string[];
}
/** A source path resolved to its on-disk content, tagged with what it fills. */
export interface ResolvedItem {
    readonly source: string;
    readonly role: CoreRole | 'extra';
    readonly stages: readonly Stage[];
    readonly content: string;
}
/** One concrete guidance injection for one stage. */
export interface Injection {
    readonly stage: Stage;
    readonly source: string;
    readonly role: CoreRole | 'extra';
    readonly content: string;
}
export interface InjectionPlan {
    readonly injections: readonly Injection[];
    readonly skipped: readonly {
        readonly entry: string;
        readonly reason: string;
    }[];
}
/**
 * Validate a parsed manifest object. FAIL-OPEN (NFR-2): a bad top-level shape → null + errors; a bad
 * entry (unknown role key, missing fields, bad stage) is DROPPED with a reason, the rest survive. A
 * config typo must never brick a run.
 */
export declare function validateManifest(raw: unknown): ValidatedManifest;
/**
 * Resolve each manifest entry to its on-disk content. Impure I/O (top-level fs; never throws). A missing
 * file is DROPPED with a reason (fail-open). product-vision defaults to `architecture/vision.md` (FR-4)
 * when the role is unset and the default exists.
 */
export declare function resolveInjections(repoRoot: string, manifest: ProjectSkillManifest): {
    resolved: ResolvedItem[];
    skipped: {
        entry: string;
        reason: string;
    }[];
};
/**
 * Build the injection plan. PURE + deterministic: one Injection per (item, stage), sorted by
 * (stage, source). The same resolved set always yields a byte-identical plan (ADR-001 §1).
 */
export declare function buildInjectionPlan(resolved: readonly ResolvedItem[], skipped?: readonly {
    entry: string;
    reason: string;
}[]): InjectionPlan;
/**
 * The guidance suffix for one stage — a concat of every injection targeting it, each with a provenance
 * header. Returns '' when nothing targets the stage, so `prompt + guidanceForStage(...)` is byte-identical
 * to the bare prompt on a no-manifest run (FR-7, load-bearing).
 */
export declare function guidanceForStage(plan: InjectionPlan, stage: Stage): string;
/** Human "who injected what" report (FR-6 — no silent injection). Deterministic. */
export declare function renderInjectionReport(plan: InjectionPlan): string;
/**
 * Load + validate the project manifest (`architecture/project-skills.json`). Impure; returns null when
 * absent OR unparseable OR top-level-invalid (fail-open) — a null means "generic run" (FR-7). Entry-level
 * problems are kept on the returned manifest's implicit skip path (via validateManifest at resolve time).
 */
export declare function loadProjectSkills(repoRoot: string): ProjectSkillManifest | null;
/**
 * One-shot convenience for the pipeline: load → validate → resolve → plan. Returns an EMPTY plan when
 * there is no manifest file (FR-7 byte-identical). Validation problems (unknown role / bad entry) AND
 * missing-file skips both surface in `plan.skipped` so the report hides nothing (FR-6). Impure.
 */
export declare function planProjectSkills(repoRoot: string): InjectionPlan;
//# sourceMappingURL=project-skills.d.ts.map
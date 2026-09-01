/**
 * The platform-adapter contract.
 *
 * Every `@dzhechkov/adapter-*` package implements {@link Adapter}: a pure
 * function that compiles a {@link CanonicalSkill} into the file layout a
 * specific agent platform expects. Keeping this contract in `core` lets
 * adapters be tested in isolation and swapped freely.
 *
 * @packageDocumentation
 */
import type { CanonicalSkill, SkillAsset } from './skill.schema.js';
import type { HarnessIntegrationManifestV1 } from './integration.schema.js';
/** The agent platforms the harness can emit for. */
export declare const PLATFORMS: readonly ["claude", "codex", "opencode", "hermes", "openclaude", "copilot", "agents-md", "cursor", "gemini", "windsurf"];
/** A target agent platform. */
export type Platform = (typeof PLATFORMS)[number];
/** Inputs an adapter needs to compile a skill, beyond the skill itself. */
export interface CompileContext {
    /**
     * Base directory the host writes emitted files under. Adapters MUST NOT read
     * or prefix this themselves — emit each {@link EmitResult} path relative to it
     * (e.g. `.claude/skills/<id>/SKILL.md`); the host (`applyEmitResult`) joins
     * them under `targetRoot`. Prefixing it inside an adapter double-joins the
     * root (`<root>/<root>/…`) or yields an absolute path the host rejects.
     */
    readonly targetRoot: string;
    /**
     * When true, the adapter must fail rather than silently apply a lossy
     * transformation. When false (default), loss is reported as a warning.
     */
    readonly strict?: boolean;
}
/** The outcome of {@link Adapter.compile}: files to write plus any warnings. */
export interface EmitResult {
    /**
     * Files to write, each a path RELATIVE to {@link CompileContext.targetRoot}
     * (e.g. `.claude/skills/<id>/SKILL.md`) — do NOT prefix `targetRoot`; the host
     * joins it. Reuses {@link SkillAsset} — a path, an encoding, and content.
     */
    readonly files: readonly SkillAsset[];
    /** Non-fatal issues, e.g. notes about lossy compilation. */
    readonly warnings: readonly string[];
}
/** The outcome of {@link Adapter.verify}. */
export interface VerifyResult {
    /** True when the emitted result is valid for the target platform. */
    readonly ok: boolean;
    /** Fatal problems that make the result invalid. */
    readonly errors: readonly string[];
    /** Non-fatal advisories. */
    readonly warnings: readonly string[];
}
/**
 * The contract every `@dzhechkov/adapter-*` package implements.
 *
 * An adapter is a **pure function**: the same {@link CanonicalSkill} and
 * {@link CompileContext} always produce the same {@link EmitResult}.
 * Compilation **may be lossy** for some targets (e.g. Codex has no progressive
 * disclosure) — but loss must surface as a warning, never silently.
 */
export interface Adapter {
    /** The platform this adapter emits for. */
    readonly platform: Platform;
    /** Compile a canonical skill into platform-specific files. */
    compile(skill: CanonicalSkill, ctx: CompileContext): Promise<EmitResult>;
    /** Check that an {@link EmitResult} is valid for {@link Adapter.platform}. */
    verify(emitResult: EmitResult): Promise<VerifyResult>;
}
/** The two companion-configuration families supported by the canonical model. */
export type IntegrationComponent = 'mcp' | 'hooks';
/** Stable public result states; a requested refusal is never a warning-only skip. */
export type IntegrationStatus = 'emitted' | 'refused' | 'not-requested';
/** Closed refusal vocabulary shared by adapters, orchestration, and CLI JSON. */
export type IntegrationReasonCode = 'MANIFEST_INVALID' | 'INTEGRATION_AUTHORIZATION_REQUIRED' | 'NO_QUALIFYING_LIVE_RECEIPT' | 'TARGET_BINARY_UNAVAILABLE' | 'RECEIPT_STALE' | 'PROJECT_CARRIER_NOT_OBSERVED' | 'LIVE_PROBE_FAILED' | 'CURRENT_LIVE_CHECK_FAILED' | 'LIVE_PROBE_TIMEOUT' | 'NO_ACTIVATION_RECEIPT' | 'PRODUCT_SURFACE_AMBIGUOUS' | 'PROJECT_CARRIER_NOT_DOCUMENTED' | 'PROJECT_SCOPE_UNAVAILABLE' | 'NO_RUNTIME_SURFACE' | 'INTENT_NOT_EXPRESSIBLE' | 'UNSAFE_PATH' | 'CONFIG_MALFORMED' | 'OWNERSHIP_AMBIGUOUS' | 'CONCURRENT_MODIFICATION' | 'APPLY_FAILED' | 'POST_WRITE_REGISTRATION_NOT_OBSERVED';
/** Evidence/policy facts available to a pure target integration planner. */
export interface IntegrationPlanContext {
    readonly target: string;
    readonly runtimeVersion?: string;
    readonly evidenceVersion?: string;
}
/** A target-native delta. The effect shell owns merge and persistence. */
export interface CarrierFragment {
    readonly component: IntegrationComponent;
    readonly carrierPath: string;
    readonly scope: 'project' | 'user' | 'plugin';
    readonly format: 'json' | 'toml' | 'yaml' | 'javascript';
    readonly rootKey: string;
    readonly entries: Readonly<Record<string, unknown>>;
}
export interface IntegrationPlanRefusal {
    readonly component: IntegrationComponent;
    readonly reasonCode: IntegrationReasonCode;
    readonly remediation: string;
}
/** Pure target planning result. */
export interface IntegrationPlan {
    readonly fragments: readonly CarrierFragment[];
    readonly refusals: readonly IntegrationPlanRefusal[];
}
/** Pure companion-config adapter; deliberately separate from skill {@link Adapter}. */
export interface TargetIntegrationAdapter {
    readonly target: string;
    plan(manifest: HarnessIntegrationManifestV1, context: IntegrationPlanContext): IntegrationPlan;
}
//# sourceMappingURL=adapter.d.ts.map
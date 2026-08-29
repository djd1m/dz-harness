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
//# sourceMappingURL=adapter.d.ts.map
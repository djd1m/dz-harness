/**
 * Shared capability vocabulary — the single source of truth for how the harness
 * classifies agent capabilities, used by BOTH `mcp-scan` (project settings audit)
 * and `benchmark` (per-skill S15 capability-declaration check).
 *
 * Keeping these regexes/sets here (rather than private to mcp-scan) guarantees the
 * project-level scan and the per-skill manifest speak ONE diffable vocabulary.
 *
 * @packageDocumentation
 */
/** The capability classes the harness recognises. */
export type CapabilityClass = 'shell' | 'network' | 'file-write' | 'secrets' | 'mcp' | 'policy';
export declare const SHELL_TOOLS: Set<string>;
export declare const NETWORK_TOOLS: Set<string>;
export declare const WRITE_TOOLS: Set<string>;
export declare const READ_TOOLS: Set<string>;
/** Recognised + benign tools (so they aren't flagged "unknown"). */
export declare const SAFE_TOOLS: Set<string>;
/** Interpreter binaries that can run arbitrary code. */
export declare const INTERPRETER_RE: RegExp;
/** Package runners that fetch + execute arbitrary remote code. */
export declare const PACKAGE_RUNNERS: Set<string>;
/** Inline-code argument flags. */
export declare const INLINE_CODE_ARGS: Set<string>;
/** Binaries that imply outbound network. */
export declare const SHELL_NET_RE: RegExp;
/** Binaries / redirects that imply filesystem writes. */
export declare const SHELL_WRITE_RE: RegExp;
/** Concrete secret-file location patterns (not bare "secret"/"credential" substrings). */
export declare const SECRET_FILE_RE: RegExp;
export declare const MAX_FILE_BYTES: number;
/** Parse a Claude permission grant like `Bash(git *)` → `{ tool, arg }`. Never throws. */
export declare function parseGrant(grant: unknown): {
    tool: string;
    arg: string | null;
};
export declare function isWildcard(arg: string | null): boolean;
export declare function toolKind(tool: string): CapabilityClass | 'read' | 'safe' | 'unknown';
/** Self-declared capability surface parsed from a skill's `capabilities:` block. */
export interface DeclaredCapabilities {
    network?: boolean;
    shell?: boolean;
    'file-write'?: boolean;
    dangerous?: boolean;
}
/** Capabilities statically detected in a skill's `scripts/`. P1: network + shell only. */
export interface DetectedCapabilities {
    network: boolean;
    shell: boolean;
}
/** Strip comments + heredocs (keeps string literals — curl inside an arg string is real). */
export declare function stripComments(text: string): string;
/**
 * Strip comments, heredocs AND quoted string literals. Used for the IDENTIFIER
 * pass (fetch/axios/execSync/http modules) where the token is real code, never a
 * quoted search pattern — this is what kills FPs like `grep "writeFileSync"`.
 */
export declare function stripCodeNoise(text: string): string;
/**
 * Statically detect network + shell capability usage in a skill's `scripts/`.
 * Reads only `scripts/` (never SKILL.md prose), recursively (bounded), skipping
 * binary / symlinked / oversized files. Deterministic, no execution.
 *
 * Known scope (Phase 1, by design — documented, not bugs): file-write and
 * `dangerous` are not auto-detected; dynamically-assembled commands
 * (`$RUNNER install`, eval'd strings) and indirected calls evade static regexes.
 * S15 is a best-effort self-consistency LINT, not a sandbox.
 */
export declare function detectScriptCapabilities(skillDir: string): DetectedCapabilities;
/**
 * Parse the `capabilities:` block from a SKILL.md document. Reads only the
 * frontmatter region (the first `---`-fenced block) and only DIRECT children of
 * `capabilities:` (so a nested `limits.network` is never mistaken for a top-level
 * declaration). Absent block or absent key → `undefined` ("not asserted").
 */
export declare function parseDeclaredCapabilities(skillMd: string): DeclaredCapabilities;
/** Declared runtime limits (inert today — no enforcement home in Claude Code settings). */
export interface DeclaredLimits {
    toolTimeoutMs?: number;
    maxToolCallsPerTurn?: number;
    requireApprovalForDangerous?: boolean;
}
/**
 * Parse the nested `capabilities.limits` block from a SKILL.md frontmatter.
 * Fail-open: a malformed/absent block yields `{}` (never throws). These values
 * are INERT — Claude Code settings.json has no timeout/rate-limit field; they are
 * only machine-actionable in an MCP host's policy.json.
 */
export declare function parseDeclaredLimits(skillMd: string): DeclaredLimits;
//# sourceMappingURL=capability-vocab.d.ts.map
/**
 * `--target` names → platform adapters.
 *
 * @packageDocumentation
 */
import type { Adapter } from '@dzhechkov/core';
/**
 * The targets the harness can initialise. The key is the CLI `--target` name
 * (`claude-code`, not `claude`); the value is the adapter that emits for it.
 */
/** A valid `--target` name. */
export type TargetName = 'claude-code' | 'codex' | 'opencode' | 'hermes' | 'openclaude' | 'copilot' | 'agents-md' | 'cursor' | 'gemini' | 'windsurf';
export declare const TARGETS: Record<TargetName, Adapter>;
/** Every supported `--target` name. */
export declare const TARGET_NAMES: TargetName[];
/** Type guard: is `value` a supported `--target` name? */
export declare function isTargetName(value: string): value is TargetName;
/** `TARGET_NAMES` sorted alphabetically, for display in error messages. */
export declare const TARGET_NAMES_SORTED: readonly TargetName[];
/**
 * Semantic `--target` aliases — DATA, not branching logic. Adding a row is one line
 * and zero control flow (ADR-002 §Rationale D5).
 *
 * Purely typographic variants (`Claude_Code`, `claudecode`, `agents.md`) are handled by
 * normalisation, not by rows; the rows below carry only meanings normalisation cannot
 * derive (`claude` ≠ `claude-code` by any string rule — it is an owner decision).
 */
export declare const TARGET_ALIASES: Readonly<Record<string, TargetName>>;
/**
 * Rows deleted in fix round 1 (QE F7) because they were UNREACHABLE, not because their
 * inputs stopped working: `claude_code`, `claudecode`, `agentsmd` and `agents.md` all
 * normalise onto a canonical name, and precedence step 2 (normalised canonical) runs
 * BEFORE step 3 (this table). Every one of them still resolves — through normalisation,
 * which is where the README already says typographic variants are handled.
 *
 * They were invisible dead data because the table test iterated every row asserting
 * `via === 'alias'`, which is true on both paths — a PRESENCE assertion where a
 * REACHABILITY one was intended. `target-resolution.test.ts` now removes each row from a
 * COPY of the table and asserts the resolution changes, so a future dead row is red.
 */
/** The outcome of {@link resolveTargetName}. Total: every string maps to one of these. */
export type TargetResolution = {
    readonly kind: 'ok';
    readonly target: TargetName;
    readonly via: 'canonical' | 'alias';
} | {
    readonly kind: 'unknown';
    readonly input: string;
    readonly suggestion: TargetName | null;
};
/** Levenshtein suggestions are only offered at or below this edit distance. */
export declare const TARGET_SUGGESTION_MAX_DISTANCE = 3;
/**
 * Normalise a `--target` token for matching: byte-level lowercase (never
 * `toLocaleLowerCase` — behaviour must not vary with the host locale), trimmed, with
 * every separator dropped so `Claude_Code`, `claude-code` and `claudecode` collapse.
 *
 * Exported so the alias-REACHABILITY test can ask the production normaliser whether a
 * proposed alias row is already carried by precedence step 2, instead of keeping a
 * second copy of this rule in the test file (fix round 1, QE F7).
 */
export declare function normalizeTargetToken(value: string): string;
/**
 * Resolve a user-supplied `--target` value to a canonical {@link TargetName}.
 *
 * Total, pure, no I/O. Precedence (fixed and tested):
 *
 * 1. exact canonical hit → `{kind:'ok', via:'canonical'}` (`isTargetName` semantics);
 * 2. normalised canonical hit → `{kind:'ok', via:'alias'}` (`Claude_Code`, `agentsmd`);
 * 3. explicit {@link TARGET_ALIASES} row → `{kind:'ok', via:'alias'}`;
 * 4. unique normalised prefix → `{kind:'unknown', suggestion}`;
 * 5. Levenshtein ≤ 3 strictly better than the runner-up → `{kind:'unknown', suggestion}`;
 * 6. otherwise → `{kind:'unknown', suggestion:null}`.
 *
 * **Aliases ACCEPT; prefix and Levenshtein only SUGGEST.** An alias row is an owner
 * decision recorded in data; a fuzzy match is a guess, and silently installing to the
 * wrong target on a guess is worse than one round-trip.
 */
export declare function resolveTargetName(value: string): TargetResolution;
/**
 * Render the two-line failure for an unresolvable `--target`.
 *
 * Line 2 keeps the literal substring `--target must be one of:` — three shipped
 * assertions (`test/cli.test.ts`) pin it, and keeping the shape additive is what makes
 * the D3 change prove itself with NEW tests instead of rewriting old ones. The values
 * are {@link TARGET_NAMES_SORTED} (alphabetical), which the pre-change message was not.
 */
export declare function formatTargetProblem(command: string, resolution: Extract<TargetResolution, {
    kind: 'unknown';
}>): readonly string[];
/** The one-line diagnostic emitted (on stderr) when an alias was accepted. */
export declare function formatTargetAliasNote(command: string, input: string, target: TargetName): string;
//# sourceMappingURL=targets.d.ts.map
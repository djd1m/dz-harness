/**
 * The Claude-side destructive-command guard, as an INSTALLABLE asset
 * (feature `destructive-command-guard`, task T8, cross-family review round 3, finding P1-1).
 *
 * ## Why this file exists
 *
 * The guard shipped as one file committed at this repository's root, registered in this
 * repository's `.claude/settings.json`. MEASURED 2026-09-05, running the documented command in a
 * clean project — `dz setup --target claude-code --project <tmp>`:
 *   the written `.claude/settings.json` carries SessionStart / SessionEnd / PreCompact and no
 *   `PreToolUse` key at all, and `.claude/hooks/` does not exist.
 * So the advertised Claude-side guard protected exactly one checkout: ours. A guard that only ever
 * guards its author is a demo.
 *
 * Setup therefore has to install BOTH halves into the consumer project — the body and the registry
 * entry — and the body must come from the INSTALLED package, never from a path inside our
 * repository, which a consumer does not have.
 *
 * ## Why the body carries an absolute path
 *
 * The emitted hook runs from `<consumer>/.claude/hooks/`, where `require('@dzhechkov/harness-core')`
 * cannot resolve: Node resolves a bare specifier upward from the FILE, and the package is not above
 * that file in a global install. The body therefore resolves by PATH, and the LAST candidate is the
 * absolute location of the installation that emitted it (see `harness-core-location.ts` for the
 * measurement that forced this). Project-local candidates come FIRST, so a consumer that installed
 * harness-core itself keeps using its own copy and is never pinned to ours.
 *
 * The generated text is behaviourally identical to this repository's own
 * `.claude/hooks/destructive-guard.cjs`, and a test drives BOTH bodies through the same matrix
 * rather than trusting that they stayed alike.
 *
 * @packageDocumentation
 */
/** Bump when the emitted BODY changes. Unlike Codex, Claude has no trust gate — this is provenance. */
export declare const DZ_CLAUDE_HOOK_VERSION = 2;
/**
 * The OWNERSHIP marker. A file carrying this line is one dz wrote and may replace; a file without it
 * belongs to the consumer and is never overwritten without `--force`.
 *
 * MEASURED 2026-09-05, before this existed: a hand-authored
 * `.claude/hooks/destructive-guard.cjs` was replaced by a routine `dz setup` run, no `--force`
 * involved — the one path in setup that was not additive. Ownership is asserted by a MARKER rather
 * than by a hash of the bytes we wrote, because an UPGRADE must still be able to replace an older
 * dz body; the cost of that choice is stated in the emitted file itself, on the marker line.
 */
export declare const CLAUDE_DESTRUCTIVE_HOOK_MARKER = "dz-managed-hook: destructive-guard";
/** Is this file body one dz owns? Absence of the marker is the consumer's claim to the file. */
export declare function isDzManagedHookBody(body: string): boolean;
/** Where the body is installed inside a consumer project, and what the registry entry points at. */
export declare const CLAUDE_DESTRUCTIVE_HOOK_RELPATH = ".claude/hooks/destructive-guard.cjs";
/**
 * The command Claude Code runs — the EXACT documented placeholder, never a shell-only variant.
 *
 * Relative to the project rather than absolute: the settings file is committed by consumers and
 * shared across machines, and an absolute path in it breaks for every collaborator. The BODY may
 * carry an absolute fallback because it is generated per machine; the SETTINGS entry may not.
 *
 * WHY THE EXACT TOKEN [DOC, code.claude.com/docs/en/hooks, read 2026-09-06]. `${CLAUDE_PROJECT_DIR}`
 * is a PLACEHOLDER Claude Code substitutes itself — "Use these placeholders to reference hook
 * scripts relative to the project or plugin root, regardless of the working directory when the hook
 * runs: ${CLAUDE_PROJECT_DIR}: the project root where the session started" — and the documentation
 * describes NO default syntax. The previous `${CLAUDE_PROJECT_DIR:-.}` is therefore not the
 * placeholder at all; it worked only where a POSIX shell happened to expand the variable, and on a
 * host where Claude Code's own substitution is what fills the token in, it stays literal and the
 * hook cannot be found. NOT REPRODUCED LIVE: there is no Windows host here, so the Windows half of
 * this is documentation plus the reviewer's report, not a measurement of mine.
 *
 * MEASURED here (POSIX `sh`, 2026-09-06), which is the part that IS checkable: with the variable
 * set the two forms are identical (`/tmp/x/p`); with it unset the exact token yields `/p` while the
 * old form yielded `./p`. So on the only path this change can degrade — a hand-run command with no
 * variable and no substitution — the failure is a loud "cannot find module", never a silent pass.
 * The fallback that matters (finding the DECIDER) lives inside the body, where it can actually run.
 */
export declare const CLAUDE_DESTRUCTIVE_HOOK_COMMAND: string;
/** The PreToolUse matcher. Bash only — the decider skips every other tool without reading it. */
export declare const CLAUDE_DESTRUCTIVE_HOOK_MATCHER = "^Bash$";
export interface ClaudeHookAssetOptions {
    /**
     * Absolute directory holding the BUILT harness-core modules, baked in as the last resort.
     * Defaults to the installation generating the file. `null` omits it — used for a body that is
     * committed to a repository, where a machine-specific path would be wrong for everyone else.
     */
    readonly installedDistDir?: string | null | undefined;
}
/**
 * The emitted `.claude/hooks/destructive-guard.cjs`.
 *
 * Thin by contract: read stdin, hand the payload to `decideDestructiveHook`, print, exit. Runtime
 * failures of ours exit 0 with one loud line. Without the decision module, only literal recursive
 * deletion is refused; every other request passes with an explicit partial-protection warning.
 */
export declare function generateClaudeDestructiveHook(opts?: ClaudeHookAssetOptions): string;
//# sourceMappingURL=claude-hooks-assets.d.ts.map
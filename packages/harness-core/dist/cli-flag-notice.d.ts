/**
 * An unrecognised `--flag` must not pass in silence.
 *
 * MEASURED 2026-08-24: `dz recall "x" --breif --limit 2` printed the full ordinary output and exited
 * 0. Someone who typed `--breif` for `--brief` reads that as "the mode worked" — and every `dz`
 * command behaves the same way, because the argv parser accepts any `--name` it is handed.
 *
 * WHY THIS WARNS RATHER THAN REFUSES, and the measurement behind it. Two ways to build a per-command
 * allowlist were tried and BOTH are unsafe:
 *
 *  - from the help text: 53 of the 220 flag names the CLI actually reads appear nowhere in help, so
 *    refusing on a help-derived list would break 53 working invocations;
 *  - from static extraction over the dispatch table: it lost `--week` from `dz recap` (those flags
 *    are read through a loop over a constant, not a literal `flags.has('week')`) and picked up a
 *    neighbouring command's flags for `dz usage`. It both under- and over-covers.
 *
 * A refusal built on either would reject working commands, and breaking a correct invocation is a
 * worse failure than the one being fixed. So the KNOWN set here is the union of every name the CLI
 * reads and every name its help documents, and an unrecognised name is reported loudly while the
 * command still does its work. That removes the SILENCE, which is the actual harm.
 *
 * HONEST LIMIT, and it is real: this catches a name no command anywhere knows. It does NOT catch a
 * name that is valid for a different command — `dz recap --manifest` stays quiet. Closing that needs
 * a hand-curated per-command list, which is filed with these measurements rather than guessed at.
 */
/**
 * Every known name as close to `name` as the closest one is.
 *
 * TIES ARE NOT BROKEN. `--wek` sits one edit from both `--week` and `--weak`, and picking whichever
 * came first in the list points the reader confidently at a coin flip. All of them are named, and
 * the reader decides.
 *
 * The bound scales with length so a three-letter name cannot match everything: at most a third of
 * the name may differ, and never more than two characters.
 */
export declare function nearestKnownFlag(name: string, known: readonly string[]): string[];
export interface UnknownFlagNotice {
    readonly name: string;
    /** Every equally-close known name. Empty when nothing is close enough to be worth naming. */
    readonly suggestions: readonly string[];
    readonly line: string;
}
/**
 * One notice per unrecognised name, or an empty list when everything is known.
 *
 * `passed` is every `--name` the user typed, whether it took a value or not: a typo'd OPTION
 * (`--limti 5`) is exactly as silent as a typo'd flag, and was equally unreported.
 */
export declare function unknownFlagNotice(passed: readonly string[], known: readonly string[]): UnknownFlagNotice[];
//# sourceMappingURL=cli-flag-notice.d.ts.map
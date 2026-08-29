/**
 * Every `--name` this CLI knows: the union of every name its code READS and every name its help
 * DOCUMENTS. GENERATED — `test/known-flags-drift.test.ts` re-derives it from `cli.ts` and fails if
 * this list has gone stale, so a new flag cannot silently start warning at its own users.
 *
 * It is deliberately a FLAT set, not a per-command map. Both ways of building a per-command list
 * were measured and both are unsafe: 53 of the names the CLI reads appear nowhere in help, and
 * static extraction over the dispatch table lost `--week` from `dz recap` while picking up a
 * neighbour's flags for `dz usage`. A refusal built on either would reject working commands.
 * See harness-core/src/cli-flag-notice.ts for the full reasoning and the honest limit.
 */
export declare const KNOWN_CLI_FLAGS: readonly string[];
//# sourceMappingURL=known-flags.d.ts.map
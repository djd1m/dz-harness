/**
 * The emitted Codex helper bodies (`crossrt-2-codex-hooks`, ADR-003 / ADR-004).
 *
 * Generated-code-as-a-string, following the `generateAgentdbWriter` precedent (`setup.ts`): the
 * helpers are THIN and the logic lives in the package, because a changed helper body changes
 * codex's `currentHash` and disarms the entry until it is re-trusted (MEASURED — M0 spike §4).
 * Every byte in here is therefore a liability; keep them boring.
 *
 * ## The contracts, side by side
 *
 * |                | `dz-codex-veto.cjs` (PreToolUse)                    | `dz-codex-recall.cjs` (UserPromptSubmit) |
 * |----------------|-----------------------------------------------------|------------------------------------------|
 * | Polarity       | mode-driven on POLICY (default `warn` ⇒ exit 0)      | **never-block, always**                  |
 * | Keys on        | presence of `tool_input.command` (AM-8)              | `payload.prompt`                          |
 * | Activation     | nearest `.dz` walking up from `payload.cwd` (AM-25)  | same                                      |
 * | Our own failure| exit 0, silent, note to `helper-errors.jsonl`        | exit 0, empty stdout, no write (AM-9)     |
 *
 * `.git` is **not** an activation marker (AM-25): a user-global hook that treats "any git checkout"
 * as opted-in reaches every repository on the machine, including trees nobody pointed at dz.
 *
 * The self-failure note goes to `$CODEX_HOME/dz-hooks/helper-errors.jsonl` (AM-33), never into a
 * project — writing it into `<project>/.dz/` would CREATE a `.dz/` in a foreign repo, which is the
 * exact thing the activation rule exists to prevent.
 *
 * A `UserPromptSubmit` hook that exits 2 **blocks the user's turn**, so the recall helper has no
 * path to a non-zero exit at all.
 *
 * @packageDocumentation
 */
/**
 * The PreToolUse veto helper.
 *
 * Fail-OPEN on OUR failure, mode-driven on a POLICY hit. Exit 2 only when the project explicitly
 * opted in — the shipped default warns and returns 0 (AM-24 / G-J).
 */
export declare function generateCodexVetoHelper(): string;
/**
 * The UserPromptSubmit recall helper.
 *
 * NEVER blocks and NEVER exits non-zero (AM-9). Silence is its correct output when nothing is
 * relevant, which is exactly why the acceptance canary is a FORCED HIT plus a removed-hook twin
 * (AM-4) — a dead hook and a correctly-silent one are indistinguishable from the outside.
 */
export declare function generateCodexRecallHelper(): string;
/** Both helper bodies, keyed by the file they are written to. */
export declare function generateCodexHelpers(): Readonly<Record<'veto' | 'recall', string>>;
//# sourceMappingURL=codex-hooks-assets.d.ts.map
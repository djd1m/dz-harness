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
 * The PreToolUse veto helper — TWO checks behind one registry entry.
 *
 * 1. The destructive-command guard (feature `destructive-command-guard`, ADR-001): a deletion by a
 *    LITERAL path into a protected store (`.dz/`, `.agentic-qe/`, a database file). It blocks
 *    UNCONDITIONALLY, with no config mode, and that asymmetry with the shell veto below is
 *    deliberate: the shell veto's default is `warn` because its class is broad and its false-hit
 *    rate is unmeasured, while this guard's scope was cut by measurement over 20 938 real commands
 *    down to one refusal per ~510 commands (0,196 %) — narrow enough that a refusal is a fact about
 *    the command's FORM, not a judgement about its intent. The verdict, the text and the limits all
 *    come from `destructive-guard-hook.js`, the SAME module the Claude host's hook consumes, so
 *    both runtimes refuse the same commands in the same words.
 * 2. The shell veto policy: fail-OPEN on OUR failure, mode-driven on a POLICY hit. Exit 2 only when
 *    the project explicitly opted in — the shipped default warns and returns 0 (AM-24 / G-J).
 *
 * The destructive check runs FIRST and is loaded SEPARATELY, so a project whose build lacks the
 * shell-veto policy still gets it, and vice versa.
 */
export declare function generateCodexVetoHelper(installedDistDir?: string | null): string;
/**
 * The UserPromptSubmit recall helper.
 *
 * NEVER blocks and NEVER exits non-zero (AM-9). Silence is its correct output when nothing is
 * relevant, which is exactly why the acceptance canary is a FORCED HIT plus a removed-hook twin
 * (AM-4) — a dead hook and a correctly-silent one are indistinguishable from the outside.
 */
export declare function generateCodexRecallHelper(installedDistDir?: string | null): string;
/**
 * Both helper bodies, keyed by the file they are written to.
 *
 * `installedDistDir` defaults to the harness-core doing the emitting; pass `null` for a body with
 * no absolute fallback (the pre-fix behaviour, kept so a test can prove the fallback is what makes
 * a global install work rather than asserting it).
 */
export declare function generateCodexHelpers(installedDistDir?: string | null): Readonly<Record<'veto' | 'recall', string>>;
//# sourceMappingURL=codex-hooks-assets.d.ts.map
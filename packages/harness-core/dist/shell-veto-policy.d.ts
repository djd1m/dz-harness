/**
 * Shell veto policy (`crossrt-2-codex-hooks`, ADR-004 + ADR-005).
 *
 * ONE rule, judged on the raw command string, with no I/O of any kind. The mode — what the CALLER
 * does with a hit — is decided by the caller from project config, never here.
 *
 * Polarity, in one sentence (ADR-004): **a policy hit ⇒ WARN by default, BLOCK only when the
 * project opted in; our own failure ⇒ always ALLOW.**
 *
 * ## Why exactly one rule, and why this one
 *
 * `shell-veto-policy.ts` is NOT a general shell-guardrail engine (plan §0.1's C4 fence). Its
 * charter is a single rule whose violation is **unambiguous**: the command line explicitly asks for
 * WEAKER authentication than the ssh default. Every token below is one a safe invocation never
 * contains, so a hit always means the user deliberately disabled a protection.
 *
 * The withdrawn v1 (`ssh-no-identity`, AM-23) judged the ABSENCE of `-i`/`IdentityFile=`, which
 * blocked `ssh myhost` whenever the identity came from `~/.ssh/config` or `ssh-agent` — the normal
 * secure case — from a user-global registry that reaches every directory on the machine. Absence of
 * a token is not evidence of intent; presence of these four is.
 *
 * `StrictHostKeyChecking=no` and `UserKnownHostsFile=/dev/null` are deliberately NOT rules: they are
 * a real weakening, but CI images use them legitimately, so no unambiguous verdict is available.
 * They are the first candidates for a future rule with its own ADR — **no second rule ships in this
 * leg**.
 *
 * @packageDocumentation
 */
/** What the caller does with a hit. `warn` is the shipped default (ADR-004). */
export type VetoMode = 'off' | 'warn' | 'block';
/** A policy hit. `null` from {@link vetoShellCommand} means allow. */
export interface VetoHit {
    readonly rule: string;
    readonly reason: string;
}
/** The one rule id this leg ships. Exported so tests and the probe cannot drift from it. */
export declare const SHELL_VETO_RULE_ID = "ssh-explicit-auth-weakening";
/**
 * Judge one raw shell command.
 *
 * @returns a {@link VetoHit} when the command EXPLICITLY weakens ssh authentication, else `null`.
 *          Pure: no filesystem, no environment, no config, no clock.
 */
export declare function vetoShellCommand(command: string): VetoHit | null;
/**
 * Resolve the enforcement mode from a parsed `.dz/config.json`.
 *
 * ABSENT, unknown, non-string, or malformed ⇒ `'warn'`. Never `'block'` by default: fail-closed is
 * a decision the owner makes, not one a user-global hook install imposes on every directory
 * (ADR-004 / AM-24). A mutant that flips this default is registered in the mutation registry.
 */
export declare function resolveVetoMode(projectConfig: unknown): VetoMode;
//# sourceMappingURL=shell-veto-policy.d.ts.map
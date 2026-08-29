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
/** The one rule id this leg ships. Exported so tests and the probe cannot drift from it. */
export const SHELL_VETO_RULE_ID = 'ssh-explicit-auth-weakening';
/**
 * Shell word boundaries. Both ends of every token are anchored, so `echo "sshpassword"` and
 * `--my-passwordauthentication=yes` cannot hit: a user-global guard that matches on a bare
 * substring is one common word away from a machine-wide outage.
 */
const BOUNDARY = String.raw `[\s;&|()'"\`]`;
const OPT = String.raw `(?:^|${BOUNDARY})-o\s*`;
const END = String.raw `(?=$|${BOUNDARY})`;
/** `-o PasswordAuthentication=yes` — the user turns ON password auth against the ssh default. */
const PASSWORD_AUTHENTICATION = new RegExp(`${OPT}passwordauthentication\\s*=\\s*yes${END}`, 'i');
/** `-o PubkeyAuthentication=no` — the user turns OFF key auth. */
const PUBKEY_AUTHENTICATION = new RegExp(`${OPT}pubkeyauthentication\\s*=\\s*no${END}`, 'i');
/** `-o PreferredAuthentications=…password…` — the user ORDERS password auth ahead of pubkey. */
const PREFERRED_AUTHENTICATIONS = new RegExp(`${OPT}preferredauthentications\\s*=\\s*` +
    `(?:[a-z][a-z0-9-]*\\s*,\\s*)*` +
    `(?:password|keyboard-interactive)` +
    `(?:\\s*,\\s*[a-z][a-z0-9-]*)*${END}`, 'i');
/** `sshpass` as a COMMAND TOKEN — a password is fed to ssh from the command line by construction. */
const SSHPASS_TOKEN = new RegExp(`(?:^|${BOUNDARY})sshpass${END}`, 'i');
/**
 * Judge one raw shell command.
 *
 * @returns a {@link VetoHit} when the command EXPLICITLY weakens ssh authentication, else `null`.
 *          Pure: no filesystem, no environment, no config, no clock.
 */
export function vetoShellCommand(command) {
    if (typeof command !== 'string' || command === '')
        return null;
    if (SSHPASS_TOKEN.test(command)) {
        return {
            rule: SHELL_VETO_RULE_ID,
            reason: 'sshpass feeds an ssh password from the command line, disabling key-based auth by construction',
        };
    }
    if (PASSWORD_AUTHENTICATION.test(command)) {
        return {
            rule: SHELL_VETO_RULE_ID,
            reason: 'PasswordAuthentication=yes turns ON password auth against the ssh default',
        };
    }
    if (PUBKEY_AUTHENTICATION.test(command)) {
        return {
            rule: SHELL_VETO_RULE_ID,
            reason: 'PubkeyAuthentication=no turns OFF key auth',
        };
    }
    if (PREFERRED_AUTHENTICATIONS.test(command)) {
        return {
            rule: SHELL_VETO_RULE_ID,
            reason: 'PreferredAuthentications orders password/keyboard-interactive auth ahead of pubkey',
        };
    }
    return null;
}
/**
 * Resolve the enforcement mode from a parsed `.dz/config.json`.
 *
 * ABSENT, unknown, non-string, or malformed ⇒ `'warn'`. Never `'block'` by default: fail-closed is
 * a decision the owner makes, not one a user-global hook install imposes on every directory
 * (ADR-004 / AM-24). A mutant that flips this default is registered in the mutation registry.
 */
export function resolveVetoMode(projectConfig) {
    if (typeof projectConfig !== 'object' || projectConfig === null)
        return 'warn';
    const hooks = projectConfig['hooks'];
    if (typeof hooks !== 'object' || hooks === null)
        return 'warn';
    const mode = hooks['shellVeto'];
    if (mode === 'off' || mode === 'warn' || mode === 'block')
        return mode;
    return 'warn';
}
//# sourceMappingURL=shell-veto-policy.js.map
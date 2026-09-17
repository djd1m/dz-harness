/**
 * Shared debt-ratchet verdict — one place, called by every "N exceeds ceiling C" gate.
 *
 * WHY (backlog `19e671ebfea26fc9`, feature debt-ceiling-diff): a count-only ceiling knows how MANY
 * debt items exist but not WHICH ones. Once the set crosses the ceiling, printing "every current
 * finding" drowns the one new offender in a legacy list of 100+ — the check technically fires, but
 * a human (or an agent) reading the failure cannot see what actually changed. Pinning the set
 * alongside the count lets the verdict print a DIFFERENCE: `added` (new, not in the pinned set) and
 * `resolved` (pinned, no longer present) — the legacy tail stops being printed at all.
 *
 * The three-way verdict:
 *   - current.length > ceiling  → ok:false, names only the newly added ids/findings.
 *     If `added` is empty despite being over ceiling, the pinned set and the ceiling number have
 *     drifted apart (caller error, not a real debt increase) — the message says so explicitly
 *     rather than silently printing an empty new: list.
 *   - current.length < ceiling  → ok:true, suggests lowering the ceiling, names what resolved.
 *   - current.length === ceiling → ok:true UNLESS the membership itself changed (one debt swapped
 *     for another at the same count) — that specific case is ok:false with a `swapped:` message,
 *     because a same-count substitution is exactly the failure mode a raw-number ratchet cannot see:
 *     a new debt item can hide behind a legacy one that happened to be fixed in the same window.
 */
export interface DebtRatchetArgs {
    readonly label: string;
    readonly current: readonly string[];
    readonly pinned: readonly string[];
    readonly ceiling: number;
}
export interface DebtRatchetVerdict {
    readonly ok: boolean;
    readonly message: string;
    readonly added: string[];
    readonly resolved: string[];
}
export declare function debtRatchetVerdict(args: DebtRatchetArgs): DebtRatchetVerdict;
export interface PinnedCeiling {
    readonly count: number;
    readonly pinned: string[];
    readonly measuredAt: string;
    readonly reproducer: string;
}
/**
 * Reads a debt-ceiling json file and requires the pinned set to agree with the declared count —
 * a ceiling whose set and number disagree is not trustworthy data, so this fails loud rather than
 * trusting the number alone (the exact defect this feature exists to close).
 */
export declare function ceilingUnreadableMessage(file: string): string;
/**
 * PURE: the caller reads the file (tests own their I/O — the core-boundary ratchet counts src files
 * that touch node:fs, and a debt-ceiling parser has no business being one); `file` is only used to
 * name the offending file in error messages.
 */
export declare function parsePinnedCeiling(source: string, file: string, countField: 'unobserved' | 'uncommented', setField: 'ids' | 'findings'): PinnedCeiling;
//# sourceMappingURL=debt-ratchet.d.ts.map
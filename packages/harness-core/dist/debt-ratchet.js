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
export function debtRatchetVerdict(args) {
    const { label, current, pinned, ceiling } = args;
    const pinnedSet = new Set(pinned);
    const currentSet = new Set(current);
    const added = current.filter((id) => !pinnedSet.has(id));
    const resolved = pinned.filter((id) => !currentSet.has(id));
    const n = current.length;
    // Lead delta after Codex r1 (MEDIUM): a "set" with duplicates is not a set — the count, the +K and
    // the suggested ceiling would all be wrong. Loud, never normalised silently.
    if (currentSet.size !== n) {
        const dupes = current.filter((id, i) => current.indexOf(id) !== i);
        return { ok: false, message: `${label}: duplicate ids in the current set (${[...new Set(dupes)].join(', ')}) — the count ${n} is not a set size`, added, resolved };
    }
    // Lead delta after Codex r1 (HIGH): ANY new debt is a failure, whatever the count does — two legacy
    // items resolved plus one new one is 2 < 3 by count and would otherwise pass silently, hiding the
    // very thing this ratchet exists to name. The count-only ceiling never hid this any better; the
    // pinned set finally makes it visible.
    if (n <= ceiling && added.length > 0) {
        return {
            ok: false,
            message: `${label} ${n}; ceiling ${ceiling}, but NEW debt appeared: new: ${added.join(', ')}; resolved: ${resolved.length > 0 ? resolved.join(', ') : '(none)'}`,
            added,
            resolved,
        };
    }
    if (n > ceiling) {
        const newPart = added.length > 0 ? added.join(', ') : '(none — set/ceiling inconsistent)';
        const resolvedPart = resolved.length > 0 ? resolved.join(', ') : '(none)';
        return {
            ok: false,
            message: `${label} ${n} exceeds ceiling ${ceiling} (+${n - ceiling}): new: ${newPart}; resolved: ${resolvedPart}`,
            added,
            resolved,
        };
    }
    if (n < ceiling) {
        const resolvedPart = resolved.length > 0 ? resolved.join(', ') : '(none)';
        return {
            ok: true,
            message: `${label} ${n}; ceiling can be lowered to ${n}; resolved: ${resolvedPart}`,
            added,
            resolved,
        };
    }
    // n === ceiling with no new ids: a swap (one resolved, one added) is already caught above by the
    // any-new-debt rule, so the only way to land here is an unchanged set — a clean pass.
    return {
        ok: true,
        message: `${label} ${n}; ceiling ${ceiling}`,
        added,
        resolved,
    };
}
/**
 * Reads a debt-ceiling json file and requires the pinned set to agree with the declared count —
 * a ceiling whose set and number disagree is not trustworthy data, so this fails loud rather than
 * trusting the number alone (the exact defect this feature exists to close).
 */
export function ceilingUnreadableMessage(file) {
    return `Cannot read ${file}; measure the debt and create this ceiling file by hand.`;
}
/**
 * PURE: the caller reads the file (tests own their I/O — the core-boundary ratchet counts src files
 * that touch node:fs, and a debt-ceiling parser has no business being one); `file` is only used to
 * name the offending file in error messages.
 */
export function parsePinnedCeiling(source, file, countField, setField) {
    const parsed = JSON.parse(source);
    const count = parsed[countField];
    const set = parsed[setField];
    const measuredAt = parsed.measuredAt;
    const reproducer = parsed.reproducer;
    if (!Number.isSafeInteger(count) || count < 0
        || typeof measuredAt !== 'string' || typeof reproducer !== 'string'
        || !Array.isArray(set) || !set.every((item) => typeof item === 'string')) {
        throw new Error(`Invalid debt ceiling: ${file}`);
    }
    if (set.length !== count) {
        throw new Error(`Invalid debt ceiling: ${file}: ${setField}.length ${set.length} ≠ ${countField} ${count}`);
    }
    if (new Set(set).size !== set.length) {
        throw new Error(`Invalid debt ceiling: ${file}: ${setField} contains duplicates — a pinned set must be a set`);
    }
    return { count: count, pinned: set, measuredAt, reproducer };
}
//# sourceMappingURL=debt-ratchet.js.map
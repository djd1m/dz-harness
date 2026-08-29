/**
 * The ONE event-level managed-hook merge (`crossrt-2-codex-hooks`, AM-3 / G-E).
 *
 * Both hook targets — Claude Code's `.claude/settings.json` and Codex's
 * `$CODEX_HOME/hooks.json` — need the same operation: per event, KEEP every entry that is not ours
 * (byte-identical, same order) and append the entries that are. Before this module the Claude half
 * lived inline in `setup.ts` and the Codex half did not exist; a second dialect would have been the
 * obvious way to write it and the wrong one.
 *
 * What differs between the targets is ONLY the attribution predicate, so that is the parameter:
 * the Claude path passes its historical substring list verbatim (bytes must not move — AM-3), the
 * Codex path passes sha-over-manifest (ADR-001 §3: dz never deletes what it cannot prove it wrote).
 *
 * The plan (AM-37) is explicit that the extracted block has **three** outputs, not one: the merged
 * body, the REPORT tail string, and the no-write path (`changed === false`). A golden test on the
 * merged bytes alone would pass while the report text and the no-write behaviour silently changed,
 * so all three are part of {@link HookMergePlan}.
 *
 * Pure: no I/O, no clock, no environment.
 *
 * @packageDocumentation
 */
/**
 * Commands of a hook entry in EITHER shape: the valid matcher-group form
 * `{matcher?, hooks:[{type,command}]}` or the legacy flat `{type,command}`.
 *
 * Deliberately duplicated from `setup.ts`'s `commandsOf` rather than imported: `setup.ts` imports
 * this module, and the reverse edge would be a cycle. The two are pinned equal by a test.
 */
export function hookCommandsOf(entry) {
    const e = entry;
    if (Array.isArray(e?.hooks))
        return e.hooks.map((h) => String(h?.command ?? ''));
    return [String(e?.command ?? '')];
}
/**
 * Merge `managed` into `existingHooks` at EVENT level.
 *
 * - Events absent from `managed` are copied through untouched (including unknown ones), and their
 *   entries still count toward `foreignPreserved` — the number answers "how many of the user's
 *   entries did this registry hold and keep", not "how many survived the touched events".
 * - Within a touched event, non-ours entries keep their relative order and object identity, then
 *   the managed entries are appended.
 * - `merge(merge(x)) === merge(x)`.
 */
export function mergeManagedHookEntries(existingHooks, managed, options) {
    const source = existingHooks ?? {};
    const hooks = {};
    for (const event of Object.keys(source)) {
        hooks[event] = Array.isArray(source[event]) ? [...source[event]] : [];
    }
    // Census FIRST, over the whole input, so the counts do not depend on which events are touched.
    let foreignPreserved = 0;
    let unattributable = 0;
    for (const [event, entries] of Object.entries(source)) {
        if (!Array.isArray(entries))
            continue;
        for (const entry of entries) {
            if (options.isManaged(entry, event)) {
                // A mixed group counts as a preserved foreign entry when something of the user's survives
                // in it — the census must not report zero for a handler the merge actually keeps.
                if (options.retainForeign?.(entry, event) != null)
                    foreignPreserved += 1;
                continue;
            }
            foreignPreserved += 1;
            if (options.looksLikeOurs?.(entry, event) === true)
                unattributable += 1;
        }
    }
    let changed = false;
    let replacedLegacy = false;
    for (const event of Object.keys(managed)) {
        const current = Array.isArray(hooks[event]) ? hooks[event] : [];
        const kept = [];
        for (const entry of current) {
            const ours = options.isManaged(entry, event);
            if (!ours) {
                kept.push(entry);
                continue;
            }
            if (options.isLegacy?.(entry, event) === true)
                replacedLegacy = true;
            const salvaged = options.retainForeign?.(entry, event) ?? null;
            if (salvaged !== null)
                kept.push(salvaged);
        }
        const next = [...kept, ...(managed[event] ?? [])];
        if (JSON.stringify(next) !== JSON.stringify(current))
            changed = true;
        hooks[event] = next;
    }
    const label = options.reportLabel ?? 'managed';
    const report = !changed
        ? (options.unchangedReport ?? 'hooks already current')
        : replacedLegacy
            ? `replaced legacy dz hooks with ${label} hooks`
            : `merged ${label} hooks (user hooks preserved)`;
    return { hooks, changed, report, replacedLegacy, foreignPreserved, unattributable };
}
//# sourceMappingURL=managed-hooks.js.map
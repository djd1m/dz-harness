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
/** One hook registry entry, in either the matcher-group or the legacy flat shape. */
export type ManagedHookEntry = unknown;
/**
 * Commands of a hook entry in EITHER shape: the valid matcher-group form
 * `{matcher?, hooks:[{type,command}]}` or the legacy flat `{type,command}`.
 *
 * Deliberately duplicated from `setup.ts`'s `commandsOf` rather than imported: `setup.ts` imports
 * this module, and the reverse edge would be a cycle. The two are pinned equal by a test.
 */
export declare function hookCommandsOf(entry: ManagedHookEntry): string[];
export interface HookMergePlan {
    /** The merged registry body, ready to serialize. */
    readonly hooks: Record<string, ManagedHookEntry[]>;
    /** False ⇒ the caller must NOT write (the `hooks already current` no-write path — AM-37). */
    readonly changed: boolean;
    /** The setup REPORT tail string. Part of the extracted block's contract, not decoration (AM-37). */
    readonly report: string;
    /** A legacy-shaped entry of ours was replaced (drives the Claude report wording). */
    readonly replacedLegacy: boolean;
    /** Entries kept because they are NOT ours, across the WHOLE registry. G-D's number. */
    readonly foreignPreserved: number;
    /**
     * Entries that RESEMBLE ours but are not attributable to the manifest. They are KEPT and counted —
     * never deleted (ADR-001 §3). Distinct from `replacedLegacy`, which is about our OWN old vintages.
     */
    readonly unattributable: number;
}
export interface MergeManagedHookOptions {
    /** True ⇒ this entry is OURS and is replaced by the managed set for that event. */
    readonly isManaged: (entry: ManagedHookEntry, event: string) => boolean;
    /**
     * True ⇒ this entry resembles ours but could not be attributed. Optional; when omitted nothing is
     * counted. Never causes deletion — only counting and a warning upstream.
     */
    readonly looksLikeOurs?: (entry: ManagedHookEntry, event: string) => boolean;
    /** True ⇒ this OURS entry was in a legacy shape/vintage (Claude path only). */
    readonly isLegacy?: (entry: ManagedHookEntry, event: string) => boolean;
    /**
     * Per-HANDLER salvage for an entry `isManaged` claimed. Given an OWNED entry, return it rebuilt
     * from only the handlers that are NOT ours, or `null` when every handler was ours.
     *
     * Optional, and absent means the historical whole-entry behaviour — the Claude path passes
     * nothing and is byte-identical to before (AM-3). The Codex path passes it because attribution at
     * matcher-group granularity deleted a foreign handler that merely shared a group with dz's
     * (independent review, finding 6).
     */
    readonly retainForeign?: (entry: ManagedHookEntry, event: string) => ManagedHookEntry | null;
    /** e.g. `'agentdb'` → `merged agentdb hooks (user hooks preserved)`. */
    readonly reportLabel?: string;
    /** Report text when nothing changed. */
    readonly unchangedReport?: string;
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
export declare function mergeManagedHookEntries(existingHooks: Record<string, ManagedHookEntry[]> | undefined, managed: Record<string, ManagedHookEntry[]>, options: MergeManagedHookOptions): HookMergePlan;
//# sourceMappingURL=managed-hooks.d.ts.map
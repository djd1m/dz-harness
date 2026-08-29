/**
 * teach-target — which store does THIS lesson belong to, and who decided.
 *
 * The owner asked for a per-session choice: "in this session accumulate per project; in another,
 * across all projects." For a CLI every invocation is a fresh process, so there is no session
 * object to hold a mode. An environment variable IS a shell session — set once, governs every
 * command in that terminal, dies with it. A persisted file would outlive what the user meant by
 * "this session" and become a mode nobody remembers setting.
 *
 * This increment is third on purpose. A mode set once and forgotten lies silently, and it is safe
 * here only because `learning-store-says-where` already makes every write announce its destination.
 * This adds the other half of that sentence: not only WHERE the lesson landed, but WHY that store
 * was chosen. A fact that is not stated cannot be checked.
 */
/** Where a lesson is written. */
export type TeachStore = 'project' | 'global';
/** Who decided — the reason is printed, so a forgotten mode cannot stay invisible. */
export type TeachReason = 'flag' | 'environment' | 'config' | 'default';
export interface TeachTarget {
    readonly store: TeachStore;
    readonly reason: TeachReason;
}
/** Refusal, never a silent fallback. */
export declare class TeachTargetError extends Error {
}
export declare const TEACH_STORES: readonly TeachStore[];
/**
 * Resolve the destination.
 *
 * Precedence, most specific first: `--to` → `DZ_LEARN` → project config → `project`.
 * That ordering is the only one a user can predict without reading the source.
 *
 * **The default does not move.** MEASURED: 361 records in this repo's own store were written under
 * today's behaviour, and every other user's store is the same. Redirecting an un-flagged `dz teach`
 * would silently change every existing workflow, and the user would find out when a lesson was not
 * where they expected it.
 */
export declare function resolveTeachTarget(input: {
    flag?: string | undefined;
    env?: string | undefined;
    config?: string | undefined;
}): TeachTarget;
/**
 * How the reason reads in the store line.
 *
 * Each phrase names WHERE the decision came from, so a user who set `DZ_LEARN=global` three hours
 * ago and forgot has something to recognise. `default` deliberately says nothing extra: adding a
 * phrase there would change the line for every user who set nothing, breaking the byte-identity
 * this feature promises them.
 */
export declare function teachReasonPhrase(reason: TeachReason): string;
/**
 * Read the project default from `.dz/config.json` → `learning.teachTo`.
 *
 * Returns the RAW string, not a validated store: an unreadable file is "no opinion", but a file
 * that says `teachTo: "globl"` HAS an opinion and must be refused by `resolveTeachTarget` rather
 * than swallowed here. Those two cases are different and the caller can only tell them apart if
 * this function keeps them apart.
 */
export declare function readTeachToConfig(projectRoot: string): string | undefined;
//# sourceMappingURL=teach-target.d.ts.map
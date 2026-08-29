/**
 * `dz name-check` — is this name free, before a line of code is written?
 *
 * WHY THIS EXISTS, stated plainly: twice in one day a name collision broke the build outright.
 * `dz retro` was already a command (the per-session process retro), and its star re-export clash
 * stopped the CLI from importing at all; `decideProvenance` was already an export (npm provenance),
 * and the build went red mid-feature. MEASURED 2026-08-24: `case 'retro':` is in the dispatcher, and
 * both `buildRetro` and `decideProvenance` are in the core's 1020-name public surface — so BOTH were
 * answerable before any code, and nobody asked.
 *
 * The owner's question was "what guarantees you will check?". An agent's intention is layer 4 on this
 * project's cost-of-detection ladder: it works while remembered and is silent when it lapses. A
 * command is the guarantee; a promise is not.
 *
 * PURE: no filesystem here. The scan runs in the CLI and arrives as facts — see ADR-001 for why
 * those facts come from SOURCE and never from `dist`.
 */
/** What kind of name was asked about. */
export type NameKind = 'command' | 'module' | 'export';
export interface NameQuery {
    readonly kind: NameKind;
    readonly name: string;
}
export interface NameFacts {
    /** Command names found in the dispatcher and in the help block. */
    readonly commands: ReadonlySet<string>;
    /** Module basenames found as `src/<basename>.ts` in any workspace package. */
    readonly modules: ReadonlyMap<string, string>;
    /** Exported identifiers found by scanning SOURCE, mapped to the file that declares them. */
    readonly exports: ReadonlyMap<string, string>;
    /**
     * True when the scan itself could not be performed (no workspace found, unreadable tree).
     * A scan that did not run must never report "free" — that is the whole failure this command
     * exists to prevent, one level up.
     */
    readonly scanFailed?: boolean;
    /**
     * What the sweep actually saw. Reported to the operator, because "one empty .ts file in a
     * lookalike directory" and "the real workspace" both used to satisfy a bare did-it-open-a-file
     * test, and the second question a reviewer asked was exactly that (2026-08-24).
     */
    readonly scanned?: {
        readonly packages: number;
        readonly files: number;
        readonly exports: number;
        readonly commands: number;
    };
}
export type NameVerdict = 'free' | 'taken';
export interface NameResolution {
    readonly kind: NameKind;
    readonly name: string;
    readonly verdict: NameVerdict;
    /** Where the collision lives, when there is one. Empty for a free name. */
    readonly where: string;
}
export type NameOutcome = 'free' | 'taken' | 'not-established';
export interface NameDecision {
    readonly outcome: NameOutcome;
    /** 0 every name free · 1 at least one taken · 2 nothing asked or the scan did not run. */
    readonly exit: 0 | 1 | 2;
    readonly results: readonly NameResolution[];
    readonly reason: string;
}
/** Is a proposed name already spoken for? */
export declare function classifyName(query: NameQuery, facts: NameFacts): NameResolution;
/**
 * The whole verdict.
 *
 * Two ways to be not-established, and neither returns zero: nothing was asked, or the scan did not
 * run. "I checked nothing" and "nothing is taken" are different answers, and a gate that conflates
 * them is green exactly when it is blind — the defect measured on `dz sync` (0/0, exit 0) and on the
 * source scanner that printed `github: 0` for a 401.
 */
export declare function decideNameCheck(queries: readonly NameQuery[], facts: NameFacts): NameDecision;
export declare function renderNameCheck(decision: NameDecision, scanned?: NameFacts['scanned']): string[];
/**
 * Exported identifiers declared in one TypeScript source file.
 *
 * Deliberately a scanner over DECLARATIONS, not a loader of the built package (ADR-001): a stale
 * `dist` answers "free" about a name the source already took, and answers it confidently. MEASURED
 * 2026-08-22 in this repo — half an hour of live runs against a previous build while `tsc` was red.
 */
/**
 * Source with comments blanked out, quotes respected.
 *
 * Trivia may sit between ANY two tokens: an `export` followed by a block comment and then `class`
 * was reported FREE, because the declaration pattern expects the keyword to be adjacent
 * (cross-family review round 4, codex gpt-5.6-sol, 2026-08-24). Rather than widen the pattern for
 * one shape of trivia, the trivia is removed first — which fixes the whole class at once.
 *
 * Newlines are PRESERVED so line-anchored patterns keep their anchors.
 */
export declare function stripComments(source: string): string;
export declare function exportedNamesIn(rawSource: string): string[];
/** Command names a CLI source dispatches. The help block is scanned separately by the caller. */
export declare function dispatchedCommandsIn(source: string): string[];
//# sourceMappingURL=name-check.d.ts.map
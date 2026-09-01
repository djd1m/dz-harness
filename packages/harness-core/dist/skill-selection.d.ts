/**
 * `--select` resolution: one provider per requested skill, decided ONCE (backlog 9d15b9b6, PR-A).
 *
 * THE DEFECT THIS REPLACES. `installSkills` looped the installer once PER ROOT, handing each root
 * the same select list. Asking each root independently produces two failures that look like
 * opposites but share one cause — the REQUEST was never resolved, only re-asked:
 *
 *   - a skill present in two roots was installed TWICE and counted twice. The field report's
 *     observed `2 skill(s)` was ONE skill installed twice, read by everyone as an orchestrator plus
 *     its stage skill (features/digitize-book-codex-init-research/00_research/00-root-cause.md);
 *   - a skill present in NO root produced a warning and exit 0. `0 skill(s)` read as success, which
 *     is the same class as a health check reporting clean because it could not look.
 *
 * WHY A PURE MODULE. The decision must happen BEFORE anything is written — an exit 1 that arrives
 * after hooks and memory are installed leaves a half-configured project, which is worse than either
 * outcome. A pure resolver can be called at the top of the seam and interrogated without side
 * effects; a resolver tangled with the filesystem cannot.
 *
 * DELIBERATELY NOT HERE: dependency closure (an orchestrator pulling its stage skills). That is
 * PR-B. Mixing the two would put a correctness fix and a semantic change in one unreviewable
 * change, and the exit-contract fix is what unblocks the rest.
 */
/** One skill root and the ids it offers, in the order discovery returned them. */
export interface SkillRoot {
    readonly dir: string;
    readonly ids: readonly string[];
}
/** The single root chosen to provide one requested id. */
export interface ChosenProvider {
    readonly id: string;
    readonly dir: string;
}
/**
 * A requested id offered by more than one root. NOT an error: precedence resolves it. But it is
 * NAMED, because an operator who sees one install where two roots offer the skill must be able to
 * learn which root lost — otherwise the precedence is folklore, and the next person re-derives it.
 */
export interface ShadowedProvider {
    readonly id: string;
    readonly chosen: string;
    readonly alsoIn: readonly string[];
}
export interface SelectResolution {
    /** One entry per DISTINCT requested id that resolved, in request order. */
    readonly chosen: readonly ChosenProvider[];
    /** Requested ids no root offers. Non-empty means the caller must refuse and write nothing. */
    readonly missing: readonly string[];
    /** Requested ids offered by several roots, with the losers named. */
    readonly shadowed: readonly ShadowedProvider[];
    /** True only when EVERY requested id resolved. Shadowing does not make it false. */
    readonly ok: boolean;
}
/**
 * PRECEDENCE IS ROOT ORDER, and that is a promise, not an implementation detail: the first root in
 * `roots` that offers an id provides it. Callers pass roots in discovery order, so the rule the
 * operator can state ("the earlier root wins") is the rule that runs. The previous behaviour
 * depended on `readdir` order inside each root and on the loop visiting roots — an order nobody
 * documented and nobody could rely on.
 *
 * Asking for the same id twice is asking once: a request is a SET of skills, and duplicating a name
 * in the argument does not duplicate an installation.
 */
export declare function resolveSelection(select: readonly string[], roots: readonly SkillRoot[]): SelectResolution;
/**
 * The refusal an explicit `--select` owes its caller. Returns null when there is nothing to refuse.
 *
 * Shaped as text rather than an exception so the seam can print it and return a code without a
 * try/catch that a later edit might swallow — the failure mode this whole change exists to remove
 * is a problem that produced a warning and kept going.
 */
export declare function formatSelectRefusal(resolution: SelectResolution, roots: readonly SkillRoot[]): string | null;
//# sourceMappingURL=skill-selection.d.ts.map
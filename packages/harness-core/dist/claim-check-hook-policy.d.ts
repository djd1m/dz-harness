/** Options for {@link hookDecision}. */
export interface HookDecisionOpts {
    /** `'warn'` (DEFAULT — the never-block policy) or `'deny'` (opt-in strict, still doubly guarded). */
    readonly mode?: 'warn' | 'deny';
    /** An `Edit`'s pre-image (`old_string`), used by the new-line deny guard. Absent for a `Write`. */
    readonly oldString?: string;
}
/** The decision the `.cjs` adapter renders into hook JSON. */
export interface HookDecision {
    /** `'allow'` on every default-policy path; `'deny'` only under opt-in strict mode + both guards. */
    readonly action: 'allow' | 'deny';
    /** Model-facing finding report (always ends with the backtick-escape teaching). `null` when clean. */
    readonly additionalContext: string | null;
    /** User-facing summary; populated only when there is a `high` finding. `null` when clean or medium-only. */
    readonly systemMessage: string | null;
}
/**
 * The backtick-escape teaching, appended to EVERY finding report. This is the "escape discoverable
 * from the hook's own output" acceptance criterion — an agent that trips a finding while documenting
 * honesty is told exactly how to comply.
 */
export declare const ESCAPE_TEACHING: string;
/**
 * Is the 1-based `line` inside a fenced code block within `text`?
 *
 * MOVED to `claim-check.ts` and re-exported here. The engine skips fenced lines and this hook exempts
 * them from its deny path — if the two ever computed "inside a fence" differently, the hook would deny
 * a line the engine had already dismissed, or vice versa. Two implementations WILL drift; one cannot.
 * The engine owns it because the engine is the pure module with no dependents.
 */
import { isFenced } from './claim-check.js';
export { isFenced };
/**
 * Is `excerpt` a NEW claim line (guard d)? True when there is no pre-image (`oldString` absent/empty —
 * e.g. a `Write`) or the pre-image does not already contain the excerpt. A trailing clip ellipsis
 * (the engine clips excerpts to 120 chars) is stripped before the containment check so an edited-around
 * long pre-existing line is still recognised. Never throws.
 */
export declare function isNewLine(excerpt: string, oldString?: string): boolean;
/**
 * The pure hook decision. Runs the FROZEN `claimCheck` over the pending text and applies the severity
 * policy. NEVER throws. Under the DEFAULT policy (`mode !== 'deny'`) it NEVER returns `action:'deny'`
 * — there is no code path to a deny unless `mode === 'deny'` AND a `high` finding clears BOTH guards.
 */
export declare function hookDecision(text: string, opts?: HookDecisionOpts): HookDecision;
//# sourceMappingURL=claim-check-hook-policy.d.ts.map
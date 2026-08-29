/**
 * Adversarial plan-gate — the challenge panel (feature challenge-panel-plan-gate, ADR-001).
 *
 * feature-adr's cross-model Codex QE (Step 8) bites AFTER the code is written. The most expensive mistakes
 * (overengineering, silent decisions, cemented degradations, test-theater, unrealistic scope) cement at the
 * PLAN stage. This module is the deterministic "cartridge": it assembles a WIDE context pack and emits a
 * fixed C1-C8 "break it, don't confirm it" brief + a verdict schema. The LLM "shot" — a FRESH adversary that
 * did NOT write the plan, plus a mandatory cross-validator — is fired by the `challenge-panel` SKILL.
 *
 * The set/brief/select/render functions are PURE + deterministic (sorted, no clock/random) so the same
 * context yields a byte-identical brief; the assemble helper does disk I/O with TOP-LEVEL node:fs imports
 * (harness-core is ESM — a lazy require() is undefined at runtime; the R1 footgun).
 *
 * SAFETY PROPERTIES (load-bearing, both named by the ADR and pinned by a test):
 *   1. (ADR §1) `pickAdversaryModel` returns a family DIFFERENT from the plan author — the panel is never
 *      the plan's own author (author bias). The врезка/skill honor this; the helper makes it testable.
 *   2. (ADR §2) `buildChallengeBrief` inlines the WIDE context (vision + testing + map + degradations +
 *      code hints when supplied) — narrow context = shallow findings (the archive's core lesson).
 *   3. (ADR §3) C1 is degradation-registry-aware: deviating from a REGISTERED accepted degradation is NOT a
 *      finding; and the gate is ADVISE — `confirmedVerdict` drops non-cross-validated P0/P1 (FP/theory),
 *      nothing here auto-aborts.
 */
/** Blob version stamp read by scripts/gen-loop-blobs.mjs (feature loop-designer, ADR-004) — the
 * ONLY loop-designer change to this canonical file; bump when any blob-exported semantic changes. */
export declare const CHALLENGE_PANEL_BLOB_VERSION = "1.0.0";
export type CId = 'C1' | 'C2' | 'C3' | 'C4' | 'C5' | 'C6' | 'C7' | 'C8';
export type ChallengeSeverity = 'P0' | 'P1' | 'P2';
export interface ChallengeQuestion {
    readonly id: CId;
    readonly title: string;
    readonly prompt: string;
}
/**
 * The fixed, DEPERSONALIZED owner-question set (FR-2). Frozen + generic — no product/vendor/section-number
 * hardcode. Each is phrased in "break it, don't confirm it" mode. C1 is degradation-registry-aware.
 */
export declare const CHALLENGE_QUESTIONS: readonly ChallengeQuestion[];
export interface ChallengeContext {
    readonly plan: string;
    readonly planPath: string;
    readonly vision?: string;
    readonly testing?: string;
    readonly map?: string;
    readonly degradations?: string;
    readonly codeHints?: string;
}
/** JSON Schema for the panel's verdict — the skill forces the adversary to emit exactly this shape. */
export declare const CHALLENGE_VERDICT_SCHEMA: object;
export interface ChallengeFinding {
    readonly c: CId;
    readonly severity: ChallengeSeverity;
    readonly title: string;
    readonly why: string;
    readonly where?: string;
    readonly crossValidated?: boolean;
}
export interface Verdict {
    readonly findings: readonly ChallengeFinding[];
    readonly summary: string;
}
/**
 * Assemble the WIDE context pack (FR-1). Impure I/O; NEVER throws — a missing plan yields an empty `plan`
 * (the caller/CLI reports it), a missing calibration doc simply drops that field.
 */
export declare function assembleChallengeContext(repoRoot: string, planPath: string): ChallengeContext;
/**
 * PURE (FR-1/NFR-1): same context → byte-identical brief. Inlines the WIDE context (vision + testing + map +
 * degradations + code hints when present) so the adversary reasons over the whole product, not a slice
 * (ADR §2), and states the hard invariant + the "break it" mandate + the degradation-registry rule.
 */
export declare function buildChallengeBrief(ctx: ChallengeContext): string;
/**
 * Sanitize ONE raw finding (QE #10): reject anything whose `c`/`severity` is not a known enum value or
 * whose required strings are missing — an out-of-enum finding NEVER survives to render/gate. Returns null
 * for a bad finding so the caller drops it.
 */
export declare function sanitizeFinding(raw: unknown): ChallengeFinding | null;
/**
 * Validate a raw adversary payload into a Verdict (QE #7): a value without a `findings` ARRAY is NOT a
 * verdict (returns null → the caller falls back LOUDLY, never a fake-clean empty verdict). Bad individual
 * findings are dropped via sanitizeFinding; `summary` defaults to '' but the shape must be right.
 */
export declare function sanitizeVerdict(raw: unknown): Verdict | null;
/** The P0/P1 findings that MUST be cross-validated before reaching the owner (FR-5). Sorted, deterministic. */
export declare function findingsNeedingCrossValidation(v: Verdict): ChallengeFinding[];
/**
 * Drop non-cross-validated P0/P1 (FP/theory) — the anti-noise / advise-not-block property (ADR §3, FR-5).
 * POSITIONAL, collision-free (QE #5/#6): `realFlags[i]` aligns to `findingsNeedingCrossValidation(v)[i]` —
 * matching by INDEX, never by title, so two findings sharing a title can never cross-contaminate. A P0/P1
 * survives ONLY when its flag is explicitly `true` (a missing/`false`/`undefined` flag ⇒ dropped — the
 * anti-noise default: not-validated is treated as refuted). P2 pass through untouched. Deterministic sort.
 */
export declare function confirmedVerdict(v: Verdict, realFlags: readonly boolean[]): Verdict;
/** Human surface, grouped by severity (FR-3). ADVISE — never an abort. PURE. */
export declare function renderVerdict(v: Verdict): string;
/**
 * HARD INVARIANT (ADR §1, FR-4): pick an adversary model family DIFFERENT from the plan author's, so the
 * panel is never the plan's own author (author bias). Claude author → Codex adversary; Codex author →
 * a fresh Claude adversary. PURE — the врезка/skill call this and dispatch accordingly.
 */
export declare function pickAdversaryModel(plannerModel: string): {
    model: string;
    note: string;
};
/** Normalize a model id to a coarse family for the panel-≠-author invariant. */
export declare function classifyModelFamily(model: string): 'claude' | 'openai' | 'unknown';
//# sourceMappingURL=challenge-panel.d.ts.map
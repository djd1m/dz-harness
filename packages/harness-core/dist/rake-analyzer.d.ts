/**
 * MR rake analyzer (feature mr-rake-analyzer, ADR-001).
 *
 * Mines a project's review corpus for RECURRING mistakes ("rakes") and closes them into self-learning.
 * The parse/normalize/detect/render functions are PURE + deterministic (sorted, no clock/random) so the
 * same corpus yields a byte-identical report; the load/scan helpers do disk I/O with TOP-LEVEL node:fs
 * imports (harness-core is ESM — a lazy require() is undefined at runtime; the R1 footgun).
 *
 * Signature is DETERMINISTIC (ADR-001 §1): a rule table of known rake classes, with an unmatched finding
 * falling to a normalized-text bucket so novel recurrences still cluster. LLM classification is an optional
 * amplifier, never in this core.
 *
 * SAFETY PROPERTY (ADR-001 §3, load-bearing): a finding whose signature appears in fewer than
 * `thresholds.candidate` DISTINCT sources is a one-off — it is NEVER a rake and never reaches teach/critic.
 */
export type Severity = 'blocker' | 'high' | 'medium' | 'low' | 'unknown';
export interface Finding {
    readonly source: string;
    readonly severity: Severity;
    readonly text: string;
    readonly site?: string;
}
export interface Rake {
    readonly signature: string;
    readonly label: string;
    readonly sources: readonly string[];
    readonly count: number;
    readonly severity: Severity;
    readonly examples: readonly Finding[];
    readonly status: 'candidate' | 'confirmed';
}
export interface RakeThresholds {
    readonly candidate: number;
    readonly confirmed: number;
}
export declare const DEFAULT_RAKE_THRESHOLDS: RakeThresholds;
export interface RakeReport {
    readonly rakes: readonly Rake[];
    readonly totalFindings: number;
    readonly oneOffs: number;
}
export interface RakeSignature {
    readonly id: string;
    readonly label: string;
    readonly patterns: readonly RegExp[];
}
/**
 * Known rake classes (extensible, data-only). Seeded from the classes that actually recur in this repo's
 * QE reports — that IS the dogfood. First match in order wins; unmatched → normalized-text bucket.
 */
export declare const RAKE_SIGNATURES: readonly RakeSignature[];
/** Normalize a finding's text to a stable clustering key: lowercase, strip sites/numbers/punct, top significant words. */
export declare function normalizeText(text: string): string;
/** The signature of a finding: first matching rule, else the normalized-text bucket. */
export declare function signatureOf(finding: Finding): {
    id: string;
    label: string;
};
/**
 * Parse one markdown artifact into findings. Handles (a) severity table rows `| … | High | <text> | … |`,
 * (b) inline markers `[High]` / `**High —**` / `Sev — <text>`. Deterministic; unknown formats yield nothing.
 */
export declare function extractFindings(markdown: string, source: string): Finding[];
/**
 * Detect rakes: group findings by signature, count DISTINCT sources, keep only groups at/above the candidate
 * threshold (a below-threshold group is a one-off, NEVER a rake — the load-bearing anti-noise property).
 * PURE + deterministic (ADR-001 §1): rakes sorted by (count desc, severity desc, signature asc).
 */
export declare function detectRakes(findings: readonly Finding[], thresholds?: RakeThresholds): RakeReport;
/** Human render of the rake report. Deterministic. */
export declare function renderRakeReport(report: RakeReport): string;
/** The teachable rule text for a rake (fed to `dz teach`). Deterministic. */
export declare function rakeAsLesson(rake: Rake): string;
/** Severity → teach reward. Higher-severity rakes are higher-signal lessons. */
export declare function rakeReward(rake: Rake): number;
/** Render the CONFIRMED rakes as a project-critic SKILL.md section (sink B). Deterministic; confirmed only. */
export declare function renderCriticSection(report: RakeReport): string;
/** Find review artifacts: each `features/<slug>/08_qe_report.md` plus any `REVIEW`-named markdown. Sorted. */
export declare function findReviewArtifacts(repoRoot: string): string[];
/** Analyze the whole repo corpus. Impure wrapper: find artifacts → extract → detect. Never throws. */
export declare function analyzeCorpus(repoRoot: string, thresholds?: RakeThresholds): RakeReport;
//# sourceMappingURL=rake-analyzer.d.ts.map
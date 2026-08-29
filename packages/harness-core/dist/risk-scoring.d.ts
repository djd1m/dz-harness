/**
 * 4-axis risk scoring for AI agent tool calls.
 *
 * Inspired by ECC 2.0 (https://github.com/affaan-m/ECC) Rust control-plane.
 * Re-implemented in TypeScript for harness --enrich enrichment.
 *
 * Axes:
 *   1. Base tool risk — inherent danger of the tool type
 *   2. File sensitivity — whether skill targets secrets/infra files
 *   3. Blast radius — scope of potential changes
 *   4. Irreversibility — whether actions can be undone
 *
 * @packageDocumentation
 */
/** Risk score result with per-axis breakdown. */
export interface RiskScore {
    /** Combined score 0.0–1.0 (higher = more risky). */
    readonly total: number;
    /** Risk level derived from total. */
    readonly level: 'low' | 'medium' | 'high' | 'critical';
    /** Per-axis breakdown. */
    readonly axes: {
        readonly base_tool: number;
        readonly file_sensitivity: number;
        readonly blast_radius: number;
        readonly irreversibility: number;
    };
}
/** Configurable thresholds for risk levels. */
export interface RiskThresholds {
    readonly medium: number;
    readonly high: number;
    readonly critical: number;
}
/**
 * Compute 4-axis risk score for a skill based on its SKILL.md content.
 */
export declare function computeRiskScore(skillContent: string, thresholds?: RiskThresholds): RiskScore;
//# sourceMappingURL=risk-scoring.d.ts.map
export type SlopLanguage = 'en' | 'ru';
export type SlopRuleId = 'lexical-density' | 'bullet-wall' | 'triple-adjective-stack';
export interface SlopValidationError {
    readonly field: string;
    readonly value: unknown;
    readonly reason: string;
}
export type ValidationResult<T> = {
    readonly ok: true;
    readonly value: T;
} | {
    readonly ok: false;
    readonly errors: readonly SlopValidationError[];
};
export interface SlopDiagnostic {
    readonly code: 'unclosed-example-block' | 'input-limit-exceeded' | 'analysis-error';
    readonly line: number;
    readonly message: string;
}
export interface SlopRegistryEntry {
    readonly id: string;
    readonly language: SlopLanguage;
    readonly match: {
        readonly kind: 'form' | 'stem' | 'phrase';
        readonly values: readonly string[];
    };
    readonly rationale: string;
    readonly provenance: {
        readonly source: string;
        readonly license: 'repository-authored';
    };
}
export interface SlopRegistry {
    readonly schema: 'dz-slop-registry/1';
    readonly metadata: {
        readonly policyVersion: string;
        readonly owner: string;
        readonly reviewCadence: string;
        readonly englishReference: {
            readonly repository: string;
            readonly commit: string;
            readonly path: string;
            readonly license: 'none-declared';
            readonly retrieved: string;
            readonly use: string;
        };
    };
    readonly markers: readonly SlopRegistryEntry[];
    readonly adjectives: readonly SlopRegistryEntry[];
}
export interface SlopLintConfig {
    readonly schema: 'dz-slop-config/1';
    readonly lexicalDensityPer100Words: Readonly<{
        en: number;
        ru: number;
    }>;
    readonly lexicalMinimumMarkers: number;
    readonly lexicalWordFloor: number;
    readonly bulletMinimumItems: number;
    readonly bulletMinimumLineRatio: number;
    readonly bulletMaximumMeanWords: number;
    readonly adjectiveStackSize: 3;
}
export interface SlopEvidence {
    readonly id: string;
    readonly language: SlopLanguage;
    readonly normalizedSpan: string;
    readonly text: string;
    readonly lineStart: number;
    readonly columnStart: number;
    readonly lineEnd: number;
    readonly columnEnd: number;
    readonly startOffset: number;
    readonly endOffset: number;
    readonly count: 1;
}
export interface SlopFindingMetrics {
    readonly markerCount: number;
    readonly distinctMarkers: number;
    readonly visibleWords: number;
    readonly densityPer100Words: number;
    readonly listItems: number;
    readonly listLineRatio: number;
    readonly listMeanWords: number;
    readonly adjectiveCount: number;
}
export interface SlopFindingThresholds {
    readonly densityPer100Words: number;
    readonly minimumMarkers: number;
    readonly wordFloor: number;
    readonly bulletMinimumItems: number;
    readonly bulletMinimumLineRatio: number;
    readonly bulletMaximumMeanWords: number;
    readonly adjectiveStackSize: 3;
}
export interface SlopFinding {
    readonly ruleId: SlopRuleId;
    readonly severity: 'advisory';
    readonly paragraph: number;
    readonly lineStart: number;
    readonly columnStart: number;
    readonly lineEnd: number;
    readonly columnEnd: number;
    readonly language: SlopLanguage | 'mixed' | 'structural';
    readonly excerpt: string;
    readonly evidence: readonly SlopEvidence[];
    readonly metrics: SlopFindingMetrics;
    readonly thresholds: SlopFindingThresholds;
    readonly suggestion: string;
}
export interface SlopLintResult {
    readonly paragraphCount: number;
    readonly findings: readonly SlopFinding[];
    readonly diagnostics: readonly SlopDiagnostic[];
}
export declare const DEFAULT_SLOP_CONFIG: Readonly<SlopLintConfig>;
export declare const BUNDLED_SLOP_REGISTRY_URL: import("node:url").URL;
export declare function validateSlopLintConfig(value: unknown): ValidationResult<SlopLintConfig>;
export declare function parseSlopRegistry(value: unknown): ValidationResult<SlopRegistry>;
/**
 * Pure deterministic style analysis. The caller supplies already-loaded policy data; this function
 * performs no file, network, database, clock, locale, or process I/O and never throws.
 */
export declare function slopLint(text: string, input: {
    readonly config: SlopLintConfig;
    readonly registry: SlopRegistry;
}): SlopLintResult;
//# sourceMappingURL=slop-lint.d.ts.map
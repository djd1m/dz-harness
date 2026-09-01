export declare const VOLUME_SHADOW_SCHEMA_VERSION: "volume-shadow/v1";
export declare const VOLUME_SHADOW_RULE_IDS: readonly ["template-context-token-weight", "template-context-largest-file-share", "feature-artifact-diff-ratio", "feature-tier-artifact-set"];
export type VolumeShadowRuleId = typeof VOLUME_SHADOW_RULE_IDS[number];
export type FeatureTier = 'S' | 'M' | 'L' | 'XL';
export type VolumeObservationStatus = 'measured' | 'within-reference' | 'outside-reference' | 'unknown';
export declare const VOLUME_SCOPE: {
    readonly included: readonly ["templates/.claude/rules/*.md", "templates/.claude/commands/*.md", "templates/.claude/skills/**/SKILL.md", "features/<slug>/00-09*.md", "features/<slug>/03_adr/**", "features/<slug>/07_code_changes/**"];
    readonly excluded: readonly ["comment-code-density", "comment-count", "code-line-count", "prose-classification", "src/**", "test/**"];
};
export interface VolumeReference {
    readonly kind: 'measured-starting-point' | 'pipeline-contract';
    readonly source: string;
    readonly measuredAt?: string;
    readonly sampleSize?: number;
    readonly low?: number;
    readonly high?: number;
    readonly numerator?: number;
    readonly denominator?: number;
    readonly expected?: readonly string[];
    readonly caveat?: string;
}
type ObservationOperand = number | string | null | readonly string[];
export interface GuardObservation {
    readonly schemaVersion: typeof VOLUME_SHADOW_SCHEMA_VERSION;
    readonly rule: VolumeShadowRuleId;
    readonly metric: string;
    readonly scope: string;
    readonly status: VolumeObservationStatus;
    readonly value: number | readonly string[] | null;
    readonly unit: 'estimated_tokens' | 'fraction_of_corpus' | 'byte_ratio' | 'artifact_set';
    readonly signal: boolean;
    readonly operands: Readonly<Record<string, ObservationOperand>>;
    readonly reference?: VolumeReference;
    readonly method: string;
    readonly detail: string;
}
export interface VolumeCollectionState {
    readonly complete: boolean;
    readonly reason?: string;
    readonly detail?: string;
}
export interface TemplateVolumeFileFact {
    readonly path: string;
    readonly kind: string;
    readonly bytes: number;
    readonly cyrillicUtf8Bytes: number;
}
export interface TemplateVolumeTargetFact {
    readonly target: string;
    readonly files: readonly TemplateVolumeFileFact[];
    readonly collection?: VolumeCollectionState;
}
export interface FeatureArtifactFact {
    readonly path: string;
    readonly bytes: number;
}
export interface FeatureDiffFact {
    readonly attributable: boolean;
    readonly bytes?: number;
    readonly base?: string;
    readonly head?: string;
    readonly method?: string;
    readonly excludedFeaturePath?: string;
    readonly reason?: string;
}
export interface FeatureVolumeFact {
    readonly slug: string;
    readonly tier?: FeatureTier;
    readonly activeSteps?: readonly (number | string)[];
    readonly namedConsumers?: readonly string[];
    readonly lifecycle?: {
        readonly phase: 'in-progress' | 'complete';
        readonly completedThroughStep?: number;
    };
    readonly artifacts: readonly FeatureArtifactFact[];
    readonly diff?: FeatureDiffFact;
    readonly collection?: VolumeCollectionState;
}
export interface VolumeShadowInput {
    readonly templates?: readonly TemplateVolumeTargetFact[];
    readonly features?: readonly FeatureVolumeFact[];
}
export interface VolumeShadowSignal {
    readonly rule: VolumeShadowRuleId;
    readonly detail: string;
}
export interface VolumeShadowResult {
    readonly observations: readonly GuardObservation[];
    readonly signals: readonly VolumeShadowSignal[];
    readonly notes: readonly string[];
}
export type TemplateTokenEstimate = {
    readonly status: 'measured';
    readonly bytes: number;
    readonly cyrillicUtf8Bytes: number;
    readonly divisor: 2.5 | 4;
    readonly estimatedTokens: number;
    readonly method: 'utf8-bytes-divisor/v1';
} | {
    readonly status: 'unknown';
    readonly reason: string;
};
export declare function estimateTemplateTokens(bytes: unknown, cyrillicUtf8Bytes: unknown): TemplateTokenEstimate;
export declare function unknownVolumeShadow(reason: string, detail?: string): VolumeShadowResult;
export declare function expectedFeatureArtifacts(tier: FeatureTier, activeSteps: readonly (number | string)[]): readonly string[];
export declare function evaluateVolumeShadow(input: unknown): VolumeShadowResult;
export {};
//# sourceMappingURL=guard-volume.d.ts.map
/** Exhaustive target companion policy and once-per-install manifest aggregation. */
import { type HarnessIntegrationManifestV1, type IntegrationComponent, type IntegrationReasonCode, type IntegrationStatus, type TargetIntegrationAdapter } from '@dzhechkov/core';
import { type TargetName } from './targets.js';
export interface RegistrationObservation {
    readonly id: string;
    readonly scope: 'project' | 'user' | 'plugin';
    readonly registered: boolean;
    readonly approval?: 'pending' | 'approved' | 'unknown';
    readonly ready?: boolean;
}
export interface IntegrationOutcome {
    readonly target: TargetName;
    readonly component: IntegrationComponent;
    readonly status: IntegrationStatus;
    readonly registrations: readonly RegistrationObservation[];
    readonly carrier?: {
        readonly scope: 'project' | 'user' | 'plugin';
        readonly path: string;
    };
    readonly runtimeVersion?: string;
    readonly evidenceVersion?: string;
    readonly reasonCode?: IntegrationReasonCode;
    readonly remediation?: string;
    /** True when carrier bytes may precede a failed live check or ownership-journal commit. */
    readonly applied?: boolean;
}
export type IntegrationPolicyCell = {
    readonly disposition: 'receipt';
    readonly reasonCode?: never;
    readonly receiptVersion: string;
} | {
    readonly disposition: 'legacy-post-write';
    readonly reasonCode: 'CURRENT_LIVE_CHECK_FAILED';
} | {
    readonly disposition: 'refused';
    readonly reasonCode: IntegrationReasonCode;
};
export interface TargetIntegrationPolicy {
    readonly mcp: IntegrationPolicyCell;
    readonly hooks: IntegrationPolicyCell;
}
/** Closed 10×2 policy. No fallback/default is permitted. */
export declare const TARGET_INTEGRATION_POLICY: Record<TargetName, TargetIntegrationPolicy>;
export declare const TARGET_INTEGRATIONS: Record<TargetName, TargetIntegrationAdapter>;
export interface IntegrationManifestSource {
    readonly skillId: string;
    readonly skillDir: string;
}
export interface IntegrationManifestAggregate {
    readonly manifest: HarnessIntegrationManifestV1 | undefined;
    readonly digest: string | undefined;
    readonly sourcePaths: readonly string[];
}
export declare class IntegrationManifestError extends Error {
    readonly manifestPath: string;
    readonly code = "MANIFEST_INVALID";
    constructor(manifestPath: string, message: string);
}
/** Load, validate and aggregate every adjacent manifest before target effects. */
export declare function aggregateIntegrationManifests(sources: readonly IntegrationManifestSource[]): IntegrationManifestAggregate;
export declare function notRequestedOutcomes(target: TargetName): readonly [IntegrationOutcome, IntegrationOutcome];
export declare function refusedOutcome(target: TargetName, component: IntegrationComponent, reasonCode: IntegrationReasonCode, remediation: string): IntegrationOutcome;
/** Static synchronous outcomes for Gemini/agents-md and other refusal-only seams. */
export declare function staticPolicyOutcomes(target: TargetName, manifest: HarnessIntegrationManifestV1 | undefined, noHooks?: boolean): readonly [IntegrationOutcome, IntegrationOutcome];
//# sourceMappingURL=target-integrations.d.ts.map
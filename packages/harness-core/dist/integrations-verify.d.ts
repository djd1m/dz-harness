/** Bounded, non-executing target registration verification. */
import type { IntegrationComponent, IntegrationReasonCode } from '@dzhechkov/core';
import { type RegistrationObservation } from './target-integrations.js';
import type { TargetName } from './targets.js';
export declare const INTEGRATION_PROBE_TIMEOUT_MS = 30000;
export declare const INTEGRATION_PROBE_STREAM_MAX_BYTES: number;
export declare const INTEGRATION_PROBE_AGGREGATE_MAX_BYTES: number;
export interface IntegrationProcessRequest {
    readonly command: string;
    readonly args: readonly string[];
    readonly cwd: string;
    readonly timeoutMs: number;
}
export interface IntegrationProcessObservation {
    readonly status: number | null;
    readonly signal: string | null;
    readonly stdout: Uint8Array;
    readonly stderr: Uint8Array;
    readonly errorCode?: string;
}
export interface IntegrationProcessPort {
    run(request: IntegrationProcessRequest): IntegrationProcessObservation;
}
export type IntegrationExecutableResolution = {
    readonly ok: true;
    readonly path: string;
} | {
    readonly ok: false;
    readonly errorCode: 'ENOENT' | 'UNSAFE_EXECUTABLE';
};
/** Resolve PATH once and reject a project-controlled probe binary before spawning it. */
export declare function resolveIntegrationExecutable(command: string, cwd: string, pathValue?: string): IntegrationExecutableResolution;
export declare const defaultIntegrationProcessPort: IntegrationProcessPort;
export interface VerifyTargetIntegrationOptions {
    readonly target: TargetName;
    readonly component: IntegrationComponent;
    readonly projectRoot: string;
    readonly registrationId?: string;
    readonly phase?: 'preflight' | 'post-write';
    readonly processPort?: IntegrationProcessPort;
}
export interface IntegrationVerification {
    readonly ok: boolean;
    readonly target: TargetName;
    readonly component: IntegrationComponent;
    readonly runtimeVersion?: string;
    readonly evidenceVersion?: string;
    readonly reasonCode?: IntegrationReasonCode;
    readonly remediation?: string;
    readonly registrations: readonly RegistrationObservation[];
}
/**
 * Verify only code-owned native list/get surfaces. Manifest command/URL fields
 * are intentionally absent from this API, so they cannot be executed here.
 */
export declare function verifyTargetIntegration(options: VerifyTargetIntegrationOptions): IntegrationVerification;
export interface RunIntegrationsVerifyOptions extends VerifyTargetIntegrationOptions {
}
export declare function runIntegrationsVerify(options: RunIntegrationsVerifyOptions): IntegrationVerification;
//# sourceMappingURL=integrations-verify.d.ts.map
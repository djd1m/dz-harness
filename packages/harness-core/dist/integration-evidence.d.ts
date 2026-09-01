/** Exact-version receipt and evidence classifiers. */
import type { IntegrationComponent, IntegrationReasonCode } from '@dzhechkov/core';
import type { TargetName } from './targets.js';
export interface ProbeReceipt {
    readonly schemaVersion: 1;
    readonly target: TargetName;
    readonly component: IntegrationComponent;
    readonly productSurface: string;
    readonly runtimeVersion: string;
    readonly scope: 'project' | 'user' | 'plugin';
    readonly carrierPath: string;
    readonly serializerId: string;
    readonly probeCommandId: string;
    readonly probeCommand: readonly string[];
    readonly timeoutMs: number;
    readonly observedExitCode: number;
    readonly transcriptSha256: `sha256:${string}`;
    readonly parsedObservation: {
        readonly registrationId: string;
        readonly scope: 'project';
        readonly status: string;
        readonly approval: 'pending' | 'approved' | 'unknown';
        readonly ready: boolean;
    };
    readonly wrongPathNegativeControl: {
        readonly carrierPath: string;
        readonly probeCommand: readonly string[];
        readonly timeoutMs: number;
        readonly observedExitCode: number;
        readonly transcriptSha256: `sha256:${string}`;
        readonly registrationObserved: false;
        readonly reasonCode: 'POST_WRITE_REGISTRATION_NOT_OBSERVED';
    };
    readonly transportFamily: 'stdio-local' | 'http';
    readonly fieldFamilies: readonly string[];
    readonly observedAt: string;
    readonly documentation: readonly string[];
}
export declare const CLAUDE_MCP_RECEIPT: ProbeReceipt;
export interface EvidenceAssessment {
    readonly eligible: boolean;
    readonly reasonCode?: IntegrationReasonCode;
    readonly receipt?: ProbeReceipt;
}
export declare function assessClaudeMcpEvidence(runtimeVersion: string | undefined): EvidenceAssessment;
//# sourceMappingURL=integration-evidence.d.ts.map
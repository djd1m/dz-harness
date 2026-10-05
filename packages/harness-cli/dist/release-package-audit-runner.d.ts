import type { ReleasePackageAuditPlan, ReleasePackageAuditResult, DetectSiblingDriftOptions, PackedTarballArtifact } from '@dzhechkov/harness-core';
import type { ReleaseExecRunner } from './cli.js';
export declare function runReleasePackageAudit(plan: ReleasePackageAuditPlan, options: {
    readonly monorepoRoot: string;
    readonly scratchRoot?: string;
    readonly run: ReleaseExecRunner;
}): {
    readonly result: ReleasePackageAuditResult;
    readonly evidence: unknown;
};
type RetainedProof = NonNullable<DetectSiblingDriftOptions['retainedBindingProof']>;
type RetainedCapture = {
    ok: boolean;
    reason?: string;
    proof?: RetainedProof;
    state?: {
        baselineVersions: Record<string, string>;
        tracked: Record<string, string>;
        selectedTrees: Record<string, Record<string, string>>;
        selectedVersions: Record<string, string>;
        selectedSources: Record<string, string>;
    };
    authorize: (subject: unknown, invocation: object, phase: object) => boolean;
};
/** Actual scoped capture; its referential completion capability is deliberately not serializable. */
export declare function buildRetainedBindingProof(options: {
    monorepoRoot: string;
    roots: readonly {
        name: string;
        dir: string;
    }[];
    phase: 'preview' | 'final';
    invocation: object;
    phaseIdentity: object;
    run: ReleaseExecRunner;
    trustedPublicKeyPem: string;
    artifacts?: readonly PackedTarballArtifact[];
    previous?: RetainedCapture;
    scratchRoot?: string;
}): RetainedCapture;
export {};
//# sourceMappingURL=release-package-audit-runner.d.ts.map
export interface ReleasePackageAuditPlan {
    readonly package: string;
    readonly version: string;
    readonly dir: string;
    readonly phases: readonly ['pack', 'install', 'validate', 'audit'];
    readonly timeoutMs: number;
}
export interface ReleasePackageAuditResult {
    readonly scope: 'package-consumer';
    readonly package: string;
    readonly version: string;
    readonly status: 'clean' | 'findings' | 'error';
    readonly failureClass?: 'AUDIT_ERROR' | 'UNEXECUTED_STEP' | 'VULNS_HIGH';
    readonly reason?: string;
    readonly candidateSha256?: string;
    readonly lockSha256?: string;
    readonly npmVersion?: string;
    readonly platform?: {
        readonly os: string;
        readonly cpu: string;
    };
    readonly resolvedCount?: number;
    readonly installedCount?: number;
    readonly closure?: readonly {
        readonly path: string;
        readonly name: string;
        readonly version: string;
        readonly installed: boolean;
    }[];
    readonly optionalAbsences?: readonly {
        readonly name: string;
        readonly kind: 'optional-peer' | 'platform-excluded' | 'locked-not-installed';
        readonly parent: string;
    }[];
    readonly counts?: Readonly<Record<string, number>>;
    readonly findings?: readonly {
        readonly name: string;
        readonly severity: string;
    }[];
    readonly phases: readonly {
        readonly phase: string;
        readonly exitCode: number;
        readonly timedOut?: boolean;
    }[];
}
export interface ReleaseWorkspaceAuditReport {
    readonly scope: 'workspace';
    readonly nonBlocking: true;
    readonly includeDev: boolean;
    readonly status: 'clean' | 'findings' | 'error' | 'not-run';
    readonly counts?: Readonly<Record<string, number>>;
    readonly findings?: readonly {
        readonly name: string;
        readonly severity: string;
    }[];
    readonly reason?: string;
}
export declare function planReleasePackageAudit(pkg: {
    readonly name: string;
    readonly version: string;
    readonly dir: string;
}, timeoutMs?: number): ReleasePackageAuditPlan;
export declare function judgeReleasePackageAudit(plan: ReleasePackageAuditPlan, evidence: unknown): ReleasePackageAuditResult;
export declare function judgeReleasePackageAudit(plan: undefined, evidence: unknown, includeDev?: boolean): ReleaseWorkspaceAuditReport;
/** Additional five-root admission; the singleton judge uses the same closure/edge/audit validators. */
export declare function judgeReleaseCohortAudit(roots: readonly {
    readonly package: string;
    readonly version: string;
    readonly dir: string;
    readonly tarball: string;
    readonly sha256: string;
    readonly integrity: string;
}[], evidence: unknown): {
    scope: 'package-cohort';
    status: 'clean' | 'findings' | 'error';
    reason?: string;
    graph?: readonly Record<string, any>[];
    optionalAbsences?: readonly {
        name: string;
        kind: string;
        parent: string;
    }[];
    resolvedCount?: number;
    counts?: Readonly<Record<string, number>>;
};
//# sourceMappingURL=release-package-audit.d.ts.map
type RecordRow = Record<string, unknown>;
type RoutingAttempt = {
    ordinal: number;
    model: string | null;
    family: 'openai' | 'claude';
    wrapperInvoked: boolean;
    outcome: 'answered' | 'failed' | 'rejected';
    reason: string;
    selected: boolean;
};
type RoutingStage = {
    evidenceKey: string;
    dispatchSeq: number;
    plannedModel: string | null;
    plannedModelSource: 'plan-declared' | 'plan-omitted' | 'unavailable' | 'not-recorded';
    requestedModel: string | null;
    probeId: string | null;
    linkStatus: string;
};
type RoutingProbe = {
    probeId: string;
    runId: string;
    family: 'openai' | 'claude';
    source: string;
    selectedModel: string | null;
    complete: boolean;
    totalConsidered: number;
    attempts: RoutingAttempt[];
};
/** All amounts remain source-specific; inventory never substitutes for a numeric witness. */
export declare function buildStageUsageReport(input: {
    sourceKind: string;
    sourcePath: string;
    runId: string | null;
    rows: readonly RecordRow[];
    expected?: readonly RecordRow[];
    witnesses?: readonly RecordRow[];
    moneyObservations?: readonly RecordRow[];
    diagnostics?: readonly string[];
    sourceDiagnostics?: readonly string[];
    maxRecords?: number;
}): {
    routingProvenance: {
        schema: string;
        status: string;
        probes: RoutingProbe[] | null;
        stages: RoutingStage[] | null;
        diagnostics: string[];
    };
    schema: string;
    sourceKind: string;
    sourcePath: string;
    runId: string | null;
    metric: string;
    rows: ({
        plannedModel: string | null;
        plannedModelSource: "unavailable" | "not-recorded" | "plan-declared" | "plan-omitted";
        probeId: string | null;
        missingReasons: string[];
        outcome: string | null;
        usageDiagnostics: string[];
        unassignedSource: boolean;
        estimatedCostUsd: number | null;
        familyEstimatedCostUsd: number | null;
        pricingKnown: boolean;
        pricingReason: string | null;
        priceMatch: {
            tableKey: string | null;
            matchKind: "unknown" | "exact" | "family-estimate";
            source: string;
            version: string;
            capturedAt: string | null;
            fingerprint: string;
            current: boolean;
            billed: boolean;
        };
        reportedTotalBasis: string;
        inputCacheSemantics: string;
        usageSource: {
            [k: string]: string | null;
        } | null;
        reportedCostUsd: number | null;
        billedCostUsd: null;
        billedCostReason: string;
        estimate: {
            tokens: number | null;
            costUsd: number | null;
            method: string | null;
            source: string | null;
            capturedAt: string | null;
        } | null;
        estimateReason: string | null;
        tokensTotal: number | null;
        tokensIn: number | null;
        tokensOut: number | null;
        tokensCacheRead: number | null;
        tokensReasoning: number | null;
        tokensCacheWrite: number | null;
        phase: string | null;
        role: string | null;
        attempt: number | null;
        dispatchSeq: number | null;
        itemKey: string | null;
        stepId: string | null;
        tier: string | null;
        mode: string | null;
        sourceKind: string;
        evidenceKey: string | null;
        runId: string | null;
        stage: string | null;
        stageCanonical: "unknown" | "code" | "plan" | "architecture" | "router" | "qe" | "fleet" | "requirements" | "adr" | "research" | "ideation" | "ddd" | "infra";
        model: string | null;
        family: string | null;
        modelProvenance: string;
        requestedModel: string | null;
        totalDerivation: string;
    } | {
        plannedModel: null;
        plannedModelSource: string;
        probeId: null;
        missingReasons: string[];
        outcome: string | null;
        usageDiagnostics: string[];
        unassignedSource: boolean;
        estimatedCostUsd: number | null;
        familyEstimatedCostUsd: number | null;
        pricingKnown: boolean;
        pricingReason: string | null;
        priceMatch: {
            tableKey: string | null;
            matchKind: "unknown" | "exact" | "family-estimate";
            source: string;
            version: string;
            capturedAt: string | null;
            fingerprint: string;
            current: boolean;
            billed: boolean;
        };
        reportedTotalBasis: string;
        inputCacheSemantics: string;
        usageSource: {
            [k: string]: string | null;
        } | null;
        reportedCostUsd: number | null;
        billedCostUsd: null;
        billedCostReason: string;
        estimate: {
            tokens: number | null;
            costUsd: number | null;
            method: string | null;
            source: string | null;
            capturedAt: string | null;
        } | null;
        estimateReason: string | null;
        tokensTotal: number | null;
        tokensIn: number | null;
        tokensOut: number | null;
        tokensCacheRead: number | null;
        tokensReasoning: number | null;
        tokensCacheWrite: number | null;
        phase: string | null;
        role: string | null;
        attempt: number | null;
        dispatchSeq: number | null;
        itemKey: string | null;
        stepId: string | null;
        tier: string | null;
        mode: string | null;
        sourceKind: string;
        evidenceKey: string | null;
        runId: string | null;
        stage: string | null;
        stageCanonical: "unknown" | "code" | "plan" | "architecture" | "router" | "qe" | "fleet" | "requirements" | "adr" | "research" | "ideation" | "ddd" | "infra";
        model: string | null;
        family: string | null;
        modelProvenance: string;
        requestedModel: string | null;
        totalDerivation: string;
    })[];
    verdict: string;
    complete: boolean;
    knownRunTotalTokens: number | null;
    knownAccountedTokens: number | null;
    knownUnaccountedTokens: number | null;
    stageTokensSum: number | null;
    doubleAttributedTokens: number | null;
    runTotalTokens: number | null;
    sourceVerifiedTotalTokens: number | null;
    conservation: {
        status: string;
        scope: string;
        metric: string;
    };
    reconciliation: {
        status: string;
        scope: string;
        metric: string;
    };
    inventory: {
        status: string;
        expected: number | null;
        missing: string[];
        observed: number;
    };
    sourceVerification: {
        status: string;
        diagnostics: string[];
        reason: string | null;
    };
    dimensionCoverage: {
        [k: string]: {
            known: number;
            unknown: number;
        };
    };
    pricingCoverage: {
        complete: boolean;
        unknown: number;
    };
    estimatedCostUsd: number | null;
    knownEstimatedCostUsd: number | null;
    familyEstimatedCostUsd: number | null;
    knownFamilyEstimatedCostUsd: number | null;
    moneyObservations: {
        id: string;
        runId: string | null;
        scope: string;
        basis: string;
        amount: number | null;
    }[];
    reportedCostCoverage: {
        status: string;
        reason: string | null;
    };
    knownReportedCostUsd: number | null;
    reportedCostUsd: number | null;
    billedCostUsd: null;
    billedCostReason: string;
    diagnostics: string[];
    metrics: {
        [k: string]: {
            knownSubtotal: number | null;
        };
    };
    scope: string;
};
export {};
//# sourceMappingURL=stage-usage.d.ts.map
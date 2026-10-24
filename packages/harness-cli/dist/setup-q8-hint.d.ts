export interface SetupQ8HintFacts {
    totalMemoryBytes: number;
    memoryBackend: 'agentdb' | 'jsonl' | 'unknown';
    setupComplete: boolean;
    memoryEnabled: boolean;
    vectorMode: 'auto' | 'agentdb' | 'rvf' | 'off';
    embedDtype: 'fp32' | 'q8' | 'error';
}
export interface SetupOutcomeFacts {
    codexHooksOk: boolean;
    failedStepCount: number;
    integrationsOk: boolean;
    skillsOk: boolean;
}
/** The final CLI exit condition also gates any post-setup recommendation. */
export declare function setupSucceeded(facts: SetupOutcomeFacts): boolean;
/** Advisory only: setup never changes the selected embedding dtype. */
export declare function setupQ8Hint(facts: SetupQ8HintFacts): string | null;
//# sourceMappingURL=setup-q8-hint.d.ts.map
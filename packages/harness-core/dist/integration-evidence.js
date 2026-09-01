/** Exact-version receipt and evidence classifiers. */
export const CLAUDE_MCP_RECEIPT = {
    schemaVersion: 1,
    target: 'claude-code',
    component: 'mcp',
    productSurface: 'claude-code-cli',
    runtimeVersion: '2.1.235',
    scope: 'project',
    carrierPath: '.mcp.json',
    serializerId: 'claude-project-mcp-json-v1',
    probeCommandId: 'claude-project-mcp-get-v1',
    probeCommand: ['claude', 'mcp', 'get', 'dz-registration-probe'],
    timeoutMs: 30_000,
    observedExitCode: 0,
    transcriptSha256: 'sha256:0e30c79de6381c7e7b93a39cc644cb282b6c95ceaeb4a0f5a94fbfecb5c71549',
    parsedObservation: {
        registrationId: 'dz-registration-probe',
        scope: 'project',
        status: 'Pending approval',
        approval: 'pending',
        ready: false,
    },
    wrongPathNegativeControl: {
        carrierPath: '.claude/.mcp.json',
        probeCommand: ['claude', 'mcp', 'get', 'dz-wrong-path-probe'],
        timeoutMs: 30_000,
        observedExitCode: 1,
        transcriptSha256: 'sha256:aba424ed140ee785947f314942566ae4bccc7b7c44ca9be785efbf36be0f62d5',
        registrationObserved: false,
        reasonCode: 'POST_WRITE_REGISTRATION_NOT_OBSERVED',
    },
    transportFamily: 'stdio-local',
    fieldFamilies: ['type', 'command', 'args'],
    observedAt: '2026-08-30T19:22:15.366Z',
    documentation: ['https://code.claude.com/docs/en/mcp'],
};
export function assessClaudeMcpEvidence(runtimeVersion) {
    if (runtimeVersion === undefined)
        return { eligible: false, reasonCode: 'TARGET_BINARY_UNAVAILABLE' };
    if (runtimeVersion !== CLAUDE_MCP_RECEIPT.runtimeVersion)
        return { eligible: false, reasonCode: 'RECEIPT_STALE' };
    return { eligible: true, receipt: CLAUDE_MCP_RECEIPT };
}
//# sourceMappingURL=integration-evidence.js.map
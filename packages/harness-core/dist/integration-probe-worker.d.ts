/** Isolated bounded subprocess runner used by integration registration probes. */
export declare const PROBE_REDACTION_MARKER = "[REDACTED]";
export declare const PROBE_TRUNCATION_MARKER = "[TRUNCATED]";
export interface ProbeWorkerRequest {
    readonly command: string;
    readonly args: readonly string[];
    readonly cwd: string;
    readonly timeoutMs: number;
    readonly streamMaxBytes: number;
    readonly aggregateMaxBytes: number;
}
export interface ProbeWorkerResult {
    readonly status: number | null;
    readonly signal: string | null;
    readonly stdoutBase64: string;
    readonly stderrBase64: string;
    readonly errorCode?: string;
    readonly truncated: boolean;
}
export declare function redactProbeText(input: string): string;
export declare function runProbeWorker(request: ProbeWorkerRequest): Promise<ProbeWorkerResult>;
//# sourceMappingURL=integration-probe-worker.d.ts.map
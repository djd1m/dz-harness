import type { ExecutionEvidence } from './discrimination-gate.js';
/** Identity established separately by the Go AST and go list checks at one revision. */
export interface GoTestIdentity {
    readonly packagePath: string;
    readonly testName: string;
}
/** Parse one complete `go test -json` process observation; an incomplete stream never proves a test. */
export declare function classifyGoTestExecutionEvidence(output: string, exitCode: number | null, identity: GoTestIdentity, captureComplete: boolean): ExecutionEvidence;
//# sourceMappingURL=go-discrimination-evidence.d.ts.map
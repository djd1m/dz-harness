import type { Readable, Writable } from 'node:stream';
export declare const CODEX_RECALL_PROXY_MAX_LINE_BYTES = 1048576;
export declare const CODEX_RECALL_PROXY_MAX_REQUESTS = 32;
export interface CodexRecallProxyOptions {
    readonly projectRoot: string;
    readonly binary?: string;
    readonly codexHome?: string;
    readonly input?: Readable;
    readonly output?: Writable;
    readonly errorOutput?: Writable;
    /** Test/integrator child environment; never changes the user's global configuration. */
    readonly env?: NodeJS.ProcessEnv;
    readonly onObserver?: (observerId: string) => void;
}
export declare function runCodexRecallProxy(options: CodexRecallProxyOptions): Promise<number>;
//# sourceMappingURL=codex-recall-proxy.d.ts.map
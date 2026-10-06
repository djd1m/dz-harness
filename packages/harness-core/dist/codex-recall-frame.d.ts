import { type HookSelection } from './recall-hook-policy.js';
export declare const CODEX_RECALL_FRAME_MAX_BYTES = 262144;
export declare const CODEX_RECALL_FRAME_MAX_ITEMS = 16;
export declare const CODEX_RECALL_OBSERVER_NONCE_ENV = "DZ_CODEX_RECALL_OBSERVER_NONCE";
export declare const codexRecallDigest: (text: string) => string;
export declare const isCodexRecallAlias: (value: unknown) => value is string;
export interface CodexRecallSegment {
    readonly id?: string;
    readonly bytes: string;
    readonly digest: string;
}
export interface CodexRecallFrame {
    readonly eventId: string;
    readonly context: string;
    readonly segments: readonly CodexRecallSegment[];
}
/** Invalid opt-in never changes the ordinary hook's behavior. Duplicate IDs are not addressable. */
export declare function renderCodexRecallFrame(selection: HookSelection, nonce: unknown, eventId?: string): string;
/** Only the complete, native own-hook output is parsed; spill previews are matched against it. */
export declare function parseCodexRecallFrame(context: unknown, nonce: string): CodexRecallFrame | undefined;
//# sourceMappingURL=codex-recall-frame.d.ts.map
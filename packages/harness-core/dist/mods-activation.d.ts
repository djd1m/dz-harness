/**
 * Read-only projection of mod intent and an optional, unverified observation file.
 * It does not authenticate artifact refs or grant a parity capability.
 */
import type { ModRuntimeIntentV1, ModRuntimeObservationV1 } from '@dzhechkov/core';
export type ModActivationState = 'reported_yes' | 'reported_no' | 'unknown' | 'not_applicable';
export interface ModActivationStage {
    readonly state: ModActivationState;
    readonly reasonCode: string;
}
export interface ModActivationProjection {
    readonly pluginId: string;
    readonly hostKind: ModRuntimeIntentV1['host']['kind'];
    readonly identity: 'intent-only' | 'matched' | 'mismatched';
    /** Input evidence shape was parsed, but neither files nor runtime were authenticated here. */
    readonly evidenceVerification: 'not-performed';
    readonly installed: ModActivationStage;
    readonly apiAvailable: ModActivationStage;
    readonly handlerExecuted: ModActivationStage;
    readonly uiDisplayed: ModActivationStage;
}
/**
 * Never promotes an input report to a verified claim. Identity mismatch invalidates
 * every runtime stage; a headless target makes UI not applicable by host kind.
 */
export declare function projectModActivation(intent: ModRuntimeIntentV1, observation?: ModRuntimeObservationV1): ModActivationProjection;
//# sourceMappingURL=mods-activation.d.ts.map
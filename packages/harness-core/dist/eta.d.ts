/**
 * Pure ETA calibration for the live feature-adr statusline.
 *
 * This module deliberately performs no filesystem access and reads no ambient clock. Callers pass
 * parsed JSONL text and `nowMs`; malformed or unstamped observations remain unknown, never zero.
 */
import { type CheckpointStage } from './feature-adr-checkpoints.js';
export declare const ETA_MAX_STAGE_MS: number;
export interface CheckpointObservation {
    readonly runId: string;
    readonly stage: string;
    readonly result: unknown;
    readonly tsMs?: number;
}
export interface RunSegment {
    readonly runId: string;
    readonly observations: readonly CheckpointObservation[];
    /** The most recent router in this invocation, retained across resume slices. */
    readonly router?: CheckpointObservation;
}
export interface StageDurationSample {
    readonly runId: string;
    readonly tier: string;
    readonly stage: CheckpointStage;
    readonly ms: number;
    readonly fromTsMs: number;
    readonly toTsMs: number;
    readonly codexCoded?: boolean;
    /** Macro stages whose wall time is already included in this sample. */
    readonly coveredStages?: readonly CheckpointStage[];
}
export interface IncompleteCoverageSample {
    readonly runId: string;
    readonly tier: string;
    readonly stage: 'code';
    readonly codexCoded: true;
    readonly incompleteCoverage: true;
    readonly fromTsMs: number;
    readonly toTsMs: number;
}
export type StageSample = StageDurationSample | IncompleteCoverageSample;
export type EtaEstimate = {
    readonly kind: 'eta';
    readonly presentation: 'point' | 'range';
    readonly p25Ms: number;
    readonly medianMs: number;
    readonly p75Ms: number;
    readonly runsUsed: number;
    readonly tier: string;
    readonly paceFactor: number;
    readonly stagesCovered: readonly CheckpointStage[];
    readonly windowFrom: string;
    readonly windowTo: string;
} | {
    readonly kind: 'insufficient-history';
    readonly tier: string;
    readonly runsFound: number;
    readonly thinStage: CheckpointStage;
    readonly windowFrom?: string;
    readonly windowTo?: string;
} | {
    readonly kind: 'no-tier';
} | {
    readonly kind: 'no-checkpoints';
};
export interface EtaInput {
    readonly samples: readonly StageSample[];
    readonly currentTier: string | undefined;
    readonly currentStage: CheckpointStage;
    readonly remainingStages: readonly CheckpointStage[];
    readonly currentRunSamples: readonly StageSample[];
    readonly nowMs: number;
    readonly lastCheckpointTsMs?: number;
    readonly hasCurrentCheckpoints?: boolean;
}
/** Parse JSONL independently per line. A malformed line can never poison its valid neighbours. */
export declare function parseCheckpointLines(text: string, runId: string): CheckpointObservation[];
/**
 * Split a slug's append-only history into monotonic timing slices.
 *
 * Distinct `design:*` siblings share one macro stage and may arrive in any order. A repeated sibling,
 * repeated macro stage, or move backwards starts a resume slice. The latest router is carried as
 * metadata into later slices, so their tier still comes from that invocation's router record.
 */
export declare function segmentRun(observations: readonly CheckpointObservation[]): RunSegment[];
/** Extract one tier-labelled duration per `(runId, tier, stage)`, summing resumed slices. */
export declare function extractStageSamples(segments: readonly RunSegment[]): StageSample[];
/** Estimate the remaining macro stages without consulting the filesystem or an ambient clock. */
export declare function estimateEta(input: EtaInput): EtaEstimate;
/** Render the compact Russian statusline fragment, always including its evidence basis. */
export declare function formatEta(estimate: EtaEstimate): string | undefined;
//# sourceMappingURL=eta.d.ts.map
/**
 * `Reflexion` — the skill-outcome feedback loop.
 *
 * Records the outcome of using a skill (`record(skillId, outcome, score)`) and
 * ranks skills by their most recent score. Reads are **monotonic**: the latest
 * record for a skill supersedes older ones.
 *
 * @packageDocumentation
 */
import type { MemoryBackend, MemoryRecord } from './backend.js';
/** Optional extras for {@link Reflexion.record}. */
export interface ReflexionInput {
    /** Free text to store (defaults to `"<skillId> <outcome>"`). */
    readonly text?: string;
    /** String-keyed metadata. */
    readonly metadata?: Record<string, string>;
}
/** Records skill outcomes against a {@link MemoryBackend} and ranks skills. */
export declare class Reflexion {
    private readonly backend;
    constructor(backend: MemoryBackend);
    /**
     * Record the outcome of using a skill.
     *
     * @param score reward score, must be within `[0, 1]`.
     * @throws if `score` is outside `[0, 1]`.
     */
    record(skillId: string, outcome: string, score: number, input?: ReflexionInput): Promise<MemoryRecord>;
    /** The most recently recorded score for a skill, or `undefined` if none. */
    scoreOf(skillId: string): Promise<number | undefined>;
    /** Every skill with a recorded outcome, ranked by most-recent score, descending. */
    ranking(): Promise<{
        skillId: string;
        score: number;
    }[]>;
}
//# sourceMappingURL=reflexion.d.ts.map
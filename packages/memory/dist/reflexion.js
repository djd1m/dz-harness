/**
 * `Reflexion` — the skill-outcome feedback loop.
 *
 * Records the outcome of using a skill (`record(skillId, outcome, score)`) and
 * ranks skills by their most recent score. Reads are **monotonic**: the latest
 * record for a skill supersedes older ones.
 *
 * @packageDocumentation
 */
/** Monotonic counter — keeps record ids unique within a process. */
let sequence = 0;
/** Records skill outcomes against a {@link MemoryBackend} and ranks skills. */
export class Reflexion {
    backend;
    constructor(backend) {
        this.backend = backend;
    }
    /**
     * Record the outcome of using a skill.
     *
     * @param score reward score, must be within `[0, 1]`.
     * @throws if `score` is outside `[0, 1]`.
     */
    async record(skillId, outcome, score, input = {}) {
        if (!Number.isFinite(score) || score < 0 || score > 1) {
            throw new Error(`reflexion: score must be within [0, 1], got ${score}`);
        }
        sequence += 1;
        const record = {
            id: `reflexion:${skillId}:${Date.now()}:${sequence}`,
            skillId,
            text: input.text ?? `${skillId} ${outcome}`,
            score,
            outcome,
            timestamp: new Date().toISOString(),
            ...(input.metadata !== undefined ? { metadata: input.metadata } : {}),
        };
        await this.backend.put(record);
        return record;
    }
    /** The most recently recorded score for a skill, or `undefined` if none. */
    async scoreOf(skillId) {
        const records = await this.backend.query({ skillId, limit: Number.MAX_SAFE_INTEGER });
        if (records.length === 0)
            return undefined;
        return records.reduce((latest, record) => record.timestamp >= latest.timestamp ? record : latest).score;
    }
    /** Every skill with a recorded outcome, ranked by most-recent score, descending. */
    async ranking() {
        const latest = new Map();
        for (const record of await this.backend.all()) {
            const current = latest.get(record.skillId);
            if (current === undefined || record.timestamp > current.timestamp) {
                latest.set(record.skillId, record);
            }
        }
        return [...latest.values()]
            .map((record) => ({ skillId: record.skillId, score: record.score }))
            .sort((a, b) => b.score - a.score);
    }
}
//# sourceMappingURL=reflexion.js.map
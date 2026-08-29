import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { recordPattern, recallPatterns } from '../patterns.js';
import { recallHybrid } from '../vector-tier.js';
import { buildRegistry } from '../registry.js';
import { recommend } from '../recommend.js';
import { NoopLearningBackend, NativeReinforcementBackend, isLearningSignalBackend, DEFAULT_REINFORCE_THRESHOLD } from '../learning-backend.js';
import { DEFAULT_HARMONIZE_THRESHOLD } from '../vector-tier.js';
let project;
beforeEach(() => { project = mkdtempSync(join(tmpdir(), 'dz-golden-')); });
afterEach(() => rmSync(project, { recursive: true, force: true }));
async function seed() {
    const rows = Array.from({ length: 24 }, (_, i) => ({
        pattern: i % 2 === 0 ? `Use DataLoader for GraphQL resolver batch ${i}` : `Prefer dry-run before vector harmonize ${i}`,
        type: 'rule',
        reward: i % 3 === 0 ? 0.9 : 0.7,
        domain: i % 2 === 0 ? 'performance' : 'testing',
        ts: `2026-07-08T00:${String(i).padStart(2, '0')}:00.000Z`,
        source: 'test',
    }));
    for (const r of rows)
        await recordPattern(project, r);
}
describe('unreinforced-store-ranks-byte-identically', () => {
    it('keeps recall, hybrid lexical fallback, and recommend order identical when uses are zero', async () => {
        await seed();
        const lexical = recallPatterns(project, 'graphql dataloader resolver', 8).map((h) => h.pattern.pattern);
        const hybridNative = await recallHybrid(project, 'graphql dataloader resolver', { limit: 8, mode: 'lexical' });
        expect(hybridNative.hits.map((h) => h.pattern.pattern)).toEqual(lexical);
        mkdirSync(join(project, '.dz'), { recursive: true });
        writeFileSync(join(project, '.dz', 'config.json'), JSON.stringify({ memory: { learning: { backend: 'off' } } }));
        const hybridOff = await recallHybrid(project, 'graphql dataloader resolver', { limit: 8, mode: 'lexical' });
        expect(hybridOff.hits.map((h) => h.pattern.pattern)).toEqual(lexical);
        const registry = buildRegistry(project);
        const rec1 = recommend('graphql resolver performance', registry, project).skills.map((s) => [s.id, s.score]);
        const rec2 = recommend('graphql resolver performance', registry, project).skills.map((s) => [s.id, s.score]);
        expect(rec2).toEqual(rec1);
    });
});
describe('learning-backend-conformance', () => {
    it('exposes the agentdb-shaped eight-method lifecycle for noop and native backends', async () => {
        for (const backend of [new NoopLearningBackend(), new NativeReinforcementBackend(project)]) {
            expect(isLearningSignalBackend(backend)).toBe(true);
            const signals = backend.enhance([{ dzId: 'x', score: 1, reinforcement: { uses: 0, avgReward: 0, mergedFrom: [] } }], { kind: 'recall' });
            expect([...signals]).toEqual([0]);
            backend.addSample({ dzId: 'missing', kind: 'reinforce', ts: '2026-07-08T00:00:00.000Z' });
            await expect(backend.train()).resolves.toMatchObject({ flushed: expect.any(Number), failed: expect.any(Number) });
            backend.clearSamples();
            backend.reset();
        }
    });
    it('keeps the teach-guard threshold above harmonize threshold', () => {
        expect(DEFAULT_REINFORCE_THRESHOLD).toBeGreaterThan(DEFAULT_HARMONIZE_THRESHOLD);
        expect(DEFAULT_REINFORCE_THRESHOLD).toBe(0.95);
        expect(DEFAULT_HARMONIZE_THRESHOLD).toBe(0.92);
    });
});
//# sourceMappingURL=golden-baseline.test.js.map
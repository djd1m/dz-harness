/**
 * Shared vitest coverage configuration for Tier-A packages.
 *
 * Import this in each Tier-A package's vitest.config.ts:
 * ```ts
 * import { coverageConfigFor } from '@dzhechkov/core/vitest-coverage';
 * export default defineConfig({ test: { ...coverageConfigFor('harness-core') } });
 * ```
 *
 * @packageDocumentation
 */
import { createRequire } from 'node:module';
const coverageBaseline = createRequire(import.meta.url)('../src/coverage-baseline.json');
const sharedCoverage = {
    provider: 'v8',
    enabled: false, // enabled via --coverage flag, not by default
    reportOnFailure: true,
    include: ['src/**/*.ts'],
    exclude: ['src/**/*.test.ts', 'src/**/*.d.ts', 'src/**/vitest.coverage.shared.ts'],
    reporter: ['text', 'json-summary', 'json'],
    reportsDirectory: './coverage',
};
/** Shared coverage settings with the measured ratchet for a Tier-A package. */
export function coverageConfigFor(packageName) {
    if (!Object.hasOwn(coverageBaseline.packages, packageName)) {
        // An unknown package would otherwise get `{...undefined}` — EMPTY thresholds, i.e. no ratchet at all (review 2026-09-11).
        throw new Error(`coverageConfigFor: no coverage baseline for package ${String(packageName)} — add it to coverage-baseline.json with a measured run`);
    }
    return {
        coverage: {
            ...sharedCoverage,
            thresholds: { ...coverageBaseline.packages[packageName] },
        },
    };
}
/** Compatibility settings for packages that do not yet have a measured baseline. */
export const coverageConfig = {
    coverage: {
        ...sharedCoverage,
        thresholds: {
            lines: 95,
            functions: 90,
            branches: 80,
            statements: 95,
        },
    },
};
//# sourceMappingURL=vitest.coverage.shared.js.map
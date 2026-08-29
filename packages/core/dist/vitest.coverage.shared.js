/**
 * Shared vitest coverage configuration for Tier-A packages.
 *
 * Import this in each Tier-A package's vitest.config.ts:
 * ```ts
 * import { coverageConfig } from '@dzhechkov/core/vitest-coverage';
 * export default defineConfig({ test: { ...coverageConfig } });
 * ```
 *
 * @packageDocumentation
 */
/** Shared coverage settings for all Tier-A packages. */
export const coverageConfig = {
    coverage: {
        provider: 'v8',
        enabled: false, // enabled via --coverage flag, not by default
        include: ['src/**/*.ts'],
        exclude: ['src/**/*.test.ts', 'src/**/*.d.ts', 'src/**/vitest.coverage.shared.ts'],
        thresholds: {
            lines: 95,
            functions: 90,
            branches: 80,
            statements: 95,
        },
        reporter: ['text', 'json-summary', 'json'],
        reportsDirectory: './coverage',
    },
};
//# sourceMappingURL=vitest.coverage.shared.js.map
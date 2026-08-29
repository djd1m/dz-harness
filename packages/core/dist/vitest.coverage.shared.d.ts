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
export declare const coverageConfig: {
    coverage: {
        provider: "v8";
        enabled: boolean;
        include: string[];
        exclude: string[];
        thresholds: {
            lines: number;
            functions: number;
            branches: number;
            statements: number;
        };
        reporter: string[];
        reportsDirectory: string;
    };
};
//# sourceMappingURL=vitest.coverage.shared.d.ts.map
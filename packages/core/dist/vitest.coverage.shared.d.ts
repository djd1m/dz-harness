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
type CoveragePackage = 'harness-core' | 'harness-cli';
/** Shared coverage settings with the measured ratchet for a Tier-A package. */
export declare function coverageConfigFor(packageName: CoveragePackage): {
    coverage: {
        thresholds: {
            lines: number;
            statements: number;
            functions: number;
            branches: number;
        };
        provider: "v8";
        enabled: boolean;
        reportOnFailure: boolean;
        include: string[];
        exclude: string[];
        reporter: string[];
        reportsDirectory: string;
    };
};
/** Compatibility settings for packages that do not yet have a measured baseline. */
export declare const coverageConfig: {
    coverage: {
        thresholds: {
            lines: number;
            functions: number;
            branches: number;
            statements: number;
        };
        provider: "v8";
        enabled: boolean;
        reportOnFailure: boolean;
        include: string[];
        exclude: string[];
        reporter: string[];
        reportsDirectory: string;
    };
};
export {};
//# sourceMappingURL=vitest.coverage.shared.d.ts.map
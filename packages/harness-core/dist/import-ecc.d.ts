/**
 * `dz import-ecc` — import skills from the ECC project (https://github.com/affaan-m/ECC).
 *
 * Fetches SKILL.md files from ECC's GitHub repo, maps the frontmatter to
 * agentskills.io format, deduplicates against existing skills, and writes
 * the imported skills to the target directory.
 *
 * @packageDocumentation
 */
/** Result of a single skill import. */
export interface ImportedSkill {
    readonly id: string;
    readonly status: 'imported' | 'skipped_duplicate' | 'skipped_error';
    readonly reason?: string;
}
/** Full import report. */
export interface ImportEccReport {
    readonly source: string;
    readonly totalFetched: number;
    readonly imported: number;
    readonly skippedDuplicate: number;
    readonly skippedError: number;
    readonly skills: readonly ImportedSkill[];
}
/** Options for the import. */
export interface ImportEccOptions {
    /** Directory containing existing skills to check for duplicates. */
    readonly existingSkillsDir: string;
    /** Directory to write imported skills into. */
    readonly outputDir: string;
    /** If true, overwrite existing skills. */
    readonly force?: boolean;
    /** Only import these skill IDs (filter). */
    readonly select?: readonly string[];
    /** Maximum number of skills to import (default: all). */
    readonly limit?: number;
    /** Path to a local ECC clone (skip GitHub fetch). */
    readonly localPath?: string;
}
/**
 * Import skills from ECC.
 *
 * Supports two modes:
 * 1. Local clone: `--local-path /path/to/ECC` (fast, no network)
 * 2. GitHub API: fetches from api.github.com (rate-limited, requires no clone)
 */
export declare function importEcc(options: ImportEccOptions): Promise<ImportEccReport>;
//# sourceMappingURL=import-ecc.d.ts.map
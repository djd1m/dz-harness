/**
 * Skill upgrade — detects installed skills and re-applies from canonical source.
 *
 * @packageDocumentation
 */
/** Info about an installed skill. */
export interface InstalledSkill {
    readonly id: string;
    readonly path: string;
    readonly size: number;
    readonly modifiedAt: string;
    readonly hasFrontmatter: boolean;
}
/** Upgrade check for a single skill. */
export interface UpgradeCheck {
    readonly id: string;
    readonly installed: InstalledSkill;
    readonly canonicalSize: number | undefined;
    readonly needsUpdate: boolean;
    readonly reason: string;
}
/** Full upgrade report. */
export interface UpgradeReport {
    readonly targetDir: string;
    readonly installed: number;
    readonly needsUpdate: number;
    readonly upToDate: number;
    readonly notInCanonical: number;
    readonly skills: readonly UpgradeCheck[];
}
/** Discover installed skills in a target platform directory. */
export declare function discoverInstalled(targetDir: string): InstalledSkill[];
/** Check which installed skills need updates by comparing with canonical sources. */
export declare function checkUpgrades(targetDir: string, canonicalDirs: string[]): UpgradeReport;
//# sourceMappingURL=upgrade.d.ts.map
/**
 * Skill upgrade — detects installed skills and re-applies from canonical source.
 *
 * @packageDocumentation
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
/** Content hash of a file, or undefined if unreadable. */
function hashFile(path) {
    try {
        return createHash('sha1').update(readFileSync(path)).digest('hex');
    }
    catch {
        return undefined;
    }
}
/** Discover installed skills in a target platform directory. */
export function discoverInstalled(targetDir) {
    if (!existsSync(targetDir))
        return [];
    return readdirSync(targetDir, { withFileTypes: true })
        .filter((e) => e.isDirectory() && existsSync(join(targetDir, e.name, 'SKILL.md')))
        .map((e) => {
        const skillMdPath = join(targetDir, e.name, 'SKILL.md');
        const stat = statSync(skillMdPath);
        const content = readFileSync(skillMdPath, 'utf-8');
        return {
            id: e.name,
            path: join(targetDir, e.name),
            size: stat.size,
            modifiedAt: stat.mtime.toISOString().slice(0, 10),
            hasFrontmatter: content.startsWith('---'),
        };
    });
}
/** Check which installed skills need updates by comparing with canonical sources. */
export function checkUpgrades(targetDir, canonicalDirs) {
    const installed = discoverInstalled(targetDir);
    // Build canonical index: skill id → { dir, size, hash }
    const canonical = new Map();
    for (const cDir of canonicalDirs) {
        if (!existsSync(cDir))
            continue;
        const skills = readdirSync(cDir, { withFileTypes: true })
            .filter((e) => e.isDirectory() && existsSync(join(cDir, e.name, 'SKILL.md')));
        for (const skill of skills) {
            const skillMdPath = join(cDir, skill.name, 'SKILL.md');
            const stat = statSync(skillMdPath);
            canonical.set(skill.name, { dir: join(cDir, skill.name), size: stat.size, hash: hashFile(skillMdPath) });
        }
    }
    const checks = [];
    for (const inst of installed) {
        const can = canonical.get(inst.id);
        if (!can) {
            checks.push({
                id: inst.id,
                installed: inst,
                canonicalSize: undefined,
                needsUpdate: false,
                reason: 'not in canonical (custom or removed)',
            });
            continue;
        }
        // Compare by CONTENT HASH, not byte-size: an equal-length edit (typo fix,
        // word swap) must still register as "needs update", and a differing size
        // alone doesn't prove the canonical is newer (audit #11). Fall back to a
        // size comparison only if either file is unreadable.
        const instHash = hashFile(join(inst.path, 'SKILL.md'));
        const needsUpdate = can.hash !== undefined && instHash !== undefined
            ? instHash !== can.hash
            : inst.size !== can.size;
        checks.push({
            id: inst.id,
            installed: inst,
            canonicalSize: can.size,
            needsUpdate,
            reason: needsUpdate
                ? (can.hash !== undefined && instHash !== undefined
                    ? 'content differs from canonical'
                    : `size differs (installed: ${inst.size}B, canonical: ${can.size}B)`)
                : 'up to date',
        });
    }
    return {
        targetDir,
        installed: installed.length,
        needsUpdate: checks.filter((c) => c.needsUpdate).length,
        upToDate: checks.filter((c) => !c.needsUpdate && c.canonicalSize !== undefined).length,
        notInCanonical: checks.filter((c) => c.canonicalSize === undefined).length,
        skills: checks,
    };
}
//# sourceMappingURL=upgrade.js.map
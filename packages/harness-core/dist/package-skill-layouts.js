/**
 * Package skill-layout resolution — where an installed npm package keeps its skills.
 *
 * `dz install <pkg>` (and, later, `dz init`/`dz registry` — see the backlog note below)
 * must find `SKILL.md` skill dirs inside an npm package. Packages in the wild ship three
 * on-disk arrangements; before this module existed, `cmdInstall` hard-coded exactly one
 * (`flat`), so every npx-init pack (`templates/.claude/skills/…`) and bare-`skills/`
 * pack resolved to "no SKILL.md files found" despite carrying valid skills.
 *
 * DESIGN RULE — ordered allowlist, NEVER a recursive find. A recursive "find any
 * SKILL.md" walk would resolve decoys that must stay invisible (both MEASURED in the
 * feature's layout census, `features/dz-install-npx-init/05_architecture.md` §3):
 *
 *   - `adapter-claude/test/fixtures/<id>/SKILL.md` — a test fixture, not a shipped skill;
 *   - `health-advisor/base/skills/base/<id>/SKILL.md` — a vendored mirror of another
 *     pack's skills (skills-analyst-manual); resolving it would double-install them.
 *
 * The allowlist is three fixed relative paths with no walk, so those decoys are
 * structurally unreachable (they are not on the probe list) rather than filtered out.
 * Any future recursive extension MUST re-introduce exclusion logic for both cases.
 *
 * @packageDocumentation
 */
import { existsSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { discoverSkillIds } from './skills.js';
/**
 * Ordered layout probe list. ORDER IS THE CONTRACT — first non-empty wins.
 *
 * `flat` is probed first so a classic pack can never be re-interpreted; `npx-template`
 * before `skills-dir` matches the measured census (13 vs 2 packages). Extending support
 * for a new layout is a data edit here, not new control flow.
 */
export const PACKAGE_SKILL_LAYOUTS = [
    { layout: 'flat', rel: '.' },
    { layout: 'npx-template', rel: 'templates/.claude/skills' },
    { layout: 'skills-dir', rel: 'skills' },
];
/** Does the matched skills root have sibling component dirs (commands/hooks/agents…)? */
function companionAssetsPresent(skillsRoot) {
    const parent = dirname(skillsRoot);
    if (!existsSync(parent))
        return false;
    try {
        return readdirSync(parent, { withFileTypes: true }).some((entry) => entry.isDirectory() && entry.name !== 'skills');
    }
    catch {
        return false;
    }
}
/**
 * Resolve the skills root of an installed npm package.
 *
 * Probes {@link PACKAGE_SKILL_LAYOUTS} in order; the FIRST layout with at least one
 * `<root>/<id>/SKILL.md` wins, and exactly one root is returned (`[root]`). Returns `[]`
 * when the package carries no skills in ANY known layout — the caller MUST treat `[]`
 * as an error (see `cmdInstall`'s exit code). Single-root is deliberate (feature
 * dz-install-npx-init, plan AM-4): no package today has skills in two allowlisted
 * layouts simultaneously, so multi-root install semantics would be untested dead code.
 * The array return type keeps the door open without committing to a merge policy.
 *
 * Pure, filesystem-read-only, synchronous, never throws on missing/unreadable dirs.
 */
export function resolvePackageSkillRoots(pkgDir) {
    for (const { layout, rel } of PACKAGE_SKILL_LAYOUTS) {
        const dir = rel === '.' ? pkgDir : join(pkgDir, rel);
        const ids = discoverSkillIds(dir);
        if (ids.length === 0)
            continue;
        return [
            {
                layout,
                dir,
                ids,
                hasCompanionAssets: layout === 'npx-template' && companionAssetsPresent(dir),
            },
        ];
    }
    return [];
}
//# sourceMappingURL=package-skill-layouts.js.map
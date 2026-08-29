/**
 * Emit minimal, self-contained skill bundles for a generic external consumer
 * (e.g. a LangGraph app that loads skills via its own `load_skill`).
 *
 * A bundle is the portable agentskills.io skill directory — `SKILL.md`
 * (YAML frontmatter + instructions, verbatim) plus `references/`, `scripts/`,
 * and `assets/` — with the dz-internal QA artifacts (`schemas/`, `evals/`,
 * `sources.json`) stripped. No `manifest.json` is written (the consumer builds
 * its own file-manifest on load); the skill describes instructions + resources,
 * not graph nodes.
 *
 * @packageDocumentation
 */
import { emitSkillTree } from '@dzhechkov/core';
import { applyEmitResult } from './apply.js';
import { loadSkillFromDir } from './skills.js';
/** Files excluded from a bundle — dz-internal, not part of a portable skill. */
function isInternalArtifact(path) {
    return /(^|\/)(schemas|evals)\//.test(path) || path.endsWith('/sources.json') || path === 'sources.json';
}
/**
 * Detect Claude-Code host coupling the consumer must adapt (advisory) — including
 * **cross-skill references** (a composite that loads sibling skills by path). Those
 * sibling skills are separate bundles; if they aren't bundled too, the skill won't
 * work standalone in a generic runtime, so they're surfaced loudly.
 */
function hostCouplingWarnings(id, skillMd, bundledIds) {
    const w = [];
    // Cross-skill references: `.claude/skills/<sub>/...` or `/mnt/skills/{user,public}/<sub>/...`.
    // These are the load-bearing dependency for composites (e.g. analyst-manual-full → explore,
    // goap-research-ed25519, problem-solver-enhanced). Only warn about sub-skills NOT already in
    // this bundle set — if they're all bundled, the set is self-contained.
    const subs = new Set();
    for (const m of skillMd.matchAll(/(?:\.claude\/skills|\/mnt\/skills\/(?:user|public))\/([a-z0-9][a-z0-9-]*)/g)) {
        if (m[1] !== undefined && m[1] !== id)
            subs.add(m[1]);
    }
    const missing = [...subs].filter((s) => !bundledIds.has(s)).sort();
    if (missing.length > 0) {
        w.push(`${id}: depends on sub-skill(s) ${missing.join(', ')} NOT in this bundle — add them ` +
            `(--select …,${missing.join(',')}) or this skill won't load them standalone`);
    }
    if (/\/mnt\/skills\//.test(skillMd)) {
        w.push(`${id}: references absolute /mnt/skills/... paths — rewrite to bundle-relative paths (e.g. just the skill id) for your runtime`);
    }
    if (/\bview\(\)/.test(skillMd)) {
        w.push(`${id}: uses view() (Claude-Code file-read) — inline the reference or expose a file-read tool`);
    }
    return w;
}
/**
 * Resolve each id from `skillsDirs`, emit it as a minimal bundle under
 * `<outRoot>/skills/<id>/`, and write it to disk. Idempotent (skips existing
 * files unless `force`). Returns what was written + any unresolved ids.
 */
export function bundleSkills(opts) {
    const found = new Set();
    const bundledIds = new Set(opts.ids);
    const bundled = [];
    for (const id of opts.ids) {
        if (found.has(id))
            continue;
        for (const dir of opts.skillsDirs) {
            let skill;
            try {
                skill = loadSkillFromDir(dir, id);
            }
            catch {
                continue; // not in this dir — try the next
            }
            found.add(id);
            const emit = emitSkillTree(skill, { skillsRoot: 'skills' });
            const files = emit.files.filter((f) => !isInternalArtifact(f.path));
            const skillMd = files.find((f) => f.path.endsWith('/SKILL.md'))?.content;
            const warnings = [
                ...emit.warnings,
                ...(typeof skillMd === 'string' ? hostCouplingWarnings(id, skillMd, bundledIds) : []),
            ];
            const applied = applyEmitResult({ files, warnings: [] }, { targetRoot: opts.outRoot, force: opts.force === true });
            bundled.push({ id, written: applied.written.length, skipped: applied.skipped.length, warnings });
            break;
        }
    }
    return { bundled, missing: [...opts.ids].filter((id) => !found.has(id)) };
}
//# sourceMappingURL=bundle.js.map
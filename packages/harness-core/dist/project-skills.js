/**
 * Polymorphic feature-adr (feature polymorphic-feature-adr, ADR-001).
 *
 * A COMMITTED per-project manifest (`architecture/project-skills.json`) declares the project-specific
 * skills feature-adr should fold into its pipeline — so a generic pipeline becomes project-aware WITHOUT
 * editing pipeline code (the Copilot `Orchestrates:` anti-pattern) and WITHOUT the skill self-declaring
 * where it attaches (orchestration is the parent's job). Hybrid model: a CLOSED core-role enum with a
 * fixed role→stage map, plus an open `extra` list. Guidance injection only in this release; `extra-phase`
 * is accepted but skipped (fail-open, forward-compatible).
 *
 * The build/plan/render functions are PURE + deterministic (sorted, no clock/random) so the same manifest
 * yields byte-identical plans; the load/resolve helpers do the disk I/O with TOP-LEVEL node:fs imports
 * (harness-core is ESM — a lazy require() is undefined at runtime; the R1 footgun).
 *
 * SAFETY PROPERTY (ADR-001 Decision 3, load-bearing): with NO manifest the plan is empty and
 * `guidanceForStage` returns '' — so `prompt + guidanceForStage(...)` is byte-identical to today. Every
 * injection that DOES happen is named in the report (no silent injection).
 */
import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { join, resolve, isAbsolute, sep } from 'node:path';
export const CORE_ROLES = ['product-vision', 'critic', 'brand', 'impl-bar', 'testing'];
/**
 * Fixed role→stage map. product-vision informs design + QE; impl-bar the code; critic + testing the QE;
 * brand the code. `testing` (R5) is the project's verification procedure (test commands, "done", gates) —
 * distinct from `critic` (the review lens): different SOURCE (testing = interview, critic = auto-mined).
 */
export const ROLE_STAGES = {
    'product-vision': ['design', 'qe'],
    'impl-bar': ['code'],
    'critic': ['qe'],
    'brand': ['code'],
    'testing': ['qe'],
};
/** Default doc for the product-vision role when the manifest omits it (the R1 seam). */
export const PRODUCT_VISION_DEFAULT = 'architecture/vision.md';
const byStr = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const isStage = (s) => s === 'design' || s === 'code' || s === 'qe';
const realOrNull = (p) => { try {
    return realpathSync(p);
}
catch {
    return null;
} };
const isContained = (root, abs) => abs === root || abs.startsWith(root + sep);
/**
 * Resolve a manifest-declared path to a SAFE absolute path inside repoRoot, or null if it escapes
 * (absolute path, `../` traversal, or a symlink pointing outside). The manifest is committed, but a
 * hostile/careless entry must never make the pipeline read `/etc/passwd` (cross-model QE High finding).
 */
function safeResolve(repoRoot, relPath) {
    if (isAbsolute(relPath))
        return null;
    const abs = resolve(repoRoot, relPath);
    if (!isContained(repoRoot, abs))
        return null; // lexical `../` escape
    if (existsSync(abs)) { // symlink-aware escape (only checkable when it exists)
        const real = realOrNull(abs);
        const rootReal = realOrNull(repoRoot) ?? repoRoot;
        if (real !== null && !isContained(rootReal, real))
            return null;
    }
    return abs;
}
/**
 * Validate a parsed manifest object. FAIL-OPEN (NFR-2): a bad top-level shape → null + errors; a bad
 * entry (unknown role key, missing fields, bad stage) is DROPPED with a reason, the rest survive. A
 * config typo must never brick a run.
 */
export function validateManifest(raw) {
    const errors = [];
    // An ARRAY is `typeof 'object'` but is NOT a valid manifest — reject it, else `[]` would sanitize to an
    // empty manifest and silently activate the product-vision default (cross-model QE High finding).
    if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
        return { manifest: null, errors: ['manifest must be a JSON object'] };
    }
    const obj = raw;
    const roles = {};
    if (obj.roles !== undefined) {
        if (obj.roles === null || typeof obj.roles !== 'object') {
            errors.push('roles: not an object — ignored');
        }
        else {
            for (const [key, val] of Object.entries(obj.roles)) {
                if (!CORE_ROLES.includes(key)) {
                    errors.push(`roles.${key}: unknown role — skipped`);
                    continue;
                }
                if (typeof val !== 'string' || val.trim() === '') {
                    errors.push(`roles.${key}: path must be a non-empty string — skipped`);
                    continue;
                }
                roles[key] = val;
            }
        }
    }
    const extra = [];
    if (obj.extra !== undefined) {
        if (!Array.isArray(obj.extra)) {
            errors.push('extra: not an array — ignored');
        }
        else {
            obj.extra.forEach((e, i) => {
                if (e === null || typeof e !== 'object') {
                    errors.push(`extra[${i}]: not an object — skipped`);
                    return;
                }
                const ent = e;
                if (typeof ent.skill !== 'string' || ent.skill.trim() === '') {
                    errors.push(`extra[${i}].skill: missing path — skipped`);
                    return;
                }
                if (!isStage(ent.phase)) {
                    errors.push(`extra[${i}].phase: must be design|code|qe — skipped`);
                    return;
                }
                if (ent.as !== 'guidance' && ent.as !== 'extra-phase') {
                    errors.push(`extra[${i}].as: must be guidance|extra-phase — skipped`);
                    return;
                }
                if (ent.as === 'extra-phase') {
                    errors.push(`extra[${i}] (${String(ent.skill)}): extra-phase is not supported yet (guidance-only release) — skipped`);
                    return;
                }
                const item = { skill: ent.skill, phase: ent.phase, as: 'guidance' };
                extra.push(item);
            });
        }
    }
    return { manifest: { version: typeof obj.version === 'number' ? obj.version : 1, roles, extra }, errors };
}
/**
 * Resolve each manifest entry to its on-disk content. Impure I/O (top-level fs; never throws). A missing
 * file is DROPPED with a reason (fail-open). product-vision defaults to `architecture/vision.md` (FR-4)
 * when the role is unset and the default exists.
 */
export function resolveInjections(repoRoot, manifest) {
    const resolved = [];
    const skipped = [];
    // Read a manifest path SAFELY (contained in repoRoot). Returns {content} or a skip reason.
    const read = (relPath) => {
        const abs = safeResolve(repoRoot, relPath);
        if (abs === null)
            return { reason: 'path escapes the repo — rejected' };
        try {
            return existsSync(abs) ? { content: readFileSync(abs, 'utf8') } : { reason: 'file not found' };
        }
        catch {
            return { reason: 'unreadable' };
        }
    };
    // Core roles (incl. the product-vision default).
    for (const role of CORE_ROLES) {
        const explicit = manifest.roles?.[role];
        const path = explicit ?? (role === 'product-vision' ? PRODUCT_VISION_DEFAULT : undefined);
        if (path === undefined)
            continue; // role not configured, no default
        const r = read(path);
        if (!('content' in r)) {
            skipped.push({ entry: `${role} → ${path}`, reason: r.reason });
            continue;
        }
        resolved.push({ source: path, role, stages: ROLE_STAGES[role], content: r.content });
    }
    // Extra guidance entries.
    for (const e of manifest.extra ?? []) {
        const r = read(e.skill);
        if (!('content' in r)) {
            skipped.push({ entry: `extra → ${e.skill}`, reason: r.reason });
            continue;
        }
        resolved.push({ source: e.skill, role: 'extra', stages: [e.phase], content: r.content });
    }
    return { resolved, skipped };
}
/**
 * Build the injection plan. PURE + deterministic: one Injection per (item, stage), sorted by
 * (stage, source). The same resolved set always yields a byte-identical plan (ADR-001 §1).
 */
export function buildInjectionPlan(resolved, skipped = []) {
    const injections = [];
    for (const item of resolved) {
        for (const stage of item.stages) {
            injections.push({ stage, source: item.source, role: item.role, content: item.content });
        }
    }
    injections.sort((a, b) => byStr(a.stage, b.stage) || byStr(a.source, b.source) || byStr(String(a.role), String(b.role)));
    const skippedSorted = [...skipped].sort((a, b) => byStr(a.entry, b.entry));
    return { injections, skipped: skippedSorted };
}
/**
 * The guidance suffix for one stage — a concat of every injection targeting it, each with a provenance
 * header. Returns '' when nothing targets the stage, so `prompt + guidanceForStage(...)` is byte-identical
 * to the bare prompt on a no-manifest run (FR-7, load-bearing).
 */
export function guidanceForStage(plan, stage) {
    const items = plan.injections.filter((i) => i.stage === stage);
    if (items.length === 0)
        return '';
    const blocks = items.map((i) => {
        const tag = i.role === 'extra' ? `project skill ${i.source}` : `project ${i.role} (${i.source})`;
        return `\n\n### Project-specific guidance — ${tag} (apply to this ${stage} step; injected via architecture/project-skills.json):\n${i.content.trim()}`;
    });
    return blocks.join('');
}
/** Human "who injected what" report (FR-6 — no silent injection). Deterministic. */
export function renderInjectionReport(plan) {
    if (plan.injections.length === 0 && plan.skipped.length === 0) {
        return 'project-skills: no manifest / nothing injected (generic run).';
    }
    const lines = ['project-skills injections:'];
    if (plan.injections.length === 0)
        lines.push('  (none applied)');
    for (const i of plan.injections) {
        const who = i.role === 'extra' ? `extra ${i.source}` : `${i.role} (${i.source})`;
        lines.push(`  • ${i.stage} ← ${who}`);
    }
    if (plan.skipped.length > 0) {
        lines.push('  skipped:');
        for (const s of plan.skipped)
            lines.push(`    ⚠ ${s.entry} — ${s.reason}`);
    }
    return lines.join('\n');
}
/**
 * Load + validate the project manifest (`architecture/project-skills.json`). Impure; returns null when
 * absent OR unparseable OR top-level-invalid (fail-open) — a null means "generic run" (FR-7). Entry-level
 * problems are kept on the returned manifest's implicit skip path (via validateManifest at resolve time).
 */
export function loadProjectSkills(repoRoot) {
    try {
        const p = join(repoRoot, 'architecture', 'project-skills.json');
        if (!existsSync(p))
            return null;
        const parsed = JSON.parse(readFileSync(p, 'utf8'));
        return validateManifest(parsed).manifest;
    }
    catch {
        return null;
    }
}
/**
 * One-shot convenience for the pipeline: load → validate → resolve → plan. Returns an EMPTY plan when
 * there is no manifest file (FR-7 byte-identical). Validation problems (unknown role / bad entry) AND
 * missing-file skips both surface in `plan.skipped` so the report hides nothing (FR-6). Impure.
 */
export function planProjectSkills(repoRoot) {
    let parsed;
    try {
        const p = join(repoRoot, 'architecture', 'project-skills.json');
        if (!existsSync(p))
            return { injections: [], skipped: [] }; // no manifest file → generic run
        parsed = JSON.parse(readFileSync(p, 'utf8'));
    }
    catch (e) {
        return { injections: [], skipped: [{ entry: 'architecture/project-skills.json', reason: 'unreadable/invalid JSON' }] };
    }
    const { manifest, errors } = validateManifest(parsed);
    const validationSkips = errors.map((reason) => ({ entry: 'manifest', reason }));
    if (manifest === null)
        return { injections: [], skipped: validationSkips };
    const { resolved, skipped } = resolveInjections(repoRoot, manifest);
    return buildInjectionPlan(resolved, [...skipped, ...validationSkips]);
}
//# sourceMappingURL=project-skills.js.map
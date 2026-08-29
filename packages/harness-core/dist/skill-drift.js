/**
 * Intra-monorepo skill-drift guard.
 *
 * The same skill is physically duplicated across many monorepo packages
 * (`packages/@dzhechkov/*​/<skill>/` + `.claude/skills/<skill>/`). A fix applied to ONE copy
 * silently leaves the others broken — this is exactly how a CRITICAL `goap-research-ed25519`
 * self-signed-forgery exploit shipped in 10 of 12 copies, and how a `brutal-honesty-review`
 * `set -e` crash reached the PUBLISHED `@dzhechkov/skills-qe`. Both were found only by accident.
 *
 * `dz sync-upstream` only checks against EXTERNAL repos and is structurally blind to this class of
 * drift. This module is the intra-monorepo complement:
 *
 *   • `sweepSkillDrift(root)`        — detector: which shared skills byte-differ between copies.
 *   • `syncCanonicalSkill(root, s)`  — healer: overwrite every copy from `skills-meta/<skill>`.
 *
 * Both are PURE functions that return plain data — no printing, no `process.exit`, no throwing on
 * the "canonical missing" / "drift found" business cases. The CLI layer owns exit codes and I/O.
 * Dependency-free: `node:fs` / `node:path` / `node:crypto` only.
 *
 * @packageDocumentation
 */
import { readdirSync, statSync, readFileSync, writeFileSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { join, relative, resolve, dirname, basename, sep } from 'node:path';
import { createHash } from 'node:crypto';
import { DEV_SKILL_ROOT, SKILL_INSTALL_ROOTS, TARGET_ENRICHMENT_ASSETS } from './skill-install-roots.js';
const SKILL_MANIFEST = 'SKILL.md';
const IGNORED_ENTRIES = new Set(['node_modules', '__pycache__', '.DS_Store', 'run-history.json']);
/** md5 of a file's bytes (identical to both prototype scripts ⇒ identical drift verdicts). */
function md5(path) {
    return createHash('md5').update(readFileSync(path)).digest('hex');
}
/** Recursive file list under `dir`; skips `node_modules` / `__pycache__` / `.DS_Store`. */
function walk(dir) {
    const out = [];
    for (const entry of readdirSync(dir)) {
        if (IGNORED_ENTRIES.has(entry))
            continue;
        const p = join(dir, entry);
        let st;
        try {
            st = statSync(p);
        }
        catch {
            continue;
        }
        if (st.isDirectory())
            out.push(...walk(p));
        else
            out.push(p);
    }
    return out;
}
/**
 * Byte-compare a set of skill copies against EACH OTHER (canonical-free). Builds the union of
 * relative file paths across every copy, hashes each `(copy × rel)`, and counts how many relative
 * paths disagree (`driftFiles`) and how many `(copy × rel)` pairs are absent from a copy
 * (`missingFiles`). `driftFiles > 0` ⇔ the copies are NOT byte-identical to one another.
 *
 * This is the exact per-skill comparison {@link sweepSkillDrift} performs; it is extracted verbatim
 * so BOTH the CI sweep AND the canonical-free `sync-canonical --check` share one implementation and
 * yield the same verdict. Behavior-preserving refactor — no numbers change.
 */
/**
 * Is this skill-dir-relative path a TARGET ENRICHMENT asset ({@link TARGET_ENRICHMENT_ASSETS})?
 *
 * Such a file exists in ONE copy by design — `dz init --enrich` writes it into the install tree and
 * the canonical never has it. Counting it as drift makes the gate unsatisfiable; removing it during
 * a heal destroys valid output. Compared with POSIX separators so a Windows `relative()` still matches.
 */
function isEnrichmentAsset(rel, copyDir) {
    const owner = TARGET_ENRICHMENT_ASSETS[rel.split(sep).join('/')];
    if (owner === undefined)
        return false;
    // The exemption is only valid inside the root that OWNS the asset. Elsewhere the same filename is
    // a misplaced extra file, and waving it through would make the sweep report clean while the healer
    // preserved it. ANCHORED at the skill dir, not searched across the whole absolute path: a repo that
    // itself lives under a directory containing `/.agents/skills/` would otherwise have every copy in
    // it — packages included — classified as codex-owned (cross-family review, 2026-08-25).
    const posix = copyDir.split(sep).join('/');
    return posix.endsWith('/' + owner + '/' + posix.split('/').slice(-1)[0]);
}
/**
 * The canonical's own file list, with every enrichment-asset NAME removed regardless of where the
 * canonical came from. A canonical picked by `--auto` (or handed in with `--from`) can itself be an
 * enriched install copy; propagating its target-specific metadata into the package and other target
 * copies is never correct, and the exemption above would then stop it ever being cleaned up.
 */
function withoutEnrichmentNames(rels) {
    return rels.filter((r) => TARGET_ENRICHMENT_ASSETS[r.split(sep).join('/')] === undefined);
}
function comparePeers(copies) {
    const relFiles = new Set();
    for (const c of copies)
        for (const f of walk(c)) {
            const rel = relative(c, f);
            if (isEnrichmentAsset(rel, c))
                continue;
            relFiles.add(rel);
        }
    let driftFiles = 0;
    let missingFiles = 0;
    for (const rel of relFiles) {
        const hashes = new Set();
        for (const c of copies) {
            const p = join(c, rel);
            if (existsSync(p))
                hashes.add(md5(p));
            else {
                missingFiles++;
                hashes.add('__MISSING__');
            }
        }
        if (hashes.size > 1)
            driftFiles++;
    }
    return { driftFiles, missingFiles, totalFiles: relFiles.size };
}
/**
 * Deterministic auto-pick of a canonical from a set of copies: the copy with the MOST files wins,
 * tie-broken lexicographically on sorted path (so the same drift always auto-picks the same
 * canonical, across runs and machines). "Most complete" is a HEURISTIC, not a correctness oracle —
 * hence it is only ever reached behind an explicit `--auto` opt-in plus a loud warning.
 */
function pickMostComplete(copies) {
    // Enrichment assets do not make a copy more COMPLETE — they make it a target install. Counting
    // them would let an enriched copy win the heuristic on files no other copy is supposed to have.
    const size = (d) => withoutEnrichmentNames(walk(d).map((p) => relative(d, p))).length;
    return [...copies].sort().reduce((best, c) => (size(c) > size(best) ? c : best));
}
/**
 * Resolve WHICH dir is canonical for a sync/check run, and HOW it resolved. Precedence is identical
 * for read and write paths:
 *   1. `opts.from`            → `'from'`
 *   2. `skills-meta/<skill>`  → `'skills-meta'`
 *   3. `opts.auto` (write)    → `'auto'` (most-complete copy)
 *   4. otherwise              → `'none'` (no canonical — `--check` compares copies to each other;
 *                               a bare write refuses)
 */
function resolveCanonical(root, skill, copies, opts) {
    if (opts.from !== undefined)
        return { canonical: resolve(opts.from), resolvedFrom: 'from' };
    const meta = join(root, 'packages/@dzhechkov/skills-meta', skill);
    if (existsSync(meta))
        return { canonical: meta, resolvedFrom: 'skills-meta' };
    if (opts.auto === true && copies.length >= 1)
        return { canonical: pickMostComplete(copies), resolvedFrom: 'auto' };
    return { canonical: null, resolvedFrom: 'none' };
}
/**
 * Every skill dir (a dir containing `SKILL.md`) under `packages/` + every per-target install root
 * in {@link SKILL_INSTALL_ROOTS}, excluding `node_modules` / `__pycache__`. Originally ported from
 * `scripts/drift-sweep-skills.mjs`, which searched `.claude/skills` alone — see ADR-001
 * (skill-copy-discovery) for why one hardcoded root let the Codex install drift unseen.
 */
function findSkillDirs(root, scope = 'all') {
    const dirs = [];
    // Roots are ANCHORED at the repo root — never a recursive search for `*/skills`. A stale agent
    // worktree under `.claude/worktrees/<id>/` holds a full second copy of `packages/`,
    // `.claude/skills` AND `.agents/skills`; a recursive sweep would report every skill in the repo
    // as drifting against a checkout nobody maintains, and the healer would be entitled to WRITE
    // into it (ADR-001, Option C rejected on exactly this measurement).
    const installRoots = scope === 'installs'
        ? SKILL_INSTALL_ROOTS.filter((r) => r !== DEV_SKILL_ROOT)
        : SKILL_INSTALL_ROOTS;
    const roots = scope === 'packages'
        ? [join(root, 'packages')]
        : [join(root, 'packages'), ...installRoots.map((r) => join(root, ...r.split('/')))];
    const stack = roots.filter((p) => existsSync(p));
    while (stack.length) {
        const d = stack.pop();
        let entries;
        try {
            entries = readdirSync(d);
        }
        catch {
            continue;
        }
        // Drift-guard scope = SKILL.md-bearing dirs ONLY. `templates/docs/<name>/` mirrors carry
        // skill-shaped NAMES but are rendered/derived documentation (no SKILL.md) and are therefore
        // intentionally excluded — they are not skill definitions, so there is nothing to keep in sync.
        // (Verified: no `packages/**/templates/docs/**` dir carries a SKILL.md. See ADR-001, D1.)
        if (entries.includes(SKILL_MANIFEST))
            dirs.push(d);
        for (const e of entries) {
            if (IGNORED_ENTRIES.has(e))
                continue;
            const p = join(d, e);
            try {
                if (statSync(p).isDirectory())
                    stack.push(p);
            }
            catch {
                /* skip unreadable entries */
            }
        }
    }
    return dirs;
}
/**
 * Detect intra-monorepo skill drift: find every skill duplicated across ≥2 locations and report
 * which copies byte-differ. Pure port of `scripts/drift-sweep-skills.mjs`.
 *
 * `result.drifted.length === 0` is the exact condition the CI gate keys on.
 */
export function sweepSkillDrift(root, opts = {}) {
    const scope = opts.scope ?? 'all';
    const allow = new Set(opts.allowlist ?? []);
    // Group skill dirs by basename → Map<name, locations[]>.
    const byName = new Map();
    for (const d of findSkillDirs(root, scope)) {
        const name = basename(d);
        const list = byName.get(name);
        if (list)
            list.push(d);
        else
            byName.set(name, [d]);
    }
    let duplicated = 0;
    const drifted = [];
    const allowlisted = [];
    for (const [name, unsorted] of [...byName.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
        if (unsorted.length < 2)
            continue;
        duplicated++;
        const copies = [...unsorted].sort();
        // Per-skill byte-comparison of every copy against each other (extracted to `comparePeers`
        // so the canonical-free `sync-canonical --check` reuses the EXACT same logic).
        const { driftFiles, missingFiles, totalFiles } = comparePeers(copies);
        if (driftFiles > 0) {
            const entry = {
                name,
                copies: copies.length,
                driftFiles,
                totalFiles,
                missingFiles,
                locations: copies,
            };
            (allow.has(name) ? allowlisted : drifted).push(entry);
        }
    }
    const byDrift = (a, b) => b.driftFiles - a.driftFiles;
    drifted.sort(byDrift);
    allowlisted.sort(byDrift);
    return { duplicated, drifted, allowlisted };
}
/**
 * Heal one skill: treat the resolved canonical (`--from` → `skills-meta/<skill>` → `--auto`
 * most-complete copy) as authoritative and overwrite every other copy in the monorepo, proving
 * byte-identity. Pure port of `scripts/sync-canonical-skill.mjs`, extended with a canonical-free path.
 *
 * `check:true` writes NOTHING (`wrote` stays empty) and only reports the drift count.
 * Default overwrites drifting copies; a subsequent {@link sweepSkillDrift} then reports 0 drift.
 *
 * When NO canonical resolves (`resolvedFrom === 'none'` — no `--from`, no `skills-meta`, no `--auto`):
 *   • `check:true` → CANONICAL-FREE peer check: `drifted` = # files that differ ACROSS the copies
 *     (byte-identical copies ⇒ `drifted === 0`). Reuses {@link comparePeers} — the exact sweep logic.
 *   • write (bare) → REFUSES: returns `wrote:[]`, `synced:0`, mutates NOTHING. Safe-by-default: the
 *     tool never guesses a canonical for a write, because a wrong pick destroys the good copy. The
 *     operator must pass `--from`, run `--check`, or opt in to `--auto` (which the CLI announces).
 *
 * This function never throws / never `process.exit`s — the CLI owns exit codes, printing, and the
 * loud `--auto` warning.
 */
export function syncCanonicalSkill(root, skill, opts = {}) {
    const check = opts.check === true;
    // The healer/checker operates on EXACTLY what the detector sees (same roots via findSkillDirs) —
    // otherwise a copy could be silently healed but never gated, or vice-versa.
    const allCopies = findSkillDirs(root, 'all')
        .filter((d) => basename(d) === skill)
        .sort();
    const { canonical, resolvedFrom } = resolveCanonical(root, skill, allCopies, opts);
    // No canonical resolved → asymmetric read/write handling (ADR-001 D3/D4).
    if (canonical === null) {
        if (check) {
            // CANONICAL-FREE peer check: are the copies byte-identical to EACH OTHER? (<2 ⇒ vacuously so.)
            const drifted = allCopies.length < 2 ? 0 : comparePeers(allCopies).driftFiles;
            return { canonical: '', canonicalExists: false, resolvedFrom, copies: allCopies.length, synced: 0, drifted, wrote: [] };
        }
        // Bare WRITE with no resolvable canonical → REFUSE. Mutates nothing (`wrote:[]` proves it).
        return { canonical: '', canonicalExists: false, resolvedFrom, copies: allCopies.length, synced: 0, drifted: 0, wrote: [] };
    }
    const canonFiles = withoutEnrichmentNames(walk(canonical).map((p) => relative(canonical, p))).sort();
    // Every <skill>/ dir except the canonical itself.
    const copies = allCopies.filter((d) => relative(canonical, d) !== '');
    let drifted = 0;
    let synced = 0;
    const wrote = [];
    for (const copy of copies) {
        // Target ENRICHMENT assets are excluded from the copy's file set entirely: they exist in the
        // install tree by design, the canonical never has them, and both the drift verdict and the
        // removal pass below must leave them alone.
        const copyFiles = new Set(walk(copy).map((p) => relative(copy, p)).filter((f) => !isEnrichmentAsset(f, copy)));
        let differs = false;
        // Extra files in the copy not present in canonical ⇒ drift.
        for (const f of copyFiles)
            if (!canonFiles.includes(f))
                differs = true;
        for (const f of canonFiles) {
            const src = join(canonical, f);
            const dst = join(copy, f);
            if (!existsSync(dst) || md5(src) !== md5(dst))
                differs = true;
        }
        if (!differs)
            continue;
        drifted++;
        if (check)
            continue; // report only — write NOTHING
        // Overwrite: remove extra files, then copy every canonical file byte-for-byte.
        for (const f of copyFiles)
            if (!canonFiles.includes(f))
                rmSync(join(copy, f));
        for (const f of canonFiles) {
            const src = join(canonical, f);
            const dst = join(copy, f);
            mkdirSync(dirname(dst), { recursive: true });
            writeFileSync(dst, readFileSync(src));
        }
        synced++;
        wrote.push(copy);
    }
    return { canonical, canonicalExists: true, resolvedFrom, copies: copies.length, synced, drifted, wrote };
}
//# sourceMappingURL=skill-drift.js.map
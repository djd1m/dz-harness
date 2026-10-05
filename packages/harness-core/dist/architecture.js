/**
 * Product architecture lens (feature product-architecture-lens, ADR-001).
 *
 * A deterministic, LLM-free extractor that renders the product as its INTENT layer — the curated
 * subsystems from `architecture/subsystems.manifest.json` (grounded in the harness-cli README's 5 jobs) —
 * merged with the code-derived workspace graph. It is pure (no I/O, no clock, no randomness) so the same
 * tree always yields byte-identical output (ADR-001 Decision 1) and it is cheap enough to rebuild at the
 * end of every feature-adr run (FR-3). The map/render/drift functions are pure; the load and scan
 * helpers at the bottom do the disk I/O for the CLI and the feature-adr end-of-run auto-update.
 */
import { existsSync, readFileSync, readdirSync, realpathSync, statSync } from 'node:fs';
import { join } from 'node:path';
/** Prefix-glob match: `adapter-*` matches `adapter-claude`. Only trailing `*` is supported (by design). */
function patternMatches(pattern, name) {
    if (pattern.endsWith('*'))
        return name.startsWith(pattern.slice(0, -1));
    return pattern === name;
}
/** Which subsystem owns a package? First match in manifest order wins (deterministic). null ⇒ unassigned. */
export function subsystemOf(manifest, pkg) {
    for (const s of manifest.subsystems) {
        if (s.packages.includes(pkg))
            return s.id;
        if (s.packagePatterns.some((p) => patternMatches(p, pkg)))
            return s.id;
    }
    return null;
}
const byStr = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
/**
 * Build the product map from the curated manifest + the scanned workspace. PURE + deterministic:
 * every list is sorted, no clock/random, so two runs on the same inputs are byte-identical (ADR-001 §1).
 */
export function buildArchitectureMap(manifest, packages) {
    const pkgToSub = new Map();
    const bucket = new Map();
    const unassigned = [];
    for (const s of manifest.subsystems)
        bucket.set(s.id, []);
    for (const p of packages) {
        const sub = subsystemOf(manifest, p.name);
        if (sub === null) {
            unassigned.push(p.name);
            continue;
        }
        pkgToSub.set(p.name, sub);
        bucket.get(sub).push(p.name);
    }
    // Subsystem→subsystem edges, aggregated from package-level internal deps (self-edges dropped, deduped).
    // NUL cannot appear in a node id, so the joined edge key is unambiguous.
    const EDGE_KEY_SEPARATOR = '\u0000';
    const edgeSet = new Set();
    for (const p of packages) {
        const from = pkgToSub.get(p.name);
        if (from === undefined)
            continue;
        for (const dep of p.internalDeps) {
            const to = pkgToSub.get(dep);
            if (to === undefined || to === from)
                continue;
            edgeSet.add(from + EDGE_KEY_SEPARATOR + to);
        }
    }
    const edges = [...edgeSet]
        .map((k) => { const [from, to] = k.split(EDGE_KEY_SEPARATOR); return { from, to }; })
        .sort((a, b) => byStr(a.from, b.from) || byStr(a.to, b.to));
    const subsystems = manifest.subsystems.map((s) => ({
        id: s.id,
        label: s.label,
        job: s.job,
        desc: s.desc,
        packages: [...(bucket.get(s.id) ?? [])].sort(byStr),
        commands: [...new Set(s.commands)].sort(byStr), // dedupe: a command listed twice in one subsystem must not double-count
    }));
    return { subsystems, edges, unassigned: [...unassigned].sort(byStr) };
}
/**
 * Compare a built map against reality and report drift. PURE (ADR-001 §1). Two signals:
 *  1. Unassigned packages — but ONLY those that are git-TRACKED (`trackedPackages`), so a scratch or
 *     gitignored package dir never manufactures false drift (FR-6, the git-aware requirement).
 *  2. A command owned by ≥2 subsystems — a manifest contradiction (one command can't be two jobs).
 * Everything is sorted, so the report is deterministic.
 */
export function findArchitectureDrift(map, trackedPackages) {
    const unassigned = map.unassigned.filter((p) => trackedPackages.has(p)).slice().sort(byStr);
    const owners = new Map();
    for (const s of map.subsystems) {
        for (const c of s.commands) {
            const set = owners.get(c);
            if (set)
                set.add(s.id);
            else
                owners.set(c, new Set([s.id]));
        }
    }
    // A command is drift only when owned by >1 DISTINCT subsystem — a command listed twice in ONE
    // subsystem is not cross-subsystem duplication (caught by cross-model QE).
    const duplicateCommands = [...owners.entries()]
        .filter(([, subs]) => subs.size > 1)
        .map(([command, subs]) => ({ command, subsystems: [...subs].sort(byStr) }))
        .sort((a, b) => byStr(a.command, b.command));
    return { unassigned, duplicateCommands, clean: unassigned.length === 0 && duplicateCommands.length === 0 };
}
/** Human render of a DriftReport for `dz architecture --revise`. Deterministic. */
export function renderDriftReport(report) {
    if (report.clean)
        return '✓ no architecture drift — every tracked package is mapped and every command has one owner.';
    const lines = ['⚠ architecture drift detected:'];
    if (report.unassigned.length > 0) {
        lines.push('');
        lines.push(`  UNASSIGNED packages (${report.unassigned.length}) — tracked on disk but in no subsystem:`);
        for (const p of report.unassigned)
            lines.push(`    • ${p}`);
        lines.push('    → add each to architecture/subsystems.manifest.json under the right subsystem.');
    }
    if (report.duplicateCommands.length > 0) {
        lines.push('');
        lines.push(`  DUPLICATE commands (${report.duplicateCommands.length}) — claimed by >1 subsystem:`);
        for (const d of report.duplicateCommands)
            lines.push(`    • ${d.command} → ${d.subsystems.join(', ')}`);
        lines.push('    → keep each command in exactly one subsystem.');
    }
    return lines.join('\n');
}
/**
 * Scan `packages/@dzhechkov/*` into `ScannedPackage[]` (unscoped name + unscoped internal deps). Impure
 * I/O helper (lazy `require`, never throws) shared by the CLI and the feature-adr end-of-run auto-update
 * (FR-3), so both build the map from the identical scan. Deterministic: output is sorted.
 */
function isDirFollowingLinks(path) {
    try {
        return statSync(path).isDirectory();
    }
    catch {
        return false;
    }
}
export function scanWorkspacePackages(repoRoot) {
    try {
        const base = join(repoRoot, 'packages', '@dzhechkov');
        if (!existsSync(base))
            return [];
        const out = [];
        const seenReal = new Set();
        for (const entry of readdirSync(base, { withFileTypes: true })) {
            // A symlink to a package directory is a package directory: `dz mutation-gate`'s shadow tree
            // symlinks every sibling, and pnpm links workspace packages the same way. Dirent reports such
            // an entry as a symlink, never as a directory, so follow it; a dangling link is skipped.
            if (!entry.isDirectory() && !(entry.isSymbolicLink() && isDirFollowingLinks(join(base, entry.name))))
                continue;
            // An alias link to a directory already scanned is the SAME package — count it once.
            let real;
            try {
                real = realpathSync(join(base, entry.name));
            }
            catch {
                continue;
            }
            if (seenReal.has(real))
                continue;
            seenReal.add(real);
            const pj = join(base, entry.name, 'package.json');
            if (!existsSync(pj))
                continue;
            let json;
            try {
                json = JSON.parse(readFileSync(pj, 'utf8'));
            }
            catch {
                continue;
            }
            const unscope = (n) => n.replace(/^@dzhechkov\//, '');
            const name = unscope(String(json.name ?? entry.name));
            const deps = { ...(json.dependencies ?? {}), ...(json.peerDependencies ?? {}), ...(json.optionalDependencies ?? {}) };
            const internalDeps = Object.keys(deps)
                .filter((d) => d.startsWith('@dzhechkov/'))
                .map(unscope)
                .sort(byStr);
            out.push({ name, internalDeps });
        }
        return out.sort((a, b) => byStr(a.name, b.name));
    }
    catch {
        return [];
    }
}
export const DEFAULT_ARCH_THRESHOLDS = { hardStop: 0.85, softWarn: 0.5 };
/**
 * Boundary-tension markers, aligned to vision.md's "что dz сознательно НЕ делает". Matching one is a
 * SOFT signal (0.6) — never a hard-stop — because a feature description can legitimately mention these
 * words; the block path is reserved for the unambiguous exact-duplicate-command signal (FR-8).
 */
// NOTE: `\b` is an ASCII word boundary — it does NOT anchor Cyrillic (a Cyrillic letter is a non-word
// char in JS regex without the /u+property escapes), so the Russian markers use plain substrings, not
// `\bрантайм\b` (which never matches). Caught by cross-model QE. English markers keep `\b` (ASCII-safe).
const BOUNDARY_MARKERS = [
    /\bagent runtime\b/i, /\bruntime for (executing|running) agents\b/i, /\bexecutes? agents\b/i,
    /рантайм/i, /исполня(ет|ть)\s+агент/i,
    /\breplaces? (claude code|the agent host)\b/i, /\bIDE\b/, /хостинг/i, /агентский хост/i,
];
const lc = (s) => s.toLowerCase();
/**
 * Сверка: compare a proposed feature against the product map + vision. PURE + deterministic. Returns
 * `{signal, confidence, reason, details}`. CATEGORY-gated (Decision 3, hardened after cross-model QE):
 * a `block` fires ONLY from a block-eligible signal — an EXACT command duplication — whose confidence
 * clears `hardStop`. Boundary tension and stem overlap are structurally advisory: they can never block
 * at ANY threshold (confidence alone is not policy-safe — a low custom `hardStop` must not promote soft
 * evidence to a hard-stop). FR-8: on the current product's real features this yields ZERO blocks.
 */
export function checkFeatureAgainstArchitecture(feature, map, vision, thresholds = DEFAULT_ARCH_THRESHOLDS) {
    const signals = [];
    // Index existing commands → owning subsystem.
    const cmdOwner = new Map();
    for (const s of map.subsystems)
        for (const c of s.commands)
            cmdOwner.set(lc(c), s.id);
    for (const raw of feature.proposedCommands ?? []) {
        const cmd = lc(raw.trim());
        if (cmd === '')
            continue;
        const owner = cmdOwner.get(cmd);
        if (owner !== undefined) {
            // Exact collision — the ONLY block-eligible signal. Same-job (or unknown target) ⇒ full strength;
            // cross-job ⇒ still strong (a command name should be unique CLI-wide) but marginally lower.
            const sameJob = feature.targetSubsystem === undefined || feature.targetSubsystem === owner;
            const conf = sameJob ? 0.9 : 0.86;
            signals.push({ conf, detail: `duplicate-command: "${cmd}" already exists in subsystem "${owner}" (conf ${conf})`, blockEligible: true });
            continue;
        }
        // Near-duplicate: shares a ≥4-char prefix with an existing command in the SAME target subsystem. Advisory.
        if (feature.targetSubsystem !== undefined) {
            const sub = map.subsystems.find((s) => s.id === feature.targetSubsystem);
            const stem = cmd.slice(0, 4);
            if (stem.length >= 4 && sub && sub.commands.some((c) => lc(c) !== cmd && lc(c).startsWith(stem))) {
                signals.push({ conf: 0.3, detail: `possible-overlap: "${cmd}" shares a stem with a command in "${feature.targetSubsystem}" (conf 0.3)`, blockEligible: false });
            }
        }
    }
    // Boundary tension — advisory (never block-eligible, by design).
    if (vision !== null) {
        const text = `${feature.slug} ${feature.description}`;
        if (BOUNDARY_MARKERS.some((re) => re.test(text))) {
            signals.push({ conf: 0.6, detail: 'boundary-tension: description touches a "dz сознательно НЕ делает" boundary (conf 0.6)', blockEligible: false });
        }
    }
    const pickTop = (items) => items.reduce((best, s) => (best === null || s.conf > best.conf ? s : best), null);
    const topBlock = pickTop(signals.filter((s) => s.blockEligible));
    const topOverall = pickTop(signals);
    const confidence = topOverall ? topOverall.conf : 0;
    let signal;
    let driver;
    if (topBlock !== null && topBlock.conf >= thresholds.hardStop) {
        signal = 'block';
        driver = topBlock; // reason cites the DRIVING signal (fix), not details[0]
    }
    else if (topOverall !== null && topOverall.conf >= thresholds.softWarn) {
        signal = 'soft-warn';
        driver = topOverall;
    }
    else {
        signal = 'ok';
        driver = null;
    }
    const reason = signal === 'block' ? `Feature contradicts the architecture (${driver.detail}). Confirm this is intentional.`
        : signal === 'soft-warn' ? `Feature has architecture tension (${driver.detail}). Worth a look.`
            : 'Feature aligns with the product map and vision.';
    return { signal, confidence, reason, details: signals.map((s) => s.detail) };
}
/** Human render of a сверка result for the feature-adr Step-0 panel. Deterministic. */
export function renderArchCheck(result) {
    const icon = result.signal === 'block' ? '⛔' : result.signal === 'soft-warn' ? '⚠' : '✓';
    const lines = [`${icon} architecture сверка: ${result.signal} (confidence ${result.confidence.toFixed(2)}) — ${result.reason}`];
    for (const d of result.details)
        lines.push(`    • ${d}`);
    return lines.join('\n');
}
/** Load the curated subsystem manifest (`architecture/subsystems.manifest.json`). Impure; null when absent/invalid. */
export function loadSubsystemManifest(repoRoot) {
    try {
        const p = join(repoRoot, 'architecture', 'subsystems.manifest.json');
        if (!existsSync(p))
            return null;
        return JSON.parse(readFileSync(p, 'utf8'));
    }
    catch {
        return null;
    }
}
/**
 * Load the curated product vision (`architecture/vision.md`) — the human-readable compass feature-adr
 * folds into Step 0 (FR-4/FR-5). Thin I/O helper: never throws; returns the text, or null when absent.
 */
export function loadProductVision(repoRoot) {
    try {
        const p = join(repoRoot, 'architecture', 'vision.md');
        return existsSync(p) ? readFileSync(p, 'utf8') : null;
    }
    catch {
        return null;
    }
}
/** Compact human view — the "picture back in your head in 30 seconds" render (FR-2). Deterministic. */
export function renderMapHuman(map) {
    const lines = [];
    lines.push('dz-harness-hub — product map (subsystems = the 5 jobs + foundation/arsenal/ops)');
    lines.push('');
    for (const s of map.subsystems) {
        const jobTag = s.job === null ? '' : ` · job ${s.job}`;
        lines.push(`■ ${s.label}${jobTag}`);
        lines.push(`    ${s.desc}`);
        if (s.packages.length > 0) {
            lines.push(`    packages (${s.packages.length}): ${collapse(s.packages)}`);
        }
        if (s.commands.length > 0) {
            lines.push(`    commands (${s.commands.length}): ${s.commands.join(', ')}`);
        }
    }
    if (map.edges.length > 0) {
        lines.push('');
        lines.push('depends-on (subsystem → subsystem):');
        for (const e of map.edges)
            lines.push(`    ${e.from} → ${e.to}`);
    }
    if (map.unassigned.length > 0) {
        lines.push('');
        lines.push(`⚠ UNASSIGNED (${map.unassigned.length}) — not in subsystems.manifest.json, the product grew:`);
        lines.push(`    ${map.unassigned.join(', ')}`);
        lines.push('    → add each to architecture/subsystems.manifest.json under the right subsystem.');
    }
    return lines.join('\n');
}
/** Collapse a long list of same-prefixed packages (`adapter-x, adapter-y…`) to `adapter-* ×N` for readability. */
function collapse(pkgs) {
    if (pkgs.length <= 6)
        return pkgs.join(', ');
    const groups = new Map();
    const singles = [];
    for (const p of pkgs) {
        const dash = p.indexOf('-');
        const prefix = dash > 0 ? p.slice(0, dash) : p;
        groups.set(prefix, (groups.get(prefix) ?? 0) + 1);
    }
    const parts = [];
    for (const p of pkgs) {
        const dash = p.indexOf('-');
        const prefix = dash > 0 ? p.slice(0, dash) : p;
        if ((groups.get(prefix) ?? 0) >= 4) {
            if (!parts.includes(`${prefix}-* ×${groups.get(prefix)}`))
                parts.push(`${prefix}-* ×${groups.get(prefix)}`);
        }
        else
            singles.push(p);
    }
    return [...parts, ...singles].join(', ');
}
//# sourceMappingURL=architecture.js.map
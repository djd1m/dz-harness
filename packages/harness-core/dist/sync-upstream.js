/**
 * Upstream sync — fetches SKILL.md from origin repos defined in sources.json
 * and reports which skills have upstream changes.
 *
 * @packageDocumentation
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
/** Load sources.json from a skills package directory. */
export function loadSourcesManifest(packageDir) {
    const sourcesPath = join(packageDir, 'sources.json');
    if (!existsSync(sourcesPath))
        return undefined;
    const raw = readFileSync(sourcesPath, 'utf-8');
    const parsed = JSON.parse(raw);
    // Only return if it has the expected origin + skills structure
    if (!parsed.origin || typeof parsed.origin !== 'object')
        return undefined;
    if (!parsed.skills || typeof parsed.skills !== 'object')
        return undefined;
    return parsed;
}
/** Discover all packages with sources.json in the monorepo. */
export function discoverSourcePackages(monorepoRoot) {
    const baseDir = join(monorepoRoot, 'packages', '@dzhechkov');
    if (!existsSync(baseDir))
        return [];
    const results = [];
    for (const entry of readdirSync(baseDir, { withFileTypes: true })) {
        if (!entry.isDirectory())
            continue;
        const pkgDir = join(baseDir, entry.name);
        const manifest = loadSourcesManifest(pkgDir);
        if (manifest) {
            results.push({
                name: entry.name,
                dir: pkgDir,
                origin: manifest.origin,
                skillCount: Object.keys(manifest.skills).length,
            });
        }
    }
    return results;
}
/** Check all packages with sources.json against upstream. */
export async function checkAllUpstream(monorepoRoot) {
    const packages = discoverSourcePackages(monorepoRoot);
    const reports = [];
    for (const pkg of packages) {
        const report = await checkUpstream(pkg.dir);
        if (report)
            reports.push(report);
    }
    return reports;
}
/** Build the raw GitHub URL for a skill's SKILL.md. */
function rawUrl(origin, skillPath) {
    return `https://raw.githubusercontent.com/${origin.repo}/${origin.branch}/${skillPath}`;
}
/** Fetch text content from a URL with timeout. */
async function fetchText(url, timeoutMs = 10000) {
    try {
        const controller = new AbortController();
        const timer = setTimeout(() => { controller.abort(); }, timeoutMs);
        const response = await fetch(url, { signal: controller.signal });
        clearTimeout(timer);
        if (!response.ok) {
            return { ok: false, text: '', error: `HTTP ${response.status}` };
        }
        const text = await response.text();
        return { ok: true, text };
    }
    catch (err) {
        return { ok: false, text: '', error: err instanceof Error ? err.message : String(err) };
    }
}
/** Count non-empty lines in text. */
function lineCount(text) {
    return text.split('\n').length;
}
/**
 * Check all skills in a sources.json manifest against their upstream.
 * Compares line counts as a quick diff indicator (full diff would be too verbose).
 */
export async function checkUpstream(packageDir) {
    const manifest = loadSourcesManifest(packageDir);
    if (!manifest)
        return undefined;
    const results = [];
    for (const [skillId, source] of Object.entries(manifest.skills)) {
        const localSkillMd = join(packageDir, skillId, 'SKILL.md');
        if (!existsSync(localSkillMd)) {
            results.push({ skillId, originPath: source.path, status: 'local-missing' });
            continue;
        }
        const localText = readFileSync(localSkillMd, 'utf-8');
        const url = rawUrl(manifest.origin, source.path);
        const upstream = await fetchText(url);
        if (!upstream.ok) {
            results.push({
                skillId,
                originPath: source.path,
                status: 'fetch-error',
                error: upstream.error,
            });
            continue;
        }
        const localLines = lineCount(localText);
        const upstreamLines = lineCount(upstream.text);
        const changed = localLines !== upstreamLines;
        results.push({
            skillId,
            originPath: source.path,
            status: changed ? 'changed' : 'up-to-date',
            localLines,
            upstreamLines,
        });
    }
    return {
        origin: manifest.origin,
        checked: results.length,
        changed: results.filter((r) => r.status === 'changed').length,
        upToDate: results.filter((r) => r.status === 'up-to-date').length,
        errors: results.filter((r) => r.status === 'fetch-error' || r.status === 'local-missing').length,
        skills: results,
    };
}
//# sourceMappingURL=sync-upstream.js.map
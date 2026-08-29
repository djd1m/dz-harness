/**
 * Upstream sync — fetches SKILL.md from origin repos defined in sources.json
 * and reports which skills have upstream changes.
 *
 * @packageDocumentation
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/** A single skill's source mapping. */
export interface SkillSource {
  readonly path: string;
  readonly version?: string | undefined;
  readonly trust?: string | undefined;
  readonly note?: string | undefined;
}

/** The origin repo metadata. */
export interface OriginMeta {
  readonly repo: string;
  readonly url: string;
  readonly branch: string;
  readonly license: string;
  readonly author: string;
  readonly canonicalized: string;
}

/** The sources.json schema. */
export interface SourcesManifest {
  readonly origin: OriginMeta;
  readonly skills: Record<string, SkillSource>;
}

/** Result of checking one skill against upstream. */
export interface UpstreamCheckResult {
  readonly skillId: string;
  readonly originPath: string;
  readonly status: 'up-to-date' | 'changed' | 'fetch-error' | 'local-missing';
  readonly localLines?: number | undefined;
  readonly upstreamLines?: number | undefined;
  readonly error?: string | undefined;
}

/** Result of a full upstream sync check. */
export interface SyncUpstreamReport {
  readonly origin: OriginMeta;
  readonly checked: number;
  readonly changed: number;
  readonly upToDate: number;
  readonly errors: number;
  readonly skills: readonly UpstreamCheckResult[];
}

/** Load sources.json from a skills package directory. */
export function loadSourcesManifest(packageDir: string): SourcesManifest | undefined {
  const sourcesPath = join(packageDir, 'sources.json');
  if (!existsSync(sourcesPath)) return undefined;
  const raw = readFileSync(sourcesPath, 'utf-8');
  const parsed = JSON.parse(raw) as Record<string, unknown>;
  // Only return if it has the expected origin + skills structure
  if (!parsed.origin || typeof parsed.origin !== 'object') return undefined;
  if (!parsed.skills || typeof parsed.skills !== 'object') return undefined;
  return parsed as unknown as SourcesManifest;
}

/** Info about a package with external sources. */
export interface SourcePackageInfo {
  readonly name: string;
  readonly dir: string;
  readonly origin: OriginMeta;
  readonly skillCount: number;
}

/** Discover all packages with sources.json in the monorepo. */
export function discoverSourcePackages(monorepoRoot: string): SourcePackageInfo[] {
  const baseDir = join(monorepoRoot, 'packages', '@dzhechkov');
  if (!existsSync(baseDir)) return [];

  const results: SourcePackageInfo[] = [];
  for (const entry of readdirSync(baseDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
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
export async function checkAllUpstream(monorepoRoot: string): Promise<SyncUpstreamReport[]> {
  const packages = discoverSourcePackages(monorepoRoot);
  const reports: SyncUpstreamReport[] = [];
  for (const pkg of packages) {
    const report = await checkUpstream(pkg.dir);
    if (report) reports.push(report);
  }
  return reports;
}

/** Build the raw GitHub URL for a skill's SKILL.md. */
function rawUrl(origin: OriginMeta, skillPath: string): string {
  return `https://raw.githubusercontent.com/${origin.repo}/${origin.branch}/${skillPath}`;
}

/** Fetch text content from a URL with timeout. */
async function fetchText(url: string, timeoutMs: number = 10000): Promise<{ ok: boolean; text: string; error?: string }> {
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
  } catch (err) {
    return { ok: false, text: '', error: err instanceof Error ? err.message : String(err) };
  }
}

/** Count non-empty lines in text. */
function lineCount(text: string): number {
  return text.split('\n').length;
}

/**
 * Check all skills in a sources.json manifest against their upstream.
 * Compares line counts as a quick diff indicator (full diff would be too verbose).
 */
export async function checkUpstream(packageDir: string): Promise<SyncUpstreamReport | undefined> {
  const manifest = loadSourcesManifest(packageDir);
  if (!manifest) return undefined;

  const results: UpstreamCheckResult[] = [];

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

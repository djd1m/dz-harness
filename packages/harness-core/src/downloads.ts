/**
 * npm download statistics — fetches weekly download counts for all published packages.
 *
 * @packageDocumentation
 */

/** Download stats for a single package. */
export interface PackageDownloads {
  readonly name: string;
  readonly downloads: number;
  readonly period: string;
  readonly error?: string | undefined;
}

/** Full downloads report. */
export interface DownloadsReport {
  readonly packages: readonly PackageDownloads[];
  readonly totalDownloads: number;
  readonly period: string;
  readonly fetchedAt: string;
}

/** Fetch weekly downloads for a single npm package. */
async function fetchDownloads(name: string): Promise<PackageDownloads> {
  const period = 'last-week';
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => { controller.abort(); }, 10000);
    const url = `https://api.npmjs.org/downloads/point/${period}/${encodeURIComponent(name)}`;
    const resp = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);

    if (!resp.ok) {
      return { name, downloads: 0, period, error: `HTTP ${resp.status}` };
    }

    const data = (await resp.json()) as { downloads: number };
    return { name, downloads: data.downloads, period };
  } catch (err) {
    return { name, downloads: 0, period, error: err instanceof Error ? err.message : String(err) };
  }
}

/** Fetch downloads for all given package names. */
export async function fetchAllDownloads(packageNames: string[]): Promise<DownloadsReport> {
  const results = await Promise.all(packageNames.map(fetchDownloads));
  results.sort((a, b) => b.downloads - a.downloads);
  return {
    packages: results,
    totalDownloads: results.reduce((sum, r) => sum + r.downloads, 0),
    period: 'last-week',
    fetchedAt: new Date().toISOString(),
  };
}

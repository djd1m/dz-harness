import { execSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { closeSync, existsSync, lstatSync, mkdirSync, openSync, readFileSync, readSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { scanSecretsChunked } from './guard.js';
import { NamedLockTimeoutError, withDirLockSync } from './named-lock.js';
import { listPackFiles, listSignablePackFiles } from './sign.js';

export type PackerId = 'npm' | 'pnpm';
export type InventorySource = 'tarball' | 'npm-dry-run' | 'cache' | 'fallback-walk';
export type PackExec = (cmd: string, opts: { readonly cwd: string; readonly timeoutMs: number }) => {
  readonly stdout: string;
  readonly stderr: string;
};
export type ChunkReader = (absolutePath: string, chunkBytes: number) => Iterable<Buffer>;

export interface ListPublishInventoryOptions {
  readonly packer?: PackerId;
  readonly tgzPath?: string;
  readonly exec?: PackExec;
  readonly cacheDir?: string;
  readonly timeoutMs?: number;
}

export interface PublishInventory {
  readonly files: readonly string[];
  readonly source: InventorySource;
  readonly reason?: string;
  readonly packer: PackerId;
  readonly packerVersion: string | null;
}

export interface PublishSecretSeams {
  readonly listInventory?: typeof listPublishInventory;
  readonly reader?: ChunkReader;
  readonly tgzPathFor?: (dir: string) => string | undefined;
}

/** Scan the publish inventory as streams, retaining every coverage gap by name. */
export function gatherPublishSecretFacts(root: string, packageDirs: readonly string[], seams: PublishSecretSeams = {}):
  { readonly secretFindings: readonly { label: string; name: string }[];
    readonly secretScan: { skipped: number; skippedPaths: string[]; scanned: number; inventory: string } } {
  const listInventory = seams.listInventory ?? listPublishInventory;
  const reader = seams.reader ?? readFileChunks;
  const secretFindings: { label: string; name: string }[] = [];
  const skippedPaths: string[] = [];
  let scanned = 0;
  const counts: Record<InventorySource, number> = { tarball: 0, cache: 0, 'npm-dry-run': 0, 'fallback-walk': 0 };
  const fallbacks: string[] = [];
  const skip = (label: string, reason: string): void => { skippedPaths.push(`${label} (${reason})`); };

  for (const dir of packageDirs) {
    const packageRoot = join(root, dir);
    let inventory: PublishInventory;
    try {
      // Lead edit (tsc exactOptionalPropertyTypes): an absent tgzPath must be ABSENT, not `undefined`.
      const tgz = seams.tgzPathFor?.(dir);
      inventory = listInventory(packageRoot, {
        cacheDir: join(root, '.dz', 'cache'),
        ...(tgz !== undefined ? { tgzPath: tgz } : {}),
      });
    } catch { skip(dir, 'inventory unreadable'); continue; }
    counts[inventory.source]++;
    if (inventory.source === 'fallback-walk') fallbacks.push(`${dir} (${inventory.reason ?? 'unknown reason'})`);

    for (const rel of inventory.files) {
      const absolute = join(packageRoot, rel);
      const label = relative(root, absolute).split(sep).join('/');
      try {
        if (!lstatSync(absolute).isFile()) { skip(label, 'not a regular file'); continue; }
        let binary = false;
        let unreadable = false;
        function* textChunks(): Iterable<Buffer> {
          let first = true;
          try {
            for (const chunk of reader(absolute, 1024 * 1024)) {
              if (first && chunk.subarray(0, 8 * 1024).includes(0)) { binary = true; return; }
              first = false;
              yield chunk;
            }
          } catch {
            // End the iterable normally so the scanner can return hits already found.
            unreadable = true;
            skip(label, first ? 'unreadable' : 'unreadable (partial)');
          }
        }
        const findings = scanSecretsChunked(textChunks());
        if (binary) { skip(label, 'binary'); continue; }
        for (const { name } of findings) secretFindings.push({ label, name });
        if (!unreadable) scanned++;
      } catch { skip(label, 'unreadable'); }
    }
  }

  const sources: InventorySource[] = ['tarball', 'cache', 'npm-dry-run', 'fallback-walk'];
  const summary = sources.filter((source) => counts[source] > 0).map((source) => `${source}×${counts[source]}`).join(', ');
  return { secretFindings, secretScan: {
    skipped: skippedPaths.length, skippedPaths, scanned,
    inventory: summary + (fallbacks.length > 0 ? `: ${fallbacks.join(', ')}` : ''),
  } };
}

/** Reject malformed or empty listings so they cannot suppress scanning. */
export function parseNpmPackListing(stdout: string): readonly string[] | null {
  let listing: unknown;
  try {
    listing = JSON.parse(stdout);
  } catch {
    return null;
  }
  if (!Array.isArray(listing) || listing.length === 0) return null;
  const paths = new Set<string>();
  for (const entry of listing) {
    if (entry === null || typeof entry !== 'object' || !Array.isArray(entry.files) || entry.files.length === 0) {
      return null;
    }
    for (const file of entry.files) {
      if (file === null || typeof file !== 'object' || typeof file.path !== 'string' || file.path.length === 0) {
        return null;
      }
      paths.add(file.path);
    }
  }
  return [...paths].sort();
}

/** Versioned key over packer identity, package metadata bytes, and the signable file walk. */
export function computeInventoryCacheKey(packageRoot: string, packer: PackerId, packerVersion: string): string {
  const hash = createHash('sha256');
  hash.update(`pack-inventory/1\n${packer}@${packerVersion}\n`);
  hash.update(readFileSync(join(packageRoot, 'package.json')));
  hash.update('\n');
  try {
    hash.update(readFileSync(join(packageRoot, '.npmignore')));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    hash.update('<absent>');
  }
  hash.update('\n');
  for (const relpath of listSignablePackFiles(packageRoot).sort()) {
    const { size, mtimeMs } = statSync(join(packageRoot, relpath));
    hash.update(`${relpath}\0${size}\0${mtimeMs}\n`);
  }
  return hash.digest('hex');
}

/** Reuse the read buffer, yielding copies that remain valid after subsequent reads. */
export function* readFileChunks(absolutePath: string, chunkBytes = 1024 * 1024): Iterable<Buffer> {
  if (!Number.isSafeInteger(chunkBytes) || chunkBytes <= 0) {
    throw new RangeError('chunkBytes must be a positive safe integer');
  }
  const buffer = Buffer.allocUnsafe(chunkBytes);
  const fd = openSync(absolutePath, 'r');
  try {
    let bytesRead: number;
    while ((bytesRead = readSync(fd, buffer, 0, buffer.length, null)) > 0) {
      yield Buffer.from(buffer.subarray(0, bytesRead));
    }
  } finally {
    closeSync(fd);
  }
}

const defaultExec: PackExec = (cmd, { cwd, timeoutMs }) => ({
  stdout: execSync(cmd, { cwd, timeout: timeoutMs, encoding: 'utf8', stdio: 'pipe' }),
  stderr: '',
});

// Scope memoization to the executor as well as the packer so injected runtimes stay independent.
const versions = new WeakMap<PackExec, Map<PackerId, string | null>>();

function packerVersion(exec: PackExec, packer: PackerId, cwd: string, timeoutMs: number): string | null {
  let memo = versions.get(exec);
  if (!memo) { memo = new Map(); versions.set(exec, memo); }
  if (memo.has(packer)) return memo.get(packer)!;
  let version: string | null = null;
  try {
    const started = Date.now();
    const stdout = exec(`${packer} --version`, { cwd, timeoutMs }).stdout.trim();
    if (Date.now() - started <= timeoutMs && stdout.length > 0) version = stdout;
  } catch { /* Unknown versions must never serve or populate the cache. */ }
  memo.set(packer, version);
  return version;
}

function repositoryRoot(packageRoot: string): string {
  for (let dir = packageRoot; ; dir = dirname(dir)) {
    if (existsSync(join(dir, 'pnpm-workspace.yaml')) || existsSync(join(dir, '.git', 'HEAD'))) return dir;
    if (dirname(dir) === dir) return packageRoot; // standalone package
  }
}

interface CacheEntry {
  readonly key: string;
  readonly files: readonly string[];
  readonly packer: PackerId;
  readonly packerVersion: string;
  readonly writtenAt: string;
}
interface InventoryCache { schema: 1; entries: Record<string, CacheEntry> }

function readCache(path: string): InventoryCache {
  try {
    const cache = JSON.parse(readFileSync(path, 'utf8')) as InventoryCache;
    if (cache?.schema === 1 && cache.entries && typeof cache.entries === 'object' && !Array.isArray(cache.entries)) {
      return cache;
    }
  } catch { /* Missing or unparsable cache is a miss. */ }
  return { schema: 1, entries: {} };
}

/** Listings must stay relative to the package and cannot represent an empty successful scan. */
function inventoryPaths(paths: readonly string[]): string[] | null {
  const out = new Set<string>();
  for (const path of paths) {
    if (typeof path !== 'string') return null;
    const normalized = path.replace(/\\/g, '/').replace(/^\.\//, '');
    if (!normalized || normalized.startsWith('/') || /^[A-Za-z]:/.test(normalized)
      || normalized.split('/').some((part) => part === '..' || part === '' || part === '.')) return null;
    out.add(normalized);
  }
  return out.size > 0 ? [...out].sort() : null;
}

function firstErrorLine(error: unknown): string {
  const stderr = (error as { stderr?: unknown } | null)?.stderr;
  const text = typeof stderr === 'string' || Buffer.isBuffer(stderr) ? stderr.toString().trim() : '';
  return (text || (error instanceof Error ? error.message : String(error))).split(/\r?\n/)[0]!;
}

/** Prefer the supplied artifact, then a tree/version cache, then stdout from the packer. */
export function listPublishInventory(packageRoot: string, opts: ListPublishInventoryOptions = {}): PublishInventory {
  packageRoot = resolve(packageRoot);
  const packer = opts.packer ?? 'npm';
  const exec = opts.exec ?? defaultExec;
  const timeoutMs = opts.timeoutMs ?? 15_000;
  let version: string | null = null;
  const fallback = (reason: string): PublishInventory => {
    const files = listPackFiles(packageRoot);
    if (files.length === 0) throw new Error('inventory unreadable');
    return { files, source: 'fallback-walk', reason, packer, packerVersion: version };
  };

  if (opts.tgzPath !== undefined) {
    try {
      const path = resolve(packageRoot, opts.tgzPath).replace(/'/g, "'\\''");
      const stdout = exec(`tar -tzf '${path}'`, { cwd: packageRoot, timeoutMs }).stdout;
      const entries = stdout.split(/\r?\n/).filter((entry) => entry.length > 0 && !entry.endsWith('/'));
      if (entries.some((entry) => !entry.startsWith('package/'))) throw new Error('unparsable listing');
      const files = inventoryPaths(entries.map((entry) => entry.slice('package/'.length)));
      if (!files) throw new Error('unparsable listing');
      return { files, source: 'tarball', packer, packerVersion: null };
    } catch (error) {
      return fallback(`tarball unreadable: ${firstErrorLine(error)}`);
    }
  }

  version = packerVersion(exec, packer, packageRoot, timeoutMs);
  const root = opts.cacheDir !== undefined ? dirname(dirname(resolve(opts.cacheDir))) : repositoryRoot(packageRoot);
  const cacheDir = opts.cacheDir ?? join(root, '.dz', 'cache');
  const cachePath = join(cacheDir, 'pack-inventory.json');
  const packageDir = relative(root, packageRoot).split(sep).join('/') || '.';
  let key: string | undefined;
  if (version !== null) {
    try { key = computeInventoryCacheKey(packageRoot, packer, version); }
    catch { /* A tree that cannot be keyed must still be listed/scanned. */ }
  }
  if (key !== undefined) {
    try {
      const cached = withDirLockSync(dirname(cacheDir), 'pack-inventory', () => readCache(cachePath).entries[packageDir]);
      const files = cached && Array.isArray(cached.files) ? inventoryPaths(cached.files) : null;
      if (cached?.key === key && cached.packer === packer && cached.packerVersion === version && files) {
        return { files, source: 'cache', packer, packerVersion: version };
      }
    } catch (error) {
      if (!(error instanceof NamedLockTimeoutError)) throw error;
      key = undefined; // A lock timeout is a miss, with no later write in this call.
    }
  }

  let stdout: string;
  const started = Date.now();
  try {
    stdout = exec(`${packer} pack --dry-run --json`, { cwd: packageRoot, timeoutMs }).stdout;
  } catch (error) {
    const timedOut = (error as NodeJS.ErrnoException | null)?.code === 'ETIMEDOUT' || Date.now() - started > timeoutMs;
    return fallback(timedOut ? `packer timeout ${timeoutMs} ms` : `packer failed: ${firstErrorLine(error)}`);
  }
  if (Date.now() - started > timeoutMs) return fallback(`packer timeout ${timeoutMs} ms`);
  const parsed = parseNpmPackListing(stdout);
  const files = parsed && inventoryPaths(parsed);
  if (!files) return fallback('unparsable listing');

  if (key !== undefined && version !== null) {
    const entry: CacheEntry = { key, files, packer, packerVersion: version, writtenAt: new Date().toISOString() };
    try {
      withDirLockSync(dirname(cacheDir), 'pack-inventory', () => {
        // Re-read INSIDE the write transaction, preserving entries another package just added.
        const cache = readCache(cachePath);
        cache.entries[packageDir] = entry;
        mkdirSync(cacheDir, { recursive: true });
        const temp = `${cachePath}.${randomUUID()}.tmp`;
        try {
          writeFileSync(temp, JSON.stringify(cache));
          renameSync(temp, cachePath);
        } finally { rmSync(temp, { force: true }); }
      });
    } catch (error) {
      if (!(error instanceof NamedLockTimeoutError)) throw error;
    }
  }
  return { files, source: 'npm-dry-run', packer, packerVersion: version };
}

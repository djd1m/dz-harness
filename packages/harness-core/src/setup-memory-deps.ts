/** Exact consumer npm persistence and local native readiness. No ancestor/global installs. */
import { existsSync, readFileSync, writeFileSync, rmSync, realpathSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { isDeepStrictEqual } from 'node:util';

export const MEMORY_DEFAULTS = { agentdb: '3.0.0-alpha.20', 'better-sqlite3': '11.10.0' } as const;
const names = Object.keys(MEMORY_DEFAULTS) as (keyof typeof MEMORY_DEFAULTS)[];
const sections = ['dependencies', 'devDependencies', 'optionalDependencies'] as const;
type Json = Record<string, any>;
export interface MemoryDependencyResult {
  readonly ready: boolean;
  readonly changedManifest: boolean;
  readonly changedLock: boolean;
  readonly detail: string;
}
const object = (value: unknown): value is Json => value !== null && typeof value === 'object' && !Array.isArray(value);
const same = (a: unknown, b: unknown) => isDeepStrictEqual(a, b);
const bytes = (path: string) => existsSync(path) ? readFileSync(path, 'utf8') : null;
function json(path: string): Json {
  const value: unknown = JSON.parse(readFileSync(path, 'utf8'));
  if (!object(value)) throw Error(`${path}: expected a JSON object`);
  return value;
}
export function supportedMemoryVersion(name: keyof typeof MEMORY_DEFAULTS, value: unknown): value is string {
  const number = '(?:0|[1-9][0-9]*)';
  return typeof value === 'string' && new RegExp(name === 'agentdb'
    ? `^(?:3\\.${number}\\.${number}|3\\.0\\.0-alpha\\.${number})$`
    : `^11\\.${number}\\.${number}$`).test(value);
}
function installed(root: string, name: string): string | null {
  const path = join(root, 'node_modules', name, 'package.json');
  if (!existsSync(path)) return null;
  const pkg = json(path);
  if (pkg['name'] !== name || typeof pkg['version'] !== 'string') throw Error(`${name}: malformed installed package metadata`);
  return pkg['version'];
}
function lockVersion(lock: Json | null, name: string): string | null {
  const item = lock?.['packages']?.[`node_modules/${name}`] ?? lock?.['dependencies']?.[name];
  return item?.version ?? null;
}
function selectVersions(root: string, pkg: Json, lock: Json | null): Record<string, string> {
  for (const section of [...sections, 'peerDependencies']) {
    if (pkg[section] !== undefined && !object(pkg[section])) throw Error(`package.json: malformed ${section}`);
  }
  const versions: Record<string, string> = {};
  for (const name of names) {
    if (Object.hasOwn(pkg['peerDependencies'] ?? {}, name)) throw Error(`${name}: peer declaration is outside exact persistence repair`);
    const declared = sections.flatMap(section => Object.hasOwn(pkg[section] ?? {}, name) ? [pkg[section][name]] : []);
    if (declared.some(value => !supportedMemoryVersion(name, value)) || new Set(declared).size > 1) throw Error(`${name}: conflicting or non-exact/unsupported saved declaration; original files preserved`);
    if (declared.length) { versions[name] = declared[0]; continue; }
    const local = installed(root, name), locked = lockVersion(lock, name);
    if (local !== null) {
      if (!supportedMemoryVersion(name, local)) throw Error(`${name}: unsupported installed-only version ${local}`);
      if (locked !== null && locked !== local) throw Error(`${name}: installed-only and orphan lock versions conflict`);
      versions[name] = local;
    } else if (locked !== null) throw Error(`${name}: incomplete legacy lock-only state; original files preserved`);
    else versions[name] = MEMORY_DEFAULTS[name];
  }
  return versions;
}
function persisted(pkg: Json, lock: Json | null, versions: Record<string, string>): boolean {
  return names.every(name => pkg['devDependencies']?.[name] === versions[name]
    && !Object.hasOwn(pkg['dependencies'] ?? {}, name) && !Object.hasOwn(pkg['optionalDependencies'] ?? {}, name)
    && lockVersion(lock, name) === versions[name] && lock?.['packages']?.['']?.['devDependencies']?.[name] === versions[name]
    && !Object.hasOwn(lock?.['packages']?.['']?.['dependencies'] ?? {}, name)
    && !Object.hasOwn(lock?.['packages']?.['']?.['optionalDependencies'] ?? {}, name));
}
function protectedManifest(pkg: Json): Json {
  const copy: Json = JSON.parse(JSON.stringify(pkg));
  for (const section of sections) {
    if (!object(copy[section])) continue;
    for (const name of names) delete copy[section][name];
    if (!Object.keys(copy[section]).length) delete copy[section];
  }
  return copy;
}
function resolutions(lock: Json | null): Record<string, string> {
  const result: Record<string, string> = {};
  if (object(lock?.['packages'])) for (const [path, item] of Object.entries(lock['packages'])) {
    if (path && !names.some(name => path === `node_modules/${name}`) && object(item) && typeof item['version'] === 'string') result[path] = item['version'];
  }
  else if (object(lock?.['dependencies'])) for (const [name, item] of Object.entries(lock['dependencies'])) {
    if (!names.includes(name as keyof typeof MEMORY_DEFAULTS) && object(item) && typeof item['version'] === 'string') result[`node_modules/${name}`] = item['version'];
  }
  return result;
}
function npm(root: string, args: string[]): void {
  execFileSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', args, {
    cwd: root, timeout: 300000, maxBuffer: 8 * 1024 * 1024, stdio: 'pipe', shell: process.platform === 'win32',
  });
}
export function probeMemoryNative(root: string): string | null {
  try {
    for (const name of names) if (installed(root, name) === null) return `${name}: local package missing`;
    const script = `const {createRequire}=require('node:module'),fs=require('node:fs'),path=require('node:path');
const root=process.argv[1],r=createRequire(path.join(root,'package.json')),local=fs.realpathSync(path.join(root,'node_modules'));
const resolved=fs.realpathSync(r.resolve('better-sqlite3')); if(path.relative(local,resolved).startsWith('..'))throw Error('native module resolved outside project');
const Sqlite=r('better-sqlite3'),db=new Sqlite(':memory:');try{if(db.prepare('SELECT 42 AS answer').get().answer!==42)throw Error('native SELECT failed');}finally{db.close();}
process.stdout.write('native-sql-ready');`;
    const output = execFileSync(process.execPath, ['-e', script, realpathSync(root)], { cwd: root, timeout: 60000, maxBuffer: 4 * 1024 * 1024, stdio: 'pipe', encoding: 'utf8' });
    return output === 'native-sql-ready' ? null : 'native SQL readiness stdout not established';
  } catch (error) { return `native SQLite unavailable: ${error instanceof Error ? error.message : String(error)}`; }
}
export function reconcileMemoryDependencies(projectRoot: string, repair = true): MemoryDependencyResult {
  const pkgPath = join(projectRoot, 'package.json'), lockPath = join(projectRoot, 'package-lock.json');
  const beforePkg = bytes(pkgPath), beforeLock = bytes(lockPath);
  let stage = 'validate', repaired = false;
  const result = (ready: boolean, detail: string): MemoryDependencyResult => ({ ready, changedManifest: bytes(pkgPath) !== beforePkg, changedLock: bytes(lockPath) !== beforeLock, detail });
  try {
    const pkg = beforePkg === null ? { name: 'dz-harness-project', private: true, version: '0.0.0' } : json(pkgPath);
    const lock = beforeLock === null ? null : json(lockPath);
    const versions = selectVersions(projectRoot, pkg, lock);
    const localCurrent = names.every(name => installed(projectRoot, name) === versions[name]);
    const savedCurrent = persisted(pkg, lock, versions);
    if (!repair && (!savedCurrent || !localCurrent)) return result(false, 'saved/local dependency state is inconsistent; run setup to repair exact devDependencies');
    const nativeBefore = localCurrent ? probeMemoryNative(projectRoot) : 'local package versions need repair';
    if (!repair && nativeBefore) return result(false, nativeBefore);
    if (!savedCurrent || !localCurrent) {
      stage = 'npm persistence repair';
      const protectedFields = protectedManifest(pkg), protectedLock = resolutions(lock);
      try {
        // npm can retain an existing optional declaration despite --save-dev. Selection and
        // conflicts were validated above; normalize ONLY the two memory declarations first.
        const canonical: Json = JSON.parse(JSON.stringify(pkg));
        for (const section of sections) {
          if (!object(canonical[section])) continue;
          let removed = false;
          for (const name of names) if (Object.hasOwn(canonical[section], name)) { delete canonical[section][name]; removed = true; }
          if (removed && !Object.keys(canonical[section]).length) delete canonical[section];
        }
        canonical['devDependencies'] = { ...(canonical['devDependencies'] ?? {}), ...versions };
        if (beforePkg === null || !same(canonical, pkg)) writeFileSync(pkgPath, JSON.stringify(canonical, null, 2) + '\n');
        npm(projectRoot, ['install', ...names.map(name => `${name}@${versions[name]}`), '--save-dev', '--save-exact', '--no-audit', '--no-fund', '--loglevel=error']);
        const after = json(pkgPath), afterLock = json(lockPath), afterResolutions = resolutions(afterLock);
        if (!same(protectedManifest(after), protectedFields) || Object.entries(protectedLock).some(([path, version]) => afterResolutions[path] !== version)) {
          throw Error('npm changed protected unrelated manifest fields/lock resolutions');
        }
        if (!persisted(after, afterLock, versions) || !names.every(name => installed(projectRoot, name) === versions[name])) throw Error('npm did not establish requested exact manifest/lock/local versions');
        repaired = true;
      } catch (error) {
        // npm is not a whole-project transaction. Restore only protected manifest/lock files.
        let changedProtected = false;
        try {
          const after = existsSync(pkgPath) ? json(pkgPath) : {};
          const afterResolutions = resolutions(existsSync(lockPath) ? json(lockPath) : null);
          changedProtected = !same(protectedManifest(after), protectedFields) || Object.entries(protectedLock).some(([path, version]) => afterResolutions[path] !== version);
        } catch { changedProtected = true; }
        if (changedProtected) {
          if (beforePkg === null) rmSync(pkgPath, { force: true }); else writeFileSync(pkgPath, beforePkg);
          if (beforeLock === null) rmSync(lockPath, { force: true }); else writeFileSync(lockPath, beforeLock);
          throw Error(`protected manifest/lock restored after npm changed unrelated state; local modules may be incomplete: ${String(error)}`);
        }
        throw error;
      }
    } else if (repair && nativeBefore) {
      stage = 'native rebuild'; npm(projectRoot, ['rebuild', 'better-sqlite3', '--no-audit', '--no-fund', '--loglevel=error']); repaired = true;
    }
    stage = 'native SQL probe';
    const nativeError = probeMemoryNative(projectRoot);
    if (nativeError) return result(false, `INCOMPLETE ${stage}: ${nativeError}; package.json ${bytes(pkgPath) === beforePkg ? 'unchanged' : 'changed'}, package-lock.json ${bytes(lockPath) === beforeLock ? 'unchanged' : 'changed'}`);
    return result(true, `${repaired ? 'repaired exact devDependencies/local readiness' : 'already current exact devDependencies and native SQLite'}; package.json ${bytes(pkgPath) === beforePkg ? 'unchanged' : 'changed'}, package-lock.json ${bytes(lockPath) === beforeLock ? 'unchanged' : 'changed'}; ${names.map(name => `${name}@${versions[name]}`).join(', ')}; native SELECT 42 passed`);
  } catch (error) {
    return result(false, `INCOMPLETE ${stage}: ${error instanceof Error ? error.message : String(error)}; package.json ${bytes(pkgPath) === beforePkg ? 'unchanged' : 'changed'}, package-lock.json ${bytes(lockPath) === beforeLock ? 'unchanged' : 'changed'}`);
  }
}

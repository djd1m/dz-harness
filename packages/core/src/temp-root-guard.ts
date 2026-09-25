import * as nodeFs from 'node:fs';
import { dirname, join, resolve } from 'node:path';

export type HazardKind = 'dz-store' | 'git-empty' | 'git-broken' | 'git-real' | 'unreadable';

export interface Hazard {
  readonly path: string;
  readonly kind: HazardKind;
  readonly consequence: string;
}

export interface TempRootFs {
  realpathSync(path: string): string;
  readdirSync(path: string): readonly string[];
  lstatSync(path: string): { isDirectory(): boolean };
  readFileSync(path: string, encoding: 'utf8'): string;
}

const consequences: Record<Exclude<HazardKind, 'unreadable'>, string> = {
  'dz-store': 'Tests inherit this store and locks, and the destructive-guard helper becomes active for every directory below this ancestor.',
  'git-empty': 'An empty .git makes dz adopt this ancestor as the project root and seed a shared .dz store.',
  'git-broken': 'A broken .git makes dz adopt this ancestor as the project root and seed a shared .dz store.',
  'git-real': 'Tests would anchor to a real repository and inherit its store and locks.',
};

function unreadable(path: string, error: unknown): Hazard {
  const reason = (error instanceof Error ? error.message : String(error)).split(/\r?\n/u, 1)[0];
  return { path, kind: 'unreadable', consequence: `This path cannot be checked for inherited project state (${reason}).` };
}

function scanTempRoot(tmp: string, fs: TempRootFs): { hazards: Hazard[]; realpath: string; count: number } {
  let realpath: string;
  try {
    realpath = fs.realpathSync(tmp);
  } catch (error) {
    return { hazards: [unreadable(resolve(tmp), error)], realpath: resolve(tmp), count: 0 };
  }
  const hazards: Hazard[] = [];
  let count = 0;
  for (let node = realpath; ; node = dirname(node)) {
    count += 1;
    let entries: readonly string[] = [];
    try {
      entries = fs.readdirSync(node);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') hazards.push(unreadable(node, error));
    }
    for (const name of ['.dz', '.git']) {
      if (!entries.includes(name)) continue;
      const path = join(node, name);
      try {
        const directory = fs.lstatSync(path).isDirectory();
        let kind: Exclude<HazardKind, 'unreadable'>;
        if (name === '.dz') {
          if (!directory) continue;
          kind = 'dz-store';
        } else if (directory) {
          const gitEntries = fs.readdirSync(path);
          kind = gitEntries.length === 0 ? 'git-empty' : gitEntries.includes('HEAD') ? 'git-real' : 'git-broken';
        } else {
          kind = fs.readFileSync(path, 'utf8').startsWith('gitdir:') ? 'git-real' : 'git-broken';
        }
        hazards.push({ path, kind, consequence: consequences[kind] });
      } catch (error) {
        // An entry seen by readdir but no longer inspectable is not established clean.
        hazards.push(unreadable(path, error));
      }
    }
    if (dirname(node) === node) break;
  }
  return { hazards, realpath, count };
}

export function findTempRootHazards(tmp: string, fs: TempRootFs = nodeFs): readonly Hazard[] {
  return scanTempRoot(tmp, fs).hazards;
}

export function assertTempRootClean(
  tmp: string,
  fs: TempRootFs = nodeFs,
  log: (message: string) => void = console.error,
): void {
  const { hazards, realpath, count } = scanTempRoot(tmp, fs);
  if (hazards.length > 0) {
    log(`dz tmp-root: REFUSED — ${hazards[0]!.path} — ${hazards[0]!.kind} (${hazards.length} hazard(s)); a test runner may report this as "No test files found" — it is this refusal, not your filter. remedy: move the entry aside or point TMPDIR at a clean root — this guard never deletes anything`);
    throw new Error([
      'dz tmp-root: refused — unsafe temp-root ancestor chain',
      ...hazards.map(({ path, kind, consequence }) => `${path} — ${kind} — ${consequence}`),
      'remedy: move the entry aside or point TMPDIR at a clean root — this guard never deletes anything',
    ].join('\n'));
  }
  log(`dz tmp-root: clean — ${count} ancestor(s) of ${realpath} checked`);
}

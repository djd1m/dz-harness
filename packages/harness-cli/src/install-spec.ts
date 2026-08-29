/**
 * `dz install` argument resolution — feature install-spec-honesty (backlog 43a52cf2 + c999786b).
 *
 * cmdInstall used to splice the RAW argument into `join(projectRoot, 'node_modules', pkg)`.
 * MEASURED, five broken forms: an absolute path (path.join CONCATENATES an absolute segment —
 * `/proj/node_modules/home/dz/pkgs/...`); a versioned spec `@dzhechkov/health-advisor@1.9.0`
 * (the WORST: `npm install` SUCCEEDS and mutates the project's package.json, then dz dies on an
 * invented path with exit 1 — and the versioned form is exactly what the npm-lag README
 * prescribes); a tarball `pack-1.0.0.tgz`; `github:user/repo`; an alias `ha@npm:...`.
 *
 * The cure is a PURE resolver that runs BEFORE any npm process: every accepted form yields the
 * npm spec AND the node_modules directory name it will land under; everything else is a NAMED
 * refusal carrying the working two-command form. A spec whose landing dir cannot be established
 * must never reach npm — that is what made the versioned failure mutate state and then die.
 */

export interface InstallSpecProbe {
  /** Does `path` exist as a regular file? */
  readonly isFile: (path: string) => boolean;
  /** Does `path` exist as a directory? */
  readonly isDir: (path: string) => boolean;
  /** `name` from `package/package.json` inside a tarball, or null (unreadable/absent). */
  readonly readTarballName: (path: string) => string | null;
  /** `name` from `<dir>/package.json`, or null. */
  readonly readDirName: (path: string) => string | null;
}

export type InstallSpecResolution =
  | { readonly kind: 'name' | 'versioned' | 'alias' | 'tarball' | 'dir'; readonly npmSpec: string; readonly dirName: string }
  | { readonly kind: 'refused'; readonly reason: string; readonly hint: string };

const BARE_NAME_RE = /^(@[a-z0-9-~][a-z0-9-._~]*\/)?[a-z0-9-~][a-z0-9-._~]*$/;

/** The two-command fallback that always works, named in every refusal (43a52cf2's own ask). */
function twoCommandHint(raw: string): string {
  return `working form: npm install ${raw} --save-dev && dz init --skills-dir node_modules/<installed-package-name>`;
}

export function resolveInstallSpec(raw: string, resolveAgainstCwd: (p: string) => string, probe: InstallSpecProbe): InstallSpecResolution {
  const spec = raw.trim();
  if (spec === '') return { kind: 'refused', reason: 'empty spec', hint: 'dz install <package|package@version|path/to.tgz|path/to/dir>' };

  // Path forms first — a path is never an npm name. Absolute, explicit-relative, or an existing
  // .tgz/.tar.gz/.dir anywhere: the OLD code spliced these into node_modules verbatim.
  const looksPathy = spec.startsWith('/') || spec.startsWith('./') || spec.startsWith('../') || /\.(tgz|tar\.gz)$/.test(spec);
  if (looksPathy) {
    const abs = resolveAgainstCwd(spec);
    if (/\.(tgz|tar\.gz)$/.test(spec)) {
      if (!probe.isFile(abs)) return { kind: 'refused', reason: `tarball not found: ${abs}`, hint: twoCommandHint(spec) };
      const name = probe.readTarballName(abs);
      if (name === null) return { kind: 'refused', reason: `cannot read package/package.json name from ${abs}`, hint: twoCommandHint(spec) };
      return { kind: 'tarball', npmSpec: abs, dirName: name };
    }
    if (probe.isDir(abs)) {
      const name = probe.readDirName(abs);
      if (name === null) return { kind: 'refused', reason: `${abs} has no readable package.json name`, hint: twoCommandHint(spec) };
      return { kind: 'dir', npmSpec: abs, dirName: name };
    }
    return { kind: 'refused', reason: `path does not exist: ${abs}`, hint: twoCommandHint(spec) };
  }

  // git/github/url specs: the landing dir is not cheaply establishable — refuse with the cure.
  if (/^(github:|git\+|git:|https?:\/\/)/.test(spec)) {
    return { kind: 'refused', reason: `git/url specs are not resolvable to a node_modules dir up front (${spec})`, hint: twoCommandHint(spec) };
  }

  // alias@npm:real[@version] — installs under the ALIAS name.
  const alias = /^([^@][^@]*|@[^/]+\/[^@]+)@npm:(.+)$/.exec(spec);
  if (alias !== null) {
    return { kind: 'alias', npmSpec: spec, dirName: alias[1] as string };
  }

  if (BARE_NAME_RE.test(spec)) return { kind: 'name', npmSpec: spec, dirName: spec };

  // name@version / @scope/name@version — the dir is the name WITHOUT the version.
  const at = spec.lastIndexOf('@');
  if (at > 0) {
    const name = spec.slice(0, at);
    const version = spec.slice(at + 1);
    if (BARE_NAME_RE.test(name) && version !== '' && !version.includes('/')) {
      return { kind: 'versioned', npmSpec: spec, dirName: name };
    }
  }

  return { kind: 'refused', reason: `unrecognized install spec: ${spec}`, hint: twoCommandHint(spec) };
}

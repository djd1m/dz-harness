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
export type InstallSpecResolution = {
    readonly kind: 'name' | 'versioned' | 'alias' | 'tarball' | 'dir';
    readonly npmSpec: string;
    readonly dirName: string;
} | {
    readonly kind: 'refused';
    readonly reason: string;
    readonly hint: string;
};
export declare function resolveInstallSpec(raw: string, resolveAgainstCwd: (p: string) => string, probe: InstallSpecProbe): InstallSpecResolution;
//# sourceMappingURL=install-spec.d.ts.map
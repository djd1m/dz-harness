/**
 * Packed-install smoke — feature `publish-sibling-drift-gate`, ADR-001 (Decision 2).
 *
 * `dz release`'s existing smoke gate boots a package's bin straight from the WORKSPACE — its
 * sibling `workspace:*` deps resolve via pnpm's workspace links, never through a real install.
 * That makes the whole class of "published tarball missing an export" incidents invisible by
 * construction (Alternative Б1, rejected). This module plans and judges the alternative
 * (Б2, accepted): pack every package in the batch, `npm install` the resulting tarballs together
 * into a CLEAN directory — siblings OUTSIDE the batch resolve from the registry, exactly like a
 * fresh user's install — then boot every bin with `--version` and require exit 0 AND non-empty
 * stdout (the "publisher output is not a receipt" lesson: a bin that boots but prints nothing has
 * not proven it works).
 *
 * Pure by construction (NFR-2): `planPackedInstallSmoke` only builds command STRINGS from
 * injected package/bin facts and paths — it never spawns anything. `judgePackedInstallSmoke`
 * only classifies injected execution records. The CLI (`cmdPublish`, `cmdRelease`) is the single
 * executor, sharing this same plan/judge pair so both doors apply the identical rule.
 *
 * @packageDocumentation
 */
export type PackedInstallStepKind = 'pack' | 'install' | 'bin-exists' | 'bin-version';
/** One concrete step — data, not action (mirrors release.ts's GateStep idiom). */
export interface PackedInstallStep {
    readonly id: string;
    readonly kind: PackedInstallStepKind;
    readonly cmd: string;
    readonly cwd: string;
    readonly timeoutMs: number;
    /** Present for 'pack' and 'bin-version' steps. */
    readonly pkg?: string;
    /** Present for 'bin-version' steps only. */
    readonly binName?: string;
}
export interface PackedInstallPackageSpec {
    readonly name: string;
    /** Absolute source directory to `npm pack`. */
    readonly dir: string;
    readonly version: string;
}
export interface PackedInstallBinSpec {
    readonly pkg: string;
    readonly binName: string;
    /** Path to the executable relative to the package's OWN directory (as it ships), e.g. "dist/bin.js". */
    readonly relPath: string;
}
export interface PlanPackedInstallSmokeOptions {
    /** Every package to pack — the full batch, since a bin-less sibling can still be a dependency. */
    readonly packages: readonly PackedInstallPackageSpec[];
    /** Bins to boot after install (typically the subset of `packages` that declare one). */
    readonly bins: readonly PackedInstallBinSpec[];
    /** Directory `npm pack --pack-destination` writes tarballs into. */
    readonly packDir: string;
    /** Fresh, empty directory `npm install` runs in — outside-batch siblings resolve from the registry here. */
    readonly installDir: string;
    readonly packTimeoutMs?: number;
    readonly installTimeoutMs?: number;
    readonly versionTimeoutMs?: number;
    /**
     * AM-1 (feature publish-sibling-drift-gate): the caller (`publishPackages`'s `packedTransport`)
     * already packed each artifact ONCE, post-bump — a SECOND, different `npm pack` here would smoke
     * bytes other than the ones about to be published, reintroducing the exact defect this amendment
     * closes. `true` skips planning any 'pack' step; `tarballs` is still populated with the SAME
     * deterministic `packedTarballName(name, version)` path under `packDir` — the caller is
     * responsible for having written the tarball there already (`packages[].dir` is unused in this
     * mode and may be any string).
     */
    readonly skipPack?: boolean;
}
export interface PackedInstallPlan {
    readonly steps: readonly PackedInstallStep[];
    /** Absolute tarball paths the install step references, in package order. */
    readonly tarballs: readonly string[];
}
/** Mirror npm's own tarball naming: `@scope/name@1.2.3` -> `scope-name-1.2.3.tgz`. */
export declare function packedTarballName(name: string, version: string): string;
export declare function planPackedInstallSmoke(opts: PlanPackedInstallSmokeOptions): PackedInstallPlan;
export interface PackedInstallExecution {
    readonly stepId: string;
    readonly exitCode: number;
    readonly stdout: string;
    readonly stderr: string;
    readonly timedOut?: boolean;
}
export interface PackedInstallBinVerdict {
    readonly pkg: string;
    readonly binName: string;
    readonly ok: boolean;
    readonly stdout: string;
    /** First 3 non-empty lines of stderr (falling back to stdout), present only when !ok. */
    readonly detail?: string;
}
export interface PackedInstallVerdict {
    readonly ok: boolean;
    readonly packOk: boolean;
    readonly installOk: boolean;
    /** First failure's detail, from whichever of pack/install failed first. */
    readonly failureDetail?: string;
    readonly bins: readonly PackedInstallBinVerdict[];
}
/**
 * Classify a plan's executions. `plan` may be the `{ steps }` half of {@link PackedInstallPlan}.
 * A missing execution for a planned step is a FAILURE (an under-executed plan cannot pass) —
 * never treated as "nothing to judge, so it passed".
 */
export declare function judgePackedInstallSmoke(plan: {
    readonly steps: readonly PackedInstallStep[];
}, executions: readonly PackedInstallExecution[]): PackedInstallVerdict;
//# sourceMappingURL=packed-install-smoke.d.ts.map
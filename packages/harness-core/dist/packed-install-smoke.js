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
import { join } from 'node:path';
const DEFAULT_PACK_TIMEOUT_MS = 60_000;
const DEFAULT_INSTALL_TIMEOUT_MS = 180_000;
const DEFAULT_VERSION_TIMEOUT_MS = 30_000;
/** Mirror npm's own tarball naming: `@scope/name@1.2.3` -> `scope-name-1.2.3.tgz`. */
export function packedTarballName(name, version) {
    return `${name.replace(/^@/, '').replace(/\//g, '-')}-${version}.tgz`;
}
export function planPackedInstallSmoke(opts) {
    const packTimeoutMs = opts.packTimeoutMs ?? DEFAULT_PACK_TIMEOUT_MS;
    const installTimeoutMs = opts.installTimeoutMs ?? DEFAULT_INSTALL_TIMEOUT_MS;
    const versionTimeoutMs = opts.versionTimeoutMs ?? DEFAULT_VERSION_TIMEOUT_MS;
    const steps = [];
    const tarballs = [];
    for (const pkg of opts.packages) {
        const tgz = join(opts.packDir, packedTarballName(pkg.name, pkg.version));
        tarballs.push(tgz);
        if (opts.skipPack === true)
            continue; // AM-1: already packed by the caller — see skipPack's doc
        steps.push({
            id: `pack:${pkg.name}`,
            kind: 'pack',
            cmd: `npm pack ${JSON.stringify(pkg.dir)} --pack-destination ${JSON.stringify(opts.packDir)}`,
            cwd: pkg.dir,
            timeoutMs: packTimeoutMs,
            pkg: pkg.name,
        });
    }
    if (tarballs.length > 0) {
        steps.push({
            id: 'install',
            kind: 'install',
            cmd: `npm install ${tarballs.map((t) => JSON.stringify(t)).join(' ')} --no-audit --no-fund`,
            cwd: opts.installDir,
            timeoutMs: installTimeoutMs,
        });
    }
    for (const bin of opts.bins) {
        const absBinPath = join(opts.installDir, 'node_modules', bin.pkg, bin.relPath);
        // AM-8: a manifest can declare a `bin` whose target file does not exist (never built, moved,
        // typo'd) — the OLD `cli.ts` bin-collection step silently DROPPED such a bin before this
        // amendment, which read as "n/a: nothing to smoke" (or even skipped the whole gate when it
        // was the batch's only bin). `test -f` is a dedicated, portable existence probe RUN AFTER THE
        // REAL INSTALL — pass/fail here is judged into a specific, honest message
        // ("declared bin missing after packed install") instead of being folded into whatever
        // `node <bin> --version` happens to print for a missing file (a generic MODULE_NOT_FOUND).
        steps.push({
            id: `bin-exists:${bin.pkg}:${bin.binName}`,
            kind: 'bin-exists',
            cmd: `test -f ${JSON.stringify(absBinPath)}`,
            cwd: opts.installDir,
            timeoutMs: versionTimeoutMs,
            pkg: bin.pkg,
            binName: bin.binName,
        });
        steps.push({
            id: `bin:${bin.pkg}:${bin.binName}`,
            kind: 'bin-version',
            cmd: `node ${JSON.stringify(absBinPath)} --version`,
            cwd: opts.installDir,
            timeoutMs: versionTimeoutMs,
            pkg: bin.pkg,
            binName: bin.binName,
        });
    }
    return { steps, tarballs };
}
/**
 * First 3 lines (FR-3), EXCEPT when they are pure source context. MEASURED 2026-09-13 reproducing
 * the exact incident this gate targets — a bin whose `import` names a missing export — Node
 * prints the location, the offending source line and a caret BEFORE the actual
 * `SyntaxError: … does not provide an export named …` message (identically for a plain uncaught
 * `throw`: file:line / code / `^` / blank / `Error: …`). A literal first-3-lines slice therefore
 * shows three lines of code and caret marks and never the reason — useless for the incident it
 * exists to surface. When stderr contains a line that LOOKS like an error header
 * (`SomethingError: …` or bare `Error: …`), the snippet starts there instead.
 */
function firstLines(text, n) {
    const lines = text.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.length > 0);
    if (lines.length === 0)
        return '(no output)';
    const errorHeaderAt = lines.findIndex((l) => /^[A-Za-z][A-Za-z0-9_]*Error:|^Error\b/.test(l));
    const start = errorHeaderAt >= 0 ? errorHeaderAt : 0;
    return lines.slice(start, start + n).join(' | ');
}
const NO_EXECUTION_RECORD = '(no execution record — under-executed plan)';
function stepOk(exec) {
    return exec !== undefined && exec.timedOut !== true && exec.exitCode === 0;
}
function stepDetail(exec) {
    if (exec === undefined)
        return NO_EXECUTION_RECORD;
    if (exec.timedOut === true)
        return 'timed out';
    return firstLines(exec.stderr || exec.stdout, 3);
}
/**
 * Classify a plan's executions. `plan` may be the `{ steps }` half of {@link PackedInstallPlan}.
 * A missing execution for a planned step is a FAILURE (an under-executed plan cannot pass) —
 * never treated as "nothing to judge, so it passed".
 */
export function judgePackedInstallSmoke(plan, executions) {
    const byId = new Map(executions.map((e) => [e.stepId, e]));
    let packOk = true;
    let failureDetail;
    for (const step of plan.steps.filter((s) => s.kind === 'pack')) {
        const exec = byId.get(step.id);
        if (!stepOk(exec)) {
            packOk = false;
            failureDetail ??= stepDetail(exec);
        }
    }
    let installOk = true;
    const installStep = plan.steps.find((s) => s.kind === 'install');
    if (installStep !== undefined) {
        const exec = byId.get(installStep.id);
        if (!stepOk(exec)) {
            installOk = false;
            failureDetail ??= stepDetail(exec);
        }
    }
    const bins = plan.steps
        .filter((s) => s.kind === 'bin-version')
        .map((step) => {
        const exec = byId.get(step.id);
        if (!packOk || !installOk) {
            // Pack/install already failed for the whole batch — the generic pack/install detail is
            // more informative than a bin-specific message about a step that never had a chance to run.
            return { pkg: step.pkg, binName: step.binName, ok: false, stdout: '', detail: stepDetail(exec) };
        }
        // AM-8: a declared bin missing from the REAL post-install tree is its own failure class —
        // checked and reported BEFORE the generic stdout rule below, whose message ("empty stdout")
        // would otherwise misdescribe a file that was never there to boot at all.
        const existsStep = plan.steps.find((s) => s.kind === 'bin-exists' && s.pkg === step.pkg && s.binName === step.binName);
        if (existsStep !== undefined && !stepOk(byId.get(existsStep.id))) {
            return { pkg: step.pkg, binName: step.binName, ok: false, stdout: '', detail: 'declared bin missing after packed install' };
        }
        // FR-3 / lesson "publisher output is not a receipt": exit 0 alone is not enough — the
        // version output must be non-empty, or a bin that silently no-ops would read as healthy.
        const ok = stepOk(exec) && (exec?.stdout ?? '').trim() !== '';
        return {
            pkg: step.pkg,
            binName: step.binName,
            ok,
            stdout: exec?.stdout ?? '',
            ...(ok ? {} : { detail: exec !== undefined && stepOk(exec) ? '(exit 0 but empty stdout)' : stepDetail(exec) }),
        };
    });
    const ok = packOk && installOk && bins.every((b) => b.ok);
    return { ok, packOk, installOk, ...(failureDetail !== undefined ? { failureDetail } : {}), bins };
}
//# sourceMappingURL=packed-install-smoke.js.map
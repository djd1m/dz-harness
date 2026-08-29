/**
 * Verified-release engine (`dz release`, feature release-verified, ADR-001).
 *
 * VERIFY phase of the DETECT→VERIFY→ANALYZE→RELEASE conveyor (grounded in open-claude-code
 * ADR-003 nightly-verified-release): four HARD gates — tests / audit / syntax / smoke-boot —
 * planned and classified here as PURE functions over injected data, executed only by the CLI.
 *
 * Architecture contract (ADR-001, D1–D4):
 * - NO `node:child_process` anywhere in this file — the engine plans commands as DATA
 *   (`GateStep.cmd` strings a test can assert, `publishArgv` precedent) and classifies
 *   injected execution results. The CLI (`cmdRelease`) is the single executor.
 * - The only fs access lives in {@link collectPackageFacts} (readFileSync/readdirSync/statSync,
 *   `discoverPackages` precedent); everything downstream of the facts is pure.
 * - The existing publish gates (guard, claim-check, signature, provenance, files-whitelist)
 *   are NEVER duplicated here: a green release hands off to the untouched `dz publish`,
 *   and an anti-duplication test greps every planned command for gate keywords.
 * - Fail-closed: any `fail` ⇒ `publishAction: 'blocked'`; a planned-but-unexecuted step is a
 *   FAILURE (an under-executed plan can never pass); all-skip is NOT `proceed` (nothing
 *   verified is not verified).
 *
 * @packageDocumentation
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { discoverPackages, orderByDependencies } from './publish.js';
/** Order the CLI executes and the verdict reports gates in. */
export const RELEASE_GATE_ORDER = ['tests', 'audit', 'syntax', 'smoke'];
/** Default per-step timeouts (NFR-4: a hung child is a classified failure, not a hung release). */
export const RELEASE_TIMEOUTS = {
    testMs: 600_000,
    auditMs: 120_000,
    syntaxMs: 30_000,
    smokeMs: 20_000,
};
/* ------------------------------------------------------------------ */
/*  DETECT — facts collection (the only fs in this file)               */
/* ------------------------------------------------------------------ */
/** Recursively list `*.js` files under `dir`, returned relative to `base`. */
function listJsFiles(base, dir) {
    const out = [];
    let entries;
    try {
        entries = readdirSync(dir, { withFileTypes: true });
    }
    catch {
        return out; // unreadable dir → no files (dist absence is reported by the plan, not here)
    }
    for (const e of entries) {
        const full = join(dir, e.name);
        if (e.isDirectory())
            out.push(...listJsFiles(base, full));
        else if (e.isFile() && e.name.endsWith('.js'))
            out.push(full.slice(base.length + 1));
    }
    return out;
}
/** Newest file mtime (ms) under `dir`, recursively; 0 when empty/unreadable. */
function newestMtime(dir) {
    let newest = 0;
    let entries;
    try {
        entries = readdirSync(dir, { withFileTypes: true });
    }
    catch {
        return newest;
    }
    for (const e of entries) {
        const full = join(dir, e.name);
        try {
            if (e.isDirectory())
                newest = Math.max(newest, newestMtime(full));
            else if (e.isFile())
                newest = Math.max(newest, statSync(full).mtimeMs);
        }
        catch {
            /* raced/unreadable entry — skip */
        }
    }
    return newest;
}
/**
 * Gather {@link ReleasePackageFacts} for the release set: `discoverPackages` +
 * `orderByDependencies` (imported from publish — reuse, never copy: G9) plus each package's
 * `scripts.test` / `bin` / `dist/**\/*.js` and dist-vs-src staleness (AM-3 input).
 *
 * `filter` mirrors `dz publish --filter` substring semantics (name OR dir); an explicitly
 * empty filter is REJECTED (throws) — "match all on empty" was the publish P0 this mirrors.
 *
 * Failure contract (load-bearing path — fail FAST, not open): a corrupt `package.json`
 * throws up to the caller; a missing/foreign root degrades to `[]` per the
 * `discoverPackages` contract (the CLI reports "no publishable packages" and exits non-zero).
 */
export function collectPackageFacts(monorepoRoot, filter) {
    if (filter !== undefined && filter.length === 0) {
        throw new Error('release: --filter requires a non-empty list of package-name substrings (empty would match ALL packages)');
    }
    const discovered = discoverPackages(monorepoRoot);
    const selected = filter === undefined ? discovered : discovered.filter((p) => filter.some((f) => p.name.includes(f) || p.dir.includes(f)));
    const ordered = orderByDependencies(selected);
    return ordered.map((p) => {
        const pkgJson = JSON.parse(readFileSync(join(p.dir, 'package.json'), 'utf-8'));
        const bins = [];
        if (typeof pkgJson.bin === 'string') {
            // `"bin": "cli.js"` — bin name defaults to the package basename; path may lack `./` (G3).
            const rel = pkgJson.bin.replace(/^\.\//, '');
            const abs = join(p.dir, rel);
            bins.push({ name: p.name.split('/').pop() ?? p.name, path: abs, exists: existsSync(abs) });
        }
        else if (pkgJson.bin !== undefined && pkgJson.bin !== null && typeof pkgJson.bin === 'object') {
            for (const [name, relRaw] of Object.entries(pkgJson.bin)) {
                const rel = String(relRaw).replace(/^\.\//, '');
                const abs = join(p.dir, rel);
                bins.push({ name, path: abs, exists: existsSync(abs) });
            }
        }
        const distDir = join(p.dir, 'dist');
        const srcDir = join(p.dir, 'src');
        const distJs = existsSync(distDir) ? listJsFiles(p.dir, distDir).sort() : [];
        let srcNewerThanDist;
        if (existsSync(distDir) && existsSync(srcDir)) {
            srcNewerThanDist = newestMtime(srcDir) > newestMtime(distDir);
        }
        return {
            name: p.name,
            dir: p.dir,
            version: p.version,
            hasTestScript: typeof pkgJson.scripts?.['test'] === 'string' && pkgJson.scripts['test'].trim().length > 0,
            hasBuildScript: typeof pkgJson.scripts?.['build'] === 'string' && pkgJson.scripts['build'].trim().length > 0,
            bins,
            distJs,
            srcNewerThanDist,
        };
    });
}
/**
 * AM-8: affected-package selection is a PURE function of an injected changed-file list.
 * `null` (diff unavailable), an empty list, or a list matching zero packages all FAIL OPEN
 * to the full set — a release can never pass on zero verified packages.
 */
export function selectAffectedPackages(changedFiles, facts) {
    if (changedFiles === null || changedFiles.length === 0)
        return [...facts];
    const norm = (s) => s.replace(/\\/g, '/');
    const affected = facts.filter((f) => {
        const dir = norm(f.dir).replace(/\/$/, '');
        const tail = dir.split('/').slice(-3).join('/'); // packages/@dzhechkov/<name>
        return changedFiles.some((file) => {
            const nf = norm(String(file));
            return nf.startsWith(dir + '/') || nf === dir || nf.includes(tail + '/');
        });
    });
    return affected.length === 0 ? [...facts] : affected;
}
/**
 * Plan the four gates from injected facts. Pure: same facts ⇒ byte-identical plan; nothing
 * is executed; every command is an assertable string. Anti-duplication (ADR D1): no step may
 * re-enact a publish gate — the dedicated test greps `cmd`s for guard/claim/sign/provenance.
 */
export function planReleaseGates(facts, opts) {
    const steps = [];
    const skips = [];
    const t = {
        tests: opts.testTimeoutMs ?? RELEASE_TIMEOUTS.testMs,
        audit: opts.auditTimeoutMs ?? RELEASE_TIMEOUTS.auditMs,
        syntax: opts.syntaxTimeoutMs ?? RELEASE_TIMEOUTS.syntaxMs,
        smoke: opts.smokeTimeoutMs ?? RELEASE_TIMEOUTS.smokeMs,
    };
    // Gate 1 — tests: the package's FULL suite via its own `test` script (pnpm test → vitest run).
    for (const f of facts) {
        if (f.hasTestScript) {
            steps.push({
                id: `tests:${f.name}`,
                gate: 'tests',
                pkg: f.name,
                cmd: 'pnpm test',
                cwd: f.dir,
                timeoutMs: t.tests,
                reason: 'full package test suite must pass',
                kind: 'exec',
            });
        }
        else {
            // AM-2: an explicit, named skip — never a silent pass.
            skips.push({
                gate: 'tests',
                pkg: f.name,
                reason: 'no "test" script in package.json — nothing was verified for this package',
                class: 'SKIP_NO_TEST_SCRIPT',
            });
        }
    }
    // Gate 2 — audit: ONE workspace-level step (AM-1: pnpm primary; npm only without pnpm-lock).
    const dev = opts.includeDevDeps === true;
    steps.push({
        id: 'audit:workspace',
        gate: 'audit',
        cmd: opts.pnpmLockPresent
            ? `pnpm audit${dev ? '' : ' --prod'} --audit-level high`
            : `npm audit${dev ? '' : ' --omit=dev'} --audit-level=high`,
        cwd: opts.monorepoRoot,
        timeoutMs: t.audit,
        reason: dev
            ? 'no >=high advisories across ALL workspace dependencies (dev included via --audit-dev)'
            : 'no >=high advisories in production dependencies (dev-only chains excluded — widen with --audit-dev)',
        kind: 'exec',
    });
    // Gates 3+4 — per package. AM-3: a stale dist is NEVER checked/booted as-is.
    for (const f of facts) {
        if (f.srcNewerThanDist === true) {
            steps.push({
                id: `syntax:${f.name}:stale-dist`,
                gate: 'syntax',
                pkg: f.name,
                cmd: '',
                cwd: f.dir,
                timeoutMs: 0,
                reason: 'dist/ is OLDER than src/ — rebuild before release; a stale dist is not checked as-is',
                kind: 'synthetic-fail',
                failClass: 'STALE_DIST',
            });
            if (f.bins.length > 0) {
                steps.push({
                    id: `smoke:${f.name}:stale-dist`,
                    gate: 'smoke',
                    pkg: f.name,
                    cmd: '',
                    cwd: f.dir,
                    timeoutMs: 0,
                    reason: 'dist/ is OLDER than src/ — rebuild before release; a stale bin is not booted as-is',
                    kind: 'synthetic-fail',
                    failClass: 'STALE_DIST',
                });
            }
            continue;
        }
        // AM-10 — the fail-closed INVERSE of AM-3: a package that DECLARES a build but has zero
        // dist JS was never built — zero syntax/smoke steps must read as a FAILURE, never as a
        // clean gate (the dead-SKIP_NO_ARTIFACTS defect Step-8 QE + the delivery gate both caught).
        // A pack with no build script, no artifacts and no bins is a template-only pack: an honest
        // NAMED skip (AM-2), never a silent zero-step pass.
        if (f.distJs.length === 0) {
            if (f.hasBuildScript === true) {
                steps.push({
                    id: `syntax:${f.name}:missing-dist`,
                    gate: 'syntax',
                    pkg: f.name,
                    cmd: '',
                    cwd: f.dir,
                    timeoutMs: 0,
                    reason: 'package declares a "build" script but dist/ contains no JS — build before release; an unbuilt package must be impossible to ship',
                    kind: 'synthetic-fail',
                    failClass: 'MISSING_DIST',
                });
            }
            else if (f.bins.length === 0) {
                skips.push({
                    gate: 'syntax',
                    pkg: f.name,
                    reason: 'no dist/ JS, no bin, no build script — template-only pack; nothing to syntax-check or boot',
                    class: 'SKIP_NO_ARTIFACTS',
                });
            }
        }
        // Gate 3 — syntax: node --check every dist/**/*.js and every existing bin file (deduped).
        const checked = new Set();
        for (const rel of f.distJs) {
            const abs = join(f.dir, rel);
            checked.add(abs);
            steps.push({
                id: `syntax:${f.name}:${rel}`,
                gate: 'syntax',
                pkg: f.name,
                cmd: `node --check "${abs}"`,
                cwd: f.dir,
                timeoutMs: t.syntax,
                reason: `dist file must parse (${rel})`,
                kind: 'exec',
            });
        }
        for (const bin of f.bins) {
            if (bin.exists && !checked.has(bin.path)) {
                checked.add(bin.path);
                steps.push({
                    id: `syntax:${f.name}:bin:${bin.name}`,
                    gate: 'syntax',
                    pkg: f.name,
                    cmd: `node --check "${bin.path}"`,
                    cwd: f.dir,
                    timeoutMs: t.syntax,
                    reason: `bin file must parse (${bin.name})`,
                    kind: 'exec',
                });
            }
        }
        // Gate 4 — smoke-boot: node <bin> --help, DIRECT node (never npx: signals reach the wrapper,
        // not the child), temp cwd + timeout (AM-4). A missing bin file is a synthetic MISSING_BIN.
        for (const bin of f.bins) {
            if (!bin.exists) {
                steps.push({
                    id: `smoke:${f.name}:${bin.name}:missing`,
                    gate: 'smoke',
                    pkg: f.name,
                    cmd: '',
                    cwd: f.dir,
                    timeoutMs: 0,
                    reason: `bin "${bin.name}" points at ${bin.path} which does not exist — build before release`,
                    kind: 'synthetic-fail',
                    failClass: 'MISSING_BIN',
                });
            }
            else {
                steps.push({
                    id: `smoke:${f.name}:${bin.name}`,
                    gate: 'smoke',
                    pkg: f.name,
                    cmd: `node "${bin.path}" --help`,
                    cwd: f.dir,
                    timeoutMs: t.smoke,
                    reason: `bin "${bin.name}" must boot (--help, exit 0)`,
                    kind: 'exec',
                    tempCwd: true,
                });
            }
        }
    }
    return { steps, skips, packages: facts.map((f) => f.name) };
}
/* ------------------------------------------------------------------ */
/*  VERIFY — pure classification                                       */
/* ------------------------------------------------------------------ */
/**
 * AM-1: split an audit non-zero exit into VULNS_HIGH (advisories found) vs AUDIT_ERROR
 * (audit could not run). BOTH block (fail-closed either way); only the message differs, so a
 * misclassification is cosmetic, never a false pass. Unrecognized output ⇒ AUDIT_ERROR — we
 * never claim "vulnerabilities found" from output we cannot read.
 */
function classifyAuditFailure(output) {
    const text = String(output ?? '');
    const looksLikeError = /(ERR_PNPM|npm ERR!|ENOTFOUND|ECONNREFUSED|ECONNRESET|ETIMEDOUT|EAI_AGAIN|audit endpoint|registry .*(unreachable|error)|no .*lockfile|missing .*lockfile|cannot audit)/i.test(text);
    const looksLikeVulns = /\d+\s+vulnerabilit(y|ies)|severity\s*[:>]|\bhigh\b.*\bvulnerabilit|advisor(y|ies)\b/i.test(text);
    if (looksLikeVulns && !looksLikeError) {
        return { cls: 'VULNS_HIGH', reason: 'audit found >=high advisories — fix or consciously fall back to plain dz publish' };
    }
    return {
        cls: 'AUDIT_ERROR',
        reason: 'audit could not complete (network/registry/lockfile) — a gate that cannot run is NOT a passed gate',
    };
}
/**
 * One-line detail for an AUDIT failure: prefer the line that actually SUMMARIZES the
 * advisories (pnpm/npm print it to stdout) over execSync's generic stderr "Command failed…".
 */
function auditDetailLine(stdout, stderr) {
    const all = `${stdout == null ? '' : String(stdout)}\n${stderr == null ? '' : String(stderr)}`;
    const summary = all
        .split('\n')
        .map((l) => l.trim())
        .find((l) => /\d+\s+vulnerabilit|severity|advisor/i.test(l));
    return (summary ?? firstLine(stdout, stderr)).slice(0, 200);
}
/**
 * First non-empty output line, for one-line failure reasons; hostile input coerced safely.
 * Exported so the CLI reuses it for gh/tag periphery messages (G9 reuse-never-copy).
 */
export function firstOutputLine(...chunks) {
    return firstLine(...chunks);
}
function firstLine(...chunks) {
    for (const c of chunks) {
        const s = c == null ? '' : String(c);
        const line = s.split('\n').find((l) => l.trim().length > 0);
        if (line !== undefined)
            return line.trim().slice(0, 200);
    }
    return '';
}
/**
 * Merge plan + executions into the {@link ReleaseVerdict} — the single fail-closed decision
 * point (ADR load-bearing property):
 *
 * - any `fail` ⇒ `publishAction: 'blocked'`, `ok: false`;
 * - a planned exec step with NO execution record ⇒ `UNEXECUTED_STEP` failure;
 * - all-skip (nothing executed anywhere) ⇒ NOT `proceed` — nothing verified is not verified;
 * - never throws on hostile input (`formatPublishError` discipline).
 */
export function classifyGateExecutions(plan, executions, now = new Date()) {
    const byId = new Map();
    for (const e of executions ?? []) {
        if (e != null && typeof e.stepId === 'string')
            byId.set(e.stepId, e);
    }
    const gates = RELEASE_GATE_ORDER.map((gate) => {
        const gateSteps = (plan?.steps ?? []).filter((s) => s?.gate === gate);
        const gateSkips = (plan?.skips ?? []).filter((s) => s?.gate === gate);
        const failures = [];
        let passed = 0;
        for (const step of gateSteps) {
            try {
                if (step.kind === 'synthetic-fail') {
                    failures.push({ pkg: step.pkg, reason: step.reason, class: step.failClass ?? 'EXIT_NONZERO' });
                    continue;
                }
                const exec = byId.get(step.id);
                if (exec === undefined) {
                    failures.push({
                        pkg: step.pkg,
                        reason: `planned step "${step.id}" was never executed — an under-executed plan cannot pass`,
                        class: 'UNEXECUTED_STEP',
                    });
                    continue;
                }
                if (exec.timedOut === true) {
                    failures.push({
                        pkg: step.pkg,
                        reason: `timed out after ${step.timeoutMs}ms: ${step.cmd}`,
                        class: gate === 'smoke' ? 'SMOKE_TIMEOUT' : 'TIMEOUT',
                    });
                    continue;
                }
                if (typeof exec.exitCode !== 'number' || exec.exitCode !== 0) {
                    if (gate === 'audit') {
                        const { cls, reason } = classifyAuditFailure(`${exec.stdout ?? ''}\n${exec.stderr ?? ''}`);
                        const detail = auditDetailLine(exec.stdout, exec.stderr);
                        failures.push({ pkg: step.pkg, reason: `${reason}${detail ? ` — ${detail}` : ''}`, class: cls });
                    }
                    else {
                        failures.push({
                            pkg: step.pkg,
                            reason: `exit ${String(exec.exitCode)}: ${step.cmd}${firstLine(exec.stderr, exec.stdout) ? ` — ${firstLine(exec.stderr, exec.stdout)}` : ''}`,
                            class: 'EXIT_NONZERO',
                        });
                    }
                    continue;
                }
                passed += 1;
            }
            catch {
                // Hostile/malformed step or execution record: classify as failure, never throw.
                failures.push({ pkg: step?.pkg, reason: 'unclassifiable step/execution record', class: 'EXIT_NONZERO' });
            }
        }
        const status = failures.length > 0 ? 'fail' : passed > 0 ? 'pass' : 'skip';
        return { gate, status, passed, failures, skips: gateSkips };
    });
    const failedGates = gates.filter((g) => g.status === 'fail');
    const anyPass = gates.some((g) => g.status === 'pass');
    const blockedBy = failedGates.map((g) => `${g.gate}: ${g.failures.length} failure(s) [${[...new Set(g.failures.map((f) => f.class))].join(', ')}]`);
    if (failedGates.length === 0 && !anyPass) {
        blockedBy.push('nothing-verified: no gate executed a single step — an all-skip run is not a verified release');
    }
    const ok = failedGates.length === 0 && anyPass;
    return {
        gates,
        ok,
        blockedBy,
        skipped: plan?.skips ?? [],
        publishAction: ok ? 'proceed' : 'blocked',
        timestamp: now.toISOString(),
    };
}
/**
 * gh-2.4-safe `gh issue create` payload (only `--title`/`--body` are assumed downstream).
 * Pure + deterministic for a fixed verdict — the issue is the verdict's echo, never its judge.
 */
export function buildFailureIssue(verdict, ctx = {}) {
    const failed = verdict.gates.filter((g) => g.status === 'fail').map((g) => g.gate);
    const title = `dz release: gate failure — ${failed.length > 0 ? failed.join(', ') : 'nothing verified'}`;
    const lines = [
        `Verified release blocked at ${verdict.timestamp}.`,
        '',
        ...(ctx.invocation ? [`Invocation: \`${ctx.invocation}\``, ''] : []),
        ...(ctx.repo ? [`Repo: ${ctx.repo}`, ''] : []),
        '## Gate verdict',
        '',
    ];
    for (const g of verdict.gates) {
        const icon = g.status === 'pass' ? '✓' : g.status === 'fail' ? '✗' : '○';
        lines.push(`- ${icon} **${g.gate}** — ${g.status} (${g.passed} passed, ${g.failures.length} failed, ${g.skips.length} skipped)`);
        for (const f of g.failures)
            lines.push(`  - [${f.class}] ${f.pkg ? `${f.pkg}: ` : ''}${f.reason}`);
    }
    if (verdict.skipped.length > 0) {
        lines.push('', '## Skipped (honestly reported, never counted as passed)', '');
        for (const s of verdict.skipped)
            lines.push(`- [${s.class}] ${s.pkg}: ${s.reason}`);
    }
    lines.push('', `Blocked by: ${verdict.blockedBy.join('; ')}`, '', '_Auto-created by `dz release` (best-effort; the release verdict is independent of this issue)._');
    return { title, body: lines.join('\n') };
}
/** Short, bounded release notes from injected `git log --oneline`-style lines. */
export function buildReleaseNotes(gitLogLines, limit = 15) {
    const bullets = (gitLogLines ?? [])
        .map((l) => String(l ?? '').trim())
        .filter((l) => l.length > 0)
        .slice(0, Math.max(1, limit))
        .map((l) => `- ${l.slice(0, 200)}`);
    if (bullets.length === 0)
        return 'Verified release (no commit subjects available).';
    return `Verified release — recent changes:\n${bullets.join('\n')}`;
}
/** Deterministic tag name from injected data: `release-<yyyymmdd>-<shortsha>`. */
export function releaseTagName(now, shortSha) {
    const y = now.getUTCFullYear();
    const m = String(now.getUTCMonth() + 1).padStart(2, '0');
    const d = String(now.getUTCDate()).padStart(2, '0');
    const sha = String(shortSha ?? '').replace(/[^0-9a-zA-Z]/g, '').slice(0, 12);
    return sha.length > 0 ? `release-${y}${m}${d}-${sha}` : `release-${y}${m}${d}`;
}
//# sourceMappingURL=release.js.map
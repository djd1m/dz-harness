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
import { join, relative } from 'node:path';
import { discoverPackages, matchesPublishFilter, orderByDependencies } from './publish.js';
import { planPackedInstallSmoke, judgePackedInstallSmoke } from './packed-install-smoke.js';
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
    // The twin of the publish guard: an empty ELEMENT matches every name, so the list being
    // non-empty is not enough. Both doors must be shut or the weaker one becomes the entrance.
    if (filter?.some((f) => f.length === 0)) {
        throw new Error('release: --filter requires non-empty package-name substrings (empty would match ALL packages)');
    }
    const discovered = discoverPackages(monorepoRoot);
    const selected = filter === undefined ? discovered : discovered.filter((p) => filter.some((f) => matchesPublishFilter(p, f, monorepoRoot)));
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
    // FR-6 (feature publish-sibling-drift-gate): the packed-install smoke joins the SAME smoke
    // gate `dz publish` runs (planPackedInstallSmoke, ADR-001 Decision 2) — so both doors apply
    // the identical rule. Opt-in via `opts.packedInstall` (real tmp dirs, supplied by the CLI):
    // omitted, this is byte-identical to the pre-feature plan, which every existing planner test
    // relies on. Skipped entirely when nothing in the batch has a bin — packing siblings nobody
    // will boot proves nothing a fresh `npm install` doesn't already cover elsewhere.
    let packedInstallPlan;
    if (opts.packedInstall !== undefined) {
        const bins = facts.flatMap((f) => f.bins.map((b) => ({ pkg: f.name, binName: b.name, relPath: relative(f.dir, b.path) })));
        if (bins.length > 0) {
            const packages = facts.map((f) => ({ name: f.name, dir: f.dir, version: f.version }));
            const smokePlan = planPackedInstallSmoke({
                packages,
                bins,
                packDir: opts.packedInstall.packDir,
                installDir: opts.packedInstall.installDir,
            });
            packedInstallPlan = smokePlan; // AM-7: kept for classifyGateExecutions's re-judge pass
            for (const s of smokePlan.steps) {
                const reason = s.kind === 'pack'
                    ? `pack ${s.pkg} for the packed-install smoke — the tarball a consumer would actually receive`
                    : s.kind === 'install'
                        ? 'install every packed tarball together in a clean dir — out-of-batch siblings resolve from the registry, exactly like a fresh user'
                        : s.kind === 'bin-exists'
                            ? `bin "${s.binName}" must EXIST after the packed install (AM-8)`
                            : `bin "${s.binName}" must boot from the PACKED install (--version, exit 0, non-empty stdout)`;
                steps.push({
                    id: `smoke:packed-install:${s.id}`,
                    gate: 'smoke',
                    pkg: s.pkg,
                    cmd: s.cmd,
                    cwd: s.cwd,
                    timeoutMs: s.timeoutMs,
                    reason,
                    kind: 'exec',
                });
            }
        }
    }
    return { steps, skips, packages: facts.map((f) => f.name), ...(packedInstallPlan !== undefined ? { packedInstallPlan } : {}) };
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
 * Strip ANSI/VT100 escape sequences (colour codes, cursor moves, OSC hyperlinks) so pattern
 * matching sees the plain text a human reads on a non-colour terminal. AM-2/AM-1 precondition:
 * `testsFailureDetail` and the issue-body redaction both run this FIRST, before any regex tries
 * to recognise a runner's summary/FAIL lines or a secret value — a coloured `FAIL` token (e.g.
 * `\x1b[31mFAIL\x1b[0m`) must still match `/^FAIL\b/` once stripped.
 */
// eslint-disable-next-line no-control-regex -- deliberately matching raw ESC control bytes
function stripAnsi(s) {
    return s
        .replace(/\x1B\][^\x07\x1B]*(?:\x07|\x1B\\)/g, '') // OSC …  BEL | OSC … ST
        .replace(/\x1B[[()#;?]*[0-9]*(?:;[0-9]*)*[a-zA-Z@]/g, ''); // CSI/other short escapes
}
/**
 * Feature release-gate-output-tail (FR-1, amended AM-2): a one-line-ish detail for a
 * `tests`/`syntax`/`smoke` EXIT_NONZERO/TIMEOUT failure that names the ACTUAL failure — not
 * just the first output line, which for `pnpm test`/vitest is routinely an unrelated
 * vite/esbuild deprecation warning (MEASURED 2026-09-13 16:05/18:52).
 *
 * AM-2: ANSI escapes are stripped FIRST (a coloured runner must match the same patterns as a
 * plain one). Recognised shapes, collected in this priority order and joined:
 * 1. vitest summary lines (`Tests …`, `Test Files …`);
 * 2. up to 5 `FAIL …` / `× …` / `❯ …` lines (failing test names/paths);
 * 3. node:test (TAP) lines: `not ok N - name` and `# fail N`.
 *
 * If NONE of the above is present (a non-vitest, non-TAP failure, or empty output), fall back
 * to the prior `firstLine` behavior, marked `(no test-runner summary recognised)` so a reader
 * knows the detail is a guess, not a parsed summary — UNLESS `firstLine` itself is empty (no
 * output at all), in which case the mark would manufacture a synthetic line where none existed
 * and is withheld. Capped at 600 chars — a detail line, not a dump.
 */
export function testsFailureDetail(stdout, stderr) {
    const all = stripAnsi(`${stdout == null ? '' : String(stdout)}\n${stderr == null ? '' : String(stderr)}`);
    const lines = all
        .split('\n')
        .map((l) => l.trim())
        .filter((l) => l.length > 0);
    const summaryLines = lines.filter((l) => /^(Tests|Test Files)\b/.test(l));
    const failLines = lines.filter((l) => /^(FAIL\b|×|❯)/.test(l)).slice(0, 5);
    const tapNotOkLines = lines.filter((l) => /^not ok \d+/.test(l)).slice(0, 5);
    const tapFailCountLines = lines.filter((l) => /^# fail \d+/i.test(l));
    const parts = [...summaryLines, ...failLines, ...tapNotOkLines, ...tapFailCountLines];
    if (parts.length === 0) {
        // lead r2: the fallback is derived from the ANSI-STRIPPED text, never the raw stream
        const fl = lines[0] ?? '';
        return fl.length === 0 ? '' : `${fl.slice(0, 200)} (no test-runner summary recognised)`;
    }
    return parts.join(' — ').slice(0, 600);
}
/** Truncate `s` to at most `maxBytes` UTF-8 bytes, never splitting a multi-byte character. */
function truncateToBytes(s, maxBytes) {
    if (maxBytes <= 0)
        return '';
    const buf = Buffer.from(s, 'utf-8');
    if (buf.length <= maxBytes)
        return s;
    let end = maxBytes;
    // back off while the next byte is a UTF-8 continuation byte (10xxxxxx)
    while (end > 0 && (buf[end] & 0xc0) === 0x80)
        end -= 1;
    return buf.subarray(0, end).toString('utf-8');
}
/**
 * Feature release-gate-output-tail (FR-2/FR-3, amended AM-3): the last non-empty lines of ONE
 * stream (call separately for stdout and stderr — AM-4), bounded on BOTH axes (line count and
 * byte size) so a runaway suite cannot blow up a report or an issue body.
 *
 * AM-3 bounds, each an explicit branch rather than an emergent `Array.slice(-0)` accident
 * (`slice(-0)` returns the WHOLE array, not `[]` — the pre-amendment bug):
 * - `maxLines <= 0` → `''`; `maxBytes <= 0` → `''`.
 * - Whole-line selection: lines are pulled from the END while the running BYTE total (each
 *   line's UTF-8 byte length plus its joining `\n`) stays `<= maxBytes` — never a partial line.
 * - A single most-recent line that ALONE exceeds `maxBytes` is truncated at a UTF-8 CHARACTER
 *   boundary (never splitting a multi-byte codepoint) and marked `… (line truncated)`.
 *
 * Empty/whitespace-only output → `''` (never a synthetic line).
 */
export function outputTail(stdout, stderr, maxLines = 40, maxBytes = 8192) {
    if (maxLines <= 0 || maxBytes <= 0)
        return '';
    const all = `${stdout == null ? '' : String(stdout)}\n${stderr == null ? '' : String(stderr)}`;
    const nonEmpty = all
        .split('\n')
        .map((l) => l.replace(/\r$/, ''))
        .filter((l) => l.trim().length > 0);
    const tailLines = nonEmpty.slice(-maxLines);
    if (tailLines.length === 0)
        return '';
    const lastLine = tailLines[tailLines.length - 1];
    if (Buffer.byteLength(lastLine, 'utf-8') > maxBytes) {
        // lead r2: the marker lives INSIDE the byte budget, so the returned text never exceeds maxBytes
        const marker = '… (line truncated)';
        const room = Math.max(0, maxBytes - Buffer.byteLength(marker, 'utf-8'));
        return `${truncateToBytes(lastLine, room)}${marker}`;
    }
    const selected = [];
    let bytes = 0;
    for (let i = tailLines.length - 1; i >= 0; i--) {
        const line = tailLines[i];
        const lineBytes = Buffer.byteLength(line, 'utf-8');
        const joinerBytes = selected.length > 0 ? 1 : 0; // the '\n' this line adds once prepended
        if (bytes + lineBytes + joinerBytes > maxBytes)
            break;
        selected.unshift(line);
        bytes += lineBytes + joinerBytes;
    }
    return selected.join('\n');
}
/**
 * Feature release-gate-output-tail (AM-1): redact secret-shaped substrings before ANY tail text
 * reaches a GitHub issue body. Patterns, each independently redacted:
 * - `token`/`secret`/`password` (case-insensitive) as a `key: value` or `key=value` pair — the
 *   KEY survives, only the value is replaced;
 * - `Bearer <token>` HTTP auth headers;
 * - vendor-prefixed tokens: `npm_…`, `ghp_…`, `github_pat_…`, `sk-…` (hyphenated forms whole), `AKIA…`;
 * - JSON keys (`"token":"…"`) and env-style names ending in TOKEN/SECRET/PASSWORD/API_KEY;
 * - long opaque strings (base64/hex-ish, `[A-Za-z0-9+/=]{32,}`) that look like a key/secret even
 *   without a recognisable prefix.
 * Order matters: prefixed/labelled patterns run BEFORE the generic long-opaque-string pattern so
 * a `Bearer …` token is redacted as a whole rather than surviving as a shorter unlabelled blob.
 */
export function redactSecrets(text) {
    let out = text;
    out = out.replace(/\bBearer\s+\S+/gi, 'Bearer [redacted]');
    out = out.replace(/\bnpm_[A-Za-z0-9]+/g, '[redacted]');
    out = out.replace(/\bghp_[A-Za-z0-9]+/g, '[redacted]');
    out = out.replace(/\bgithub_pat_[A-Za-z0-9_]+/g, '[redacted]');
    // `sk-proj-…` (and any other hyphenated vendor form) is redacted WHOLE — the old `[A-Za-z0-9]+` stopped
    // at the first hyphen and let the tail through (MEASURED 2026-09-13, backlog 2df653d9).
    out = out.replace(/\bsk-[A-Za-z0-9_-]+/g, '[redacted]');
    out = out.replace(/\bAKIA[A-Za-z0-9]+/g, '[redacted]');
    // JSON keys: `"token":"…"` has a quote between key and colon, so the labelled rule below never saw it.
    out = out.replace(/"(token|secret|password|api[_-]?key|access[_-]?token)"\s*:\s*"[^"]*"/gi, '"$1":"[redacted]"');
    // Env-style names that END in a secret word (`GITHUB_TOKEN=`, `NPM_ACCESS_TOKEN=`): `_` is a word
    // character, so `\btoken` never matched them.
    out = out.replace(/\b([A-Z0-9_]*(?:TOKEN|SECRET|PASSWORD|API_KEY))(\s*[:=]\s*)(\S+)/g, '$1$2[redacted]');
    out = out.replace(/\b(token|secret|password)(\s*[:=]\s*)(\S+)/gi, '$1$2[redacted]');
    out = out.replace(/\b[A-Za-z0-9+/=]{32,}\b/g, '[redacted]');
    return out;
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
    // AM-7: `bin-exists`/`bin-version` packed-install steps are judged through
    // `judgePackedInstallSmoke` — the SAME rule `dz publish` applies (exit 0 AND non-empty stdout,
    // AND the declared bin must exist post-install) — instead of the generic exit-code-only check
    // every other step gets. The generic loop below SKIPS these step ids; the judged verdict is
    // folded into the 'smoke' gate's failures/passed count after the loop.
    const packedInstallPlan = plan?.packedInstallPlan;
    const packedInstallBinStepIds = new Set((packedInstallPlan?.steps ?? []).filter((s) => s.kind === 'bin-exists' || s.kind === 'bin-version').map((s) => `smoke:packed-install:${s.id}`));
    let packedInstallVerdict;
    if (packedInstallPlan !== undefined) {
        const prefix = 'smoke:packed-install:';
        const translated = (executions ?? [])
            .filter((e) => e != null && typeof e.stepId === 'string' && e.stepId.startsWith(prefix))
            .map((e) => ({
            stepId: e.stepId.slice(prefix.length),
            exitCode: e.exitCode,
            stdout: e.stdout ?? '',
            stderr: e.stderr ?? '',
            ...(e.timedOut !== undefined ? { timedOut: e.timedOut } : {}),
        }));
        packedInstallVerdict = judgePackedInstallSmoke(packedInstallPlan, translated);
    }
    const gates = RELEASE_GATE_ORDER.map((gate) => {
        const gateSteps = (plan?.steps ?? []).filter((s) => s?.gate === gate);
        const gateSkips = (plan?.skips ?? []).filter((s) => s?.gate === gate);
        const failures = [];
        let passed = 0;
        for (const step of gateSteps) {
            try {
                if (packedInstallBinStepIds.has(step.id))
                    continue; // judged separately below (AM-7)
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
                        // FR-3 / AM-4: a killed-by-timeout step still has whatever it printed before the
                        // kill — captured per-stream, never merged (see GateFailure.tails doc comment).
                        tails: { stdout: outputTail(exec.stdout, undefined), stderr: outputTail(undefined, exec.stderr) },
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
                        // FR-1: for tests/syntax/smoke, name the ACTUAL failure (summary + failing tests),
                        // not just the first output line — see testsFailureDetail's doc comment for why.
                        const detail = testsFailureDetail(exec.stderr, exec.stdout);
                        failures.push({
                            pkg: step.pkg,
                            reason: `exit ${String(exec.exitCode)}: ${step.cmd}${detail ? ` — ${detail}` : ''}`,
                            class: 'EXIT_NONZERO',
                            // AM-4: per-stream tails, never merged — see GateFailure.tails doc comment.
                            tails: { stdout: outputTail(exec.stdout, undefined), stderr: outputTail(undefined, exec.stderr) },
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
        // AM-7: fold the packed-install bin verdicts (judged via judgePackedInstallSmoke, above) into
        // the 'smoke' gate — the ONLY gate that ever plans packed-install steps.
        if (gate === 'smoke' && packedInstallVerdict !== undefined) {
            for (const bin of packedInstallVerdict.bins) {
                if (bin.ok) {
                    passed += 1;
                }
                else {
                    failures.push({
                        pkg: bin.pkg,
                        reason: `packed-install bin "${bin.binName}" ${bin.detail ?? 'failed'}`,
                        class: 'EXIT_NONZERO',
                    });
                }
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
/** AM-1: total issue-body cap — a courier never balloons into an unpostable payload. */
const MAX_ISSUE_BODY_BYTES = 60 * 1024;
/**
 * AM-5: fence `text` so the payload can never prematurely close the code block — the fence is
 * N+1 backticks, where N is the LONGEST run of consecutive backticks already present in `text`.
 * Every content line (and the fence itself) carries `indent` so a multi-line block renders as a
 * continuation of the enclosing markdown list item, not as a sibling paragraph.
 */
function fencedBlock(text, indent = '    ') {
    const runs = text.match(/`+/g) ?? [];
    const longestRun = runs.reduce((m, r) => Math.max(m, r.length), 0);
    // GFM needs >= 3 backticks for a FENCED (block) code fence — fewer reads as inline code.
    const fence = '`'.repeat(Math.max(3, longestRun + 1));
    const contentLines = text.split('\n').map((l) => `${indent}${l}`);
    return [`${indent}${fence}`, ...contentLines, `${indent}${fence}`];
}
/**
 * Формы отказа `gh`, означающие «учётные данные не приняты», а не «команда не та».
 * Список узкий намеренно: широкая сетка превратила бы любой сбой в повод лезть в окружение.
 */
const GH_AUTH_FAILURE_SHAPES = [
    /no longer valid/i,
    /bad credentials/i,
    /authentication failed/i,
    /requires authentication/i,
    /gh auth login/i,
    /HTTP 401/i,
];
/**
 * Стоит ли повторить вызов `gh` БЕЗ переменной `GITHUB_TOKEN`.
 *
 * ИЗМЕРЕНО 2026-09-21 в этой среде: `gh auth status` → «the github.com token in GITHUB_TOKEN is no
 * longer valid», а `env -u GITHUB_TOKEN gh auth status` → вход как djd1m через keyring. То есть
 * мёртвая переменная ЗАТЕНЯЕТ рабочие учётные данные, и всякий вызов `gh` из скрипта падает
 * (бэклог ead5f8e0). Переменная живёт в окружении tmux-сервера и снимается только владельцем.
 *
 * Почему повтор, а не безусловное снятие: в сборочной среде `GITHUB_TOKEN` — ШТАТНЫЙ способ
 * авторизации, и выбрасывать его всегда значило бы ломать работающее ради сломанного. Поэтому
 * сначала обычный вызов, и лишь на отказе ИМЕННО по авторизации — одна попытка без переменной.
 */
export function shouldRetryGhWithoutToken(input) {
    if (input.exitCode === 0 || !input.tokenPresent)
        return false;
    const text = `${input.stderr}\n${input.stdout}`;
    return GH_AUTH_FAILURE_SHAPES.some((re) => re.test(text));
}
/**
 * gh-2.4-safe `gh issue create` payload (only `--title`/`--body` are assumed downstream).
 * Pure + deterministic for a fixed verdict — the issue is the verdict's echo, never its judge.
 *
 * AM-1/AM-4/AM-5: every tail is (a) redacted (secret-shaped substrings replaced — see
 * {@link redactSecrets}) and ANSI-stripped BEFORE it is ever considered for the body; (b) shown
 * per STREAM, labelled `stdout:`/`stderr:` — AM-4's scope note applies here too: the two labelled
 * blocks do NOT reconstruct chronological interleaving between the streams; (c) fenced so the
 * payload cannot break out of its code block; (d) the WHOLE body is capped at
 * {@link MAX_ISSUE_BODY_BYTES} — when it would exceed the cap, every tail is shrunk EVENLY
 * (byte-proportional), not by dropping some tails whole while keeping others untouched.
 */
export function buildFailureIssue(verdict, ctx = {}) {
    const failed = verdict.gates.filter((g) => g.status === 'fail').map((g) => g.gate);
    const title = `dz release: gate failure — ${failed.length > 0 ? failed.join(', ') : 'nothing verified'}`;
    const refsByFailure = new Map();
    for (const g of verdict.gates) {
        for (const f of g.failures) {
            if (f.tails === undefined)
                continue;
            const refs = [];
            for (const stream of ['stdout', 'stderr']) {
                const raw = f.tails[stream];
                if (raw.length === 0)
                    continue;
                const clean = redactSecrets(stripAnsi(raw));
                refs.push({ stream, text: clean, rawBytes: Buffer.byteLength(clean, 'utf-8') });
            }
            if (refs.length > 0)
                refsByFailure.set(f, refs);
        }
    }
    const render = () => {
        const lines = [
            `Verified release blocked at ${verdict.timestamp}.`,
            '',
            ...(ctx.invocation ? [`Invocation: \`${redactSecrets(stripAnsi(ctx.invocation)).replace(/`/g, "'")}\``, ''] : []),
            ...(ctx.repo ? [`Repo: ${ctx.repo}`, ''] : []),
            '## Gate verdict',
            '',
        ];
        for (const g of verdict.gates) {
            const icon = g.status === 'pass' ? '✓' : g.status === 'fail' ? '✗' : '○';
            lines.push(`- ${icon} **${g.gate}** — ${g.status} (${g.passed} passed, ${g.failures.length} failed, ${g.skips.length} skipped)`);
            for (const f of g.failures) {
                // lead r2 (HIGH): the reason is output-derived free text — strip ANSI and redact it like a tail
                lines.push(`  - [${f.class}] ${f.pkg ? `${f.pkg}: ` : ''}${redactSecrets(stripAnsi(f.reason))}`);
                // FR-2 / AM-4 / AM-5: a labelled, fenced block per non-empty stream — the issue is the
                // echo of the verdict, so a reader can see the actual failing output without re-running.
                for (const ref of refsByFailure.get(f) ?? []) {
                    lines.push(`    ${ref.stream}:`, ...fencedBlock(ref.text));
                }
            }
        }
        if (verdict.skipped.length > 0) {
            lines.push('', '## Skipped (honestly reported, never counted as passed)', '');
            for (const s of verdict.skipped)
                lines.push(`- [${s.class}] ${s.pkg}: ${s.reason}`);
        }
        lines.push('', `Blocked by: ${verdict.blockedBy.join('; ')}`, '', '_Auto-created by `dz release` (best-effort; the release verdict is independent of this issue)._');
        return lines.join('\n');
    };
    let body = render();
    let bodyBytes = Buffer.byteLength(body, 'utf-8');
    if (bodyBytes > MAX_ISSUE_BODY_BYTES && refsByFailure.size > 0) {
        const allRefs = [...refsByFailure.values()].flat();
        let overage = bodyBytes - MAX_ISSUE_BODY_BYTES;
        // Bounded iteration: each pass's cut is based on the LATEST measured overage (markup like
        // "… (truncated)" adds a few bytes back per ref, so one pass rarely lands exactly) — a few
        // passes converge; the safety net below closes any pathological remainder.
        for (let pass = 0; pass < 3 && overage > 0; pass++) {
            const perRefCut = Math.ceil(overage / allRefs.length);
            for (const ref of allRefs) {
                const targetBytes = Math.max(0, ref.rawBytes - perRefCut);
                if (Buffer.byteLength(ref.text, 'utf-8') > targetBytes) {
                    ref.text = `${truncateToBytes(ref.text, targetBytes)}… (truncated)`;
                }
            }
            body = render();
            bodyBytes = Buffer.byteLength(body, 'utf-8');
            overage = bodyBytes - MAX_ISSUE_BODY_BYTES;
        }
        // Safety net: a pathological shape (a huge non-tail skeleton, tiny/no tails) can still exceed
        // the cap after every tail is wiped — hard-truncate the whole body as the last resort so the
        // cap is an INVARIANT, never a best-effort.
        if (bodyBytes > MAX_ISSUE_BODY_BYTES) {
            body = `${truncateToBytes(body, MAX_ISSUE_BODY_BYTES - 20)}\n… (truncated)`;
        }
    }
    return { title, body };
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
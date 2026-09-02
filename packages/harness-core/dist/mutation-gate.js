// Mutation gate (feature ha-mutation-gate — features/ha-mutation-gate/SPEC.md).
//
// A test that passes proves the code works; it does NOT prove the test would have noticed the
// protection being deleted. Three QE rounds on @dzhechkov/health-advisor produced 53 → 14 → 14
// findings while the whole suite stayed green — including the exact exploit string a code comment
// records as MEASURED. The gate generalises the one measurement that proved a protection real in
// those rounds: DELETE the protection, run the suite, REQUIRE red.
//
// This module is PURE, in the house style of discrimination-gate.ts / challenge-panel.ts: it
// parses the declarative registry, applies a mutation to file TEXT, parses failing-test counts
// from runner output, and classifies observed outcomes. The copy-tree / run-suite / restore I/O is
// performed by the CLI executor (`dz mutation-gate` in harness-cli), which feeds observations back
// into `classifyMutationOutcome`. Deterministic and unit-testable without a filesystem or runner.
//
// The four rules the gate itself must obey (SPEC.md §"Four rules"):
//   1. A mutation that does not apply — `find` absent, or present more than once — is a FAILURE,
//      never a skip (inconclusive ≠ pass, the dz skills-verify lesson).
//   2. A mutation whose suite stays GREEN is a FAILURE, and the report names the property.
//   3. Never mutate the working tree (enforced by the executor: scratch copy only).
//   4. The gate has its own discrimination proof (the deliberately-undefended fixture in
//      harness-cli/test/fixtures/mutation-gate-undefended — excluded from any real registry).
function internalRunnerErrorHead(error) {
    const raw = error instanceof Error ? error.message : String(error);
    const firstLine = raw.split(/\r?\n/, 1)[0]?.trim() || 'unknown internal runner error';
    return Array.from(firstLine).slice(0, 160).join('');
}
/**
 * Run one internal runner invocation. Only a THROWN internal error is retried; normal green/red
 * observations and ordinary no-exit observations are values and therefore never retried.
 */
export function runWithOneInternalRetry(runner) {
    const attempts = [];
    for (const attempt of [1, 2]) {
        try {
            const value = runner();
            attempts.push({ attempt, outcome: 'completed', detail: `attempt ${attempt}: completed` });
            return { value, attempts, internalRetries: attempt === 1 ? 0 : 1 };
        }
        catch (error) {
            const head = internalRunnerErrorHead(error);
            attempts.push({
                attempt,
                outcome: 'runner-internal-error',
                detail: `attempt ${attempt}: runner-internal-error: ${head}`,
            });
        }
    }
    return {
        value: null,
        attempts,
        internalRetries: 1,
        failureReason: 'runner-internal-error: persistent after 2/2 attempts',
    };
}
// ── Registry parsing — declarative DATA, validated loudly ─────────────────────────────────────
const SAFE_ID = /^[a-z0-9][a-z0-9-]{0,79}$/;
/** same shape as discrimination-gate's path rule: package-relative, no traversal, no metacharacters. */
const UNSAFE_FILE = /(^\/)|(^[A-Za-z]:)|(^~)|(^-)|(\/-)|(\.\.(\/|\\|$))|[\0`$;&|<>*?"'\n\r\t\\]/;
/** Parse + validate a registry JSON text. Accepts a bare array or `{testCommand?, requireCompletionReceipt?, entries}`. */
export function parseMutationRegistry(text) {
    let raw;
    try {
        raw = JSON.parse(text);
    }
    catch (e) {
        return { registry: null, errors: [`registry is not valid JSON: ${String(e.message).slice(0, 120)}`] };
    }
    let entriesRaw;
    let testCommand;
    let requireCompletionReceipt;
    if (Array.isArray(raw)) {
        entriesRaw = raw;
    }
    else if (raw && typeof raw === 'object') {
        const obj = raw;
        entriesRaw = obj.entries;
        if (obj.testCommand !== undefined) {
            if (typeof obj.testCommand !== 'string' || obj.testCommand.trim() === '') {
                return { registry: null, errors: ['testCommand must be a non-empty string when present'] };
            }
            testCommand = obj.testCommand.trim();
        }
        if (obj.requireCompletionReceipt !== undefined) {
            if (typeof obj.requireCompletionReceipt !== 'boolean') {
                return { registry: null, errors: ['requireCompletionReceipt must be a boolean when present'] };
            }
            requireCompletionReceipt = obj.requireCompletionReceipt;
        }
    }
    if (!Array.isArray(entriesRaw)) {
        return { registry: null, errors: ['registry must be an array of entries or {testCommand?, requireCompletionReceipt?, entries: [...]}'] };
    }
    if (entriesRaw.length === 0) {
        // An empty registry "passes" by testing nothing — the same silent hole as a skipped mutation.
        return { registry: null, errors: ['registry has no entries — an empty registry proves nothing and is refused'] };
    }
    const errors = [];
    const entries = [];
    const seen = new Set();
    entriesRaw.forEach((e, i) => {
        const at = `entries[${i}]`;
        if (!e || typeof e !== 'object') {
            errors.push(`${at}: not an object`);
            return;
        }
        const o = e;
        const id = typeof o['id'] === 'string' ? o['id'] : '';
        if (!SAFE_ID.test(id)) {
            errors.push(`${at}: id must be kebab-case [a-z0-9-], got ${JSON.stringify(o['id'])}`);
            return;
        }
        if (seen.has(id)) {
            errors.push(`${at}: duplicate id '${id}'`);
            return;
        }
        seen.add(id);
        if (typeof o['property'] !== 'string' || o['property'].trim() === '') {
            errors.push(`${id}: property (the claimed sentence) is required`);
            return;
        }
        const file = typeof o['file'] === 'string' ? o['file'] : '';
        if (file === '' || UNSAFE_FILE.test(file)) {
            errors.push(`${id}: file must be a plain package-relative path, got ${JSON.stringify(o['file'])}`);
            return;
        }
        // A registry file under node_modules/ is refused OUTRIGHT (F-2): the registry names protections
        // in the package's OWN code — a dependency's file is not this package's protection — and the
        // scratch copy intentionally SHARES node_modules with the real tree (symlinked for
        // runnability), so such an entry could never be mutated without writing through the link into
        // the real working tree (SPEC rule 3). The executor's realpath containment is the belt; this
        // is the cheaper layer-1 refusal for the case that is always a mistake.
        if (file.split('/').includes('node_modules')) {
            errors.push(`${id}: file targets node_modules/ (${JSON.stringify(file)}) — refused: a dependency file is not this package's protection, and the scratch copy shares node_modules with the REAL tree (rule 3: never mutate the working tree)`);
            return;
        }
        const mut = o['mutation'];
        if (!mut || typeof mut !== 'object' || typeof mut.find !== 'string' || mut.find.length === 0 || typeof mut.replace !== 'string') {
            errors.push(`${id}: mutation must be {find: <non-empty string>, replace: <string>}`);
            return;
        }
        if (mut.find === mut.replace) {
            errors.push(`${id}: mutation.replace equals mutation.find — a no-op mutation tests nothing`);
            return;
        }
        let minFailing = 1;
        if (o['minFailing'] !== undefined) {
            if (typeof o['minFailing'] !== 'number' || !Number.isInteger(o['minFailing']) || o['minFailing'] < 1) {
                errors.push(`${id}: minFailing must be a positive integer`);
                return;
            }
            minFailing = o['minFailing'];
        }
        let observed;
        if (o['observed'] !== undefined) {
            if (typeof o['observed'] !== 'number' || !Number.isInteger(o['observed']) || o['observed'] < 1) {
                errors.push(`${id}: observed must be a positive integer when present`);
                return;
            }
            observed = o['observed'];
        }
        let maxFailing;
        if (o['maxFailing'] !== undefined) {
            if (typeof o['maxFailing'] !== 'number' || !Number.isInteger(o['maxFailing']) || o['maxFailing'] < 1) {
                errors.push(`${id}: maxFailing must be a positive integer when present`);
                return;
            }
            if (o['maxFailing'] < minFailing) {
                errors.push(`${id}: maxFailing (${o['maxFailing']}) must be >= minFailing (${minFailing}) — a contradictory bound can never pass`);
                return;
            }
            maxFailing = o['maxFailing'];
        }
        const entry = {
            id,
            property: o['property'].trim(),
            file,
            mutation: { find: mut.find, replace: mut.replace },
            minFailing,
            ...(observed !== undefined ? { observed } : {}),
            ...(maxFailing !== undefined ? { maxFailing } : {}),
        };
        entries.push(entry);
    });
    if (errors.length > 0)
        return { registry: null, errors };
    return {
        registry: {
            ...(testCommand !== undefined ? { testCommand } : {}),
            ...(requireCompletionReceipt !== undefined ? { requireCompletionReceipt } : {}),
            entries,
        },
        errors: [],
    };
}
/** Count NON-OVERLAPPING occurrences and apply only when the count is exactly 1. */
export function applyMutationToText(source, find, replace) {
    if (find.length === 0)
        return { ok: false, occurrences: 0 };
    const occurrences = source.split(find).length - 1;
    if (occurrences !== 1)
        return { ok: false, occurrences };
    // The replacer FUNCTION makes the replacement LITERAL: with a plain string, `$&`/`` $` ``/`$'`/
    // `$$` are substitution patterns and the gate would silently apply a DIFFERENT mutation than
    // declared (G-3, MEASURED: replace 'X$&Y' on find 'GUARD' produced 'XGUARDY').
    return { ok: true, occurrences, text: source.replace(find, () => replace) };
}
/**
 * The route-c upper bound: the most failing tests a mutation may cause and still be read as
 * BEHAVIOURAL redness attributable to this one protection. Explicit `maxFailing` wins; otherwise
 * `max(anchor*5, anchor+10)` where anchor = `observed` (the measured blast radius) falling back to
 * `minFailing`. k=5 / N=10 justification, MEASURED on the live data: every health-advisor registry
 * entry has observed 1–4 ⇒ bounds 11–20, so legitimate growth (more tests covering the property —
 * 5× proportional, or +10 absolute so tiny `observed` is not strangled) still passes, while the
 * two measured structural blow-ups (route a: whole 484-test suite dead on a parse error; route c:
 * 200+ failing vs observed 1) exceed the bound by an order of magnitude. NEVER unbounded — an
 * entry with no `observed` anchors on its own minFailing contract.
 */
export function effectiveMaxFailing(entry) {
    if (entry.maxFailing !== undefined)
        return entry.maxFailing;
    const anchor = entry.observed ?? entry.minFailing ?? 1;
    return Math.max(anchor * 5, anchor + 10);
}
// ── Failing-test count — best-effort SECONDARY signal (never decides red/green) ───────────────
/**
 * Parse a failing-test count from runner output. Order of preference:
 *   1. node --test / TAP summary `# fail N` (authoritative for TAP);
 *   2. vitest/jest summary `Tests  N failed` / `N failed`;
 *   3. top-level (unindented) `not ok` line count.
 * Returns null when nothing parses — the verdict then rests on the exit code ALONE, by design:
 * count parsing failure must never flip red/green (SPEC design decision).
 */
export function countFailingTests(rawOutput) {
    // vitest colours its summary even when piped (MEASURED: `npm test` piped still carries SGR
    // codes), which would hide `Tests N failed` from every regex below — strip SGR first.
    const output = stripSgr(rawOutput);
    const tap = /^#\s*fail(?:ing)?\s+(\d+)\s*$/m.exec(output);
    if (tap && tap[1] !== undefined)
        return Number(tap[1]);
    // the `Tests` line, NOT `Test Files` — a failed file count under-reports the failing tests.
    const vitest = /^\s*Tests\s+[^|\n]*?(\d+)\s+failed/m.exec(output);
    if (vitest && vitest[1] !== undefined)
        return Number(vitest[1]);
    const jest = /^\s*Tests:\s+(?:[^,\n]+,\s*)?(\d+)\s+failed/m.exec(output);
    if (jest && jest[1] !== undefined)
        return Number(jest[1]);
    const notOk = output.match(/^not ok\b/gm);
    if (notOk !== null && notOk.length > 0)
        return notOk.length;
    return null;
}
// ── Run-failure classification — the route-a′ signal, from THE RUN ITSELF (round-6 rework) ────
/** ANSI SGR sequences (colour). vitest emits them even when piped. */
// eslint-disable-next-line no-control-regex
const SGR = /\x1b\[[0-9;]*m/g;
function stripSgr(s) {
    return s.replace(SGR, '');
}
/** Return the first suite-harness receipt error at column 0, with SGR removed. */
export function detectSuiteReceiptMismatch(rawOutput) {
    const match = /^mutation-suite-receipt-error:[^\S\r\n]*(.*)$/m.exec(stripSgr(rawOutput));
    return match === null ? undefined : (match[1] ?? '').trim();
}
/** Return the first suite-harness clean-completion receipt at column 0, with SGR removed. */
export function detectSuiteCompletionReceipt(rawOutput) {
    const match = /^mutation-suite-receipt-ok:[^\S\r\n]*lanes=(\d+)[^\S\r\n]+names=(\d+)[^\S\r\n]*$/m.exec(stripSgr(rawOutput));
    if (match === null)
        return undefined;
    const lanes = Number(match[1]);
    const names = Number(match[2]);
    return Number.isSafeInteger(lanes) && Number.isSafeInteger(names) ? { lanes, names } : undefined;
}
/**
 * Which runner's output shape is this? Extracted VERBATIM from `classifyRunFailure`'s two shape
 * checks so the discrimination gate's evidence model can identify the runner of a GREEN run too —
 * `classifyRunFailure` classifies RED runs only (its green branch returns a red-worded
 * 'unrecognised'), so it cannot answer "which runner produced this pass?".
 *
 * ONE regex family per package (the ADR-001 driver): every runner-shape regex in harness-core
 * lives here, and discrimination-gate.ts consumes this function instead of growing a second copy.
 * Detection is from the OUTPUT SHAPE, not the command (an `npm test` alias hides the runner):
 * node --test needs the TAP header AND node's `# duration_ms` trailer (tape emits TAP + `# fail`
 * but not `# duration_ms`); vitest needs its `RUN v<semver>` banner or `Test Files` summary line.
 * Anything else is 'unknown' — the honest, narrowed gap, never a silent trust mint.
 */
export function detectRunnerKind(rawOutput) {
    const output = stripSgr(rawOutput);
    if (/^TAP version \d+/m.test(output) && /^#\s*duration_ms\s+[\d.]+/m.test(output))
        return 'node-test';
    if (/^\s*RUN\s+v\d+\./m.test(output) || /^\s*Test Files\s/m.test(output))
        return 'vitest';
    return 'unknown';
}
/**
 * Classify a RED suite run's output: did a test FILE fail to LOAD (structural) or did test
 * ASSERTIONS fail (behavioural)? This is the round-6 replacement for the isolated-child
 * `import()` load-check, whose three false-PASS routes were ALL artifacts of the isolated import
 * being a DIFFERENT environment than the test runner (env-dependent module goals, unsettled
 * top-level await draining a child's event loop, non-deterministic load aborts dodging a second
 * spawn). The correct signal comes from the SAME run that produced the failing count — no second
 * child, no environment mismatch, nothing to disagree with itself.
 *
 * Runner shapes, both MEASURED (node v22.22.0, vitest 3.2.4 — reproducers in
 * harness-cli/test/mutation-gate-cli.test.ts and this file's unit tests):
 *
 * node --test (flat TAP): every failure is a column-0 `not ok N - <name>` followed by an indented
 * YAML diagnostic block. A test FILE that dies (throw at load, `process.exit` at import, unsettled
 * top-level await ⇒ exit 13, dead require) is reported as a file-named test point whose block
 * carries an `exitCode:` field (and `signal:` when killed) — `failureType: 'testCodeFailure'`,
 * `error: 'test failed'`, `code: 'ERR_TEST_FAILURE'`. An ASSERTION failure — and equally a plain
 * throw INSIDE a running test — NEVER carries `exitCode:`/`signal:`: those fields describe the
 * spawned per-file process, which only appears when the file itself died. That asymmetry is the
 * discriminator, and it is exactly the honest-mutation boundary: delete a guard clause and the
 * file loads, assertions fire, no `exitCode:` field ⇒ behavioural.
 *
 * vitest (`vitest run`): a load/transform/collection error is reported under a `Failed Suites N`
 * section as `FAIL <path> [ <path> ]` (the bracketed suite name repeats the path) with the error
 * where a test name would be, and the summary counts it under `Test Files N failed` while `Tests`
 * shows `no tests` for that file. Assertion failures appear under `Failed Tests N` as
 * `FAIL <path> > <test name>` with `Tests N failed` in the summary. (An unsettled top-level await
 * HANGS vitest rather than failing the file — the suite times out, exitCode null, INCONCLUSIVE —
 * measured, and honestly out of scope for this classifier.)
 *
 * Runner detection is from the OUTPUT SHAPE, not the command (a `npm test` alias hides the
 * runner): node --test requires the TAP header AND node's `# duration_ms` trailer (tape emits TAP
 * + `# fail` but not `# duration_ms`); vitest requires its `RUN v<semver>` banner or `Test Files`
 * summary line. Anything else — jest, mocha, tape, a bare script — is 'unknown'/'unrecognised':
 * the honest, narrowed gap. It is about THIS TOOL's runner coverage, fails LOUD (INCONCLUSIVE),
 * and never silently passes on output it cannot read.
 */
export function classifyRunFailure(rawOutput) {
    const output = stripSgr(rawOutput);
    // shape detection is shared with the discrimination gate's evidence model (detectRunnerKind above).
    const runner = detectRunnerKind(rawOutput);
    // node --test (flat TAP, node ≥ 20 shape measured on v22.22.0)
    if (runner === 'node-test') {
        const lines = output.split('\n');
        let sawNotOk = false;
        for (let i = 0; i < lines.length; i++) {
            const point = /^not ok \d+ - (.*)$/.exec(lines[i] ?? '');
            if (point === null)
                continue;
            sawNotOk = true;
            // Scan this point's YAML diagnostic block (indented, closed by `  ...`) for the per-file
            // process fields. Nested subtest points are indented and never match the column-0 anchor.
            for (let j = i + 1; j < lines.length; j++) {
                const l = lines[j] ?? '';
                if (!/^\s{2}/.test(l) || /^\s{2}\.\.\.\s*$/.test(l))
                    break;
                const exit = /^\s+exitCode:\s*(-?\d+)/.exec(l);
                const signal = /^\s+signal:\s*'([^']+)'/.exec(l);
                if (exit !== null || signal !== null) {
                    const how = exit !== null ? `exitCode ${exit[1]}` : `signal ${signal?.[1]}`;
                    return {
                        runner: 'node-test',
                        kind: 'file-load',
                        evidence: `node --test reported the test FILE '${(point[1] ?? '').trim()}' failing as a whole (${how}) — the file (or a module it imports) died at load, not an assertion`,
                    };
                }
            }
        }
        const tapFail = /^#\s*fail(?:ing)?\s+(\d+)\s*$/m.exec(output);
        if (sawNotOk || (tapFail !== null && Number(tapFail[1]) > 0)) {
            return { runner: 'node-test', kind: 'assertions' };
        }
        return { runner: 'node-test', kind: 'unrecognised', evidence: 'red node --test run with no failing TAP test point — the redness has no classifiable source' };
    }
    // vitest (`vitest run`, shape measured on 3.2.4)
    if (runner === 'vitest') {
        const failedSuites = /\bFailed Suites\s+(\d+)\b/.exec(output);
        const suiteFail = /^\s*FAIL\s+(\S+)\s+\[\s*\1\s*\]/m.exec(output);
        if (failedSuites !== null || suiteFail !== null) {
            const what = suiteFail !== null ? `'${suiteFail[1]}'` : `${failedSuites?.[1]} suite(s)`;
            return {
                runner: 'vitest',
                kind: 'file-load',
                evidence: `vitest reported ${what} failing to load (Failed Suites — a collection/import error, not a test assertion)`,
            };
        }
        if (/^\s*Tests\s+[^|\n]*?\d+\s+failed/m.test(output) || /\bFailed Tests\s+\d+\b/.test(output)) {
            return { runner: 'vitest', kind: 'assertions' };
        }
        return { runner: 'vitest', kind: 'unrecognised', evidence: 'red vitest run with neither Failed Suites nor failed tests in the output — the redness has no classifiable source (unhandled error outside any test?)' };
    }
    return {
        runner: 'unknown',
        kind: 'unrecognised',
        evidence: 'output matches neither node --test (TAP + # duration_ms) nor vitest (RUN v / Test Files) — no classifier for this runner; structural-vs-behavioural redness cannot be told apart, so the verdict may not be PROVEN',
    };
}
function normaliseReportedFile(raw) {
    let value = raw.trim().replace(/^['"]|['"]$/g, '').replace(/:\d+(?::\d+)?$/, '');
    value = value.replace(/\\/g, '/');
    const testSegment = value.lastIndexOf('/test/');
    if (testSegment >= 0)
        value = value.slice(testSegment + 1);
    if (!value.includes('/') || !/\.(?:test|spec)\.[cm]?[jt]sx?$/.test(value))
        return null;
    return value;
}
/** Parse the failing FILE paths already exposed by supported node --test and vitest shapes. */
export function attributeBaselineRedness(rawOutput, registryFiles) {
    const output = stripSgr(rawOutput);
    const files = [];
    const add = (raw) => {
        const file = normaliseReportedFile(raw);
        if (file !== null && !files.includes(file))
            files.push(file);
    };
    const vitestMatches = [...output.matchAll(/^\s*FAIL\s+(\S+)/gm)];
    for (const match of vitestMatches)
        add(match[1] ?? '');
    const tapMatches = [...output.matchAll(/^not ok \d+\s+-\s+(.+)$/gm)];
    for (const match of tapMatches)
        add(match[1] ?? '');
    for (const match of output.matchAll(/^\s*location:\s*['"]([^'"]+)['"]\s*$/gm)) {
        add(match[1] ?? '');
    }
    const parsedFrom = files.length === 0
        ? 'unparseable'
        : vitestMatches.length > 0 ? 'vitest' : 'node-test';
    if (parsedFrom === 'unparseable') {
        return { parsedFrom, failingFiles: [], covered: [], extraneous: [] };
    }
    const normalisedRegistry = registryFiles
        .map((file) => normaliseReportedFile(file) ?? file.replace(/\\/g, '/'));
    const covered = files.filter((file) => normalisedRegistry.some((registryFile) => file === registryFile || file.endsWith(`/${registryFile}`) || registryFile.endsWith(`/${file}`)));
    const extraneous = files.filter((file) => !covered.includes(file));
    return { parsedFrom, failingFiles: files, covered, extraneous };
}
/**
 * A RED baseline in the scratch copy is a SETUP error, never a mutation result: every subsequent
 * "red under mutation" would be noise, and every "green" a lie about an unrunnable copy.
 */
export function classifyBaseline(exitCode, runFailureReason, attribution) {
    if (exitCode === 0)
        return { ok: true, detail: 'baseline suite green in the scratch copy' };
    if (exitCode === null) {
        const internal = runFailureReason?.startsWith('runner-internal-error:') === true;
        return {
            ok: false,
            reason: internal ? 'runner-internal-error' : 'runner-no-exit',
            detail: `baseline INCONCLUSIVE — suite produced no exit code (${runFailureReason ?? 'unknown timeout/spawn failure'}) — the copy is not runnable; do not read this as a mutation result`,
        };
    }
    if (attribution === undefined || attribution.parsedFrom === 'unparseable') {
        return {
            ok: false,
            reason: 'baseline-red-files-unparseable',
            detail: `baseline suite RED (exit ${exitCode}) in the UNMUTATED scratch copy — failing files: unparseable from runner output — the broken copy cannot prove anything`,
        };
    }
    const failing = `failing files: ${attribution.failingFiles.join(', ')}`;
    if (attribution.extraneous.length > 0 && attribution.covered.length === 0) {
        return {
            ok: false,
            reason: 'extraneous-red-in-allowlist',
            detail: `baseline suite RED (exit ${exitCode}) in the UNMUTATED scratch copy — ${failing} — extraneous red in the testCommand allowlist; the registry entries themselves are not disproven`,
        };
    }
    return {
        ok: false,
        reason: 'baseline-red-covered-files',
        detail: `baseline suite RED (exit ${exitCode}) in the UNMUTATED scratch copy — ${failing} — broken-copy baseline redness touches registry-covered files; fix the copy before evaluating mutations`,
    };
}
// ── Classification (rules 1 + 2, and the drop decision) ───────────────────────────────────────
/**
 * Classify one entry's observation.
 *
 * PRECEDENCE LATTICE (checked top to bottom; each verdict is justified by what it invalidates
 * BELOW it — a verdict may only outrank another when it makes that other's evidence meaningless):
 *   1. NOT_APPLIED            — nothing was mutated, so no run observation means anything;
 *   2. MUTATION_UNPARSEABLE   — the mutated file is not even syntactically a module; a non-parsing
 *                               file never RUNS, so no load- or count-signal can exist (which is
 *                               why it sits above MUTATION_LOAD_FATAL);
 *   3. MUTATION_LOAD_FATAL    — the run happened, but its own output says a test FILE died at
 *                               load: the redness is structural and every count from that same run
 *                               is non-attributable — so it outranks every count-based verdict AND
 *                               the flaky-rebaseline check (a structurally-broken run needs no
 *                               attribution analysis);
 *   4. INCONCLUSIVE (no exit) — the run produced nothing to classify at all;
 *   5. RECEIPT_MISMATCH       — the harness declared its own receipt contract broken, which
 *                               invalidates BOTH the green reading and every count-based reading
 *                               of the same run;
 *   6. UNDEFENDED (exit 0)    — the disjoint GREEN arm: mutually exclusive with every red-based
 *                               verdict below;
 *   7. INCONCLUSIVE (unrecognised output) — red, but the shape is unreadable: counts parsed out of
 *                               unrecognised output must not reach BELOW_MIN/OVER_FAILING/PROVEN;
 *   8. INCONCLUSIVE (flaky rebaseline)    — red, readable, but not attributable;
 *   9. BELOW_MIN → 10. OVER_FAILING       — reliable-count contract checks, both failing;
 *  11. PROVEN                 — applied, red, behavioural, attributable, within bounds.
 *
 * THE DROP DECISION (SPEC §Reporting, decided here + justified): `failing < observed` but still
 * `>= minFailing` is a LOUD WARNING, not a failure. Two reasons, both load-bearing:
 *   • the count is a BEST-EFFORT secondary parsed from runner output — making it verdict-deciding
 *    would let a count-parse failure flip red/green, which the design decisions forbid;
 *   • `observed` is a historical measurement, `minFailing` is the entry's declared CONTRACT. A
 *     contract violation fails (BELOW_MIN — only ever on a reliable count); history drifting down
 *     while the contract still holds is the early warning, reported loudly so a human re-pins
 *     `observed` or investigates — silently normalising it would erase the signal.
 */
function classifyMutationOutcomeWithoutAttemptLog(obs) {
    const e = obs.entry;
    const minFailing = e.minFailing ?? 1;
    const base = {
        id: e.id,
        property: e.property,
        file: e.file,
        occurrences: obs.occurrences,
        exitCode: obs.exitCode,
        failingCount: obs.failingCount,
        // an `observed` anchor is the ONLY thing that makes a drop detectable at all (round-7 honesty)
        dropComparable: e.observed !== undefined,
    };
    if (obs.occurrences !== 1) {
        return {
            ...base,
            applied: false,
            verdict: 'NOT_APPLIED',
            drop: false,
            detail: obs.occurrences === 0
                ? `mutation did not apply: find-text absent from ${e.file} (code drifted?) — NOTHING was tested; a skipped mutation may not report the property as proven (rule 1)`
                : `mutation did not apply: find-text occurs ${obs.occurrences} times in ${e.file} (must be exactly once) — ambiguous surgery is refused, not guessed (rule 1)`,
        };
    }
    // Route (a) — STRUCTURAL redness: the mutated file does not parse, so the suite (or its import
    // chain) dies wholesale. That says nothing about the named protection. A registry mutation must
    // delete the protection while keeping the file loadable; this is a bad entry, and it wins even
    // over a red exit + a count, because that red is exactly the false signal being refused.
    if (obs.parseError !== undefined) {
        return {
            ...base,
            applied: true,
            verdict: 'MUTATION_UNPARSEABLE',
            drop: false,
            detail: `the MUTATED ${e.file} does not parse (${obs.parseError.slice(0, 160)}) — a SETUP/registry error, not a discrimination proof: whole-suite redness from a load failure is not attributable to the protection; rewrite the mutation to delete the protection while keeping the file loadable`,
        };
    }
    // Route (a′) — the run-derived file-load signal (round-6 rework): THE SUITE RUN's own output
    // reported a test FILE failing to load under the mutation. Structural redness — the mutation
    // broke the module, every count the same run produced is not attributable to the protection —
    // so this outranks every count-based verdict AND the rebaseline check, exactly like
    // MUTATION_UNPARSEABLE does. Unlike the replaced isolated-import load-check there is no second
    // environment to disagree: the signal and the count come from ONE run.
    if (obs.fileLoadFailure !== undefined) {
        return {
            ...base,
            applied: true,
            verdict: 'MUTATION_LOAD_FATAL',
            drop: false,
            detail: `the suite run reports a test FILE failing to LOAD under the mutation (${obs.fileLoadFailure.slice(0, 220)}) — structural, not behavioural: the mutation broke the module, so the redness is not attributable to the protection; rewrite the mutation to delete the protection while keeping the module evaluable`,
        };
    }
    if (obs.exitCode === null) {
        return {
            ...base,
            applied: true,
            verdict: 'INCONCLUSIVE',
            drop: false,
            detail: `suite produced NO exit code under the mutation (${obs.runFailureReason ?? 'unknown timeout / spawn failure'}) — inconclusive is a FAILURE, never a pass`,
        };
    }
    if (obs.receiptMismatch !== undefined) {
        const boundedReceipt = Array.from(obs.receiptMismatch).slice(0, 220).join('');
        return {
            ...base,
            applied: true,
            verdict: 'RECEIPT_MISMATCH',
            drop: false,
            detail: `the suite harness declared its own receipt contract violated (${boundedReceipt}) — neither this run's exit code nor its failing count may be read as discrimination; RECEIPT_MISMATCH is a FAILURE, never PROVEN`,
        };
    }
    if (obs.exitCode === 0) {
        return {
            ...base,
            applied: true,
            verdict: 'UNDEFENDED',
            drop: false,
            detail: `suite stayed GREEN with the protection deleted — property UNDEFENDED: "${e.property}" (${e.file}). The suite would not notice this protection regressing (rule 2).`,
        };
    }
    // Unrecognised output shape on a RED run — a runner-coverage gap of THIS TOOL (jest, mocha, an
    // opaque wrapper script…): structural-vs-behavioural cannot be told apart, so nothing below
    // (counts, bounds, PROVEN) may run. INCONCLUSIVE, loud, before every count-based branch.
    if (obs.outputUnrecognised !== undefined) {
        return {
            ...base,
            applied: true,
            verdict: 'INCONCLUSIVE',
            drop: false,
            detail: `suite red but the runner output is UNRECOGNISED (${obs.outputUnrecognised.slice(0, 220)}) — this tool has no classifier for the output shape, so file-load redness cannot be told from assertion redness; INCONCLUSIVE is a FAILURE, never a pass (run the gate with a node --test or vitest test command, or extend classifyRunFailure)`,
        };
    }
    // Route (b) — SPURIOUS redness: the suite went red under the mutation, but the RESTORED tree did
    // not come back green, so the suite is flaky and an unrelated neighbour may be what went red.
    // Not attributable ⇒ INCONCLUSIVE (a failure, never a pass).
    if (obs.rebaselineExitCode !== undefined && obs.rebaselineExitCode !== 0) {
        const failing = obs.rebaselineAttribution === undefined || obs.rebaselineAttribution.parsedFrom === 'unparseable'
            ? 'failing files: unparseable from runner output'
            : `failing files: ${obs.rebaselineAttribution.failingFiles.join(', ')}`;
        return {
            ...base,
            applied: true,
            verdict: 'INCONCLUSIVE',
            drop: false,
            detail: `suite red under the mutation BUT the restored baseline did not reproduce green (${obs.rebaselineExitCode === null ? `no exit code: ${obs.rebaselineFailureReason ?? 'unknown timeout / spawn failure'}` : `exit ${obs.rebaselineExitCode}`}) — mutation did not revert / flaky restored-tree route; ${failing}; the redness is not attributable to the protection`,
        };
    }
    if (obs.failingCount !== null && obs.failingCount < minFailing) {
        return {
            ...base,
            applied: true,
            verdict: 'BELOW_MIN',
            drop: false,
            detail: `suite red, but only ${obs.failingCount} failing test(s) — below the entry's own minFailing contract of ${minFailing}`,
        };
    }
    // Route (c) — the symmetric arm of the drop warning: a RELIABLE count wildly ABOVE the entry's
    // bound means the mutation broke far more than the protection's own tests (a structural blow-up
    // that still parsed — dead export surface, poisoned shared helper). Not attributable ⇒ FAILURE.
    const bound = effectiveMaxFailing(e);
    if (obs.failingCount !== null && obs.failingCount > bound) {
        return {
            ...base,
            applied: true,
            verdict: 'OVER_FAILING',
            drop: false,
            detail: `suite red with ${obs.failingCount} failing test(s) — far more than this protection's own tests (bound ${bound}${e.maxFailing !== undefined ? ', explicit maxFailing' : `, default from ${e.observed !== undefined ? `observed ${e.observed}` : `minFailing ${minFailing}`}`}); the redness is not attributable to the protection — narrow the mutation or pin maxFailing if the blast radius is genuinely this large`,
        };
    }
    const drop = obs.failingCount !== null && e.observed !== undefined && obs.failingCount < e.observed;
    return {
        ...base,
        applied: true,
        verdict: 'PROVEN',
        drop,
        detail: drop
            ? `suite red (${obs.failingCount} failing vs ${e.observed} observed when written) — COVERAGE DROP: still defended, but fewer tests notice; investigate or re-pin observed`
            : `suite red under the mutation (${obs.failingCount === null ? 'failing count unavailable — exit code is the verdict' : `${obs.failingCount} failing`}) — the test discriminates`,
    };
}
export function classifyMutationOutcome(obs) {
    const result = classifyMutationOutcomeWithoutAttemptLog(obs);
    if (obs.internalAttemptLog === undefined)
        return result;
    return { ...result, detail: `${result.detail}; ${obs.internalAttemptLog}` };
}
/** Verdicts that fail the gate. INCONCLUSIVE and NOT_APPLIED fail (inconclusive ≠ pass). */
const FAILING_VERDICTS = new Set(['UNDEFENDED', 'RECEIPT_MISMATCH', 'NOT_APPLIED', 'BELOW_MIN', 'MUTATION_UNPARSEABLE', 'MUTATION_LOAD_FATAL', 'OVER_FAILING', 'INCONCLUSIVE']);
/** Exit contract: 0 all proven · 1 any entry failed (or red baseline) · (2 = usage/setup, CLI-side). */
export function mutationGateExitCode(results, baselineOk) {
    if (!baselineOk)
        return 1;
    if (results.length === 0)
        return 1; // nothing ran ⇒ nothing proven
    return results.some((r) => FAILING_VERDICTS.has(r.verdict)) ? 1 : 0;
}
export function summarizeMutationResults(results) {
    return {
        total: results.length,
        proven: results.filter((r) => r.verdict === 'PROVEN').length,
        undefended: results.filter((r) => r.verdict === 'UNDEFENDED').length,
        receiptMismatch: results.filter((r) => r.verdict === 'RECEIPT_MISMATCH').length,
        notApplied: results.filter((r) => r.verdict === 'NOT_APPLIED').length,
        belowMin: results.filter((r) => r.verdict === 'BELOW_MIN').length,
        unparseable: results.filter((r) => r.verdict === 'MUTATION_UNPARSEABLE').length,
        loadFatal: results.filter((r) => r.verdict === 'MUTATION_LOAD_FATAL').length,
        overFailing: results.filter((r) => r.verdict === 'OVER_FAILING').length,
        inconclusive: results.filter((r) => r.verdict === 'INCONCLUSIVE').length,
        drops: results.filter((r) => r.drop).length,
        dropComparable: results.filter((r) => r.dropComparable).length,
    };
}
const VERDICT_MARK = {
    PROVEN: '✓',
    UNDEFENDED: '✗',
    RECEIPT_MISMATCH: '✗',
    NOT_APPLIED: '✗',
    BELOW_MIN: '✗',
    MUTATION_UNPARSEABLE: '✗',
    MUTATION_LOAD_FATAL: '✗',
    OVER_FAILING: '✗',
    INCONCLUSIVE: '✗',
};
export function renderMutationReport(results, baseline, packageDir) {
    const lines = [];
    lines.push(`mutation-gate: ${packageDir}`);
    lines.push(`  baseline: ${baseline.ok ? 'GREEN' : 'ERROR'} — ${baseline.detail}`);
    if (!baseline.ok)
        return lines.join('\n');
    for (const r of results) {
        const count = r.failingCount === null ? 'n/a' : String(r.failingCount);
        lines.push(`  ${VERDICT_MARK[r.verdict]} ${r.id}  applied=${r.applied ? 'yes' : 'no'}  failing=${count}  ${r.verdict}${r.drop ? ' (COVERAGE DROP)' : ''}`);
        if (r.verdict !== 'PROVEN' || r.drop)
            lines.push(`      ${r.detail}`);
    }
    const s = summarizeMutationResults(results);
    lines.push(`  summary: ${s.proven}/${s.total} proven · ${s.undefended} undefended · ${s.receiptMismatch} receipt-mismatch · ${s.notApplied} not-applied · ${s.belowMin} below-min · ${s.unparseable} unparseable · ${s.loadFatal} load-fatal · ${s.overFailing} over-failing · ${s.inconclusive} inconclusive · ${s.drops} coverage drop(s) among ${s.dropComparable}/${s.total} observed-anchored entries (a drop is undetectable without an \`observed\` anchor)`);
    lines.push(mutationGateExitCode(results, baseline.ok) === 0
        ? '  verdict: PASS — every named protection has a test that goes red when the protection is deleted'
        : '  verdict: FAIL — at least one named protection is undefended, unmutable, or unproven');
    return lines.join('\n');
}
//# sourceMappingURL=mutation-gate.js.map
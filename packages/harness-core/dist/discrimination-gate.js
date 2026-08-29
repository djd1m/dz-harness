// EPOCH: before the wave1-instrument-repair release, DISCRIMINATES_VIA_ERROR could mask absent files,
// both-rev load errors, and tip-red tests, and DISCRIMINATES could be minted without execution evidence;
// the 47 pre-epoch reports under features/ are historical and are not relabeled.
//
// Read that sentence as a dating stamp on every §42 verdict this repo has ever recorded. The pre-epoch
// gate classified an OUTCOME VALUE ('fail' ⇒ DISCRIMINATES) with no proof that a runner ever executed
// the named test: MEASURED pre-fix, `dz discrimination-check --test <a real test> --runner false --base
// HEAD --json` returned `"aggregate": "DISCRIMINATES"` (features/wave1-instrument-repair/07_code_changes/
// acid-red-runs.md, acid A6), and a file that never existed returned `DISCRIMINATES_VIA_ERROR` (acid A1).
// This module now gates every trust verdict on RECOGNIZED PROCESS-OUTPUT EVIDENCE (ADR-001): the runner's
// output must match a measured shape AND name the target. Scope honesty: that bar is "a recognized runner
// demonstrably executed the named test", NOT resistance to an output-imitating runner.
//
// §42 test-discrimination gate for feature-adr Step-8.
//
// Grounded in cve-bench/scripts/evaluate.mjs (RuvNet), whose §42 loop proves a regression test actually
// CATCHES the defect: `base+test → FAIL`, `gold+test → PASS`. feature-adr Step-8 already asserts the ADR's
// named safety property *has* a test; this gate asserts that test *discriminates* — run the property test(s)
// in an isolated git worktree at pre-feature HEAD (the "base"), and they MUST go red. A test that stays green
// without the feature diff does not exercise the property; it is a false green.
//
// This module is PURE: it plans the check (which worktree, which targets, what commands) and classifies an
// observed result. The worktree creation + test execution is I/O performed by the caller (the CLI / the
// sandboxed workflow), which feeds the observed per-target outcome back into `classifyDiscrimination`. Same
// pure-engine + injected-data shape as challenge-panel.ts and routing-outcomes.ts, so it is deterministic and
// unit-testable without a git repo or a test runner.
import { classifyRunFailure, countFailingTests, detectRunnerKind } from './mutation-gate.js';
/**
 * The CLOSED verdict vocabulary, as DATA (QE F6).
 *
 * Derived from an exhaustive `Record<DiscriminationVerdict, true>`, so the exactness is enforced by
 * `tsc` at BUILD time in both directions: adding a union member fails with "Property '<new>' is
 * missing", removing one fails with "does not exist in type". A runtime sweep can only show which
 * values are REACHABLE — it can never see an eighth value that nothing happens to construct, which
 * is exactly the hole the ADR-002 Confirmation-1 gate had. This list closes it and is exported so
 * the release gate can compare "declared" against "reachable" instead of a hand-written literal.
 *
 * (The test directory is excluded from this package's tsconfig, so a `satisfies` written in a test
 * file would never be compiled. The guard has to live here to be real.)
 */
const DISCRIMINATION_VERDICT_SET = {
    DISCRIMINATES: true,
    DISCRIMINATES_VIA_ERROR: true,
    NON_DISCRIMINATING: true,
    CANNOT_ISOLATE: true,
    TEST_FILE_ABSENT: true,
    LOAD_ERROR_AT_BOTH_REVS: true,
    FAILS_AT_TIP: true,
};
export const DISCRIMINATION_VERDICTS = Object.keys(DISCRIMINATION_VERDICT_SET);
/** The closed degradation vocabulary, same exhaustive-record discipline. */
const CANNOT_ISOLATE_REASON_SET = {
    'no-execution-evidence': true,
    'unrecognised-runner-output': true,
    'no-tests-executed': true,
    'inconsistent-evidence': true,
    'tip-control-missing': true,
    'tip-evidence-missing': true,
    timeout: true,
};
export const CANNOT_ISOLATE_REASONS = Object.keys(CANNOT_ISOLATE_REASON_SET);
/** git-ref-safe characters only; rejects shell metacharacters and traversal that would break out of a token. */
const SAFE_REF = /^[A-Za-z0-9_][A-Za-z0-9_./~^@{}-]{0,199}$/;
/**
 * A repo-relative test path. Rejects: absolute / drive / `~`; a `..` segment; a segment starting with `-`
 * (would become an argv option like `--config` injected into the runner); whitespace (word-splitting); and any
 * NUL/backtick/quote/backslash/shell metacharacter. Deliberately strict — a property test path is a plain
 * relative file, and anything exotic is safer rejected (and surfaced) than quoted-and-hoped.
 */
const UNSAFE_PATH = /(^\/)|(^[A-Za-z]:)|(^~)|(^-)|(\/-)|(\.\.(\/|\\|$))|[\0`$;&|<>*?"'\n\r\t \\]/;
const DEFAULT_RUNNER = 'npx vitest run';
/** a runner must be a plain command with flags — no shell metacharacters that could chain a second command. */
const UNSAFE_RUNNER = /[\0`$;&|<>()\n\r]/;
function sanitizeName(name) {
    // a test-name filter is passed as a single-quoted argv; forbid the quote/metacharacters that would escape it.
    if (name.length === 0 || name.length > 200)
        return null;
    if (/[\0`$;&|<>*?"'\n\r\\]/.test(name))
        return null;
    return name;
}
/**
 * Plan the discrimination check. Pure: validates inputs, drops unsafe refs (never silently), and emits the
 * ordered worktree commands. Returns `runnable:false` with a reason when there is nothing safe to run.
 */
export function planDiscriminationCheck(input) {
    const baseRef = typeof input.baseRef === 'string' ? input.baseRef.trim() : '';
    const rejected = [];
    if (!SAFE_REF.test(baseRef)) {
        return { runnable: false, reason: 'unsafe-or-missing-base-ref', baseRef, targets: [], rejected, commands: [] };
    }
    const runnerRaw = typeof input.runner === 'string' && input.runner.trim() ? input.runner.trim() : DEFAULT_RUNNER;
    const runner = UNSAFE_RUNNER.test(runnerRaw) ? DEFAULT_RUNNER : runnerRaw;
    const targets = [];
    const seen = new Set();
    for (const t of Array.isArray(input.propertyTests) ? input.propertyTests : []) {
        const file = t && typeof t.file === 'string' ? t.file.trim() : '';
        if (!file) {
            rejected.push({ file: String(t?.file ?? ''), reason: 'empty-path' });
            continue;
        }
        if (UNSAFE_PATH.test(file)) {
            rejected.push({ file, reason: 'unsafe-path' });
            continue;
        }
        const name = t && typeof t.name === 'string' ? sanitizeName(t.name) : null;
        if (t && typeof t.name === 'string' && name === null) {
            rejected.push({ file, reason: 'unsafe-test-name' });
            continue;
        }
        const key = `${file}|${name ?? ''}`;
        if (seen.has(key))
            continue;
        seen.add(key);
        targets.push(name !== null ? { file, name } : { file });
    }
    if (targets.length === 0) {
        return { runnable: false, reason: 'no-isolable-test', baseRef, targets, rejected, commands: [] };
    }
    // `{{WORKTREE}}` is substituted by the caller with a temp dir IT owns; the engine never invents a path.
    // Paths are already metacharacter-free (UNSAFE_PATH), but quote them + use `--` so a leading-dash or spaced
    // path can never become a runner option or split a word — belt-and-suspenders over the sanitation above.
    const commands = [`git worktree add --detach {{WORKTREE}} ${baseRef}`];
    for (const t of targets) {
        commands.push(`mkdir -p "{{WORKTREE}}/$(dirname -- '${t.file}')" && cp -- '${t.file}' "{{WORKTREE}}/${t.file}"`);
    }
    const fileArgs = [...new Set(targets.map((t) => t.file))].map((f) => `'${f}'`).join(' ');
    const nameFilters = targets.filter((t) => t.name).map((t) => `-t '${t.name}'`).join(' ');
    commands.push(`( cd {{WORKTREE}} && ${runner}${nameFilters ? ' ' + nameFilters : ''} -- ${fileArgs} )`);
    commands.push(`git worktree remove --force {{WORKTREE}}`);
    return { runnable: true, baseRef, targets, rejected, commands };
}
// ── Evidence production (ADR-001's root-disease fix) ─────────────────────────────────────────
/** ANSI SGR sequences. vitest colours its summary even when piped (MEASURED), which would hide the
 *  target path and the green summary from every check below. Terminal encoding, not a runner shape —
 *  the runner-shape regex family stays single-sourced in mutation-gate.ts (ADR-001 driver). */
// eslint-disable-next-line no-control-regex
const SGR = /\x1b\[[0-9;]*m/g;
/**
 * Tests EXECUTED in a GREEN run, from the runner's own summary. The green counterpart of
 * mutation-gate's `countFailingTests`: `classifyRunFailure` classifies RED runs only (its green
 * branch returns a red-worded `'unrecognised'`, mutation-gate.ts:404-411), so the ADR's pass bar
 * — "≥ 1 test actually executed" — cannot be answered by delegating a green run to it (H3).
 * Returns null when nothing parses; null NEVER counts as ≥ 1 (a `--passWithNoTests` / `--runner true`
 * green is not an established false green — misdiagnosing it sends the operator to strengthen a test
 * when the RUNNER is broken).
 */
function countExecutedTests(rawOutput) {
    const output = rawOutput.replace(SGR, '');
    // node --test / TAP: `# pass N` is authoritative; `# tests N` is the total when pass is absent.
    const tapPass = /^#\s*pass\s+(\d+)\s*$/m.exec(output);
    if (tapPass && tapPass[1] !== undefined)
        return Number(tapPass[1]);
    const tapTests = /^#\s*tests\s+(\d+)\s*$/m.exec(output);
    if (tapTests && tapTests[1] !== undefined)
        return Number(tapTests[1]);
    // vitest: the `Tests` line, NOT `Test Files` (a file count under-reports the executed tests).
    const vitest = /^\s*Tests\s+[^|\n]*?(\d+)\s+passed/m.exec(output);
    if (vitest && vitest[1] !== undefined)
        return Number(vitest[1]);
    return null;
}
/** mutation-gate's internal `'unknown'` is the PUBLISHED `'unrecognised'` here (H2). */
function toEvidenceRunner(kind) {
    return kind === 'unknown' ? 'unrecognised' : kind;
}
/**
 * Classify ONE captured run into RECOGNIZED PROCESS-OUTPUT EVIDENCE. This is the function the
 * pre-epoch gate did not have: it answers "did a runner I can read demonstrably execute THIS file?"
 * instead of trusting the caller's outcome word. Three branches, exactly as ADR-001 specifies:
 *
 *   exitCode === null  the run timed out or never spawned — nothing is known. No bar accepts it,
 *                      so the row degrades to CANNOT_ISOLATE reason 'timeout' (same posture as
 *                      mutation-gate.ts:549 — a hung runner is a loud non-answer, never a pass).
 *   exitCode === 0     green: runner from the output SHAPE, failureKind 'none', testsExecuted from
 *                      the green summary.
 *   exitCode !== 0     red: delegate to classifyRunFailure — the SAME classifier that replaced
 *                      mutation-gate's ad-hoc regexes, so load-vs-assert is decided once per repo.
 *
 * `targetSeen` is a plain substring test over the SGR-stripped output: the bar is target IDENTITY
 * ("the output names the file we asked about"), not authorship. No resistance to an output-imitating
 * runner is claimed (ADR-001 Consequences, hole b) — the honest, narrowed contract.
 */
export function classifyExecutionEvidence(rawOutput, exitCode, targetFile) {
    if (exitCode === null) {
        return { exitCode: null, runner: 'unrecognised', failureKind: 'unrecognised', testsExecuted: null, targetSeen: false };
    }
    const raw = typeof rawOutput === 'string' ? rawOutput : '';
    const targetSeen = typeof targetFile === 'string' && targetFile.length > 0 && raw.replace(SGR, '').includes(targetFile);
    if (exitCode === 0) {
        return {
            exitCode,
            runner: toEvidenceRunner(detectRunnerKind(raw)),
            failureKind: 'none',
            testsExecuted: countExecutedTests(raw),
            targetSeen,
        };
    }
    const red = classifyRunFailure(raw);
    const base = {
        exitCode,
        runner: toEvidenceRunner(red.runner),
        failureKind: red.kind,
        testsExecuted: countFailingTests(raw),
        targetSeen,
    };
    // exactOptionalPropertyTypes: an absent evidence line is OMITTED, never set to undefined.
    return red.evidence !== undefined ? { ...base, evidenceLine: red.evidence } : base;
}
const EVIDENCED = { evidenced: true };
function degraded(reason) {
    return { evidenced: false, reason };
}
/**
 * Is this observation EVIDENCED? Applied to the base observation and (independently) to the tip
 * control, BEFORE any verdict combination — uniform precedence, uniquely implementable: no verdict,
 * trust OR alarm, fires from an unevidenced runner constituent.
 *
 * PARSE-NEVER-SYNTHESIZE: an outcome value CONTRADICTED by its own evidence (`fail` + `file-load`,
 * `error` + `assertions`, `pass` + a non-zero exit, and — symmetrically — any RED outcome with
 * exit 0) is REJECTED as 'inconsistent-evidence' and never
 * reinterpreted to the evidence-implied outcome. Guessing which half to trust would re-open exactly
 * the value-trusting hole this rewrite closes — a caller whose value and observation disagree is a
 * broken executor, and a broken executor is a non-answer.
 */
function gateObservation(outcome, evidence) {
    if (!evidence || typeof evidence !== 'object')
        return degraded('no-execution-evidence');
    if (evidence.exitCode === null)
        return degraded('timeout');
    if (evidence.runner === 'unrecognised')
        return degraded('unrecognised-runner-output');
    if (outcome === 'pass') {
        if (evidence.exitCode !== 0)
            return degraded('inconsistent-evidence');
        if (evidence.failureKind !== 'none')
            return degraded('inconsistent-evidence');
        // null testsExecuted is NOT ≥ 1: an unparseable summary proves no test ran (driver 3).
        if (evidence.testsExecuted === null || evidence.testsExecuted < 1)
            return degraded('no-tests-executed');
        if (!evidence.targetSeen)
            return degraded('no-execution-evidence');
        return EVIDENCED;
    }
    if (outcome === 'fail') {
        // QE F1: a RED outcome with exit 0 is an inconsistent tuple, symmetrically with `pass` + a
        // non-zero exit. The exit code is the runner's own primary verdict; a caller reporting "it
        // failed" over a process that exited SUCCESSFULLY is a broken executor, and accepting it let a
        // fabricated evidence object mint DISCRIMINATES (MEASURED: `{outcome:'fail', evidence:
        // {exitCode:0, runner:'vitest', failureKind:'assertions', testsExecuted:1, targetSeen:true}}`
        // returned aggregate DISCRIMINATES, measurementValid true).
        if (evidence.exitCode === 0)
            return degraded('inconsistent-evidence');
        if (evidence.failureKind === 'file-load' || evidence.failureKind === 'none')
            return degraded('inconsistent-evidence');
        // a RECOGNIZED runner whose red output carries no classifiable failure: the redness has no
        // readable source, so it is the same non-answer as an unreadable runner.
        if (evidence.failureKind === 'unrecognised')
            return degraded('unrecognised-runner-output');
        if (!evidence.targetSeen)
            return degraded('no-execution-evidence');
        return EVIDENCED;
    }
    // outcome === 'error' — the bar is recognized FILE-LOAD redness. targetSeen is not required: a
    // module that dies at import can legitimately be reported by the importing suite's name.
    // QE F1: same exit-code symmetry as the fail branch — a run that exited 0 did not error.
    if (evidence.exitCode === 0)
        return degraded('inconsistent-evidence');
    if (evidence.failureKind === 'assertions' || evidence.failureKind === 'none')
        return degraded('inconsistent-evidence');
    if (evidence.failureKind === 'unrecognised')
        return degraded('unrecognised-runner-output');
    return EVIDENCED;
}
function cannotIsolate(reason) {
    return { verdict: 'CANNOT_ISOLATE', reason };
}
/**
 * One row → one verdict. Reading order IS the matrix's precedence: absence (layer-1 stat, the one
 * principled evidence exemption — no runner ran, so none is applicable), then the base gate, then
 * — only for an EVIDENCED base error — the tip control.
 *
 * The tip is consulted ONLY under an evidenced base error. Without a classified tip redness,
 * LOAD_ERROR_AT_BOTH_REVS and FAILS_AT_TIP cannot be told apart, so claiming either would synthesize.
 */
function classifyRow(row) {
    if (row === undefined)
        return cannotIsolate('no-execution-evidence');
    if (row.outcome === 'absent')
        return { verdict: 'TEST_FILE_ABSENT' };
    const baseGate = gateObservation(row.outcome, row.evidence);
    if (!baseGate.evidenced)
        return cannotIsolate(baseGate.reason);
    if (row.outcome === 'fail')
        return { verdict: 'DISCRIMINATES' };
    if (row.outcome === 'pass')
        return { verdict: 'NON_DISCRIMINATING' };
    // EVIDENCED base error — the only cell where the tip control decides.
    if (row.tipOutcome === undefined)
        return cannotIsolate('tip-control-missing');
    const tipGate = gateObservation(row.tipOutcome, row.tipEvidence);
    if (!tipGate.evidenced) {
        // a tip that TIMED OUT is named as such; every other unevidenced tip is 'tip-evidence-missing'.
        return cannotIsolate(tipGate.reason === 'timeout' ? 'timeout' : 'tip-evidence-missing');
    }
    if (row.tipOutcome === 'pass')
        return { verdict: 'DISCRIMINATES_VIA_ERROR' };
    if (row.tipOutcome === 'error')
        return { verdict: 'LOAD_ERROR_AT_BOTH_REVS' };
    return { verdict: 'FAILS_AT_TIP' };
}
/**
 * Severity rank for the compat aggregate. The unestablished band's ordering (5 > 4 > 3 > 2) is
 * unchanged from the original decision: absence of the instrument's subject (a broken promise —
 * the historically exploited channel) outranks an active misconfiguration, which outranks positive
 * evidence of a currently-red named check, which outranks mere absence of an observation.
 */
const RANK = {
    NON_DISCRIMINATING: 6,
    TEST_FILE_ABSENT: 5,
    LOAD_ERROR_AT_BOTH_REVS: 4,
    FAILS_AT_TIP: 3,
    CANNOT_ISOLATE: 2,
    DISCRIMINATES_VIA_ERROR: 1,
    DISCRIMINATES: 0,
};
/** Verdicts that mean the instrument MEASURED (even when the news is bad). */
const ESTABLISHED = ['DISCRIMINATES', 'DISCRIMINATES_VIA_ERROR', 'NON_DISCRIMINATING'];
const SEVERITY_OF = {
    NON_DISCRIMINATING: 'high',
    TEST_FILE_ABSENT: 'high',
    LOAD_ERROR_AT_BOTH_REVS: 'high',
    FAILS_AT_TIP: 'high',
    CANNOT_ISOLATE: 'high', // was info pre-epoch: a degraded reading that reads advisory gets ignored.
    DISCRIMINATES_VIA_ERROR: 'info',
    DISCRIMINATES: 'info',
};
const TITLE_OF = {
    NON_DISCRIMINATING: 'non-discriminating property test (false green)',
    TEST_FILE_ABSENT: 'named property test is not a regular file',
    LOAD_ERROR_AT_BOTH_REVS: 'property test could not execute at EITHER rev (zero signal)',
    FAILS_AT_TIP: "the feature's own property test is RED with the feature present",
    CANNOT_ISOLATE: 'discrimination could not be established (degraded reading)',
    DISCRIMINATES_VIA_ERROR: 'discrimination inferred via load error',
    DISCRIMINATES: '',
};
const ACTION_OF = {
    NON_DISCRIMINATING: 'strengthen-test',
    TEST_FILE_ABSENT: 'create-missing-test',
    LOAD_ERROR_AT_BOTH_REVS: 'fix-runner-invocation',
    FAILS_AT_TIP: 'fix-red-feature-test',
    CANNOT_ISOLATE: 'fix-runner-invocation',
    DISCRIMINATES_VIA_ERROR: 'none',
    DISCRIMINATES: 'none',
};
function describe(p) {
    const named = p.name ? `${p.file} (${p.name})` : p.file;
    return p.reason ? `${named} [reason: ${p.reason}]` : named;
}
function detailFor(verdict, rows, extra) {
    const list = rows.map(describe).join(', ');
    const tail = extra.length > 0 ? ` ${extra.join(' ')}` : '';
    switch (verdict) {
        case 'NON_DISCRIMINATING':
            return `${rows.length} property test(s) PASS at pre-feature base WITH execution evidence — they do not exercise the ADR safety property and would stay green if the fix regressed: ${list}. Action: strengthen-test (make the assertion fail without the feature diff). (Advisory — the pipeline continues; the owner decides.)`;
        case 'TEST_FILE_ABSENT':
            return `the named check is not a regular file in the working tree (stat + isFile, before any worktree): ${list}.${tail} Action: create-missing-test — an ADR Confirmation naming a file that does not exist is a broken promise, never a pass.`;
        case 'LOAD_ERROR_AT_BOTH_REVS':
            return `the test errored at the pre-feature base AND at tip: ${list}. The instrument could not execute it at either rev, so the reading carries ZERO signal about discrimination. Action: fix-runner-invocation (wrong runner for this file type, or a broken config).`;
        case 'FAILS_AT_TIP':
            return `the test errored at base and fails BY ASSERTION at tip: ${list}. The feature's own property test is red with the feature present, so discrimination is unestablishable. Action: fix-red-feature-test — grade the feature code accordingly.`;
        case 'CANNOT_ISOLATE':
            return `no ESTABLISHED observation for: ${list}. A degraded reading is not a pass and not a failure — it means the instrument did not measure. Action: map-a-test when no test was mapped/ran, otherwise fix-runner-invocation.`;
        case 'DISCRIMINATES_VIA_ERROR':
            return `the property test could not LOAD at pre-feature base and PASSES at tip, both with execution evidence: ${list}. Discrimination is INFERRED from that pair, not proven by an assertion — acceptable, but a green-path assertion would be stronger.`;
        default:
            return '';
    }
}
/**
 * Classify observed base outcomes (+ evidence + the tip control) into per-test verdicts, the compat
 * aggregate, the full findings[] list, and the two orthogonal axes.
 *
 * Every constituent is evidence-gated FIRST; verdict combination is consulted only over EVIDENCED
 * constituents. Old callers that pass bare outcome values (no evidence, no tipOutcome) therefore
 * degrade to a loud CANNOT_ISOLATE — never to a near-pass and never to a false DISCRIMINATES. That
 * runtime behavior change for compiling callers is the ADR-002 headline, not a side effect.
 */
export function classifyDiscrimination(input) {
    const results = Array.isArray(input.results) ? input.results : [];
    const byKey = new Map();
    for (const r of results) {
        if (r && typeof r.file === 'string')
            byKey.set(`${r.file}|${r.name ?? ''}`, r);
    }
    const propertyTests = Array.isArray(input.propertyTests) ? input.propertyTests : [];
    if (propertyTests.length === 0) {
        // No mapped test at all: the instrument has no subject. HIGH, because a degraded reading that
        // renders as advisory is the one an operator skips.
        const finding = {
            severity: 'high',
            verdict: 'CANNOT_ISOLATE',
            files: [],
            title: 'discrimination gate: no property test to check',
            detail: 'No test was mapped to the ADR safety property, so discrimination could not be evaluated — this is the existing "property untested" finding. Action: map-a-test.',
        };
        return { perTest: [], aggregate: 'CANNOT_ISOLATE', finding, findings: [finding], measurementValid: false, primaryAction: 'map-a-test' };
    }
    let missingRow = false;
    const perTest = propertyTests.map((t) => {
        const file = typeof t.file === 'string' ? t.file : '';
        const name = typeof t.name === 'string' ? t.name : undefined;
        const row = byKey.get(`${file}|${name ?? ''}`);
        if (row === undefined)
            missingRow = true;
        const rv = classifyRow(row);
        // exactOptionalPropertyTypes: `name`/`reason` are OMITTED when absent, never set to undefined.
        const base = name !== undefined ? { file, name, verdict: rv.verdict } : { file, verdict: rv.verdict };
        return rv.reason !== undefined ? { ...base, reason: rv.reason } : base;
    });
    let aggregate = 'DISCRIMINATES';
    for (const p of perTest)
        if (RANK[p.verdict] > RANK[aggregate])
            aggregate = p.verdict;
    // findings[]: ONE per distinct non-clean verdict present, worst-first. The scalar aggregate can
    // only name the worst state; a corpus with a false green AND an absent file must report BOTH.
    const distinct = [...new Set(perTest.map((p) => p.verdict))]
        .filter((v) => v !== 'DISCRIMINATES')
        .sort((a, b) => RANK[b] - RANK[a]);
    const findings = distinct.map((verdict) => {
        const rows = perTest.filter((p) => p.verdict === verdict);
        // the CLI reports a directory-at-the-path out of band (absent rows never consult the evidence
        // gate, matrix row 1), so its `not-a-regular-file` note rides into the finding detail here.
        const extra = verdict === 'TEST_FILE_ABSENT'
            ? [
                ...new Set(rows
                    .map((p) => byKey.get(`${p.file}|${p.name ?? ''}`)?.evidence?.evidenceLine)
                    .filter((l) => typeof l === 'string' && l.length > 0)),
            ]
            : [];
        return {
            severity: SEVERITY_OF[verdict],
            verdict,
            files: rows.map((p) => p.file),
            title: TITLE_OF[verdict],
            detail: detailFor(verdict, rows, extra),
        };
    });
    const established = perTest.filter((p) => ESTABLISHED.includes(p.verdict)).length;
    const measurementValid = established === perTest.length ? true : established === 0 ? false : 'partial';
    // primaryAction: the worst-ranked verdict's action. CANNOT_ISOLATE splits — a target with no
    // mapped/observed row is a MAPPING repair; every other degradation is an INVOCATION repair.
    const primaryAction = aggregate === 'CANNOT_ISOLATE' && missingRow ? 'map-a-test' : ACTION_OF[aggregate];
    return { perTest, aggregate, finding: findings[0] ?? null, findings, measurementValid, primaryAction };
}
//# sourceMappingURL=discrimination-gate.js.map
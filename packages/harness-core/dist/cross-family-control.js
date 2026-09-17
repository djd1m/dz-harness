/**
 * cross-family-control-branch (ADR-001, tier M): the pure core of `dz control-review` and
 * `dz score --by-family` — normalization, matching, diffing and ledger aggregation for the
 * measurement of foreign-unique findings between two INDEPENDENT reviews of the same tree.
 *
 * PURE, deliberately: no node:fs / node:child_process import here (NFR-1, guarded by
 * test/core-boundary.test.ts). Every file read, subprocess spawn or hash computation belongs to
 * the CLI (`dz control-review`), same as every other core module (qe-findings.ts, qe-bridge.ts).
 *
 * Context (ADR-001): every review in the run-cost ledger and every qe-bridge signoff is ONE
 * direction over one tree — there was no observation of whether the OTHER family finds what the
 * coder's own family misses. This module answers that by diffing two closed-vocabulary finding
 * lists (Codex's `## Findings ledger` table, Claude's qe-bridge signoff) over the SAME scope.
 *
 * ── Fix round 1 (codex-r1-verdict.txt, Grade C, 17 findings) — the vocabulary shift ──────────────
 * Round 1 called an automatic title/location match "matched" — an OVERLAP claim. Codex r1 finding 1
 * proved that claim false with two real counter-examples (a 4/6-token false pair; two unrelated
 * findings in the same file three lines apart). The fix is not a smarter matcher — a smarter matcher
 * still guesses — it is an honest vocabulary: automatic pairs are **candidates**, never overlap.
 * Only a human adjudication produces a **confirmed** pair. Every output (`ControlDiff`, the ledger
 * row, `dz score --by-family`) now keeps FOUR buckets apart: `confirmed`, `candidate`, `onlyCodex`,
 * `onlyClaude` — and the word "overlap"/"matched" is reserved for `confirmed` alone.
 */
import { QE_SEVERITIES } from './qe-findings.js';
/* ── D1: severity normalization (A4) ─────────────────────────────────────────────────────────── */
/**
 * The Codex control brief and the Claude qe-bridge signoff both speak the informal
 * critical/major/minor vocabulary (`buildBridgePrompt`'s own brief text: "a severity
 * (critical/major/minor)"). This maps that vocabulary onto the CLOSED `QeSeverity` dictionary
 * qe-findings.ts already defines — `critical`→`CRITICAL`, `major`→`HIGH`, `minor`→`LOW` — and
 * refuses (returns `null`) anything else, case/whitespace-insensitive. The CALLER decides what a
 * refusal means (A4: the finding is written into a `refused` bucket with a named reason, never
 * coerced to the nearest known value — coercion here would make the resulting severity tally
 * unprovable, the same argument qe-findings.ts already makes for its own closed dictionaries).
 */
export function normalizeBridgeSeverity(s) {
    const t = String(s ?? '').trim().toLowerCase();
    if (t === 'critical')
        return 'CRITICAL';
    if (t === 'major')
        return 'HIGH';
    if (t === 'minor')
        return 'LOW';
    return null;
}
/* ── D2: title normalization + matching (A5, A7) ─────────────────────────────────────────────── */
/**
 * Lowercase, strip punctuation/backticks (anything that is not a Unicode letter or digit becomes
 * a separator), split on whitespace, keep tokens of length >= 3, deduplicate, sort. The resulting
 * token SET is what `matchFindings`/`dedupeWithinFamily` compare with Jaccard similarity — a
 * bag-of-words match, not a substring one, so word order never matters.
 */
export function normalizeFindingTitle(t) {
    const cleaned = String(t ?? '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ');
    const tokens = cleaned.split(/\s+/).filter((w) => w.length >= 3);
    return [...new Set(tokens)].sort();
}
function jaccard(a, b) {
    if (a.length === 0 || b.length === 0)
        return 0;
    const sa = new Set(a);
    const sb = new Set(b);
    let inter = 0;
    for (const w of sa)
        if (sb.has(w))
            inter++;
    const union = new Set([...sa, ...sb]).size;
    return union === 0 ? 0 : inter / union;
}
/** Two findings are a compatible location for matching purposes when at least one names no file
 *  (nothing to contradict), or both name the SAME file. Two findings that each name a DIFFERENT
 *  file are never compatible — r1-1/r1-3's shared premise: a file is corroborating evidence only
 *  when it agrees; disagreeing file names are disqualifying, not merely uninformative. */
function filesCompatible(fa, fb) {
    return fa === undefined || fb === undefined || fa === fb;
}
/**
 * Solves the small assignment problem (Kuhn–Munkres / Hungarian algorithm, O(rows²·cols)) that
 * finds the MINIMUM total cost perfect assignment of every row to a distinct column, `rows <=
 * cols`. Every row/column is real — including a "column" a row is assigned to on the cost-matrix
 * even where there is no genuine candidate — so the CALLER decides which assignments are real
 * matches (this function has no notion of "no match", only of cost).
 */
function hungarianMinCost(cost) {
    const rows = cost.length;
    const cols = rows === 0 ? 0 : cost[0].length;
    if (rows === 0 || cols === 0)
        return [];
    const INF = Number.POSITIVE_INFINITY;
    const u = new Array(rows + 1).fill(0);
    const v = new Array(cols + 1).fill(0);
    const p = new Array(cols + 1).fill(0); // p[j] = 1-based row assigned to column j (0 = none)
    const way = new Array(cols + 1).fill(0);
    for (let i = 1; i <= rows; i++) {
        p[0] = i;
        let j0 = 0;
        const minv = new Array(cols + 1).fill(INF);
        const used = new Array(cols + 1).fill(false);
        do {
            used[j0] = true;
            const i0 = p[j0];
            let delta = INF;
            let j1 = -1;
            for (let j = 1; j <= cols; j++) {
                if (used[j])
                    continue;
                const cur = cost[i0 - 1][j - 1] - u[i0] - v[j];
                if (cur < minv[j]) {
                    minv[j] = cur;
                    way[j] = j0;
                }
                if (minv[j] < delta) {
                    delta = minv[j];
                    j1 = j;
                }
            }
            for (let j = 0; j <= cols; j++) {
                if (used[j]) {
                    u[p[j]] = u[p[j]] + delta;
                    v[j] = v[j] - delta;
                }
                else
                    minv[j] = minv[j] - delta;
            }
            j0 = j1;
        } while (p[j0] !== 0);
        do {
            const j1 = way[j0];
            p[j0] = p[j1];
            j0 = j1;
        } while (j0 !== 0);
    }
    const result = new Array(rows).fill(-1);
    for (let j = 1; j <= cols; j++) {
        const r = p[j];
        if (r > 0)
            result[r - 1] = j - 1;
    }
    return result;
}
/**
 * Deterministic MAXIMUM-CARDINALITY matching between two finding lists, sum-of-score as the
 * secondary objective (ADR-001, amended after Codex r1 finding 2 — greedy-by-score needlessly
 * drops valid pairs: titles `A1/B1="alpha beta gamma delta"`, `A2="gamma delta"`,
 * `B2="alpha beta"` greedily keep only A1–B1 and lose two genuine pairs A1–B2/A2–B1).
 *
 * Solved as a weighted bipartite ASSIGNMENT (Hungarian): a real candidate edge costs
 * `-(BONUS + score)` with `BONUS = 1 + min(rows, cols)`; a non-candidate edge costs `0`. Lead delta
 * after Codex r2 (new HIGH #1): a bonus of `1` did NOT make cardinality dominant — two score-1 edges
 * (weight 4) beat three score-0.25 edges (weight 3.75). Since every score is <= 1, the total score of
 * ANY matching is < min(rows, cols) + 1 = BONUS, so one extra edge always outweighs any score
 * difference: cardinality first, total score second, in one assignment.
 *
 * Two rules propose CANDIDATES (never confirmed overlap — Codex r1 finding 1: an automatic pair,
 * however matched, is a candidate for lead adjudication, printed as such everywhere it travels):
 *  - title Jaccard >= `opts.jaccard` (default 0.5) on tokens of length >= 3, AND a compatible file
 *    (r1-1: a file that DISAGREES between the two findings disqualifies an otherwise-good title
 *    match — two findings about the "same" defect in two different files are two defects);
 *  - same file with `|line delta| <= opts.lineSlack` (default 3) AND title Jaccard >=
 *    `opts.fileLineJaccard` (default 0.2) — r1-1's second counter-example: same file, adjacent
 *    lines, ZERO shared vocabulary used to pair for free; a location match now needs SOME
 *    corroborating text, not just proximity.
 * A pair meeting neither rule's threshold is never proposed — "below-threshold titles stay
 * unique" remains the load-bearing property this module protects.
 */
export function matchFindings(a, b, opts) {
    if (a.length === 0 || b.length === 0)
        return { pairs: [] };
    const jaccardThreshold = opts?.jaccard ?? 0.5;
    const lineSlack = opts?.lineSlack ?? 3;
    const fileLineJaccardThreshold = opts?.fileLineJaccard ?? 0.2;
    // Canonical id order: any residual tie in the assignment algorithm then resolves the same way
    // every run (determinism), favoring the earliest-scanned column for a tied minimum delta.
    const sa = [...a].sort((x, y) => (x.id < y.id ? -1 : x.id > y.id ? 1 : 0));
    const sb = [...b].sort((x, y) => (x.id < y.id ? -1 : x.id > y.id ? 1 : 0));
    const titleA = sa.map((f) => normalizeFindingTitle(f.title));
    const titleB = sb.map((f) => normalizeFindingTitle(f.title));
    const best = [];
    for (let i = 0; i < sa.length; i++) {
        const row = [];
        const fa = sa[i];
        for (let j = 0; j < sb.length; j++) {
            const fb = sb[j];
            const jscore = jaccard(titleA[i], titleB[j]);
            let candidate = null;
            if (jscore >= jaccardThreshold && filesCompatible(fa.file, fb.file)) {
                candidate = { rule: 'title-jaccard', score: jscore };
            }
            if (fa.file !== undefined && fb.file !== undefined && fa.file === fb.file && fa.line !== undefined && fb.line !== undefined) {
                const dl = Math.abs(fa.line - fb.line);
                if (dl <= lineSlack && jscore >= fileLineJaccardThreshold) {
                    const flScore = 1 - dl / (lineSlack + 1);
                    if (candidate === null || flScore > candidate.score)
                        candidate = { rule: 'file-line', score: flScore };
                }
            }
            row.push(candidate);
        }
        best.push(row);
    }
    const n = sa.length;
    const m = sb.length;
    const rowsAreA = n <= m;
    const rows = rowsAreA ? n : m;
    const cols = rowsAreA ? m : n;
    const cardinalityBonus = 1 + Math.min(rows, cols);
    const cost = [];
    for (let r = 0; r < rows; r++) {
        const costRow = [];
        for (let c = 0; c < cols; c++) {
            const cand = rowsAreA ? best[r][c] : best[c][r];
            costRow.push(cand ? -(cardinalityBonus + cand.score) : 0);
        }
        cost.push(costRow);
    }
    const assignment = hungarianMinCost(cost);
    const pairs = [];
    for (let r = 0; r < rows; r++) {
        const c = assignment[r];
        if (c < 0)
            continue;
        const cand = rowsAreA ? best[r][c] : best[c][r];
        if (cand === null || cand === undefined)
            continue; // assigned to a zero-cost filler — no real match
        const ai = rowsAreA ? r : c;
        const bi = rowsAreA ? c : r;
        pairs.push({ a: sa[ai].id, b: sb[bi].id, rule: cand.rule, score: cand.score });
    }
    pairs.sort((x, y) => (x.a < y.a ? -1 : x.a > y.a ? 1 : x.b < y.b ? -1 : x.b > y.b ? 1 : 0));
    return { pairs };
}
/**
 * A5: collapse near-duplicate findings WITHIN one reviewer's own list (Jaccard >= 0.8 on titles,
 * a tighter threshold than cross-family matching since these are the SAME reviewer restating
 * itself, e.g. across multiple table rows). The first occurrence in list order is kept; every
 * later near-duplicate is recorded in `collapsed` rather than silently dropped.
 *
 * r1-3 (Codex r1 finding 3): collapsing on title tokens ALONE let two DISTINCT defects with the
 * same generic title ("missing null check in parser") in two different files collapse into one —
 * a real defect silently lost. A location disagreement now blocks the collapse: two findings only
 * collapse when their files are COMPATIBLE (both absent, or identical) — same rule `matchFindings`
 * applies across families, applied here within one.
 */
export function dedupeWithinFamily(list, jaccardThreshold = 0.8) {
    const kept = [];
    const collapsed = [];
    for (const f of list) {
        const ft = normalizeFindingTitle(f.title);
        let dupOf = null;
        for (const k of kept) {
            if (jaccard(ft, normalizeFindingTitle(k.title)) >= jaccardThreshold && filesCompatible(f.file, k.file)) {
                dupOf = k;
                break;
            }
        }
        if (dupOf !== null)
            collapsed.push({ kept: dupOf.id, dropped: f.id });
        else
            kept.push(f);
    }
    return { kept, collapsed };
}
const MATCH_RULE_LABEL = 'CANDIDATE only (confirmed requires adjudication): title-jaccard>=0.5 with compatible file | ' +
    'same file+line±3 AND jaccard>=0.2';
function bySeverityCounts(list) {
    const out = {};
    for (const f of list)
        out[f.severity] = (out[f.severity] ?? 0) + 1;
    return out;
}
/** Duplicate ids WITHIN one family's raw list are an identity error, not a matching problem
 *  (Codex r1 finding 4: `new Map(...)` used to silently keep only the LATER of two same-id
 *  findings, discarding the first without a trace). Checked before dedupe, on the raw list. */
function findDuplicateId(list) {
    const seen = new Set();
    for (const f of list) {
        if (seen.has(f.id))
            return f.id;
        seen.add(f.id);
    }
    return null;
}
const NONE_ENTRY_RE = /^(codex|claude):(.+)$/;
export function diffFamilyFindings(codex, claude, adjudication) {
    const dupCodex = findDuplicateId(codex);
    if (dupCodex !== null)
        return { ok: false, reason: `duplicate finding id codex:${dupCodex}` };
    const dupClaude = findDuplicateId(claude);
    if (dupClaude !== null)
        return { ok: false, reason: `duplicate finding id claude:${dupClaude}` };
    const dedupCodex = dedupeWithinFamily(codex);
    const dedupClaude = dedupeWithinFamily(claude);
    const codexById = new Map(dedupCodex.kept.map((f) => [f.id, f]));
    const claudeById = new Map(dedupClaude.kept.map((f) => [f.id, f]));
    const confirmed = [];
    const excludedCodex = new Set();
    const excludedClaude = new Set();
    let adjudicated = false;
    if (adjudication !== undefined) {
        adjudicated = true;
        // r1-5: every codex/claude endpoint may be named in `pairs` AT MOST ONCE — a repeated endpoint
        // produced one-to-many matches (Codex r1 finding 5's `{codex:"c1",claude:"l1"}` +
        // `{codex:"c1",claude:"l2"}`).
        const usedCodexInPairs = new Set();
        const usedClaudeInPairs = new Set();
        for (const p of adjudication.pairs) {
            const cId = String(p.codex);
            const clId = String(p.claude);
            if (usedCodexInPairs.has(cId))
                return { ok: false, reason: `adjudication reuses codex finding id ${cId} in more than one pair` };
            if (usedClaudeInPairs.has(clId))
                return { ok: false, reason: `adjudication reuses claude finding id ${clId} in more than one pair` };
            usedCodexInPairs.add(cId);
            usedClaudeInPairs.add(clId);
            if (!codexById.has(cId))
                return { ok: false, reason: `unknown finding id codex:${cId}` };
            if (!claudeById.has(clId))
                return { ok: false, reason: `unknown finding id ${clId}` };
            confirmed.push({ codex: cId, claude: clId });
            excludedCodex.add(cId);
            excludedClaude.add(clId);
        }
        for (const raw of adjudication.none) {
            const m = NONE_ENTRY_RE.exec(raw);
            if (m === null) {
                return { ok: false, reason: `adjudication "none" entry ${JSON.stringify(raw)} must be family-qualified as codex:<id> or claude:<id>` };
            }
            const fam = m[1];
            const id = m[2];
            if (fam === 'codex') {
                if (usedCodexInPairs.has(id))
                    return { ok: false, reason: `adjudication pair/none conflict for codex:${id}` };
                if (!codexById.has(id))
                    return { ok: false, reason: `unknown finding id codex:${id}` };
                excludedCodex.add(id);
            }
            else {
                if (usedClaudeInPairs.has(id))
                    return { ok: false, reason: `adjudication pair/none conflict for claude:${id}` };
                if (!claudeById.has(id))
                    return { ok: false, reason: `unknown finding id claude:${id}` };
                excludedClaude.add(id);
            }
        }
    }
    // The automatic rule runs ONLY over what adjudication left unclaimed — a named pair or a named
    // "none" always wins over the heuristic (A5/A7's "adjudication overrides the automatic match").
    const remainingCodex = [...codexById.values()].filter((f) => !excludedCodex.has(f.id));
    const remainingClaude = [...claudeById.values()].filter((f) => !excludedClaude.has(f.id));
    const auto = matchFindings(remainingCodex, remainingClaude);
    const candidate = auto.pairs.map((p) => ({ codex: p.a, claude: p.b, rule: p.rule, score: p.score }));
    const confirmedCodexIds = new Set(confirmed.map((p) => p.codex));
    const confirmedClaudeIds = new Set(confirmed.map((p) => p.claude));
    const candidateCodexIds = new Set(candidate.map((p) => p.codex));
    const candidateClaudeIds = new Set(candidate.map((p) => p.claude));
    const onlyCodex = [...codexById.values()].filter((f) => !confirmedCodexIds.has(f.id) && !candidateCodexIds.has(f.id)).map((f) => f.id);
    const onlyClaude = [...claudeById.values()].filter((f) => !confirmedClaudeIds.has(f.id) && !candidateClaudeIds.has(f.id)).map((f) => f.id);
    const bySeverity = {
        confirmed: bySeverityCounts(confirmed.map((p) => codexById.get(p.codex))),
        candidate: bySeverityCounts(candidate.map((p) => codexById.get(p.codex))),
        onlyCodex: bySeverityCounts(onlyCodex.map((id) => codexById.get(id))),
        onlyClaude: bySeverityCounts(onlyClaude.map((id) => claudeById.get(id))),
    };
    return {
        ok: true,
        confirmed,
        candidate,
        onlyCodex,
        onlyClaude,
        bySeverity,
        matchRule: MATCH_RULE_LABEL,
        adjudicated,
        collapsed: { codex: dedupCodex.collapsed.length, claude: dedupClaude.collapsed.length },
    };
}
/** A named field present but EMPTY (`{}`, an object with no keys) is not the same as absent — the
 *  lesson this guards: a presence-only check on a required object field lets an empty stand-in
 *  through. Every required nested object below is checked for at least one key, not merely typeof. */
function isNonEmptyObject(v) {
    return v !== null && typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length > 0;
}
/**
 * Refuses (never throws) on:
 *  - an empty scope (nothing was reviewed);
 *  - either required half missing, malformed, or carrying an EMPTY object where a real result was
 *    required (the empty-required-object lesson);
 *  - either half lacking an accepted findings table (A1) — an accepted-HOLLOW half (a genuine
 *    zero-findings verdict) is fine; a half whose only table was rejected, or that has none, is not;
 *  - a tree-hash drift across EITHER half (A2) — the claude half compares `before` to
 *    `afterClaude`, the codex half compares `afterClaude` to `afterCodex`; a control whose halves
 *    did not see the identical tree writes NO ledger row.
 * Unnormalizable-severity / out-of-scope findings do NOT refuse the row outright (they are a
 * partial-measurement fact, not a total failure) — they land in `refused`/`complete:false` instead.
 */
export function buildControlRow(input) {
    if (typeof input.slug !== 'string' || input.slug.trim() === '')
        return { ok: false, reason: 'slug is required' };
    if (typeof input.runId !== 'string' || input.runId.trim() === '')
        return { ok: false, reason: 'runId is required' };
    if (input.coderFamily !== 'codex' && input.coderFamily !== 'claude') {
        return { ok: false, reason: 'coderFamily must be codex or claude' };
    }
    if (!Array.isArray(input.scope) || input.scope.length === 0 || input.scope.some((s) => typeof s !== 'string' || s.trim() === '')) {
        return { ok: false, reason: 'scope must be a non-empty list of files — nothing was reviewed' };
    }
    if (!isNonEmptyObject(input.tree) ||
        typeof input.tree.before !== 'string' || input.tree.before.trim() === '' ||
        typeof input.tree.afterClaude !== 'string' || input.tree.afterClaude.trim() === '' ||
        typeof input.tree.afterCodex !== 'string' || input.tree.afterCodex.trim() === '') {
        return { ok: false, reason: 'tree snapshot hashes (before/afterClaude/afterCodex) are required' };
    }
    if (input.tree.before !== input.tree.afterClaude) {
        return { ok: false, reason: `treeSha drift after claude half: ${input.tree.before} -> ${input.tree.afterClaude}` };
    }
    if (input.tree.afterClaude !== input.tree.afterCodex) {
        return { ok: false, reason: `treeSha drift after codex half: ${input.tree.afterClaude} -> ${input.tree.afterCodex}` };
    }
    if (!isNonEmptyObject(input.claude) || typeof input.claude.accepted !== 'boolean') {
        return { ok: false, reason: 'claude half result is required' };
    }
    if (!input.claude.accepted)
        return { ok: false, reason: 'claude half has no accepted findings table' };
    if (!isNonEmptyObject(input.codex) || typeof input.codex.accepted !== 'boolean') {
        return { ok: false, reason: 'codex half result is required' };
    }
    if (!input.codex.accepted)
        return { ok: false, reason: 'codex half has no accepted findings table' };
    if (!isNonEmptyObject(input.diff))
        return { ok: false, reason: 'diff is required' };
    if (!isNonEmptyObject(input.diff.bySeverity))
        return { ok: false, reason: 'diff.bySeverity is required' };
    if (!Array.isArray(input.diff.confirmed) || !Array.isArray(input.diff.candidate) ||
        !Array.isArray(input.diff.onlyCodex) || !Array.isArray(input.diff.onlyClaude)) {
        return { ok: false, reason: 'diff.confirmed/candidate/onlyCodex/onlyClaude must be arrays' };
    }
    const refusedClaude = input.refused?.claude ?? 0;
    const refusedCodex = input.refused?.codex ?? 0;
    const refusedReasons = input.refused?.reasons ?? [];
    return {
        ok: true,
        row: {
            slug: input.slug,
            stage: 'control',
            runId: input.runId,
            coderFamily: input.coderFamily,
            scope: input.scope,
            treeShaBefore: input.tree.before,
            treeShaAfterClaude: input.tree.afterClaude,
            treeShaAfterCodex: input.tree.afterCodex,
            codexGrade: input.codex.grade,
            claudeGrade: input.claude.grade,
            confirmed: input.diff.confirmed.length,
            candidate: input.diff.candidate.length,
            onlyCodex: input.diff.onlyCodex.length,
            onlyClaude: input.diff.onlyClaude.length,
            bySeverity: input.diff.bySeverity,
            matchRule: input.diff.matchRule,
            adjudicated: input.diff.adjudicated,
            collapsed: input.diff.collapsed,
            refused: { claude: refusedClaude, codex: refusedCodex, reasons: refusedReasons },
            complete: refusedClaude === 0 && refusedCodex === 0,
            tokens: input.tokens ?? null,
            minutes: input.minutes ?? null,
        },
    };
}
function isValidControlRefusedRow(obj) {
    if (typeof obj['slug'] !== 'string' || obj['slug'].trim() === '')
        return false;
    if (typeof obj['runId'] !== 'string' || obj['runId'].trim() === '')
        return false;
    if (obj['half'] !== 'claude' && obj['half'] !== 'codex' && obj['half'] !== 'setup')
        return false;
    if (typeof obj['reason'] !== 'string' || obj['reason'].trim() === '')
        return false;
    if (!(obj['minutes'] === null || (typeof obj['minutes'] === 'number' && Number.isFinite(obj['minutes']))))
        return false;
    if (obj['coderFamily'] !== undefined && obj['coderFamily'] !== 'codex' && obj['coderFamily'] !== 'claude')
        return false;
    return true;
}
const CONTROL_BY_SEVERITY_KEYS = ['confirmed', 'candidate', 'onlyCodex', 'onlyClaude'];
const QE_SEVERITY_SET = new Set(QE_SEVERITIES);
function isNonNegInt(v) {
    return typeof v === 'number' && Number.isFinite(v) && Number.isInteger(v) && v >= 0;
}
/** A severity-count map: any object whose keys are all in the closed `QE_SEVERITIES` dictionary
 *  and whose values are all non-negative integers. An EMPTY map (`{}`) is valid — a genuine
 *  zero-findings bucket is not the same defect as the presence-only-check lesson guards against
 *  (that lesson is about a REQUIRED object being empty, not a legitimately-empty COUNT map). */
function isValidSeverityCounts(v) {
    if (v === null || typeof v !== 'object' || Array.isArray(v))
        return false;
    for (const [k, val] of Object.entries(v)) {
        if (!QE_SEVERITY_SET.has(k))
            return false;
        if (!isNonNegInt(val))
            return false;
    }
    return true;
}
/** r1-12 (Codex r1 finding 12): `bySeverity:{bogus:1}` used to pass a presence-only check and then
 *  crash `aggregateByFamily`'s `Object.entries(undefined)` on the missing `onlyCodex` key. Every
 *  one of the four named buckets is now required to be PRESENT and individually valid. */
function isValidControlBySeverity(v) {
    if (v === null || typeof v !== 'object' || Array.isArray(v))
        return false;
    const obj = v;
    for (const k of Object.keys(obj))
        if (!CONTROL_BY_SEVERITY_KEYS.includes(k))
            return false;
    for (const bucket of CONTROL_BY_SEVERITY_KEYS) {
        if (!(bucket in obj))
            return false;
        if (!isValidSeverityCounts(obj[bucket]))
            return false;
    }
    return true;
}
/** Full structural validation of one `stage:'control'` ledger row (r1-12) — every field named in
 *  the fix-round brief, checked for TYPE and SHAPE, never merely presence. A row that fails any of
 *  these is `unreadable` (folded into `parsed.unreadable`, INCOMPLETE), never a thrown exception. */
function isValidControlRow(obj) {
    if (typeof obj['slug'] !== 'string' || obj['slug'].trim() === '')
        return false;
    if (typeof obj['runId'] !== 'string' || obj['runId'].trim() === '')
        return false;
    if (obj['coderFamily'] !== 'codex' && obj['coderFamily'] !== 'claude')
        return false;
    const scope = obj['scope'];
    if (!Array.isArray(scope) || scope.length === 0 || scope.some((s) => typeof s !== 'string' || s.trim() === ''))
        return false;
    for (const key of ['treeShaBefore', 'treeShaAfterClaude', 'treeShaAfterCodex']) {
        const v = obj[key];
        if (typeof v !== 'string' || v.trim() === '')
            return false;
    }
    if (!(obj['codexGrade'] === null || typeof obj['codexGrade'] === 'string'))
        return false;
    if (!(obj['claudeGrade'] === null || typeof obj['claudeGrade'] === 'string'))
        return false;
    for (const key of ['confirmed', 'candidate', 'onlyCodex', 'onlyClaude']) {
        if (!isNonNegInt(obj[key]))
            return false;
    }
    if (!isValidControlBySeverity(obj['bySeverity']))
        return false;
    if (typeof obj['matchRule'] !== 'string' || obj['matchRule'].trim() === '')
        return false;
    if (typeof obj['adjudicated'] !== 'boolean')
        return false;
    const collapsed = obj['collapsed'];
    if (!isNonEmptyObject(collapsed) || !isNonNegInt(collapsed['codex']) || !isNonNegInt(collapsed['claude']))
        return false;
    if (typeof obj['complete'] !== 'boolean')
        return false;
    const refused = obj['refused'];
    if (!isNonEmptyObject(refused) || !isNonNegInt(refused['claude']) || !isNonNegInt(refused['codex']))
        return false;
    if (!Array.isArray(refused['reasons']) || refused['reasons'].some((r) => typeof r !== 'string'))
        return false;
    if (!(obj['tokens'] === null || typeof obj['tokens'] === 'number'))
        return false;
    if (!(obj['minutes'] === null || typeof obj['minutes'] === 'number'))
        return false;
    // Lead delta after Codex r2 (new MEDIUM #2): RELATIONAL invariants, not only field shapes — a row
    // claiming `complete:true` with refused entries, a top-level count that disagrees with its own
    // severity map, or unequal tree hashes is a self-contradicting row and is unreadable.
    const refusedTotal = refused['claude'] + refused['codex'];
    if (obj['complete'] !== (refusedTotal === 0))
        return false;
    const bySev = obj['bySeverity'];
    for (const key of ['confirmed', 'candidate', 'onlyCodex', 'onlyClaude']) {
        const sum = Object.values(bySev[key]).reduce((a, b) => a + b, 0);
        if (sum !== obj[key])
            return false;
    }
    if (obj['treeShaBefore'] !== obj['treeShaAfterClaude'] || obj['treeShaAfterClaude'] !== obj['treeShaAfterCodex'])
        return false;
    return true;
}
/**
 * Reads every line of a run-cost-ledger.jsonl body, classifying `stage:'control'` rows (this
 * feature's own, fully schema-validated — r1-12), `stage:'round'` and `stage:'full'` rows (the two
 * existing per-review stages `aggregateByFamily` reads for its per-pair table), and counting
 * everything unreadable (A8).
 */
export function parseControlRows(lines) {
    const rows = [];
    const refusedRows = [];
    const roundRows = [];
    const fullRows = [];
    let unreadable = 0;
    for (const raw of lines) {
        const line = raw.trim();
        if (line === '')
            continue;
        let parsed;
        try {
            parsed = JSON.parse(line);
        }
        catch {
            unreadable++;
            continue;
        }
        if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
            unreadable++;
            continue;
        }
        const obj = parsed;
        const stage = obj['stage'];
        if (stage === 'control') {
            // experiment-instrument FR-4/A6: `outcome:'refused'` is a DIFFERENT schema from a successful
            // control row — checked FIRST, so a refused row is never mistaken for a malformed successful
            // one (which would count it `unreadable`, losing exactly the receipt this feature adds).
            if (obj['outcome'] === 'refused') {
                if (!isValidControlRefusedRow(obj)) {
                    unreadable++;
                    continue;
                }
                refusedRows.push(obj);
                continue;
            }
            if (!isValidControlRow(obj)) {
                unreadable++;
                continue;
            }
            rows.push(obj);
        }
        else if (stage === 'round') {
            roundRows.push(obj);
        }
        else if (stage === 'full') {
            fullRows.push(obj);
        }
        // Every other stage (plan/impl/fix/loop-run/round-exec/…) and the header/comment row (no
        // string `stage`) are readable, just not addressed by this module.
    }
    return { rows, refusedRows, roundRows, fullRows, unreadable };
}
/**
 * r1-15 (Codex r1 finding 15): a provider-qualified spec like `anthropic/claude-sonnet-4` or
 * `codex:gpt-5.6-sol:high` used to normalize to `other` because the WHOLE string never started
 * with a bare family keyword. The spec is now split on BOTH `/` and `:` into segments, and any
 * segment matching the closed vocabulary decides the family — order-independent, so a leading
 * provider qualifier (`anthropic/…`) or a trailing modifier (`…:high`) no longer hides the model.
 */
function normalizeSpecFamily(spec) {
    if (typeof spec !== 'string')
        return 'other';
    const s = spec.trim().toLowerCase();
    if (s === '')
        return 'other';
    const segments = s.split(/[/:]+/).filter((seg) => seg !== '');
    const CLAUDE_SEGMENTS = new Set(['claude', 'sonnet', 'opus', 'fable', 'haiku', 'anthropic']);
    const CODEX_SEGMENTS = new Set(['codex', 'openai']);
    for (const seg of segments)
        if (CLAUDE_SEGMENTS.has(seg) || seg.startsWith('claude'))
            return 'claude';
    for (const seg of segments)
        if (CODEX_SEGMENTS.has(seg) || seg.startsWith('gpt'))
            return 'codex';
    return 'other';
}
function newPair() {
    return {
        n: 0, grades: {}, shipped: 0, shippedTotal: 0, fixRoundsList: [],
        foreignN: 0, foreignBySeverity: {}, foreignAuto: 0, foreignAdjudicated: 0, foreignAutoRuns: 0, foreignAdjudicatedRuns: 0, foreignIncomplete: 0,
        refutedN: 0, refutedSum: 0, costN: 0, costSum: 0, drafts: [], refusedRuns: 0,
    };
}
/**
 * `dz score --by-family`'s aggregate: per (coder family, reviewer family) pair, how many rounds
 * ran, their grade distribution, `shippedShare`/`notShipped`, mean `fixRounds`, the FOREIGN-unique
 * findings measured by `control` rows for that pair's cross-family direction (split `auto` vs
 * `adjudicated`, r1-1/r1-13), `refutedShare` and `costPerConfirmed` from `full` rows' findings
 * tables, and `draftToShipped` — the earliest known verdict for a slug (a qe-bridge signoff, or
 * this run's own claude-half grade) next to its final SHIPPED `round`/`full` grade for that exact
 * (slug, family-pair) key (r1-14). Every ratio is `'unknown'`, never a fabricated `0`, when its
 * denominator is zero (NFR-4: absent data is reported as absent).
 */
export function aggregateByFamily(parsed, signoffs) {
    const pairs = new Map();
    const bucket = (coder, reviewer) => {
        const key = `${normalizeSpecFamily(coder)}:${normalizeSpecFamily(reviewer)}`;
        let b = pairs.get(key);
        if (b === undefined) {
            b = newPair();
            pairs.set(key, b);
        }
        return b;
    };
    for (const row of parsed.roundRows) {
        const b = bucket(row['coder'], row['reviewer']);
        b.n++;
        const grade = typeof row['grade'] === 'string' ? row['grade'] : null;
        if (grade !== null)
            b.grades[grade] = (b.grades[grade] ?? 0) + 1;
        const outcome = row['outcome'];
        if (outcome === 'shipped') {
            b.shipped++;
            b.shippedTotal++;
        }
        else if (outcome === 'refuted' || outcome === 'blocked' || outcome === 'abandoned') {
            b.shippedTotal++;
        }
    }
    for (const row of parsed.fullRows) {
        const b = bucket(row['coder'], row['reviewer'] ?? null);
        b.n++;
        const grade = typeof row['grade'] === 'string' ? row['grade'] : null;
        if (grade !== null)
            b.grades[grade] = (b.grades[grade] ?? 0) + 1;
        if (typeof row['fixRounds'] === 'number' && Number.isFinite(row['fixRounds']))
            b.fixRoundsList.push(row['fixRounds']);
        const findings = row['findings'];
        if (findings !== undefined && findings.status === 'present' && isNonEmptyObject(findings.summary?.byStatus)) {
            const byStatus = findings.summary.byStatus;
            const asNum = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
            const total = Object.values(byStatus).reduce((s, v) => s + asNum(v), 0);
            if (total > 0) {
                b.refutedN++;
                b.refutedSum += asNum(byStatus['refuted']) / total;
            }
            const denom = asNum(byStatus['fixed']) + asNum(byStatus['confirmed']);
            const tokens = typeof row['tokens'] === 'number' && Number.isFinite(row['tokens']) ? row['tokens'] : null;
            if (tokens !== null && tokens > 0 && denom > 0) {
                b.costN++;
                b.costSum += tokens / denom;
            }
        }
    }
    for (const cr of parsed.rows) {
        const reviewerOfInterest = cr.coderFamily === 'codex' ? 'claude' : 'codex';
        const b = bucket(cr.coderFamily, reviewerOfInterest);
        if (!cr.complete) {
            b.foreignIncomplete++;
            continue;
        } // excluded from every measured figure
        b.foreignN++;
        const foreign = cr.coderFamily === 'codex' ? cr.bySeverity.onlyClaude : cr.bySeverity.onlyCodex;
        let foreignTotal = 0;
        for (const [sev, n] of Object.entries(foreign)) {
            b.foreignBySeverity[sev] = (b.foreignBySeverity[sev] ?? 0) + n;
            foreignTotal += n;
        }
        if (cr.adjudicated) {
            b.foreignAdjudicatedRuns++;
            b.foreignAdjudicated += foreignTotal;
        }
        else {
            b.foreignAutoRuns++;
            b.foreignAuto += foreignTotal;
        }
    }
    // experiment-instrument FR-4/A6: a refused row is bucketed the SAME way a successful control row
    // is — by its own coderFamily and the complementary reviewer — but ONLY when coderFamily is known
    // (the earliest failures, before the claude half reports which family it reviewed, cannot be
    // attributed to a pair; they still count toward `refusedControlRows` at the top level below,
    // never silently dropped). `n` is deliberately untouched: `n` measures COMPLETED reviews.
    for (const rr of parsed.refusedRows) {
        if (rr.coderFamily === undefined)
            continue;
        const reviewerOfInterest = rr.coderFamily === 'codex' ? 'claude' : 'codex';
        const b = bucket(rr.coderFamily, reviewerOfInterest);
        b.refusedRuns++;
    }
    // draftToShipped: earliest known verdict per slug (a qe-bridge signoff, or this control row's
    // own claude-half grade when no signoff was given) against the slug's final grade — keyed by
    // slug PLUS the normalized (coder,reviewer) family pair (r1-14: two final rows for the same slug
    // but opposite family pairs must never overwrite each other), counting only round/full rows
    // whose `outcome` is EXPLICITLY `'shipped'` (a refuted/blocked/abandoned row is never a "final"
    // — its count is folded into `notShipped` above via `shippedTotal - shipped`). Several shipped
    // candidates for the same key resolve to the LATEST by `ts`, and the discarded count survives as
    // `finals` on the winning entry.
    // Lead delta after Codex r2 (new HIGH #4): the FIRST grade is keyed by slug PLUS the family pair,
    // exactly like the final side — a qe-bridge signoff is always a Claude review of `coderFamily`
    // code, so its key is `<slug>::<coderFamily>:claude`; a control row's Claude half likewise.
    const bySlugFirst = new Map();
    if (signoffs !== undefined) {
        const sorted = [...signoffs].sort((x, y) => (x.emittedAt < y.emittedAt ? -1 : x.emittedAt > y.emittedAt ? 1 : 0));
        for (const s of sorted) {
            const key = `${s.slug}::${normalizeSpecFamily(s.coderFamily)}:claude`;
            if (!bySlugFirst.has(key))
                bySlugFirst.set(key, s.grade);
        }
    }
    for (const cr of parsed.rows) {
        const key = `${cr.slug}::${cr.coderFamily}:claude`;
        if (!bySlugFirst.has(key) && cr.claudeGrade !== null)
            bySlugFirst.set(key, cr.claudeGrade);
    }
    const finalCandidatesByKey = new Map();
    for (const row of [...parsed.roundRows, ...parsed.fullRows]) {
        const slug = typeof row['slug'] === 'string' ? row['slug'] : null;
        const grade = typeof row['grade'] === 'string' ? row['grade'] : null;
        if (slug === null || grade === null)
            continue;
        if (row['outcome'] !== 'shipped')
            continue;
        const key = `${slug}::${normalizeSpecFamily(row['coder'])}:${normalizeSpecFamily(row['reviewer'] ?? null)}`;
        const ts = typeof row['ts'] === 'string' ? row['ts'] : '';
        const list = finalCandidatesByKey.get(key) ?? [];
        list.push({ slug, grade, ts, coder: row['coder'], reviewer: row['reviewer'], key });
        finalCandidatesByKey.set(key, list);
    }
    for (const candidates of finalCandidatesByKey.values()) {
        const sorted = [...candidates].sort((x, y) => (x.ts < y.ts ? -1 : x.ts > y.ts ? 1 : 0));
        const final = sorted[sorted.length - 1];
        const b = bucket(final.coder, final.reviewer);
        b.drafts.push({ slug: final.slug, first: bySlugFirst.get(final.key) ?? 'unknown', final: final.grade, finals: candidates.length });
    }
    const out = {};
    for (const [key, b] of pairs) {
        out[key] = {
            n: b.n,
            grades: b.grades,
            shippedShare: b.shippedTotal > 0 ? b.shipped / b.shippedTotal : 'unknown',
            notShipped: b.shippedTotal - b.shipped,
            fixRounds: {
                n: b.fixRoundsList.length,
                mean: b.fixRoundsList.length > 0 ? b.fixRoundsList.reduce((s, n) => s + n, 0) / b.fixRoundsList.length : 'unknown',
            },
            foreignUnique: {
                n: b.foreignN,
                incompleteRuns: b.foreignIncomplete,
                bySeverity: b.foreignN > 0 ? b.foreignBySeverity : 'unknown',
                auto: b.foreignN > 0 ? b.foreignAuto : 'unknown',
                adjudicated: b.foreignN > 0 ? b.foreignAdjudicated : 'unknown',
                autoRuns: b.foreignN > 0 ? b.foreignAutoRuns : 'unknown',
                adjudicatedRuns: b.foreignN > 0 ? b.foreignAdjudicatedRuns : 'unknown',
            },
            refutedShare: { n: b.refutedN, value: b.refutedN > 0 ? b.refutedSum / b.refutedN : 'unknown' },
            costPerConfirmed: { n: b.costN, value: b.costN > 0 ? b.costSum / b.costN : 'unknown' },
            draftToShipped: b.drafts,
            refusedRuns: b.refusedRuns,
        };
    }
    const incompleteControlRows = parsed.rows.filter((r) => !r.complete).length;
    return {
        pairs: out,
        incomplete: parsed.unreadable > 0 || incompleteControlRows > 0,
        incompleteControlRows,
        controlRows: parsed.rows.length,
        refusedControlRows: parsed.refusedRows.length,
    };
}
//# sourceMappingURL=cross-family-control.js.map
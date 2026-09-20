import { maskMarkdown } from './markdown-masker.js';
/**
 * The text a row's SEMANTICS are read from: its masked slice when it has one, its raw text when it
 * does not. A row built by hand or revived from JSON has no mask to speak of, so `raw` is the only
 * honest answer for it — and a fallback that returns text is the difference between a legacy row
 * being read slightly too generously and the whole call throwing.
 */
function rowScan(row) {
    return row.scan ?? row.raw;
}
/**
 * Template placeholders that reach shipped reports. A stub read as an ordinary unresolvable id lets
 * the author believe they merely mistyped a name, so it earns its own verdict (acid case A1).
 */
const PLACEHOLDER_IDS = new Set([
    'test_name',
    'test-name',
    '<test>',
    '<test_name>',
    'tbd',
    'todo',
    'name',
    'названный кодером при реализации — заменить на имя реального теста',
]);
/**
 * Below this many normalised characters an id is too short to match anything meaningfully: the
 * substring rule ADR-002 accepts would fire on unrelated prose. Guards the degenerate case the ADR
 * names as its known false-positive risk.
 */
export const MIN_MATCHABLE_ID_LENGTH = 8;
/** Case- and separator-folded form. Authors write ids in prose (`a_b_c`); test titles are sentences. */
/**
 * Every `it()` / `test()` / `describe()` title in a test file. Empty when none parse.
 *
 * Comments are stripped FIRST. A commented-out `it('deny admin writes')` is not a test, and counting
 * it would leave open the very forgery the title basis exists to close — the cross-family reviewer's
 * two-comment-line attack in a slightly better costume. Table forms (`test.each([…])('…')`) carry an
 * argument list between the modifier and the title, so the pattern allows one.
 */
export function extractTestTitles(body) {
    const code = body.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
    const out = [];
    // The modifier-argument group admits ONE level of nested parens: `it.skipIf(!existsSync(BIN))`
    // carries a call inside the guard, and the flat `[^()]{0,200}` failed on it — so every title in
    // a file whose tests were guarded that way was invisible, and `dz amendment-check` reported
    // `searched 1 test title(s)` over a nine-test file (MEASURED 2026-08-24 on the name-check
    // feature; worked around there by de-guarding the tests, fixed here at the extractor).
    const re = /\b(?:it|test|describe)(?:\.\w+)*(?:\s*\((?:[^()]|\([^()]*\)){0,200}\))?\s*(?:`[^`]*`)?\s*\(\s*(['"`])([\s\S]{1,300}?)\1/g;
    for (let m = re.exec(code); m !== null; m = re.exec(code))
        if (m[2])
            out.push(m[2]);
    return out;
}
export function normalizeTestId(s) {
    // Unicode letter/number classes: the old `[^a-z0-9]` erased Cyrillic outright, so a Russian test title
    // normalised to '' and tripped the floor as the author's fault (MEASURED 2026-09-04, backlog 191853a2).
    // Re-run over all 519 features on 2026-09-20: zero verdicts changed — this only adds matches.
    return s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
}
/**
 * Row starts, in BOTH shapes the corpus actually contains: a bullet (`- **AM-1 (…):**`) and a table
 * cell (`| **AM-40** |`). A format LEGEND — the literal `AM-N` with an `N` that is not a digit, as in
 * `features/ha-consilium/03.5_ideation_report.md` — is deliberately NOT a row: counting a legend as
 * an amendment would open this feature by falsely accusing a feature that did nothing wrong.
 */
// The bullet is OPTIONAL, and `AM-CP-N` is a row like any other. MEASURED 2026-08-25: requiring a
// bullet drops 104 of the corpus's 347 real amendment rows out of the check entirely, and a
// bullet-less row made this tool return `not-established` — which the pipeline's own gate text calls
// "NEVER a pass". C6 has always treated the bullet as optional; this is that half of the contract.
//
// The `CP-` prefix is CAPTURED, because it is IDENTITY: `AM-CP-N` is a row like any other AND a
// DIFFERENT id from `AM-N`. It was a non-capturing group until 2026-09-05 and the id was rebuilt
// from the number alone, so a challenge-panel row collided with the ideation's `AM-1` and the
// subject guard failed an honest plan as `subject-changed`. MEASURED TWICE that day (backlog
// a7d0aece023774a0): `run-registry-liveness` re-numbered 7 panel rows to AM-18…AM-31 to escape it,
// `core-boundary-guard` refused the `AM-CP-N` form outright. K2 (check-plan-completeness.mjs:361,
// `(AM-(?:CP-)?\d+)`) has always kept the whole token — this ends that disagreement, and the
// agreement is pinned by test/amendment-grammar-agreement.test.ts, not by this comment.
const ROW_START = /^(?:[-*|]\s*)?\*{0,2}AM-(CP-)?(\d+)/gm;
/**
 * The same token, read out of ORDINARY PROSE rather than at the start of a row — `dz score` scans a
 * whole plan and a whole QE report for the amendments it must account for, and a scan is not a row
 * grammar (a row is anchored to the line start; a mention is not).
 *
 * It lives HERE, next to `ROW_START`, because the defect it closes is the same class the row
 * grammar just closed (doc-26: two tools, one text, two contracts) — measured one reader later.
 * MEASURED 2026-09-06: `score.ts` scanned with its own `/AM-\d+/g`, which does not match `AM-CP-1`
 * at all (`node -e "console.log('AM-CP-1'.match(/AM-\d+/g))"` → `null`), so a plan whose amendments
 * were all challenge-panel rows produced an EMPTY planned set and the amendment-confirmation
 * discipline was skipped with no trace — a check that silently checked nothing, the very class this
 * module exists to remove. There were never two readers of `AM-*`; there were three.
 *
 * The trailing `\b` is identity too: without it a planned `AM-1` is "covered" by a report that only
 * ever mentions `AM-10` (MEASURED — `'AM-10'.includes('AM-1')` → `true`). A substring is not an id.
 */
const AMENDMENT_ID_TOKEN = /\bAM-(?:CP-)?\d+\b/g;
/** Every distinct amendment id mentioned in `text`, in first-seen order. */
export function amendmentIdsIn(text) {
    return [...new Set(text.match(AMENDMENT_ID_TOKEN) ?? [])];
}
/**
 * Does `text` mention `id` AS AN ID? `AM-10` is not a mention of `AM-1`, and `AM-CP-1` is not a
 * mention of `AM-1` — both are what a `String.includes` check answers wrongly.
 */
export function mentionsAmendmentId(text, id) {
    return amendmentIdsIn(text).includes(id);
}
/**
 * The `## Amendments` heading line — ONE definition, because two readers of the same line is the
 * defect class this module keeps closing. Group 1 is the heading SUFFIX: everything after the word
 * `Amendments` on that line, which is where the inline declaration `## Amendments: None` lives.
 * The final newline is optional so a document that ENDS on its heading is still a section that
 * exists (an empty one) rather than no section at all.
 */
const AMENDMENT_HEADING = /^ {0,3}(#{2,4})\s+Amendments\b([^\n]*)(?:\n|$)/m;
/**
 * The CLOSED set of explicit-none forms, matched against a WHOLE trimmed heading suffix or a WHOLE
 * trimmed first paragraph. The word alone, optionally with a full stop — nothing else.
 *
 * The previous trailing-guard form only checked the character AFTER the word, so ordinary prose such
 * as `None of the required rows has been written yet.` passed as a DECLARATION because the next
 * character was a space, and with zero parsed rows the gate answered skip/exit 0 (MEASURED
 * 2026-09-06, Codex cross-family review round 7, P1). A declaration is a whole utterance, not a
 * prefix: "none" is an answer, "none of X yet" is a description of work outstanding.
 */
const NONE_DECLARATION_EXACT = /^(?:none|n\/a|нет)\.?$/iu;
/** Anything that LOOKS like amendment content in rendered text: a row id, a table cell, a child section. */
const AMENDMENT_LIKE = /\bAM-(?:CP-)?\d+\b|^\s*\|\s*\*{0,2}AM-|^ {0,3}#{3,6}\s+Amendments\b/;
/** A separator that turns a heading suffix into a DECLARATION rather than a qualifier. */
const HEADING_DECLARATION_SEPARATOR = /^\s*[:\u2014\u2013-]\s*/;
/**
 * The FAIL-CLOSED half of the explicit-none contract (Codex cross-family review round 7).
 *
 * Seven rounds produced one outcome again and again: an ambiguous document answering `skip`/exit 0.
 * Each round closed the parser hole that round's fixture used — and the next fixture used the next
 * hole. This function stops paying that toll by inverting the burden: a declaration of "no
 * amendments" is honoured ONLY IF the rendered document carries no amendment-shaped content below
 * it. Anything AM-like with zero parsed rows means the PARSER and the DOCUMENT disagree, and the
 * honest verdict for a disagreement is NOT-ESTABLISHED, never a pass and never a skip.
 *
 * Scanned in the block-scanned text, so fenced examples and HTML comments are already out; scanned
 * from the section heading DOWN, which is deliberately more than "below the declaration" — the
 * conservative direction here is to see more, because every miss is an exit 0.
 */
export function amendmentDeclarationAmbiguity(md) {
    const mask = maskMarkdown(md);
    const m = AMENDMENT_HEADING.exec(mask);
    if (m === null)
        return null;
    const maskLines = mask.split('\n');
    const rawLines = md.split('\n');
    const headingIndex = mask.slice(0, m.index).split('\n').length - 1;
    for (let i = headingIndex + 1; i < maskLines.length; i++) {
        const line = maskLines[i];
        if (AMENDMENT_LIKE.test(line)) {
            return { line: i + 1, text: (rawLines[i] ?? '').trim().slice(0, 160) };
        }
    }
    return null;
}
export function amendmentSectionCount(md) {
    const mask = maskMarkdown(md);
    // DEPTH MATTERS, and the corpus is why (MEASURED 2026-09-06 on the 363-feature census while this
    // refusal was being added): `features/p16-non-js-portability/06_implementation_plan.md` carries
    // `## Amendments` at line 780 and `### Amendments folded in from the challenge panel …` at 845.
    // The second is a SUBSECTION of the first, not a rival for it, and counting it turned a feature
    // whose rows are genuinely broken from `fail` into `not-established` — a gate that answers "I
    // cannot tell" where it used to name six bad rows is a REGRESSION dressed as caution. So a
    // duplicate is a later heading at the SAME depth or shallower; anything deeper is a child.
    const re = /^ {0,3}(#{2,4})\s+Amendments\b/gm;
    let first = null;
    let count = 0;
    for (let m = re.exec(mask); m !== null; m = re.exec(mask)) {
        const depth = m[1].length;
        if (first === null) {
            first = depth;
            count = 1;
            continue;
        }
        if (depth <= first)
            count++;
    }
    return count;
}
/**
 * Does the heading itself declare "none"? `## Amendments: None` is the form the pipeline's own
 * Step-8 module documents (`.claude/skills/feature-adr/modules/08-qe.md:166`), and until 2026-09-06
 * `amendmentSection` ate `: None` as part of the heading and returned an EMPTY body, so the
 * explicit-none branch never ran and the gate answered NOT-ESTABLISHED (exit 3) on a plan that had
 * said its piece (Codex cross-family review round 2, P2).
 *
 * A DECLARATION, not a qualifier: a separator (`:` or a dash) must precede the word, and the word
 * must end there. That rule was chosen from the corpus rather than invented — the 363 features
 * carry `## Amendments (carried verbatim into the plan)` (8×), `## Amendments — conditions before
 * plan/code`, `## Amendments applied before Step 6` and `## Amendments and confirmation
 * obligations`, and none of them may read as "none". Whole-utterance matching refuses
 * `none-blocking`; an optional whitespace-separated closing `#` sequence is heading furniture.
 */
function headingSaysNone(md) {
    const m = AMENDMENT_HEADING.exec(maskMarkdown(md));
    if (!m)
        return false;
    const suffix = m[1 + 1] ?? '';
    const sep = HEADING_DECLARATION_SEPARATOR.exec(suffix);
    if (!sep)
        return false;
    // CommonMark §4.2 permits an optional closing `#` sequence when whitespace separates it from
    // the heading text. `None##` deliberately stays text because it has no separating whitespace.
    const declaration = suffix.slice(sep[0].length).replace(/[ \t]+#+[ \t]*$/, '').trim();
    // The WHOLE remainder must be the declaration (round 7, P1): `## Amendments: None` is an answer,
    // `## Amendments: None of the panel rows landed` is a sentence about outstanding work.
    return NONE_DECLARATION_EXACT.test(declaration);
}
/**
 * The `## Amendments` section body AND the same body with fenced examples blanked out. Both are
 * returned because they answer different questions: the RAW body is what a row's text is, and the
 * MASKED body is what counts as a row or as a heading at all. Two callers, one traversal, no way
 * for them to disagree about where the section is.
 */
function amendmentSectionPair(md) {
    const mask = maskMarkdown(md);
    const m = AMENDMENT_HEADING.exec(mask);
    if (!m)
        return null;
    const start = m.index + m[0].length;
    const depth = m[1].length;
    // The boundary is searched in the MASK for the same reason the heading is: a `## Something`
    // inside a fenced example does not end the section, it illustrates one.
    //
    // And it ends only at a heading of the SAME depth or SHALLOWER. A `### Amendments folded in from
    // the challenge panel` under a `## Amendments` is a CHILD, and round 6 made it a non-duplicate
    // for the ambiguity count while parsing still stopped dead at it — so `## Amendments: None` plus
    // a deeper subsection full of rows read as zero rows and answered skip/exit 0 (MEASURED
    // 2026-09-06, Codex round 7, P1). One rule for both questions: deeper is inside.
    const rest = mask.slice(start);
    const boundary = /^ {0,3}(#{1,6})\s+\S/gm;
    let end = md.length;
    for (let b = boundary.exec(rest); b !== null; b = boundary.exec(rest)) {
        if (b[1].length <= depth) {
            end = start + b.index;
            break;
        }
    }
    return { raw: md.slice(start, end), masked: mask.slice(start, end) };
}
/** The `## Amendments` section body, or null when the document has none (acid case A5). */
export function amendmentSection(md) {
    return amendmentSectionPair(md)?.raw ?? null;
}
/** `## Amendments` present but recording nothing to check — distinct from the section being absent. */
export function planSaysNoAmendments(planMd) {
    const sec = amendmentSection(planMd);
    if (sec === null)
        return false;
    // BOTH homes of the same declaration: the section body, and the heading suffix. A reader that
    // knows only one of them tells a plan that answered honestly that its grammar matched nothing.
    // The body form is the FIRST PARAGRAPH, whole: `None.` is a declaration, `None of the rows has
    // been written yet.` is prose about outstanding work and used to pass as one (round 7, P1).
    const firstParagraph = (sec.trim().split(/\n\s*\n/)[0] ?? '').trim();
    return headingSaysNone(planMd) || NONE_DECLARATION_EXACT.test(firstParagraph);
}
export function parseAmendments(md) {
    const pair = amendmentSectionPair(md);
    if (pair === null)
        return [];
    const section = pair.raw;
    // Rows are FOUND in the masked body (a fenced `- AM-9 …` is an example of the form, not an
    // amendment) and SLICED from the raw one, which is the text the row actually carries. The mask is
    // length-preserving, so an index means the same byte in both.
    const scan = pair.masked;
    const starts = [];
    ROW_START.lastIndex = 0;
    for (let m = ROW_START.exec(scan); m !== null; m = ROW_START.exec(scan)) {
        // group 1 is the optional `CP-` prefix, group 2 the number. The prefix is kept because it is
        // part of the id (backlog a7d0aece) — dropping it merges two provenances into one identity.
        starts.push({ index: m.index, prefix: m[1] ?? '', num: m[2] });
    }
    const rows = [];
    for (let i = 0; i < starts.length; i++) {
        const s = starts[i];
        const end = i + 1 < starts.length ? starts[i + 1].index : section.length;
        const raw = section.slice(s.index, end);
        // Pointers are read from the MASKED slice: a fenced example inside this row's block illustrates
        // the form, it does not answer for the row (Codex round 4, P2 — it used to, and that resolved a
        // testless amendment).
        const rowScan = scan.slice(s.index, end);
        rows.push({ id: `AM-${s.prefix}${s.num}`, testIds: extractTestIds(rowScan), file: extractFile(rowScan), raw, scan: rowScan });
    }
    return rows;
}
/** `superseded by AM-N` / `AM-CP-N` — the retraction form C6 has always accepted. */
const SUPERSEDED = /superseded by AM-(?:CP-)?\d+/i;
/** `→ test \`a\`` and the two-id shape `→ tests \`a\` and \`b\`` — both are in the corpus. */
function extractTestIds(raw) {
    const out = [];
    // Both arrows. C6 accepted `->` from the start and this file only accepted `→`, so an ASCII row
    // read as `unnamed` here while passing there — an accident of two authors, not a decision.
    const re = /(?:\u2192|->)\s*tests?\s+`([^`]+)`(?:\s*(?:and|и)\s*`([^`]+)`)?/g;
    for (let m = re.exec(raw); m !== null; m = re.exec(raw)) {
        if (m[1])
            out.push(m[1].trim());
        if (m[2])
            out.push(m[2].trim());
    }
    return out;
}
/**
 * The `in \`<path>\`` half, which in real reports frequently opens the line AFTER the id. A pattern
 * that cannot cross a newline finds almost nothing here — measured while writing this: three
 * successive shell-written extractors returned 108, 111 and 13 rows over the identical corpus.
 */
function extractFile(raw) {
    const m = /(?:\u2192|->)\s*tests?\s+`[^`]+`(?:\s*(?:and|и)\s*`[^`]+`)?[\s\S]{0,40}?\bin\s+`([^`]+)`/.exec(raw);
    return m && m[1] ? m[1].trim() : null;
}
export function resolveAmendments(rows, opts) {
    const out = [];
    for (const row of rows) {
        // A retraction is checked BEFORE the missing-pointer branch: a row that says it was superseded
        // is not a row that forgot its test.
        // The masked slice, for the same reason the pointer is: a retraction shown INSIDE a fenced
        // example is an illustration of the form, not this row's retraction.
        if (SUPERSEDED.test(rowScan(row))) {
            out.push({ id: row.id, testId: null, file: row.file, verdict: 'superseded', detail: 'the plan retracted this amendment and named its successor' });
            continue;
        }
        if (row.testIds.length === 0) {
            out.push({
                id: row.id,
                testId: null,
                file: row.file,
                verdict: 'unnamed',
                detail: 'the row carries no `→ test` token — an amendment with no pointer is not a passing amendment',
            });
            continue;
        }
        for (const testId of row.testIds) {
            out.push(resolveOne(row, testId, opts.readFile));
        }
    }
    return out;
}
function resolveOne(row, testId, readFile) {
    const base = { id: row.id, testId, file: row.file };
    if (PLACEHOLDER_IDS.has(testId.trim().toLowerCase())) {
        return { ...base, verdict: 'placeholder', detail: `\`${testId}\` is a template placeholder, not a test name` };
    }
    if (row.file === null) {
        return { ...base, verdict: 'no-file-named', detail: 'the row names a test id but no file to find it in' };
    }
    const body = readFile(row.file);
    if (body === null) {
        return { ...base, verdict: 'file-missing', detail: `\`${row.file}\` does not exist or cannot be read` };
    }
    const needle = normalizeTestId(testId);
    if (needle.length < MIN_MATCHABLE_ID_LENGTH) {
        return {
            ...base,
            verdict: 'name-absent-in-file',
            detail: `\`${testId}\` normalises to ${needle.length} characters — below the ${MIN_MATCHABLE_ID_LENGTH}-character floor, so a match would prove nothing`,
        };
    }
    // An existing FILE never stands in for an existing TEST (ADR-002) — and neither does an existing
    // COMMENT. Matching the whole file body is forgeable with two comment lines whose letters happen to
    // spell the id, so the basis is the file's TEST TITLES. Falling back to the body when none parse is
    // stated in the detail rather than done quietly: a silent fallback restores the hole it closes.
    const titles = extractTestTitles(body);
    const basis = titles.length > 0 ? titles.map(normalizeTestId).join('\n') : normalizeTestId(body);
    const basisNote = titles.length > 0 ? `${titles.length} test title(s)` : 'the whole file body — NO test titles parsed, so this match is weaker';
    if (!basis.includes(needle)) {
        return {
            ...base,
            verdict: 'name-absent-in-file',
            detail: `\`${row.file}\` exists but no test in it is named \`${testId}\` (searched ${basisNote})`,
        };
    }
    return { ...base, verdict: 'resolved', detail: `found in \`${row.file}\` (searched ${basisNote})` };
}
const ZERO_COUNTS = {
    resolved: 0,
    placeholder: 0,
    superseded: 0,
    unnamed: 0,
    'no-file-named': 0,
    'file-missing': 0,
    'name-absent-in-file': 0,
};
export function decideAmendmentOutcome(input) {
    const counts = { ...ZERO_COUNTS };
    for (const r of input.resolutions)
        counts[r.verdict]++;
    const reasons = [];
    // Inputs we could not read are never a verdict about the feature (acid case A7).
    if (input.readError) {
        return { outcome: 'not-established', exit: 3, reasons: [`inputs unreadable: ${input.readError}`], counts };
    }
    // Absence is a skip with a stated reason, never a pass and never a silent zero (acid case A5).
    if (!input.sectionPresent) {
        return {
            outcome: 'skip',
            exit: 0,
            reasons: ['no `## Amendments` section — nothing to check (this is an absence, not a pass)'],
            counts,
        };
    }
    // A document that opens the section TWICE contradicts itself, and the first heading used to answer
    // for both — a stale `## Amendments: None` above the real section bought a skip while the real
    // section's rows were never parsed (Codex round 6, P2; MEASURED skip/exit 0). Refused BEFORE the
    // explicit-none branch, and refused as INCONCLUSIVE rather than as a failure: which section is
    // authoritative is not something this checker can decide, and guessing would be the same class of
    // lie in a new place.
    if ((input.sectionCount ?? 0) > 1) {
        return {
            outcome: 'not-established',
            exit: 3,
            reasons: [
                `the document opens more than one rendered \`## Amendments\` section (${input.sectionCount}) — which one is authoritative is not decidable here, and the first one must never answer for the rest`,
            ],
            counts,
        };
    }
    // An explicit "None" is an ANSWER; zero rows from a section that says nothing is a BLIND SPOT.
    // Until 2026-09-06 the blind-spot branch below ran first, so a plan that honestly declared it had
    // no amendments got NOT-ESTABLISHED (exit 3) — an inconclusive verdict on a document that was
    // complete. MEASURED on this feature's own plan (backlog ce2da797e17a7a7f):
    // `dz amendment-check --feature-dir features/amendment-trace-cp-prefix --json` → exit 3 with
    // "the grammar matched nothing". The two facts are opposites and must not share a verdict.
    // GUARDED: only when nothing is OWED. A gap carried in from the ideation side is owed, so an
    // explicit "None" may never be the reason a dropped amendment exits 0 (that case falls through
    // to the blind-spot branch, which is inconclusive — never a pass).
    if (input.rows.length === 0 && input.planSaysNone && (input.missingFromPlan ?? []).length === 0) {
        // FAIL-CLOSED (round 7): a declaration only answers for a document that carries nothing
        // amendment-shaped below it. If it does and NOTHING parsed, the parser and the document
        // disagree — which is exactly the shape every one of the seven review rounds arrived in — and a
        // disagreement is NOT-ESTABLISHED. Absence of a receipt is not success.
        if (input.ambiguity) {
            return {
                outcome: 'not-established',
                exit: 3,
                reasons: [
                    `the \`## Amendments\` section declares no amendments but AM-like content exists at line ${input.ambiguity.line} ("${input.ambiguity.text}") while ZERO rows parsed — the declaration and the document disagree, and a disagreement is never a pass`,
                ],
                counts,
            };
        }
        return {
            outcome: 'skip',
            exit: 0,
            reasons: [
                'the `## Amendments` section explicitly declares no amendments ("None"/"нет"/"n/a") and zero rows parsed — an explicit absence, which is an answer and not a grammar failure (an absence is a skip, never a pass)',
            ],
            counts,
        };
    }
    // The whole class this feature removes: a check that silently checked nothing (AM-1, acid case A7).
    if (input.rows.length === 0) {
        return {
            outcome: 'not-established',
            exit: 3,
            reasons: [
                'the `## Amendments` section is present but ZERO rows parsed — the grammar matched nothing, which is not the same as nothing being wrong',
            ],
            counts,
        };
    }
    // Ideation carries rows while the plan records "None" — this is HIGH-2 itself (acid case A6).
    // Discovered while closing HIGH-2: the pointers belong in the PLAN. Step 6's own instruction is
    // "carry AM-N into 06_implementation_plan.md verbatim", and the ideation report is a historical
    // artifact — editing its rows to match tests that were named later would be rewriting the record
    // rather than closing the trail. So the plan's rows are authoritative when present, and the rule
    // that keeps that honest is coverage: an ideation amendment the plan never mentions is a DROPPED
    // amendment, which is the renegotiating-away failure in a quieter form.
    for (const gap of input.missingFromPlan ?? []) {
        reasons.push(gap.kind === 'dropped'
            ? `${gap.id} is an amendment in 03.5_ideation_report.md that 06_implementation_plan.md never carries — an amendment dropped in planning is one nobody can audit`
            : `${gap.id} appears in both documents but the plan describes a DIFFERENT change — "carry verbatim" means the subject survives; only the test pointer may be renamed`);
    }
    if (input.planSaysNone) {
        reasons.push(`the ideation report carries ${input.rows.length} amendment row(s) while 06_implementation_plan.md records \`## Amendments: None\` — the amendments were renegotiated away, and an amendment nobody can resolve is one nobody can audit`);
    }
    for (const r of input.resolutions) {
        // `superseded` is an OUTCOME, not a defect: the plan retracted the amendment and said so. It is
        // reported in the counts and never becomes a reason, which is the whole point — refusing
        // retraction is what produced the false failures this change removes.
        if (r.verdict !== 'resolved' && r.verdict !== 'superseded')
            reasons.push(`${r.id} → ${r.verdict}: ${r.detail}`);
    }
    return { outcome: reasons.length > 0 ? 'fail' : 'pass', exit: reasons.length > 0 ? 1 : 0, reasons, counts };
}
/** The one line every caller reads last, in the K2 gate's own shape so the two read alike. */
export function amendmentVerdictLine(d) {
    const label = d.outcome === 'not-established' ? 'NOT-ESTABLISHED' : d.outcome.toUpperCase();
    const head = `amendment traceability: ${label}`;
    const tail = d.outcome === 'pass'
        ? `${d.counts.resolved} row(s) resolved`
        : (d.reasons[0] ?? 'no reason recorded');
    return `${head} — ${tail}`;
}
/** Printed on every run: this checker does NOT prove a resolved test discriminates (NG-1, A8). */
export const AMENDMENT_VACUITY_NOTE = 'note: this checks that each amendment RESOLVES to a real test, not that the test is non-vacuous — `dz discrimination-check` owns vacuity.';
/**
 * The amendment's own text with the `→ test …` pointer clause and markdown furniture removed — what
 * "carry AM-N into the plan verbatim" is actually about. The POINTER may legitimately change (tests
 * are named later than ideation guesses); the SUBJECT may not.
 */
export function amendmentSubject(raw) {
    // BOTH arrows, for the same reason extractTestIds accepts both: the corpus carries `->` and `→`
    // from two authors, and splitting on only one leaves the whole Confirmation sentence inside the
    // "subject". Two documents that word their Confirmation differently — which they are entitled to,
    // since only the SUBJECT must survive verbatim — then read as a subject change. MEASURED
    // 2026-08-30 on os-matrix-pack-smoke: all 9 amendments resolved to real tests, yet all 9 reported
    // "the plan describes a DIFFERENT change"; the ideation used `->` throughout.
    // The pointer region starts at `Confirmation:` — everything from there on is HOW the amendment is
    // proven (which fixture, which arrow form, which test name), and the rule says only the pointer may
    // differ between the two documents. Splitting at the arrow alone left the Confirmation PROSE inside
    // the subject, so two documents describing the same fixture in different words read as a subject
    // change. Both arrows are still handled, for corpora that omit the `Confirmation:` lead-in.
    const withoutPointer = raw.split(/Confirmation\s*:/i)[0]?.split(/(?:\u2192|->)\s*tests?\s/)[0] ?? '';
    // Strip ONLY the row's furniture: bullet/table marks, the bold id, an optional `(source)` tag and
    // a colon. An earlier version consumed up to 80 characters after the id, which ate the SUBJECT
    // itself whenever a row carried no `(source):` tag — the checker then compared two truncations
    // and called honest rows a mismatch.
    // `AM-CP-N` is furniture too. Until 2026-09-05 this pattern demanded a digit straight after
    // `AM-`, so a panel row's own id stayed inside its "subject" and every CP row read as a different
    // change from every other one (backlog a7d0aece).
    const stripped = withoutPointer.replace(/^[\s|*\-]*\**AM-(?:CP-)?\d+\**\s*(?:\([^)]{0,80}\))?\s*:?\s*/, '');
    return normalizeTestId(stripped);
}
/**
 * Ideation amendments the plan fails to carry: either absent outright, or present under the same id
 * with a DIFFERENT subject. Cross-family review (Codex gpt-5.6-sol, 2026-08-21) found the second
 * case: comparing ids alone let a plan swap "deny unauthenticated deletes" for "render footer" under
 * the same `AM-1` and still pass.
 */
export function amendmentsMissingFromPlan(ideationRows, planRows) {
    const byId = new Map(planRows.map((r) => [r.id, r]));
    const gaps = [];
    for (const row of ideationRows) {
        const planRow = byId.get(row.id);
        if (planRow === undefined) {
            gaps.push({ id: row.id, kind: 'dropped' });
            continue;
        }
        const want = amendmentSubject(rowScan(row));
        const got = amendmentSubject(rowScan(planRow));
        // Containment either way: a plan may append a note ("closes HIGH-2"), and ideation may be the
        // longer prose. What it may not do is describe a different change.
        if (want.length >= MIN_MATCHABLE_ID_LENGTH && !got.includes(want) && !want.includes(got)) {
            gaps.push({ id: row.id, kind: 'subject-changed' });
        }
    }
    return gaps;
}
//# sourceMappingURL=amendment-trace.js.map
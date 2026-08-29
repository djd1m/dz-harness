/**
 * `dz score --slug <feature>` — score a feature-adr RUN's process discipline (feature dz-score,
 * Reading C of `features/dz-score/PROPOSAL.md`, chosen by the user 2026-07-28).
 *
 * It scores the PROCESS, not the code: were the ADR's safety properties given a named test? was
 * discrimination proven? did cross-model QE happen and what did it say? was the work verified live?
 * did the READMEs travel in the same change? did the learning loop run?
 *
 * Readings A (repo dashboard) and B (skill scoring) were rejected in the proposal: A invites
 * Goodharting the gates, B would be a fourth scoring surface. C is hard to game — the only way to
 * score well is to actually run the discipline.
 *
 * DESCRIPTIVE-ONLY, permanently: the command never gates, never exits non-zero on a low score.
 * The health-advisor 1.2.0 run is the reference case: its QE report marked the registration
 * criterion "✅ (mechanism)" with no live evidence — this scorecard exists to make that visible.
 *
 * Discriminators were chosen from a SURVEY of the 132 real runs on disk (34/77 ADRs carry a
 * Confirmation section; 31/75 QE reports carry MEASURED markers) — not guessed.
 *
 * PURE: the CLI reads the artifact files; this module only classifies.
 */
/** The artifact texts of one run, keyed by RELATIVE path under `features/<slug>/`. */
/**
 * The exact heading Step 5 asks for, and the exact heading the check looks for — ONE constant, so
 * the two cannot disagree by editing.
 *
 * This is not tidiness. A recalled lesson at 0.90 relevance records the same defect already shipped
 * once here: "a generator prompt and its QE gate MUST agree on section vocabulary — Step-3's Write
 * instruction listed legacy ADR sections while the injected brief listed the current ones." A prompt
 * asking for one heading while a check greps another produces a gate that fails every honest run,
 * and a gate that fails every honest run gets switched off.
 *
 * The sandboxed workflow cannot import, so it carries this string INLINE; a test asserts the inline
 * literal equals this export, which turns "remember to update both" into a red test.
 */
export const OBSERVABILITY_SECTION = 'Observability';
/**
 * Does an architecture artifact answer how the shipped feature will be watched?
 *
 * THREE outcomes, and the third is why this is usable at all:
 *  - `answered`      — the section is there.
 *  - `nothing-to-observe` — the section is there and says the feature emits nothing at runtime. A
 *    pure refactor or a CI-only gate genuinely does; a checker that cannot express a true fact is a
 *    checker people disable. The requirement is that the question is ANSWERED, not that it is yes.
 *  - `absent`        — no section. WARN-shaped by design: 107 architecture files predate this
 *    requirement, and a blocking verdict on day one would redden every re-run of every past feature.
 *
 * Honest limit, stated in ADR-002: nothing here verifies that a `nothing-to-observe` claim is TRUE.
 * The pipeline now asks. It does not ensure.
 */
export function observabilityAnswer(architectureMarkdown) {
    // Fenced blocks are stripped FIRST: a `## Observability` inside an example fence is not a section
    // of this document, and accepting one is a false pass anybody could write by accident
    // (cross-family review, finding 1).
    const text = String(architectureMarkdown ?? '').replace(/\r\n/g, '\n').replace(/^ {0,3}(```|~~~)[\s\S]*?^ {0,3}\1[^\n]*$/gm, '');
    // CommonMark: up to three leading spaces, then #s, then REQUIRED whitespace. `##Observability` is
    // not a heading and must not pass; an indented one is, and must not be missed (finding 2).
    const headingRe = new RegExp('^ {0,3}#{1,6}[ \t]+' + OBSERVABILITY_SECTION + '\\b.*$', 'gim');
    const lines = text.split('\n');
    const heads = [];
    lines.forEach((l, i) => { headingRe.lastIndex = 0; if (new RegExp('^ {0,3}#{1,6}[ \t]+' + OBSERVABILITY_SECTION + '\\b', 'i').test(l))
        heads.push(i); });
    if (heads.length === 0)
        return 'absent';
    // EVERY matching section is read, not just the first: a decoy or empty section at the top used to
    // mask a real answer below it, making the verdict order-dependent (finding 3).
    const verdicts = [];
    for (const h of heads) {
        let stop = lines.length;
        for (let i = h + 1; i < lines.length; i++) {
            if (/^ {0,3}#{1,6}[ \t]+/.test(lines[i])) {
                stop = i;
                break;
            }
        }
        const body = lines.slice(h + 1, stop);
        const first = body.map((l) => l.trim()).find((l) => l !== '' && !/^[-*]\s*$/.test(l));
        if (first === undefined) {
            verdicts.push('empty');
            continue;
        }
        // A claim OPENS the answer. Merely containing the phrase is a MENTION — "The phrase 'nothing to
        // observe' is not acceptable" opens with "The phrase" and is an answer, not a claim (finding 4).
        const opener = first.replace(/^[-*>\s]*/, '').replace(/^\*\*/, '').replace(/^["'`]/, '');
        verdicts.push(/^(nothing to observe|no runtime surface|emits nothing at runtime)/i.test(opener) ? 'nothing-to-observe' : 'answered');
    }
    // Best-of, in that order: one real answer anywhere beats a decoy; an explicit nothing-to-observe
    // beats an empty section; all-empty is reported AS empty and never as answered (finding 5).
    if (verdicts.includes('answered'))
        return 'answered';
    if (verdicts.includes('nothing-to-observe'))
        return 'nothing-to-observe';
    return 'empty';
}
function collect(artifacts, predicate) {
    return Object.entries(artifacts)
        .filter(([p]) => predicate(p))
        .map(([, text]) => text)
        .join('\n');
}
/** First matching line (trimmed, capped) — the evidence a verdict shows. */
function evidenceLine(text, re) {
    for (const line of text.split('\n')) {
        if (re.test(line))
            return line.trim().slice(0, 140);
    }
    return null;
}
/**
 * Like {@link evidenceLine}, but a NEGATED mention is not evidence: "Codex was not used" and
 * "no discrimination proof was performed" both satisfied the plain regexes (Codex QE #1, and its
 * heuristic table). A line whose match is preceded by a negation word is skipped. Heuristic — but
 * the failure mode flips from a silent false pass to a visible miss the shown evidence exposes.
 */
// The DEFAULT vocabulary — verbs and determiners that deny the sentence they sit in.
const NEGATION_RE = /\b(no|not|never|without|wasn'?t|isn'?t)\b/i;
/**
 * The default vocabulary plus the negative QUANTIFIERS. Opt-in per site, because a quantifier
 * negates a NOUN, not the claim: "None of the mutants survived; discrimination §42 is proven by the
 * red run" is idiomatic POSITIVE evidence that the wide list silently discarded (QE B-F2 —
 * negating-the-mutants is not negating-the-proof). It is passed only where a red test demanded it:
 * "Nothing was MEASURED in this round" scored as proof of measurement, because the word boundary in
 * `\bno\b` does NOT match "Nothing". Hedges like "skipped" stay out of both lists — they routinely
 * appear inside genuine evidence lines.
 */
// RU negation quantifiers joined 2026-08-24 with the RU live-markers (773185ca): a corpus where
// 63% of traffic is Russian was screened by an English-only list — «ничего не измерено» would have
// read as a live marker the moment ИЗМЕРЕНО joined the positives.
// \b is ASCII-only in JS even under /u — «не» never matched through it (measured by the pin the
// moment it was written). Unicode lookarounds carry the boundary instead.
const NEGATION_QUANTIFIED_RE = /\b(no|not|never|without|nothing|none|neither|nor|nobody|wasn'?t|isn'?t)\b|(?<![\p{L}\p{N}])(не|нет|ни одного|ничего|никогда|без)(?![\p{L}\p{N}])/iu;
function evidenceLinePositive(text, re, negationRe = NEGATION_RE) {
    for (const line of text.split('\n')) {
        if (!re.test(line))
            continue;
        // Whole-line negation: "Codex was NOT used" carries its negation AFTER the match, so a
        // before-the-match check missed it. The trade is deliberate: a genuine line that happens to
        // contain a negation is SKIPPED (a visible miss the evidence exposes) rather than a negated
        // line being ACCEPTED (a silent false pass).
        if (negationRe.test(line))
            continue;
        return line.trim().slice(0, 140);
    }
    return null;
}
// Word-bounded on BOTH sides: "upgrade B-tree" fabricated a B- (Codex QE #1). The lookahead also
// rejects "Grade B-tree" (letter after the dash) while keeping the real "Grade: A−" formats.
//
// CASE: the whole word is case-insensitive, not just its first letter. The previous `[Gg]rade`
// could never match an all-caps `GRADE A` — MEASURED 2026-08-22: 15 reports spell it that way, and
// for several of them it is the ONLY grade in the file, so the parser returned `null` about a
// report that plainly states its verdict (ADR-002, features/dz-recap).
// The trailing `(?![A-Za-z])` is NOT decoration. Making the word case-insensitive let `GRADED by
// an independent reviewer` match: the engine took `GRADE`, skipped the optional `d`, and read the
// word's own final `D` as the grade. The old lowercase-only pattern could never reach that state,
// so widening the alphabet shifted the threshold — caught by the regression half of the test,
// which is exactly why that half is mandatory (recalled lesson, Step 0).
// NOT global. `evidenceLine` calls `re.test(line)` in a loop, and a /g regex carries `lastIndex`
// between calls — it would skip matches on every other line. `readQeGrade` makes its own global
// copy instead. (Caught by the existing evidence-locator test when /g was added here.)
const GRADE_RE = /(?<![A-Za-z])[Gg][Rr][Aa][Dd][Ee][Dd]?(?![A-Za-z]):?\s*\*{0,2}\s*([A-F][+\u2212-]?)(?![A-Za-z-])/;
/** U+2212 and the ASCII hyphen spell the same grade; a tally must not count them twice. */
function normaliseGradeSign(grade) {
    return grade.replace('\u2212', '-');
}
/**
 * Read the review grade a report states — and refuse to guess when it states more than one.
 *
 * The obvious rules are both WRONG, and both were measured before this was written (ADR-002):
 * FIRST match returns the round-1 grade of a report that was later fixed; LAST match returns a
 * section heading naming the pre-fix grade, or a sentence quoting a grade in prose. Across 154
 * real reports the two disagree in 14 files, and in `crossrt-2-codex-hooks` NEITHER is right —
 * its true verdict is an all-caps `GRADE A` the old regex could not see at all.
 *
 * So: a grade is reported only when every occurrence agrees. Otherwise the caller is told the
 * report is ambiguous, which is a fact about the report, not a missing number.
 */
export function readQeGrade(qeText) {
    const found = [];
    const lines = qeText.split('\n');
    // Line offsets once, so each match maps to ITS line for the negation screen (67d7883d: the
    // parser was negation-blind — «No Grade: B was assigned» contributed B and a cross-model PASS;
    // the display-locator fix could not reach this because the GRADE rests here). The same
    // deliberate trade as evidenceLinePositive: a genuine grade on a line that happens to carry a
    // negation is SKIPPED (visible in `found`'s absence) rather than a negated line being COUNTED.
    const lineStarts = [0];
    for (let i = 0; i < lines.length - 1; i++)
        lineStarts.push(lineStarts[i] + lines[i].length + 1);
    // The screen covers the line PREFIX up to the match, not the whole line: «No Grade: B was
    // assigned» negates BEFORE the grade; «**Grade: B** — no blockers remain» carries its negation
    // AFTER, about something else entirely, and whole-line screening dropped that real, common
    // phrase (caught by the standing display-locator pin the moment the sweep was «completed»).
    const linePrefixOf = (idx) => {
        let lo = 0, hi = lineStarts.length - 1;
        while (lo < hi) {
            const mid = (lo + hi + 1) >> 1;
            if (lineStarts[mid] <= idx)
                lo = mid;
            else
                hi = mid - 1;
        }
        return qeText.slice(lineStarts[lo], idx);
    };
    for (const m of qeText.matchAll(new RegExp(GRADE_RE.source, 'g'))) {
        if (NEGATION_QUANTIFIED_RE.test(linePrefixOf(m.index ?? 0)))
            continue;
        const g = normaliseGradeSign(m[1]);
        if (!found.includes(g))
            found.push(g);
    }
    if (found.length === 0)
        return { status: 'none', grade: null, found: [] };
    if (found.length === 1)
        return { status: 'unique', grade: found[0], found };
    return { status: 'ambiguous', grade: null, found };
}
export function extractQeGrade(qeText) {
    return readQeGrade(qeText).grade;
}
export function scoreRun(slug, artifacts) {
    const adrText = collect(artifacts, (p) => p.startsWith('03_adr/'));
    const qeText = collect(artifacts, (p) => p === '08_qe_report.md' || p === '09_fleet_qe_assessment.md');
    const planText = collect(artifacts, (p) => p === '06_implementation_plan.md' || p === '03.5_ideation_report.md');
    const complexityText = collect(artifacts, (p) => p === '00_complexity_assessment.md');
    const manifestText = collect(artifacts, (p) => p.startsWith('07_code_changes/'));
    const allText = collect(artifacts, () => true);
    const disciplines = [];
    const add = (id, title, verdict, evidence) => {
        disciplines.push({ id, title, verdict, evidence });
    };
    // 0. Observability — does the artifact say how anyone would know this feature works once it ships?
    // DESCRIPTIVE by design (ADR-002): 107 architecture files predate the requirement, so a blocking
    // verdict on day one would redden every re-run of every past feature. `dz score` describes process
    // discipline and blocks nothing, which is exactly the shape this needs while the corpus catches up.
    {
        const archText = collect(artifacts, (p) => p === '05_architecture.md');
        // An ABSENT artifact and an EMPTY one are different facts, and `collect` returns '' for both.
        // Saying "no 05_architecture.md artifact" about a file that exists is a false evidence string —
        // the exact class this discipline exists to police (cross-family review, finding 6).
        const archPresent = Object.prototype.hasOwnProperty.call(artifacts, '05_architecture.md');
        if (!archPresent) {
            add('observability-declared', 'architecture says how it will be watched', 'absent', 'no 05_architecture.md artifact');
        }
        else if (archText.trim() === '') {
            add('observability-declared', 'architecture says how it will be watched', 'absent', '05_architecture.md exists but is empty');
        }
        else {
            const answer = observabilityAnswer(archText);
            if (answer === 'answered') {
                add('observability-declared', 'architecture says how it will be watched', 'pass', 'the ' + OBSERVABILITY_SECTION + ' section answers how the shipped feature is watched');
            }
            else if (answer === 'nothing-to-observe') {
                // A complete answer, not a gap — and NOT verified. ADR-002 says so out loud.
                add('observability-declared', 'architecture says how it will be watched', 'pass', 'declares nothing to observe at runtime (a complete answer; nothing here checks that it is true)');
            }
            else if (answer === 'empty') {
                // The heading is there and says nothing. `pass` here would be a verdict its own evidence
                // string contradicts — the section cannot "answer how" while containing no answer.
                add('observability-declared', 'architecture says how it will be watched', 'partial', 'the ' + OBSERVABILITY_SECTION + ' section is present but EMPTY — a heading is not an answer');
            }
            else {
                add('observability-declared', 'architecture says how it will be watched', 'absent', 'no ' + OBSERVABILITY_SECTION + ' section — the artifact does not say how anyone would know this works');
            }
        }
    }
    // 1. ADR with a Confirmation — a named decision whose load-bearing property names its test.
    if (adrText === '') {
        add('adr-confirmation', 'ADR present, property → named test', 'absent', 'no 03_adr/*.md artifact');
    }
    else {
        // POSITIVE (QE B-F2 reversed my first call, which exempted this site as "structural"). The
        // heading regex allows a SUFFIX, so `## Confirmation — not yet performed` — the realistic
        // placeholder an unfinished ADR carries — scored a full PASS. Heading presence is structural;
        // heading TEXT is not, and this one can deny itself. Default (narrow) vocabulary: a heading is
        // a fragment, and the quantifiers only appear in prose. Pinned both ways by tests.
        const conf = evidenceLinePositive(adrText, /^##+\s*Confirmation/i);
        add('adr-confirmation', 'ADR present, property → named test', conf !== null ? 'pass' : 'partial', conf ?? 'ADR exists but has no (non-negated) Confirmation heading — the load-bearing property names no test');
    }
    // 2. Discrimination — proof the test can FAIL (the §42 gate, or an explicit mutation proof).
    //    Default (narrow) vocabulary ON PURPOSE (QE B-F2): mutation evidence is written by negating the
    //    MUTANTS — "None of the mutants survived", "neither mutant escaped" — which is the proof, not
    //    its denial. The quantifiers would discard exactly the strongest lines this discipline exists
    //    to find. "No discrimination proof was performed" is still caught by the narrow list.
    const discr = evidenceLinePositive(allText, /discrimination|§42/i) ??
        evidenceLinePositive(allText, /mutation[s]?\s.*(prov|kill)|mutant[s]?\s.*(kill|red)|RED on the old|goes? RED|failed as expected/i);
    add('discrimination', 'the property test is proven able to fail', discr !== null ? 'pass' : 'absent', discr ?? 'no discrimination/§42/mutation-proof evidence in any artifact');
    // 3. Cross-model QE — an independent family reviewed it, and a grade exists.
    const grade = extractQeGrade(qeText);
    if (qeText === '') {
        add('cross-model-qe', 'independent cross-model review with a grade', 'absent', 'no 08_qe_report.md artifact');
    }
    else {
        const crossLine = evidenceLinePositive(qeText, /codex|gpt-|cross-model/i);
        // EXEMPT from the negation filter (wave1-scorer-negation, per-site review): this line is a
        // DISPLAY LOCATOR, not a verdict input — the verdict above rests on `crossLine` (already
        // positive-filtered) AND on `grade`, parsed from the whole report. A letter grade is a
        // structural token ("Grade: D"); there is no idiomatic "no Grade: D". Filtering here would only
        // drop the most common real grade line ("**Grade: B** — no blockers remain") from the shown
        // evidence for zero change in verdict. Pinned by a test. Residual, flagged not hidden:
        // `extractQeGrade` itself is negation-blind and stays so — out of FR-B1's scope.
        const gradeLine = grade !== null ? evidenceLine(qeText, GRADE_RE) : null;
        add('cross-model-qe', 'independent cross-model review with a grade', crossLine !== null && grade !== null ? 'pass' : 'partial', crossLine !== null
            ? grade !== null
                ? `${crossLine}${gradeLine !== null && gradeLine !== crossLine ? ` | ${gradeLine}` : ''}`.slice(0, 140)
                : `${crossLine} — but NO parseable grade`.slice(0, 140)
            : 'QE report exists but no (non-negated) cross-model reviewer is named (self-review only)');
    }
    // 4. Live verification — the property was observed, not inferred. The health-advisor 1.2.0 QE
    //    report is the cautionary case: "✅ (mechanism)" with no live evidence shipped a dead feature.
    //    POSITIVE (wave1-scorer-negation): "nothing was MEASURED" / "no reproducer was run" is the
    //    claim's exact opposite and used to score as proof of it (the crossrt-1 6/7 shape).
    // 773185ca: MEASURED-class markers in BOTH working languages. dz-recap carried 10× ИЗМЕРЕНО and
    // 0× MEASURED and scored «всё выведено рассуждением» — the cyrillic-tokenizer class again.
    const LIVE_MARKER_RE = /MEASURED|verified live|VERIFIED LIVE|reproducer|ИЗМЕРЕНО|МЕРЕНО|измерено|проверено живьём|живой прогон|репродьюсер/iu;
    const live = evidenceLinePositive(qeText, LIVE_MARKER_RE, NEGATION_QUANTIFIED_RE);
    const liveAnywhere = live ?? evidenceLinePositive(allText, LIVE_MARKER_RE, NEGATION_QUANTIFIED_RE);
    add('live-verification', 'claims verified by running, not by reasoning', live !== null ? 'pass' : liveAnywhere !== null ? 'partial' : 'absent', live ?? liveAnywhere ?? 'no MEASURED/ИЗМЕРЕНО/verified-live/reproducer marker anywhere — every claim is inferred');
    // 5. README-first — the docs travelled in the same change.
    //    POSITIVE (wave1-scorer-negation): THE acid-A5 defect. crossrt-1-agents-md scored ✓ here over
    //    its own finding "README-first not satisfied — no README was touched": a negation rendered as
    //    a checkmark. A README mention is not a README update.
    const readme = evidenceLinePositive(qeText + '\n' + manifestText, /README/, NEGATION_QUANTIFIED_RE);
    add('readme-first', 'READMEs updated in the same change', readme !== null ? 'pass' : 'absent', readme ?? 'no README mention in the QE report or the change manifest');
    // 6. The learning loop — Step-0 recall folded in, Step-8 lessons taught.
    //    POSITIVE both halves (wave1-scorer-negation): "recall was not performed" and "no lessons were
    //    taught (dz teach skipped)" both matched the plain regexes and scored the loop as RUN.
    const recalled = evidenceLinePositive(complexityText + '\n' + allText, /LEARNED_PATTERNS|dz recall|recalled/i, NEGATION_QUANTIFIED_RE);
    const taught = evidenceLinePositive(allText, /lesson[s]? taught|dz teach|taught \(/i, NEGATION_QUANTIFIED_RE);
    add('learning-loop', 'Step-0 recall used; Step-8 lessons taught', recalled !== null && taught !== null ? 'pass' : recalled !== null || taught !== null ? 'partial' : 'absent', recalled !== null && taught !== null
        ? `${recalled.slice(0, 68)} | ${taught.slice(0, 68)}`
        : recalled ?? taught ?? 'no recall/teach evidence — the run neither drew on nor fed the learned store');
    // 7. Amendment confirmation — only when amendments EXIST; their absence is not a failure.
    //    Born in the PLAN/ideation: a stray "AM-7" in QE prose (e.g. another feature's test name)
    //    must not conjure the discipline (caught by the very first dogfood run).
    const plannedAm = [...new Set(planText.match(/AM-\d+/g) ?? [])].sort();
    if (plannedAm.length > 0) {
        // One stray AM-9 in QE must not satisfy AM-1..AM-2 (Codex QE #3): coverage is id-by-id.
        const covered = plannedAm.filter((id) => qeText.includes(id));
        const missing = plannedAm.filter((id) => !qeText.includes(id));
        add('amendment-confirmation', 'amendments carried into QE with confirmation', missing.length === 0 ? 'pass' : covered.length > 0 ? 'partial' : 'partial', missing.length === 0
            ? `all planned amendments reach QE: ${plannedAm.join(', ')}`
            : `planned ${plannedAm.join(', ')} — QE never mentions ${missing.join(', ')}`);
    }
    const passed = disciplines.filter((d) => d.verdict === 'pass').length;
    const total = disciplines.length;
    const worst = disciplines.filter((d) => d.verdict === 'absent').map((d) => d.id);
    const summary = `${passed}/${total} disciplines fully evidenced` +
        (grade !== null ? ` · QE grade ${grade}` : ' · no QE grade') +
        (worst.length > 0 ? ` · absent: ${worst.join(', ')}` : '');
    return { slug, disciplines, qeGrade: grade, passed, total, summary };
}
const MARK = { pass: '✓', partial: '◐', absent: '✗' };
export function renderScorecard(card) {
    const out = [];
    out.push(`dz score — ${card.slug} (process scorecard; descriptive-only, never a gate)`);
    out.push('');
    for (const d of card.disciplines) {
        out.push(`  ${MARK[d.verdict]} ${d.title}`);
        out.push(`      ${d.evidence}`);
    }
    out.push('');
    out.push(`  ${card.summary}`);
    return out.join('\n');
}
//# sourceMappingURL=score.js.map
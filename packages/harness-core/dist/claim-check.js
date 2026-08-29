// SPDX-License-Identifier: MIT
//
// Ported from rUv / ruview (`@ruvnet/ruview@0.2.0`, `src/guardrails.js`), (c) rUv / ruview,
// MIT. Adapted for the dz harness monorepo. The hard-won detection semantics (label-vs-metric
// disambiguation, short-token `.map`/`map-reduce` guards, the `\b`-free `PERFECT_PCT_RE`, the
// code-span-scrub asymmetry, and the four-branch check order) are ported VERBATIM with their
// explanatory comments intact; ONLY the domain vocabulary lists (metric terms, reproducer hints,
// honest tags) and the human-facing reason/suggestion strings are re-worded from WiFi-sensing
// (ruview) to a skills/harness monorepo (dz).
//
// The dz Integrity Rule (CLAUDE.md) declares "NO shortcuts, fake data, or false claims; ALWAYS
// verify before claiming success." Today that rule is prose. This module is the static enforcement
// of it: every quantitative accuracy/coverage/count claim must be tagged MEASURED (with a
// reproducer) or CLAIMED/SYNTHETIC/ESTIMATED, and the retracted "100% / perfect" framing must
// never reappear untagged. It is a pure, never-throw, no-I/O module — all file reading lives in the
// `dz claim-check` CLI adapter and the `dz publish` pre-publish gate, mirroring how `usage.ts`
// keeps computation pure while the CLI does the reading.
/** Phrases that signal a quantitative accuracy claim (safe as substrings). */
const METRIC_TERMS = [
    // Generic accuracy vocabulary kept from ruview.
    // `recall` is NOT here — it is this repo's command name. It re-enters via RECALL_METRIC_RE, which
    // demands a scoring context. `precision` stays: it has no command collision.
    'accuracy', 'precision',
    'error rate', 'detection rate', 'true positive',
    // dz claim vocabulary — a harness monorepo claims coverage, test counts, catalogue sizes,
    // and performance numbers, not WiFi-sensing PCK/MPJPE.
    'coverage', 'tests passed', 'test count', 'skills', 'commands',
    'packages', 'presets', 'downloads', 'benchmark', 'speedup', 'latency',
];
// Short/ambiguous metric tokens (ADR-263 F11): 'f1'/'o1' collide with finding/option labels.
// They only count as metric mentions when word-bounded, and the line (after scrubbing) carries a
// number — "auc 0.9" is a claim, "F-numbers map to findings" is not.
// `\d+ tests` is dz's single most-repeated headline claim ("2136 tests") and was slipping through:
// the substring term is 'tests passed', so a bare count never fired. Anchor it to a PRECEDING number
// rather than adding a bare 'test' term — otherwise every `usage.test.ts:42` path reference would
// register as a metric mention.
// NOTE: 'map' is NOT here. A line-wide "has a number" gate fired on the English word `map` next to any
// incidental digit — a `FR-2` label, a `v2`, an `item 2` (MEASURED — features/claimcheck-map-fp).
// mAP the metric is written with its score ADJACENT, so it gets a scoring-context regex (MAP_METRIC_RE),
// exactly as `recall` does (RECALL_METRIC_RE), instead of the loose line-wide gate.
const METRIC_TERMS_SHORT = [
    /\bf1\b/, /\bauc\b/, /\biou\b/,
    /\b\d[\d,._]*\s+tests?\b/,
];
// Finding/option labels (F1, O2, …) count as labels unless the token sits in a
// metric context: an immediately following score/=/%/digit or colon ("F1: 0.91"),
// or a number later in the same clause ("F1 reaches 0.91" — an F1-score claim).
// Bare option refs ("F7 fixes", "O1–O9", "ADR-263 O2") carry no clause number of
// their own and stay labels. (A surviving 'f1' still only fires as a metric when
// its scrubbed line actually carries a number — see mentionsMetricTerm.)
const LABEL_TOKEN_RE = /\b[fo]\d+\b(?!\s*(?:score|=|\d|%|:))(?![^\n.;]*\d)/g;
const CODE_SPAN_RE = /`[^`]*`/g; // backticked identifiers are code, not claims
// Markdown link/image TARGETS are machinery, not prose claims. A shields.io badge URL
// (`![Skills](https://img.shields.io/badge/skills-167-brightgreen)`) embeds the very words and
// numbers this checker hunts for, so leaving URLs in produced ~600 findings on this repo — noise
// that buries the real ones. The link TEXT is kept, so a claim written in prose still fires; the
// same counts always appear in prose next to the badges. Consequence, accepted knowingly: a number
// that exists ONLY inside a URL is not checked.
const MD_URL_RE = /\]\([^)\s]*(?:\s[^)]*)?\)/g;
const AUTOLINK_RE = /<https?:\/\/[^>]*>|(?<![(<])\bhttps?:\/\/\S+/g;
/** Strip markdown link/image targets and bare URLs, keeping the surrounding prose. */
function stripUrls(s) {
    return s.replace(MD_URL_RE, '] ').replace(AUTOLINK_RE, ' ');
}
const HAS_NUMBER_RE = /\d/;
/** Line with code spans and finding/option labels removed. */
function scrubLine(lower) {
    return lower.replace(CODE_SPAN_RE, ' ').replace(LABEL_TOKEN_RE, ' ');
}
function mentionsMetricTerm(lower, scrubbed) {
    if (METRIC_TERMS.some((t) => lower.includes(t)))
        return true;
    // `recall` only in a scoring context (see RECALL_METRIC_RE). `precision` on the line is enough:
    // "precision 0.9 / recall 0.8" is the canonical ML pair.
    if (RECALL_METRIC_RE.test(scrubbed))
        return true;
    // mAP: a metric only with a score adjacent (see MAP_METRIC_RE). The regex embeds its own number, so
    // it is checked before the loose line-wide HAS_NUMBER gate — the same shape as recall above.
    if (MAP_METRIC_RE.test(scrubbed))
        return true;
    if (!HAS_NUMBER_RE.test(scrubbed))
        return false;
    return METRIC_TERMS_SHORT.some((re) => re.test(scrubbed));
}
/**
 * The PARAGRAPH containing 1-based `line`: the maximal run of contiguous non-blank lines, bounded by
 * a blank line, a heading, or a fence marker. The claim is DETECTED per line; its honesty tag and its
 * reproducer may live anywhere in this run — prose wrapped at 100 columns routinely splits a number
 * from its `MEASURED`, and flagging the author who tagged correctly is how a gate teaches its users to
 * ignore it.
 *
 * LAUNDERING EXPOSURE, stated: one tag covers every claim in its paragraph. It cannot cross a blank
 * line, a heading, or a fence.
 */
function paragraphAround(lines, i) {
    const bounds = (k) => k.trim() === '' || HEADING_RE.test(k) || FENCE_RE.test(k);
    let a = i;
    let b = i;
    while (a > 0 && !bounds(lines[a - 1] ?? ''))
        a--;
    while (b < lines.length - 1 && !bounds(lines[b + 1] ?? ''))
        b++;
    return lines.slice(a, b + 1).join('\n');
}
/** Tags that make a claim honest (case-insensitive). */
// `estimated` agrees with the `estimated: true` honest-uncertainty marker `dz usage` already
// emits — the two honesty systems must not contradict each other.
const HONEST_TAGS = ['measured', 'claimed', 'synthetic', 'unvalidated', 'baseline', 'estimated'];
/**
 * Is the 1-based `line` inside a fenced code block within `text`?
 *
 * OWNED HERE, re-exported by `claim-check-hook-policy.ts`. The engine skips fenced lines; the hook
 * exempts them from its deny path. Two implementations of "inside a fence" would drift; one cannot.
 *
 * CommonMark allows BOTH ``` and ~~~ fences, and a fence closes only on its OWN marker — a ``` inside
 * a ~~~ block is literal content, not a toggle. A naive toggle counter that accepts either marker
 * mis-tracks nesting, so track the open marker instead. Never throws.
 */
export function isFenced(text, line) {
    if (typeof text !== 'string' || typeof line !== 'number' || !isFinite(line) || line < 1)
        return false;
    const lines = text.split(/\r?\n/);
    const upTo = Math.min(line - 1, lines.length);
    let open = null;
    for (let i = 0; i < upTo; i++) {
        const m = FENCE_RE.exec(lines[i] || '');
        if (!m)
            continue;
        const marker = m[1][0];
        if (open === null)
            open = marker;
        else if (open === marker)
            open = null;
    }
    return open !== null;
}
const FENCE_RE = /^\s*(`{3,}|~{3,})/;
const HEADING_RE = /^\s{0,3}#{1,6}\s/;
/**
 * `recall` is ruview's completeness metric AND this repo's command name (`dz recall`). Matching it as
 * a bare term produced 31 false positives (MEASURED — reproducer `dz claim-check --json`), every one
 * of them prose about the command. It counts as a metric only in a scoring context: paired with
 * `precision`, or immediately followed by a score (`recall@5`, `recall rate`, `recall of 0.9`,
 * `recall = 0.9`, `recall score`).
 */
const RECALL_METRIC_RE = /\brecall\s*(?:@\s*\d|rate\b|score\b|of\s+[\d.]|[:=]\s*[\d.])/i;
/**
 * mAP (mean Average Precision) is both a metric AND the English word `map`. Matching it via the
 * line-wide "has a number" gate fired on every line where `map` co-occurred with an unrelated digit —
 * a `FR-2` label, a `v2`, an `item 2` (MEASURED — reproducer matrix in features/claimcheck-map-fp).
 * Like `recall`, it counts as a metric only in a SCORING CONTEXT: a score sits ADJACENT to the token.
 *
 * Fires on: `mAP 62.3`, `mAP: 0.62`, `mAP=62`, `mAP@0.5`, `62.3 mAP`, `62% mAP`.
 * Does not fire on: `the map imports` + `FR-2`, `.map` file, `map-reduce`, `a map of 3 zones`.
 *
 * A real mAP score is a DECIMAL or a PERCENT (`0.62`, `62.3`, `62%`) — never a bare integer and never a
 * lone dot. Requiring that (not merely "a digit or dot", which cross-model review showed fires on
 * `map: 3 zones`, `map @ 5 locations`, and even `map: .env`) is what separates the metric from prose:
 * `map 3 items`, `a map of 3 zones`, `top 5 map layers` all stay prose. An optional `@`/`:`/`=` may sit
 * between the token and its score. `(?<![.\w])` excludes `.map`; `(?!-)` excludes `map-reduce`/`map-free`.
 *
 * Known, accepted limitation (cross-model review): exotic notations `mAP50 62.3`, `mAP@[.5:.95]` are NOT
 * matched — under-detection of rare forms, not a false positive. dz's own claims use `mAP 62.3`.
 */
const MAP_SCORE = String.raw `(?:\d+\.\d+|\.\d+|\d+\s*%)`;
const MAP_METRIC_RE = new RegExp(String.raw `(?<![.\w])map\b(?!-)\s*(?:[@:=]\s*)?${MAP_SCORE}|${MAP_SCORE}\s+(?<![.\w])map\b(?!-)`, 'i');
/**
 * A shell reproducer is STRUCTURAL, never a word. `(MEASURED — reproducer)` is self-certifying and
 * must not pass; a backticked span whose first token is a command this repo actually measures with is
 * evidence. The allowlist boundary is exactly that: an unknown binary is a claim ABOUT evidence.
 */
const SHELL_REPRO_RE = /`\s*\$?\s*(?:ps|stat|lsof|time|git|npm|npx|node|pnpm|yarn|dz|curl|wc|grep|find|cargo|make|docker|kubectl|awk|sed|du|df|vitest|pytest)\b[^`]*`/i;
/** Reproducer references that count as evidence backing a MEASURED claim. */
const REPRODUCER_HINTS = [
    // Generic evidence hints kept from ruview.
    // 'reproduce' was inherited from ruview and is SELF-CERTIFYING: it makes the bare word "reproducer"
    // count as its own evidence, so `(MEASURED — reproducer)` passed. Removed (D5). Evidence must be a
    // named command or artifact — see SHELL_REPRO_RE for the structural form.
    'baseline', 'sha256', 'tarball', 'cargo test',
    // Packaging-claim reproducers (npm reviews): the tarball itself.
    'npm pack', 'npm view', 'npm i ', 'npm install',
    // dz reproducers — the actual commands/artifacts that back a dz claim.
    'npm test', 'vitest', 'npm run', 'git rev', 'commit',
    'test output', 'coverage report', 'measured on',
];
const PERCENT_RE = /\b(\d{1,3}(?:\.\d+)?)\s?%/g;
// "perfect" / "100%" framing is the specific retracted claim — always high severity.
// NOTE: no trailing \b after "%": "%"→" " is non-word→non-word, so a trailing \b
// never matches and would silently miss "100%". Bare 100% is only damning next to a
// metric term (see claimCheck); the word phrases are inherently accuracy claims.
const PERFECT_PCT_RE = /\b100(?:\.0+)?\s?%/;
const PERFECT_WORD_RE = /perfect accuracy|flawless|never (?:wrong|fails)/i;
/**
 * Lint a block of text for untagged or overstated accuracy claims.
 * Pure and never-throws: a non-string or empty input returns `{ ok: true, findings: [] }`.
 */
export function claimCheck(text) {
    const findings = [];
    if (typeof text !== 'string' || text.length === 0) {
        return { ok: true, findings };
    }
    const lines = text.split(/\r?\n/);
    lines.forEach((raw, i) => {
        const original = raw.trim();
        if (!original)
            return;
        // A fenced block is CODE, not prose. The hook already exempts fenced lines from its deny path
        // (it re-exports `isFenced` from here); the engine flagging them was not a policy, it was a bug —
        // 127 of this repo's 488 findings lived inside fences, and NONE of them was `high`
        // (MEASURED — reproducer `dz claim-check --json`).
        // EXPOSURE, accepted: a claim written inside a fence is now unreachable. That is exactly the right
        // the inline backtick escape already grants; a fence is its block-level form.
        if (isFenced(text, i + 1))
            return;
        // Analyse the URL-stripped line, but report the ORIGINAL so the excerpt stays recognisable.
        const line = stripUrls(original);
        if (!line.trim())
            return;
        const lower = line.toLowerCase();
        const scrubbed = scrubLine(lower);
        // The percent TRIGGER reads the code-span-scrubbed line. Before this, `hasPercent` was computed on
        // the UN-scrubbed line while metric terms were matched on the scrubbed one, so a backticked `99%`
        // still opened the scan: the backtick escape downgraded a quoted claim from `high` to `medium`
        // instead of silencing it. Documentation that quotes a forbidden claim was punished for doing so.
        const hasPercent = PERCENT_RE.test(scrubbed);
        PERCENT_RE.lastIndex = 0; // reset stateful global regex
        // DELIBERATE DIVERGENCE from ruview, which matched METRIC_TERMS against the UNSCRUBBED line.
        // dz's vocabulary contains path-like words ('packages', 'commands', 'skills'), so a code span
        // such as `packages/x/usage.test.ts:42` registered as a metric mention and produced a false
        // positive on prose that merely cites a file. Matching the code-span-scrubbed line fixes it:
        // "accuracy reached `0.95`" still fires because 'accuracy' sits OUTSIDE the span, while the
        // number check below deliberately keeps reading the un-code-scrubbed line so `0.95` counts.
        const mentionsMetric = mentionsMetricTerm(scrubbed, scrubbed);
        if (!hasPercent && !mentionsMetric)
            return;
        // The claim is detected on its own line; its honesty tag and reproducer may live anywhere in the
        // same paragraph. Wrapped prose routinely puts `MEASURED` on the next line.
        const para = stripUrls(paragraphAround(lines, i));
        const paraLower = para.toLowerCase();
        const tagged = HONEST_TAGS.some((t) => paraLower.includes(t));
        const hasReproducer = REPRODUCER_HINTS.some((h) => paraLower.includes(h)) || SHELL_REPRO_RE.test(para);
        const perfect = PERFECT_WORD_RE.test(line) || (mentionsMetric && PERFECT_PCT_RE.test(line));
        if (perfect && !lower.includes('retract')) {
            findings.push({
                severity: 'high',
                line: i + 1,
                excerpt: clip(original),
                reason: 'States perfect/100% accuracy — this is the exact framing the Integrity Rule forbids.',
                suggestion: 'Replace with a measured number vs a baseline, tagged MEASURED (name the reproducer: npm test, coverage report), or mark the old claim "retracted".',
            });
            return;
        }
        // A quantitative claim needs a number. Digits hidden in a code span still
        // count — "accuracy reached `0.95`" is a claim — so test the line with only
        // finding/option labels stripped, NOT the code-span-scrubbed copy: scrubbing
        // dropped `0.95` and wrongly short-circuited both the untagged and the
        // MEASURED-without-reproducer checks below. A bare metric word in prose
        // ("precision matters here", "every accuracy number must be MEASURED") has no
        // number and is not a taggable claim (ADR-263 F11).
        if (!hasPercent && !HAS_NUMBER_RE.test(lower.replace(LABEL_TOKEN_RE, ' ')))
            return;
        // A metric/percent with no honesty tag at all.
        if (!tagged) {
            findings.push({
                severity: 'medium',
                line: i + 1,
                excerpt: clip(original),
                reason: 'Accuracy claim is not tagged MEASURED / CLAIMED / SYNTHETIC / ESTIMATED.',
                suggestion: 'Tag it. If MEASURED, name the reproducer (npm test, coverage report, git rev, npm view).',
            });
            return;
        }
        // Tagged MEASURED but cites no reproducer — still a gap (reached now even
        // when the only number is inside a code span, e.g. "accuracy `0.97` (MEASURED)").
        if (lower.includes('measured') && !hasReproducer) {
            findings.push({
                severity: 'medium',
                line: i + 1,
                excerpt: clip(original),
                reason: 'Tagged MEASURED but cites no reproducer/evidence.',
                suggestion: 'Add the evidence path: npm test output, a coverage report, npm view, or a git rev/commit.',
            });
        }
    });
    return { ok: findings.length === 0, findings };
}
function clip(s, n = 120) {
    return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}
/** Convenience: a one-line human summary for CLI output. */
export function summarize(result) {
    if (result.ok)
        return 'claim-check: PASS — no untagged or overstated accuracy claims.';
    const high = result.findings.filter((f) => f.severity === 'high').length;
    return `claim-check: ${result.findings.length} finding(s) (${high} high) — accuracy claims need MEASURED/CLAIMED tags + a reproducer.`;
}
/** Empty / whitespace-only / non-string ⇒ error. A real paragraph ⇒ run. */
export function decideClaimCheckText(text) {
    if (typeof text !== 'string') {
        return { kind: 'error', reason: 'text must be a string, got ' + typeof text };
    }
    // Cross-model review: trim() leaves zero-width and format characters (U+200B ZWSP, U+200D ZWJ,
    // U+FEFF BOM, other Cf), so a string of invisibles would pass as `run` and vet nothing. Strip all
    // whitespace AND Unicode format/control characters before the emptiness test.
    const visible = text.replace(/[\s\u200B-\u200F\u202A-\u202E\u2060-\u206F\uFEFF]|\p{Cf}|\p{Cc}/gu, '');
    if (visible.length === 0) {
        return { kind: 'error', reason: 'text is empty or only invisible characters — nothing to vet' };
    }
    return { kind: 'run' };
}
/** Severity counts, so a caller can gate without re-walking the findings. */
export function severityCounts(result) {
    let high = 0;
    let medium = 0;
    for (const f of result.findings) {
        if (f.severity === 'high')
            high++;
        else if (f.severity === 'medium')
            medium++;
    }
    return { high, medium };
}
/**
 * Whether a run RESULT trips the caller's threshold. Reporting only — never throws, never converts the
 * fail-closed empty case (which is handled earlier by `decideClaimCheckText`) into a pass.
 *   'high'   ⇒ gated iff any high finding
 *   'medium' ⇒ gated iff any high OR medium finding
 *   'none'   ⇒ never gated
 */
export function isGated(result, failOn) {
    const { high, medium } = severityCounts(result);
    if (failOn === 'none')
        return false;
    if (failOn === 'high')
        return high > 0;
    if (failOn === 'medium')
        return high > 0 || medium > 0;
    // Cross-model review: an unknown failOn (only reachable via a direct call, since the Zod enum guards
    // the tool) must not silently behave like 'medium'. Fail SAFE: gate on any finding.
    return high > 0 || medium > 0;
}
//# sourceMappingURL=claim-check.js.map
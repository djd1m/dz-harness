#!/usr/bin/env node
// K2 — machine plan-completeness gate for /feature-adr, run BETWEEN Step 6 (plan) and Step 7 (code).
// Generalized from features/wave1-instrument-repair/check-plan-completeness.mjs (that copy is the
// historical artifact of its run and stays untouched); this one is parameterized by feature dir.
//
// USAGE:  node .claude/skills/feature-adr/scripts/check-plan-completeness.mjs [<feature-dir>] [--tier=M] [--acid=A1,A2]
//         <feature-dir> defaults to the current working directory.
//         --tier=S|M|L|XL closes the ADR-less dodge (see S-TIER HONESTY); omitting it keeps the
//         heuristic, and the skip note then names the dodge out loud.
//
// VERDICT CONTRACT (unchanged from the proven copy — never a silent pass):
//   PASS            exit 0   last line: `K2 plan-completeness: PASS (...)`
//   FAIL            exit 1   last line: `K2 plan-completeness: FAIL (...)`
//   NOT-ESTABLISHED exit 3   last line: `K2 plan-completeness: NOT-ESTABLISHED — <reason>`
// (the wave1 copy printed the exit-3 line as `K2: NOT-ESTABLISHED — …`; the prefix is unified here so
//  ONE regex parses all three verdicts — the exit codes and their meanings are identical.)
// Set difference over IDENTIFIERS, not text similarity.
//
// KNOWN LIMITATION (measured on the discrimination twin, 2026-08-19): C1 is a grep — a PROSE
// mention of "ADR-002" satisfies it exactly like a task reference. The real N14 (backlog
// 3dbd2851-adjacent) must parse task structure. Kept honest here: C1 catches "forgot entirely",
// not "mentioned but not tasked".
//
// Checks:
//  C1  every ADR file in 03_adr/ has >=1 task line in 06_implementation_plan.md citing it (ADR-00N)
//  C2  every Confirmation-numbered check in each ADR is named in the plan (by its test-file path)
//  C3  the plan carries an EXPECTED_CODE_TARGETS: block, non-empty, and EVERY line parses to a
//      plausible repo-relative path (no spaces unless quoted, no traversal, no markdown residue)
//      — SFDIPOT condition: line-level validation, reject-with-reason, not just block presence
//  C4  the plan names the feature's OWN acid corpus (see "acid corpus" below)
//  C5  the plan has an 'Inputs read:' line naming 03_adr, 05_architecture (wave-2 seam, cheap here)
//
// S-TIER HONESTY (no 03_adr/): an S-tier run legitimately has no ADR files, and forcing it to fail a
// plan gate it can never satisfy would make the gate a nuisance to route around. So:
//   - no ADR files BUT the plan cites `ADR-<digits>`  → NOT-ESTABLISHED (exit 3): the plan claims
//     decisions the gate cannot see, so its completeness is unknown — that is never a pass.
//   - no ADR files AND --tier is M/L/XL → FAIL: an M+ feature owes ADRs, and skipping C1/C2 for it
//     would let a whole tier dodge the check by simply not writing 03_adr/ (G-F3).
//   - no ADR files AND (--tier=S or no --tier) AND the plan claims no ADR work
//       → C1 + C2 are SKIPPED-with-note (printed as SKIP lines; the run can still PASS on C3-C5).
//     Without --tier the skip note NAMES the dodge, because the gate cannot tell an honest S-run
//     from an M+ run that deleted its ADR directory.
//
// ECHO SAFETY (G-F1, reproduced by execution): this script echoes plan-controlled content (rejected
// target lines, acid tokens, the feature path). A plan line carrying the literal verdict marker was
// echoed verbatim and a first-match parser upstream read the PLANT instead of the real verdict. Every
// echoed value now goes through `safe()`, which defangs the marker and the exit trailer and truncates,
// so the only spellable verdict line in this stream is the one this script writes last.
//
// ACID CORPUS (C4): the wave1 copy hard-coded ITS run's tokens. Here the corpus is DISCOVERED from
// the feature's own `00_complexity_assessment.md` acid-case table (rows shaped `| A<N> | … |`), or
// supplied explicitly with `--acid=T1,T2,…`. If neither establishes a corpus, C4 is SKIPPED-with-note
// (a feature that declared no acid cases cannot be failed for not naming them).
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { isAbsolute, join, resolve } from 'node:path';

const argv = process.argv.slice(2);
const acidArg = argv.find((a) => a.startsWith('--acid='));
const tierArg = argv.find((a) => a.startsWith('--tier='));
const TIER = tierArg ? tierArg.slice('--tier='.length).trim().toUpperCase() : null;
const TIER_REQUIRES_ADR = TIER === 'M' || TIER === 'L' || TIER === 'XL';
const dirArg = argv.find((a) => !a.startsWith('--'));
const FDIR = resolve(dirArg && dirArg !== '' ? (isAbsolute(dirArg) ? dirArg : join(process.cwd(), dirArg)) : process.cwd());
const planPath = join(FDIR, '06_implementation_plan.md');
const adrDir = join(FDIR, '03_adr');
const complexityPath = join(FDIR, '00_complexity_assessment.md');

// Defang any value this script echoes back: a plan (or a path, or an ADR) must never be able to spell
// the verdict marker or the exit trailer into this stream. Truncated so one hostile line cannot bury
// the verdict either. The offender stays READABLE — defanged, not dropped.
const safe = (v) => String(v)
  .replace(/K2 plan-completeness:/g, 'K2 plan-completeness[echoed]:')
  .replace(/K2_EXIT=/g, 'K2_EXIT[echoed]=')
  .replace(/[\r\n]+/g, ' ')
  .slice(0, 300);
const out = (s) => console.log(s);
const notEstablished = (why) => { out(`K2 plan-completeness: NOT-ESTABLISHED — ${safe(why)}`); process.exit(3); };
let failures = [], warnings = [], skips = [];

if (!existsSync(FDIR)) notEstablished(`feature dir absent: ${FDIR}`);
if (!existsSync(planPath)) notEstablished('06_implementation_plan.md absent');
const plan = readFileSync(planPath, 'utf-8');
if (plan.trim().length < 200) notEstablished('plan suspiciously small (<200 chars)');
const adrFiles = existsSync(adrDir) ? readdirSync(adrDir).filter(f => f.endsWith('.md')).sort() : [];
const planClaimsAdrWork = /\bADR-\d+/.test(plan);
if (adrFiles.length === 0 && planClaimsAdrWork) notEstablished('no ADR files under 03_adr/, yet the plan cites ADR-<n> — completeness cannot be established');

// ── C2 test-path predicate (P16/D1) — language-neutral, two stages ────────────────────────────
// The shipped rule demanded a `.test.(ts|mjs|js)` SUFFIX, so C2 could never be satisfied outside
// JS/TS: MEASURED 2026-08-20 over a 15-path corpus, 4/4 JS forms matched and 0/11 non-JS forms did
// (`tests/test_x.py`, `x_test.go`, `tests/x.rs`, `XTest.java`, `XTests.cs`, …) — and zero matches is
// the C2 FAIL branch, so the gate blocked every non-JS repo. The fix is a PREDICATE, not a wider
// regex: "contains the word test" would admit `docs/testing.md` and `src/latest.rs`, and a gate that
// passes prose is worse than one that fails Python.
//
// STAGE 1 (extractCandidatePaths) — pull candidate PATHS out of prose. The left edge is ANCHORED on
// a boundary character so a longer token can never donate a substring (`xcontests/foo.test.ts` must
// not yield `foo.test.ts`), and a candidate MUST carry at least one directory segment and an
// extension — a bare `test_staleness.py` written inside a sentence is a name, not a path.
// STAGE 2 (isTestPath) — ONE `$`-anchored rule per ecosystem. The anchoring IS the safety argument:
// every acid item is refused by construction rather than by a blocklist.
// DELIBERATELY NOT DONE: no `existsSync` decides whether a Confirmation path is valid — C2 runs
// BEFORE Step 7 writes the test, so a file-existence probe there would fail every honest plan.
const CANDIDATE_PATH_RE = /(?:^|[\s`'"(|])((?:[.\w@][\w@.-]*\/)+[\w@.-]+\.[A-Za-z0-9]+)/g;
const extractCandidatePaths = (text) => {
  const found = [];
  CANDIDATE_PATH_RE.lastIndex = 0;
  let m;
  while ((m = CANDIDATE_PATH_RE.exec(String(text))) !== null) found.push(m[1]);
  return [...new Set(found)];
};

// One rule per ecosystem, each anchored at the END of the path. Adding an ecosystem is a data edit.
const BUILTIN_TEST_PATH_RULES = [
  { ecosystem: 'js', re: /\.(?:test|spec)\.(?:ts|tsx|mts|cts|mjs|cjs|js|jsx)$/ },
  { ecosystem: 'pytest', re: /(?:^|\/)test_[^/]+\.py$/ },
  { ecosystem: 'pytest', re: /[^/]+_test\.py$/ },
  { ecosystem: 'go', re: /[^/]+_test\.go$/ },
  { ecosystem: 'rust', re: /(?:^|\/)tests\/[^/]+\.rs$/ },
  { ecosystem: 'rust', re: /(?:^|\/)tests\.rs$/ },
  { ecosystem: 'jvm', re: /[^/]+(?:Test|Tests|IT|Spec)\.(?:java|kt|kts|scala|groovy)$/ },
  { ecosystem: 'dotnet', re: /[^/]+(?:Test|Tests)\.(?:cs|fs|vb)$/ },
];
const KNOWN_ECOSYSTEMS = 'JS/TS *.test|spec.[tj]s, pytest test_*.py + *_test.py, Go *_test.go, Rust tests/*.rs + tests.rs, JVM *Test|Tests|IT|Spec.java|kt|kts|scala|groovy, .NET *Test|Tests.cs|fs|vb';
// The override channel lives in the manifest the pipeline ALREADY probes at Step 0 — a second
// dotfile would be a second thing to keep in sync. Resolved against the TARGET REPO cwd (the gate
// command cd's into the repo first); never shelled out to `dz project-skills`, because a gate that
// needs a working `dz` to decide whether a path is a test inherits every one of dz's own failures.
const MANIFEST_REL = 'architecture/project-skills.json';
function loadTestPathRules() {
  const rules = BUILTIN_TEST_PATH_RULES.slice();
  const manifestPath = join(process.cwd(), MANIFEST_REL);
  if (!existsSync(manifestPath)) return rules;
  let text = null;
  try { text = readFileSync(manifestPath, 'utf-8'); } catch { notEstablished(`testPathRules unreadable: ${MANIFEST_REL} could not be read`); }
  let manifest = null;
  try { manifest = JSON.parse(text); } catch { notEstablished(`testPathRules unreadable: ${MANIFEST_REL} is not valid JSON`); }
  const extra = (manifest !== null && typeof manifest === 'object' && !Array.isArray(manifest)) ? manifest.testPathRules : undefined;
  // ABSENT is not an error — the built-ins stand. Only a PRESENT-but-broken override is fatal: a
  // silent fall-back to built-ins would tell a project its rules are live when they are not.
  if (extra === undefined || extra === null) return rules;
  if (!Array.isArray(extra)) notEstablished('testPathRules unreadable: testPathRules is present but is not an array');
  for (const entry of extra) {
    if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) notEstablished('testPathRules unreadable: an entry is not a {ecosystem, pattern} object');
    const eco = typeof entry.ecosystem === 'string' ? entry.ecosystem.trim() : '';
    if (eco === '') notEstablished('testPathRules unreadable: an entry has no non-empty "ecosystem"');
    if (typeof entry.pattern !== 'string' || entry.pattern === '') notEstablished(`testPathRules unreadable: entry "${eco}" has no non-empty "pattern"`);
    if (entry.pattern.length > 200) notEstablished(`testPathRules unreadable: entry "${eco}" pattern exceeds 200 characters`);
    // The ONE catastrophic-backtracking shape a length cap does not bound. Refused by SHAPE, because
    // this sandboxless script cannot enforce a match timeout.
    if (/\([^)]*[+*][^)]*\)[+*]/.test(entry.pattern)) notEstablished(`testPathRules unreadable: entry "${eco}" pattern nests a quantifier over a quantified group (catastrophic backtracking)`);
    let re = null;
    // WRAP, never append a bare `$`: `foo|bar` + `$` anchors only the LAST branch, so `src/foolish.py`
    // would match `foo` unanchored and an arbitrary source file would count as a Confirmation test.
    try { re = new RegExp('(?:' + entry.pattern + ')$'); } catch { notEstablished(`testPathRules unreadable: entry "${eco}" pattern is not a valid regular expression`); }
    rules.push({ ecosystem: eco, re: re });
  }
  return rules;
}

if (adrFiles.length === 0 && TIER_REQUIRES_ADR) {
  failures.push(`C1: tier ${TIER} has NO ADR files under 03_adr/ — an M/L/XL feature owes at least one ADR; the plan cannot be complete against decisions that were never written`);
  failures.push(`C2: tier ${TIER} has no 03_adr/ — no Confirmation test can be checked`);
} else if (adrFiles.length === 0) {
  skips.push(`C1: no 03_adr/ and the plan claims no ADR work — ADR-coverage check SKIPPED${TIER === 'S' ? ' (--tier=S, the legitimate S-tier shape)' : ' (NO --tier supplied: an M/L/XL run that simply never wrote 03_adr/ would dodge C1/C2 here — pass --tier to close it)'}`);
  skips.push('C2: no 03_adr/ — Confirmation-test coverage check SKIPPED');
} else {
  // C1 — ADR ids referenced by plan tasks
  for (const f of adrFiles) {
    const m = f.match(/^(\d{3})-/); if (!m) { warnings.push(`C1: unparseable ADR filename ${safe(f)}`); continue; }
    const id = `ADR-${m[1]}`;
    const re = new RegExp(`ADR-0*${Number(m[1])}\\b`);
    if (!re.test(plan)) failures.push(`C1: ${id} (${safe(f)}) has NO task in the plan referencing it`);
  }

  // C2 — every Confirmation-listed test file path appears in the plan
  const testPathRules = loadTestPathRules();
  const isTestPath = (p) => testPathRules.some((r) => r.re.test(p));
  for (const f of adrFiles) {
    const adr = readFileSync(join(adrDir, f), 'utf-8');
    const confIdx = adr.search(/^##+\s*Confirmation/mi);
    if (confIdx < 0) { failures.push(`C2: ${safe(f)} has no Confirmation section`); continue; }
    // The section ENDS at the next heading of the same or higher level — it does not run to EOF.
    // Slicing to EOF swallowed every later section, so a `Links` entry citing an existing test as
    // PRECEDENT was read as this ADR's own Confirmation and demanded of the plan (measured
    // 2026-08-31 on features/finding-identity-closure: reqe.test.ts, cited under
    // "Implementation precedent", failed C2 while the real Confirmation test was named correctly).
    // Deeper subsections stay inside: a Confirmation with ### children is one section.
    const rest = adr.slice(confIdx);
    const confLevel = (rest.match(/^(#+)/) || ['', '##'])[1].length;
    // Search AFTER the Confirmation heading's own line — searching from the heading itself matches
    // it and collapses the section to nothing, which turns a scoping fix into a gate that reports
    // "Confirmation names no test file paths" for every ADR (caught by running it).
    const bodyStart = rest.indexOf('\n') + 1;
    const afterHeading = rest.slice(bodyStart);
    const nextHeading = afterHeading.search(new RegExp('^#{1,' + confLevel + '}[^#]', 'm'));
    const conf = nextHeading < 0 ? rest : rest.slice(0, bodyStart + nextHeading);
    const paths = extractCandidatePaths(conf).filter(isTestPath);
    // UNKNOWN ECOSYSTEM STAYS A FAILURE, never a WARN: a gate that downgrades itself on the one
    // repo it cannot read is a gate that is off exactly where it is needed. The remedy is named
    // in the message instead.
    if (paths.length === 0) { failures.push(`C2: ${safe(f)} Confirmation names no test file paths (recognised: ${KNOWN_ECOSYSTEMS}; extend the vocabulary with a "testPathRules" array in ${MANIFEST_REL})`); continue; }
    for (const p of paths) if (!plan.includes(p)) failures.push(`C2: ${safe(f)} Confirmation test ${safe(p)} NOT named in the plan`);
  }
}

// ── C3 target-path admissibility (P16/D3) — named rules, not one character class ───────────────
// A LEADING DOT is legitimate: `.claude/`, `.github/workflows/ci.yml`, `.gitignore`, `.env.example`
// are ordinary targets in every ecosystem, and until the 2026-08-20 bootstrap fix the `^[\w@]…`
// class rejected every one of them — so feature-adr could not name its OWN files and no feature
// could touch CI config. Found by a run that stopped at this very gate while trying to fix the gate.
//
// This is the HARDENING of that minimal fix, and it answers the three holes it left:
//  (a) the traversal rule was a SUBSTRING test, so an ordinary filename `foo..bar.ts` collected the
//      label `path traversal` (MEASURED). It is replaced by SEGMENT rules: a segment exactly `..` is
//      traversal; a segment of nothing but dots is a DEGENERATE NAME — a different defect that must
//      not borrow the traversal label. Coverage is not weakened: `..`, `../`, `../etc/passwd` and
//      `.a/../b` all carry a `..` SEGMENT and are still refused.
//  (b) a directory-shaped target (`.claude/`) was ACCEPTED and gives Step-6/7 plan-vs-diff matching
//      nothing concrete to verify against — rejected now, by its own name.
//  (c) every refusal names WHAT is wrong. The old catch-all `not a plain repo-relative path` fired
//      for an illegal character, a bad first character and a stray dot alike.
// A named reason that LIES is worse than a generic one: the leading-stem message is emitted ONLY for
// a path that actually starts with a dot, never for `-foo.ts` or `+x.ts`.
const MARKDOWN_RESIDUE_RE = /[*#\[\]()]/;
const LEGAL_TARGET_CHAR_RE = /[A-Za-z0-9_@./-]/;
function classifyTargetPath(path) {
  const reasons = [];
  if (/\s/.test(path)) reasons.push('contains whitespace');
  if (MARKDOWN_RESIDUE_RE.test(path)) reasons.push('markdown residue');
  if (path.startsWith('/')) reasons.push('absolute path — targets are repo-relative');
  if (path.startsWith('~')) reasons.push('home-relative path — targets are repo-relative');
  const anchoredHere = path === '.' || path.startsWith('./');
  if (anchoredHere) reasons.push('not repo-relative (anchored at the current directory)');
  const segs = path.split('/');
  let dotDot = false, degenerate = false, emptySeg = false, trailingDotSeg = false;
  for (let i = 0; i < segs.length; i++) {
    const s = segs[i];
    if (s === '..') { dotDot = true; continue; }
    if (/^\.+$/.test(s)) { if (s.length >= 3 || (i > 0 && !anchoredHere)) degenerate = true; continue; }
    if (s === '') { if (i > 0 && i < segs.length - 1) emptySeg = true; continue; }
    if (s.endsWith('.')) trailingDotSeg = true;
  }
  if (dotDot) reasons.push("path traversal ('..' segment)");
  if (degenerate) reasons.push('degenerate path segment');
  if (emptySeg) reasons.push('empty path segment');
  if (path.endsWith('/')) reasons.push('trailing slash — names a directory, not a file');
  if (trailingDotSeg) reasons.push("path segment ends with '.'");
  // Residual character check — LAST, and it names the first offender instead of shrugging. Characters
  // already explained by the whitespace/markdown rules are skipped so one defect gets one reason.
  const scanned = path.startsWith('~') ? path.slice(1) : path;
  const illegal = [...scanned].find((c) => !LEGAL_TARGET_CHAR_RE.test(c) && !/\s/.test(c) && !MARKDOWN_RESIDUE_RE.test(c));
  if (illegal !== undefined) reasons.push(`illegal character '${illegal}'`);
  // The leading stem: a dot must be followed by a REAL name (`.-` has an empty stem), and any other
  // path must start with a word character, '@' or '.'. Suppressed where a structural rule above
  // already explains the first character, so the operator is never handed a reason that is false.
  else if (!/^\.?[\w@]/.test(path) && !path.startsWith('/') && !path.startsWith('~') && !anchoredHere && !dotDot && !degenerate) {
    reasons.push(path.startsWith('.') ? 'empty stem after the leading dot' : "path does not start with a letter, digit, '_', '@' or '.'");
  }
  return reasons;
}

// C3 — EXPECTED_CODE_TARGETS block, line-level validation
const blockM = plan.match(/EXPECTED_CODE_TARGETS:\s*\n((?:\s*[-*]\s*.+\n?)+)/);
if (!blockM) failures.push('C3: no EXPECTED_CODE_TARGETS: block in the plan');
else {
  const lines = blockM[1].split('\n').map(s => s.trim()).filter(Boolean);
  if (lines.length === 0) failures.push('C3: EXPECTED_CODE_TARGETS block is empty');
  for (const ln of lines) {
    const path = ln.replace(/^[-*]\s*/, '').replace(/`/g, '').trim();
    const reasons = classifyTargetPath(path);
    if (reasons.length) failures.push(`C3: target line rejected: "${safe(ln)}" — ${reasons.join(', ')}`);
  }
}

// C4 — the feature's OWN acid corpus is named in the plan (discovered, or --acid=…)
// G-F5: a corpus that was DECLARED but declared BADLY (lowercase `| a1 |`, a row with trailing junk,
// or an acid-case table header with no parsable rows) is a FAILURE, not a skip. Silently skipping it
// let a malformed declaration buy the same green as an honest "no acid cases here". The strict row
// shape is `| A<digits> |`; anything that LOOKS like an acid row under the loose shape but is not
// strict is reported by name. (Honest scope: rows that look nothing like an acid row — a defect table
// `| D1 |`, say — are not acid candidates and are left alone.)
let acidTokens = [];
let acidSource = null;
if (acidArg) {
  acidTokens = acidArg.slice('--acid='.length).split(',').map(s => s.trim()).filter(Boolean);
  acidSource = '--acid';
  if (acidTokens.length === 0) failures.push('C4-malformed: --acid was passed but declares no tokens');
} else if (existsSync(complexityPath)) {
  const complexity = readFileSync(complexityPath, 'utf-8');
  acidTokens = [...new Set((complexity.match(/^\|\s*(A\d+)\s*\|/gm) ?? []).map(r => r.replace(/[|\s]/g, '')))];
  if (acidTokens.length) acidSource = '00_complexity_assessment.md acid-case table';
  const loose = [...new Set((complexity.match(/^\|\s*([Aa]\d+[A-Za-z]?)\s*\|/gm) ?? []).map(r => r.replace(/[|\s]/g, '')))];
  for (const cand of loose) if (!acidTokens.includes(cand)) failures.push(`C4-malformed: acid row "${safe(cand)}" does not match the required \`| A<n> |\` shape (case-sensitive, digits only) — it is declared but uncheckable`);
  const declaresTable = /\|\s*Acid case\s*\|/i.test(complexity);
  if (declaresTable && acidTokens.length === 0) failures.push('C4-malformed: 00_complexity_assessment.md declares an acid-case table but NO `| A<n> |` row parsed from it');
}
// ABSENT INPUT is not a deliberate skip. Until 2026-08-21 both read the same: `SKIP C4`. The owner
  // asked why the tier is recorded nowhere, and the answer was that Step 0 never writes
  // 00_complexity_assessment.md at all (MEASURED: 66 of 199 features have it; the last four in a row
  // did not) — so the acid check quietly switched itself off for every one of them, including the
  // features that INTRODUCED it. A check that could not read its input must not look like a check that
  // read its input and found nothing to do.
  if (acidTokens.length === 0 && !acidArg && !existsSync(complexityPath)) {
    warnings.push('C4: 00_complexity_assessment.md is ABSENT — the acid-naming check had no input to read (a missing Step-0 artifact, not a clean skip)');
  } else if (acidTokens.length === 0) skips.push('C4: no acid corpus declared (no --acid, no `| A<n> |` table in 00_complexity_assessment.md) — acid-naming check SKIPPED');
else for (const t of acidTokens) if (!new RegExp(`\\b${t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(plan)) failures.push(`C4: acid token "${safe(t)}" (from ${acidSource}) not named in the plan`);

// ── C6 amendment integrity (backlog 72b89e14, seams б/в/г) ──────────────────────────────────────
// The measured shape: AM-rows living OUTSIDE `## Amendments` were invisible to every gate; four
// amendments named no test at all; a retracted amendment (AM-23 cancelling AM-20) left the old one
// standing. One deterministic check for all three: every AM-token belongs to the section, and every
// AM row in the section carries `→ test ...` OR an explicit `superseded by AM-N`.
{
  // Line-scan, not regex-over-document: \Z is Python, and $-lookahead under /m matches every
  // line end — a section with no FOLLOWING heading silently failed to parse (caught by the
  // fixture the moment the tests ran).
  // Fenced blocks are BLANKED line-for-line, preserving numbering and offsets: a fenced
  // `## Amendments` could become the section heading, and a fenced example row could either open a
  // phantom amendment or hand a real testless one someone else's marker. Third fence-blindness
  // found in a checker today, so it is closed here by construction rather than by care.
  const rawLines = plan.split('\n');
  const planLines = [];
  {
    let fence = null;
    for (const line of rawLines) {
      const open = /^ {0,3}(```+|~~~+)/.exec(line);
      if (fence === null && open) { fence = open[1][0]; planLines.push(''); continue; }
      if (fence !== null) {
        planLines.push('');
        if (new RegExp('^ {0,3}' + fence + '{3,}\\s*$').test(line)) fence = null;
        continue;
      }
      planLines.push(line);
    }
  }
  let sectionStart = -1, sectionEnd = -1, cursor = 0;
  for (const pl of planLines) {
    // The SAME heading shape amendment-trace.ts accepts: up to three leading spaces, two to four
    // hashes, and trailing text allowed. C6 required exactly `##` with nothing after, so the two
    // tools disagreed about where the section even IS — the divergence this feature exists to end.
    if (sectionStart < 0 && /^ {0,3}#{2,4}\s+Amendments\b/.test(pl)) sectionStart = cursor + pl.length + 1;
    else if (sectionStart >= 0 && sectionEnd < 0 && /^ {0,3}#{1,4}\s/.test(pl)) sectionEnd = cursor;
    cursor += pl.length + 1;
  }
  if (sectionStart >= 0 && sectionEnd < 0) sectionEnd = plan.length;
  // Sliced from the MASKED text so the offsets computed above line up with what is scanned.
  const maskedPlan = planLines.join('\n');
  const amSection = sectionStart >= 0 ? maskedPlan.slice(sectionStart, sectionEnd) : '';
  // Only a DEFINITION-shaped line counts as a stray: a list item opening with the AM token.
  // A mid-prose REFERENCE («per 01_requirements.md (AM-1..AM-6)», «(AM-1: the clause stays
  // dropped)») cites an amendment defined in ANOTHER artifact and is legitimate — the first cut
  // failed the real wave1 corpus on exactly that (caught by the standing acid test).
  {
    let cursor2 = 0;
    for (const pl of planLines) {
      // The SAME row shape as the in-section rule, or the two disagree about what a row is: a
      // bullet-less row was invisible here while being a row there (so it evaded this check), and
      // this side lacked the range guard, so «AM-1..AM-4 are covered elsewhere» was falsely
      // reported as a definition. One shape, one meaning.
      const isDef = /^\s*(?:[-*|]\s*)?\*{0,2}AM-(?:CP-)?\d+\*{0,2}\b(?!\s*\.)/.test(pl);
      const inSection = sectionStart >= 0 && cursor2 >= sectionStart && cursor2 < sectionEnd;
      if (isDef && !inSection) {
        const tok = (/AM-(?:CP-)?\d+/.exec(pl) || ['AM-?'])[0];
        failures.push(`C6: ${tok} is DEFINED outside the \`## Amendments\` section (line: "${pl.trim().slice(0, 80)}") — an amendment outside the section is invisible to every downstream reader`);
      }
      cursor2 += pl.length + 1;
    }
  }
  if (sectionStart >= 0) {
    // Each amendment's confirmation is looked for in ITS OWN BLOCK: from its definition line to the
    // line where the NEXT amendment begins. Three defects die with the old three-line window
    // (MEASURED 2026-08-25 against the 142-plan corpus — 292 C6 failures before, 33 after, and ZERO
    // rows newly caught that pass today):
    //   • FALSE REFUSAL — a marker on the `Confirmation:` line 4+ lines down was invisible, so plans
    //     that DID name their test were rejected (7 per run, twice in one day, on a user's machine).
    //   • FALSE PASS — the window is three LINES, not one amendment, so `- AM-1 testless` followed by
    //     `- AM-2 … -> test x` PASSED: AM-1 borrowed its neighbour's marker. That is the safety half,
    //     and it is why the boundary is the next DEFINITION rather than a blank line — a blank line
    //     does not separate adjacent bullet rows.
    //   • A substring seek (`amSection.indexOf(lnRaw)`) let a duplicated line read someone else's
    //     window. Indices remove that hazard for free.
    // The boundary is not invented: parseAmendments() in harness-core/src/amendment-trace.ts has used
    // the same next-definition bound all along, so this also ends a divergence between two checkers.
    const secLines = amSection.split('\n');
    // The bullet stays OPTIONAL: requiring it drops 104 of the corpus's 347 real AM rows out of the
    // check entirely (MEASURED). The `(?!\s*\.)` guard is what refuses a wrapped `AM-1..AM-4;`
    // range preamble, which used to open a phantom amendment and double-count AM-1 — it costs 0 rows.
    const DEF = /^(?:[-*|]\s*)?\*{0,2}(AM-(?:CP-)?\d+)\*{0,2}\b(?!\s*\.)/;
    // The marker must carry what the LATER gate needs to resolve: an arrow, a backticked test id,
    // and a file as `in \`path\``. Until 2026-08-25 this accepted a bare `-> test`, so a plan cleared
    // K2 and then failed Step-8 `dz amendment-check` with `no-file-named` — the two tools read one
    // row under different contracts (field report doc-26). Same grammar, different depth: this asks
    // whether the row is WELL-FORMED, amendment-check asks whether it RESOLVES.
    // The two-id form `-> tests \`a\` and \`b\`` is corpus-canonical; matching only the singular
    // turned two green rows red when this was last touched.
    const MARK = /(?:\u2192|->)\s*tests?\s+`[^`]+`(?:\s*(?:and|и)\s*`[^`]+`)?[\s\S]{0,40}?\bin\s+`[^`]+`/;
    const defs = [];
    secLines.forEach((l, i) => { const m = DEF.exec(l.trim()); if (m) defs.push({ i, id: m[1] }); });
    for (let k = 0; k < defs.length; k++) {
      const to = k + 1 < defs.length ? defs[k + 1].i : secLines.length;
      const block = secLines.slice(defs[k].i, to).join('\n');
      const hasTest = MARK.test(block);
      // A MENTION is not a CLAIM — the third instance of that class found today. An unanchored
      // substring test passes on "NOT superseded by AM-9" and on a sentence quoting the form.
      // Anchoring on POSITION was tried and rejected: real rows put prose between the id and the
      // retraction, so a position rule refuses legitimate corpus forms. The rule is therefore about
      // NEGATION and QUOTATION, the two ways a mention differs from a claim — plus the successor
      // must EXIST among the amendments defined here, since a retraction pointing at AM-999999 is
      // not a retraction but a way through the gate.
      let superseded = false;
      for (const bl of block.split('\n')) {
        const re = /superseded by (AM-(?:CP-)?\d+)\b/ig;
        for (let m = re.exec(bl); m !== null; m = re.exec(bl)) {
          const before = bl.slice(0, m.index);
          if (/\b(?:not|never|no|isn't|is not|rather than|instead of)\s*$/i.test(before)) continue;
          const quotes = (before.match(/[`"«]/g) || []).length;
          if (quotes % 2 === 1) continue;
          if (m[1] && defs.some((d) => d.id.toLowerCase() === m[1].toLowerCase())) { superseded = true; break; }
        }
        if (superseded) break;
      }
      if (!hasTest && !superseded) failures.push(`C6: ${defs[k].id} carries neither \`\u2192 test <name>\` nor \`superseded by AM-N\` — an amendment without a confirmation is a wish, and a retracted one must say its successor`);
    }
  }
}

// ── C7 ADR↔plan command-name drift (seam д) — WARN, deliberately never FAIL ─────────────────────
// The measured incident: the ADR said `dz policy-sync`, the plan said `dz agents-sync` (and even
// carried a test that the OTHER alias must not exist) — whichever file the coder opened first won.
// Deterministically provable is only the SET DIFFERENCE, not which side is right, so this warns
// with both sides named and never blocks.
{
  const adrAll = adrFiles.map((f) => { try { return readFileSync(join(adrDir, f), 'utf-8'); } catch { return ''; } }).join('\n');
  // The tail is OPTIONAL and stops at the first closing backtick (`[^`]*`, never `.*`): a command
  // cited WITH its real arguments must be visible on BOTH sides, or a genuine ADR<->plan divergence
  // hides whenever both files write the natural form (ADR-002, backlog 420e5b79). The CAPTURE stays
  // the bare name, so the comparison remains a set of command NAMES and flag differences never warn.
  const cmds = (t) => new Set([...t.matchAll(/`dz ([a-z][a-z0-9-]+)(?:\s[^`]*)?`/g)].map((m) => m[1]));
  const inAdr = cmds(adrAll); const inPlan = cmds(plan);
  const onlyAdr = [...inAdr].filter((c) => !inPlan.has(c));
  const onlyPlan = [...inPlan].filter((c) => !inAdr.has(c));
  if (adrAll !== '' && onlyAdr.length > 0 && onlyPlan.length > 0) {
    warnings.push(`C7: ADR and plan cite DIFFERENT dz commands — ADR-only: ${onlyAdr.join(', ')}; plan-only: ${onlyPlan.join(', ')} — if these name the SAME thing, one of the two files is lying to the coder (seam д)`);
  }
}

// C5 — Inputs read line
if (!/Inputs read:/i.test(plan)) warnings.push('C5: no "Inputs read:" line (wave-2 seam, WARN only)');
else for (const need of ['03_adr','05_architecture']) if (!plan.includes(need)) warnings.push(`C5: Inputs read line missing ${need}`);

for (const s of skips) out('SKIP  ' + s);
for (const w of warnings) out('WARN  ' + w);
for (const f of failures) out('FAIL  ' + f);
out(`K2 plan-completeness: ${failures.length === 0 ? 'PASS' : 'FAIL'} (${failures.length} failure(s), ${warnings.length} warning(s), ${skips.length} skip(s)) over ${adrFiles.length} ADRs, tier ${TIER === null ? '(unspecified)' : safe(TIER)}, in ${safe(FDIR)}`);
process.exit(failures.length === 0 ? 0 : 1);

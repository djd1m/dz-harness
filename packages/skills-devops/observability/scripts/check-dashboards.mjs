#!/usr/bin/env node
/**
 * Layer-1 gate for Step 6: a dashboard is proven by OPENING IT, never by a count someone typed.
 *
 * The defect this closes (MEASURED 2026-08-20): `dashboards_defined[]` required only `name` and
 * `type` — two strings — and carried an optional `panels_count` integer. So
 * `{"name":"Payments","type":"golden_signals","panels_count":6}` passed validation with zero panels
 * built. A deterministic instrument was certifying a self-report: the same inversion this repo's
 * cost-of-detection ladder exists to prevent, and a close relative of the known class "a gate that
 * fails on a DEGRADED artifact but stays silent on an ABSENT one" — here it never reached degraded,
 * because nothing was ever opened.
 *
 * Usage:  node scripts/check-dashboards.mjs <output.json> [--root <dir>] [--json]
 * Exit:   0 PASS · 1 FAIL · 3 NOT-ESTABLISHED (could not run the check at all)
 *
 * NOT-ESTABLISHED is never a pass. A gate that cannot run must say so rather than stay quiet — that
 * is how a broken gate reads as green.
 *
 * HONEST SCOPE — narrowed deliberately after four cross-family review rounds, and pinned by a
 * doc-phrase test so it cannot silently regrow:
 *
 *   THREAT MODEL: a careless or mistaken report author. That is the disease this gate was written
 *   for — "claims six panels, built zero" — and it catches it.
 *
 *   HONEST SCOPE (narrowed 2026-08-24, cross-family rounds 5-6): this is a STRUCTURAL floor only —
 *   it cannot and does not prove a panel is meaningful; panel MEANING is delegated to the
 *   cross-model review plane. Deterministically it proves:
 *   IT PROVES: every claimed `file` exists, parses as JSON, and carries at least one panel object
 *   with a string `type`; `panels_count`, when present, matches the real count; a duplicate
 *   `dashboards_defined` key (however spelled) makes the report UN-JUDGEABLE rather than passing.
 *
 *   IT DOES NOT PROVE, and must never be read as proving:
 *     • that the queries are correct, that the metrics are ever emitted, or that any panel would
 *       render data — those need the live datasource;
 *     • RESISTANCE TO DELIBERATE EVASION. Rounds 2-4 were a ladder: a regex on the raw text was
 *       defeated by `\u0064` escaping; `panels:[null]` by `panels:[{}]`. Each fix caught a SPELLING
 *       and the next round sent another spelling of the same idea. An author who is actively
 *       gaming this script can keep going, and no amount of pattern-tightening ends that race.
 *       Claiming otherwise would be a new version of exactly the lie this gate exists to catch.
 *
 *   If the report author is untrusted, this is the wrong instrument: the answer there is to have
 *   the dashboard written by the process that also writes the report, or to check the live
 *   datasource — not a stricter reader of a document the suspect wrote.
 */
import { readFileSync, existsSync } from 'node:fs';
import { resolve, isAbsolute, join } from 'node:path';

// Parse positionally, consuming each flag's value as we go. The first draft did
//   const target = argv.find((a) => !a.startsWith('--') && a !== argv[rootIdx + 1]);
// which, with no `--root` present, made rootIdx -1 and argv[rootIdx + 1] the TARGET itself — so the
// target excluded itself and the documented invocation `check-dashboards.mjs out.json` returned
// NOT-ESTABLISHED. The acid corpus missed it because every case passed --root: a test suite can be
// green for a reason other than the property it claims to cover.
const argv = process.argv.slice(2);
let asJson = false;
let root = null;
let rootMissingValue = false;
let target = null;
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === '--json') { asJson = true; continue; }
  if (a === '--root') {
    // PEEK, do not consume. Round 1 wrote `const v = argv[++i]`, which advanced past the next token
    // BEFORE deciding it was a flag — so `--root --json report.json` swallowed `--json` and the
    // caller silently got text output instead of the JSON they asked for.
    const v = argv[i + 1];
    // A flag given without its value is a MALFORMED INVOCATION, not a licence to guess. Falling back
    // to cwd made `--root` with no value report FAIL (file not found) instead of "I could not run" —
    // a wrong verdict dressed as a real one.
    if (v === undefined || v.startsWith('--')) { rootMissingValue = true; continue; }
    root = v;
    i++;
    continue;
  }
  if (a.startsWith('--')) continue;          // unknown flag: ignored, never mistaken for the target
  if (target === null) target = a;           // first bare argument wins
}
if (rootMissingValue) { /* verdict emitted below, before any filesystem work */ }
if (root === null) root = process.cwd();

function done(verdict, findings) {
  const code = verdict === 'PASS' ? 0 : verdict === 'FAIL' ? 1 : 3;
  if (asJson) console.log(JSON.stringify({ verdict, findings }, null, 2));
  else {
    for (const f of findings) console.log('  ' + f);
    console.log(`\ncheck-dashboards: ${verdict}`);
  }
  process.exit(code);
}

if (target === null) done('NOT-ESTABLISHED', ['usage: check-dashboards.mjs <output.json> [--root <dir>] [--json]']);
if (rootMissingValue) done('NOT-ESTABLISHED', ['--root was given without a directory']);
if (!existsSync(target)) done('NOT-ESTABLISHED', [`output file not found: ${target}`]);

// Read ONCE. Round 5: the file was read twice — once to parse, once for the raw-text key scan — so
// a non-repeatable input (`/dev/fd/N` from process substitution) gave the second read nothing, and
// if the input vanished between reads the uncaught readFileSync threw ENOENT with no verdict at all.
let rawText;
try {
  rawText = readFileSync(target, 'utf8');
} catch (e) {
  done('NOT-ESTABLISHED', [`output file could not be read: ${(e && e.message) || e}`]);
}

let out;
try {
  out = JSON.parse(rawText);
} catch (e) {
  // Includes RangeError from deeply nested input: unreadable is UN-ESTABLISHED, never a pass and
  // never an uncaught throw. `catch` here is deliberately broad for exactly that reason.
  done('NOT-ESTABLISHED', [`output file could not be read as JSON: ${(e && e.message) || e}`]);
}

/**
 * Collect EVERY `dashboards_defined` in the report, not the first one found.
 *
 * Round 1 returned the first match depth-first. A report carrying two sections — one honest at the
 * top, one nested claiming a file that does not exist — was reported PASS with exit 0, because the
 * nested one was never examined. That is the gate's own promise broken: exit 0 while a claimed
 * dashboard is missing.
 *
 * The walk is ITERATIVE with an explicit stack. Round 1 recursed, and 20 000 levels of valid nesting
 * threw RangeError with no verdict at all — a gate that crashes has not judged anything, and its
 * exit code then means whatever Node decided.
 */
function collect(rootObj, key) {
  const found = [];
  const stack = [rootObj];
  const seen = new Set();          // cycles are possible in hand-written reports; do not spin forever
  let guard = 0;
  while (stack.length) {
    if (++guard > 2_000_000) return { found, exhausted: true };
    const o = stack.pop();
    if (!o || typeof o !== 'object') continue;
    if (seen.has(o)) continue;
    seen.add(o);
    if (Object.prototype.hasOwnProperty.call(o, key)) found.push(o[key]);
    for (const v of Object.values(o)) if (v && typeof v === 'object') stack.push(v);
  }
  return { found, exhausted: false };
}

// Review round 2, the subtle one: JSON.parse keeps the LAST of two identical keys, so
//   {"dashboards_defined":[<ghost>], "dashboards_defined":[<ok>]}
// hands this script an object in which the ghost NEVER EXISTED. No amount of walking the parsed
// value can see it — the evidence was destroyed before the code ran. So compare against the RAW
// TEXT: if the key appears in key position more often than the walk found sections, the parser
// dropped something and this report cannot be judged.
//
// Named limit: a STRING VALUE that itself ends in this exact name followed by a colon would also
// count, causing a spurious refusal. That direction is deliberate — refusing an ambiguous report is
// fail-closed, and a report embedding this key inside prose is odd enough to want a human.
/**
 * Did JSON.parse DROP anything?
 *
 * Rounds 2-5 walked a ladder: I matched the literal text `"dashboards_defined":`, and the reviewer
 * sent `"dashboards_\u0064efined"`; I decoded escapes, and the reviewer sent a duplicate `file` key
 * INSIDE an entry, which my name-specific scan never looked at. Each fix caught a SPELLING and the
 * next round sent another spelling of the same idea.
 *
 * So this stops comparing names at all. It counts KEYS IN KEY POSITION in the raw text
 * structurally, counts the keys that survived in the parsed value, and refuses if the second number
 * is smaller. Duplicate `dashboards_defined`, duplicate `file`, duplicate anything, escaped or
 * not — all are the same event: the parser silently kept the last and deleted a claim nobody
 * checked. There is no name left to spell differently.
 *
 * Returns null when the text is not well-formed enough to scan; the parser will refuse it anyway.
 */
function countRawKeys(text) {
  let n = 0;
  let i = 0;
  const stack = [];
  let expectKey = false;
  while (i < text.length) {
    const c = text[i];
    if (c === '"') {
      let j = i + 1;
      let closed = false;
      while (j < text.length) {
        if (text[j] === '\\') { j += 2; continue; }
        if (text[j] === '"') { closed = true; break; }
        j++;
      }
      if (!closed) return null;
      if (stack[stack.length - 1] === 'obj' && expectKey) { n++; expectKey = false; }
      i = j + 1;
      continue;
    }
    if (c === '{') { stack.push('obj'); expectKey = true; i++; continue; }
    if (c === '[') { stack.push('arr'); expectKey = false; i++; continue; }
    if (c === '}' || c === ']') { stack.pop(); expectKey = false; i++; continue; }
    if (c === ',') { expectKey = stack[stack.length - 1] === 'obj'; i++; continue; }
    if (c === ':') { expectKey = false; i++; continue; }
    i++;
  }
  return n;
}

/** Keys that SURVIVED parsing, anywhere in the tree. */
function countParsedKeys(root) {
  let n = 0;
  const stack = [root];
  const seen = new Set();
  while (stack.length) {
    const v = stack.pop();
    if (!v || typeof v !== 'object') continue;
    if (seen.has(v)) continue;
    seen.add(v);
    if (!Array.isArray(v)) n += Object.keys(v).length;
    for (const x of Object.values(v)) if (x && typeof x === 'object') stack.push(x);
  }
  return n;
}

const rawKeyCount = countRawKeys(rawText);
const parsedKeyCount = countParsedKeys(out);
if (rawKeyCount !== null && rawKeyCount > parsedKeyCount) {
  done('NOT-ESTABLISHED', [
    `the report has ${rawKeyCount} keys in the text but ${parsedKeyCount} survived parsing — ${rawKeyCount - parsedKeyCount} duplicate key(s), so JSON.parse kept the last and dropped the rest`,
    'a claim the parser deleted is a claim nobody checked; fix the report rather than trusting this run',
  ]);
}

const walk = collect(out, 'dashboards_defined');
if (walk.exhausted) done('NOT-ESTABLISHED', ['the report is too large to walk — refusing rather than judging part of it']);
const sections = walk.found;
// Every section is checked. More than one is itself worth saying: a report with two sections is
// ambiguous about which one describes the run.
const defined = sections.length === 0 ? null : sections.flatMap((x) => (Array.isArray(x) ? x : [x]));

// An ABSENT section is NOT a pass, and it is not a failure either: the run may legitimately not have
// done the dashboard step. It is un-established, and it says which.
if (defined === null) done('NOT-ESTABLISHED', ['no `dashboards_defined` in the output — the dashboard step did not run, or ran without reporting']);
if (sections.some((x) => !Array.isArray(x))) done('FAIL', ['a `dashboards_defined` is present but is not an array']);
if (defined.length === 0) done('NOT-ESTABLISHED', ['`dashboards_defined` is empty — nothing claimed, so nothing proven']);

const findings = [];
for (const [i, d] of defined.entries()) {
  // Round 3: `{"name":{"toString":null}}` threw inside the template literal, before any verdict.
  // NEVER interpolate a value from the report — it is exactly the untrusted input under review.
  const label = d && typeof d.name === 'string' && d.name !== '' ? JSON.stringify(d.name) : `#${i}`;
  if (!d || typeof d !== 'object' || Array.isArray(d)) { findings.push(`#${i}: entry is not an object`); continue; }
  if (typeof d.file !== 'string' || d.file === '') {
    findings.push(`${label}: no \`file\` — a name and a category are a CLAIM, not a dashboard`);
    continue;
  }
  const abs = isAbsolute(d.file) ? d.file : resolve(join(root, d.file));
  if (!existsSync(abs)) { findings.push(`${label}: \`file\` does not exist: ${d.file}`); continue; }
  let body;
  try { body = JSON.parse(readFileSync(abs, 'utf8')); }
  catch (e) { findings.push(`${label}: ${d.file} is not JSON: ${(e && e.message) || e}`); continue; }
  const panels = Array.isArray(body?.panels) ? body.panels : null;
  if (panels === null) { findings.push(`${label}: ${d.file} has no \`panels\` array — an empty shell is not a dashboard`); continue; }
  if (panels.length === 0) { findings.push(`${label}: ${d.file} has zero panels`); continue; }
  // Review round 2: `panels: [null]` passed — the array was non-empty, so length alone said yes.
  // A null or a scalar is a placeholder, not a panel; counting slots instead of panels is the same
  // mistake as counting a self-reported integer, one level down.
  // Round 3: `panels: [{}]` still passed — an empty object IS an object. A panel with no `type` is
  // not a panel; Grafana panels always carry one. Requiring it is the cheapest honest floor, and it
  // stops the placeholder ladder here rather than inviting the next empty shape.
  // Round 5 (cross-family, 2026-08-24, grade F): `panels:[{type:"anything"}]` passed — one
  // non-empty string was the whole bar, so a file could NAME a panel without DEFINING one (the
  // original self-report defect, one level down). The honest floor for a REAL panel, grounded in
  // the Grafana shape every dashboard here follows: a non-whitespace `type` AND a non-whitespace
  // `title` AND at least one SUBSTANTIVE definition key (targets/queries/datasource/expr/options
  // with content). Naming still isn't proving the query is right — that stays outside this
  // checker's honest scope (see the header) — but an empty-bodied panel no longer passes.
  // Round 6 (cross-family C): `options:{foo:null}` and a target of only `refId` still slipped —
  // so the cheap deterministic step tightens once more (a target must carry a non-refId key with a
  // non-null value; options values must not all be null). AND the promise NARROWS (the recalled
  // rule: a deterministic gate cannot prove a SEMANTIC property — stop climbing): this checker
  // proves STRUCTURE ONLY. Whether a panel is MEANINGFUL is delegated to the cross-model review
  // plane, and the honest-scope sentence below is pinned by a doc-phrase regression test so the
  // narrowed promise cannot silently regrow.
  const hasContent = (o) => o && typeof o === 'object' && Object.entries(o).some(([k, v]) => k !== 'refId' && v !== null && v !== undefined && String(typeof v === 'object' ? JSON.stringify(v) : v).trim() !== '' && JSON.stringify(v) !== '{}');
  const substantive = (x) => {
    if (Array.isArray(x.targets) && x.targets.some(hasContent)) return true;
    if (Array.isArray(x.queries) && x.queries.some((q) => typeof q === 'string' ? q.trim() !== '' : hasContent(q))) return true;
    if (typeof x.expr === 'string' && x.expr.trim() !== '') return true;
    if (x.datasource !== null && x.datasource !== undefined && String(typeof x.datasource === 'object' ? JSON.stringify(x.datasource) : x.datasource).trim() !== '' && String(x.datasource) !== '{}') return true;
    if (hasContent(x.options)) return true;
    return false;
  };
  const real = panels.filter((x) => x !== null && typeof x === 'object' && !Array.isArray(x)
    && typeof x.type === 'string' && x.type.trim() !== ''
    && typeof x.title === 'string' && x.title.trim() !== ''
    && substantive(x));
  if (real.length === 0) { findings.push(`${label}: ${d.file} has ${panels.length} panel slot(s), none a REAL panel (non-blank type + title + a substantive definition: targets/queries/expr/datasource/options) — naming a panel is not defining one`); continue; }
  if (real.length !== panels.length) { findings.push(`${label}: ${d.file} has ${panels.length - real.length} entr(y|ies) in \`panels\` with no \`type\``); continue; }
  if (typeof d.panels_count === 'number' && d.panels_count !== real.length) {
    findings.push(`${label}: claims ${d.panels_count} panels, the file has ${real.length} — the count is cross-checked now, not trusted`);
  }
}

done(findings.length === 0 ? 'PASS' : 'FAIL', findings.length ? findings : [`${defined.length} dashboard(s) opened and non-empty`]);

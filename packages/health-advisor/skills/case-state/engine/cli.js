'use strict';

// cli.js — five verbs, all READ-only, reachable as
//   node skills/case-state/engine/cli.js <verb> …
//
// There is NO new `bin` entry. `bin/health-advisor.js` is frozen for this slice, and a
// `bin/`-registered verb would be unreachable from an INSTALLED skill anyway: `installSkill` copies
// only `skills/<name>/` (lib/installer.js), so a verb outside that directory is absent for exactly
// the users who have the skill.
//
// EXIT CODES, uniform across all five verbs:
//   0  valid / no differences / found and fresh / nothing due
//   1  the verb's negative-but-expected answer (invalid, differences, stale or absent, due)
//   2  usage error or unreadable input
//
// `VERBS` is EXPORTED so test/case-state-cli-exit-codes.test.js can enumerate it by reflection and
// assert `verbsExercised === VERBS.length` — a sixth verb added later is RED until it too has an
// exit-code triple. (AM-10: three of these five previously shipped with a written contract and no
// assertion of it, while the traceability table called them covered.)
//
// No write verb ships here. `facts.record` / `questions.answer` / `questions.withdraw` are async
// because they take the lock (ADR-007 D5); a future verb that calls one must `await` it.

const path = require('node:path');

const { loadProfile, foldAsOf } = require('./profile.js');
const { diff } = require('./diff.js');
const { loadFacts, get, survey } = require('./facts.js');
const { loadQuestions, questionsDue } = require('./questions.js');
const { loadTtlTable, FRESH } = require('./freshness.js');
const { renderDiff, renderQuestionsDue, fmt } = require('./render.js');

const OK = 0; const NEGATIVE = 1; const USAGE = 2;

function usage(out, message) {
  out.err(`usage error: ${message}`);
  out.err('');
  for (const v of VERBS) out.err(`  ${v.id} ${v.args}`);
  return USAGE;
}

const VERBS = [
  {
    id: 'profile validate',
    tokens: ['profile', 'validate'],
    args: '<profile.json> [asOf]',
    run(argv, out) {
      if (argv.length < 1 || argv.length > 2) return usage(out, '`profile validate` takes a profile path and an optional as-of date');
      const [profilePath, asOf] = argv;
      let loaded;
      try {
        loaded = loadProfile(profilePath);
      } catch (err) {
        out.err(`${err.name}: ${err.message}`);
        return err.name === 'ProfileInvalidError' ? NEGATIVE : USAGE;
      }
      out.log(`profile OK: ${loaded.sourcePath}`);
      out.log(`  ${loaded.profile.labs.length} dated observations, ${loaded.profile.preanalytical_context.length} preanalytical context entries`);
      // AC-9 — Part 1 (profile) meets Part 3 (open questions) on the same surface.
      const ledgerPath = path.resolve(path.dirname(loaded.sourcePath), loaded.profile.open_questions.$ref);
      let ledger;
      try {
        ledger = loadQuestions(ledgerPath);
      } catch (err) {
        out.err(`${err.name}: ${err.message}`);
        return NEGATIVE;
      }
      out.log(`  open_questions -> ${ledgerPath} (${ledger.questions.length} recorded)`);
      if (asOf === undefined) {
        out.log('  due questions: NOT EVALUATED — pass an as-of date to compute them (there is no implicit "today")');
        return OK;
      }
      // Inside a try, like every other throwing call in this table (QE G2): a malformed as-of VALUE
      // is a usage error (exit 2) by this file's own header contract, never an uncaught stack.
      let due; let fold;
      try {
        fold = foldAsOf(loaded, asOf);
        due = questionsDue(ledger, fold, asOf);
      } catch (err) {
        out.err(`${err.name}: ${err.message}`);
        return USAGE;
      }
      out.log(renderQuestionsDue(due, asOf));
      // PROVENANCE ON THE EXISTING SURFACE, NOT A SIXTH VERB (AM-6). The fold is the one built two
      // lines above — reused, not recomputed — so this costs no new exit code, no new branch and no
      // new failure mode. It is printed only when `asOf` was supplied, matching the early return
      // above: without an as-of there is no fold, and "0 of 0" would read as an answer.
      const analytes = Object.values(fold.analytes);
      const anchored = analytes.filter((a) => a.sourceAnchor !== null).length;
      out.log(`  anchored: ${anchored}/${analytes.length} analytes carry a source_anchor`);
      return OK;
    },
  },
  {
    id: 'profile diff',
    tokens: ['profile', 'diff'],
    args: '<profile.json> <d1> <d2>',
    run(argv, out) {
      if (argv.length !== 3) return usage(out, '`profile diff` takes a profile path and two dates');
      const [profilePath, d1, d2] = argv;
      let report; let text;
      try {
        report = diff(loadProfile(profilePath), d1, d2);
        // renderDiff() is INSIDE the try: it formats record fields, so a malformed `unit` or `value`
        // throws here, and a throw about unreadable input is a usage error (exit 2) — not an
        // uncaught stack that exits 1 and reads as "there were differences".
        text = renderDiff(report);
      } catch (err) {
        out.err(`${err.name}: ${err.message}`);
        return USAGE;
      }
      out.log(text);
      return report.hasChanges ? NEGATIVE : OK;
    },
  },
  {
    id: 'facts get',
    tokens: ['facts', 'get'],
    args: '<facts.json> <key> [asOf]',
    run(argv, out) {
      if (argv.length < 2 || argv.length > 3) return usage(out, '`facts get` takes a store path, a key and an optional as-of date');
      const [storePath, key, asOf] = argv;
      let store; let ttlTable; let hit; let summary;
      try {
        store = loadFacts(storePath);
        ttlTable = loadTtlTable();
        // The freshness computation throws on a malformed as-of VALUE — that is a usage error
        // (exit 2), so it lives inside the try with the other unreadable-input throws (QE G2).
        hit = asOf === undefined ? get(store, key) : get(store, key, { asOf, ttlTable });
        // FORMATTING IS INSIDE THE TRY TOO. This line reads three record fields and interpolates
        // them; a missing `verifications` or a field with a null `toString` throws HERE, and it used
        // to do so after three lines were already on stdout, exiting 1 — indistinguishable from
        // "NOT PRESENT". Built now, printed below, so the record is rendered whole or not at all.
        summary = hit.record === null ? null : [
          `fact ${key}`,
          `  «${hit.record.claim}»`,
          `  ${hit.record.source_url}`,
          `  first_fetch_date ${hit.record.first_fetch_date} · last_fetch_date ${hit.record.last_fetch_date} · ${hit.record.verifications.length} verification(s)`,
        ];
      } catch (err) {
        out.err(`${err.name}: ${err.message}`);
        return USAGE;
      }
      if (hit.record === null) {
        out.log(`fact ${key}: NOT PRESENT in ${store.storePath}`);
        return NEGATIVE;
      }
      for (const line of summary) out.log(line);
      if (hit.freshness === null) {
        out.log('  freshness: NOT EVALUATED — pass an as-of date');
        return OK;
      }
      out.log(`  freshness: ${hit.freshness.state} — ${hit.freshness.reason}`);
      return hit.freshness.state === FRESH ? OK : NEGATIVE;
    },
  },
  {
    id: 'facts stale',
    tokens: ['facts', 'stale'],
    args: '<facts.json> <asOf>',
    run(argv, out) {
      if (argv.length !== 2) return usage(out, '`facts stale` takes a store path and an as-of date');
      const [storePath, asOf] = argv;
      let rows;
      try {
        rows = survey(loadFacts(storePath), { asOf, ttlTable: loadTtlTable() });
      } catch (err) {
        out.err(`${err.name}: ${err.message}`);
        return USAGE;
      }
      const notFresh = rows.filter((r) => r.freshness.state !== FRESH);
      out.log(`facts stale  as-of ${asOf}: ${notFresh.length} of ${rows.length} record(s) need attention`);
      for (const r of notFresh) {
        out.log(`  ${r.freshness.state}  ${r.key.slice(0, 12)}…  «${r.record.claim}»`);
        out.log(`    ${r.freshness.reason}`);
      }
      // Fail-closed: FRESHNESS_UNKNOWN counts as "needs attention" too. "We never recorded a fetch
      // date" must not be reportable as "nothing to re-check".
      return notFresh.length > 0 ? NEGATIVE : OK;
    },
  },
  {
    id: 'questions due',
    tokens: ['questions', 'due'],
    args: '<open_questions.json> <asOf> [profile.json]',
    run(argv, out) {
      if (argv.length < 2 || argv.length > 3) return usage(out, '`questions due` takes a ledger path, an as-of date and an optional profile');
      const [ledgerPath, asOf, profilePath] = argv;
      let ledger; let fold = null;
      try {
        ledger = loadQuestions(ledgerPath);
        if (profilePath !== undefined) fold = foldAsOf(loadProfile(profilePath), asOf);
      } catch (err) {
        out.err(`${err.name}: ${err.message}`);
        return USAGE;
      }
      let due;
      try {
        due = questionsDue(ledger, fold, asOf);
      } catch (err) {
        out.err(`${err.name}: ${err.message}`);
        return USAGE;
      }
      out.log(renderQuestionsDue(due, asOf));
      if (due.unevaluatedPreconditions > 0) {
        out.log(`  (${due.unevaluatedPreconditions} precondition-only question(s) NOT evaluated — pass a profile path to evaluate them)`);
      }
      return due.length > 0 ? NEGATIVE : OK;
    },
  },
];

/**
 * THE VERB'S OUTPUT IS BUFFERED AND AN UNEXPECTED THROW IS A USAGE ERROR (exit 2), NOT EXIT 1.
 *
 * Two lines sat OUTSIDE their verb's `try` — `out.log(...)` at the `facts get` summary and the
 * `renderDiff(...)` call in `profile diff` — and three crashes came through them. MEASURED, from
 * ordinary store contents:
 *   • a record missing `verifications`        → TypeError: Cannot read properties of undefined (reading 'length')
 *   • `first_fetch_date: {toString:null, valueOf:null}` → TypeError: Cannot convert object to primitive value
 *   • a `unit` of that same shape             → the same, from render.js's template literal
 *
 * The stack trace was the least of it. An uncaught throw exits **1**, and this file's own header
 * defines 1 as the verb's legitimate negative answer — so `facts get` "not present" and `facts get`
 * "crashed" were the same observable result to any caller scripting these verbs. And in two of the
 * three, THREE LINES OF REAL OUTPUT reached stdout before the crash: a half-rendered fact, which
 * reads as a whole one.
 *
 * Both consequences have one fix. Every verb writes into a buffer that is flushed only when the verb
 * RETURNS, so a partial render is never emitted; and an escaped throw is reported by name on stderr
 * and mapped to USAGE, so "the input was not readable" stays distinguishable from "the answer is no".
 * The per-verb `try` blocks stay exactly where they are — this is a backstop, not a replacement, and
 * a verb that catches its own named errors still gives the better message.
 */
function main(argv, out) {
  const io = out || { log: (s) => process.stdout.write(`${s}\n`), err: (s) => process.stderr.write(`${s}\n`) };
  const logs = []; const errs = [];
  const buffered = { log: (s) => logs.push(s), err: (s) => errs.push(s) };

  if (argv.length === 0) return usage(io, 'no verb given');
  const verb = VERBS.find((v) => v.tokens.every((t, i) => argv[i] === t));
  if (verb === undefined) return usage(io, `unknown verb "${argv.slice(0, 2).join(' ')}"`);

  let code;
  try {
    code = verb.run(argv.slice(verb.tokens.length), buffered);
  } catch (err) {
    // stdout is DISCARDED on purpose: a half-rendered artefact is worse than none.
    for (const s of errs) io.err(s);
    const name = (err && err.name) || 'Error';
    const message = (err && err.message) || String(err);
    io.err(`${name}: ${message}`);
    io.err(`  \`${verb.id}\` could not complete — exit ${USAGE} (unreadable input), NOT ${NEGATIVE} (the verb's negative answer).`);
    return USAGE;
  }
  for (const s of logs) io.log(s);
  for (const s of errs) io.err(s);
  return code;
}

module.exports = { VERBS, main, OK, NEGATIVE, USAGE, fmt };

// THE EXIT CODE IS SET, NEVER FORCED — `process.exit()` TRUNCATES THE ANSWER IT IS REPORTING.
//
// `process.exit(main(...))` terminates the process immediately. On Linux a PIPED stdout is
// asynchronous in Node, so everything still queued for the pipe is discarded — and the caller gets
// a PREFIX of the report together with an exit code this file's header defines as a real answer.
// MEASURED — `facts stale` over a 5 000-record store, four runs each:
//   process.exit()     exit=1  bytes=446338 / 759146 / 283584 / 617715   (all four truncated)
//   process.exitCode   exit=1  bytes=858959 × 4                          (exact, every run)
// At 20 000 records the loss was 3.45 MB → 112 KB. For `facts stale` the observable harm is a
// clinician told that FEWER facts need re-checking than the store actually says.
//
// `process.exitCode` lets Node run its normal shutdown: stdout drains, THEN the process exits with
// this code. Nothing after this line keeps the event loop alive (every verb is synchronous), and
// nothing later reassigns `process.exitCode`, so the code the caller sees is the code `main`
// returned. The size test that discriminates this is test/case-state-cli-output-integrity.test.js —
// the ordinary CLI tests cannot see it, because a ~400-byte fixture fits in the pipe buffer.
//
// …AND A READER THAT CLOSES EARLY MUST NOT REWRITE THE ANSWER (F3-2). Removing `process.exit`
// unmasked EPIPE: with no 'error' handler on stdout, `cli.js … | head -1` made the drain throw
// `write EPIPE` as an unhandled 'error' event — a full stack on stderr and exit 1, which this
// file's header defines as the verb's legitimate NEGATIVE answer. MEASURED: a PRESENT, valid fact
// piped into a one-chunk reader answered 1 ("not present / not fresh") ten runs out of ten. EPIPE
// means "the caller has read all it wants" — the verb's code, already set above, stands; every
// other stream error is NOT swallowed (rethrowing from the handler restores the loud crash).
// The truncation fix and this one coexist: a patient reader still gets every byte (the size test
// above), an impatient one gets the exit code `main` computed, never an artifact of its impatience.
if (require.main === module) {
  for (const stream of [process.stdout, process.stderr]) {
    stream.on('error', (err) => { if (err.code !== 'EPIPE') throw err; });
  }
  process.exitCode = main(process.argv.slice(2));
}

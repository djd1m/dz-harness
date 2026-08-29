'use strict';

// cli.js — the EXIT-CODE ADAPTER for `ha third-brain`, speaking THIS PACKAGE'S ONE EXIT VOCABULARY:
//
//   0  the document was filed (including an idempotent re-ingest that wrote 0 new records), or a
//      search / backlinks lookup answered
//   1  a NAMED domain refusal — one of the CLOSED seven
//   2  a usage error — the command line was wrong, or the document has no text to index
//
// `--json` REPORTS THE SAME EXIT CODE AS TEXT MODE. lib/check.js records why in one sentence: "a
// JSON mode that always exits 0 is how a gate dies quietly". One place computes the code; both
// renderers report it.
//
// `process.exitCode`, NEVER `process.exit()` — the lesson skills/case-state/engine/cli.js MEASURED:
// on a piped stdout `process.exit()` discards whatever is still queued, so the caller gets a PREFIX
// of the report together with an exit code that reads as a complete answer.
//
// AN UNEXPECTED ERROR EXITS 2, NOT 1. Exit 1 means "the document was refused, and here is which
// named rule refused it". A programming error is not that, and letting it borrow that code would
// make every scripted `if [ $? -eq 1 ]` treat a crash as a considered refusal.

const { ingest } = require('./write.js');
const { search, backlinks, renderHits, renderBacklinks } = require('./search.js');
const { ThirdBrainUsageError, isThirdBrainRefusal, refusalDescriptor } = require('./errors.js');

const OK = 0;
const REFUSED = 1;
const USAGE = 2;

const VERBS = Object.freeze(['ingest', 'search', 'backlinks']);

const VALUE_FLAGS = Object.freeze(['--case', '--kind', '--date', '--anchor', '--workspace', '--limit']);
const BOOL_FLAGS = Object.freeze(['--dry-run', '--json', '--help', '-h']);

const KINDS = Object.freeze(['consultation', 'trend', 'synthesis', 'conclusion']);

const USAGE_TEXT = `usage: third-brain ingest <doc-path> --case <slug> --kind <${KINDS.join('|')}>
                                   --date <YYYY-MM-DD> [--anchor <entry_id>]… [--workspace <dir>]
                                   [--dry-run] [--json]
       third-brain search "<query>" [--workspace <dir>] [--limit N] [--json]
       third-brain backlinks <doc_id> [--workspace <dir>] [--json]

  files FULL analytical documents into <workspace>/.health-brain — the SEGREGATED store, never the
  shared one — indexed by the mechanism that store already has, with VERIFIED backlinks to the
  intake manifest.

  --case <slug>           the case this document belongs to (recorded in every record's header)
  --kind <kind>           ${KINDS.join(' | ')}
  --date <YYYY-MM-DD>     the document's own date, not the ingest date
  --anchor <entry_id>     a manifest entry_id this document cites (repeatable). Every one is
                          stamped and RESOLVED before anything is written; one bad anchor aborts
                          the whole ingest.
  --workspace <dir>       the patient workspace (default: the current directory)
  --limit N               search: how many hits to ask the store for (default 10)
  --dry-run               plan and print; zero writes, zero spawns, no LOG line
  --json                  machine output, with the SAME exit code as text mode

exit codes: 0 filed / answered · 1 named refusal · 2 usage error`;

/**
 * parseArgv(argv) -> options | throws ThirdBrainUsageError
 *
 * STRICT: an unknown option is a usage error, never a silently ignored token. A typo that changes
 * nothing while reporting success is the failure mode this rejection exists for — `--dry-runn` must
 * not perform a real ingest.
 */
function parseArgv(argv) {
  const opts = { anchors: [], positional: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--help' || a === '-h') { opts.help = true; continue; }
    if (a === '--json') { opts.json = true; continue; }
    if (a === '--dry-run') { opts.dryRun = true; continue; }
    if (VALUE_FLAGS.includes(a)) {
      const value = argv[i + 1];
      if (value === undefined || (value.startsWith('--') && value.length > 2)) {
        throw new ThirdBrainUsageError(`${a} needs a value.`, { reason: 'flag_without_value' });
      }
      i += 1;
      if (a === '--case') opts.case = value;
      else if (a === '--kind') opts.kind = value;
      else if (a === '--date') opts.date = value;
      else if (a === '--anchor') opts.anchors.push(value);
      else if (a === '--workspace') opts.workspace = value;
      else if (a === '--limit') {
        const n = Number(value);
        // Every numeric config value passes Number.isFinite — the fa-improvements clamp lesson. A
        // NaN limit would be handed to `dz --limit NaN`, whose behaviour nobody has decided.
        if (!Number.isFinite(n) || !Number.isInteger(n) || n < 1) {
          throw new ThirdBrainUsageError(`--limit ${JSON.stringify(value)} must be a positive integer.`, { reason: 'bad_limit' });
        }
        opts.limit = n;
      }
      continue;
    }
    if (a.startsWith('-') && a !== '-') {
      throw new ThirdBrainUsageError(
        `unknown option ${JSON.stringify(a)}. An unrecognised token is refused rather than ignored — an ` +
        'ignored flag reads exactly like an applied one.',
        { reason: 'unknown_option' }
      );
    }
    opts.positional.push(a);
  }
  return opts;
}

/**
 * failureDocument(err) -> { exitCode, body, internal }
 *
 * THE ONE PLACE a thrown error becomes an exit code and a machine document — extracted so the
 * exit-code test can assert, for EVERY class in the closed seven plus the usage error plus a raw
 * internal crash, that `--json` mode always has a valid JSON document to print. `body` is always
 * JSON-serialisable and never carries a stack.
 */
function failureDocument(err) {
  if (err instanceof ThirdBrainUsageError) {
    return { exitCode: USAGE, internal: false, body: { ok: false, error: err.toJSON() } };
  }
  if (isThirdBrainRefusal(err)) {
    const d = refusalDescriptor(err);
    return {
      exitCode: REFUSED,
      internal: false,
      body: {
        ok: false,
        error: {
          name: err.name || d.Class.name,
          code: err.code || d.code,
          reason: err.reason || d.reason,
          message: err.message,
        },
      },
    };
  }
  return {
    exitCode: USAGE,
    internal: true,
    body: {
      ok: false,
      error: {
        name: (err && err.name) || 'Error',
        code: 'ETHIRDBRAININTERNAL',
        reason: 'internal_error',
        message: (err && err.message) || String(err),
      },
    },
  };
}

function renderIngest(result) {
  const lines = [];
  if (result.mode === 'dry-run') {
    lines.push(`dry run — nothing written. ${result.chunks} passage(s) planned for ${result.doc_path}`);
  } else if (result.written === 0) {
    lines.push(`already filed: doc_id ${result.doc_id} — ${result.skipped} passage(s) already in the health brain, 0 new records.`);
  } else {
    lines.push(`filed ${result.written} passage(s) of ${result.doc_path} into ${result.brain}`);
  }
  lines.push(`  doc_id:   ${result.doc_id}  (sha256 ${result.doc_sha256.slice(0, 16)}…)`);
  lines.push(`  case:     ${result.case}   kind: ${result.kind}   date: ${result.date}`);
  lines.push(`  chunks:   ${result.chunks} (${result.hard} hard-split)  lengths min/median/max ` +
    `${result.passage_lengths.min}/${result.passage_lengths.median}/${result.passage_lengths.max}`);
  if (result.anchors.length === 0) {
    lines.push('  anchors:  none — this document cites no primary source (a valid, ordinary case)');
  }
  for (const a of result.anchors) {
    lines.push(`  anchor:   ${a.entry_id} → ${a.path} → sha256 ${a.sha256.slice(0, 16)}… ✓ verified`);
  }
  return lines.join('\n');
}

/**
 * main(argv, io) -> Promise<exitCode>
 *
 * `io` is injected so tests read the output instead of the terminal. Both renderers go through the
 * ONE exit code computed here.
 */
async function main(argv, io = { log: (s) => console.log(s), err: (s) => console.error(s) }) {
  let opts;
  let verb;
  try {
    verb = argv[0];
    if (verb === '--help' || verb === '-h' || verb === undefined) {
      io.log(USAGE_TEXT);
      return verb === undefined ? USAGE : OK;
    }
    if (!VERBS.includes(verb)) {
      throw new ThirdBrainUsageError(
        `unknown verb ${JSON.stringify(verb)}. Known verbs: ${VERBS.join(', ')}.`, { reason: 'unknown_verb' },
      );
    }
    opts = parseArgv(argv.slice(1));
    if (opts.help === true) { io.log(USAGE_TEXT); return OK; }
  } catch (err) {
    io.err(`${err.name}: ${err.message}`);
    io.err('');
    io.err(USAGE_TEXT);
    return USAGE;
  }

  try {
    if (verb === 'ingest') {
      if (opts.positional.length !== 1) {
        throw new ThirdBrainUsageError('ingest takes exactly one document path.', { reason: 'bad_positionals' });
      }
      if (opts.kind !== undefined && !KINDS.includes(opts.kind)) {
        throw new ThirdBrainUsageError(
          `--kind ${JSON.stringify(opts.kind)} is not one of ${KINDS.join(', ')}.`, { reason: 'bad_kind' },
        );
      }
      const result = await ingest({
        documentPath: opts.positional[0],
        workspace: opts.workspace,
        case: opts.case,
        kind: opts.kind,
        date: opts.date,
        anchors: opts.anchors,
        dryRun: opts.dryRun === true,
      });
      io.log(opts.json ? JSON.stringify(result, null, 2) : renderIngest(result));
      return OK;
    }
    if (verb === 'search') {
      if (opts.positional.length !== 1) {
        throw new ThirdBrainUsageError('search takes exactly one query string.', { reason: 'bad_positionals' });
      }
      const result = search(opts.positional[0], { workspace: opts.workspace, limit: opts.limit });
      io.log(opts.json ? JSON.stringify({ ok: true, ...result }, null, 2) : renderHits(result));
      return OK;
    }
    // backlinks
    if (opts.positional.length !== 1) {
      throw new ThirdBrainUsageError('backlinks takes exactly one doc_id.', { reason: 'bad_positionals' });
    }
    const result = backlinks(opts.positional[0], { workspace: opts.workspace });
    io.log(opts.json ? JSON.stringify({ ok: true, ...result }, null, 2) : renderBacklinks(result));
    return OK;
  } catch (err) {
    const doc = failureDocument(err);
    if (opts.json) {
      // ONE parseable document per failure, on EVERY path — refusal, usage error, or internal
      // defect. "The tool crashed" is exactly the answer a machine caller most needs to read.
      io.err(JSON.stringify(doc.body, null, 2));
    } else if (doc.internal) {
      io.err(`INTERNAL ERROR (${doc.body.error.name}): ${doc.body.error.message}`);
      io.err('  This is a bug in third-brain, not a refusal of your document — exit 2, never 1.');
      if (err && err.stack) io.err(err.stack);
    } else {
      io.err(`${doc.body.error.name}: ${err.message}`);
    }
    return doc.exitCode;
  }
}

module.exports = { main, parseArgv, failureDocument, USAGE_TEXT, VERBS, VALUE_FLAGS, BOOL_FLAGS, KINDS, OK, REFUSED, USAGE };

if (require.main === module) {
  for (const stream of [process.stdout, process.stderr]) {
    stream.on('error', (err) => { if (err.code !== 'EPIPE') throw err; });
  }
  main(process.argv.slice(2)).then((code) => { process.exitCode = code; });
}

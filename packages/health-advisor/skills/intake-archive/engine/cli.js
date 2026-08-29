'use strict';

// cli.js — the EXIT-CODE ADAPTER, and it uses THIS PACKAGE'S ONE EXIT VOCABULARY (AM-7).
//
//   0  the archive is committed, or was already ingested (idempotent), or --verify found no drift
//   1  a NAMED domain refusal, or --verify found drift
//   2  a usage error — the command line was wrong
//
// ADR-001 originally proposed a bespoke per-failure table (3 DIGEST_MISMATCH, 4 HARDENING_REFUSED,
// 5 MANIFEST_CONFLICT, …). The architecture superseded it with the triple
// skills/case-state/engine/cli.js already ships, and the reason is worth keeping in front of the next
// person tempted to add a code: a package with two exit vocabularies has none, because no caller can
// know which one a given verb speaks. The refusal's SPECIFIC identity is not lost — it is carried as
// `error.code` in `--json` and named in the human message, which is where a caller can actually branch
// on it without hard-coding integers.
//
// `--json` REPORTS THE SAME EXIT CODE AS TEXT MODE. lib/check.js records why: "a JSON mode that always
// exits 0 is how a gate dies quietly". One place computes the code; both renderers report it.
//
// AN UNEXPECTED ERROR EXITS 2, NOT 1. Exit 1 means "the archive was refused, and here is which named
// rule refused it". A programming error is not that, and letting it borrow that code would make every
// scripted `if [ $? -eq 1 ]` treat a crash as a considered refusal.

const { runIntake, renderDryRun } = require('./run.js');
const { IntakeUsageError, isIntakeRefusal, refusalDescriptor } = require('./errors.js');
const { renderVerifyReport } = require('./verify.js');

const OK = 0;
const REFUSED = 1;
const USAGE = 2;

const VALUE_FLAGS = Object.freeze(['--url', '--file', '--expect-sha256', '--workspace', '--limits', '--allow-host']);
const BOOL_FLAGS = Object.freeze(['--verify', '--dry-run', '--json', '--help', '-h']);

const USAGE_TEXT = `usage: intake-archive --workspace <dir> (--url <https://…> --expect-sha256 <hex> | --file <path>)
                        [--allow-host <host>]… [--limits <file>] [--dry-run] [--json]
       intake-archive --verify --workspace <dir> [--json]

  --url <https://…>       archive in object storage. https only; --expect-sha256 is MANDATORY.
  --file <path>           archive already on this machine. No socket is opened at all.
  --expect-sha256 <hex>   the archive's sha256, supplied INDEPENDENTLY of the archive itself.
  --workspace <dir>       the patient workspace. Ingests into <dir>/sources/raw/sha256-<hex>/.
  --allow-host <host>     a host a cross-host redirect may reach (repeatable).
  --limits <file>         JSON object overriding the budget registry. The ONE limits knob.
  --dry-run               validate and print the plan. Zero network calls, zero writes.
  --verify                re-read the catalog and re-hash the raw zone. Reads only.
  --json                  machine output, with the SAME exit code as text mode.

exit codes: 0 committed / already ingested / verify clean · 1 named refusal or verify drift · 2 usage`;

/**
 * parseArgv(argv) -> options | throws IntakeUsageError
 *
 * STRICT: an unknown option is a usage error, never a silently ignored token. A typo that changes
 * nothing while reporting success is the failure mode this rejection exists for — `--dry-runn` must not
 * perform a real ingest.
 */
function parseArgv(argv) {
  const opts = { allowHost: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--help' || a === '-h') { opts.help = true; continue; }
    if (a === '--verify') { opts.verify = true; continue; }
    if (a === '--dry-run') { opts.dryRun = true; continue; }
    if (a === '--json') { opts.json = true; continue; }
    if (VALUE_FLAGS.includes(a)) {
      const value = argv[i + 1];
      if (value === undefined || value.startsWith('--')) {
        throw new IntakeUsageError(`${a} needs a value.`, { reason: 'flag_without_value' });
      }
      i += 1;
      if (a === '--url') opts.url = value;
      else if (a === '--file') opts.file = value;
      else if (a === '--expect-sha256') opts.expectSha256 = value;
      else if (a === '--workspace') opts.workspace = value;
      else if (a === '--limits') opts.limitsFile = value;
      else if (a === '--allow-host') opts.allowHost.push(value);
      continue;
    }
    throw new IntakeUsageError(
      `unknown option ${JSON.stringify(a)}. An unrecognised token is refused rather than ignored — an ` +
      'ignored flag reads exactly like an applied one.',
      { reason: 'unknown_option' }
    );
  }
  return opts;
}

/**
 * failureDocument(err) -> { exitCode, body, internal }
 *
 * THE ONE PLACE a thrown error becomes an exit code and a machine document — extracted so the
 * refusal-enum reflection test can assert, for EVERY class in the closed enum plus the usage error
 * plus a raw internal crash, that `--json` mode always has a valid JSON document to print (F3: the
 * measured failure was `STDOUT bytes: 0` on an unnamed RangeError — a machine caller branching on
 * `--json` got no document at all). `body` is always JSON-serialisable and never carries a stack;
 * the stack stays on the human renderer, where a person is reading it.
 */
function failureDocument(err) {
  if (err instanceof IntakeUsageError) {
    return { exitCode: USAGE, internal: false, body: { ok: false, error: err.toJSON() } };
  }
  if (isIntakeRefusal(err)) {
    const d = refusalDescriptor(err);
    return {
      exitCode: REFUSED,
      internal: false,
      body: {
        ok: false,
        // The distinguishing identity, carried across the process boundary the exit code collapses.
        error: {
          name: d.name,
          code: err.code || d.code,
          phase: err.phase || d.phase,
          reason: err.reason === undefined ? null : err.reason,
          message: err.message,
        },
      },
    };
  }
  // Not a refusal and not a usage error: a defect. Loud, NOT wearing exit 1's clothes — and in
  // `--json` mode still ONE parseable document, because "the tool crashed" is exactly the answer a
  // machine caller most needs to be able to read.
  return {
    exitCode: USAGE,
    internal: true,
    body: {
      ok: false,
      error: {
        name: (err && err.name) || 'Error',
        code: 'EINTAKE_INTERNAL',
        phase: 'internal',
        reason: 'internal_error',
        message: (err && err.message) || String(err),
      },
    },
  };
}

function renderIntakeResult(result) {
  const lines = [];
  if (result.idempotent) {
    lines.push(`already ingested: sha256-${result.archiveId} — nothing was downloaded, extracted or written.`);
    lines.push(`  ${result.skipped.length} catalogued file(s) already present at ${result.destination}`);
  } else {
    lines.push(`ingested ${result.added.length + result.skipped.length} file(s) from archive sha256:${result.archiveId}`);
    lines.push(`  raw zone:  ${result.destination}`);
    lines.push(`  catalog:   +${result.added.length} new row(s), ${result.skipped.length} already present`);
    for (const row of result.added) {
      lines.push(`    ${row.path}  ${row.bytes} bytes  ${row.media_type}  sha256 ${row.sha256.slice(0, 16)}…`);
    }
  }
  return lines.join('\n');
}

/**
 * main(argv, io) -> Promise<exitCode>
 *
 * `io` is injected so tests read the output instead of the terminal. Both renderers go through the ONE
 * exit code computed here.
 */
async function main(argv, io = { log: (s) => console.log(s), err: (s) => console.error(s) }) {
  let opts;
  try {
    opts = parseArgv(argv);
  } catch (err) {
    io.err(`${err.name}: ${err.message}`);
    io.err('');
    io.err(USAGE_TEXT);
    return USAGE;
  }
  if (opts.help === true) {
    io.log(USAGE_TEXT);
    return OK;
  }

  const warnings = [];
  const runIo = { log: (s) => io.log(s), warn: (s) => { warnings.push(s); io.err(s); } };

  let result;
  try {
    result = await runIntake({ ...opts, io: runIo });
  } catch (err) {
    const doc = failureDocument(err);
    if (opts.json) {
      // ONE parseable document per failure, on EVERY path — refusal, usage error, or internal
      // defect (F3: an unnamed crash used to leave `--json` with no document at all).
      io.err(JSON.stringify(doc.body, null, 2));
    } else if (doc.internal) {
      io.err(`INTERNAL ERROR (${doc.body.error.name}): ${doc.body.error.message}`);
      io.err('  This is a bug in intake-archive, not a refusal of your archive — exit 2, never 1.');
      if (err && err.stack) io.err(err.stack);
    } else {
      io.err(`${doc.body.error.name}: ${err.message}`);
    }
    return doc.exitCode;
  }

  if (result.mode === 'verify') {
    if (opts.json) {
      io.log(JSON.stringify({
        ok: result.ok,
        catalogRows: result.catalogRows,
        checkedRows: result.checkedRows,
        checkedFiles: result.checkedFiles,
        problems: result.problems,
        legacy: result.legacy,
      }, null, 2));
    } else {
      io.log(renderVerifyReport(result, result.workspace));
    }
    return result.ok ? OK : REFUSED;
  }

  if (result.mode === 'dry-run') {
    // ONE document per mode: the JSON renderer and the human renderer are alternatives, never both. A stdout
    // carrying a human report followed by a JSON one is not machine-readable, which defeats the flag.
    io.log(opts.json ? JSON.stringify({ ok: true, ...result }, null, 2) : renderDryRun(result));
    return OK;
  }

  if (opts.json) {
    io.log(JSON.stringify({
      ok: true,
      idempotent: result.idempotent === true,
      archive_id: `sha256:${result.archiveId}`,
      destination: result.destination,
      added: result.added,
      skipped: result.skipped,
      source: result.source,
      warnings,
    }, null, 2));
  } else {
    io.log(renderIntakeResult(result));
  }
  return OK;
}

module.exports = { main, parseArgv, failureDocument, USAGE_TEXT, VALUE_FLAGS, BOOL_FLAGS, OK, REFUSED, USAGE };

// `process.exitCode`, never `process.exit()` — the lesson skills/case-state/engine/cli.js MEASURED: on
// a piped stdout `process.exit()` discards whatever is still queued, so the caller gets a PREFIX of the
// report together with an exit code that reads as a complete answer. EPIPE (a reader that closed early,
// `… | head -1`) leaves the computed code standing; every other stream error still crashes loudly.
if (require.main === module) {
  for (const stream of [process.stdout, process.stderr]) {
    stream.on('error', (err) => { if (err.code !== 'EPIPE') throw err; });
  }
  main(process.argv.slice(2)).then((code) => { process.exitCode = code; });
}

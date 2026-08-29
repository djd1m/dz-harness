'use strict';
// ha-ca1 — the runner: transport -> ACLs -> bundle -> 7 checks -> makeFinding ->
// {renderAppraisal, appraisalExitCode, draftAuthorLetter}. CLI arg parsing lives here; the skill
// front-end (skills/critical-appraisal/scripts/appraise.js) resolves THIS file and delegates.
//
// EXIT CONTRACT (appraisalExitCode, O-3): 0 = no concern recorded; 1 = >= 1 concern; 2 = the
// majority of findings are 'unknown' — and 2 DOMINATES 1. See the caller-trap comment in
// lib/appraisal-core.js before branching on this code.

const fs = require('node:fs');
const path = require('node:path');

const core = require('./appraisal-core.js');
const { bundleFromFixtures, buildBundle } = require('./appraisal-bundle.js');

const check01 = require('./appraisal-checks/01-retraction-status.js');
const check02 = require('./appraisal-checks/02-cites-retracted-work.js');
const check03 = require('./appraisal-checks/03-registration-timing.js');
const check0405 = require('./appraisal-checks/04-05-registry-record-changed.js');
const check06 = require('./appraisal-checks/06-enrollment-actuality.js');
const check07 = require('./appraisal-checks/07-results-reporting-timeliness.js');

// C4 and C5 emit ONE finding on ONE domain — six modules, six domains, seven checks.
const CHECKS = Object.freeze([check01, check02, check03, check0405, check06, check07]);

const CHECKS_BY_DOMAIN = Object.freeze(Object.fromEntries(CHECKS.map((c) => [c.domain, c])));

// C3-6 (round 3): the unknown finding a THROWING check degrades to. The quote deliberately never
// carries err.message — the message usually QUOTES the malformed field ("...: 50%"), and quoting it
// here would re-throw the very gate that fired inside the check. If even this generic finding is
// refused, the original error is the truth and is rethrown.
function checkErroredFinding(domain, err) {
  try {
    return core.makeFinding({
      domain,
      verdict: 'unknown',
      evidence: [{
        quote: `check-errored: the ${domain} check could not evaluate this record; a malformed upstream field is not reproduced here`,
        locator: null,
      }],
      refutable_by: 'a registry record whose fields parse cleanly for this check',
      tier: 'A',
      author_response_state: 'not-contacted',
    });
  } catch {
    throw err;
  }
}

/** buildAppraisal(bundle, {now}) -> frozen AppraisalSubject { subject, linkages, observedAt,
 *  findings[], coverage }. Deterministic: same frozen bundle + same now => deep-equal output. */
function buildAppraisal(bundle, { now } = {}) {
  const findings = [];
  for (const check of CHECKS) {
    let finding;
    try {
      finding = check.evaluate(bundle, { now: now || (bundle && bundle.observedAt) || null });
    } catch (err) {
      // C3-6: a malformed upstream field costs ONE finding (unknown/check-errored), never the run —
      // there was no try/catch here, so round 2's reorder let a '50%' in resultsFirstSubmitDate
      // abort the whole appraisal (MEASURED)
      finding = checkErroredFinding(check.domain, err);
    }
    if (finding !== null) findings.push(finding);
  }
  return Object.freeze({
    subject: (bundle && bundle.subject) || null,
    linkages: (bundle && bundle.linkage) ? [bundle.linkage] : [],
    observedAt: now || (bundle && bundle.observedAt) || null,
    findings: Object.freeze(findings),
    coverage: core.coverageOf(findings),
  });
}

function parseArgs(argv) {
  const args = { format: 'md' };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--doi') args.doi = argv[++i];
    else if (a === '--pmid') args.pmid = argv[++i];
    else if (a === '--nct') args.nct = argv[++i];
    else if (a === '--json') args.format = 'json';
    else if (a === '--format') args.format = argv[++i];
    else if (a === '--retraction-csv') args.retractionCsv = argv[++i];
    else if (a === '--fixtures-dir') args.fixturesDir = argv[++i];
    else if (a === '--now') args.now = argv[++i];
    else if (a === '--letter') args.letter = true;
    else if (a === '--probe-endpoints') args.probeEndpoints = true; // opt-in live canary, never CI
    else if (a === '--help' || a === '-h') args.help = true;
  }
  return args;
}

const USAGE = `usage: appraise --doi <doi> | --pmid <pmid> | --nct <nct> [--format md|json] [--retraction-csv <path>]
       exit codes: 0 no concern · 1 concern recorded · 2 predominantly unknown (2 dominates 1 — read the output)`;

async function runCli(argv) {
  const args = parseArgs(argv);
  if (args.help || (!args.doi && !args.pmid && !args.nct && !args.fixturesDir)) {
    process.stdout.write(`${USAGE}\n`);
    return args.help ? 0 : 2;
  }
  let bundle;
  if (args.fixturesDir) {
    // offline path (tests / demos): compose the bundle from a fixture directory
    const dir = path.resolve(args.fixturesDir);
    const pick = (rel) => (fs.existsSync(path.join(dir, rel)) ? path.join(dir, rel) : null);
    bundle = bundleFromFixtures({
      crossref: pick('crossref.json'),
      pubmed: pick('pubmed.json'),
      europepmc: pick('europepmc.json'),
      ctgovV2: pick('ctgov-v2.json'),
      ctgovHistory: pick('ctgov-history.json'),
      retractionIndex: pick('retraction-index.json'),
    });
  } else {
    const { createTransport } = require('./appraisal-transport.js');
    bundle = await buildBundle({
      doi: args.doi,
      pmid: args.pmid,
      nct: args.nct,
      retractionCsvPath: args.retractionCsv,
      transport: createTransport(),
    });
  }
  const now = args.now || new Date().toISOString().slice(0, 10);
  const subject = buildAppraisal(bundle, { now });
  if (args.format === 'json') {
    // THE UNFILTERED EMIT PATH (05_architecture.md §5.3): the subject is serialised AS CONSTRUCTED,
    // with no key list anywhere between construction and serialisation — the AM-7 gate reads here.
    process.stdout.write(`${JSON.stringify(subject, null, 2)}\n`);
  } else {
    process.stdout.write(`${core.renderAppraisal(subject)}\n`);
  }
  if (args.letter) {
    for (const f of subject.findings) {
      if (f.verdict === 'concern') {
        process.stdout.write(`\n---\n${core.draftAuthorLetter(f, { material: bundle })}\n`);
      }
    }
  }
  return core.appraisalExitCode(subject.findings);
}

module.exports = { buildAppraisal, CHECKS, CHECKS_BY_DOMAIN, parseArgs, runCli, USAGE };

/* istanbul ignore next -- CLI adapter */
if (require.main === module) {
  runCli(process.argv.slice(2)).then(
    (code) => process.exit(code),
    (err) => {
      process.stderr.write(`[ERROR] appraise: ${err && err.message ? err.message : String(err)}\n`);
      process.exit(2);
    },
  );
}

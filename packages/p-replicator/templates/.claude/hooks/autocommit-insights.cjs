#!/usr/bin/env node
'use strict';

/**
 * Stop hook — auto-commits .claude/insights/ if anything changed.
 * Cross-platform: pure Node + execFileSync, no shell.
 */

const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

// The project root, never the process cwd: a `cd` inside any tool call moves cwd for the rest of
// the session, and these hooks are non-blocking, so a wrong anchor fails SILENTLY. CLAUDE_PROJECT_DIR
// first — the host is authoritative about what the project is. `__dirname` second: a hook always
// lives at <project>/.claude/hooks/<x>.cjs, so its own location settles the root with no cooperation
// from anyone, which is what keeps this working when the variable is absent (hand-run, older host).
const ENV_ROOT = process.env.CLAUDE_PROJECT_DIR;
// isAbsolute, not just truthy: a RELATIVE value would still be resolved against the drifting
// cwd, which is the very bug this anchor exists to remove.
const ROOT = (ENV_ROOT && path.isAbsolute(ENV_ROOT))
  ? ENV_ROOT
  : path.resolve(__dirname, '..', '..');

const TARGET_DIR = path.resolve(ROOT, '.claude', 'insights');
const RELATIVE = path.relative(ROOT, TARGET_DIR);
// cwd: ROOT — the paths below are relative to ROOT, so git must run there too.
// stderr is PIPED, not ignored: on success nothing is printed anyway, and on failure git's
// own words are the only thing that tells a reader WHY. Discarding them leaves a report that
// names what failed and not why, which is half a report.
const SILENT = { stdio: ['ignore', 'pipe', 'pipe'], cwd: ROOT };

// What the hook was DOING when it failed. The outer catch also sees staging failures and a
// missing git binary, and reporting either of those as "could not commit" would send the reader
// looking in the wrong place.
let stage = 'start';

function git(args) {
  return execFileSync('git', args, SILENT);
}

try {
  // The repository probe comes FIRST now, because the absence check below needs to ask git a
  // question and there is no point asking outside a repository.
  stage = 'inspect the repository';
  try {
    git(['rev-parse', '--git-dir']);
  } catch (probeErr) {
    // "Not a git repository" is the ordinary case and stays silent. Everything else — no git on
    // PATH, dubious ownership, a permission error — is a real failure that used to look exactly
    // like it, which is how a broken machine and an ordinary directory became indistinguishable.
    const why = String((probeErr && probeErr.stderr) || '').trim();
    if (!why || /not a git repository/i.test(why)) process.exit(0);
    throw probeErr;
  }

  // Absent — but absent HOW? A path that never existed is nothing to do, as before. A path git
  // still tracks is a DELETION, and a deletion is exactly the change this hook exists to record.
  //
  // `git ls-files` is the discriminator, and it must run BEFORE staging: staging a deletion
  // removes the entry from the index, after which the same question answers "not tracked".
  // CORRECTION, measured: `--error-unmatch` also discriminates correctly here, for files AND for
  // directories — 0 for a deleted-but-tracked path, 1 for one that never existed. An earlier note
  // here claimed otherwise; that claim came from measuring it AFTER staging, which is what made it
  // fail, not the directory-ness. `ls-files --` is preferred only because it answers with DATA
  // (empty or not) instead of by throwing, so the ordinary case needs no exception handling.
  //
  // Simply DELETING the existence guard would have been the naive fix and would have broken the
  // reporting that shipped yesterday: `git add` on a path that never existed exits 128, so every
  // session stop in every project without this artifact would print a failure line. MEASURED.
  if (!fs.existsSync(TARGET_DIR)) {
    // A bare `catch { tracked = '' }` here would turn a REAL git failure into "never existed"
    // and skip a deletion that should have been recorded — a silent bypass of the very thing
    // this feature adds. A failure is rethrown into the reporting path; only a genuinely
    // empty answer means the artifact never lived here.
    const tracked = String(git(['ls-files', '--', RELATIVE]) || '').trim();
    if (!tracked) process.exit(0);   // never existed here — silent, exactly as before
  }

  stage = 'stage the change';
  git(['add', '--', RELATIVE]);

  // Ask git WHAT it staged, not merely WHETHER something changed — same subprocess, strictly
  // more information. Deriving "this is a removal" from whether the path still exists was
  // wrong for a directory: deleting ONE file inside it, or deleting every tracked file while
  // an ignored one keeps the directory present, would have been committed as an update and
  // defeated the very search this feature promises.
  let staged = '';
  try {
    staged = String(git(['diff', '--cached', '--name-status', '--', RELATIVE]) || '').trim();
  } catch {
    // No HEAD yet (an unborn repository): there is no history to record a removal against.
    staged = '';
  }
  const deleted = staged.split('\n').some((l) => /^D/.test(l.trim()));
  const hasDiff = staged.length > 0;

  if (hasDiff) {
    // -m BEFORE the `--`: everything after `--` is a PATHSPEC, so the old order made git
    // look for files literally named '-m' and 'docs(insights): auto-capture' — it failed every
    // time, from every directory, and this hook exits 0 on failure, so nobody saw it.
    stage = 'commit';
    // A deletion gets its own subject, so the event is findable in `git log` without
    // reading diffs — which is the whole point of recording it.
    git(['commit', '-m', deleted ? 'docs(insights): auto-remove' : 'docs(insights): auto-capture', '--only', '--', RELATIVE]);
  }
} catch (err) {
  // Best-effort — never break the Claude session on commit failures. But "not breaking the session"
  // and "saying nothing" are different things, and only the first one is the contract: it is about
  // the EXIT CODE. Silence is what let a permanent defect live here undetected — `-m` after `--`
  // made every commit fail, from every directory, forever, and nothing said so.
  //
  // A held index.lock, a missing user.email, a repository pre-commit hook that rejected the commit,
  // an ignored target: each now costs one line and still exits 0. The ordinary "nothing to commit"
  // path never reaches here, deliberately — a notice that fires when nothing is wrong trains people
  // to ignore notices, and the next real failure scrolls past with them.
  const artifactName = '.claude/insights/';
  const gitSaid = err && err.stderr ? String(err.stderr).trim() : '';
  const detail = (gitSaid || String((err && err.message) || err)).split('\n')
    .map((l) => l.trim()).filter(Boolean)[0] || 'unknown error';
  process.stdout.write('[autocommit-insights] could not ' + stage + ' — ' + artifactName + ': '
    + detail.slice(0, 200) + '\n');
  process.exit(0);
}

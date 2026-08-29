'use strict';

// verify.js — `intake-archive --verify`: does the catalog still describe the raw zone? (INV-13)
//
// WHY THIS IS A SEPARATE COMMAND AND NOT A STEP OF THE INTAKE. An intake can only ever check its own
// work, and a mechanism that checks its own work answers the wrong question: the failures worth
// catching happen LATER — a file deleted by hand, a partial commit left by a crash, an editor that
// rewrote a document in place, a restore-from-backup that put an older copy back.
//
// IT CONSULTS NO IN-MEMORY STATE, EVER. Every answer comes from re-reading sources/manifest.json off
// disk and re-hashing every file under sources/raw/** off disk. That is precisely what makes it a
// trustworthy ORACLE for the intake path rather than a second opinion from the same head: the
// no-partial-corpus and idempotency tests can assert "--verify is clean afterwards" and have that mean
// something.
//
// IT CHECKS BOTH DIRECTIONS. Every catalogued row must resolve to a file whose sha256 and size match;
// every file present in the raw zone must be described by exactly one row. Checking only the first
// direction lets an extra file live in a patient's corpus unremarked — and an extra document in a
// medical corpus is not a harmless surplus.
//
// IT NEVER WRITES. Not a log line, not a repair, not a "fixed it for you". A verification that mutates
// what it verifies has destroyed the evidence of the thing it found.

const fs = require('node:fs');
const path = require('node:path');

const { hashFile } = require('./digest.js');
const { loadCatalog, rawRoot, walkFiles } = require('./manifest.js');
const { detectLegacyLayout, renderLegacyWarning } = require('../../../lib/workspace-layout.js');

/**
 * verifyWorkspace(workspaceDir) -> {
 *   ok, checkedRows, checkedFiles, problems: [{ kind, path, detail }], legacy
 * }
 *
 * `kind` ∈ 'missing' | 'size_mismatch' | 'sha256_mismatch' | 'uncatalogued' | 'duplicate_row'.
 * A problem NAMES the offending path — "the catalog and the raw zone disagree" is not actionable.
 */
function verifyWorkspace(workspaceDir) {
  const workspace = path.resolve(workspaceDir);
  const sourcesDir = path.join(workspace, 'sources');
  const catalog = loadCatalog(sourcesDir);
  const problems = [];

  const byStoredAt = new Map();
  for (const row of catalog.entries) {
    if (byStoredAt.has(row.stored_at)) {
      problems.push({
        kind: 'duplicate_row',
        path: row.stored_at,
        detail: `two catalog rows describe ${row.stored_at}`,
      });
      continue;
    }
    byStoredAt.set(row.stored_at, row);
  }

  let checkedRows = 0;
  for (const [storedAt, row] of byStoredAt) {
    const abs = path.resolve(workspace, storedAt);
    let stat;
    try {
      stat = fs.statSync(abs);
    } catch (err) {
      problems.push({ kind: 'missing', path: storedAt, detail: `catalogued but absent from disk (${err.code || err.message})` });
      continue;
    }
    if (!stat.isFile()) {
      problems.push({ kind: 'missing', path: storedAt, detail: 'catalogued but not a regular file on disk' });
      continue;
    }
    if (stat.size !== row.bytes) {
      problems.push({ kind: 'size_mismatch', path: storedAt, detail: `catalog says ${row.bytes} bytes, disk says ${stat.size}` });
      continue;
    }
    // RE-HASHED FROM DISK. The size check above is a cheap pre-filter, not the verification: a
    // same-length edit is exactly the modification a size comparison cannot see.
    const { sha256hex } = hashFile(abs);
    if (sha256hex !== row.sha256) {
      problems.push({ kind: 'sha256_mismatch', path: storedAt, detail: `catalog says ${row.sha256}, disk says ${sha256hex}` });
      continue;
    }
    checkedRows += 1;
  }

  let checkedFiles = 0;
  const raw = rawRoot(sourcesDir);
  for (const abs of walkFiles(raw)) {
    checkedFiles += 1;
    const rel = `sources/${path.relative(sourcesDir, abs).split(path.sep).join('/')}`;
    if (!byStoredAt.has(rel)) {
      problems.push({ kind: 'uncatalogued', path: rel, detail: 'present in the raw zone but described by no catalog row' });
    }
  }

  return {
    ok: problems.length === 0,
    checkedRows,
    checkedFiles,
    catalogRows: catalog.entries.length,
    problems,
    // THE SECOND (and last) SURFACE THAT WARNS ABOUT THE LEGACY LAYOUT (P1-1). The intake direction
    // owns this warning: `intake-archive` runs and this report. `ha check` stays warn-free by its own
    // doctrine — it has NO --warn mode and NO warn-only outcome, and adding one to a gate is how a gate
    // dies quietly.
    legacy: detectLegacyLayout(workspace),
  };
}

/** The human report. One renderer, so the text cannot drift between the two callers. */
function renderVerifyReport(result, workspaceDir) {
  const lines = [];
  lines.push(`intake-archive --verify ${workspaceDir}`);
  lines.push(`  catalog rows: ${result.catalogRows}  re-verified: ${result.checkedRows}  files in raw zone: ${result.checkedFiles}`);
  if (result.ok) {
    lines.push('  OK — every catalogued file re-hashes to its recorded sha256, and every file in the raw zone is catalogued.');
  } else {
    lines.push(`  DRIFT — ${result.problems.length} problem(s):`);
    for (const p of result.problems) lines.push(`    [${p.kind}] ${p.path} — ${p.detail}`);
  }
  if (result.legacy.present) {
    lines.push(renderLegacyWarning(result.legacy));
  }
  return lines.join('\n');
}

module.exports = { verifyWorkspace, renderVerifyReport };

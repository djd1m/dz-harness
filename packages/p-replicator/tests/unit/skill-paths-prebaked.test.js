'use strict';

// The ten shipped skills referenced each other by claude.ai paths (`/mnt/skills/user/<name>/`) and
// worked only because two rules files tell the model to rewrite them at read time. That is layer 4
// on the cost-of-detection ladder: probabilistic, and silent when it lapses. MEASURED before this
// change: 83 occurrences across 19 files.
//
// A blind transform would have been worse than the defect, in two separate ways:
//
//   1. Seven of those occurrences are the GENERATOR'S OWN instructions to scan its output for
//      unrewritten paths, and more are the rewrite tables themselves. Rewriting a MENTION destroys
//      the mechanism that keeps generated skills clean.
//   2. Two referenced skills — frontend-design, idea2prd-manual — are NOT shipped here. Rewriting
//      them yields `.claude/skills/frontend-design/`: a path that looks local, looks valid, and
//      resolves to nothing. Worse than a foreign path, which at least announces itself.
//
// So the guard is an ALLOWLIST OF EXACT LOCATIONS, not a count. A count is defeated by adding one
// violation and deleting one mention; naming the survivors is not — and P4 asserts the second
// direction, because losing the generator's self-check is the failure this exists to prevent.

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const TPL = path.join(__dirname, '..', '..', 'templates', '.claude');
const SKILLS = path.join(TPL, 'skills');

/**
 * Files permitted to mention `/mnt/`, keyed by a fingerprint of THE MENTION LINES THEMSELVES.
 *
 * A per-file COUNT was the first version and cross-family review broke it in one move: in
 * `03-generate-p0.md`, replace one rewrite-table row with an unrelated unrewritten path and the total
 * stays 11, so the guard stays green over exactly the add/delete mutation the ADR says must fail.
 * The fingerprint is over the sorted mention lines, so swapping one for another changes it.
 */
const ALLOWED = {
  'pipeline-forge/SKILL.md': 'b2773e5b80c19885',
  'pipeline-forge/references/patterns-catalog.md': '9025717e78f2ead3',
  'pipeline-forge/references/self-extracted-patterns.md': '010eb3198d929b13',
  'cc-toolkit-generator-enhanced/SKILL.md': 'd7c97e6b6cae4831',
  'cc-toolkit-generator-enhanced/references/templates/feature-lifecycle-ent.md': '7826a204d7214a22',
  'cc-toolkit-generator-enhanced/references/templates/feature-lifecycle.md': 'c01aaa46eb670a1b',
  'cc-toolkit-generator-enhanced/modules/01-detect-parse.md': '70a68e025bd84997',
  'cc-toolkit-generator-enhanced/modules/03-generate-p0.md': '6410a1ea4107ee33',
  'cc-toolkit-generator-enhanced/modules/04-generate-p1.md': '634066fcf5a485bf',
  'cc-toolkit-generator-enhanced/modules/06-package-deliver.md': '12d0dd630ba3d992',
  'cc-toolkit-generator-enhanced/modules/08-skill-composition.md': 'd9b68fbe2cf1dbfc',
};

/** The fingerprint of one file's mention lines — the identity the allowlist is keyed on. */
function mentionPrint(rel) {
  const lines = fs.readFileSync(path.join(SKILLS, rel), 'utf-8').split('\n')
    .filter((l) => l.includes('/mnt/')).map((l) => l.trim());
  return crypto.createHash('sha256').update(lines.join('\n')).digest('hex').slice(0, 16);
}

/** Every file under templates/.claude/skills, as repo-relative-to-SKILLS paths. */
function walk(dir, base) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(abs, base));
    else out.push(path.relative(base, abs).split(path.sep).join('/'));
  }
  return out;
}

const countMnt = (rel) => {
  const body = fs.readFileSync(path.join(SKILLS, rel), 'utf-8');
  return (body.match(/\/mnt\//g) || []).length;
};

describe('shipped skills resolve without a rewrite step', () => {
  test('P1 - no unrewritten /mnt/ path outside the named allowlist', () => {
    const offenders = [];
    for (const rel of walk(SKILLS, SKILLS)) {
      const n = countMnt(rel);
      if (n > 0 && !(rel in ALLOWED)) offenders.push(rel + ' (' + n + ')');
    }
    assert.deepEqual(offenders, [],
      'these files carry claude.ai paths and are not on the mention allowlist: '
      + JSON.stringify(offenders));
  });

  test('P2 - every rewritten .claude/skills/<name>/ path resolves to something that exists', () => {
    // NARROWED after the first version failed loudly and was right to: a `.claude/skills/<name>`
    // target does NOT have to be a skill this package ships. Phase 3 GENERATES several into the
    // user's project (`project-context`, `coding-standards`, `security-patterns` — named in
    // replicate-pipeline.md), the rewrite tables carry placeholder names, and two skills are
    // declared optional externals. What this feature created is the class under test: a path that
    // REPLACED a /mnt/ reference to a skill shipped here.
    const shipped = new Set(fs.readdirSync(SKILLS));
    const GENERATED = new Set(['project-context', 'coding-standards', 'security-patterns',
      'testing-patterns', 'aggregate-patterns', 'event-handlers', 'feature-navigator']);
    const OPTIONAL_EXTERNAL = new Set(['frontend-design', 'idea2prd-manual']);
    const bad = [];
    for (const rel of walk(SKILLS, SKILLS)) {
      const body = fs.readFileSync(path.join(SKILLS, rel), 'utf-8');
      for (const line of body.split('\n')) {
        // A line that shows BOTH sides of the mapping is describing the transform, not performing it.
        if (line.includes('/mnt/')) continue;
        const re = /\.claude\/skills\/([a-z0-9-]+)/g;
        for (let m = re.exec(line); m !== null; m = re.exec(line)) {
          const name = m[1];
          if (shipped.has(name) || GENERATED.has(name) || OPTIONAL_EXTERNAL.has(name)) continue;
          if (name === 'skills' || line.includes('{{') || line.includes('[name]')) continue;
          bad.push(rel + ' → .claude/skills/' + name);
        }
      }
    }
    assert.deepEqual([...new Set(bad)], [],
      'a path points at a skill that is neither shipped, nor Phase-3 generated, nor a declared '
      + 'optional external: ' + JSON.stringify([...new Set(bad)]));
  });

  test('P3 - absent skills are declared optional, not rewritten', () => {
    // frontend-design is referenced but not shipped. It must NOT have become a local-looking path.
    const cjm = fs.readFileSync(
      path.join(SKILLS, 'reverse-engineering-unicorn', 'modules', '025-cjm-prototype.md'), 'utf-8');
    assert.match(cjm, /`frontend-design` — OPTIONAL, ВНЕШНИЙ/,
      'an absent dependency must be declared optional');
    assert.match(cjm, /\*\*Fallback, если его нет:\*\*/,
      'and carry a fallback — the shipped skill-interface-protocol §6 requires one for every OPTIONAL');
    assert.match(cjm, /Молча пропускать нельзя/,
      'and must refuse the silent-skip reading');
    assert.ok(!/\.claude\/skills\/frontend-design\/SKILL\.md/.test(cjm),
      'it must not be given a local path at all — that is the dangling-path failure this avoids');
  });

  test('P4 - each allowlisted mention still exists, by identity not by count', () => {
    // Both directions, and neither expressible as a total. A NEW unrewritten path changes the
    // fingerprint; so does a DELETED self-check — and losing the generator's `grep -r /mnt/` would
    // silently stop it noticing unrewritten paths in the skills it GENERATES.
    const drift = [];
    for (const [rel, expected] of Object.entries(ALLOWED)) {
      const abs = path.join(SKILLS, rel);
      if (!fs.existsSync(abs)) { drift.push(rel + ' (file gone)'); continue; }
      const got = mentionPrint(rel);
      if (got !== expected) drift.push(rel + ' expected ' + expected + ', got ' + got);
    }
    assert.deepEqual(drift, [],
      'a mention changed: a new unrewritten path, a lost self-check, or one swapped for the other '
      + '— a per-file count could not tell these apart: ' + JSON.stringify(drift));
  });

  test('P5 - the guard is an allowlist of locations, not a count', () => {
    // Asserted on the guard itself. A total-count assertion passes after someone adds one violation
    // and removes one mention, which is exactly the edit this feature makes plausible.
    const self = fs.readFileSync(__filename, 'utf-8');
    assert.match(self, /const ALLOWED = \{/, 'the guard must name locations');
    assert.ok(Object.keys(ALLOWED).length >= 5, 'and enumerate them all');
    // Keyed by fingerprint, not count — the property cross-family review found missing.
    assert.match(self, /function mentionPrint/, 'identity, not arithmetic');
    for (const v of Object.values(ALLOWED)) {
      assert.match(String(v), /^[0-9a-f]{16}$/, 'every entry must be a fingerprint, not a number');
    }
    // A count over the whole tree would be a single number; the allowlist is per-file, and P1 keys
    // on membership rather than on any total.
    assert.match(self, /!\(rel in ALLOWED\)/,
      'P1 must decide by membership, not by comparing a sum');
  });

  test('P6 - the rewrite rules survive, for skills a user brings from claude.ai', () => {
    // The fix removes the shipped skills' DEPENDENCE on the table, not the table. A user may still
    // install a skill written against /mnt/ paths, and then the rule is what makes it work.
    const proto = fs.readFileSync(path.join(TPL, 'rules', 'skill-interface-protocol.md'), 'utf-8');
    assert.match(proto, /\/mnt\/skills\/user\/\[name\]\/`? \| `\.claude\/skills\/\[name\]\/`/,
      'the rewrite table must remain');
    const pipeline = fs.readFileSync(path.join(TPL, 'rules', 'replicate-pipeline.md'), 'utf-8');
    assert.match(pipeline, /\/mnt\/skills\/user\//, 'and the pipeline rule must keep its copy');
  });
});

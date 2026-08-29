'use strict';

// One file, two canonical schemas. MEASURED: commands/next.md:84-96 documents feature-roadmap.json
// with a `priority` field over the closed set mvp|high|medium|low, while
// skills/cc-toolkit-generator-enhanced/references/templates/feature-suggestions.md names the SAME
// path ("Generate as .claude/feature-roadmap.json") and documents a shape with NO priority at all —
// and calls itself the single source of truth while being one of two. A generator following the
// second produces a roadmap the package's own status line cannot read.
//
// The consumer was silent about it: statusline.cjs filters `f.priority === 'mvp'`, which is correct
// against the schema, so a roadmap using `critical` — a value in NO documented enum — or carrying MVP
// in `tags` rendered "mvp 0/0" and said nothing. The number was right and the reader learned nothing,
// which is how a divergence becomes permanent.
//
// NOT DONE, deliberately: `tags.includes('mvp')` as a "fix". It would bless a document that also used
// a value in no enum, and teach readers to accept whatever a generator emits. The counter matches the
// specification; the documents diverged.
//
// Also REFUTED while measuring: the report's second defect, a supposed contradiction about who
// creates the file. feature.md:44 sits under "### What does NOT happen in Mode 2" — it is scoped to
// the mode where /replicate never runs. Both statements are true in their own mode; what was missing
// is one place saying both, which P3 now requires.

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const TPL = path.join(__dirname, '..', '..', 'templates', '.claude');
const read = (rel) => fs.readFileSync(path.join(TPL, rel), 'utf-8');

const NEXT = 'commands/next.md';
const SUGGESTIONS = 'skills/cc-toolkit-generator-enhanced/references/templates/feature-suggestions.md';

const STRIP = new RegExp('\\x1b\\[[0-9;]*m', 'g');

/** Run the real status line over a real roadmap and return its plain-text Roadmap line. */
function roadmapLine(features) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'p-rep-schema-')));
  try {
    fs.mkdirSync(path.join(root, '.claude', 'hooks'), { recursive: true });
    fs.copyFileSync(path.join(TPL, 'hooks', 'statusline.cjs'),
      path.join(root, '.claude', 'hooks', 'statusline.cjs'));
    fs.writeFileSync(path.join(root, '.claude', 'feature-roadmap.json'),
      JSON.stringify({ version: '1.0', features }));
    let code = 0;
    let out = '';
    try {
      out = execFileSync(process.execPath, [path.join(root, '.claude', 'hooks', 'statusline.cjs')],
        { cwd: root, env: Object.assign({}, process.env, { CLAUDE_PROJECT_DIR: root }),
          encoding: 'utf8', stdio: 'pipe' }) || '';
    } catch (err) {
      code = err.status == null ? 1 : err.status;
      out = err.stdout ? err.stdout.toString() : '';
    }
    const text = out.replace(STRIP, '');
    return { code, line: text.split('\n').find((l) => l.includes('Roadmap')) || '' };
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
}

describe('feature-roadmap.json has ONE schema, and the reader says when a file misses it', () => {
  test('P1 — next.md declares itself canonical and closes the priority set', () => {
    const src = read(NEXT);
    assert.match(src, /\*\*This table is THE schema for `\.claude\/feature-roadmap\.json`\.\*\*/,
      'the schema must claim the role explicitly, or a second document can claim it too');
    assert.match(src, /any other\s+document that shows the file's fields must point here/,
      'and say what other documents must do instead of restating it');
    assert.match(src, /`priority` is a CLOSED set — `mvp`, `high`, `medium`, `low`/,
      'the enum must be stated as closed, in the canonical place');
  });

  test('P2 — feature-suggestions.md points at the schema instead of restating one', () => {
    const src = read(SUGGESTIONS);
    assert.match(src, /follow `\.claude\/commands\/next\.md`, which holds the single schema/,
      'the second document must defer, not describe');
    // Cross-family QE: the first version was `!A || B`, which the new "single data file" phrase
    // makes true whether or not the stale claim survives. The claim's ABSENCE is the property —
    // but SCOPED: a later CLAUDE.md snippet in this same file calls the roadmap the source of truth
    // for feature STATUS, which is both true and unrelated. Asserting over the whole file would have
    // forbidden a correct sentence. The claim that mattered was the architecture line at the top.
    const header = src.slice(0, src.indexOf('## 2.'));
    assert.ok(!/single source of truth/.test(header),
      'the schema-level claim must be gone from the architecture line, not merely accompanied');
    assert.match(header, /single data file/, 'replaced by what it actually is');
    // Its own JSON sketch must not teach the incompatible shape either: an example is what a
    // generator copies, and an example without `priority` is a second schema in disguise.
    const sketch = src.slice(src.indexOf('"features": ['), src.indexOf('```', src.indexOf('"features": [')));
    assert.match(sketch, /"priority": "mvp\|high\|medium\|low"/,
      'the example must carry the canonical priority field: ' + sketch.slice(0, 200));
  });

  test('P3 — one place answers who creates the file, for BOTH modes', () => {
    // The report called this a contradiction. It is not: feature.md's claim is scoped to Mode 2.
    // What was missing is a single answer, so a reader landing on one half does not conclude the
    // other is wrong.
    const src = read(NEXT);
    assert.match(src, /Who creates the file/, 'the question must be answered where the schema lives');
    assert.match(src, /Phase 3 generates it from the PRD MVP scope/, 'the /replicate half');
    assert.match(src, /the user\s+writes it by hand/, 'and the Mode 2 half');
  });

  test('P4 — a priority outside the enum is MARKED, not silently zero', () => {
    const r = roadmapLine([
      { id: 'a', status: 'next', priority: 'critical' },
      { id: 'b', status: 'done', priority: 'critical' },
    ]);
    assert.equal(r.code, 0, 'the status line must never fail the session');
    assert.match(r.line, /⚠2 schema/,
      'an unreadable roadmap must say so, and say HOW MUCH: ' + r.line);
    // Cross-family QE: the first version replaced the count with '?', discarding what WAS
    // established. The known count is still knowledge; show both.
    assert.match(r.line, /mvp 0\/0 ⚠2/,
      'the known count must survive beside the warning: ' + r.line);
  });

  test('P5 — MVP moved into tags, no priority at all: also MARKED', () => {
    // The exact shape the field report was collected on.
    const r = roadmapLine([
      { id: 'a', status: 'next', tags: ['mvp'] },
      { id: 'b', status: 'next', tags: ['mvp'] },
    ]);
    assert.equal(r.code, 0, 'the status line must never fail the session');
    assert.match(r.line, /mvp 0\/0 ⚠2 schema/,
      'a roadmap with no priority field at all must be marked, with its count: ' + r.line);
  });

  test('P8 — PARTIAL population is caught: one valid priority beside a broken sibling', () => {
    // Cross-family QE named this false negative exactly: the first detector only inspected features
    // that already HAD a string priority, so a valid entry standing next to a missing or non-string
    // one passed silently — and a half-migrated roadmap is the most likely real one.
    const r = roadmapLine([
      { id: 'a', status: 'done', priority: 'mvp' },
      { id: 'b', status: 'next' },                     // missing entirely
      { id: 'c', status: 'next', priority: 3 },        // present, not a string
    ]);
    assert.equal(r.code, 0);
    assert.match(r.line, /⚠2 schema/,
      'both broken siblings must be counted, not hidden by the valid one: ' + r.line);
    assert.match(r.line, /mvp 1\/1/,
      'and what IS known must still be reported: ' + r.line);
  });

  test('P6 — a valid roadmap renders exactly as before, with no marker', () => {
    // The guard on over-marking: a rule that fires on good input is worse than no rule.
    const r = roadmapLine([
      { id: 'a', status: 'done', priority: 'mvp' },
      { id: 'b', status: 'next', priority: 'mvp' },
      { id: 'c', status: 'next', priority: 'low' },
    ]);
    assert.equal(r.code, 0);
    assert.match(r.line, /mvp 1\/2/, 'the real counts must still render: ' + r.line);
    assert.doesNotMatch(r.line, /schema/, 'and no marker on a conforming file: ' + r.line);

    // An EMPTY roadmap has nothing to be off-schema about; marking it would be a false alarm in the
    // most common state of a fresh project.
    const empty = roadmapLine([]);
    assert.equal(empty.code, 0);
    assert.doesNotMatch(empty.line, /schema/, 'an empty roadmap must not be marked: ' + empty.line);
  });

  test('P7 — every case exits 0: the marker informs, it never blocks', () => {
    for (const features of [
      [{ id: 'a', status: 'next', priority: 'critical' }],
      [{ id: 'a', status: 'next', tags: ['mvp'] }],
      [{ id: 'a', status: 'next', priority: 'mvp' }],
      [],
    ]) {
      const r = roadmapLine(features);
      assert.equal(r.code, 0,
        'the status line is advisory and must stay non-blocking: ' + JSON.stringify(features));
      // Cross-family QE: exit 0 alone is satisfied by a program that prints nothing at all. The
      // line must actually be rendered in every case.
      assert.notEqual(r.line, '',
        'and must still RENDER a roadmap line: ' + JSON.stringify(features));
    }
  });
});

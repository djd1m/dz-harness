'use strict';

// The status line answered TWO questions with ONE anchor, so it told half the truth from every
// directory. MEASURED before the fix, with the toolkit at a course root and a 13-feature roadmap one
// level down in projects/01-app:
//
//   from the course root:  "Roadmap — no roadmap yet"   Toolkit Skills 10/10, Hooks 6/6
//   from projects/01-app:  "Roadmap Done 0/13"          Toolkit Skills 0/10, Hooks 0/6, Settings missing
//
// WHERE THE INSTRUMENTS ARE is settled by the hook's own location and is correct from any cwd.
// WHICH PROJECT'S ROADMAP TO SHOW is a different question, answered by surveying projects/*.
//
// The report also proposed walking UPWARD to find the project. Measured: the roadmap lies BELOW, so
// an upward walk returns the same root and the line does not change — the remedy does not treat its
// own symptom. Not implemented; the backlog item orders it third.
//
// These tests run the REAL hook as a real subprocess and read its REAL rendered output.

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const PKG_DIR = path.resolve(__dirname, '..', '..');
const TPL = path.join(PKG_DIR, 'templates', '.claude');
const HOOK_SRC = path.join(TPL, 'hooks', 'statusline.cjs');

function writeRoadmap(dotClaudeDir, spec) {
  const total = spec.total;
  const done = spec.done || 0;
  const mvp = spec.mvp || 0;
  const features = [];
  for (let i = 0; i < total; i++) {
    features.push({
      id: 'f' + i,
      status: i < done ? 'done' : 'next',
      // 'priority' is the package's own documented key — commands/next.md:66 — NOT 'tags'. The field
      // report claimed the reader was wrong here; measuring the schema refuted that, and rewriting
      // the reader toward 'tags' would break the documented contract. Filed separately: 4ca0970c.
      // 'low', not 'later': the priority set is CLOSED (mvp|high|medium|low) and this fixture
      // used a value in no enum — an off-schema roadmap of my own making, which the schema
      // marker correctly flagged the moment it existed.
      priority: i < mvp ? 'mvp' : 'low',
    });
  }
  fs.writeFileSync(path.join(dotClaudeDir, 'feature-roadmap.json'),
    JSON.stringify({ version: '1.0', features }));
}

/** A course-shaped fixture: the toolkit at the root, sub-projects below. */
function course(opts) {
  const o = opts || {};
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'p-rep-2roots-')));
  fs.mkdirSync(path.join(root, '.claude', 'hooks'), { recursive: true });
  fs.copyFileSync(HOOK_SRC, path.join(root, '.claude', 'hooks', 'statusline.cjs'));
  if (o.toolkit !== false) {
    for (let i = 1; i <= 10; i++) {
      fs.mkdirSync(path.join(root, '.claude', 'skills', 's' + i), { recursive: true });
    }
    fs.copyFileSync(path.join(TPL, 'settings.json'), path.join(root, '.claude', 'settings.json'));
  }
  if (o.rootRoadmap) writeRoadmap(path.join(root, '.claude'), o.rootRoadmap);
  for (const [name, spec] of Object.entries(o.subs || {})) {
    const dir = path.join(root, 'projects', name, '.claude');
    fs.mkdirSync(dir, { recursive: true });
    if (spec === 'malformed') fs.writeFileSync(path.join(dir, 'feature-roadmap.json'), '{not json');
    else writeRoadmap(dir, spec);
  }
  return root;
}

const STRIP = new RegExp('\\x1b\\[[0-9;]*m', 'g');

/** Run the hook from `cwd`, with the host naming `projectRoot`. Returns plain text. */
function render(root, opts) {
  const o = opts || {};
  const cwd = o.cwd || root;
  const env = Object.assign({}, process.env, { CLAUDE_PROJECT_DIR: o.projectRoot || root });
  try {
    const out = execFileSync(process.execPath,
      [path.join(root, '.claude', 'hooks', 'statusline.cjs')],
      { cwd, env, encoding: 'utf8', stdio: 'pipe' });
    return { code: 0, text: (out || '').replace(STRIP, '') };
  } catch (err) {
    return { code: err.status == null ? 1 : err.status,
      text: (err.stdout ? err.stdout.toString() : '').replace(STRIP, '') };
  }
}

const line = (text, marker) => (text.split('\n').find((l) => l.includes(marker)) || '');
const cleanup = (d) => fs.rmSync(d, { recursive: true, force: true });

describe('the status line answers two questions with two anchors (PR-011)', () => {
  test('P1 — from a subdirectory, the toolkit counts are the ROOT\'s, not zeros', () => {
    const root = course({ subs: { '01-app': { total: 13 } } });
    try {
      const r = render(root, { cwd: path.join(root, 'projects', '01-app') });
      const toolkit = line(r.text, 'Toolkit');
      assert.match(toolkit, /Skills\s+.?10\/10/,
        'the toolkit lives at the root and must be counted there from any cwd: ' + toolkit);
      // Derived, not typed: the expected total is whatever the package registers, so adding a hook
      // moves this with it instead of turning it red for a correct reason.
      const expectedHooks = Object.keys(
        require(path.join(PKG_DIR, 'src', 'utils.js')).COMPONENTS.hooks.items).length;
      assert.match(toolkit, new RegExp('Hooks\\s+.?1\\/' + expectedHooks),
        'and the hook count too — the fixture ships exactly one hook: ' + toolkit);
      // Cross-family QE: `line()` returns '' when the segment is absent, and '' trivially satisfies
      // doesNotMatch — so dropping the Settings segment entirely would have passed. Presence first.
      const settings = line(r.text, 'Settings');
      assert.notEqual(settings, '', 'the Settings segment must be rendered at all');
      assert.doesNotMatch(settings, /missing/,
        'settings.json is at the root; reporting it missing from a subdirectory is the old defect');
    } finally { cleanup(root); }
  });

  test('P2 — root has no roadmap, a sub-project has 13: the line reports those 13', () => {
    // The exact measured symptom: "no roadmap yet" while thirteen features sat one level down.
    const root = course({ subs: { '01-app': { total: 13, done: 4 } } });
    try {
      const roadmap = line(render(root).text, 'Roadmap');
      assert.doesNotMatch(roadmap, /no roadmap yet/,
        'a roadmap exists one level down; claiming none is the defect: ' + roadmap);
      assert.match(roadmap, /4\/13/, 'the sub-project figures must appear: ' + roadmap);
    } finally { cleanup(root); }
  });

  test('P3 — sub-project figures are LABELLED as theirs, never presented as the root\'s own', () => {
    // A number that means something other than it appears to is worse than a missing number.
    const root = course({ subs: { '01-app': { total: 13, done: 4 } } });
    try {
      const roadmap = line(render(root).text, 'Roadmap');
      assert.match(roadmap, /in\s+01-app/,
        'the line must say WHERE the figures come from: ' + roadmap);
      assert.doesNotMatch(roadmap, /mvp/,
        'the root has no roadmap, so it has no mvp counter to report: ' + roadmap);
    } finally { cleanup(root); }
  });

  test('P4 — when the root HAS its own roadmap, the primary counters are the root\'s', () => {
    const root = course({
      rootRoadmap: { total: 5, done: 2, mvp: 3 },
      subs: { '01-app': { total: 13, done: 4 } },
    });
    try {
      const roadmap = line(render(root).text, 'Roadmap');
      assert.match(roadmap, /Done\s+2\/5/,
        'the root\'s own 2/5 must be the headline, not the sub-project\'s 4/13: ' + roadmap);
      // 2/3, not 0/3: the fixture's first two features are both done AND mvp. The code was right
      // and the first version of this expectation was wrong.
      assert.match(roadmap, /mvp\s+2\/3/, 'and its own mvp counter: ' + roadmap);
      // Sub-projects are still surfaced — as a separate, labelled segment. Merging them into
      // "Done x/y" would silently change what that fraction means.
      assert.match(roadmap, /\+1 sub\s+13/,
        'sub-projects must appear as their own segment: ' + roadmap);
      assert.doesNotMatch(roadmap, /Done\s+6\/18/,
        'totals must NOT be merged into the root\'s counters: ' + roadmap);
    } finally { cleanup(root); }
  });

  test('P8 — several sub-projects, arbitrary names: the aggregate and the count are real', () => {
    // Cross-family QE: every fixture was named '01-app', so the "N projects" branch had never been
    // rendered and a survey that only recognised that one name would have passed the whole suite.
    const root = course({ subs: { 'zeta-svc': { total: 4, done: 1 }, 'alpha-web': { total: 6, done: 2 } } });
    try {
      const roadmap = line(render(root).text, 'Roadmap');
      assert.match(roadmap, /in\s+2 projects/,
        'more than one sub-project must be reported as a count, not as one name: ' + roadmap);
      assert.match(roadmap, /3\/10/,
        'and the aggregate must be the real sum of both, 1+2 of 4+6: ' + roadmap);
    } finally { cleanup(root); }
  });

  test('P9 — the survey is BOUNDED: it runs on every prompt', () => {
    // An unbounded scan adds its cost to every keystroke. 40 entries against a limit of 24.
    const subs = {};
    for (let i = 0; i < 40; i++) subs['p' + String(i).padStart(2, '0')] = { total: 1 };
    const root = course({ subs });
    try {
      const r = render(root);
      assert.equal(r.code, 0, 'the status line must never fail the session');
      const roadmap = line(r.text, 'Roadmap');
      assert.match(roadmap, /in\s+24 projects/,
        'the scan must stop at its stated limit rather than walking all 40: ' + roadmap);
    } finally { cleanup(root); }
  });

  test('P5 — no roadmap anywhere: the legacy line is untouched', () => {
    const root = course({});
    try {
      assert.match(line(render(root).text, 'Roadmap'),
        /no roadmap yet \(run \/next or \/replicate\)/,
        'the empty case must stay byte-identical — this feature adds a survey, it does not '
        + 'rewrite the line everyone already knows');
    } finally { cleanup(root); }
  });

  test('P6 — a file named projects/x and a malformed roadmap are skipped, never thrown on', () => {
    const root = course({ subs: { '01-app': { total: 3 }, '02-bad': 'malformed' } });
    try {
      fs.writeFileSync(path.join(root, 'projects', 'notadir'), 'x');
      const r = render(root);
      assert.equal(r.code, 0, 'the status line must never fail the session');
      const roadmap = line(r.text, 'Roadmap');
      assert.match(roadmap, /0\/3/,
        'the good sub-project still counts; the bad ones are skipped: ' + roadmap);
    } finally { cleanup(root); }
  });

  test('P7 — the toolkit questions name TOOLKIT_ROOT, not a cwd expression', () => {
    // Guards the split itself: re-point either reader at a cwd and this goes red. Comments are
    // stripped first — a mention in prose is not a use in code.
    // Line-wise, not regex-wise: a /\*...\*/ stripper over this file removed 12 158 of its 18 153
    // characters and lost every function name, so the assertions below would have been searching an
    // empty string. Dropping comment LINES is boring, and it is right. A trailing same-line comment
    // survives, which cannot realistically fake a whole path.join expression.
    const src = fs.readFileSync(HOOK_SRC, 'utf-8').split('\n')
      .filter((l) => !/^\s*(\/\/|\/\*|\*)/.test(l)).join('\n');
    assert.doesNotMatch(src, /process\.cwd\(\)/, 'the anchor must not come from the drifting cwd');
    const toolkit = src.slice(src.indexOf('function parseToolkit'),
      src.indexOf('function parseExpectedToolkit'));
    assert.match(toolkit, /TOOLKIT_ROOT/,
      'parseToolkit must name the root it means, so re-pointing it is a visible change');
    const settingsAt = src.indexOf('function parseSettingsStatus');
    assert.match(src.slice(settingsAt, settingsAt + 400), /TOOLKIT_ROOT/,
      'and so must parseSettingsStatus');
    assert.match(src, /function parseSubProjects/,
      'the survey is what replaces guessing which project is meant');
    // Cross-family QE: a defined-but-never-called function satisfies the line above. The behavioural
    // tests are the real proof; this makes the dead-code case red here too.
    assert.ok(src.split('parseSubProjects').length - 1 >= 2,
      'parseSubProjects must be CALLED, not merely defined');
    assert.match(src, /SUB_SCAN_LIMIT/,
      'the survey must carry its own bound — it renders on every prompt');
  });
});

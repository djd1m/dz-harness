'use strict';

// Two shipped documents promised something the hook does not do — and, as written, CANNOT do.
//
// `myinsights.md` said insights are injected "when their tags match the current task". The hook
// runs on SessionStart, BEFORE the user has said anything, so there is no current task to match
// tags against. MEASURED: `session-insights.cjs:33` is `sections.slice(-3)` — the last three by
// file order, and no tag matching exists anywhere in the package.
//
// The hook's own printed heading, "Recent project insights", was already honest. Only the documents
// around it were not.
//
// This test exists because a promise removed from prose comes back. It pins the CODE and the DOC to
// each other: if selection ever becomes relevance-based, this test is where the doc must change too.

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const TPL = path.join(__dirname, '..', '..', 'templates', '.claude');
const CMD = path.join(TPL, 'commands', 'myinsights.md');
const HOOK = path.join(TPL, 'hooks', 'session-insights.cjs');

const read = (f) => fs.readFileSync(f, 'utf-8');
/** Prose with code fences and comments removed — a MENTION of a claim is not the claim. */
const prose = (src) => src.replace(/^```[\s\S]*?^```/gm, '');

describe('the insights documents describe the hook that exists', () => {
  test('P1 - no document claims tag matching or relevance at SessionStart', () => {
    const doc = prose(read(CMD));
    for (const lie of [
      /Auto-injected into context on SessionStart for relevant tasks/,
      /when their tags match the current task/,
    ]) {
      assert.ok(!lie.test(doc),
        'a removed promise came back: ' + lie + '\n' + doc.slice(0, 200));
    }
  });

  test('P2 - the document states what the hook actually selects', () => {
    const doc = read(CMD);
    assert.match(doc, /three most recent/i, 'the real selection must be named');
    assert.match(doc, /by their\s*\n?order in the file/i, 'and how it is ordered');
    assert.match(doc, /There is no tag matching, and it is not an omission/,
      'and WHY there is none, or a future reader files it as a bug');
    assert.match(doc, /BEFORE you have said anything/,
      'the reason must be the timing, which is the load-bearing fact');
  });

  test('P3 - the code and the doc agree, asserted against the CODE', () => {
    // Pinning only the prose would let the hook change underneath it. This reads the hook.
    const hook = read(HOOK);
    assert.match(hook, /sections\.slice\(-3\)/,
      'if selection changed, myinsights.md must change with it — that is what this test is for');
    assert.ok(!/tag/i.test(hook.replace(/^\s*(\/\/|\*).*$/gm, '')),
      'no tag matching exists in the hook; if it appears, the doc may say so');
    assert.match(hook, /Recent project insights/,
      'the printed heading is the honest one and should stay');
  });

  test('P4 - the consequence of last-three is stated, not left to be discovered', () => {
    // The file is append-only and the hook takes the last three, so a long-lived project stops
    // seeing its earlier entries. insights-capture.md plans for 50+.
    const doc = read(CMD);
    assert.match(doc, /append-only/, 'the growth behaviour must be named');
    assert.match(doc, /earlier ones stop being injected/,
      'and its consequence, in plain words');
    const rule = read(path.join(TPL, 'rules', 'insights-capture.md'));
    assert.match(rule, /50 entries|> 50/,
      'the rule really does plan for a size the hook cannot show — that is the point');
  });

  test('P5 - the /harvest link is described as an intention, not a wired path', () => {
    // MEASURED: `grep -ci insight` over harvest.md returns 0. The command promised harvest
    // "extracts reusable patterns from insights", which nothing does.
    const doc = read(CMD);
    assert.match(doc, /does\s*\n?\s*NOT read `\.claude\/insights\/index\.md` today/,
      'the unwired link must be admitted where it is claimed');
    const harvest = read(path.join(TPL, 'commands', 'harvest.md'));
    assert.equal((harvest.match(/insight/gi) || []).length, 0,
      'if harvest ever DOES read insights, this admission must be removed — that is the trigger');
  });
});

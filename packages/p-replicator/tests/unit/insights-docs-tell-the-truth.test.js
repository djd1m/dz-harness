'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const TPL = path.join(__dirname, '..', '..', 'templates', '.claude');
const PKG = path.join(__dirname, '..', '..');
const CMD = path.join(TPL, 'commands', 'myinsights.md');
const HOOK = path.join(TPL, 'hooks', 'session-insights.cjs');
const RULE = path.join(TPL, 'rules', 'insights-capture.md');
const HARVEST = path.join(TPL, 'commands', 'harvest.md');
const README = path.join(PKG, 'README.md');
const API_EN = path.join(PKG, 'README', 'eng', '04_api_reference.md');
const API_RU = path.join(PKG, 'README', 'ru', '04_api_reference.md');

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
    assert.match(doc, /UserPromptSubmit/, 'selection must occur after the real prompt exists');
    assert.match(doc, /successful,? non-empty.*dz recall/is,
      'the value-armed recall condition must be named');
    assert.match(doc, /falls back.*three most recent/is,
      'the local last-three fallback must remain visible');
    assert.match(doc, /only.*suppresses.*local/is,
      'binary presence alone must not read as readiness');
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
    const doc = read(CMD);
    assert.match(doc, /append-only/, 'the growth behaviour must be named');
    assert.match(doc, /fallback.*earlier ones stop being injected/is,
      'and its consequence, in plain words');
    const rule = read(RULE);
    assert.match(rule, /50 entries|> 50/,
      'the rule really does plan for a size the hook cannot show — that is the point');
  });

  test('P5 - /harvest and /myinsights name their executable shared-carrier contract', () => {
    const doc = read(CMD);
    const harvest = read(HARVEST);
    assert.doesNotMatch(doc, /does\s*\n?\s*NOT read `\.claude\/insights\/index\.md` today/,
      'the old unwired admission became false once harvest acquired a writer');
    assert.match(doc, /share the same Markdown carrier/i,
      'manual and harvest capture must be described as one carrier, not two stores');
    assert.match(harvest, /REQUIRED INSIGHT PERSISTENCE GATE/,
      'the relationship must be executable wiring, not a prose aspiration');
    assert.match(harvest, /\.claude\/hooks\/write-insight\.cjs/,
      'the shipped writer boundary must be named exactly');
    assert.match(harvest, /\.claude\/insights\/index\.md/,
      'the command and /myinsights must converge on the same Markdown source of truth');
    assert.match(harvest, /Only `created`, `appended`, or `duplicate`/,
      'normal completion must be bound to the three canonical writer receipts');
    assert.match(harvest, /writer exits non-zero.*MUST NOT\s+report.*completed/is,
      'an unestablished write must remain a blocking harvest outcome');
  });

  test('P6 - docs describe prompt-time armed recall and Markdown authority', () => {
    const hook = read(HOOK);
    assert.match(hook, /recall\.kind === 'ok'/,
      'the docs cannot claim armed recall without the production predicate');
    assert.doesNotMatch(hook, /command\s+-v\s+dz/,
      'binary discovery must not become the suppression condition');

    const docs = [read(CMD), read(RULE), read(HARVEST), read(README), read(API_EN), read(API_RU)];
    for (const [index, doc] of docs.entries()) {
      assert.match(doc, /Markdown/i, `behavior document ${index + 1} omits Markdown authority`);
      assert.match(doc, /best-effort/i, `behavior document ${index + 1} omits optional teach`);
    }
    for (const doc of [docs[0], docs[1], docs[3], docs[4], docs[5]]) {
      assert.match(doc, /UserPromptSubmit/, 'prompt-time delivery must be named');
      assert.match(doc, /(?:non-empty|непуст(?:ой|ого)).*(?:recall|вывод)/is,
        'successful non-empty output must be the documented arming condition');
      assert.match(doc, /(?:local|локальн).*(?:fallback|фолб[эе]к)/is,
        'absent/failing/empty recall must retain local delivery');
    }
  });
});

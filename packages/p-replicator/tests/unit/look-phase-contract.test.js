'use strict';

// Phase 0.5 (Source Product Profile) is a SECTION IN MARKDOWN that a model reads and executes —
// there is no deterministic phase engine in this package. So the deterministic layer available for
// the phase itself is the CONTENT of the three files that declare the sequence, and its ORDER.
//
// Why order is an assertion and not decoration: the phase's whole justification is WHERE it sits.
// Phase 0 is skipped entirely by the `--from-docs` entry, so a look-capture placed inside Phase 0
// would switch itself off for exactly the projects that arrive with someone else's documentation —
// which are, more often than not, replications of someone else's product. Move the section back
// inside Phase 0 and this file goes red; that is the point.
//
// The sequence is declared in THREE places and they must agree. Every assertion below is
// DISCRIMINATING: remove what it names and it goes red.

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const TPL = path.join(__dirname, '..', '..', 'templates', '.claude');
const read = (...p) => fs.readFileSync(path.join(TPL, ...p), 'utf-8');

const CMD = read('commands', 'replicate.md');
const RULE = read('rules', 'replicate-pipeline.md');
const AGENT = read('agents', 'replicate-coordinator.md');
const CJM = read('skills', 'reverse-engineering-unicorn', 'modules', '025-cjm-prototype.md');

const PROFILE_PATH = 'docs/source-product-profile.md';
const CHECKER = 'check-look-trace.cjs';
const CAPTURE = 'capture-source-path.cjs';
/** The reasons a NAMED source may go uncaptured. Closed, because each names a DIFFERENT fix.
 *  The last four arrived with the browser instrument for the `путь` axis. */
const REASONS = ['no-browser-mcp', 'unreachable', 'auth-required', 'out-of-scope',
  'no-browser', 'bot-protected', 'timeout', 'robots-disallowed'];

describe('Phase 0.5 is pinned where it must live, in all three places that declare the sequence', () => {
  test('P1 - ORDER: the Phase 0.5 section sits between the Phase 0 checkpoint and Phase 1', () => {
    // The first of three independent ways this file goes red when the phase is switched off.
    const checkpoint0 = CMD.indexOf('✅ PHASE 0: PRODUCT DISCOVERY');
    const phase05 = CMD.indexOf('### Phase 0.5: SOURCE PRODUCT PROFILE');
    const phase1 = CMD.indexOf('### Phase 1: PLANNING');

    assert.ok(checkpoint0 > 0, 'replicate.md must still carry the Phase 0 checkpoint');
    assert.ok(phase1 > 0, 'replicate.md must still carry Phase 1');
    assert.ok(phase05 > 0, 'replicate.md must carry a Phase 0.5 section heading');
    assert.ok(phase05 > checkpoint0,
      'Phase 0.5 must come AFTER the Phase 0 checkpoint — placed before it, it would be part of '
      + 'the optional phase and would vanish with it');
    assert.ok(phase05 < phase1,
      'Phase 0.5 must come BEFORE Phase 1 — Phase 1 promotes its FR-LOOK rows, so a phase running '
      + 'after Phase 1 would have nothing to promote into');
  });

  test('P2 - the phase is MANDATORY and explicitly survives --from-docs', () => {
    // The second independent way. This is the whole reason the phase is separate; a Phase 0.5 that
    // the alternative entry also skipped would be the defect wearing the fix's clothes.
    const head = CMD.slice(CMD.indexOf('### Phase 0.5'), CMD.indexOf('### Phase 1: PLANNING'));
    assert.match(head, /обязательная|ВСЕГДА/,
      'the section heading/lead must say the phase always runs');
    assert.match(head, /--from-docs|--skip-discovery/,
      'and it must name the entry that skips Phase 0, so the reader knows what it survives');

    // And the alternative-entry section itself must say so, because a reader who lands there is
    // reading the list of what runs and what does not.
    const alt = CMD.slice(CMD.indexOf('### Modified pipeline flow when triggered'),
      CMD.indexOf('### Three sub-paths'));
    assert.ok(alt.length > 0, 'replicate.md must still carry the modified-flow list');
    assert.match(alt, /\*\*Phase 0\.5\*\*/, 'the modified-flow list must name Phase 0.5');
    assert.match(alt, /RUNS/,
      'and must say it RUNS — a list that names the phase without saying so reads as a skip');

    const altRule = RULE.slice(RULE.indexOf('### Behavior'), RULE.indexOf('### Three supported sub-paths'));
    assert.ok(altRule.length > 0, 'the rule must still carry the alternative-entry behaviour list');
    assert.match(altRule, /Phase 0\.5 STILL RUNS/i,
      'the rule\'s behaviour list must say Phase 0.5 still runs on the --from-docs entry');
  });

  test('P3 - THREE PLACES agree on the sequence: command, rule, coordinator agent', () => {
    // The third independent way. These three declare the phase order; a change to one alone is a
    // second-generation lie — the pipeline documented as doing something two of its own files
    // never mention.
    assert.match(CMD, /Phase 0\.5/, 'replicate.md must declare Phase 0.5');
    assert.match(RULE, /Phase 0\.5/, 'replicate-pipeline.md must declare Phase 0.5');
    assert.match(AGENT, /Phase 0\.5|0\.5/, 'replicate-coordinator.md must declare Phase 0.5');

    // The rule's own sequence diagram, not merely a mention somewhere in the file.
    const seq = RULE.slice(RULE.indexOf('## Phase Sequence'), RULE.indexOf('## Skill Loading Protocol'));
    assert.match(seq, /Phase 0\.5/, 'the Phase Sequence block itself must contain Phase 0.5');
    assert.match(seq, /always|ALWAYS|всегда/,
      'and must mark it as the one that always runs, next to the optional Phase 0');

    // The coordinator's own numbered sequence.
    assert.match(AGENT, /0\s*→\s*0\.5\s*→\s*1\s*→\s*2\s*→\s*3\s*→\s*4/,
      'the coordinator must carry the full ordered sequence including 0.5');

    // All three must name the SAME artifact, or "the profile" means three different files.
    for (const [name, text] of [['replicate.md', CMD], ['replicate-pipeline.md', RULE],
      ['replicate-coordinator.md', AGENT]]) {
      assert.ok(text.includes(PROFILE_PATH), name + ' must name ' + PROFILE_PATH);
    }
  });

  test('P4 - THREE outcomes are declared, and the third is the one with a closed reason list', () => {
    const head = CMD.slice(CMD.indexOf('### Phase 0.5'), CMD.indexOf('### Phase 1: PLANNING'));
    for (const outcome of ['СНЯТ', 'НЕ ИЗМЕРЕНО', 'ИСТОЧНИКА НЕТ']) {
      assert.ok(head.includes(outcome), 'the phase must declare the outcome ' + outcome);
    }
    for (const reason of REASONS) {
      assert.ok(head.includes(reason),
        'the closed reason list must be spelled out in the phase: missing ' + reason);
    }
    // Two outcomes would be the defect: "captured" and "not captured" collapses "we looked and there
    // is nothing to look at" into "we could not look".
    assert.match(head, /ТРИ исхода|три исхода/,
      'the phase must say there are THREE outcomes, not two');
  });

  test('P5 - the phase carries its own deterministic gate with three exit codes', () => {
    const head = CMD.slice(CMD.indexOf('### Phase 0.5'), CMD.indexOf('### Phase 1: PLANNING'));
    assert.ok(head.includes(CHECKER), 'the phase must name its checker: ' + CHECKER);
    assert.match(head, /проверка НЕ выполнена|НЕ выполнена/,
      'exit 2 must be described as "the check did not run", never as a pass');
    assert.ok(fs.existsSync(path.join(TPL, 'hooks', CHECKER)),
      'and the checker the text names must actually ship');
  });

  test('P6 - Phase 1 is told to promote FR-LOOK rows, or the seed has no destination', () => {
    const phase1 = CMD.slice(CMD.indexOf('### Phase 1: PLANNING'),
      CMD.indexOf('### Прерванный прогон'));
    assert.match(phase1, /FR-LOOK/, 'Phase 1 must name the FR-LOOK family it promotes');
    assert.match(phase1, /Specification\.md/, 'and the file it promotes them into');
    assert.match(phase1, /FR-GROWTH/,
      'both seed families are promoted by the same step — naming only one invites a second dialect');
  });

  test('P7 - the industry palette is a FALLBACK, not an equal branch', () => {
    // The defect this feature removes: a pipeline whose job is to reproduce a product invented its
    // palette from the industry. The table stays — it is the right answer when there is no source —
    // but it must be reachable only through the "no source / not measured" states.
    const table = CJM.indexOf('| Health/Fitness | Emerald/Teal');
    assert.ok(table > 0, 'the industry table must still exist — it is the legitimate fallback');

    const precedence = CJM.indexOf('Порядок приоритета');
    assert.ok(precedence > 0, 'a precedence block must exist above the table');
    assert.ok(precedence < table,
      'the precedence block must come BEFORE the table: a rule stated after the table is a rule the '
      + 'reader meets after already using it');

    const between = CJM.slice(precedence, table);
    assert.match(between, /СНЯТ/, 'the captured state must be named');
    assert.match(between, /НЕ ИЗМЕРЕН/, 'the not-measured state must be named');
    assert.match(between, /ФОЛБЭК|фолбэк/, 'the table must be labelled a fallback');

    // The table's own caption must carry the condition, because a reader who jumps to the table
    // sees the caption and nothing above it.
    const caption = CJM.slice(CJM.lastIndexOf('**Design адаптация', table), table);
    assert.match(caption, /ФОЛБЭК/,
      'the table caption itself must say it is the fallback, not only the paragraph above it');
  });

  test('P8 - the capture skill is CALLED, never vendored into this package', () => {
    // ADR-0001 + sources.json: clone-website has one canonical home, in its own package. Vendoring
    // it here would add an eleventh skill to a contract pinned in four places.
    const shipped = fs.readdirSync(path.join(TPL, 'skills'));
    assert.ok(!shipped.includes('clone-website'),
      'clone-website must NOT be vendored into templates/.claude/skills/: ' + shipped.join(', '));
    assert.match(CMD, /skills-website-cloner/,
      'the phase must name the canonical package it calls');
    assert.match(RULE, /skills-website-cloner/,
      'and the rule must too, so the reference cannot drift to a copy');

    // Its absence must be a legitimate outcome, not a blocked pipeline.
    const head = CMD.slice(CMD.indexOf('### Phase 0.5'), CMD.indexOf('### Phase 1: PLANNING'));
    assert.match(head, /no-browser-mcp/,
      'an unmet prerequisite must map to a named reason, not to a stalled run');
  });

  test('P10 - the `путь` axis has an INSTRUMENT, and both files name it', () => {
    // The axis existed as a column from the first day of Phase 0.5; nothing could fill it. A column
    // with no instrument is a promise the pipeline cannot keep, and it would quietly stay empty
    // forever — which reads exactly like "this product has no path requirements".
    assert.ok(fs.existsSync(path.join(TPL, 'hooks', CAPTURE)), 'the instrument must ship: ' + CAPTURE);
    const head = CMD.slice(CMD.indexOf('### Phase 0.5'), CMD.indexOf('### Phase 1: PLANNING'));
    assert.ok(head.includes(CAPTURE), 'the phase must name the instrument of its second axis');
    assert.ok(RULE.includes(CAPTURE), 'and the rule must too, or the two describe different phases');

    // Both axes must answer for themselves. One shared status would have to lie about one of them.
    assert.match(head, /Статус съёмки \(путь\)/,
      'the phase must carry the second axis\'s own status line');
    assert.match(RULE, /Статус съёмки \(путь\)/, 'and so must the rule');

    // The instrument is a PRECONDITION, not a dependency: the package ships zero of those.
    const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'package.json'), 'utf-8'));
    assert.equal(pkg.dependencies, undefined,
      'Playwright is an EXTERNAL prerequisite; putting it in dependencies would end the '
      + 'zero-dependency contract for a utility that honestly works without it');
    assert.match(head + RULE, /no-browser/,
      'and its absence must map to a named reason, not to a stalled run');
  });

  test('P11 - the legality boundary lives in the RULE, not only in a report', () => {
    // A boundary stated only where the finished work is described is a boundary nobody reads BEFORE
    // crossing it. This one governs what may be captured at all, so it sits in the always-loaded
    // rule, next to the instrument that could cross it.
    const sec = RULE.slice(RULE.indexOf('### Phase 0.5'), RULE.indexOf('## Skill Loading Protocol'));
    assert.ok(sec.length > 0, 'the rule must still carry its Phase 0.5 section');
    assert.match(sec, /REGULARITIES|закономерн/i,
      'the rule must say that REGULARITIES are what gets captured');
    assert.match(sec, /VALUES|значени/i, 'and that VALUES are what does not');
    assert.match(sec, /copyright/i, 'third-party CSS/DOM as copyrighted code must be named');
    assert.match(sec, /trademark/i, 'the logo+name+colours-together trademark case must be named');
    assert.match(sec, /robots\.txt/, 'reading robots.txt before a crawl must be named');
    assert.match(sec, /FORBIDDEN|ЗАПРЕЩ/,
      'circumvention and authentication must be refused in words, not merely discouraged');
    assert.match(sec, /sx-ds2y8i|class names/i,
      'and the brittleness rule — never class names — must be stated where the instrument is');
  });

  test('P9 - the hook inventory in the rule matches what ships (the count is not decorative)', () => {
    const { COMPONENTS } = require(path.join(__dirname, '..', '..', 'src', 'utils.js'));
    const n = Object.keys(COMPONENTS.hooks.items).length;
    const m = RULE.match(/\*\*Hooks \((\d+) files/);
    assert.ok(m, 'replicate-pipeline.md must state the hook file count');
    assert.equal(Number(m[1]), n,
      'the rule advertises a hook count the package does not ship — the stale "8 files" line was '
      + 'exactly this defect, one generation earlier');
    assert.ok(RULE.includes(CHECKER),
      'and the new checker must be listed among the deliberately-invoked utilities');
  });
});

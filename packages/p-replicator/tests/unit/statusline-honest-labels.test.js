'use strict';

// Two ways the status line said something untrue, both reproduced before the fix.
//
// 1. The progress bar was built from done/total and captioned `mvp`, with `Done x/y` rendered
//    separately beside it — one glyph, two different quantities, read as one statement.
//
// 2. The domain regexes had no word boundaries, so ordinary sentences picked a domain:
//      "Run healthchecks before deploy"  → healthcare   (`health` inside `healthchecks`)
//      "We translate the UI"             → enterprise   (`sla` inside `tranSLAte`)
//      "A slack bot for standups"        → enterprise   (`sla` inside `SLAck`)
//      "Embankment mapping service"      → banking      (`bank` inside `emBANKment`)
//    All four expressions were affected.
//
// THE TRAP, and it is why P3/P4 exist: `\b` is not the fix. It is defined over \w = [A-Za-z0-9_], so
// there is no word boundary between a space and a Cyrillic letter — MEASURED, /\bбанк/.test('банк
// России') is FALSE. A reflex `\b` fix would have silently deleted every Russian term while looking
// correct in review. The boundaries are Unicode lookarounds with the `u` flag.

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const TPL = path.join(__dirname, '..', '..', 'templates', '.claude');
const HOOK = path.join(TPL, 'hooks', 'statusline.cjs');
const STRIP = new RegExp('\\x1b\\[[0-9;]*m', 'g');

/** Run the REAL hook over a project whose CLAUDE.md says `text`, return its plain output. */
function render(opts) {
  const o = opts || {};
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'p-rep-labels-')));
  try {
    fs.mkdirSync(path.join(root, '.claude', 'hooks'), { recursive: true });
    fs.copyFileSync(HOOK, path.join(root, '.claude', 'hooks', 'statusline.cjs'));
    if (o.claudeMd !== undefined) fs.writeFileSync(path.join(root, 'CLAUDE.md'), o.claudeMd);
    // The Domain segment lives INSIDE the Roadmap line, so a domain fixture needs a roadmap too —
    // without one the hook takes its "no roadmap yet" branch and never renders a domain at all.
    if (o.features === undefined && o.claudeMd !== undefined) {
      o.features = [{ id: 'a', status: 'next', priority: 'mvp' }];
    }
    if (o.features) {
      fs.writeFileSync(path.join(root, '.claude', 'feature-roadmap.json'),
        JSON.stringify({ version: '1.0', features: o.features }));
    }
    const r = spawnSync(process.execPath, [path.join(root, '.claude', 'hooks', 'statusline.cjs')],
      { cwd: root, env: Object.assign({}, process.env, { CLAUDE_PROJECT_DIR: root }),
        encoding: 'utf8' });
    return { code: r.status, text: (r.stdout || '').replace(STRIP, '') };
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
}

const domainOf = (text) => {
  const m = text.match(/Domain:\s*(\S+)/);
  return m ? m[1] : null;
};

/** The source of parseDomain, for the assertions that must look at the expressions themselves. */
function parseDomainSource() {
  const src = fs.readFileSync(HOOK, 'utf-8');
  const start = src.indexOf('function parseDomain');
  const end = src.indexOf('\nfunction ', start + 1);
  assert.ok(start > 0 && end > start, 'parseDomain must exist');
  return src.slice(start, end);
}

describe('the status line says what it means (PR-011, two small fixes)', () => {
  test('P1 — ordinary sentences no longer pick a domain', () => {
    // Each case is the EXACT sentence that produced the false positive, so a future edit that
    // half-fixes one term is visible rather than averaged away.
    const cases = [
      ['Run healthchecks before deploy', 'health inside healthchecks'],
      ['We translate the UI into three languages', 'sla inside translate'],
      ['A slack bot for standups', 'sla inside slack'],
      ['Embankment mapping service', 'bank inside embankment'],
      ['Translation memory service', 'sla again'],
      // Cross-family QE counter-examples: a left-only boundary was not enough for the Russian stems.
      ['Сервис организации банкетов под ключ', 'банк inside банкетов'],
      ['Финты в футболе: разбор техники', 'финт inside финты'],
      ['ЦБС городской библиотеки', 'цб inside ЦБС — a two-letter acronym cannot be made safe'],
      ['Video conversion service', 'bare conversion is not commerce'],
    ];
    for (const [text, why] of cases) {
      const r = render({ claudeMd: '# Project\n\n' + text + '\n' });
      assert.equal(r.code, 0, 'the status line must never fail the session');
      assert.equal(domainOf(r.text), null,
        'still matched (' + why + '): ' + JSON.stringify(text) + ' → ' + domainOf(r.text));
    }
  });

  test('P2 — real domains are still detected, Cyrillic stems included', () => {
    // The half a reflex `\b` fix would have deleted. Every Cyrillic entry here is a STEM meant to
    // match its inflections, so it must keep matching them.
    const cases = [
      ['Мобильный банк для МСБ', 'banking'],
      ['Финтех-стартап', 'banking'],
      ['A healthcare records system', 'healthcare'],
      ['Клиника на 40 врачей', 'healthcare'],
      ['Retail analytics platform', 'retail'],
      ['Рекомендательная система товаров', 'retail'],
      ['Enterprise SLA dashboard', 'enterprise'],
      // Cross-family QE: these were MISSED by the first version — a fix that loses true positives
      // trades one wrong answer for another.
      ['Retailer inventory analytics', 'retail'],
      ['Health tech startup', 'healthcare'],
      ['Platform for enterprises', 'enterprise'],
      ['Улучшаем конверсию воронки', 'retail'],
      ['Банковское приложение', 'banking'],
    ];
    for (const [text, expected] of cases) {
      const r = render({ claudeMd: '# Project\n\n' + text + '\n' });
      assert.equal(domainOf(r.text), expected,
        JSON.stringify(text) + ' should be ' + expected + ', got ' + domainOf(r.text));
    }
  });

  test('P3 — no domain expression uses \\b', () => {
    // Asserted on the source because `\b` fails SILENTLY around Cyrillic: it does not error, it just
    // stops matching, and every Russian term would vanish while the code looked right.
    // Comments stripped first: the comment above these expressions EXPLAINS why \b is wrong and
    // therefore contains it. A mention is not a use — the same trap this suite has hit before.
    const code = parseDomainSource().split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n');
    assert.ok(!/\\b/.test(code),
      '\\b is not a word boundary around Cyrillic in JavaScript — /\\bбанк/.test("банк России") is '
      + 'false. Use a Unicode lookaround.');
  });

  test('P4 — the boundaries are Unicode lookarounds with the u flag', () => {
    const src = parseDomainSource();
    assert.match(src, /\(\?<!\[\\\\p\{L\}\\\\p\{N\}\]\)/,
      'a left boundary over Unicode letters is required');
    assert.match(src, /\(\?!\[\\\\p\{L\}\\\\p\{N\}\]\)/,
      'and a right boundary for whole words');
    assert.match(src, /'iu'/, "and the `u` flag, or \\p{L} is not a property escape at all");
    // The stem/word distinction is the reason the Cyrillic half survives; losing it would take the
    // inflections with it.
    assert.match(src, /const stem = /, 'stems take a left boundary only');
    assert.match(src, /const word = /, 'whole words take both');
    // Cross-family QE: the helpers being DECLARED proves nothing — dead declarations plus one 'iu'
    // token satisfied the assertions above while an unbounded /conversion/i survived beside them.
    // Every domain expression must be BUILT by one of the two helpers.
    const built = [...src.matchAll(/const (\w+) = (stem|word)\(/g)].map((m) => m[1]);
    assert.ok(built.length >= 6,
      'each domain must be built by stem() or word(): found ' + JSON.stringify(built));
    const raw = [...src.matchAll(/const (\w+(?:Stem|Word)) = \//g)].map((m) => m[1]);
    assert.deepEqual(raw, [],
      'these are raw regex literals, bypassing the boundary helpers: ' + JSON.stringify(raw));
  });

  test('P5 — the bar is captioned with what it draws', () => {
    const r = render({ features: [
      { id: 'a', status: 'done', priority: 'mvp' },
      { id: 'b', status: 'next', priority: 'mvp' },
      { id: 'c', status: 'next', priority: 'low' },
    ] });
    const line = r.text.split('\n').find((l) => l.includes('Roadmap')) || '';
    assert.match(line, /\[[●○]+\]\s+Done\s+1\/3/,
      'the bar is built from done/total, so Done is its caption: ' + line);
    assert.match(line, /mvp\s+1\/2/, 'and mvp keeps its own segment: ' + line);
    assert.ok(!/\[[●○]+\]\s+mvp/.test(line),
      'the bar must not be captioned with a quantity it does not draw: ' + line);
  });

  test('P6 — with no MVP features the bar is still rendered', () => {
    // The field report proposed hiding the bar when mvpTotal === 0. The bar is CORRECT; hiding a
    // working indicator to mask a wrong caption fixes the wrong half.
    const r = render({ features: [
      { id: 'a', status: 'done', priority: 'low' },
      { id: 'b', status: 'next', priority: 'low' },
    ] });
    const line = r.text.split('\n').find((l) => l.includes('Roadmap')) || '';
    assert.match(line, /\[[●○]+\]/, 'the bar must survive an mvp count of zero: ' + line);
    assert.match(line, /Done\s+1\/2/, 'and still report the real progress: ' + line);
    assert.match(line, /mvp\s+0\/0/, 'while the mvp segment says plainly that there are none');
  });
});

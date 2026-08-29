'use strict';

// Nothing in this package said a database port is not published to the internet. MEASURED: the
// Architecture Constraints handed to every project (templates/.claude/rules/replicate-pipeline.md)
// carried exactly five items — pattern, containers, infrastructure, deploy, MCP — and nothing about
// storage; a sweep of templates/ for such a rule returned only unrelated hits.
//
// The working check already exists, in a course repository, and when it fails it prints
// "Правило: .claude/rules/docker-ports.md, «Правило №0»" — pointing at a file this package did not
// ship. The rule and the check are two different things, and only the rule ships here — ADR-001 D2,
// whose load-bearing reasons are that a shipped script is a new component KIND touching five
// consumers, and that a Node rewrite of a bash+awk compose parser is real work, not a transcription.
//
// P6 is the load-bearing one for the future: "5 rules" was a constant maintained BY HAND in seven
// places, and missing one leaves doctor or the status line reporting a rule missing that is not.

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const PKG_DIR = path.resolve(__dirname, '..', '..');
const read = (rel) => fs.readFileSync(path.join(PKG_DIR, rel), 'utf-8');

const RULE = path.join('templates', '.claude', 'rules', 'docker-ports.md');
const PIPELINE = path.join('templates', '.claude', 'rules', 'replicate-pipeline.md');

/** The Architecture Constraints block — the list actually handed to sparc-prd-mini. Scoped, because
 *  a constraint stated anywhere else in the file is not passed to anything. */
function constraints() {
  const src = read(PIPELINE);
  const start = src.indexOf('## Architecture Constraints');
  const end = src.indexOf('\n## ', start + 1);
  assert.ok(start > 0, 'replicate-pipeline.md must have an Architecture Constraints block');
  assert.ok(end > start, 'and a following section');
  return src.slice(start, end);
}

describe('a database port is not published to the internet (PR-012)', () => {
  test('P1 — the constraints block carries the rule and names the file', () => {
    const block = constraints();
    // The INVARIANT, not one remedy. Cross-family QE: "does not publish outward" is too narrow —
    // an explicit public address like 203.0.113.7:5432:5432 is not "all interfaces" and is exactly
    // as reachable from the internet; and network_mode: host needs no ports: entry at all.
    assert.match(block, /Storage: у баз и очередей НЕТ публикации на хост/,
      'the constraint must be IN the block that is passed to Phase 1, not elsewhere in the file');
    assert.match(block, /кроме привязки к петле/, 'and carry the loopback exception');
    assert.match(block, /network_mode: host/,
      'and name the escape path that needs no ports: entry at all');
    assert.match(block, /docker-ports\.md/,
      'and name the rule file, so the constraint and the rule are one thing rather than two');
  });

  test('P2 — the rule file exists and carries the name the shipped check prints', () => {
    // The check prints: Правило: .claude/rules/docker-ports.md, «Правило №0».
    // If the heading is renamed, that pointer stops resolving and the reader is left at a dead end.
    const src = read(RULE);
    assert.match(src, /Правило №0/,
      'the rule must carry the exact name the existing check refers people to');
    // The forbidden list is the security content: each row is a way a reader gets it wrong.
    for (const bad of ['0.0.0.0:5432:5432', '\\[::\\]:5432:5432', '203.0.113.7:5432:5432',
      'network_mode: host']) {
      assert.match(src, new RegExp(bad), 'the forbidden list must name: ' + bad);
    }
    assert.match(src, /убрать `ports:` целиком/,
      'the remedy must be stated as removing publication, not as adding expose:');
    assert.match(src, /`expose:` в современном Compose ничего не открывает/,
      'and expose: must be described honestly — it documents, it does not grant access');
    assert.match(src, /достучатся до\s+сервиса по его имени/,
      'and why the remedy suffices — otherwise it reads as a loss of capability');
  });

  test('P3 — the LOOPBACK exception is present, as an allowance and not a footnote', () => {
    // Without it the rule forbids exactly what the same pipeline prescribes: a test environment that
    // binds 127.0.0.1 so tests can run from the host. The field report's own pseudocode had this
    // defect and would have failed the project's own compose.
    const src = read(RULE);
    assert.match(src, /Исключение: петля — это законно/,
      'the exception needs its own heading — a rule whose exception is buried gets applied without it');
    assert.match(src, /127\.0\.0\.1:55432:5432/, 'shown as a concrete legal line');
    assert.match(src, /ЗАКОННО/, 'and labelled as permitted, not merely described');
    // Both loopback forms are equals — a rule that allows ::1 while its own self-check greps only
    // for 127.0.0.1 contradicts itself, which is what the first version did.
    assert.match(src, /Петлевых форм две и они равноправны/,
      'both loopback forms must be named as equals');
    assert.match(src, /host_ip: ::1/,
      'and the self-check must accept the IPv6 one it allows');
    assert.match(src, /исключение\s*\n?такая же часть правила, как и запрет/,
      'and its standing stated, so a later edit does not trim it as an aside');
  });

  test('P4 — the rule says what it is NOT, so nobody infers a guarantee', () => {
    // A rule that reads like a gate is worse than no rule: it stops people looking for the gate.
    const src = read(RULE);
    // The property has MOVED, not weakened. When this test was written the package shipped the rule
    // and no check, so the limit was "nobody may infer a guarantee". A check now ships — so the
    // limit becomes what the check does NOT cover, and the fact that it must be invoked. A rule that
    // reads like an automatic gate is still worse than no rule; only the shape of the honesty moved.
    assert.match(src, /Чем это правило НЕ является|Чего она НЕ делает/,
      'the limit needs its own heading');
    assert.match(src, /не привязана ни к какому событию — её надо позвать/,
      'a check nobody invokes guarantees nothing, and the rule must say so');
    assert.match(src, /конфликты с портами, уже занятыми другими контейнерами, она не ищет/,
      'and name what it does not look at, so nobody infers a wider guarantee');
    assert.match(src, /проверка НЕ\s*\n?ВЫПОЛНЕНА/,
      'and the third exit code must be documented where a reader will look for it');
  });

  test('P5 — the field report\'s non-verbatim compose fragment is not quoted', () => {
    // The report quotes a postgres service carrying an `expose:` line. MEASURED: the real file has
    // no such line. Copying it would put a fabricated quotation in a security rule.
    const src = read(RULE);
    assert.ok(!/image: postgres[\s\S]{0,200}expose:[\s\S]{0,40}5432[\s\S]{0,40}ports:/.test(src),
      'the rule must not reproduce the report\'s composite fragment');
  });

  test('P6 — every count site agrees with COMPONENTS.rules.items', () => {
    // The property is AGREEMENT, not a particular number: the next rule added moves all seven or
    // this fails. statusline.cjs is a TEMPLATE copied into other projects and cannot import src/,
    // and the four prose sites are prose, so the constant is irreducibly distributed — what is
    // removed here is the SILENCE when the sites disagree.
    const utils = require(path.join(PKG_DIR, 'src', 'utils.js'));
    const n = Object.keys(utils.COMPONENTS.rules.items).length;
    assert.ok(n >= 6, 'the docker-ports rule must be registered as a component: got ' + n);

    const statusline = read(path.join('templates', '.claude', 'hooks', 'statusline.cjs'));
    const m = statusline.match(/rulesExpected:\s*(\d+)/);
    assert.ok(m, 'statusline.cjs must declare rulesExpected');
    assert.equal(Number(m[1]), n,
      'statusline would report a phantom missing rule: rulesExpected=' + m[1] + ' vs ' + n);

    // SCAN, do not enumerate. The first version listed six prose sites by hand and MISSED SEVEN more,
    // including templates/.claude/commands/replicate.md — the file that SHIPS INTO EVERY GENERATED
    // PROJECT and names the rules a run must not overwrite. `docker-ports` was absent from that list,
    // so the security rule this feature added could be silently regenerated away. Two independent
    // reviewers found it; a hand-picked list is how it survived my own review.
    //
    // Historical documents are exempt BY NAME: a changelog entry describing what 1.4 shipped is a
    // true statement about the past, and rewriting it would be falsifying a record.
    const HISTORICAL = /changelog/i;
    const COUNT_CLAIM = /(\d+)\s+rules\b|(\d+)\s+правил|Rules\s+●(\d+)|\*\*(\d+) rules\*\*/g;
    const scanned = [];
    const walk = (dir) => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, e.name);
        if (e.isDirectory()) {
          if (e.name === 'node_modules' || e.name === '.git') continue;
          walk(full);
        } else if (/\.(md|html)$/.test(e.name) && !HISTORICAL.test(full)) {
          scanned.push(full);
        }
      }
    };
    walk(PKG_DIR);
    assert.ok(scanned.length > 10, 'the scan must actually find documents: ' + scanned.length);

    // `claimed`, not `n`. A rename made the inner variable shadow the authoritative one and the
    // comparison became `n !== n` — a test that could never fail, caught by mutation and not by
    // reading it. The same shape a reviewer caught in this suite's sibling yesterday.
    const wrong = [];
    for (const file of scanned) {
      const text = fs.readFileSync(file, 'utf-8');
      for (const hit of text.matchAll(COUNT_CLAIM)) {
        // A release-notes SECTION inside an otherwise-current document is historical too — the README
        // and the RU html bundle both embed one. The test is not a character window (which missed a
        // line 1300 lines below its heading) but the NEAREST PRECEDING heading: a count written under
        // a version heading is a statement about that version, and rewriting it would falsify a
        // record.
        const before = text.slice(0, hit.index);
        const headings = before.match(/^#{1,3} .*$|^<h[1-3][^>]*>.*$/gm) || [];
        const nearest = headings.length ? headings[headings.length - 1] : '';
        const historicalSection = /changelog|release notes|version history|история версий|\[?v?\d+\.\d+/i;
        if (historicalSection.test(nearest)) continue;
        // and an explicit past-tense marker on the line itself
        const lineStart = before.lastIndexOf('\n') + 1;
        const line = text.slice(lineStart, text.indexOf('\n', hit.index));
        if (/initial published version|первая опубликованная/i.test(line)) continue;
        const claimed = Number(hit[1] || hit[2] || hit[3] || hit[4]);
        if (claimed !== n) {
          wrong.push(path.relative(PKG_DIR, file) + ': "' + hit[0].trim() + '"');
        }
      }
    }
    assert.deepEqual(wrong, [],
      'these say a rule count that is not ' + n + ': ' + JSON.stringify(wrong, null, 1));

    // An EIGHTH site the survey missed    // An EIGHTH site the survey missed, found by the suite going red: the e2e --help assertion,
    // which is not a file constant but a re-typed expectation. cli.js:57 already derives its number
    // from COMPONENTS, so a test that hardcodes one is a second source of truth — exactly the defect
    // its own comment says it exists to catch ("cli.js used to say 1 rule while EXPECTED_RULES had 2
    // entries"). It is now derived, and this asserts it stays derived.
    const e2e = read(path.join('tests', 'e2e', 'lifecycle.test.js'));
    const helpAt = e2e.indexOf("describe('e2e: --help shows correct component counts'");
    assert.ok(helpAt > 0, 'the --help count test must exist');
    const helpBlock = e2e.slice(helpAt, e2e.indexOf('});', e2e.indexOf('} finally', helpAt)));
    assert.match(helpBlock, /Object\.keys\(COMPONENTS\[group\]\.items\)\.length/,
      'the --help count test must DERIVE from COMPONENTS, not re-type the numbers');
    assert.ok(!/\/\d+\\s\+rules\//.test(helpBlock),
      'and must not carry a hardcoded rule count');
  });

  test('P7 — the HOOK surface stays Node-only', () => {
    // ADR-001 D2, NARROWED by measurement during Step 7. The first version asserted that NO .sh
    // ships anywhere in templates/, and that is FALSE: skills/brutal-honesty-review/scripts/
    // assess-tests.sh and assess-code.sh already ship. The cross-platform promise in settings.json
    // ("Cross-platform Node scripts (no bash dependencies)") is scoped to the HOOKS — all six are
    // .cjs so Windows works — and a port check is hook-shaped, so that is the surface to guard.
    // Asserting the broader claim would have been a test enforcing something untrue.
    const hooks = path.join(PKG_DIR, 'templates', '.claude', 'hooks');
    const files = fs.readdirSync(hooks);
    assert.deepEqual(files.filter((f) => f.endsWith('.sh')), [],
      'a .sh among the hooks contradicts the cross-platform promise in settings.json');
    assert.ok(files.filter((f) => f.endsWith('.cjs')).length >= 6,
      'and the six shipped hooks must still be .cjs: ' + JSON.stringify(files));
  });
});

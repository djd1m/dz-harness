'use strict';

// The deterministic half of «отрицательный вывод структурно НЕВИДИМ для отчётного гейта». No new
// always-loaded rule: the corpus budget is spent (measured 2026-09-01) and the owner refused to
// raise the threshold, so the doctrine lives in `references/negative-results.md` — loaded on
// demand — plus four lines in the SKILL that a reader must carry.
//
// THE DEFECT, and how it was established. NOT by grep: grep finds the vocabulary, not the
// blindness. By TWIN TEST. `check_report_evidence.py` walked FROM THE LEDGER TO THE REPORT — for
// each recorded fact, is it used and is its use honest. That direction is structurally blind to a
// claim with NO SOURCE, and the strongest claim a research report makes has exactly that shape.
//
// MEASURED 2026-09-01 and RE-MEASURED by P1 below: two runs over ONE ledger, the reports differing
// by EXACTLY one line of unsupported negative conclusion, produced BYTE-IDENTICAL --json output,
// both exit 0. So an unbacked negation could neither raise nor lower the finding count.
//
// THE MECHANISM: «не встретилось» and «доказано, что нет» arrive in the same form and are decided
// on identically. The first is a property of the SEARCH, the second of the WORLD — and only the
// second justifies building a product on an empty niche.
//
// THE ACCEPTED CORRECTION (P6): a ceiling of «enumerable corpus declared exhaustive» is NOT enough,
// because an exhaustive LIST does not prove an exhaustive SEARCH. Method, query coverage, sampling
// refusals and the corpus's time boundary are part of the ceiling too.

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const PKG = path.resolve(__dirname, '..', '..');
const SKILL_DIR = path.join(PKG, 'templates', '.claude', 'skills', 'goap-research-ed25519');
const GATE = path.join(SKILL_DIR, 'scripts', 'check_report_evidence.py');

const read = (rel) => fs.readFileSync(path.join(PKG, rel), 'utf8');

/** Is a usable python3 present? Reported honestly rather than silently skipped past. */
function python() {
  for (const bin of ['python3', 'python']) {
    const probe = spawnSync(bin, ['--version'], { encoding: 'utf8' });
    if (probe.status === 0) return bin;
  }
  return null;
}
const PY = python();

/** A one-fact ledger built from the skill's own shipped fixture, so the test does not invent a
 *  ledger shape the gate might not accept. */
function ledger() {
  const fixture = JSON.parse(read(path.join('templates', '.claude', 'skills',
    'goap-research-ed25519', 'scripts', 'fixture_legacy_v2_fact.json')));
  return JSON.stringify({ facts: [fixture.fact] });
}

/** Run the REAL gate over a report and return its parsed JSON verdict. */
function gate(reportText) {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'p-rep-neg-')));
  try {
    const report = path.join(dir, 'report.md');
    const facts = path.join(dir, 'facts.json');
    fs.writeFileSync(report, reportText);
    fs.writeFileSync(facts, ledger());
    const r = spawnSync(PY, [GATE, '--report', report, '--facts', facts, '--json'], { encoding: 'utf8' });
    const raw = (r.stdout || '').trim();
    let parsed = null;
    try { parsed = JSON.parse(raw); } catch { /* left null, asserted by the caller */ }
    return { code: r.status, raw, json: parsed, err: r.stderr || '' };
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}

const BASE = '# Report\n\nCompetitor A charges 10 USD per seat.\n';
const NEGATIVE = 'Вывод: функции нет ни у одного из трёх конкурентов; ниша свободна.\n';

/** The five fields the claim must carry, with the values a case needs. */
function basis({
  corpus = 'справочные центры A (14 стр.), B (9 стр.), C (11 стр.) — перечень в приложении A',
  completeness = 'перечислимо и объявлено исчерпывающим',
  method = 'полнотекстовый поиск по 6 запросам: «bulk export», «экспорт», «CSV»',
  boundary = 'по состоянию на 2026-08-30',
  implication = 'не встретилось',
} = {}) {
  const line = (label, value) => (value === null ? '' : label + ': ' + value + '\n');
  return line('КОРПУС', corpus) + line('ПОЛНОТА', completeness) + line('СПОСОБ ПОИСКА', method)
    + line('ГРАНИЦА КОРПУСА', boundary) + line('СЛЕДСТВИЕ', implication);
}

const kinds = (v) => (v.json ? v.json.findings.map((f) => f.kind) : ['(unparseable)']);

describe('отрицательный вывод — the second direction of the report gate', () => {
  test('P1 - THE twin test: the two reports no longer produce identical verdicts', {
    skip: PY ? false : 'python3 is not available in this environment',
  }, () => {
    // The measurement that established the defect, re-run as the proof of the fix. Before the
    // change these two were byte-identical and both exit 0; asserting the difference is what makes
    // this a fix rather than a description of one.
    const plain = gate(BASE);
    const negated = gate(BASE + NEGATIVE);
    assert.ok(plain.json, 'the gate must emit JSON: ' + plain.raw + plain.err);
    assert.ok(negated.json, 'the gate must emit JSON: ' + negated.raw + negated.err);

    assert.equal(plain.code, 0, 'the report WITHOUT the negative conclusion is still clean: ' + plain.raw);
    assert.equal(negated.code, 1, 'the unsupported negative conclusion must now be a finding');
    assert.notDeepEqual(plain.json, negated.json,
      'one added line of unsupported negation must change the verdict — identical output here IS '
      + 'the defect, and it is what was measured on 2026-09-01');
    assert.deepEqual(kinds(negated), ['NEGATIVE_CONCLUSION_WITHOUT_BASIS']);
  });

  test('P2 - the finding NAMES the conclusion and says which fields are missing', {
    skip: PY ? false : 'python3 is not available',
  }, () => {
    const v = gate(BASE + NEGATIVE);
    const f = v.json.findings[0];
    assert.match(f.claim, /ниша свободна/, 'the claim itself must be quoted back');
    for (const field of ['КОРПУС', 'ПОЛНОТА', 'СПОСОБ ПОИСКА', 'ГРАНИЦА КОРПУСА', 'СЛЕДСТВИЕ']) {
      assert.ok(f.detail.includes(field), 'the missing field must be named: ' + field);
    }
    // The mechanism, in words — the sentence a reader has to carry away.
    assert.match(f.detail, /property of the\s+SEARCH/);
  });

  test('P3 - the SAME conclusion WITH its full basis passes', {
    skip: PY ? false : 'python3 is not available',
  }, () => {
    const v = gate(BASE + NEGATIVE + '\n' + basis());
    assert.equal(v.code, 0, v.raw);
    assert.deepEqual(kinds(v), []);
  });

  test('P4 - each of the five fields is load-bearing on its own', {
    skip: PY ? false : 'python3 is not available',
  }, () => {
    // Without this the block could be satisfied by writing four of the five and the fifth would be
    // decoration — which is how a required field quietly becomes optional.
    for (const field of ['corpus', 'completeness', 'method', 'boundary', 'implication']) {
      const v = gate(BASE + NEGATIVE + '\n' + basis({ [field]: null }));
      assert.equal(v.code, 1, 'dropping ' + field + ' must fire: ' + v.raw);
      assert.deepEqual(kinds(v), ['NEGATIVE_CONCLUSION_WITHOUT_BASIS'], field);
    }
  });

  test('P5 - ПОЛНОТА and СЛЕДСТВИЕ are CLOSED vocabularies', {
    skip: PY ? false : 'python3 is not available',
  }, () => {
    // An open field here collects a word that sounds thorough and commits to nothing.
    const badCompleteness = gate(BASE + NEGATIVE + '\n' + basis({ completeness: 'достаточная' }));
    assert.equal(badCompleteness.code, 1, badCompleteness.raw);
    assert.deepEqual(kinds(badCompleteness), ['NEGATIVE_COMPLETENESS_UNRECOGNISED']);

    const badImplication = gate(BASE + NEGATIVE + '\n' + basis({ implication: 'скорее всего нет' }));
    assert.equal(badImplication.code, 1, badImplication.raw);
    assert.deepEqual(kinds(badImplication), ['NEGATIVE_IMPLICATION_UNRECOGNISED']);
  });

  test('P6 - THE CEILING: a sample can never license «намеренно отсутствует»', {
    skip: PY ? false : 'python3 is not available',
  }, () => {
    // The accepted correction, and the reason this record was worth shipping at all: an exhaustive
    // LIST does not prove an exhaustive SEARCH, so absence in part of a corpus is absence from the
    // SEARCH and not from the world.
    for (const completeness of ['выборка — 34 из ~120 страниц', 'неизвестна']) {
      const v = gate(BASE + NEGATIVE + '\n'
        + basis({ completeness, implication: 'намеренно отсутствует' }));
      assert.equal(v.code, 1, completeness + ': ' + v.raw);
      assert.deepEqual(kinds(v), ['NEGATIVE_CLAIM_EXCEEDS_ITS_CEILING'], completeness);
      assert.match(v.json.findings[0].detail, /absence from the\s+SEARCH/);
    }

    // The weaker implication on the same sample is fine — the point is a CEILING, not a ban.
    const ok = gate(BASE + NEGATIVE + '\n'
      + basis({ completeness: 'выборка — 34 из ~120 страниц', implication: 'не встретилось' }));
    assert.equal(ok.code, 0, ok.raw);

    // And the strong implication on an exhaustive corpus is exactly what the form is FOR.
    const strong = gate(BASE + NEGATIVE + '\n' + basis({ implication: 'намеренно отсутствует' }));
    assert.equal(strong.code, 0, strong.raw);
  });

  test('P7 - detail after the closed word is allowed, not punished', {
    skip: PY ? false : 'python3 is not available',
  }, () => {
    // «выборка — 34 из ~120 страниц» says how big the sample is, which is strictly better than the
    // bare word. Refusing it would teach authors to write less.
    const v = gate(BASE + NEGATIVE + '\n' + basis({
      completeness: 'выборка, 34 из ~120 страниц; отказ выборки: раздел для партнёров под входом',
      implication: 'не встретилось — ни на одной прочитанной странице',
    }));
    assert.equal(v.code, 0, v.raw);
  });

  test('P8 - ordinary prose is NOT a negative universal claim', {
    skip: PY ? false : 'python3 is not available',
  }, () => {
    // An eager guard is not a stricter guard; it is a guard people delete. `there is no` alone
    // fires on ordinary sentences, so the patterns require the UNIVERSAL — which is precisely what
    // makes the claim strong enough to need a basis.
    const innocent = BASE
      + 'There is no cache in the current design, and no timeline yet.\n'
      + 'Нет данных за июль. Функция не описана в этом разделе.\n';
    const v = gate(innocent);
    assert.equal(v.code, 0, 'ordinary negation must not fire: ' + v.raw);
    assert.deepEqual(kinds(v), []);
  });

  test('P9 - one sentence produces ONE finding, however many patterns it matches', {
    skip: PY ? false : 'python3 is not available',
  }, () => {
    // The measured sentence matches two patterns at once («ни у одного» and «ниша свободна»).
    // Counting it twice would inflate exactly the number the twin test compares.
    const v = gate(BASE + NEGATIVE);
    assert.equal(v.json.findings.length, 1, JSON.stringify(kinds(v)));
  });

  test('P10 - the basis in the appendix does not license a claim on page 2', {
    skip: PY ? false : 'python3 is not available',
  }, () => {
    // A window, not a document: a block far away warns nobody reading the sentence.
    const far = BASE + NEGATIVE + '\n' + 'x'.repeat(2000) + '\n' + basis();
    const v = gate(far);
    assert.equal(v.code, 1, v.raw);
    assert.deepEqual(kinds(v), ['NEGATIVE_CONCLUSION_WITHOUT_BASIS']);
  });

  test('P11 - the gate still refuses inputs it cannot read', {
    skip: PY ? false : 'python3 is not available',
  }, () => {
    // The pre-existing contract must survive the addition: exit 2 for an unreadable input, never 0.
    const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'p-rep-neg2-')));
    try {
      const report = path.join(dir, 'report.md');
      fs.writeFileSync(report, BASE + NEGATIVE);
      const r = spawnSync(PY, [GATE, '--report', report, '--facts', path.join(dir, 'absent.json'),
        '--json'], { encoding: 'utf8' });
      assert.equal(r.status, 2, 'a gate that could not read its inputs has cleared nothing');
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });
});

describe('the doctrine is reachable, and the honest boundary is stated', () => {
  test('P12 - the reference carries the form, the measurement and the ceiling', () => {
    // It lives in references/ — loaded on demand — because the always-loaded corpus is spent. That
    // placement is only legitimate if the SKILL points at it, which P13 asserts.
    const ref = read(path.join('templates', '.claude', 'skills', 'goap-research-ed25519',
      'references', 'negative-results.md'));
    for (const field of ['КОРПУС', 'ПОЛНОТА', 'СПОСОБ ПОИСКА', 'ГРАНИЦА КОРПУСА', 'СЛЕДСТВИЕ']) {
      assert.ok(ref.includes(field), 'the form must be spelled out: ' + field);
    }
    assert.match(ref, /ТВИН-ТЕСТОМ, а не грепом/, 'how the defect was established must survive');
    assert.match(ref, /исчерпывающий ПЕРЕЧЕНЬ не доказывает\s*\n?исчерпывающего ПОИСКА/,
      'the accepted correction is the load-bearing half and must not be lost');
    assert.match(ref, /[Кк]арта\s+сайта/,
      'the wrong-corpus case must stay: it is what the check deliberately cannot decide');
  });

  test('P13 - the SKILL names the obligation and points at the long form', () => {
    const skill = read(path.join('templates', '.claude', 'skills', 'goap-research-ed25519', 'SKILL.md'));
    assert.match(skill, /A NEGATIVE conclusion .* MUST carry its own basis/,
      'the duty must read as a duty in the file that is actually loaded');
    assert.match(skill, /references\/negative-results\.md/,
      'a doctrine nobody can reach is a doctrine nobody applies');
    assert.match(skill, /property of the SEARCH/,
      'the distinguishing sentence must be carried, not deferred');
  });

  test('P14 - the gate PRINTS what it cannot decide', () => {
    // Naming the corpus is enforceable; judging its fitness for the question is not. A gate that
    // stayed silent about that would sell the stronger guarantee it does not have.
    const src = read(path.join('templates', '.claude', 'skills', 'goap-research-ed25519',
      'scripts', 'check_report_evidence.py'));
    assert.match(src, /never that the named corpus fits the question/,
      'the honest scope must be in the OUTPUT, not only in a comment');
    assert.match(src, /def scan_negative_conclusions/, 'the second direction must exist as its own scan');
  });

  test('P15 - the mutation registry carries this feature\'s guards', () => {
    const registry = JSON.parse(read('test/mutation-registry.json'));
    const gateFile = 'templates/.claude/skills/goap-research-ed25519/scripts/check_report_evidence.py';
    const expected = {
      'negative-conclusion-is-seen-at-all': gateFile,
      'negative-ceiling-blocks-the-strong-claim': gateFile,
      'negative-every-field-is-load-bearing': gateFile,
      'negative-skill-carries-the-obligation':
        'templates/.claude/skills/goap-research-ed25519/SKILL.md',
    };
    for (const [id, file] of Object.entries(expected)) {
      const entry = registry.entries.find((e) => e.id === id);
      assert.ok(entry, 'missing targeted mutation id ' + id);
      assert.equal(entry.file, file, id + ' mutates the wrong surface');
      assert.ok(entry.property && entry.property.length > 40,
        id + ' needs a behavioral property, not a cosmetic label');
      assert.ok(entry.mutation && entry.mutation.find && entry.mutation.replace,
        id + ' needs a real source mutation');
      assert.ok(Number.isInteger(entry.minFailing) && entry.minFailing >= 1,
        id + ' must require at least one failing test');
      assert.equal(read(entry.file).split(entry.mutation.find).length - 1, 1,
        id + ': mutation anchor must occur exactly once');
    }
  });
});

'use strict';

// The deterministic half of «правка объявляет ВЕРСИЮ источника, а не обещает перечитать». There is
// NO new always-loaded rule: the corpus budget is spent (measured 2026-09-01) and the owner refused
// to raise the threshold, so the doctrine lives in the checker's header, which is never loaded.
//
// WHAT IS ALREADY PRESCRIBED AND IS NOT RE-OPENED. «Take the status from the FILE, not from the
// worker's narrative» is already required: the coordinator checks each receipt for existence,
// non-emptiness and mtime freshness before merging. That half stands. This suite covers the one it
// does not reach.
//
// THE UNCOVERED HALF: freshness is checked on the RECEIPT, never on the SOURCE the receipt was
// derived from. A read copy is a snapshot of the MOMENT OF READING, not of the file, so an edit
// addressed by a literal string is a race BY CONSTRUCTION. The field case: an edit to Refinement.md
// died on an assertion because a worker had renumbered the guards between the read and the write.
// The symmetric case is quieter: three reports saying «the defect is still there» were written from
// stale copies — and each report was itself perfectly FRESH, so a freshness check on the receipt
// answered a neighbouring question and handed the answer over as the asked one.
//
// WHY A HASH AND NOT AN INSTRUCTION, asserted here rather than merely argued: a rule «re-read
// immediately before editing» cannot be checked by inspecting the finished file, so its failure is
// silent — the weakest layer of this package's own ladder. A declared version is checkable by
// anyone, later, without trusting anybody. P12 is the test that the tool embodies the other half of
// the same idea: a refusal does not mutate.

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const PKG = path.resolve(__dirname, '..', '..');
const TPL = path.join(PKG, 'templates', '.claude');
const CHECK = path.join(TPL, 'hooks', 'check-source-version.cjs');
const DECL = 'docs/source-versions.md';

const read = (rel) => fs.readFileSync(path.join(PKG, rel), 'utf8');
const sha256 = (s) => crypto.createHash('sha256').update(Buffer.from(s, 'utf8')).digest('hex');

/** Build a throwaway project, run the REAL checker, and return the verdict plus a tree fingerprint. */
function check(files) {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'p-rep-srcver-')));
  const fingerprint = () => {
    const out = [];
    const walk = (d, rel) => {
      for (const e of fs.readdirSync(d).sort()) {
        const full = path.join(d, e);
        const r = rel ? rel + '/' + e : e;
        if (fs.statSync(full).isDirectory()) walk(full, r);
        else out.push(r + ':' + crypto.createHash('sha256').update(fs.readFileSync(full)).digest('hex'));
      }
    };
    walk(dir, '');
    return out.join('\n');
  };
  try {
    for (const [rel, body] of Object.entries(files || {})) {
      const abs = path.join(dir, rel);
      fs.mkdirSync(path.dirname(abs), { recursive: true });
      fs.writeFileSync(abs, body);
    }
    const before = fingerprint();
    const r = spawnSync(process.execPath, [CHECK, dir], { encoding: 'utf8' });
    const after = fingerprint();
    return { code: r.status, out: (r.stdout || '') + (r.stderr || ''), before, after };
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}

const REFINEMENT = '# Refinement\n\n1. Страж A\n2. Страж B\n3. Страж C\n';

/**
 * A declaration in whatever state the case needs.
 *
 * Defaults are the HEALTHY ones so that every case stays about the single thing it changes; a case
 * that wants silence passes `null` for that field, and silence is asserted as its own outcome.
 */
function decl({ work = 'да', run = 'ВЫПОЛНЕНА', reason = null, rows } = {}) {
  const line = (label, value) => (value === null || value === undefined ? '' : '**' + label + ':** ' + value + '\n');
  const body = rows === undefined
    ? [['перенумеровать стражей', 'правка', 'docs/Refinement.md', sha256(REFINEMENT)],
      ['дефект F1 всё ещё жив', 'вывод', 'docs/Refinement.md', sha256(REFINEMENT)]]
    : rows;
  return '# Source versions\n\n'
    + line('Правки и выводы', work)
    + line('Проверка версий', run)
    + line('Причина', reason)
    + '\n## Выводы и правки\n\n'
    + '| Что | Вид | Источник | Хеш источника |\n|---|---|---|---|\n'
    + body.map((r) => '| ' + r.join(' | ') + ' |').join('\n') + '\n';
}

const healthy = (over = {}) => ({ 'docs/Refinement.md': REFINEMENT, [DECL]: decl(over) });

describe('версия источника объявлена — the deterministic half', () => {
  test('P1 - an edit and a verdict whose source still hashes to the declared value are CLEAN', () => {
    const r = check(healthy());
    assert.equal(r.code, 0, r.out);
    assert.match(r.out, /✅/);
    assert.match(r.out, /1 правк\(и\), 1 вывод\(ов\)/, r.out);
    // The boundary is part of the verdict: a matching hash proves the ground did not move, never
    // that the conclusion standing on it follows.
    assert.match(r.out, /почва НЕ СДВИНУЛАСЬ/, r.out);
  });

  test('P2 - no declaration at all is NOT clean', () => {
    const r = check({ 'docs/Refinement.md': REFINEMENT });
    assert.equal(r.code, 2, r.out);
    assert.match(r.out, /нет файла docs\/source-versions\.md/);
    assert.match(r.out, /НЕ ЗАДАВАЛСЯ/);
  });

  test('P3 - «no edits and no verdicts» is legitimate, and it is 2 rather than 0', () => {
    const r = check({ [DECL]: decl({ work: 'нет' }) });
    assert.equal(r.code, 2, r.out);
    assert.doesNotMatch(r.out, /✅/);
  });

  test('P4 - an unrecognised closed value stops the check instead of guessing', () => {
    const r = check(healthy({ work: 'частично' }));
    assert.equal(r.code, 2, r.out);
    assert.match(r.out, /нераспознанное значение/);
  });

  test('P5 - «НЕ ВЫПОЛНЕНА» needs a reason from the closed list, and then it is honest', () => {
    const noReason = check(healthy({ run: 'НЕ ВЫПОЛНЕНА' }));
    assert.equal(noReason.code, 2, noReason.out);
    assert.match(noReason.out, /без строки `\*\*Причина:\*\*`/);

    const freeText = check(healthy({ run: 'НЕ ВЫПОЛНЕНА', reason: 'позже' }));
    assert.equal(freeText.code, 2, freeText.out);
    assert.match(freeText.out, /не из закрытого списка/);

    const named = check(healthy({ run: 'НЕ ВЫПОЛНЕНА', reason: 'решение-отложено' }));
    assert.equal(named.code, 2, named.out);
    assert.match(named.out, /решение-отложено/);
    // The honest refusal names WHY it matters — a fresh receipt over a stale source.
    assert.match(named.out, /устаревшего источника/);
    assert.doesNotMatch(named.out, /✅/);
  });

  test('P6 - an empty table under «да» is a PROVEN gap', () => {
    const r = check({ 'docs/Refinement.md': REFINEMENT, [DECL]: decl({ rows: [] }) });
    assert.equal(r.code, 1, r.out);
    assert.match(r.out, /ни один не назван/);
  });

  test('P7 - a misspelled Вид is reported, never silently dropped', () => {
    // A row that falls out of the parser is indistinguishable from a row nobody wrote — the same
    // substitution the whole file is about, one level down.
    const r = check({ 'docs/Refinement.md': REFINEMENT, [DECL]: decl({
      rows: [['перенумеровать', 'правочка', 'docs/Refinement.md', sha256(REFINEMENT)]],
    }) });
    assert.equal(r.code, 2, r.out);
    assert.match(r.out, /нераспознанный `Вид`/);
  });

  test('P8 - a row with no source, or no hash, is a PROVEN defect', () => {
    const noSource = check({ 'docs/Refinement.md': REFINEMENT, [DECL]: decl({
      rows: [['перенумеровать', 'правка', '—', sha256(REFINEMENT)]],
    }) });
    assert.equal(noSource.code, 1, noSource.out);
    assert.match(noSource.out, /источник не назван/);

    const noHash = check({ 'docs/Refinement.md': REFINEMENT, [DECL]: decl({
      rows: [['перенумеровать', 'правка', 'docs/Refinement.md', '—']],
    }) });
    assert.equal(noHash.code, 1, noHash.out);
    assert.match(noHash.out, /версия источника не записана/);
    // The load-bearing argument: a promise cannot be checked, a hash can.
    assert.match(noHash.out, /Обещание перечитать проверить\s+нельзя/);
  });

  test('P9 - a malformed digest is «could not check», not «mismatch»', () => {
    // Different repairs: a typo in the digest is not evidence that the source moved.
    const r = check({ 'docs/Refinement.md': REFINEMENT, [DECL]: decl({
      rows: [['перенумеровать', 'правка', 'docs/Refinement.md', 'deadbeef']],
    }) });
    assert.equal(r.code, 2, r.out);
    assert.match(r.out, /не похож на sha256/);
  });

  test('P10 - a source that does not exist pins nothing', () => {
    const r = check({ [DECL]: decl({
      rows: [['перенумеровать', 'правка', 'docs/absent.md', sha256(REFINEMENT)]],
    }) });
    assert.equal(r.code, 1, r.out);
    assert.match(r.out, /нет на диске/);
  });

  test('P11 - THE fixture: declared H1, live H2 — the edit is REFUSED', () => {
    // The field case, reduced: the guards were renumbered between the read and the write.
    const renumbered = REFINEMENT.replace('2. Страж B', '2. Страж B2');
    const r = check({ 'docs/Refinement.md': renumbered, [DECL]: decl() });
    assert.equal(r.code, 1, r.out);
    assert.match(r.out, /источник изменился после чтения — правка ОТКЛОНЕНА, мутации нет/);
    assert.match(r.out, /перенумеровать стражей/, 'the edit must be NAMED');
    // Both halves of the mechanism must appear: the literal-string race AND the fresh report over a
    // stale source, which is the one a receipt check cannot see.
    assert.match(r.out, /снимок МОМЕНТА ЧТЕНИЯ/);
    assert.match(r.out, /отвечает не на тот вопрос/);
  });

  test('P12 - the refusal does NOT mutate: the tree is byte-identical after the run', () => {
    // «Отказ без мутации» is a property of the TOOL here, not an instruction to its user. Asserted
    // over the whole tree rather than the named source, because a checker that repaired the
    // declaration — or wrote a report beside it — would also be mutating on a refusal.
    const renumbered = REFINEMENT.replace('2. Страж B', '2. Страж B2');
    const r = check({ 'docs/Refinement.md': renumbered, [DECL]: decl() });
    assert.equal(r.code, 1, r.out);
    assert.equal(r.after, r.before, 'the checker changed the tree while refusing');

    // And the same on the clean path, so the property is not accidentally about failure only.
    const ok = check(healthy());
    assert.equal(ok.code, 0, ok.out);
    assert.equal(ok.after, ok.before, 'the checker changed the tree while passing');
  });

  test('P13 - and the SAME declaration, re-pinned to the live file, is accepted', () => {
    const renumbered = REFINEMENT.replace('2. Страж B', '2. Страж B2');
    const r = check({ 'docs/Refinement.md': renumbered, [DECL]: decl({
      rows: [['перенумеровать стражей', 'правка', 'docs/Refinement.md', sha256(renumbered)]],
    }) });
    assert.equal(r.code, 0, r.out);
  });

  test('P14 - a VERDICT built on a stale source is refused exactly like an edit', () => {
    // The symmetric half, and the quieter one: the report is fresh, its ground is not.
    const renumbered = REFINEMENT.replace('3. Страж C', '3. Страж C — исправлен');
    const r = check({ 'docs/Refinement.md': renumbered, [DECL]: decl({
      rows: [['дефект F1 всё ещё жив', 'вывод', 'docs/Refinement.md', sha256(REFINEMENT)]],
    }) });
    assert.equal(r.code, 1, r.out);
    assert.match(r.out, /\(verdict\)/, 'the report must say WHICH kind was refused');
  });

  test('P15 - no non-zero exit ever prints the clean marker', () => {
    const cases = [
      {},
      { [DECL]: decl({ work: 'нет' }) },
      { [DECL]: decl({ rows: [] }) },
      { 'docs/Refinement.md': REFINEMENT + 'x', [DECL]: decl() },
      { 'docs/Refinement.md': REFINEMENT, [DECL]: decl({ rows: [['a', 'правка', 'docs/Refinement.md', 'zz']] }) },
    ];
    for (const files of cases) {
      const r = check(files);
      assert.notEqual(r.code, 0, JSON.stringify(Object.keys(files)));
      assert.doesNotMatch(r.out, /✅/, r.out);
    }
  });
});

/** The seam's FORCE, separately from its vocabulary. */
function seamForceProblems(text) {
  const problems = [];
  if (!/Every EDIT and every VERDICT MUST declare the sha256 of the source it was built on/.test(text)) {
    problems.push('the version precondition is advisory, not imperative');
  }
  if (!/refusal WITHOUT mutation/.test(text)) {
    problems.push('a mismatch no longer refuses — applying the edit to the newer text is the defect');
  }
  if (!/snapshot of the moment\s*\n?\s*of reading, not of the file/.test(text)) {
    problems.push('the mechanism is gone — without it the duty reads as bookkeeping');
  }
  if (!/node \.claude\/hooks\/check-source-version\.cjs \./.test(text)) {
    problems.push('the deterministic half is not invoked at the seam');
  }
  return problems;
}

describe('the seam still mandates, and every counter agrees', () => {
  const SEAMS = ['templates/.claude/commands/start.md', 'templates/.claude/commands/feature.md'];

  test('P16 - both WRITING dispatchers carry the obligation, and softening it fires', () => {
    for (const rel of SEAMS) {
      const source = read(rel);
      assert.deepEqual(seamForceProblems(source), [], rel);

      // The exact softening the backlog record forbids: a promise to re-read instead of a declared
      // version. It is unverifiable by inspection, which is why it must not be able to ship.
      const promise = source.replace(
        'Every EDIT and every VERDICT MUST declare the sha256 of the source it was built on',
        'Re-read the source immediately before editing it');
      assert.notEqual(promise, source, rel + ': mutation fixture did not apply — the sentence moved');
      assert.deepEqual(seamForceProblems(promise),
        ['the version precondition is advisory, not imperative'],
        rel + ': replacing the version with a promise must fire EXACTLY the precondition predicate');

      // Keep the declaration, drop the refusal: the edit gets applied to the newer text anyway,
      // which is the defect with an extra field written next to it.
      const applied = source.replace('refusal WITHOUT mutation', 'a warning worth noting');
      assert.ok(seamForceProblems(applied).some((p) => p.includes('no longer refuses')), rel);
    }
  });

  test('P17 - it is a hooks component wired to NO event, and every counter agrees', () => {
    const { COMPONENTS } = require(path.join(PKG, 'src', 'utils.js'));
    assert.ok(COMPONENTS.hooks.items['check-source-version'],
      'it must be registered, or init/doctor/verify will not know it');
    const settings = read('templates/.claude/settings.json');
    assert.ok(!settings.includes('check-source-version'),
      'it must not be wired to an event: this package\'s hooks are non-blocking by contract');

    const statusline = read('templates/.claude/hooks/statusline.cjs');
    const hooks = statusline.match(/hooksExpected:\s*(\d+)/);
    assert.ok(hooks, 'statusline must declare hooksExpected');
    const onDisk = fs.readdirSync(path.join(TPL, 'hooks')).filter((f) => f.endsWith('.cjs'));
    assert.equal(Number(hooks[1]), Object.keys(COMPONENTS.hooks.items).length,
      'the status line would report a phantom missing hook: ' + hooks[1]);
    assert.equal(onDisk.length, Object.keys(COMPONENTS.hooks.items).length,
      'the shipped directory and the declared contract disagree: ' + onDisk.join(', '));

    const rule = read('templates/.claude/rules/replicate-pipeline.md');
    assert.match(rule, /check-source-version\.cjs/, 'the hook inventory must list it');
    const inventory = rule.match(/\*\*Hooks \((\d+) files/);
    assert.ok(inventory, 'the rule must state the hook count it is inventorying');
    assert.equal(Number(inventory[1]), onDisk.length,
      'the rule prose and the shipped directory disagree — the exact split this family exists for');
  });

  test('P18 - the mutation registry carries this feature\'s guards', () => {
    const registry = JSON.parse(read('test/mutation-registry.json'));
    const expected = {
      'source-version-cannot-check-is-not-clean': 'templates/.claude/hooks/check-source-version.cjs',
      'source-version-pin-must-still-match': 'templates/.claude/hooks/check-source-version.cjs',
      'source-version-verdicts-age-like-edits': 'templates/.claude/hooks/check-source-version.cjs',
      'source-version-seam-declares-not-promises': 'templates/.claude/commands/feature.md',
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

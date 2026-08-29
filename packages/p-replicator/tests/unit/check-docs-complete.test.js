'use strict';

// Phase 2 launched a swarm of validation agents over whatever Phase 1 produced, with nothing in
// between. Existence, emptiness and unfilled placeholders are decidable by forty lines of code, so
// sending a swarm to discover them is a layer-1 check living at layer 3.
//
// The trap this suite exists to hold: an eager placeholder pattern. A bracketed token is also how
// markdown writes a link and how a citation looks, so a naive /\[.*\]/ refuses legitimate documents
// — the same eager-gate failure this repo closed for the Measurable criterion and twice today for
// the growth criterion. P4 is the guard on it.

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const PKG = path.resolve(__dirname, '..', '..');
const TPL = path.join(PKG, 'templates', '.claude');
const CHECK = path.join(TPL, 'hooks', 'check-docs-complete.cjs');

const REQUIRED = ['PRD.md', 'Solution_Strategy.md', 'Specification.md', 'Pseudocode.md',
  'Architecture.md', 'Refinement.md', 'Completion.md', 'Research_Findings.md', 'Final_Summary.md'];

/** Real prose, comfortably over the emptiness threshold, with no placeholder in it. */
const REAL = '# Документ\n\n' + 'Содержательный абзац про предметную область проекта. '.repeat(12);

/** Build a project and run the real checker over it. */
function check(files, opts) {
  const o = opts || {};
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'p-rep-docs-')));
  try {
    if (!o.noDocs) {
      fs.mkdirSync(path.join(dir, 'docs'), { recursive: true });
      for (const [name, body] of Object.entries(files || {})) {
        fs.writeFileSync(path.join(dir, 'docs', name), body);
      }
    }
    const r = spawnSync(process.execPath, [CHECK, dir], { encoding: 'utf8' });
    return { code: r.status, out: (r.stdout || '') + (r.stderr || '') };
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}

const complete = (over) => Object.assign(
  Object.fromEntries(REQUIRED.map((f) => [f, REAL])), over || {});

describe('the cheap question is asked before the swarm is spent', () => {
  test('P1 - a complete document set exits 0', () => {
    const r = check(complete());
    assert.equal(r.code, 0, 'a full set must pass: ' + r.out);
    assert.match(r.out, /9 проверено/, r.out);
  });

  test('P2 - a missing required document exits 1 and is NAMED', () => {
    const files = complete();
    delete files['Specification.md'];
    const r = check(files);
    assert.equal(r.code, 1, r.out);
    assert.match(r.out, /Specification\.md: отсутствует/, 'the missing one must be named: ' + r.out);
    assert.ok(!/PRD\.md/.test(r.out), 'and the present ones must not be: ' + r.out);
  });

  test('P3 - a document that exists but says nothing exits 1', () => {
    // The case `test -f` misses, and the reason this check is not a one-liner.
    const r = check(complete({ 'Refinement.md': '# Refinement\n' }));
    assert.equal(r.code, 1, r.out);
    assert.match(r.out, /Refinement\.md: пуст или почти пуст/, r.out);
  });

  test('P4 - markdown links and citations are not placeholders', () => {
    // A naive bracket pattern refuses this document, which is entirely legitimate. An eager gate is
    // not a stricter gate — it is a gate people turn off.
    const withLinks = '# Архитектура\n\n'
      + 'Смотри [документацию Postgres](https://www.postgresql.org/docs/) и [ADR-001](docs/ADR.md). '
      + 'Подход описан в [Fowler 2019](https://martinfowler.com/articles/). '.repeat(6);
    const r = check(complete({ 'Architecture.md': withLinks }));
    assert.equal(r.code, 0,
      'markdown links must not read as unfilled placeholders: ' + r.out);
  });

  test('P5 - a project missing only optional documents passes', () => {
    // ADR.md and C4_Diagrams.md are "(if applicable)" in replicate.md. Demanding them would refuse
    // every project without DDD, forever — the trap already closed for Measurable and for growth.
    const r = check(complete());   // neither optional file is present
    assert.equal(r.code, 0, 'optional absence is a legitimate answer: ' + r.out);
  });

  test('P13 - the counter-examples cross-family review supplied', () => {
    // Both REPRODUCED as exit 1 before the fix, and both would have been catastrophic:
    // the first blocks EVERY normally generated project, the second deadlocks a documented flow.
    const mermaid = '# Architecture\n\n```mermaid\ngraph TD\n    A[Web App] --> B[API]\n'
      + '    B --> F[(Database)]\n```\n\n' + REAL;
    assert.equal(check(complete({ 'Architecture.md': mermaid })).code, 0,
      'the BUNDLED sparc-prd-mini skill REQUIRES mermaid (SKILL.md:570-583) — blocking on its node '
      + 'labels would refuse every normally generated Architecture.md');

    const gap = '# Specification\n\n[GAP: needs performance targets from the client]\n\n' + REAL;
    assert.equal(check(complete({ 'Specification.md': gap })).code, 0,
      'Phase 1 writes [GAP: ...] deliberately in --from-docs mode for Phase 2 to resolve '
      + '(replicate.md:82-94). Blocking deadlocks it: the only step that can clear the marker is '
      + 'the one this gate would refuse to start');

    const citations = '# Research_Findings\n\nПо данным [1] и [^2] рынок растёт.\n\n' + REAL;
    assert.equal(check(complete({ 'Research_Findings.md': citations })).code, 0,
      'citations and footnotes are not placeholders');
  });

  test('P14 - bracketed prose WARNS but never blocks', () => {
    // The design change the review forced. This script cannot tell `[описание продукта]` from a
    // diagram label without understanding the document, and a false block stops the whole pipeline —
    // strictly worse than a missed placeholder the Phase-2 swarm would catch anyway. So the two
    // confidence levels are separated, and the uncertain one is not given the power to refuse.
    const r = check(complete({ 'PRD.md': '# PRD\n\n[описание продукта]\n\n' + REAL }));
    assert.equal(r.code, 0, 'bracketed prose must not block: ' + r.out);
    assert.match(r.out, /НЕ блокирует/, 'and must say plainly that it does not: ' + r.out);
    assert.match(r.out, /PRD\.md: возможно незаполнено/, 'while still naming it: ' + r.out);
  });

  test('P6 - an UNAMBIGUOUS placeholder is caught, in both blocking vocabularies', () => {
    // Narrowed by the review: the bracketed-prose vocabulary moved to a warning (P14). What blocks
    // is what cannot be anything else.
    for (const [body, why] of [
      ['# PRD\n\n{{company_name}} строит продукт.\n\n' + REAL, 'a mustache placeholder'],
      ['# PRD\n\nTODO: дописать сегменты.\n\n' + REAL, 'a TODO marker'],
    ]) {
      const r = check(complete({ 'PRD.md': body }));
      assert.equal(r.code, 1, why + ' must block: ' + r.out);
      assert.match(r.out, /PRD\.md: остались/, r.out);
    }
  });

  test('P16 - a markdown task-list checkbox is NOT a placeholder', () => {
    // MEASURED against a real completed /replicate project: 17 lines like `- [ ] AC покрыты
    // автотестами` were reported as "possibly unfilled". Worse, that project's own Completion.md
    // TEACHES the notation — "флажки [ ] при каждом FR-GROWTH-00N" — so this warning fired on the
    // convention the pipeline itself prescribes. Noise on a legitimate convention trains people to
    // ignore warnings, which is the failure this checker exists to prevent, one level down.
    const withBoxes = '# Specification\n\n'
      + '- [ ] AC покрыты автотестами\n'
      + '- [x] События пишутся в аналитику\n'
      + '* [ ] Anti-fraud сценарий задокументирован\n'
      + '| `invite_shown` | [ ] | Share-CTA показан в момент первого рендера |\n\n' + REAL;
    const r = check(complete({ 'Specification.md': withBoxes }));
    assert.equal(r.code, 0, 'checkboxes must not block: ' + r.out);
    assert.ok(!/Specification\.md: возможно незаполнено/.test(r.out),
      'and must not even WARN — a warning on the pipeline own convention is noise: ' + r.out);
  });

  test('P17 - a real bracketed placeholder on a checkbox LINE is still seen', () => {
    // The narrowing must not become an escape hatch: skipping the whole line would let a genuine
    // placeholder hide behind a checkbox prefix.
    const r = check(complete({
      'Specification.md': '# Spec\n\n- [ ] [описание критерия приёмки]\n\n' + REAL,
    }));
    assert.match(r.out, /возможно незаполнено/,
      'a bracketed placeholder AFTER a checkbox must still be reported: ' + r.out);
  });

  test('P18 - Final_Summary.md is reported when absent, and does not block', () => {
    // MEASURED: the pipeline promises it in three places — replicate.md and two sites in
    // sparc-prd-mini, including a whole SYNTHESIS phase — and a real completed project produced
    // 8 of 9 promised documents WITHOUT it. One project is not enough evidence to decide whether
    // the pipeline is broken or the document is optional in practice, and BLOCKING on it would
    // have refused every project that ran like that one.
    // The shared fixture DOES write it, so this case removes it deliberately — the state a real
    // completed project was measured in.
    const files = complete();
    delete files['Final_Summary.md'];
    const r = check(files);
    assert.equal(r.code, 0, 'its absence must not block: ' + r.out);
    assert.match(r.out, /Final_Summary\.md: отсутствует, хотя конвейер его обещает/,
      'but the discrepancy must be NAMED, not silently tolerated: ' + r.out);
  });

  test('P7 - no docs directory exits 2, and an empty one does too', () => {
    const none = check({}, { noDocs: true });
    assert.equal(none.code, 2, 'nothing to check is not "complete": ' + none.out);
    assert.match(none.out, /проверка НЕ выполнена/, none.out);
    assert.match(none.out, /Фаза 1 ещё не отработала/, 'the reason must be named: ' + none.out);

    const empty = check({});
    assert.equal(empty.code, 2, 'an empty docs/ is not "complete" either: ' + empty.out);
  });

  test('P10 - one binary, all three verdicts in a single run', () => {
    const seen = [
      check(complete()).code,
      check(Object.assign(complete(), { 'PRD.md': '# PRD\n' })).code,
      check({}, { noDocs: true }).code,
    ];
    assert.deepEqual(seen, [0, 1, 2], 'expected complete/incomplete/could-not-check: '
      + JSON.stringify(seen));
  });

  test('P11 - Phase 2 runs it BEFORE the swarm and refuses on exit 1', () => {
    const src = fs.readFileSync(path.join(TPL, 'commands', 'replicate.md'), 'utf-8');
    const start = src.indexOf('### Phase 2: VALIDATION');
    const end = src.indexOf('\n### Phase 3', start + 1);
    assert.ok(start > 0 && end > start, 'replicate.md must have a Phase 2');
    const phase2 = src.slice(start, end);

    const call = phase2.indexOf('check-docs-complete.cjs');
    const swarm = phase2.indexOf('Swarm of Validation Agents');
    assert.ok(call > 0, 'Phase 2 must invoke the check');
    assert.ok(swarm > call,
      'the check must precede the swarm, or it cannot save the swarm: call=' + call + ' swarm=' + swarm);
    assert.match(phase2, /\*\*НЕ запускайте рой\.\*\*/,
      'exit 1 must stop the swarm, or the check is advice');
    assert.match(phase2, /это НЕ «всё в порядке»/,
      'exit 2 must be refused as a pass, in the artifact a reader sees');
  });

  test('P8 - prepublishOnly runs the snapshot test', () => {
    // tests/ is in files[] (MEASURED: 29 test files in npm pack --dry-run), so baseline.json SHIPS.
    // prepublishOnly ran only the signature gate, which signs whatever is present — dz sign prints
    // the limit itself: "Ed25519 gives tamper-evidence, never truthfulness." A drifted baseline was
    // therefore signed, shipped and wrong. The source backlog item claimed publish was already
    // blocked; its own ground-check caught that this was false.
    const pkg = JSON.parse(fs.readFileSync(path.join(PKG, 'package.json'), 'utf-8'));
    const pre = pkg.scripts.prepublishOnly || '';
    assert.match(pre, /tests\/snapshot\/templates\.test\.js/,
      'a drifted baseline must not be publishable: ' + pre);
    assert.ok(pre.indexOf('templates.test.js') < pre.indexOf('prepublish-gate'),
      'the snapshot must run BEFORE signing, or a drifted baseline gets signed first: ' + pre);
    assert.ok((pkg.files || []).includes('tests/'),
      'this assertion only matters because tests/ ships — if that changes, revisit');
  });

  test('P9 - it is a hooks component wired to NO event', () => {
    const { COMPONENTS } = require(path.join(PKG, 'src', 'utils.js'));
    assert.ok(COMPONENTS.hooks.items['check-docs-complete'], 'it must be registered');
    const settings = fs.readFileSync(path.join(TPL, 'settings.json'), 'utf-8');
    assert.ok(!settings.includes('check-docs-complete'),
      'this packages hooks are non-blocking by contract; a hook could print but never refuse');
    const statusline = fs.readFileSync(path.join(TPL, 'hooks', 'statusline.cjs'), 'utf-8');
    const m = statusline.match(/hooksExpected:\s*(\d+)/);
    assert.equal(Number(m[1]), Object.keys(COMPONENTS.hooks.items).length,
      'the status line would report a phantom missing hook: ' + m[1]);
  });

  test('P12 - the artifact states its own limit', () => {
    const r = check(complete());
    assert.match(r.out, /документы НАПИСАНЫ, а не что они верны/,
      'a completeness pass looks like a correctness pass and must refuse the reading: ' + r.out);
  });
});

// ── Appended: the resume half of backlog 58575b07 ─────────────────────────────────────────────
// The item asked for automated resume detection. Evidence gathered 2026-08-27 says the automation
// is not the valuable half: /replicate has FOUR interactive checkpoints (MEASURED: `grep -c
// 'Checkpoint:'`), commits after EVERY phase (replicate-pipeline.md:134-137), and — since this same
// feature — a deterministic docs-completeness answer. The item's own verifier said the payoff of
// automation is "modest even post-demo" for a pipeline where a human sits at every checkpoint.
//
// So what shipped is the documentation of the three signals that already exist, plus the recorded
// decision NOT to add branching logic. This test holds that record: a section that says "we decided
// not to" is worth nothing if the next reader cannot find the reasoning.

const { test: resumeTest, describe: resumeDescribe } = require('node:test');

resumeDescribe('an interrupted run can be resumed from what already exists', () => {
  resumeTest('P13 - the three existing resume signals are named, with their commands', () => {
    const src = fs.readFileSync(path.join(TPL, 'commands', 'replicate.md'), 'utf-8');
    const start = src.indexOf('### Прерванный прогон');
    assert.ok(start > 0, 'replicate.md must tell a user how to resume');
    const end = src.indexOf('\n### ', start + 1);
    const sec = src.slice(start, end > start ? end : undefined);

    assert.match(sec, /git log --oneline/, 'the per-phase commits are the phase marker');
    assert.match(sec, /check-docs-complete\.cjs/, 'the deterministic completeness answer');
    assert.match(sec, /p-replicator verify/, 'and the Phase-3 toolkit signal');
    assert.match(sec, /продолжай с Фазы 3/,
      'and a concrete sentence to say, not just a list of probes');
  });

  resumeTest('P14 - the decision NOT to automate is recorded with its reasoning', () => {
    // A skipped item leaves no trace unless the skip is written down. Without this the next reader
    // re-derives the question from scratch, or builds the thing that was deliberately not built.
    const src = fs.readFileSync(path.join(TPL, 'commands', 'replicate.md'), 'utf-8');
    const start = src.indexOf('### Прерванный прогон');
    const end = src.indexOf('\n### ', start + 1);
    const sec = src.slice(start, end > start ? end : undefined);

    assert.match(sec, /сознательно НЕ реализовано/, 'the decision must be stated');
    assert.match(sec, /бэклог `58575b07`/, 'with the item it answers');
    assert.match(sec, /свежая логика ветвления в\s*\n?интерактивном конвейере/,
      'and the reason, so a future reader can disagree with the reason rather than guess it');
    assert.match(sec, /начинайте с\s*\n?того, что перечисленного выше оказалось недостаточно/,
      'and the condition under which revisiting it is warranted');
  });
});

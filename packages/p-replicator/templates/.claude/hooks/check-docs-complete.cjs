#!/usr/bin/env node
'use strict';

/**
 * check-docs-complete.cjs — the cheap question, asked before the expensive one.
 *
 * Phase 2 of /replicate launches a SWARM of validation agents over whatever Phase 1 produced. Between
 * the two there was nothing: existence, emptiness and unfilled placeholders are decidable by this
 * script, and sending a multi-agent swarm to discover them is a layer-1 check living at layer 3.
 *
 * NOT an event hook, like `state-update.cjs`, `check-ports.cjs` and `check-growth-trace.cjs`. This
 * package's hooks are NON-BLOCKING by contract, so a hook could print but never refuse. Invoke it:
 *
 *   node .claude/hooks/check-docs-complete.cjs [path-to-project]
 *
 * Exit codes:
 *   0  every required document exists, has content, and carries no unfilled placeholder
 *   1  a NAMED document is missing, empty, or still a template
 *   2  THE CHECK DID NOT RUN — no docs/ directory, or it could not be read
 *
 * Honest limit, and it is printed on the passing path: this proves the documents were WRITTEN, not
 * that they are correct. Correctness is what the Phase-2 swarm is for; this only stops the swarm
 * being spent discovering an empty file.
 */

const fs = require('node:fs');
const path = require('node:path');

/** What Phase 1 writes. `optional: true` mirrors replicate.md's own `(if applicable)`. */
const DOCS = [
  { file: 'PRD.md' },
  { file: 'Solution_Strategy.md' },
  { file: 'Specification.md' },
  { file: 'Pseudocode.md' },
  { file: 'Architecture.md' },
  { file: 'Refinement.md' },
  { file: 'Completion.md' },
  { file: 'Research_Findings.md' },
  // REPORTED, not required. MEASURED 2026-08-27 against a real completed /replicate project:
  // 8 of 9 promised documents were produced and this one was NOT, though replicate.md and
  // sparc-prd-mini both promise it (three places, including a whole SYNTHESIS phase). One project
  // is not enough evidence to decide whether the pipeline is broken or the document is optional in
  // practice — and blocking on it would have refused every project that ran like that one.
  // The discrepancy is filed; until it is settled this reports rather than refuses.
  { file: 'Final_Summary.md', optional: true, expected: true },
  { file: 'C4_Diagrams.md', optional: true },
  { file: 'ADR.md', optional: true },
];

/** Below this a document has a heading and nothing under it. */
const MIN_CHARS = 200;

function say(s) { process.stdout.write(s + '\n'); }

function cannotCheck(reason, hint) {
  say('⚠️  проверка НЕ выполнена: ' + reason);
  if (hint) say('    ' + hint);
  process.exit(2);
}

/**
 * Unfilled placeholders — and the reason this is split into two confidence levels.
 *
 * The first version used one rule: a bracketed token not followed by `(`. Cross-family review
 * destroyed it with two inputs, both REPRODUCED before this rewrite:
 *
 *   1. `A[Web App]` — a mermaid node. The BUNDLED sparc-prd-mini skill REQUIRES mermaid diagrams in
 *      Architecture.md (SKILL.md:570-583), so the gate blocked every normally generated project.
 *   2. `[GAP: needs performance targets]` — which Phase 1 writes DELIBERATELY in --from-docs mode for
 *      Phase 2 to resolve (replicate.md:82-94). Blocking on it deadlocks the documented flow: the
 *      only step that can clear the marker is the one the gate refuses to start.
 *
 * The lesson is about CONFIDENCE, not about patterns. A false block here stops the whole pipeline,
 * which is worse than a missed placeholder the Phase-2 swarm would have caught anyway. So:
 *
 *   BLOCKING  — shapes that cannot be anything else: `{{…}}`, TODO/TBD/XXX/FIXME.
 *   WARNING   — bracketed prose. Reported by name, never blocking, because this script cannot tell
 *               `[описание продукта]` from a diagram label or a citation without understanding the
 *               document, and guessing wrong costs more than staying quiet.
 */

/** Fenced code blocks hold mermaid, arrays and code — none of it prose, none of it ours to judge. */
function stripFences(body) {
  return body.replace(/^```[\s\S]*?^```/gm, '').replace(/`[^`\n]*`/g, '');
}

const BLOCKING = [
  { re: /\{\{[^}\n]{1,80}\}\}/g, what: 'незаполненный {{шаблон}}' },
  { re: /(?<![\p{L}\p{N}])(TODO|TBD|XXX|FIXME)(?![\p{L}\p{N}])/giu, what: 'маркер TODO/TBD/XXX' },
];

/** A structured marker Phase 2 OWNS. It must reach Phase 2, so it is never a finding here. */
const GAP = /\[GAP:[^\]\n]*\]/g;

const SUSPECT = /\[[^\]\n]{1,80}\](?![(\[])/g;

/**
 * A markdown TASK-LIST CHECKBOX is not a placeholder.
 *
 * MEASURED 2026-08-27 against a real project: `- [ ] AC покрыты автотестами` and 16 siblings were
 * reported as "possibly unfilled". Worse, that project's own Completion.md TEACHES the convention —
 * "флажки `[ ]` при каждом FR-GROWTH-00N" — so this warning fired on the notation the pipeline
 * itself prescribes. Noise on a legitimate convention trains people to ignore warnings, which is
 * the failure this whole checker exists to prevent, one level down.
 */
const CHECKBOX = /^\s*(?:[-*+]\s+)?\[[ xX]?\]/;

function scan(body) {
  const clean = stripFences(body).replace(GAP, '');
  const blocking = [];
  for (const { re, what } of BLOCKING) {
    re.lastIndex = 0;
    for (let m = re.exec(clean); m !== null && blocking.length < 3; m = re.exec(clean)) {
      blocking.push(what + ' «' + m[0].slice(0, 40) + '»');
    }
  }
  const warn = [];
  // Line-wise, so a checkbox can be recognised by its POSITION in the line — `[ ]` anywhere else
  // is not a task item. A table cell holding `| [ ] |` counts too: the same convention, in a table.
  for (const line of clean.split('\n')) {
    if (warn.length >= 3) break;
    // STRIP the checkbox, do not skip the LINE. Skipping it would be an escape hatch: a genuine
    // placeholder could hide behind a checkbox prefix, which is exactly what the test found when
    // the first version skipped whole lines.
    const rest = line.replace(CHECKBOX, '').replace(/\|\s*\[[ xX]?\]\s*\|/g, '| |');
    SUSPECT.lastIndex = 0;
    for (let m = SUSPECT.exec(rest); m !== null && warn.length < 3; m = SUSPECT.exec(rest)) {
      const t = m[0];
      if (/^\[\^?\d+\]$/.test(t)) continue;        // a citation or footnote
      if (/^\[[ xX]?\]$/.test(t)) continue;          // a bare checkbox mid-line
      warn.push(t.slice(0, 40));
    }
  }
  return { blocking, warn };
}

function main() {
  const root = process.argv[2] || '.';
  const docs = path.join(root, 'docs');
  let st;
  try { st = fs.statSync(docs); } catch {
    cannotCheck('нет каталога ' + docs,
      'Фаза 1 ещё не отработала — это НЕ «документы неполны», это «проверять нечего»');
  }
  if (!st.isDirectory()) cannotCheck(docs + ' существует, но это не каталог');

  const problems = [];
  const warnings = [];
  let checked = 0;

  for (const d of DOCS) {
    const abs = path.join(docs, d.file);
    let body;
    try { body = fs.readFileSync(abs, 'utf-8'); } catch (e) {
      if (e && e.code === 'ENOENT') {
        if (!d.optional) problems.push(d.file + ': отсутствует');
        else if (d.expected) warnings.push(d.file + ': отсутствует, хотя конвейер его обещает');
        continue;                                  // an optional absence is a legitimate answer
      }
      cannotCheck('не читается ' + d.file + ': ' + ((e && e.message) || e));
    }
    checked++;
    if (body.trim().length < MIN_CHARS) {
      problems.push(d.file + ': пуст или почти пуст (' + body.trim().length + ' симв., порог '
        + MIN_CHARS + ')');
      continue;
    }
    const { blocking, warn } = scan(body);
    if (blocking.length) problems.push(d.file + ': остались ' + blocking.join(', '));
    if (warn.length) warnings.push(d.file + ': возможно незаполнено — ' + warn.join(', '));
  }

  if (!checked) {
    cannotCheck('в ' + docs + ' не нашлось ни одного SPARC-документа',
      'каталог есть, но пуст — это не «всё в порядке»');
  }

  const sayWarnings = () => {
    if (!warnings.length) return;
    say('⚠️  на глаз (НЕ блокирует — скрипт не отличает шаблон от подписи к диаграмме):');
    for (const w of warnings) say('   • ' + w);
  };

  if (problems.length) {
    sayWarnings();
    say('❌ документы Фазы 1 не готовы к валидации (' + problems.length + '):');
    for (const p of problems) say('   • ' + p);
    say('   Рой валидации запускать рано: он потратит агентов на то, что видно отсюда.');
    process.exit(1);
  }

  sayWarnings();
  say('✅ все обязательные документы на месте, непусты и без незаполненных шаблонов ('
    + checked + ' проверено)');
  say('   Ограничение: это доказывает, что документы НАПИСАНЫ, а не что они верны.');
  say('   Верность — работа роя валидации Фазы 2; проверка лишь не даёт потратить его впустую.');
  process.exit(0);
}

try { main(); } catch (err) {
  cannotCheck('внутренняя ошибка проверки: ' + String((err && err.message) || err));
}

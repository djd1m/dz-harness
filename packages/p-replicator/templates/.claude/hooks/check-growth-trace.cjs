#!/usr/bin/env node
'use strict';

/**
 * check-growth-trace.cjs — did the M5 growth analysis survive into the Specification, or was it
 * analysed and dropped?
 *
 * NOT an event hook. Like `state-update.cjs` and `check-ports.cjs`, it lives here because this
 * directory already carries plain Node utilities; nothing registers it in settings.json. This is
 * deliberate and load-bearing: this package's hooks are NON-BLOCKING by contract (pinned by
 * tests/unit/hooks-project-anchored.test.js, which requires exit 0), so a hook could never refuse
 * anything — it could only print. Invoke it:
 *
 *   node .claude/hooks/check-growth-trace.cjs [path-to-project]
 *
 * Exit codes — three, and the third is the point:
 *   0  every seed row is traced into docs/Specification.md, or rejected on the record
 *   1  the seed table carries rows and the Specification traces none of them
 *   2  THE CHECK DID NOT RUN — no brief, no Specification, or a seed table that would not parse
 *
 * A checker that answers "clean" when it could not look converts an unknown into a reassurance.
 * An ABSENT brief means Phase 0 never ran (the --from-docs entry skips it); that is exit 2, never 0
 * and never 1. "Phase 0 did not run" is not "nothing is missing".
 */

const fs = require('node:fs');
const path = require('node:path');

const BRIEF = path.join('docs', 'product-discovery-brief.md');
const SPEC = path.join('docs', 'Specification.md');

/** The exact token, case-sensitive. Not a title, not a paraphrase — the same definition the
 *  validator's prose gate uses, so the two cannot disagree about what a mention is. */
const ID = /\bFR-GROWTH-(\d{3})\b/g;

/** A line that refuses an obligation. Shared by mentioned() and rejected() so the two rules cannot
 *  disagree about what a refusal looks like. */
const REJECT_WORD = /(отклон\w*|не берём|не беремся|не берем|rejected|declined|out of scope|вне области)/i;

function say(s) { process.stdout.write(s + '\n'); }

/** Exit 2 with a reason. Never merged with "clean": not-run and not-violated are different facts. */
function cannotCheck(reason, hint) {
  say('⚠️  проверка НЕ выполнена: ' + reason);
  if (hint) say('    ' + hint);
  process.exit(2);
}

/**
 * Read one required file. Asks about the EXACT path — never lists a directory and matches names
 * against the listing, because a listing answers a different question than "does this file exist"
 * and the two diverge on case, symlinks and unicode normalisation.
 */
function readRequired(root, rel, absentReason, hint) {
  const abs = path.join(root, rel);
  let st;
  try { st = fs.statSync(abs); } catch { cannotCheck(absentReason, hint); }
  if (!st.isFile()) cannotCheck(rel + ' существует, но это не файл');
  try { return fs.readFileSync(abs, 'utf-8'); } catch (e) {
    cannotCheck('не читается ' + rel + ': ' + ((e && e.message) || e));
  }
  return '';
}

/**
 * The seed rows, as the brief records them.
 *
 * A row is a markdown table row whose FIRST cell is an id. The template ships an example row with
 * a placeholder id inside the module, so a row whose requirement cell is still a bracketed
 * placeholder is a TEMPLATE row, not a real obligation, and counting it would let an untouched
 * template look like a filled-in one.
 */
function seedRows(brief) {
  const rows = [];
  for (const raw of brief.split('\n')) {
    const line = raw.trim();
    if (!line.startsWith('|')) continue;
    const cells = line.split('|').map((c) => c.trim());
    // cells[0] is '' for a leading pipe; the id lives in cells[1]
    const m = /^FR-GROWTH-(\d{3})$/.exec(cells[1] || '');
    if (!m) continue;
    const requirement = cells[2] || '';
    const isPlaceholder = /^\[.*\]$/.test(requirement) || requirement === '...' || requirement === '';
    if (isPlaceholder) continue;
    const status = (cells[5] || cells[4] || '').toUpperCase();
    rows.push({ id: cells[1], speculative: status.includes('SPECULATIVE') });
  }
  return rows;
}

/**
 * Ids the Specification mentions, by the same definition the validator's prose gate uses.
 *
 * A REJECTION LINE IS NOT A MENTION. The two rules overlap on exactly the case that matters: a line
 * reading `FR-GROWTH-001 rejected` contains the exact token, so a naive mention rule reports the
 * obligation as carried forward — and the reason requirement on the rejection path is never reached.
 * MEASURED before this fix: that line exited 0. Cross-family review found the reason-check hole; the
 * hole was one layer deeper, in which of the two rules got to answer first.
 */
function mentioned(spec) {
  const out = new Set();
  for (const line of spec.split('\n')) {
    if (REJECT_WORD.test(line)) continue;   // a refusal is decided by rejected(), which wants a reason
    ID.lastIndex = 0;
    for (let m = ID.exec(line); m !== null; m = ID.exec(line)) out.add(m[0]);
  }
  return out;
}

/**
 * A row may also be REJECTED on the record instead of traced — the validator's prose gate says the
 * same. A rejection is a line naming the id together with a rejection word AND a reason marker,
 * because "FR-GROWTH-004 не берём" with nothing after it is indistinguishable from forgetting.
 */
function rejected(brief, spec, id) {
  const re = new RegExp('^.*\\b' + id + '\\b.*$', 'gm');
  for (const hay of [brief, spec]) {
    for (const line of hay.match(re) || []) {
      const m = REJECT_WORD.exec(line);
      if (!m) continue;
      // The reason must live AFTER the rejection word. Scanning the whole line was a false-clean:
      // cross-family review found that `FR-GROWTH-001 rejected` passed, because the reason pattern
      // included a bare hyphen and the IDENTIFIER contains two of them. MEASURED before the fix —
      // that exact line exited 0. So: look only at the tail, and never at punctuation alone.
      const tail = line.slice(m.index + m[0].length);
      // A reason is WORDS, not a dash. A separator may introduce it but can never be it.
      const hasReason = /[\p{L}\p{N}][\p{L}\p{N}\s]{6,}/u.test(tail.replace(/^[\s:—–-]+/, ''));
      if (hasReason) return true;
    }
  }
  return false;
}

function main() {
  const root = process.argv[2] || '.';
  try { if (!fs.statSync(root).isDirectory()) cannotCheck('это не каталог: ' + root); }
  catch { cannotCheck('путь не существует: ' + root); }

  const brief = readRequired(root, BRIEF,
    'нет файла ' + BRIEF,
    'это значит, что Фаза 0 не запускалась (вход --from-docs её пропускает) — а НЕ что требований по росту не нужно');

  const rows = seedRows(brief);

  // A REUSED id makes the brief malformed, and malformed is exit 2 — never a pass. The module's own
  // rule is that a number is never reused; when it is, two distinct obligations share one token and
  // a SINGLE mention in the Specification marks BOTH traced. Cross-family review found this, and it
  // is the recurring shape: coverage counted over usable ITEMS instead of per POSITION.
  const dupes = [...new Set(rows.map((r) => r.id).filter((id, i, a) => a.indexOf(id) !== i))];
  if (dupes.length) {
    cannotCheck('в таблице-семени повторяются идентификаторы: ' + dupes.join(', '),
      'номер FR-GROWTH-nnn не переиспользуется — пока дубли не разведены, одно упоминание в '
      + 'Specification.md зачло бы сразу два разных требования');
  }

  if (!rows.length) {
    // An empty seed is a legitimate answer ("нет"), but it is not this checker's business: there is
    // nothing to trace. Saying "clean" here would claim a check that did not happen.
    cannotCheck('в брифе нет ни одной заполненной строки FR-GROWTH-nnn',
      'либо M5 не запускался, либо таблица-семя осталась шаблоном — проверять нечего');
  }

  const spec = readRequired(root, SPEC, 'нет файла ' + SPEC,
    'без спецификации не с чем сверять — это не «всё прослежено»');

  const seen = mentioned(spec);
  const missing = rows.filter((r) => !seen.has(r.id) && !rejected(brief, spec, r.id));

  if (missing.length === rows.length) {
    say('❌ ни одно требование по росту не доехало до ' + SPEC + ':');
    for (const r of missing) say('   • ' + r.id + (r.speculative ? ' (SPECULATIVE)' : ''));
    say('   Разбор роста сделан и выброшен — это ровно тот класс потерь, который ловит проверка.');
    process.exit(1);
  }
  if (missing.length) {
    say('❌ часть требований по росту потеряна (' + missing.length + ' из ' + rows.length + '):');
    for (const r of missing) say('   • ' + r.id + (r.speculative ? ' (SPECULATIVE)' : ''));
    say('   Каждое надо либо перенести в ' + SPEC + ', либо отклонить С ПРИЧИНОЙ — молча уронить нельзя.');
    process.exit(1);
  }
  say('✅ все ' + rows.length + ' требований по росту прослежены в ' + SPEC + ' либо отклонены с причиной');
  say('   Ограничение: это доказывает, что обязательство ДОНЕСЛИ, а не что его построили.');
  process.exit(0);
}

try {
  main();
} catch (err) {
  // Even an unexpected failure must not read as "clean".
  cannotCheck('внутренняя ошибка проверки: ' + String((err && err.message) || err));
}

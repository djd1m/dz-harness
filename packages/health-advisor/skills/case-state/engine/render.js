'use strict';

// render.js — the only place a case-state artefact becomes text.
//
// TWO UNCONDITIONAL RULES, both structural rather than stylistic:
//   1. THE STALE BANNER CANNOT BE SUPPRESSED. `renderCitedClaim` prepends it whenever the cited
//      fact is not FRESH, and there is no option, flag or environment variable that removes it.
//      A gate whose output can be silenced is a warning wearing a gate's clothes (ADR-003 §4).
//   2. EVERY RENDERED CONCLUSION NAMES ITS PROFILE PATH AND THE `asOf` IT WAS FOLDED AT. A number
//      without a generation is the defect this slice exists to prevent, and the render is the last
//      place that generation can still be attached (Output Conventions line, plan T6.3).
//
// Numbers come from reading objects only — this module never formats a caller-supplied scalar.

const { FRESH } = require('./freshness.js');

const STALE_BANNER = '⚠ УСТАРЕЛО — НУЖНА ПОВТОРНАЯ ВЫБОРКА';

function fmt(n) {
  if (!Number.isFinite(n)) return '—';
  return Number.isInteger(n) ? String(n) : String(Math.round(n * 1000) / 1000);
}

function renderFold(fold) {
  const lines = [`profile fold  as-of ${fold.asOf}   (source: ${fold.sourcePath})`];
  const ids = Object.keys(fold.analytes);
  if (ids.length === 0) lines.push('  (no observation at or before this date)');
  for (const id of ids) {
    const r = fold.analytes[id];
    lines.push(`  ${id.padEnd(16)}${fmt(r.value)} ${r.unit}   (observed ${r.observedOn})`);
  }
  return lines.join('\n');
}

function renderDiff(d) {
  const lines = [`profile diff  ${d.d1} → ${d.d2}   (source: ${d.sourcePath})`];
  for (const c of d.changed) {
    // d6c52d2c: невычисленная дельта ГОВОРИТ причину (units-differ / non-numeric-value) — пустота
    // читалась как «без изменений» и сожгла цикл; нормализованные единицы несут пометку.
    const note = c.unitNote === 'units-normalized' ? ', units normalized' : '';
    const delta = c.delta === null
      ? (c.deltaRefusal ? ` (delta not computed: ${c.deltaRefusal})` : '')
      : ` (${c.delta > 0 ? '+' : ''}${fmt(c.delta)}${note}, observed ${c.to.observedOn})`;
    lines.push(`  ${c.analyteId.padEnd(16)}${fmt(c.from.value)} → ${fmt(c.to.value)} ${c.to.unit}${delta}`);
  }
  for (const c of d.new) {
    lines.push(`  ${c.analyteId.padEnd(16)}—    → ${fmt(c.to.value)} ${c.to.unit}   (new, observed ${c.to.observedOn})`);
  }
  // A removed analyte is PRINTED. Omitting it would read as "unchanged".
  for (const c of d.removed) {
    lines.push(`  ${c.analyteId.padEnd(16)}${fmt(c.from.value)} ${c.from.unit} → —   (removed, last observed ${c.from.observedOn})`);
  }
  lines.push(`${d.changed.length} changed, ${d.unchanged.length} unchanged, ${d.new.length} new, ${d.removed.length} removed`);
  return lines.join('\n');
}

/** The banner. Its content is derived from the verdict, so it cannot describe a state that is not there. */
function renderStaleBanner(cited) {
  const f = cited.freshness;
  const kind = f.matchedKind === null ? `kind=unmatched, default TTL used (${f.usedDefault})` : `kind=${f.matchedKind}`;
  return [
    STALE_BANNER,
    `  state ${f.state} · fetch_date ${cited.fetchDate === undefined || cited.fetchDate === null ? '—' : cited.fetchDate}` +
    ` · возраст ${f.ageDays === null ? '—' : `${f.ageDays} дн`} · TTL ${f.ttlDays === null ? '—' : `${f.ttlDays} дн`} (${kind})`,
    `  ${cited.sourceUrl}   ·   причина обхода: ${cited.acknowledged}`,
  ].join('\n');
}

/**
 * A citation. NOT FRESH ⇒ the banner is emitted first, always. `mustBanner` comes from
 * makeCitedClaim; if it is set and the banner were somehow absent, this function throws rather than
 * emit a citation that reads as current.
 */
function renderCitedClaim(cited) {
  let body = `«${cited.claim}»\n  ${cited.sourceUrl} (fetch_date ${cited.fetchDate})`;
  // A FRESH verdict that leaned on the FALLBACK TTL ROW says so on the page, not only in the object.
  // `usedDefault:true` existed all along and reached no output surface whatsoever, because this
  // function returns the bare body for anything FRESH — so the one flag distinguishing "this kind
  // has a considered TTL" from "no kind was declared, we used the catch-all" was invisible exactly
  // where a reader forms an opinion about the citation.
  if (cited.freshness.usedDefault === true) {
    body += `\n  (TTL: fallback row, ${cited.freshness.ttlDays} дн — no source kind declared for this fact)`;
  }
  if (cited.freshness.state === FRESH && !cited.mustBanner) return body;
  const out = `${renderStaleBanner(cited)}\n${body}`;
  if (!out.startsWith(STALE_BANNER)) {
    throw new Error('render invariant violated: a non-FRESH citation was about to be emitted without its banner');
  }
  return out;
}

function renderConclusion(conclusion) {
  const lines = [
    conclusion.text,
    ...conclusion.readings.map((r) => `  ${r.analyteId}: ${fmt(r.value)} ${r.unit} (observed ${r.observedOn})`),
  ];
  for (const q of conclusion.openQuestions) {
    lines.push(`  ? открытый вопрос ${q.id} (не блокирующий, ${q.why}): ${q.question}`);
  }
  // Output Convention, unconditional: the profile and the generation the numbers came from.
  lines.push(`  — profile ${conclusion.profilePath}, folded as-of ${conclusion.asOf}`);
  return lines.join('\n');
}

function renderQuestionsDue(due, asOf) {
  if (due.length === 0) return `questions due  as-of ${asOf}: none`;
  const lines = [`questions due  as-of ${asOf}: ${due.length}`];
  for (const q of due) {
    lines.push(`  ${q.blocking ? '[BLOCKING]' : '[note]    '} ${q.id} (${q.why}${q.trigger_date === null ? '' : `, trigger ${q.trigger_date}`})`);
    lines.push(`    ${q.question}`);
    lines.push(`    scope: ${q.scope.join(', ')}`);
  }
  return lines.join('\n');
}

module.exports = { STALE_BANNER, fmt, renderFold, renderDiff, renderStaleBanner, renderCitedClaim, renderConclusion, renderQuestionsDue };

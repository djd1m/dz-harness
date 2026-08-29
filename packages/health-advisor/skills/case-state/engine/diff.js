'use strict';

// diff.js — a PURE comparison of two folds (ADR-002 §5).
//
// A removed analyte is PRINTED, never omitted: an omission reads as "unchanged", and the whole
// point of this verb is that a generation gap must be visible rather than inferred.
//
// Exact-date match only. A date the profile never observed returns the sorted list of dates it did
// observe (schema.js::DateNotObservedError) — never a nearest-match guess, because a guess is a
// silently different question answered.
//
// No `Date.now()` in this file.

const { foldAsOf, requireObservedDate } = require('./profile.js');

/**
 * IDENTICAL-unit aliases — feature из HA-improvements 2026-08 (бэклог d6c52d2c, док
 * 06_case-state_units-and-anchoring.md). НАБЛЮДЕНО 21.08.2026 на профиле в 57 наблюдений:
 * «ферритин 152.6 → 195.2 ug/L» БЕЗ дельты — бланк 2025 говорит нг/мл, бланки 2026 — мкг/л:
 * тождественные величины (1 ng/mL ≡ 1 ug/L), разные строки; отказ был верен, но БЕЗМОЛВЕН.
 *
 * В таблице ТОЛЬКО тождественные пары (коэффициент строго 1). Конверсионные коэффициенты
 * (nmol/L ↔ ng/dL — зависят от молярной массы вещества) сюда не допускаются по построению:
 * дельта, посчитанная через неявную конверсию, — это уже интерпретация, а не арифметика.
 * Ключ — КАНОНИЧЕСКАЯ форма (lowercase, µ→u); обе стороны пары приводятся к ней.
 */
const IDENTICAL_UNIT_ALIASES = new Map([
  // масса/объём: нано на миллилитр ≡ микро на литр (коэффициент 1)
  ['ng/ml', 'ug/l'],
  ['нг/мл', 'ug/l'],
  ['мкг/л', 'ug/l'],
  ['ug/l', 'ug/l'],
  ['µg/l', 'ug/l'],
  // международные единицы: mIU/L ≡ mU/L; µIU/mL ≡ mIU/L
  ['miu/l', 'miu/l'],
  ['mu/l', 'miu/l'],
  ['мме/л', 'miu/l'],
  ['uiu/ml', 'miu/l'],
  ['µiu/ml', 'miu/l'],
  ['мкме/мл', 'miu/l'],
]);

/** Canonical identical-unit form of a unit string, or null when the table does not know it. */
function canonicalUnit(unit) {
  if (typeof unit !== 'string') return null;
  const key = unit.trim().toLowerCase().replace(/µ/g, 'u');
  return IDENTICAL_UNIT_ALIASES.get(key) ?? null;
}

/**
 * Are two unit strings the SAME quantity? Strict string equality first (сегодняшний контракт);
 * else both must resolve to one canonical identical-unit form. Anything outside the table keeps
 * the refusal — but the refusal is now NAMED by the caller, never silent.
 */
function unitsIdentical(a, b) {
  if (a === b) return true;
  const ca = canonicalUnit(a);
  return ca !== null && ca === canonicalUnit(b);
}

function diff(loaded, d1, d2) {
  const profile = loaded && loaded.profile ? loaded.profile : loaded;
  requireObservedDate(profile, d1);
  requireObservedDate(profile, d2);

  const a = foldAsOf(loaded, d1);
  const b = foldAsOf(loaded, d2);
  const ids = [...new Set([...Object.keys(a.analytes), ...Object.keys(b.analytes)])].sort();

  const changed = []; const added = []; const removed = []; const unchanged = [];
  for (const id of ids) {
    const from = a.analytes[id];
    const to = b.analytes[id];
    if (from === undefined && to !== undefined) { added.push({ analyteId: id, to }); continue; }
    if (from !== undefined && to === undefined) { removed.push({ analyteId: id, from }); continue; }
    if (from.value === to.value && from.unit === to.unit && from.observedOn === to.observedOn) {
      unchanged.push({ analyteId: id, from, to });
    } else {
      const identical = unitsIdentical(from.unit, to.unit);
      const delta = (identical && Number.isFinite(from.value) && Number.isFinite(to.value))
        ? to.value - from.value : null;
      // Дельта через таблицу тождественных единиц несёт пометку; невычисленная — ИМЕНОВАННУЮ
      // причину (d6c52d2c: молчаливый пропуск сжёг цикл на выяснении «почему пусто»).
      const unitNote = delta !== null && from.unit !== to.unit ? 'units-normalized' : null;
      const deltaRefusal = delta === null
        ? (identical ? 'non-numeric-value' : `units-differ (${from.unit} → ${to.unit})`)
        : null;
      changed.push({ analyteId: id, from, to, delta, unitNote, deltaRefusal });
    }
  }

  return Object.freeze({
    d1, d2, sourcePath: a.sourcePath,
    changed: Object.freeze(changed), new: Object.freeze(added),
    removed: Object.freeze(removed), unchanged: Object.freeze(unchanged),
    hasChanges: changed.length + added.length + removed.length > 0,
  });
}

module.exports = { diff, unitsIdentical, canonicalUnit };

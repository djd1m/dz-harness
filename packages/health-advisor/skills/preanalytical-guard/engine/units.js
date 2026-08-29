'use strict';

// units.js — placing an observed value against a reference band DECLARED IN ITS OWN UNIT.
//
// THE DEFECT THIS REPLACES (QE F2, MEASURED 2026-08-05). The repeat gate ran
// `obs.value < band.low_below` while the band declared `nmol/L` and the observation carried its
// own unit; the two were never compared. Same conditions, `is_repeat: false`:
//
//     7.9  nmol/L  → withheld repeat_required
//     230  ng/dL   → ADMITTED, withheld_reason null      ← ~8 nmol/L, plainly under the <12 band
//     7.9  ng/dL   → withheld repeat_required
//
// ng/dL is the standard US unit for testosterone (typical range 300–1000), so FR-7/AC-5 was
// unenforced for that entire class of input, silently, and the failure direction was ADMIT.
//
// Two rules, and the second is the load-bearing one:
//
//   1. A declared conversion is applied. Conversions are DATA on the band entry
//      (`unit_conversions`), because a molar-mass factor is analyte-specific — a factor in code
//      would be one analyte's arithmetic pretending to be a law.
//   2. A value that CANNOT be placed against the band — no unit, an unrecognised unit, a
//      non-numeric value — is NOT admitted. `null` here means "uncomparable", and `evaluate()`
//      turns that into `withheld: unit_uncomparable`. The gate exists to catch a value beneath the
//      band; "we could not tell whether it is beneath the band" must never resolve to "it is not".

/**
 * Units compare with case, whitespace and micro-sign spelling folded away, and nothing else.
 * `nmol/L` ≡ `nmol/l` ≡ ` NMOL / L `; `µg` ≡ `ug` ≡ `μg` (MICRO SIGN vs GREEK SMALL LETTER MU).
 * `ng/dL` and `nmol/L` stay distinct — that distinction is the whole point of this module.
 */
function normalizeUnit(unit) {
  return String(unit == null ? '' : unit)
    .normalize('NFKC')
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/[µμ]/g, 'u');
}

/**
 * `value` expressed in `band.unit`, or `null` when it cannot be placed against the band.
 *
 * `null` is UNCOMPARABLE, never "zero" and never "not under the band" — the caller must fail
 * closed on it. Returned for: a non-finite value, an absent/blank unit, or a unit with no declared
 * conversion.
 */
function toBandUnit(band, value, unit) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  if (typeof unit !== 'string' || unit.trim() === '') return null;

  const u = normalizeUnit(unit);
  if (u === normalizeUnit(band.unit)) return value;

  const conversions = band.unit_conversions;
  if (conversions === null || typeof conversions !== 'object' || Array.isArray(conversions)) return null;
  for (const declared of Object.keys(conversions)) {
    if (normalizeUnit(declared) !== u) continue;
    const factor = conversions[declared];
    if (typeof factor !== 'number' || !Number.isFinite(factor) || factor <= 0) return null;
    return value * factor;
  }
  return null;
}

/**
 * Where `value` sits relative to the band: `'under'`, `'at-or-above'`, or `'uncomparable'`.
 * A three-valued answer on purpose — a two-valued one has nowhere to put "we could not tell",
 * and that missing third value is exactly how F2 admitted 230 ng/dL.
 */
function placeAgainstBand(band, value, unit) {
  const converted = toBandUnit(band, value, unit);
  if (converted === null) return 'uncomparable';
  return converted < band.low_below ? 'under' : 'at-or-above';
}

module.exports = { normalizeUnit, toBandUnit, placeAgainstBand };

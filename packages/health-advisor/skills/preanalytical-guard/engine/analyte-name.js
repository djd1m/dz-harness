'use strict';

// analyte-name.js — how a free-text analyte name is compared against the registry.
//
// THE DEFECT THIS REPLACES (QE F3, MEASURED 2026-08-05). Matching used to be
// `trim → lowercase → collapse whitespace`, compared for EQUALITY against the entry's literal
// `analyte` plus a hand-written `aliases` array. At value 7.9 under identical conditions:
//
//     'Total Testosterone'      → withheld companion_missing      (gated)
//     'Testosterone'            → withheld companion_missing      (gated)
//     'Тестостерон общий'       → interpretable:true, no gate     (ESCAPED)
//     'Testosterone, Total'     → interpretable:true, no gate     (ESCAPED)
//     'Total testosterone (T)'  → interpretable:true, no gate     (ESCAPED)
//
// The tempting fix — add those three strings to `aliases` — is the repo's own recurring defect:
// an ENUMERATION WEARING AN ALLOWLIST'S CLOTHES. The fourth spelling escapes exactly as the first
// three did, and nothing in the code says so.
//
// So the fix is split along the line where the two halves genuinely differ:
//
//   ORTHOGRAPHY is folded by CODE. Case, surrounding whitespace, word ORDER, punctuation and
//   parenthetical decoration carry no clinical meaning, so a declared name covers its whole
//   orthographic family: declaring `Total Testosterone` once is what makes `Testosterone, Total`
//   and `Total testosterone (T)` match. One declaration, not three.
//
//   TRANSLATION is DATA. `Тестостерон общий` is not a re-spelling of `Total Testosterone`, it is
//   another language. No normalisation can derive it, so it is DECLARED in `companions.json` —
//   and declaring it there covers ITS whole orthographic family too.
//
//   The RESIDUAL is closed FAIL-CLOSED, not by more data. A name that is neither declared nor
//   derivable, but whose distinguishing terms belong to a GATED analyte, is refused rather than
//   admitted (`registry.confusableWith()` → withheld `unrecognised_variant`). This is the answer
//   to the asymmetry the review named: an UNKNOWN name must never be SAFER than a known one.
//
// Deliberate direction of every judgement call below: when the folding is uncertain it merges
// MORE names onto a gated entry, never fewer. Over-gating costs a spurious "order SHBG"; the
// failure in the other direction is the one that travelled three weeks in the field case.

/**
 * The tokens of an analyte name, after folding away everything orthographic.
 *
 * NFKC first (so full-width and compatibility forms collapse), then case, then PARENTHETICAL and
 * BRACKETED segments are dropped whole — `(T)`, `[serum]`, `(LC-MS/MS)` are laboratory decoration,
 * never the analyte. Everything that is not a letter or a digit then becomes a separator, which is
 * what folds `Testosterone, Total` and `Testosterone/Total` onto the same tokens.
 *
 * HONEST CONSEQUENCE, stated rather than discovered later: dropping parentheticals also merges
 * `Testosterone (free)` onto `Testosterone`, so free testosterone inherits the total's gate. That
 * is over-gating — the safe direction — and it is fixed by DATA (declare a free-testosterone
 * entry), never by weakening the fold.
 */
function tokensOf(name) {
  return String(name == null ? '' : name)
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[(\[{][^)\]}]*[)\]}]?/g, ' ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .split(/\s+/)
    .filter((t) => t.length > 0);
}

/**
 * The comparison key: the DEDUPLICATED, SORTED token set joined by a single space.
 *
 * Sorting is what makes the key order-insensitive; that is the whole mechanism behind
 * `Testosterone, Total` ≡ `Total Testosterone`. Two names with the same key are treated as the
 * same analyte.
 */
function canonicalKey(name) {
  return [...new Set(tokensOf(name))].sort().join(' ');
}

/**
 * Generic laboratory qualifiers — tokens that name a FRACTION, a MATRIX or a MEASUREMENT, never
 * an analyte. Used ONLY to decide which tokens of a gated entry are DISTINGUISHING enough to make
 * an undeclared name confusable with it.
 *
 * The safety direction of this list is worth stating, because it is counter-intuitive: an
 * INCOMPLETE list leaves MORE tokens counted as distinguishing, which makes the fail-closed rule
 * fire MORE often. Forgetting an entry over-gates; it cannot under-gate. An over-broad list is the
 * dangerous edit, which is why every member below is a word that cannot identify an analyte on its
 * own. `preanalytical-guard.test.js :: T18` pins that direction.
 */
const GENERIC_TOKENS = new Set([
  // fraction / preparation
  'total', 'free', 'bioavailable', 'direct', 'indirect', 'calculated', 'estimated',
  // matrix
  'serum', 'plasma', 'blood', 'whole', 'urine', 'saliva', 'venous', 'capillary',
  // measurement noise
  'level', 'levels', 'concentration', 'conc', 'test', 'panel', 'profile', 'assay', 'value',
  'random', 'fasting', 'morning',
  // the same three classes in Russian, because this package's own surfaces are Russian
  'общий', 'общая', 'общее', 'свободный', 'свободная', 'связанный', 'биодоступный',
  'сыворотка', 'сыворотке', 'плазма', 'плазме', 'кровь', 'крови', 'моча', 'моче',
  'уровень', 'анализ', 'показатель', 'натощак', 'расчётный', 'расчетный',
]);

/** The tokens of `name` that could identify an analyte on their own. */
function distinguishingTokens(name) {
  return tokensOf(name).filter((t) => !GENERIC_TOKENS.has(t));
}

module.exports = { tokensOf, canonicalKey, distinguishingTokens, GENERIC_TOKENS };

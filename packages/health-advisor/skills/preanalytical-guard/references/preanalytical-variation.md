# Pre-analytical variation — the domain reference behind the guard

Everything the registry encodes about *what distorts a value before it is measured*, plus an
explicit list of what is tracked and **not yet quantified**. Read this before adding an entry to
`registry/confounders.json`.

## The rule that governs every entry

A registry entry is not a note. It must state:

| Field | Why it is mandatory |
|---|---|
| `effect_magnitude` | "This factor matters" is unactionable. A stated `-34 %` (CLAIMED — field case) can be weighed against the decision. |
| `source` | A number with no provenance cannot be argued with, corrected, or retired. |

`engine/schema.js` throws at load if either is missing. This is the structural rule of the
registry; the list of analytes is data. Deleting every analyte leaves the guard gating on the
universal bundle. Deleting one `effect_magnitude` stops the package loading.

**Do not invent PubMed identifiers.** `source.kind: 'field-case'` exists so an observation from a
real case can be recorded honestly. In a package that runs paranoid mode by default, a fabricated
citation is a worse defect than the gap it papers over.

## Encoded factors

### `fasting-washout-prolonged` — a prolonged fast depresses testosterone

| | |
|---|---|
| Applies to | Total Testosterone, Testosterone |
| Slot | `fasting_hours` ≥ 48 |
| Effect | −34 % at a 56 h fast |
| Source | field case (Step-0 brief, ha-slice-b) — **CLAIMED**, not verified against literature by this repo |
| Action | **withhold** |
| Indistinguishable along | LH / FSH |

The reason this one is a `withhold` and not a caveat: **the pituitary axis cannot tell the
artefact apart from the real thing.** LH and FSH are the usual way to separate a primary from a
secondary deficiency, and at the same LH/FSH profile a fasting-depressed testosterone looks
exactly like a genuinely deficient one. A caveated interpretation would still be an interpretation,
and the interpretation is the thing that reaches a replacement-therapy conversation.

The washout matters as much as the fast: `fast_washout_hours` records how long ago a prolonged
fast **ended**. A value drawn the morning after a 56 h fast is not a value drawn after a normal
overnight fast, and the two are spelled identically in `fasting_state: 'fasted'`.

### `fasting-washout-window-open` — the artefact outlives the fast

| | |
|---|---|
| Applies to | Total Testosterone, Testosterone, Тестостерон общий |
| Slot | `fast_washout_hours` < 48 |
| Effect | **up to** −34 % — an UPPER BOUND carried over from the entry above, not a measurement of the residual |
| Source | field case (Step-0 brief) — **CLAIMED**, and doubly so: neither the window length nor the residual size was measured here |
| Action | **withhold** |
| Indistinguishable along | LH / FSH |

Added 2026-08-05 after QE F1 measured the gap. `fasting_hours` and `fast_washout_hours` answer
**different questions**, and only the first was being read: `fasting_hours: 4` with
`fast_washout_hours: 4` — a draw four hours after a 56 h fast ended — evaluated to
`conditions_verified`, `interpretable: true`, with no caveat, and went to the interpretation engine.
The moment a prolonged fast ends, `fasting_hours` resets. The artefact does not.

**Where the 48 h comes from, stated plainly:** it is set EQUAL to the fast threshold of the entry
above, on this document's own sentence — *the washout matters as much as the fast*. Both figures in
this entry are **CLAIMED** (field case): the 48 h window length, and the −34 % as an upper bound on
what remains inside the window. Neither was measured by this repo, and the entry's `source.citation`
says so in the same words. The `withhold` is justified by **the unknown**, not by the number: we
cannot say how much of the artefact has cleared, so we do not interpret. `preanalytical-guard.test.js :: T21` pins both figures
and their provenance, so changing either forces the conversation about where the new number came
from — the same discipline T14 applies to the unquantified slots.

### `sleep-debt-week` — a week of short sleep depresses testosterone

| | |
|---|---|
| Applies to | Total Testosterone, Testosterone |
| Slot | `sleep_hours_7d_mean` ≤ 5 |
| Effect | −12.5 % (range −10 … −15 %) |
| Source | field case (Step-0 brief, ha-slice-b) — **CLAIMED** |
| Action | **caveat** |

The other action path, and a deliberate contrast with the entry above: the effect is real and
sizeable but does not masquerade as a specific diagnosis along a named axis, so the value is
admitted and the magnitude travels with it. This is the entry to copy when adding a factor that
should annotate rather than block.

## Tracked but **not yet quantified**

These are first-class slots of `SamplingConditions` — their absence still drives
`conditions_unknown` for any analyte whose profile names them. `collected_at` (time-of-day) still
ships with **no** `confounders.json` entry, because no per-analyte diurnal amplitude has been
sourced yet:

| Slot | Status | What is missing |
|---|---|---|
| `collected_at` (time-of-day) | tracked-but-unquantified | the diurnal amplitude per analyte, and the reference window each lab assumes |

`exertion_washout_hours` was in this table until backlog HA 9217c9d5 (iron/CK slice): it now carries
a `confounders.json` entry for **creatine kinase** (`exertion-washout-ck`), keyed to a published
literature magnitude — CK rises within 24 h to as high as ~30×ULN and normalises over ~7 days, so a
sample inside a 168 h post-exertion window is caveated. That is the *only* analyte the number is
sourced for; the slot stays unquantified for every other analyte until its own citation lands.

Time-of-day remains unquantified. It is known to matter. It has no number this repo can stand behind
yet. Shipping it as a condition slot with no magnitude is the honest half: the guard records that the
information was collected, and refuses to pretend it knows what to do with it yet.
`preanalytical-guard.test.js` :: **T14** pins that `collected_at` carries no magnitude, and that any
`exertion_washout_hours` entry cites a real literature/vendor source (never an invented one) — so a
future contributor who adds a magnitude must also update that test, which forces the conversation
about where the number came from.

## How an analyte NAME is matched

Added 2026-08-05 after QE F3 measured every unlisted spelling of a gated analyte walking past the
gate — including `Тестостерон общий`, the name this package's own README, role file and worked
example use. Matching had been equality after whitespace-collapse, against a hand-written alias list.

The work is split along the line where the halves genuinely differ:

| Layer | What it handles | Where it lives |
|---|---|---|
| Orthography | case, whitespace, word ORDER, punctuation, parenthetical decoration | `engine/analyte-name.js` (code) |
| Translation | another language, or a genuinely different term | `registry/*.json` `aliases` / `requires_aliases` (data) |
| Everything else | an undeclared name sharing a GATED analyte's identifying term | `registry.confusableWith()` → withheld `unrecognised_variant` (fail-closed) |

A name is compared by its **deduplicated, sorted token set**, so declaring `Total Testosterone`
*once* covers `Testosterone, Total`, `total-testosterone` and `Total testosterone (T)`. That is the
difference between a normalisation and an enumeration: adding three more full-name aliases would
have left the fourth spelling escaping exactly as the first three did.

**An unknown name must never be safer than a known one.** Before the fix an undeclared spelling of
total testosterone reached the engine while every declared spelling was withheld — the inversion the
whole guard exists to prevent. So a name the registry does not know, whose *distinguishing* tokens
belong to a gated entry, is now refused rather than admitted. The rule is deliberately narrow: it
fires only on shared terms, so an unrelated unregistered analyte is still admitted with its caveat
(`conditions_unknown`, ADR-002).

Three residuals, stated rather than discovered later — all three asserted in `:: T18`:

- A **misspelling** (`Testosteron`) shares no token with any declared name and escapes both legs.
  Closing it needs edit-distance, which would also merge genuinely different analytes.
- The fold is **over-inclusive on purpose**: `Testosterone (free)` merges onto `Testosterone` and
  inherits its gate. Over-gating costs a spurious "order SHBG"; the failure in the other direction
  cost three weeks in the field case. Fix it with DATA (declare a free-testosterone entry), never by
  weakening the fold.
- The **generic-qualifier list** (`total`, `free`, `общий`, `serum`, …) fails safe by construction:
  forgetting a member leaves more tokens distinguishing, which gates MORE names. It can over-gate;
  it cannot under-gate.

## Companion analytes

### `total-testosterone-requires-shbg`

Total testosterone is the sum of tightly-bound, weakly-bound and free fractions. A shift in SHBG
moves the total without moving the free fraction at all — and the free fraction is the part the
clinical question is usually about. Total testosterone **alone** therefore cannot distinguish a
binding-protein change from a real one.

`requires: ['SHBG']` **blocks**. `recommends: ['Albumin']` does not — it improves the free-androgen
calculation but its absence does not make the value uninterpretable. That split is the whole point
of having two fields; a `recommends` entry that blocks would make every incomplete panel unusable
and the user would route around the guard entirely.

Cost of the miss, measured in the field case: the gap surfaced only in **week 3**, and a
replacement-therapy discussion was already in view — built on a value that was probably an
artefact.

## The repeat gate

Up to **30 %** of first out-of-band values return inside the band on a plain repeat, with no
treatment at all (CLAIMED — field case). So a first value under the band produces a
`Requirement{kind: 'repeat'}`, not a conclusion.

The band itself (`registry/reference-bands.json`) is read from the **third-party engine's own
documentation** — `source.kind: 'vendor-documented'` — never obtained by running it. The guard has
to decide before anything is sent downstream, so it cannot ask the thing it is gating.

**The comparison is unit-aware, and three-valued.** QE F2 measured the gate running
`obs.value < band.low_below` across a `nmol/L` band and an observation carrying its own unit, so
`230 ng/dL` — about 8 nmol/L, plainly under the `<12` band — was **admitted** with
`withheld_reason: null`. ng/dL is the standard US unit for testosterone, so the gate was unenforced
for that entire class of input, silently.

Conversions are DATA on the band entry (`unit_conversions`), because a molar-mass factor is
analyte-specific — a factor in code would be one analyte's arithmetic pretending to be a law. They
carry `unit_conversions_source` with `source.kind: 'arithmetic'`, a kind that exists so a DERIVED
figure can state its derivation without dressing itself as a measurement. A wrong factor mis-gates
every value reported in that unit, so it earns provenance like every other number here.

The third value is the load-bearing one. `placeAgainstBand()` answers `under` / `at-or-above` /
**`uncomparable`**, and a value with no unit, an undeclared unit or a non-numeric reading is withheld
`unit_uncomparable`. A gate that cannot tell whether a value is beneath the band must never answer
"no" — that missing third value is exactly how 230 ng/dL got through.

## What the guard never does

- It never **corrects** a value. A `-34 %`-adjusted testosterone is a second, unattributable
  number that would flow into reference comparison, pattern detection and the summary with no way
  to tell it from a measurement. Magnitudes are **reported, never applied**.
- It never separates the caveat from the conclusion. A caveat in its own section is a caveat any
  downstream renderer can drop.
- It never treats "unknown" as "fine". `conditions_unknown` is a terminal, legal state — the same
  shape as `inconclusive`, `insufficient-data` and `LISTING_ONLY` elsewhere in this repo.

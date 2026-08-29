---
name: health-advisor-preanalytical-guard
description: 'Pre-analytical guard — checks what distorts a lab value BEFORE the value is interpreted. Encodes, per analyte, which sampling conditions confound it (with an effect magnitude and a source) and which companion analytes it cannot be read without. Use before any lab interpretation.'
measurable_outcome: Every observation carries a condition audit, and no value is sent for interpretation before its pre-analytical conditions have been checked.
allowed-tools:
  - Read
  - Bash
---

# Pre-Analytical Guard

## Overview

A lab number is not a fact about the body until you know **how it was drawn**. The same total
testosterone can mean "this person is deficient" or "this person fasted for 56 hours" — and the
pituitary axis (LH/FSH) cannot tell the two apart. This skill runs **before** interpretation, not
after it.

It does three things:

1. **Audits the sampling conditions** of every observation against one atomic bundle — time of
   sampling, fasting state and hours, washout after a prolonged fast, washout after intense
   exertion, mean sleep across the last week, and whether this draw is a repeat.
2. **Partitions the observations** into *admitted* and *withheld*. Only admitted values are ever
   handed to `health-advisor-lab-results`. A withheld value is never interpreted, because the
   interpretation engine mints its sentence the moment a value enters it — filtering the output
   afterwards is not "before".
3. **Emits requirements instead of conclusions** for anything withheld: order the missing
   companion analyte, repeat the draw, or record which distorting factor was present and how large
   its effect is.

Three outcomes, and the middle one is the point:

| Audit state | What it means | What may be said |
|---|---|---|
| `conditions_verified` | the bundle arrived complete and nothing distorting fired | the interpretation, plainly |
| `conditions_unknown` | the check RAN and could not establish the conditions | the interpretation **plus** an inseparable caveat |
| `conditions_violated` | a recorded factor was present at sampling | for a `withhold` factor: no interpretation at all |

A withheld value always names WHY, in one of six registers:

| `withheld_reason` | Meaning |
|---|---|
| `companion_missing` | a required companion analyte is absent from the batch |
| `confounder_withhold` | a recorded distorting factor was present at sampling |
| `repeat_required` | a first value beneath the documented band repeats before it concludes anything |
| `unit_uncomparable` | the value cannot be placed against its band in the unit reported — undecided, not "no" |
| `unrecognised_variant` | the name is not one the registry declares, but it identifies something that IS gated |
| `engine_unavailable` | the interpretation engine could not be reached — never "no findings" |

**`conditions_unknown` is a terminal, legal state — not "pending", not "error", not "low
confidence".** It is the same shape as `inconclusive` in `dz skills-verify` and
`insufficient-data` in `dz compounding`: anything that prevents an honest observation yields the
third verdict, never a pass.

## Dependencies

- **Node.js ≥ 18** — the engine is zero-dependency CommonJS under `engine/`
- **`engine/index.js`** — the only public surface: `SamplingConditions`, `loadRegistry`,
  `evaluate`, `attach`, `render`
- **`registry/*.json`** — the DATA: confounders, companions, reference bands, universal slots
- **`health-advisor-lab-results`** — the third-party interpretation engine this guard sits in
  front of. **Never modified, never imported, never subprocessed from `engine/`.** The guard
  writes an input object and reads an output object; you run the engine between the two.
- **Module 0 (Intake)** — where the conditions bundle is actually collected. If intake asks, most
  values arrive `conditions_verified` and this guard stays quiet. The guard is the floor, not the
  plan.

## Workflow

### Step 1 — build the conditions bundle (atomic; a missing key throws)

```js
const { SamplingConditions, loadRegistry, evaluate, attach, render } =
  require('./engine/index.js');
const U = SamplingConditions.UNKNOWN;

const conditions = SamplingConditions.of({
  collected_at:           '2026-08-04T08:10:00Z',
  fasting_state:          'fasted',
  fasting_hours:          56,
  fast_washout_hours:     0,
  exertion_washout_hours: 72,
  sleep_hours_7d_mean:    5,
  is_repeat:              false,
});
```

Every slot must be present. A slot the patient does not know is `SamplingConditions.UNKNOWN` — a
recorded clinical fact. An **absent key** is a programming error and throws, which is what makes
"we never asked" impossible to render as "the conditions were fine".

### Step 2 — evaluate

```js
const registry = loadRegistry();
const { readout, ticket } = evaluate(
  [{ analyte_id: 'Total Testosterone', value: 7.9, unit: 'nmol/L' }],
  conditions,
  registry
);
```

`evaluate` has no options object. There is no `skipGuard`, no `skipCompanions`, no `force` — a
safety check the caller can narrow is not a safety check.

### Step 3 — run the interpretation engine on the ADMITTED set only

```js
const acl = require('./engine/acl-lab-results.js');
const input = acl.toEngineInput(readout, { sex: 'male' });
// input.results contains ONLY admitted observations.
// Write it to a temp file and run the third-party engine on it, e.g.:
//   python3 ../lab-results/coworker.py  (invoke via health-advisor-lab-results)
// Note: the engine reads only `sex` from patient_context — its documented `fasting`
// key is prose, and `input.ignored_context_keys` says so out loud.
```

If `input.results` is empty, **do not run the engine at all** and do not improvise an
interpretation. Report the requirements.

### Step 4 — merge under the ticket

```js
const merged = attach(ticket, engineJson);   // THROWS off-ticket / reused / foreign
```

`attach` refuses any interpretation for an analyte the ticket did not admit. That is the structural
answer to the obvious cheat — run the engine on everything and merge afterwards. If the engine
could not be reached, every admitted value degrades to `withheld: engine_unavailable`; an
unreachable engine is never "no findings".

### Step 5 — render (the only wording surface)

```js
console.log(render(merged));   // or render(readout) when the engine was never run
```

The caveat is emitted **inside** the interpretation line, never as a separate section a downstream
renderer could drop. When anything was withheld, the engine's own `patient_summary` is not passed
through — the guard emits its own partition line instead, because cross-test aggregates were
computed over a reduced set.

## Extending the registry

Adding an analyte, a confounder, a threshold, a magnitude, a source or a companion pair is a
**data-only** edit to `registry/*.json`. Every entry must carry `effect_magnitude` and `source`, or
the package refuses to load — that obligation is the rule; the list of analytes is not.

**Stated limit:** adding a new *operator* (`lt`, `lte`, `gt`, `gte`, `between`, `eq`, `is_unknown`,
`missing`) is a code edit. Extensibility is true of the registry's content and false of its grammar.

**Names, and why the alias list is short.** `engine/analyte-name.js` folds case, whitespace, word
ORDER, punctuation and parenthetical decoration, so declaring `Total Testosterone` once already
covers `Testosterone, Total`, `total-testosterone` and `Total testosterone (T)`. Declare a name only
when no fold can derive it — a TRANSLATION (`Тестостерон общий`) or a genuinely different term.
Piling up spellings is the failure mode this replaced: an enumeration wearing an allowlist's clothes,
where the fourth spelling escapes exactly as the first three did.

A name the registry does not know, but whose identifying term belongs to a **gated** analyte, is
withheld `unrecognised_variant` rather than admitted. An unknown name must never be safer than a
known one. An unregistered analyte that shares no gated term is still admitted with its caveat.

**Units, and why a missing one blocks.** A reference band declares its own `unit` and may declare
`unit_conversions` (with a mandatory `unit_conversions_source`). A value the guard cannot place
against the band — no unit, an undeclared unit, a non-numeric reading — is withheld
`unit_uncomparable`, never quietly treated as being in the band's unit.

**Never invent a citation.** `source.kind: 'field-case'` exists so an unverified field observation
can be recorded honestly. See `references/preanalytical-variation.md`.

## Anti-Patterns

| Anti-pattern | Detection signal | Correction |
|---|---|---|
| Interpreting a value before its conditions were checked | a status or interpretation exists for an observation with no audit | **BLOCK** — run `evaluate()` first; there is no other path |
| Treating `conditions_unknown` as `conditions_verified` | "conditions were fine" appears where nothing was collected | Unknown is a state, not a missing field. Say what is unknown and what it could change |
| Interpreting total testosterone without SHBG | a low/normal/high judgement on total T alone | **BLOCK** — order SHBG; the total cannot separate a binding-protein shift from a real change |
| Running the engine on everything and filtering the output | `attach()` throws `TicketMismatch` | The engine mints its sentence on entry. Gate the input, not the output |
| Applying an effect magnitude to "correct" a value | a number appears that no lab reported | Magnitudes are reported, never applied. A corrected value is unattributable |
| Putting the caveat in a separate notes section | an interpretation string that reads cleanly on its own | The caveat travels inside the line. A droppable caveat is not a caveat |
| Adding a registry entry with a made-up PubMed id | `source.kind: 'literature'` with an unverifiable citation | Use `field-case` and say so. A fabricated citation is worse than the gap |
| Reading a green test here as "no bypass exists" | claims that direct invocation is prevented | It is not. `/health-advisor-lab-results` remains directly invocable; that path is covered by prose only |

## Honest scope

The guard binds **its own API**. It cannot stop a human or an agent from invoking
`/health-advisor-lab-results` directly, or from running the interpretation engine by hand — that
skill is third-party and no defence may be added inside it. That residual path is covered only by
the anti-pattern row in the always-loaded role file. A passing test suite here proves the guard's
own paths are closed; it does not prove the others are.

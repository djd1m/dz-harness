# Module 1: Patient Profile Analysis

## Purpose
Analyze structured patient data to identify deviations, syndromes, risks, and dynamics.

## MANDATORY pre-step — the pre-analytical guard

**Before any lab value is classified, compared to a reference, or turned into a syndrome, run
`preanalytical-guard` over the whole panel together with the sampling-conditions bundle collected
in Module 0.** Interpret only the values it admits.

- A value it **withholds** produces a *requirement* — order the missing companion analyte, repeat
  the draw, or record the distorting factor — never a low/normal/high judgement.
- A value it admits as `conditions_unknown` may be interpreted, but the caveat travels **inside**
  the conclusion, not in a separate notes section.
- `conditions_unknown` is a terminal state, not a missing field. "We did not ask" must never be
  written as "the conditions were fine".

Two rules that fire most often here, both from a real case:

| Situation | What Module 1 must do |
|---|---|
| Total testosterone with no SHBG in the same panel | Do not compute or judge it. Order SHBG. (Free Androgen Index below already needs SHBG — the guard makes that a blocking requirement rather than a silently skipped row.) |
| Any first value beneath its reference band | Propose a repeat before drawing a conclusion — up to 30 % of such values return inside the band on a plain repeat, untreated (CLAIMED — field case) |

## MANDATORY pre-step — open the case and re-read every value in THIS call

Before ANY calculation below, open a case session at an EXPLICIT as-of date and read each analyte
from the profile in the same call that uses it. A value carried in from earlier in the conversation
is a real number of an unknown generation, and that is how a conclusion once rested on a
six-month-old triglyceride nobody could see was stale.

```
node <package>/skills/case-state/engine/cli.js profile validate <case>/profile.json <as-of>
node <package>/skills/case-state/engine/cli.js profile diff    <case>/profile.json <d1> <d2>
```

In code: `openCase({ profilePath, asOf })` → `session.readAnalyte(id)` → `makeConclusion({ session,
readings, text })`. There is no session without a profile and no fold without an explicit `asOf`.

**This block is a layer-4 support measure and is recorded as one.** It is an instruction the agent
must remember, so it is NOT the gate and is not counted in any machine confirmation: the gate is
`skills/case-state/engine/session.js`, which makes a conclusion built from a remembered number
unconstructible rather than merely discouraged. This block covers the prose the code cannot reach.

## Automatic Calculations

### Derived Metrics
| Metric | Formula | When to calculate |
|--------|---------|-------------------|
| BMI | weight / (height_m)^2 | Always |
| HOMA-IR | (insulin * glucose) / 22.5 | If insulin + glucose available |
| GFR (CKD-EPI) | CKD-EPI formula by age, sex, creatinine | If creatinine available |
| Atherogenicity Index | (TC - HDL) / HDL | If TC + HDL available |
| Non-HDL Cholesterol | TC - HDL | If TC + HDL available |
| TG/HDL ratio | TG / HDL | If TG + HDL available (insulin resistance marker) |
| Free Androgen Index | (Total T * 100) / SHBG | If testosterone + SHBG available |

### Syndrome Identification

**Metabolic Syndrome** (IDF criteria — 3 of 5):
- [ ] Waist >94 cm (men) or >80 cm (women)
- [ ] TG >1.7 mmol/L
- [ ] HDL <1.03 (men) or <1.29 (women)
- [ ] BP >130/85 or on treatment
- [ ] Fasting glucose >5.6 or on treatment

**Insulin Resistance:**
- HOMA-IR >2.5
- HbA1c 5.7-6.4% (prediabetes)
- TG/HDL ratio >1.5 (surrogate marker)

**Dyslipidemia Classification:**
- Isolated hypercholesterolemia (LDL elevated, TG normal)
- Isolated hypertriglyceridemia (TG elevated, LDL normal)
- Combined (both elevated)
- Low HDL

**CKD Staging:**
- G1: GFR ≥90 (normal)
- G2: GFR 60-89 (mild)
- G3a: GFR 45-59 (moderate)
- G3b: GFR 30-44 (moderate-severe)
- G4: GFR 15-29 (severe)
- G5: GFR <15 (kidney failure)

### CV Risk Assessment
Use SCORE2 or SCORE2-OP (>70y) if applicable. Note presence of:
- Subclinical atherosclerosis (any plaque on imaging)
- Diabetes / prediabetes
- Family history of premature CVD
- Smoking
- Hypertension

### Dynamics Analysis (if >1 test)
For each parameter present in both tests:
- Calculate absolute and % change
- Flag significant changes (worsening vs improvement)
- Identify trends
- Correlate changes with interventions (medications started between tests)

## Output Format

### Risk Summary Table
| Risk Category | Level | Key Drivers | Action Priority |
|---|---|---|---|

### Deviations Table
| Parameter | Value | Reference | Status | Clinical Significance |
|---|---|---|---|---|

### Dynamics Table (if applicable)
| Parameter | Test 1 (date) | Test 2 (date) | Change | Trend |
|---|---|---|---|---|

### Identified Syndromes
- List with diagnostic criteria met

### Recommended Additional Tests
- Tests that would help clarify the picture but were not done

## Прогностические горизонты

Любое утверждение о риске или долголетии, которое пациент может прочитать как «сколько мне
осталось», эмитится блоком из `formats/prognosis-horizons.md`: оба горизонта — lifespan
(продолжительность жизни) и healthspan (срок сохранной дееспособности) — с диапазоном и
основанием, строка «Ваша цель», без числовой оценки продолжительности жизни (правило
«Не оценивать прогноз жизни» действует).

## Triggers
After completion, present module selection menu to patient.

---
name: health-advisor-lab-results
description: 'Lab Results agent for healthcare workflows.'
measurable_outcome: Execute skill workflow successfully with valid output within 15 minutes.
allowed-tools:
  - Read
  - Bash
---

<!--
COPYRIGHT NOTICE — part of the "Universal Biomedical Skills" project.
Copyright (c) 2026 MD BABU MIA, PhD <md.babu.mia@mssm.edu>. All Rights Reserved.
This code is proprietary and confidential. Unauthorized copying via any medium is prohibited.
Provenance: Authenticated by MD BABU MIA
-->


# Lab Results

## Overview

This skill automates the analysis and interpretation of laboratory test results within healthcare workflows. It processes structured lab data, classifies values against reference ranges (including critical thresholds), identifies cross-test clinical patterns (e.g., anemia, renal impairment, dysglycemia), and generates both patient-friendly summaries and clinical recommendations. The underlying engine is `coworker.py`, which provides deterministic evaluation logic; the AI agent layer adds demographic-aware interpretation, contextual reasoning, and safety guardrails.

## Dependencies

- **Python 3** — runtime for `coworker.py` execution
- **coworker.py** — core interpretation engine at `skills/extended/lab-results/coworker.py`
- **Read / Bash** — permitted tools for file access and script execution
- **Patient profile data** (optional) — age, sex, ethnicity, medications, and relevant diagnoses for personalized interpretation

## Workflow

Follow these steps in order when this skill is invoked:

### Step 1: Gather Input

Collect lab results in structured format. Each result must include:

| Field       | Type   | Required | Description                        |
|-------------|--------|----------|------------------------------------|
| `test_name` | string | Yes      | Standardized test name (see supported tests below) |
| `value`     | float  | Yes      | Numeric result value               |
| `unit`      | string | No       | Unit of measurement (auto-filled from reference if omitted) |

Optionally collect a `patient_context` dictionary:

| Field         | Type   | Description                                      |
|---------------|--------|--------------------------------------------------|
| `age`         | int    | Patient age in years                              |
| `sex`         | string | "M" or "F" -- affects reference range selection   |
| `ethnicity`   | string | May affect certain reference ranges (e.g., eGFR)  |
| `medications` | list   | Current medications that may affect lab values     |
| `conditions`  | list   | Known diagnoses for contextual interpretation      |
| `fasting`     | bool   | Whether patient was fasting (affects glucose, lipids) |

### Step 2: Run the Interpreter

```bash
python3 skills/extended/lab-results/coworker.py
```

Or invoke programmatically:

```python
from coworker import LabResultsCoworker

coworker = LabResultsCoworker()
results = coworker.interpret_results(lab_results, patient_context=patient_context)
```

### Step 3: Review Output

The `interpret_results()` method returns a dictionary with:

```json
{
  "results_count": 8,
  "interpretations": [
    {
      "test_name": "Hemoglobin",
      "value": 10.5,
      "unit": "g/dL",
      "reference_range": "12.0 - 17.5",
      "status": "low",
      "interpretation": "May indicate anemia; discuss with your doctor",
      "description": "Carries oxygen throughout your body"
    }
  ],
  "patterns": [
    {
      "pattern": "Anemia",
      "supporting_results": ["Hemoglobin", "RBC"],
      "recommendation": "Follow up with your doctor about anemia evaluation"
    }
  ],
  "patient_summary": "Out of 8 tests, 5 are normal and 3 are outside the typical range...",
  "clinical_recommendations": ["..."],
  "critical_values": [],
  "abnormal_count": 3,
  "interpreted_at": "2026-04-19T12:00:00",
  "trace": "<thinking>...</thinking>"
}
```

### Step 4: Apply Demographic Adjustments

The current `coworker.py` uses generic adult reference ranges. When `patient_context` is provided, the agent MUST apply demographic-adjusted reasoning:

- **Sex-based ranges**: Hemoglobin (F: 12.0-16.0, M: 14.0-17.5), RBC (F: 4.0-5.0, M: 4.5-5.5), Hematocrit (F: 36-44, M: 40-50)
- **Age-based ranges**: Alkaline Phosphatase is higher in children/adolescents; creatinine is lower in elderly with reduced muscle mass
- **Ethnicity considerations**: eGFR calculation varies by race; some populations have different baseline WBC ranges
- **Fasting status**: Glucose reference (fasting: 70-100, non-fasting: 70-140); triglycerides require fasting for accurate interpretation

When the code does not automatically adjust, note the demographic consideration in your interpretation text.

### Step 5: Format Final Output

Generate output in both Markdown and (optionally) HTML format. The output MUST include:

1. **Patient summary** — plain-language overview
2. **Results table** — all values with status indicators
3. **Abnormal values detail** — expanded interpretation for each abnormal result with PubMed references where applicable
4. **Clinical patterns** — cross-test pattern analysis
5. **Recommendations** — follow-up suggestions (never treatment changes)
6. **Medical disclaimer** (mandatory, see below)

### Step 6: Append Medical Disclaimer

Every output MUST end with:

> **Disclaimer**: This analysis is generated by an AI system and is intended for informational purposes only. It does not constitute medical advice, diagnosis, or treatment. Laboratory results must be interpreted by a qualified healthcare provider in the context of the patient's complete clinical picture. If you have critical values, contact your healthcare provider immediately.

## Supported Lab Tests

The following tests have built-in reference ranges and clinical context:

| Category | Tests |
|----------|-------|
| **CBC** | WBC, RBC, Hemoglobin, Hematocrit, Platelets |
| **BMP** | Glucose, BUN, Creatinine, Sodium, Potassium |
| **Lipid Panel** | Total Cholesterol, LDL, HDL, Triglycerides |
| **Thyroid** | TSH, Free T4, Free T4 (pmol/L) |
| **Liver Function** | AST, ALT, Alkaline Phosphatase, Total Bilirubin, GGT |
| **Cardiac** | Troponin I, BNP |
| **Diabetes / Metabolic** | HbA1c, HOMA-IR, Insulin, Fasting Insulin |
| **Muscle / Tissue** | CPK (CK) |
| **Vitamins** | Vitamin D, 25-OH Vitamin D, Vitamin D (25-OH) |
| **Hormones** | Total Testosterone, Testosterone, Free Testosterone |
| **Iron Studies** | Ferritin |
| **Other** | Uric Acid |

For tests not in this list, the agent should note that no built-in reference range is available and defer to the lab's reported reference range if provided.

## Pattern Detection

The engine automatically detects these cross-test clinical patterns:

- **Anemia** — low Hemoglobin (with RBC correlation)
- **Renal impairment** — elevated Creatinine (with BUN correlation)
- **Dysglycemia** — elevated Glucose and/or HbA1c
- **Thyroid dysfunction** — abnormal TSH (with Free T4 correlation)
- **Cardiovascular risk** — elevated LDL with low HDL
- **Metabolic syndrome** — high Triglycerides + low HDL + elevated Glucose/HbA1c + high HOMA-IR (3+ markers)
- **Vitamin D deficiency** — low or critically low Vitamin D (25-OH)
- **Hormonal-metabolic pattern** — low Testosterone with elevated Insulin/HOMA-IR

## Error Handling

| Scenario | Action |
|----------|--------|
| `test_name` not recognized | Return result with empty reference range; flag as "unrecognized test" |
| `value` is missing or non-numeric | Skip the result; include an error note in trace |
| No lab results provided | Return empty results with explanatory message |
| All values normal | Confirm normalcy; still generate full output |
| Critical value detected | Prepend "URGENT" flag to patient summary |
| `patient_context` missing | Proceed with generic adult ranges; note limitation |

## Data Sources

Lab data may come from:
- Structured JSON/CSV files read via `Read`
- Extracted text from clinical notes (use `clinical-nlp-extractor` skill first)
- Direct user input in conversation

Patient data is never uploaded to external services. All processing is local.

## Medical Safety Boundaries

This skill MUST NOT:
- Provide definitive diagnoses based on lab values alone
- Recommend medication changes, dosage adjustments, or new treatments
- Override a clinician's interpretation
- Process data without including the medical disclaimer
- Suppress or hide any critical values
- Claim completeness when demographic adjustments were not applied

## Unit Conversion

International labs report results in different units. The agent should convert to the unit matching the `reference_ranges` dictionary before analysis.

| Analyte | Conversion |
|---------|-----------|
| Cholesterol (Total, LDL, HDL) | mmol/L × 38.67 = mg/dL |
| Triglycerides | mmol/L × 88.57 = mg/dL |
| Glucose | mmol/L × 18.02 = mg/dL |
| Creatinine | μmol/L × 0.0113 = mg/dL |
| Iron | μmol/L × 5.585 = μg/dL |
| Testosterone | nmol/L × 0.2884 = ng/dL |
| Vitamin D | nmol/L × 0.4006 = ng/mL |

> **Note**: Agent should convert to the unit matching the reference_ranges dictionary before analysis.

## Anti-Patterns

- **Providing definitive diagnoses** — Do not use lab result interpretations as final diagnoses; always indicate that results require clinical correlation by a qualified professional.
- **Ignoring reference range context** — Do not flag values as abnormal without considering the lab's specific reference ranges, patient age, sex, and clinical context.
- **Suppressing borderline results** — Do not omit values that are near the boundary of normal ranges; these should be highlighted for clinician review.
- **Recommending treatment changes** — Do not suggest medication adjustments or new treatments based on lab values alone; this is outside the skill's scope.
- **Processing unverified data** — Do not analyze lab results from unvalidated or unstructured sources without flagging potential data quality issues.
- **Omitting the disclaimer** — Every output must include the medical disclaimer, regardless of whether results are normal or abnormal.
- **Ignoring patient_context** — When demographic data is available, it must be used to adjust interpretation; do not silently apply generic ranges when specific data exists.

<!-- AUTHOR_SIGNATURE: 9a7f3c2e-MD-BABU-MIA-2026-MSSM-SECURE -->
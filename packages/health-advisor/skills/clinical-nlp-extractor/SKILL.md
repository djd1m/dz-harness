---
# COPYRIGHT NOTICE
# This file is part of the "Universal Biomedical Skills" project.
# Copyright (c) 2026 MD BABU MIA, PhD <md.babu.mia@mssm.edu>
# All Rights Reserved.
#
# This code is proprietary and confidential.
# Unauthorized copying of this file, via any medium is strictly prohibited.
#
# Provenance: Authenticated by MD BABU MIA
name: health-advisor-clinical-nlp-extractor
description: 'Extracts medical entities (Diseases, Medications, Procedures) from unstructured clinical text using regex and simple rules (or LLM wrappers).'
measurable_outcome: Execute skill workflow successfully with valid output within 15 minutes.
allowed-tools:
  - Read
  - Bash
---


# Clinical NLP Entity Extractor

## Overview

The Clinical NLP Entity Extractor converts unstructured clinical text (such as EHR notes, discharge summaries, and progress notes) into structured, machine-readable data by identifying medical entities including problems, diagnoses, medications, procedures, lab values, dosages, and temporal relations. It uses a hybrid approach: fast regex-based extraction for high-precision matching, with an optional LLM fallback for high-recall semantic extraction of complex or unusual entities. Output is JSON with FHIR-compatible structure and includes negation detection, span offsets, and source attribution.

**Important limitation**: The built-in regex engine recognizes a limited set of terms (6 problems, 5 medications, 5 procedures). For production use, the agent must supplement regex results with LLM-based extraction or expanded dictionaries. See "Limitations and Known Gaps" below.

## Dependencies

- **Python 3** — Runtime for `entity_extractor.py`
- **entity_extractor.py** — Core extraction script at `skills/extended/clinical-nlp-extractor/entity_extractor.py`
- **RuntimeLLMAdapter** (optional) — LLM integration via `platform/adapters/runtime_adapter.py` for semantic extraction fallback
- **Read / Bash** — Permitted tools for file access and script execution

## When to Use This Skill

- Analyzing unstructured EHR notes, discharge summaries, or progress notes
- Populating a patient's problem list or medication reconciliation
- Pre-processing clinical text before passing to other skills (e.g., `lab-results`)
- Structuring free-text clinical data for FHIR-compatible systems
- Identifying negated findings to avoid false-positive clinical alerts

## Entity Categories

The extractor recognizes the following entity categories:

| Category | Description | Regex Examples | Agent Should Also Look For |
|----------|-------------|----------------|---------------------------|
| **PROBLEM** | Diseases, symptoms, diagnoses | diabetes, hypertension, pneumonia, chest pain, fracture, cancer | All ICD-10 conditions, symptoms (fever, cough, dyspnea), syndromes, chronic conditions |
| **MEDICATION** | Drug names | metformin, lisinopril, aspirin, insulin, atorvastatin | All prescription and OTC drugs, brand and generic names, IV fluids, supplements |
| **PROCEDURE** | Medical procedures | x-ray, CT scan, MRI, biopsy, surgery | Lab orders, therapeutic procedures, surgical procedures, diagnostic tests |
| **DOSAGE** | Drug dosage information | *(not in regex -- agent must extract)* | Dose amounts, frequencies (BID, TID), routes (PO, IV), durations |
| **LAB_VALUE** | Laboratory results in text | *(not in regex -- agent must extract)* | Numeric values with units (e.g., "WBC 12.5 K/uL", "HbA1c 7.2%") |
| **TEMPORAL** | Time references | *(not in regex -- agent must extract)* | Dates, durations ("for 3 weeks"), relative times ("since last visit"), frequencies |

**Note**: Categories marked "not in regex" require the agent to use LLM-based extraction or manual pattern matching to identify these entities in text.

## Workflow

Follow these steps in order when this skill is invoked:

### Step 1: Validate Input

Accept input as either:
- `--text "clinical text string"` — direct text on command line
- `--file path/to/note.txt` — path to a text file
- Text passed programmatically via `ClinicalNLP().extract(text)`

Validate that the input:
- Is non-empty
- Appears to be clinical text (contains medical terminology)
- Does not exceed reasonable length (split large documents into sections if needed)

If input is malformed or empty, return an error message rather than empty results.

### Step 2: Run Regex Extraction

```bash
python3 skills/extended/clinical-nlp-extractor/entity_extractor.py \
    --text "Patient has diabetes type 2. Prescribed Metformin 500mg daily. No chest pain. BP 130/85." \
    --output entities.json
```

Or programmatically:

```python
from entity_extractor import ClinicalNLP

nlp = ClinicalNLP()
entities = nlp.extract(text, use_llm=False)  # regex-only pass
```

This produces the initial high-precision entity list.

### Step 3: LLM Supplementation (Recommended)

Because the regex engine covers only a small dictionary, the agent SHOULD perform a second pass using LLM reasoning to:
- Identify entities missed by regex (rare conditions, abbreviations, misspellings)
- Extract DOSAGE, LAB_VALUE, and TEMPORAL entities (not covered by regex)
- Resolve ambiguous terms (e.g., "cold" as common cold vs. temperature)
- Verify negation status for complex sentence structures

To enable LLM extraction via the script:
```bash
python3 skills/extended/clinical-nlp-extractor/entity_extractor.py \
    --text "..." \
    --output entities.json
    # LLM is enabled by default; use --no-llm to disable
```

**Note**: The LLM fallback in the current code is partially mocked. When the LLM adapter is unavailable, a warning is printed and only regex results are returned. The agent should supplement with its own entity identification in this case.

### Step 4: Apply Negation Detection

The extractor checks a 20-character window before each entity for negation triggers:
- "no " / "denies " / "without " / "negative for "

**Limitations of the current approach**:
- Does not handle double negation ("not without pain")
- Does not handle distant negation ("Pain was not observed in the chest area" -- "chest" too far from "not")
- Does not handle conditional negation ("if chest pain occurs")
- The agent should review and correct negation flags for complex sentence structures

### Step 5: Assign Confidence Scores

The agent should assign confidence to each extracted entity:

| Confidence Level | Score Range | Criteria |
|------------------|-------------|----------|
| **High** | 0.9 - 1.0 | Exact regex match on unambiguous medical term |
| **Medium** | 0.7 - 0.89 | LLM extraction with clear context, or regex match with possible ambiguity |
| **Low** | 0.5 - 0.69 | LLM extraction with limited context, abbreviation resolution, or partial match |
| **Uncertain** | < 0.5 | Flag for human review; do not use in downstream processing |

### Step 6: Format Output

Return structured JSON. Each entity should conform to this schema:

```json
{
  "entities": [
    {
      "text": "diabetes type 2",
      "type": "PROBLEM",
      "source": "regex",
      "start": 12,
      "end": 27,
      "negated": false,
      "confidence": 0.95,
      "fhir_resource": "Condition",
      "code_system": "ICD-10",
      "code_hint": "E11"
    },
    {
      "text": "Metformin 500mg daily",
      "type": "MEDICATION",
      "source": "regex",
      "start": 40,
      "end": 61,
      "negated": false,
      "confidence": 0.95,
      "fhir_resource": "MedicationStatement",
      "dosage": {
        "amount": "500",
        "unit": "mg",
        "frequency": "daily",
        "route": null
      }
    },
    {
      "text": "chest pain",
      "type": "PROBLEM",
      "source": "regex",
      "start": 67,
      "end": 77,
      "negated": true,
      "confidence": 0.90,
      "fhir_resource": "Condition",
      "negation_trigger": "No"
    }
  ],
  "metadata": {
    "input_length": 95,
    "entity_count": 3,
    "negated_count": 1,
    "extraction_sources": ["regex", "llm"],
    "disclaimer": "Extracted entities are NLP-derived mentions, not confirmed clinical facts. All entities require validation by a qualified healthcare professional."
  }
}
```

**FHIR Resource Mapping**:

| Entity Type | FHIR Resource |
|-------------|---------------|
| PROBLEM | Condition |
| MEDICATION | MedicationStatement |
| PROCEDURE | Procedure |
| LAB_VALUE | Observation |
| DOSAGE | (nested under MedicationStatement.dosageInstruction) |
| TEMPORAL | (attribute on parent entity, not standalone resource) |

### Step 7: Append Disclaimer

Every output MUST include:

> **Disclaimer**: Extracted entities are NLP-derived mentions from clinical text, not confirmed clinical facts. This tool identifies text patterns and does not validate clinical accuracy. All extracted entities require review and validation by a qualified healthcare professional before use in clinical decision-making.

## Negation Detection Methodology

The current implementation uses a **lookbehind window** approach:

1. For each matched entity at position `start`, examine the 20 characters preceding it
2. Check if any negation trigger phrase appears in that window
3. Supported triggers: `"no "`, `"denies "`, `"without "`, `"negative for "`
4. If a trigger is found, mark `negated: true`

This is a simple but effective approach for standard clinical phrasing. It will miss:
- Negation expressed after the entity ("chest pain, absent")
- Negation with intervening words ("no evidence of significant chest pain")
- Hypothetical statements ("if the patient develops chest pain")
- Historical negation ("chest pain resolved 3 days ago")

The agent should apply clinical reasoning to correct misclassified negations.

## Integration with Other Skills

- **lab-results**: Extract LAB_VALUE entities from clinical text, then pass structured values to the `lab-results` skill for interpretation
- **medication-review**: Extract MEDICATION and DOSAGE entities for drug interaction checking
- **patient-profile**: Feed extracted PROBLEM entities into patient profile construction

## Error Handling

| Scenario | Action |
|----------|--------|
| Empty input text | Return error: `{"error": "No input text provided", "entities": []}` |
| Non-clinical text detected | Proceed but add warning in metadata: `"warning": "Input may not be clinical text"` |
| LLM adapter unavailable | Fall back to regex-only; add `"llm_available": false` to metadata |
| File not found (--file mode) | Print error to stderr, exit with code 1 |
| Extremely long input (>50KB) | Split into sections; process each; merge results with adjusted span offsets |
| Encoding issues | Attempt UTF-8; fall back to latin-1; flag in metadata |

## Limitations and Known Gaps

Be transparent about these limitations in any output:

1. **Small regex dictionary**: Only 6 problems, 5 medications, and 5 procedures are recognized by regex. Thousands of medical terms exist. The agent must supplement with LLM extraction.
2. **No dosage extraction in regex**: Dosages (amounts, frequencies, routes) are not parsed by the regex engine. The agent must extract these separately.
3. **No lab value extraction in regex**: Numeric lab values in text are not captured. The agent must identify these for downstream use.
4. **Simple negation model**: The 20-character lookbehind window misses complex negation patterns. See "Negation Detection Methodology" above.
5. **No abbreviation expansion**: Common clinical abbreviations (HTN, DM2, SOB, CABG) are not in the regex dictionary.
6. **No spell correction**: Misspelled medical terms will be missed entirely by regex.
7. **LLM fallback is partially mocked**: The LLM response parsing includes hardcoded demo logic (e.g., only detects "headache" as an LLM-found entity). In production, real LLM JSON parsing must be implemented.
8. **No temporal relation extraction**: The regex engine does not capture dates, durations, or temporal relationships.

## Anti-Patterns

- **Using extracted entities as confirmed diagnoses** — NLP extraction identifies mentions in text, not confirmed clinical facts. Always validate extracted entities against the full clinical context before acting on them.
- **Ignoring negation context** — Entities like "No chest pain" must be flagged as negated. Treating all extracted terms as positive findings leads to false clinical conclusions.
- **Processing non-clinical text** — This skill is designed for clinical notes and EHR data. Running it on general-purpose text (e.g., patient emails, web articles) produces unreliable results.
- **Skipping output validation** — Always review the structured JSON output for completeness and accuracy. Automated extraction is not a substitute for clinical review.
- **Assuming complete entity coverage** — The regex and dictionary-based approach may miss rare conditions, abbreviations, or misspellings. Do not treat absence of an entity in output as absence in the clinical record.
- **Trusting regex-only results for clinical decisions** — Given the small regex dictionary, always supplement with LLM extraction or manual review before using results in clinical workflows.
- **Omitting the disclaimer** — Every output must include the medical disclaimer about NLP-derived entities requiring clinical validation.
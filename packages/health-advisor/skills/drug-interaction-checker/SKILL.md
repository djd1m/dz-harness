---
name: health-advisor-drug-interaction-checker
description: 'Checks for potential drug-drug interactions (DDIs) between a list of medications.'
measurable_outcome: Execute skill workflow successfully with valid output within 15 minutes.
allowed-tools:
  - Read
  - Bash
---

<!--
COPYRIGHT NOTICE — part of the "Universal Biomedical Skills" project.
Copyright (c) 2026 MD BABU MIA, PhD <md.babu.mia@mssm.edu>. All Rights Reserved.
Provenance: Authenticated by MD BABU MIA
-->

# Drug-Drug Interaction (DDI) Checker

## Overview

This skill analyzes a list of medications to identify known drug-drug interactions (DDIs), focusing on safety and contraindications. It queries an internal interaction database to classify severity levels and provide actionable clinical recommendations. The checker supports pairwise analysis of arbitrary medication lists and outputs structured interaction reports.

## When to Use This Skill

*   Reviewing patient medication lists.
*   Prescribing new medications.
*   Pharmacovigilance monitoring.

## Core Capabilities

1.  **Interaction Detection**: Identifies pairs of drugs with known interactions.
2.  **Severity Grading**: Classifies interactions as Minor, Moderate, or Major.
3.  **Clinical Recommendations**: Provides actionable advice (e.g., "Monitor K+ levels").

## Workflow

1.  **Input**: List of drug names (e.g., "Warfarin, Aspirin").
2.  **Analysis**: Queries internal interaction database.
3.  **Output**: Interaction report with severity and mechanisms.

## Quick Start

Run the checker from the skill directory:

```bash
# Check a pair of drugs
python3 impl.py --drugs "Warfarin, Aspirin"

# Check multiple drugs at once (all pairwise combinations are tested)
python3 impl.py --drugs "Atorvastatin, Clarithromycin, Lisinopril, Potassium Chloride"

# Check drugs with no known interaction in the database
python3 impl.py --drugs "Metformin, Omeprazole"
```

Expected output for `Warfarin, Aspirin`:

```json
{
  "input_drugs": ["warfarin", "aspirin"],
  "interaction_count": 1,
  "interactions": [
    {
      "drug_1": "aspirin",
      "drug_2": "warfarin",
      "severity": "Major",
      "effect": "Increased risk of bleeding.",
      "recommendation": "Avoid concurrent use or monitor INR closely."
    }
  ],
  "status": "Alert"
}
```

## Output Format

The checker returns a JSON object with the following structure:

| Field               | Type     | Description                                                    |
|---------------------|----------|----------------------------------------------------------------|
| `input_drugs`       | string[] | Lowercased, trimmed list of input drug names                   |
| `interaction_count` | integer  | Number of detected pairwise interactions                       |
| `interactions`      | object[] | Array of interaction records (see below)                       |
| `status`            | string   | `"Safe"` if no interactions found, `"Alert"` if one or more    |

Each interaction object contains:

| Field              | Type   | Description                                                  |
|--------------------|--------|--------------------------------------------------------------|
| `drug_1`           | string | First drug in the alphabetically sorted pair                 |
| `drug_2`           | string | Second drug in the alphabetically sorted pair                |
| `severity`         | string | One of: `Minor`, `Moderate`, `Major`, `Severe/Contraindicated` |
| `effect`           | string | Clinical effect of the interaction                           |
| `recommendation`   | string | Suggested clinical action                                    |

When no interactions are found the output looks like:

```json
{
  "input_drugs": ["metformin", "omeprazole"],
  "interaction_count": 0,
  "interactions": [],
  "status": "Safe"
}
```

## Error Handling

| Scenario                  | Behavior                                                        |
|---------------------------|-----------------------------------------------------------------|
| **Empty input**           | `--drugs ""` yields `interaction_count: 0`, `status: "Safe"`   |
| **Single drug**           | No pairs to check; returns `interaction_count: 0`              |
| **Unknown drugs**         | No error raised; returns `status: "Safe"` (absence of evidence is not evidence of absence) |
| **Brand names only**      | May miss interactions; the database uses generic (INN) names   |
| **Duplicate entries**     | Duplicates are kept; pairs are still checked correctly         |

> **Important**: A `"Safe"` result only means the mock database has no entry for the queried pair. It does **not** guarantee the absence of a real-world interaction. Always cross-reference with authoritative sources.

## Example Usage

**User**: "Check interactions for Warfarin and Aspirin."

**Agent Action**:
```bash
python3 impl.py --drugs "Warfarin, Aspirin"
```

## Limitations

This skill ships with a **mock database containing only 4 drug pairs**:

1. Aspirin + Warfarin (Major)
2. Lisinopril + Potassium Chloride (Major)
3. Atorvastatin + Clarithromycin (Major — CYP3A4 inhibition)
4. Sildenafil + Nitroglycerin (Severe/Contraindicated)

Additional constraints:

- **No external API integration** — all lookups are against the hardcoded dictionary in `impl.py`.
- **Regex-only matching** — drug names must match exactly after lowercasing; no fuzzy matching, no synonym resolution (e.g., "acetylsalicylic acid" will not match "aspirin").
- **No dosage or duration context** — interactions are flagged regardless of dose.
- **No patient-specific factors** — comorbidities, renal/hepatic function, age, and weight are not considered.
- **Not for clinical use** — this tool is a demonstration skill and must never be the sole basis for prescribing decisions.
- **No supplement vs prescription distinction** — The current database does not distinguish between prescription medications and dietary supplements (vitamins, minerals, omega-3). Many supplement interactions are dose-dependent and have weaker evidence than prescription DDIs. When checking supplement interactions, always note the evidence level.

## Integration

For production-grade drug-drug interaction checking, consider the following alternatives:

- **tooluniverse-drug-drug-interaction** — a dedicated skill that queries comprehensive external DDI databases with broader coverage and regularly updated data.
- **Lexicomp / Micromedex** — commercial clinical decision support databases used in hospital pharmacy systems.
- **DrugBank API** — programmatic access to a curated DDI database with >300,000 interaction pairs.

This skill can serve as a lightweight, offline first-pass filter before escalating to one of these production systems.

## Anti-Patterns

1. **Relying solely on this checker for clinical decisions** — The internal database is not exhaustive; always cross-reference with authoritative sources (e.g., Lexicomp, Micromedex).
2. **Ignoring severity classifications** — Do not treat all flagged interactions equally; "Major" and "Severe/Contraindicated" require immediate action while "Minor" may only need monitoring.
3. **Submitting brand names without generic equivalents** — The database uses generic drug names; brand-only queries may miss interactions.
4. **Skipping verification of results against patient context** — Interaction severity depends on dosage, duration, and patient comorbidities not captured by this tool.
5. **Using outdated drug lists** — Always verify the patient's current medication list before running the checker; stale inputs produce misleading outputs.
6. **Treating "Safe" as a clinical all-clear** — The mock database covers only 4 pairs. A `"Safe"` result means "not found in this database", not "no interaction exists". This is a critical distinction for patient safety.
7. **Skipping CYP450 pathway analysis** — Many serious DDIs arise from cytochrome P450 enzyme inhibition or induction (e.g., CYP3A4, CYP2D6). This checker flags only one CYP-mediated interaction (atorvastatin + clarithromycin); real-world polypharmacy requires comprehensive CYP pathway analysis.

## Cross-Skill Integration

- For production DDI analysis, delegate to tooluniverse-drug-drug-interaction
- nutrition-analyzer may flag food-drug interactions (e.g., grapefruit + statins)
- lab-results provides liver/kidney function data relevant to drug metabolism

## Dependencies

- **Runtime**: Python 3.10+
- **Libraries**: Standard library only (argparse, json, typing)
- **Tools**: `Read`, `Bash`
- **External APIs**: None (uses internal database in `impl.py`)
- **Other Skills**: None

## References

1. Aspinall, S. L., et al. "Medication errors in older adults." *Am J Geriatr Pharmacother*. 2007;5(4):345-51. Overview of DDI prevalence in polypharmacy. [PubMed: PMID 18179993](https://pubmed.ncbi.nlm.nih.gov/18179993/)
2. Lynch, T., & Price, A. "The effect of cytochrome P450 metabolism on drug response, interactions, and adverse effects." *Am Fam Physician*. 2007;76(3):391-396. Introduction to CYP450-mediated drug interactions. [PubMed: PMID 17708140](https://pubmed.ncbi.nlm.nih.gov/17708140/)
3. Roden, D. M. "Drug-induced prolongation of the QT interval." *N Engl J Med*. 2004;350(10):1013-22. Mechanisms of QT prolongation and associated DDIs. [PubMed: PMID 14999113](https://pubmed.ncbi.nlm.nih.gov/14999113/)
4. Palleria, C., et al. "Pharmacokinetic drug-drug interaction and their implication in clinical management." *J Res Med Sci*. 2013;18(7):601-610. Review of pharmacokinetic DDI mechanisms. [PubMed: PMID 24516494](https://pubmed.ncbi.nlm.nih.gov/24516494/)

## Disclaimer

This tool is provided for educational and demonstration purposes only. It is **not** a substitute for professional clinical judgment, comprehensive DDI databases, or pharmacist review. Always consult authoritative drug information resources and qualified healthcare professionals before making prescribing decisions.

<!-- AUTHOR_SIGNATURE: 9a7f3c2e-MD-BABU-MIA-2026-MSSM-SECURE -->

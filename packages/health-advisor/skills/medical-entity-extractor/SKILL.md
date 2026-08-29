---
name: health-advisor-medical-entity-extractor
description: Extract medical entities (symptoms, medications, lab values, diagnoses) from patient messages.
license: MIT
metadata:
  author: "NAPSTER AI"
  maintainer: "NAPSTER AI"
  openclaw:
    requires:
      bins: []
---

# Medical Entity Extractor

## Overview

Medical Entity Extractor is a pure-prompt skill that parses unstructured patient messages and extracts structured medical entities including symptoms, medications, lab values, diagnoses, temporal information, and action items. It accepts JSON input and produces JSON output with categorized entities and a summary, requiring no external tools or APIs beyond the LLM itself.

## What This Skill Does

1. **Symptom Extraction**: Identifies symptoms, severity, duration, and progression
2. **Medication Extraction**: Finds medication names, dosages, frequencies, and side effects
3. **Lab Value Extraction**: Parses lab results, vital signs, and measurements
4. **Diagnosis Extraction**: Identifies mentioned diagnoses and conditions
5. **Temporal Extraction**: Captures when symptoms started, how long they've lasted
6. **Action Items**: Identifies requested actions (appointments, refills, questions)

## Input Format

```json
[
  {
    "id": "msg-123",
    "priority_score": 78,
    "priority_bucket": "P1",
    "subject": "Medication side effects",
    "from": "patient@example.com",
    "date": "2026-02-27T10:30:00Z",
    "body": "I've been feeling dizzy since starting the new blood pressure medication (Lisinopril 10mg) three days ago. My BP this morning was 145/92."
  }
]
```

## Output Format

```json
[
  {
    "id": "msg-123",
    "entities": {
      "symptoms": [
        {
          "name": "dizziness",
          "severity": "moderate",
          "duration": "3 days",
          "onset": "since starting new medication"
        }
      ],
      "medications": [
        {
          "name": "Lisinopril",
          "dosage": "10mg",
          "frequency": null,
          "context": "new medication"
        }
      ],
      "lab_values": [
        {
          "type": "blood_pressure",
          "value": "145/92",
          "unit": "mmHg",
          "timestamp": "this morning"
        }
      ],
      "diagnoses": [
        {
          "name": "hypertension",
          "context": "implied by blood pressure medication"
        }
      ],
      "action_items": [
        {
          "type": "medication_review",
          "reason": "possible side effect (dizziness)"
        }
      ]
    },
    "summary": "Patient reports dizziness after starting Lisinopril 10mg 3 days ago. BP elevated at 145/92. Possible medication side effect requiring review."
  }
]
```

## Entity Types

### Symptoms
- Name, severity (mild/moderate/severe), duration, onset, progression (improving/stable/worsening)

### Medications
- Name, dosage, frequency, route, context (new/existing/stopped)

### Lab Values
- Type (BP, glucose, cholesterol, etc.), value, unit, timestamp, normal range

### Diagnoses
- Name, context (confirmed/suspected/ruled out)

### Vital Signs
- Temperature, heart rate, respiratory rate, oxygen saturation, blood pressure

### Action Items
- Type (appointment, refill, question, callback), urgency, reason

## Medical Terminology Handling

The skill recognizes:
- Common abbreviations (BP, HR, RR, O2 sat, etc.)
- Brand and generic medication names
- Lay terms for medical conditions ("sugar" → diabetes, "heart attack" → MI)
- Temporal expressions ("since yesterday", "for the past week")

## Integration

This skill can be invoked via the OpenClaw CLI:

```bash
openclaw skill run medical-entity-extractor --input '[{"id":"msg-1","priority_score":78,...}]' --json
```

Or programmatically:

```typescript
const result = await execFileAsync('openclaw', [
  'skill', 'run', 'medical-entity-extractor',
  '--input', JSON.stringify(scoredMessages),
  '--json'
]);
```

**Recommended Model**: Claude Sonnet 4.5 (`openclaw models set anthropic/claude-sonnet-4-5`)

## Privacy & Security

- All processing happens locally via OpenClaw
- No data is sent to external services (except Claude API for LLM processing)
- Extracted entities remain in your local environment

## Anti-Patterns

- **Over-extraction**: Hallucinating medical entities that are not explicitly or clearly implied in the patient text. Only extract what is actually stated or strongly implied.
- **Severity guessing**: Assigning severity levels (mild/moderate/severe) without textual evidence. If the patient does not describe severity, leave it as null rather than guessing.
- **Conflating lay terms incorrectly**: Mapping colloquial expressions to the wrong medical terms (e.g., "chest tightness" is not always MI). Preserve ambiguity when the mapping is uncertain.
- **Ignoring negation**: Failing to detect negated entities such as "no fever", "denies chest pain". Negated symptoms must not appear as positive findings.
- **Dropping temporal context**: Extracting a symptom or medication without its associated time information ("since Monday", "for 2 weeks"), losing critical clinical context.
- **Flat output without summary**: Returning raw entity lists without generating the summary field, which is essential for quick clinical triage.

## References

- Wang Y, Wang L, Rastegar-Mojarad M, et al. Clinical information extraction applications: A literature review. *J Biomed Inform*. 2018;77:34-49. [PubMed: PMID 29162496](https://pubmed.ncbi.nlm.nih.gov/29162496/)
- Savova GK, Masanz JJ, Ogren PV, et al. Mayo clinical Text Analysis and Knowledge Extraction System (cTAKES): architecture, component evaluation and applications. *J Am Med Inform Assoc*. 2010;17(5):507-513. [PubMed: PMID 20819853](https://pubmed.ncbi.nlm.nih.gov/20819853/)
- Wu S, Roberts K, Datta S, et al. Deep learning in clinical natural language processing: a methodical review. *J Am Med Inform Assoc*. 2020;27(3):457-470. [PubMed: PMID 31794016](https://pubmed.ncbi.nlm.nih.gov/31794016/)

## Dependencies

None. This is a pure prompt skill with no external tool, API, or skill dependencies. It requires only an LLM (recommended: Claude Sonnet 4.5).


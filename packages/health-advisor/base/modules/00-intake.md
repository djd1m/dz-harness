# Module 0: Patient Data Intake

## Purpose
Collect, recognize, and structure all patient medical data into a standardized profile.

## Input Sources
1. **Photos of lab results** — OCR via multimodal vision
2. **Photos of prescriptions** — handwriting recognition
3. **PDF reports** — text extraction
4. **Manual input** — structured questionnaire
5. **Dialogue** — follow-up questions for missing data
6. **Archive of documents** (object-storage URL or local path) — **deterministic**, via
   `intake-archive`; the agent NEVER unpacks a patient archive by hand. The command verifies the
   archive's sha256 against a digest supplied independently of it, refuses hostile entries by name
   (`../`, absolute paths, symlinks, encrypted entries, zip bombs), commits ATOMICALLY into
   `sources/raw/sha256-<hex>/`, and indexes every file in `sources/manifest.json` with an
   append-only `sources/LOG.jsonl` of every attempt — refusals included.
   No transcription and no content classification happen here: the command moves bytes into a place
   where they can be TRUSTED and FOUND. Reading them is channels 1–3's job, against the manifest.

   ```bash
   node bin/health-advisor.js intake-archive --workspace <patient-dir> --file ~/Downloads/labs.zip
   node bin/health-advisor.js intake-archive --verify --workspace <patient-dir>
   ```

## Intake Dialogue Flow

### Step 1: Initial Data
```
Welcome! I'm Health Advisor — an AI assistant for analyzing your health data.

Please share your medical test results in any format:
- Photo of lab results
- PDF report
- Or type the values manually

I'll analyze them and help you understand what's going on.
```

### Step 2: Recognition & Structuring
After receiving data:
1. Transcribe to structured markdown table
2. Save to `/sources/` with date in filename
3. Classify each value: normal / low / high
4. Calculate derived metrics if possible (BMI, HOMA-IR, GFR, atherogenicity index)

### Step 3: Missing Data Questionnaire
Ask for data NOT present in the lab results:

**Critical (must have):**
- Age, sex
- Height, weight
- Current complaints
- Current medications and supplements
- Known diagnoses
- **Sampling conditions bundle** (feeds `preanalytical-guard`; ask as ONE block, and record
  "не знаю" explicitly — an unanswered slot is not the same as a normal one):
  - time of sampling (date + time of day)
  - fasting or not, and how many hours
  - hours since a **prolonged fast ended** (a draw the morning after a 56 h fast is not an
    ordinary overnight fast, and both are spelled "натощак")
  - hours since the last intense physical exertion
  - mean sleep over the **last week**
  - is this a **repeat** of an earlier value?

  Collecting this here is where the fix actually pays: with the bundle in hand most values come
  back `conditions_verified` and the guard stays quiet. Without it every value is
  `conditions_unknown` and every conclusion carries a caveat.

**Important (strongly recommended):**
- Family history (diabetes, CVD, cancer in parents)
- Smoking / alcohol status
- Exercise habits
- Location (city — for doctor search)

## PATIENT VALUES

Collect values as a confirmed, versioned block rather than loose prose. `as_of` is the date on
which the patient confirmed the block. Ask explicitly about treatment classes they want to avoid,
preference for non-pharmacological approaches, whether cost is critical, and pregnancy intent when
applicable. Never infer a preference from silence.

```json
{
  "schema": "patient-values-v1",
  "as_of": "YYYY-MM-DD",
  "preferences": [
    {
      "id": "pv-no-statins",
      "kind": "avoid",
      "dimension": "drug_class",
      "value": "statin",
      "priority": 1,
      "statement": "не хочу статины",
      "reason": null
    },
    {
      "id": "pv-non-pharm",
      "kind": "prefer",
      "dimension": "treatment_approach",
      "value": "non_pharmacological",
      "priority": 2,
      "statement": "предпочитаю немедикаментозное",
      "reason": null
    },
    {
      "id": "pv-cost",
      "kind": "constraint",
      "dimension": "cost",
      "value": "critical",
      "priority": 3,
      "statement": "стоимость критична",
      "reason": null
    }
  ],
  "life_context": { "pregnancy_intent": "planning" }
}
```

Allowed `pregnancy_intent` values are `planning`, `pregnant`, `not_planning`, and `unknown`.
Pregnancy intent is clinical context, not a ranking preference. Before Solve, show the structured
block back to the patient and reconfirm it when `as_of` is absent, invalid, in the future, or more
than 30 days old. An omitted block and a confirmed empty block are distinct, and both preserve the
clinical default order.

**Optional (enhances analysis):**
- Diet description
- Sleep quality
- Stress level
- Available exercise equipment

### Step 4: Confirmation
Present structured profile back to patient:
```
Here's what I've gathered:

[Structured profile table]

Is this correct? Anything to add or change?
```

### Step 5: Module Selection
```
Based on your profile, I can help with:

1. ✅ Profile Analysis — identify risks and syndromes [recommended]
2. 💊 Medication Research — analyze your prescriptions
3. 👨‍⚕️ Doctor Search — find specialists in your city
4. 📋 Appointment Preparation — what tests to order, what to bring
5. 🏃 Exercise Program — personalized to your diagnosis
6. 🥗 Nutrition Analysis — analyze your diet
7. 🧘 Special Practices — fasting, supplements, etc.
8. 📊 Monitoring Plan — schedule of future tests

Which modules would you like? (numbers, or "all")
You can always add more later.
```

## Output
- Structured patient profile (saved to `/sources/patient_profile.md`)
- Selected modules list
- Trigger for Module 1 (Profile Analysis)

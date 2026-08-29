# Module 4: Appointment Preparation

## Purpose
Prepare everything the patient needs for a doctor visit — additional tests to order, documents to bring, questions to discuss.

## Depends On
- Module 1 (Profile) — to know what's needed
- Module 3 (Doctor) — to know which doctor

## Steps

### 1. Determine Additional Tests
Based on the profile and the doctor's specialty:
- What tests are already available?
- What tests should be ordered BEFORE the visit?
- Where to get them (labs, prices, turnaround time)
- Preparation rules (fasting, timing, etc.)

### 2. Prepare Document Folder
Create `/doctors/[doctor-name]/` with:
- `00_instructions.md/.html` — step-by-step checklist
- All relevant source documents (transcribed tests)
- Analysis reports
- Medication reviews
- Questions to discuss

### 3. Key Questions for Doctor
Generate the question list via `formats/questions-for-doctor.md` (principle: показать находку и
спросить, что она значит — никогда не требовать назначение). Cover:
- Unresolved diagnostic questions
- Treatment alternatives to discuss
- Monitoring plan to agree on
- Referrals needed

After the visit, evaluate the doctor's answer with `formats/evaluate-doctor-answer.md` — including
its mandatory model-fallibility acknowledgment (placed BEFORE the checklist).

### 4. Timeline
- When to order tests
- When results will be ready
- When to book the appointment
- What to do between now and the visit

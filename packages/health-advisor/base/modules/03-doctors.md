# Module 3: Doctor Search

## Purpose
Find the best doctors for the patient's specific diagnostic profile, in their city, with verified ratings and reviews.

## Search Strategy

### 1. Determine Required Specialties
Based on Module 1 profile analysis, identify which specialists are needed:
- Dyslipidemia → Lipidologist / Cardiologist
- Insulin resistance → Endocrinologist
- Low testosterone → Andrologist / Endocrinologist-andrologist
- Atherosclerosis → Vascular surgeon / Cardiologist
- Kidney issues → Nephrologist
- Comprehensive → Internist with subspecialty

### 2. Search Sources
- ProDoctorov.ru (ratings, reviews)
- NaPopravku.ru (ratings, reviews)
- DocDoc.ru / SberZdorovye (ratings)
- Clinic websites (credentials, publications)
- Medical directories (Meds.ru, etc.)

### 3. Selection Criteria
**Must have:**
- Rating ≥4.0 on review platforms (with ≥5 reviews)
- Relevant specialty for patient's conditions
- Active practice in patient's city

**Preferred:**
- Academic degree (к.м.н., д.м.н.)
- Publications in patient's condition area
- Experience >10 years
- Affiliation with a recognized medical center

**Red flags (exclude):**
- Rating <3.0 with multiple reviews
- Consistent complaints about rushed appointments
- No verifiable credentials

### 4. Output Format
For each recommended doctor:
- Full name, specialty, degree
- Clinic, address, phone
- Verified profile links (ProDoctorov, NaPopravku, clinic site)
- Rating and number of reviews
- Price
- Why suitable for THIS patient
- Booking instructions

### 5. Recommendation Strategy
- Suggest 2-3 combinations (different price/convenience levels)
- Consider convenience of combining appointments (same clinic for multiple specialists)
- Always verify links work before presenting

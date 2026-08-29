# Module 5: Exercise Program

## Purpose
Design a personalized exercise program based on the patient's diagnostic profile, available equipment, preferences, and contraindications.

## Input Required
- Patient profile (from Module 1)
- Available equipment (home, gym, outdoors)
- Current activity level
- Preferences (what they enjoy)
- Contraindications (from profile)
- Time availability

## Program Design Principles

### 1. Safety First
- Identify contraindications from profile
- Recommend stress test before vigorous exercise if: age >40 + any CV risk factor
- Set heart rate zones based on age (220 - age = max HR)

### 2. Evidence-Based Prescriptions
For each condition, apply specific exercise recommendations from clinical guidelines:

| Condition | Guideline Source | Recommendation |
|---|---|---|
| Prediabetes | DPP, ADA | 150 min/week moderate + resistance 2-3x/week |
| Dyslipidemia | ESC 2021, STRRIDE | 150-300 min/week moderate, HIIT for TG |
| Atherosclerosis | ESC 2021 | Moderate intensity, stress test first |
| Low testosterone | Kraemer 2005, Vingren 2010 | Compound resistance exercises, avoid overtraining |
| Kidney CKD 2 | KDIGO | No restrictions, adequate hydration |
| Vitamin D deficiency | — | Outdoor exercise when UV available |

### 3. Program Structure
- **Simple daily plan** (for consistency-lovers) — same routine every day
- **Full progressive plan** (for optimization-seekers) — phased 12-week program
- Both options presented, patient chooses

### 4. Output Requirements
- Day-by-day schedule with specific exercises
- Sets, reps, rest periods
- Heart rate targets for each activity
- Video links for unfamiliar exercises (Appendix A)
- Glossary of terms (Appendix B)
- Post-fasting/recovery modifications if applicable
- Equipment substitutions for travel/home/gym

### 5. Iterative Updates
Patient can add:
- New equipment → update program
- New preferences (bodyweight only, etc.) → adjust
- Post-fasting recovery period → add gradual re-entry plan
- Special events (hiking, etc.) → integrate

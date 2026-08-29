# Module 6: Nutrition Analysis

## Purpose
Analyze specific foods from the patient's diet and recommend optimal nutrition for their diagnostic profile.

## Approach

### 1. Patient-Driven
Don't prescribe a generic diet. Instead:
- Ask what the patient actually eats regularly
- Analyze THOSE specific products
- Give verdicts: recommended / neutral / caution / avoid
- Suggest modifications, not replacements (e.g., buckwheat bread instead of white, not "stop eating bread")

### 2. Research Depth Per Product
For each product, analyze:
- Effect on each of the patient's conditions (IR, lipids, testosterone, atherosclerosis, kidneys, vitamin D)
- Optimal portion size
- Best preparation method
- Timing considerations
- Interactions with medications/supplements
- Verdict with evidence

### 3. Consolidated File Structure
Single file `diet_foods.md` (and `.html`) grows incrementally:
- Base products → additions → more additions
- Summary table at the END, updated with each addition
- TOP-N products ranking, updated with each addition
- "Ideal day of eating" — updated with each addition

### 4. Categories to Cover
- Vegetables and greens
- Bread and grains
- Oils and fats
- Dairy (cheese, cottage cheese)
- Eggs
- Fish and seafood
- Meat
- Bee products
- Nuts and seeds
- Fruits and berries
- Beverages (separate file: `diet_beverages.md`)

### 5. Beverages (Separate File)
`diet_beverages.md` — same structure:
- Coffee (by preparation method!)
- Tea (green, black, herbal)
- Cocoa
- Other beverages patient drinks
- Summary table + daily schedule

### 6. CKD-Adapted Nutrition (ХБП G3+ / СКФ <60)

When patient has GFR <60 (CKD stage 3+), apply additional restrictions:

| Nutrient | Restriction at G3 | Restriction at G4-5 | Foods to limit |
|---|---|---|---|
| Protein | 0.8 g/kg/day | 0.6-0.8 g/kg/day | Red meat, dairy excess |
| Phosphorus | <800-1000 mg/day | <800 mg/day | Hard cheese, nuts, cola, processed food |
| Potassium | Monitor | <2000 mg/day | Bananas, potatoes, tomatoes, dried fruit |
| Sodium | <2000 mg/day | <1500 mg/day | Processed food, salty cheese, canned goods |
| Oxalate | Limit | Limit | Spinach, cocoa, rhubarb, beets |

Source: [KDOQI Nutrition Guidelines 2020](https://pubmed.ncbi.nlm.nih.gov/30696756/)

> **Note:** At CKD G1-G2 (GFR 60-89), standard nutrition recommendations apply. Restrictions above are for G3+.

### 7. Output Requirements
- Clickable PubMed links for every claim
- Clear verdicts (✅ ❌ ⚠️)
- Portion sizes in practical units (grams, pieces, tablespoons)
- Price considerations where relevant
- "Ideal salad/meal" recipes combining recommended products
- CKD stage noted if applicable, with appropriate restrictions

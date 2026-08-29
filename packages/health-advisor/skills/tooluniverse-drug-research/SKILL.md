---
name: health-advisor-tooluniverse-drug-research
description: Generates comprehensive drug research reports with compound disambiguation, evidence grading, and mandatory completeness sections. Covers identity, chemistry, pharmacology, targets, clinical trials, safety, pharmacogenomics, and ADMET properties. Use when users ask about drugs, medications, therapeutics, or need drug profiling, safety assessment, or clinical development research.
---

# Drug Research Strategy

## Overview

This skill generates comprehensive drug research reports by orchestrating 50+ ToolUniverse tools across chemical databases, clinical trials, adverse events, pharmacogenomics, and literature. It covers compound identity, chemistry, pharmacology, targets, ADMET properties, clinical development, safety, and regulatory status. The primary use case is producing publication-quality drug profiles with evidence grading and inline source citations.

## Dependencies

- **PubChem** (`PubChem_get_CID_by_compound_name`, `PubChem_get_compound_properties_by_CID`, `PubChem_get_bioactivity_summary_by_CID`) -- compound identification and properties
- **ChEMBL** (`ChEMBL_search_compounds`, `ChEMBL_search_activities`, `ChEMBL_get_target`) -- bioactivity and target data
- **DailyMed** (`DailyMed_search_spls`, `DailyMed_get_spl_sections_by_setid`, `DailyMed_get_spl_by_setid`) -- FDA label information
- **ADMET-AI** (`ADMETAI_predict_*`) -- ADMET property predictions (bioavailability, BBB, CYP, toxicity)
- **ClinicalTrials.gov** (`search_clinical_trials`, `extract_clinical_trial_outcomes`) -- clinical trial data
- **FAERS** (`FAERS_count_reactions_by_drug_event`, `FAERS_count_seriousness_by_drug_event`) -- post-marketing safety
- **PharmGKB** (`PharmGKB_search_drugs`, `PharmGKB_get_clinical_annotations`) -- pharmacogenomics
- **DGIdb** (`DGIdb_get_drug_info`) -- drug-gene interaction data
- **FDA Orange Book** (`FDA_OrangeBook_*`) -- regulatory and patent information
- **PubMed** (`PubMed_search_articles`) -- scientific literature

**KEY PRINCIPLES**:
1. **Report-first approach** - Create report file FIRST, then populate progressively
2. **Compound disambiguation FIRST** - Resolve identifiers before research
3. **Citation requirements** - Every fact must have inline source attribution
4. **Evidence grading** - Grade claims by evidence strength
5. **Mandatory completeness** - All sections must exist, even if "data unavailable"
6. **English-first queries** - Always use English drug/compound names in tool calls, even if the user writes in another language. Only try original-language terms as a fallback. Respond in the user's language

---

## Critical Workflow Requirements

### 1. Report-First Approach (MANDATORY)

**DO NOT** show the search process or tool outputs to the user. Instead:

1. **Create the report file FIRST** - Before any data collection, create a markdown file:
   - File name: `[DRUG]_drug_report.md` (e.g., `metformin_drug_report.md`)
   - Initialize with all 11 section headers from the template
   - Add placeholder text: `[Researching...]` in each section

2. **Progressively update the report** - As you gather data:
   - Update each section with findings immediately after retrieving data
   - Replace `[Researching...]` with actual content
   - The user sees the report growing, not the search process

3. **Use ALL relevant tools** - For comprehensive coverage:
   - Query multiple databases for each data type
   - Cross-reference information across sources
   - Use fallback tools when primary tools return limited data

### 2. Citation Requirements (MANDATORY)

**Every piece of information MUST include its source.** Use inline citations:

```markdown
## 3. Mechanism & Targets

### 3.1 Primary Mechanism
Metformin activates AMP-activated protein kinase (AMPK), reducing hepatic glucose
production and increasing insulin sensitivity in peripheral tissues.

*Source: PubChem via `PubChem_get_drug_label_info_by_CID` (CID: 4091)*

### 3.2 Primary Target(s)
| Target | UniProt | Activity | Potency | Source |
|--------|---------|----------|---------|--------|
| AMPK (PRKAA1) | Q13131 | Activator | EC50 ~10 µM | ChEMBL |
| Mitochondrial Complex I | - | Inhibitor | IC50 ~1 mM | Literature |

*Source: ChEMBL via `ChEMBL_get_target_by_chemblid` (CHEMBL1431)*
```

### Citation Format

For each data section, include at the end:

```markdown
---
**Data Sources for this section:**
- PubChem: `PubChem_get_compound_properties_by_CID` (CID: 4091)
- ChEMBL: `ChEMBL_get_bioactivity_by_chemblid` (CHEMBL1431)
- DGIdb: `DGIdb_get_drug_info` (metformin)
---
```

### 3. Progressive Writing Workflow

```
Step 1: Create report file with all section headers
        ↓
Step 2: Resolve compound identifiers → Update Section 1
        ↓
Step 3: Query PubChem/ADMET-AI/DailyMed SPL → Update Section 2 (Chemistry)
        ↓
Step 4: Query FDA Label MOA + ChEMBL activities + DGIdb → Update Section 3 (Mechanism & Targets)
        ↓
Step 5: Query ADMET-AI tools → Update Section 4 (ADMET)
        ↓
Step 6: Query ClinicalTrials.gov → Update Section 5 (Clinical Development)
        ↓
Step 7: Query FAERS/DailyMed → Update Section 6 (Safety)
        ↓
Step 8: Query PharmGKB → Update Section 7 (Pharmacogenomics)
        ↓
Step 9: Query DailyMed → Update Section 8 (Regulatory)
        ↓
Step 10: Query PubMed/literature → Update Section 9 (Literature)
        ↓
Step 11: Synthesize findings → Update Executive Summary & Section 10
        ↓
Step 12: Document all sources → Update Section 11 (Data Sources)
```

### 4. Report Detail Requirements

Each section must be **comprehensive and detailed**:

- **Tables**: Use tables for structured data (targets, trials, adverse events)
- **Lists**: Use bullet points for features, findings, key points
- **Paragraphs**: Include narrative summaries that synthesize findings
- **Numbers**: Include specific values, counts, percentages (not vague terms)
- **Context**: Explain what the data means, not just what it is

**BAD** (too brief):
```markdown
### Clinical Trials
Multiple trials completed. Approved for diabetes.
```

**GOOD** (detailed with sources):
```markdown
### 5.2 Clinical Trial Landscape

| Phase | Total | Completed | Recruiting | Status |
|-------|-------|-----------|------------|--------|
| Phase 4 | 89 | 72 | 12 | Post-marketing |
| Phase 3 | 156 | 134 | 15 | Pivotal |
| Phase 2 | 203 | 178 | 18 | Dose-finding |
| Phase 1 | 67 | 61 | 4 | Safety |

*Source: ClinicalTrials.gov via `search_clinical_trials` (intervention="metformin")*

**Total Registered Trials**: 515 (as of 2026-02-04)
**Primary Indications Under Investigation**: Type 2 diabetes (312), PCOS (87), Cancer (45), Obesity (38), NAFLD (33)

### Trial Outcomes Summary
- **Glycemic Control**: Mean HbA1c reduction of 1.0-1.5% in monotherapy [★★★: NCT00123456]
- **Cardiovascular**: UKPDS showed 39% reduction in MI risk [★★★: PMID:9742976]
- **Cancer Prevention**: Mixed results; ongoing investigation [★★☆: NCT02019979]

*Source: `extract_clinical_trial_outcomes` for NCT IDs listed*
```

---

## Initial Report Template (Create This First)

When starting research, **immediately create this file** before any tool calls:

**File**: `[DRUG]_drug_report.md`

```markdown
# Drug Research Report: [DRUG NAME]

**Generated**: [Date] | **Query**: [Original query] | **Status**: In Progress

---

## Executive Summary
[Researching...]

---

## 1. Compound Identity
### 1.1 Database Identifiers
[Researching...]
### 1.2 Structural Information
[Researching...]
### 1.3 Names & Synonyms
[Researching...]

---

## 2. Chemical Properties
### 2.1 Physicochemical Profile
[Researching...]
### 2.2 Drug-Likeness Assessment
[Researching...]
### 2.3 Solubility & Permeability
[Researching...]
### 2.4 Salt Forms & Polymorphs
[Researching...]
### 2.5 Structure Visualization
[Researching...]

---

## 3. Mechanism & Targets
### 3.1 Primary Mechanism of Action
[Researching...]
### 3.2 Primary Target(s)
[Researching...]
### 3.3 Target Selectivity & Off-Targets
[Researching...]
### 3.4 Bioactivity Profile (ChEMBL)
[Researching...]

---

## 4. ADMET Properties
### 4.1 Absorption
[Researching...]
### 4.2 Distribution
[Researching...]
### 4.3 Metabolism
[Researching...]
### 4.4 Excretion
[Researching...]
### 4.5 Toxicity Predictions
[Researching...]

---

## 5. Clinical Development
### 5.1 Development Status
[Researching...]
### 5.2 Clinical Trial Landscape
[Researching...]
### 5.3 Approved Indications
[Researching...]
### 5.4 Investigational Indications
[Researching...]
### 5.5 Key Efficacy Data
[Researching...]
### 5.6 Biomarkers & Companion Diagnostics
[Researching...]

---

## 6. Safety Profile
### 6.1 Clinical Adverse Events
[Researching...]
### 6.2 Post-Marketing Safety (FAERS)
[Researching...]
### 6.3 Black Box Warnings
[Researching...]
### 6.4 Contraindications
[Researching...]
### 6.5 Drug-Drug Interactions
[Researching...]
### 6.5.2 Drug-Food Interactions
[Researching...]
### 6.6 Dose Modification Guidance
[Researching...]
### 6.7 Drug Combinations & Regimens
[Researching...]

---

## 7. Pharmacogenomics
### 7.1 Relevant Pharmacogenes
[Researching...]
### 7.2 Clinical Annotations
[Researching...]
### 7.3 Dosing Guidelines (CPIC/DPWG)
[Researching...]
### 7.4 Actionable Variants
[Researching...]

---

## 8. Regulatory & Labeling
### 8.1 Approval Status
[Researching...]
### 8.2 Label Highlights
[Researching...]
### 8.3 Patents & Exclusivity
[Researching...]
### 8.4 Label Changes & Warnings
[Researching...]
### 8.5 Special Populations
[Researching...]
### 8.6 Regulatory Timeline & History
[Researching...]

---

## 9. Literature & Research Landscape
### 9.1 Publication Metrics
[Researching...]
### 9.2 Research Themes
[Researching...]
### 9.3 Recent Key Publications
[Researching...]
### 9.4 Real-World Evidence
[Researching...]

---

## 10. Conclusions & Assessment
### 10.1 Drug Profile Scorecard
[Researching...]
### 10.2 Key Strengths
[Researching...]
### 10.3 Key Concerns/Limitations
[Researching...]
### 10.4 Research Gaps
[Researching...]
### 10.5 Comparative Analysis
[Researching...]

---

## 11. Data Sources & Methodology
### 11.1 Primary Data Sources
[Researching...]
### 11.2 Tool Call Summary
[Researching...]
### 11.3 Quality Control Metrics
[Researching...]
```

Then progressively replace `[Researching...]` with actual findings as you query each tool.

---

## FDA Label Core Fields Bundle

**For approved drugs, ALWAYS retrieve these FDA label sections early** (after getting set_id from `DailyMed_search_spls`):

### Critical Label Sections

Call `DailyMed_get_spl_sections_by_setid(setid=set_id, sections=[...])` with these sections:

**Phase 1 (Mechanism & Chemistry)**:
- `mechanism_of_action` → Section 3.1
- `pharmacodynamics` → Section 3.1
- `chemistry` → Section 2.4

**Phase 2 (ADMET & PK)**:
- `clinical_pharmacology` → Section 4
- `pharmacokinetics` → Section 4.1-4.4
- `drug_interactions` → Section 4.3, 6.5

**Phase 3 (Safety & Dosing)**:
- `warnings_and_cautions` → Section 6.3
- `adverse_reactions` → Section 6.1
- `dosage_and_administration` → Section 6.6, 8.2

**Phase 4 (PGx & Clinical)**:
- `pharmacogenomics` → Section 7
- `clinical_studies` → Section 5.5
- `description` → Section 2.5 (formulation)
- `inactive_ingredients` → Section 2.5

### Label Extraction Strategy

```
1. Get set_id: DailyMed_search_spls(drug_name)

2. Batch call for all core sections (or 3-4 calls with 4-5 sections each):
   DailyMed_get_spl_sections_by_setid(setid=set_id, sections=["mechanism_of_action", "pharmacodynamics", ...])

3. Extract and populate report sections as you retrieve data
```

This ensures you have authoritative FDA-approved information even if prediction tools fail.

---

## Compound Disambiguation (Phase 1)

**CRITICAL**: Establish compound identity before any research.

### Identifier Resolution Chain

```
1. PubChem_get_CID_by_compound_name(compound_name)
   └─ Extract: CID, canonical SMILES, formula

2. ChEMBL_search_compounds(query=drug_name)
   └─ Extract: ChEMBL ID, pref_name

3. DailyMed_search_spls(drug_name)
   └─ Extract: Set ID, NDC codes (if approved)

4. PharmGKB_search_drugs(query=drug_name)
   └─ Extract: PharmGKB ID (PA...)
```

### Handle Naming Ambiguity

| Issue | Example | Resolution |
|-------|---------|------------|
| Salt forms | metformin vs metformin HCl | Note all CIDs; use parent compound |
| Isomers | omeprazole vs esomeprazole | Verify SMILES; separate entries if distinct |
| Prodrugs | enalapril vs enalaprilat | Document both; note conversion |
| Brand confusion | Different products same name | Clarify with user |

---


## Tool Chains by Research Path

Nine detailed research paths with multi-step tool chains and example report outputs are documented in the companion file.

**Paths covered**: Chemical Properties & CMC, Mechanism & Targets, ADMET Properties, Clinical Trials, Post-Marketing Safety & Drug Interactions, Pharmacogenomics, Regulatory Status & Patents, Real-World Evidence, Comparative Analysis.

See [WORKFLOWS.md](WORKFLOWS.md) for complete tool chains, fallback strategies, and example report outputs for each path.

---

## Type Normalization & Error Prevention

### Common Validation Errors

Many ToolUniverse tools require **string** inputs but may return **integers** or **floats**. Always convert IDs to strings.

**Problem Examples**:
- ChEMBL target IDs: `12345` (int) → should be `"12345"` (str)
- PubMed IDs: `23456789` (int) → should be `"23456789"` (str)
- Clinical trial NCT IDs: sometimes parsed as numbers

### Type Normalization Helper

Before calling any tool with ID parameters:

```python
# Convert all IDs to strings
chembl_ids = [str(id) for id in chembl_ids]
nct_ids = [str(id) for id in nct_ids]
pmids = [str(id) for id in pmids]
```

### Pre-Call Checklist

Before each API call:
- [ ] All ID parameters are strings
- [ ] Lists contain strings, not ints/floats
- [ ] No `None` or `null` values in required fields
- [ ] Arrays are non-empty if required

---

## Evidence Grading System

### Evidence Tiers

| Tier | Symbol | Description | Example |
|------|-------|-------------|---------|
| **T1** | ★★★ | Phase 3 RCT, meta-analysis, FDA approval | Pivotal trial, label indication |
| **T2** | ★★☆ | Phase 1/2 trial, large case series | Dose-finding study |
| **T3** | ★☆☆ | In vivo animal, in vitro cellular | Mouse PK study |
| **T4** | ☆☆☆ | Review mention, computational prediction | ADMET-AI prediction |

### Application in Report

```markdown
Metformin reduces hepatic glucose output via AMPK activation [★★★: FDA Label].
Phase 3 trials demonstrated HbA1c reduction of 1.0-1.5% [★★★: NCT00123456].
Preclinical studies suggest anti-cancer properties [★☆☆: PMID:23456789].
ADMET-AI predicts low hERG liability (0.12) [☆☆☆: computational].
```

### Per-Section Summary

Include evidence quality summary for each major section:

```markdown
### 5. Clinical Development
**Evidence Quality**: Strong (156 Phase 3 trials, 203 Phase 2, 67 Phase 1)
**Data Confidence**: High - mature clinical program with decades of data
```

---

## Section Completeness Checklist

Before finalizing any report, verify each section meets minimum requirements:

### Section 1 (Identity) - Minimum Requirements
- [ ] PubChem CID with link
- [ ] ChEMBL ID with link (or "Not in ChEMBL")
- [ ] Canonical SMILES
- [ ] Molecular formula and weight
- [ ] At least 3 brand names OR "Generic only"
- [ ] Salt forms identified (or "Parent compound only")

### Section 2 (Chemistry) - Minimum Requirements
- [ ] 6+ physicochemical properties in table format (including pKa if available)
- [ ] Lipinski rule assessment with pass/fail
- [ ] QED score with interpretation
- [ ] Solubility data (predicted or label-based)
- [ ] Salt forms documented (or "Parent compound only")
- [ ] 2D structure image embedded (PubChem link)
- [ ] Formulation details if available (dosage forms, excipients)

### Section 3 (Mechanism) - Minimum Requirements
- [ ] FDA label MOA text quoted (if approved drug) OR literature MOA summary
- [ ] Primary mechanism described in 2-3 sentences
- [ ] At least 1 primary target with UniProt ID
- [ ] Activity type and potency (IC50/EC50/Ki) with assay count
- [ ] Target selectivity table (including mutant forms if relevant, e.g., ESR1 Y537S for endocrine drugs)
- [ ] Off-target activity addressed (or "Highly selective")

### Section 4 (ADMET) - Minimum Requirements
- [ ] All 5 subsections present (A, D, M, E, T)
- [ ] Absorption: bioavailability + at least 2 other endpoints (predicted OR label PK)
- [ ] Distribution: BBB + VDss or PPB (predicted OR label PK)
- [ ] Metabolism: CYP substrate/inhibitor status for 3+ CYPs (predicted OR label DDI)
- [ ] Excretion: clearance OR half-life (predicted OR label PK)
- [ ] Toxicity: AMES + hERG + at least 1 other (predicted OR label warnings)
- [ ] **If ADMET-AI fails, fallback to FDA label PK sections** (do NOT leave "predictions unavailable")

### Section 5 (Clinical) - Minimum Requirements
- [ ] Development status clearly stated (Approved/Investigational/Preclinical)
- [ ] **Actual counts by phase/status in table format** (NOT just representative trial list)
- [ ] Indication breakdown by counts (e.g., "312 diabetes trials, 87 PCOS trials")
- [ ] Approved indications with year (or "Not approved")
- [ ] Representative trial list (top 5 Phase 3, top 3 recruiting) with clear labels
- [ ] Key efficacy data with trial references (or "No outcome data available")

### Section 6 (Safety) - Minimum Requirements
- [ ] Top 5 adverse events with frequencies
- [ ] FAERS seriousness breakdown (serious vs non-serious counts)
- [ ] FAERS date window documented (e.g., "2004-2026")
- [ ] FAERS limitations paragraph (small N, reporting bias, causality not established)
- [ ] Black box warnings (or "None")
- [ ] At least 3 drug-drug interactions with mechanism (CYP, transporter) OR "No significant interactions"
- [ ] Dose modification triggers (ALT/AST thresholds, renal impairment, CYP inhibitor/inducer adjustments)

### Section 7 (PGx) - Minimum Requirements
- [ ] Pharmacogenes listed (or "None identified")
- [ ] CPIC/DPWG guideline status (or "No guideline available")
- [ ] At least 1 clinical annotation OR "No annotations identified"
- [ ] **If PharmGKB fails, fallback to label PGx sections + literature** (document the failure)

### Section 10 (Conclusions) - Minimum Requirements
- [ ] 5-point scorecard covering: efficacy, safety, PK, druggability, competition
- [ ] 3+ key strengths
- [ ] 3+ key concerns/limitations
- [ ] At least 2 research gaps identified

---

## Drug Profile Scorecard Template

Include in Section 10:

```markdown
### 10.1 Drug Profile Scorecard

| Criterion | Score (1-5) | Rationale |
|-----------|-------------|-----------|
| **Efficacy Evidence** | 5 | Multiple Phase 3 trials, decades of use |
| **Safety Profile** | 4 | Well-tolerated; lactic acidosis rare but serious |
| **PK/ADMET** | 4 | Good bioavailability; renal elimination |
| **Target Validation** | 4 | AMPK mechanism well-established |
| **Competitive Position** | 3 | First-line but many alternatives |
| **Overall** | 4.0 | **Strong drug profile** |

**Interpretation**:
- 5 = Excellent, 4 = Good, 3 = Moderate, 2 = Concerning, 1 = Poor
```

---

## Automated Completeness Audit

**CRITICAL**: Before finalizing the report, run this audit checklist and append findings to Section 11.

### Audit Process

1. **Review each section against minimum requirements** (see Section Completeness Checklist)
2. **Flag any missing data** with specific tool call recommendations
3. **Document tool failures** and fallback attempts
4. **Generate completeness score** (% of minimum requirements met)

### Audit Output Template

Add this to Section 11 (Data Sources & Methodology):

```markdown
---

## Report Completeness Audit

**Overall Completeness**: 85% (17/20 minimum requirements met)

### Missing Data Items

| Section | Missing Item | Recommended Action |
|---------|--------------|-------------------|
| 2 | Salt forms | Call `DailyMed_get_spl_sections_by_setid` (chemistry section) |
| 3 | Mutant ESR1 binding | Filter ChEMBL activities for ESR1 Y537S, D538G variants |
| 5 | Phase count breakdown | Compute counts from `search_clinical_trials` results |
| 7 | PharmGKB guidelines | PharmGKB API unavailable; used label PGx instead [✓] |

### Tool Failures Encountered

| Tool | Error | Fallback Used |
|------|-------|---------------|
| `PharmGKB_search_drugs` | API timeout | DailyMed label PGx sections [✓] |
| `ADMETAI_predict_toxicity` | Invalid SMILES | FDA label warnings section [✓] |

### Data Confidence Assessment

| Section | Confidence | Evidence Tier | Notes |
|---------|-----------|---------------|-------|
| 1. Identity | High | ★★★ | PubChem + ChEMBL confirmed |
| 2. Chemistry | Medium | ★★☆ | Missing salt form details |
| 3. Mechanism | High | ★★★ | FDA label + ChEMBL bioactivity |
| 4. ADMET | Medium | ★★☆ | Predictions only; no clinical PK |
| 5. Clinical | High | ★★★ | 156 Phase 3 trials analyzed |
| 6. Safety | High | ★★★ | FAERS + label warnings |
| 7. PGx | Low | ★☆☆ | PharmGKB unavailable; label only |

### Quality Control Metrics (Section 11.3)

#### Data Recency
| Source | Last Updated | Data Age | Status |
|--------|-------------|----------|--------|
| PubChem | 2026-02-01 | < 1 week | ✓ Current |
| ChEMBL v33 | 2025-12-15 | 2 months | ✓ Current |
| FAERS | 2026-01-01 (2026Q1) | < 1 month | ✓ Current |
| DailyMed | 2025-11-20 (label revised) | 3 months | ✓ Current |
| PharmGKB | N/A (unavailable) | - | ⚠ Missing |

**Recency Assessment**: All data sources current (< 6 months). PharmGKB unavailable; fallback used.

#### Cross-Source Validation
| Property | PubChem | ChEMBL | DailyMed | Agreement |
|----------|---------|--------|----------|-----------|
| Molecular Weight | 378.88 | 378.88 | 378.88 | ✓ Exact match |
| Half-life | N/A | N/A | 27 hours | Single source |
| Primary target | N/A | ESR1 | ESR1 | ✓ Confirmed |
| Bioavailability | Predicted: 85% | N/A | ~60% (fed) | ⚠ Discrepancy |

**Contradictions Detected**:
- Bioavailability: ADMET-AI predicts 85%, but label reports ~60% (fed state). **Resolution**: Use label value (T1: ★★★) over prediction (T2: ★★☆).

#### Completeness Score
**Overall**: 85% (17/20 minimum requirements met)

| Category | Score | Details |
|----------|-------|---------|
| Identity & Structure | 100% | 5/5 - All identifiers present |
| Chemistry | 80% | 4/5 - Missing salt form |
| Mechanism | 90% | 9/10 - Minor gap in off-targets |
| Clinical Development | 95% | 19/20 - Comprehensive trial data |
| Safety | 100% | 10/10 - FAERS + label complete |
| Pharmacogenomics | 60% | 3/5 - PharmGKB unavailable |
| Regulatory | 80% | 4/5 - US only, no EMA/PMDA |

#### Evidence Distribution
| Tier | Count | Percentage | Interpretation |
|------|-------|------------|----------------|
| T1 (★★★) | 45 | 65% | High-quality regulatory/experimental |
| T2 (★★☆) | 18 | 26% | Computational predictions, PharmGKB |
| T3 (★☆☆) | 5 | 7% | Literature inference |
| T4 (☆☆☆) | 1 | 1% | Speculation |

**Quality Assessment**: 91% of claims backed by T1/T2 evidence. Report meets publication standards.

**Recommendation**: Address missing items in Sections 2, 3, 5 for publication-quality report.
```

---

## Fallback Chains

| Primary Tool | Fallback | Use When |
|--------------|----------|----------|
| `PubChem_get_CID_by_compound_name` | `ChEMBL_search_compounds` | Name not in PubChem |
| `ChEMBL_get_molecule_targets` | **Use `ChEMBL_search_activities` instead** | Avoid this tool (returns irrelevant targets) |
| `ChEMBL_get_bioactivity_by_chemblid` | `PubChem_get_bioactivity_summary_by_CID` | No ChEMBL ID |
| `DailyMed_search_spls` | `PubChem_get_drug_label_info_by_CID` | DailyMed timeout |
| `PharmGKB_get_dosing_guidelines` | `DailyMed_get_spl_sections_by_setid` (pharmacogenomics) | PharmGKB API error |
| `PharmGKB_search_drugs` | `DailyMed_get_spl_sections_by_setid` + `PubMed_search_articles` | PharmGKB unavailable |
| `FAERS_count_reactions_by_drug_event` | Document "FAERS unavailable" + use label AEs | API error |
| `ADMETAI_*` (all tools) | `DailyMed_get_spl_sections_by_setid` (clinical_pharmacology, pharmacokinetics) | Invalid SMILES or API error |

---

For the complete tools-by-use-case quick reference table, see [TOOLS_REFERENCE.md](TOOLS_REFERENCE.md).

---

## Common Use Cases

### Approved Drug Profile
User: "Tell me about metformin"
→ Full 11-section report emphasizing clinical data, FAERS, PGx

### Investigational Compound
User: "What do we know about compound X (ChEMBL123456)?"
→ Emphasize preclinical data, mechanism, early trials; safety sections may be sparse

### Safety Review
User: "What are the safety concerns with drug Y?"
→ Deep dive on FAERS, black box warnings, interactions, PGx; lighter on chemistry

### ADMET Assessment
User: "Evaluate this compound's drug-likeness [SMILES]"
→ Focus on Sections 2 and 4; other sections may be brief or N/A

### Clinical Development Landscape
User: "What trials are ongoing for drug Z?"
→ Heavy emphasis on Section 5; trial tables with status, phases, indications

---

## When NOT to Use This Skill

- **Target research** → Use target-intelligence-gatherer skill
- **Disease research** → Use disease-research skill
- **Literature-only** → Use literature-deep-research skill
- **Single property lookup** → Call tool directly
- **Structure similarity search** → Use `PubChem_search_compounds_by_similarity` directly

Use this skill for comprehensive, multi-dimensional drug profiling.

## Anti-Patterns

- **Leaving sections as "predictions unavailable"** -- When a primary tool fails (e.g., ADMET-AI), always use the fallback chain (FDA label PK, PubMed literature); never leave a section empty without attempting fallbacks.
- **Using `ChEMBL_get_molecule_targets` for target identification** -- This tool returns unfiltered, irrelevant targets; always derive targets from `ChEMBL_search_activities` filtered to pChEMBL >= 6.0 instead.
- **Showing search process to the user** -- Do not display raw tool outputs, API responses, or intermediate search steps; populate the report file progressively and only present the final structured report.
- **Omitting source citations** -- Every piece of data must have an inline source attribution; uncited claims violate the mandatory citation requirement and reduce report credibility.
- **Passing integer IDs to API calls** -- Always convert CIDs, ChEMBL IDs, PMIDs, and NCT IDs to strings before tool calls to prevent type validation errors.
- **Skipping compound disambiguation** -- Never begin research without first resolving the compound identity across PubChem, ChEMBL, and DailyMed; ambiguous names (salt forms, isomers, prodrugs) lead to incorrect data.

---

## Additional Resources

- **Detailed workflows**: [WORKFLOWS.md](WORKFLOWS.md) - Tool chains by research path (PATHs 1-9)
- **Tool reference**: [TOOLS_REFERENCE.md](TOOLS_REFERENCE.md) - Complete tool listing
- **Examples**: [EXAMPLES.md](EXAMPLES.md) - Detailed workflow examples
- **Changelog**: [CHANGELOG.md](CHANGELOG.md) - Improvements history

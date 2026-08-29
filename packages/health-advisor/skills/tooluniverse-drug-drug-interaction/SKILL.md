---
name: health-advisor-tooluniverse-drug-drug-interaction
description: Comprehensive drug-drug interaction (DDI) prediction and risk assessment. Analyzes interaction mechanisms (CYP450, transporters, pharmacodynamic), severity classification, clinical evidence grading, and provides management strategies. Supports single drug pairs, polypharmacy analysis (3+ drugs), and alternative drug recommendations. Use when users ask about drug interactions, medication safety, polypharmacy risks, or need DDI assessment for clinical decision support.
---

# Drug-Drug Interaction Prediction & Risk Assessment

## Overview

This skill provides comprehensive drug-drug interaction (DDI) prediction and risk assessment using ToolUniverse tools. It analyzes interaction mechanisms (CYP450, transporters, pharmacodynamic), assigns severity classifications and evidence grades, and delivers actionable clinical management strategies. Key capabilities include single drug pair analysis, polypharmacy risk assessment for 3+ drugs, and alternative drug recommendations.

## Dependencies

- **ToolUniverse DDI tools** -- for interaction mechanism prediction and risk scoring
- **DailyMed** (`DailyMed_search_spls`, `DailyMed_get_spl_sections_by_setid`) -- FDA label drug interaction sections
- **ChEMBL** (`ChEMBL_search_activities`) -- bioactivity and CYP substrate/inhibitor data
- **FAERS** (`FAERS_count_reactions_by_drug_event`) -- post-marketing safety signal detection
- **PubMed** (`PubMed_search_articles`) -- clinical literature on DDI evidence
- **PubChem** (`PubChem_get_CID_by_compound_name`) -- compound identifier resolution

**KEY PRINCIPLES**:
1. **Report-first approach** - Create DDI_risk_report.md FIRST, then populate progressively
2. **Bidirectional analysis** - Always analyze A→B and B→A interactions (effects may differ)
3. **Evidence grading** - Grade all DDI claims by evidence quality (★★★ FDA label, ★★☆ clinical study, ★☆☆ theoretical)
4. **Risk scoring** - Multi-dimensional scoring (0-100) combining mechanism + severity + clinical evidence
5. **Patient safety focus** - Provide actionable clinical guidance, not just theoretical interactions
6. **Mandatory completeness** - All analysis sections must exist with explicit "No interaction found" when appropriate

---

## When to Use This Skill

Apply when users:
- Ask about interactions between 2+ specific drugs
- Need polypharmacy risk assessment (5+ medications)
- Request medication safety review for a patient
- Ask "can I take drug X with drug Y?"
- Need alternative drug recommendations to avoid DDIs
- Want to understand DDI mechanisms
- Need clinical management strategies for known interactions
- Ask about QTc prolongation risk from multiple drugs

---

## Critical Workflow Requirements

### 1. Report-First Approach (MANDATORY)

**DO NOT** show intermediate tool outputs or search processes. Instead:

1. **Create report file FIRST** - Before any data collection:
   - File name: `DDI_risk_report_[DRUG1]_[DRUG2].md` (or `_polypharmacy.md` for 3+)
   - Initialize with all 9 section headers
   - Add placeholder: `[Analyzing...]` in each section

2. **Progressively update** - As data is gathered:
   - Replace `[Analyzing...]` with findings
   - Include "No interaction detected" when tools return empty
   - Document failed tool calls explicitly

3. **Final deliverable** - Complete markdown report with recommendations

[... Content continues as above for full 500+ lines ...]

## Success Criteria

Before finalizing DDI report:

✅ All drug names resolved to standard identifiers
✅ Bidirectional analysis completed (A→B and B→A)
✅ All mechanism types assessed (CYP, transporters, PD)
✅ FDA label warnings extracted
✅ Clinical literature searched
✅ Evidence grades assigned (★★★, ★★☆, ★☆☆)
✅ Risk score calculated (0-100)
✅ Severity classified (Major/Moderate/Minor)
✅ Primary management recommendation provided
✅ Alternative drugs suggested
✅ Monitoring parameters defined
✅ Patient counseling points included
✅ All sections completed (no [Analyzing...] placeholders)
✅ Data sources cited throughout

When all criteria met → **Ready for Clinical Use** 🎉

## Anti-Patterns

- **Unidirectional analysis only** -- Do not analyze only A->B without also checking B->A; drug interactions are often asymmetric and effects may differ by direction.
- **Skipping evidence grading** -- Never present DDI claims without assigning an evidence grade (FDA label, clinical study, or theoretical); ungraded claims mislead clinical decisions.
- **Leaving placeholders in final output** -- Do not deliver a report with `[Analyzing...]` placeholders still present; every section must be completed or explicitly marked "No interaction found."
- **Showing raw tool output** -- Do not expose intermediate search results or tool JSON to the user; always present findings in the structured report format.
- **Ignoring polypharmacy combinatorics** -- When analyzing 3+ drugs, do not only check adjacent pairs; assess all pairwise combinations and cumulative risk (e.g., additive QTc prolongation).
- **Omitting clinical management guidance** -- Never report an interaction without providing actionable recommendations (monitoring, dose adjustment, or alternative drugs).

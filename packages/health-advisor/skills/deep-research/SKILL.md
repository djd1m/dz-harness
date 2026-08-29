---
name: health-advisor-deep-research
description: Execute autonomous multi-step deep research on any topic. Use when the user asks for comprehensive research, literature reviews, competitive analysis, topic deep-dives, or wants to understand a complex subject from multiple angles. Triggers on "deep research", "research on", "investigate", "literature review", "comprehensive analysis", "what do we know about", "summarize research on".
---

# Deep Research

## Overview

Deep Research is an autonomous multi-step research skill that orchestrates other skills to conduct comprehensive investigations on any topic. It decomposes complex questions into sub-queries, searches multiple sources (PubMed, web engines, Wikipedia), evaluates source quality, and synthesizes findings into structured Markdown reports with full citations.

## When to Use

- User wants a thorough understanding of a topic (medical condition, drug, treatment, technology)
- User asks for a literature review or evidence summary
- User wants competitive or landscape analysis
- User wants to investigate an open question with multiple angles
- User asks "what does the research say about X"

## Research Strategy

### Step 1: Query Decomposition
Break the research question into 3–5 sub-questions covering:
- Core definition / mechanism
- Current evidence / state of the art
- Debates, limitations, or contradictions
- Clinical / practical implications (if medical)
- Recent developments (last 1–2 years)

### Step 2: Multi-Source Search
Run searches across complementary sources using the available search tools:

```python
# Use multi-search-engine for broad web coverage
# Use pubmed-search for peer-reviewed medical literature
# Use agent-browser to read full-text articles and retrieve content blocked by snippets
```

**Search order:**
1. PubMed (if medical/biomedical topic) — for peer-reviewed evidence
2. Multi-search-engine (Bing, Google, DuckDuckGo) — for guidelines, reviews, news
3. Wikipedia — for background and structured overviews
4. agent-browser — for reading full articles, PDFs, clinical guidelines

### Step 3: Source Evaluation
For each source note:
- Publication type (RCT, meta-analysis, guideline, review, news)
- Date (prefer sources within 5 years for medical topics)
- Authority (journal impact, organization credibility)
- Relevance to the specific sub-question

### Step 4: Synthesis
Synthesize across sources into a coherent narrative. Do NOT just concatenate summaries — identify:
- Points of consensus
- Contradictions or conflicting evidence
- Knowledge gaps
- Strongest evidence vs. weak/preliminary evidence

### Step 5: Structured Report
Produce a well-formatted Markdown report with:

```markdown
# [Topic] — Deep Research Report

## Summary
2–3 sentence executive summary of the key finding.

## Background
What is this? Core definitions, mechanisms, or context.

## Current Evidence
What does the research show? Organized by sub-question or theme.

## Key Debates / Open Questions
Where do experts disagree? What is still unknown?

## Clinical / Practical Implications
(For medical topics) What should clinicians or patients know?

## Recent Developments
Anything notable from the past 12–24 months.

## Sources
Numbered list of all sources with titles, URLs/DOIs, and dates.
```

## Medical Research Guidelines

When researching medical topics:
- **Prioritize evidence hierarchy**: Systematic reviews > RCTs > Cohort studies > Case reports > Expert opinion
- **Include safety information**: Drug interactions, contraindications, adverse effects
- **Note population specifics**: Pediatric vs. adult, special populations, comorbidities
- **Flag regulatory status**: FDA/EMA approval status, off-label use
- **Cite clinical guidelines**: NICE, AHA, ACC, IDSA, WHO guidelines where relevant
- **Distinguish mechanistic from clinical evidence**: Lab/animal data ≠ human evidence

## Depth Levels

Adapt depth to user request:
- **Quick overview** (user asks briefly): 3–5 sources, 1-page summary
- **Standard research** (default): 8–15 sources, full structured report
- **Comprehensive review** (user asks explicitly): 20+ sources, deep synthesis with evidence grading

## Example Execution

### Brief Example

**User:** "Research the evidence for metformin use in longevity/anti-aging"

1. Decompose: mechanism of action → RCT evidence → observational data → safety profile → current trials
2. Search PubMed for "metformin longevity aging", "TAME trial metformin"
3. Search web for "metformin anti-aging clinical trials 2024"
4. Read key papers with agent-browser
5. Synthesize: strong mechanistic evidence, TAME trial ongoing, limited long-term human RCT data
6. Produce structured report with citations

### Worked Example

**User:** "What is the current evidence on SGLT2 inhibitors for heart failure in non-diabetic patients?"

**Step 1 — Query Decomposition:**
1. What are SGLT2 inhibitors and their mechanism of action in heart failure?
2. What RCTs have studied SGLT2 inhibitors in heart failure without diabetes?
3. What do current clinical guidelines recommend?
4. What are the safety concerns in non-diabetic populations?
5. What trials are ongoing or recently completed (2024-2026)?

**Step 2 — Search Execution:**
- PubMed query: `"SGLT2 inhibitors" AND "heart failure" AND "non-diabetic" [Title/Abstract]` — filters: Clinical Trial, Meta-Analysis, last 5 years
- PubMed query: `"dapagliflozin" OR "empagliflozin" AND "HFrEF" OR "HFpEF"` — systematic reviews
- Web search: "SGLT2 inhibitors heart failure guidelines 2025 ACC AHA ESC"
- agent-browser: Read full text of DAPA-HF and EMPEROR-Reduced trial publications

**Step 3 — Source Evaluation:**
- DAPA-HF (NEJM 2019): RCT, high authority, directly relevant
- EMPEROR-Reduced (NEJM 2020): RCT, high authority, directly relevant
- DELIVER trial (NEJM 2022): RCT, HFpEF population, high authority
- 2023 ACC/AHA/HFSA Guidelines: Clinical guideline, high authority
- 3 meta-analyses from Cochrane and JAMA Cardiology

**Step 4 — Sample Output Structure:**

```markdown
# SGLT2 Inhibitors for Heart Failure in Non-Diabetic Patients — Deep Research Report

## Summary
SGLT2 inhibitors (dapagliflozin, empagliflozin) have strong Level A evidence
for reducing hospitalization and cardiovascular death in heart failure patients
regardless of diabetes status, supported by multiple large RCTs.

## Background
Mechanism of action: osmotic diuresis, natriuresis, cardiac metabolic effects...

## Current Evidence
<!-- A relative effect never travels alone: every ratio below carries its absolute counterpart, or
     says BASELINE RISK NOT ESTABLISHED. The package's own examples used to violate the rule the
     package now enforces (check_report_evidence.py exits 1 on RELATIVE_RISK_WITHOUT_ABSOLUTE), and
     shipping counter-examples beside a new rule is worse than not shipping the examples. -->
- DAPA-HF: 26% relative risk reduction in CV death/HF hospitalization (HR 0.74) — absolute: state the
  events per 1000 over the trial's follow-up, plus NNT, or write `BASELINE RISK NOT ESTABLISHED` and why
- EMPEROR-Reduced: 25% relative risk reduction (HR 0.75) — same requirement: absolute figures + NNT
- DELIVER: Benefits extend to HFpEF (HR 0.82) — same requirement: absolute figures + NNT
- Subgroup analyses confirm consistent benefit in non-diabetic patients
- **Study population** for each trial above: state it, and say whether THIS patient matches it
  (`full` / `partial` / `none` / `unknown`, with the diverging axis named — never a bare verdict)

## Key Debates / Open Questions
- Optimal timing of initiation (inpatient vs. outpatient)
- Combination with other HF therapies...

## Clinical / Practical Implications
- Guideline-recommended (Class I) for HFrEF regardless of diabetes
- Expanding indications for HFpEF...

## Recent Developments
- New data on SGLT2i in acute decompensated HF...

## Sources
1. McMurray JJV et al. NEJM 2019;381:1995-2008. PMID: 31535829
2. Packer M et al. NEJM 2020;383:1413-1424. PMID: 32865377
...
```

## Anti-Patterns

- **Concatenation instead of synthesis**: Simply listing summaries from each source rather than identifying consensus, contradictions, and knowledge gaps across them.
- **Source count as quality proxy**: Collecting many low-quality sources instead of fewer high-quality, peer-reviewed ones. Quantity does not equal rigor.
- **Recency bias**: Ignoring foundational studies in favor of only recent publications, missing important context and established evidence.
- **Single-engine tunnel vision**: Searching only one source (e.g., only PubMed or only Google) and missing perspectives available elsewhere.
- **Skipping the evidence hierarchy**: Treating case reports and expert opinion with the same weight as systematic reviews and RCTs in medical research.
- **Report without actionable structure**: Producing a wall of text without clear sections, executive summary, or practical implications that the user can act on.

## References

- Higgins JPT, Thomas J, Chandler J, et al. Cochrane Handbook for Systematic Reviews of Interventions version 6.4. *Cochrane*. 2023. [PubMed: PMID 29056756](https://pubmed.ncbi.nlm.nih.gov/29056756/)
- Page MJ, McKenzie JE, Bossuyt PM, et al. The PRISMA 2020 statement: an updated guideline for reporting systematic reviews. *BMJ*. 2021;372:n71. [PubMed: PMID 33782057](https://pubmed.ncbi.nlm.nih.gov/33782057/)
- Guyatt GH, Oxman AD, Vist GE, et al. GRADE: an emerging consensus on rating quality of evidence and strength of recommendations. *BMJ*. 2008;336(7650):924-926. [PubMed: PMID 18436948](https://pubmed.ncbi.nlm.nih.gov/18436948/)

## Dependencies

- **pubmed-search**: Required for searching peer-reviewed biomedical literature (PubMed/MEDLINE).
- **multi-search-engine**: Required for broad web searches across Bing, Google, and DuckDuckGo.
- **agent-browser** (optional): Used to read full-text articles, PDFs, and clinical guidelines behind snippet-only search results.

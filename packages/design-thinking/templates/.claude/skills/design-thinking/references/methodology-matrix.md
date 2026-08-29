# Methodology Validation Matrix

Quick reference for academic status and appropriate use of each methodology.

## Validation Tiers

| Tier | Meaning | Examples |
|------|---------|---------|
| **Strong** | Peer-reviewed, ISO standards, meta-analyses, 1000+ citations | Porter, Ishikawa, BPMN, Usability Testing, Risk/FMEA |
| **Moderate** | Peer-reviewed but limited empirical validation or case-based | CJM (Folstad 2018), GTM (Moore case-based) |
| **Practitioner** | Widely used, no peer-review or independent replication | JTBD (86% claim), HADI, Lean Canvas, MVP |
| **Weak** | Academic critique questions standalone value | PESTEL alone (Yuksel 2012), SWOT alone (Hill & Westbrook 1997) |

## Full Matrix

| # | Methodology | Tier | Phase | Key Citation | Key Limitation |
|---|------------|------|-------|-------------|----------------|
| 1 | Deep Interviews | Strong | Empathize | HCI tradition | Sample size, interviewer bias |
| 2 | Quantitative Survey | Strong | Empathize | Statistics | Question design, response bias |
| 3 | JTBD Switch Interview | Practitioner | Empathize | Christensen 2016 | Retrospective rationalization (Nisbett & Wilson 1977) |
| 4 | JTBD ODI | Practitioner | Empathize/Define | Ulwick 2005 | 86% success rate not independently replicated |
| 5 | PESTEL | Weak (standalone) | Empathize | Aguilar 1967 | No prioritization, subjective (Yuksel 2012) |
| 6 | Porter's 5 Forces | Strong | Empathize | Porter 1979, HBR | Static, ~10-20% variance explained (Rumelt 1991) |
| 7 | SWOT/TOWS | Weak (standalone) | Empathize | Humphrey 1960s | "Product recall" (Hill & Westbrook 1997). Use TOWS for prescriptive |
| 8 | JTBD Canvas | Practitioner | Define | Moesta 2020 | No peer-review. 4 forces model = strong conceptual tool |
| 9 | CJM | Moderate | Define/Prototype | Shostack 1984, NNG 2018 | Limited empirical ROI evidence (Folstad & Kvale 2018) |
| 10 | Ishikawa | Strong | Define | Ishikawa 1968 | Qualitative only. Needs Pareto for prioritization |
| 11 | VSM | Strong | Define/Prototype | Rother & Shook 1999 | TO BE is projection. PCE in knowledge work = 2-5% |
| 12 | HADI | Practitioner | Ideate | FRII ~2013 | No peer-review. Equivalent to structured A/B test |
| 13 | Lean Canvas | Practitioner | Ideate | Maurya 2012 | False sense of completeness. Startup-only framing |
| 14 | Osterwalder BMC | Strong | Ideate | Osterwalder 2004/2010 | Static snapshot. No dynamics |
| 15 | GTM Strategy | Moderate | Ideate | Moore 1991, Blank 2005 | Chasm model case-based, not RCT validated |
| 16 | MVP | Practitioner | Prototype | Robinson 2001, Ries 2011 | "Viable" often watered down (IT Revolution 2023) |
| 17 | BPMN 2.0 | Strong | Prototype | OMG 2011, ISO 19510 | 100+ symbols = overkill for simple processes |
| 18 | Usability Testing | Strong | Test | Nielsen 1993 | 5-user rule = qualitative only |
| 19 | SUS | Strong | Test | Brooke 1986 | Quick screening, not deep diagnostic |
| 20 | Risk Matrix (5x5) | Strong | Test | ISO 31000:2018 | Subjective probability/impact scoring |
| 21 | FMEA | Strong | Test | MIL-P-1629, 1949 | Complex. Use for critical systems only |
| 22 | Unit Economics | Practitioner | Ideate/Validate | Skok 2010, Fader 2005 | Simple formulas overstate LTV (need cohort + DCF) |
| 23 | DFV (Desirability-Feasibility-Viability) | Practitioner | Ideate | Brown/IDEO 2009 | A heuristic triage, not a measurement; "feasible/viable" still need real validation |
| 24 | Pricing / WTP (Van Westendorp PSM, Gabor-Granger, conjoint) | Strong (market research) | Ideate/Validate | Van Westendorp 1976 | Stated intent overstates real WTP; ladder to a live transaction before trusting conversion |
| 25 | Market sizing (TAM/SAM/SOM) | Practitioner | Ideate | VC/startup ~2000s | Coefficients are assumptions; disclose top-down vs bottom-up and sanity-bound SOM vs SAM |

## Usage Rules

1. **Never use a Weak-tier tool as standalone analysis** -- always combine (PESTEL->Porter->SWOT)
2. **Practitioner tools require triangulation** -- don't rely solely on JTBD interviews or HADI cycles
3. **Strong tools still have limitations** -- Porter doesn't work for platforms, Ishikawa needs Pareto
4. **Always disclose methodology tier** in reports -- don't present practitioner tools as academically validated

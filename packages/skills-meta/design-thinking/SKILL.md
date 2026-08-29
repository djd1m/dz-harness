---
name: design-thinking
description: >
  Human-centered product development orchestrator implementing Stanford d.school's
  5-phase Design Thinking with a 6th Validate phase. Chains explore → goap-research →
  JTBD/CJM/VSM analysis → HADI hypothesis cycles → iterative prototyping → usability
  testing → pilot validation. Integrates 25 academically grounded methodologies.
  Use when designing new products, services, features, or solving user-facing problems
  where understanding the real user need is more important than jumping to solutions.
  Triggers on: "design thinking", "user research", "prototype and test",
  "understand users", "product discovery", "CJM", "JTBD", "empathize".
trust_tier: 1
trust_tier_label: "Structured"
trust_tier_path: "Run /bto-test to promote to Tier 2"
validation:
  schema_path: schemas/output.json
  validator_path: scripts/validate-config.json
---

# Design Thinking: Human-Centered Product Development

6-phase orchestrator for transforming vague product ideas into validated solutions through
systematic user research, structured problem definition, hypothesis-driven ideation,
iterative prototyping, and empirical validation.

## Core Philosophy

**Design for the user's job, not your assumptions.**

- Empathy before definition, definition before ideation
- Every TO BE map is a hypothesis until pilot-validated
- Two schools of JTBD exist (Switch vs ODI) -- choose deliberately
- Diverge before converging; quantity before quality in ideation
- Prototype to learn, not to confirm
- Minimum 2 iterations before declaring "validated"
- Projections (VSM TO BE, financial models) are NOT empirical data

## When to Use

- Designing a new product, service, or feature from scratch
- Redesigning an existing experience based on user pain points
- Product discovery: "who is the user and what do they really need?"
- GTM strategy for a new market or two-sided platform
- Any situation where the problem is unclear and user research is needed
- Business model validation (Lean Canvas / Osterwalder BMC)

## When NOT to Use

- Bug fixes or well-defined technical tasks -- use `problem-solver-enhanced`
- Pure technical architecture decisions -- use `feature-adr`
- Research without product intent -- use `goap-research-ed25519`
- Academic thesis evaluation -- use `dissertation-review`

## Skill Integration Map

```
                    +-------------+
                    |   explore   |  <-- Socratic entry point (REQUIRED)
                    +------+------+
                           | Task Brief
                    +------v------+
                    |   design-   |
                    |  thinking   |
                    |             |
  Step 1: Empathize ----> goap-research-ed25519 (REQUIRED)
  Step 2: Define -------> [qcsd-ideation-swarm] (OPTIONAL, M+ complexity)
  Step 3: Ideate -------> [six-thinking-hats] (OPTIONAL, team sessions)
  Step 4: Prototype ----> [frontend-design] (OPTIONAL, if UI)
  Step 5: Test
  Step 6: Validate
                    +------+------+
                           | DT Report + Validated Prototype
              +------------+------------+
              v            v            v
        feature-adr   presentation  knowledge-
        (implement)   -storyteller   extractor
                      (pitch)       (harvest)
```

### Dependency Protocol

| Dependency | When | How |
|-----------|------|-----|
| `explore` | Always, before Step 1 | Produces Task Brief with classified task type, constraints, success criteria |
| `goap-research-ed25519` | Always, during Step 1 | Verified market/user research with Ed25519 anti-hallucination signatures |
| `problem-solver-enhanced` | When Step 2 reveals root cause complexity | Module 2 (5 Whys) + Module 6 (TRIZ) for contradiction resolution |
| `frontend-design` | Step 4, when prototype is digital UI | Generates working HTML/React prototype from DT wireframes |
| `qcsd-ideation-swarm` | Step 2-3, for M+ complexity tasks | 9 parallel agents for quality risk + testability analysis |
| `six-thinking-hats` | Step 3, for team ideation sessions | Green Hat (creative) + Red Hat (emotional) + Black Hat (risks) |
| `reverse-engineering-unicorn` | Step 1, for competitive analysis | Auto-generates CJM + JTBD for competitor products |

### Optional Skill Fallbacks

If an OPTIONAL skill is not installed (no SKILL.md in `.claude/skills/`), skip that
integration and use the built-in protocol instead:

| Missing Skill | Fallback |
|--------------|----------|
| `frontend-design` | Create wireframes/mockups manually or describe UI in markdown |
| `six-thinking-hats` | Use built-in HADI hypothesis generation in Phase 3 |
| `qcsd-ideation-swarm` | Use Ishikawa + 5 Whys from Phase 2 protocol |
| `reverse-engineering-unicorn` | Use `goap-research-ed25519` for competitive data manually |

REQUIRED skills (`explore`, `goap-research-ed25519`) must be installed. They are included
in the `meta` preset: `dz setup --target claude-code --preset meta`

## Methodology Inventory

25 methodologies organized by phase. Each has documented academic lineage.

### Phase 1 -- Empathize

| Tool | Origin | Year | Academic Status | When to Use |
|------|--------|------|-----------------|-------------|
| **Deep Interviews** | Ethnographic tradition | -- | Strong (HCI) | Always. Min 15-25 for qual saturation |
| **Quantitative Survey** | Statistics | -- | Strong | Always. Min 100 respondents for significance |
| **JTBD Switch Interview** | Moesta / Christensen | 2016 | Practitioner (no peer-review of 86% claim) | Understanding switching behavior |
| **PESTEL** | Aguilar | 1967 | Weak standalone (Yuksel, 2012) | Macro-environment scan. Always combine with Porter |
| **Porter's Five Forces** | Porter, HBR | 1979 | Strong (10K+ citations). Explains ~10-20% variance | Industry attractiveness. Not for platforms |
| **SWOT/TOWS** | Humphrey/Weihrich | 1960s/1982 | Weak (Hill & Westbrook 1997: "product recall") | Synthesis only. Never as starting analysis |

**Protocol:**
1. Run `goap-research-ed25519` with verification mode "moderate" for market data.
   If unavailable: document sources manually and flag as "unverified — goap-research unavailable."
2. **STOP — Request user data.** Ask the user to provide interview transcripts, notes, or recordings.
   If the user has no interviews yet, generate an interview guide (questions, screening criteria,
   recruitment plan) and pause until user provides interview data. **Never fabricate interview findings.**
   - Min 15 interviews for B2C, 25 for B2B
   - Use JTBD Switch Interview technique for switching behavior
   - Use timeline interview for purchase decisions
   - Record Push/Pull/Habit/Anxiety forces per interview
3. **STOP — Request survey data.** Ask the user to provide survey results (min 100 respondents).
   If no survey exists, generate a survey instrument and pause until data is collected.
   **Never fabricate survey results.**
4. If strategic context needed: PESTEL -> Porter -> SWOT cascade (never SWOT alone)
5. For competitive analysis: optionally invoke `reverse-engineering-unicorn`

**Output:** Empathy Report containing:
- User segments with circumstances (not just demographics)
- JTBD statements: "When [situation], I want to [motivation], so I can [outcome]"
- Push/Pull/Habit/Anxiety force map per segment
- Market context summary (if PESTEL/Porter used)
- Verified sources (Ed25519 signed)

### Phase 2 -- Define

| Tool | Origin | Year | Academic Status | When to Use |
|------|--------|------|-----------------|-------------|
| **JTBD Canvas** | Moesta / Klement | 2013/2020 | Practitioner | Always. Forces of Progress mapping |
| **CJM AS IS** | Shostack -> NNG | 1984/2010s | Moderate (Folstad & Kvale, 2018) | Always. Current user journey |
| **Ishikawa (Fishbone)** | Kaoru Ishikawa | 1968 | Strong (ISO 9001, Six Sigma, ASQ) | Root cause analysis. Use 5P for digital |
| **VSM AS IS** | Rother & Shook | 1999 | Strong (Toyota, Lean) | Process efficiency. PCE = VA time / total |

**Protocol:**
1. Fill JTBD Canvas per user segment:
   - Trigger / First Thought
   - Push forces (frustrations with current solution)
   - Pull forces (appeal of new solution)
   - Habits (inertia keeping them on current)
   - Anxieties (fears about switching)
   - Distilled Job Statement
2. Map CJM AS IS from empirical data (interviews, analytics, support tickets)
   - Zones: Lens (persona, scenario) -> Experience (phases, actions, emotions, touchpoints) -> Output (pain points, opportunities)
   - ONE persona per map. Never mix.
3. For root causes of key pain points: build Ishikawa diagram
   - Digital adaptation: People, Process, Technology, Policy, Environment (5P)
   - Follow with 5 Whys on top 2-3 branches
   - Optionally invoke `problem-solver-enhanced` Module 2
4. If process efficiency matters: map VSM AS IS
   - Measure: Lead Time, Cycle Time, Wait Time, PCE
   - Walk the actual process (gemba), don't trust documentation
5. Synthesize into Point of View (POV) statement:
   "[User] needs [need] because [insight]"

**Output:** Problem Definition containing:
- JTBD Canvas (per segment)
- CJM AS IS (per persona)
- Ishikawa diagram (top pain points)
- VSM AS IS with PCE calculation (if applicable)
- POV statement
- "How Might We" (HMW) questions (3-5)

### Phase 3 -- Ideate

| Tool | Origin | Year | Academic Status | When to Use |
|------|--------|------|-----------------|-------------|
| **Divergent ideation** (Crazy-8s / 2-6-1 / brainstorming) | IDEO / d.school | ~2000s | Practitioner (creativity research: Osborn 1953, Paulus) | Generate idea VOLUME from each HMW before converging |
| **Affinity clustering** | KJ method (Kawakita Jiro) | 1967 | Strong (qualitative analysis) | Group the raw idea pile into themes before scoring |
| **DFV (Desirability-Feasibility-Viability)** | IDEO / d.school | ~2000s | Practitioner (Brown 2009) | Convergence: score clustered ideas → keep survivors before HADI |
| **HADI Cycles** | FRII (IIDF) | ~2013 | None (practitioner). Closest: A/B testing + scientific method | Hypothesis generation and quick experiments |
| **Lean Canvas** | Ash Maurya | 2010/2012 | Practitioner (CC 3.0) | Startups, new products, problem-solution fit |
| **Osterwalder BMC** | Osterwalder & Pigneur | 2004/2010 | Strong (PhD HEC Lausanne, 1M+ copies) | Established businesses, corporate innovation |
| **GTM Strategy** | Moore / Blank | 1991/2005 | Moderate (case-based) | Market entry, phased launch, platform dynamics |
| **Pricing / WTP** (Van Westendorp PSM, Gabor-Granger, conjoint) | Van Westendorp 1976 / Gabor-Granger | 1976 | Strong (market research) | Ground price & conversion assumptions empirically before they feed unit economics |
| **Market sizing** (TAM/SAM/SOM) | Practitioner (VC/startup) | ~2000s | Practitioner | Size the opportunity — disclose top-down vs bottom-up + every narrowing coefficient |

**Protocol** — diverge → cluster → DFV-score → THEN hypothesize (do not jump from HMW straight to HADI):
1. **Diverge** (quantity before quality): from each HMW question, generate idea VOLUME — Crazy-8s
   (8 ideas / 8 min) or 2-6-1, target ≥20-40 raw ideas. No judging during divergence.
2. **Cluster**: affinity-diagram the raw ideas into themes/directions (KJ method).
3. **DFV-score** each cluster/leading idea on three axes — **Desirability** (do users actually want it,
   grounded in Phase-1/2 evidence), **Feasibility** (can we build it), **Viability** (sustainable economics).
   Keep only the survivors that clear all three; this is the convergence gate BEFORE hypotheses.
4. Generate HADI hypotheses **on the surviving ideas** (not on every raw idea):
   - Format: "If we [action], then [metric] will change by [X%] for [segment] within [period], because [rationale]"
   - Min 5 hypotheses, ranked by risk x impact
   - Define validation criteria BEFORE any experiment
5. Select business model tool:
   - New product / startup -> Lean Canvas (fill in order: Problem -> Segments -> UVP -> Solution -> Channels -> Revenue -> Cost -> Metrics -> Unfair Advantage)
   - Existing business / corporate -> Osterwalder BMC
6. If market entry is part of the problem -> design GTM strategy:
   - Phased approach with stage gates (Seed -> Pilot -> Launch -> Scale)
   - For two-sided platforms: address chicken-and-egg (Rochet & Tirole, 2003)
   - Strategies: single-side first, seeding, marquee users, subsidize one side
7. Unit Economics modeling:
   - LTV = (ARPU x Gross Margin) / Churn Rate
   - CAC = fully-loaded (include sales headcount, tools, overhead)
   - Target: LTV/CAC > 3, payback < 18 months
   - **WARNING: LTV/CAC > 10 at early stage is suspicious** (Skok, 2013)
   - **MUST use cohort-based analysis** (Fader & Hardie, 2005)
   - **Pricing/conversion inputs must be empirically grounded** (WTP questions, Van Westendorp PSM,
     Gabor-Granger, conjoint, or live A/B price test) **or labeled UNVALIDATED expert estimates** — stated
     intent is not a validated price (DT-014). Validation ladder: stated-intent → PSM → real transaction.
   - **Per-segment metrics use a matching numerator AND denominator** — never divide blended multi-segment
     revenue by a single-segment user count; don't let a favorable blend mask a channel with LTV/CAC<1 (DT-015).
   - **Every headline ratio (ROI, payback, LTV/CAC) must be reproducible** from disclosed inputs and reconcile
     across sections — single source of truth, no undisclosed formulas (DT-016).
   - **Imported inputs** (a teammate's workstream, an external benchmark) must be labeled
     borrowed-and-unvalidated and carry a **sensitivity analysis** — at what input value does the model stop
     converging? (DT-017)
   - **Headline NPV/DCF/SOM built on un-piloted inputs is a projection**, not a result — carry scenario/
     sensitivity analysis; size markets (TAM/SAM/SOM) with disclosed method + coefficient sources; a
     conversion-rate pilot needs enough conversion EVENTS (~5-10+), not just sessions, before it seeds
     unit economics (DT-018).
8. For team divergence: optionally invoke `six-thinking-hats` (during step 1)
9. Converge: select top 2-3 surviving hypotheses for prototyping

**Output:** Ideation Report containing:
- Ranked HADI hypotheses with validation criteria
- Business model (Lean Canvas or BMC)
- GTM strategy with stage gates (if applicable)
- Unit economics projection (clearly labeled as PROJECTION)
- Selected hypotheses for prototyping

### Phase 4 -- Prototype

| Tool | Origin | Year | Academic Status | When to Use |
|------|--------|------|-----------------|-------------|
| **Fidelity Spectrum** | Buxton | 2007 | Strong (NNG: -37% post-launch issues) | Always. Lo-fi -> Hi-fi progression |
| **MVP Types** | Robinson / Ries | 2001/2011 | Practitioner (widely cited) | Selecting minimum viable experiment |
| **BPMN 2.0** | OMG | 2011 | Strong (ISO/IEC 19510:2013) | Process automation, complex workflows |
| **CJM TO BE** | Service Design | 2000s | Practitioner | Designing target user journey |
| **VSM TO BE** | Rother & Shook | 1999 | Strong (Lean) | Designing target process flow |

**Protocol:**
1. Select prototype fidelity based on what you need to learn:
   - Testing concept viability -> Paper sketch / Lo-fi wireframe
   - Testing flow and navigation -> Clickable mockup (Figma, Balsamiq)
   - Testing real interaction -> Functional MVP
   - Testing at scale -> Concierge or Wizard-of-Oz MVP
2. MVP type selection:

   | Type | Best For |
   |------|----------|
   | Concierge | Learning workflows without automation |
   | Wizard of Oz | Testing automation assumptions |
   | Landing Page | Demand validation before building |
   | Single-feature | Validating riskiest assumption |
   | Piecemeal | Fast validation with off-the-shelf tools |

3. Design CJM TO BE (target user journey):
   - **LABEL EXPLICITLY: "This is a design hypothesis, not empirical data"**
   - Define measurable improvements per touchpoint vs CJM AS IS
4. If process redesign: design VSM TO BE
   - **LABEL EXPLICITLY: "Projected PCE, requires pilot validation"**
   - Target PCE improvement must be justified with benchmarks
5. If prototype is digital UI: invoke `frontend-design`
6. Document prototype with BPMN 2.0 if process involves parallel flows or role boundaries
7. **Minimum 2 prototype iterations** before declaring ready for testing

**Critical Anti-Pattern:**
> TO BE maps (CJM or VSM) presented as empirical results without pilot data
> are a methodological error. Always label as "projected" and plan validation.

**Output:** Prototype Package containing:
- Working prototype (appropriate fidelity)
- CJM TO BE (labeled as hypothesis)
- VSM TO BE with projected PCE (if applicable, labeled as projection)
- Test script with specific hypotheses to validate
- Success criteria per hypothesis (defined BEFORE testing)

### Phase 5 -- Test

| Tool | Origin | Year | Academic Status | When to Use |
|------|--------|------|-----------------|-------------|
| **Usability Testing** | Gould & Lewis / Nielsen | 1985/1993 | Strong (HCI, ISO 9241) | Always. Prototype with real users |
| **SUS** | John Brooke | 1986/1996 | Strong (most-used usability questionnaire) | Quantitative usability scoring |
| **Risk Analysis** | ISO 31000 | 2018 | Strong (ISO, PMBOK) | Risk identification and mitigation |
| **FMEA** | MIL-P-1629 | 1949 | Strong (aerospace, automotive, ISO 31010) | Failure mode analysis for critical systems |

**Protocol:**
1. **STOP — Request usability test data.** Ask the user to conduct usability tests or provide
   recordings/notes. Generate test scripts if needed. **Never fabricate test results.**
   - Min 5 users per persona for qualitative discovery (Nielsen 1993: finds ~85% of usability problems)
   - For quantitative claims (statistical significance): min 30+ users
   - Think-aloud protocol (concurrent)
   - Task-based scenarios, not open exploration
   - Frame measures on the **ISO 9241-11** triad — **effectiveness** (task completion rate),
     **efficiency** (time on task, error rate), **satisfaction** (SUS). Do NOT collapse the three
     axes into one custom pass/fail threshold (DT-013).
   - Record: task completion rate, time on task, error rate
   - Administer SUS questionnaire as the satisfaction instrument (target: >68 acceptable, >80 excellent)
2. Validate HADI hypotheses:
   - Compare actual metrics vs pre-defined thresholds
   - Mark each as: Validated / Invalidated / Inconclusive
   - Inconclusive = insufficient data, NOT validated
3. Risk analysis:
   - Enumerate risks using 5x5 Probability x Impact matrix
   - For each risk: define trigger, mitigation strategy (Avoid/Transfer/Mitigate/Accept), owner
   - For critical systems: run FMEA (Severity x Occurrence x Detection = RPN)
4. Iterate prototype based on findings
5. **Minimum 2 test-iterate cycles** before proceeding to Validate

**Output:** Test Report containing:
- Usability test results (completion rate, time, errors, SUS score)
- HADI hypothesis validation table (validated/invalidated/inconclusive)
- Risk register (ID, description, P, I, score, trigger, mitigation, owner)
- Iteration log (what changed between iterations and why)
- Decision: proceed to Validate / iterate more / pivot / kill

### Phase 6 -- Validate (NEW -- absent from classic DT)

This phase addresses the critical gap identified in research: TO BE projections treated as
empirical data. Validate closes the loop between design hypothesis and measured reality.

**Protocol:**
1. Design pilot:
   - Scope: one segment, one geography, one use case (minimum viable pilot)
   - Duration: sufficient for at least 2 full usage cycles
   - Control: define baseline metrics from AS IS measurements
2. Run pilot:
   - Measure actual vs projected metrics:
     - CJM: satisfaction per touchpoint (AS IS baseline vs TO BE target vs actual)
     - VSM: actual PCE vs projected PCE
     - Unit economics: actual CAC, actual retention curve, actual LTV trajectory
     - HADI: final validation of remaining hypotheses
3. Variance analysis:
   - For each projected metric: calculate |actual - projected| / projected
   - Flag deviations > 20% for investigation
   - **If LTV/CAC drops below 3 in pilot -> reassess business model**
4. Final report:

```
DESIGN THINKING VALIDATION REPORT
====================================
PROJECT: [name]
PILOT SCOPE: [segment / geography / use case]
PILOT DURATION: [dates, N usage cycles]

METRIC VALIDATION:
  Metric          | Projected | Actual | Variance | Status
  ----------------+-----------+--------+----------+--------
  PCE             | [X%]      | [Y%]   | [Z%]     | [OK/FLAG]
  CJM Satisfaction| [X/10]    | [Y/10] | [Z%]     | [OK/FLAG]
  LTV/CAC         | [X]       | [Y]    | [Z%]     | [OK/FLAG]
  Activation Rate | [X%]      | [Y%]   | [Z%]     | [OK/FLAG]
  [custom metric] | [X]       | [Y]    | [Z%]     | [OK/FLAG]

HADI HYPOTHESIS STATUS:
  H1: [statement] -> [VALIDATED/INVALIDATED]
  H2: [statement] -> [VALIDATED/INVALIDATED]
  ...

RISKS MATERIALIZED: [list or "none"]

RECOMMENDATION:
  [ ] scale (all metrics within 20% of projection)
  [ ] iterate (1-2 metrics flagged, fixable)
  [ ] pivot (fundamental assumption invalidated)
  [ ] kill (business model not viable)

EVIDENCE INTEGRITY:
  [ ] All projections labeled as such (not presented as data)
  [ ] Cohort-based LTV (not aggregate average)
  [ ] Fully-loaded CAC (not marketing-only)
  [ ] Pilot duration sufficient for statistical significance
====================================
```

**Output:** Validation Report (template above)

## Cross-Phase Iteration (Loop-Back Protocol)

Design Thinking is non-linear. When a later phase invalidates assumptions from an earlier phase,
loop back rather than forcing forward.

| Discovery | Action |
|-----------|--------|
| Phase 5 (Test) invalidates Phase 2 (Define) POV | Return to Phase 1 with revised interview questions targeting the gap |
| Phase 5 usability test reveals wrong persona | Return to Phase 2, re-map CJM AS IS for the correct persona |
| Phase 6 (Validate) pilot shows LTV/CAC < 1 | Return to Phase 3, revise business model (Pivot, not Kill — unless 2+ pivots failed) |
| Phase 4 prototype fails all test scripts | Return to Phase 3, select different hypotheses for prototyping |
| Phase 3 HADI hypotheses are all inconclusive | Return to Phase 1, conduct additional interviews with different segments |

**Rule:** Any loop-back resets the iteration counter for the target phase.
A maximum of 2 full loop-backs per project is recommended; if a third is needed,
escalate to a strategy review (invoke `problem-solver-enhanced` Module 4: Game Theory + Module 5: Second-Order Thinking).

## Complexity Tiers

Not all DT projects need all tools. Use this router:

| Tier | Scope | Steps | Tools Used |
|------|-------|-------|------------|
| **S** | Quick user insight, 1 persona | 1-2-5 | Interviews + JTBD + Usability test |
| **M** | New feature, 1-2 personas | 1-2-3-4-5 | + CJM + HADI + Lean Canvas + Prototype |
| **L** | New product, 2-3 segments | 1-2-3-4-5-6 | + PESTEL/Porter + VSM + GTM + Pilot |
| **XL** | Platform / ecosystem | All 6 phases | + Osterwalder + Risk/FMEA + all optional integrations |

| Tier | Integrations Activated |
|------|----------------------|
| **S** | `explore` + `goap-research` |
| **M** | + `frontend-design` (if UI) + `six-thinking-hats` (if team) |
| **L** | + `qcsd-ideation-swarm` + `reverse-engineering-unicorn` |
| **XL** | All optional integrations (aqe init recommended) |

## JTBD School Selection Guide

The two schools are NOT interchangeable. Choose deliberately:

| If you need to... | School | Method |
|-------------------|--------|--------|
| Understand why users switch | **Switch** (Christensen/Moesta) | Timeline Interview, 4 Forces |
| Prioritize features by unmet need | **ODI** (Ulwick) | Job Map + Outcome Survey |
| Write job stories for design sprint | **Switch** (Klement format) | "When... I want... so I can..." |
| Quantify market opportunity | **ODI** | Opportunity Score = Importance + max(Importance - Satisfaction, 0) |
| Explore emotional/social dimensions | **Switch** | Functional + Emotional + Social jobs |

**Anti-pattern:** Mixing schools without awareness. Using Klement's job story format
(Switch school) but expecting Ulwick's quantified opportunity scores (ODI school).

## Anti-Patterns

| Anti-Pattern | Why It Fails | Correct Approach |
|-------------|-------------|-----------------|
| Skip Empathize, jump to Ideate | Solutions for imagined problems | Always interview real users first |
| CJM AS IS from assumptions | Confident wrongness | Build from empirical data only |
| TO BE presented as data | Methodological error (VSM: Jones 2016) | Label as hypothesis, validate via pilot |
| SWOT as starting analysis | Too vague, no prioritization (Hill & Westbrook 1997) | PESTEL -> Porter -> SWOT cascade |
| LTV/CAC > 10 unquestioned | Almost always inflated (Skok 2013) | Cohort-based, fully-loaded, DCF-adjusted |
| HADI without pre-defined metrics | Confirmation bias | Define threshold BEFORE experiment |
| Single prototype iteration | Insufficient learning | Min 2 iterations with different users |
| 5-user test for quantitative claims | Underpowered | 5 users = qualitative only. Quant needs 30+ |
| Mixing JTBD schools | Incoherent results | Choose Switch OR ODI, document why |
| Ishikawa without Pareto follow-up | No prioritization of causes | Always rank causes by frequency/impact |
| No Validate phase | TO BE remains fantasy | Pilot before scaling |
| Validating the core value prop against a FAKED version of the core mechanism | Construct-invalid: the riskiest assumption stays untested (esp. AI/LLM — a scripted Wizard-of-Oz proves demand/workflow, NOT generation quality, hallucination, latency) | WoZ is fine for demand/flow; require a functional / real-mechanism iteration before any "validated" claim on the value hypothesis |
| N personas tested on one undifferentiated, unscreened sample | Per-persona conclusions are invalid (no segmentation) | Recruit ≥5 per persona with screening, OR scope to one persona per CJM and say so |
| Pricing & conversion set by expert judgment, never tested | The riskiest revenue assumption stays unvalidated; stated intent ≠ willingness to pay | Ground price empirically (WTP / Van Westendorp PSM / A/B) or label UNVALIDATED (DT-014) |
| Segment-blended unit economics (blended revenue ÷ one-segment users) | ARPU/CAC become meaningless; a channel with LTV/CAC<1 hides behind a favorable blend | Matching segment numerator AND denominator; report per-segment & per-channel (DT-015) |
| Headline NPV/DCF/ROI on un-piloted (or imported) inputs, presented as a result | Single-point projection masquerades as an outcome; ratios often not even reproducible | Label as projection; sensitivity/scenario analysis; reproducible from disclosed inputs (DT-016/017/018) |
| Unit-economics scenarios seeded from a pilot with one conversion event | A single macro-conversion has an undefined confidence interval — reconnaissance, not validation | Need ~5-10+ conversion EVENTS (not sessions) before a CR seeds economics (DT-018) |
| Counting a teammate-delegated phase as your own "validated" gate | In team projects the author claims validation they did not run | Label inherited inputs team-sourced; mark delegated phases DELEGATED-UNVERIFIED (DT-019) |
| Sample drawn from a captive/loyal/self-selected frame, generalized to a different ICP | Selection bias; N can be large yet unrepresentative | Match sample composition to declared ICP; carry the caveat into conclusions (DT-020) |
| Regulated-data product with compliance as a single risk-register line | Legal feasibility can block the whole target segment | Integrate compliance feasibility into Viability; sequence prerequisites at entry (DT-021) |
| Architecture / NFR / feature priorities with no traced pain | "Untraced solution bolt-on" — the #1 reviewer critique on solution-heavy works | Cite the specific JTBD/CJM/analytics pain per load-bearing decision (DT-022) |
| Pre-defined threshold picked arbitrarily, or goalpost-moved after a miss | A number without a benchmark isn't validation; proxy-confirmation hides failure | Justify the bar (benchmark/baseline/saturation); honor the pre-registered pass-bar (DT-023) |
| Self-scored own product in a competitor benchmark grid → "market-leading" | Construct-biased: un-launched product rated on the same scale as shipping rivals | Blind/external scoring, or label as projection and exclude self-score from comparative conclusions |
| Descriptive dump over synthesis (verbatim protocols/transcripts; ROI section narrated not modeled) | Method coverage ≠ analytical conclusion | Aggregate into conclusions; the effectiveness/ROI section needs quantitative modeling (advisory — partly dissertation-review territory) |

## Self-Check

At the end of each DT project, verify:

- [ ] Task Brief from `explore` received and understood?
- [ ] Min 15 deep interviews conducted (or justified why fewer)?
- [ ] JTBD school chosen deliberately (Switch vs ODI)?
- [ ] CJM AS IS built from empirical data (not assumptions)?
- [ ] Ishikawa followed by 5 Whys or Pareto analysis?
- [ ] HADI hypotheses have pre-defined metrics and thresholds?
- [ ] Business model tool matches context (Lean Canvas vs BMC)?
- [ ] Unit economics use cohort-based LTV and fully-loaded CAC?
- [ ] LTV/CAC > 10 flagged and investigated?
- [ ] TO BE maps (CJM, VSM) labeled as hypotheses?
- [ ] Prototype tested with real users (not colleagues)?
- [ ] Min 2 prototype-test iterations completed?
- [ ] Risks enumerated with triggers and mitigation strategies?
- [ ] Pilot designed and run before scaling?
- [ ] Actual vs projected variance analyzed?
- [ ] Final recommendation evidence-based (Scale/Iterate/Pivot/Kill)?

## Checkpoint Format

```
=============================================
STEP N: [Phase Name] Complete
Tier: {COMPLEXITY_TIER}

[2-3 line summary of findings]
Artifacts: [list]

* "ok" -- next phase
* "углуби [area]" -- elaborate
* "[feedback]" -- adjust
=============================================
```

## Recommended Workflow

```
1. /explore         -> Task Brief
2. /design-thinking -> 6-phase DT protocol (this skill)
3. /feature-adr     -> implement validated solution (if software)
   OR
3. /presentation    -> pitch validated concept (if business)
```

## Academic Sources

| Methodology | Primary Source | Year |
|-------------|---------------|------|
| Design Thinking | Simon, "Sciences of the Artificial"; d.school (2004); Brown, "Change by Design" | 1969/2009 |
| DT Meta-analysis | Nature (2024): r=0.436, 25 studies | 2024 |
| JTBD (Switch) | Christensen, "Competing Against Luck" | 2016 |
| JTBD (ODI) | Ulwick, "What Customers Want" | 2005 |
| JTBD Canvas | Moesta, "Demand-Side Sales 101" | 2020 |
| CJM | Shostack (1984); Carlzon (1987); NNG (2018) | 1984+ |
| VSM | Rother & Shook, "Learning to See" | 1999 |
| Ishikawa | Ishikawa, "Guide to Quality Control" | 1968 |
| HADI | FRII/IIDF accelerator curriculum | ~2013 |
| Lean Canvas | Maurya, "Running Lean" | 2012 |
| Osterwalder BMC | Osterwalder, PhD thesis HEC Lausanne; "Business Model Generation" | 2004/2010 |
| PESTEL | Aguilar, "Scanning the Business Environment" | 1967 |
| Porter's 5 Forces | Porter, HBR; "Competitive Strategy" | 1979/1980 |
| SWOT/TOWS | Humphrey (SRI); Weihrich, Long Range Planning | 1960s/1982 |
| GTM / Platforms | Moore (1991); Blank (2005); Rochet & Tirole (2003) | 1991+ |
| Unit Economics | Skok, "SaaS Metrics 2.0"; Fader & Hardie (2005) | 2010/2005 |
| MVP | Robinson (2001); Ries, "The Lean Startup" | 2001/2011 |
| Prototyping | Buxton, "Sketching User Experiences" | 2007 |
| BPMN | OMG, ISO/IEC 19510:2013 | 2011/2013 |
| Usability Testing | Gould & Lewis (1985); Nielsen (1993) | 1985/1993 |
| SUS | Brooke, "SUS: A Quick and Dirty Usability Scale" | 1986/1996 |
| Risk/FMEA | MIL-P-1629 (1949); ISO 31000:2018 | 1949/2018 |

## Output

Each phase produces structured artifacts. The final output is a **DT Validation Report**
conforming to `schemas/output.json`. Key fields:

- `project` -- name of the product/service
- `tier` -- S/M/L/XL complexity
- `phases.empathize` -- interview count, survey size, JTBD school, segments
- `phases.define` -- POV statement, HMW questions, tools used, root causes
- `phases.ideate` -- HADI hypotheses with status, business model, unit economics
- `phases.prototype` -- fidelity, MVP type, iterations, TO BE labeling
- `phases.test` -- usability users, SUS score, risks, test iterations
- `phases.validate` -- pilot metrics with projected vs actual variance
- `recommendation` -- Scale / Iterate / Pivot / Kill
- `evidence_integrity` -- projections labeled, cohort LTV, fully-loaded CAC

Validation rules are in `scripts/validate-config.json` (12 rules, DT-001 through DT-012).

## Examples

**In scope:**
- "Design a mobile app for booking coworking spaces" -> L-tier, full 6-phase DT
- "Understand why users abandon checkout" -> S-tier, Empathize + Define + Test
- "Create a B2B platform for office matching" -> XL-tier, full DT with GTM + unit economics
- "Redesign the onboarding flow" -> M-tier, CJM AS IS -> prototype -> usability test
- "Validate our business model assumptions" -> M-tier, Lean Canvas + HADI + pilot

**Out of scope:**
- "Fix the login bug" -> use `problem-solver-enhanced` or `debug-loop`
- "Design the database schema" -> use `feature-adr`
- "Write a research paper on DT" -> use `goap-research-ed25519`
- "Evaluate a thesis using DT" -> use `dissertation-review`
- "Build a React component" -> use `frontend-design` directly

## DT Criticism Awareness

This skill acknowledges known critiques and builds in safeguards:

| Critique | Source | How This Skill Addresses It |
|----------|--------|---------------------------|
| "Empathy lite" | Natasha Jen (2017) | Min 15 interviews + quantitative survey required |
| "Innovation theater" | Vinsel (2017) | Phase 6 (Validate) requires measured pilot results |
| "Not a research methodology" | Johansson-Skoldberg (2013) | Paired with goap-research for epistemological rigor |
| Static industry analysis | Teece (1997) | Dynamic capabilities noted; Porter used for structure only |
| Retrospective rationalization in JTBD | Nisbett & Wilson (1977) | Triangulation: interviews + behavioral data + surveys |
| TO BE as data | Jones (2016); real case analysis | Explicit labeling + mandatory pilot validation |
| SWOT oversimplification | Hill & Westbrook (1997) | Never standalone; always as synthesis after PESTEL+Porter |

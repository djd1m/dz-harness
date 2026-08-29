# Basic Evaluation: Design Thinking Skill

## Eval 1: S-tier — Quick User Insight

**Input:** "Understand why users abandon our checkout flow"

**Expected behavior:**
- Classifies as S-tier (quick user insight, 1 persona)
- Activates Steps 1, 2, 5 only
- Invokes `explore` for Task Brief
- Invokes `goap-research-ed25519` for verified data
- Produces JTBD Switch Interview findings (why users "fire" the checkout)
- Produces CJM AS IS from empirical data
- Runs usability test with min 5 users
- Does NOT produce GTM strategy, Lean Canvas, or VSM

**Pass criteria:**
- JTBD school explicitly chosen (Switch for switching behavior)
- CJM AS IS built from data, not assumptions
- Pain points identified with evidence
- Recommendations actionable

---

## Eval 2: M-tier — New Feature Design

**Input:** "Design a one-click reorder feature for our e-commerce platform"

**Expected behavior:**
- Classifies as M-tier
- Activates Steps 1-2-3-4-5
- Produces JTBD statements for reorder use case
- HADI hypotheses with pre-defined metrics
- Lean Canvas (not BMC — new feature, not established business)
- Prototype (clickable mockup or higher)
- Min 2 prototype iterations
- Usability test with SUS score

**Pass criteria:**
- HADI hypotheses have metric + threshold + timeframe BEFORE experiment
- Prototype fidelity appropriate (not paper sketch for UI feature)
- SUS score reported (target >68)
- No TO BE map presented as data

---

## Eval 3: L-tier — New Product with Validation

**Input:** "Design a B2B platform for office space matching with AI-powered recommendations"

**Expected behavior:**
- Classifies as L-tier
- Activates all 6 Steps including Validate
- PESTEL -> Porter -> SWOT cascade (not SWOT alone)
- JTBD with both functional and emotional jobs
- GTM strategy for two-sided platform (chicken-and-egg addressed)
- Unit economics with LTV/CAC
- Pilot designed and metrics compared

**Pass criteria:**
- LTV/CAC > 10 flagged as suspicious if present
- CAC fully-loaded (not marketing-only)
- LTV cohort-based (not aggregate)
- TO BE maps labeled as "hypothesis" / "projection"
- Pilot variance analysis completed
- Final recommendation evidence-based (Scale/Iterate/Pivot/Kill)

---

## Eval 4: XL-tier — Two-Sided Platform with Full Integration

**Input:** "Design a B2B marketplace connecting commercial real estate owners with corporate tenants, with AI-powered matching"

**Expected behavior:**
- Classifies as XL-tier (platform/ecosystem, 30+ files, cross-cutting)
- Activates ALL 6 Steps including Validate
- Invokes all integrations: explore, goap-research, qcsd-ideation-swarm, reverse-engineering-unicorn, problem-solver-enhanced (TRIZ), analyst-manual chain
- Uses Osterwalder BMC (not Lean Canvas — platform with established market dynamics)
- Addresses chicken-and-egg problem (Rochet & Tirole 2003)
- GTM strategy with phased approach (single-side first or seeding)
- Unit economics with LTV/CAC per side (tenant side and owner side separately)
- FMEA for critical failure modes (data breach, matching accuracy, payment)
- Risk register with 5x5 P×I matrix
- Pilot designed for one geography, one segment
- Variance analysis with projected vs actual

**Pass criteria:**
- JTBD school chosen (Switch for understanding switching from email/brokers to platform)
- Two separate CJM AS IS maps (one per side: owner persona + tenant persona)
- GTM addresses chicken-and-egg explicitly (which side to seed first)
- LTV/CAC calculated per side, not blended
- LTV/CAC > 10 flagged if present
- Osterwalder BMC includes multi-sided revenue model
- FMEA with RPN scoring for top 3 risks
- Pilot scope: single city, one segment (e.g., Series A tech companies seeking 200-500 sqm)
- All TO BE maps labeled as hypotheses
- Final recommendation evidence-based

---

## Eval 5: Anti-pattern Detection

**Input:** Provide a DT report that contains known anti-patterns

**Anti-patterns to detect:**
1. CJM AS IS built from "team workshop" (no user research) -> should flag
2. SWOT used as starting analysis without PESTEL/Porter -> should flag
3. LTV/CAC = 15.3 presented without questioning -> should flag
4. Single prototype iteration -> should flag
5. HADI hypothesis without pre-defined metric -> should flag
6. VSM TO BE presented as "measured improvement" -> should flag

**Pass criteria:**
- All 6 anti-patterns detected and flagged
- Corrective action suggested for each

---

## Eval 6 — Simulated-AI prototype + projected economics (anti-pattern + Validate-gap)
*Derived from an anonymized real master's-thesis case (AI travel-guide). Tests P1/P4/P5/P6.*

**Input brief (M/L-tier):** "We're building an AI travel-guide assistant that auto-generates and lets
users edit trip itineraries via AI chat. We ran interviews, built JTBD + CJM + 4 personas, generated 45
ideas and prioritized them with Desirability-Feasibility-Viability. We built two prototypes (a conceptual
value-prop prototype and an 18-screen interactive prototype where the AI responses are **pre-scripted, not
a live model**) and usability-tested both with **8 respondents** using a **custom 75%-of-sample** threshold.
Results: 87.5% liked the value prop; 62.5% found the AI-edit flow. We project 22% pay-conversion, LTV ~1220,
ROI 28–410%, 6-month payback. Is our central hypothesis (the AI assistant is valuable) validated — are we
ready to scale?"

**Expected good-answer flags:**
- Quantitative %s on n=8 = qualitative only; 30+ users needed for the stated quant claims.
- No standardized usability instrument → require SUS (>68) or the ISO 9241-11 effectiveness/efficiency/
  satisfaction scaffold (DT-013); a single 75% custom threshold conflates the three axes.
- **Construct-invalid core hypothesis:** the AI value prop was tested against a scripted Wizard-of-Oz, not
  live generation — generation quality / hallucination / latency stay untested. Require a real-mechanism iteration.
- ROI/LTV/conversion are PROJECTIONS, not data → label "PROJECTION", cohort-based LTV, fully-loaded CAC, real pilot (Phase 6).
- 4 personas on one undifferentiated unscreened n=8 sample → ≥5/persona or scope to one persona per CJM.
- Acknowledge done-well: pre-defined thresholds, two-tier fidelity progression, real test→iterate loop, honest limitation disclosure.
- **Verdict: ITERATE / do-not-scale** — design a pilot (one segment, real AI, payment loop, cohort retention) first.

**Pass:** detects ≥5 issues, explicitly names the simulated-AI validity threat, and refuses to declare the central hypothesis "validated".

## Eval 7 — Divergence-without-a-named-tool (tests P2/P3)
**Input:** "We have 5 HMW questions and want to move straight to HADI hypotheses + a Lean Canvas."
**Expected:** insert a divergent-ideation step (idea volume, crazy-8s / 2-6-1) and an

## Eval 8 — Standardized-instrument enforcement (tests P5/P6)
**Input:** "We usability-tested with a custom 'pass if 75% of the sample succeeds' threshold and reported 62.5%. Enough?"
**Expected:** flag the absence of a standardized instrument; require SUS (>68) or an ISO 9241-11
effectiveness/efficiency/satisfaction scaffold; note the custom single threshold conflates the three usability axes.
**Pass:** recommends a standardized instrument and reframes the custom threshold within ISO 9241-11.

## Eval 9 — Untested monetization & blended economics (tests DT-014/015/016)
*Derived from an anonymized real master's-thesis case (AI cloud-pricing agent).*
**Input:** "Usability tested fine (SUS 74). Revenue model: B2C at 990–7900 RUB and B2B at 15–50k RUB, 5–10%
conversion, ARPU computed by dividing total (B2C+B2B) revenue by our B2C user count, ROI 227%. Prices were
set by our team's judgment — no pricing questions in interviews. Ready to scale?"
**Expected good-answer flags:**
- **Pricing/conversion never validated** — expert estimates, zero WTP evidence; require WTP questions /
  Van Westendorp PSM / A/B price test or an explicit UNVALIDATED label (DT-014). Usability passing does NOT
  validate the monetization hypothesis.
- **Segment-blended ARPU is invalid** — blended B2C+B2B numerator over a B2C-only denominator; recompute
  per-segment with matching numerator and denominator (DT-015).
- **ROI=227% not reproducible** from the disclosed ARPU/COGS/CAC — demand a single source of truth and a
  re-derivable formula (DT-016).
**Pass:** flags the untested price AND the blended-ARPU error, and refuses "validated" on usability alone.

## Eval 10 — Imported inputs & single-point projection (tests DT-017/018)
*Derived from anonymized real master's-thesis cases (team-partitioned GTM / travel-guide).*
**Input:** "Team project: I own architecture + economics. LTV/ARPU borrowed from a teammate's thesis (no paying
customers). Built 3 unit-economics scenarios from a 68-session paid pilot with 1 sign-up. Headline NPV=25M RUB.
Good to present as the result?"
**Expected good-answer flags:**
- **Borrowed, unvalidated inputs** must be labeled as such and carry a sensitivity analysis — at what input
  value does the model stop converging? (DT-017)
- **One conversion event** has an undefined confidence interval — that pilot is reconnaissance, not validation;
  need ~5–10+ conversion EVENTS before a CR seeds scenarios (DT-018).
- **NPV is a projection, not a result** — present with scenario/sensitivity bounds, not a single headline figure (DT-018).
**Pass:** reframes NPV as a sensitivity-bounded projection and flags both the imported inputs and the single-conversion pilot.

## Eval 11 — Team-project scoping & sample bias (tests DT-019/020)
*Derived from anonymized real master's-thesis cases (team-authored product cohort).*
**Input:** "Five-person team product. I own the GTM chapter. Interview counts, personas and CJM come from a
teammate's chapter (cited). I usability-tested with 8 people recruited from our existing loyal user base.
My value-prop validation = the team's research. Declared ICP is less-digitized SMB owners. Validated?"
**Expected good-answer flags:**
- **Team-delegated phases ≠ your validated gate** — label inherited interviews/personas/CJM as team-sourced;
  mark the value-prop validation DELEGATED-UNVERIFIED, not "validated" by this author (DT-019).
- **Sample-segment misalignment** — a loyal/captive frame generalized to "less-digitized SMB owners" is
  selection-biased regardless of N=8; match the sample to the ICP and carry the caveat into conclusions (DT-020).
**Pass:** refuses "validated" on delegated work and flags the captive-sample-vs-ICP mismatch.

## Eval 12 — Untraced solution, arbitrary threshold, compliance gap (tests DT-021/022/023)
*Derived from anonymized real cases (solution-heavy + regulated-data works).*
**Input:** "Product stores users' financial transaction data. Architecture chapter has 16 decisions; we state
'all decisions are linked to user pains'. MVP scope chosen by MoSCoW. Hypothesis confirmed because 'we hit our
>=60% mention cutoff' (we picked 60%). Compliance is one line in the risk register. Ready?"
**Expected good-answer flags:**
- **Untraced solution** — "linked to pains" with no per-decision citation = bolt-on; require each load-bearing
  decision + each MoSCoW tier to cite its specific empirical pain and decider (DT-022).
- **Arbitrary threshold** — the 60% cutoff has no benchmark/baseline justification (DT-023).
- **Compliance feasibility** — financial PII needs a legal/regulatory feasibility analysis in Viability,
  sequenced at entry, not a single risk-register line (DT-021).
**Pass:** flags all three — untraced decisions, unjustified threshold, and the compliance-feasibility gap.

# Step 3: Architecture Decision Records

> Document each significant architectural decision with context, rejected options, consequences, and a named verification method before implementation begins.

## When

M+ tiers. Depth varies:
- **S:** skipped by default; if explicitly forced, use Nygard as the lightweight fallback.
- **M:** 1 Nygard/ITD-light ADR for the main decision, with the invariant core plus drivers, options, rationale, consequences, and Confirmation.
- **L/XL:** N MADR+Confirmation ADRs, one per significant decision.

Can run **in parallel** with Step 2 (Research) for L/XL tiers.

## Model

opus (complex reasoning for trade-off analysis)

## Input

- `{REQUIREMENTS}` from Step 1
- `{RESEARCH_FINDINGS}` from Step 2 (if available — may arrive later in parallel)
- Codebase context

## Protocol

### 1. Identify Decisions

Scan requirements for decision points:

| Signal | Example |
|--------|---------|
| Technology choice | "Which database/queue/framework?" |
| Pattern choice | "Repository vs. Active Record?" |
| Integration strategy | "REST vs. GraphQL vs. gRPC?" |
| Data modeling | "Normalized vs. denormalized?" |
| Deployment strategy | "Monolith vs. microservice?" |
| Trade-off | "Consistency vs. availability?" |

For M-tier: pick the SINGLE most impactful decision.
For L/XL: identify ALL significant decisions, prioritize by architectural impact, and split them into separate ADRs.

Reject explainer-masquerading-as-ADR: a document that describes a space but makes no concrete decision is not an ADR.

### 2. Choose Template Weight

All ADRs must emit the invariant core:
- Title
- Status
- Context
- Decision
- Consequences

Template routing:
- S forced ADR: Nygard fallback.
- M: Nygard/ITD-light form with drivers, options, rationale, consequences, and Confirmation.
- L/XL: MADR structure plus an NHS Wales Confirmation stanza.

The chosen template may be short, but it must still satisfy the Step-8 ADR fitness checklist.

### 3. Enforce File Naming

Create ADRs in `features/<slug>/03_adr/` as:

```text
NNN-{decision-slug}.md
```

Slug rules:
- lowercase kebab-case
- present-tense imperative verb phrase
- no dates
- no ticket numbers
- no camelCase, snake_case, or spaces

Good examples: `001-choose-event-store.md`, `002-enforce-adr-fitness.md`, `003-format-timestamps.md`.

### 4. Draft ADR per Decision

Use `references/adr-template.md`.

Minimum structure:

```markdown
# ADR-{NNN}: {decision-shaped title}

## Status
proposed - Reversible until {condition}; revisit when {trigger}.

## Context
{Neutral problem context written before the decision. State forces and constraints without selling the chosen option.}

## Decision Drivers
1. {Driver D1} (weight: high|medium|low)
2. {Driver D2} (weight: high|medium|low)

## Considered Options
### {Option A}
Pros:
- {real strength}
Cons:
- {real weakness}

### {Option B}
Pros:
- {real strength}
Cons:
- {real weakness}

## Decision
We will {concrete choice with exact names, versions, formats, paths, commands, APIs, or conventions}.

## Rationale
- D1: {why the chosen option satisfies the driver}
- D2: {why rejected options lost despite their strengths}

## Consequences
### Positive
- {benefit}

### Negative / Accepted Downsides
- {cost or risk} - Mitigation: {mitigation}

### Follow-up ADRs
- {ADR-NNN or "None required now"} - {why}

### After-action Review
- Owner: {person/team}
- Schedule: {about one month after acceptance, or a concrete date if known}

## Confirmation
- Method: {test, review, demo, audit, or fitness function}
- Monitoring: {ongoing automated check/audit/training}
- Success metric: {objective pass/fail or numeric metric}
- Owner: {responsible person/team}
- Load-bearing property: {the safety property Step 8 must assert has a test}
- Required automated check: {test file/name, command, or ArchUnit/ArchUnitTS suggestion}
```

For L/XL ADRs, add a decision matrix or comparison table after Considered Options. Keep per-option pros/cons symmetric.

### 5. Validate Against Requirements

Each ADR must trace back to specific requirements:
- Which FR-{N} does this decision support?
- Which NFRs does it satisfy?
- Which constraints does it respect?
- Which safety property must be tested because the ADR's Confirmation names it?

### 6. Lifecycle Discipline

- Status vocabulary is controlled: `proposed`, `accepted`, `rejected`, `deprecated`, `superseded`.
- Status must include a reversibility or revisit clause.
- Supersession mints a NEW ADR and sets the old ADR to `superseded by ADR-{NNN}`; do not edit accepted/rejected ADR content in place.
- If a living-document amendment is unavoidable, add a dated "arrived after the decision" note instead of silently rewriting the original reasoning.

## Anti-Patterns

| Anti-Pattern | Detection | Fix |
|-------------|-----------|-----|
| Explainer masquerading as ADR | Describes a domain but has no concrete Decision | BLOCK; write a decision-shaped ADR |
| Only one alternative | Less than 2 options considered | Require chosen plus rejected options |
| Strawman rejected option | Loser has only cons | Add real strengths and fair trade-offs |
| No consequences | Missing positive/negative analysis | BLOCK until filled |
| Benefits-only consequences | No accepted downside | Add negative outcomes and mitigations |
| Decision without context | Why is unclear | Add neutral Context before Decision |
| Vague decision | "use a modern database" | Name exact product/version/format/path/API |
| Placeholder text | Template hints or TODOs remain | Remove or fill before checkpoint |
| Supersession in-place | Existing ADR rewritten | Mint a new ADR and link it |

## Write discipline (the 180-second rule)

An executor that returns from a tool call and then thinks in silence past **180 seconds** is killed by the
runtime. Thinking time grows with the history already accumulated, so on a large repo "read everything,
then write the document" is not a risk — it is a deterministic death, and nothing survives it, because
nothing was ever on disk.

MEASURED on this harness: the writing steps died **18 times out of 18** in the reading phase without ever
writing a file. The control — same slice, same model, one added instruction to write a skeleton early —
landed the skeleton 8 minutes in, on the first attempt, after six consecutive deaths.

So, in this step:

1. **Skeleton first — inside your first ~12 tool calls.** For each decision you have identified, write
   `features/<slug>/03_adr/NNN-{decision-slug}.md` containing only the invariant-core headings
   (Status · Context · Decision Drivers · Considered Options · Decision · Rationale · Consequences ·
   Confirmation), one line of intent under each. A named-but-empty option beats an unwritten ADR.
2. **Then fill it one section per edit.** No single edit longer than ~120 lines. Every edit leaves the
   file readable; none of them is allowed to wait for the section after it.
3. **Never go more than 2 minutes without a tool call.** A thought that is getting long is the signal to
   stop and write what you have — an edit is a checkpoint, not an interruption.
4. **When you are unsure whether to read more or to write, WRITE.** A thin section refined later survives;
   a perfect section you never reached does not.

The skeleton is not a draft to apologise for. It is the artifact, opened early.

## Output

Create `features/<slug>/03_adr/` directory with:
- `NNN-{decision-slug}.md` for each ADR
- Each ADR follows the template and satisfies the fitness checklist

Set `{ADR_DECISIONS}` variable with list of decisions and their Confirmation load-bearing properties.

## Checkpoint Format

```text
=======================================================
STEP 3/8: ADR Complete
Tier: {COMPLEXITY_TIER}

{N} architectural decisions documented:
1. ADR-001: {title} -> chose {option}; Confirmation: {method}, {metric}, owner {owner}
2. ADR-002: {title} -> chose {option}; Confirmation: {method}, {metric}, owner {owner}

Fitness readiness:
- Invariant core present: PASS|FAIL
- Concrete/testable decisions: PASS|FAIL
- Confirmation properties named for Step 8: PASS|FAIL

- "ok" - proceed
- "revise ADR-{N}" - reconsider decision
- "add ADR for [topic]" - add new decision
=======================================================
```

## Shift-Left Validation (after ADR creation)

After all ADRs are drafted, apply **shift-left-testing** protocol (Level 4: Risk Analysis in Design).

> Load: `references/agentic-qe/shift-left-testing.md`

### Testability Check per ADR

For each ADR decision, run risk analysis:

```text
ADR-{NNN}: {Title}
  Confirmation:
    Method: {verification method}
    Monitoring: {ongoing monitoring}
    Success metric: {metric}
    Owner: {owner}
    Load-bearing property: {property}
  Testability Questions:
    1. What happens when {chosen option} fails under load?
    2. How do we handle {alternative failure modes}?
    3. What if {external dependency} becomes unavailable?
    4. Can we test this decision in isolation?
  Generated BDD Scenarios:
    Given {precondition from ADR context}
    When {action that exercises the decision}
    Then {expected outcome per ADR consequences}
  Required Automated Check:
    {test file/name/command or ArchUnit/ArchUnitTS fitness function}
  Risk Level: LOW | MEDIUM | HIGH
```

### Shift-Left Gate

| Check | Threshold |
|-------|-----------|
| All ADRs have testability questions answered | 100% |
| Each ADR has a Confirmation stanza | 100% |
| Each Confirmation names method, monitoring, success metric, owner | 100% |
| Each load-bearing property has a proposed automated check | 100% |
| BDD scenarios generated for non-trivial decisions | >=1 per ADR |
| No HIGH risk without mitigation documented | 0 unmitigated |

If any ADR has HIGH risk without mitigation, or a Confirmation property with no proposed automated check, flag at checkpoint for user decision.

### Integration with Step 3.5 and Step 8

The shift-left validation output feeds directly into Step 3.5 (QCSD Ideation Swarm):
- BDD scenarios become input for the requirements-validator agent
- Risk analysis feeds the risk-assessor agent
- Testability questions inform the quality-criteria-recommender

Step 8 must read the Confirmation stanza and assert that the named load-bearing property has a real automated test or fitness function in the shipped code. For architecture dependency/layering/interface rules, suggest ArchUnit or ArchUnitTS.

## Quality Gates

- [ ] Every ADR has the invariant core: Title, Status, Context, Decision, Consequences
- [ ] Every ADR records exactly one decision
- [ ] Filename slug is kebab-case, imperative, dateless, and ticketless
- [ ] Status uses controlled vocabulary plus a reversibility clause
- [ ] Context is neutral and appears before Decision
- [ ] Decision drivers are ranked or weighted
- [ ] Considered options include rejected options with symmetric pros/cons
- [ ] Rationale maps each point to a driver and explains why losers were rejected
- [ ] Decision is concrete/testable with exact names/versions/formats/paths/APIs
- [ ] Consequences include positive and negative outcomes/accepted downsides
- [ ] Consequences link follow-up ADRs and schedule an after-action review
- [ ] Confirmation names method, monitoring, success metric, owner, load-bearing property, and required automated check
- [ ] No placeholder text or generation scaffolding remains

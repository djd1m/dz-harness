---
name: capture-adr
description: >
  Lightweight ADR capture mid-conversation without full ceremony. Detects architectural decisions
  being made implicitly during coding sessions and records them as minimal MADR 4.0 entries.
  Auto-increments numbering, appends to docs/decisions/, and tags captured ADRs with
  "needs-oversight" for human confirmation. Does NOT replace deliberate architecture sessions.
  Triggers on: "capture ADR", "record this decision", "note this architecture choice",
  "ADR for this", "capture that as an ADR", "save this decision".
trust_tier: 1
trust_tier_label: "Structured"
trust_tier_path: "Run /bto-test to promote to Tier 2"
validation:
  schema_path: schemas/output.json
  validator_path: scripts/validate-config.json
---

# Capture ADR

Record architectural decisions as they emerge in conversation — lightweight, low-friction,
no ceremony. Inspired by [@windyroad/architect](https://agentskills.io), adapted as a
quick "aside" that keeps decisions traceable without interrupting flow.

## When to Use

- During a coding session when a technology or pattern choice is made ("let's use Zod for validation")
- When you notice an implicit decision that should be recorded ("we just decided to go REST not GraphQL")
- On explicit request: "capture ADR", "record this decision", "note this architecture choice"
- When a significant design trade-off is accepted ("we'll skip pagination for now — capture that")
- To create a lightweight audit trail without stopping to run a full architecture session

## When NOT to Use

- Deliberate architecture design sessions — use `feature-adr` Step 3 (full ADR with research)
- Capturing every minor implementation detail (only architecturally significant decisions qualify)
- Replacing formal RFC or design doc processes for high-stakes decisions
- When the decision is still being debated — wait until the decision is actually made

## Protocol

### Step 1: Detect the Decision

Recognize that an architectural decision has been made. Qualifying decisions:

| Type | Examples |
|------|---------|
| Technology choice | "we'll use Vitest not Jest", "Postgres not SQLite" |
| Pattern selection | "we'll use repository pattern here", "event-driven for this module" |
| API design | "REST endpoints, not tRPC", "versioned via URL path" |
| Data model choice | "denormalize this for read performance", "soft-delete pattern" |
| Integration approach | "call vendor API directly, not via queue" |
| Constraint acceptance | "skip auth for MVP", "hardcode config for now" |

Minor decisions that do NOT qualify: variable naming, file organization within a module,
formatter/linter preferences, comment style.

### Step 2: Capture the ADR Content

Extract the four required fields from the conversation context:

| Field | Length | What to capture |
|-------|--------|----------------|
| **Title** | 5-10 words | Imperative phrase describing the decision ("Use Zod for runtime validation") |
| **Context** | 1-2 sentences | Why this decision point arose; what alternatives existed |
| **Decision** | 1 sentence | The choice made, stated plainly |
| **Consequences** | 2-3 bullets | Key trade-offs accepted: benefits and costs |

If any field cannot be confidently inferred from the conversation, emit a `needs-oversight`
flag and leave the field as a placeholder for human completion.

### Step 3: Format as Minimal MADR 4.0

Use this template (minimal, not the full MADR template):

```markdown
# NNNN. {Title}

Date: {YYYY-MM-DD}
Status: accepted
Tags: needs-oversight

## Context

{1-2 sentences}

## Decision

{1 sentence}

## Consequences

- {benefit or trade-off}
- {cost or limitation accepted}
- {follow-up action if any}
```

`needs-oversight` tag is always added for auto-captured ADRs. A human should review and
remove it (or change status to `superseded`) once confirmed.

### Step 4: Save to docs/decisions/

1. Scan `docs/decisions/` for existing files matching `NNNN-*.md`.
2. Find the highest existing number N; new file gets N+1, zero-padded to 4 digits.
3. Generate slug from title: lowercase, hyphens, strip punctuation, max 40 chars.
4. Write file: `docs/decisions/{NNNN}-{slug}.md`
5. If `docs/decisions/` does not exist, create it and note the creation in the report.

### Step 5: Report

Confirm the capture with a brief inline notice:

```
ADR CAPTURED
  File: docs/decisions/0003-use-zod-for-runtime-validation.md
  Title: Use Zod for runtime validation
  Status: accepted (needs-oversight)
  Action: Review and remove needs-oversight tag when confirmed
```

Keep the notice brief — this is an aside, not the main thread of conversation.

## Anti-Patterns

| Anti-Pattern | Why It Fails | Correct Approach |
|-------------|-------------|-----------------|
| Capturing every minor choice | ADR list becomes noise; significant decisions get lost | Only capture architecturally significant decisions (see qualifying types above) |
| Missing the rationale | "Use Postgres" with no context is useless in 6 months | Always capture 1-2 sentences of context — why this, why now |
| Skipping needs-oversight tag | Auto-captured ADRs may miss nuance or misinterpret the decision | Always tag; let human confirm and promote |
| Capturing during debate | Records an interim position as a final decision | Wait until the decision is clearly made; don't capture "maybe we'll use X" |
| Using full MADR template | Full template creates friction that defeats the purpose | Minimal 4-field format only: title, context, decision, consequences |

## Self-Check

- [ ] Decision is architecturally significant (not a minor implementation detail)?
- [ ] All four fields captured (title, context, decision, consequences)?
- [ ] Minimal MADR 4.0 format used (not full template)?
- [ ] `needs-oversight` tag present?
- [ ] File saved to `docs/decisions/NNNN-slug.md` with correct auto-incremented number?
- [ ] Capture notice delivered inline without derailing the main conversation?

## Examples

**In scope:**
- "capture ADR" (after deciding to use a pattern) → detect decision from context, write ADR
- "record this decision" → extract title/context/decision/consequences, save file
- "let's use Zod — ADR for this" → capture "Use Zod for runtime validation"
- "we'll do soft-delete, note this architecture choice" → capture data model decision

**Out of scope:**
- "design the auth architecture" → use `feature-adr` Step 3 for deliberate design
- "should we use REST or GraphQL?" (still debating) → wait until decided, then capture
- "record that we named this variable authToken" → not architecturally significant

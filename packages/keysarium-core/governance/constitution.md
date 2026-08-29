# Constitution — Universal Invariants

> Unbreakable rules for any multi-agent pipeline. These invariants are enforced at every stage gate and may never be violated.

## Overview

A Constitution defines the set of rules that are **always true** regardless of pipeline configuration, domain, or stage. They serve as hard enforcement gates — if an invariant is violated, the pipeline must halt.

This is inspired by the 7-layer governance model (Ruflo) and the 7 constitutional invariants (Agentic QE).

## Defining Invariants

Each invariant follows this format:

```markdown
### INV-{NNN}: {Short Name}

**Rule:** {One-sentence statement of what must always be true}

**Enforcement:** {How to check — deterministic check, file existence, hash verification, etc.}

**On violation:** {HALT | WARN | RETRY(N)}

**Rationale:** {Why this invariant exists}
```

## Template Invariants

The following invariants are recommended as a starting point for any multi-agent pipeline. Customize or extend based on your domain.

### INV-001: Artifact Integrity

**Rule:** Every artifact produced by a stage must be verifiable against its witness chain hash.

**Enforcement:** After each stage completion, verify that the artifact file exists and its SHA-256 hash matches the chain record.

**On violation:** HALT — artifact may have been tampered with.

**Rationale:** Ensures no artifact is silently modified between stages.

### INV-002: Stage Completion Signal

**Rule:** A stage may not be marked complete without emitting a promise tag.

**Enforcement:** Check that the stage's checkpoint includes a `<promise>` tag matching the expected value.

**On violation:** HALT — downstream stages cannot trust upstream completion.

**Rationale:** Promise tags are machine-readable signals that formalize stage gates.

### INV-003: Human Checkpoint Required

**Rule:** A stage may not auto-advance to the next stage without human confirmation at the checkpoint.

**Enforcement:** The orchestrator must wait for explicit user input before proceeding.

**On violation:** HALT — no auto-advancement permitted.

**Rationale:** Human-in-the-loop prevents runaway automation and ensures quality.

### INV-004: Evaluator Independence

**Rule:** Evaluators (judges) in a multi-evaluator panel must operate in strict isolation. No evaluator may see another evaluator's score before submitting its own.

**Enforcement:** Judge attestation protocol — each judge creates a hash of its evaluation before scores are shared.

**On violation:** HALT — evaluation integrity compromised.

**Rationale:** Independent evaluation prevents conformity collapse and produces more reliable quality signals.

### INV-005: Loop Detection

**Rule:** No agent may perform the same action more than 3 consecutive times without variation.

**Enforcement:** Track the last 3 actions per agent. If identical, halt and escalate.

**On violation:** WARN + escalate to coordinator.

**Rationale:** Prevents infinite loops and wasted resources.

### INV-006: Memory Consistency

**Rule:** No contradictory patterns may coexist in the memory system.

**Enforcement:** When storing a new pattern, check for existing patterns with the same pattern_id but conflicting content. If found, the newer pattern supersedes the older.

**On violation:** WARN — resolve by keeping the most recent pattern.

**Rationale:** Contradictory patterns degrade learning quality.

### INV-007: No Unverified Claims

**Rule:** Research outputs must not contain unverified factual claims presented as verified.

**Enforcement:** Scan output artifacts for factual claims. Each must have a source citation or be marked as `[ANALYSIS]` or `[UNVERIFIED]`.

**On violation:** HALT — return to research stage for verification.

**Rationale:** Unverified claims undermine the credibility of the entire pipeline output.

## Customization

### Adding Domain-Specific Invariants

To add invariants for your pipeline:

1. Create a file `governance/constitution-{domain}.md` with additional invariants
2. Number new invariants starting from INV-100 (to avoid conflicts with core)
3. Follow the same format (Rule, Enforcement, On violation, Rationale)

### Example: Banking Domain

```markdown
### INV-100: Data Perimeter

**Rule:** No customer data may leave the security perimeter.

**Enforcement:** All LLM calls must be to on-premise models (no external API calls).

**On violation:** HALT — regulatory breach (FZ-152).
```

### Example: Evaluation Domain (BTO)

```markdown
### INV-100: Judge-Generator Separation

**Rule:** The model used for generating an artifact must differ from the model used for evaluating it.

**Enforcement:** Compare model IDs at evaluation start.

**On violation:** HALT — self-evaluation bias.
```

## Enforcement Integration

At each stage gate (checkpoint), the orchestrator should:

1. Load the constitution (this file)
2. Load any domain-specific constitution extensions
3. Run each invariant's enforcement check
4. If any check fails with HALT severity, stop the pipeline
5. If any check fails with WARN severity, log and continue
6. If any check fails with RETRY severity, retry up to N times before halting

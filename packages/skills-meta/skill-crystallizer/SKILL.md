---
name: skill-crystallizer
description: >
  Auto-creates new skills from execution traces, combines existing skills into composites,
  and repairs broken skills. Based on OpenSpace (HKUDS/OpenSpace) concepts for emergent
  skill discovery. Three modes: CAPTURED (trace -> skill), DERIVED (combine skills),
  FIX (detect + repair). Triggers on: "crystallize skill", "extract pattern",
  "create skill from this", "what did we learn".
trust_tier: 1
trust_tier_label: "Structured"
trust_tier_path: "Run /bto-test to promote to Tier 2"
validation:
  schema_path: schemas/output.json
  validator_path: scripts/validate-config.json
---

# Skill Crystallizer: Auto-Create Skills from Execution Traces

Extracts reusable skills from successful task executions, combines existing skills into
composites, and auto-repairs broken or underperforming skills. Inspired by OpenSpace
(github.com/HKUDS/OpenSpace) emergent skill discovery.

## When To Activate

Trigger on:
- "crystallize skill" or "crystallize from trace"
- "extract pattern" or "extract skill"
- "create skill from this"
- "what did we learn"
- "combine skills X and Y"
- "fix skill X" or "repair skill X"

## Modes

### Mode 1: CAPTURED

After a successful task, analyze the execution trace to extract a reusable pattern and
scaffold a new SKILL.md.

**When to use:** A task succeeded and the approach could help future similar tasks.

**Protocol:**
1. Analyze execution trace: what tools were used, in what order, what decisions were made
2. Identify the reusable pattern: would this help future tasks? Is it generalizable?
3. Extract skill metadata: name, description, when-to-use, protocol steps, anti-patterns
4. Scaffold: `dz create-skill --name <id> --bto`
5. Fill SKILL.md from extracted pattern (follow agentskills.io format)
6. Benchmark: `dz benchmark` to verify Grade A quality

### Mode 2: DERIVED

Combine 2+ existing skills into a composite skill that chains their protocols.

**When to use:** Two or more skills are frequently used together in sequence, and the
combination itself is a reusable workflow.

**Protocol:**
1. Identify candidate skills to combine
2. Analyze their protocols for natural handoff points
3. Define the composite protocol: which steps from each skill, in what order
4. Handle data flow between skills (outputs of one become inputs of another)
5. Scaffold composite SKILL.md with references to source skills
6. Benchmark the composite independently

### Mode 3: FIX

Detect broken or underperforming skills and apply auto-repair.

**When to use:** A skill consistently fails, produces low-quality output, or has
outdated references.

**Protocol:**
1. Detect: skill fails validation, benchmark score < Grade B, or user reports issues
2. Diagnose: run `dz benchmark` on the skill, analyze failure modes
3. Classify issue: outdated references, missing steps, incorrect anti-patterns, schema mismatch
4. Repair: apply targeted fixes (not full rewrite unless necessary)
5. Re-benchmark: verify repair restored Grade A quality
6. Document: add anti-pattern entry for the failure mode

## Protocol

1. **Analyze execution trace** — What was done, what tools used, what patterns emerged
2. **Identify reusable pattern** — Would this help future tasks? Is it generalizable?
3. **Extract** — Name, description, when-to-use, protocol steps, anti-patterns
4. **Scaffold** — `dz create-skill --name <id> --bto`
5. **Fill SKILL.md** — From extracted pattern, following agentskills.io format
6. **Benchmark** — `dz benchmark` to verify Grade A

## Examples

**In scope:**
- Trigger phrases listed in When To Activate

**Out of scope:**
- Tasks unrelated to this skill domain

## Anti-Patterns

| Anti-Pattern | Detection | Fix |
|-------------|-----------|-----|
| Over-specific skill | Skill only works for the exact original task | Generalize: replace specifics with parameters |
| Trivial skill | Skill wraps a single command with no added value | Reject: not worth the maintenance cost |
| Duplicate skill | Skill overlaps 80%+ with existing skill | Merge into existing or create DERIVED composite |
| Broken references | Skill references tools/files that no longer exist | FIX mode: update references |
| Missing anti-patterns | Skill has no "when NOT to use" guidance | Add anti-patterns from failure analysis |
| Untested skill | Skill has no evals/basic.md scenarios | Add minimum 2 eval scenarios before publishing |

## Dependencies

| Resource | Path | Purpose |
|----------|------|---------|
| dz create-skill | CLI command | Scaffold new skill directories |
| dz benchmark | CLI command | Verify skill quality grade |
| schemas/output.json | schemas/output.json | Output validation schema |
| validate-config.json | scripts/validate-config.json | Validation rules |

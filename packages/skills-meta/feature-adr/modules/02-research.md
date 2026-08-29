# Step 2: Research — Analogues & Patterns

> Research existing patterns in codebase and external best practices before designing.

## When

L/XL tiers only. Can run **in parallel** with Step 3 (ADR).

## Model

sonnet (research synthesis)

## Input

- `{REQUIREMENTS}` from Step 1
- `{COMPLEXITY_TIER}` from Step 0
- Codebase access

## Protocol

### 1. Codebase Pattern Research (Agent 1 — sonnet)

Search the current codebase for:

| What | How |
|------|-----|
| Similar features | Grep for related domain terms, find analogous implementations |
| Established patterns | How does existing code handle similar problems? |
| Shared utilities | What existing helpers, services, or abstractions can be reused? |
| Test patterns | How are similar features tested? |
| Data access patterns | How do similar features access data? |

Document each finding with file path + line reference.

### 2. External Pattern Research (Agent 2 — sonnet)

Research external analogues:

| What | How |
|------|-----|
| Industry patterns | How do similar products solve this? |
| Framework conventions | What does the framework recommend? |
| Library options | Are there well-maintained libraries for this? |
| Anti-patterns | What are known pitfalls to avoid? |

Use `goap-research-ed25519` for verified research if the feature involves:
- Security-sensitive decisions
- Compliance requirements
- Performance-critical paths

### 3. Synthesize Findings

Combine both research streams into:

```
## Pattern Summary
1. Codebase has [N] similar implementations using [pattern]
2. Framework recommends [approach] for this type of feature
3. Key libraries considered: [list with trade-offs]
4. Anti-patterns to avoid: [list]

## Recommendation
Based on research, the recommended approach is [X] because [reasons].
Alternative considered: [Y], rejected because [reasons].
```

## Agent Swarm (2 parallel, sonnet)

| Agent | Task | Model |
|-------|------|-------|
| Agent 1 | Codebase pattern research | sonnet |
| Agent 2 | External analogues research | sonnet |

After both complete, synthesize results sequentially.

## Write discipline (the 180-second rule)

An executor that returns from a tool call and then thinks in silence past **180 seconds** is killed by the
runtime. Thinking time grows with the history already accumulated, so on a large repo "read everything,
then write the document" is not a risk — it is a deterministic death, and nothing survives it, because
nothing was ever on disk.

MEASURED on this harness: the writing steps died **18 times out of 18** in the reading phase without ever
writing a file. The control — same slice, same model, one added instruction to write a skeleton early —
landed the skeleton 8 minutes in, on the first attempt, after six consecutive deaths.

So, in this step:

1. **Skeleton first — inside your first ~12 tool calls.** Write `features/<slug>/02_research.md` containing only the headings this step
   requires (Codebase patterns · External patterns · Library evaluation · Anti-patterns ·
   Recommended approach), one line of intent under each — before the research agents report back,
   not after.
2. **Then fill it one section per edit.** No single edit longer than ~120 lines. Every edit leaves the
   file readable; none of them is allowed to wait for the section after it.
3. **Never go more than 2 minutes without a tool call.** A thought that is getting long is the signal to
   stop and write what you have — an edit is a checkpoint, not an interruption.
4. **When you are unsure whether to read more or to write, WRITE.** A thin section refined later survives;
   a perfect section you never reached does not.

The skeleton is not a draft to apologise for. It is the artifact, opened early.

## Output

Create `features/<slug>/02_research.md` with:
- Codebase patterns found (with file references)
- External patterns researched
- Library evaluation (if applicable)
- Anti-patterns identified
- Recommended approach

Set `{RESEARCH_FINDINGS}` variable.

## Quality Gates

- [ ] At least 3 codebase patterns examined
- [ ] External patterns verified (not hallucinated)
- [ ] Trade-offs documented for each alternative
- [ ] Clear recommendation with rationale

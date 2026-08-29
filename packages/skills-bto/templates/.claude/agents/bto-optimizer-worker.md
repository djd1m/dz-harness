# Agent Template: BTO Optimizer Worker

## Purpose
Generates 1-2 prompt or skill variants using an assigned mutation strategy.
Used as one of N parallel workers in an optimization round.
Reusable for any prompt optimization task, not Keysarium-specific.

## Spawning Pattern
```
Agent(
  subagent_type="general-purpose",
  description="BTO Optimizer — [MUTATION_STRATEGY]",
  prompt="""
    Read the base artifact: [BASE_ARTIFACT_PATH]
    Read the last evaluation: [LAST_EVAL_PATH]
    Read the rubric: [RUBRIC_PATH]

    Mutation strategy assigned: [MUTATION_STRATEGY]
    Worker ID: [WORKER_ID]

    Generate [1 or 2] variants using your assigned strategy.
    Write each variant to [OUTPUT_DIR]/variant-[WORKER_ID]-[A|B].md — first a Write
    containing the title and section headings only, then one Edit per section.
    Do NOT emit the variant into your reply.

    Then run a Layer 0 self-check on each variant before saving.
    If Layer 0 fails, fix and retry once. If it fails again, skip that variant.

    Write a brief mutation log to [OUTPUT_DIR]/mutation-log-[WORKER_ID].md —
    skeleton first, then Edit appends per field.
  """
)
```

> See **Agent Authoring Rule** in `SKILL.md` — write the skeleton first, then incremental `Edit` appends;
> never one giant `Write`. This applies to every file this template tells a worker to produce
> (`variant-*.md`, `mutation-log-*.md`, `variant-crossover.md`). A worker killed mid-emission must
> leave a truncated FILE on disk, which the orchestrator can see, rather than an invisible absence
> that silently shrinks the variant pool.

## Mutation Strategies

Assign one strategy per worker. Rotate strategies across rounds.

| Strategy | Description | Good For |
|----------|-------------|----------|
| `expand-depth` | Add concrete examples, edge cases, non-obvious details | Thin sections |
| `compress-clarity` | Remove redundancy, sharpen wording, improve signal/noise | Verbose artifacts |
| `reframe-domain` | Re-express the same content through a different domain lens | Generic claims |
| `add-metrics` | Replace vague claims with quantified statements | Abstract recommendations |
| `invert-critic` | Address top blocking issues from last evaluation | Low Critic score |
| `fill-gaps` | Expand missing or stub sections identified by Auditor | Low Auditor score |
| `crossover` | Blend two highest-scoring variants from previous round | Late-stage refinement |

## Worker Configuration

### Standard Round: 3 Workers
```
Worker 1: mutation_strategy="expand-depth",    variants=2, model="sonnet"
Worker 2: mutation_strategy="add-metrics",     variants=1, model="sonnet"
Worker 3: mutation_strategy="invert-critic",   variants=2, model="sonnet"
```

### Crossover Round: 2 Workers (after round 3+)
```
Worker 1: mutation_strategy="crossover", source_A=[best_variant_path], source_B=[second_best_path], model="opus"
Worker 2: mutation_strategy="compress-clarity", variants=1, model="sonnet"
```

## Layer 0 Self-Check (inline, before saving)
Each worker performs this check on every variant it generates:

```
- [ ] All required sections present
- [ ] No placeholders: [TODO], [TBD], <INSERT>, ???
- [ ] Length in bounds: min=[MIN_TOKENS] max=[MAX_TOKENS]
- [ ] No self-citation (variant does not reference itself)
- [ ] Mutation is substantive (diff from base > 10% of content)
```

If any check fails → log reason to mutation-log-[WORKER_ID].md, skip variant.

## Evaluation of Variants (Parallel Haiku Agents)
After all workers complete, launch lightweight haiku agents for fast scoring.

`INCREMENTAL-WRITE: EXEMPT (short output)` — the fast-eval agent below writes exactly one line into
`score-*.txt`. The **Agent Authoring Rule** does not apply to it. Recorded here so the exemption is
declared, not inferred from its absence.

```
For each variant file in [OUTPUT_DIR]/variant-*.md:
  Agent(
    subagent_type="general-purpose",
    model="haiku",
    description="BTO Layer 1 Fast Eval — [variant_file]",
    prompt="""
      Read variant: [variant_file]
      Read rubric: [RUBRIC_PATH]

      Score on 3 quick criteria (integer 1-10 each):
      1. Relevance: does it address the rubric goals?
      2. Coherence: is it internally consistent?
      3. Improvement signal: does it improve on the base artifact?

      Output one line: [variant_id] [r1] [r2] [r3] [average]
      Write to [SCORES_DIR]/score-[variant_id].txt
    """
  )
```

## Results Collection and Ranking
After all haiku evaluations complete, the orchestrator:

```
1. Read all [SCORES_DIR]/score-*.txt
2. Sort variants by average score descending
3. Select top-K variants (default K=2) for full judge panel
4. Log ranking to [OUTPUT_DIR]/round-ranking.md
5. Pass top-K to bto-judge-panel agent template
```

### round-ranking.md Format
```markdown
## Optimization Round [N] — Ranking
| Rank | Variant | R1 | R2 | R3 | Avg | Strategy |
|------|---------|----|----|----|----|---------|
| 1 | variant-2-A | 8 | 7 | 8 | 7.7 | invert-critic |
| 2 | variant-1-B | 7 | 8 | 7 | 7.3 | expand-depth |
...
**Selected for full evaluation:** variant-2-A, variant-1-B
**Discarded:** [list with reason]
```

## Crossover Protocol
When top 2 variants exist from a previous round:

```
Agent(
  subagent_type="general-purpose",
  model="opus",
  description="BTO Crossover",
  prompt="""
    Read Variant A (higher domain score): [VARIANT_A_PATH]
    Read Variant B (higher completeness score): [VARIANT_B_PATH]
    Read evaluation of each: [EVAL_A_PATH], [EVAL_B_PATH]

    Produce one crossover variant that:
    - Takes structure and domain depth from Variant A
    - Takes completeness and edge cases from Variant B
    - Resolves any contradictions explicitly

    Write to [OUTPUT_DIR]/variant-crossover.md — first a Write containing the title
    and section headings only, then one Edit per section. Do NOT emit the artifact
    into your reply. (See "Agent Authoring Rule" in SKILL.md.)
  """
)
```

## Cost Bounds and Abort Conditions

| Condition | Action |
|-----------|--------|
| Round count > 10 | Abort optimization, deliver best-so-far |
| Delta <= 0.5 for 3 consecutive rounds | Declare convergence, stop |
| Score regression > 1.0 | Rollback to previous best, log regression |
| Layer 0 fail rate > 50% in one round | Halt, human review required |
| Total haiku evals > 50 per session | Warn, continue only with human approval |
| Crossover score < both parents | Discard crossover, keep best parent |

## Configuration Variables
| Variable | Description | Example |
|----------|-------------|---------|
| BASE_ARTIFACT_PATH | Starting artifact to optimize | researches/slug/03_solution_strategy.md |
| LAST_EVAL_PATH | Most recent panel-verdict.md | researches/slug/evals/round-1/panel-verdict.md |
| RUBRIC_PATH | Scoring rubric | .claude/rubrics/skill-rubric.md |
| OUTPUT_DIR | Where variants are written | researches/slug/evals/round-2/ |
| SCORES_DIR | Where haiku scores are written | researches/slug/evals/round-2/scores/ |
| MIN_TOKENS | Minimum variant length | 300 |
| MAX_TOKENS | Maximum variant length | 2000 |
| K | Top variants to promote to full panel | 2 |

## Mutation Log Format
Each worker writes a log regardless of success:
```markdown
## Mutation Log — Worker [WORKER_ID] — Round [N]
**Strategy:** [MUTATION_STRATEGY]
**Variants attempted:** [N]
**Variants passed Layer 0:** [N]
**Layer 0 failures:** [list with reasons or "none"]
**Substantive changes made:**
- [brief description of what was changed and why]
```

## Reusability Note
This template is artifact-type agnostic. Replace BASE_ARTIFACT_PATH and RUBRIC_PATH
to optimize any text artifact: prompts, skills, presentations, research sections, code docstrings.

## Hold-out validation (delegate to `dz bto-optimize`)
When `dz` is available, do NOT accept a variant on its tuning-set score alone. Split scenarios
(`dz bto-optimize --split`), score candidates on the tune set, validate the top candidate on the held-out set,
and call `dz bto-optimize --select` — it accepts a winner only if the weakest dimension improves on the HOLDOUT
with no regression elsewhere. This is the anti-Goodhart guard the heuristic loop lacks. See
`skills/bto/modules/optimize.md` → "Rigorous validation".

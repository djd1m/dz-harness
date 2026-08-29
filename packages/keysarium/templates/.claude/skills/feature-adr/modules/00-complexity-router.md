# Step 0: Complexity Router

> Classify the feature into S/M/L/XL tier and determine which pipeline steps to activate.

## When

Always runs first. Takes ~30 seconds. Uses haiku model.

## Input

- Feature description (from user or issue)
- Current codebase context (project structure, tech stack)

## Protocol

### 1. Analyze Feature Scope

Evaluate the feature against 6 dimensions:

| Dimension | S (1pt) | M (2pt) | L (3pt) | XL (4pt) |
|-----------|---------|---------|---------|----------|
| **Files affected** | 1-3 | 4-10 | 11-30 | 30+ |
| **Domains touched** | 1 | 1-2 | 2-4 | 4+ |
| **New integrations** | 0 | 0-1 | 1-3 | 3+ |
| **Breaking changes** | 0 | 0 | 0-2 | 2+ |
| **New data models** | 0 | 0-1 | 1-3 | 3+ |
| **Cross-cutting concerns** | 0 | 0-1 | 1-2 | 3+ |

Cross-cutting concerns: auth, logging, caching, i18n, error handling, etc.

### 2. Score and Classify

Sum all dimension scores:

| Total Score | Tier | Label |
|-------------|------|-------|
| 6-8 | **S** | Small — localized change |
| 9-13 | **M** | Medium — bounded feature |
| 14-19 | **L** | Large — multi-domain feature |
| 20-24 | **XL** | Extra Large — cross-cutting system change |

### 3. Override Rules

The router may override the score-based classification:

- If **any single dimension = XL (4pt)** → minimum tier is L
- If **breaking changes > 0** → minimum tier is M
- If user explicitly requests a tier → use that tier
- If feature description mentions "refactor", "migration", "redesign" → bias toward L/XL

### 4. Determine Active Steps

Load `references/complexity-matrix.md` for the full matrix. Summary:

| Step | S | M | L | XL |
|------|---|---|---|-----|
| 0 Complexity Router | ✓ | ✓ | ✓ | ✓ |
| 1 Requirements | ✓ light | ✓ | ✓ | ✓ |
| 2 Research | - | - | ✓ | ✓ |
| 3 ADR + Shift-Left | - | ✓ (1 ADR, Nygard/ITD-light) | ✓ (N ADRs, MADR+Confirmation) | ✓ (N ADRs, MADR+Confirmation) |
| 3.5 QCSD Ideation Swarm | - | ✓ | ✓ | ✓ |
| 4 DDD | - | - | ✓ | ✓ |
| 5 Architecture | - | ✓ light | ✓ | ✓ |
| 6 Implementation Plan | ✓ inline | ✓ | ✓ | ✓ |
| 7 Code | ✓ | ✓ | ✓ | ✓ |
| 8 QE + Brutal Honesty | ✓ smoke | ✓ | ✓ | ✓ full |
| 9 Fleet QE Assessment | - | - | ✓ | ✓ |

> Steps 3.5 (M+) and 9 (L/XL) are mandatory — skipping them is a BLOCK per the shard Anti-Patterns.

ADR template weight is part of routing:
- Summary: S/M -> Nygard/ITD-light; L/XL -> MADR+Confirmation.
- S: normally skip Step 3; if an ADR is explicitly forced, use Nygard as the lightweight fallback.
- M: use Nygard/ITD-lightweight ADRs with the invariant core plus drivers, options, rationale, consequences, and Confirmation.
- L/XL: use full MADR structure with an NHS Wales Confirmation stanza for each significant decision.
- All generated ADRs must keep the invariant core: Title, Status, Context, Decision, Consequences; one decision per ADR.

### 5. Calculate Time Budget

| Tier | Total Budget | Distribution |
|------|-------------|--------------|
| S | 15 min | R:2 P:0 I:10 Q:3 |
| M | 45 min | R:5 P:10 I:20 Q:10 |
| L | 2 hours | R:15 P:30 I:45 Q:30 |
| XL | 4+ hours | R:30 P:60 I:90 Q:60 |

R = Requirements, P = Planning (ADR+DDD+Arch), I = Implementation, Q = QE

### 6. Pattern Recall (Direct Mode only)

Runs after tier classification, only when `{AGENTIC_QE_MODE}` = `direct` | `direct-extended`
(set during Step 0 flag detection per SKILL.md: `--full-qe`/`--full-qe-extended` + agentic-qe installed). Non-blocking — an error or empty result must never stall the pipeline.

1. If the aqe fleet is not yet initialized this session, call `mcp__agentic-qe__fleet_init` first (required before any other aqe MCP tool).
2. Call `mcp__agentic-qe__memory_query({ pattern: "patterns/feature-adr/*", namespace: "learning", limit: 5 })`.
3. ALSO query the **durable half** of the loop — the dz lexical store:
   `dz recall "<feature domain keywords>" --json --limit 5` (CLI; works wherever dz is set up).
   Why both: the aqe kv store is **ephemeral across MCP-server restarts** (janitor/TTL — observed
   live: a record survived hours, not days), so aqe serves in-session semantic recall while the
   dz store is the durable memory the loop can trust tomorrow.
4. Merge both result sets, dedupe by content, select the top 3 by confidence/reward → set `{LEARNED_PATTERNS}`.
5. Reference mode, no hits, or errors (either store) → `{LEARNED_PATTERNS}` = `[]` or the surviving half; proceed normally.

Step 1 folds `{LEARNED_PATTERNS}` into the requirements brief as "lessons from previous features" — advisory context only, never requirements themselves. Why here: Step 0 is the one point where recall can be keyed to the feature's phase and domain — per-prompt hook auto-injection cannot see which pipeline step is running.

## Output

Set the following variables:

```
{COMPLEXITY_TIER} = S | M | L | XL
{ACTIVE_STEPS} = [0, 1, 6, 7, 8]  # example for S
{TIME_BUDGET} = { requirements: 2, planning: 0, implementation: 10, qe: 3 }
{DIMENSION_SCORES} = { files: 1, domains: 1, integrations: 1, breaking: 1, models: 1, crosscutting: 1 }
{LEARNED_PATTERNS} = [ ... ]  # top-3 by confidence from memory_query; [] in reference mode / no hits / error
```

Create artifact: `features/<slug>/00_complexity_assessment.md`

## Checkpoint 0 Format

```
═══════════════════════════════════════════════════════
⏸️ STEP 0: Complexity Router Complete
<promise>FEATURE_ADR_ROUTED</promise>
Tier: {COMPLEXITY_TIER} | Active Steps: {ACTIVE_STEPS}

Feature classified as {TIER} based on: {top 2-3 scoring dimensions}
Pipeline: {ACTIVE_STEPS count} steps, estimated {TIME_BUDGET total}

• "ок" — proceed with this tier
• "повысь" — bump to next tier
• "понизь" — drop to lower tier
═══════════════════════════════════════════════════════
```

## Quality Gates

- [ ] All 6 dimensions evaluated with explicit reasoning
- [ ] Override rules checked
- [ ] Active steps list matches tier definition
- [ ] Time budget calculated
- [ ] User confirmed tier before proceeding

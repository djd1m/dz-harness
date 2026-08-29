# Gate Module — 8 Quality Gates with 2-Pass Evaluation

## Purpose

Evaluate each active finding against 8 quality gates using a two-pass approach: deterministic checks first (zero LLM cost), then semantic checks via haiku agent. Set finding status to `approved` or `blocked`.

## Input

- Findings JSON file (from user checkpoint, active findings only)
- `references/quality-gates.md` — gate definitions, pass criteria, failure messages

## Protocol

### Step 1: Load Gate Definitions

```
Read: references/quality-gates.md
```

Load all 8 gate definitions with their type (deterministic/semantic) and pass criteria.

### Step 2: Filter Active Findings

From the findings JSON, select only findings with status `classified` (not `removed` or `merged`).
These are the findings that survived the user checkpoint.

### Step 3: Pass 1 — Deterministic Gates

For each active finding, evaluate deterministic gates. These are simple checks that require no LLM:

| Gate | Check Logic |
|------|------------|
| G1 | `finding.when_to_use` exists AND length > 10 characters |
| G2 | `finding.when_not_to_use` exists AND length > 10 characters |
| G5 | `finding.confidence >= 0.5` |
| G6 | `finding.duplicate_of` is null OR empty (set by Module 02) |
| G7 | `finding.maturity` is one of: `alpha`, `beta`, `stable` |

For each gate, record the result:
```json
{
  "gate_id": "G1",
  "passed": true,
  "evaluation_pass": "deterministic",
  "reason": null
}
```

If any deterministic gate fails, record the failure reason from `quality-gates.md`.

### Step 4: Pass 2 — Semantic Gates

For findings that passed all deterministic gates (or for all findings if you want complete gate data), evaluate semantic gates using a haiku agent:

```
Agent(
  subagent_type="general-purpose",
  model="haiku",
  description="Harvest Gate Evaluator — semantic gates",
  prompt="""
    You are a quality gate evaluator. For each finding below, evaluate 3 semantic gates.
    Be strict but fair. Err on the side of blocking rather than passing questionable findings.

    ## Gates to Evaluate

    **G3 — Decontextualized:**
    Check if the finding contains project-specific references: variable names, file paths,
    company names, dates, slugs, or any hardcoded values tied to the source project.
    PASS if the finding is generic and reusable as-is.
    FAIL if any project-specific detail remains.

    **G4 — Concrete Example:**
    Check if the finding includes at least one concrete, actionable example.
    The example must show actual usage, not just describe it abstractly.
    PASS if there is a real example with specifics.
    FAIL if the example is vague, abstract, or missing.

    **G8 — Brutal Honesty Review:**
    Ask yourself: "Would a senior engineer actually find this useful in a different project?"
    PASS only if the answer is genuinely yes — the finding adds real value.
    FAIL if the finding is obvious, trivial, or too niche to be broadly useful.

    ## Findings to Evaluate

    {FINDINGS_LIST}

    ## Required Output Format

    For each finding, return:

    Finding #N:
    - G3: PASS/FAIL — [reason]
    - G4: PASS/FAIL — [reason]
    - G8: PASS/FAIL — [reason]
  """
)
```

### Step 5: Set Approval Status

For each finding:
- If ALL 8 gates passed → status = `approved`
- If ANY gate failed → status = `blocked`, record failing gate IDs

Write results to findings JSON.

### Step 6: Report Blocked Findings

The orchestrator displays blocked findings to the user:

```
✅ APPROVED: {N} findings passed all gates

⚠️ BLOCKED: {M} findings failed quality gates:
  #7  — G3 (project-specific references remain: mentions "bank-kc-automation")
  #12 — G5 (confidence 0.35 < 0.5 threshold)
  #14 — G4, G8 (no concrete example; fails brutal-honesty review)

Commands:
• "пропусти GN для #X"  — override specific gate for specific finding
• "ок"                   — accept blocks, proceed with approved only
```

### Step 7: Apply Overrides (if any)

If user overrides a gate:
1. Add gate ID to finding's `gate_overrides` array
2. Recalculate: if all non-overridden gates pass → status = `approved`
3. Log override for audit trail

## Override Protocol

User command: `"пропусти G3 для #7"` (override G3 for finding #7)

Validation:
- Finding #7 must exist and be `blocked`
- G3 must be one of the failing gates for finding #7
- **G6 (Not Duplicate) and G8 (Brutal Honesty) CANNOT be overridden** — reject override attempts for these gates
- Record the override with timestamp

Multiple overrides: `"пропусти G3,G4 для #14"` — override multiple gates at once.

## Anti-Patterns

| Anti-Pattern | Detection | Fix |
|-------------|-----------|-----|
| All findings pass all gates | 100% pass rate | Haiku semantic evaluator may be too lenient — add calibration examples |
| Gate G8 blocks everything | > 80% fail on G8 | Review extraction quality — if findings are genuinely weak, that's correct |
| Overriding all blocked gates | User overrides every block | Advisory: suggest improving extraction rather than overriding all gates |
| Semantic evaluator contradicts itself | G3 passes but content has project refs | Log discrepancy, flag for human review |

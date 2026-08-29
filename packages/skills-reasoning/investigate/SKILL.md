---
name: investigate
description: Use when asked to investigate, research, or understand a problem WITHOUT fixing it. Systematic search for root cause, producing a diagnosis — not a patch.
---

# Investigate — Diagnosis Without Fixing

## Purpose

Find and explain the root cause of a problem. Do NOT fix it. Do NOT propose code changes. Produce a clear diagnosis that someone else (or a future session) can act on.

This skill exists because the urge to fix while investigating is the #1 source of bad patches. Investigation and implementation are separate activities.

## The Rule

```
INVESTIGATE ONLY. DO NOT MODIFY CODE.
```

Your output is a diagnosis document, not a diff.

## Process

### Step 1: Understand the Symptom

- What is the user observing? What did they expect instead?
- Gather exact error messages, screenshots, logs
- Clarify scope: is it one case or systemic?

### Step 2: Reproduce (When Possible)

- **Live reproduction is the most valuable thing you can do.** Hit the actual endpoint. Open the actual page. Run the actual command. Read the actual logs.
- If you can reproduce — document exact steps, exact output
- If you cannot reproduce — document what you tried and why it didn't work. This is still valuable information.
- Don't skip reproduction because "I can see the bug in the code". Code reading shows what COULD happen; reproduction shows what DOES happen.

### Step 3: Trace to Root Cause

Use backward tracing:
1. Start at the symptom
2. Find the immediate cause
3. Ask: what caused THAT?
4. Keep going until you reach the origin
5. At each layer boundary, verify actual data (logs, debugger, print statements)

For multi-component systems, trace through every boundary:
```
For each component in the chain:
  - What data enters?
  - What data exits?
  - Where does it diverge from expected?
```

### Step 4: Identify Contributing Factors

Beyond the root cause, note:
- Why wasn't this caught earlier? (missing test, missing validation, unclear contract)
- Can this class of problem happen elsewhere?
- What made this hard to find? (misleading error messages, silent failures, wrong layer)

### Step 5: Write Diagnosis

Structure your output as:

```
## Symptom
What the user sees.

## Root Cause
The actual origin of the problem. Be specific: file, line, function, data flow.

## Evidence
How you confirmed this. Commands run, logs read, data observed.

## Trace
The path from root cause to symptom, through each layer.

## Contributing Factors
Why this happened and wasn't caught.

## Suggested Fix Direction
High-level approach to fixing (NOT code). E.g., "The validation should happen
at the API boundary in X, not at the rendering layer in Y."

## Scope of Impact
What else might be affected by the same root cause.
```

## What NOT To Do

- **Do NOT edit source files.** Not even "obvious one-liners".
- **Do NOT run fix commands** (migrations, config changes, etc.)
- **Do NOT propose PR-ready code.** Describe the fix direction in words.
- **Do NOT bundle investigation with "and I went ahead and fixed it".** These are separate.

If the temptation to fix is overwhelming, write down what you'd change in the "Suggested Fix Direction" section and stop.

## When Investigation Is Inconclusive

If you cannot determine root cause:
1. Document what you investigated and ruled out
2. Document what you suspect but cannot confirm
3. Suggest specific diagnostic steps that would disambiguate
4. Be honest about the gap: "I could not determine X because Y"

An honest "I don't know, but here's what I ruled out" is infinitely more valuable than a guess dressed up as a diagnosis.

## Scope Guard

If investigation is not converging — you've read dozens of files, run many commands, and root cause is still unclear — stop and summarize:
1. What you investigated and ruled out
2. What you suspect but cannot confirm
3. What specific diagnostic step would disambiguate

Ask the user for direction rather than spiraling deeper.

### Step 6: Cross-Validate Diagnosis With Subagents

Before finalizing, have independent subagents verify your conclusions. They read the same code with fresh eyes and catch confirmation bias.

**Scale effort to problem size:**

| Problem size | Validators | Focus |
|-------------|-----------|-------|
| Small (single file, obvious trace) | 0 — skip this step | Your own trace is sufficient |
| Medium (multi-file, one service) | 1 subagent | "Read these files. Do you agree with this root cause? What did I miss?" |
| Large (multi-service, unclear trace) | 2-3 subagents | Each validates from a different angle (e.g., data flow, state management, concurrency) |

**How to brief them:**
- Share your diagnosis document (Step 5 output)
- Point them to the specific files and boundaries you traced
- Ask them to independently verify the root cause — not just agree with you
- They are **read-only** — they confirm or challenge, they don't fix

If a validator disagrees with your root cause, that's valuable — investigate the disagreement before finalizing.

## After Investigation

Once diagnosis is complete, use the `systematic-debugging` skill to implement the fix — it will start at Phase 3 (Hypothesis and Testing) since root cause is already identified.

## Red Flags — You're Drifting Into Fixing

- "Let me just fix this real quick while I'm here"
- "This is an obvious one-liner"
- "I'll investigate AND fix to save time"
- Opening a file with the Edit tool instead of Read
- Running anything other than diagnostic commands

**If you catch yourself:** STOP. Return to investigation mode. Write findings, not code.

---

*Inspired by the separation of investigation and implementation in [obra/superpowers](https://github.com/obra/superpowers).*

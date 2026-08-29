---
name: systematic-debugging
description: Use when encountering any bug, test failure, unexpected behavior, or when a previous fix didn't work — before proposing fixes
---

# Systematic Debugging

## The Iron Law

```
NO FIXES WITHOUT ROOT CAUSE INVESTIGATION FIRST
```

If you haven't completed Phase 1, you cannot propose fixes.

Random fixes waste time and create new bugs. Quick patches mask underlying issues.

**Core principle:** ALWAYS find root cause before attempting fixes. Symptom fixes are failure.

**If entering from a completed investigation with a confirmed root cause:** skip to Phase 3 (Hypothesis and Testing). Do not re-investigate what was already diagnosed.

## The Four Phases

Complete each phase before proceeding to the next.

### Phase 1: Root Cause Investigation

**BEFORE attempting ANY fix:**

1. **Read Error Messages Carefully**
   - Don't skip past errors or warnings
   - They often contain the exact solution
   - Read stack traces completely
   - Note line numbers, file paths, error codes

2. **Reproduce the Problem**
   - Can you trigger it reliably? What are the exact steps?
   - If not reproducible — gather more data, don't guess
   - **Live reproduction is extremely valuable.** If you can hit a running service, use a browser, run a curl, open a REPL — do it. Seeing actual behavior beats reading code.
   - If live reproduction is too complex or impossible (race condition, prod-only env), proceed with code analysis and logging — but acknowledge the gap

3. **Check Recent Changes**
   - What changed that could cause this? Git diff, recent commits
   - New dependencies, config changes, environmental differences

4. **Trace Through All Layers**

   When the system has multiple components (frontend → API → service → database):

   **BEFORE proposing fixes, trace data flow through each boundary:**
   ```
   For EACH component boundary:
     - What data enters this component?
     - What data exits this component?
     - Is configuration/environment propagated correctly?
     - What is the actual state at each layer?
   ```

   The bug often appears in one layer but originates in another. **Never fix at the symptom layer without tracing to the source.**

5. **Trace Backward to Root Cause**
   - Where does the bad value originate?
   - What called this with the bad value?
   - Keep tracing up until you find the source
   - **NEVER fix just where the error appears.** Trace back to find the original trigger.

### Phase 2: Pattern Analysis

1. **Find Working Examples** — locate similar working code in same codebase
2. **Compare Against References** — read reference implementation COMPLETELY, don't skim
3. **Identify Differences** — list every difference, however small. Don't assume "that can't matter"

### Phase 3: Hypothesis and Testing

1. **Form Single Hypothesis** — "I think X is the root cause because Y". Be specific.
2. **Test Minimally** — SMALLEST possible change. One variable at a time. Don't fix multiple things at once.
3. **Verify** — worked? → Phase 4. Didn't work? → new hypothesis. DON'T add more fixes on top.

### Phase 4: Implementation

1. **Create Failing Test Case** (when feasible) — must see it fail before fixing
2. **Implement Single Fix** — root cause only. ONE change. No "while I'm here" improvements.
3. **Verify Fix**
   - Tests pass? No other tests broken?
   - **Live verification strongly preferred:** if you can check against a running system (curl, browser, logs), do it. "Compiles and tests pass" is necessary but not sufficient.
4. **If Fix Doesn't Work**
   - **Revert the failed change first.** Do not layer attempt #2 on top of attempt #1.
   - Count your attempts
   - If < 3: return to Phase 1 with new information
   - **If >= 3: STOP and question the architecture.** Don't attempt fix #4 without discussing with the user.
5. **After Fix: Defense in Depth** — add validation at entry points to make this class of bug structurally impossible

### Phase 5: Cross-Validation With Subagents

After implementation and your own verification, launch subagent validators to independently review the fix. They catch blind spots you developed while deep in the code.

**Scale effort to task size:**

| Task size | Validators | What to check |
|-----------|-----------|---------------|
| Small (typo, config, single-file fix) | 1 subagent | Correctness of the specific change, no regressions in surrounding code |
| Medium (multi-file, single-service) | 2 subagents | One on correctness/edge cases, one on regression risk and contracts |
| Large (multi-service, architecture) | 3 subagents | Correctness, regression/contracts, and adversarial review (try to break it) |

**How to brief validators:**
- Give them the full context: what the bug was, what root cause you found, what you changed and why
- Point them to specific files and the original plan/spec if one exists
- Tell them to READ the code, not trust your description
- Validators are **read-only** — they report issues, they don't fix

**Limit: 2 rounds max.** Fix issues found in round 1, re-validate once. If round 2 still finds problems, summarize remaining issues and discuss with the user rather than looping indefinitely.

## Red Flags — STOP and Return to Phase 1

If you catch yourself thinking:
- "Quick fix for now, investigate later"
- "Just try changing X and see if it works"
- "It's probably X, let me fix that"
- "I don't fully understand but this might work"
- "One more fix attempt" (when already tried 2+)
- Each fix reveals a new problem in a different place
- Proposing solutions before tracing data flow

**ALL of these mean: STOP. Return to Phase 1.**

## Common Rationalizations

| Excuse | Reality |
|--------|---------|
| "Issue is simple, don't need process" | Simple issues have root causes too |
| "Emergency, no time for process" | Systematic is FASTER than thrashing |
| "Just try this first, then investigate" | First fix sets the pattern. Do it right. |
| "I see the problem, let me fix it" | Seeing symptoms != understanding root cause |
| "One more attempt" (after 2+ failures) | 3+ failures = wrong approach. Question it. |
| "Multiple fixes at once saves time" | Can't isolate what worked. Causes new bugs. |

When verification is needed to confirm a fix landed, pair this with the `validate` skill.

---

*Canonicalized into dz-harness-hub as a vendor-neutral engineering-discipline skill. Based on [obra/superpowers](https://github.com/obra/superpowers), adapted with live-verification emphasis.*

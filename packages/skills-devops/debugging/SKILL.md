---
name: "debugging"
description: "Helps diagnose and fix runtime errors, crashes, and unexpected behavior."
trust_tier: 2
trust_tier_label: "Validated"
validation:
  schema_path: schemas/output.json
  validator_path: scripts/validate-config.json
---

# debugging

Find the root cause of a runtime failure and fix it at the right layer. Beat the urge to patch the symptom.

## When to use

- User has an error message or stack trace they need help with
- User describes unexpected behavior ("it returns null when it should return the user")
- User pastes log output with errors or warnings
- User has a crash, hang, OOM, or segfault
- User says "it works locally but not in staging/production"
- User has a panic, unhandled rejection, or uncaught exception
- User describes intermittent failures or flaky behavior

## When NOT to use

- User wants to write new code, not fix existing code (use an implementation skill)
- User wants a code review without a specific bug (use `pr-review`)
- User wants to set up monitoring or logging infrastructure
- User has a build/compile error, not a runtime error (use `ci-fix`)
- User wants to optimize performance without a correctness bug

## Procedure

1. **Reproduce the issue.** Before anything else, establish a reliable way to trigger the bug. Ask the user:
   - What is the exact command, request, or action that triggers it?
   - What is the expected behavior vs. the actual behavior?
   - Does it happen every time or intermittently?
   - When did it start? What changed recently? (`git log --oneline -20` is your friend)
   - What environment? (OS, runtime version, container, local vs. CI vs. production)

   If you cannot reproduce it, you cannot verify a fix. Do not skip this step.

2. **Read the actual error.** Parse the error output carefully:
   - **Stack traces:** Read from the bottom up. The root cause is at the bottom; the symptom is at the top. Identify the first frame that is in the user's code (not library code).
   - **Error messages:** Read the full message. "Cannot read properties of undefined (reading 'map')" tells you exactly what is undefined -- trace backward from there.
   - **Log output:** Look for the first error or warning in the sequence. Later errors are often cascading failures from the first one.
   - **Exit codes:** Non-zero exit codes have meaning. 137 = OOM killed. 139 = segfault. 1 = generic failure.
   - Do NOT just pattern-match on the error message. Read the code at the stack frame to understand why it failed.

3. **Narrow scope by bisecting.** The fastest debugging technique is elimination:
   - **Time bisect:** Use `git log` and `git bisect` to find the commit that introduced the bug. This is the single most effective technique for regressions.
   - **Code path bisect:** Add a log/breakpoint at the midpoint of the suspected code path. Is the data correct there? If yes, the bug is downstream. If no, it is upstream. Repeat.
   - **Data bisect:** Does the bug happen with all input or specific input? Reduce to the minimal input that triggers it.
   - **Environment bisect:** Does it happen in all environments? If only production, what differs? (Config, data volume, network, concurrency)

4. **Form a falsifiable hypothesis.** Before making any code change, state your hypothesis explicitly:
   - "I believe the bug is caused by X because Y, and if I change Z, the error should stop."
   - A good hypothesis is specific enough to be proven wrong. "Something is broken in auth" is not a hypothesis. "The JWT token is not being refreshed when it expires during a long-running request" is a hypothesis.
   - If you have multiple hypotheses, test the most likely one first.

5. **Test with the smallest change.** Make exactly one change to test your hypothesis:
   - Add a single log line to confirm your theory about data flow
   - Change one condition to see if it alters the behavior
   - Hardcode one value to isolate variables
   - Do NOT make multiple changes at once. You will not know which one mattered.

6. **Fix at the right layer.** When you have confirmed the root cause, fix it properly:
   - **Do NOT** patch the symptom. If a function returns null when it should not, fix the function -- do not add a null check in every caller.
   - **Do NOT** add defensive bloat. Wrapping everything in try-catch does not fix bugs; it hides them.
   - **Do NOT** add magic retries. If a network call fails, understand why before adding retry logic. Retries on non-idempotent operations cause data corruption.
   - **Do NOT** add silent fallbacks. Returning a default value when something fails means the bug will manifest later, further from the cause, and harder to debug.
   - **DO** fix the actual invariant violation, missing validation, race condition, or incorrect assumption.

7. **Verify the fix.** Confirm that:
   - The original reproduction case now works correctly
   - The error message / stack trace no longer appears
   - Related test cases still pass (`npm test -- --run`)
   - Edge cases around the fix are handled (what if the input is empty? null? very large?)
   - The fix does not introduce a new failure mode

8. **Note what you learned.** Document the root cause in the PR description or commit message:
   - What was the symptom?
   - What was the root cause?
   - Why did the previous code not handle this case?
   - What was the fix?
   - This helps future debuggers (including yourself) understand the failure class.

9. **Document intermittent reproduction steps.** If the bug is intermittent:
   - Record the exact conditions under which it reproduces (load level, timing, data state)
   - Note the reproduction rate (e.g., "fails ~1 in 10 runs with concurrent requests")
   - If you found a reliable reproduction, document it prominently
   - Add a regression test that reliably triggers the race condition or edge case

10. **Prefer instrumentation over speculative refactors.** When you cannot immediately find the root cause:
    - Add structured logging at key decision points (with request IDs for correlation)
    - Add metrics (counters, histograms) around the suspected area
    - Add assertions that will fail loudly when the invariant is violated
    - Do NOT refactor the code hoping the bug goes away. Refactoring without understanding the bug moves the bug, it does not fix it.

## Key Rules

- Reproduce first, theorize second, fix third. Never skip reproduction.
- Read the error message. The whole thing. Slowly.
- One change at a time. If you change two things and the bug goes away, you do not know which one fixed it.
- Fix the cause, not the symptom. If you find yourself adding null checks everywhere, step back.
- If you cannot explain why the fix works, you have not found the root cause.
- Intermittent bugs are not random. They have a cause. Usually: concurrency, timing, or data-dependent paths.

## Output Format

Return a structured diagnosis with: root cause identification, evidence (stack traces, logs, bisect results), the fix with explanation of why it addresses the root cause, and verification steps.

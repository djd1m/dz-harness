---
name: "pr-review"
description: "Reviews pull requests for correctness, style, and risks."
trust_tier: 2
trust_tier_label: "Validated"
validation:
  schema_path: schemas/output.json
  validator_path: scripts/validate-config.json
---

# pr-review

Review a pull request the way a careful teammate would: read the actual code, group findings by severity, and make every comment actionable.

## When to use

- User asks to review a PR, diff, or set of changes
- User pastes a PR URL
- User asks "is this ready to merge"
- User asks for a summary of what a PR does
- User asks to compare branches

## When NOT to use

- User wants to create a PR (use a commit/PR creation workflow instead)
- User wants to fix a CI failure (use `ci-fix`)
- User wants a security-focused review only (use `security-audit`)
- User is asking about PR process or policy, not a specific PR

## Procedure

1. **Get the diff.** Run `gh pr diff <number>` or `git diff <base>...<head>`. If the user pasted a URL, extract the PR number from it. If they pasted raw diff text, use that directly.

2. **Understand scope.** Count files changed and lines added/removed. List the files grouped by area (e.g., `src/`, `tests/`, `config/`). This gives you and the user a map of the change.

3. **Read changed code in context.** For every changed hunk, read 30-50 lines around the change in the actual source file. Never review a diff in isolation -- you need to see what the surrounding code does, what imports are used, and what the function contract is.

4. **Check each change against these dimensions:**
   - **Correctness:** Does the logic do what the PR description claims? Are there off-by-one errors, wrong comparisons, missing null checks?
   - **Error handling:** Are errors caught, logged, and propagated correctly? Are there bare `catch` blocks that swallow errors?
   - **Edge cases:** What happens with empty input, zero, negative numbers, unicode, very large input, concurrent calls?
   - **Naming:** Are variables, functions, and files named clearly? Would a new team member understand them?
   - **Tests:** Are the new/changed behaviors covered by tests? Do existing tests still make sense after the change?
   - **Security:** Any user input flowing to dangerous sinks? Secrets in code? Auth bypasses? (For deep security review, suggest `security-audit`.)
   - **Performance:** Any O(n^2) loops, unbounded queries, missing indexes, unnecessary allocations in hot paths?
   - **Breaking changes:** API signature changes, config format changes, migration requirements, removed exports?

5. **Group findings by severity:**
   - **Blocker** -- Must fix before merge. Bugs, data loss, security holes, broken tests.
   - **Important** -- Should fix before merge. Missing error handling, confusing names, missing tests for new behavior.
   - **Nit** -- Nice to fix but not blocking. Style preferences, minor readability improvements, typos.

6. **Write the review.** For each finding:
   - Cite the exact file and line number (`src/auth.ts:42`)
   - Quote the relevant code
   - Explain what is wrong and why it matters
   - Suggest a concrete fix (code snippet when possible)

7. **Summarize the PR.** Write a 2-3 sentence summary of what the PR does, suitable for a changelog.

8. **Give a verdict:**
   - **Approve** -- No blockers, no important issues, or only nits.
   - **Request changes** -- Has blockers or important issues that need addressing.
   - **Comment** -- Looks okay but you have questions that need answers before deciding.

9. **Check for completeness.** Does the PR include everything it should? Missing migration? Missing docs update? Missing changelog entry? Flag anything the PR description promises but the diff does not deliver.

10. **Handle large PRs.** If the PR is >600 lines changed or touches 20+ files, tell the user it should be split. Explain which parts could be separate PRs (e.g., "the refactor in `utils/` could land independently from the feature in `api/`"). Still review it, but note the size risk.

## Key Rules

- Every comment must be actionable. "This could be better" is not actionable. "Rename `x` to `userCount` because it is used as a counter on line 47" is actionable.
- Do not nitpick formatting if a formatter/linter is configured. Check the repo for `.eslintrc`, `.prettierrc`, `biome.json`, etc. first.
- When the PR is >600 lines or touches 20+ files, explicitly tell the user to consider splitting it.
- Praise good patterns when you see them. A review is not only about problems.
- If the PR description is missing or vague, ask for it before reviewing. Context matters.

## Output Format

Return a structured review with: summary, verdict, and findings grouped by severity with file:line citations.

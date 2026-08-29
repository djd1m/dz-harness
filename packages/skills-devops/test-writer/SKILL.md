---
name: "test-writer"
description: "Writes unit, integration, and end-to-end tests for existing or new code."
trust_tier: 2
trust_tier_label: "Validated"
validation:
  schema_path: schemas/output.json
  validator_path: scripts/validate-config.json
---

# test-writer

Add tests that catch real regressions. Coverage is a tool, not a goal. Every test should exist because removing it would let a specific bug ship.

## When to use

- User asks to write tests for a file, function, or module
- User asks to add coverage for uncovered code
- User asks to pin down existing behavior before a refactor
- User wants TDD: write tests first, then implement
- User says "add tests" or "this needs tests"

## When NOT to use

- User wants to run existing tests (just run the test command)
- User wants to fix a failing test (use `ci-fix` for CI failures, or debug directly)
- User wants to review test quality of existing tests (use `pr-review`)
- User wants load/performance testing (different discipline)

## Procedure

1. **Identify the unit under test precisely.** Read the source file. Understand the public API: what functions/methods are exported, what are their input types, what do they return, what side effects do they have. If the code has no clear boundaries, suggest refactoring before testing.

2. **Pick the right test type.** Use the narrowest type that covers the behavior:
   - **Unit test:** Pure functions, stateless transformations, validators, parsers. Fast, no I/O.
   - **Integration test:** Code that talks to a database, file system, external API, or coordinates multiple modules. Use real dependencies when cheap (SQLite in-memory), test doubles when expensive (external APIs).
   - **End-to-end test:** Full user-visible flows. Only for critical paths (login, checkout, data export). Expensive to maintain, so keep the count low.

3. **Enumerate test cases systematically:**
   - **Happy path:** The normal, expected use case with valid input.
   - **Boundary values:** Empty string, zero, negative, max int, single element, exactly-at-limit.
   - **Edge cases:** Unicode input, special characters, very long strings, null/undefined, concurrent calls.
   - **Error cases:** Invalid input, missing required fields, network timeout, permission denied, disk full.
   - **Idempotency:** Calling the function twice with the same input should produce the same result (if applicable).

4. **Test the contract, not the implementation.** Assert on return values and observable side effects. Do not assert on internal state, private method calls, or the order of operations unless order is part of the contract. Tests that break when you refactor internals are a maintenance burden, not a safety net.

5. **Create purpose-built fixtures.** Do not reuse a giant shared fixture across all tests. Each test should set up exactly the data it needs. Use factory functions or builder patterns to keep fixture creation concise but explicit.

6. **Write descriptive assertions.** Use assertion messages that explain what went wrong. Prefer `expect(result).toEqual({ status: 'active', balance: 100 })` over `expect(result.status).toBe('active'); expect(result.balance).toBe(100);` when checking a whole object. But split assertions when different fields fail for different reasons.

7. **Verify the test actually fails when the code is broken.** Mentally (or actually) break the implementation and confirm the test would catch it. A test that passes regardless of the implementation is worthless. Watch out for: tests that never execute the code under test, assertions on the wrong variable, always-true conditions.

8. **Keep runtime in mind.** Unit tests should complete in under 100ms each. Integration tests under 2 seconds each. If a test needs more, it is probably testing too much at once. Use `beforeAll` for expensive shared setup only when the setup is truly read-only.

9. **Be deliberate about mocking.** Mock external services and I/O boundaries. Do not mock the module under test or its close collaborators -- that tests the mocks, not the code. When using mocks, verify that the mock interface matches the real implementation (TypeScript types help here).

10. **Use behavior-describing test names.** The test name should describe what the system does, not what the test does. Good: `"returns 401 when token is expired"`. Bad: `"test auth"`. The test name is documentation; someone reading only the test names should understand the module's behavior.

11. **Group tests with describe blocks.** Group by function or behavior area. Within a group, order from simple to complex: happy path first, then edge cases, then error cases. This makes the test file readable as a specification.

## Key Rules

- Every test must have a reason to exist. If you cannot name the bug it prevents, delete it.
- Never write tests that test framework behavior (e.g., "it parses JSON correctly" when using `JSON.parse`).
- Match the project's existing test framework and conventions. Check `package.json`, existing test files, and config files before writing anything.
- If the code is untestable, say so and suggest the minimal refactoring needed (usually: extract a function, inject a dependency).
- Always run the tests after writing them. Do not claim they pass without verification.

## Output Format

Return a structured result with: test file path, framework used, test cases created (names + types), and pass/fail status after execution.

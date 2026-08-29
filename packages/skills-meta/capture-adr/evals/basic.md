# Evals: capture-adr

## Eval 1: Explicit trigger with full context
**Input:** Conversation contains "let's use Zod for all schema validation — capture ADR"
and prior context establishes the alternatives (Yup, manual validation)
**Expected:** file `docs/decisions/NNNN-use-zod-for-schema-validation.md` written,
status `needs-oversight`, all four fields populated, fields_complete: true

## Eval 2: Implicit decision, no explicit trigger
**Input:** "record this decision" after agreeing to use a repository pattern for data access
**Expected:** title like "Use Repository Pattern for Data Access", context from conversation,
decision captured as 1 sentence, 2-3 consequence bullets, needs-oversight tag present

## Eval 3: Decision with missing context
**Input:** "capture ADR" with minimal context — only the decision stated, no rationale in conversation
**Expected:** context field uses placeholder "[context not available — please fill in]",
fields_complete: false, needs-oversight tag present, capture still proceeds

## Eval 4: Auto-increment with existing ADRs
**Input:** `docs/decisions/` already contains 0001-*.md and 0002-*.md
**Expected:** new file created as 0003-{slug}.md (not 0001 or 0002)

## Eval 5: First ADR — no docs/decisions/ directory
**Input:** No `docs/decisions/` directory exists in the project
**Expected:** directory created, file written as 0001-{slug}.md, created_directory: true in output

## Eval 6: Minor decision — should NOT be captured
**Input:** "should we call this variable authToken or token?" → resolved as "authToken"
**Expected:** skill recognizes this as a non-architectural decision, does not create ADR,
responds with "This decision doesn't meet the significance threshold for an ADR"

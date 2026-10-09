# Step 7: Code Generation

> Implement the feature according to the plan, following existing patterns.

## When

Always runs. Adapts by tier:
- **S:** Single-pass implementation
- **M:** Sequential task execution with checkpoints
- **L/XL:** Parallel agents per module/domain

## Model

opus (complex code generation)

## Input

- `{IMPL_PLAN}` from Step 6
- `{ARCHITECTURE}` from Step 5 (M+)
- `{ADR_DECISIONS}` from Step 3 (M+)
- `{DOMAIN_MODEL}` from Step 4 (L/XL)
- Codebase context (existing patterns, conventions)
- {LEARNED_PATTERNS} for Step 7 — the decision-recall block (≤3 lessons), appended to the coder prompt by the pipeline

## Protocol

### 1. Pre-Implementation Checklist

### Current target admission (before any coding)

After prerequisite gates complete, and on **every** Step-7 entry (including auto/force resume),
run the installed `scripts/check-code-targets.mjs` beside this module **before** context assembly,
code-cache lookup, delegation or in-session edits. Set `TARGET_HELPER` to that installation's
absolute helper path, `EXECUTION_PROJECT` to the absolute execution repository root, and
`FEATURE_DIR` to its absolute `features/<slug>` directory:

```bash
node "$TARGET_HELPER" --repo "$EXECUTION_PROJECT" --feature "$FEATURE_DIR"
```

Require the actual command exit 0 and exactly one `fa-code-targets-1` JSON document with
`status: "admitted"`, a SHA-256 `manifestDigest` and empty `reasons`. Any missing/broken helper,
command failure, refused/unavailable status or malformed/contradictory output stops coding and
cache access; repair the named cause first. Do not substitute a narrated success or saved admission.
For a host relay, the shell must capture the producer's exit immediately and append one terminal
`RC_EXIT:<integer>` line; Workflow requires both admitted JSON and observed `RC_EXIT:0` and refuses
missing/duplicate/conflicting witnesses. Keep stderr separate from the bounded relay.

The helper only calls the colocated review checker's `measureManifest(repo, feature, 'qe')`.
Its strict `- ` target grammar, circular-root exclusions, discovered changed/untracked paths,
filesystem/Git safety and exact `.dz/guard.json` index-or-selected-base authority remain unchanged.
K2 remains an additional legacy Markdown-friendly check; admission does not normalize its bullets
or backticks. Planned missing files/deletions can have null digests. The admission digest records
this observation, not QE approval or a replacement cache key. Admission never prepares/evaluates
review lineage or writes source, receipts or `.fa-state`.

The selected baseline is existing `.fa-state/base-ref`, otherwise HEAD. Before actual coding,
initialize HEAD only if that base file is absent; preserve an existing original selection through
retries/re-entry. Refuse a failed initialization before edits. Admission does not initialize it.
This is executable Plain guidance with mandatory orchestration, not an automatic Plain dispatcher.
An unrelated process can change source after admission; ordinary final QE still checks freshness.

### Current literal context (plain and delegated coding)

Before coding or delegating, run the installed helper beside this module. Set `CONTEXT_HELPER` to
the absolute `scripts/build-coder-context.mjs` path of the skill installation you are reading;
set `FEATURE_DIR` to the absolute target `features/<slug>` directory and use the actual tier:

```bash
node "$CONTEXT_HELPER" "$FEATURE_DIR" --tier=M
```

The command emits exactly one JSON envelope and exits 0 only for `status: "complete"`. On any
nonzero exit, unavailable/incomplete status, malformed JSON or required missing/empty section,
stop before coding and repair the named input. Never paste a partial result as complete. A missing
helper requires restoring this skill installation, not inventing a replacement block.

For every delegated coder assignment, paste the successful envelope's literal `promptBlock` into
the actual prompt, then append the existing advisory decision-recall block once. Keep the source
paths below for deeper reading. For single-agent in-session coding, read this generated block
directly before implementing. Requirements and plan are included in full; each ADR supplies its
Decision and Confirmation with source labels. M/L/XL require at least one ADR; S can have none.

The same canonical helper is used by the programmatic Workflow before code checkpoint lookup.
It fingerprints full current inputs and binds the prompt separately, so changed documents cannot
reuse old code. The plain mode boundary is an executable helper command plus these required
read/embedding instructions; there is no separately automated plain dispatcher. Pure/fixture tests
do not establish a live model relay's authenticity. Helper bounds are 64 documents, 256 KiB/file,
1 MiB read and 96 KiB UTF-8 for the entire labelled block; exceeded bounds refuse without trimming.
These are document limits, not a new limit on the existing coder wrapper's final prompt.

Before writing any code:
- [ ] Read existing similar implementations in codebase
- [ ] Identify naming conventions (files, classes, functions, variables)
- [ ] Identify import patterns and module structure
- [ ] Identify error handling patterns
- [ ] Identify test patterns
- [ ] Plan carries `## Amendments`? → implement every AM-N row AND its named Confirmation test (a
      safeguard amendment needs a test proving it FIRES on a real input)
- [ ] Does the diff add I/O (DB/network/file) to a previously-pure path — especially
      startup/lifespan/health? → name the NEGATIVE resource-down test, or justify N/A

### The I/O-on-pure-path rule (and the fixture-swap smell)

If a change introduces I/O into a path that was previously I/O-free — above all a startup, lifespan, or
health path — the happy-path test is NOT enough. Also write a **negative resource-down test**: a
broken/unbound resource handle (dead DB, missing table, exhausted pool) → the path degrades per its
declared contract — **fail-open** for an advisory feature, **explicit fail-fast** for a load-bearing one.
Without it, an outage of the resource takes down the whole path (including health checks) for the sake of
an advisory feature — and healthy test fixtures will hide it.

**Fixture-swap smell:** if making the new code pass required replacing a "broken" test fixture with a
healthy one — stop. The old fixture was probably a negative control proving the path was I/O-free. Keep
BOTH tests: the healthy one (new behavior) and the broken one (degradation contract). Never silently
delete the case that proved the old property.

### 2. Execute Tasks per Plan

For each task in `{IMPL_PLAN}`:

```
1. Read existing files that will be modified
2. Implement the change following existing patterns
3. Verify: does it match the architecture diagram?
4. Verify: does it follow ADR decisions?
5. Mark task complete
```

### 3. Parallel Execution (L/XL)

For L/XL tiers with independent modules:

| Agent | Scope | Model |
|-------|-------|-------|
| Agent 1 | Module A (data layer) | opus |
| Agent 2 | Module B (service layer) | opus |
| Agent 3 | Module C (API layer) | opus |

Each agent:
- Works only on its assigned files
- Follows the same pre-implementation checklist
- Reports completion with list of created/modified files

After all agents complete:
- Verify integration points between modules
- Fix any interface mismatches
- Run existing tests to check for regressions

### 4. Code Quality Rules

While implementing:

| Rule | Rationale |
|------|-----------|
| Follow existing patterns | Consistency > "better" approaches |
| No over-engineering | Implement exactly what's planned |
| No premature abstraction | 3 similar lines > 1 premature helper |
| Handle errors at boundaries | Don't add internal error handling noise |
| Write self-documenting code | Clear names > comments |
| Respect ADR decisions | Don't deviate from chosen options |

### 5. Change Manifest

Track all changes:

```
## Files Created
- path/to/new/file.ts — {description}

## Files Modified
- path/to/existing/file.ts — {what changed}

## Files Deleted
- path/to/removed/file.ts — {why}
```

## Output

- Actual code changes in the repository
- `features/<slug>/07_code_changes/change_manifest.md` — list of all changes

Set `{CODE_CHANGES}` variable with file list.

## Checkpoint Format

```
═══════════════════════════════════════════════════════
⏸️ STEP 7/8: Code Implementation Complete
<promise>FEATURE_ADR_IMPLEMENTED</promise>
Tier: {COMPLEXITY_TIER}

{N} files created, {M} modified, {K} deleted
Tasks completed: {completed}/{total}

• "ок" — proceed to QE
• "ревью [file]" — review specific file
• "переделай [task]" — redo specific task
═══════════════════════════════════════════════════════
```

## Quality Gates

- [ ] All planned tasks implemented
- [ ] Code follows existing codebase conventions
- [ ] ADR decisions reflected in code
- [ ] No unintended side effects on existing functionality
- [ ] Change manifest is complete and accurate
- [ ] No TODO/FIXME/HACK left without justification

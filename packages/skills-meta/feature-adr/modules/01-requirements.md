# Step 1: Requirements Gathering

> Transform vague feature description into structured, actionable requirements.

## When

Always runs. Adapts depth by tier:
- **S:** 3-5 bullet points, inline (no file)
- **M/L/XL:** Full structured document

## Model

sonnet (analytical work, not creative)

## Input

- Feature description from user
- `{COMPLEXITY_TIER}` from Step 0
- Codebase context (project structure, existing patterns)

## Protocol

### 1. Load Explore Skill (M/L/XL only)

```
Read: .claude/skills/explore/SKILL.md
```

Use the explore skill to clarify ambiguous requirements through adaptive questioning.
For S-tier: skip explore, extract requirements directly from description.

### 1.5 Fold Learned Patterns (Direct modes only)

If `{LEARNED_PATTERNS}` is non-empty (set by Step 0's Pattern Recall), fold each into the
requirements brief as an advisory "lesson from previous features" — context that informs
elicitation, never a requirement itself. Empty/absent → skip silently.

### 2. Identify Stakeholders

| Question | Why |
|----------|-----|
| Who is the end user? | Drives UX decisions |
| Who is the developer consumer? | Drives API design |
| Who approves delivery? | Defines done criteria |

### 3. Extract Functional Requirements

For each requirement:
```
FR-{N}: {Description}
Priority: MUST | SHOULD | COULD
Acceptance Criteria:
  - Given [context], When [action], Then [outcome]
```

### 4. Extract Non-Functional Requirements (M+ only)

| Category | Questions |
|----------|-----------|
| Performance | Latency targets? Throughput? |
| Security | Auth? Data sensitivity? |
| Scalability | Expected load? Growth? |
| Compatibility | Browser/OS/API versions? |
| Accessibility | WCAG level? |

### 5. Identify Constraints

- Technical: language, framework, existing patterns to follow
- Business: timeline, budget, compliance
- Organizational: team capabilities, review process

### 6. Define Scope Boundaries

Explicitly state:
- **In scope:** What this feature DOES
- **Out of scope:** What this feature does NOT do (but someone might assume)
- **Dependencies:** What must exist before this feature works
- **Dependents:** What will break if this feature changes

## Write discipline (the 180-second rule)

An executor that returns from a tool call and then thinks in silence past **180 seconds** is killed by the
runtime. Thinking time grows with the history already accumulated, so on a large repo "read everything,
then write the document" is not a risk — it is a deterministic death, and nothing survives it, because
nothing was ever on disk.

MEASURED on this harness: the writing steps died **18 times out of 18** in the reading phase without ever
writing a file. The control — same slice, same model, one added instruction to write a skeleton early —
landed the skeleton 8 minutes in, on the first attempt, after six consecutive deaths.

So, in this step:

1. **Skeleton first — inside your first ~12 tool calls.** Write `features/<slug>/01_requirements.md` containing only the headings this step
   requires (Stakeholders · Functional requirements · Non-functional requirements · Constraints ·
   Scope boundaries · Open questions), one line of intent under each. (S-tier is inline and has no
   file — this section does not apply to it.)
2. **Then fill it one section per edit.** No single edit longer than ~120 lines. Every edit leaves the
   file readable; none of them is allowed to wait for the section after it.
3. **Never go more than 2 minutes without a tool call.** A thought that is getting long is the signal to
   stop and write what you have — an edit is a checkpoint, not an interruption.
4. **When you are unsure whether to read more or to write, WRITE.** A thin section refined later survives;
   a perfect section you never reached does not.

The skeleton is not a draft to apologise for. It is the artifact, opened early.

## Output

### For S-tier (inline)
Set `{REQUIREMENTS}` variable with 3-5 bullets. No file created.

### For M/L/XL
Create `features/<slug>/01_requirements.md` with:
- Stakeholders
- Functional requirements (FR-1..N) with acceptance criteria
- Non-functional requirements (L/XL)
- Constraints
- Scope boundaries
- Open questions (if any remain)

Set `{REQUIREMENTS}` variable with structured data.

## Checkpoint 1 Format

```
═══════════════════════════════════════════════════════
⏸️ STEP 1/8: Requirements Complete
<promise>FEATURE_ADR_REQUIREMENTS_GATHERED</promise>
Tier: {COMPLEXITY_TIER}

{N} functional requirements identified
{M} constraints, {K} open questions

• "ок" — proceed
• "добавь [requirement]" — add more
• "убери [requirement]" — remove
═══════════════════════════════════════════════════════
```

## Quality Gates

- [ ] All requirements have acceptance criteria (M+)
- [ ] Scope boundaries explicitly defined
- [ ] No ambiguous terms ("fast", "good", "flexible") without quantification
- [ ] Dependencies identified
- [ ] User confirmed requirements before proceeding

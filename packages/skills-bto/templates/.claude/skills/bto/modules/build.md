# BUILD Module — Artifact Generation Protocol

## Purpose

Generate production-quality Claude Code artifacts (skills, commands, rules, agent templates) from natural language requirements.

## Input

- **Description:** Natural language description of what the artifact should do
- **Type:** skill | command | rule | agent (auto-detected or explicit)
- **Mode:** QUICK | DEEP (default: QUICK)
- **References:** Optional paths to existing artifacts as examples

## Protocol

### Step 1: Type Detection

If type is not explicitly specified, detect from description:

| Signal | Detected Type |
|--------|--------------|
| "skill", "module", "capability", "protocol" | skill |
| "command", "slash command", "/something", "pipeline" | command |
| "rule", "constraint", "convention", "anti-pattern" | rule |
| "agent", "worker", "parallel", "swarm" | agent |

### Step 2: Requirements Gathering

**QUICK mode** — Extract from description directly:
1. Parse artifact name (kebab-case)
2. Extract key capabilities
3. Identify domain constraints
4. Proceed to generation

**DEEP mode** — Use `explore` skill:
1. Read `.claude/skills/explore/SKILL.md`
2. Follow explore protocol to clarify:
   - Exact scope and boundaries
   - Target users/consumers
   - Input/output format
   - Quality criteria
   - Edge cases
3. Produce requirements brief
4. Confirm with user before generation

### Step 3: Generation Templates

#### Skill Template

```
.claude/skills/<name>/
├── SKILL.md
│   ├── ---                      ← frontmatter fence, the FIRST element of the file
│   │   ├── name: <kebab-artifact-name>          (must equal the directory name)
│   │   └── description: <trigger-bearing description gathered in Step 2>
│   ├── ---
│   ├── # <Name>
│   ├── ## Overview
│   ├── ## Quick Start
│   ├── ## Protocol
│   │   ├── Step 1: ...
│   │   ├── Step 2: ...
│   │   └── Step N: ...
│   ├── ## Output Format
│   ├── ## Anti-Patterns
│   └── ## Dependencies
├── modules/          (if multi-module)
│   └── <module>.md
├── references/       (always include at least one)
│   └── <ref>.md
└── examples/         (always include at least one)
    └── <example>.md
```

**The fence is not optional and not cosmetic.** A `SKILL.md` whose first bytes are anything other
than `---` makes the harness refuse to load the skill — and, because the loader walks the whole
skills directory, one unfenced file can make the ENTIRE tree unlistable. Emit `---`, `name:`,
`description:`, `---` before the `# <Name>` heading; keep both `name` and `description` non-empty,
and put the activation triggers in the description (a fenced file with an empty description parses
but is unreachable). Verify with `dz list --skills-dir <tree>` — exit 0 and the skill named in the
listing is the proof; `dz info <name> --skills-dir <tree>` confirms the description survived.

**Frontmatter scope decision — skills only.** Commands, rules, and agent templates do NOT get a
frontmatter fence. The parser that rejects an unfenced file is the *skills* document parser
(`@dzhechkov/core/src/skill-document.ts`); `.claude/commands/`, `.claude/rules/` and
`.claude/agents/` are not read by it (MEASURED — reproducer
`dz list --skills-dir <tree>/.claude/skills` returns exit 0 while those three directories carry no
fence at all). This is a decision, not an omission: adding a fence to the three templates below
would be inert at best. Re-confirm with the same reproducer before changing it.

#### Command Template

```markdown
# /command-name — Short Description

## Usage
/command-name [arguments]

## Parameters
- $ARGUMENTS — Description

## Protocol

### Step 1: Setup
- Validate arguments
- Load required skills: Read `.claude/skills/<skill>/SKILL.md`

### Step 2: Execution
- Main logic here
- Use Agent tool for parallelism where applicable

### Step 3: Output
- Create artifact files
- Display checkpoint

## Checkpoint
═══════════════════════════════════════════════════════
⏸️ CHECKPOINT: [Command Name] Complete
...
═══════════════════════════════════════════════════════
```

#### Rule Template

```markdown
# Rule Name

## Patterns

| Pattern | Detection Signal | Required Fix |
|---------|-----------------|-------------|
| ... | ... | ... |

## Auto-Detection
When generating content, self-check against these patterns.
If detected, flag with ⚠️ and fix before proceeding.
```

#### Agent Template

```markdown
# Agent Name

## Purpose
What this agent does.

## Configuration
- Model: haiku | sonnet | opus
- Isolation: reads X, writes Y
- Max turns: N

## Prompt Template
```

### Step 4: Self-Review

After generation, validate against quality checklist:

1. **Structure check:**
   - Required sections present for artifact type
   - No empty sections
   - Proper markdown formatting

2. **Content check:**
   - No generic/placeholder content
   - Specific to the domain
   - Anti-patterns section populated
   - At least one concrete example

3. **Convention check:**
   - File naming: kebab-case
   - Directory naming: kebab-case
   - Heading hierarchy: proper nesting
   - References resolve to actual files

4. **Size check:**
   - SKILL.md: 2KB-30KB (ideal: 5KB-15KB)
   - Module: 1KB-15KB
   - Reference: 500B-10KB
   - Example: 500B-5KB

### Step 5: Output

> See **Agent Authoring Rule** in `SKILL.md` — write the skeleton first, then incremental `Edit` appends;
> never one giant `Write`.

1. Create all files in the target directory. Write each file as a skeleton first (frontmatter fence +
   title + section headings only, one small `Write`), then fill the sections with separate `Edit`
   appends — one per section, or per ~100 lines, whichever is smaller. Four files emitted in one
   uninterrupted turn is the shape that gets killed by the watchdog with nothing on disk.
2. Display summary:
   ```
   ✅ BUILD Complete
   Artifact: .claude/skills/<name>/
   Files created:
     - SKILL.md (X KB)
     - modules/<m>.md (X KB)
     - references/<r>.md (X KB)
     - examples/<e>.md (X KB)

   Next: Run /bto-test .claude/skills/<name>/ to evaluate
   ```

## Anti-Patterns

| Anti-Pattern | Detection | Fix |
|-------------|-----------|-----|
| Generic skill | No domain-specific terms | Add domain context and constraints |
| Missing references | references/ empty | Add at least one reference file |
| No examples | examples/ empty | Add at least one few-shot example |
| Over-scoped | SKILL.md > 30KB | Split into modules |
| Under-specified | SKILL.md < 2KB | Expand with more detail |
| Copy-paste | Identical to another skill | Adapt uniquely |
| Missing anti-patterns | No anti-patterns section | Add common failure modes |
| No output format | Doesn't specify expected output | Add explicit output section |
| Missing frontmatter fence | `SKILL.md` first bytes are not `---`; `dz list` fails for the whole tree | Emit `--- name/description ---` before `# Title` |
| Single-shot long write | An agent produces a >200-line artifact in one `Write` or one reply | Skeleton first, then `Edit` appends — see "Agent Authoring Rule" in `SKILL.md` |

# /bto-build — Generate Skill or Command from Description

## Usage
```
/bto-build [natural language description of what to generate]
```

## Parameters
- $ARGUMENTS — Natural language description of the skill, command, rule, or agent template to generate. Optionally include "deep" to activate DEEP mode with interactive clarification.

## Protocol

### Step 1: Load Skill and Module

Read `.claude/skills/bto/SKILL.md`
Read `.claude/skills/bto/modules/build.md`

### Step 2: Validate Input

If $ARGUMENTS is empty:
- Ask: "Describe the skill or command you want to build. Include: what it does, who uses it, expected inputs and outputs."
- Stop and wait.

### Step 3: Detect Mode

Scan $ARGUMENTS for "deep" or "углубленный":
- If found → **DEEP mode**: load `explore` skill, run interactive clarification
- Otherwise → **QUICK mode**: proceed directly to generation

### Step 4: Detect Artifact Type

Auto-detect from $ARGUMENTS using these signals:

| Signal Words | Detected Type |
|-------------|--------------|
| "skill", "module", "capability", "protocol", "скилл" | skill |
| "command", "slash command", "/something", "pipeline", "команда" | command |
| "rule", "constraint", "convention", "anti-pattern", "правило" | rule |
| "agent", "worker", "parallel", "swarm", "агент" | agent |

If ambiguous — default to `skill` and note the assumption.

### Step 5: DEEP Mode (if activated)

Read `.claude/skills/explore/SKILL.md`

Follow the explore protocol to clarify:
1. Exact scope and boundaries — what is in scope, what is out of scope?
2. Target consumers — which agent/user/command will load this?
3. Input format — what $ARGUMENTS or parameters does it accept?
4. Expected output — what files, text, or actions does it produce?
5. Quality criteria — how will success be measured?
6. Edge cases — what inputs could break it?
7. Reference examples — any existing artifacts to model after?

Produce a requirements brief and confirm with user before proceeding to generation.

### Step 6: QUICK Mode (if activated)

Extract directly from $ARGUMENTS:
1. Parse artifact name → kebab-case slug
2. Extract key capabilities and responsibilities
3. Identify domain context (banking, retail, enterprise, etc.)
4. Identify output artifacts (files, reports, diagrams)
5. Proceed immediately to generation

### Step 7: Generate Artifact

Following the template from build.md for the detected type:

#### For Skills:
Create directory `.claude/skills/<name>/` with:
- `SKILL.md` — Main orchestrator with Overview, Protocol, Output Format, Anti-Patterns, Dependencies
- `modules/<module-name>.md` — Detailed per-module protocols (if multi-module)
- `references/<ref-name>.md` — Supporting material, rubrics, checklists (at least one)
- `examples/<example-name>.md` — Few-shot examples showing expected output (at least one)

#### For Commands:
Create file `.claude/commands/<name>.md` with:
- `# /command-name — Short Description`
- `## Usage` with invocation syntax
- `## Parameters` documenting $ARGUMENTS
- `## Protocol` with numbered steps
- Skill loading instructions (Read `.claude/skills/.../SKILL.md`)
- Agent tool usage for parallel work where applicable
- Checkpoint banner at end

#### For Rules:
Create file `.claude/rules/<name>.md` with:
- Title heading
- Pattern/Detection Signal/Fix table
- Auto-Detection section

#### For Agent Templates:
Create file `.claude/agents/<name>.md` with:
- Purpose statement
- Model selection with justification
- Isolation scope (reads X, writes Y)
- Prompt template

### Step 8: Self-Review (Layer 0)

Before finalizing, validate against quality checklist:

**Structure check:**
- Required sections present for artifact type?
- No empty sections (heading immediately followed by another heading)?
- Proper markdown formatting?

**Content check:**
- No generic placeholder content left?
- Anti-patterns section populated with real failure modes?
- At least one concrete example or reference included?

**Convention check:**
- File naming: kebab-case?
- Heading hierarchy: properly nested?
- All cross-references point to files that will exist?

**Size check:**
- SKILL.md: 2KB-30KB
- Module files: 1KB-15KB
- Reference files: 500B-10KB
- Command files: 500B-20KB

If any check fails — fix before outputting. Flag with [FIXED: reason].

### Step 9: Create Files

> See **Agent Authoring Rule** in `SKILL.md` — write the skeleton first, then incremental `Edit` appends;
> never one giant `Write`.

Write all generated files to disk: for each file, one small `Write` carrying the frontmatter
fence (skills only), the title and the section headings, then one `Edit` per section. Emitting
four files in a single uninterrupted turn is the shape the watchdog kills, and a killed agent
leaves nothing on disk. Display creation summary.

**Checkpoint:**
```
═══════════════════════════════════════════════════════
CHECKPOINT: BUILD Complete
Artifact type: [skill / command / rule / agent]
Mode used: [QUICK / DEEP]

Files created:
  [path/to/SKILL.md] (X KB)
  [path/to/modules/module.md] (X KB)
  [path/to/references/ref.md] (X KB)
  [path/to/examples/example.md] (X KB)

Self-review: X/Y checks passed
[List any issues found and fixed]

Next steps:
  /bto-test [path] — evaluate quality
  /bto [path]      — test + optimize in one pipeline
• "ок" — done
• "переделай [aspect]" — adjust and regenerate
• "углуби [section]" — expand a specific section
• "добавь пример" — add another example
═══════════════════════════════════════════════════════
```

## Anti-Patterns

| Anti-Pattern | Detection | Fix |
|-------------|-----------|-----|
| Generic artifact | No domain-specific terms in output | Add domain context from $ARGUMENTS |
| Missing references | references/ empty or not created | Always include at least one reference file |
| No examples | examples/ empty or not created | Always include at least one example |
| Placeholder content | "[TODO]" or "[INSERT]" left in output | Generate actual content, never leave placeholders |
| Over-scoped SKILL.md | SKILL.md > 30KB | Split into modules, keep SKILL.md as orchestrator |
| Under-specified | SKILL.md < 2KB | Expand — artifact too thin to be useful |
| Wrong artifact type | Description says "command" but skill generated | Re-detect and regenerate |
| Skipping self-review | Files written before quality check | Always run Layer 0 before finalizing |

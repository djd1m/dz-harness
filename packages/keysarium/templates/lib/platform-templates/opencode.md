# OpenCode Platform Template

> Generates `.opencode/` directory structure from `.claude/` sources.

## Target Format

OpenCode uses a `.opencode/` directory in the project root with a `config.yaml` configuration file and skill/rule markdown files. This is the most structurally similar platform to Claude Code's `.claude/` directory.

## Generation Protocol

### Step 1: Generate `.opencode/config.yaml`

Create `.opencode/config.yaml` with the following structure:

```yaml
# OpenCode configuration for {project name}
# Generated from .claude/ directory by /init-platform
# Source: dz-harness-hub

project:
  name: "{project name from CLAUDE.md}"
  description: "{first paragraph of CLAUDE.md}"

instructions: |
  {Extract the critical rules from CLAUDE.md:
   - File conventions
   - Research quality requirements (PARANOID mode)
   - Checkpoint protocol summary
   - Anti-patterns to avoid
   Keep to 30-50 lines.}

skills_dir: ".opencode/skills"
rules_dir: ".opencode/rules"
```

### Step 2: Generate `.opencode/skills/`

For each skill in `.claude/skills/`:

Create `.opencode/skills/{skill-name}.md`:

```markdown
# {Skill Name}

{Full content of SKILL.md with the following adaptations:}

{Replace Claude Code-specific instructions:
 - "Read: .claude/skills/X/SKILL.md" → "See: .opencode/skills/X.md"
 - "Read: .claude/rules/X.md" → "See: .opencode/rules/X.md"
 - Agent tool references → "For parallel work, break into sub-tasks"
 - Model routing references → Omit or note as "model selection is platform-managed"
}

{If the skill has references/ directory:
 - Inline key reference content at the bottom under "## References"
 - Or create .opencode/skills/{skill-name}/ directory with reference files
}

{If the skill has modules/ directory:
 - Create .opencode/skills/{skill-name}/ directory
 - Copy module files with path adaptations
}
```

### Step 3: Generate `.opencode/rules/`

For each rule file in `.claude/rules/`:

Create `.opencode/rules/{rule-name}.md`:

```markdown
# {Rule Title}

{Full content of the rule file, with minimal adaptation:
 - Replace .claude/ paths with .opencode/ paths
 - Keep tables and structured content intact
 - Remove Claude Code-specific tool references
}
```

### Step 4: Generate `.opencode/README.md`

Create a brief README explaining the configuration:

```markdown
# OpenCode Configuration

This directory was generated from `.claude/` by the `/init-platform` command.

## Structure

- `config.yaml` — Main configuration
- `skills/` — Skill definitions (one per file)
- `rules/` — Project rules (one per file)

## Regenerating

To regenerate this configuration from updated `.claude/` sources:
```
/init-platform --platform opencode
```

## Source

Generated from: .claude/ directory
Generated on: {date}
```

## Content Adaptation Rules

| Source Element | OpenCode Adaptation |
|----------------|---------------------|
| `.claude/skills/X/SKILL.md` | `.opencode/skills/X.md` |
| `.claude/rules/X.md` | `.opencode/rules/X.md` |
| `.claude/shards/X.md` | `.opencode/shards/X.md` (if shards are included) |
| `Read: path` instructions | `See: adapted-path` |
| Agent tool references | "Break into sub-tasks for parallel work" |
| Model routing (haiku/sonnet/opus) | Omit (platform-managed) |
| `$ARGUMENTS` variable | "User-provided input" |

## Example Output Structure

```
.opencode/
├── config.yaml
├── README.md
├── skills/
│   ├── explore.md
│   ├── goap-research-ed25519.md
│   ├── problem-solver-enhanced.md
│   ├── frontend-design.md
│   ├── presentation-storyteller.md
│   ├── reverse-engineering-unicorn.md
│   ├── bto.md
│   └── feature-adr.md
└── rules/
    ├── agent-swarm.md
    ├── anti-patterns.md
    ├── checkpoint-protocol.md
    ├── domain-specific.md
    ├── file-conventions.md
    ├── modular-reuse.md
    ├── research-quality.md
    ├── model-routing.md
    ├── trust-tiers.md
    ├── feature-adr-conventions.md
    └── feedback-loops.md
```

## Last Verified

Platform: OpenCode
Format version: .opencode/ directory (2025+)
Last verified: 2026-03-01

# OpenCode Platform Template

> Generates `.opencode/` directory structure from pipeline source configuration.

## Target Format

OpenCode uses a `.opencode/` directory with `config.yaml` and per-file skills and rules. This is the most structurally similar platform to Claude Code.

## Generation Protocol

### Step 1: Generate `.opencode/config.yaml`

```yaml
# OpenCode configuration for {project name}
# Generated from source pipeline configuration

project:
  name: "{project name}"
  description: "{project description}"

instructions: |
  {Critical rules: file conventions, quality requirements, checkpoints.
   Keep to 30-50 lines.}

skills_dir: ".opencode/skills"
rules_dir: ".opencode/rules"
```

### Step 2: Generate `.opencode/skills/`

For each skill, create `.opencode/skills/{skill-name}.md` with the full SKILL.md content adapted:
- Replace source-specific paths with `.opencode/` paths
- Replace Agent tool references with "Break into sub-tasks"
- Omit model routing (platform-managed)

### Step 3: Generate `.opencode/rules/`

For each rule file, create `.opencode/rules/{rule-name}.md` with minimal adaptation:
- Replace source paths
- Keep tables and structured content intact
- Remove platform-specific tool references

### Step 4: Generate `.opencode/README.md`

Brief README explaining the configuration structure and how to regenerate.

## Content Adaptation Rules

| Source Element | OpenCode Adaptation |
|----------------|---------------------|
| `source/skills/X/SKILL.md` | `.opencode/skills/X.md` |
| `source/rules/X.md` | `.opencode/rules/X.md` |
| `Read: path` | `See: adapted-path` |
| Agent tool references | "Break into sub-tasks for parallel work" |
| Model routing | Omit (platform-managed) |

## Example Output

```
.opencode/
├── config.yaml
├── README.md
├── skills/
│   ├── skill-1.md
│   └── skill-2.md
└── rules/
    ├── rule-1.md
    └── rule-2.md
```

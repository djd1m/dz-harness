---
description: "Generate platform-specific configuration for Cursor, OpenCode, or GitHub Copilot"
argument: "--platform cursor|opencode|copilot|all"
---

# Init Platform — Multi-Platform Config Generator

Generate platform-native configuration files from the existing `.claude/` directory structure.
Supports Cursor, OpenCode, and GitHub Copilot.

## Protocol

### Step 1: Parse Arguments

Parse `$ARGUMENTS` for the `--platform` flag:

| Argument | Action |
|----------|--------|
| `--platform cursor` | Generate Cursor config only |
| `--platform opencode` | Generate OpenCode config only |
| `--platform copilot` | Generate GitHub Copilot config only |
| `--platform all` | Generate configs for all three platforms |
| (no argument) | Prompt user to choose a platform |

If `$ARGUMENTS` does not contain `--platform`, ask:
```
Which platform(s) to generate config for?
1. cursor — .cursorrules + .cursor/skills/
2. opencode — .opencode/ directory
3. copilot — .github/copilot-instructions.md
4. all — all three platforms
```

### Step 2: Load Adapter Definitions

```
Read: lib/platform-adapters.md
```

This file contains the platform registry: mapping platform names to their template paths,
output structures, and translation strategies.

### Step 3: Scan Source Content

Scan the following directories for content to translate:

1. **Skills:** List all directories in `.claude/skills/`, read each `SKILL.md`
2. **Rules:** List all `.md` files in `.claude/rules/`
3. **Project context:** Read `CLAUDE.md` for project overview, pipeline description, and anti-patterns

Build a content inventory:
```
Skills found: [list skill names]
Rules found: [list rule file names]
Project: [project name from CLAUDE.md]
```

### Step 4: Check for Existing Configs

Before generating, check if target files already exist:

| Platform | Check |
|----------|-------|
| Cursor | Does `.cursorrules` exist? Does `.cursor/` exist? |
| OpenCode | Does `.opencode/` exist? |
| Copilot | Does `.github/copilot-instructions.md` exist? |

If any target file exists, warn:
```
Warning: {file} already exists.
Options:
  - "перезаписать" — overwrite existing config
  - "рядом" — generate as {file}.generated.md
  - "пропустить" — skip this platform
```

For auto-proceed mode: generate as `.generated.md` variant to avoid data loss.

### Step 5: Generate Platform Configs

For each selected platform, load the corresponding template and follow its generation protocol:

#### Cursor
```
Read: lib/platform-templates/cursor.md
```
Follow the template to generate:
- `.cursorrules` (main instructions, <10K tokens)
- `.cursor/skills/` (optional, for large skills >200 lines)

#### OpenCode
```
Read: lib/platform-templates/opencode.md
```
Follow the template to generate:
- `.opencode/config.yaml` (main configuration)
- `.opencode/skills/` (one file per skill)
- `.opencode/rules/` (one file per rule)
- `.opencode/README.md` (brief explanation)

#### GitHub Copilot
```
Read: lib/platform-templates/copilot.md
```
Follow the template to generate:
- `.github/copilot-instructions.md` (single file, <8K tokens)

### Step 6: Validate Generated Output

For each generated platform config:

- [ ] All skills from `.claude/skills/` are represented
- [ ] All rules from `.claude/rules/` are represented
- [ ] Project overview is included
- [ ] Platform-specific size limits are respected
- [ ] No Claude Code-specific tool references remain (Agent tool, model routing)
- [ ] File paths in generated content reference the correct platform directory

### Step 7: Report Results

Display a summary:

```
═══════════════════════════════════════════════════════
Platform Config Generation Complete

Platform: {platform name(s)}
Skills translated: {N}
Rules translated: {N}

Files created:
  {list each file created with path}

Source: .claude/ directory
Note: .claude/ remains the source of truth.
      Re-run /init-platform after modifying skills or rules.

• "ок" — done
• "покажи {file}" — preview a generated file
• "перегенерируй {platform}" — regenerate for specific platform
═══════════════════════════════════════════════════════
```

## Error Handling

| Error | Action |
|-------|--------|
| No `.claude/skills/` found | Abort with message: "No skills found in .claude/skills/. Nothing to translate." |
| No `.claude/rules/` found | Warn but continue: rules section will be empty |
| Template file missing | Abort with message: "Template not found: lib/platform-templates/{platform}.md" |
| Target file exists | See Step 4 (conflict resolution) |

## Modular Reuse

This command follows the scan-then-generate pattern from `/brain-export`.
The template-based approach means adding a new platform requires only:
1. A new template file in `lib/platform-templates/`
2. An entry in `lib/platform-adapters.md`
3. A new case in Step 5 of this command

No changes to the core command logic are needed for platform additions.

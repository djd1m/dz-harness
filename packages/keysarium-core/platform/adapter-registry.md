# Platform Adapter Registry

> Central registry for multi-platform support. Maps each supported AI coding platform to its configuration format, output paths, and translation strategy.

## Supported Platforms

| Platform | Config Format | Output Structure | Complexity |
|----------|---------------|------------------|------------|
| Claude Code | `.claude/` directory | Native — skills, rules, commands, shards | Native |
| Cursor | `.cursorrules` + optional `.cursor/skills/` | Flat rules file with inlined skills | Low |
| OpenCode | `.opencode/` directory | Directory hierarchy mirroring Claude Code | Low |
| GitHub Copilot | `.github/copilot-instructions.md` | Single markdown file | Medium |

## Platform Details

### Claude Code (Native)

| Property | Value |
|----------|-------|
| Config directory | `.claude/` |
| Skills | `.claude/skills/{name}/SKILL.md` |
| Rules | `.claude/rules/{name}.md` |
| Commands | `.claude/commands/{name}.md` |
| Shards | `.claude/shards/{name}.shard.md` |
| Notes | This is the native format. No translation needed. |

### Cursor

| Property | Value |
|----------|-------|
| Config file | `.cursorrules` (project root) |
| Format | Plain text / markdown |
| Skills | Key instructions extracted and inlined; large skills in `.cursor/skills/` |
| Rules | All rules concatenated under sections |
| Max size | Recommended < 10,000 tokens |

### OpenCode

| Property | Value |
|----------|-------|
| Config directory | `.opencode/` |
| Config file | `.opencode/config.yaml` |
| Skills | `.opencode/skills/{name}.md` (one file per skill) |
| Rules | `.opencode/rules/{name}.md` (one file per rule) |
| Notes | Most structurally similar to Claude Code |

### GitHub Copilot

| Property | Value |
|----------|-------|
| Config file | `.github/copilot-instructions.md` |
| Format | Single markdown file |
| Skills | Summarized into sections within the file |
| Rules | Merged into the instructions file |
| Max size | Recommended < 8,000 tokens |

## Translation Strategy

### Source Structure

The source of truth is the Claude Code `.claude/` directory (or equivalent). Translation generates platform-specific configs from this source.

### Translation Rules

| Source Element | Cursor | OpenCode | Copilot |
|----------------|--------|----------|---------|
| `Read: .claude/skills/X/SKILL.md` | "Follow the X skill protocol" | `See: .opencode/skills/X.md` | Summarize inline |
| Agent tool references | "Break into sub-tasks" | "Break into sub-tasks" | "Break into sub-tasks" |
| Model routing | Omit (platform-managed) | Omit (platform-managed) | Omit (platform-managed) |
| `$ARGUMENTS` variable | "User-provided input" | "User-provided input" | "User-provided context" |
| Promise tags | Keep as markers | Keep as markers | Keep as markers |
| Checkpoint protocol | "Pause and confirm" | "Pause and confirm" | "Confirm before proceeding" |
| Governance shards | Omit (single-file) | Include if directory-based | Omit (single-file) |

## Adding a New Platform

To add support for a new platform:

1. Create a template file in `platform/templates/{platform-name}.md`
2. Add an entry to the "Supported Platforms" table above
3. Add a "Platform Details" section
4. Define translation rules for the new platform
5. Test generation with the new platform

## Template Format

Each platform template file should include:

1. **Target Format** — Description of the platform's config format
2. **Generation Protocol** — Step-by-step instructions for generating the config
3. **Content Adaptation Rules** — Table mapping source elements to target format
4. **Size Constraints** — Token/word limits for the platform
5. **Example Output Structure** — What the generated files look like

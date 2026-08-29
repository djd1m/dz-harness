# Platform Adapter Definitions

Central registry for multi-platform support. Maps each supported AI coding platform to its configuration format, output paths, and translation strategy.

## Supported Platforms

| Platform | Template | Config Format | Output Structure |
|----------|----------|---------------|------------------|
| Cursor | `lib/platform-templates/cursor.md` | Single `.cursorrules` file + optional `.cursor/skills/` | Flat rules file with inlined skills |
| OpenCode | `lib/platform-templates/opencode.md` | `.opencode/` directory with `config.yaml` + skill files | Directory hierarchy matching `.claude/` |
| GitHub Copilot | `lib/platform-templates/copilot.md` | `.github/copilot-instructions.md` single file | Single markdown file with all instructions |

## Platform Details

### Cursor

| Property | Value |
|----------|-------|
| Config file | `.cursorrules` (project root) |
| Format | Plain text / TOML-style rules |
| Skills directory | `.cursor/skills/` (optional, one file per skill) |
| Rules handling | All rules concatenated into `.cursorrules` under sections |
| Skill handling | Key instructions extracted from SKILL.md and inlined; large skills get separate files in `.cursor/skills/` |
| Max config size | Recommended < 10,000 tokens |
| Platform docs | Cursor uses `.cursorrules` for project-level AI instructions |

### OpenCode

| Property | Value |
|----------|-------|
| Config directory | `.opencode/` (project root) |
| Config file | `.opencode/config.yaml` |
| Skills directory | `.opencode/skills/` (one `.md` file per skill) |
| Rules directory | `.opencode/rules/` (one `.md` file per rule) |
| Rules handling | Each rule file copied with format adaptation |
| Skill handling | Each skill gets its own markdown file with instructions |
| Platform docs | OpenCode uses directory-based configuration |

### GitHub Copilot

| Property | Value |
|----------|-------|
| Config file | `.github/copilot-instructions.md` |
| Format | Single markdown file |
| Skills handling | All skills summarized into sections within the file |
| Rules handling | All rules merged into the instructions file |
| Max config size | Recommended < 8,000 tokens (Copilot context window considerations) |
| Platform docs | GitHub Copilot reads `.github/copilot-instructions.md` for custom instructions |

## Translation Strategy

### Source Structure (`.claude/`)

```
.claude/
├── skills/
│   ├── explore/SKILL.md
│   ├── goap-research-ed25519/SKILL.md
│   ├── problem-solver-enhanced/SKILL.md
│   ├── frontend-design/SKILL.md
│   ├── presentation-storyteller/SKILL.md
│   ├── reverse-engineering-unicorn/SKILL.md
│   ├── bto/SKILL.md
│   └── feature-adr/SKILL.md
├── rules/
│   ├── agent-swarm.md
│   ├── anti-patterns.md
│   ├── checkpoint-protocol.md
│   ├── domain-specific.md
│   ├── file-conventions.md
│   ├── modular-reuse.md
│   ├── research-quality.md
│   ├── model-routing.md
│   ├── trust-tiers.md
│   ├── feature-adr-conventions.md
│   └── feedback-loops.md
└── commands/
    └── *.md
```

### Translation Rules

1. **Skills:** Read each `SKILL.md`, extract the core protocol/instructions section. For single-file platforms (Cursor, Copilot), summarize to key points. For directory-based platforms (OpenCode), preserve full content.

2. **Rules:** Read each rule file. For single-file platforms, merge all rules under a unified "Rules" section with subsections. For directory-based platforms, create one file per rule.

3. **Commands:** Commands are Claude Code-specific and generally not translatable. Include a note in generated configs pointing users to the `.claude/commands/` directory for reference.

4. **Shards:** Governance shards (`.claude/shards/`) are pipeline-specific. Include them as supplementary context in platforms that support directory structures; omit from single-file platforms.

## Adding a New Platform

To add support for a new platform:

1. Create `lib/platform-templates/<platform-name>.md` following the template pattern
2. Add an entry to the "Supported Platforms" table above
3. Add a "Platform Details" section with config format, paths, and constraints
4. Update `/init-platform` command's `--platform` argument to include the new name
5. Test generation with the new platform

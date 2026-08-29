# Skill Loader — Universal Skill Loading Protocol

## Purpose
Standardized protocol for loading skills before each phase.
Ensures consistent skill activation across Claude Code and claude.ai environments.

## Loading Protocol

### In Claude Code (this repository)
```
Read(".claude/skills/{skill-name}/SKILL.md")
```

### In claude.ai (web)
```
view("/mnt/skills/user/{skill-name}/SKILL.md")
```

## Skill Registry

| Skill ID | Path (Claude Code) | Path (claude.ai) | Used By Phases |
|----------|-------------------|-------------------|----------------|
| explore | .claude/skills/explore/ | /mnt/skills/user/explore/ | Phase 1 |
| frontend-design | .claude/skills/frontend-design/ | /mnt/skills/public/frontend-design/ | Phase 2.5 |
| goap-research-ed25519 | .claude/skills/goap-research-ed25519/ | /mnt/skills/user/goap-research-ed25519/ | Phase 2, 2.5 |
| presentation-storyteller | .claude/skills/presentation-storyteller/ | /mnt/skills/user/presentation-storyteller/ | Phase 5 |
| problem-solver-enhanced | .claude/skills/problem-solver-enhanced/ | /mnt/skills/user/problem-solver-enhanced/ | Phase 3 |
| reverse-engineering-unicorn | .claude/skills/reverse-engineering-unicorn/ | /mnt/skills/user/reverse-engineering-unicorn/ | Phase 0, 2.5 |

## Phase → Skill Mapping

```
Phase 0: DISCOVERY
  → Load: reverse-engineering-unicorn/SKILL.md
  → Also read: modules/02-product-customers.md

Phase 1: EXPLORE
  → Load: explore/SKILL.md
  → Also read: references/questioning-techniques.md

Phase 2: RESEARCH
  → Load: goap-research-ed25519/SKILL.md
  → Also read: references/research-actions.md, references/source-evaluation.md

Phase 2.5: CJM PROTOTYPE
  → Load: reverse-engineering-unicorn/SKILL.md (module M2.5)
  → Also read: modules/025-cjm-prototype.md
  → Load: frontend-design/SKILL.md
  → For Variant D trends:
    → Load: goap-research-ed25519/SKILL.md

Phase 3: SOLVE
  → Load: problem-solver-enhanced/SKILL.md

Phase 4: ARCHITECTURE
  → No external skill (built-in templates)
  → Reference: lib/phase-utils.md for domain detection

Phase 5: PRESENTATION
  → Load: presentation-storyteller/SKILL.md
  → Also read: references/storytelling-frameworks.md, references/speaker-script-patterns.md
```

## Adding a New Skill

1. Create directory: `.claude/skills/{skill-name}/`
2. Create `SKILL.md` with YAML frontmatter:
   ```yaml
   ---
   name: skill-name
   description: What this skill does and when to trigger it.
   ---
   ```
3. Add reference materials in `references/` subdirectory
4. Add examples in `examples/` subdirectory
5. Update this registry
6. Update CLAUDE.md skill graph
7. Create or update the command that uses this skill

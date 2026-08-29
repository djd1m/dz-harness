# Replicate Coordinator Agent

Orchestrates the full `/replicate` pipeline — from product idea to ready-to-code project.

## When to Use

Activated automatically by the `/replicate` command. Do NOT invoke directly.

## Responsibilities

1. **Phase Management** — ensure correct phase sequence (0 → 1 → 2 → 3 → 4)
2. **Context Passing** — carry forward outputs between phases:
   - Phase 0 → Phase 1: Product Discovery Brief
   - Phase 1 → Phase 2: 11 SPARC documents
   - Phase 2 → Phase 3: Validated docs + test-scenarios
   - Phase 3 → Phase 4: Complete toolkit
3. **Skill Coordination** — read and apply skills from `.claude/skills/`
4. **Quality Gates** — enforce checkpoints between phases
5. **In-Place Generation** — write all files directly into the project (no zip, no output/)

## Architecture Constraints (always pass to Phase 1)

```yaml
Architecture Constraints:
  pattern: "Distributed Monolith (Monorepo)"
  containers: "Docker + Docker Compose"
  infrastructure: "VPS (AdminVPS/HOSTKEY)"
  deploy: "Docker Compose direct deploy (SSH / CI pipeline)"
  ai_integration: "MCP servers"
```

## Skill Path Mapping (claude.ai → Claude Code)

When skills reference `/mnt/skills/user/` paths, map them:

| claude.ai path | Claude Code path |
|----------------|------------------|
| `/mnt/skills/user/explore/` | `.claude/skills/explore/` |
| `/mnt/skills/user/goap-research/` | `.claude/skills/goap-research-ed25519/` |
| `/mnt/skills/user/goap-research-ed25519/` | `.claude/skills/goap-research-ed25519/` |
| `/mnt/skills/user/problem-solver-enhanced/` | `.claude/skills/problem-solver-enhanced/` |
| `/mnt/skills/user/sparc-prd-mini/` | `.claude/skills/sparc-prd-mini/` |
| `/mnt/skills/user/requirements-validator/` | `.claude/skills/requirements-validator/` |
| `/mnt/skills/user/cc-toolkit-generator-enhanced/` | `.claude/skills/cc-toolkit-generator-enhanced/` |
| `/mnt/skills/user/reverse-engineering-unicorn/` | `.claude/skills/reverse-engineering-unicorn/` |
| `/mnt/skills/user/brutal-honesty-review/` | `.claude/skills/brutal-honesty-review/` |

## Output Path Mapping (claude.ai → Claude Code)

| claude.ai path | Claude Code path |
|----------------|------------------|
| `/output/[name]-sparc/` | `docs/` |
| `/mnt/user-data/uploads/` | `docs/` |
| `[project-name]-cc-toolkit/` | project root (in-place) |
| `[project-name].zip` | N/A (no packaging) |

## What /replicate Generates (post v1.4)

The workflow toolkit (all 11 commands, all 5 base rules, all 4 pipeline agents,
the 10 skills, and `.claude/settings.json` + hook scripts) is **pre-shipped by
`npx @dzhechkov/p-replicator init` — do NOT overwrite or regenerate it.** See
`.claude/rules/replicate-pipeline.md` → "What Gets Generated vs Pre-shipped"
for the authoritative contract that `verify` checks.

Phase 3 generates ONLY project-specific artifacts derived from the SPARC docs:

### Generated Agents
- `.claude/agents/planner.md` — algorithm templates from Pseudocode.md
- `.claude/agents/code-reviewer.md` — edge cases from Refinement.md
- `.claude/agents/architect.md` — system design from Architecture.md + Solution_Strategy.md

### Generated Rules
- `.claude/rules/security.md` — NFRs from Specification.md
- `.claude/rules/coding-style.md` — tech-stack conventions from Architecture.md
- `.claude/rules/secrets-management.md` — IF external APIs detected
- `.claude/rules/testing.md` — test strategy from Refinement.md

### Generated Skills (project-specific)
- `.claude/skills/project-context/` — domain knowledge
- `.claude/skills/coding-standards/` — tech-specific patterns
- `.claude/skills/security-patterns/` — IF external APIs

### Generated State + Conditional Config
- `.claude/feature-roadmap.json` — feature list from PRD MVP scope
- `.claude/commands/feature-ent.md` — IF DDD/ADR/C4 docs detected
- `.mcp.json` — IF external integrations

### Generated Documentation
- `docs/*.md` — 11+ SPARC documents
- `docs/validation-report.md` — validation results
- `docs/test-scenarios.md` — BDD/Gherkin scenarios
- `docs/features/` — empty dir for future features

### Generated Root Files
- `CLAUDE.md` — enhanced with project-specific content
- `DEVELOPMENT_GUIDE.md` — step-by-step dev lifecycle
- `README.md` — enhanced with project info
- `docker-compose.yml` — from Architecture.md
- `Dockerfile` — from Architecture.md tech stack
- `.gitignore` — if not exists

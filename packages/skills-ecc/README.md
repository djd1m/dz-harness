# @dzhechkov/skills-ecc

20 curated skills imported from [ECC](https://github.com/affaan-m/ECC).

## Install

```bash
dz install @dzhechkov/skills-ecc
# or
dz init --target claude-code --select docker-patterns,autonomous-loops
```

## Skills

| Skill | What it does |
|-------|-------------|
| `agent-architecture-audit` | Full-stack diagnostic for agent applications |
| `agent-eval` | Head-to-head comparison of coding agents |
| `agentic-engineering` | Patterns for building agentic AI systems |
| `ai-regression-testing` | AI-specific regression testing patterns |
| `architecture-decision-records` | ADR creation and management |
| `autonomous-loops` | Autonomous agent loop patterns |
| `backend-patterns` | Backend architecture patterns |
| `benchmark-optimization-loop` | Performance benchmark loops |
| `brand-voice` | Brand voice consistency |
| `browser-qa` | Browser-based QA testing |
| `canary-watch` | Canary deployment monitoring |
| `continuous-agent-loop` | Continuous agent execution patterns |
| `data-scraper-agent` | Data scraping agent patterns |
| `django-tdd` | Django TDD patterns |
| `docker-patterns` | Docker best practices |
| `e2e-testing` | End-to-end testing patterns |
| `enterprise-agent-ops` | Enterprise agent operations |
| `fastapi-patterns` | FastAPI best practices |
| `flutter-dart-code-review` | Flutter/Dart code review |
| `git-workflow` | Git workflow patterns |

## Upstream

Source: [ECC](https://github.com/affaan-m/ECC) (MIT). Imported via `dz import-ecc`.

```bash
# Import more skills from ECC:
dz import-ecc --limit 50
```

## How to use

Skills **auto-activate** — your agent loads a skill when your task matches its trigger phrases (defined in each skill's `SKILL.md` frontmatter). For example:

- "Set up an autonomous agent loop" → `autonomous-loops`
- "Scaffold a FastAPI service" → `fastapi-patterns`
- "Audit my agent architecture" → `agent-architecture-audit`

To see a skill's exact triggers and assets: `dz info <skill-id>`. To find one: `dz registry search <term>`.

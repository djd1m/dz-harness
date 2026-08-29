# @dzhechkov/skills-qe

Curated quality engineering skill pack — 22 skills for Claude Code agents: 20 from [agentic-qe](https://github.com/proffesor-for-testing/agentic-qe) + 2 vendor-neutral engineering-discipline skills (`validate`, `systematic-debugging`, from [obra/superpowers](https://github.com/obra/superpowers)).

## Install

```bash
# Via dz CLI (recommended):
dz init --target claude-code --preset qe-engineer

# Or with self-learning:
dz setup --target claude-code --preset qe-engineer

# Or directly:
dz install @dzhechkov/skills-qe
```

## Skills (22)

| Skill | What it does | Upstream Agent |
|-------|-------------|---------------|
| `validate` | Verification-before-completion gate (no "done" without fresh evidence) | — (obra/superpowers) |
| `systematic-debugging` | Root-cause-first debugging discipline (four phases) | — (obra/superpowers) |
| `qe-browser` | Browser automation via Vibium (WebDriver BiDi) | — (tool) |
| `qe-chaos-resilience` | Controlled fault injection, resilience testing | qe-chaos-engineer |
| `qe-code-intelligence` | Semantic code indexes, dependency graphs | qe-code-intelligence |
| `qe-coverage-analysis` | O(log n) coverage with risk-weighted gaps | qe-coverage-specialist |
| `qe-defect-intelligence` | ML defect prediction from code metrics | qe-defect-predictor |
| `qe-iterative-loop` | Autonomous red-green-refactor loops | — (loop) |
| `qe-learning-optimization` | Transfer learning, hyperparameter tuning | qe-metrics-optimizer |
| `qe-quality-assessment` | Quality gate evaluation, pass/fail verdicts | qe-quality-gate |
| `qe-requirements-validation` | Acceptance criteria, BDD scenarios | qe-requirements-validator |
| `qe-test-execution` | Parallel sharding, intelligent retry | qe-parallel-executor |
| `qe-test-generation` | AI test generation, multi-framework | qe-test-architect |
| `qe-visual-accessibility` | Visual regression + axe-core a11y | qe-visual-tester |
| `brutal-honesty-review` | Unvarnished technical criticism, BS-detection | — (review) |
| `six-thinking-hats` | De Bono six-hat test strategy analysis | — (analysis) |
| `sfdipot-product-factors` | HTSM SFDIPOT product factors test ideas | qe-product-factors-assessor |
| `qcsd-ideation-swarm` | Quality Criteria sessions (HTSM, Risk Storming) | — (swarm) |
| `qcsd-refinement-swarm` | Sprint refinement, BDD, requirements validation | — (swarm) |
| `qcsd-development-swarm` | In-sprint code quality, TDD, coverage gaps | — (swarm) |
| `qcsd-cicd-swarm` | CI/CD quality gates, regression, flaky detection | — (swarm) |
| `qcsd-production-swarm` | Post-release health, DORA, root cause analysis | — (swarm) |

## Upstream: agentic-qe

This is a **curated subset** of [agentic-qe](https://github.com/proffesor-for-testing/agentic-qe) (v3.10.3).

```bash
# Lightweight (this package — 22 curated skills):
dz init --target claude-code --preset qe-engineer

# Full power (94 skills + 55 agents + MCP server + memory):
npm install -g agentic-qe && aqe init --auto
```

### Sync with upstream

```bash
# Check if upstream has changes:
dz sync-upstream --package packages/@dzhechkov/skills-qe

# Check all packages:
dz sync-upstream --all
```

The `sources.json` maps each skill to its upstream agent in agentic-qe, enabling `dz sync-upstream` to detect drift.

## Related

- [agentic-qe](https://github.com/proffesor-for-testing/agentic-qe) — Full QE platform (94 skills, 55 agents, MCP)
- [@dzhechkov/harness-cli](https://www.npmjs.com/package/@dzhechkov/harness-cli) — The `dz` CLI
- [agentskills.io](https://agentskills.io) — Skill standard

## License

MIT

## How to use

Skills **auto-activate** — your agent loads a skill when your task matches its trigger phrases (defined in each skill's `SKILL.md` frontmatter). For example:

- "Generate tests for this module" → `qe-test-generation`
- "Give this code a brutal-honesty review" → `brutal-honesty-review`
- "Assess test coverage gaps" → `qe-coverage-analysis`

To see a skill's exact triggers and assets: `dz info <skill-id>`. To find one: `dz registry search <term>`.

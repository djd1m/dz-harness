# @dzhechkov/skills-bto

**Build-Benchmark-Test-Optimize skill pack for Claude Code**

Multi-agent evaluation and iterative optimization pipeline for Claude Code skills, commands, and prompts. Includes deterministic benchmarking with golden sample comparison, test suites, consistency probes, and performance metrics. Part of the [Keysarium](https://www.npmjs.com/package/@dzhechkov/keysarium) ecosystem.

---

## Quick Start

```bash
# One-command install via npx
npx @dzhechkov/skills-bto

# Or install globally
npm install -g @dzhechkov/skills-bto
skills-bto init

# Install into a project that already has @dzhechkov/keysarium
npx @dzhechkov/skills-bto init
```

After installation, open Claude Code in your project directory and start using BTO commands.

---

## What You Get

| Component | Count | Description |
|-----------|-------|-------------|
| **Skill** | 1 | `bto` — core Build-Benchmark-Test-Optimize skill with 4 modules |
| **Commands** | 5 | `/bto`, `/bto-build`, `/bto-benchmark`, `/bto-test`, `/bto-optimize` |
| **Rules** | 1 | `bto-quality-gates` — quality gate enforcement (incl. benchmark gates) |
| **Shards** | 1 | `bto-evaluation` — context shard for BTO evaluation pipeline |
| **Agent Templates** | 2 | `bto-judge-panel`, `bto-optimizer-worker` |
| **References** | 5 | Eval patterns, judge rubrics, optimization methods, quality checklist, golden samples |
| **Examples** | 2 | Sample evaluation report, sample benchmark report |

Everything is installed into your project's `.claude/` directory and works natively with Claude Code.

---

## Commands

```bash
npx @dzhechkov/skills-bto                    # Full install (interactive, same as init)
npx @dzhechkov/skills-bto init               # Install all components
npx @dzhechkov/skills-bto init --force       # Overwrite existing files
npx @dzhechkov/skills-bto init --dry-run     # Preview without making changes
npx @dzhechkov/skills-bto update             # Update to latest version
npx @dzhechkov/skills-bto remove             # Clean uninstall
npx @dzhechkov/skills-bto list               # Show installed components
npx @dzhechkov/skills-bto doctor             # Health check
```

---

## BTO Pipeline

```
BUILD ──→ BENCHMARK ──→ TEST ──→ OPTIMIZE
  │           │           │         │
  │           │           │         └── Evolutionary mutation + re-evaluation (3 rounds)
  │           │           └── Multi-layer evaluation: Layer 0 → Layer 1 → Layer 2
  │           └── Deterministic benchmarking: golden samples, test suite, consistency, metrics
  └── Generate skill/command from description
```

### Usage in Claude Code

```bash
# Full BTO cycle: build → benchmark → test → optimize
/bto Create a skill for code review automation

# Build only — generate a new skill or command
/bto-build Create a skill that analyzes git commit patterns

# Benchmark only — deterministic benchmarking against golden samples
/bto-benchmark .claude/skills/my-skill/SKILL.md

# Test only — evaluate an existing artifact
/bto-test .claude/skills/my-skill/SKILL.md

# Optimize only — iteratively improve an artifact
/bto-optimize .claude/skills/my-skill/SKILL.md
```

---

## Evaluation Architecture

### Benchmark Layers (deterministic, pre-TEST)

| Layer | Cost | Purpose |
|-------|------|---------|
| **B-1** | Zero (deterministic) | **Environment preconditions** — probes that each downstream layer *can* run, and records the answer |
| **B0** | Zero (deterministic) | Golden sample comparison — section coverage, ordering, proportions |
| **B1** | Zero (deterministic) | Deterministic test suite — 6 tests for skills, 5 per other artifact type, PASS/FAIL |
| **B2** | Minimal (3× haiku) | Consistency probe — 3 parallel agents, agreement measurement |
| **B3** | Zero (deterministic) | Performance metrics — token efficiency, bloat detection, redundancy |

**Scoring:** `BENCHMARK = B0×0.30 + B1×0.35 + B2×0.15 + B3×0.20`
(pass rate denominator = checks that actually **executed**, never the declared total)

**Gate**, first matching row wins:

| Condition | Verdict |
|-----------|---------|
| B-1 returned ABORT | **ABORT** — no score is emitted at all |
| Any layer INCONCLUSIVE | **INCONCLUSIVE** — not a pass and not a failure; TEST is not entered |
| Score < 0.50 | BLOCK |
| Score 0.50–0.70 | WARN |
| Score > 0.70 | PASS → proceed to TEST |

Layer B-1 prints `Preconditions: ALL_GREEN | DEGRADED(list) | ABORT` in the header of **every**
report, clean runs included — an absent line is itself a finding. A layer the operator deliberately
skipped via `--level` is renormalized away; a layer that was *requested and could not run* is
INCONCLUSIVE and is never renormalized, because redistributing its weight can only raise the score.

### TEST Layer Model

| Layer | Agents | Model | Purpose |
|-------|--------|-------|---------|
| **Layer 0** | 0 | — | Deterministic pre-checks (structure, completeness, encoding) |
| **Layer 1** | 1 | haiku | Fast semantic evaluation across 5 dimensions |
| **Layer 2** | 3 | sonnet | Full judge panel: Domain Expert + Critic + Completeness Auditor |
| **Meta** | 1 | opus | Disagreement resolution (triggered when score delta > 3) |

### Judge Panel

- **3 independent judges** evaluate each artifact in isolation
- Judges never see each other's scores before submitting
- Standard weights: Domain Expert (0.4) / Critic (0.3) / Completeness Auditor (0.3)
- If `max_score - min_score > 3` → meta-judge escalation
- Every evaluation report always emits three provenance lines — `Authored by:`, `Judged by:` and
  `Cross-family: YES|NO` — so a report read six months later says whether it was cross-checked:

  ```
  Authored by:  claude-opus (anthropic)
  Judged by:    Expert=claude-sonnet | Critic=gpt-5.5 | Auditor=claude-sonnet
  Cross-family: YES (Critic=openai — different family than the author)
  ```

- Running the Critic seat on a **different model family** than the author is *recommended*; when no
  second family is reachable the report prints a loud `SAME-FAMILY PANEL` banner saying CORRECTNESS
  and ROBUSTNESS are self-assessment. The family axis is **advisory** — it changes no score and
  blocks nothing. The separate *model-identity* rule still BLOCKS: the same model must not both
  generate and judge an artifact.

### Agent Authoring Rule

Every BTO agent that writes a document writes it **incrementally**: a small `Write` carrying the
title and section skeleton first, then one `Edit` per section. An agent that emits no tool event for
the harness watchdog window (180 s inside a workflow runner, 600 s for a directly-spawned subagent)
is killed, and a killed agent loses *all* unwritten output — there is no partial save. Genuinely
short emissions (the B2 probe answer, a one-line variant score) are exempt, and each exemption is
written down at its site rather than inferred from its absence.

### Quality Gates

- **BENCHMARK** must pass (score ≥ 0.50) before TEST begins
- A check or layer that could not execute is reported **INCONCLUSIVE** — never counted as a pass,
  never silently dropped (`SKIPPED is not PASSED`, universal check U-13)
- BENCHMARK score < 0.50 → BLOCK (artifact needs rework)
- Layer 0 must pass before Layer 1
- Layer 1 must pass before Layer 2
- Optimization accepted only if `new_score - prev_score > 0.5`
- 3 consecutive iterations with delta ≤ 0.5 → convergence declared
- Score decrease > 1.0 → automatic rollback to previous best

---

## Optimization Process

The optimizer runs up to 3 rounds of evolutionary improvement:

1. **Round 1** — 5 parallel haiku agents generate mutations, fast-rank variants
2. **Round 2** — Top variants evaluated by sonnet judge panel
3. **Round 3** — 3×3 parallel sonnet agents for full Layer 2 evaluation of finalists

Each round selects the best-performing variant and uses it as the base for the next iteration.

---

## Integration with Keysarium

BTO works standalone but integrates seamlessly with `@dzhechkov/keysarium`:

```bash
# Install Keysarium first (optional)
npx @dzhechkov/keysarium init

# Then add BTO — it detects Keysarium automatically
npx @dzhechkov/skills-bto init
```

When installed alongside Keysarium, BTO can evaluate and optimize any skill or command in the Keysarium toolkit.

---

## Generated skills carry a frontmatter fence

Skills built with `/bto-build` (and the pack's own `SKILL.md`) begin with a `---` frontmatter fence
carrying `name:` and `description:` before the `# Title` heading. This is what makes a skill loadable
— an unfenced `SKILL.md` makes the harness refuse the *entire* skills directory, not just that one
skill. Commands, rules and agent templates deliberately do **not** get a fence: the parser that
requires it reads skills only.

Verify a generated skill with the reproducer the pack itself uses:

```bash
dz list --skills-dir <project>/.claude/skills   # exit 0 and the skill named in the listing
dz info <name> --skills-dir <project>/.claude/skills
```

## Development

```bash
npm test    # node --test test/*.test.mjs — pack conformance specs
```

The specs assert against the shipped `templates/` text and spawn the real `dz` binary as the
acceptance oracle. A layout-only check (`dz skills-verify --static`) is necessary but **not**
sufficient: it passes on a tree whose fence is missing, so `dz list` is the discriminating oracle.

## Requirements

- **Claude Code CLI** — installed and configured ([installation guide](https://docs.anthropic.com/en/docs/claude-code))
- **Node.js >= 16.0.0** — required for the npm install method

---

## License

[MIT](https://opensource.org/licenses/MIT)

---

## Links

- **GitHub:** [https://github.com/dzhechko/product-keysarium-2026](https://github.com/dzhechko/product-keysarium-2026)
- **Issues:** [https://github.com/dzhechko/product-keysarium-2026/issues](https://github.com/dzhechko/product-keysarium-2026/issues)
- **npm:** [https://www.npmjs.com/package/@dzhechkov/skills-bto](https://www.npmjs.com/package/@dzhechkov/skills-bto)
- **Keysarium:** [https://www.npmjs.com/package/@dzhechkov/keysarium](https://www.npmjs.com/package/@dzhechkov/keysarium)

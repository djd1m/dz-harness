# @dzhechkov/skills-reasoning

**Generic reasoning & code-quality skill pack for Claude Code** — 4 stack-neutral agentic skills that improve
how an agent thinks, investigates, and writes code. Depersonalized from a curated skills archive; **zero
product coupling** (no vendor, framework, or repo specifics). Part of the [dz-harness-hub](https://github.com/djd1m/dz-harness-hub)
ecosystem.

## Install

```bash
# with the dz CLI (recommended)
dz init --target claude-code --preset reasoning
# or install one skill
dz init --target claude-code --select karpathy-guidelines

# or plain npm (skills are copied into your .claude/skills/)
npm install @dzhechkov/skills-reasoning
```

## The 4 skills

| Skill | When to use | What it does |
|-------|-------------|--------------|
| **investigate** | You're asked to investigate/research/understand a problem *without* fixing it | Systematic search for root cause → a **diagnosis document, not a diff**. Enforces "INVESTIGATE ONLY", prizes live reproduction over code-reading. Investigation and implementation are separate activities. |
| **solid** | Writing, refactoring, designing, reviewing, or testing code | Operate as a senior engineer: SOLID principles, **TDD (Red-Green-Refactor, non-negotiable)**, clean-code practices. Includes a `references/` library. |
| **karpathy-guidelines** | Writing/reviewing/refactoring code, to avoid common LLM mistakes | Behavioral guardrails (from [Karpathy's LLM-coding observations](https://x.com/karpathy)): think before coding, **simplicity first**, surgical changes, surface assumptions, define verifiable success criteria. |
| **agents-md-creator** | You want per-repo `AGENTS.md` files for a multi-repo project | Generates the always-on architectural skeleton an agent reads every session: dependency direction, package responsibilities, forbidden patterns, invariants, change checklist. |

> Looking for **systematic-debugging**? It already ships in [`@dzhechkov/skills-qe`](https://www.npmjs.com/package/@dzhechkov/skills-qe) — we don't duplicate it here.

## Why these are separate from the pipeline

These are **installable reasoning skills** — an agent invokes them by description or you name them. They are
deliberately *not* wired into any pipeline stage, so they compose with any workflow (feature-adr, plain coding,
review). The code-quality bar that *is* project-calibrated (a critic / implementer bar tied to your
`architecture/vision.md`) lives in [`@dzhechkov/skills-feature-adr`](https://www.npmjs.com/package/@dzhechkov/skills-feature-adr)
as the `critic` / `impl-bar` roles — this pack is the stack-neutral reasoning layer beneath it.

## Provenance

Canonicalized 2026-07-15 from a curated agentic-skills archive and depersonalized (all vendor/framework/repo
specifics removed — verified by a zero-coupling grep gate). Individual skills embody public methodologies
(SOLID, TDD, Karpathy's observations). See `sources.json`.

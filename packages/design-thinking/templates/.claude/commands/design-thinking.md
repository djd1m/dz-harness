# /design-thinking — Human-Centered Product Design

Run the Design Thinking pipeline on a user-facing problem, product idea, or service.

## Usage

```
/design-thinking [problem, product idea, or user need]
```

## What it does

Loads `.claude/skills/design-thinking/SKILL.md` and runs the Stanford d.school
5-phase process plus a 6th **Validate** phase, chaining the bundled skills:

```
explore (Task Brief)
   ↓
1. Empathize  → goap-research-ed25519 (verified user/market research)
2. Define     → JTBD / CJM / VSM synthesis + HMW questions (+ problem-solver-enhanced if root-cause is deep)
3. Ideate     → HADI hypotheses from the HMW questions (+ six-thinking-hats for team divergence)
4. Prototype  → frontend-design (if the prototype is a digital UI; min 2 iterations)
5. Test       → usability testing (≥5 users) + HADI hypothesis validation
6. Validate   → pilot validation (L/XL tiers) before committing to build
```

The skill's complexity router decides which phases run: S = 1→2→5, M = 1→2→3→4→5,
L/XL = all six.

## When to use it

- Designing a **new product, service, or feature** where the real user need is unclear.
- "Understand users", "product discovery", "build a CJM/JTBD", "prototype and test".

## When NOT to use it

- A well-defined technical task or bug → use `problem-solver-enhanced` / `debug-loop`.
- Pure research with no product intent → use `goap-research-ed25519`.

## Governance

Read `.claude/rules/design-thinking-conventions.md` and
`.claude/shards/design-thinking.shard.md` before starting. Phase outputs land in
`design/<slug>/`. The 12 validation rules (DT-001 … DT-012) live in the skill's own
`scripts/validate-config.json`.

## Checkpoint protocol

The pipeline pauses after each phase with the skill's checkpoint banner
(`STEP N: [Phase Name] Complete` + `Tier:` + a 2-3 line summary + artifact list).
Reply `ок` to continue, `углуби <area>` to elaborate, or give feedback to adjust.
Error-severity gates (DT-002/003/005/008/009/010/011) block phase advancement.

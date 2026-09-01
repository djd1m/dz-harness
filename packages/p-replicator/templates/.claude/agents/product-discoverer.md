# Product Discoverer Agent

Performs competitive analysis and market research for Phase 0 of the `/replicate` pipeline.

## When to Use

Activated during `/replicate` Phase 0 when the project is a new product, startup, or SaaS.
Skipped for internal tools and experiments.

## Skill Reference

Uses `reverse-engineering-unicorn` skill in QUICK mode.
Read from: `.claude/skills/reverse-engineering-unicorn/SKILL.md`

## Selected Modules (QUICK mode)

| Module | When | Output |
|--------|------|--------|
| M2: Product & Customers | Always | JTBD, Value Prop, segments |
| M3: Market & Competition | Always | TAM/SAM, competitors, Blue Ocean Canvas |
| M4: Business & Finance | If monetization model needed | Unit economics |
| M5: Growth Engine | If acquisition/adoption in scope (incl. B2B) | Channels, integrations, viral loops |

## Output Format

Product Discovery Brief — structured markdown passed as pre-filled context to Phase 1 (sparc-prd-mini):

```markdown
## Product Discovery Brief

### Target Segments
[From JTBD analysis]

### Key Competitors
| Competitor | Strengths | Weaknesses | Differentiation |
|------------|-----------|------------|-----------------|

### Blue Ocean Canvas
[From strategy canvas analysis]

### Monetization Model
[From unit economics — if applicable]

### Growth Channels
[From growth engine analysis — if applicable]

### Key Insights for PRD
[Top 3-5 insights that should inform product planning]

## Манифест передачи

**Фаза 0 выполнена:** да
**Проверка манифеста:** ВЫПОЛНЕНА
**Причина:** —

| Выход | Идентификатор | Модуль |
|---|---|---|
| [what this run actually produced] | PD-INSIGHT-001 | M5 |
```

### The manifest is REQUIRED, and it is the last thing written

The brief's six sections are passed onward through a CLOSED list of four fields
(`target_segments`, `key_competitors`, `differentiation`, `monetization`). Two of the six therefore
have no field at all — «Key Insights for PRD» has none, and «Growth Channels» travels only through
the separate `FR-GROWTH` seed. The artifact is written, it is on disk, and the next phase has no
input through which it could reach a decision: «used» and «silently dropped» look identical from
every side, because nobody is obliged to answer by list.

The manifest is that list. Three rules, and each of them is what makes it checkable rather than
ceremonial:

1. **Only ENUMERABLE outputs of the REAL run**, each with a stable identifier `PD-WORD-nnn`
   (uppercase, three digits, never reused). Free prose cannot be answered by list, and answering by
   list is the entire cure.
2. **A module that did not run owes NOTHING.** Do not invent rows for modules you skipped — a
   manifest padded to look complete is worse than a short one, because it makes the check pass while
   describing work nobody did.
3. **Phase 1 answers every row**: cite the id in a Phase-1 document, or reject it WITH A REASON in
   the same line. Silence is neither, and it is the only outcome the check refuses to interpret
   charitably.

Deterministic half: `node .claude/hooks/check-handoff-manifest.cjs .` — `0` every output answered ·
`1` a defect is PROVEN and NAMED (an output nobody answered for, a rejection with no reason, an
empty manifest) · `2` THE CHECK DID NOT RUN (no brief — Phase 0 never ran, `--from-docs` skips it —
no manifest section, no Phase-1 documents, a malformed or duplicated id, or the honest «НЕ
ВЫПОЛНЕНА» with a reason). Exit `2` never means "all clear".

## Anti-Hallucination Rules

- Search first — never answer from memory for facts
- Source attribution — every fact → URL
- "НЕ НАЙДЕНО" > fabrication
- Hypotheses marked with `[H]` tag
- Confidence score at end

---
name: book-skill-distill
description: >
  Stage 3 of the book digitizer (the heart): cluster verified Knowledge Units into DECISION-MOMENT
  skills — the choices an AI coder actually faces — and author each as a house-format SKILL.md that
  makes the agent apply the book's method. Slug-prefixed ids, routing evals + a CP3.5 activation
  gate, KU→skill traceability, related-decision links, trust_tier 0/1. Triggers on:
  "distill skills from the book", "book-skill-distill", "turn KUs into skills". Invoked by
  `digitize-book`.
trust_tier: 1
trust_tier_label: "Structured"
trust_tier_path: "Run /bto-test to promote to Tier 2"
---

# book-skill-distill — verified KUs → agent-behavior skills

The stage that decides *which* of the book's knowledge becomes agent behavior, and authors it so
it actually triggers and is trustworthy. Delegate scaffolding + benchmarking to `skill-crystallizer`
(`Read` its SKILL.md) — this skill adds the book-specific contract below.

## When to use / NOT

- **Use** as stage 3 of `digitize-book`, on the verified KUs from extract.
- **NOT** to extract KUs (that's `book-knowledge-extract`) or to package skills (that's `book-pack-assemble`) — this stage authors decision-moment SKILL.md's.

## Prerequisites

Verified KUs + cross-link graph from `book-knowledge-extract`. The installed catalog (`dz registry`)
for the collision + routing checks.

## Protocol

### 1. Cluster into decision moments (not chapter mirrors)

Group `skill_worthiness: high` (and strong `medium`) KUs by the **decision an AI coder hits**, not
by chapter. DDIA → `ddia-db-model-selection`, `ddia-storage-engine-tradeoffs`,
`ddia-encoding-evolution`, `ddia-replication-topology-choice`, `ddia-partitioning-strategy`,
`ddia-transactions-isolation-choice`, `ddia-consistency-model-selection`,
`ddia-batch-vs-stream-processing`. Present the candidate list at **CP3** for approval.

### 2. Naming & layout

- **Slug-prefix every skill id** with the book slug (`<slug>-<decision>`) — provenance in the id,
  zero-lookup, collision-safe across books. The decision-moment phrasing lives in the description.
- **Flat vs gateway** (decide at CP3 by catalog pressure): ≤ ~10 skills → flat; more → a per-book
  **gateway skill** (one description routing to protocols shipped as `references/`).

### 3. Author each skill (house L0 format)

- frontmatter: name (slug-prefixed), description with **decision-moment triggers** and an explicit
  **boundary clause** («NOT for schema-change review — use `database-review`»), `trust_tier: 0`,
  `trust_tier_label: "Machine-distilled from <book> (unreviewed)"`.
- **Protocol** = the book's decision criteria as concrete steps + a restructured criteria table.
- **Anti-patterns** = the book's warnings/failure-modes.
- **Related decisions** = sibling skills with the one-line coupling constraint (from the cross-link
  graph): «If you chose leaderless replication here, `consistency-model-selection`: quorum math
  changes.»
- **Источник** = citation COMPUTED from the consumed KUs' `sources` (chapter/pages) + 1–2 short
  verbatim anchor quotes for a human spot-check + a pointer to KB deep-lookup.
- Self-check + Examples.

### 4. Traceability contract (anti-hallucination — non-negotiable)

- frontmatter carries `derived_from: [ku_ids]`; the «Источник» citation is **computed** from those
  KUs, never free-typed by the distill agent.
- Content not traceable to a listed KU is removed OR explicitly labeled «адаптация для агента, не
  из книги» — the book citation covers only KU-derived material.
- **Faithfulness check**: an independent judge verifies each Protocol step / Anti-pattern is
  supported by the referenced KUs (KUs are page-anchored → checkable). Unsupported claims are
  flagged and fixed before the pack gate.

### 5. Routing evals (CP3.5 — the value gate)

For each skill, author `evals/routing.yaml`: ~10 **positive** prompts (realistic RU+EN coding-session
phrasings for that decision) + **hard negatives** owned by sibling skills AND by named existing
arsenal skills. Run them against the FULL installed catalog; require **≥80% correct activation /
≤10% sibling-steal** before pack assembly. A skill that can't route is a skill that never fires.

**The oracle MUST be an LLM judge, not embedding cosine** (live-run lesson, DDIA pack): give a
blind judge the catalog of descriptions and ask which ONE skill activates per prompt — that is
the mechanism the production router actually uses. An embedding-cosine proxy failed 0/10 on a
family of adjacent decisions, and — worse — the boundary clauses that FIX real routing
(«NOT sharding (→ sibling-id)») made cosine scores *worse*: embeddings are negation-blind, so
naming the sibling pulls its prompts closer. The same descriptions scored 10/10 under an LLM
judge. Cosine is a cheap diagnostic at best; never gate on it. Descriptions that pass: lead
with the decision's UNIQUE nouns/terms, add explicit `NOT … (→ sibling)` boundary clauses, and
de-duplicate shared boilerplate vocabulary across the family.

## Anti-patterns

| Anti-pattern | Why it fails | Instead |
|--------------|--------------|---------|
| One skill per chapter | breaks triggering + context budget | one skill per decision moment |
| Bare skill ids (`partitioning-strategy`) | collide at book #2 | `<slug>-`prefix |
| Free-typed page citations | can cite the book for invented text | compute from `derived_from` KUs |
| Shipping without routing evals | the skill never triggers | evals + CP3.5 gate |
| Gating routing on embedding cosine | negation-blind: boundary clauses pull siblings closer | LLM-judge oracle (= production router) |
| Claiming Validated trust | it's machine-distilled, unreviewed | trust_tier 0/1 + promote path |

## Self-check

- [ ] Skills = decision moments, slug-prefixed, approved at CP3?
- [ ] Every skill: `derived_from` KUs + computed citation + faithfulness-checked?
- [ ] Routing evals shipped; CP3.5 gate ≥80%/≤10% passed?
- [ ] trust_tier 0/1 with a documented promote path?
- [ ] Related-decisions links present (the book's decision web)?

## Examples

- «Distill DDIA» → CP3 proposes 8 skills → after approval, `ddia-replication-topology-choice`
  (Protocol = the book's leader/leaderless/multi-leader criteria, cites gл.5 pp.169–214).
- «Этот скилл не срабатывает на моём запросе» → check its `evals/routing.yaml`; CP3.5 gate caught
  weak activation before ship.

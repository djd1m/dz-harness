# CP3.5 Routing Gate — ai-apps — **PASSED 17/17** (wave 2, 2026-08-18)

Book: «Building Applications with AI Agents», slug `ai-apps`. Skills under gate: **17** — the 8 from
wave 1 plus the 9 distilled in wave 2 (MEASURED — evidence path:
`books/ai-apps/evals/run-3/results.jsonl`, reproducer
`node books/ai-apps/evals/aggregate.mjs books/ai-apps/evals/run-3`).
Thresholds quoted verbatim from the skill spec `activation >=80%` / `sibling-steal <=10%`
(reproducer: `packages/@dzhechkov/skills-book-digitizer/book-skill-distill/SKILL.md` §5).

> **Provenance of every number below: MEASURED.** `node books/ai-apps/evals/run-routing.mjs <outDir>
> [--catalog …]` writes one JSON line per judged case to `<outDir>/results.jsonl`;
> `node books/ai-apps/evals/aggregate.mjs <outDir>` recomputes every table here from that raw jsonl
> (`<outDir>/report.md` is its captured output). Raw runs: `run-3` (shipping), `run-3-ablated`
> (discrimination probe). The catalog itself is GENERATED, not hand-maintained:
> `node books/ai-apps/evals/build-catalog.mjs [--ablate]` reads each skill's frontmatter description
> and each arsenal skill's `dz info`, so the judge cannot be shown a description the pack does not
> actually ship. The wave-1 report for the 8-skill catalog is preserved in git history.

## What changed since the wave-1 gate

Wave 1 gated 8 skills against a catalog of 8 book skills + 25 arsenal entries and recorded
`activation 100.0% (104/104)` / `sibling-steal 0.0%`. That number was **not** evidence for 17: the
whole risk of a second wave is that catalog density makes interception real. This run re-measures
everything on the full 17-skill catalog, and additionally:

- **The 8 wave-1 descriptions were rewired.** They contained 54 mentions of clusters that were
  "not yet distilled" — text that became FALSE the moment wave 2 landed, and that pointed a judge
  at nothing while a real sibling existed. Every one now names its owning sibling id
  (MEASURED — reproducer: a multiline scan
  `python3 -c "import re,glob; [print(f) for f in glob.glob('books/ai-apps/skills/aiagents-*/SKILL.md') if re.search(r'second[-\s]+wave|not\s+yet\s+distilled', open(f).read(), re.I)]"`
  now prints nothing). **A plain `grep` was not sufficient** — two stale mentions were line-wrapped
  across a newline, and one of those was in a frontmatter `description`, i.e. the single text the
  judge actually reads. That near-miss is recorded here because the reliable check is the multiline
  scan, not `grep`.
- **11 wave-1 `soft_negatives` were promoted to hard negatives.** Each named a cluster that had no
  owner in wave 1 and therefore sat outside the gate arithmetic. Wave 2 gave all 11 an owner, so
  they now score — and they are the sharpest available test of whether the new siblings actually
  took the traffic wave-1 disclaimed.

## Oracle

**LLM judge, cross-family** — the skills were distilled by Opus, so the judge is Codex:
`codex exec -m gpt-5.6-sol` (xhigh), synchronous, `stdin </dev/null`, 240 s kill, one retry.
The judge is **blind**: its only input is the CATALOG of skill *descriptions* (70 entries: the 17
`aiagents-*` skills + 53 arsenal skills named in their NOT-clauses or plausibly adjacent) plus
**one** developer prompt. It never sees a SKILL.md, a file path, or the expected answer, and the
prompt opens with *"Answer directly from this prompt text alone; no commands, no files, no tools."*

**Verdicts are parsed, never synthesised.** A reply without a parseable `ANSWER:` line is not a
verdict: the case is retried once, then marked `NEEDS_FALLBACK`. **Judge fallbacks: 0 / 373 (0%).**
Retries needed: **0 / 373**. Unparseable-but-nonempty replies: **0**. Answers outside the catalog: **0**.

## Case set (373 cases, hand-written, RU + EN)

| Class | N | What it is |
|---|---|---|
| positives | **221** | 13 per skill × 17 — 10 ordinary coding-session phrasings + **3 seam-level** prompts sitting on a sibling boundary |
| hard negatives | **152** | one per NOT-clause naming a REAL catalog skill; the skill under test must NOT win them. Includes the 11 promoted wave-1 softs |
| soft negatives | **0** | every NOT-clause in all 17 descriptions now names an existing owner — nothing is excluded from the arithmetic any more |

Cases for the 9 new skills were written by agents that did **not** author those descriptions, and
were explicitly re-passed to strip prompts that had drifted into paraphrases of a skill's own
`Triggers` line — a case quoting its own description makes the gate vacuous.

## Result — run-3 (shipping run, `gpt-5.6-sol` @ xhigh)

**Overall: activation 97.7% (216/221) vs ≥80%; sibling-steal 1.8% (4/221) vs ≤10%;
arsenal leak 1; hard-negative violations 0/152; fallbacks 0/373.** → **PASS.**

**Iterations of description edits needed to reach PASS: 0.** The descriptions as authored at
distillation, plus the wave-1 rewiring (which was a correctness fix for false text, not a
gate-chasing edit), passed on first measurement. No description was touched after seeing a result,
and no case was softened.

### Activation matrix — every diagonal cell, off-diagonal only where noted

12 of 17 skills are 13/13. The five off-diagonal cells are listed individually below; the full
matrix is in `run-3/report.md`.

| Skill | act | steal (sibling) | leak (arsenal) | neg routed-away | neg exact owner | fallbacks |
|---|---|---|---|---|---|---|
| agent-fit-and-model-choice | 100% (13/13) | 0% | 0 | 100% (7/7) | 7/7 | 0 |
| agent-security | 100% (13/13) | 0% | 0 | 100% (6/6) | 5/6 | 0 |
| agent-ux | 100% (13/13) | 0% | 0 | 100% (11/11) | 11/11 | 0 |
| context-engineering | 92% (12/13) | 0% | 1 | 100% (7/7) | 7/7 | 0 |
| evaluation-design | 100% (13/13) | 0% | 0 | 100% (7/7) | 7/7 | 0 |
| human-in-the-loop | 92% (12/13) | 8% | 0 | 100% (14/14) | 14/14 | 0 |
| improvement-loops | 92% (12/13) | 8% | 0 | 100% (12/12) | 12/12 | 0 |
| knowledge-and-memory | 100% (13/13) | 0% | 0 | 100% (5/5) | 5/5 | 0 |
| learning-strategy | 100% (13/13) | 0% | 0 | 100% (7/7) | 7/7 | 0 |
| multi-agent-infrastructure | 100% (13/13) | 0% | 0 | 100% (12/12) | 12/12 | 0 |
| observability-and-drift | 100% (13/13) | 0% | 0 | 100% (7/7) | 6/7 | 0 |
| orchestration-and-planning | 92% (12/13) | 8% | 0 | 100% (12/12) | 11/12 | 0 |
| org-adoption-and-governance | 92% (12/13) | 8% | 0 | 100% (12/12) | 12/12 | 0 |
| probabilistic-behaviour-checks | 100% (13/13) | 0% | 0 | 100% (11/11) | 11/11 | 0 |
| release-gates-and-rollout | 100% (13/13) | 0% | 0 | 100% (10/10) | 10/10 | 0 |
| single-vs-multi-agent | 100% (13/13) | 0% | 0 | 100% (6/6) | 5/6 | 0 |
| tool-design-and-selection | 100% (13/13) | 0% | 0 | 100% (6/6) | 5/6 | 0 |

No skill falls below 92%; the worst per-skill sibling-steal is 8% (1 case of 13), against a 10% bar.

### Wave-1 regression on the expanded catalog

**104 / 104 wave-1 positives still land on their wave-1 owner** — every one of the 8 shipped skills
holds 13/13 with nine new neighbours in the catalog and its own description rewired. Wave 2's five
misroutes are all in wave-2 skills (112/117).

### The 11 promoted soft→hard negatives — the sharpest test of the new seams

**11 / 11 landed on exactly the new sibling the promotion named; 0 were won by the skill under
test.** These are prompts a wave-1 author wrote as "not mine, and nothing owns it yet"; each now
routes to the wave-2 skill that took the topic. Nothing silently kept traffic it had disclaimed.

### The 5 misroutes, named rather than smoothed over

| case | landed on | assessment |
|---|---|---|
| `context-engineering#pos3` — "диалог разросся, следующий вызов не помещается, что резать и что сворачивать в пересказ" | `context-window-management` | **The case is arguably misfiled, not the description.** That arsenal skill owns the runtime window-pressure playbook, and `aiagents-context-engineering`'s own NOT-clause explicitly cedes it. This is the one arsenal leak. |
| `human-in-the-loop#pos10` — "закрыть ботом всю первую линию поддержки, где граница разумного" | `aiagents-agent-fit-and-model-choice` | Genuinely ambiguous: "should a bot cover all of tier 1" is a scope-of-solution question before it is an escalation question. |
| `improvement-loops#pos2` — "как отличить разовый сбой от системного" | `aiagents-probabilistic-behaviour-checks` | **The judge is right.** The systematic-vs-expected-variation triage tree was deliberately assigned to T09 by the wave-2 seam rule; this case belongs to that sibling. |
| `orchestration-and-planning#pos7` — "half our routing nodes have never been exercised" | `aiagents-evaluation-design` | Coverage of untraversed paths is an evaluation question; defensible. |
| `org-adoption-and-governance#pos10` — "widen the agent's independence step by step before the pilot" | `aiagents-human-in-the-loop` | Graduated autonomy is that sibling's decision; defensible. |

**These were left unedited, deliberately.** The gate passes with margin, four of the five are cases
where the judge's answer is defensible or better than the eval file's, and tuning a case to chase a
green cell is exactly the case-fitting this gate exists to prevent. They are recorded as the honest
residual, and `improvement-loops#pos2` is flagged as a case that should be **re-owned** (moved to
the T09 file) rather than argued with, if anyone revisits these evals.

Five hard negatives routed away from the skill under test but landed on an *adjacent* member of the
family the NOT-clause names, rather than the single id the eval file guessed
(`security-testing` vs `security-audit` ×2, `aiagents-release-gates-and-rollout` vs `canary-watch`,
`qe-iterative-loop` and `continuous-agent-loop` vs `autonomous-loops`). The gate condition — routed
away — is met in all five; the expected-owner column is informational and was not tuned.

## Discrimination probe — is this gate vacuous?

A gate that cannot fail proves nothing, so the same 373 cases were re-run against an **ablated
catalog**: for the 17 book skills, every `… ONLY — NOT X (→ sibling)` boundary chain and the whole
`Triggers (RU+EN):` list were stripped, leaving only the leading topical sentence
(catalog 66 788 B → 32 303 B). Same judge, same cases.

| Run | catalog | activation | sibling-steal | arsenal leak | misroutes | wave-1 positives |
|---|---|---|---|---|---|---|
| run-3 | full | **97.7%** | **1.8%** | 1 | 5 / 221 | 104/104 |
| run-3-ablated | boundary clauses + triggers removed | **91.9%** | **6.3%** | 4 | **18 / 221** | 98/104 |

**This is the headline finding of wave 2, and it reverses wave 1's conclusion.** At 8 skills,
ablation cost 2 points of 104 (1.9%) and the wave-1 report concluded honestly that the boundary
clauses were `cheap insurance… not what is carrying today's 100%` (its words, now **superseded** for
a 17-skill catalog — treat that reading as retracted at this density). At **17** skills the same
ablation costs **13 positives of 221** — activation −5.8 points, sibling-steal ×3.5 (1.8% → 6.3%),
arsenal leak ×4. The NOT-clauses are now **load-bearing**, exactly as the density argument for a
second wave predicted. Ablated sibling-steal (6.3%) is still inside the 10% bar, so the descriptions
remain separable on topic alone at this judge strength — but the margin the boundary clauses buy is
now measurable rather than notional.

The 13 extra misroutes under ablation are concentrated on the seams wave 2 created:
`knowledge-and-memory` → `context-engineering` (×2), `probabilistic-behaviour-checks` →
`human-in-the-loop` (×2) and → `improvement-loops`, `learning-strategy` → `improvement-loops` and →
`tool-design`, `release-gates` → `evaluation-design`, `org-adoption` → `design-thinking`. Every one
of those pairs is named in a NOT-clause in the full catalog — i.e. the clauses are catching the
collisions they were written for.

## Limitations (recorded, not papered over)

1. **Catalog is a curated 70, not the full installed registry** (~300 skills). The 53 arsenal
   entries are every skill named in a NOT-clause plus the plausible adjacent stealers. Steal from an
   unnamed, unrelated skill is untested. A full-registry run would be the stronger test at ~4× the
   judge cost per case.
2. **Arsenal descriptions are truncated to 700 chars**, while the 17 book descriptions run
   ~1800-3000. That asymmetry favours the book skills on the negatives; all 152 still routed away,
   so it did not mask a failure — but the negatives are an easier test than they look. This is
   carried over unchanged from wave 1 so the two runs stay comparable.
3. **Single judge this wave.** Wave 1 ran a second, weaker oracle (`gpt-5.5` @ low) over its 155
   cases and got an identical verdict. That second-oracle run was **not** repeated for the 373-case
   wave-2 set. The PASS therefore rests on one judge family at one strength; a weaker-router
   replication is the obvious next check and is NOT claimed here.
4. `codex exec` runs with workspace access. The judge was instructed not to use tools and no tool
   calls appeared, but blindness is enforced by instruction, not by sandbox.
5. Model ids are account-specific and drift: on this account `gpt-5.6-sol` answers (verified by
   probe at the start of this run). Probe before re-running.
6. **Three positives are known-defensible misroutes** (see the table above) that were left in place.
   Anyone re-running this gate will see them again; they are residual, not regressions.

## Reproduce

```bash
node books/ai-apps/evals/build-catalog.mjs                    # regenerate catalog.md from the shipped descriptions
node books/ai-apps/evals/run-routing.mjs books/ai-apps/evals/run-3 --concurrency 8
node books/ai-apps/evals/aggregate.mjs   books/ai-apps/evals/run-3
# discrimination probe
node books/ai-apps/evals/build-catalog.mjs --ablate
node books/ai-apps/evals/run-routing.mjs books/ai-apps/evals/run-3-ablated \
     --catalog books/ai-apps/evals/catalog-ablated.md --concurrency 6
node books/ai-apps/evals/aggregate.mjs   books/ai-apps/evals/run-3-ablated
```

Artifacts: `books/ai-apps/skills/<skill>/evals/routing.yaml` (cases, ship with the pack),
`books/ai-apps/evals/{catalog.md,catalog-ablated.md,build-catalog.mjs,run-routing.mjs,aggregate.mjs}`,
per-run `results.jsonl` + `report.md` under `books/ai-apps/evals/run-3*`.

## Outcome

Gate **PASSED** → `trust_tier` promoted **0 → 1** on the 9 wave-2 skills; the 8 wave-1 skills keep
tier 1 (label: *"routing evals passed (CP3.5 gate 2026-08-18)"*; Tier 2 still requires human review
against the cited pages). Ready for **CP4 — pack re-assembly** at version 0.2.0.

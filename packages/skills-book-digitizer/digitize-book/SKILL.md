---
name: digitize-book
description: >
  Orchestrator: turn an engineering book/textbook/monograph (PDF, 100–1000+ pages) into an
  INSTALLABLE skill pack whose skills make AI coders (Claude Code, Codex, …) work within the
  book's methodologies at real decision moments — plus a searchable Knowledge Base behind them.
  Drives the pipeline (ingest → extract → distill → pack → index, then an optional promote-to-brain)
  through up to 6 human checkpoints, resumable across sessions. Triggers on: "оцифруй книгу", "digitize this book",
  "сделай скилл-пак из книги", "turn this textbook into skills", "book to skill pack".
trust_tier: 1
trust_tier_label: "Structured"
trust_tier_path: "Run /bto-test to promote to Tier 2"
---

# digitize-book — book → installable methodology pack

Take a book and produce `skills-book-<slug>`: a pack that, once installed via `dz init`, makes the
agent **apply the book's methodologies** when it hits the decisions the book is about (e.g. DDIA →
`ddia-replication-topology-choice`, `ddia-partitioning-strategy`). Design & rationale:
[ADR-001 v2](https://github.com/djd1m/dz-harness-hub/blob/main/features/book-knowledge-digitizer/03_adr/001-book-to-skillpack-pipeline.md).

> **This is an orchestrator.** It sequences the stage-skills and stops at up to six checkpoints for
> your judgment (CP6, promote-to-brain, is optional). It never runs the whole book unattended — book
> digitization is a steered operation, and the panel-confirmed cost is **~2.5–4M agent-tokens per
> 640-page book**.

## When to use / NOT

- **Use** for a legally-obtained engineering book you want your agents to *work by*.
- **NOT** for: summarizing a book (that's not a pack), a scanned book with no text layer *and* no
  OCR available, or republishing the book's text (this produces paraphrased know-how, not the book).

## Prerequisites

- `poppler-utils` (`pdftotext`, `pdfinfo`, `pdfimages`) for ingest.
- For the KB layers: `dz setup --memory agentdb` (installs `agentdb` + `better-sqlite3`).
- The stage skills of this pack installed (they auto-install together):
  `book-ingest`, `book-knowledge-extract`, `book-skill-distill`, `book-pack-assemble`, `book-kb-index`,
  and the optional terminal `book-brain-register` (CP6 promote-to-brain).
- For CP6 promotion into the durable cross-project brain (`~/.dz/brain/`, `DZ_BRAIN_HOME`): the same
  `agentdb` stores (`dz setup --memory agentdb`).

## Pipeline & checkpoints

```
book.pdf ─[book-ingest]─► corpus/ + manifest ─[book-knowledge-extract]─► Knowledge Units (+KU-verify)
   ─[book-skill-distill]─► SKILL.md's ─[book-pack-assemble]─► skills-book-<slug>  ─[book-kb-index]─► KB
        CP1 scope            CP2 sample KUs          CP3 skill list   CP3.5 routing   CP4 pack   CP5 distribute
   ····optional terminal····► ─[book-brain-register]─► ~/.dz/brain   (CP6 promote?)
```

| CP | After | You decide |
|----|-------|-----------|
| **CP1** | ingest | scope (whole book vs chapters), confirm structure_type + skipped front-matter + **detected corpus language** (`--lang <code>` overrides) + **token-cost estimate** |
| **CP2** | 1–2 sample chapters extracted | KU quality — steer the extraction before the bulk map runs (bulk is hard-gated here) |
| **CP3** | distill triage | approve the candidate skill list (decision moments); flat vs gateway layout |
| **CP3.5** | routing evals | the routing gate report (≥80% correct activation / ≤10% sibling-steal) — fix or proceed |
| **CP4** | pack assembled | shingling-gate result (no uncited verbatim run ≥8 words) + L0 report + install smoke (+ Copilot instruction-byte total if that target) |
| **CP5** | pack + KB indexed | distribution: keep `private` (default) or record an explicit publish decision |
| **CP6** | `book-brain-register` | **promote** the book's KUs into the durable **cross-project brain** (`~/.dz/brain/`) — **default: project-local only**; an explicit opt-in, IP-relevant like CP5 (moves book-derived knowledge into a long-lived home). Optional terminal stage |

## Protocol

1. **Resume check** — if `<workspace>/manifest.json` exists, read `phase_state` + per-chunk
   watermarks and continue from the first unfinished phase; else start at ingest. Never re-run a
   completed phase (the manifest is the single source of truth).
2. **Ingest** → invoke `book-ingest`. Relay its summary — including the **detected corpus language**
   (Cyrillic-dominant → Russian, Latin → English); **CP1**. A `--lang <code>` flag overrides the
   detection; thread the resolved language to every `book-knowledge-extract` call so all KUs are
   emitted in that ONE language (no RU/EN mix).
3. **Sample extract** → run `book-knowledge-extract` on 1–2 chapters only; show sample KUs; **CP2**.
4. **Bulk extract + reduce + KU-verify** → the rest of the chapters (parallelizable per chunk),
   dedup/merge at reduce, then the entailment verify pass (verified KUs only proceed).
5. **Distill** → `book-skill-distill` proposes decision-moment skills; **CP3**; then **CP3.5** on
   the routing evals.
6. **Assemble** → `book-pack-assemble`; **CP4**.
7. **Index** → `book-kb-index` loads KUs into the project KB (lexical `books.sqlite` + agentdb vector).
   This always runs — it is the project's KB, independent of any brain decision.
8. **Distribute** → **CP5**; then hand over: `dz init --select <the new skills>` and how to use.
9. **Promote (optional)** → `book-brain-register`: at **CP6**, offer to `dz brain add --project . --source
   <slug>` this book's KUs into the durable **cross-project brain** (`~/.dz/brain/`, `DZ_BRAIN_HOME`).
   **Default is project-local only** — promotion is an explicit, IP-relevant opt-in (like CP5). A
   re-digitized book refreshes non-clobbering via `dz brain update <slug>`; verify with
   `dz brain query "<a KU name>" --source <slug>` + `dz brain primer <slug>`. The brain is private,
   never distributed (§IP). Sibling: repos/dirs take `source-brain-ingest` → the same brain instead.

## `--trusted` mode

After you've approved 2–3 books, `--trusted` makes CP2 an async spot-check; **CP1, CP3, CP5, and CP6
stay interactive** (scope, the skill list, distribution, and brain-promotion are the irreducible
judgment calls). **CP6 is never auto-approved** — promoting book-derived knowledge into the durable
cross-project brain is an IP decision, exactly like CP5, so `--trusted` never green-lights it.

## Anti-patterns

| Anti-pattern | Why it fails | Instead |
|--------------|--------------|---------|
| Run the whole book unattended | 2.5–4M tokens; distill triage is judgment | steer at CP1/CP3 |
| Skip CP2 and bulk-extract first | a bad extraction prompt wastes the whole map | sample first, tune, then bulk |
| Mirror chapters 1:1 as skills | breaks triggering + context | skills = decision moments (CP3) |
| Publish the generated pack by default | it's book-derived; distribution is the owner's | `private` default + CP5 |

## Self-check

- [ ] Resumed from the manifest (no completed phase re-run)?
- [ ] CP1–CP5 honored (scope, samples, skill list, routing gate, distribution)?
- [ ] CP6 honored — brain promotion was an explicit opt-in (default project-local; never auto-approved, even under `--trusted`)?
- [ ] Only verified KUs fed distill; every skill claim traces to a KU?
- [ ] Pack is `private` unless a CP5 decision says otherwise; brain kept private (never distributed)?
- [ ] User got: install command + how the new skills trigger?

## Examples

- «Оцифруй вот эту книгу по распределённым системам — хочу, чтобы агент проектировал по ней» →
  full pipeline → `skills-book-ddia` with ~8 decision-moment skills.
- «Продолжи оцифровку, я вчера остановился на 5 главе» → resume from the manifest watermark.
- «Оцифруй только главы про репликацию и партиционирование» → CP1 scope = chapters 5–6.

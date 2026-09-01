# @dzhechkov/skills-book-digitizer

Turn an engineering **book / textbook / monograph** into an **installable skill pack** whose skills
make AI coders (Claude Code, Codex, …) *work within the book's methodologies* — plus a searchable
Knowledge Base behind them. dz-original; design & rationale in
[ADR-001 v2](https://github.com/djd1m/dz-harness-hub/blob/main/features/book-knowledge-digitizer/03_adr/001-book-to-skillpack-pipeline.md)
(passed a 4-lens adversarial design panel: 28 findings, all folded in).

## What it produces

`book.pdf` → `skills-book-<slug>`: a pack you `dz init --select …` so the agent applies the book's
methods at the decisions it's about — e.g. DDIA → `ddia-replication-topology-choice`,
`ddia-partitioning-strategy`, `ddia-consistency-model-selection`.

## The skills (a checkpointed pipeline + a terminal promote + one sibling)

| Skill | Stage |
|-------|-------|
| `digitize-book` | **Orchestrator** — runs the pipeline through up to 6 human checkpoints (CP6 promote-to-brain optional), resumable across sessions |
| `book-ingest` | PDF → chunked, page-anchored corpus + manifest (deterministic: poppler + heuristics, no LLM) |
| `book-knowledge-extract` | corpus → **verified** Knowledge Units (map-reduce, dedup, KU-verify entailment, FACTS-verbatim/PROSE-paraphrase regime) |
| `book-skill-distill` | verified KUs → **decision-moment** skills (slug-prefixed, routing evals + activation gate, KU→skill traceability) |
| `book-pack-assemble` | skills → installable pack (`references/` deep-lookup + the per-book `brain/<slug>.sqlite` KB slice shipped inside, **private-by-default** distribution, collision gate, Copilot policy) |
| `book-kb-index` | KUs → the memory layer: `.dz/memory/books.sqlite` (lexical) + shared agentdb (vector) |
| `book-brain-register` | **Terminal promote (optional, CP6, ADR §5.1)** — promote this project's KUs into the durable **cross-project brain** (`~/.dz/brain/`) via `dz brain add --project . --source <slug>`. Default project-local only; an explicit, IP-relevant opt-in like CP5. The in-pipeline promote (vs the manual `dz brain add`). |
| `source-brain-ingest` | **Sibling (not a book stage, ADR §6)** — deep-walk a **repo/dir** → the *same* Knowledge Units → the *same* brain via `dz brain add --from-kus … --kind repo`. One brain, two ingest front-ends (books + code). |

## Install & use

```bash
dz init --target claude-code --select digitize-book
# then, in your agent:  «оцифруй вот эту книгу — хочу, чтобы агент проектировал по её методикам»
```

Prerequisites: `poppler-utils` (ingest) and, for the KB, `dz setup --memory agentdb`
(installs `agentdb` + `better-sqlite3`).

## Usage scenarios

The digitizer produces three durable artifacts from one book: (1) an installable **skill pack**, (2) a
per-project **two-store KB** (`book-kb-index` → `.dz/memory/books.sqlite` lexical + shared agentdb
vector), and (3) a promote path into a durable cross-project **Knowledge Brain** (`~/.dz/brain/`).
Full design + the RU version: [ADR-001 Knowledge Brain](https://github.com/djd1m/dz-harness-hub/blob/main/features/book-brain/ADR-001-knowledge-brain.md).

### 1. Digitize a book → skills + KB

The core pipeline. Install the orchestrator, then hand it a PDF; it runs `book-ingest → extract →
distill → assemble → book-kb-index` through 5 human checkpoints (CP1–CP5), plus an optional CP6
`book-brain-register` to promote the book into the cross-project brain (scenario 3).

```bash
dz init --target claude-code --select digitize-book
# then, in your agent:  «оцифруй вот эту книгу — хочу, чтобы агент проектировал по её методикам»
```

Output: a `skills-book-<slug>` pack (decision-moment skills) **and** the two-store KB behind it. Live
run: DDIA → «Высоконагруженные приложения» digitized to **116 Knowledge Units**.

> **Live public example:** [`@dzhechkov/skills-12factor`](https://www.npmjs.com/package/@dzhechkov/skills-12factor)
> — The Twelve-Factor App (CC BY 4.0) digitized into 12 decision-moment skills, published publicly with
> attribution. (A copyrighted book like DDIA instead stays `private` per CP5 — see scenario 5.)

#### Install the generated pack into an agent

The generated pack lives as a local skill-pack directory (`packages/@dzhechkov/skills-book-<slug>`),
version-controlled but — for a copyrighted book — **`private: true`, never published to npm** (CP5 / IP).
Install its skills into any agent with one command (`dz` discovers the local pack; run it in the
target project, wherever the pack/monorepo is available):

```bash
# one or more skills (comma-separated), for any target: claude-code | codex | opencode | hermes | openclaude | copilot
dz init --target claude-code --select ddia-replication-topology-choice,ddia-partitioning-strategy

# the whole pack — list every skill id (dz registry | grep <slug> to see them)
dz init --target claude-code --select <id1>,<id2>,…
```

Writes `SKILL.md` into `.claude/skills/<id>/` (compiled to the target's format); the agent then
activates each on its decision moment. NB: `npx @dzhechkov/skills-book-<slug>` does **not** work for a
private book pack — it's not on npm; install from a machine that has the pack.

#### Make a portable bundle from them

To hand the skills to a generic / LangGraph consumer (self-contained, no `dz` needed downstream):

```bash
dz bundle --select ddia-replication-topology-choice,ddia-partitioning-strategy --out ./ddia-bundle
```

Emits a self-contained `skills/` tree (+ any cross-skill deps, with a warning if one is missing).
Same CP5 rule applies: a copyrighted book's bundle stays owner-controlled — share only under your
licence decision (permissive/public-domain sources can be shared freely).

### 2. Query one book's knowledge

Lexical (FTS5) recall over a single digitized book's KB, in the project that ingested it. `--book`
narrows the search to one book slug:

```bash
dz recall --books --book <slug> "replication topology"
```

Pull-based: you ask, you get KU hits back with source + page anchors. No hook, no injection.

### 3. Build a cross-project brain from N books

Promote each project's digitized-book KUs into **one shared brain** (`~/.dz/brain/` — lexical
`books.sqlite` + vector `agentdb.db`), then query across every ingested book at once. There are two
ways to promote — **in-pipeline** and **manual** — both drive the same `dz brain add`:

- **In-pipeline (preferred): `book-brain-register`** — the optional terminal stage of `digitize-book`,
  gated at **CP6 (promote?)**. After the pack + project KB are built, the orchestrator offers to promote
  the book into the brain; the default is *project-local only* and promotion is an explicit, IP-relevant
  opt-in (like CP5's distribution decision). It runs `dz brain add --project . --source <slug>` for you.
- **Manual:** run the CLI yourself against a project whose book is already indexed.

```bash
dz brain add --project . --source <slug>   # promote this project's KUs into the brain (idempotent)
dz brain list                              # what's in the brain: slug, kind, KU count, corpus version
dz brain query "replication topology"      # cross-source recall over ALL books
dz brain query "replication topology" --source <slug>   # optional: narrow to one book
dz brain update <slug> --project .         # non-clobbering refresh of a re-digitized book
```

One shared store, not per-book packages: you do **not** install anything to query the brain — it
accretes on `dz brain add`. The *right* book surfaces by **relevance** (KUs rank on one common scale,
each hit labelled with its source book + page); `--source` is a label filter, not a manual routing
pick. Cross-source is the default — multiple books scoring on a query is a feature (richer grounding),
not a bug. The brain is **private by default and never distributed** (ADR §8): CP6 promotes a
copyrighted book into your *local* brain only.

### 4. Grounded answering (the hook)

```bash
dz brain init                            # opt-in: wire the grounding UserPromptSubmit hook (once)
dz brain ground "<prompt>"               # what the hook runs: retrieve + emit citations (or nothing)
```

`dz brain init` (opt-in) wires a single `UserPromptSubmit` hook that runs `dz brain ground` on each
prompt. On a *relevant* prompt (relevance-gated, so it stays quiet on unrelated turns) the hook
mechanically retrieves top-K brain KUs and injects them — with source + page citations — into that
turn's context, so the agent answers **from the book, not from training data**. Off by default; a
prompt with no lexical overlap (e.g. "what's the weather") injects nothing.

Honesty boundary: the injection is **mechanical** (the hook forces the grounding block into context and
the agent literally cannot start the turn without it); "answering from it" is **agent discipline** — the
hook can force the context but not the completion. The hook is **generic and wired once** (one hook over
the whole brain across all sources — *not* per book), and needs **no edits to `CLAUDE.md` or governance
shards** — the injection channel is the hook's stdout (`hookSpecificOutput.additionalContext`).

### 5. Sharing a digitized book

The `skills-book-<slug>` **pack** (via GitHub / `npx`) carries the behavior — the decision-moment
skills and `references/` deep-lookup. The design (ADR §8.1, P2) also ships the book's **KB slice inside
the pack** under the same CP5 licence decision that gates the pack itself: copyrighted books stay
`private: true` (structural, mechanically enforced — no auto-publish, no preset entry), permissive
sources are publishable. Your whole personal **brain is never published** — it is a local accretion you
back up, not a distributable.

### 6. Как пользоваться оцифрованной книгой (consuming a digitized book)

Digitizing is half the loop. Four ways to make the book's methodology actually shape your work,
from one-off to standing. Vocabulary, once: a **KU** (Knowledge Unit) is one page-anchored piece of
the book's know-how; a **kuId** is its stable id (e.g. `ai-apps-ch09-p238-ku05`); the **slug** is
the short name the book got at digitization (e.g. `ai-apps`); **CP6** is the pipeline's final
checkpoint, where you optionally promote a book from the project KB into the machine-wide brain.

Prerequisites for everything below: `dz` installed, the book digitized (scenario 1), and — for the
`dz brain` commands — the book promoted into the brain (CP6 approved, or a manual
`dz brain add --project <ingesting-project> --source <slug>`). `dz brain list` shows what made it in.

**M1 — one answer, grounded (chat).** Ask with «обоснуй по книге <slug>», or pull manually:

```bash
dz brain query "evaluation metrics for language agents" --source ai-apps
dz brain expand ai-apps-ch09-p238-ku05        # one KU's full stored content
dz brain ground "how should I eval my agent?" --source ai-apps --budget 800 --text
```

`query` returns ranked KU hits with source + page anchors; `expand` dereferences one kuId to that
KU's full stored record (name, problem, content, page anchors); `ground --budget N --text` prints a
ready-to-paste grounding block with the top KUs inlined within ~N tokens (per `dz brain --help`).
Where the kuId comes from: the plain `query` output prints citations *without* ids — take it from
`dz brain query … --json` (`hits[].kuId`) or from the `ground --text` block, where every `[Kn]`
line carries its kuId as the first field.

**M2 — one pipeline run.** Put the obligation in the run's task description itself, e.g.:

> Дизайн обязан свериться с ai-apps через `dz brain query`; ключевые решения цитируют kuId;
> расхождение с книгой допустимо только с названной причиной.

No setup; the obligation travels inside the brief, so it works in any pipeline whose agent reads
the brief and can run shell commands — and it holds for that run only.

**M3 — whole project, while the hook stays installed.** Wire the opt-in grounding hook once
(Claude Code projects — the hook lands in that project's `.claude/settings.json`):

```bash
dz brain init --project <dir> --k 5
```

Prompts with enough lexical overlap with the brain then get top-K KUs (with citations) injected
mechanically before the agent answers — scenario 4 above is this same hook, including its honesty
boundary (the hook forces the context, not the completion). Off by default. To disarm: remove the
`hooks.UserPromptSubmit` entry whose command contains `brain ground` from that project's
`.claude/settings.json`.

**M4 — one pipeline, standing.** Add a stage-gate line to the rules/instructions file that
pipeline actually loads — for Claude Code e.g. `.claude/rules/<pipeline>.md`; other harnesses have
their own equivalent (`AGENTS.md`, a system-prompt file): "the design stage passes only if it cites
`dz brain query` results (kuIds) or names the reason it diverges." No hook install; scoped to one
workflow, persisted in that pipeline's rules file.

**The two-store trap (will cost you a 0-hit session).** There are TWO stores:
`dz brain query|ground|expand` read the **machine-wide brain** (`~/.dz/brain` — only what was
promoted at CP6 / `dz brain add`), while

```bash
dz recall --books --book <slug> "<question>"
```

reads the **project-local** book KB (`.dz/memory/books.sqlite` — only books digitized in THIS
project). Querying the wrong store answers `0 KU hit(s)` and exits 0 — no error names the mistake.
Rule of thumb: cross-project answers → `brain`; inside the ingesting project → `recall --books`.
In doubt, `dz brain list` names what the brain actually holds.

**Worked example.** You digitized "AI Apps" as slug `ai-apps` and want a feature pipeline to design
evals by the book: (1) `dz brain list` — confirm `ai-apps` is there (if not, promote as above);
(2) start the pipeline the way you normally do — the launch syntax is your pipeline's own — with
the M2 obligation line pasted into its task description; (3) the design stage runs
`dz brain query "evaluation metrics for language agents" --source ai-apps`, cites e.g.
`[ai-apps гл.9 с.239]` (semantic-similarity metrics over exact match), and expands
`ai-apps-ch09-p238-ku05` for the full text; (4) if this becomes routine, promote M2 → M4 (a rules
line) or M3 (the hook).

## Design guarantees — structural vs. protocol (stated honestly)

Two kinds of guarantee, and the difference matters:

- **Structural (mechanically enforced by code/packaging):** generated packs ship `private: true` +
  restricted `publishConfig` and get **no automatic preset entry** — a book-derived pack cannot be
  auto-published; distribution is your explicit CP5 decision. `files[]` whitelist + no-`origin`
  `sources.json`. The ingest is deterministic. The book KB is a separate namespace (book KUs never
  pollute `dz recommend`). The **word-shingling verbatim-check is now a shipped deterministic gate**
  (`scripts/shingling-check.mjs`) run at pack assembly: any uncited verbatim run ≥8 words fails the
  pack (cited ≤25-word quotes with a page anchor are exempt) — the paraphrase rule is mechanically
  enforced, no longer merely agent-enforced.
- **Protocol (agent-enforced, fail-open — NOT mechanically proven):** KU provenance is
  *agent-verified* (an entailment pass re-reads the cited pages) but not cryptographically proven;
  the FACTS-verbatim / PROSE-paraphrase fidelity regime and the KU→skill traceability are
  discipline the distill/extract agents follow. Generated skills therefore ship at **`trust_tier`
  0/1 ("machine-distilled, unreviewed")** with a documented promote path (human review against the
  cited pages, or passing the routing evals).

- **Honest cost** — a 640-page book ≈ 2.5–4M agent-tokens end-to-end; the orchestrator shows the
  estimate at CP1 and hard-gates the bulk map behind your sample review at CP2.

## Provenance

dz-original (ADR-001). Delegates by reference to `skill-crystallizer` (skill scaffolding/benchmark)
and `knowledge-extractor` (quality-gate discipline) — see `sources.json`.

## License

MIT © dzhechko.

## Keyword-конвенция для оцифрованных паков (2026-08-25)

Каждый пак, произведённый этим дигитайзером, несёт в `package.json → keywords`:
- **`dz-digitized`** — общий тег: «получено конвейером дигитайзера» (книга, статья, веб-манифест).
- **`digitized-monograph`** — подтег ТОЛЬКО для книг/монографий (не для веб-источников вроде 12factor).

Поиск: `npm search keywords:digitized-monograph` (все оцифрованные книги),
`npm search keywords:dz-digitized` (всё, что произвёл дигитайзер). В реестре — `dz registry --category knowledge`.

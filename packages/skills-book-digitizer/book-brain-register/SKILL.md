---
name: book-brain-register
description: >
  Optional TERMINAL stage of the book digitizer (ADR-001 §5.1): after book-kb-index has loaded this
  project's verified Knowledge Units into the project-local KB, PROMOTE them into the durable,
  cross-project Knowledge Brain (`~/.dz/brain/`, `DZ_BRAIN_HOME`) via `dz brain add --project . --source
  <slug>` — so the book's know-how is recallable in OTHER projects, not just the one that ingested it.
  Gated at CP6 (promote?): default is project-local only; promotion is an explicit, IP-relevant
  decision. Non-clobbering (upsert on (book, ku_id, corpus_version); refresh via `dz brain update`).
  Triggers on: "promote the book into the brain", "book-brain-register", "dz brain add this book",
  "add this digitized book to my knowledge brain". Invoked by `digitize-book` at CP6.
trust_tier: 1
trust_tier_label: "Structured"
trust_tier_path: "Run /bto-test to promote to Tier 2"
---

# book-brain-register — promote a digitized book into the durable brain

The **terminal** stage, after `book-kb-index`. `book-kb-index` owns the **project** stores (the
source of truth for the pack — it always runs). This stage does one more, **optional** thing: it
**promotes** this project's verified KUs into the **durable cross-project brain** at `~/.dz/brain/`
(override `DZ_BRAIN_HOME`) so the book's know-how is considered *later, in other projects* — not just
the one that digitized it. It does not re-extract, re-index the project KB, or reimplement mirroring:
it drives the already-built `dz brain add`, which mirrors both stores (lexical + vector), writes the
registry entry, and generates the primer card.

## When to use / NOT

- **Use** as the OPTIONAL final stage of `digitize-book`, at **CP6**, when the owner wants this book's
  knowledge available across all their projects (the durable `~/.dz/brain/`).
- **NOT** to build the project KB — that is `book-kb-index`, which still runs regardless of CP6. This
  stage promotes an *already-indexed* project's KUs upward; it is additive and opt-in.
- **NOT for repos/dirs** → those take the SIBLING path `source-brain-ingest` (deep-walk → same KU
  shape → `dz brain add --from-kus … --kind repo --license <spdx>`, ADR §6). Same brain, different
  front-end. This stage is the **book** path.
- **NOT** to publish or share the brain — the brain is **private by default and never distributed**
  (ADR §8). A copyrighted book's promotion stays local; the shareable unit is the per-book KB slice
  riding inside the `skills-book-<slug>` pack under the CP5 licence decision (that's `book-pack-assemble`).

## Prerequisites

- `book-kb-index` has run: this project's verified KUs are in the project-local stores
  (`.dz/memory/books.sqlite` + `.dz/agentdb.db`) with a settled `corpus_version`.
- The brain stores (`dz setup --memory agentdb`) — the same `agentdb` + `better-sqlite3` primitives,
  the `dz brain add` command just points `dbPath` at the brain home instead of the project.
- A **CP6 promote decision** from the owner (see the checkpoint below) — this stage does nothing
  without it; default is project-local only.

## Protocol

1. **CP6 (promote?)** — offer promotion explicitly. DEFAULT is *project-local only* (do nothing): the
   book's KB already exists in this project. Promotion moves book-derived knowledge into a long-lived,
   cross-project location, so — like CP5's distribution decision — it is an IP-relevant call the owner
   makes deliberately, never auto-approved. If the owner declines, stop here (the project KB stands).
2. **Promote** — on an explicit yes, drive the existing CLI (do NOT reimplement the mirroring):
   ```bash
   dz brain add --project . --source <slug>
   ```
   This resolves the brain home (`DZ_BRAIN_HOME` → `~/.dz/brain/`, created if absent), reads this
   project's verified KUs for `<slug>`, and **idempotently upserts** them into BOTH brain stores
   (lexical `books.sqlite` + vector `agentdb.db`) keyed on `(book, ku_id, corpus_version)`, then writes
   the `brain.json` registry entry (slug, kind `book`, isbn/license, corpus_version, ku_count, lang,
   primer path, added_ts) and generates `primers/<slug>.md`. All reused primitives — nothing new here.
3. **Non-clobbering by construction** — the upsert evicts stale-corpus rows for **this source only**;
   adding this book never touches other sources already in the brain. A re-digitized / updated book
   does NOT duplicate: refresh it with
   ```bash
   dz brain update <slug> --project .
   ```
   which re-mirrors this source at its new `corpus_version` (stale-corpus rows evicted, other sources
   left intact). Never `dz brain add` a second time hoping to "append" — the refresh verb is the path.
4. **Verify** — confirm the promotion landed in the brain, labeled from the brain (not the project):
   ```bash
   dz brain query "<a KU name>" --source <slug>     # returns the KU, labeled with its source book + page
   dz brain primer <slug>                            # shows the capability card (synopsis + KU-type histogram)
   ```
   Also `dz brain list` should show the source with its ku_count and corpus_version.

## Anti-patterns

| Anti-pattern | Why it fails | Instead |
|--------------|--------------|---------|
| Promoting by default / auto-approving CP6 | moves book-derived IP into a durable cross-project home silently | CP6 is explicit, owner-decided, like CP5 |
| Skipping `book-kb-index` and promoting straight to the brain | there are no settled project KUs to mirror; provenance/corpus_version unset | index the project first; promote after |
| Re-running `dz brain add` to update a book | INSERT path can leave stale-corpus rows | `dz brain update <slug>` (eviction + upsert) |
| Reimplementing the store mirroring in this skill | the CLI already mirrors lexical+vector, writes the registry, builds the primer | drive `dz brain add` — reuse, don't rebuild |
| Routing a repo/dir through this stage | book path assumes book KUs + slug provenance | sibling `source-brain-ingest` → `dz brain add --from-kus … --kind repo --license` |
| Treating the brain as publishable | the accreted personal brain is private, never distributed (§8) | share the per-book pack slice (CP5), not the brain |

## Self-check

- [ ] `book-kb-index` ran first; this project's verified KUs + corpus_version are settled?
- [ ] CP6 honored — an EXPLICIT owner promote decision (never auto-approved), default project-local?
- [ ] Promoted via `dz brain add --project . --source <slug>` (reused CLI; both brain stores mirrored, registry + primer written)?
- [ ] Non-clobbering: upsert on (book, ku_id, corpus_version); a re-run uses `dz brain update <slug>`, not a second add?
- [ ] Verified: `dz brain query "<KU>" --source <slug>` returns it labeled from the brain; `dz brain primer <slug>` shows the card?
- [ ] Brain kept private (never distributed); a copyrighted book's promotion stays local?

## Examples

- «Оцифровал DDIA, теперь хочу, чтобы эти знания были доступны и в других проектах» → at CP6 the owner
  says promote → `dz brain add --project . --source ddia` → 116 KU mirrored into `~/.dz/brain/`;
  `dz brain query "репликация" --source ddia` returns them labeled from the brain; `dz brain primer ddia`
  shows the card. In a later project, `dz brain query` recalls DDIA KUs with no re-ingest.
- «Обновил книгу, переоцифровал — не хочу дублей в brain» → `dz brain update ddia --project .` re-mirrors
  the new corpus_version, evicting stale rows for ddia only; other sources untouched.
- «Промоутить только КБ, пак не публиковать» → CP6 (brain) and CP5 (pack distribution) are separate
  decisions: promote to the private brain, keep the pack `private: true`.

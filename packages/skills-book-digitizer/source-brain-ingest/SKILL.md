---
name: source-brain-ingest
description: >
  The repo/dir SIBLING of the book pipeline (ADR-001 §6): deep-walk a codebase or directory
  (respect .gitignore, skip binaries/node_modules/dist, cap size), then distill DECISION-GRADE
  Knowledge Units in the SAME BookKU shape the book pipeline emits — and feed them into the SAME
  shared brain register via `dz brain add --from-kus`, WITHOUT the book-only stages (no pdftotext
  ingest, no skill distillation). Same KU schema = free reuse of the whole brain (query, primer,
  grounding). Records the source's SPDX license and gates on it. Triggers on: "ingest a repo into
  the brain", "source-brain-ingest", "add this codebase to my knowledge brain".
trust_tier: 1
trust_tier_label: "Structured"
trust_tier_path: "Run /bto-test to promote to Tier 2"
---

# source-brain-ingest — repo/dir → brain KUs (the non-book front-end)

One brain, **two ingest front-ends** (ADR §6): the book pipeline turns PDFs into KUs; this turns a
**repo or directory** into KUs — the *same* KU shape, the *same* register stage, the *same* query /
primer / grounding surface. A repo plugs into everything the book path already built, for free. This
is a **sibling** skill — it does not touch, and must not contort, the intact book pipeline.

## When to use / NOT

- **Use** to distill a codebase/dir into decision-grade Knowledge Units and promote them into the
  durable brain (`~/.dz/brain/`) so `dz brain query` / primers / the grounding hook cover repos too.
- **NOT for books/PDFs** → use `digitize-book` (pdftotext ingest is book-shaped and would be
  contorted by repo logic; keeping it pure protects the proven book path).
- **NOT to author skills** → that's `book-skill-distill`. This stage emits KUs into the brain only;
  it does not produce a `skills-<slug>` pack (repos may later return whole files, §8/G5, where books
  return distilled KUs for IP reasons).
- **NOT to extract/verify book KUs** → that's `book-knowledge-extract`.

## Prerequisites

- A local repo or directory (a checkout, or a `git clone` you control).
- `git` (to honour `.gitignore` and capture the commit for provenance) — degrade gracefully on a
  non-git dir (walk the tree; `commit: null`).
- The brain stores (`dz setup --memory agentdb`) — the same `~/.dz/brain/` the book path promotes into.
- The source's **SPDX license identifier** (read `LICENSE`/`package.json`; pass `--license <spdx>`).

## The Knowledge Unit schema (identical to the book pipeline — that's the whole point)

Emit the **same BookKU shape** `book-knowledge-extract` emits, so a repo is just another `source`:

```yaml
id: <repo-slug>-<path-hash>-kuNN   # GLOBALLY UNIQUE: <path-hash> discriminates the file/chunk
                                   # (short hash of the repo-relative path) so two files never
                                   # collide on kuNN — the brain upsert keys on (source, ku_id,
                                   # corpus_version) and silently drops id collisions otherwise.
type: methodology | decision-framework | formula | heuristic | checklist |
      tradeoff-table | case-pattern | definition
name: "Retry-with-jitter backoff policy"
problem: the decision/task this knowledge serves (when/why it applies)
content: the paraphrased procedure / framework / restructured table / verbatim signature-or-formula
applicability: preconditions, scale ranges, contexts where it holds
limits: tradeoffs, failure modes, when NOT to apply
chapter: src/net/backoff.ts        # PATH takes the book's `chapter` slot
pages: [40, 88]                    # LINE-RANGE takes the book's `pages` slot
sources: [{ repo: <repo-slug>, path: src/net/backoff.ts, lines: [40, 88], commit: <sha> }]
metadata: { license: <spdx>, corpus_version: <sha-or-ts>, lang: <detected> }
verified: true | false | partial   # entailment against the cited lines
```

Because the shape is identical, the brain treats books and repos on one common scale (query, primer,
grounding all work unchanged). `kind: repo` in the registry lets the brain treat repos **distinctly**
where it matters (e.g. return whole files, §8/G5) without a second schema.

## Protocol

1. **Walk** — deep-walk the repo/dir. **Respect `.gitignore`** (use `git ls-files` when it's a git
   repo — free `.gitignore` honouring + tracked-only). **Skip** `node_modules/`, `dist/`, `build/`,
   `.git/`, vendored trees, lockfiles, and **binaries** (detect by extension + a NUL-byte sniff).
   **Cap** per-file size (skip/point at oversized generated files) and total bytes scanned; log what
   was skipped so coverage is honest.
2. **Chunk** — split each kept file into page-analogue units (a function/class/section, or a
   line-window for prose docs). Anchor every chunk to `path` + `[startLine–endLine]` — the analogue
   of the book's `[p.N]` anchor; these anchors make the verify step a cheap lookup.
3. **Distill KUs** — emit **decision-grade** Knowledge Units in the schema above (a decision the code
   encodes, a policy, a tradeoff, a reusable pattern) — NOT a file summary. **Fidelity regime** (same
   as the book path): FACTS (signatures, constants, config values, exact code) **verbatim** with a
   `path:line` anchor; PROSE (rationale, README narrative) **paraphrased** — no uncited verbatim run
   ≥ 8 words (this is what a downstream shingling gate checks). Then a fresh checker re-opens each
   KU's cited `path:line` range and sets `verified` (entailment gate; verify all, lookup ≪ generation).
4. **License-check (the IP gate)** — record the source's SPDX license in every KU's `metadata.license`
   and in what you pass to the register. The register **refuses** an unknown / incompatible license
   without an explicit `--override` — so an unlicensed or GPL-incompatible repo cannot silently land
   in the brain. Repo license travels with the KUs; if the brain ever returns whole files (§8/G5),
   that license binds any downstream reuse.
5. **Promote** — write the verified KUs to a JSON file in the BookKU shape and hand them to the SAME
   register the book path uses:
   ```bash
   dz brain add --from-kus <file.json> --slug <repo-slug> --kind repo --license <spdx>
   ```
   This idempotently upserts on `(source, ku_id, corpus_version)` into `~/.dz/brain/` (lexical
   `books.sqlite` + vector `agentdb.db`), writes the `brain.json` registry entry (`kind: repo`,
   license, corpus_version, ku_count), and generates the primer — **no book-ingest, no
   book-skill-distill in the path**. Verify: `dz brain query "<a KU name>"` returns it labeled with
   the repo source.

## Anti-patterns

| Anti-pattern | Why it fails | Instead |
|--------------|--------------|---------|
| Inventing a repo-specific KU schema | breaks the shared brain (query/primer/grounding assume one shape) | emit the exact BookKU schema — path→chapter, lines→pages |
| Ignoring `.gitignore` / walking `node_modules` | ingests junk + secrets, blows the token budget | `git ls-files`; skip binaries/vendored/dist; cap size |
| `kuNN` id without a path discriminator | two files collide → upsert-by-id drops KUs | `<repo-slug>-<path-hash>-kuNN` |
| Routing a repo through `book-ingest`/`digitize-book` | pdftotext + book stages don't fit code | this sibling → `dz brain add --from-kus` |
| Distilling repo KUs into a skill pack | that's the book path's job; repos may return whole files (§8) | KUs into the brain only |
| Promoting an unknown/incompatible license | leaks IP-encumbered code into the durable brain | license-check gate; `--override` is an explicit decision |
| File-summary "KUs" | RAG noise, not decisions | decision-grade KUs (policy/tradeoff/pattern) |

## Self-check

- [ ] Walk respected `.gitignore`, skipped binaries/`node_modules`/`dist`, capped size — skips logged?
- [ ] Every KU in the BookKU schema (id `<repo-slug>-<path-hash>-kuNN`; path→chapter; lines→pages; `sources` carry repo+path+commit)?
- [ ] FACTS verbatim + `path:line`, PROSE paraphrased (no uncited ≥8-word run); all KUs entailment-verified?
- [ ] Source SPDX license recorded in `metadata.license`; license-check gate passed (or explicit `--override`)?
- [ ] Promoted via `dz brain add --from-kus … --kind repo --license <spdx>` (NOT book-ingest/distill); registry shows `kind: repo`; `dz brain query` returns a KU labeled with the repo?

## Examples

- «Add this backoff library to my brain» → deep-walk → KUs like `retry-lib-a1b2c3-ku02`
  (decision-framework «Retry-with-jitter backoff policy», `src/net/backoff.ts:40–88`, verified,
  license MIT) → `dz brain add --from-kus retry-lib.kus.json --slug retry-lib --kind repo --license MIT`.
- «Почему этот репозиторий не попал в brain?» → license unknown → the register refused it; re-run with
  a recorded `--override` decision, or add a `LICENSE`.
- «Ground my design questions on our infra repo AND the DDIA book» → both are just `source`s in the one
  brain; `dz brain query "replication topology"` ranks KUs from both, each labeled with its source.

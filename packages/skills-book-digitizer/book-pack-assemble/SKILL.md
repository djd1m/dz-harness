---
name: book-pack-assemble
description: >
  Stage 4 of the book digitizer: assemble the distilled skills into an installable pack
  skills-book-<slug> (ADR-0001 library layout) — files[] whitelist, references/ deep-lookup
  shipped INSIDE the pack, private-by-default distribution + CP5 decision, catalog-collision gate,
  Copilot lean-body policy, no-origin sources.json (upstream_type: book), L0 benchmark + install
  smoke. Triggers on: "assemble the book pack", "book-pack-assemble", "build skills-book-<slug>".
  Invoked by `digitize-book`.
trust_tier: 1
trust_tier_label: "Structured"
trust_tier_path: "Run /bto-test to promote to Tier 2"
---

# book-pack-assemble — skills → installable pack

Package the distilled skills so `dz init --select …` drops the book's methodology into any of the
6 targets — with the distribution and quality guardrails the panel demanded.

## When to use / NOT

- **Use** as stage 4 of `digitize-book`, once skills are distilled and routing-gated.
- **NOT** to author skills (that's `book-skill-distill`) or to index the KB (that's `book-kb-index`) — this stage builds the installable pack.

## Prerequisites

Distilled skills + their KUs + routing evals from `book-skill-distill`. `dz benchmark` for the gate.

## Protocol

1. **Scaffold `skills-book-<slug>/`** (ADR-0001 library layout — skill dirs at pack root):
   ```
   skills-book-<slug>/
     <slug>-<decision>/SKILL.md
     <slug>-<decision>/references/*.md      ← the deep-lookup, shipped IN the pack
     <slug>-<decision>/evals/routing.yaml
     brain/<slug>.sqlite                    ← the per-book KB slice, shipped IN the pack (step 9)
     package.json  sources.json  README.md  LICENSE
   ```
2. **`references/` ships the deep-lookup inside the pack** — each skill's consumed KUs in full
   (+ condensed chapter extracts, size permitting). So «см. источник» is a file read that works on
   every target/machine, not a call to a KB the recipient doesn't have. `sources.json` declares
   which lookup tiers exist per skill: `references/` = always, corpus = owner-local, agentdb =
   owner-local — the skill degrades honestly.
3. **`files[]` whitelist** every skill dir + `references`/`evals` + `brain/` (the KB slice, step 9) +
   `sources.json` + `README.md` + `LICENSE` (forget one → npm silently drops it). Verify the tarball after.
3b. **README MUST include a "Usage scenarios" section (MANDATORY), leading with the SIMPLEST usage.**
   The section MUST **open with the easiest path a non-expert can actually follow** — NOT a giant
   `--select id,id,id,…` list (nobody types 12 ids). Lead with: (1) install the WHOLE pack in ONE
   command — `dz install <npm-pkg> --target claude-code` for a published pack (or, for a private/local
   pack, `dz init --target claude-code --select <ids>` noting it installs all), then (2) **just describe
   the task to Claude Code in plain language** — e.g. «используй нужные скиллы из набора <slug> для
   решения задачи: <описание>» — and the agent **auto-selects** the right skills (routing-gated); the
   user never types skill ids. THEN author **3–6 of the most likely, most useful scenarios**, each as a
   titled subsection with: (a) a concrete *situation*, (b) a **real natural-language example prompt**
   (RU+EN) the user types to their agent (the prompt is the primary action — the pack is already
   installed), (c) **which skills fire and what the agent does** (the concrete outcome). Keep the
   granular `dz init --select <one-id>` only as an optional "just this one decision" advanced note.
   Ground scenarios in the BOOK's actual decisions (audit/refactor, greenfield design, a
   decision-at-a-moment, onboarding/teaching-the-why, a domain workflow). This turns "N skills" into
   "here's the easy way to use them"; a pack README without it is incomplete.
4. **`package.json` distribution guardrails (structural, not policy):**
   `"private": true` + `"publishConfig": { "access": "restricted" }`. **No automatic
   `harness-presets` entry** (presets are the public install surface). Flipping to publishable
   requires the recorded **CP5** decision (a `--allow-publish` step) written into `sources.json`
   (`distribution`, `decided_by`, `date`). The gate FAILS if `private` is absent without a recorded
   decision.
5. **`sources.json`** — documentation-only form, **NO `origin` block, ever** (the book is the
   immutable upstream; `dz sync-upstream` intentionally skips book packs). Per skill: `upstream_type:
   "book"`, isbn/title/edition, `derived_from` KU ids, verified-KU ratio, digitizer version,
   extraction model, date. Declare the cross-pack deps (`skill-crystallizer`, `knowledge-extractor`)
   so `dz bundle`'s cross-skill-dep warning fires honestly.
6. **Catalog-collision gate**: embed the new descriptions + all installed descriptions, flag
   high-similarity pairs, require each resolved (differentiated description or explicit «NOT for X —
   use Y» boundary clause). Also run the plain uniqueness check against `dz registry` (belt +
   suspenders over slug-prefixing).
7. **Copilot policy**: keep SKILL.md bodies lean (trigger + protocol skeleton); big
   criteria/tradeoff tables live in `references/*.md`. README carries a Copilot note («always-on
   there — install a subset»). At CP4 with `target=copilot`, surface the aggregate instruction-file
   byte count.
8. **Gate + smoke**: first the **shingling gate** —
   `node <pack>/scripts/shingling-check.mjs --source <corpus> --output <pack>` (`--shingle 8`).
   ANY uncited verbatim run ≥8 words FAILS the pack (IP violation) — fix the offending KU
   (re-paraphrase) and re-run. Cited ≤25-word quotes with a page anchor are exempt. Only once it
   passes: `dz benchmark <pack> --all` (honest L0 grade per skill — never fabricate schemas/evals to
   game it) → `dz init --target claude-code --select <skills>` install smoke → **CP4** report.
9. **Ship the per-book KB slice inside the pack (ADR §8.1)** — once skills + `references/` are
   assembled, export the book's KUs as a standalone slice:
   `dz brain export --source <slug> --out brain/<slug>.sqlite` (this book's rows only —
   `WHERE book=<slug>`, **lexical-only** for portability — the recipient's `dz brain add --from-pack`
   re-embeds the vectors into their own brain on import). Whitelist `brain/` in `files[]` (step 3)
   and pass the slice **through the same shingling IP gate** (step 8) as the rest of the pack — a
   verbatim leak in the KB slice fails the pack just like one in a SKILL.md. The slice rides the pack
   under the **same CP5 licence decision**: a copyrighted book stays `private: true` (slice never
   auto-published); a permissive source is publishable (slice ships). A recipient loads it with
   `dz brain add --from-pack @dzhechkov/skills-book-<slug>` — an idempotent upsert on
   `(book, ku_id, corpus_version)` into their `~/.dz/brain/` — so one `npx`/github install carries
   BOTH the behavior (skills) AND the knowledge (the brain slice), inseparably, under one decision.
   Document the `--from-pack` load in the pack README.

## Anti-patterns

| Anti-pattern | Why it fails | Instead |
|--------------|--------------|---------|
| Referencing an agentdb KB the recipient lacks | broken deep-lookup on their machine | ship `references/` in the pack |
| `private` absent / auto public publish | book-derived pack leaks | structural `private:true` + CP5 |
| Forgetting a skill dir in `files[]` | npm silently drops it | whitelist + verify tarball |
| `origin` block in sources.json | sync-upstream would chase a non-repo | documentation-only, no origin |
| Fat SKILL.md bodies on Copilot | floods every request | lean body + `references/` |
| Shipping a pack without the shingling gate | uncited verbatim runs = IP violation | run `shingling-check.mjs` before the L0 benchmark; re-paraphrase any hit |
| Publishing the KB slice separately from the pack's CP5 decision | book knowledge leaks out from under the licence gate | slice rides the pack: `private` book → private slice, permissive → publishable |
| KB slice skipping the shingling gate | a verbatim leak in the slice = same IP violation | pass `brain/<slug>.sqlite` through the shingling gate like the rest of the pack |

## Self-check

- [ ] `files[]` whitelists every dir; tarball verified?
- [ ] **README has a "Usage scenarios" section — 3–6 real situations, each with an example prompt, which skills fire, and the install command?**
- [ ] `references/` deep-lookup ships inside the pack; tiers declared in sources.json?
- [ ] `private:true` + restricted; no auto preset; CP5 recorded if publishing?
- [ ] Collision gate clean; slug-prefixed unique ids?
- [ ] Faithfulness gate run (each shipped skill's claims supported by its `derived_from` KUs)?
- [ ] Shingling gate passed (no uncited verbatim run ≥8 words; cited ≤25-word quotes anchored)?
- [ ] KB slice `brain/<slug>.sqlite` exported, whitelisted in `files[]`, passed the shingling gate, and follows the pack's CP5 licence (private book → private slice); `--from-pack` load documented in README?
- [ ] L0 grades honest; install smoke passed; Copilot bytes shown if relevant?

## Examples

- «Assemble the DDIA pack» → `skills-book-ddia` (8 skills, private, references shipped, L0 B/A) →
  `dz init --select ddia-partitioning-strategy`.
- «Хочу опубликовать этот пак» → CP5 records the decision, flips `private`, then a manual publish.

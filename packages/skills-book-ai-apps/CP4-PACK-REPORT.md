# CP4 — pack assembly report — `@dzhechkov/skills-book-ai-apps` **0.2.0** (wave 2, 2026-08-18)

Stage 4 of `digitize-book` (`book-pack-assemble`) for «Building Applications with AI Agents»
(Albada, рус. пер., ISBN 978-601-14-1158-5), slug `ai-apps`, corpus_version `120bf49aec034522`.

This is the **second-wave re-assembly**: 8 skills → **17** (MEASURED — reproducer:
`node books/ai-apps/evals/pack-gates.mjs`, which walks the pack and prints the skill-dir count).
Every figure below is MEASURED and each row names the command that produces it. Nothing is carried
over unverified from the 0.1.0 report.

## Pack

```
packages/@dzhechkov/skills-book-ai-apps/
  aiagents-agent-fit-and-model-choice/       ┐
  aiagents-agent-security/                   │
  aiagents-evaluation-design/                │ wave 1 (8) — descriptions REWIRED this wave
  aiagents-knowledge-and-memory/             │ so their NOT-clauses name the new siblings
  aiagents-learning-strategy/                │
  aiagents-observability-and-drift/          │
  aiagents-single-vs-multi-agent/            │
  aiagents-tool-design-and-selection/        ┘
  aiagents-orchestration-and-planning/       ┐
  aiagents-context-engineering/              │
  aiagents-probabilistic-behaviour-checks/   │
  aiagents-release-gates-and-rollout/        │ wave 2 (9) — NEW
  aiagents-improvement-loops/                │
  aiagents-human-in-the-loop/                │
  aiagents-agent-ux/                         │
  aiagents-org-adoption-and-governance/      │
  aiagents-multi-agent-infrastructure/       ┘
      each: SKILL.md · references/knowledge-units.md · evals/routing.yaml
  package.json  sources.json  README.md  LICENSE  ROUTING-GATE.md  CP4-PACK-REPORT.md
```

ADR-0001 library layout (skill dirs at pack root). Version **0.2.0**, **staged — not published**.
`private: true` + `publishConfig.access: restricted`, both still structural.

## The 9 new skills

| Skill id | Decision moment | Cluster | KU | partial |
|---|---|---|---|---|
| `aiagents-orchestration-and-planning` | which control-flow ARCHETYPE runs a multi-step task (reflex / ReAct / planner-executor / self-ask / reflection / deep-research) and which topology chains its steps, plus chain-length and depth caps | T03 | 11 | 1 |
| `aiagents-context-engineering` | what enters THIS model call's context window and what stays outside — token budget, what to compress, where between-call state lives | T06 | 7 | 0 |
| `aiagents-probabilistic-behaviour-checks` | testing the NON-deterministic layer: run-to-run invariants, long-dialogue coherence, hallucination levers, out-of-distribution robustness, and the systematic-vs-expected-variation triage | T09 | 7 | 1 |
| `aiagents-release-gates-and-rollout` | whether a new agent version may be promoted at all, and how much live traffic it earns next (RC → shadow → canary → experiment → full) plus the revert path | T11 | 7 | 0 |
| `aiagents-improvement-loops` | the post-release cycle a human TEAM runs: detect → root-cause → pick the fix lever (prompt / data / tools) → prioritise the backlog | T12 | 11 | 0 |
| `aiagents-human-in-the-loop` | the autonomy level, when the agent must stop and hand control to a person, how the handoff is shaped, and how oversight itself degrades | T13 | 10 | 3 |
| `aiagents-agent-ux` | the interaction shape of an agentic product: modality, sync vs async, proactivity, discoverability, personalisation, and the transparency/predictability trust contract | T15 | 14 | 0 |
| `aiagents-org-adoption-and-governance` | how far an agent's authority reaches inside a company — the five scopes, the governance envelope each forces, accountability, and compliance obligations | T16 | 12 | 1 |
| `aiagents-multi-agent-infrastructure` | the runtime plumbing under a multi-agent design: transport and protocols, actor/orchestrator runtimes, the durable storage layer | T17 | 12 | 0 |

`partial` = KUs whose cross-model judge had refused a specific over-claim. **6 refused claims were
DELETED, not softened**, each marked in place in the SKILL.md and recorded in that skill's
`references/`. Three further claims were refused *by inheritance* — a formulation refused inside one
KU may not reappear sourced from another (the distill spec's lesson (b)); the distill agents
reported catching and declining these: the modality-hardened "brokers damp inter-agent communication
cost" (T17), the "without a confidence signal users cannot decide" formulation (T15), and the
failure-behaviour-weighs-exactly-as-much equality (T09, refused in its own KU and not re-sourced).

KU accounting (MEASURED — reproducer: `digitizer.consumed_by_this_pack` in `sources.json`, computed
from the 17 `derived_from` lists against `books/ai-apps/ku/*.yaml`): **207 `derived_from` entries →
205 distinct KUs** of the 223-KU canon (2 KUs deliberately consumed by two skills from different
angles). **18 not consumed** — exactly the glossary/definition units that `reduce-report.md` §6
already records as sitting outside every thematic cluster. **All 17 thematic clusters are now
distilled; there is no third wave to schedule.**

## Gate 1 — shingling (IP)

`node packages/@dzhechkov/skills-book-digitizer/scripts/shingling-check.mjs --source books/ai-apps/corpus --output packages/@dzhechkov/skills-book-ai-apps --shingle 8`

| leg | scope | source shingles | output shingles | violations | verdict |
|---|---|---|---|---|---|
| pack markdown | 37 md files (17 SKILL.md + 17 `references/` + ROUTING-GATE.md + README.md + this report) | 101 988 unique 8-grams over 13 corpus chapters | 157 013 | **0** | **PASS** |
| routing evals | the 17 `evals/routing.yaml`, copied to `*.md` so the `.md`-only walker sees them | 101 988 | 8 702 | **0** | **PASS** |

The second leg exists because `shingling-check.mjs` only recurses `*.md` — running it on the pack as
shipped silently skips every `routing.yaml`. Carried over from wave 1 and re-run for all 17.

**One repair was needed during distillation, and it was caught by the gate, not by review:** the T13
agent's first `references/` draft carried 4 verbatim Russian runs ≥8 words; it reworded all four and
re-ran to green before reporting. That is the gate doing its job on a fresh author.

**A false FAIL worth recording.** Running the gate over `books/ai-apps/skills/` while the wave-2
scratch inputs still lived there reported **19 violations** — all 19 in `_cluster-input/T12.md` and
`T17.md`, my own raw KU dumps (the extractor wrapped each KU in an outer ```yaml fence, so the KUs'
inner code fences stopped being recognised as code and their Python/Redis snippets scored as prose).
No skill was implicated. The scratch dir was moved to `books/ai-apps/cluster-input/`, outside the
skills tree. Lesson: the gate's `--output` must point at shipping content only, or a scratch file
will fail a clean pack.

**Coverage gap, recorded not papered over:** `sources.json` and `package.json` are unscanned by
construction (not markdown); both are metadata this stage authored, not book prose.

## Gate 2 — npm-pack smoke (files[] whitelist)

`npm pack --dry-run --json` cross-checked against a full walk of the pack directory
(reproducer: `node books/ai-apps/evals/pack-gates.mjs`).

| metric | value |
|---|---|
| runtime files on disk | 57 |
| files in the tarball (`entryCount`) | **57** |
| missing from the tarball | **0** |
| unexpected extras | **0** |
| unpacked size | 1 822 212 B |
| package size | 568 261 B |

`entryCount` is the stable figure and the one the gate asserts. The two byte sizes are
**self-referential** — this report and the README are themselves inside the tarball, so editing
either moves them. They were measured after the final edit and re-measured to a fixed point (two
consecutive `npm pack --dry-run --json` runs returning identical values); the gate's verdict
(0 missing, 0 extras) is invariant under that drift.

Then verified against the **REAL tarball**, not the dry run: `npm pack --pack-destination /tmp` →
`tar -xzf` → **57 files** under `package/`, including **17** skill dirs, **17** `references/knowledge-units.md`
and **17** `evals/routing.yaml`. This is the class of defect this gate exists for — a `files[]` glob
is a silent publication contract, and this wave added 9 dirs to it.

## Gate 3 — install smoke FROM THE TARBALL + live registration

Not from the working tree — from the packed artifact, into a fresh `mktemp -d` project.

```bash
npm install /tmp/dzhechkov-skills-book-ai-apps-0.2.0.tgz --save-dev     # found 0 vulnerabilities
dz init --target claude-code --skills-dir node_modules/@dzhechkov/skills-book-ai-apps --project .
# → dz init --target claude-code: 17 skill(s), 51 file(s) written, 0 skipped
dz skills-verify --dir . --expect <the 17 ids> --static --strict
# → 17 registrable skill dir(s), no layout problems
dz skills-verify --dir . --expect <the 17 ids> --strict          # L2, real session
# → PASS — all 17 expected skill(s) are registered
#   session: 51 skill(s) registered · client 2.1.235 · 5 plugin(s) loaded
```

| leg | result |
|---|---|
| files materialised into `.claude/skills/` | **51** (17 × SKILL.md + references + evals) |
| L1 static layout scan | **17/17** registrable, 0 findings |
| **L2 live registration probe** (`system/init` listing from a real Claude Code session) | **PASS — 17/17 registered** |
| `dz verify --skills-dir <pack> --target claude-code` | **17/17 valid** |

L1 alone is a proxy — `dz skills-verify` says so itself in its own output. The live probe is what
proves registration, and it is the check that caught a false-green install layout on an earlier pack
in this repo.

## Gate 4 — layout

| check | result |
|---|---|
| skill dirs found | **17** |
| `name:` in frontmatter == directory name | 17/17 |
| frontmatter well-formed (`---` fenced, terminated, `description: >` block) | 17/17 |
| `trust_tier` + `trust_tier_label` + `trust_tier_path` present | 17/17 |
| trust_tier values | **tier 1: 17** (9 promoted 0→1 by the CP3.5 pass) |
| `evals/routing.yaml` + `references/knowledge-units.md` present | 17/17 |
| dead relative links in SKILL.md bodies | **0** |
| sibling skills referenced in backticks that do not exist in the pack | **0** |
| KU ids cited in a body but absent from that skill's `references/` | **1**, deliberate (see D5) |

## Gate 5 — catalog collision

`dz registry search aiagents` → **17 results**, each id appearing exactly once, all attributed to
`skills-book-ai-apps`; duplicate-id count **0** (MEASURED — reproducer:
`dz registry search aiagents | grep skills-book-ai-apps | awk '{print $1}' | sort | uniq -d`).
Semantic collision was gated at CP3.5 against a 70-entry catalog — see `ROUTING-GATE.md`, including
its own limitations.

## L0 benchmark

MEASURED — reproducer: `dz benchmark packages/@dzhechkov/skills-book-ai-apps --all`. Verbatim summary
line: `Skills: 17  Pass rate: 89%  (301/340)` — **12 A grades, 5 B**.

| grade | skills |
|---|---|
| A `90% (18/20)` | agent-fit-and-model-choice, agent-ux, context-engineering, evaluation-design, human-in-the-loop, knowledge-and-memory, learning-strategy, orchestration-and-planning, probabilistic-behaviour-checks, release-gates-and-rollout, single-vs-multi-agent, tool-design-and-selection |
| B `85% (17/20)` | agent-security, improvement-loops, multi-agent-infrastructure, observability-and-drift, org-adoption-and-governance |

The pass rate is unchanged from wave 1's `89% (142/160)` (both MEASURED — same reproducer,
`dz benchmark packages/@dzhechkov/skills-book-ai-apps --all`, run against 0.1.0 and 0.2.0
respectively) — the 9 new skills scored in the same band as the 8 existing ones, so the second wave
did not dilute L0 quality.

The lost points, named rather than gamed:

- **S7 `schemas/output.json` / S8 `scripts/validate-config.json` absent** — every skill, −2. These are
  decision skills whose output is reasoning, not a machine-validated artifact. Fabricating a schema to
  score 20/20 is the "never fabricate schemas/evals to game it" anti-pattern; the points stay lost.
- **U5 size bound (100 B – 50 000 B)** — the five B grades. See D2.

**Stated as a correspondence, not a cause:** the five B-grade skills are exactly the five bodies over
50 000 bytes, every A scores 18/20 and every B scores 17/20, and the one-check delta is consistent
with U5 being the failing check. The per-check output was not read, so the causal claim is not made
here — only the exact correspondence, which is reproducible from the two commands above.

## Findings

| id | severity | finding | status |
|---|---|---|---|
| **D1** | low | **Wave-1 defect D1 RECURRED.** All 9 new `references/knowledge-units.md` shipped headers reading `trust_tier 0` / "CP3.5 has not run", and all 9 new SKILL.md self-checks carried `- [x] trust_tier 0`, contradicting their own promoted frontmatter. | **FIXED** — 9 reference headers and 9 self-check lines rewritten to the tier-1 wording; `grep -rn 'trust_tier 0\|trust_tier: 0'` over the skills tree now returns nothing. **Root cause is structural, not agent error:** the distill spec correctly tells authors to write tier 0 (the gate has not run yet), and nothing in the pipeline propagates the promotion beyond the frontmatter. A promote step that rewrites *all* tier mentions belongs in `book-skill-distill` or `book-pack-assemble`; without it this defect will recur on book #2. **Backlog-worthy.** |
| **D2** | medium | SKILL.md bodies are **not lean** (step-7 Copilot policy). The 17 bodies total **763 183 bytes / 727 835 chars** (reproducers: `cat aiagents-*/SKILL.md \| wc -c` and `\| wc -m`) ≈ **347 k tokens** at the digitizer's 2.1 **chars**-per-token ESTIMATE, if all 17 are installed on an always-on target. **Five** bodies exceed the harness's U5 bound — which is **50 000 BYTES, not 50 KiB** (`packages/@dzhechkov/harness-core/src/benchmark.ts:99`, `stat.size >= 100 && stat.size <= 50000`): `agent-security` 63 936 B, `multi-agent-infrastructure` 55 790 B, `observability-and-drift` 54 485 B, `improvement-loops` 53 204 B, `org-adoption-and-governance` 50 409 B. | **NOT FIXED — deliberate**, and now 2.15× worse than at 0.1.0. Moving content out of 17 routing-gated skills is distillation surgery, not assembly, and would require a re-gate. Mitigated + measured in the README ("on Copilot install only the skills you need"). Recorded as the pack's largest standing debt. **Two arithmetic corrections to an earlier draft of this report, both caught by the README author and re-verified here:** the bound is bytes-not-KiB, so the count is five and not four (`org-adoption-and-governance` at 50 409 B clears 49 152 but not 50 000); and the token estimate must divide the CHAR count, not the byte count — this corpus is Cyrillic-heavy so bytes ≫ chars, and dividing bytes would overstate the estimate as ≈363 k. |
| **D3** | low | Citation-form drift: `knowledge-and-memory` and `learning-strategy` cite KUs in section headers by a short form (`ch06-ku01`) that does not literally match the `ku_id` in their own `references/` (`ai-apps-ch06-p144-ku01`). | **NOT FIXED** — cosmetic, carried from 0.1.0. Both carry full ids in `## Источник` plus a `references/` pointer, so the lookup resolves; only a naive grep on a header id misses. |
| **D4** | medium (tooling, not the pack) | `dz install <path-to-tarball>` does not work: `dz install` takes an npm package NAME and probes `node_modules/<name>`. Fails LOUD (exit 1) — a capability gap, not a false green. | **NOT FIXED — out of scope.** README documents the working two-command form. Worth a backlog entry. |
| **D5** | none (verified non-defect) | 1 KU id cited in a body but absent from that skill's `references/`: `ch09-p238-ku16` in `evaluation-design`. | **No action.** It is an *exclusion* reference — that KU now belongs to `aiagents-release-gates-and-rollout`, and naming it is the boundary clause doing its job. The other three such references from 0.1.0 resolved themselves: their KUs are now in a shipped sibling. |
| **D6** | medium (owner decision) | **No `brain/ai-apps.sqlite` KB slice ships** (step 9 of `book-pack-assemble`). | **NOT DONE — deliberate.** Registering it is **CP6**, an explicit IP-relevant owner opt-in. The owner recorded `cp6_brain_promotion: YES — but ONLY after the second wave` in `books/ai-apps/manifest.json`; the second wave is now complete, so **CP6 is unblocked but NOT taken here** — taking it is the owner's next step, after which step 9 must be re-run and `brain/` added to `files[]`. `sources.json → lookup_tiers.brain` and the README still state plainly that `dz recall --books --book ai-apps` returns nothing. |
| **D7** | low (process) | The repo's `claim-check` PreToolUse hook fired on essentially every distill and rewire edit — by agent report, 70+ findings across the wave — and **every one was a false positive**: a book statement carrying its `[p.N]` page anchor, which is precisely the provenance regime `_DISTILL-SPEC.md` mandates. Five independent agents reported it separately. | **NOT FIXED — needs a scope exclusion.** `claim-check` is tuned for engineering claims (MEASURED/CLAIMED tags + a reproducer); `books/*/skills/**` uses page anchors instead. The noise trains authors to ignore the hook, which is the real cost. **Backlog-worthy: exclude `books/*/skills/**` or teach the checker that `[p.N]` is a valid provenance tag.** |
| **D8** | low (eval hygiene) | `improvement-loops#pos2` ("отличить разовый сбой от системного") is filed as a positive for `aiagents-improvement-loops` but the judge routed it to `aiagents-probabilistic-behaviour-checks` — **correctly**, since the wave-2 seam rule deliberately assigned that triage tree to T09. | **NOT FIXED — deliberately.** Moving it would be editing a case after seeing a result. Recorded in `ROUTING-GATE.md` as a case that should be *re-owned* (moved to the T09 eval file) by whoever next revisits these evals, not argued with. |

## Distribution — CP5 and CP6 remain the owner's

The pack is **staged and private**. `sources.json → distribution` reads
`{ state: "private", decided_by: null, date: null }`, and `package.json` carries `private: true` +
`publishConfig.access: restricted` structurally — a publish cannot happen by accident.

The owner's recorded decisions (`books/ai-apps/manifest.json → owner_decisions`, 2026-08-18) were:
publish to npm **after** the second wave completes, and promote to `~/.dz/brain` **after** the second
wave. **The second wave is now complete and gated.** Both decisions are therefore unblocked — and
neither has been executed here. Publishing and brain promotion are the owner's explicit next steps.

---

## Postscript — CP5 taken 2026-08-19 (this report is the wave-2 assembly record, not the release record)

The section above ("Distribution — CP5 and CP6 remain the owner's") was accurate on 2026-08-18 and is
kept as written. On **2026-08-19** the owner's recorded decisions were executed: **CP5 = publish**,
**CP6 = promote to `~/.dz/brain`**. What changed against this report:

- `sources.json → distribution` is now `{ state: "public", decided_by: "owner", date: "2026-08-18" }`;
  `private: true` and `publishConfig.access: restricted` are lifted.
- The gates were **re-run on the exact publish-time bytes**, not trusted from this report: shingling
  leg 1 **0 violations** (37 md, 157 983 shingles), leg 2 **0 violations** (17 yaml, 8 702 shingles),
  `dz guard check --op publish` **PASS**, `npm pack --dry-run` **entryCount 57** for the content.
- `files[]` gained `.dz-manifest.json` + `sbom.json` (entryCount 57 → **59**): `dz publish` refuses a
  pack with no signature manifest once a trust root exists, and the recipient needs both to verify.
- Published as **0.2.1** — `dz publish` bumps the patch on release, so the staged `0.2.0` content is
  what shipped under the `0.2.1` tag. `0.2.0` was never published.
- Finding **D6** (no `brain/ai-apps.sqlite` KB slice) is **CLOSED**. CP6 was taken, which unblocked
  step 9 of `book-pack-assemble`. What was actually required first, and had been missed by the whole
  wave: **`book-kb-index` had never run for this book** — `phase_state` had no `kb_indexed` and the
  project KB held only the other digitized book, so the CP6 prerequisite was unmet and
  `dz brain add --project . --source ai-apps` would have promoted nothing. The 223-KU canon
  (202 `true` / 21 `partial` / 0 `false`, 0 duplicate ids) was indexed into both project stores
  (lexical `books.sqlite` + vector `agentdb.db`, honest per-KU confidence scores, `partial` verdicts
  discounted ×0.8 rather than indexed at face value), then promoted. Reproducer:
  `node books/ai-apps/kb-index.mjs`. The slice was exported with `dz brain export`, checkpointed out
  of WAL so no `-shm`/`-wal` sidecars ship, and passed the same shingling gate as the pack
  (**0 violations**, 59 300 shingles). `files[]` gained `brain`; entryCount 59 → **60**; shipped in
  `0.2.2`.
- The lookup-tier table in the README was rewritten: the brain tier is available, **and** it records
  the surface that does *not* answer from the brain — `dz recall --books` reads the PROJECT store, so
  it returns `0 KU hit(s)` in a project that has not indexed the book (MEASURED from a fresh dir).

## CP7 — post-publish correction, `0.2.3` (2026-08-19)

Both published versions shipped a signature that does **not** verify against their own tarball, and
`0.2.2` shipped a README with two false sentences. Neither defect touched the pack CONTENT.

- **MEASURED, on the registry tarball, not the working tree** — the distinction matters, because the
  working tree verified clean the whole time: `curl` the `dist.tarball` of `0.2.2`, untar, then
  `dz verify-pack --pack <dir> --pubkey keys/dz.pub` → `FAILED`, with `README.md: content does not
  match its signed hash` and `package.json: content does not match its signed hash`.
- **Cause (tool defects, filed separately as `47511ae1` and `abf051cb` — not fixed here).**
  `dz publish` signs the pack, and only then bumps the version in `package.json` and rewrites version
  strings in the README. Everything it touches after signing is, by construction, unsigned. The README
  rewrite is a blind global substitution: it replaced the sentence *"The first published version was
  `0.2.1`"* with *"`0.2.2` is the first published version"*, and collapsed *"`0.2.1` was the CP5
  publish; `0.2.2` adds the CP6 slice"* into three identical numbers.
- **A third defect, found while measuring this one, not previously filed.** The same
  `verify-pack`-on-tarball sweep was run over every published pack that ships a `.dz-manifest.json`:
  **19 of 19 FAIL, and `package.json` is the mismatching file in all 19.** `dz publish` writes the
  bumped `package.json` with `JSON.stringify` — no trailing newline, and on at least one pack
  (`trip-planner`) with reordered keys — so the shipped bytes differ from the signed bytes even when
  no human edited anything. The signing scheme cannot hold over a file the publisher rewrites.
- **Fix applied here (mitigation, not a tool fix).** README corrected; version bumped to `0.2.3` by
  hand *before* signing; `dz sign --pack . --key <key outside the repo>`; published with a raw
  `npm publish` from the pack directory, which packs the on-disk bytes verbatim (verified: `npm pack`
  emits a `package.json` byte-identical to disk). Raw `npm publish` is safe **for this pack
  specifically** because it declares no dependencies of any kind — the workspace-`*` leak that
  `dz publish` guards against has nothing to leak.
- **Verified from the registry, not from disk.** After publish, `0.2.3` was downloaded from its
  `dist.tarball`, untarred, and `dz verify-pack` re-run against it.
- `0.2.1` and `0.2.2` are deprecated on npm with a reason naming both the unverifiable signature and
  the incorrect README. They remain installable; nothing is unpublished.

# @dzhechkov/skills-tutorial-factory

**`package-tutorial-factory`** — a meta-skill that turns ONE harness-hub package into a **Head-First-style,
gamified edu-site learning course**. It does not rebuild engines; it **composes** three that already exist:

| Composed engine | Role |
|-----------------|------|
| [`skills-book-digitizer`](../skills-book-digitizer) | IP discipline — a distilled, page-anchored Head First **method-KB** + the vendored `shingling-check.mjs` gate |
| **its own executable renderer** (`package-tutorial-factory/scripts/render-site.mjs` + `package-tutorial-factory/scripts/verify-site.mjs`, v0.2.0) | the DEFAULT render seam — deterministic single-file gamified SPA, then EXECUTED and driven by the verifier |
| [`skills-edu-site`](../skills-edu-site) (`edu-site-generator`) | the opt-in heavy render target — a gamified React/Vite SPA built by an agent |
| `code-skills-creator` | the meta-factory **shape** — grounded, checkpointed, propose-never-clobber |

The method is **grounded, never hard-coded**: authoring READS `package-tutorial-factory/references/head-first-method.md` at run time
and every course section must cite ≥1 Head First pattern (`P1`–`P12` / `D1`–`D4`) it serves. Refine the
method by editing the KB, not the code.

## When to use it

- **Use** when you have a package (a skill pack, CLI, or library) and want a real, interactive **learning
  course** for it — not just a README a teammate skims once.
- **Skip** when the target has no teachable surface, or a static `SKILL.md` pointer is all you want.

## How it works (six steps, two checkpoints)

```
01 extract-concepts  → doc-harvest Concept Brief (README + SKILL.md + exports + tests), dependency-ordered
02 author-course     → brief × method-KB → edu-site Step-0 course data + a Head First citation per section
                       ── checkpoint: confirm-topics ──
03 headfirst-gate    → Plane 1: deterministic zero-LLM Head-First checklist (must PASS before render)
04 brain-friendliness→ Plane 2: cross-model, KB-grounded semantic review (tone/surprise/story) — advisory
05 render            → stamp source from live npm, then render the factory's deterministic SPA
                       ── checkpoint: review-course ──
06 verify-handoff    → gate PASS + IP clean + KB resolves + SPA builds
```

## Usage scenario (end-to-end)

Turn `@dzhechkov/skills-book-digitizer` into a course:

```bash
# 1. Harvest the teachable surface (deterministic, no LLM). Since v0.3.0 every substantive README
#    ## section is its own topic (fence-aware, boilerplate excluded) and escalation is decided by
#    DOC VOLUME (--doc-floor), so CLI/library packs WITHOUT SKILL.md files harvest properly too:
node package-tutorial-factory/scripts/extract-brief.mjs --pkg ../skills-book-digitizer --json /tmp/brief.json
#   → 12 topics, escalate: null (doc-rich pack → no understand-anything needed)
node package-tutorial-factory/scripts/extract-brief.mjs --pkg ../harness-cli
#   → topics harvested: 18 (topic floor 3, doc floor 1500) … doc-harvest sufficient (no escalation)
#     (pre-v0.3.0 this very package harvested 2 topics and ALWAYS escalated — the F1 ceiling)

# 2. Author the course object (the model-heavy step; grounded on package-tutorial-factory/references/head-first-method.md)
#    → /tmp/course.json  (edu-site Step-0 data; every section cites a Pn/Dn pattern id)

# 3. Gate it — deterministic Head First checklist (fix the COURSE if it fails, never the gate)
node package-tutorial-factory/scripts/headfirst-gate.mjs --course /tmp/course.json --json /tmp/gate.json

# 4. Render + drive-verify. Render first adds source.package/source.version/source.authoredTs to
#    course.json without a hand edit. The version comes from the LIVE npm registry, never a local
#    package.json. mirrorReceipt stays absent unless a real mirror receipt is available.
#    Since v0.5.0 every emitted site carries a footer with the workshop's
#    channel links (default: t.me/llm_notes + aicoding.space). Override per course:
#      "footer": { "links": [{ "label": "My site", "href": "https://example.org" }] }
#    Links are https-only by construction (javascript:/http: entries are filtered out), and a
#    footer whose every link was filtered FAILS verify-site loudly (footer.renders) instead of
#    silently vanishing. The self-contained check counts external LOADS (src / <link href> /
#    url() / @import) — navigation anchors are excluded by design, so the footer never trips it.
node package-tutorial-factory/scripts/render-site.mjs --course /tmp/course.json
node package-tutorial-factory/scripts/verify-site.mjs --site site/index.html   # 29 behavioural checks
```

Expected gate output on a compliant course:

```
headfirst-gate — Head First STRUCTURAL checklist (Plane 1, ADR-003)
(tone/surprise/story quality is Plane-2, cross-model, advisory — NOT gated here)
  ok    structural.unique-kebab-ids
  ok    P5.do-something                       (a NON-BLANK exercise — blank/null shells rejected)
  ok    P7.no-3-consecutive-same-type
  ok    P7.all-six-types-when-N>=6
  ok    P2.redundancy-three-encodings         (concept word PRESENT in theory + exercise + finalTest)
  ok    D2.reflective-quartet                 (full quartet: strengths, weaknesses, rating, wrap-up)
  ok    D1.running-persona-every-section      (persona threaded through EVERY section)
  ok    gamification.achievement-floor        (>=8 distinct, well-formed achievements)
  ok    method.per-section-citation-resolves  (every citation resolves in the shipped KB)
PASS — 13 structural Head First properties hold.
```

```bash
# 4. Prove IP-safety — zero verbatim runs >= 8 words from the source corpus
node package-tutorial-factory/scripts/shingling-check.mjs --source <corpus-dir> --output /tmp/course.json
#   → PASS — no uncited verbatim run >= 8 words.

# 5. RENDER — the factory's own executable renderer (v0.2.0): gated course.json → ONE self-contained
#    HTML file (opens over file://, zero network, deterministic: same course = same bytes)
node package-tutorial-factory/scripts/render-site.mjs --course /tmp/course.json --out /tmp/site/index.html
#   → site → /tmp/site/index.html  (47766 bytes, 6 sections, 8 achievements)

# 6. VERIFY — EXECUTE the site against a DOM shim and drive it like a learner: open every section,
#    complete every exercise by clicks, take the final test, click Reset — then assert the
#    PERSISTED state, not the prose
node package-tutorial-factory/scripts/verify-site.mjs --site /tmp/site/index.html
#   → PASS — 24 behavioural checks hold.   (exit 0 iff every assertion holds)
```

**Verifier trust boundary:** `verify-site.mjs` executes the app JavaScript embedded in the supplied
HTML inside its Node DOM shim. Run it only on HTML produced by this factory or otherwise trusted input;
it is a behavioural verifier, not a sandbox for hostile third-party pages.

**When to use which render medium:** the built-in renderer (step 5) is the default — CI-able, zero
model cost, one file to ship anywhere. Ask the skill for `--medium edu-site` only when you want the
full React/Vite gamified SPA (an agent builds it), or `--medium markdown` for plain ordered chapters.

Optional authored fields the renderer honours (all omit-safe — absent means a generic fallback or
nothing, never fabricated content): `introNote`, `introHeading`, `outro.{pass,next}`,
`exercise.successFeedback`, per-section `notebook {when, note}` (if ANY section carries a notebook,
EVERY section must — verify-site enforces device consistency).

A worked example ships in the repo under
`features/package-tutorial-factory/dogfood/skills-book-digitizer-course.json` (gate PASS, IP clean).

### Зачем это (RU)

До v0.2.0 фабрика доводила курс детерминированно только до `course.json`: шаг «рендер» был
инструкцией для агента («поручи edu-site-generator»), то есть невоспроизводим и непроверяем в CI.
Теперь конвейер исполняем от начала до конца: `бриф → гейт → рендер → верификация` — четыре скрипта,
ноль вызовов модели после гейта. Рендерер выдаёт один автономный HTML-файл (открывается по file://,
без сети), а верификатор не парсит страницу, а ЗАПУСКАЕТ её и проходит как ученик — кликает каждое
упражнение, сдаёт финальный тест, жмёт Reset — и проверяет сохранённое состояние, а не текст на
экране. Зелёный `verify-site` означает «курс работает», а не «HTML валиден». Передавайте ему только
HTML, созданный фабрикой или из другого доверенного источника: верификатор исполняет встроенный
JavaScript и не является песочницей для чужих страниц.

## The two safety properties (and why they are on the cheapest layer)

1. **The STRUCTURAL Head First properties are enforced deterministically (ADR-003, Plane 1).**
   `package-tutorial-factory/scripts/headfirst-gate.mjs` is a zero-LLM checklist that proves — with certainty — only what a rule
   can decide: a NON-BLANK exercise per section (blank/null shells are rejected — pedagogical quality
   is NOT judged), type diversity, the concept word PRESENT (a lexical match) in theory + exercise +
   finalTest, the full reflective quartet, the persona `name` threaded through EVERY section, ≥8 distinct
   well-formed achievements, and citations that RESOLVE in
   the shipped KB. It **discriminates**: its test breaks each property one at a time and asserts the
   verdict flips. **It does NOT — and never claims to — judge the SEMANTIC quality of tone (P3), surprise
   (P4), or story (P8).** A green gate means the course is structurally Head First, not that it *reads*
   well. That judgment is Plane 2 only: `package-tutorial-factory/scripts/brain-friendliness-prompt.mjs` builds a KB-grounded
   prompt for a FRESH cross-model reviewer, and an empty/gradeless answer is a loud fallback, never a
   clean pass — it is advisory, never an auto-block.
2. **The book never ships (ADR-004).** Only the distilled, paraphrased, page-anchored method-KB ships. The
   raw copyrighted corpus stays local (gitignored). `package-tutorial-factory/scripts/shingling-check.mjs` proves **zero** verbatim
   runs ≥8 words. The explicit package `files` inventory excludes raw `research/` and book-corpus
   paths. One intentionally shipped exception is the tiny synthetic test fixture
   `test/fixtures/synthetic-corpus/chunk-001.md`; its exact path and SHA-256 are pinned by the package
   and packed-artifact tests.

## Scope & honest limits (what the gates do and do NOT prove)

The two deterministic (layer-1) gates were hardened across three cross-model QE rounds. Each round
closed real bypasses, but each also surfaced a deeper "distinct-but-meaningless" trick (structure) or an
exotic text-hiding trick (IP). That is the infinite-regress signal: **you cannot deterministically prove
"meaningful / non-placeholder / genuinely Head First", nor perfectly defend against an adversary who
controls the course text.** So the promises are deliberately narrowed:

- **The layer-1 gates prove STRUCTURE + IP-safety only** — presence, non-emptiness (after zero-width /
  invisible strip), citations that resolve against the **content-pinned** KB, no verbatim reuse in
  **normally-authored** text, and no raw book corpus in the tarball (the exact hash-pinned synthetic
  fixture above is test data, not book content). **The gate is NOT a DRM and NOT a semantic judge.**
- **Whether a course is non-placeholder / pedagogically meaningful / genuinely Head First in voice is a
  Plane-2 property**, certified by the cross-model review (ADR-003 layer-3), **NOT** by the deterministic
  gate. **A determined placeholder course CAN pass the structural gate** — the Plane-2 review is what
  catches it, and the factory pipeline **REQUIRES that review before a course is considered done**.
- **IP defense is LAYERED**, not a single gate: authoring reads a **pre-cleared** paraphrased KB (proven
  0 verbatim vs the corpus) **AND** the raw corpus is **structurally excluded** from the tarball **AND**
  the shingling gate catches normal verbatim reuse. **Adversarial obfuscation** (e.g. hand-crafted
  JSON-duplicate keys, arbitrary homoglyph/steganographic tricks) is **out of scope and documented** —
  it is not the factory's failure mode, since the factory authors the text from the cleared KB.
- **The Ed25519 manifest authenticates the 30 signable files in the `pnpm` publish tarball, not
  `sbom.json` itself.** Source and tarball keep the same path inventory, while `pnpm` may re-serialize
  `package.json`; the manifest and SBOM therefore bind the packed artifact using raw SHA-256 for every
  path except the repository-wide canonical JSON hash for `package.json`. Treat a source
  directory or separately copied SBOM as unauthenticated unless it is repacked and the exact unpacked
  artifact passes `dz verify-pack`.

## Contents

<!-- runtime-paths:start -->

- `package-tutorial-factory/SKILL.md` — orchestrator.
- `package-tutorial-factory/modules/00-orchestrator.md`
- `package-tutorial-factory/modules/01-extract-concepts.md`
- `package-tutorial-factory/modules/02-author-course.md`
- `package-tutorial-factory/modules/03-headfirst-gate.md`
- `package-tutorial-factory/modules/04-brain-friendliness.md`
- `package-tutorial-factory/modules/05-render.md`
- `package-tutorial-factory/modules/06-verify-handoff.md`
- `package-tutorial-factory/references/course-skeleton.md`
- `package-tutorial-factory/references/head-first-method.md`
- `package-tutorial-factory/references/method-to-edusite-map.md`
- `package-tutorial-factory/scripts/app.src.js`
- `package-tutorial-factory/scripts/brain-friendliness-prompt.mjs`
- `package-tutorial-factory/scripts/course-source-stamp.mjs`
- `package-tutorial-factory/scripts/course-schema.mjs`
- `package-tutorial-factory/scripts/extract-brief.mjs`
- `package-tutorial-factory/scripts/headfirst-gate.mjs`
- `package-tutorial-factory/scripts/render-site.mjs`
- `package-tutorial-factory/scripts/shingling-check.mjs`
- `package-tutorial-factory/scripts/verify-site.mjs`

<!-- runtime-paths:end -->

## Tests

```bash
npm test        # node --test — extract-brief, factory-authoring, headfirst-gate, honest-scope, ip-shingling, render-site
```

The test files are the ADR Confirmation gates. The IP-verbatim tests require the local (gitignored)
corpus and SKIP loudly when it is absent; the pack-excludes-corpus test always runs.

## License

MIT. The shipped method-KB is a distilled, paraphrased form of a copyrighted book's *method* (facts and
methods are not copyrightable); no verbatim book expression is redistributed. See
`features/package-tutorial-factory/03_adr/004-corpus-ip-and-provenance.md`.

## Changelog

- **Unreleased** — every render stamps the course's published source package and LIVE npm version,
  plus its authoring timestamp, through one reusable writer. Registry failure remains visible by
  omitting `version`; it never falls back to a local package manifest. The optional mirror receipt is
  preserved when real and never invented. A repository backfill command covers existing tutorials
  idempotently, and the published/working skill copies have byte-drift tests for the new seam.

- **0.7.0** — **four diagram kinds, because content has four shapes.** 0.6.0 shipped only `flow`,
  and the result was measurable: 2 diagrams in a 14-section course, 5 in a 17-section one — not
  because the criterion was strict, but because anything that was not a sequence had nothing to be
  drawn with. Added `compare` (a choice: columns with gains and costs), `scale` (a gradient where
  vertical position IS the meaning — the detection-cost ladder finally has a picture) and `parts`
  (a whole and the parts that must all be present). The authoring criterion is rewritten from "is
  there a sequence" to **"must the reader hold a structure the text is forced to deliver linearly"**,
  with a removal question before shipping — take the diagram away, and if only prettiness is lost it
  was not needed. Gate knows each kind's own keys and refuses a leftover from another kind; verifier
  counts nodes across all three node shapes, so a compare/scale diagram that drew nothing cannot pass
  silently. Re-authored both shipped courses: 9 diagrams in harness-cli, 13 in feature-adr. 90/90.

- **0.6.0** — **diagrams**. A section may declare `diagram` as DATA (`kind:"flow"`, title, 2–8
  nodes with label/note, optional `cycle`) and the runtime draws it from theme tokens: a row on a
  wide screen, a column under 640px, dark mode for free. Optional by design — there is no measured
  need to require illustrations — but strict once declared: the new gate check
  `structural.diagram-shape` REFUSES an unknown key rather than ignoring it, because a silently
  dropped typo is a diagram that never appeared. `verify-site` gains `diagram.renders`, which drives
  the page and asserts every label, note and caption is on screen.
  There is NO author markup: labels go in as text, so `<script>` in a label renders as those
  letters. That is the answer to a cross-model finding — a hand-written SVG was measured pulling the
  network through `<image href>` while the verifier stayed green — and the security test is
  mutation-proven: swapping the text insertion for an HTML one turns it red. 90/90.

- **0.5.3** — course-level links + two probe-honesty fixes. `course.feedback` `{repo, packagePath,
  branch?}` now renders TWO footer links from one declaration: a prefilled **new-issue** link whose
  title names the exact package, and a **package README** link on the public mirror; a malformed or
  absent block yields NO link rather than a broken one. Verifier honesty: theory probe words are
  sampled from the VISIBLE text (a markdown link's URL lands in an href and is not missing prose),
  and the concept probe now shares the GATE's morphology-aware matcher instead of a substring test
  that failed on Russian inflection (`одиннадцать` vs `одиннадцати`) — both measured false-failures
  on real courses. Authoring module gains the Russian language-quality rules (no calques, anglicisms
  only where they are terms) and the literary-stage model chain **Fable → gpt-5.6-sol → any, named
  in the report**, with the gate re-run after every literary pass. 85/85.

- **0.5.2** — authoring surface upgrade, driven by owner findings on the first production course:
  the markdown-lite renderer now supports `- ` bullet lists and `[label](https://…)` links
  (https-only, `rel="noopener"`); a new deterministic gate check `structural.theory-readable`
  fails any 700+ char theory with fewer than 2 paragraph breaks (RED-proven against the
  pre-restructure course — all 8 sections failed, the restructured ones pass); pattern chips get
  per-pattern Russian tooltips (P1–P12/D1–D4 explained on hover); the authoring module now
  REQUIRES structured theory and npm/repository links for published target packages. 80/80.

- **0.5.1** — UI locale seam: every chrome string (menu, buttons, exercise labels, achievements,
  final-test copy) now lives in ONE table inside `render-site.mjs`, embedded into the page as an
  inert `#ui-strings` JSON block chosen by `course.language` (`ru` → full Russian chrome; anything
  else keeps English byte-for-byte). The runtime AND `verify-site` both read that embedded table —
  one source, no drift — so a localized site is driven and verified in its own language (probes
  included: buttons, `completed ·` pill, achievements counter). dz commands are never translated.
  Two new roundtrip tests (ru-chrome drive-through, en-unchanged), 80/80.

- **0.5.0** — every rendered site now carries a channel footer (default links: `t.me/llm_notes` +
  `aicoding.space`; per-course override via `course.footer.links`; https-only filter — a
  `javascript:`/`http:` entry never reaches the page). `verify-site` gains the `footer.renders`
  check (29 behavioural checks; an all-filtered footer fails loudly) and its self-contained scan
  now honestly counts external *loads* (`src`, `<link href>`, `url()`, `@import`) rather than
  every `href=`, so navigation anchors no longer conflate "self-contained runtime" with
  "no outbound links". Three new seam tests (default / override / hostile link), 78/78.

- **0.4.4** — `package-tutorial-factory` is now a genuinely self-contained portable skill: its
  method KB and all eight runtime assets live inside the canonical skill directory, direct commands
  resolve through the installed `SKILL_ROOT`, and clean Codex/Claude projections carry the same
  19-file closure. The package intentionally includes its eight deterministic test/fixture files so the source and
  `pnpm` artifact share one closed path inventory; the signature binds the packed artifact under that
  canonical signing rule. Direct package-root callers must migrate from
  `scripts/<entrypoint>` to `package-tutorial-factory/scripts/<entrypoint>`.

- **0.3.0** — F1: extract-brief's 2-topic ceiling for no-SKILL.md packs is gone. Every substantive
  README `##` section becomes its own topic (CommonMark-fence-aware — code-sample headings can never
  become topics or keyConcepts, one shared fence walker; exact-match boilerplate stoplist; dedup
  ids), and escalation is decided by substantive DOC VOLUME (`--doc-floor`, intro/badges excluded)
  with `--min-topics` kept as a content-topic backstop. Cross-model Codex QE: two rounds, 21
  findings closed (fenced-heading harvest, mixed ```/~~~ delimiters, unclosed-fence keyConcept
  pollution, string-form bin/exports, strict option parsing …). Live: harness-cli went from
  `2 topics + ESCALATE` to `18 topics, no escalation` (MEASURED — reproducer
  `node package-tutorial-factory/scripts/extract-brief.mjs --pkg ../harness-cli`; suite `npm test` 75/75).

- **0.2.0** — F2: the factory gains its OWN executable render seam. `package-tutorial-factory/scripts/render-site.mjs` turns the
  gated course.json into one deterministic, self-contained HTML file, and `package-tutorial-factory/scripts/verify-site.mjs`
  EXECUTES it against a DOM shim — walks every section, completes every exercise (and the secondary
  "Check yourself" quiz) by clicks, takes the final test, clicks Reset — asserting PERSISTED state and
  device consistency, with achievement expectations evaluated per condition (an unsatisfiable promised
  achievement is a RED). Runtime fully course-agnostic (optional `introNote`/`introHeading`/`outro`/
  `successFeedback`/`notebook` fields). Cross-model Codex QE: two rounds, 17 findings fixed incl. a
  published-artifact ENOENT (`files[]` omitted the runtime), attribute injection, and a Reset no-op
  (MEASURED — reproducer: `npm test`, 63/63; live: `node package-tutorial-factory/scripts/verify-site.mjs --site <site>` on the
  fixture course → `PASS — 24 behavioural checks hold.`).

- **0.1.2** — F4: the gate now CHECKS the `topics[]` Step-0 projection (present + ids match sections 1:1, exactly what `toStepZero` derives) — the contract the shipped dogfood example had silently diverged from; the dogfood is regenerated via the contract's own projection (MEASURED — reproducer: `node package-tutorial-factory/scripts/headfirst-gate.mjs --course <course-without-topics>` → FAIL 1/13).

- **0.1.1** — the Plane-2 prompt builder is now FAIL-CLOSED on its KB precondition (mirror of the gate's pin): an absent or counterfeit --kb refuses with exit 1 instead of emitting a confident "grounded" prompt (MEASURED — reproducer: `node package-tutorial-factory/scripts/brain-friendliness-prompt.mjs --kb /nonexistent-kb.md --course <any>` → exit 1).

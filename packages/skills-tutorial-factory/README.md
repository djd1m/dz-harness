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
05 render            → hand course data to edu-site-generator (SPA) or ordered markdown; assert it builds
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

- **0.4.3** — `package-tutorial-factory` is now a genuinely self-contained portable skill: its
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

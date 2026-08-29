# Module 03 — Head First deterministic gate (ADR-003, Plane 1)

Zero-LLM, silent-proof checklist over the produced course data. Every property here is one a 5-line
rule can decide, so it lives on layer 1 of the cost-of-detection ladder — never delegated to a
reviewer's judgment.

## Run
```bash
node "$SKILL_ROOT/scripts/headfirst-gate.mjs" --course /tmp/<slug>-course.json --json /tmp/<slug>-gate.json
```
Exit 0 = PASS; exit 1 = FAIL (fail-closed on malformed input — a parse error is a FAIL, never a
vacuous pass). The JSON report lists every check and each failure's detail.

## What it enforces (STRUCTURAL only)
- **structural validity** — unique kebab ids, canonical `interactiveType`, one in-bounds `finalTest`
  per section, quiz answers in bounds.
- **P5 do-something** — every section has a NON-BLANK exercise for its type. Blank/null shells
  (`["",""]`, `[null]`, whitespace strings, empty objects) are rejected — but a non-blank exercise is
  not judged for pedagogical quality (that is Plane-2).
- **P7 variety** — no 3 consecutive same type; all 6 types present when N≥6.
- **P2 redundancy** — the `keyConcept`'s distinctive word/stem is PRESENT (a lexical match, not a
  semantic judgement) in `theory` AND the section's exercise AND its `finalTest` — a blank assessment
  does not pass.
- **D2 reflective quartet** — a `reflection` object with all four parts non-empty: `strengths`,
  `weaknesses`, `rating`, `wrapup`. A marker-only `{tradeoffs:"x"}` FAILS.
- **D1 persona** — a course persona threaded through **EVERY** section's `theory` (not merely present).
- **gamification floor** — ≥8 achievements: distinct ids, distinct (canonicalized) conditions,
  non-blank title/description; `finalTestPassThreshold` ≥ 70. (The gate does NOT cross-check that an
  achievement's condition references real sections/store state — that is not verified here.)
- **method citation** — every section's `methodPattern` RESOLVES against a real id in the shipped KB
  (`--kb`); a bogus token like `P99` FAILS.

## Robustness notes (honest limits of the deterministic checks)
- **P2 / persona are PRESENCE checks over VISIBLE text.** The gate proves the concept's distinctive
  word (and the persona's `name`, whatever it is — a generic `"Developer"` is accepted; the name is a
  presence/consistency check, NOT a proper-noun or character-quality check) actually appear in
  learner-facing fields — theory prose,
  the exercise's question/options/labels/steps, the finalTest question/options — NOT in `id`/`marker`/
  metadata keys. It does NOT judge whether the concept is *pedagogically well-integrated* — that is a
  Plane-2 judgment. A word present in visible text is the honest, deterministic promise; quality is not.
- **The method-KB is content-pinned.** The gate resolves citations only against the BUNDLED
  `references/head-first-method.md`; a `--kb` that is not byte-identical (e.g. a counterfeit that adds
  its own `P99` to the id index) is REFUSED by content hash, so citations can't be made to resolve
  against a forged KB.
- **Invisible characters don't count as content.** Zero-width / default-ignorable code points are
  stripped before any non-blank check, so an option or field made only of `U+200B`/`U+FEFF` is blank.

## What it does NOT enforce (honest scope — narrowed promise)
The layer-1 gate proves STRUCTURE + IP-safety ONLY. **It is NOT a DRM and NOT a semantic judge.** It says
**nothing** about the SEMANTIC quality of tone (P3), surprise (P4), or story (P8), and it does not prove a
course is non-placeholder. A **determined placeholder course CAN pass** this structural gate (e.g. by
threading a real keyword and persona name through visibly-present but shallow fields).

Whether a course is **non-placeholder / pedagogically meaningful / genuinely Head First in voice is a
Plane-2 property**, certified by the cross-model review (`modules/04-brain-friendliness.md`, ADR-003
layer-3), **NOT by this gate**. The factory pipeline **REQUIRES that Plane-2 review before a course is
considered done** — a green layer-1 gate is necessary, never sufficient. Do not read a green gate as "this
reads like Head First"; it means "this is structurally Head First." Never move a model-judgment property
into this deterministic list and claim it is gated.

Likewise the persona check is a **presence/consistency** check (the author's persona name token appears in
every section), NOT a proof the persona is a vivid character — `persona.name="Developer"` is accepted; the
character's quality is Plane-2.

Numeric knobs (`--min-achievements`, `--final-test-min-pass`) are `Number.isFinite`-clamped (the
Infinity-recidivism lesson): a non-finite value falls back to the default, never becomes an unreachable
floor.

## Rule
If the gate fails, fix the **course**, not the gate. Weakening a check to pass a dry course is the exact
anti-pattern the ladder names. The gate DISCRIMINATES (its ADR-003 Confirmation test proves each single
broken property flips the verdict); a change that makes it vacuously pass will fail that test.

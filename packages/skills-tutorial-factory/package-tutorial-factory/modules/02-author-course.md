# Module 02 — Author the course (ADR-001)

Turn the Concept Brief into **edu-site Step-0 course data** where every section serves ≥1 Head First
pattern. This is the model-heavy step. READ `references/head-first-method.md`,
`references/method-to-edusite-map.md`, and `references/course-skeleton.md` FIRST — grounding and the
inspectable course skeleton are preconditions, not decoration.

## Contract
Produce ONE course object per `references/method-to-edusite-map.md` (the canonical shape). It is BOTH
an edu-site Step-0 object and the input the deterministic gate checks. Minimum:
- `language`, `courseTitle`, `courseDescription`
- `persona: { name, description }` — ONE running character (D1), referenced in the majority of sections
- `sections[]` (≥3): each with `id` (kebab, unique), `order`, `title`, `shortTitle`, `icon` (distinct),
  `interactiveType` (canonical enum), `keyConcept`, `theory`, an exercise payload for its type, `quiz`,
  a `finalTest` entry, and **`methodPattern`** (an id from the KB)
- `achievements[]` (≥8, incl. the standard 5), `faqData[]` (5–8), `finalTestPassThreshold: 70`
- `topics[]` — the Step-0 projection (`scripts/course-schema.mjs` `toStepZero(course)` computes it)

## Applying the method (the map is load-bearing)
For each section, pick the `interactiveType` and write `theory` so that the section's `methodPattern`
is genuinely served — see the map in `references/head-first-method.md`:
- **P2 redundancy** — the `keyConcept` must appear in `theory` AND its exercise AND the `finalTest`.
- **P5 do-something** — a non-empty exercise of the section's type (never an empty stub).
- **D2 reflective quartet** — `theory` carries a `Trade-offs:` block (strengths / weaknesses).
- **D1 persona / P3 tone** — second-person, informal; name the persona; no dry lecture voice.
- **P7 variety** — no 3 consecutive same type; all 6 types when N≥6.

## Voice (the hardest part — AM-15 risk #1)
The deterministic gate proves STRUCTURE; it cannot prove the course FEELS Head First. Write like you are
talking WITH the reader: surprise, a concrete running story, an "I'm smart!" payoff. If the Plane-2
review or the dogfood read comes back dry, iterate HERE (the KB + this prompt), not the gate.

## Citations
Every section's `methodPattern` must resolve to an id in `references/head-first-method.md`
(`resolveMethodPatternIds`). Vary the cited ids across sections. Zero citations = grounding not wired
(the authoring test fails).

## Checkpoint `confirm-topics`
Show: topic list, each with its `interactiveType` + cited pattern id + `source`. `"ok"` → gate.

# Head First method — shipped method-KB (distilled principles, page-anchored)

**What this is.** The single source of the "Head First" learning method for the tutorial-factory. The
authoring step READS this file at run time and, for every course section it writes, must cite at least
one pattern id (`P1`–`P12`, or a structural device `D1`–`D4`) whose principle the section serves. There
is NO rubric of the method hard-coded in the factory code — refining the method means editing this file,
not the code (ADR-001).

**Provenance & IP (ADR-004).** These are PARAPHRASED principles — methods and facts, which are not
copyrightable — distilled from the digitized corpus of *Head First. Архитектура ПО* (RU translation,
«Спринт Бук», 2025, ISBN 978-1-098-13435-8), corpus_version `f00db3e6f3ad1073`. Each `[p.N]` anchor
traces a principle back to a page in the local provenance corpus under
`features/package-tutorial-factory/research/head-first-corpus/` — which is gitignored and NEVER shipped.
No verbatim book expression appears here; the `scripts/shingling-check.mjs` gate proves zero verbatim
runs of >= 8 words against that corpus. Short device names in the source language are kept as short,
page-cited quotes only.

---

## The 12 brain-friendly patterns (`P1`–`P12`)

Each row is a design instruction for a course section, not a description of the book.

| id | pattern | design instruction (paraphrased principle) | page |
|----|---------|---------------------------------------------|------|
| **P1** | Visual-first | Lead a concept with a picture or diagram, and let the words live inside the visual rather than in a separate caption, so the reader wires text and image together. | [p.24], [p.26] |
| **P2** | Redundancy | Encode each key idea in more than one medium — prose, an exercise, and a check — so it lands in several places at once. | [p.26] |
| **P3** | Conversational tone | Address the reader directly, in second person and an informal register; avoid a dry lecture voice. | [p.25], [p.26] |
| **P4** | Surprise & emotion | Use the unexpected — a twist, a joke, a moment of "aha" — to make a point memorable; flat, even prose is easy to ignore. | [p.24], [p.26] |
| **P5** | Do-something | Give the reader something active to do for every idea; understanding is built by doing, not by watching. | [p.26] |
| **P6** | Multiple styles | Offer the same idea in more than one representation — a big-picture view, a step-by-step view, and a concrete artifact — so different learners each find a way in. | [p.26] |
| **P7** | Variety / both hemispheres | Alternate the KIND of activity across sections so attention is refreshed rather than fatigued. | [p.26] |
| **P8** | Stories & judgment | Frame material as a story and make the reader weigh options and decide; evaluation deepens retention. | [p.26] |
| **P9** | Open questions | Pose questions with no single easy answer, so the reader has to work for the insight. | [p.26] |
| **P10** | People & characters | Anchor the material in a human character the reader follows; attention favours people over abstractions. | [p.26] |
| **P11** | Metacognition | Signal that the material matters and prompt the reader to reflect on their own learning, using activity and feeling rather than dull repetition. | [p.25], [p.27] |
| **P12** | Sidebars are core | Treat asides, FAQs and callouts as required material, not decoration. | [p.27] |

## Structural devices (`D1`–`D4`)

| id | device | design instruction (paraphrased) | page |
|----|--------|-----------------------------------|------|
| **D1** | Running character | Thread ONE recurring example or persona through the whole course, as a character the reader roots for. | [p.13]–[p.18] |
| **D2** | Reflective quartet | Close each topic with a short trade-off reflection: its strengths, its weaknesses, a rating across quality attributes, and a one-line wrap-up. Source device names, cited: «Сверхвозможности» [p.13], «Слабые стороны» [p.14]. | [p.13]–[p.18] |
| **D3** | Do-it-yourself | Include at least one section where the reader plays the role and makes the decisions — open-ended synthesis, no single right answer. | [p.16] |
| **D4** | Show me the code | Cash every piece of theory out into a concrete, inspectable artifact rather than leaving it abstract. | [p.17] |

---

## Mapping the method onto the edu-site render target (the design bridge)

The `edu-site-generator` primitives carry the method. This map is load-bearing for the factory
(`modules/02-author-course.md`) and is re-asserted mechanically by `scripts/headfirst-gate.mjs`.

| method pattern | edu-site primitive that carries it |
|----------------|------------------------------------|
| P5 Do-something, P9 Open questions | the 6 exercise types: `quiz`, `flashcards`, `matching`, `drag-and-drop`, `builder`, `scenario` |
| P2 Redundancy | each concept appears in `theory`, in its section exercise, and in the `finalTest` (three encodings) |
| P4 Surprise & emotion, P11 Metacognition | gamification: points, achievements, unlock toasts, progress bar |
| P6 Multiple styles | `theory` (big picture) + a `builder`/`ordering` exercise (step-by-step) + a `scenario` (story) |
| P8 Stories, P10 People, D1 Running character | `scenario` exercises + a course-level persona referenced across sections |
| D2 Reflective quartet | a mandatory trade-offs block inside each section's `theory` (a checkable marker) |
| P3 Conversational tone | `theory` written in second person, informal (graded by the Plane-2 review) |
| P12 Sidebars-are-core | the FAQ accordion (`faqData`) + `explanation` fields treated as required |

**Honest medium gap (recorded, not faked).** P1 "words inside the picture" cannot be fully carried by
edu-site, which is emoji-iconed text rather than an illustrated book. The factory approximates P1 with a
distinct per-section emoji icon plus a diagram-in-`theory`, and records the gap (degradation D-1) rather
than claiming full coverage.

---

## Pattern index (machine-resolvable ids)

Authoring citations and `headfirst-gate.mjs` resolve against exactly these ids:

`P1 P2 P3 P4 P5 P6 P7 P8 P9 P10 P11 P12 D1 D2 D3 D4`

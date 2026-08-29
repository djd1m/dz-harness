# Generic course skeleton (v0 base)

A blank v0 the authoring step specializes with the package's own Concept Brief. It is deliberately
neutral — the factory REPLACES every placeholder with real, package-specific content; a skeleton left
un-specialized fails the deterministic gate (empty exercises, no persona reference), which is the
intended safety net.

The v0 has exactly the load-bearing structure the gate checks, so a course that starts here and gets
filled in is compliant by construction:

- **Persona (D1):** pick ONE running character tied to the package's domain (e.g. a developer adopting
  the tool). Reference the persona by name in the majority of section `theory` blocks.
- **Section rhythm (P7):** vary `interactiveType` so no 3 consecutive sections share a type; when the
  course has >= 6 sections, use all 6 types at least once.
- **Per section (P2 + P5 + D2):** one `keyConcept`; `theory` that names the concept, contains a
  `Trade-offs:` block (strengths / weaknesses), and references the persona; one non-empty exercise of
  the section's type; one `finalTest` entry.
- **Gamification (P4/P11):** >= 8 achievements over valid store state, including the standard 5.
- **FAQ (P12):** 5–8 `faqData` entries.
- **Do-it-yourself (D3) + Show-me-the-code (D4):** at least one `scenario`/`builder` section where the
  reader makes the decisions, and concrete artifacts (commands, config, code) in `theory`/exercises.

Citations: every section carries a `methodPattern` id from `references/head-first-method.md`. Vary the
cited ids across sections (e.g. draw from `P2`/`P3`/`P5`/`P8`) rather than repeating one id everywhere.

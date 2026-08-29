# Method → edu-site contract map

This is the operational bridge the authoring step follows to turn a *Concept Brief* (from
`scripts/extract-brief.mjs`) into **edu-site Step-0 course data** that also satisfies the deterministic
`headfirst-gate.mjs`. It targets edu-site's LIVE data contract (`src/data/*.js` as documented in
`edu-site-generator/references/data-schemas.md`), not its stale README.

## The produced course object (canonical shape)

The factory authors ONE JSON object. It is simultaneously (a) an edu-site Step-0 object and (b) the
input the gate checks. Fields:

```jsonc
{
  "language": "en" | "ru",
  "courseTitle": "string",
  "courseDescription": "string",
  "persona": { "name": "string", "description": "string" },   // D1 running character
  "finalTestPassThreshold": 70,                                // >= 70 (edu-site contract)
  "topics": [ /* Step-0 lightweight projection, see below — derivable from sections */ ],
  "sections": [
    {
      "id": "kebab-case-unique",
      "order": 1,
      "title": "1. Full Title",
      "shortTitle": "Short",
      "description": "one line",
      "icon": "🧭",                          // distinct per section (P1 approximation)
      "interactiveType": "quiz|flashcards|matching|drag-and-drop|builder|scenario",
      "keyConcept": "the one idea this section teaches",
      "theory": "second-person prose … Trade-offs: strengths … weaknesses … <persona name> …",
      "exercise": { /* type-specific payload, see edu-site data-schemas.md */ },
      "quiz": [ { "id": "...", "question": "...", "options": ["","","",""], "correctAnswer": 0, "explanation": "..." } ],
      "finalTest": { "id": "final-<id>", "sectionId": "<id>", "question": "...", "options": ["","","",""], "correctAnswer": 0 },
      "methodPattern": "P5"                   // >= 1 id from references/head-first-method.md
    }
  ],
  "achievements": [ { "id": "first-step", "title": "...", "description": "...", "icon": "🏆", "conditionRef": { "type": "sections-completed", "n": 1 } } ],
  "faqData": [ { "question": "...", "answer": "..." } ]
}
```

### Step-0 projection (`topics[]`, ADR-001)

`topics[]` is the lightweight view edu-site's Step-0 consumes; it is derivable from `sections[]` (the
factory writes it explicitly so a caller who only wants Step-0 can stop early):

```jsonc
{ "id": "<section.id>", "title": "<section.title>", "keyConcepts": ["<keyConcept>", "..."],
  "suggestedExercise": "<section.interactiveType>", "methodPattern": "<section.methodPattern>",
  "source": "<provenance pointer from the concept brief>" }
```

`scripts/course-schema.mjs` exports `toStepZero(course)` which computes this projection, and
`resolveMethodPatternIds(refFile)` which reads the shipped KB and returns the set of citeable ids.

## Exercise payloads by `interactiveType`

Follow `edu-site-generator/references/data-schemas.md` exactly. The gate only requires the payload be
present and non-empty for the section's declared type:

| interactiveType | non-empty means |
|-----------------|-----------------|
| `quiz` | `quiz[]` has >= 1 question with 4 `options` and an in-bounds `correctAnswer` |
| `flashcards` | `exercise.cards[]` has >= 1 `{front, back}` |
| `matching` | `exercise.pairs[]` has >= 1 `{left, right}` |
| `drag-and-drop` | `exercise.items[]` >= 2 and `exercise.correctOrder[]` covers them |
| `builder` | `exercise.parts[]` >= 1 and `exercise.correctCommand` present |
| `scenario` | `exercise.steps[]` >= 1, each with `options[]` |

## Achievement `conditionRef` types (JSON-safe)

edu-site achievements are functions; a produced JSON course cannot carry a function, so the factory
emits a declarative `conditionRef` the renderer compiles into a `condition`. Valid types (the gate
checks the type is known and any number is finite + in range):

`sections-completed` (`n` >= 1) · `all-sections` · `perfect-section` · `final-test-pass` (`min` in
`[0,100]`) · `section-group` (`ids[]`).

Minimum **8** achievements, including the standard set (`first-step`, `halfway`, `perfectionist`,
`full-course`, `test-passed`) plus >= 3 topic-specific ones.

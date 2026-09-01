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

## Readability + provenance requirements (owner findings 2026-08-31)

- **Theory is STRUCTURED, never a wall of text.** The renderer supports blank-line paragraphs,
  `1.` ordered lists, `- ` bullet lists, `**bold**`, `` `code` `` and `[label](https://…)` links —
  use them: short paragraphs, a list for any step sequence, bold for the pivot sentence. The gate
  enforces the floor (`structural.theory-readable`: a 700+ char theory needs ≥2 paragraph breaks);
  good authoring goes beyond the floor.
- **A published package gets its links.** If the target package is on npm, the install/overview
  section MUST link its npm page (`https://www.npmjs.com/package/<name>`) and its public
  repository/mirror when one exists. A course that names a package without linking it strands the
  reader.

## Language quality (owner rule, 2026-08-31 — Russian courses)

- **Никакого косноязычия и калек.** Каждая фраза обязана звучать так, как её произнёс бы живой
  носитель. Пойманный образец дефекта: «первый её вопрос был твоим же» — калька; по-русски:
  «её первый вопрос был таким же, как у тебя». Приём проверки: прочитай фразу вслух — если так
  не говорят, переформулируй.
- **Англицизмы — только там, где они термины**: имена команд (`dz init`), названия пакетов,
  устоявшиеся понятия без русского эквивалента. «Воркфлоу» → «конвейер»/«петля», «чекнуть» →
  «проверить», «флоу» → «путь». Слово, у которого есть естественный русский эквивалент,
  обязано им быть.
- **Авторские и литературные стадии русскоязычного курса выполняет самая сильная доступная
  литературная модель**, а не модель по умолчанию: экономия на модели здесь напрямую видна
  читателю. Порядок выбора (падение по цепочке — только при реальной недоступности предыдущей):
  1. **Fable** (Claude) — основной литературный редактор.
  2. **gpt-5.6-sol** (Codex/OpenAI) — запасной: вызов строго по дисциплине codex-invoke
     (промпт ФАЙЛОМ, никогда аргументом; таймаут; пустой вывод = отказ, не успех). В промпте —
     те же правила стиля, что выше, включая эталонный образец дефекта; правку sol принимать
     только после контрольного прогона headfirst-гейта.
  3. Другая доступная модель того же класса — с честной пометкой в quality-отчёте курса, кто
     выполнял литературную стадию.
  Кто бы ни правил, машинно-проверяемые свойства курса (имя персонажа в каждой секции,
  правильные ответы, структура JSON, `language`) неприкосновенны — гейт перепрогоняется после
  каждой литературной правки.

## Diagrams (optional, `section.diagram`)

A section may carry ONE flow diagram, declared as DATA — never as markup:

```json
"diagram": {
  "kind": "flow",
  "title": "Шесть фаз пути",
  "cycle": true,
  "nodes": [
    { "id": "discover", "label": "Discover", "note": "что вообще есть" },
    { "id": "install",  "label": "Install",  "note": "разверни рабочее место" }
  ]
}
```

Shape (the gate refuses anything else): `kind` is `"flow"`; `title` 1–80 chars; `cycle` optional
boolean; 2–8 `nodes`; each node's `id` is kebab-case and unique; `label` 1–24 chars; `note` optional, ≤80.
An **unknown key is refused, not ignored** — a silently dropped typo is a diagram that never
appeared and an author who never learnt why.

**Four kinds, because content has four shapes.** The first version shipped only `flow`, and the
result was measurable: 2 diagrams in a 14-section course and 5 in a 17-section one — not because the
criterion was strict, but because everything that was not a sequence had nothing to be drawn WITH.
Asking "what can I draw?" instead of "what must the reader hold?" is the mistake the kinds below fix.

| kind | the shape it draws | reach for it when the text is about |
|---|---|---|
| `flow` | steps leading to each other, optionally `cycle: true` | order in time: what happens first, then, then |
| `compare` | columns of options, each with `note` and up to 5 `items` | a CHOICE: two or three ways, each with what you gain and what you pay |
| `scale` | rungs where vertical POSITION is the meaning (`topLabel`/`bottomLabel`) | a gradient: cheaper↔dearer, louder↔silent, stronger↔weaker |
| `parts` | a `whole` above, its required parts joined below | composition: remove one part and the whole stops working |

Mark the load-bearing entry using `"accent": true` — one per diagram, never more, or the emphasis
stops meaning anything.

**When a diagram earns its place.** The test is NOT "is there a sequence here". It is: **must the
reader hold a structure that the text is forced to deliver linearly?** Prose is always a line; a
diagram is worth its space exactly when the content is not. A ladder, a choice, a composition and a
cycle are all non-linear — and all four now have a shape.

**Two rules that keep it honest.** Never decoration, and never the sole carrier of a fact: if
something exists only in the picture, a reader who skips it loses it. And ask the removal question
before shipping — take the diagram away; if nothing is lost but prettiness, it was not needed. "No
diagram in this section" stays a legitimate answer, which is why the gate never requires one.

**Why there is no author markup.** Labels are inserted as TEXT, so `<script>` in a label shows up as
those letters. This is deliberate: cross-model review measured a hand-written SVG reaching the
network through `<image href>` while the verifier stayed green, so the seam was removed rather than
filtered. `verify-site` asserts that a rendered box never carries raw markup, and that check goes red the day
someone reintroduces an HTML insertion path.

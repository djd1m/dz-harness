# @dzhechkov/harness-presets

Named **skill-set presets** for `dz init --preset <name>`.

A preset is a curated selection of skill ids. `dz init` reads skills from a
source directory (`--skills-dir`) and a preset narrows the install to just the
listed skills.

| Preset | Skills |
|---|---|
| `meta` | 20 development-process skills — `explore`, `feature-adr`, `knowledge-extractor`, `capture-adr`, `decision-mockups`, … |
| `qe-engineer` | a quality-engineering set (`qe-test-generation`, `qe-coverage-analysis`, …) |

```bash
dz init --preset qe-engineer --target codex --skills-dir .claude/skills
```

Presets are defined as a typed TypeScript module (`src/presets.ts`) — importable
and type-checked. More presets land as more skill packs are curated.

## Status

`0.5.14` — stable. **New in 0.5.14:** `decision-mockups` joins the `meta` preset (19 → 20 skills).
A preset id is only honest if the pack backing it SHIPS the skill, so this entry lands together with
`@dzhechkov/skills-meta@0.9.42`, which vendors it.

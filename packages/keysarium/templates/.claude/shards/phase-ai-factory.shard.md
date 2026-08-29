# AI Factory Mode — Governance Shard

## Activation
This shard is active ONLY when `/casarium --ai-factory` flag is present.
Without `--ai-factory`: this shard is completely ignored.

## Skill
Load: `.claude/skills/ai-factory-mapper/SKILL.md` at init, before Phase 0.
Also load: `.claude/skills/ai-factory-mapper/references/catalog.md` (cache in working memory).

## Variable
`{AI_FACTORY_MODE}` = `true` — set at casarium init when flag detected.

## Per-Phase Integration

### Phase 0 — Discovery
After standard JTBD + competitor analysis completes:
- Identify which AI Factory service tiers map to each JTBD segment (Advisory, based on cached catalog.md).
- Add section `## AI Factory Applicability` to `00_product_discovery.md`:
  - 2–3 sentences: which platform layer (Foundation Models / ML Inference / Managed RAG / AI Agents / AI Workflows) is most relevant.
  - No deep analysis yet — this is orientation only.

### Phase 1 — Explore
After case brief is written:
- Add 1-paragraph note to `01_case_brief.md`: which AI Factory capabilities are likely load-bearing for the proposed solution.
- Set `{AI_FACTORY_SCENARIO}` = concise 2–3 sentence description of the case as an AI Factory scenario (used in Phase 3).

### Phase 2 — Research
After standard research completes:
**Run ai-factory-mapper Phases 1–3** (catalog sync + decomposition + mapping):
1. Read `.claude/skills/ai-factory-mapper/references/catalog.md`.
2. Run `web_search "Cloud.ru Evolution AI Factory новые сервисы {CURRENT_YEAR}"` to check for updates.
3. Decompose `{AI_FACTORY_SCENARIO}` into 7–12 workflow steps using `decomposition-checklist.md`.
4. Map each step → AI Factory service → ✅ / ⚠️ / ❌.
5. Create artifact: `researches/{CASE_NAME}/02.6_ai_factory_mapping.md`.

### Phase 2.5 — CJM Prototype
In each CJM variant (A / B / C / D):
- Annotate each CJM step with the AI Factory service that handles it (1 line per step).
- Use the mapping from `02.6_ai_factory_mapping.md` — no re-analysis needed.

### Phase 3 — Solve
After solution strategy is drafted:
**Run ai-factory-mapper Phases 4–5** (gap identification + coverage scoring):
1. Enumerate all ❌ and ⚠️ steps from `02.6_ai_factory_mapping.md`.
2. For each gap: what is missing, why, and the 5 closure options (a–e from skill).
3. Apply `coverage-formula.md` → round to nearest 5%.
4. Add section `## AI Factory Coverage` to `03_solution_strategy.md`:
   - Coverage score (e.g. "~75%")
   - Top 2–3 priority gaps with closure recommendations.

### Phase 4 — Architecture
In architecture diagrams:
- C4 Container diagram: show AI Factory services as named external systems or containers (use their official names: "Cloud.ru Foundation Models", "Cloud.ru Managed RAG", etc.).
- Add `diagrams/ai-factory-pipeline.mermaid` — flowchart of the solution pipeline mapped to AI Factory services (reuse Mermaid structure from ai-factory-mapper Phase 6 output).

### Phase 5 — Presentation
**Run ai-factory-mapper Phase 6** (synthesis + full output):
1. Build structured JSON from the analysis accumulated across Phases 2–4.
2. Generate `ai_factory_analysis.md` (Markdown report per `assets/report-template.md`).
3. Attempt DOCX generation via `node .claude/skills/ai-factory-mapper/scripts/build_docx_report.js`.
4. Add "AI Factory Coverage" slide to presentation (`05_presentation_content.md`):
   - Coverage % badge, top services used, top gaps.
5. Add "Platform Architecture" talking point to `06_speaker_script.md`.

## Artifact Inventory (--ai-factory additions)

| Artifact | Phase | Always? |
|----------|-------|---------|
| `02.6_ai_factory_mapping.md` | Phase 2 | ✅ |
| `diagrams/ai-factory-pipeline.mermaid` | Phase 4 | ✅ |
| `ai_factory_analysis.md` | Phase 5 | ✅ |
| `ai_factory_analysis.docx` | Phase 5 | If Node.js + docx available |

## Promise Tags

| Milestone | Promise |
|-----------|---------|
| Phase 2 mapping done | `<promise>AI_FACTORY_MAPPED</promise>` |
| Phase 3 gap analysis done | `<promise>AI_FACTORY_GAPS_IDENTIFIED</promise>` |
| Phase 5 report done | `<promise>AI_FACTORY_REPORT_READY</promise>` |

## Quality Gates

- [ ] Catalog sync performed (web_search + catalog.md read)
- [ ] Scenario decomposed into 7–12 steps (not more, not less)
- [ ] Every step has ✅ / ⚠️ / ❌ (no "probably")
- [ ] Coverage % rounded to 5%
- [ ] `02.6_ai_factory_mapping.md` exists before Phase 3 starts
- [ ] CJM variants annotated with AI Factory services (Phase 2.5)
- [ ] `ai-factory-pipeline.mermaid` valid Mermaid syntax

## Model Routing

| Task | Model |
|------|-------|
| Catalog sync + decomposition | sonnet |
| Mapping + gap analysis | sonnet |
| Coverage scoring | haiku |
| Report synthesis | sonnet |
| DOCX generation | haiku (Node.js subprocess) |

## Non-Degradation Contract

This shard MUST NOT be loaded when `--ai-factory` is absent.
All `--ai-factory` additions are purely additive:
- Existing phase artifacts are extended (new sections appended), never replaced.
- Existing checkpoints are unchanged; AI Factory checkpoint is appended at the end of Phase 2 and Phase 5 checkpoints.
- Phase timing remains the same; AI Factory work is parallelised where possible (e.g. alongside Phase 2 research agents).

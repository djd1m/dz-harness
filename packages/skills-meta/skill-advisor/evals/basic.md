# Evals: skill-advisor

All recommended names below are REAL catalog entries. At runtime they must be
re-verified against `dz registry` (rule SA-001 / SA-004).

## Eval 1: Trip-site task → npx toolkit wins
**Input:** "Сделай интерактивный сайт-маршрут по городу" (interactive city-route website)
**Expected:**
- PRIMARY recommendation `trip-planner`, type `npx-package`, fit `high`,
  install `npx @dzhechkov/trip-planner init`.
- `explore`, `goap-research-ed25519`, `frontend-design` as complements (skill).
- `pipeline` present and ordered (e.g. explore → trip-planner → frontend-design).
- gaps array non-empty (e.g. "no live-transit API skill").

## Eval 2: Security-audit task → agentshield
**Input:** "Проверь мой .claude конфиг на безопасность" (audit .claude config security)
**Expected:**
- `agentshield-scan`, type `skill`, fit `high`, install `dz init --select agentshield-scan`.
- Optionally `meta` preset (`dz setup --preset meta`) and `security-audit` as follow-up.
- gaps notes that agentshield scans configs not app source code.

## Eval 3: Vague task → defer to explore first
**Input:** "Помоги мне с моим продуктом" (help me with my product — no concrete deliverable)
**Expected:**
- Skill recognizes the task is underspecified and recommends running `explore` FIRST
  (skill, install `dz init --select explore`) before producing a full ranked list.
- Does NOT fabricate a confident pipeline from a vague request.

## Eval 4: No-fit task → honest gap + /bto-build
**Input:** "Сгенерируй музыкальный трек из текста" (generate a music track from text)
**Expected:**
- No `high`-fit recommendation (nothing in the arsenal covers audio generation).
- gaps array states the arsenal has no audio-generation skill and suggests
  `/bto-build` to author one, or `dz scout` to find an external source.
- Honest "low fit" or empty recommendations rather than a fabricated match.

## Eval 5: Toolkit-vs-loose-skills judgment
**Input:** "Проведи полное исследование рынка с проверкой источников" (full market research, source-verified)
**Expected:**
- For the full end-to-end job: `keysarium` (npx-package, high, `npx @dzhechkov/keysarium init`).
- For a single rigorous pass: `goap-research-ed25519` (skill, high) as the loose-skill
  alternative, with the rationale explaining the toolkit-vs-skill trade-off.
- gaps array present (may be empty after an explicit check).

## Eval 6: Test-writing task → QE skills + pipeline
**Input:** "Напиши тесты для модуля auth" (write tests for the auth module)
**Expected:**
- `qe-test-generation` and `test-writer` (skill, high).
- `qe-engineer` preset (`dz setup --preset qe-engineer`) when more than authoring is needed.
- `pipeline`: qe-test-generation → qe-test-execution → qe-coverage-analysis.
- Improves over `dz recommend` by ordering the QE steps, not just listing matches.

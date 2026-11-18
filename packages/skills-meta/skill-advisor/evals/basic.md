# Evals: skill-advisor

All recommended names below are REAL catalog entries. At runtime they must be
re-verified against `dz registry` (rule SA-001 / SA-004).

## Eval 1: Trip-site task → one covering toolkit
**Input:** "Сделай интерактивный сайт-маршрут по Казани для взрослых на выходные; город, аудитория и сроки решены. Какой первый инструмент?"
**Expected:**
- PRIMARY recommendation `trip-planner`, type `npx-package`, fit `high`,
  install `npx @dzhechkov/trip-planner init`.
- No required `explore` step because inputs are settled. Optional `frontend-design`
  applies only if later UI polish is requested and stays outside `pipeline`.
- `pipeline` may be omitted; a singleton `trip-planner` is also valid.
- gaps array non-empty (e.g. "no live-transit API skill").

## Eval 2: Security-audit task → agentshield
**Input:** "Проверь мой .claude конфиг на безопасность" (audit .claude config security)
**Expected:**
- `agentshield-scan`, type `skill`, fit `high`, install `dz init --select agentshield-scan`.
- Optionally `meta` preset (`dz setup --preset meta`); `security-audit` only if app
  source code is also in scope. Neither becomes a required pipeline step for config scanning.
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
- `qe-test-generation` (skill, high); `test-writer` may be an alternative.
- `qe-engineer` preset (`dz setup --preset qe-engineer`) when more than authoring is needed.
- No `qe-test-execution` or `qe-coverage-analysis` in the required `pipeline` for a
  test-authoring-only request; those are conditional on a later execution/coverage request.

## Eval 7: Exact issue #27 → one first skill, bounded caveat
**Input:** "The first skill should cover my feature from requirements through design and checks. Which skill should I use first? Give at most one caveat."
**Expected:**
- `feature-adr` is the sole first-set recommendation, type `skill`, fit `high`,
  with the matching `dz init --target claude-code --select feature-adr` command.
- Explain that its internal flow covers requirements, design, implementation, and checks.
- Omit `pipeline`, or use only `["feature-adr"]`; do not add optional complements.
- `gaps` is present and contains at most one material caveat. No speculative list of options.

## Eval 8: Paired condition → unresolved requirements
**Input:** "I need to build a feature, but I have not decided the user, outcome, or acceptance criteria. What should run first, then carry it through design and checks?"
**Expected:**
- `feature-adr` ranks as the high-fit end-to-end skill; `explore` is a lower-fit but
  explicitly necessary prerequisite for the unresolved user, outcome, and criteria.
- `pipeline` is `["explore", "feature-adr"]` with both names in `recommendations`.
- Explain why clarification must finish before the feature flow; this is the negative
  control against always recommending only `feature-adr`.

## Eval 9: Paired condition → resolved requirements
**Input:** "I need to build a feature. The user, outcome, and acceptance criteria are already decided. What should run first to carry it through design and checks?"
**Expected:**
- `feature-adr` is the sole required recommendation. Do not require `explore`.
- Omit `pipeline`, or use only `["feature-adr"]`.

## Eval 10: Real research prerequisite before design
**Input:** "Build a feature that calculates a filing deadline under the current local rules. I have acceptance criteria, but the applicable jurisdiction and deadline rules must be verified before design. Which skills should I use?"
**Expected:**
- `feature-adr` ranks high for the full feature; `goap-research-ed25519` is a required
  prerequisite to establish the external facts. State the missing jurisdiction/rules.
- `pipeline` is `["goap-research-ed25519", "feature-adr"]` even if research ranks
  below `feature-adr` by fit. Both names occur in `recommendations`.
- An optional complement, if mentioned, remains outside the required `pipeline`.

## Eval 11: Optional complement requested, condition true
**Input:** "The city route and audience are settled. Start with the trip-site toolkit, and suggest a skill for extra visual polish afterward if useful."
**Expected:**
- `trip-planner` is the high-fit required first action.
- `frontend-design` may appear as a conditional optional recommendation for extra visual
  polish, with that condition stated in `why`; it does not appear in `pipeline`.
- `pipeline` is omitted or contains only `trip-planner`.

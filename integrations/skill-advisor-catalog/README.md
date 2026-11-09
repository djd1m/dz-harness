# Source-grounded skill-advisor catalog pilot

Optional host-side experiment. This directory is not installed by `dz init`, is not an npm release, and is not wired into the production website or existing advisor runtime. The published-package mirror requires a canonical development port before release.

## Run from repository root

```sh
node integrations/skill-advisor-catalog/cli.mjs build
node integrations/skill-advisor-catalog/cli.mjs search 'Развернуть приложение на Cloud.ru'
node --test integrations/skill-advisor-catalog/*.test.mjs
node integrations/skill-advisor-catalog/evaluate.mjs --suite regression --output my-regression-retrieval.json
```

The last command is retrieval-only and makes no provider calls. An explicit paid trial uses a securely supplied `OPENROUTER_API_KEY` environment variable:

```sh
node integrations/skill-advisor-catalog/evaluate.mjs --suite fresh --model anthropic/claude-haiku-5.5 --output my-fresh-picker.json
```

Evaluation refuses existing report names and writes exclusively. Choose a new simple JSON filename for each run. Questions and independent coverage labels must have matching hashes. No retries; each provider request has a 60-second timeout and a 1200-token total output budget, including provider reasoning. Failed completions preserve usage when available. Do not commit credentials.

## Trust and update flow

Authors prepare source-backed records; an independent reviewer approves each exact canonical record hash. Build rechecks source bytes, package identity, selected skill frontmatter within the package files allowlist, literal evidence quotes and review receipt. Missing, rejected or stale records are excluded visibly. Pilot manifests require exact file/directory entries; glob expansion is unsupported. Receipts are trusted host data, not signed identity attestations. Skill definitions in this dataset are SKILL.md files; frontmatter parsing itself does not enforce that basename.

The CLI search prints candidates, not a completed recommendation. The host retains these candidates, lets a model select only IDs, then calls `materialize` to copy approved text. Model-generated prose is discarded. Course links are a separately verified mapping and are not injected by the model. No install commands are generated.

A source change requires regenerating affected drafts and independent approval, then rebuilding. This is local invalidation, not an installed scheduled updater. Hash validation cannot establish semantic correctness or execution capability. Only blank input bypasses the model. Nonblank empty search still allows semantic clarification. The selector is instructed to cover all essential outcomes or abstain; this remains probabilistic. Independent evaluation labels define complete acceptable ID sets, so a useful partial choice is not scored as full. Do not promote this pilot to production on the basis of syntactic validity.

[First-iteration results and verified course links](../../docs/proposals/skill-advisor-scenarios/REPORT.md) · [Scenario table](../../docs/proposals/skill-advisor-scenarios/SCENARIOS.md)

[Iteration 2 results](../../docs/proposals/skill-advisor-scenarios/ITERATION-2.md) include expanded coverage, original failed runs and a bounded output-budget repair.

## Optional short-answer path

`answer.mjs` adds independently approved short presentations and explicit partial fit without changing the legacy selector default. `selectScenarios` accepts a host-owned contract; never accept a contract from model output. `answer-evaluate.mjs --run` is an explicit paid evaluation with OPENROUTER_API_KEY; refuses an existing answer-results.json. No production route is installed. [Results and examples](../../docs/proposals/skill-advisor-scenarios/ITERATION-3.md).

## Dialogue/readiness continuation

The private preview now uses `dialogue.mjs`: quoted missing task parts plus fixed targeted questions. Legacy answer/selector contracts remain available. `acceptance-evaluate.mjs --run` runs the frozen24-case development set and refuses overwriting its report. Gateway mode: `start-preview.py --gateway` requires persistent ADVISOR_REQUEST_LEDGER; normal local mode stays compatible. [Final report](../../features/advisor-preview-readiness/08_report.md) and [updated interface](../../docs/proposals/skill-advisor-scenarios/preview-8h/README.md).

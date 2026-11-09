# Source-grounded skill-advisor catalog pilot

Optional host-side experiment. This directory is not installed by `dz init`, is not an npm release, and is not wired into the production website or existing advisor runtime. The published-package mirror requires a canonical development port before release.

## Run from repository root

```sh
node integrations/skill-advisor-catalog/cli.mjs build
node integrations/skill-advisor-catalog/cli.mjs search 'Развернуть приложение на Cloud.ru'
node --test integrations/skill-advisor-catalog/catalog.test.mjs
node integrations/skill-advisor-catalog/evaluate.mjs
```

The last command is retrieval-only and makes no provider calls. An explicit paid trial uses a securely supplied `OPENROUTER_API_KEY` environment variable:

```sh
node integrations/skill-advisor-catalog/evaluate.mjs --model anthropic/claude-haiku-5.5
```

Evaluation overwrites its own report; preserve prior reports before experiments. No retries; each provider request has a 60-second timeout. Do not commit credentials.

## Trust and update flow

Authors prepare source-backed records; an independent reviewer approves each exact canonical record hash. Build rechecks source bytes, package identity, selected skill frontmatter within the package files allowlist, literal evidence quotes and review receipt. Missing, rejected or stale records are excluded visibly. Pilot manifests require exact file/directory entries; glob expansion is unsupported. Receipts are trusted host data, not signed identity attestations. Skill definitions in this dataset are SKILL.md files; frontmatter parsing itself does not enforce that basename.

The CLI search prints candidates, not a completed recommendation. The host retains these candidates, lets a model select only IDs, then calls `materialize` to copy approved text. Model-generated prose is discarded. Course links are a separately verified mapping and are not injected by the model. No install commands are generated.

A source change requires regenerating affected drafts and independent approval, then rebuilding. This is local invalidation, not an installed scheduled updater. Hash validation cannot establish semantic correctness or execution capability. Empty search currently bypasses the model, which can incorrectly reject ambiguous requests. Partial matches can also be misselected. Do not promote this pilot to production on the basis of syntactic validity.

[Results, limitations and verified course links](../../docs/proposals/skill-advisor-scenarios/REPORT.md) · [Scenario table](../../docs/proposals/skill-advisor-scenarios/SCENARIOS.md)

# Verification — 12 November 2026

## Observed checks

- Skill Creator `quick_validate.py`: valid name/frontmatter and no unfinished scaffold.
- `dz list --skills-dir ...`: discovers `repo-freshness` from this proposal.
- `dz init` to **two empty isolated projects**, Codex and OpenCode: exit 0; both copy
  the skill and its evidence reference. Reference bytes match the source. Explicit
  `--no-hooks --no-integrations`: no hook/MCP configuration created.
- All Markdown local links in this proposal resolve; six unique JSON fixture IDs parse.
- Independent forward test by **gpt-6.1-terra**: six requests, only the skill/reference
  and raw fixture inputs supplied. The evaluator was not given criteria or expected
  answers. [Actual answers](evals/forward-results.md). Parent compared those answers
  against [criteria](evals/criteria.md): 6/6 satisfy the stated case observations.

The cases cover a quiet supported library, migration and prerelease/stable split,
failed access, historical cutoff, README instruction injection and component-level
discontinued support inside an active monorepo. The evaluator explicitly identified
missing timestamps/revisions instead of inventing live retrievals. It found no skill
defect on this fixture set; this is bounded negative evidence, not proof of no defects.

## Limits

No real repository assessment, native runtime conversation, independent holdout,
full catalog-routing experiment, canonical package build, npm publication or signature
refresh was performed. Installation evidence proves file projection/discovery, not
host skill invocation or semantic quality. Six authored synthetic cases are not a
validated trust tier or a safety guarantee. This remains an unreleased candidate.

Before release, port into the private canonical source and run that project's current
pack/discovery/target/release checks. Recheck duplicate inventory at that revision.

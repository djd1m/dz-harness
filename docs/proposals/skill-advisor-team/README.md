# Skill advisor: bounded agent team

The advisor now separates selection from evidence review. A reviewer can request
one minimal correction; the entire changed answer must receive a new review. The
host withholds failed, stale, oversized or incomplete outputs. This addresses the
observed pattern where a corrective editor fixes one unsupported claim and adds
another, while lengthening a short recommendation.

## Included

- Concise native skill entrypoint with an explicit team protocol and first-set example.
- Dependency-free `runAdviceTeam` host helper for native OpenCode skill advice.
- Reused catalog/installation and evidence-binding gates, with regression tests.
- Historical E2B evidence, editor experiment, BTO measurements and cross-model review.

The host must supply candidate sources, independently isolated model adapters and
verified course mappings. Generic Claude Code use remains documented; the executable
helper generates OpenCode skill installation commands only. This is not a website
integration, packaged model client, npm release or guaranteed factual validator.

## Run checks

```sh
node --test packages/skills-meta/skill-advisor/evals/*.test.mjs
dz list --skills-dir packages/skills-meta
dz info skill-advisor --skills-dir packages/skills-meta
```

See [plan and ADR](plan.md), [independent review](review.md), and [BTO report](BTO_REPORT.md).
The repository mirrors published package surfaces: port accepted canonical changes
through the development/release pipeline before regenerating manifests and publishing.

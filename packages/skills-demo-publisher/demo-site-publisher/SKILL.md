---
name: demo-site-publisher
description: >
  Record repeatable product demonstrations from JSON scenarios, assemble Russian-captioned video,
  build a static HTML5 video site, enforce repository budgets, and publish the approved result to
  GitHub Pages. Use for "запиши демо", "собери сайт с видео", "record a product demo", or
  "publish demo to Pages". Do not use for confidential screens or an unapproved public release.
allowed-tools: Read, Grep, Glob, Edit, Write, Bash
trust_tier: 1
trust_tier_label: "Structured"
---

# Demo site publisher

Resolve `SKILL_ROOT` to the directory containing this file. All commands below use paths under that
directory. The workflow refuses missing media capabilities, remote navigation in offline mode,
oversized output, confidential slugs, and publication without an owner sanction.

## Workflow

1. Read `modules/01-scenarios.md`, copy `references/example-demo.json`, and create the set config.
2. Run preflight, then record into an empty working directory:
   `node "$SKILL_ROOT/scripts/preflight.mjs"` and
   `node "$SKILL_ROOT/scripts/record-demo.mjs" --demo demo.json --config demo-site.config.json --out out/recording`.
3. Read `modules/03-montage.md`; render cards and build the montage with the fixed MP4 profile.
4. Render and verify the site as described by `modules/04-site.md`.
5. Run the size and clean-room gates from `modules/05-budget-publish.md` and `modules/06-smoke-cleanroom.md`.
6. Only after the owner supplies sanction text, run `publish-demo.mjs`; retain its positive delivery receipt.

## Exit codes

| Code | Meaning |
|---:|---|
| 0 | completed |
| 1 | execution failed |
| 2 | arguments or JSON invalid |
| 3 | media budget refused |
| 4 | required media/browser capability missing |
| 5 | site contract invalid |
| 6 | clean-room or identifier gate failed |
| 7 | confidential scope or missing sanction |
| 8 | published bytes not verified live |
| 9 | required gate was inconclusive |

Never turn a refusal into a warning and never add a force flag. Publishing to npm is outside this skill.

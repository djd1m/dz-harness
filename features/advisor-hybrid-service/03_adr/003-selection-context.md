# ADR-003: Correct false capability gaps with source context
## Status
accepted for bounded evaluation.
## Context
x38 retrieved right card yet called alternatives missing. Source Context explicitly includes alternatives. A keyword patch would repair only today's sentence.
## Decision
Improve generic selection instruction: read supplied evidence and steps to interpret an already-promised outcome, including ordinary subparts; do not expand narrower outcomes using broad source quotes. Add an approved concise source excerpt for capture-adr Context to catalog evidence if current captured quote omits it; independent reviewer must approve updated record/presentation hashes. No hardcoded query phrase or forced recommend. Validate paraphrases and unsupported execution requests before/after change. Keep output renderer fixed.
## Alternatives
Force x38 response by keyword: brittle and unsafe. Always run another model: cost and extra opportunities to invent claims; not justified before fixing missing context. Ignore mistake: violates owner quality requirement.
## Consequences
Source/presentation approvals change only for affected record; catalog revision and snapshot must change. Probabilistic selector still has no 100% guarantee.
## Confirmation
`integrations/skill-advisor-catalog/hybrid-advisor.test.mjs` enforces trusted IDs/fallback/renderer. Frozen live questions include ADR context/alternatives, plan vs execute and unrelated tasks; report semantic review, not just schema passes.

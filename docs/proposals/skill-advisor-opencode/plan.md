# Skill-advisor OpenCode repair
Inputs read: canonical skill, output schema, declarative validate-config, adapter README and registry contract. No 03_adr or 05_architecture artifacts: S-tier localized skill fix.

## Goal state
Existing native adapter loads an OpenCode-aware skill; a small dependency-free guard validates and renders installation commands from the observed registry. This does not prove semantic ranking or toolkit runtime compatibility.

## Tasks
- TASK-1 (FR-1, NFR-1): Add an OpenCode section ahead of platform-specific examples. Preserve Claude examples for their own target, identify the current runtime, recommend registry skills for the tested OpenCode route. Reuse native adapter, registry envelope and existing output schema. No reusable executable matches_type validator was found; validate-config.json contains declarative rules only.
- TASK-2 (FR-2, FR-3, NFR-1): Add scripts/check-opencode-advice.mjs taking a registry file and a JSON draft file. Check the registry envelope, exact native skill identities, output field shapes and optional pipeline. Generate canonical install strings if absent; reject supplied wrong commands (A1), non-skill/unlisted names (A2), and unavailable/malformed registry (A3). Never execute suggested commands. Scope is native skill route only; toolkit support remains an explicit gap rather than inferred compatibility.
- TASK-3 (FR-3): Add node:test regressions with real failure inputs A1, A2 and A3, valid generated commands, preserved matching commands, invalid pipeline and malformed drafts. No npm package version/signature regeneration in a mirror PR.
- TASK-4 (NFR-2, FR-1, FR-2): Upload the patched skill through dz init in E2B, test feature/research/deployment synthetic questions, require native skill load and guard acceptance on the actual final JSON. Save failures and cleanup proof. Independent cross-model review before committing.

## Dependency order
TASK-1 → TASK-2 → TASK-3 → TASK-4. No parallel mutations.

## Risk assessment
Model may ignore JSON or target rules: rejected result is not displayed; report unsuccessful cases honestly. Native routes do not reproduce companion hooks/assets of full toolkits. Published mirror changes require integration in private source before an npm release. No site deployment or npm publication is included.

## Amendments
None.

EXPECTED_CODE_TARGETS:
- packages/skills-meta/skill-advisor/SKILL.md
- packages/skills-meta/skill-advisor/scripts/check-opencode-advice.mjs
- packages/skills-meta/skill-advisor/evals/opencode.test.mjs

## Semantic gate continuation
FR-4: Before presentation, a host-owned separate reviewer checks each rationale and caveat against caller-captured skill sources, plus task fit and pipeline consistency. FR-5: bind the verdict to exact normalized advice and sources; missing/invalid/incomplete/negative verdicts never release an answer. NFR-3: reuse structural checker; no installs, tools or autonomous retries in the reviewer; explicit uncertainty is rejection, not a claim of proof.
Implementation: dependency-free request/verdict helper and tests; opt-in OpenRouter smoke for saved erroneous answers and fresh native OpenCode answers. A source quote proves textual presence only; semantic entailment remains a fallible model judgment. No production host is wired in this candidate.

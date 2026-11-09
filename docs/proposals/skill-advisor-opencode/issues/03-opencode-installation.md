## Problem

Canonical skill-advisor installation advice mixes runtime-specific examples and native skill installation with whole-toolkit setup. Installing the skill via the existing OpenCode adapter succeeds, but that alone does not ensure the advisor recommends compatible commands.

Environment: harness-cli 0.8.61, skills-meta 0.9.75, OpenCode 1.19.4, E2B. In initial live trials, the advisor emitted plain npm toolkit init commands whose OpenCode target support had not been established. Replacing Claude target strings in a copied profile was insufficient.

## Distinctions to preserve

- The existing adapter-opencode emits SKILL.md and bundled scripts/references/assets. Do not describe native installation as omitting all scripts/assets.
- External executables and toolkit-level hooks/integrations require separate setup; copying a skill tree is not installing those dependencies.
- An ordinary external Go CLI does not need a special OpenCode installer merely because an OpenCode agent will call it.
- A provider registry is not a list of every published toolkit; absence is not evidence that the package does not exist.

## Acceptance

- Reuse the existing adapter and canonical skill rather than fork the advisor.
- Native picks generate explicit `dz init --target opencode --select <registry-id>` commands.
- Reject supplied wrong-target commands and fabricated names before presentation.
- Do not infer npm toolkit/preset runtime compatibility from package existence.
- Native skill-tool invocation, emitted files, structural validation and semantic quality are tested separately.
- Preserve other runtimes' valid examples for their own target.

A local candidate implements this bounded native route and tests; it is not yet pushed or published to npm. This repository mirrors published package surfaces, so accepted changes need porting into canonical development sources and normal signed release generation.

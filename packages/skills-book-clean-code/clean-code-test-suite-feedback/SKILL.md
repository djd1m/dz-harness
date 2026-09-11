---
name: clean-code-test-suite-feedback
description: >
  Используйте существующий Clean-Code тестовый набор как feedback о дизайне: readability, FIRST, независимость, fixtures, понятный язык сценариев, локальные coverage gaps и повторяющиеся failure patterns. NOT для risk-weighted cross-suite coverage program → qe-coverage-analysis; NOT для cross-run defect intelligence → qe-defect-intelligence; NOT для нового test design → test-design-techniques; NOT для authoring unit/integration/E2E → test-writer; NOT для race/liveness schedules → clean-code-concurrency-safety. NOT для полного feature/fix workflow — feature-adr.
trust_tier: 0
trust_tier_label: Machine-distilled from Clean Code (unreviewed)
derived_from: [clean-code-ch01-p32-ku08,clean-code-ch09-p151-ku01,clean-code-ch09-p153-ku02,clean-code-ch09-p153-ku03,clean-code-ch09-p154-ku04,clean-code-ch09-p155-ku05,clean-code-ch09-p156-ku06,clean-code-ch09-p160-ku07,clean-code-ch09-p162-ku08,clean-code-ch09-p164-ku09,clean-code-ch12-p202-ku02,clean-code-ch12-p206-ku08,clean-code-ch14-p247-ku03,clean-code-ch14-p250-ku05,clean-code-ch16-p305-ku02,clean-code-ch16-p306-ku03,clean-code-ch16-p307-ku04,clean-code-ch16-p319-ku17,clean-code-ch16-p321-ku20,clean-code-ch17-p325-ku03,clean-code-ch17-p355-ku13]
---
# Test suite feedback
## Protocol
1. Read the current suite as a behavioural contract. <!-- KU: clean-code-ch12-p206-ku08,clean-code-ch09-p153-ku03 -->
2. Locate coverage gaps and recurring failure patterns. <!-- KU: clean-code-ch17-p355-ku13,clean-code-ch16-p305-ku02 -->
3. Make scenarios readable, independent, repeatable and fast. <!-- KU: clean-code-ch09-p155-ku05,clean-code-ch09-p162-ku08 -->
4. Improve setup-operation-check structure and test vocabulary before the next change. <!-- KU: clean-code-ch09-p156-ku06,clean-code-ch09-p164-ku09 -->
## Anti-patterns
- Treating green tests or a coverage percentage as a complete explanation. <!-- KU: clean-code-ch16-p321-ku20,clean-code-ch17-p355-ku13 -->
- Slow, coupled fixtures that stop the suite being used as feedback. <!-- KU: clean-code-ch09-p162-ku08,clean-code-ch09-p155-ku05 -->
## Related decisions — generated from verified KU cross-link graph
- `clean-code-legacy-refactoring-loop`: consumes feedback for safe incremental change. <!-- XL: safe-incremental-refactoring -->

## Routing boundaries — agent adaptation, not from the book
- `clean-code-concurrency-safety`: owns schedule-dependent tests.
## Source
Inline KU markers are claim-level evidence; the computed all-assigned range below is candidate coverage/context, not evidence for every operational sentence.
Computed assigned-KU coverage (context, not claim-level evidence): глава 1: с. 32–33; глава 9: с. 151–164; глава 12: с. 202, с. 206; глава 14: с. 247, с. 250; глава 16: с. 305–307, с. 319, с. 321; глава 17: с. 325, с. 355–357.
## Anchor quotes

- «Первый закон. Не пишите код продукта, пока не напишете отказной модульный тест.» [с. 153] <!-- KU: clean-code-ch09-p153-ku02 -->

## Self-check — agent adaptation, not from the book
- Does a failing test identify one behavioural question?
- Can the suite run quickly enough to remain part of the loop?
Agent adaptation, not from the book: Example: inspect red/green patterns and uncovered branches before altering an existing suite.

## Local knowledge lookup — packaging adapter
Read [references/knowledge.md](references/knowledge.md) for the full assigned Knowledge Units and their source pages. This lookup ships with the skill.

## Output — agent adaptation, not from the book

Return the proposed decision or change, the supporting KU identifiers and source pages, the applicability limits relevant to this task, and the checks actually performed. Separate verified results from recommendations and untested assumptions. If the evidence does not support a decision, name the missing evidence instead of presenting it as verified.

---
name: clean-code-legacy-refactoring-loop
description: >
  Очищайте legacy-код при неполном понимании: сначала зафиксируйте наблюдаемое поведение test scaffold, затем делайте малые behavior-preserving шаги. NOT для generic refactoring cleanup → refactoring-patterns; NOT для feature/fix workflow → feature-adr; NOT для generic SOLID/TDD → solid; NOT для report-only diff review → pr-review. NOT для одного isolated naming/comment decision → clean-code-intent-and-comment-contract; NOT для одного isolated function-contract decision → clean-code-function-contracts; NOT для одного isolated object/data-ownership decision → clean-code-object-data-ownership.
trust_tier: 0
trust_tier_label: Machine-distilled from Clean Code (unreviewed)
derived_from: [clean-code-ch01-p25-ku01,clean-code-ch01-p26-ku02,clean-code-ch01-p27-ku03,clean-code-ch01-p28-ku04,clean-code-ch01-p29-ku05,clean-code-ch01-p30-ku06,clean-code-ch01-p30-ku07,clean-code-ch01-p34-ku09,clean-code-ch01-p34-ku10,clean-code-ch01-p35-ku12,clean-code-ch12-p202-ku03,clean-code-ch12-p203-ku04,clean-code-ch12-p204-ku05,clean-code-ch12-p204-ku06,clean-code-ch12-p206-ku07,clean-code-ch12-p207-ku10,clean-code-ch14-p234-ku01,clean-code-ch14-p246-ku02,clean-code-ch14-p247-ku04,clean-code-ch14-p269-ku06,clean-code-ch14-p270-ku07,clean-code-ch14-p273-ku08,clean-code-ch14-p276-ku09,clean-code-ch14-p278-ku10,clean-code-ch14-p287-ku11,clean-code-ch14-p287-ku12,clean-code-ch15-p289-ku01,clean-code-ch15-p291-ku02,clean-code-ch15-p303-ku09,clean-code-ch16-p304-ku01,clean-code-ch17-p323-ku01,clean-code-ch17-p328-ku05,clean-code-ch17-p340-ku06,clean-code-global-p38-p322-ku01]
---
# Legacy refactoring loop
## Protocol
1. Identify the smell; after a working result exists, establish a full runnable test suite before structural/refactoring improvement. <!-- KU: clean-code-ch17-p323-ku01,clean-code-ch12-p202-ku03,clean-code-ch14-p234-ku01 -->
2. Strengthen an existing executable contract. <!-- KU: clean-code-ch15-p289-ku01,clean-code-ch14-p247-ku04 -->
3. Make one reversible local change; run the relevant suite. <!-- KU: clean-code-ch14-p247-ku04,clean-code-ch14-p278-ku10 -->
4. Keep transitional design only while it enables the next safe step. <!-- KU: clean-code-ch14-p269-ku06,clean-code-ch15-p303-ku09 -->
## Anti-patterns
- A whole-module rewrite under incomplete understanding. <!-- KU: clean-code-ch12-p202-ku03,clean-code-ch14-p278-ku10 -->
- Criticising the previous author instead of improving the touched code. <!-- KU: clean-code-ch16-p304-ku01 -->
## Related decisions — generated from verified KU cross-link graph
- `clean-code-test-suite-feedback`: supplies feedback during safe incremental change. <!-- XL: safe-incremental-refactoring -->
- `clean-code-object-data-ownership`: responsibility boundaries shape incremental cleanup. <!-- XL: class-boundaries-responsibility-and-extension -->
## Source
Inline KU markers are claim-level evidence; the computed all-assigned range below is candidate coverage/context, not evidence for every operational sentence.
Computed assigned-KU coverage (context, not claim-level evidence): глава 1: с. 25–31, с. 34–35, с. 38; глава 12: с. 202–207; глава 14: с. 234, с. 246–249, с. 269–278, с. 287; глава 15: с. 289–291, с. 293–294, с. 303; глава 16: с. 304, с. 321–322; глава 17: с. 323, с. 328–329, с. 340–341.
## Anchor quotes

- «Код никогда не исчезнет, потому что код представляет подробности требований.» [с. 25] <!-- KU: clean-code-ch01-p25-ku01 -->

## Self-check — agent adaptation, not from the book
- Is this one local, reversible step with observed behaviour protected?
- Is a temporary compromise named and bounded?
Agent adaptation, not from the book: Example: extract one repeated operation, run the suite, then decide on the next change.

## Local knowledge lookup — packaging adapter
Read [references/knowledge.md](references/knowledge.md) for the full assigned Knowledge Units and their source pages. This lookup ships with the skill.

## Output — agent adaptation, not from the book

Return the proposed decision or change, the supporting KU identifiers and source pages, the applicability limits relevant to this task, and the checks actually performed. Separate verified results from recommendations and untested assumptions. If the evidence does not support a decision, name the missing evidence instead of presenting it as verified.

---
name: clean-code-source-layout
description: >
  Упорядочивайте файл, близость определений, отступы и командный формат, когда модуль трудно читать последовательно. NOT для имени/комментария — clean-code-intent-and-comment-contract; NOT для сигнатуры/эффекта — clean-code-function-contracts; NOT для post-diff review — pr-review.
trust_tier: 0
trust_tier_label: Machine-distilled from Clean Code (unreviewed)
derived_from: [clean-code-ch05-p104-ku02,clean-code-ch05-p105-ku03,clean-code-ch05-p106-ku04,clean-code-ch05-p106-ku05,clean-code-ch05-p107-ku06,clean-code-ch05-p108-ku07,clean-code-ch05-p109-ku08,clean-code-ch05-p110-ku09,clean-code-ch05-p112-ku11,clean-code-ch05-p112-ku12,clean-code-ch05-p113-ku14,clean-code-ch05-p114-ku15,clean-code-ch05-p115-ku16,clean-code-ch05-p117-ku17,clean-code-ch05-p118-ku18,clean-code-ch05-p118-ku19,clean-code-global-p103-p119-ku03,clean-code-global-p111-p113-ku04]
---
# Source layout

## Protocol

1. Put the reader’s entry point before supporting detail. <!-- KU: clean-code-ch05-p106-ku04,clean-code-global-p111-p113-ku04 -->
2. Keep related declarations and caller/callee close; minimise vertical search. <!-- KU: clean-code-ch05-p107-ku06,clean-code-ch05-p108-ku07,clean-code-global-p111-p113-ku04 -->
3. Use whitespace and indentation to show conceptual grouping; prefer keeping short blocks expanded. <!-- KU: clean-code-ch05-p106-ku05,clean-code-ch05-p114-ku15,clean-code-ch05-p117-ku17,clean-code-ch05-p118-ku18 -->
4. Adopt a small team convention and automate repeatable formatting. <!-- KU: clean-code-global-p103-p119-ku03 -->

## Anti-patterns

- Decorative horizontal alignment of fields or assignments, rather than considering splitting a class when a very long field/assignment list seems to require it (not hierarchy-bearing indentation); unnecessary spacing between closely related lines (separate unrelated ideas). <!-- KU: clean-code-ch05-p115-ku16,clean-code-ch05-p107-ku06 -->
- A personal format that breaks the team’s visual language. <!-- KU: clean-code-global-p103-p119-ku03 -->

## Related decisions — generated from verified KU cross-link graph

- `clean-code-intent-and-comment-contract`: top-down layout makes intent easier to read. <!-- XL: top-down-readable-module-layout -->
- `clean-code-function-contracts`: caller-before-callee supports an already-defined operation. <!-- XL: top-down-readable-module-layout -->

## Source

Inline KU markers are claim-level evidence; the computed all-assigned range below is candidate coverage/context, not evidence for every operational sentence.
Computed assigned-KU coverage (context, not claim-level evidence): глава 5: с. 103–119.

## Anchor quotes

- «Исходный файл должен выглядеть как газетная статья. Имя файла должно быть простым, но содержательным.» [с. 106] <!-- KU: clean-code-ch05-p106-ku04 -->

## Self-check — agent adaptation, not from the book

- Can a reader move from a call to the relevant implementation with a short scan?
- Does every blank line or indentation change mark a real boundary?

Agent adaptation, not from the book: Example: Move a private helper immediately below its first use instead of leaving it at a remote end of the class.

## Local knowledge lookup — packaging adapter
Read [references/knowledge.md](references/knowledge.md) for the full assigned Knowledge Units and their source pages. This lookup ships with the skill.

## Output — agent adaptation, not from the book

Return the proposed decision or change, the supporting KU identifiers and source pages, the applicability limits relevant to this task, and the checks actually performed. Separate verified results from recommendations and untested assumptions. If the evidence does not support a decision, name the missing evidence instead of presenting it as verified.

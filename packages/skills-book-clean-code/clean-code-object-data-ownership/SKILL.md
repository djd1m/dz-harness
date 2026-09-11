---
name: clean-code-object-data-ownership
description: >
  Решайте локально, кому принадлежат данные, операция или абстракция и нужен ли объект, структура, DTO либо фасад. NOT для generic SOLID — solid; NOT для system architecture — fundamental-software-architecture-guide; NOT для composition root — clean-code-architecture-assembly.
trust_tier: 0
trust_tier_label: Machine-distilled from Clean Code (unreviewed)
derived_from: [clean-code-ch06-p123-ku01,clean-code-ch06-p123-ku02,clean-code-ch06-p124-ku03,clean-code-ch06-p125-ku04,clean-code-ch06-p126-ku05,clean-code-ch06-p127-ku06,clean-code-ch06-p127-ku07,clean-code-ch06-p128-ku08,clean-code-ch06-p129-ku09,clean-code-ch06-p129-ku10,clean-code-ch06-p130-ku11,clean-code-ch06-p130-ku12,clean-code-ch10-p168-ku01,clean-code-ch10-p168-ku02,clean-code-ch10-p169-ku03,clean-code-ch10-p170-ku04,clean-code-ch10-p171-ku05,clean-code-ch10-p173-ku06,clean-code-ch10-p177-ku07,clean-code-ch10-p177-ku08,clean-code-ch10-p179-ku09,clean-code-ch10-p180-ku10,clean-code-ch16-p308-ku06,clean-code-ch16-p309-ku07,clean-code-ch16-p310-ku08,clean-code-ch16-p311-ku09,clean-code-ch16-p312-ku10,clean-code-ch16-p313-ku11,clean-code-ch16-p320-ku18,clean-code-ch16-p320-ku19,clean-code-ch17-p330-ku14,clean-code-ch17-p330-ku15,clean-code-ch17-p332-ku16,clean-code-ch17-p346-ku10,clean-code-ch17-p347-ku11]
---
# Object/data ownership
## Protocol
1. Name the responsibility and future change axis. <!-- KU: clean-code-ch10-p168-ku02,clean-code-ch10-p168-ku01 -->
2. Choose object, data structure, or DTO by the client contract. <!-- KU: clean-code-ch06-p124-ku03,clean-code-ch06-p129-ku10 -->
3. Move behaviour to its natural owner; hide representation and transitively reached details. <!-- KU: clean-code-ch06-p129-ku09,clean-code-ch06-p127-ku07,clean-code-ch17-p347-ku11 -->
4. Check cohesion before adding another responsibility. <!-- KU: clean-code-ch10-p170-ku04,clean-code-ch10-p171-ku05 -->
## Anti-patterns
- Hybrid object/data structures and train-wreck navigation. <!-- KU: clean-code-ch06-p128-ku08,clean-code-ch06-p127-ku07 -->
- Putting a value or operation where it is merely convenient. <!-- KU: clean-code-ch17-p332-ku16,clean-code-ch16-p310-ku08 -->
## Related decisions — generated from verified KU cross-link graph
- `clean-code-architecture-assembly`: compose the system from already-bounded modules. <!-- XL: system-composition-and-evolutionary-architecture -->
- `clean-code-legacy-refactoring-loop`: move ownership through safe incremental steps. <!-- XL: safe-incremental-refactoring -->
## Source
Inline KU markers are claim-level evidence; the computed all-assigned range below is candidate coverage/context, not evidence for every operational sentence.
Computed assigned-KU coverage (context, not claim-level evidence): глава 6: с. 123–131; глава 10: с. 168–171, с. 173–181; глава 16: с. 308–313, с. 320–321; глава 17: с. 330–335, с. 346–347.
## Anchor quotes

- «Скрытие реализации не сводится к созданию прослойки функций между переменными.» [с. 123] <!-- KU: clean-code-ch06-p123-ku01 -->

## Self-check — agent adaptation, not from the book
- Does the client need a behaviour or a representation?
- Does the chosen owner hold the data and reason for change?
Agent adaptation, not from the book: Example: replace traversal through another object’s internals with an operation on the direct collaborator.

## Local knowledge lookup — packaging adapter
Read [references/knowledge.md](references/knowledge.md) for the full assigned Knowledge Units and their source pages. This lookup ships with the skill.

## Output — agent adaptation, not from the book

Return the proposed decision or change, the supporting KU identifiers and source pages, the applicability limits relevant to this task, and the checks actually performed. Separate verified results from recommendations and untested assumptions. If the evidence does not support a decision, name the missing evidence instead of presenting it as verified.

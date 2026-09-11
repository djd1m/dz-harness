---
name: clean-code-error-and-boundary-handling
description: >
  Проектируйте контракт вызова при exception, null/пустом результате и отделяйте normal path от обработки сбоя; для внешнего API добавляйте local wrapper, диагностический catch-контекст и learning test. NOT для generic API test design → api-testing-patterns; NOT для test authoring — test-writer; NOT для runtime diagnosis — debugging; NOT для обычного object ownership — clean-code-object-data-ownership.
trust_tier: 0
trust_tier_label: Machine-distilled from Clean Code (unreviewed)
derived_from: [clean-code-ch07-p133-ku01,clean-code-ch07-p134-ku02,clean-code-ch07-p135-ku03,clean-code-ch07-p136-ku04,clean-code-ch07-p137-ku05,clean-code-ch07-p137-ku06,clean-code-ch07-p138-ku07,clean-code-ch07-p139-ku08,clean-code-ch07-p139-ku09,clean-code-ch07-p140-ku10,clean-code-ch07-p141-ku11,clean-code-ch07-p141-ku12,clean-code-ch07-p142-ku13,clean-code-ch08-p143-ku01,clean-code-ch08-p144-ku02,clean-code-ch08-p145-ku01,clean-code-ch08-p145-ku02,clean-code-ch08-p146-ku03,clean-code-ch08-p147-ku04,clean-code-ch08-p148-ku05,clean-code-ch08-p149-ku06,clean-code-ch08-p150-ku07]
---
# Error and boundary handling
## Protocol
1. Separate normal work from failure handling. <!-- KU: clean-code-ch07-p133-ku01,clean-code-ch07-p142-ku13 -->
2. Choose the catch reaction and include useful diagnostic context. <!-- KU: clean-code-ch07-p137-ku05,clean-code-ch07-p137-ku06 -->
3. Translate a foreign API behind a local facade; learn its real behaviour with tests. <!-- KU: clean-code-ch07-p138-ku07,clean-code-ch08-p146-ku03 -->
4. Use special cases or empty collections for normal absence; avoid passing null where possible in owned code, except when a third-party API requires it. <!-- KU: clean-code-ch07-p139-ku09,clean-code-ch07-p140-ku10,clean-code-ch07-p141-ku11,clean-code-ch07-p141-ku12 -->
## Anti-patterns
- Error codes that mix error handling into the normal path. <!-- KU: clean-code-ch07-p133-ku01,clean-code-ch07-p142-ku13 -->
- Leaking a vendor API or making every caller defend against null. <!-- KU: clean-code-ch07-p138-ku07,clean-code-ch07-p140-ku10 -->
## Related decisions — generated from verified KU cross-link graph
- `clean-code-test-suite-feedback`: use existing-suite feedback to expose an error contract. <!-- XL: unit-testing-tdd-and-test-quality -->
- `clean-code-object-data-ownership`: contain foreign detail behind a local boundary. <!-- XL: external-boundaries-and-learning-tests -->
## Source
Inline KU markers are claim-level evidence; the computed all-assigned range below is candidate coverage/context, not evidence for every operational sentence.
Computed assigned-KU coverage (context, not claim-level evidence): глава 7: с. 133–142; глава 8: с. 143–150.
## Anchor quotes

- «Код вызова становится более понятным, а его логика не скрывается за кодом обработки ошибок.» [с. 133] <!-- KU: clean-code-ch07-p133-ku01 -->

## Self-check — agent adaptation, not from the book
- Can a caller choose its reaction without knowing the foreign API?
- Is an absent ordinary result distinguishable without null?
Agent adaptation, not from the book: Example: translate library exceptions at one facade rather than across all callers.

## Local knowledge lookup — packaging adapter
Read [references/knowledge.md](references/knowledge.md) for the full assigned Knowledge Units and their source pages. This lookup ships with the skill.

## Output — agent adaptation, not from the book

Return the proposed decision or change, the supporting KU identifiers and source pages, the applicability limits relevant to this task, and the checks actually performed. Separate verified results from recommendations and untested assumptions. If the evidence does not support a decision, name the missing evidence instead of presenting it as verified.

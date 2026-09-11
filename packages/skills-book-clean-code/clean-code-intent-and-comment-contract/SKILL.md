---
name: clean-code-intent-and-comment-contract
description: >
  Выбирайте имя code-идентификатора, комментарий или Javadoc-контракт исходника, когда читатель не понимает намерение, роль либо несводимый контекст; переносите историю из header исходного файла в VCS. NOT для prose technical writing → technical-writing; NOT для UI header → frontend-implementation; NOT для external-client exception/null contract → clean-code-error-and-boundary-handling; NOT для арности, command/query, скрытого эффекта и порядка вызовов — clean-code-function-contracts; NOT для post-diff review — pr-review. NOT для generic SOLID-аудита — solid.
trust_tier: 0
trust_tier_label: Machine-distilled from Clean Code (unreviewed)
derived_from: [clean-code-ch01-p37-ku13,clean-code-ch02-p41-ku01,clean-code-ch02-p41-ku02,clean-code-ch02-p41-ku03,clean-code-ch02-p43-ku04,clean-code-ch02-p45-ku05,clean-code-ch02-p46-ku06,clean-code-ch02-p46-ku07,clean-code-ch02-p48-ku08,clean-code-ch02-p49-ku09,clean-code-ch02-p49-ku10,clean-code-ch02-p50-ku11,clean-code-ch02-p51-ku12,clean-code-ch02-p52-ku13,clean-code-ch02-p54-ku14,clean-code-ch02-p54-ku15,clean-code-ch04-p81-ku01,clean-code-ch04-p83-ku02,clean-code-ch04-p83-ku03,clean-code-ch04-p84-ku04,clean-code-ch04-p84-ku05,clean-code-ch04-p85-ku06,clean-code-ch04-p86-ku07,clean-code-ch04-p86-ku08,clean-code-ch04-p87-ku09,clean-code-ch04-p87-ku10,clean-code-ch04-p88-ku11,clean-code-ch04-p91-ku12,clean-code-ch04-p92-ku14,clean-code-ch04-p94-ku15,clean-code-ch04-p95-ku16,clean-code-ch04-p95-ku17,clean-code-ch04-p96-ku18,clean-code-ch04-p97-ku19,clean-code-ch04-p97-ku20,clean-code-ch04-p98-ku21,clean-code-ch04-p98-ku22,clean-code-ch04-p98-ku23,clean-code-ch04-p99-ku24,clean-code-ch04-p99-ku25,clean-code-ch17-p324-ku02,clean-code-ch17-p350-ku12,clean-code-global-p91-p307-ku02]
---
# Intent and comment contract

## Protocol

1. State what a reader must infer: role, intent, invariant, risk, or public contract. <!-- KU: clean-code-ch02-p41-ku01,clean-code-ch04-p84-ku04,clean-code-ch04-p85-ku06,clean-code-ch04-p87-ku09,clean-code-ch04-p99-ku24 -->
2. Prefer a precise domain name and clear structure over a comment that repeats mechanics. <!-- KU: clean-code-ch02-p41-ku02,clean-code-ch02-p48-ku08,clean-code-ch04-p83-ku03 -->
3. Keep a comment only for motive, non-obvious constraint, hazard, or public API obligation. <!-- KU: clean-code-ch04-p84-ku04,clean-code-ch04-p85-ku06,clean-code-ch04-p87-ku09,clean-code-ch04-p99-ku24 -->
4. Move change history to VCS; remove disabled code; keep licence/copyright notices required by the source. <!-- KU: clean-code-global-p91-p307-ku02,clean-code-ch04-p96-ku18,clean-code-ch04-p83-ku02 -->

## Anti-patterns

- Type prefixes, vague class/object role labels, jokes, and names that require decoding. <!-- KU: clean-code-ch02-p46-ku07,clean-code-ch02-p48-ku08,clean-code-ch02-p49-ku09,clean-code-ch02-p49-ku10 -->
- A comment that narrates obvious code or needs another comment to explain it. <!-- KU: clean-code-ch04-p88-ku11,clean-code-ch04-p92-ku14,clean-code-ch04-p98-ku22 -->

## Related decisions — generated from verified KU cross-link graph

- `clean-code-function-contracts`: align the function name with its role and observed effect. <!-- XL: identifier-intent-vocabulary-and-context -->
- `clean-code-legacy-refactoring-loop`: make naming changes within incremental cleanup. <!-- XL: extract-domain-concepts-through-naming -->

## Routing boundaries — agent adaptation, not from the book

- Post-diff review routes to `pr-review`.

## Source

Inline KU markers are claim-level evidence; the computed all-assigned range below is candidate coverage/context, not evidence for every operational sentence.
Computed assigned-KU coverage (context, not claim-level evidence): глава 1: с. 37–38; глава 2: с. 41–55; глава 4: с. 81–102; глава 16: с. 307; глава 17: с. 324–325, с. 350–354.

## Anchor quotes

- «Имя переменной, функции или класса должно отвечать на все главные вопросы.» [с. 41] <!-- KU: clean-code-ch02-p41-ku01 -->

## Self-check — agent adaptation, not from the book

- Does the name reveal the role without implementation encoding?
- Does each retained comment add information unavailable in code?

Agent adaptation, not from the book: Example: Rename `doIt` only after identifying the observable operation; retain a warning only if the danger cannot be made structural.

## Local knowledge lookup — packaging adapter
Read [references/knowledge.md](references/knowledge.md) for the full assigned Knowledge Units and their source pages. This lookup ships with the skill.

## Output — agent adaptation, not from the book

Return the proposed decision or change, the supporting KU identifiers and source pages, the applicability limits relevant to this task, and the checks actually performed. Separate verified results from recommendations and untested assumptions. If the evidence does not support a decision, name the missing evidence instead of presenting it as verified.

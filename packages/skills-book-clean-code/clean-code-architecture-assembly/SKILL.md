---
name: clean-code-architecture-assembly
description: >
  Собирайте runtime object graph в composition root: свяжите домен с adapters через DI/factory/aspect и фиксируйте этот выбор по мере появления ограничений. NOT для build/release/run lifecycle → 12factor-build-release-run-separation; NOT для локального владельца данных → clean-code-object-data-ownership; NOT для system-wide styles/topology → fundamental-software-architecture-guide. NOT для API/database-specific design — api-design или database-review.
trust_tier: 0
trust_tier_label: Machine-distilled from Clean Code (unreviewed)
derived_from: [clean-code-ch01-p34-ku11,clean-code-ch11-p183-ku01,clean-code-ch11-p183-ku02,clean-code-ch11-p183-ku03,clean-code-ch11-p183-ku04,clean-code-ch11-p183-ku05,clean-code-ch11-p183-ku06,clean-code-ch11-p183-ku07,clean-code-ch11-p183-ku08,clean-code-ch11-p183-ku09,clean-code-ch11-p183-ku10,clean-code-ch11-p183-ku11,clean-code-ch11-p183-ku12,clean-code-ch11-p183-ku13,clean-code-ch12-p201-ku01,clean-code-ch12-p207-ku09,clean-code-ch17-p337-ku17]
---
# Architecture assembly
## Protocol
1. Separate construction from runtime work. <!-- KU: clean-code-ch11-p183-ku01 -->
2. Choose composition root and creation moment. <!-- KU: clean-code-ch11-p183-ku02 -->
3. Keep domain code independent of infrastructure; choose DI, factory or aspect by needed flexibility. <!-- KU: clean-code-ch11-p183-ku03,clean-code-ch11-p183-ku04,clean-code-ch11-p183-ku06 -->
4. Delay irreversible choices until evidence and test the assembly. <!-- KU: clean-code-ch11-p183-ku10,clean-code-ch11-p183-ku11 -->
## Anti-patterns
- Domain objects locating their own infrastructure. <!-- KU: clean-code-ch11-p183-ku04 -->
- Fixing a system style before its constraints are known. <!-- KU: clean-code-ch11-p183-ku10,clean-code-ch11-p183-ku11 -->
## Related decisions — generated from verified KU cross-link graph
- `clean-code-object-data-ownership`: local ownership boundaries inform system composition. <!-- XL: system-composition-and-evolutionary-architecture -->

## Routing boundaries — agent adaptation, not from the book
- `clean-code-concurrency-safety`: scheduling policy is a separate routing concern.
## Source
Inline KU markers are claim-level evidence; the computed all-assigned range below is candidate coverage/context, not evidence for every operational sentence.
Computed assigned-KU coverage (context, not claim-level evidence): глава 1: с. 34; глава 11: с. 183–199; глава 12: с. 201–202, с. 207; глава 17: с. 337–339.
## Anchor quotes

- «конструирование и использование системы — два совершенно разных процесса.» [с. 183] <!-- KU: clean-code-ch11-p183-ku01 -->

## Self-check — agent adaptation, not from the book
- Is assembly outside domain behaviour?
- Can an infrastructure choice be tested or deferred?
Agent adaptation, not from the book: Example: create implementations in the composition root and inject the interface into domain code.

## Local knowledge lookup — packaging adapter
Read [references/knowledge.md](references/knowledge.md) for the full assigned Knowledge Units and their source pages. This lookup ships with the skill.

## Output — agent adaptation, not from the book

Return the proposed decision or change, the supporting KU identifiers and source pages, the applicability limits relevant to this task, and the checks actually performed. Separate verified results from recommendations and untested assumptions. If the evidence does not support a decision, name the missing evidence instead of presenting it as verified.

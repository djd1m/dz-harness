---
name: clean-code-concurrency-safety
description: >
  Проектируйте in-process многопоточность и shared-memory: atomicity, locks, queues, liveness и редкие schedules. NOT для process scale-out → 12factor-concurrency-process-model; NOT для SIGTERM/crash-only/startup semantics → 12factor-disposability-fast-startup; NOT для DB isolation → ddia-transaction-isolation-choice; NOT для generic test quality → clean-code-test-suite-feedback. NOT для process state placement — 12factor-stateless-processes.
trust_tier: 0
trust_tier_label: Machine-distilled from Clean Code (unreviewed)
derived_from: [clean-code-appa-p358-ku01,clean-code-appa-p360-ku02,clean-code-appa-p361-ku03,clean-code-appa-p363-ku04,clean-code-appa-p368-ku06,clean-code-appa-p369-ku07,clean-code-appa-p370-ku08,clean-code-appa-p372-ku09,clean-code-appa-p376-ku10,clean-code-appa-p378-ku11,clean-code-appa-p380-ku12,clean-code-appa-p382-ku13,clean-code-ch13-p208-ku01,clean-code-ch13-p209-ku02,clean-code-ch13-p210-ku03,clean-code-ch13-p212-ku05,clean-code-ch13-p213-ku06,clean-code-ch13-p213-ku07,clean-code-ch13-p214-ku08,clean-code-ch13-p215-ku09,clean-code-ch13-p215-ku10,clean-code-ch13-p216-ku11,clean-code-ch13-p216-ku12,clean-code-ch13-p217-ku13,clean-code-ch13-p217-ku14,clean-code-ch13-p218-ku15,clean-code-ch13-p219-ku16,clean-code-ch13-p220-ku17,clean-code-ch13-p220-ku18,clean-code-ch13-p221-ku19,clean-code-ch13-p222-ku20,clean-code-ch13-p223-ku21,clean-code-ch13-p224-ku22,clean-code-ch13-p225-ku23,clean-code-global-p211-p368-ku05]
---
# Concurrency safety
## Protocol
1. Justify threads by I/O, responsiveness, or independent data. <!-- KU: clean-code-ch13-p210-ku03 -->
2. Isolate scheduler and shared state; choose atomic API, lock, or queue for each critical operation. <!-- KU: clean-code-appa-p361-ku03,clean-code-ch13-p213-ku06,clean-code-ch13-p215-ku10,clean-code-global-p211-p368-ku05 -->
3. Check atomicity by read-compute-write steps, then consider starvation, livelock, deadlock and stopping. <!-- KU: clean-code-global-p211-p368-ku05,clean-code-ch13-p215-ku09,clean-code-ch13-p218-ku15 -->
4. Exercise rare interleavings with load, varied platforms and controlled instrumentation. <!-- KU: clean-code-ch13-p219-ku16,clean-code-ch13-p221-ku19,clean-code-ch13-p222-ku20 -->
## Anti-patterns
- Treating `++` as atomic or synchronising only one half of a dependent sequence. <!-- KU: clean-code-global-p211-p368-ku05,clean-code-ch13-p217-ku13 -->
- Adding threads to CPU-bound work without evidence. <!-- KU: clean-code-ch13-p210-ku03,clean-code-appa-p358-ku01 -->
## Related decisions — generated from verified KU cross-link graph
- No sibling coupling is asserted by the current verified KU cross-link graph.

## Routing boundaries — agent adaptation, not from the book
- `clean-code-test-suite-feedback`: ordinary suite quality does not cover race schedules.
- `clean-code-architecture-assembly`: scheduler is a separate routing concern.
- Database isolation is a separate routing concern: use `ddia-transaction-isolation-choice`.
## Source
Inline KU markers are claim-level evidence; the computed all-assigned range below is candidate coverage/context, not evidence for every operational sentence.
Computed assigned-KU coverage (context, not claim-level evidence): глава 13: с. 208–225; глава Приложение А: с. 358–385, с. 389–390.
## Anchor quotes

- «Чтобы код многопоточной системы оставался чистым, управление потоками должно быть сосредоточено в нескольких хорошо контролируемых местах.» [с. 361] <!-- KU: clean-code-appa-p361-ku03 -->

## Self-check — agent adaptation, not from the book
- Is this truly in-process shared-memory concurrency?
- Does every shared compound operation have one protection policy?
- Have liveness and rare schedules been exercised separately from ordinary tests?
Agent adaptation, not from the book: Example: protect a check-then-act map update as one operation rather than trusting its individual methods.

## Local knowledge lookup — packaging adapter
Read [references/knowledge.md](references/knowledge.md) for the full assigned Knowledge Units and their source pages. This lookup ships with the skill.

## Output — agent adaptation, not from the book

Return the proposed decision or change, the supporting KU identifiers and source pages, the applicability limits relevant to this task, and the checks actually performed. Separate verified results from recommendations and untested assumptions. If the evidence does not support a decision, name the missing evidence instead of presenting it as verified.

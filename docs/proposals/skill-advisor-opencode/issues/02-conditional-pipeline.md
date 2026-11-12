## Problem

skill-advisor sometimes turns optional/redundant recommendations into unconditional pipeline steps, contradicting its own explanation and the user's request for a first set.

## Reproduction

Environment: harness-cli 0.8.61, skills-meta 0.9.75, OpenCode 1.19.4, E2B, Haiku.

Question: «В действующем приложении надо провести новую возможность от требований через архитектурное решение до проверок. Какой навык взять первым?»

Observed V13: rationale says feature-adr first; explore is useful only if requirements are unclear (and is already used inside feature-adr). Yet pipeline is [explore, feature-adr] without condition.

Observed V14: architecture-decision-records is described as an optional separate journal, but pipeline unconditionally appends it after feature-adr, which already includes ADR work.

## Acceptance

- Distinguish recommendation priority from execution order.
- Optional alternatives/complements must not become mandatory steps without the relevant user condition.
- Prefer one useful primary pick over duplicate coverage to fill a list.
- Keep the short first-set answer short; the current instruction requesting at most two caveats was ignored (three/four appeared in V13).
- Add behavioral evaluations for conditional recommendations and no extra prerequisite workflows.

Do not implement a blanket assertion that the top-ranked skill must always execute first: legitimate prerequisite sequences can differ. Preserve real conditions or omit the unnecessary optional step.

Evidence: docs/proposals/skill-advisor-opencode/evidence-haiku-v13.json and local V14 smoke; prepared locally, not yet pushed. This issue does not assert all consultations fail.

---
name: challenge-panel
description: >-
  Adversarial plan-gate. BEFORE code, a FRESH reviewer (never the plan author) tries to BREAK an
  implementation plan across a fixed C1-C8 owner-question set, every serious finding is cross-validated,
  and the verdict is surfaced as ADVICE — never an auto-block. Trigger on "прогони challenge", "челлендж
  плана", "challenge the plan", "adversarial review of this plan", or from the feature-adr plan checkpoint.
---

# Challenge Panel — adversarial plan-gate

feature-adr's cross-model QE (Step 8) catches problems AFTER the code is written. The most expensive
mistakes — overengineering, silent decisions, cemented degradations, test-theater, unrealistic scope —
cement at the PLAN stage, and the plan's author structurally cannot find their own gaps (author bias).
This skill runs a "break the plan, don't confirm it" panel at the plan stage, by a FRESH agent that did
NOT write the plan, with cross-validated findings. **Advise, not block.**

## Hard invariant (never relax)

**The panel is NEVER the plan's own author.** Dispatch the adversary on a DIFFERENT model family than the
one that wrote the plan:
- plan written by Claude → adversary = Codex (cross-family). Run it through the honest synchronous path
  (`codex exec` / `safeCodexAgent`), never a fire-and-forget wrapper — a stub reads exactly like a clean
  review. If Codex is unavailable, fall back LOUDLY to a fresh Claude agent and say it was NOT cross-family.
- plan written by Codex → adversary = a fresh Claude agent (already cross-family).
- ad-hoc / unknown author → a fresh agent that did not participate in writing the plan.

`dz challenge --author <model>` prints which cross-family adversary to dispatch.

## Protocol

1. **Assemble the WIDE context (deterministic).** Run:
   ```bash
   dz challenge --plan <path/to/06_implementation_plan.md>
   ```
   This prints the challenge brief: the plan + `architecture/vision.md` + `architecture/testing.md` +
   `architecture/map.json` + `architecture/degradations.md` inlined (missing docs degrade gracefully) +
   the fixed C1-C8 questions + the verdict JSON schema. A WIDE context is load-bearing — hand a reviewer a
   narrow slice and you get findings about the slice.
   - `--context-only` shows just what the panel will read (and the chosen adversary).
   - `--json` emits the context + brief + adversary as JSON for a subagent.

2. **Fire the panel (fresh adversary ≠ author).** Dispatch a subagent on the cross-family model with the
   brief. It answers C1-C8 in "break it" mode and returns the verdict JSON:
   | # | Question |
   |---|----------|
   | C1 | Architecture anti-cement — cements a NEW bad pattern/boundary? (deviating from a REGISTERED accepted degradation is NOT a finding) |
   | C2 | Production-ready — where does it fall over? name the concrete input/condition |
   | C3 | Test sufficiency + honesty BOTH ways — an ADR-named "never X" with no falsifying test? tests that are theater? |
   | C4 | Overengineering sweep — built for a requirement nobody stated? the simpler thing? |
   | C5 | Silent decisions — a policy made without surfacing it as a decision the owner could refuse |
   | C6 | Runtime consistency — contradicts an existing convention (error shape, config source, ESM, naming)? |
   | C7 | Scope — > ~1.5× what the request needs? the concrete cut list |
   | C8 | Executability — could a non-author complete every step without coming back to ask? |

   Each finding: `c` (C-number), `severity` (P0/P1/P2), `title`, `why` (a concrete failing input/condition —
   never a general worry), optional `where`.

3. **Cross-validate every P0/P1 (mandatory anti-noise).** Dispatch a SECOND, independent agent: for each
   P0/P1, "real and reachable, or FP/theory?" — default to false when uncertain. **Drop** every P0/P1 that
   is not confirmed. Theory never reaches the owner (a false gate kills trust). P2 pass through.

4. **Surface the verdict — ADVISE, never block.** Present the cross-validated P0/P1 prominently + P2 as
   notes. Do NOT auto-abort. The owner decides whether to revise the plan, accept a finding into
   `architecture/degradations.md`, or proceed.

## Calibration docs (optional, improve precision)

- `architecture/vision.md` — boundaries + principles (what the product deliberately does NOT do).
- `architecture/testing.md` — what "done" and an honest test mean here.
- `architecture/degradations.md` — the accepted-degradations registry: patterns you KNOW are imperfect but
  keep on purpose. **C1 does not flag a deviation from anything registered here.** Scaffold a starter with
  `dz feature-adr-setup --from-spec <spec with {"degradations":true}> --apply`.

Absent docs never error — the panel simply runs with less calibration.

## In the feature-adr pipeline

At the L/XL **checkpoint-after-plan**, feature-adr runs this panel automatically (a fresh adversary ≠ the
Step-6 planner), cross-validates, and returns `challengeVerdict` alongside the ADR + plan — advisory. In
**plain** `/feature-adr`, offer the panel at the planning checkpoint before coding.

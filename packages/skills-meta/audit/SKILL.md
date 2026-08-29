---
name: audit
description: >
  Whole-codebase deep audit that produces a tight, prioritized, numbered list of
  real problems and opportunities — bugs, security, performance, dead code,
  architecture gaps, missing foundations, and grounded feature ideas — then acts
  on the items the user approves. Runs five phases: parallel reconnaissance →
  synthesis + adversarial self-challenge → priority ranking → user approval →
  scoped execution. Every finding must earn its place; the list is capped so it
  stays actionable. Use when the user invokes /audit, asks to "audit the
  codebase", wants a comprehensive health check, or asks "what should we fix or
  improve next". Triggers on: "audit", "review the whole codebase", "health
  check", "what's worth fixing", "what should we improve".
trust_tier: 1
trust_tier_label: "Structured"
trust_tier_path: "Run /bto-test to promote to Tier 2"
validation:
  schema_path: schemas/output.json
  validator_path: scripts/validate-config.json
---

# Audit: whole-codebase, action-oriented review

Surface **real** problems and opportunities — not textbook issues that sit ignored.
Every finding earns its place or it is dropped. The deliverable is a short,
prioritized, numbered list the user can approve item-by-item before anything is
executed.

## When to Use

- The user invokes `/audit` (optionally `/audit focus on <area>`).
- "Audit the codebase", "comprehensive review", "health check on the project".
- "What should we fix / improve next?" → return a structured list, not prose.
- Before a release: "what's worth fixing before we ship?"

## When NOT to Use

- A single-file or single-PR review → use `pr-review` (scoped) or `brutal-honesty-review`.
- A security-only sweep of the *agent permission surface* → use `dz mcp-scan` / `agentshield-scan`.
- "Just do X" with a known target → do X directly; an audit is overkill.

## Skill Integration Map

| Stage | Reuse |
|-------|-------|
| Self-challenge (Phase 2) | `adversarial-verifier` — refute each finding; default to dropped unless impact + reachability are both shown |
| Locked-decision check | `capture-adr` / read `docs/adr/`, `decisions/`, `CLAUDE.md` — a finding that contradicts a locked decision is **not valid**, drop it |
| Cross-run learning (optional) | `agentdb-memory` — store prior findings + the user's accept/decline so repeat runs don't re-surface declined items and learn which categories the user actions |
| Security surface | `dz mcp-scan` (project grants) feeds the Security lens |

## Cost guard — staleness check (run FIRST)

If a completed audit list already exists in this conversation, **ask** before re-running:
> "Fresh audit, or act on the existing list?"

Do not re-spawn agents if the user only wants to action items from a prior run. A full
audit is expensive (parallel agents over the whole tree) — never run it twice for nothing.

If `agentdb-memory` is available, load the prior run's findings + decisions for this repo and
exclude anything the user previously declined (unless its severity rose).

## The five phases

### Phase 1 — Parallel reconnaissance

**Discover the project shape first** (one cheap pass — never hardcode paths):

```bash
ls && find . -maxdepth 2 -name package.json ! -path '*/node_modules/*' | head
find . -name CLAUDE.md -o -path '*/adr/*' -name '*.md' | head -20
```

Spawn finder agents **in parallel** (this is where the orchestration belongs — for the
exhaustive mode, run them as a `Workflow`; for a lighter pass, as sub-agents). Adapt the
lenses to the **actual** project — a CLI/library monorepo has no "frontend" lens; a web app
does. Give each agent: the real paths, the read-in-≤2000-line-chunks rule, and the user's
focus directive (if any). Standard lenses:

- **Correctness** — logic errors, unhandled edge cases, wrong error propagation, races, off-by-one.
- **Security** — injection, auth bypass, insecure defaults, missing validation at trust boundaries, traversal/secret exposure (cross-check `dz mcp-scan`).
- **Performance** — N+1 / missing indexes on hot paths, sync work in async contexts, accidental O(n²), avoidable re-renders (UI).
- **Dead code & hygiene** — unused exports, commented-out blocks, stale suppressions, drifting config/CI steps.
- **Architecture & contracts** — API shape mismatches across boundaries, test-coverage gaps on *this project's* critical paths, risky migrations.
- **Gap analysis (two-tier)** — **Tier 1 (P0/P1):** missing foundations — "if someone used this product end-to-end today, what would silently fail or be impossible?" **Tier 2 (P2/P3):** grounded feature ideas, each one sentence on what + one on why, tied to what already exists. No wishful thinking.

Each finding records **what**, **where** (`file:line`), and **why it matters concretely**.
Flag possible cross-lens duplicates as `overlap: true`.

### Phase 2 — Synthesis + adversarial self-challenge

1. **Dedup / root-cause collapse** — merge `overlap:true` items and symptoms of a shared cause; keep the most specific wording.
2. **Refute, don't confirm** (run `adversarial-verifier`'s stance on each): *"Would a senior engineer flag this in review? What is the real cost of inaction? Does it contradict a locked decision?"* If the honest answer is "fine as-is" / "negligible" / "violates an ADR" → **drop it**.
3. **Cap the list at 20.** If more survive, cut the weakest P3s. Ten real findings beat forty marginal ones.

### Phase 3 — Priority ranking

- **P0 Critical** — data loss, security breach, or core functionality broken *now*.
- **P1 High** — user-facing bug, significant perf regression, or a blocker for a major feature.
- **P2 Medium** — worth doing, not urgent.
- **P3 Nice-to-have** — minor polish or speculative feature.

Tier-1 gap findings (missing foundations that block end-to-end flows) rank P0/P1. Feature ideas start at P2/P3.

### Phase 4 — Present the numbered list (no action yet)

Sort P0 → P3 and print exactly:

```
[N] [P{level}] {Category} — {Title}
    {one sentence: what it is}
    {one sentence: why it matters / cost of inaction}
    📍 {file:line or area}   (omit for Gap/Feature items with no single location)
```

Categories: `Bug` · `Security` · `Performance` · `Refactor` · `Dead Code` · `UX` · `Architecture` · `Gap` · `Feature`.

Then ask, verbatim:
> Reply with the numbers to action (e.g. `1 3 5`) or `all`. Type `none` to close without acting.

**Wait for the reply. Execute nothing in this phase.**

### Phase 5 — Scoped execution of approved items

Process approved items in priority order (P0 first, lowest number first). Find the project's
verification command first (Rust → `cargo check` + tests; JS/TS → the `package.json` `typecheck`/`build`/`test` scripts).

- **≤3 files, no schema change:** fix → run verification → commit → report one line (what + where). **One item, one commit.** Never bundle unrelated fixes.
- **>3 files, schema change, or a Gap/Feature item:** present a 5-bullet plan and **wait for explicit go-ahead** before writing code.

If `agentdb-memory` is available, record each item's outcome (actioned / declined) so future audits are sharper.

## Examples

- `/audit` → full 5-phase run → numbered P0-P3 list → wait for approval.
- `/audit focus on the publish pipeline` → focus directive injected into every finder; publish-related findings sorted to the top of their band.
- "what should we improve before release?" → triggers the audit; ranks user-facing/stability highest; asks for approval before touching anything.

## Anti-Patterns

| Anti-Pattern | Why it fails | Fix |
|---|---|---|
| Listing textbook issues nobody will fix | Buries the 3 findings that matter | Self-challenge; drop anything a senior wouldn't flag |
| 40-item list | Unactionable; user disengages | Hard cap at 20; cut weakest P3s |
| Flagging something an ADR locked | It's noise, already decided | Read ADRs/CLAUDE.md first; drop contradictions |
| Auto-fixing without approval | Surprises the user, risks unwanted churn | Phase 4 approval gate is mandatory |
| Bundling unrelated fixes in one commit | Unreviewable, hard to revert | One item → one commit |
| Re-running a full audit when a list exists | Burns tokens for nothing | Staleness check first |
| Assuming `src/` + `ui/` paths | Wrong findings on a non-web repo | Discover the real shape in Phase 1 |

## Provenance

Original, clean-room skill authored in this package. The five-phase audit-and-act
**pattern** is a community idea (seen in a `/audit` skill circulated from
`DreamLab-AI/agentbox`); no text or code was copied — this implementation is rewritten to
the harness's conventions and wired to `adversarial-verifier`, `capture-adr`, and
`agentdb-memory`.

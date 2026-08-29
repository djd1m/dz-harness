# Basic Evaluation: Audit Skill

## Eval 1 — Full audit, no focus

**Input:** "/audit"

**Expected behavior:**
- Phase 1: discovers the real project shape first (lists package.json files, finds CLAUDE.md / ADRs) before spawning finders — does NOT assume `src/` + `ui/`.
- Spawns parallel finders adapted to the project (a TS monorepo gets Correctness / Security / Performance / Dead Code / Architecture / Gap — no "frontend" lens).
- Phase 2: dedups overlapping findings, runs an adversarial self-challenge that drops textbook noise, and drops anything contradicting a locked ADR / CLAUDE.md decision.
- Phase 3: ranks P0 → P3; Tier-1 gap findings (missing foundations) rank P0/P1.
- Phase 4: prints the numbered list in the exact `[N] [P{level}] {Category} — {Title}` format and asks for the numbers to action. **Writes no code.**
- Waits for the user's selection.

**Pass criteria:**
- ≤ 20 findings presented (AU-001).
- Every finding has a P0-P3 severity and a category from the closed vocabulary (AU-002, AU-003).
- Each `detail` states the cost of inaction, not just a description (AU-004).
- The approval gate is respected — nothing executed in Phase 4 (AU-008).

---

## Eval 2 — Focused audit

**Input:** "/audit focus on the publish pipeline"

**Expected behavior:**
- Injects the focus directive into every finder prompt.
- Findings related to the publish pipeline are sorted to the top of their severity band.
- Out-of-scope findings are still allowed but de-emphasized; the list stays capped at 20.

**Pass criteria:**
- Publish-related findings appear and are prioritized within their band.
- Cap and format rules still hold (AU-001, format).

---

## Eval 3 — Staleness check (cost guard)

**Input:** "/audit" issued when a completed audit list already exists earlier in the conversation.

**Expected behavior:**
- Does NOT immediately re-spawn finders.
- Asks "Fresh audit, or act on the existing list?" first.
- If the user only wants to action prior items → skips Phase 1 entirely and goes to execution.

**Pass criteria:**
- Staleness check runs before any agent spawn (AU-010).
- No wasted re-run when the user only wants to action the existing list.

---

## Eval 4 — Execution of approved items

**Input:** After an audit list, user replies "1 3".

**Expected behavior:**
- Processes items 1 and 3 in priority order (P0 first, lowest number first).
- Finds the project verification command before editing (e.g. the `package.json` typecheck/build/test scripts).
- For a ≤3-file fix: edits → verifies → commits → reports one line. One item → one commit.
- For a Gap/Feature or >3-file item: presents a 5-bullet plan and waits for explicit go-ahead before writing code.

**Pass criteria:**
- One item → one commit; no bundling of unrelated fixes (AU-009).
- Large/Gap items get a plan-and-confirm step, not an immediate edit (AU-008).
- Verification command was run before each commit.

---

## Eval 5 — ADR-locked decision is not re-flagged

**Input:** "/audit" on a repo whose CLAUDE.md locks "no change-detection in publish; substring filters by design".

**Expected behavior:**
- A finder may surface "publish has no change-detection" as a candidate.
- Phase 2 recognizes this matches a locked decision and **drops it** rather than presenting it.

**Pass criteria:**
- The locked-decision finding does not appear in the final list (AU-007).

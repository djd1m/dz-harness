---
description: Capture and recall development insights. Append a new insight to `.claude/insights/index.md` with structured fields (problem, solution, tags). The three most recent are injected into context at SessionStart.
argument-hint: '[recall <query> | <free-form insight>]'
---

# /myinsights $ARGUMENTS

## Purpose

Build a project-local knowledge base of "грабли" (rakes) — errors, workarounds,
discoveries — so they don't have to be re-learned.

**What actually happens, stated exactly.** The `SessionStart` hook
(`.claude/hooks/session-insights.cjs`, wired in `.claude/settings.json`) reads
`.claude/insights/index.md` and injects the **three most recent entries**, by their
order in the file. It prints them under the heading *"Recent project insights"* —
which is what they are.

**There is no tag matching, and it is not an omission.** The hook fires at
`SessionStart`, BEFORE you have said anything, so there is no current task to match
tags against. Tags remain useful for a human reading or grepping the file, and for
`/myinsights recall <query>`, which searches on demand — when a query exists.

**The consequence, so nobody is surprised by it.** The file is append-only and the
hook takes the LAST three. As a project accumulates entries — `insights-capture.md`
plans for 50+ — earlier ones stop being injected. Selection by relevance would need
to happen at a moment when a task is known; that is a separate design question, and
it is filed rather than quietly implied here.

## Modes

### Capture (default)

Run `/myinsights` with a free-form description, or no arguments to be prompted.

Process:
1. Ask 3 short questions (or extract from `$ARGUMENTS`):
   - **Problem** — what went wrong / surprised you
   - **Solution** — what fixed it
   - **Tags** — keywords for future recall
2. Append entry to `.claude/insights/index.md`:

```markdown
## <ISO date> — <short title>

**Tags:** <comma-separated>

**Problem:**
<1-3 sentences>

**Solution:**
<1-5 sentences with code if relevant>

**References:** <file:line | commit hash>

---
```

3. Auto-commit (Stop hook handles this if `.claude/settings.json` is in place).

### Recall

`/myinsights recall <query>`:

1. Read `.claude/insights/index.md`
2. Filter entries whose tags or text match `<query>` (case-insensitive)
3. Print top 5 matches with relevance score

## Storage

`.claude/insights/index.md` — chronological log, Markdown format. One file per
project to keep recall trivial.

## Auto-injection on SessionStart

The default `.claude/settings.json` configures `node .claude/hooks/session-insights.cjs`
which: (1) reads recent insights, (2) prints them to stdout, (3) Claude Code
captures stdout and injects into the initial context.

This is what makes insights compounding: every session benefits from past
mistakes without manual recall.

## Related

- `.claude/rules/insights-capture.md` — when/how to capture
- `.claude/hooks/session-insights.cjs` — session injection
- `/harvest` — extracts reusable knowledge at project end. **Honest limit:** it does
  NOT read `.claude/insights/index.md` today (`grep -ci insight` over `harvest.md`
  returns 0). The capture→harvest link is a stated intention, not a wired path.

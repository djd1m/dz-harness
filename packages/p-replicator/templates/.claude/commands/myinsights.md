---
description: Capture and recall development insights. Markdown remains the source of truth; UserPromptSubmit uses armed dz recall with a local last-three fallback.
argument-hint: '[recall <query> | <free-form insight>]'
---

# /myinsights $ARGUMENTS

## Purpose

Build a project-local knowledge base of "грабли" (rakes) — errors, workarounds,
discoveries — so they don't have to be re-learned.

**What actually happens, stated exactly.** `.claude/insights/index.md` is the Markdown
source of truth. Capture establishes it first, then the writer makes a best-effort,
idempotent `dz teach` duplicate. Missing or failed dz never changes the Markdown receipt.

On `UserPromptSubmit`, `.claude/hooks/session-insights.cjs` queries with the actual prompt.
Only a successful, non-empty `dz recall` result from the insight domain suppresses local
delivery. Absent, failing, or empty recall falls back to the three most recent Markdown
entries; a present-but-failing recall is named, while ordinary absence and empty output are
quiet. `SessionStart` only keeps the missing-carrier hint.

**Fallback consequence.** The Markdown file is append-only, and local fallback takes the
last three entries by file order. In that fallback, earlier ones stop being injected as the
project grows. The dz path can rank older entries without replacing the durable carrier.

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

`.claude/insights/index.md` — chronological Markdown source of truth. The optional
best-effort dz projection is derived from it and can be rebuilt by replay.

## Prompt-time injection on UserPromptSubmit

The default `.claude/settings.json` configures `node .claude/hooks/session-insights.cjs`
for `UserPromptSubmit`. It emits one hook envelope from either armed dz recall or local
fallback, never both. The same script remains on `SessionStart` only to reveal a missing
Markdown carrier before the first capture.

## Related

- `.claude/rules/insights-capture.md` — when/how to capture
- `.claude/hooks/session-insights.cjs` — session injection
- `/harvest` — quick/full runs and `/myinsights` share the same Markdown carrier at
  `.claude/insights/index.md`. Harvest capture is a required final persistence gate when the run
  produced a reusable finding; manual capture remains available at any time. Both stay append-only.

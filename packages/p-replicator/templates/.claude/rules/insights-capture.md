# Insights Capture Rules

When and how to record development "грабли" (rakes) into the project knowledge
base. Used by `/myinsights` and the `SessionStart` hook
(`.claude/hooks/session-insights.cjs`).

## When to Capture

CAPTURE an insight whenever:
- A bug took > 15 min to root-cause
- A library / tool behaved differently than docs claimed
- A workaround was needed for a third-party limitation
- A non-obvious config or env var fixed a deploy issue
- An algorithm choice paid off (or didn't) in noticeable ways

DO NOT capture:
- One-line typos or simple syntax errors
- Information already in official docs that's easy to find
- Personal preference notes

## How to Capture (via /myinsights)

```
/myinsights "Prisma migrate dev fails silently if shadow DB unreachable. Workaround: set DATABASE_URL_SHADOW explicitly."
```

The command parses problem + solution + tags, appends a structured entry to
`.claude/insights/index.md`, auto-commits via Stop hook.

## Entry Structure

```markdown
## <YYYY-MM-DD> — <short title>

**Tags:** <comma-separated keywords>

**Problem:**
<1-3 sentences>

**Solution:**
<1-5 sentences with code if relevant>

**References:** <file:line | commit hash | external link>

---
```

### Tag Conventions

Use lowercase, hyphenated, specific tags:
- ✅ `prisma-migration`, `postgres-timezone`, `docker-compose-network`
- ❌ `bug`, `fix`, `important` (too generic)

Aim for 2-5 tags per entry.

## Auto-Injection on SessionStart

The `SessionStart` hook runs `node .claude/hooks/session-insights.cjs` which
prints recent insights to stdout. Claude Code captures stdout and injects
it into the initial session context.

## Storage Lifecycle

- `<= 50 entries`: single `index.md`
- `> 50 entries`: split into archive files `<YYYY-MM>.md` with `index.md` as TOC
- Never delete entries unless factually wrong; mark superseded entries instead

## Anti-Patterns

| Anti-Pattern | Why bad |
|--------------|---------|
| Capturing every error | Noise drowns signal |
| Generic tags | Tag-based recall fails |
| Missing tags | Entry is unfindable |
| Long prose in problem field | Hard to scan |
| Solution without code | When code is the fix, include the snippet |
| Deleting outdated entries | Lose history; supersede instead |

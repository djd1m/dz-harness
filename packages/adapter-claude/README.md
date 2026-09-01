# @dzhechkov/adapter-claude

The **Claude Code** platform adapter for the DZ cross-platform harness.

It implements the `Adapter` contract from [`@dzhechkov/core`](../core): it
compiles a `CanonicalSkill` into the file layout Claude Code expects —
`.claude/skills/<id>/SKILL.md` plus any bundled `scripts/`, `references/`, and
`assets/` files.

## Why this adapter is special

Claude Code's skill format **is** the [Agent Skills open
standard](https://agentskills.io). So this adapter performs no lossy
transformation — it is a faithful, lossless emitter. That makes it the
**byte-identity baseline**: compiling a skill that was loaded from a
`.claude/skills` tree reproduces the original `SKILL.md` byte-for-byte. The
other adapters (`adapter-codex`, `adapter-opencode`, `adapter-hermes`) are
measured against this one.

## API

```ts
import { claudeAdapter } from '@dzhechkov/adapter-claude';

const emit = await claudeAdapter.compile(skill, { targetRoot: '.' });
// emit.files -> [{ path: '.claude/skills/<id>/SKILL.md', content, encoding }, ...]

const result = await claudeAdapter.verify(emit);
// result.ok -> boolean
```

`compile` is a **pure function** — it returns the files to write, it does not
touch the filesystem. Applying an `EmitResult` to disk is the harness's job.

## Companion integrations

`claudeIntegrationAdapter.plan()` is also pure. For a validated `INTEGRATIONS.json` it returns only
the project-scoped `.mcp.json` fragment supported by the pinned evidence family; it does not write,
merge, spawn, or contact a manifest URL. `harness-core` performs the ownership-safe transaction and
the live registration probe. Hook intent is refused until an activation/negative-control receipt
exists; it is never silently skipped.

## Status

`0.2.7` — staged, not published. Skill compilation remains lossless; the separate pure integration
planner emits only the receipt-proven Claude project MCP fragment.

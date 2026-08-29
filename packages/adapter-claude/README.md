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

## Status

`0.1.0` — alpha, part of the `extended-a-migration` feature (Phase 2). Additive
only: this package never modifies existing skills or harness files.

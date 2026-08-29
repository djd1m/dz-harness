# @dzhechkov/adapter-opencode

The **OpenCode** platform adapter for the DZ cross-platform harness.

It implements the `Adapter` contract from [`@dzhechkov/core`](../core), compiling
a `CanonicalSkill` into the layout OpenCode scans —
`.opencode/skills/<id>/SKILL.md` plus any bundled `scripts/`, `references/`, and
`assets/` files.

## Lossless

OpenCode consumes the [agentskills.io](https://agentskills.io) skill directory
natively — its `name` rule is the exact agentskills.io regex. (OpenCode even
reads `.claude/skills/` directly.) So this adapter performs no lossy
transformation; it is a thin wrapper over `@dzhechkov/core`'s `emitSkillTree`,
pinned to OpenCode's skills root.

## API

```ts
import { opencodeAdapter } from '@dzhechkov/adapter-opencode';

const emit = await opencodeAdapter.compile(skill, { targetRoot: '.' });
// emit.files -> [{ path: '.opencode/skills/<id>/SKILL.md', content, encoding }, ...]
```

`compile` and `verify` are pure — they return data, never touch the filesystem.

## Status

`0.1.0` — alpha, part of the `extended-a-migration` feature (Phase 4).

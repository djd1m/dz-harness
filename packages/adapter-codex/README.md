# @dzhechkov/adapter-codex

The **OpenAI Codex CLI** platform adapter for the DZ cross-platform harness.

It implements the `Adapter` contract from [`@dzhechkov/core`](../core), compiling
a `CanonicalSkill` into the layout Codex scans — `.agents/skills/<id>/SKILL.md`
plus any bundled `scripts/`, `references/`, and `assets/` files.

## Lossless, not lossy

Codex CLI gained native **Agent Skills** support in December 2025 and consumes
the [agentskills.io](https://agentskills.io) skill directory — the same format
as Claude Code. So this adapter performs no lossy transformation; it is a thin
wrapper over `@dzhechkov/core`'s `emitSkillTree`, pinned to Codex's skills root.

> Codex's `AGENTS.md` is a *custom-instructions* mechanism, separate from skills
> and out of scope for this adapter. See
> `features/extended-a-migration/g4-adapters-research.md`.

## API

```ts
import { codexAdapter } from '@dzhechkov/adapter-codex';

const emit = await codexAdapter.compile(skill, { targetRoot: '.' });
// emit.files -> [{ path: '.agents/skills/<id>/SKILL.md', content, encoding }, ...]
```

`compile` and `verify` are pure — they return data, never touch the filesystem.

## Status

`0.1.0` — alpha, part of the `extended-a-migration` feature (Phase 4).

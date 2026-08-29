# @dzhechkov/adapter-hermes

The **Hermes Agent** (Nous Research) platform adapter for the DZ cross-platform
harness.

It implements the `Adapter` contract from [`@dzhechkov/core`](../core), compiling
a `CanonicalSkill` into the layout Hermes scans — `.hermes/skills/<id>/SKILL.md`
plus any bundled `scripts/`, `references/`, and `assets/` files.

## Lossless

Hermes Agent's skills are compatible with the
[agentskills.io](https://agentskills.io) open standard and use progressive
disclosure. So this adapter performs no lossy transformation; it is a thin
wrapper over `@dzhechkov/core`'s `emitSkillTree`, pinned to Hermes's skills root.

> Hermes skills are conventionally **global** (`~/.hermes/skills/`). This adapter
> emits the relative path `.hermes/skills/<id>/`; the harness chooses whether the
> target root is the home directory or a project.

## API

```ts
import { hermesAdapter } from '@dzhechkov/adapter-hermes';

const emit = await hermesAdapter.compile(skill, { targetRoot: '.' });
// emit.files -> [{ path: '.hermes/skills/<id>/SKILL.md', content, encoding }, ...]
```

`compile` and `verify` are pure — they return data, never touch the filesystem.

## Status

`0.1.0` — alpha, part of the `extended-a-migration` feature (Phase 4).

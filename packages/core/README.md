# @dzhechkov/core

Foundation package of the **DZ cross-platform harness**. It owns the
platform-neutral contracts that every other `@dzhechkov/*` package depends on.

## What it provides

| Module | Exports | Purpose |
|---|---|---|
| `skill.schema` | `CanonicalSkillFrontmatter`, `ClaudeSkillFrontmatter` | Two-layer Zod schema for `SKILL.md` frontmatter |
| `hooks.schema` | `HookSchema` | Shape of lifecycle hooks |
| `adapter` | `Adapter`, `Platform`, `EmitResult`, … | The contract every `@dzhechkov/adapter-*` implements |
| `integration.schema` | `HarnessIntegrationManifestV1Schema`, `integrationManifestDigest`, outcome types | Bounded `INTEGRATIONS.json` parsing, canonical digests, and the MCP/hooks result vocabulary consumed by live registration probes |
| `agents-md` | `mergeAgentsMd`, `mergeGeminiMd`, `mergePolicyBlock`, fence constants | One parameterized managed-Markdown merge path for skill and always-on policy blocks; authored bytes outside each fence are preserved |

## Two-layer skill schema

The [Agent Skills open standard](https://agentskills.io/specification) defines six
frontmatter fields (`name`, `description` required; `license`, `compatibility`,
`metadata`, `allowed-tools` optional). Claude Code consumes that standard and adds
its own optional fields, and this repo's 90 skills additionally carry ~26
project-local keys.

So the schema has two layers:

- **`CanonicalSkillFrontmatter`** — strict agentskills.io standard. Used by the
  portable/canonical layer and by non-Claude adapters.
- **`ClaudeSkillFrontmatter`** — the canonical schema relaxed, plus Claude Code
  extensions, plus passthrough of unknown keys, so every existing `SKILL.md`
  validates without edits.

See `features/extended-a-migration/agentskills-spec-verification.md` for the
verified spec this schema is built against.

## Managed Markdown

Use `mergePolicyBlock(existing, sections)` when adding the always-on policy fence to a root
`AGENTS.md`. It uses the same merge implementation as the existing `mergeAgentsMd` and
`mergeGeminiMd` projections, but with its own `dz:policies` markers and an early placement so a
Codex truncation cap reaches policy before optional skill content.

```ts
mergePolicyBlock('# AGENTS.md\n\nTeam notes.\n', ['## Integrity Rule\n\nMeasure before asserting.']);
```

Expected result: the team notes remain byte-for-byte, followed by one
`<!-- dz:policies BEGIN … -->` / `<!-- dz:policies END -->` block. Repeating the call is
idempotent; a `dz:skills` block, when present, remains independent.

## Companion integration intent

`INTEGRATIONS.json` is strict, versioned, size/depth/count bounded, and rejects literal-looking
credentials. It represents intent only: parsing never runs a command or performs network I/O.
Harness orchestration binds the canonical digest to operator authorization and requires separate
live evidence before an adapter may emit a target carrier.

## Status

`0.2.22` — staged, not published. Adds the bounded integration manifest and the shared
`emitted` / `refused` / `not-requested` contract used by evidence-gated target adapters.

## Scripts

```bash
pnpm --filter @dzhechkov/core build      # tsc -> dist/
pnpm --filter @dzhechkov/core test       # vitest run
pnpm --filter @dzhechkov/core typecheck  # tsc --noEmit
```

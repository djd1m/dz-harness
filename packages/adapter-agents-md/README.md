# @dzhechkov/adapter-agents-md

The **AGENTS.md** platform adapter for [DZ Harness Hub](https://github.com/djd1m/dz-harness-hub) — flattens canonical skills into a single, root-level `AGENTS.md`.

```bash
dz init --target agents-md --select design-thinking
```

## What it emits

`AGENTS.md` is the emerging cross-tool convention read by ~15 agents (Cursor, Zed, Warp, Aider, goose, Gemini CLI, RooCode, Kilo, Junie, Trae, Augment, Devin, pi, Windsurf, …). It is one **root-level, plain-Markdown** file — no YAML frontmatter, no per-skill directory:

```
AGENTS.md   # a plain-Markdown "## <skill>" section per selected skill, inside a dz-managed fenced block
```

Unlike the skill-tree adapters (one directory per skill) and unlike copilot (one instruction file **per** skill), one `AGENTS.md` holds **all** selected skills.

## Intentionally lossy — and merge-not-overwrite

Like copilot, this is a **lossy** adapter. AGENTS.md loses:

- **YAML frontmatter** — the section is plain Markdown;
- **progressive disclosure** — the whole section is always-on;
- **per-skill file boundaries** — every skill collapses into one file;
- **assets** — `scripts/`/`references/` are not carried.

Because `AGENTS.md` is often **hand-authored**, aggregation into the real file (at the operations layer) uses `@dzhechkov/core`'s `mergeAgentsMd`, which owns only a fenced block:

```
<!-- dz:skills BEGIN (managed by dz — do not edit) -->
…skill sections…
<!-- dz:skills END -->
```

Everything **outside** the fence is preserved byte-for-byte. The merge is idempotent.

Per the `@dzhechkov/core` `Adapter` contract the loss surfaces as a **warning**; under `strict` the adapter **throws**. The canonical skill stays the lossless source of truth — recompiling to `claude` is still full fidelity.

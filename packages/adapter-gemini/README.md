# @dzhechkov/adapter-gemini

The **GEMINI.md** platform adapter for [DZ Harness Hub](https://github.com/djd1m/dz-harness-hub) — flattens canonical skills into a single, root-level `GEMINI.md` read by the **Gemini CLI** and **Gemini Code Assist**.

```bash
dz init --target gemini --select design-thinking
```

## What it emits

`GEMINI.md` is Gemini's canonical context file: one **root-level, plain-Markdown** file — no YAML frontmatter, no per-skill directory. Gemini loads it **hierarchically** (`~/.gemini/GEMINI.md` → workspace root → subdirectories, concatenated nearest-wins); dz emits the workspace-root file:

```
GEMINI.md   # a plain-Markdown "## <skill>" section per selected skill, inside a dz-managed fenced block
```

Structurally this is `AGENTS.md` with a different filename — one `GEMINI.md` holds **all** selected skills. Unlike the skill-tree adapters (one directory per skill) and unlike copilot (one instruction file **per** skill), everything is aggregated into one file.

## Intentionally lossy — and merge-not-overwrite

Like `agents-md` and copilot, this is a **lossy** adapter. GEMINI.md loses:

- **YAML frontmatter** — the section is plain Markdown;
- **progressive disclosure** — the whole section is always-on;
- **per-skill file boundaries** — every skill collapses into one file;
- **assets** — `scripts/`/`references/` are not carried.

Because `GEMINI.md` is often **hand-authored** (project conventions, build/run notes), aggregation into the real file (at the operations layer) uses `@dzhechkov/core`'s `mergeGeminiMd`, which owns only a fenced block:

```
<!-- dz:skills BEGIN (managed by dz — do not edit) -->
…skill sections…
<!-- dz:skills END -->
```

Everything **outside** the fence is preserved byte-for-byte. The merge is idempotent — running `dz init --target gemini` twice yields the same file, and a second dz block is never appended.

Per the `@dzhechkov/core` `Adapter` contract the loss surfaces as a **warning**; under `strict` the adapter **throws**. The canonical skill stays the lossless source of truth — recompiling to `claude` is still full fidelity.

# @dzhechkov/harness-presets

Current package version: `0.5.25`. <!-- dz:version -->

Site: https://aicoding.space · Source: https://github.com/djd1m/dz-harness/tree/main/packages/@dzhechkov/harness-presets

Named **skill-set presets** for `dz init --preset <name>`.

A preset selects skill ids; it does not install npm packages. Every built-in
declares additive optional `providers` metadata naming its source packages.
`toolkit` remains a separate full companion initializer.

The CLI includes provider dependencies for `meta`, `qe-engineer`, `devops`, `web3`,
`mcp`, `academic`, `news`, and `pm`. Optional presets require their provider in the
invocation project; equivalent local skill sources also work:

| Preset | Install command |
|---|---|
| `bto` | `npm install --prefix . @dzhechkov/skills-bto` |
| `reasoning` | `npm install --prefix . @dzhechkov/skills-reasoning` |
| `health` | `npm install --prefix . @dzhechkov/health-advisor` |
| `keysarium` | `npm install --prefix . @dzhechkov/keysarium` |
| `p-replicator` | `npm install --prefix . @dzhechkov/p-replicator` |
| `feature-adr` | `npm install --prefix . @dzhechkov/skills-feature-adr` |

Rerun the original `dz init`/`dz setup` command after installing the provider.
`--skills-dir` excludes package discovery: remove it or point it to the provider's
skill root. Discovery checks project `.claude/skills`, then the existing bounded
package carrier/layout search; earlier roots win duplicate ids, including with
`--force`. Each selected skill and its integration manifest come from that winner.

`dz setup` resolves `--select`, a named preset, or its automatic recommendation before
writing hooks, memory, configuration, and adapter output. Explicit `--select` overrides
the preset; missing or empty selections refuse before writes. Later load/apply failures,
refused integrations, and failed setup steps exit nonzero and may leave partial output.
An all-skipped rerun succeeds. No provider is installed automatically.

Presets compile skills. To initialize the full companion toolkit's commands/hooks/assets,
use its separate initializer, such as `npx @dzhechkov/p-replicator init`.

| Preset | Skills |
|---|---|
| `meta` | 20 development-process skills — `explore`, `feature-adr`, `knowledge-extractor`, `capture-adr`, `decision-mockups`, … |
| `qe-engineer` | a quality-engineering set (`qe-test-generation`, `qe-coverage-analysis`, …) |

```bash
dz init --preset qe-engineer --target codex --skills-dir .claude/skills
```

Presets are defined as a typed TypeScript module (`src/presets.ts`) — importable
and type-checked. More presets land as more skill packs are curated.

## Status

`0.5.14` — stable. **New in 0.5.14:** `decision-mockups` joins the `meta` preset (19 → 20 skills).
A preset id is only honest if the pack backing it SHIPS the skill, so this entry lands together with
`@dzhechkov/skills-meta@0.9.42`, which vendors it.

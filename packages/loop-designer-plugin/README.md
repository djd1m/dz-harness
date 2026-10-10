# @dzhechkov/loop-designer-plugin

Site: https://aicoding.space · Source: https://github.com/djd1m/dz-harness/tree/main/packages/@dzhechkov/loop-designer-plugin

> **The plugin authors, gates and reads plans; execution uses a separate runtime.**

A Claude Code plugin for **designing agent loops**: one authoring skill (`loop-plan-author`) and
five thin command wrappers over `dz workflow` — `/loop-designer:init｜validate｜render｜lint｜trace`.

This plugin produces a typed `loop-plan/1` plan, renders it into a script, gates that script,
and reads run records. Claude Code's **Workflow host** executes the rendered JavaScript with
`Workflow({ scriptPath })`. Separately, a current `dz` CLI exposing **`workflow run <plan.json>`**
can interpret the plan through Codex/Claude CLI dispatchers, including from a Codex shell.
It does not execute the rendered JavaScript or custom USER regions. Loading this plugin does
not install a portable runner or add a loop-execution wrapper.

Portable runs need `trace.emit: true`, routable families (or `--default-family`), installed and
authenticated CLIs for the needed families, answering model probes and contained artifact paths.
Set the actual `--coder-family` for `x-role: qe` checks. See the packaged authoring skill for
pause/resume, budget and QE limits. The five-verb compatibility fallback below does not prove
`workflow run` is available; check the separately invoked `dz workflow run --help`.

---

## Install

### Path A — the marketplace (recommended)

```
/plugin marketplace add djd1m/dz-harness-hub
/plugin install loop-designer@loop-designer-marketplace
```

### Path B — no marketplace (the fallback, shipped in v1 on purpose)

Two independent ways in, both gated by the same live registration probe as Path A:

```bash
# B1 — session-scoped plugin load: skill AND the five commands
claude --plugin-dir "$(npx -y @dzhechkov/loop-designer-plugin init --print-plugin-dir)"

# B2 — bare skill into a project: the skill only, no commands
npx -y @dzhechkov/loop-designer-plugin init --dir .
```

Real output of B2 (MEASURED — reproducer: the command above in an empty project):

```
loop-designer init: installed 2 file(s) into <project>/.claude/skills/loop-designer-plan-author
  the skill registers as "loop-designer-plan-author" (the directory name IS the registered name)
  slash commands are NOT part of this path — they require a plugin load
```

Running it twice refuses and **mutates nothing** — it tells you exactly what it would have replaced:

```
loop-designer init: refusing to overwrite 2 existing file(s) under <…>/loop-designer-plan-author — re-run with --force to replace/remove them (nothing was written)
  would replace: <…>/loop-designer-plan-author/SKILL.md
  would replace: <…>/loop-designer-plan-author/references/loop-plan-1-schema.md
```

Conflicts are computed over the **union** of the shipped file set and whatever is already in the
destination, so a file left behind by an older release is reported by name too — and `--force`
**removes** it rather than silently keeping it in a directory this README calls byte-identical to
the canon:

```
loop-designer init: refusing to overwrite 2 existing file(s) and 1 stale survivor(s) not in this release under <…>/loop-designer-plan-author — re-run with --force to replace/remove them (nothing was written)
  would replace: <…>/loop-designer-plan-author/SKILL.md
  would replace: <…>/loop-designer-plan-author/references/loop-plan-1-schema.md
  stale survivor (not in this release): <…>/loop-designer-plan-author/references/old-reference-set.md
```

---

## Requirements: `dz` in `^0.4.6`

This plugin does not bundle `dz` and does not depend on it through npm. At run time it:

1. asks the `dz` on your `PATH` for its version (**global fast path**);
2. uses it only if the answer PARSES and lands inside `^0.4.6` (i.e. `>=0.4.6 <0.5.0`);
3. otherwise falls back to `npx -y @dzhechkov/harness-cli@^0.4.6`.

**The floor is 0.4.6, not 0.4.0**: `loop-designer verify` passes `--plugin-dir`, and that flag was
introduced in `harness-cli` 0.4.6 — a 0.4.0–0.4.5 refuses it by name. A pre-floor 0.4.x on PATH is
therefore refused with the sentinel plus the real reason and the upgrade hint
(`npm i -g @dzhechkov/harness-cli`), instead of dying later with an unexplained child error.

**Exit status is never evidence of a version.** Before `harness-cli` 0.4.6, `dz --version` printed
the whole usage manual and exited 0 (MEASURED — reproducer: `node dist/bin.js --version` on 0.4.5).
A guard keying on the status would have called a pre-0.4 binary with 0.4 semantics, so this one
keys on a parsed number and nothing else.

A `dz` **newer** than `^0.4.6` is not refused on its version alone — it gets a capability probe
(`dz workflow --help` must exit 0 and still list the wrapped verbs). Only a failed probe sends you
to npx. A **passed** probe is announced with a plain informational line
(`loop-designer: newer dz 0.5.0 accepted via capability probe …`) — never with a `LOOP-DZ-*`
sentinel, because the sentinels are the refusal channel and appear ONLY on refusals.

### Refusals are announced on stderr, by name

| Sentinel | Meaning |
|---|---|
| `LOOP-DZ-STALE` | the `dz` on PATH was rejected (older, below the 0.4.6 floor, unparseable, or failed its capability probe); npx was used instead |
| `LOOP-DZ-UNAVAILABLE` | no usable `dz` at all — npx absent, or its **fetch failed** (offline, registry outage, timeout). **Nothing ran.** |
| `LOOP-DZ-RANGE-UNSATISFIABLE` | npx delivered a `dz` outside `^0.4.6`. Nothing ran. |
| `LOOP-DZ-PLUGIN-ROOT-UNSET` | a command wrapper's `${CLAUDE_PLUGIN_ROOT}` did not resolve at run time; the wrapper fell through to the npx form (AM-10) |

Key on the sentinel LINE, not on the number: this wrapper propagates its child's exit code verbatim
(`dz workflow-lint` answers 0/1/**3**), and nothing pins a future `dz` subcommand to today's codes.
A sentinel appears only on a REFUSAL — an accepted resolution is silent or informational.

---

## The five commands

| Command | Wraps | Exit codes |
|---|---|---|
| `/loop-designer:init` | `dz workflow init` | 0 written · 1 rejected |
| `/loop-designer:validate` | `dz workflow validate` | 0 valid · 1 parse error or INV-1..8 violation |
| `/loop-designer:render` | `dz workflow render` | 0 rendered · 1 refused/differs |
| `/loop-designer:lint` | `dz workflow-lint` | 0 pass · 1 fail · **3 inconclusive — never a pass** |
| `/loop-designer:trace` | `dz workflow-trace` | 0 read · 1 unreadable |

### The end-to-end sequence, with its REAL output

MEASURED 2026-08-17 against `dz` 0.4.6 first on PATH — reproducer: run these five commands in an
empty directory. Nothing below is a reconstructed transcript, and nothing was cut from it: an
in-range `dz` resolves on the clean fast path, which emits **no** stderr line at all — no sentinel,
no note. (Under a pre-0.4.6 or unparseable `dz` every one of these commands would be preceded by a
`LOOP-DZ-STALE` line; that path is pinned by `test/dz-version-guard.test.mjs`, not shown here.)

```console
$ loop-designer run init --name review-swarm --pattern barrier --o review-swarm.plan.json
dz workflow init: wrote <cwd>/review-swarm.plan.json (pattern: barrier)
Next: edit the TODO prompts, then `dz workflow validate` + `dz workflow render`.

$ loop-designer run validate review-swarm.plan.json
dz workflow validate: OK (digest sha256:61198977aca27a1e…)

$ loop-designer run render review-swarm.plan.json --o review-swarm.js
dz workflow render: wrote <cwd>/review-swarm.plan.json then <cwd>/review-swarm.js (exec-fp sha256:606519baf0899c9f…, blobs: trace)
Gate it: dz workflow-lint review-swarm.js --plan <cwd>/review-swarm.plan.json --require-plan

$ loop-designer run lint review-swarm.js --plan review-swarm.plan.json --require-plan
WARN         size-budget: 509 lines > 350 advisory budget — consider splitting phases or moving judgment into skills (WARN only, never blocking — FR-3.10) [anchor: wc -l]
dz workflow-lint: PASS (mode=require-plan; 0 fail, 1 warn, 0 inconclusive over 18 rules)

$ loop-designer run trace --slug review-swarm
dz workflow-trace: no trace.jsonl under <cwd>/features/review-swarm (the loop writes its own trace only when the plan sets trace.emit: true)
```

This authoring sequence has not executed the script. For rendered-script execution, use the
Claude Code Workflow host:

```js
Workflow({ scriptPath: 'review-swarm.js' })
```

Alternatively, set `trace.emit: true`, replace the plan's TODOs, and invoke a current `dz` directly:

```bash
dz workflow run review-swarm.plan.json --run-id review-swarm-1 --default-family codex --coder-family codex
# On exit 75, follow the final pause envelope and resume with --resume review-swarm-1.
```

Run exits are 0 completed, 1 failed, 2 usage/invalid plan, and 75 typed pause; lint's 3 remains
inconclusive. Portable run records default to `.dz/loop-trace/<runId>/`. These are distinct
execution paths; source and fixture tests do not establish blanket live parity.

---

## What you get on each vehicle (the honesty matrix)

| Vehicle | Skill | The five commands | Loop execution |
|---|---|---|---|
| **V1** marketplace install | yes, as `loop-designer:loop-plan-author` | yes | separate Workflow host or portable CLI |
| **V2** `claude --plugin-dir <pkg>` | yes, session-scoped | yes, session-scoped | separate Workflow host or portable CLI |
| **V3** bare skill (`init --dir .`) — MEASURED, reproducer `.fa-state/probe-frontmatter-name.md` | yes, as `loop-designer-plan-author` | **no** — commands require a plugin load | separate runtime required |
| **V4** Codex (`dz init --target codex`, or the `.codex-plugin` showcase) | yes | no — `dz` over Codex's shell instead | portable `dz workflow run` when CLI prerequisites are met; rendered scripts require the Workflow host |

Evidence tags for that table, stated rather than implied: **V2 and V3 are MEASURED** on Claude Code
2.1.233 (reproducers: `features/loop-designer-plugin/.fa-state/probe-plugin-root.md` and
`probe-frontmatter-name.md` — a `--plugin-dir` fixture registered its skill *and* its commands
namespaced, and a bare-skill fixture registered under its directory name with no commands). **V1 and
V4 are CLAIMED** until the pre-publish live probe runs against the published artifact; if V1's
commands do not surface on the tested client, this row is downgraded to "skill only" rather than
shipped as an unverified promise.

`${CLAUDE_PLUGIN_ROOT}` **resolves** in command bodies on Claude Code 2.1.233 (MEASURED —
reproducer: `features/loop-designer-plugin/.fa-state/probe-plugin-root.md`), so the wrappers prefer
`node "${CLAUDE_PLUGIN_ROOT}/bin/loop-designer.js" run <verb>` — but they do not ASSUME it: each
wrapper's block is a runtime `if [ -f … ]` that, when the plugin root does not resolve (a
bare-skill or Codex session, or a host that stopped exporting it), announces
`LOOP-DZ-PLUGIN-ROOT-UNSET` on stderr and falls through to
`npx -y @dzhechkov/loop-designer-plugin run <verb>` instead of dying with a raw MODULE_NOT_FOUND
stack (AM-10; pinned by `test/plugin-root-fallback.test.mjs`).

---

## Verifying an install actually REGISTERED

A layout on disk is a proxy; the session listing is the fact. (This repo learned that the expensive
way: a published package once shipped with a green layout test and **zero** skills registering.)

```bash
loop-designer verify --static     # CI-safe layout scan, no session
loop-designer verify              # starts a real session and reads the authoritative listing
```

Exit codes: `0` pass · `1` fail · `2` **inconclusive**. Inconclusive is never a pass; it means
registration could not be observed honestly.

---

## What this package is not

- **not a loop runtime** — it has no `exec`/`start`/`run-the-loop` verb, and a test asserts that;
- **not a re-implementation** — it shells out to `dz`; it never links the plan/lint/render engines;
- **not a second copy of the skill** — `skills/loop-plan-author/` and `.codex-plugin/skills/…` are
  byte-identical projections of the canon at `packages/@dzhechkov/skills-meta/loop-plan-author/`,
  healed by `dz sync-canonical loop-plan-author` and gated by `dz drift-check`.

## License

MIT

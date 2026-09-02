# @dzhechkov/harness-cli

The **`dz`** CLI — the main entry point to the DZ Harness Hub. Install AI skills for **Claude Code, Codex, OpenCode, Hermes, OpenClaude, GitHub Copilot** from a single command.

## Why dz?

> **`dz` is a package manager + cross-compiler for your AI agent harness.** Write a skill once in one canonical form; `dz` installs it into any agent's harness, holds it to a quality bar, and lets the harness learn over time.

**The problem.** You accumulate ~179 skills (design-thinking, QE, devops, web3, MCP, academic…). Five pains follow:

1. **Every agent wants a different layout.** Claude Code reads `.claude/skills/`, Codex `.codex/`, OpenCode/Hermes/OpenClaude their own. Hand-maintaining N copies is sync hell.
2. **Skills arrive from many upstream repos** — they must be *canonicalized* (brought to one form) and kept in sync without losing provenance.
3. **It's hard to know which skill** to reach for out of a hundred.
4. **Quality drifts** — there's no single bar.
5. **Experience doesn't accumulate** — the harness doesn't learn from feedback.

**The answer — one canon → many platforms.** There is a single source of truth (a `CanonicalSkill`); `dz` compiles it for each target — so the same skill drops into `.claude/skills/`, `.codex/`, etc. without hand-copying.

**Every command maps to one of five jobs:**

| Job | Commands | What it does |
|-----|----------|--------------|
| **Author / canonicalize** | `auto-canonicalize`, `sync-upstream`, `diff`, `create-skill` | pull a skill from any repo into one canonical form + keep it in sync with upstream |
| **Install / assemble** | `init`, `setup`, `install`, `compose`, presets, `upgrade` | deploy the right set of skills into a chosen agent harness (10 targets) |
| **Find / recommend** | `registry`, `scout`, `recommend`, `skill-advisor` | for a task, suggest which skill / preset / package to use |
| **Guarantee quality** | `benchmark` (L0 A–F), `verify`, `doctor` | one bar — 20 deterministic checks per skill |
| **Learn** | `teach`, `consolidate`, `recall` (hybrid lexical+vector), `vector`, `pretrain`, `roam` (reward-learning) | accumulate patterns, harvest session outcomes, recall ranked memory (semantic when the vector tier is enabled), improve recommendations over time |

(+ ops: `publish`, `bundle` (portable export), `stats`, `downloads`, `dashboard`, `plugin`.)

**Analogy:** **npm** for distribution, a **compiler / Babel** for one source → many targets (adapters for 10 targets), and a **linter / CI** for a quality bar (`benchmark`) — but for AI agent skills, not ordinary code.

## Install

```bash
npm install -g @dzhechkov/harness-cli
```

## MCP and hook companion configuration

A skill can request companion configuration through a bounded adjacent `INTEGRATIONS.json`. The
first integration-aware init prints its aggregate digest; only
`--allow-integrations <that-digest>` can authorize the exact content. The live registration probe is
non-executing: it uses target-owned list/get surfaces, never the manifest command or URL.

The measured support matrix currently admits Claude Code `2.1.235` project MCP only. Every other
target/component pair is a named refusal, except that the existing Codex hook writer can map to
emitted when its live veto probe reports `ready: true`. Claude `Pending approval` is registration
with `ready: false`. Use `--no-integrations` for explicit skills-only installation; `--no-verify`
does not authorize emission.

> **Note:** If you get `EUNSUPPORTEDPROTOCOL workspace:*`, you're inside a pnpm/yarn workspace. Run the install from `/tmp` or `~` instead.

### Updating an already-installed `dz`

`dz` does **not** auto-update — an old global install stays old until you upgrade it explicitly.
Upgrading also refreshes all bundled skill packs to their latest published versions.

```bash
# Check installed vs. latest:
npm ls -g @dzhechkov/harness-cli          # what you have
npm view @dzhechkov/harness-cli version   # latest on npm

# Upgrade (run from /tmp to avoid the workspace:* error above):
cd /tmp && npm install -g @dzhechkov/harness-cli@latest
```

> **On an old version?** Tell-tale signs: `dz registry` shows an `other` bucket instead of
> `product`/`design` categories, or `dz init`/`dz setup` finds no skills. Upgrade as above.
> A system-wide global on Linux may live in `/usr/lib/node_modules` and need `sudo`.

## Using the arsenal: new vs. existing project

Install `dz` **once, globally** — it ships **all skill packs bundled**, so you never install packs
per-project. Then run `dz` from inside a project to write skills into its agent directory
(`.claude/skills/`, `.codex/`, …). Nothing lands until you choose a target + skills.

**See what's available (from any directory):**

```bash
dz registry                    # browse the full catalog by category
dz registry search <keyword>   # search skills
dz registry --category devops  # one category
dz stats                       # totals + full preset & target lists
dz help                        # all commands; the Presets:/Targets: lines list valid --preset/--target values
dz recommend "<your task>"     # task → recommended skills + preset
```

**New project:**

```bash
mkdir my-app && cd my-app
dz setup --target claude-code --preset devops   # skills + hooks + self-learning (.dz/)
dz init  --target claude-code --preset devops   # or: skills only
```

**Existing project** — same commands from the project root; `dz` is additive and only touches the
agent directory, never your source:

```bash
cd existing-project
dz init --target claude-code --preset qe                       # add a preset
dz init --target claude-code --select terraform,pr-review      # add individual skills
dz install @dzhechkov/skills-web3                              # add one pack
dz verify && dz doctor                                         # check health
```

Re-running is safe (existing files are skipped unless `--force`). Targets: `claude-code`, `codex`,
`opencode`, `hermes`, `openclaude`, `copilot`, `agents-md`, `cursor`, `gemini`.

### Target coverage — which coder/agent maps to which `--target`

Don't see your tool below? Two fallbacks: if it reads `CLAUDE.md`/`.claude/` use `--target claude-code`;
otherwise `dz bundle --select <ids> --out <dir>` gives a portable tree of **raw `SKILL.md`** files you can
point any tool at (a skill is just Markdown). Dedicated targets are on the [roadmap](https://github.com/djd1m/dz-harness-hub/blob/main/docs/target-expansion-research.md).

**✅ Shipped native targets** (each compiles to the tool's own layout):

| Coder / agent | `--target` | Emits |
|---------------|-----------|-------|
| Claude Code | `claude-code` | `CLAUDE.md` + `.claude/skills/` |
| OpenAI Codex CLI | `codex` | `.agents/skills/` |
| OpenCode | `opencode` | `.opencode/skills/` |
| Hermes Agent | `hermes` | `.hermes/skills/` |
| OpenClaude *(incl. the "OpenClaw"/Claw-Code fork — it mirrors Claude Code)* | `openclaude` | `.openclaude/skills/` |
| GitHub Copilot | `copilot` | `.github/instructions/*.instructions` |
| **~15 tools that read a root `AGENTS.md`** (Zed, Warp, Aider, goose, Gemini CLI, RooCode, Kilo, Junie, Trae, Augment, Devin, **pi**, Windsurf) | `agents-md` | root `AGENTS.md` (**merged** — preserves user content, owns a fenced block; lossy/flattening, no per-skill frontmatter) |
| Cursor | `cursor` | `.cursor/rules/*.mdc` (**per-skill**, YAML frontmatter `description`/`globs`/`alwaysApply`; plain `.md` in that dir is ignored) |
| Gemini CLI / Code Assist | `gemini` | root `GEMINI.md` (**merged** — preserves user content, owns a fenced block; lossy/flattening, no per-skill frontmatter — same shape as `agents-md`) |
| Windsurf | `windsurf` | `.windsurf/rules/*.md` (**per-skill**, YAML `trigger` frontmatter — `model_decision`, `description`, optional `globs`; `cursor`'s shape with a plain `.md` extension. `.devin/rules/` rebrand is an out-of-scope watch item) |

**🗺️ On the roadmap** (verified rules-formats — see the research doc):

| Coder(s) / agent | planned `--target` | reads | priority |
|------------------|--------------------|-------|----------|
| Cline · Continue · Kiro | `cline` · `continue` · `kiro` | `.clinerules/` · `.continue/rules/` · `.kiro/steering/` | mid |

**❌ No target applies:** `nemoclaw` (NVIDIA agent-safety runtime — not a code editor, no rules file) ·
`v0` (UI-only, no repo file). *(`pi` is a real coder but reads `AGENTS.md` → covered by `agents-md`.)*

#### `--target` aliases and did-you-mean

`--target claude` used to be rejected outright — the canonical name is `claude-code`, and the error
just re-printed the list. All **eight** `--target`-taking commands (`init`, `verify`, `install`,
`compose`, `setup`, `upgrade`, `parity`, `feature-adr-setup`) now resolve the value first.

*(This sentence used to say "every" and name only seven: `dz parity` was missed, and shipped the
original defect verbatim. It is now checked rather than promised — `test/target-alias-cli.test.ts`
asserts that no command reads `--target` without reaching the resolver, and that every command whose
`--help` advertises `--target` appears in the per-command sweep.)*

**Accepted aliases** (a table, so adding one is a data edit):

| You type | You get | Why it is a row |
|----------|---------|-----------------|
| `claude` · `cc` | `claude-code` | the tool's everyday name |
| `agents` | `agents-md` | the everyday name of the `AGENTS.md` target |
| `gpt` · `openai` | `codex` | the vendor name, not the CLI's |

Case, padding and separators are handled **without** a row: `CLAUDE`, `Claude_Code`, `claudecode`
and `  claude-code  ` all resolve to `claude-code`; `agentsmd` and `agents.md` resolve to `agents-md`.

**A typo is SUGGESTED, never silently accepted** — installing to the wrong target on a guess is worse
than one round-trip:

```console
$ dz init --target clade-code --preset devops > out.txt   # the refusal is on STDERR
dz init: unknown --target "clade-code" — did you mean "claude-code"?
  --target must be one of: agents-md, claude-code, codex, copilot, cursor, gemini, hermes, openclaude, opencode, windsurf
$ echo $?
1
$ wc -c out.txt
0 out.txt        # stdout stays a clean data channel, even on a refusal
```

**Both lines go to stderr** — the refusal, like the alias note below, is diagnosis, not data. `dz
parity --target <bad> --json` likewise writes its structured error to stderr and leaves stdout empty,
so `| jq` is never handed a diagnostic.

An ambiguous prefix gets no guess at all (`--target co` could be `codex` or `copilot`), and neither
does nonsense (`--target totally-bogus` prints the plain list). When an alias IS accepted, the
substitution is announced **on stderr**, so piped stdout stays machine-readable:

```console
$ dz init --target claude --preset devops > installed.txt
dz init: --target "claude" → claude-code (alias)
```

**When this matters:** you are following a blog post or a teammate's snippet that says `--target claude`.
It now works, and you are told what it resolved to.

### `dz list` — one broken skill never hides the rest

`dz list` used to abort on the FIRST unparseable `SKILL.md`: exit 1, an error naming neither the file
nor a count, and every other skill in the tree invisible. A pack you installed could blank your whole
listing. Now the loadable skills are listed on **stdout** and the unloadable ones are named on
**stderr**:

```console
$ dz list --skills-dir .claude/skills
105 skill(s) in /home/you/proj/.claude/skills:

  api-design                          Designs REST and GraphQL APIs with OpenAPI specs…
  …103 more…
  test-writer                         Writes focused unit and integration tests…
$ echo $?
1
```

…with the diagnosis kept out of the data:

```console
$ dz list --skills-dir .claude/skills 2>/dev/null   # stdout only — clean, pipeable
105 skill(s) in …

$ dz list --skills-dir .claude/skills 1>/dev/null   # stderr only — the actionable part
dz list: 105 listed, 1 skipped in /home/you/proj/.claude/skills
⚠ 1 skill(s) skipped (unparseable SKILL.md):
  /home/you/proj/.claude/skills/broken-one/SKILL.md
    SKILL.md must begin with a "---" frontmatter fence
    (line 1: "# Broken One")
```

The full contract:

| valid skills | skipped | stdout | stderr | exit |
|--------------|---------|--------|--------|------|
| >0 | 0 | the listing | *empty* | 0 |
| >0 | >0 | the listing of the valid ones | named summary | 1 |
| 0 | >0 | *nothing* | named summary (`0 listed, N skipped`) | 1 |
| 0 | 0 | *nothing* | `dz list: no skills found in <dir>` | 1 |

`dz init`, `dz install` and `dz sync` behave the same way — the good skills are installed, the bad ones
are named, and the command exits 1.

**Two failure kinds, two headers, two subjects.** A skill that will not PARSE and a skill that will not
WRITE are different accusations, so `dz init` reports them separately:

```console
$ dz init --target claude-code --skills-dir ./skills --project ./proj
dz init --target claude-code: 1 skill(s), 1 file(s) written, 0 skipped
dz init: 1 installed, 1 failed to write                       # ← stderr
✗ 1 skill(s) failed to install (compile/write error):
  alpha
    EEXIST: file already exists, mkdir './proj/.claude/skills/alpha'
```

The header names the **target**, not `alpha/SKILL.md` — which is perfectly valid. (It used to print
`⚠ 1 skill(s) skipped (unparseable SKILL.md)` and quote `line 1: "---"`, a valid frontmatter fence, as
its evidence: a failure that names the wrong artifact is worse than an anonymous one.)

`dz install` renders the offending path **relative to the package**
and says so explicitly, because a `node_modules/**` path is not something you can act on:

```console
$ dz install @someone/skills-pack
dz install @someone/skills-pack: 12 skill(s), 24 file(s) written, 0 skipped
dz install: @someone/skills-pack ships 1 unparseable skill(s) —
⚠ 1 skill(s) skipped (unparseable SKILL.md):
  skills/broken-one/SKILL.md
    SKILL.md must begin with a "---" frontmatter fence
This is a defect in the package, not in your project.
Workaround: npx -y @someone/skills-pack init
```

**When this matters:** a package you installed shipped a broken skill — you still see everything else,
you know exactly which file is at fault, and you know whose defect it is.

> **`dz` requires `@dzhechkov/harness-core >= 0.4.7`.** If you ever see
> `dz: needs @dzhechkov/harness-core >= 0.4.7, found 0.4.1`, a stale core was reused from a cache:
> `rm -rf ~/.npm/_npx && npx @dzhechkov/harness-cli@latest --version`. That named message replaced a
> bare `SyntaxError: … does not provide an export named 'GRADE_SUCCESS_FLOOR'` that used to kill even
> `dz --version`.

> **"Nothing installs" / "no skills found"?** Update the CLI:
> `cd /tmp && npm i -g @dzhechkov/harness-cli@latest`. Older global installs couldn't locate their
> own bundled packs outside the monorepo — now fixed, so `dz registry`/`dz init`/`dz setup` work
> from any directory.

## User Journey — from install to mastery

All 83 commands (MEASURED — reproducer: `node --input-type=module -e "import('./dist/index.js').then(m=>console.log(m.DZ_COMMANDS.length))"` from this package; rendered help documents 80 unique top-level names, pinned by `test/command-count.test.ts`) mapped to a real workflow:

```
DISCOVER → INSTALL → USE → CREATE → MAINTAIN → SHARE
```

### `dz profile` — say once who you are, and stop being explained the wrong things

The failure this closes is measured, not hypothetical. On 2026-08-28 an OS pipe buffer was explained
to this repository's owner across three paragraphs of kernel mechanics — he holds a **CCIE**, and
*"tail drop on a full queue with no backpressure signal"* would have landed in one line. In the same
session `ADR` and `vitest worker` went by unexplained, in a domain where he had said plainly he is not
a professional. Neither failure was ignorance. Both were not knowing who was listening.

```bash
dz profile init
# 1/5 Dialogue language (ru, en, …) [ru]: ru
# 2/5 Default register — pro / pro-lite / plain (профи / профи лайт / просто) [pro-lite]: профи лайт
# 3/5 Назовите 2–4 области, где вам НЕ нужно пояснять термины … : networking (CCIE; NSX), cloud architecture
# 4/5 Где наоборот — терминам нужна одна поясняющая фраза? : software architecture, testing internals
# 5/5 Do you teach — must explanations be re-tellable? y/n [y]: y
#
# wrote ~/.dz/profile.json (0600) — register pro-lite (профи лайт), language ru, teaches yes
#   deep: networking (CCIE; NSX), cloud-architecture · weak: software-architecture, testing-internals
# synced block into ~/.claude/CLAUDE.md
```

That block now loads in **every project on the machine**, including projects where dz is not installed
— because `~/.claude/CLAUDE.md` is read by the runtime itself, not by a hook.

```bash
dz profile show          # store path, age in days, drift verdict, the rendered block
dz profile set weak add build-toolchains
dz profile set register профи        # RU aliases accepted; stored as the neutral `pro`
dz profile sync          # after a hand-edit: repairs the block, timestamped backup, foreign content untouched
```

**When to use it:** once, at onboarding — and again whenever you correct the register twice in one
session, which is the signal the profile is wrong rather than the moment to absorb it silently.

**What it deliberately does not do.** It never changes the FACTS — numbers, caveats, risks and bad
results survive every register, or "simpler please" becomes a hole in the honesty rules. It never
touches artifacts written for future readers: ADRs, commit messages, code comments, QE reports and npm
READMEs keep their own conventions, because their audience is not the current operator. And it is
redacted from training-pair capture, because `.dz/fa-training/` records the full prompt and is
deliberately not gitignored — without that, "never write personal data into a project" would be
defeated one path over.

**What no test can prove.** That the explanation actually landed is a judgement only the reader makes.
The acceptance step is human by design and recorded as such
(`features/operator-profile/08_acceptance_cf7.md`): the same passage rendered at two registers, and
the owner says which one works. That run found a real defect — a term glossed in one breath and
another assumed in the next — and produced the rule the block now carries: **an explanation is
self-contained; every term gets its gloss at first use in THIS passage, because the earlier text has
scrolled away and a new session never had it.**


### Phase 1: Discover (what's available?)

```bash
npm install -g @dzhechkov/harness-cli    # install the CLI

dz help                                   # see all commands
dz pretrain                                # analyze project files → recommend by tech stack
dz recommend "build API and deploy to K8s" # keyword match → skills + toolkits
dz recommend "work on this project"        # unmatched? → labels suggestions as PROJECT-STACK, not task-derived
dz stats                                  # 54 packages, 201 skills, 10 targets, 14 presets
dz dashboard                              # visual panel — packages, adapters, skill packs
dz registry                               # browse all 179 skills by category
dz registry search kubernetes             # find specific skills
dz registry --category devops             # filter by domain
dz downloads                              # npm weekly download stats
```

Russian and English word forms share the same lexical search tier; both the query and the
catalogue text are normalized. The current workspace reproducer prints the same count for the
two Russian forms (the catalogue count may grow, but the pair must stay equal):

```console
$ dz registry search "анализы"
Search: "анализы" — 8 result(s)
$ dz registry search "анализ"
Search: "анализ" — 8 result(s)

$ dz recommend "пришли анализы крови, хочу разобраться"
║  Topics: health
```

`dz recommend --json` reports `topicSource` as `task`, `project-stack`, or `none`. When no topic
matches, human output explicitly says that any suggestions came from the project stack; if the
stack also yields nothing, it prints that no recommendations were found.

### Phase 2: Install (set up your workspace)

```bash
# Full setup with self-learning (recommended):
dz setup --target claude-code --preset devops  # pretrain + hooks + memory + installs the preset skills

# With AgentDB vector memory (semantic search + self-learning):
dz setup --target claude-code --preset devops --memory agentdb  # vector memory + agentdb MCP server

# Or just install skills (no learning):
dz init --target claude-code --preset devops   # 30 DevOps skills
dz init --target openclaude --preset web3      # 12 DeFi skills for OpenClaude
dz init --target codex --preset mcp            # 16 MCP skills for Codex

# Or pick individual skills:
dz init --target claude-code --select terraform,kubernetes,docker-compose

# Or install from any npm package:
dz install @dzhechkov/skills-devops            # npm install + copy skills

# Verify everything is correct:
dz verify                                       # structural validation
dz doctor                                       # 7 health checks
dz list                                         # show installed skills
dz info --id terraform                          # detailed info about a skill
```

### Phase 3: Use (work with your agent)

```bash
# Now use Claude Code / Codex / OpenCode / Hermes normally.
# Skills are auto-discovered from the platform's skills directory.
# Example in Claude Code:
#   "Review this PR" → pr-review skill activates
#   "Design an API" → api-design skill activates
#   "Fix this CI" → ci-fix skill activates
#   "Сделай AI-дайджест за февраль" → news-digest (cited report); "what's new since last week" → news-monitor (delta)
```

### Phase 4: Create (build your own skills)

```bash
# Scaffold a new skill:
dz create-skill --name my-skill --description "What it does" --tier 2

# With BTO-compatible eval templates:
dz create-skill --name my-skill --bto

# Benchmark your skill (aim for Grade A):
dz benchmark .claude/skills/my-skill           # single skill — 20 L0 checks
dz benchmark packages/@dzhechkov/skills-devops --all   # batch all
dz benchmark skill-a --compare skill-b          # A/B compare

# Find skills to canonicalize from the ecosystem:
dz scout                                        # scan 11 sources (GitHub, npm+plugins, HN, ...)
dz scout --deep                                 # deep analysis with SKILL.md parsing
dz auto-canonicalize --source github.com/user/repo --pack packages/@dzhechkov/skills-devops
```

### Phase 5: Maintain (keep skills fresh)

```bash
# Check for upstream changes (canonicalized skills):
dz sync-upstream --list                                 # which packages have external sources?
dz sync-upstream --all                                  # check all against upstream
dz sync-upstream --package packages/@dzhechkov/skills-devops  # check one

# Check installed skills vs canonical:
dz upgrade                                      # shows which skills need update
dz upgrade --target openclaude                  # check specific platform

# Sync canonical to legacy layout:
dz sync                                         # canonical → project skills
dz migrate                                      # detect legacy installations

# Author + gate custom Workflow loops (loop-plan/1):
dz workflow init --name my-loop --pattern pipeline --o my-loop.plan.json
dz workflow render my-loop.plan.json --o my-loop.js
dz workflow-lint my-loop.js --plan my-loop.plan.json --require-plan

# Cross-host state sync:
dz roam --apply                                 # sync agent state across machines

# Is the self-learning loop actually paying off?
dz compounding                                  # readiness + payoff report (INSUFFICIENT_DATA is a real answer)
dz deadwood --weeks 8                           # advisory deprecation candidates; shallow history → INSUFFICIENT_DATA
dz epoch-replay --mock --n 24 --effect 0.9      # $0 dry run of the cold-vs-warm verdict math
dz epoch-replay --emit                          # ready? emit the real cold-vs-warm work order
```

### Phase 6: Share (publish to the world)

```bash
# Verified release — 4 HARD gates (tests, audit, syntax, smoke-boot) in FRONT of dz publish:
dz release --dry-run                            # print the full gate plan, execute nothing
dz release --filter skills-devops --tag         # gates for one release set; on green: git tag + notes
dz release                                      # gates for the whole workspace; green prints the ready dz publish command

# Publish updated packages to npm:
dz publish --dry-run                            # preview
dz publish --filter skills-devops               # publish specific package
dz publish                                      # publish all changed packages

# Export portable, self-contained skill bundles for a generic consumer (e.g. a LangGraph app):
dz bundle --preset news --out ./dist            # → ./dist/skills/<id>/ (SKILL.md + references/scripts/assets)
dz bundle --select news-digest,goap-research-ed25519 --out ./dist
```

---

## Three Ways to Install Skills

| | **Individual Skill** | **Preset** | **npx Package** |
|---|---|---|---|
| **What** | 1 SKILL.md file | Curated list of skill names | Full toolkit with orchestration |
| **Contains** | Instructions for 1 task | N skill references | Skills + commands + rules + shards + agents + memory |
| **Pipeline** | No | No | Yes (phases, checkpoints, governance) |
| **Self-learning** | No | `dz setup` adds it | Built-in |
| **Install** | `dz init --select X` | `dz setup --preset X` | `npx @dzhechkov/X init` |
| **Example** | `terraform` | `devops` (30 skills) | `keysarium` (7-phase research) |

```bash
# One skill:
dz init --target claude-code --select design-thinking

# Curated set by topic (recommended):
dz setup --target claude-code --preset meta          # 20 development skills + self-learning

# Full toolkit with orchestrated pipeline:
npx @dzhechkov/keysarium init                        # 7-phase research + commands + memory
```

**When to use which:**
- Need **1 specific capability** → `--select`
- Need a **themed set** that works together → `--preset`
- Need a **full pipeline** with commands and governance → `npx`

### `dz sign` / `dz verify-pack` — cryptographic tamper-evidence

Ed25519 over a file manifest, plus a CycloneDX SBOM. Zero dependencies (`node:crypto`).

**What it answers:** *are the bytes I am looking at the bytes the holder of the pinned key signed?*
**What it does NOT answer:** whether those bytes are any good. A signature gives provenance and
tamper-evidence, never truthfulness.

```bash
# One-time: generate the Ed25519 keypair. The PRIVATE key is written OUTSIDE the repo (mode 0600);
# the PUBLIC key is printed — commit it as keys/dz.pub. dz refuses an --out inside the repo tree.
dz sign --init --out ~/.dz/keys/dz.key

# Sign a pack. The private key MUST live outside the repo — dz refuses otherwise.
dz sign --pack packages/@dzhechkov/skills-qe --key ~/.dz/keys/dz.key

# Verify an unpacked artifact. The public key comes from the REPO (keys/dz.pub), never from the pack:
# whoever replaced the artifact would have replaced a key shipped inside it.
dz verify-pack --pack ./unpacked-tarball/package             # exit 0 = artifact unmodified
dz verify-pack --pack ./downloaded-pack --pubkey keys/dz.pub # explicit trust root

# The SBOM on its own (CycloneDX 1.5, a file-level bill of materials for the pack):
dz sbom --pack packages/@dzhechkov/skills-qe                 # print to stdout
dz sbom --pack packages/@dzhechkov/skills-qe --out sbom.json # write to a file
```

A single flipped byte, a deleted file, or an **added** file inside the authenticated npm shipment set
fails verification and names the path. Directory segments `node_modules`, `.git`, `.agentic-qe`, and
`.dz` are unsigned local/dependency/VCS state by design and are absent from both manifest and SBOM; an OK
verdict makes no claim about bytes placed there. A symlink smuggled anywhere else still fails loudly.
`sbom.json` is required even though it is not self-hashed: after the signature is valid, `verify-pack`
derives the canonical CycloneDX bytes from the signed manifest and rejects a missing, malformed, duplicated,
renamed, re-hashed, or metadata-modified SBOM. This keeps the trust chain acyclic without leaving the SBOM
as unauthenticated decoration.
CycloneDX `SHA-256` fields describe raw bytes only. Because packers may reorder ordinary
`package.json` metadata, format v3 publishes its semantic canonical digest through explicit
`dz:canonical-json-sha256-v2` and `dz:digest-basis=package-json-ordered-conditions-v2` properties.
Canonicalisation still sorts packer-noise keys, but preserves every object key order under `exports`,
`imports`, and `typesVersions`; changing first-match condition order therefore changes the signed digest.
Current/v3 signing and verification refuse malformed, duplicate-key, or precision-losing JSON.
Verification retains compatibility-only readers for existing v1/v2 manifests; new evidence emits v3.
`dz sign` hashes the pnpm tarball because pnpm rewrites `package.json` and may synthesize or omit files;
the authoring tree is therefore not the signed object. `dz publish` rebuilds and verifies that exact
artifact, while direct `verify-pack` is for an already unpacked artifact or installed package.
Re-sign after ANY pack change (the manifest hashes `package.json` too) — sign is the LAST step before publish. Every degenerate input (no manifest, empty file list, empty signature, no public key)
fails **closed** — absence never reads as success. `dz doctor` **and** `dz drift-check` run this check
over the installed packs: a **tampered** pack is fatal (blocks); an **unsigned** pack or a missing trust
root is reported, not fatal (transitional — the existing packs are not yet signed).

`dz publish` runs the check before publishing anything. With `keys/dz.pub` committed, an unsigned or
mismatching pack **blocks the release**. Until then, packs publish unsigned and `dz publish` says so on
every run; `--require-signing` turns that into a refusal today.

**From Claude Code, in plain language:**
> "Sign the QE skill pack with my key at ~/.dz/keys/dz.key, then verify it."
> "Check whether the pack I just downloaded matches what we published."
> "Publish, but refuse if anything is unsigned."

### Signature checks in `dz doctor` and `dz upgrade`

`dz doctor` verifies every installed `skills-*` pack against a **pinned** Ed25519 key, and `dz upgrade`
verifies what it just installed. A pack that does not match its signed manifest is **fatal**:

```bash
dz doctor                      # ... signatures: 23 verified, 0 unsigned, 0 TAMPERED (the gate is ARMED: keys/dz.pub committed)
dz doctor --require-signing    # an unsigned pack becomes fatal too
dz upgrade                     # a TAMPERED pack aborts the upgrade
dz doctor --pubkey ./my.pub    # verify against a key you pinned yourself
```

Key precedence: `--pubkey` > the repository's `keys/dz.pub` > the key shipped inside `harness-cli`.
The key **never** comes from the pack being verified — whoever replaced the pack would have replaced a
key that travelled inside it.

**Honest limits.** The packaged key lives in the verifier and vouches for *other* packs; a compromised
`harness-cli` is outside the threat model, because you have already run its code. And a signature proves
the bytes are unmodified — never that the skill is any good. Today no key is committed, so every pack
reports `unverifiable` and nothing fails.

**From Claude Code, in plain language:**
> "Run doctor and tell me if any installed pack was modified."
> "Upgrade, but abort if anything fails its signature."

### npm provenance on release

`dz publish` appends `--provenance` **only** where an OIDC token can be minted — `GITHUB_ACTIONS=true`
plus both `ACTIONS_ID_TOKEN_REQUEST_URL` and `ACTIONS_ID_TOKEN_REQUEST_TOKEN`, which GitHub exports under
`permissions: id-token: write`.

```bash
dz publish                 # auto: provenance in CI, silent no-op locally
dz publish --provenance    # force. FAILS before the batch if the environment cannot mint a token
dz publish --no-provenance # escape hatch for a registry outage; prints why it was used
```

Provenance proves *which workflow, at which commit, built this tarball* — and there is no private key for
anyone to leak. It does **not** prove the code is good, and an attacker who can push to `main` and trigger
the release job gets a perfectly attested malicious package.

A ready-to-install workflow is at `features/publish-provenance/07_code_changes/publish.yml`; copy it to
`.github/workflows/` and add an `NPM_TOKEN` secret.

### Lesson quarantine — a fresh lesson is a hypothesis, not knowledge

Self-learning has a poisoning problem: the moment `dz teach` stores a lesson, it ranks alongside
patterns proven over months and can ride the auto-inject hook into your next task's context — even
if it is wrong, one-off, or junk. Quarantine (opt-in) closes the gap between COLLECT and RANK:

```jsonc
// .dz/config.json
{ "memory": { "learning": {
    "quarantine": true,            // fresh lessons start as quarantined hypotheses
    "quarantineDamp": 0.5,         // rank multiplier for ⚠q hits in recall (0..1]
    "quarantineExpireDays": 30     // unconfirmed after N days ⇒ expiry CANDIDATE (report only)
} } }
```

Three surfaces, three strictness levels — and promotion is EARNED, never automatic:

```bash
dz teach "..."                        # → "⚠ quarantined: excluded from auto-inject, damped in recall"
dz recall "topic"                     # ⚠q hits are VISIBLE but marked + rank-damped (never hidden)
# the UserPromptSubmit auto-inject hook EXCLUDES ⚠q lessons entirely (logged, never silent)

dz teach --reinforce "<exact text>"   # confirming a lesson IS its promotion
dz recall --promote <dzId> --apply    # or promote explicitly (dry-run by default)

dz consolidate --prune-quarantine           # report expired unconfirmed lessons (dry-run)
dz consolidate --prune-quarantine --apply   # remove them (snapshots first) — a SEPARATE gate,
                                            # never coupled to --prune-noise (unproven ≠ garbage)
```

Absent config = zero behavior change. Existing lessons are grandfathered as promoted; a corrupt
quarantine marker reads as promoted (a metadata glitch must never isolate proven knowledge).
**When to use:** any project where subagents teach lessons unattended — the quarantine is the gate
between "an agent wrote this down" and "agents now act on it".

### Target parity — `dz parity` (the honest feature × target map)

The harness runs on 10 targets, but not every feature runs everywhere: hooks, MCP (Model Context
Protocol) and the Workflow runtime exist only on some platforms. `dz parity` answers "what do I
actually get on X?" from a COMPUTED capability model — the matrix is never hand-written (a
hand-maintained table is a drift surface; the model lives next to the code, under tests that
refuse an unclassified 11th target).

```bash
dz parity                    # the full grid: ✓ full / ◐ manual (via which form) / — absent
dz parity --target codex     # one target in detail: what works, THROUGH what
dz parity --json             # machine contract (targets, capabilities, per-cell level + via)
```

Example (real output, trimmed):

```
dz parity — codex  (capabilities: shell, skills, mcp)
  ✓ dz CLI (all commands)                    via shell command
  ◐ feature-adr pipeline                     via interactive skill (plain /feature-adr)
  ◐ Step-10 Delivery Gate                    via dz delivery-check (CLI 4-plane hand-off protocol)
  ◐ Integrity claim-check                    via dz claim-check (CLI) + publish gate
```

**When to use:** before promising a workflow to a teammate on Cursor/Codex/Hermes; when choosing
a target for a project; as the requirements input for porting a feature to more targets.

### Does the learning loop actually pay? — `dz compounding`

dz's self-learning has collect, rank and apply legs — this command answers whether they COMPOUND,
honestly. Ported from rUv's darwin-mode with a deliberate split: the seeded statistics came over
verbatim (deterministic bootstrap, lower-95 promotion, and a minimum of 5 samples per arm — darwin's
own calibration measured a 33% false-discovery rate at n=3); darwin's measurement legs did NOT (they
score fixtures, not your data). The measurements here run over what your machine actually recorded:

```
$ dz compounding
  POOL PAYOFF: 154 lessons · 27 ever injected by the apply leg · 89 touched by any recall
    write-only ratio (strict bar): 82%
  GUARD TRAJECTORY (violations, first half vs second half of the audit span):
    ↓ no-workspace-star: 31 → 0
    ↓ readme-first: 49 → 4
  COLD-VS-WARM REPLAY: 2 unique prompt event(s); 5 needed — queries are recorded as of 2026-07-28
  INSTRUMENTATION: last apply-leg record … — live
  EVIDENCE CHAIN .dz/recall-usage.jsonl: verified · 3 chained · 133 pre-chain (uncovered)
  EVIDENCE CHAIN .dz/guard-audit.jsonl: verified · 3 chained · 82 pre-chain (uncovered)
  LESSON → RULE FUNNEL (calendar month, observed traffic only):
    2026-08 · eligible/attempted/accepted/executions NOT MEASURED (promotion-history-not-recorded)
```

Four honesty rules are load-bearing:
- **a gate without enough data says INSUFFICIENT DATA** — never a verdict (the apply-leg log turned
  out to have been silently dead for 19 days; "no data" is a finding, not a pass);
- **readiness is not a result** — the replay section says `ready`, never `promote`;
- **improvement is judged by RATE** (violations per audit), so a quiet afternoon cannot masquerade
  as progress;
- **zero promotions is not itself a finding** — the funnel names a stopped stage only when its
  predecessor is non-empty and it stays empty for three consecutive measured UTC months. A missing,
  malformed, unreadable, unobserved, or anchorless source prints `NOT MEASURED (<reason>)`, never 0.

The funnel is prospective: ordinary non-dry `dz guard promote` runs append bounded candidate/status
observations to the existing `.dz/promotion-state.json`; `--dry-run` still writes nothing. Guard
firings join by the opaque digest of the exact effective template+params carried in the audit row, never by a
display rule id alone. Text and `--json` render the same counts/status/findings model and issue no
overall learning-health verdict.

The prompt queries that make replay possible stay on your machine: `.dz/recall-usage.jsonl` is
git-ignored, entries are truncated at 200 chars and flagged when truncated (a prefix is not a prompt,
so flagged rows never count as replayable).

`dz deadwood --weeks 8` applies the same no-data discipline to harness maintenance: until command
history spans the requested window and sample floor, it prints `VERDICT: INSUFFICIENT_DATA`. Once
ready, it lists only human-review deprecation candidates, reports safety-net exclusions with their
written reasons, and labels skills `no-instrumentation` because no skill invocation signal exists.
It never deletes, disables, renames, or deprecates a command, skill, or rule.

#### Is the evidence itself intact? — the event chain

Every number above is computed from two JSONL files, and a compaction bug already inflated one of
them once (read totals grew `2 → 4 → 6` across three compactions, fixed 2026-07-28). So each record
appended to `.dz/recall-usage.jsonl` and `.dz/guard-audit.jsonl` now carries a sequence number and a
hash of the line before it, and both `dz compounding` and `dz doctor` verify the chain:

```
$ dz compounding | grep 'EVIDENCE CHAIN'
  EVIDENCE CHAIN .dz/recall-usage.jsonl: verified · 3 chained · 133 pre-chain (uncovered)

$ dz doctor            # silent while clean; on damage:
  [XX] evidence chain (.dz/guard-audit.jsonl) - 1 defect(s): BrokenLink@L3 —
       learning verdicts computed from this log are unsafe
```

Defects are named, not lumped: `BrokenLink` (an edited or lost record), `DuplicateSeq` (a duplicated
record, or two writers racing), `NonMonotonicSeq` (an unrecorded restart), `TornTail` (a partial
write), `DoubleCounted` (a rewrite that emits more events than it read — the `2 → 4 → 6` class),
plus three that keep a rewrite from certifying itself: `LedgerImbalance`, `MalformedLedger` and
`ClaimInterrupted`.

Two rules make the check hard to fool, both learned from cross-model review:

- **compaction refuses to launder.** A rewrite that re-chains a damaged file would turn corruption
  into a clean chain — so compaction verifies its input first and REFUSES a defective one. The log
  then grows past its size cap, on purpose: the cap is a convenience, the evidence is the product.
- **a rewrite cannot silently eat a concurrent append.** The whole-file rewrite takes an exclusive
  lock and re-reads the live file immediately before the rename; an append that landed in between
  aborts the attempt and is folded into the retry instead of being overwritten.

**Honest scope, stated everywhere it appears:** this is corruption detection for *our own* bugs —
compaction, torn writes, races. FNV-1a is not cryptography and the threat model has no adversary:
anyone who can edit the log can recompute the chain. **When to use:** read the line before you quote
any `dz compounding` number, and after any crash that interrupted a write.

Three properties make it safe to run on a per-prompt hook: chain fields come from the **last line
only** (no full-file scan per append); records written before chaining existed stay valid and are
reported as an uncovered `pre-chain` prefix rather than flagged; and a tail that cannot be read
**never blocks the write** — the writer starts a fresh, explicitly marked segment.

### Did the lessons actually change outcomes? — `dz epoch-replay`

`dz compounding` says a cold-vs-warm replay **can** be run. `dz epoch-replay` **runs** it and reports
what it found: Epoch 0 (cold — the prompt alone) vs Epoch 1 (warm — the same prompt plus exactly the
lessons the apply leg injected), on the same instances, scored into a three-valued verdict.

**The test is PAIRED.** Each instance is one judgment on one prompt, so the statistic is a single
binomial over *decisive* pairs: `p̂ = warm wins / (warm wins + cold wins)`, with a `95%` Wilson
interval reported on the **lift** scale `2p̂ − 1`. Ties carry no direction — they are excluded from
the denominator and reported separately.

**`SUPPORTED` only when the lift interval lies entirely above zero.** `FALSIFIED` only on **harm**
(entirely below zero) or on a passed **non-superiority** test — the lift upper bound below a
pre-registered margin, default `0.05`, at 10+ decisive pairs. Everything else is `INCONCLUSIVE`, a
first-class honest outcome; below 5 decisive pairs there is no verdict at all.

**A tie is under-powered, not refuted.** `6/12` gives a lift interval of `[-0.492, 0.492]` — that
excludes nothing, so it reads `INCONCLUSIVE`. So does a *perfectly* even 500/500 over 1000 pairs
(lift upper `0.0619`): the most uninformative result the protocol can produce must not be reported
as a refutation. A refutation has to clear a bar too.

**Try it at $0 first — `--mock` generates seeded synthetic outcomes at a TRUE effect you choose, and
runs them through the real verdict math:**

```
$ dz epoch-replay --mock --n 24 --effect 0.9 --seed 20260729
  COLD (epoch 0, no injected lessons): 1/24   CI95 [0.007, 0.202]
  WARM (epoch 1, apply-leg lessons):   23/24  CI95 [0.798, 0.993]
  VERDICT: SUPPORTED
    warm 23/24 CI [0.798, 0.993] is DISJOINT above cold 1/24 CI [0.007, 0.202]

$ dz epoch-replay --mock --n 24 --effect -0.9 --seed 20260729   # → FALSIFIED (harm)
$ dz epoch-replay --mock --n 24 --effect 0.4  --seed 20260729   # → INCONCLUSIVE (neither separates nor excludes)
$ dz epoch-replay --mock --n 12 --effect 0    --seed 7          # → INCONCLUSIVE (6/6 tie: under-powered, NOT refuted)
```

```
$ dz epoch-replay --mock --n 24 --effect 0.9 --seed 20260729
  SLICE: all · 24 scored instance(s) · 24 DECISIVE pair(s)
  COLD (epoch 0, no injected lessons): 1/24 decisive   CI95 [0.007, 0.202]
  WARM (epoch 1, apply-leg lessons):   23/24 decisive  CI95 [0.798, 0.993]
  LIFT (paired, 2p−1 over decisive pairs): +0.917  [0.595, 0.985]
  VERDICT: SUPPORTED — the lift interval lies ENTIRELY above zero
```

Every mock run prints `SYNTHETIC … it is NOT evidence about the learning loop`, and the same seed
gives byte-identical output — a demo is a reproducer.

**Real mode: the runner ORCHESTRATES and SCORES — it never calls a model.** Generation and judging
happen out of band, so the core stays pure, offline and reproducible:

```
$ dz epoch-replay --emit                   # → .dz/epoch-replay/work-order.json  (git-ignored: raw prompts)
     25 instance(s) · seed 20260729 · blind A/B assignment PRE-REGISTERED
  # 1. have an agent fill coldPlan / warmPlan for each item (symmetric length, same task)
$ dz epoch-replay --judge .dz/epoch-replay/work-order.json     # → blind judge prompts
  # 2. have an EXTERNAL, cross-model judge answer them → [{ "id": …, "winner": "A|B|TIE" }]
$ dz epoch-replay --score judgments.json --work-order .dz/epoch-replay/work-order.json --slice task
```

Three things make that blind real rather than decorative:

- **The judge sees `{id, prompt}` and nothing else.** No assignment, no arm names, no slice label,
  not even a path back to the work order. The judge file is byte-identical whichever way the
  assignment fell, so it cannot be decoded. (Skipped items are reported on stdout, not in the file —
  their reasons name arms.)
- **The work order is integrity-checked.** It carries a sha256 digest over its pre-registered core
  (version, seed, margin, corpus fingerprint, every `[id, warmIsA]`); `--judge` and `--score`
  recompute it *and* re-derive every assignment from the stated seed, refusing on any mismatch. A
  hand-written order does not buy a verdict.
  > **Honest scope:** this is an integrity check against accidental corruption and mismatch — **not
  > a cryptographic commitment.** The hash is self-contained, so a determined operator can re-forge
  > it (seed-searching a matching assignment at n=12 takes a few thousand tries). The threat model
  > is *you making a mistake*: a hand-edited file, a stale order paired with fresh judgments. The
  > honest-use contract is procedural — emit once, then judge, and keep the emitted file. `--emit`
  > records `emittedAt` + a corpus fingerprint and `--score` prints the digest, seed and margin, so
  > a reviewer can ask for the original and compare three numbers.
- **The non-superiority margin is pre-registered.** `--margin` is accepted only at `--emit`, is
  stored in the work order and covered by the digest, and `--score` **refuses** a `--margin` flag —
  a margin chosen once you can see the counts is not a pre-registration, and `--margin 99` at
  scoring time would simply buy `FALSIFIED`. Out of range (outside `(0, 0.5]`) is refused, not
  clamped.
- **Corrupt input is refused, not measured.** Duplicate judgement ids exit 1 rather than counting
  one opinion N times. Unknown ids and unparseable winners are skipped **with a reason**, never
  guessed.

The warm arm's only delta is the injected lessons: no gold answers, no verdicts, no outcome labels
ever enter a work order.

**When to use:** after `dz compounding` reports the replay as READY; before claiming that recall
"works"; and any time you want the claim re-checked as the corpus grows.

### Обратный мост QE: Claude-ревьюер из Codex-сессии — `dz qe-bridge`

The cross-family rule ("the family that writes the code must not review it") was enforceable in one
direction only. When **Codex hosts** the run there is no Claude agent plane to dispatch from — and
`dz reqe`'s brief admits it: for a claude review family it prints `null` where the codex branch
prints a ready command. `dz qe-bridge` is that missing vehicle: a plain-shell command that probes a
Claude model, sends a Step-8-shaped brief over SCOPED extracts, and PARSES the verdict.

```bash
# MEASURED 2026-08-19 on this repo — reproducer: the exact command below, reviewing a real shipped feature
$ dz qe-bridge --family claude --slug wave1-scorer-negation --coder-family codex --model opus
dz qe-bridge: GRADE C from claude/opus — 7 finding(s) in 343s
  report:  features/wave1-scorer-negation/08b_reqe_report.md
  signoff: features/wave1-scorer-negation/.fa-state/qe-bridge/signoff-2026-08-19T18-48-45-545Z.json
  settle:  dz reqe --slug wave1-scorer-negation --done --report features/wave1-scorer-negation/08b_reqe_report.md
  the bridge REPORTS (any grade exits 0); gating stays with dz reqe and the host pipeline.

# the same command with a binary that cannot answer — a failed call, and NO report to settle with
$ DZ_QE_BRIDGE_CLAUDE_BIN=/bin/false dz qe-bridge --family claude --slug wave1-scorer-negation --coder-family codex
dz qe-bridge: FAILED — probe-failed
  no candidate model answered the liveness probe — opus: exit 1, no `OK` in 0 chars of stdout; sonnet: exit 1, …; haiku: exit 1, …
  record: features/wave1-scorer-negation/.fa-state/qe-bridge/failed-2026-08-19T18-48-52-931Z.json
  no report was written — an unparseable or absent review is never a passing one.

# with a debt on record, the report settles it through the untouched fail-closed path
$ dz reqe --slug add-x --done --report features/add-x/08b_reqe_report.md
dz reqe: debt settled: re-QE grade C (report …) — settlement appended to features/add-x/08_qe_report.md
```

**When to use:** you are hosting a run outside Claude Code (Codex, CI, a plain terminal), you have
just written code, and the independent reviewer must be the OTHER family. Also: whenever `dz reqe`
lists a debt whose coder family is `openai`.

**The reviewer runs isolated.** Both calls (probe and review) run from an EMPTY temporary directory
with `--safe-mode --strict-mcp-config --tools '' --no-session-persistence`, and the verdict is read
from the `--output-format json` **result envelope**. Why: customization output lands on the same
stdout — MEASURED on this machine, a session-start plugin prints a banner ahead of the model's
answer — so a crafted hook could otherwise print a complete grade-A signoff and a stream parser
would believe it (reproducer: `features/qe-bridge-claude/07_code_changes/mutants/c1-forgery-repro.mjs`).
Residue, stated: `--safe-mode` leaves ADMIN-MANAGED policy settings in force, and no flag proves
which binary answered.

**What makes the grade valid.** Three channels must EXIST and AGREE, each read **LAST-anchored**,
and the marker must be the FINAL content of the answer:
the terminal `QE-BRIDGE-SIGNOFF grade=<A-F> findings=<n>` line, the last fenced `qe-bridge-signoff`
JSON block, and the report's own line-anchored `GRADE:` line. Repo content flows into the prompt and
comes back quoted, so a planted earlier verdict must lose — and it does (there is a test whose
fixture plants `grade=A` early and requires the genuine trailing `grade=D` to win). Extracts are
DEFANGED on the way in, so quoted content can never mint a verdict. Empty, gradeless, marker-only or
self-contradicting output is a **named failure** — one of 17 closed reasons (`envelope-unparseable`,
`marker-not-terminal`, `findings-count-mismatch`, `grade-mismatch`, `ambiguous-grade`,
`audit-write-failed`, `report-write-failed`, … ; closed BOTH ways — every one is produced by a real
run in the suite and leaves a record) — with an audit record under
`features/<slug>/.fa-state/qe-bridge/` and the raw stdout beside it, never `findings: []`. Finding
numbers are the reviewer's: a missing, non-positive or duplicated `n` fails the call instead of being
renumbered, and a marker whose `findings=<n>` disagrees with the block is `findings-count-mismatch`.

**The record is auditable, not just a conclusion.** Every run writes a `runId`, the resolved
executable plus `binOverride` (true whenever `DZ_QE_BRIDGE_CLAUDE_BIN` was used — the documented TEST
SEAM; there is no `--claude-bin` flag), the prompt sha256, the byte offsets at which each channel was
found, the `requestedOut` path and `reportWritten: true|false` — so "no report was written" is a
stated fact rather than an inference from an absent file. Records and reports are written `0600` in a
`0700` directory, through `O_EXCL`, with realpath containment that refuses a symlinked parent — and
the state directory itself is contained the same way, before anything is created in it. The audit
trail is written BEFORE the report and corrected after it, so `reportWritten` can only ever
understate; if the trail cannot be written at all, the run FAILS (`audit-write-failed`) rather than
shipping a verdict nobody can re-derive.

**Exit codes:** `0` a signoff was parsed (ANY grade — a grade F still exits 0: the bridge reports, it
does not gate), `1` a named failure, `2` a usage error. **Honest limits:** it proves the call was
procedurally sound (a live model was probed, a scoped brief was sent, a self-consistent verdict came
back); it cannot prove which model authored the text, and it cannot classify your secrets — the
extracts you scope are what leaves the machine. RU: мост в обратную сторону — из Codex-сессии
позвать независимого Claude-ревьюера и получить РАЗОБРАННЫЙ вердикт; пустой или безоценочный ответ —
это названная ошибка, а не «чисто».

### Пересмотр после аварийного само-ревью — `dz reqe`

The feature-adr pipeline's cross-model guard says *the model that writes code must not review it*.
Under limit pressure (usage-adaptive `>=70%` switch) that guard is CONSCIOUSLY suspended: coder AND
Step-8 QE both run on Codex (FR-2.9 — a Claude reviewer is exactly the agent that dies at the
limit). The rule used to say "re-review manually after limits reset" — an instruction nobody
remembers. `dz reqe` turns it into a **debt with a lifecycle**: the run records
`features/<slug>/.fa-state/reqe-due.json`, `dz usage` surfaces the count the moment you check your
freed-up limits, and settlement is FAIL-CLOSED.

```bash
$ dz usage
usage: session ~12% (resets 03:00) · week ~41% (resets 06:00) · estimated
re-QE due: 1 usage-switched run(s) kept same-family QE — run `dz reqe` for the cross-family pass

$ dz reqe                        # the ledger
dz reqe — 1 unsettled re-QE debt(s):
  add-x  coder=openai qe=openai grade=B  2026-07-30T10:00:00Z  → dz reqe --slug add-x

$ dz reqe --slug add-x           # the ready cross-family review brief (the OTHER family than the coder)
$ dz reqe --slug add-x --done --report features/add-x/08b_reqe_report.md
dz reqe: debt settled: re-QE grade C (report …) — settlement appended to features/add-x/08_qe_report.md
```

**When to use:** any time `dz usage` prints a `re-QE due` line, or a feature-adr result carried
`reqeDue: true`. **Fail-closed settlement:** the report must exist, be non-trivial, and name exactly
one line-anchored `GRADE` (the boilerplate phrase `GRADE A-F` does not count); the run's own
`08_qe_report.md` can never settle its own debt (real-path AND inode compared — a hard link doesn't
fool it); the settlement epilogue lands in `08_qe_report.md` and the due-file rotates to
`reqe-settled.json` (evidence kept, never deleted). **Honest scope** (printed by the command):
nothing re-runs QE automatically, and the validator proves the settlement is procedurally sound —
which model authored the report stays with the human running the brief. RU: гард «кодер не ревьюит
сам себя» осознанно снимается под лимитом; `dz reqe` превращает инструкцию «перепроверь потом»
в долг на диске — виден в `dz usage`, гасится только настоящим кросс-семейным отчётом с грейдом.

### Usage estimates you can act on — `dz usage`

`dz usage` estimates how much of your Claude session (5h block) and week you have spent, from local
transcripts. It drives feature-adr's pre-emptive "switch to Codex before the limit" routing.

Two things changed to make it mean something:

- **Cost-weighted, not a raw sum.** A flat token sum is 89–99.7% cache-read (MEASURED), which grows
  with *conversation length*, not with work done — two sessions doing identical work differed by
  orders of magnitude. Tokens are now **input-equivalents** (input 1x, cache-write 1.25x — 2x for a
  1-hour TTL write, cache-read 0.1x, output 5x).
- **Subagent transcripts count.** `<session>/subagents/*.jsonl` carry real, non-duplicated usage and
  were silently excluded.
- **The walk is safe and bounded.** Only regular files are read, symlinked files and directory
  components are skipped (a FIFO used to block it, a symlink used to be followed), and the file cap
  keeps the NEWEST transcripts so a long history cannot push current usage out of view.

```bash
dz usage                       # session ~13% (resets 10:24) · week ~15% (resets 08:59) · estimated
dz usage --json                # machine-readable; pct is null when limits are unconfigured
dz usage --calibrate --session 42 --weekly 61      # teach it YOUR real numbers from claude.ai
```

**`pct` is `null` until you configure limits — that is deliberate**, an unconfigured estimate is not
a guess dressed as a number. The authoritative calibration is `--calibrate` with the percentages
shown on claude.ai/settings/usage; absent that, limits set from your own observed peak mean "unusually
heavy **for you**", which is exactly what a pre-emptive routing switch needs.

### Where did the run's budget actually go? — `dz usage --by-stage`

**The itemized receipt.** A `/feature-adr` run reports ONE number. The recorded run
`wf_0576bd7d-797` spent `623290` tokens (MEASURED — reproducer:
`dz usage --by-stage --run wf_0576bd7d-797`, `totalTokens` field of the run record) — a restaurant
bill with no line items. `dz usage --by-stage` turns it into a receipt keyed by the workflow's own
stage labels, so *"where the budget burns"* stops being a feeling and becomes a number you can sort.

Why it matters, in four points:

1. **Visibility → control.** Per-stage rows (`code` · `qe:brutal` · `fleet:cov` · `delivery:*`),
   each with its model, its weighted tokens, its call count and a USD estimate — sorted by spend, so
   the expensive stage is the first line you read.
2. **Real numbers for auto-cost routing.** `args.models.<stage> = 'auto-cost'` picks models from a
   STATIC assumptions table. The ledger exposes MEASURED per-stage aggregates
   (`{stage, model, avgTokens, runs}`) — the missing sense organ for a system meant to optimize its
   own cost. *Wiring into routing is deliberately out of scope for now: the reader exists, nothing
   consumes it yet.*
3. **The reconciliation invariant guards the bookkeeping itself.** Per-stage sums MUST reconcile
   with the run total: `accounted + unaccounted = run total`, as raw integer equality. A mismatch is
   a **NAMED defect** (`Unaccounted` / `DoubleAttributed` / `ForeignSample` /
   `MissingStageTranscript` / `MalformedRecord`), never a rounding remainder — the same discipline as
   the event-chain ledger. Without it a by-stage table can quietly lie: it already caught a real run
   where 12 agent transcripts had no stage entry at all.
4. **The honest limit, stated next to the benefits.** Totals are LOCAL TRANSCRIPT ESTIMATES — no
   billing API is consulted. So the invariant catches **attribution** errors (a double-counted stage,
   a missing one), **not pricing** errors. There is no "accurate to the cent" promise here, and the
   USD column marks with `*` every row priced by the sonnet-class fallback.

#### Зачем это

Прогон `/feature-adr` отчитывается **одним** числом. У записанного прогона `wf_0576bd7d-797` это
`623290` токенов (MEASURED — воспроизводится: `dz usage --by-stage --run wf_0576bd7d-797`) — счёт из
ресторана без позиций. `dz usage --by-stage` превращает его в **детализированный счёт** по тем самым
меткам стадий, которые пайплайн уже проставляет, — и «где горит бюджет» перестаёт быть ощущением и
становится числом.

1. **Видимость → управляемость.** Строка на стадию (`code` · `qe:brutal` · `fleet:cov` ·
   `delivery:*`) с моделью, взвешенными токенами, числом вызовов и оценкой в долларах, отсортированные
   по расходу: дорогая стадия — первая строка, которую вы читаете.
2. **Живые данные для auto-cost роутинга.** Сейчас `args.models.<stage> = 'auto-cost'` выбирает
   модель по СТАТИЧЕСКОЙ таблице предположений. Реестр отдаёт ИЗМЕРЕННЫЕ агрегаты по стадиям
   (`{stage, model, avgTokens, runs}`) — недостающий орган чувств для системы, которая должна
   оптимизировать собственную стоимость. *Подключение к роутингу сознательно вынесено за рамки:
   читатель есть, потребителя пока нет.*
3. **Инвариант сверки страхует саму бухгалтерию.** Сумма по стадиям ОБЯЗАНА сходиться с итогом
   прогона: `учтено + неучтённое = итог`, точное целочисленное равенство. Расхождение — это
   **именованный дефект**, а не «остаток от округления»: та же дисциплина, что у event-chain-реестра.
   Без него таблица по стадиям может тихо врать — и она уже поймала реальный прогон, где 12
   транскриптов агентов не имели записи ни об одной стадии.
4. **Честная граница — рядом с пользой.** Итоги считаются по ЛОКАЛЬНЫМ транскриптам (никакого
   биллингового API), поэтому инвариант ловит ошибки **атрибуции** (двойной счёт, потерянную стадию),
   а НЕ ошибки **цены**. Обещания «до цента» здесь нет, а строки, посчитанные по резервному
   sonnet-тарифу, помечены `*`.

```bash
dz usage --by-stage                                # the most recent workflow run
dz usage --by-stage --slug portable-gates          # by feature slug
dz usage --by-stage --run wf_0576bd7d-797          # by run id
dz usage --by-stage --json                         # rows + reconciliation, machine-readable
dz usage --by-stage --write features/x/09_cost_ledger.jsonl   # materialize the derived report
```

Real output (MEASURED — reproducer: the `--run wf_0576bd7d-797` command above, abridged):

```
usage --by-stage: run wf_0576bd7d-797 · slug recall-usage-instrumentation · feature-adr · completed
  stage                                                model                       weighted    calls    ~USD
  adr:claude-fb                                        claude-opus-4-8[1m]          253,649       11   $1.27
  design:confirm-landed                                claude-opus-4-8[1m]          196,013        7 $0.9801
  qcsd · codex:gpt-5.6:xhigh (usage-switched)          claude-sonnet-5              109,122        7 $0.3274
  usage:probe                                          claude-haiku-4-5-20251001     76,441        6 $0.0764
  reconciliation: accounted 1,112,167 + unaccounted 0 = run total 1,112,167 (epsilon 0.00%)
  identity: holds (raw integer equality)
  verdict: BALANCED
  scope: local transcript ESTIMATES, not billed amounts — the reconciliation invariant catches
         ATTRIBUTION errors (double-counted or missing stages), NOT pricing errors
```

**Three verdicts, and `INSUFFICIENT_DATA` is not one of the good ones.** `BALANCED` means measured
and reconciled; `DEFECT` names what is wrong; `INSUFFICIENT_DATA` means nothing was measured — never
read `!== 'DEFECT'` as success. Nothing is written unless you pass `--write`, and what it writes is a
regenerable report, not a store.

**When to use:** after an expensive run, before deciding which stage to re-route or downgrade; when
a run's cost surprises you; and any time a by-stage number is about to be quoted to someone.

### Do your skills actually register? — `dz skills-verify`

Shipping a skill pack is not the same as a skill **registering**. A layout test that asserts
`SKILL.md` exists on disk verifies a **proxy**; the property that matters is whether Claude Code
loads it. `@dzhechkov/health-advisor` 1.2.0 shipped to npm with a green layout test and **zero**
skills registering — the gap was only found by hand, after publish. `dz skills-verify` closes it.

Two layers:

| layer | needs a session? | what it proves |
|---|---|---|
| `--static` | no — instant, CI-safe | which dirs *can* register, and flags the three shapes that never can |
| default | yes (~3 s) | the **authoritative** listing, read from the session's `system/init` event — no model prose |

```bash
dz skills-verify --static                       # CI gate: layout only, exits 1 on a problem
dz skills-verify                                # full check in the current project
dz skills-verify --dir ../my-app --expect my-skill,my-other-skill
dz skills-verify --json --strict                # machine-readable; --strict makes inconclusive exit 1
```

A healthy project, and one with the exact defect that shipped:

```
$ dz skills-verify
dz skills-verify: PASS — all 72 expected skill(s) are registered
  layout: 72 registrable skill dir(s) under /path/.claude/skills
  session: 106 skill(s) registered · client 2.1.220 · 5 plugin(s) loaded

$ dz skills-verify --dir /tmp/broken-install
dz skills-verify: FAIL — nothing can register: 24 layout problem(s) and no registrable skill directory
  layout problems (these can never register):
    [no-skill-md] no SKILL.md at health-advisor/SKILL.md — this directory cannot register
    [plugin-manifest-trap] health-advisor/.claude-plugin/plugin.json does not auto-register — plugins load from the marketplace, not from .claude/skills
    [buried-skill-md] health-advisor/skills/clinical-decision-support/SKILL.md is 2+ levels deep …
```

**What it promises about plugins — and what it deliberately does not.** A `.claude-plugin/plugin.json`
under `.claude/skills/` makes that directory a plugin *container*. The gate attributes it by the
session's `init.plugins[].path` (never by the directory name), and:

- container declares a plugin that **did not load** → **FAIL**, naming it;
- container's plugin **loaded** → **PASS**, plus an advisory stating that its *individual* skills were
  **not** verified.

That last line is a deliberate limit, not an oversight. Verifying each plugin skill means reproducing
Claude Code's command-name resolution — a skill's frontmatter `name` replaces the final command segment,
and a manifest's `skills` field may be a string, a list, or a directory of children. Six cross-model
review rounds showed every attempt to model that contract introduced a NEW wrong verdict. A narrow
promise kept exactly is worth more than a broad one kept unreliably, so the gap is printed rather than
guessed.

**Exit codes: `0` pass · `1` fail · `2` inconclusive.** The third is the point — a missing `claude`
binary, a login prompt, a timeout, or a session that read a *different* project all yield
`inconclusive`, **never** a pass. (A session that read another project cannot testify that a skill is
missing, so its listing is refused rather than believed.) A layout so broken that nothing is
registrable fails too, instead of passing vacuously on an empty expectation.

**Registration is not usability — `--live-content`.** A skill can be in the session listing and still
be unusable content. That was the third, manual step of the health-advisor verification: invoke it and
check the model really loaded its `SKILL.md`. `--live-content` automates it — an extra turn that asks a
live model to name the expected skills and **quote a heading verbatim** from one:

```
$ dz skills-verify --expect api-design,debugging,explore --live-content
dz skills-verify: PASS — all 3 expected skill(s) are registered
  content probe (ADVISORY, model-mediated — never a gate): coherent — every probed skill was named and one was quoted
    quoted: "## When to use"
```

It is **advisory by construction and always will be**: the answer comes from a model, so it never
changes the exit code and never promotes a verdict. Naming a skill without quoting anything is
`partial` (naming is not proof the content loaded); an empty answer is `unreadable`, not a pass.

**Use it when:** publishing a package that installs skills, after `dz setup` in a new project, or in
CI (`--static` needs no Claude session at all).

**It also runs itself.** `dz publish` pre-flight (`dz guard --op publish`) now carries a
`skills-registrable` rule: for every skill pack, a directory whose `SKILL.md` sits below depth 1 would
ship registering nowhere, and the guard says so by name. It is SOFT (it informs, never blocks) because
the discriminator is a heuristic — a package counts as a skill pack only if it already has one
registrable skill, and a directory is flagged only when a `SKILL.md` really exists inside it but in the
wrong place. Ordinary `scripts/`, `docs/` and pure npx toolkits stay silent.

### Does your test actually DEFEND the protection? — `dz mutation-gate`

A green test proves the code works. It does NOT prove the test would have noticed the protection
being deleted. Three cross-model QE rounds on `@dzhechkov/health-advisor` produced 53 → 14 → 14
findings while the whole suite stayed green (MEASURED — reproducer: the three QE rounds recorded in
that package's history; the round-1 exploit string the code comment records as MEASURED passed a
444-test green suite). The one technique that proved a protection real in those rounds was:
delete the protection in a scratch copy, re-run the suite, require red. `dz mutation-gate` is that
measurement as a layer-1 repo check.

The registry is declarative DATA (data is harder to make lie): one entry per NAMED safety property,
with an exact `{find, replace}` mutation that deletes the protection.

```jsonc
// test/mutation-registry.json
{
  "testCommand": "npm test",
  "entries": [{
    "id": "verbatim-door-requires-resolvable-locator",
    "property": "An evidence quote is exempt from content scans only when its locator resolves…",
    "file": "lib/appraisal-core.js",
    "mutation": { "find": "<exact source text>", "replace": "<neutered text>" },
    "minFailing": 1,      // the entry's contract: at least this many tests MUST go red
    "observed": 4         // how many did when written — a later lower count prints a COVERAGE DROP warning
  }]
}
```

```bash
cd packages/@dzhechkov/health-advisor
dz mutation-gate                      # registry auto-found at test/mutation-registry.json
dz mutation-gate --only lock-root-resolves-to-itself   # one entry while iterating
dz mutation-gate --rebaseline final   # cheap flake guard: one re-run at the end instead of per red entry
dz mutation-gate --json               # machine contract {baseline, results, summary, warnings, exitCode}
npm run test:mutation                 # the package's own alias for the full run
```

Expected output (abridged from a real run — MEASURED 2026-08-07, reproducer: `cd
packages/@dzhechkov/health-advisor && dz mutation-gate`, 18 entries over a 484-test `node --test`
suite; wall-clock 9m32s with the default per-entry re-baseline, 4m53s with `--rebaseline final` —
same reproducer, both modes timed on the same tree):

```
mutation-gate: baseline suite in scratch copy of …/health-advisor …
mutation-gate: verbatim-door-requires-resolvable-locator — mutating lib/appraisal-core.js, running suite …
  baseline: GREEN — baseline suite green in the scratch copy
  ✓ verbatim-door-requires-resolvable-locator  applied=yes  failing=4  PROVEN
  ✗ cli-swallows-only-epipe  applied=yes  failing=0  UNDEFENDED
      suite stayed GREEN with the protection deleted — property UNDEFENDED: "Only EPIPE is
      swallowed on stdout/stderr — every other stream error stays a loud crash." …
  summary: 17/18 proven · 1 undefended · 0 not-applied · 0 below-min · 0 unparseable · 0 over-failing · 0 inconclusive · 0 coverage drop(s)
  verdict: FAIL — at least one named protection is undefended, unmutable, or unproven
```

That `UNDEFENDED` line is the command earning its keep: on its FIRST run against health-advisor the
gate found 2 protections whose suite stayed green with the protection deleted (MEASURED 2026-08-07 —
reproducer: `dz mutation-gate --package packages/@dzhechkov/health-advisor --json` at the commit
before `test/case-state-alias-and-stream-error-discrimination.test.js` landed), plus a third
(the post-acquisition lock-scope re-assert) that was undefended in BOTH the pre-fix and current
trees. All three now have discriminating tests and registry entries.

Four rules the gate itself obeys — these are what distinguish it from a green-looking script:

1. **A mutation that does not apply is a FAILURE, never a skip** — `find` absent, or present more
   than once, fails loudly (code drifts; a silently-skipped mutation reports a protection as proven
   having tested nothing — the `dz skills-verify` lesson: inconclusive ≠ pass).
2. **A green suite under mutation is a FAILURE** that names WHICH property is undefended.
3. **The working tree is never mutated.** The package is copied into a scratch shadow of its repo
   (siblings symlinked, `node_modules` linked, the copy git-initialized so hygiene tests keep
   working); the baseline suite must be green there BEFORE any mutation, and a red baseline is a
   setup error (exit 2), never a mutation result.
4. **The gate carries its own discrimination proof**: a fixture package with a deliberately
   undefended property lives in this repo's test suite, and the gate MUST fail on it — a gate that
   cannot fail cannot pass.

When to reach for it: after a QE round names safety properties (seed the registry so they STAY
defended); in CI for a package whose protections have burned you before (`npm run test:mutation`);
and in feature-adr Step 8, where the QE reviewer runs it whenever the touched package has a
registry — the Step-8 assertion is now "the safety property the ADR names has a test that
DISCRIMINATES", not merely "has a test".

Verdicts per entry: `PROVEN` (red, count ≥ `minFailing`) · `UNDEFENDED` (green — the failure this
gate exists for) · `NOT_APPLIED` (find-text absent/ambiguous) · `BELOW_MIN` (red but a reliable
count under the entry's `minFailing` contract) · `MUTATION_UNPARSEABLE` (the mutated file no
longer parses — structural redness, a registry error) · `MUTATION_LOAD_FATAL` (THE SUITE RUN'S OWN
OUTPUT reports a test FILE failing to load under the mutation — a file-named `node --test` TAP
point carrying `exitCode:`/`signal:` fields, or a vitest `Failed Suites` entry — as opposed to
assertion failures inside running tests; the signal comes from the SAME run that produced the
failing count, never from a separate isolated import, so there is no environment mismatch to
false-PASS through) · `OVER_FAILING` (a reliable count far
above the entry's bound — the mutation broke much more than the protection's own tests) ·
`INCONCLUSIVE` (no exit code — timeout/kill — or red output whose SHAPE matches no runner the
classifier knows — jest, mocha, an opaque wrapper: a loud runner-coverage gap, never a silent
pass — or a restored baseline that did not reproduce
green; a failure, never a pass). Rule-3 containment is enforced on REALPATHS: an entry whose file
resolves outside the scratch copy (a symlink escape — writing would mutate the REAL tree) is
refused with exit 2, and a registry `file` under `node_modules/` is refused outright.
The red/green verdict rides the suite's EXIT CODE; failing-test counts are
a best-effort secondary (TAP `# fail N`, vitest/jest summaries) used only for `BELOW_MIN` and the
COVERAGE-DROP warning — count-parse failure never decides a verdict. A drop (`failing < observed`
but still ≥ `minFailing`) WARNS loudly instead of failing: `observed` is history, `minFailing` is
the contract; history drifting down while the contract holds is the early warning that arrives
before the property breaks.

### Portable delivery gate — `dz delivery-check` (Step-10, on every shell target)

The feature-adr Step-10 Delivery Gate reviews a landed feature across four orthogonal planes and
emits a machine-checkable `ready | blocked` hand-off. On Claude-Code the ultracode workflow can run
it as the **opt-in** Step-10 (`args.deliveryGate: true` — off by default); `dz delivery-check` is
the **portable `manual` form** that travels to every shell
target (Cursor/Codex/Gemini/…). The CLI runs the deterministic parts (artifact probes, fail-closed
hand-off arithmetic, cross-validation bookkeeping) and **dispatches** the semantic review to the
target's own agent runtime — the `dz challenge` cartridge shape. It never posts anything anywhere
(findings-only).

```bash
dz delivery-check --slug my-feature --context-only          # print artifact probes + the 4-plane review brief
dz delivery-check --slug my-feature --findings review.json  # classify a fed-back review → writes 10_delivery_review.md, prints ready|blocked
dz delivery-check --slug my-feature --findings review.json --strict --json   # CI gate: exit 1 on blocked, machine-readable result
```

Example (trimmed):

```
dz delivery-check — my-feature: blocked
  ✓ 0 BLOCKER: PASS
  ✗ 0 HIGH: FAIL — 1 confirmed HIGH
  ✓ planes complete: PASS
  ✓ BLOCKER/HIGH cross-validated: PASS
  ✓ required artifacts present: PASS
↳ wrote features/my-feature/10_delivery_review.md
```

`ready` only off complete, cross-validated, clean evidence: a null/partial plane, a failed required
probe (the `07_code_changes/` manifest), a confirmed BLOCKER/HIGH, or an **un-cross-validated**
BLOCKER/HIGH (`cross-validation-incomplete`) all yield `blocked`. Classification reads only numeric
severity counts, so instruction-like text inside a finding cannot move the verdict.

**When to use:** as the final quality hand-off for a landed feature on any non-Claude-Code target;
as a CI gate (`--strict`) that fails a merge on an unresolved BLOCKER/HIGH.

For AGENTS.md-class targets, `dz feature-adr-setup --gates [--target <name>] --apply` emits a
zero-config `architecture/gates/delivery-check.md` whose runnable-here gate list is computed from
`dz parity` for that target (create-if-absent, never clobbered).

### Verified release — `dz release` (4 HARD gates in front of `dz publish`)

`dz publish` gates on guard / claim-check / signatures / provenance / files-whitelist — none of which
prove the code **works**. `dz release` is the opt-in VERIFY phase in front of it: (1) each package's full
test suite, (2) `pnpm audit --prod --audit-level high` (production deps by default — a dev-only advisory
is not a false gate; `--audit-dev` widens; an audit that *cannot run* also blocks, classified
`AUDIT_ERROR`), (3) `node --check` of every `dist/**/*.js` + bin file (a dist older than `src/` is
`STALE_DIST`, never checked as-is; a package that declares a `build` script but has **no** dist JS is
`MISSING_DIST` — an unbuilt package cannot ship), (4) smoke-boot every bin via `node <bin> --help` in a
throwaway cwd with a timeout. Packages without a `test` script are **named skips** in the report — never
silent passes; a template-only pack (no build, no artifacts, no bin) is a named `SKIP_NO_ARTIFACTS`.

```bash
dz release --dry-run              # full gate plan, zero commands executed
dz release --filter harness-core  # gates for one release set
dz release --affected             # narrow to packages touched by working tree + last commit (git down ⇒ FAIL-OPEN to full set)
dz release --tag                  # on green: annotated git tag + short notes from recent commits
dz release --publish              # on green: chain in-process into dz publish (its own dry-run protocol)
dz release --json                 # CI-parseable verdict; valid JSON on error paths too (with --publish, publish output rides INSIDE the envelope)
dz release --audit-dev            # widen the audit gate to dev dependencies too
```

Expected flow: gate table (`✓/✗/○` per gate with per-package failures + named skips) → on any red gate:
release STOPPED, exit 1, best-effort `gh issue create` (no `gh`/network ⇒ loud log, never a block;
note: the issue body embeds first lines of failing output — pass `--no-issue` on public repos when
test/audit output may carry paths or environment details) → on
green: re-sign reminder (`dz sign …` — the publish signature gate is refuse-unsigned), then the ready
`dz publish` command printed **without** `--yes`: live publish stays your explicit act. The signature
gate verifies the **artifact** — it packs each package and checks the tarball, not the working tree,
because the two differ by construction (npm synthesises a `LICENSE`, the packer rewrites
`package.json`). If the artifact cannot be packed at all, the gate **blocks and says so** rather than
falling back to the tree: with no artifact, nothing was compared, and a pass would be a claim about
an object that was never built. **When to use:**
before a multi-package npm release, or whenever a broken dist/bin must be impossible to ship; keep plain
`dz publish` for routine pushes. `dz publish` itself is byte-identical whether or not release exists.

### Skill Packs (18 packs · 189 skills)

Each pack is an npm package — click through for the **full per-skill documentation** (what each skill does + how to trigger it). Install a whole pack with `dz install <pkg>`, or pick skills with `dz init --select` / a `--preset`.

| Pack | Skills | What's inside |
|------|--------|---------------|
| [@dzhechkov/skills-devops](https://www.npmjs.com/package/@dzhechkov/skills-devops) | 30 | CI/CD, IaC, containers, databases, observability, incident & problem mgmt, ITSM/ITIL, deploy-to-Cloud.ru-VM |
| [@dzhechkov/skills-mcp](https://www.npmjs.com/package/@dzhechkov/skills-mcp) | 16 | MCP-server integrations — search, git/GitLab, Google Workspace, Notion, AgentDB memory |
| [@dzhechkov/skills-web3](https://www.npmjs.com/package/@dzhechkov/skills-web3) | 12 | On-chain / DeFi — wallets, swaps, bridges, ENS, agent identity (ERC-8004) |
| [@dzhechkov/skills-qe](https://www.npmjs.com/package/@dzhechkov/skills-qe) | 20 | Quality engineering — test-gen, coverage, chaos, defect intelligence, QCSD swarms |
| [@dzhechkov/skills-reasoning](https://www.npmjs.com/package/@dzhechkov/skills-reasoning) | 4 | Generic reasoning & code-quality — investigate (root-cause), solid (SOLID/TDD), karpathy-guidelines, agents-md-creator |
| [@dzhechkov/skills-ecc](https://www.npmjs.com/package/@dzhechkov/skills-ecc) | 20 | Claude-Code engineering craft — agent architecture, autonomous loops, framework patterns |
| [@dzhechkov/skills-meta](https://www.npmjs.com/package/@dzhechkov/skills-meta) | 20 | Dev-process meta skills — explore, feature-adr, design-thinking, audit, skill-advisor, loop-plan-author, decision-mockups (vendored mirror of `@dzhechkov/skills-decision-mockups`) |
| [@dzhechkov/skills-academic](https://www.npmjs.com/package/@dzhechkov/skills-academic) | 5 | Thesis-defense toolkit — dissertation review, questions, doc-check, defense eval |
| [@dzhechkov/skills-news](https://www.npmjs.com/package/@dzhechkov/skills-news) | 3 | *dz-original* — news digests (`news-digest`) + delta watches (`news-monitor`) + bundled `goap-research-ed25519` verified-research backend (mandatory) |
| [@dzhechkov/skills-demo-publisher](https://github.com/djd1m/dz-harness/tree/main/packages/%40dzhechkov/skills-demo-publisher) | 1 | *dz-original, staged* — scenario-driven product recording → budgeted static HTML5 video site with Russian captions and fail-closed Pages delivery checks |
| [@dzhechkov/skills-idea2prd](https://www.npmjs.com/package/@dzhechkov/skills-idea2prd) | 1 | *dz-original* — `idea2prd-manual`: idea/problem → PRD+ADR+DDD+C4+Pseudocode+Tests+Completion (9 checkpoints); bundles the analyst trio as a sources.json-tracked vendor ([ADR-0001](https://github.com/djd1m/dz-harness-hub/blob/main/docs/adr/0001-skill-canonicalization-and-dependency-model.md)) |
| [@dzhechkov/skills-reverse-engineering](https://www.npmjs.com/package/@dzhechkov/skills-reverse-engineering) | 1 | *dz-original* — `reverse-engineering-unicorn`: company → launch playbook (+CJM) via 6-module QUICK/DEEP/VERIFIED pipeline; canonical home that resolved the keysarium↔p-replicator drift ([ADR-0001](https://github.com/djd1m/dz-harness-hub/blob/main/docs/adr/0001-skill-canonicalization-and-dependency-model.md)) |
| [@dzhechkov/skills-presentation-storyteller](https://www.npmjs.com/package/@dzhechkov/skills-presentation-storyteller) | 1 | *dz-original* — `presentation-storyteller`: selling deck + verified sources + slide-by-slide speaker script; referenced (not vendored) by reverse-engineering-unicorn's Post-M6 step ([ADR-0001](https://github.com/djd1m/dz-harness-hub/blob/main/docs/adr/0001-skill-canonicalization-and-dependency-model.md)) |
| [@dzhechkov/skills-website-cloner](https://www.npmjs.com/package/@dzhechkov/skills-website-cloner) | 1 | *imported (MIT)* — `clone-website`: live site → pixel-perfect Next.js clone (recon → specs → parallel build → visual QA); needs a browser-MCP + Next.js scaffold; referenced by p-replicator's `/replicate` ([ADR-0001](https://github.com/djd1m/dz-harness-hub/blob/main/docs/adr/0001-skill-canonicalization-and-dependency-model.md)) |
| [@dzhechkov/skills-pm](https://www.npmjs.com/package/@dzhechkov/skills-pm) | 18 | *imported (MIT)* — product-management toolkit: OST, RICE/ICE prioritization, product-strategy, pricing, OKRs, NSM/metrics/A-B/cohort, outcome-roadmap, stakeholder-map, sprint-plan, strategy-red-team, GTM/growth/beachhead, market-sizing; curated from phuryn/pm-skills (`dz init --preset pm`) ([ADR-0002](https://github.com/djd1m/dz-harness-hub/blob/main/docs/adr/0002-product-and-design-expansion.md)) |
| [@dzhechkov/skills-taste](https://www.npmjs.com/package/@dzhechkov/skills-taste) | 1 | *imported (MIT)* — `design-taste-frontend`: anti-slop landing/portfolio/redesign framework (dials + pre-flight + GSAP skeletons); complements frontend-design (`dz init --select design-taste-frontend`) ([ADR-0002](https://github.com/djd1m/dz-harness-hub/blob/main/docs/adr/0002-product-and-design-expansion.md)) |
| [@dzhechkov/skills-book-digitizer](https://www.npmjs.com/package/@dzhechkov/skills-book-digitizer) | 8 | *dz-original* — book → installable methodology pack: `digitize-book` (orchestrator) + ingest/extract/distill/pack/kb-index + `book-brain-register` (CP6 promote → cross-project brain) + `source-brain-ingest` (repo sibling). Verified provenance, IP-safe, resumable (`dz init --select digitize-book`) ([ADR-001](https://github.com/djd1m/dz-harness-hub/blob/main/features/book-knowledge-digitizer/03_adr/001-book-to-skillpack-pipeline.md)) |
| [@dzhechkov/skills-12factor](https://www.npmjs.com/package/@dzhechkov/skills-12factor) | 12 | *generated by the digitizer, CC BY 4.0* — The Twelve-Factor App distilled into 12 decision-moment skills (one per factor). The first PUBLIC digitized-book pack; paraphrased (shingling-gated), routing-gated (every factor carries triggers), attributed (`NOTICE`) (`dz init --select 12factor-config-in-environment,…`) |
| [@dzhechkov/skills-book-ai-apps](https://www.npmjs.com/package/@dzhechkov/skills-book-ai-apps) | 17 | *generated by the digitizer, CP5-published* — «Building Applications with AI Agents» (Albada, рус. пер.) distilled into 17 decision-moment skills across the whole agent-building arc: agent-fit & model choice, single-vs-multi, orchestration, tool design, knowledge & memory, context engineering, evaluation, probabilistic behaviour checks, release gates, improvement loops, drift, human-in-the-loop, agent UX, governance, security. Ships our page-anchored Knowledge Units, NOT the book text — shingling-gated at 0 uncited verbatim runs >=8 words; publication is the recorded CP5 owner decision; `trust_tier 1` (routing-gated, not human-reviewed) Since 0.2.2 it also ships `brain/ai-apps.sqlite`, the 223-KU knowledge slice: `dz brain add --from-pack @dzhechkov/skills-book-ai-apps` loads it into your `~/.dz/brain`, then `dz brain query --source ai-apps` answers in any project (`dz install @dzhechkov/skills-book-ai-apps --target claude-code`) |

### Available Presets (14)

| Preset | Skills | Description |
|--------|--------|-------------|
| `meta` | 20 | Development process (explore, goap-research, problem-solver, design-thinking, feature-adr, knowledge-extractor, understand-anything-bridge, agentshield-scan, adversarial-verifier, skill-advisor, audit, loop-plan-author, decision-mockups) |
| `qe-engineer` | 20 | Quality engineering (test-gen, coverage, chaos, defect, ...) |
| `bto` | 1 | Build-Benchmark-Test-Optimize pipeline |
| `health` | 8 | Medical AI (diagnostics, drugs, labs, clinical decisions) |
| `keysarium` | 9 | Full research toolkit (feature-adr, presentation, reverse-eng) |
| `p-replicator` | 10 | AI product development (/replicate, SPARC PRD, pipeline-forge) |
| `feature-adr` | 9 | Feature pipeline (feature-adr, explore, knowledge-extractor, problem-solver-enhanced, frontend-design, code-critic, code-impl, system-grill, code-skills-creator) |
| `reasoning` | 4 | Generic reasoning & code-quality (investigate, solid, karpathy-guidelines, agents-md-creator) — stack-neutral, zero coupling |
| `devops` | 30 | DevOps skills (terraform, kubernetes, c4-architecture, incident-response, problem-management, risk-assessment, ...) |
| `web3` | 12 | Web3/DeFi (quicknode, zerion, symbiosis, bankr, veil, neynar, ...) |
| `mcp` | 16 | MCP servers (agentdb, brave-search, gmail, gitlab, comfyui, notion, ...) |
| `academic` | 5 | Thesis defense (review, questions, doc-check, live defense + answer eval) |
| `news` | 3 | News & monitoring (news-digest cited reports + news-monitor delta watches) |
| `pm` | 18 | Product management (OST, prioritization, strategy, pricing, OKRs, metrics, GTM, growth) |

#### What the `meta` skills do & how to trigger them

Get the whole set with `dz init --target claude-code --preset meta`, or pick one with `dz init --select <skill>`. Skills **auto-activate** on the phrases below (some also expose a `/slash-command`). The headline skills (`design-thinking`, `feature-adr`, `explore`, `knowledge-extractor`) have their own sections; the rest:

| Skill | What it's for | How to trigger |
|-------|---------------|----------------|
| `audit` | Whole-codebase deep audit → prioritized P0–P3 findings → your approval → scoped fixes | `/audit` · "audit the codebase" / "health check" / "what should we fix next" |
| `skill-advisor` | Recommends which skills / presets / npx toolkits fit a task (install order + honest gaps) | `/skill-advisor` · "which skill should I use for…" / "какой скилл" |
| `adversarial-verifier` | False-positive killer: a skeptic refutes a finding and classifies it (TRUE_POSITIVE / FALSE_POSITIVE / …) | "verify this finding" / "is this a real bug" / "false positive check" |
| `capture-adr` | Records architecture decisions mid-session as minimal MADR-4.0 ADRs (tagged `needs-oversight`) | "record this decision" / "ADR for this" / "capture that as an ADR" |
| `external-comms-gate` | Screens outbound text (PR / issue / npm / README) for secrets, PII and leaks → SAFE / WARNING / BLOCK | "leak check" / "safe to publish?" / "screen this before publishing" |
| `context-window-management` | Strategies for context pressure (prune / checkpoint / summarize / delegate); kicks in ~60% capacity | "running out of context" / "manage context" / "compact" |
| `reflection-loop` | Standalone critique → revise cycle (≤3 rounds) for code, text, architecture or research | `/reflection-loop` · "critique this" / "review and improve" |
| `structured-reasoning` | Picks the reasoning strategy (Tree-of-Thought / CoT / compression) and checks the conclusion follows | "reason about…" / "explore options" / "compare approaches" |
| `skill-crystallizer` | Auto-creates skills from execution traces, combines skills, and repairs broken ones | "create skill from this" / "combine skills" / "fix skill" |
| `decision-mockups` | Owner-facing DECISION PAGE — plain-language write-up + browser-frame before/after mockups + clickable option forks + a copy-answers export you paste back into the chat (a one-option fork is deleted as fake, and a deterministic G0–G14 gate blocks the page if it is not) | "объясни понятным языком" / "что сделано, польза, риски, из чего выбираем" / "покажи владельцу развилки и собери решения" / "оформи артефактом" |

### Standalone Packages (install via npx, no dz CLI needed)

| Package | Install | What it does |
|---------|---------|-------------|
| [@dzhechkov/keysarium](https://www.npmjs.com/package/@dzhechkov/keysarium) | `npx @dzhechkov/keysarium init` | Full 7-phase research toolkit |
| [@dzhechkov/design-thinking](https://www.npmjs.com/package/@dzhechkov/design-thinking) | `npx @dzhechkov/design-thinking init` | d.school 6-phase Design Thinking (8 skills) |
| [@dzhechkov/trip-planner](https://www.npmjs.com/package/@dzhechkov/trip-planner) | `npx @dzhechkov/trip-planner init` | Travel itinerary → interactive mobile site (pending publish) |
| [@dzhechkov/p-replicator](https://www.npmjs.com/package/@dzhechkov/p-replicator) | `npx @dzhechkov/p-replicator init` | AI product development (/replicate pipeline) |
| [@dzhechkov/health-advisor](https://www.npmjs.com/package/@dzhechkov/health-advisor) | `npx @dzhechkov/health-advisor init` | Medical AI (25 skills) |
| [@dzhechkov/skills-bto](https://www.npmjs.com/package/@dzhechkov/skills-bto) | `npx @dzhechkov/skills-bto init` | BTO benchmarking (Build-Test-Optimize) |
| [@dzhechkov/skills-feature-adr](https://www.npmjs.com/package/@dzhechkov/skills-feature-adr) | `npx @dzhechkov/skills-feature-adr init` | 11-step feature pipeline with two-axis `primary` + per-family `budget` routing (`normal`/`eco`/`hybrid`); explicit stage models keep precedence |
| [@dzhechkov/skills-edu-site](https://www.npmjs.com/package/@dzhechkov/skills-edu-site) | `npx @dzhechkov/skills-edu-site init` | Gamified edu site generator |
| [@dzhechkov/skills-transcript-site](https://www.npmjs.com/package/@dzhechkov/skills-transcript-site) | `npx @dzhechkov/skills-transcript-site init` | Transcript → interactive site |
| [@dzhechkov/skills-analyst-manual](https://www.npmjs.com/package/@dzhechkov/skills-analyst-manual) | `npx @dzhechkov/skills-analyst-manual init` | 3-phase analyst composite |

**Difference:** `dz init --preset` installs individual skills from `.claude/skills/` source into a target platform tree. Standalone `npx` packages have their own CLI and install a complete toolkit with commands, rules, shards, and agents — a richer but self-contained experience.

> **A skill and its npx toolkit are not duplicates — they're a graduation.** Several skills (e.g. `feature-adr`, `design-thinking`) exist BOTH as a skill inside a `dz` preset AND as a standalone `npx` package. The preset's SKILL.md is **fully functional on its own** (the whole methodology — modules + references — travels with it, and it auto-activates by description), and it's the only way to compile that capability to the **non-Claude platforms** (Codex/OpenCode/Hermes/OpenClaude) via `dz`. The npx package adds **project-level runtime governance** around the same skill: a slash command, governance rules, a context shard, and (for feature-adr) reward-learning + `/harvest`. So: pick the **skill/preset** for a working capability across platforms; pick the **npx toolkit** when you want it as a governed, command-driven fixture of one project.

## Design custom Workflow loops (`workflow` · `workflow run` · `workflow-lint` · `workflow-trace`)

Custom loops used to be born by copy-pasting a 1470-line workflow script; nothing deterministic
checked the copy. The loop-designer meta-factory replaces that: a versioned typed plan
(`loop-plan/1`), a schema-driven generator, an 18-rule lint gate, and a local trace plane.

```bash
# 1. Scaffold a plan (pipeline | barrier | fanout | gate), edit the TODO prompts:
dz workflow init --name triage-loop --pattern barrier --o triage-loop.plan.json
# → dz workflow init: wrote /abs/triage-loop.plan.json (pattern: barrier)

# 2. Validate it (CI-runnable; INV-1..8 — unbounded fanout, dangling deps, retry-on-non-idempotent
#    are all hard failures):
dz workflow validate triage-loop.plan.json
# → dz workflow validate: OK (digest sha256:1df9e5582f8ec888…)

# 3. Render the executable loop (sidecar plan first, then the script; USER regions survive
#    re-renders byte-for-byte; a marker-less hand-written target is REFUSED without --force):
dz workflow render triage-loop.plan.json --o triage-loop.js
# → dz workflow render: wrote …/triage-loop.plan.json then …/triage-loop.js (exec-fp sha256:…, blobs: checkpoints, trace)

# 4. Gate it (generated-loop CI mode; exit 0/1/3 — inconclusive is NEVER a pass):
dz workflow-lint triage-loop.js --plan triage-loop.plan.json --require-plan
# → dz workflow-lint: PASS (mode=require-plan; 0 fail, 0 warn, 0 inconclusive over 18 rules)

# 5. Run it via Workflow({scriptPath:'triage-loop.js', args:{traceDir:'/abs/run-dir'}}), then read
#    the run's own trace (seq-ordered; wallTime is diagnostic only):
dz workflow-trace /abs/run-dir --invariants triage-loop.plan.json --html report.html
# → run fitness-run-1; sources: trace, … + INVARIANT PASS rows + a self-contained report.html
```

**When to use:** any new multi-agent Workflow loop (a pipeline over items, blind parallel lanes
behind a barrier, a bounded fanout, a gated produce-check loop) — instead of copy-pasting
`feature-adr.js`. `dz workflow-lint --legacy` also runs over hand-written loops (plan-anchored
rules honestly report `inconclusive` there, never a silent green). `dz workflow blobs --check`
self-checks the shared-subsystem blob registry (checkpoints, model-resolver, trace, …) that the
generator injects verbatim — edit the canonical TS in harness-core, regenerate, never the copies.

**Scope, stated plainly (and NARROWED since `dz workflow run` shipped): `dz` AUTHORS, GATES, READS
and now RUNS loops — but it never runs a RENDERED SCRIPT.** Step 5 above is still not a `dz`
command: executing the generated script belongs to the Claude Code host's `Workflow({scriptPath})`
runtime, which owns the agent dispatch that script calls into. What `dz workflow run` executes is
the PLAN (see "Run a plan WITHOUT the Claude host" below) — a second, independent enactor that
dispatches to `codex exec` / `claude -p` and writes the SAME trace shape. So a claim on this page is
about the plan, the generated script, the lint verdict, and a run's own trace file — the two hosts
are compared through the same reader, never assumed equivalent. `dz workflow-trace` reads what
EITHER host wrote (`trace.jsonl`, seq-ordered by the loop's own counter); with no run there is
nothing to read, and it says so rather than inventing a timeline.

**Who writes the trace, and how far the cross-host claim actually reaches (MEASURED 2026-08-20).**
The two enactors do not attest their runs the same way, and the difference is load-bearing:

| Enactor | Who appends `trace.jsonl` | Evidentiary weight |
|---|---|---|
| `dz workflow run` (Codex **or** Claude family) | the `dz` process itself, `appendFileSync` in `cli.ts` | **instrument-written** |
| the rendered script under the Claude host's `Workflow({scriptPath})` | an AGENT the script asks to run the flush command (`loop-render.ts`) | **agent-attested** |

The host runtime's own records cannot substitute for the second row. `journal.jsonl` carries four
fields (`type`, `key`, `agentId`, `result`) — no `seq`, no `ts`, so it can order nothing; the
per-agent `agent-*.jsonl` transcripts do carry `timestamp` and `uuid`/`parentUuid`, so they can
order AGENT runs — but a join, a gate redo and a typed pause are steps of the loop, not agents, and
leave no record there at all.

**Since 0.5.2 the reader SAYS which of the two it is looking at.** `dz workflow-trace` opens every
report with one plain sentence — `ATTESTATION instrument | agent | unknown` — and `--json` carries
the same value at the top level AND on every invariant verdict, so a stored verdict cannot lose its
qualifier in transit.

The trust answer is derived by the READER, never read out of the trace. The trace carries only
`emitterPath` (`dz-process` / `rendered-script`), an explicitly non-authoritative hint: the rendered
script's flush is performed by an AGENT, which controls those bytes before the file exists and could
write any value there. `instrument` requires a co-located `run-state.json` — which `dz workflow run`
writes and the sandboxed script cannot — binding the same `runId`, `planDigest`, `execFp`, plus the
trace's `traceSha256` and `traceLines`.

Stated at its real size, because two cross-family review rounds cut it down to this:

> `instrument` means **the bytes read match the identifiers, the hash and the line count asserted by
> the co-located `run-state.json`**. It does NOT mean `dz` historically wrote those bytes, nor that
> this is the directory it wrote them in. A byte-identical replay passes; so does copying the matched
> trace+run-state pair elsewhere. Against an actor with write access to the run directory nothing
> local proves authorship — the signing key is readable by the same account — and that is named here
> rather than papered over. `unknown` is kept DISTINCT from `agent`: a legacy run, a stripped field
> and explicit agent testimony are different facts.

`dz workflow-trace --corroborate <hostRunDir>` compares the trace against the Claude host's own
records for the half they can witness, and reports `agreesWithinScope` — never a bare `agrees`:

| | |
|---|---|
| witnessed | agent multiset, agent count, wall-clock order |
| **not** witnessed | `join`, `gate-redo`, `typed-pause`, `file-deliverable` |
| binding | `by-directory` — trace and `journal.jsonl` share NO identifier (MEASURED: `invocationId`/`stepId` vs `agentId`/`v2:<sha>` key), so containment is the only binding available and pointing at the wrong directory is a user error this check cannot detect |

A fabricated join or gate redo therefore still lands as `agreesWithinScope`. That limit is asserted
by a test, so it cannot be quietly lost. Corroboration never raises the attestation: full agreement
leaves `agent` exactly where it was.

Consequently the cross-host structural equivalence proved by the committed fixture (`pkg-audit-1`)
covers a bounded fanout, an all-activated join, a dep chain and a gate. It does **not** cover the
gate redo route, the typed terminal route, the typed pause or the file deliverable: those four are
what `discrimination.plan.json` adds, and no capture of them exists yet. Read every equivalence
statement here as scoped to the first list.

### Build a loop for YOUR scenario — the end-to-end use case (a real one)

This walkthrough is not an invented example. It is the loop that closed a real roadmap item in this
very repo: a test pinned `34 canonical packages` while the workspace had grown past 50 directories —
red forever, and nobody trusted a hand count. The job: produce a **verified inventory** of every
directory under `packages/@dzhechkov` (canonical vs private vs not-a-package), too much for one
sitting → an audit fanout: package chunks audited in parallel lanes, one synthesis, and a quality
gate that rejects an inventory that doesn't cover every directory. Every command and output below is
a capture from the run that actually fixed the test (MEASURED — reproducer
`node --test tests/canonical-packages.test.mjs`: 289 pass / 0 fail after the re-pin).

**Install (once):**

```bash
npm i -g @dzhechkov/harness-cli     # gives you the `dz` binary
# or zero-install per call:  npx @dzhechkov/harness-cli workflow init …
```

**The division of labour, honestly stated up front:** `dz` AUTHORS, GATES and READS loops — it never
RUNS one. Execution belongs to a host with the `Workflow({scriptPath})` runtime, which today means
**Claude Code**. So: author anywhere (Codex included), run under Claude Code.

#### Step 1 — scaffold the plan shape closest to your scenario

```bash
dz workflow init --name pkg-inventory-audit --pattern fanout --o audit.plan.json
# → wrote audit.plan.json (pattern: fanout)
# → Next: edit the TODO prompts, then `dz workflow validate` + `dz workflow render`.
```

Patterns: `pipeline` (A→B→C), `barrier` (all A, then B), `fanout` (N parallel lanes + a join),
`gate` (a checked step with a redo route). The scaffold is a REAL plan with `TODO` prompts — not a
template you fight.

#### Step 2 — make it yours (edit the JSON)

Fill the `TODO` prompts, name your work units in `fanouts[].registry`, and add the quality gate
with a redo route. The real plan's shape (abridged from
`features/pkg-inventory-audit/audit.plan.json` in this repo):

```json
"fanouts": [ { "stage": "fan", "chain": ["lane"], "maxFanout": 3,
               "registry": ["chunk-1","chunk-2","chunk-3","chunk-4","chunk-5","chunk-6"] } ],
"joins":   [ { "stage": "jn", "forStage": "fan", "joinPolicy": "all-activated",
               "onInvalid": "named-failure" } ],
"steps":   [ …lanes…, { "stepId": "synthesize", "kind": "agent", "deps": ["jn"],
                        "prompt": "Merge the lane JSONs into one inventory. Return STRICT JSON…" },
             { "stepId": "check", "kind": "gate", "deps": ["synthesize"],
               "prompt": "…counts.total must equal 52… answer GATE: PASS or GATE: FAIL" } ],
"gates":   [ { "stepId": "check", "kind": "quality", "failRoute": "synthesize", "maxRedos": 1 } ]
```

The plan surface is deliberately NARROW and fully enacted: anything the generated loop would not
actually perform is REJECTED at validate time with a named `ENACT-*` diagnostic — never silently
accepted and ignored.

#### Step 3 — validate, render, lint (the three gates before any run)

```bash
dz workflow validate audit.plan.json
# → dz workflow validate: OK (digest sha256:70992d9ddc86de15…)

dz workflow render audit.plan.json --o audit.loop.js
# → wrote audit.loop.plan.json then audit.loop.js (exec-fp sha256:49feb8a2c1e17038…, blobs: trace)

dz workflow-lint audit.loop.js --plan audit.loop.plan.json --require-plan
# → dz workflow-lint: PASS (mode=require-plan; 0 fail, 1 warn, 0 inconclusive over 18 rules)
```

`inconclusive` is never a pass, and the rendered script keeps your hand edits across re-renders
(USER regions are preserved).

#### Declare each step's tool perimeter — `LoopStep.tools`

**When to use it:** any loop whose steps reach external systems (a ticket tracker, a wiki, a repo
host) through MCP, and you want the intended perimeter written down, well-formed, and gated rather
than living in a prompt someone will edit.

```jsonc
// in your plan.json — one array per DISPATCHING step (agent | gate)
{"stepId":"discovery","kind":"agent","phase":"Discovery",
 "tools":["gitlab:read","jira:read","wiki:read"],  "budget":{"maxAgents":1}},
{"stepId":"verdict-gate","kind":"gate","phase":"Discovery","deps":["discovery"],
 "tools":[],                                        "budget":{"maxAgents":1}}
```

`tools: []` is the **meaningful** value for a step that touches no external tool — absence is a lint
finding, because silence is never permission:

```bash
dz workflow-lint my-loop.js --plan my-loop.plan.json --require-plan
# → FAIL  tool-perimeter-declared: dispatching step sa declares no `tools` perimeter — absence
#         FLAGS: silence is never permission (declare `tools: []` if the step touches no external tool)
```

A non-empty array is **enacted**, not decorative: it renders a fixed contract line into that step's
prompt, and the lint rule cross-checks the script against the plan (so a plan edit you forgot to
re-render fails too). Severity is staged — **WARN by default, FAIL only under `--require-plan`.**

**It is a DECLARATION, not enforcement.** `agent()` exposes no tool restriction; real enforcement
lives at the MCP server. Do not read this field as a sandbox.

Worked consumer in this repo: `.claude/workflows/cfr-pipeline.js` — a 12-step, 6-gate Customer
Feature Request pipeline with seven typed terminal exits, whose five source-touching stages each
declare their perimeter (`features/cfr-pipeline/`).

#### Step 4 — run it (Claude Code), read it back (anywhere)

In **Claude Code**, paste exactly this shape:

> Запусти мой цикл: `Workflow({ scriptPath: 'audit.loop.js', args: { traceDir: '.dz/loop-trace/pkg-audit-1', runId: 'pkg-audit-1' } })` — и когда закончит, покажи `dz workflow-trace --run pkg-audit-1`.

What the real run produced (captured verbatim; the trace lives at `.dz/loop-trace/pkg-audit-1/` in
this repo):

```
run pkg-audit-1; sources: trace, ledger
      1  run.opened  plan=70992d9ddc86 exec-fp=49feb8a2c1e1
      2  dispatch lane:chunk-1#1  phase=Lanes
      3  dispatch lane:chunk-2#1  phase=Lanes
      4  dispatch lane:chunk-3#1  phase=Lanes
      5..7  settle lane:chunk-{1,2,3}  outcome=ok
      8  dispatch synthesize#1  phase=Synthesize
      9  settle synthesize#4  outcome=ok
     10  dispatch check#1  phase=Gate causedBy=[9]
     11  settle check#5  outcome=ok        ← GATE: PASS
     12  run.closed  {"dispatched":5,"settled":5}
```

The gate passed, the inventory (52 directories = 49 canonical + 2 private + 1 non-package) was
cross-checked deterministically against the filesystem, and the stale test was re-pinned to it.

**And this recorded run is now the regression proof for a fixed defect.** Read the trace again: the
registry names six chunks, but only `chunk-1..3` dispatched — the old renderer treated
`maxFanout: 3` as a prefix cap, and the run survived only because synthesize audited the missing
chunks itself. Current plans treat `maxFanout` as concurrency: all six dispatch through a three-wide
window. Deliberate sampling is explicit (`overflow: "truncate"` plus a non-blank
`truncateReason`) and emits a banner, a `[fanout-truncated]` stderr line, and a trace receipt. The
reader now grades this historical trace `region-dispatch-completeness:fan = FAIL` and names
`chunk-4..6`; a legacy projection without registry evidence is `INCONCLUSIVE`, never a guessed pass.

#### How to phrase the ASK — Claude Code vs Codex

**In Claude Code** (it has both `dz` and the `Workflow` runtime — one message does the whole thing):

> Собери мне цикл под сценарий: «<опиши свой — источники, что делает каждая полоса, как сводить,
> какой критерий качества>». Используй `dz workflow init/validate/render/workflow-lint`, покажи мне
> план НА СОГЛАСОВАНИЕ до рендера, потом запусти через `Workflow({scriptPath})` и дай ссылку на
> `workflow-trace` отчёт.

The "покажи план до рендера" clause matters: the plan JSON is the one artifact worth your review —
prompts, lanes, gate criteria, budgets — and it is small.

**In Codex** (or any shell-capable agent — AUTHORING only, honestly):

> In this repo, run `npx @dzhechkov/harness-cli workflow init --name <x> --pattern fanout --o x.plan.json`,
> then edit the plan for this scenario: <describe>. Run `workflow validate` and fix every diagnostic
> it names, then `workflow render` and `workflow-lint --require-plan`. Do NOT attempt to execute the
> generated loop — it runs under Claude Code's `Workflow({scriptPath})` runtime; hand me the green
> plan and the rendered script.

Codex is a fine plan AUTHOR — the validate/lint diagnostics are named and machine-checkable, so its
edit loop converges. What it cannot do is run the result: the generated script calls the host's
`agent()`/`parallel()` sandbox, which only the Claude Code Workflow runtime provides. A green lint
from Codex + a run under Claude Code is a legitimate two-agent split.

### Run a plan WITHOUT the Claude host (`dz workflow run`)

Everything above renders a plan into a script that only Claude Code's `Workflow({scriptPath})`
runtime can execute. `dz workflow run` is the other half: it **interprets the plan itself**, from a
plain shell, dispatching each step to `codex exec` or an isolated `claude -p`.

**When to use which** — one sentence each:

| | use it when |
|---|---|
| `workflow render` + `Workflow({scriptPath})` | you are already inside Claude Code and want the loop to run in that session, with its agents and its context |
| `dz workflow run` | you are in a shell, in CI, or on a box with no Claude Code session — and you want the same plan enacted with a trace the same reader can read |

It interprets the PLAN, never the rendered script (a rendered script is a Claude-host artifact; a
second enactor reading it would be reading someone else's implementation). Same `loop-plan/1`, same
gate grammar, same join policies, same failure classes — those decisions live in ONE module both
enactors consume, not in two lookalike copies.

```bash
dz workflow run audit.plan.json --run-id pkg-audit-2 --coder-family claude
# → dz workflow run: completed (pkg-audit-2) — trace at .dz/loop-trace/pkg-audit-2/trace.jsonl
# → {"schema":"wf-run-result/1","runId":"pkg-audit-2","status":"completed","exitCode":0}

# the run wrote into the addressing the reader already uses, so nothing new is needed to read it:
dz workflow-trace --run pkg-audit-2 --invariants audit.plan.json
# → INVARIANT PASS         seq-monotonic: seq unique and contiguous 1..12 (12 events)
# → INVARIANT PASS         dispatch-settle-pairing: every dispatch has exactly one settle
# → INVARIANT PASS         join-coverage:fan: every dispatched branch settled; …
```

**Exit codes — `run` and `workflow-lint` have DIFFERENT tables. Both, side by side:**

| | 0 | 1 | 2 | 3 | 75 |
|---|---|---|---|---|---|
| `dz workflow run` | completed | failed (named reason) | usage / invalid plan | — | **typed pause** |
| `dz workflow-lint` | clean | findings | — | inconclusive | — |

`75` is `EX_TEMPFAIL` ("try again later"), and it is deliberately **not** `3`: `3` collides with
lint's inconclusive and reads ignorable, while a pause strands work that is genuinely resumable.
On a pause the **last stdout line** is a `wf-pause-envelope/1` JSON object; a FAILURE emits none —
so a wrapper distinguishes the two from stdout and the exit code alone, without parsing prose.

**Pause and resume** (a `kind: 'pause'` step, or the budget ceiling):

```bash
dz workflow run release.plan.json --run-id rel-7
# → dz workflow run: PAUSED (AWAITING_APPROVAL) — resume with: dz workflow run release.plan.json --resume rel-7 --arg approve=<value>
# → {"schema":"wf-pause-envelope/1","runId":"rel-7","exitCode":75,"pauseState":"AWAITING_APPROVAL", …}
echo $?   # 75

dz workflow run release.plan.json --resume rel-7 --arg approve=yes
# → dz workflow run: completed (rel-7) — …
```

A resume never re-spends work: the cursor comes from checkpoint lines plus artifact probes, and a
STALE-INPUT mismatch (plan digest, exec fingerprint, or the run-args hash) refuses to resume at all —
there is no override, because the checkpoints describe a different run. Extending a ceiling is the
one thing that is not an identity change: `--budget-extra` and `--wall-clock-extra` are recorded and
capped, never silent.

**Budget.** Every boundary reserves its worst case BEFORE it dispatches, so a region that will not
fit pauses in front of the region rather than halfway through it. `budget.jsonl` gets one
`wf-budget-1` row per dispatch (plus probe rows, which never decrement the ceiling).

**Cross-model safety.** A step marked `x-role: "qe"` that resolves to the same family as
`--coder-family` is REFUSED: the family that wrote the code may not review it. `--allow-same-family-qe`
proceeds, and writes a real re-QE debt that `dz reqe` surfaces — a suspension you can see, not a
comment nobody reads.

#### Honest limits — three divergences from the Claude host, named rather than discovered

1. **dz-side settle events carry no `wallTime`.** The Claude host stamps it shell-side during its
   flush; the shared emitter accepts none, and stamping it afterwards would mean editing lines that
   were already validated — exactly what the buffer discipline forbids. Per-dispatch wall clock
   lives in `budget.jsonl` instead. `wallTime` was always diagnostic-only (never an operand of an
   invariant), so no verdict changes.
2. **The runner checkpoints every top-level stage unconditionally**, whatever `plan.checkpointing`
   says. Its resume cursor is BUILT from those lines, so making them optional would make resume
   optional. `plan.checkpointing` remains what it always was: the Claude-host opt-in.
3. **A gate `terminal:` route ends the run by plan design, and leaves the trace INCOMPLETE.** This is
   parity with the rendered script, whose top-level terminal `return` skips the epilogue that writes
   `run.closed`. The run exits 0 (the plan declared this ending; the Workflow host completes too) and
   the ledger row names the route — but `dz workflow-trace` will report the trace as incomplete and
   downgrade window-truncated invariants to `inconclusive`. That is correct: nothing proves the
   un-run steps would have passed.

**Deferred, and said so:** budget rows do not appear in the `dz workflow-trace` timeline yet. The
condition for adding them was zero reader change for Claude-host runs, and it is not met — a
Claude-host run has no `budget.jsonl`, so the timeline would grow a section that is empty for half
its inputs. `budget.jsonl` is readable by eye and by the recommender in the meantime.

### Move a run's telemetry to another machine (`workflow-trace export` / `import`)

A run leaves traces on the machine that produced it. `export` puts one run's telemetry into a single
movable file; `import` reconstructs that run under a root you name.

```bash
dz workflow-trace export --slug my-feature --o my-feature.bundle.json
dz workflow-trace import my-feature.bundle.json --into /other/project
```

**What a bundle carries** — the raw event lines (`trace.jsonl`, `.fa-state/checkpoints.jsonl`), the
ledger rows selected for that run, optionally the training pairs, and `runMeta`: WHO ran each stage,
read from the harness's own workflow records. **Events, never aggregates.** The one derived value —
`attribution`, "which model ran which stage" — travels ALONGSIDE the records it was folded from,
marked `derived`, naming its rule and the record ids, so a consumer that disagrees can recompute it.
The rule is stated rather than implied: last-writer-wins by timestamp is a CHOICE — a run whose
phases used different models has no single honest answer, and the map reports who ran it *last*.

**The ledger selector** matches a row by `runId`, or by `slug` when the row has no `runId` — because
only `loop-run` rows carry a `runId`, so a `runId`-only filter would select nothing for a feature-adr
run. The bundle reports rows scanned vs matched, so an empty slice is visibly empty rather than
indistinguishable from an absent ledger.

**Consent does not travel inside the bundle.** Training pairs may contain target-repo code, so
including them needs `--include-pairs --yes` at export AND `--with-pairs` at import; a pairs-bearing
bundle imported without the flag writes no pair content.

**Import is fail-closed.** It reconstructs the run's native layout under `--into`, and REFUSES to
write into a run directory that already has content unless it is the bundle's own run and `--force`
is given; an identity mismatch refuses even under `--force`. A refused import writes nothing — not
one file.

**Degradation is loud and typed**, and exactly one reason asks for action:

| reason | meaning | action |
|---|---|---|
| `records-absent` / `no-match` | no harness records, or none for this run | none |
| `predates-model-routing` | a genuine older run, from before per-stage model routing | none — this is history |
| `unreadable` | a record could not be parsed | look at that record |
| `layout-unrecognised` | records exist and parse, but the fields we read are gone | **the harness record layout CHANGED — update the reader** |

By default a degraded export still succeeds and prints one named line per degraded member; `--strict`
makes it exit non-zero so automation fails closed. The split exists because the actionable reason
used to fire on normal data — three of thirty-two runs in a real store were simply older than
per-stage routing — and an alarm that sounds on normal operation stops being an alarm.

**Honest scope:** `runMeta` is read from a store this project does not own, so its shape can change
without notice. That is precisely what `layout-unrecognised` exists to announce, and why the reader
refuses rather than half-parsing: a partially-read record would report a model-blind run as
model-known.

**The v1 plan surface is deliberately NARROW and fully enacted** — `dz workflow validate` REJECTS
(named diagnostics, never a silent no-op) anything the generated loop would not perform: retry
timing (`initialDelayMs`/`backoffMultiplier`/`maxDelayMs`/`jitter` — v1 retries are immediate;
`ENACT-RETRY-TIMING`), non-inline dispatch routes (`codex-wrapper`/`codex-exec`;
`ENACT-DISPATCH`), per-step checkpoint granularity and `checkpointing.schemaVersion`
(`ENACT-CKPT-OPT` — checkpointing is all-or-nothing per run, schema stamp pinned), plus caching,
jitterless subsystems and branch schemas as before (`ENACT-*`). It also enforces required-field
presence per record kind (an absent `fanouts[].stage` is a parse error, not a zero-agent run),
unique stepIds that lower to DISTINCT generated identifiers (`a-b` and `a.b` no longer collide in
the generated script — the lowering is collision-resistant, not injective, and `IDENT-1` is the
parse check that actually rejects a collision),
and dependency order at EFFECTIVE execution positions (a fanout member executes at its region's
position, not its declaration index). The schema is CLOSED-WORLD: an unknown non-`x-` key is a
parse error at every level (so a typo like `trcae`, or a second spelling like `retry.delayMs` /
`dispatchRoute`, fails loudly instead of parsing and doing nothing), `x-` vendor keys are accepted
only at their documented scopes (plan + step), and `fanouts[].registry` items must live in the same
ItemKey domain the trace plane enforces — `trace.emit` can never decide whether a valid plan runs.
Deferred options are on the loop-designer roadmap.

### `dz feature-adr-checkpoint` — record a pipeline stage only after WITNESSING it

```bash
# refuses: the stage claims an artifact that is not on disk
dz feature-adr-checkpoint --feature-dir ~/proj/features/add-auth \
  --stage plan --input-hash 8f21c0 --result '{"wrote":["06_implementation_plan.md"]}' \
  --artifact 06_implementation_plan.md
# → dz feature-adr checkpoint: REFUSED — stage plan is missing its artifact(s): 06_implementation_plan.md   (exit 1)

# records: the same call once the plan actually exists
# → dz feature-adr checkpoint: recorded plan (witnessed 1 artifact(s))                                       (exit 0)
```

**When to use it:** you do not call this by hand in normal work — `/feature-adr` in workflow mode calls
it after every expensive stage so a crashed run resumes instead of restarting. Reach for it directly
only when repairing a run's `.fa-state/checkpoints.jsonl`.

**Why it is a command and not a line of shell.** The workflow script is sandboxed with no filesystem,
so it used to hand a subagent a finished JSON line and say *"append this"*. The subagent verified
nothing, and a safety classifier read that shape as one party instructing another to declare a
verification gate complete — MEASURED 2026-08-21: nine consecutive writes blocked in one six-hour run,
`.fa-state/` never created, resume silently dead, and the run still reported success. The subagent now
runs a command that MEASURES the declared artifacts itself. It refuses a null result (a dead stage is
never recorded as done), an absent or partially-present artifact set, and a stage that declares nothing
to witness — so a stage that did not happen can no longer be recorded, which the old mechanism allowed.

## All Commands (85)

*(84 MEASURED from the bounded command inventory below; rendered `dz --help` exposes 81 unique
top-level names, pinned by `test/command-count.test.ts`.)*

```
dz setup             --target <name> [--preset <name>] [--select id,id,...] [--skills-dir <dir>] [--memory agentdb] [--no-memory] [--no-hooks] [--install-driver] [--force]
dz init              --target <name> [--preset <name>] [--select id,id,...] [--allow-integrations <sha256:...>] [--no-integrations] [--no-verify] [--force]
dz integrations-verify --target <name> --component <mcp|hooks> [--project <dir>] [--json]
dz install           <npm-pkg> [--target <name>] [--project <dir>] [--force]
dz bundle            [--preset <name> | --select id,...] [--out <dir>] [--skills-dir <dir>] [--force]
dz teach             "<pattern>" [--class-form "<template with :slot>"] [--reward <0-1>] [--domain <name>] [--type rule|success-pattern|lesson-learned] [--project <dir>] [--to project|global] [--no-mirror] [--guard]   # --class-form is optional and never blocks the specific write; --project pins the learned store to <dir>/.dz; --to picks WHICH store (global = ~/.dz, shared across projects). Every write prints the path AND what chose it.
dz teach --reinforce "<dzId-or-exact-text>" [--project <dir>] # bump an existing learned pattern instead of writing a near-duplicate
dz teach --from-json <file> [--project <dir>] [--no-mirror] [--harmonize]   # bulk-import a `dz recall --all --json` export; prints a harmonize dry-run advisory
dz consolidate       [--sessions-dir <dir>] [--project <dir>] [--no-mirror]
dz recall            "<query>" [--limit <N>] [--domain <name>] [--semantic | --no-semantic] [--full] [--project <dir>]   # hybrid lexical+vector when the vector tier is enabled; --domain BOOSTS same-domain lessons (never filters)
dz recall --all      [--json] [--stats] [--include-domain <name,…>]   # export the learned store (held-out domains are withheld unless named), or inspect learning stats/top uses
dz recall --books    "<query>" [--book <slug>]      # digitized-book KUs; --book narrows to one book
dz vector status     [--project <dir>] [--json]     # semantic tier: engine availability, mirrored vs lexical counts, pending queue
dz vector reindex    [--project <dir>] [--json]     # re-embed learned vectors with the CONFIGURED model + stamp the manifest (snapshot first; atomic — a mid-way failure restores the store). Warns about task types it does not own (e.g. book-knowledge → run `dz brain reindex`)
dz vector export     <path> [--project <dir>]       # portable VECTOR form (.rvf checkpoint; needs the opt-in RVF engine)
dz vector import     <file.rvf> [--project <dir>] [--json]         # RVF import — UPSERT-BY-dzId (idempotent, never overwrites; orphans skipped)
dz vector harmonize  [--apply] [--threshold <0..1>] [--json]       # SEMANTIC merge of near-dups (dry-run default; --apply after a restorable backup)
dz teach --harmonize [--apply] [--threshold <0..1>]                # alias of `dz vector harmonize`
dz statusline        [--json] [--install]   # compact Claude Code statusline: live self-learning pattern count + brain sources
dz usage             [--json] [--project <dir>] | --calibrate --session <pct> --weekly <pct> [--model fable=<pct>]   # ESTIMATE Claude usage from fixed reset windows; optional per-model weekly binding; exit 0 ALWAYS
                     --by-stage [--run <id> | --slug <s>] [--epsilon <0..1>] [--write <file.jsonl>] [--json]         # per-stage cost ledger for ONE feature-adr run + reconciliation invariant (BALANCED | DEFECT | INSUFFICIENT_DATA)
dz chain             [--project <dir>] [--json]   # verify EVERY hash-chained journal in one command; coverage is DERIVED from the CHAINED_JOURNALS registry, so a journal cannot be chained and checked by nobody; an ABSENT journal is NAMED, never omitted; exit 1 on broken/unreadable
dz claim-check       [paths...] [--json] [--fail-on high|medium|none] [--project <dir>]   # enforce the Integrity Rule: flag untagged/overstated accuracy claims; default scan = READMEs + features' 08_qe_report.md; exit 1 only at/above --fail-on (default high)
dz lint              [paths...] [--json] [--config <file>] [--registry <file>] [--project <dir>]   # advisory EN/RU prose-style lint; findings exit 0, incomplete input/policy exits 1, usage exits 2
dz brain list        [--json]                                        # the durable cross-project knowledge brain
dz brain query       "<q>" [--source <slug>] [--limit <N>] [--any] [--rerank] [--json]  # cross-source recall (--any = OR match; --rerank reorders on-point first). Auto-broadens: if strict all-terms match yields 0 hits, it retries once as OR and labels the result "broadened" (text note + broadened:true in --json) instead of returning empty. Explicit --any is OR from the start (never labeled broadened).
dz brain add         [--source <slug>] [--project <dir>] [--from-slice <f>|--from-pack <p>|--from-kus <f> --slug <s> --kind <k> --license <spdx> [--override]] [--json]  # grow the brain
dz brain ground      "<prompt>" [--k <N>] [--source <slug>] [--text] [--budget <N>] [--full]  # retrieve + emit grounding citations (hook entrypoint; silent if irrelevant); --budget N eager-inlines top-K KU content within ~N tokens (chars/4 approx); --full = --budget 8000
dz brain expand      <kuId> [--source <slug>] [--json]               # full-content lookup by kuId — the command the grounding directive names; prints name/problem/pages/book + FULL content (untruncated)
dz brain init        [--project <dir>] [--k <N>]                     # opt-in: wire the grounding UserPromptSubmit hook into settings.json
dz brain primer      <slug> [--json]                                # print a source's capability card (histogram + top decision moments)
dz brain export      --source <slug> --out <file>                   # write a portable per-book KB slice (ships inside the pack, §8.1)
dz brain update      <slug> [--project <dir>] [--json]              # non-destructive refresh: re-mirror a re-ingested source, evict stale corpus
dz pretrain          [--project <dir>]
dz recommend         "<task description>" [--json]  (RU/EN lexical topics; explicit task/project-stack/none provenance)
dz compose           <preset1+preset2+...> [--target <name>]
dz diff              <skill-dir>
dz upgrade           [--target <name>] [--project <dir>]
dz verify            [--skills-dir <dir>] [--target <name>]
dz sync              [--canonical <dir>] [--project <dir>] [--dry-run] [--force]
dz update            (alias for sync)
dz list              [--skills-dir <dir>]
dz info              --id <skill-id> [--skills-dir <dir>]
dz create-skill      --name <id> [--description <text>] [--tier 1|2|3] [--with-references] [--no-evals] [--bto]
dz registry          [search <query>] [--category <cat>]
dz benchmark         <skill-dir> [--compare <dir>] [--all]
dz mcp-scan          [path] [--json]   (static agent-permission audit; exit 0/1/2 = clean/medium/high)
dz architecture      [--json] [--revise] [--check --slug <s> --desc "<text>" [--cmd a,b] [--subsystem <id>]]   # product map (subsystems = the README jobs + foundation/arsenal/ops); --revise = drift check (exit 1); --check = forward-looking сverka of a proposed feature vs map+vision (exit 2 on a hard-stop dup)
dz project-skills    [--json] [--stages-json] [--project <dir>]   # polymorphic feature-adr: resolve architecture/project-skills.json (fixed roles product-vision/critic/brand/impl-bar + open extra[]) into per-stage guidance; absent = generic run (byte-identical); feature-adr Step 0 reads it
dz mr-rakes          [--json] [--candidate N --confirmed N] [--teach] [--gen-critic <path> [--apply]]   # mine review artifacts (features' QE reports + REVIEW files) for RECURRING mistakes; anti-noise (≥2/≥3 distinct sources); close into dz teach + a project-critic skill (R2 critic role)
dz retro             [transcript] [--json] [--threshold N] [--no-teach] [--install-hook]   # per-session retro: mine the current session for recurring PROCESS rakes (claimed-done-without-verify, committed-without-verify, n-fix-cycles, ignored-correction), drill the user (socratic + checklist) AND teach the agent — co-learning via the dz teach store
dz feature-adr-setup [--plan] [--from-spec <f>] [--apply]   # guided project onboarding engine (behind the `configure-feature-adr` skill): --plan shows which docs exist/missing; --from-spec scaffolds vision/map/testing/project-skills (propose; --apply writes; augment-never-clobber)
dz challenge --plan <plan.md> [--json] [--context-only] [--author <model>]   # adversarial plan-gate (behind the `challenge-panel` skill): assemble a WIDE context pack (plan + vision + testing + map + degradations) + the fixed C1-C8 "break it" brief for a FRESH adversary (≠ plan author); advisory, never blocks
dz routing [--stage <s>] [--json]   # inspect the learned cost-optimal routing store: what `args.models.<stage>='auto-cost'` believes per (stage, complexity-tier, model) — gated attempts/successes/rate (feeds feature-adr model selection)
dz bto-optimize --split|--plan|--select|--scope-check|--diff [--json]   # deterministic engine behind /bto-optimize: hold-out split + hard-capped budget + no-regress-on-holdout winner selection (defeats judge-gaming); prose-only, diff-confirmed, never auto-writes
dz discrimination-check --test <f[,f]> [--base <ref>] [--name <filter>] [--runner <cmd>] [--timeout <ms>] [--json]   # §42 test-discrimination gate for feature-adr Step-8: run the ADR's property test in an isolated git worktree at pre-feature base — it MUST go red without the fix. SEVEN verdicts, each gated on EXECUTION evidence: DISCRIMINATES · DISCRIMINATES_VIA_ERROR · NON_DISCRIMINATING (false green) · TEST_FILE_ABSENT · LOAD_ERROR_AT_BOTH_REVS · FAILS_AT_TIP · CANNOT_ISOLATE (+ typed reason). Advisory, never auto-aborts
dz amendment-check   --slug <slug> | --feature-dir <dir> | --all [--json]   (every AM-N amendment row must resolve to a test found INSIDE the file the row names; the PLAN is authoritative when it carries rows, and an ideation amendment the plan drops is a failure; --all is a census that always exits 0; exit 0 pass/skip, 1 fail, 3 NOT-ESTABLISHED — a section that parsed ZERO rows is never a pass)
dz contract-check    --slug <s> [--json]   (read-only retrospective feature contract gate: canonical AC-N + ADR Confirmation → CC-N; every item needs one artifact-anchored met|unmet|not-testable verdict; A/B with unmet is refused; exit 0 pass / 1 readable violation / 2 invalid invocation or unreadable/not-established artifacts)
dz feature-adr-record  --kind ledger|training-pair --stage <s> [--slug <s>] [--row|--pair <json>] [--mark <n>] [--once] [--json]   (the witnessed writer: payload as an ARGUMENT never as shell, refused before any write, timestamp stamped before serialising, append verified by re-reading the tail; exit 0 written|duplicate|skipped, 2 refused, 3 not-verified, never blocking)
dz mutation-gate [--package <dir>] [--registry <file>] [--test-cmd "<cmd>"] [--only <id[,id]>] [--timeout <ms>] [--rebaseline per-entry|final] [--keep-scratch] [--json]   # the mutation gate: for each NAMED protection in a declarative registry, copy the package to a scratch dir (shadow-repo layout, node_modules symlinked, git-initialized), verify the baseline is green, apply the entry's exact {find, replace} mutation, run the suite, REQUIRE red, restore — and require the red to be ATTRIBUTABLE to the protection: a mutated file that no longer parses is MUTATION_UNPARSEABLE, a failing count far above the entry's bound (maxFailing, default from observed) is OVER_FAILING, and a restored tree that does not reproduce green makes the entry INCONCLUSIVE (flaky suite). A mutation that does not apply, a green suite, or an inconclusive run is a FAILURE — never a skip. exit 0 all proven / 1 gate failed / 2 setup error
dz delivery-check --slug <slug> [--context-only] [--findings <f.json>] [--strict] [--author <model>] [--json]   # portable Step-10 Delivery Gate: the `manual` form that travels to every shell target — prints the 4-plane review brief (regressions ‖ security ‖ code-quality ‖ product-honesty) + artifact probes; --findings classifies a fed-back review into a fail-closed ready|blocked hand-off (only cross-validated BLOCKER/HIGH count) and writes features/<slug>/10_delivery_review.md; --strict exits 1 on blocked
dz skills-verify     [--dir <project>] [--expect a,b] [--static] [--strict] [--timeout <s>] [--json]   # does .claude/skills/ actually REGISTER? --static = instant layout scan (CI-safe, no session): flags dirs that can never register; default also starts a real session and reads the authoritative system/init listing. exit 0 pass / 1 fail / 2 inconclusive — an unobservable registration is NEVER a pass
dz compounding       [--project <dir>] [--json]   # honest learning-loop payoff report: pool/replay/guard instrumentation plus the monthly eligible→attempted→accepted→executions funnel. A missing source is NOT MEASURED; only a non-empty→empty named edge across three consecutive measured months is a funnel finding; text/JSON carry the same facts and no learning-health verdict
dz deadwood          [--weeks <n>] [--json]   # advisory zero-usage report for commands and guard-rule firings; safety-net exclusions carry written reasons, skills without an invocation signal are never candidates, and shallow history says INSUFFICIENT_DATA. Human deprecation review only — never deletes or modifies harness surface
dz epoch-replay --mock  [--n <N>] [--effect <-1..1>] [--tie-rate <0..1>] [--seed <N>] [--slice <name>] [--margin <0..0.5>] [--json]   # $0 synthetic run through the REAL verdict math; labelled SYNTHETIC, same seed = byte-identical
dz epoch-replay --emit  [--project <dir>] [--limit <N>] [--seed <N>] [--margin <0..0.5>] [--out <file>] [--json]   # cold-vs-warm work order: replayable instances + PRE-REGISTERED blind A/B assignment + the PRE-REGISTERED non-superiority margin + a sha256 integrity digest + emittedAt/corpus fingerprint (raw prompts — defaults into the git-ignored .dz/epoch-replay/)
dz epoch-replay --judge <filled-work-order.json> [--out <file>] [--json]   # blind judge prompts from the filled plans — the file carries {id, prompt} ONLY (no assignment, no arm names); refuses an order whose digest or seed-derived assignment does not check out; half-pairs skipped WITH A REASON, on stdout
dz epoch-replay --score <judgments.json> --work-order <file> [--slice <name>] [--json]   # un-blind against the VERIFIED pre-registered assignment; ONE paired binomial over DECISIVE pairs (ties excluded, reported) → SUPPORTED only when the lift interval (2p−1) lies entirely above zero; FALSIFIED only on harm or a passed non-superiority test (lift upper bound below the margin PRE-REGISTERED in the work order, default 0.05, at 10+ decisive pairs); else INCONCLUSIVE (min 5 decisive pairs). Refuses a forged work order, a --margin flag, or duplicate judgement ids; the verdict is data, not an exit code
dz score             --slug <feature> [--project <dir>] [--json]   # process scorecard for ONE feature-adr run, from its artifacts: ADR confirmation, discrimination proof, cross-model QE grade, live verification, README-first, learning loop, amendments — DESCRIPTIVE-ONLY (a low score exits 0); evidence lines are shown so the reader judges the heuristics
dz recap             [--day|--week|--month] [--at <ISO date>] [--refresh-publishes] [--project <dir>] [--json]   # what was done over a window, from records only. `--refresh-publishes` fills the third-party publish-times cache first (the ONLY place this command touches the network — 51 packages in ~7s, batches of 8); the report itself always reads the cache, prints its AGE, and names any package the registry did not answer for: those are MISSING from the numbers, not zero. Deliveries carry the grade an independent review STATED — a report naming two different grades is reported AMBIGUOUS, never guessed; registry publishes come from a cache (51 packages cost 18.3s over the network, MEASURED — never inside a report); gate verdicts and knowledge reuse come from the local stores. --quarter/--half-year/--year are RECOGNISED and REFUSED with the real span in days: there is exactly ONE complete quarter and the longest record is 174 days, so a quarter-over-quarter comparison is arithmetically impossible and a year would be fabrication. Every section carries its own data-start date, and "the source was not read" never prints as a zero. Contaminated measures are NOT computed and the report says so: commit count (this project mandates a commit per logical change), lines changed (352 of 1318 commits are docs), token spend (self-declared an estimate, once wrong sixfold), learning-event volume (the curve tracks when hooks were installed), inventory counts (monotonic — they can only flatter), lesson count (54% of the pool has never been read). exit 0 reported / 2 refused
dz cadence           [--window day|week|month|quarter|halfyear|year] [--json]   # the RHYTHM view of what shipped: graded-shipment counts bucketed by ISO week, npm-publish cadence (reads `dz recap`'s publish-times cache — run `dz recap --refresh-publishes` to warm it), guard repeat DECAY on the FIXED rule set (a rule joins only with pre-window history, so a newborn rule's zero is youth, not virtue — the no-stubs false-zero class excluded by construction), and recall reuse per week. A window deeper than 2× the record is REFUSED with the measured depth and the largest honest window named (a cadence from under two full windows is scale forgery). Sibling of `dz recap`: recap is the narrative what-was-done report over one window; cadence is the week-by-week rhythm across the window. exit 0 / 2 refused-window / 1 usage
dz profile           init | show | set <field> <value> | sync [--target claude]   # WHO is being talked to. Per-USER store ~/.dz/profile.json (0600, never under a project root), delivered as a marked block in ~/.claude/CLAUDE.md so it loads in EVERY project on the machine, dz installed or not. Two axes: default register (pro | pro-lite | plain; RU aliases профи / профи лайт / просто) and named domains that move it — `deep` = full pro no scaffolding, `weak` = one plain sentence EVERY time unprompted, MANDATORY there. Three fixed rules ride along and the register cannot override them: an explanation is SELF-CONTAINED (every term glossed at first use in THIS passage), the register governs dialogue and owner-facing surfaces but NEVER ADRs / commits / QE reports / npm READMEs, and it changes FORM not FACTS. `show` always prints the store path and the profile's age; an unknown register value is REFUSED naming the accepted set, never silently defaulted; a hand-edited block is reported as drift and `sync` repairs it with a timestamped backup, foreign content preserved byte-for-byte. Redacted from training-pair capture (.dz/fa-training/ records the full prompt and is deliberately not gitignored)
dz qe-rounds          (--slug <feature> | --feature-dir <abs>) [--ceiling <n>] [--project <dir>] [--json]   # how many Step-8 review rounds has this feature ALREADY had? The rule "Max iterations: 3" lived only as a sentence in a prose module, so every restart of the agent forgot it — MEASURED, one real slug reached 38 graded rounds. Reads what `dz qe-bridge` already wrote (signoff-<runId>.json / failed-*.json under features/<slug>/.fa-state/qe-bridge) and writes NOTHING itself, so it answers for runs already past. A round is a runId, not a file; an attempt with no verdict is counted separately and never merged; ONE directory, never a union across checkouts. FAILS CLOSED: if any record cannot be counted the verdict is NOT ESTABLISHED, never a smaller number presented as the answer. exit 0 under the ceiling / 1 at-or-over — the owner decides, this never judges whether the rounds were warranted / 2 NOT ESTABLISHED, which is never "zero rounds"
dz restart-advisor    --slug <feature> [--threshold C|D] [--rounds <n>] [--json]   # manual, read-only advice over this feature's QE history. Defaults: threshold D, rounds 2. Reads only features/<slug>/.fa-state/checkpoints.jsonl and .dz/fa-training/<slug>/qe.jsonl; when both carry QE rounds they must normalize identically and are never unioned. RESTART_CODE_STAGE is a recommendation for the operator, not an action: autoAction is always false, and every firing result includes an explicit decision-log line. exit 0 established recommendation/no-recommendation / 2 invalid or not established / 1 unexpected runtime failure
dz provenance-check   --manifest <sources.json> [--project <dir>] [--json]   # nothing goes out citing a source that may not leave this machine. Checks PROVENANCE, not words: every claim in a draft names its source, and a source is cleared only when it is a KNOWN kind that resolves safely. Repo paths are classified by `git -C <root> check-ignore` over the RESOLVED path — so a symlink into an ignored directory is refused, not cleared (MEASURED: git classifies the string and never dereferences), and the verdict does not change with your working directory. Store records need naming in the git-TRACKED `provenance-public.json`, so declaring one public is a reviewable commit rather than a field inside an ignored store. Anything else is refused: an undeclared kind is never inferred from the path's shape. exit 0 allowed / 1 blocked / 3 NOT ESTABLISHED — an empty manifest, an unreadable one, or an oracle that did not run is never a pass. **What it cannot do, said on the passing path too:** it proves what was CITED. It cannot see a paraphrase with no citation, nor confidential text pasted by hand into an allowed file. Read the draft.
dz name-check         [--command <n>] [--module <basename>] [--export <a,b>] [--project <dir>] [--json]   # is this name free, BEFORE a line of code? Twice in one day a collision broke the build outright — `dz retro` was already a command, `decideProvenance` already an export — and both were answerable in advance. Scans workspace SOURCE and never `dist`, because a stale build answers 'free' confidently (MEASURED: half an hour of convincing live runs against a previous build while tsc was red). Checks a command name against the dispatcher AND the help block, a module basename against every package's src/, and exported identifiers against every declaration — naming the DECLARING file, not the barrel. exit 0 all free / 1 at least one taken / 2 nothing asked or the scan read nothing — an empty sweep is never a clean bill. **Honest limit, printed on the passing path:** it reads declarations, so a re-export under a different name stays the build's job.
dz tg-post            --draft <file.html> [--manifest <sources.json>] [--channel <@name>] [--send --yes] [--night] [--max-per-day <n>] [--json]   # the sender for an APPROVED genai-tweets-channel post, held to the channel's own accepted ADRs: HTML mode only (never MarkdownV2 — 18 escapes against 3, one miss is a 400); link preview OFF by default (x.com previews in Telegram are broken since 2022); the 00:00-06:00 MSK quiet window refuses without an explicit --night. THE DEFAULT RUN IS A DRY-RUN: tag balance and allowed-tag checks, bare &/< detection, the 4096 visible-character limit with the overshoot counted — every issue named in one pass, not just the first. The provenance gate runs IN-PROCESS over --manifest, and a draft with no manifest is refused as unchecked when a send is asked. A real send needs --send AND --yes — ADR-004's standing order that publishing stays manual, stated out loud each time. Three autopublish guards run FAIL-CLOSED, in a fixed order: the **stop-cord** (`.dz/tg-post/HALT` exists ⇒ nothing publishes, checked FIRST so no bug in a later gate can route around it), **dedup** by the sha256 of the post's VISIBLE text (what the reader sees, not the bytes — a whitespace-different draft is the same post), and the **daily limit** (10 by default, `--max-per-day <n>` to change it), counted over the trailing 24h. The journal is two-phase: a `pending` row is written BEFORE the network call and a `sent` row after Telegram accepts, so a crash between the two is caught by dedup on the next run instead of double-publishing; only `sent` rows eat the daily ceiling. An UNREADABLE journal REFUSES — an unreadable counter does not prove the ceiling is unreached. The provenance gate also clears `kind: url`: a well-formed http(s) URL is public by construction so there is nothing local to protect, while a `file://`, a bare path or a non-URL is refused, never inferred. The bot token (TELEGRAM_BOT_TOKEN or telegram.tokenFile) is never printed, and the gates run BEFORE any secret is read. exit 0 sent or clean dry-run / 1 refused / 2 usage
dz feature-adr-checkpoint (--slug <feature> | --feature-dir <abs>) --stage <s> --input-hash <h> --result <json> [--artifact a,b] [--json]
dz reqe              [--slug <feature> [--done --report <f>]] [--project <dir>] [--json]   # the re-QE debt ledger: a usage-switched feature-adr run whose Step-8 QE ran on the coder's OWN family (cross-model guard suspended, FR-2.9) records a debt; list debts (also surfaced by dz usage), print the cross-family review brief, settle FAIL-CLOSED against an existing GRADED report (the run's own 08_qe_report.md — even hard-linked — can never settle its own debt); settlement lands in 08_qe_report.md, evidence rotates to reqe-settled.json
dz qe-bridge         --family claude --slug <feature> [--coder-family codex|claude] [--model <id>] [--files a,b] [--out <f>] [--timeout <s>] [--allow-same-family] [--json]   # the REVERSE QE bridge (Codex-hosted → Claude reviewer): the reviewer runs ISOLATED (an empty temp cwd + --safe-mode --strict-mcp-config --tools '' --no-session-persistence, so no CLAUDE.md/skills/plugins/hooks/MCP load) and its verdict is read from the --output-format json RESULT ENVELOPE, so text a customization printed onto the same stdout can never become a signoff. Probes the model first; sends SCOPED extracts under a loud 200k-char ceiling; the grade must agree across three LAST-anchored channels AND the marker must be the final content — empty/gradeless/mismatched/miscounted output is a named failure with an audit record under features/<slug>/.fa-state/qe-bridge/, never a clean review. exit 0 signoff parsed (ANY grade — it reports, it does not gate) / 1 named failure / 2 usage. DZ_QE_BRIDGE_CLAUDE_BIN is a TEST SEAM (recorded as binOverride:true)
dz backlog <sub>     add "<idea>" | list | show <id> | goals [--validate] | roulette [--seed n] [--commit <id>] | ship <id…> | drop <id…> | reopen <id…> | enrich <id> | jira <id> | harmonize [--apply]   # brain-backed idea backlog: capture an idea → semantic dedup against past ideas/features via the REUSED agentdb vector engine (two-signal: bounded-excerpt cosine DUPLICATE≥0.92 corroborated by shared subject vocabulary — a register-only 0.94 is demoted to RELATED, a length-only re-capture is caught as a subset duplicate; absorbed texts kept in absorbed.jsonl) + GoalMap alignment ("map+compass") → weighted seeded roulette picks one to work on → enrich STAGES an idea2prd hand-off → jira writes an auditable outbox via a configurable MCP adapter seam (jira-mcp|copilot-mcp|none). No 2nd vector store; without agentdb it degrades to exact-text dedup (honest)
dz sign --init --out <path>  |  --pack <dir> --key <path>   # --init: generate the Ed25519 keypair (private OUTSIDE the repo, prints the public key for keys/dz.pub); else sign a pack's manifest + CycloneDX SBOM
dz sbom --pack <dir> [--out <file>]   # emit the CycloneDX 1.5 SBOM for a pack standalone (file-level bill of materials); print to stdout or write to a file
dz guard check --op <publish|teach|consolidate|reindex> [--text <s>] [--json] [--force <reason>]   # declarative constraint layer before self-mutating ops: HARD violation → block (exit 1), SOFT → warn; zero-config defaults, .dz/guard.json to customise; dz guard --init | dz guard log (append-only audit). dz publish runs it automatically (--no-guard "<reason>" = logged escape hatch)
dz guard promote [--dry-run | --apply] [--window-days <N>] [--periods <N>] [--json]   # lesson → guard-rule promotion: ranks lessons by firings × cost, SHADOW-replays each candidate over real commits, and proposes a rule only after TWO consecutive wins AND two window-lengths of REAL elapsed time since first observation. Non-dry runs add bounded prospective funnel evidence to .dz/promotion-state.json without feeding the verdict; --dry-run remains write-free. --apply installs SOFT rules only; promotions/refusals remain under features/guard-promotion/promotions/
dz feature-adr-setup --guards [--loc-cap <n>] [--apply]   # P3: scaffold DETERMINISTIC guard tests into the project — guards.config.json + a zero-dependency check.mjs runner (LOC cap, secret scan, frozen-file sha256 pins, waivers-with-reasons); wire `node architecture/guards/check.mjs` into CI
dz publish           [--filter <name>] [--bump-only] [--claim-check <off|warn|error>]   (dry-run by default; pass --yes/--confirm to go live; claim-check gate defaults to warn — surfaces README claim findings, never blocks)
dz parity            [--target <name>] [--json]   # honest feature×target map COMPUTED from the capability model — full / manual (via which form) / absent, per target
dz release           [--filter <name>] [--affected] [--audit-dev] [--tag] [--publish] [--json] [--dry-run] [--no-issue]   # VERIFIED release: 4 HARD gates in front of dz publish — package test suites, pnpm audit --prod >=high (--audit-dev widens), node --check of every dist/bin file (unbuilt package with a build script ⇒ MISSING_DIST fail), bin smoke-boot "node <bin> --help" (temp cwd + timeout); --affected narrows to git-touched packages (fail-open); any red gate STOPS the release (exit 1) + best-effort gh issue; green ⇒ re-sign reminder, then the ready dz publish command (never with --yes injected)
dz auto-canonicalize --source <github-url> --pack <skills-pack>
dz sync-upstream     [--package <dir>] [--list] [--all]
dz drift-check       [--all] [--json] [--project <dir>]   # CI gate: exit 1 on NEW shared-skill drift (baseline: .dz/drift-allowlist.json; --all incl .claude dogfood)
dz agents-sync       [--check] [--json] [--project <dir>] # sync anchored bearing rules into the root AGENTS.md policy fence; exit 0 sync / 1 drift / 3 inconclusive
dz hooks-sync        --target codex [--check] [--verify|--no-verify] [--project <dir>] [--remove] [--json]  # install + ARM the dz veto/recall hooks in $CODEX_HOME/hooks.json and PROVE they fire with a live veto probe; exit 0 armed+trusted+verified / 1 not armed / 3 inconclusive (incl. --no-verify)
dz sync-canonical    <skill> [--check] [--from <dir>] [--auto] [--project <dir>]   # heal every copy from skills-meta/<skill> or --from; no canonical + --check = compare copies to each other (exit 1 on drift); no canonical + write = refuse unless --auto (LOUD, picks most-complete copy); --check writes nothing
dz scout             [--topics <list>] [--since <date>] [--deep] [--output <file>] [--diff] [--report]
dz workflow          init --name <n> [--pattern pipeline|barrier|fanout|gate] [--o <plan.json>] | validate <plan.json> [--json] | render <plan.json> --o <script.js> [--check] [--force] | blobs [--check]   # loop-plan/1 authoring (the ADR-005 templates are retired)
dz workflow run      <plan.json> [--run-id <id>] [--resume <runId>] [--arg k=v]... [--coder-family codex|claude] [--default-family codex|claude] [--budget <n>] [--max-wall-clock <s>] [--stage-timeout <s>] [--budget-extra <n>] [--wall-clock-extra <s>] [--run-dir <dir>] [--allow-same-family-qe] [--json]   # INTERPRET the plan without the Claude host; exit 0/1/2/75 (75 = typed pause)
dz workflow-lint     <script.js> [--plan <plan.json>] [--require-plan|--legacy] [--json]   # 18-rule deterministic gate; exit 0/1/3 — inconclusive is never a pass
dz workflow-trace    <runDir|--slug <s>|--run <id>> [--invariants <plan.json>] [--html <out.html>] [--json]   # timeline + SEQ invariant runner over the loop's own trace.jsonl
dz workflow-trace export <run> --o <file> [--include-pairs --yes] [--strict]   # one run's telemetry as ONE movable file
dz workflow-trace import <bundle> --into <root> [--force] [--with-pairs]       # reconstruct that run; fail-closed against clobbering
dz plugin            [--version <ver>]
dz downloads
dz migrate           [--project <dir>]
dz stats
dz dashboard
dz doctor            [--project <dir>]
dz roam              [--apply] [--slug <slug>]
dz import-ecc       [--local-path <dir>] [--select id,id,...] [--limit N] [--output <dir>] [--force]
dz help
```

### Optional class form for a taught lesson

`dz teach` can store the observed lesson and an explicitly proposed class template in the same
invocation. The class half is optional: omission, a blank value, or syntactic rejection leaves the
specific write successful and unchanged.

```bash
dz teach "Use Jira labels for release gates" --class-form "Use :field labels for release gates"
dz recall "Use GitHub labels for release gates"
# ... specific: Use Jira labels for release gates · class: Use :field labels for release gates [match: class]
```

Use the class form when a future reader needs the *why* across structure, interfaces, or
maintainability. Skip it when scope, risk, time, and cost are low, or standards, policy, or existing
documentation already cover the choice. `dz` checks only that the `:slot` template syntactically
covers the specific text; it does not certify that the broader rule is true.

The store keeps two linked, role-labelled rows (`lessonForm` + `lessonPairId`), while ranked recall
returns one logical lesson with separate `pattern`/`classForm` fields and
`matchedForm: specific|class|both`. The vector mirror remains specific-text-only in this tranche;
class attribution comes from the durable lexical path, so a vector score is never mislabeled as a
class match.

**Closeness, not a rank surrogate (feature `recall-true-closeness`).** Each hit now carries `sim=` —
the semantic leg's real cosine — with `▲` above the measured relevance floor for the query's language
and `▽` below it (ru 0.38 / en 0.31, calibrated 2026-07-09 on a 32-probe labeled set). A lexical-only
hit, and any engine whose score is not a cosine, shows `sim=—`: substituting a differently-scaled
number is the lie this replaced. Before this, `relevance` in `--json` was an RRF RANK surrogate —
MEASURED, the top hit scored `0.0164` for a meaningful query and for nonsense alike, so no threshold
was possible.

Two axes, never merged: the leading `[0.86]` is the lesson's own reward (what it earned), `sim=` is
closeness (whether it is about what you asked). **The list is still ordered by rank plus learning
signals, so the `sim` numbers will legitimately appear out of order** — that is not a bug, and a
reader who re-ranks by hand loses the evidence signal. When nothing clears the floor the tool says so
once, in words, instead of leaving five ▽ rows to read like five answers. Lessons print at 160
characters; `--full` prints them whole, still one line per hit.

Honest limit: the floors were calibrated on a 103-pattern store and this one holds 277. MEASURED
2026-08-24 — a nonsense query still produced one `▲` at 0.33 against the 0.31 English floor. The
number now makes that visible; recalibration is filed separately.

**The apply leg now records itself (feature `recall-records-itself`).** MEASURED 2026-08-24: `dz
recall` wrote NOTHING to `.dz/recall-usage.jsonl` — 1106 rows before a real call and 1106 after — so
"how many lessons were recalled" was underivable, and the pipeline banner asserted a hardcoded
`--recalled 3` at three call sites instead of a number anyone could check. Every recall with a
measured closeness now appends a row carrying that cosine.

Only measured hits are recorded, and the gap is PRINTED rather than hidden: the log's `score` is
defined as cosine relevance and its validator requires a finite number, so writing an RRF rank there
would mix two scales in one field — the exact lie the closeness work removed from the display. A run
that records fewer rows than it showed says so, with the reason. A project with no vector tier
records nothing, and its output is unchanged.

PRIVACY, stated plainly: the row carries the query text, exactly as the recall-hook rows already do.
`.dz/` is gitignored and this store is prompt-class private by policy — the same protection, the same
file, now with your interactive queries in it too.

## Global: `dz --version` / `-v` / `dz version`

```bash
dz --version          # 0.4.8
dz --version --json   # {"name":"dz","version":"0.4.8","node":"v22.22.0","schemas":{"loopPlan":"loop-plan/1"}}
```

One line, exit 0. Unresolvable ⇒ the literal `unknown` and exit **1** — never a fabricated number,
and never a zero exit for "I could not tell you".

This is a pre-dispatch GLOBAL FLAG, not a 67th command: the count above is unchanged, and a test
derives it from the rendered `dz --help` command list so a reformat cannot move it silently.

**Why it exists.** `dz --version` used to print the entire USAGE manual and exit 0 (MEASURED
2026-08-17 on 0.4.5 — reproducer: `node dist/bin.js --version` before this change). Any wrapper
guarding a version range — `@dzhechkov/loop-designer-plugin` is the first — would read exit 0 as "it
answered me" while finding no version to parse, and then call a possibly-stale binary. Recognised
only as the FIRST argument, so a later positional `-v` still belongs to its subcommand.

## `dz skills-verify` also sees SLASH COMMANDS now

```bash
# does a plugin's skill AND its five commands actually register?
dz skills-verify --dir /tmp/probe --plugin-dir packages/@dzhechkov/loop-designer-plugin \
  --expect loop-designer:loop-plan-author \
  --expect-commands loop-designer:init,loop-designer:validate,loop-designer:render,loop-designer:lint,loop-designer:trace
```

- `--plugin-dir <dir>` loads a plugin into the probe session (session-scoped, no marketplace). With
  no `--expect-commands`, the expectation DEFAULTS to the manifest's own `commands[]`; an unreadable
  manifest is refused rather than defaulted to an empty (vacuously passing) expectation.
- `--expect-commands a,b` names the slash commands that must appear in the authoritative listing.
- An **absent** `slash_commands` key is `inconclusive`, never an empty list — schema drift and "your
  commands did not load" are different facts and must not be collapsed.
- `--static` now also PRINTS its advisories. A `.claude-plugin/plugin.json` under `.claude/skills/`
  previously produced `no layout problems found` and nothing else; the shape most likely to be a
  silent non-registration was invisible in the mode CI runs. It is reported, and still never fatal.

### Grounding: three tiers + the token trade-off (`dz brain ground` / `dz brain expand`)

The `dz brain ground` hook fires on **every turn**, so what it injects is a token trade-off. There are
three tiers — the default costs nothing extra every turn, and expansion is always opt-in and bounded:

- **Pointer (default, no flags)** — one compact `[Kn] book гл.N с.X–Y — name: snippet` line per KU.
  Zero overhead every turn. Backward-compatible (byte-identical to prior releases). A pointer tells the
  model *where* the knowledge is, not *what* it is.
- **Model-driven expand (`--budget N > 0` or `--full`)** — the grounding directive additionally tells
  the model it can pull any citation's FULL content **on demand** by running `dz brain expand <kuId>`.
  Each citation shows its `kuId` as the first field so the model knows what to pass. Cost: ~1 directive
  sentence + a `kuId` per citation — latency is paid only when the model actually expands a KU.
- **Budgeted eager (`--budget N`)** — eagerly inlines the full `content` of the top-K KUs within ~N
  tokens (approximate: chars/4 for Latin, chars/2 for Cyrillic — a multilingual tokenizer emits ~2
  tokens per Cyrillic char, so a naive chars/4 would undercount Russian content and overshoot the
  budget). KUs are worth-ranked (high → medium → **unset → low**: an explicit `low` ranks below an
  unrated KU). A KU whose content would overflow the budget **stays a pointer** (never truncated — atomic KUs). `--full`
  = `--budget 8000` (inlines everything the top-K recall holds in practice). `--budget 0` / absent =
  pointers-only (the default).

```bash
# The model can turn a citation like `ddia-ch05-ku01 (с.188–189)` into the actual knowledge:
dz brain expand ddia-ch05-ku01           # prints name, problem, pages, book + FULL content
echo "how do I handle replication lag?" | dz brain ground --budget 2000   # eager-inline top KUs ≤ ~2000 tokens
```

### Live self-learning panel (`dz statusline`)

`dz statusline` renders a compact Claude Code statusline that surfaces dz's learning at a glance:

```
🎓 dz: 12 patterns · 🧠 3 sources
```

`N patterns` is the count of learned patterns in memory; `M sources` is how many brain sources
(book-KBs / grounding stores) are wired. Enable it once:

```bash
dz statusline --install    # wires it into .claude/settings.json → statusLine
dz statusline --json       # emit the raw payload for custom status tooling
```

Claude Code then refreshes the panel in real time, so the pattern count climbs as `dz consolidate`
distills new learnings. It's **opt-in** and **non-clobbering**: `--install` merges into your
existing `statusLine` config rather than overwriting it, and nothing changes until you run it.
Modeled on the Agentic QE statusline pattern (e.g. AQE's `🎓 12 patterns`).

#### Live run segment — `dz statusline --fa-record`

A long-running pipeline can PREPEND its own segment to that line, so the bar shows what is in
flight rather than only the standing pattern count. The `/feature-adr` pipeline records its
Pattern-memory state at each step; a generated `loop-designer` loop records its current step on
every trace flush:

```bash
# the /feature-adr pipeline — reports the learning loop it is actually running
dz statusline --fa-record --slug add-user-auth --step "Step 8 QE" --recalled 7 --stored 2 --mode full

# a generated loop — same file, different producer, so it says so
dz statusline --fa-record --slug my-loop --step build --kind loop
```

```
📐 feature-adr Step 7 Code · ⏱ ~25–47м (p25–p75 по n=5 ранам M; окно 2026-08-24–2026-08-29) · 🎓 224 pool · ↑7 used · +2 new · ↻0 reinforced · 🎓 dz: 224 patterns · 🧠 3 sources
📐 feature-adr Step 8 QE · ETA: недостаточно истории (n=2 L; окно 2026-08-28–2026-08-29) · 🎓 224 pool · ↑7 used · +2 new · ↻0 reinforced · 🎓 dz: 224 patterns · 🧠 3 sources
🔁 loop build · 🎓 dz: 224 patterns · 🧠 3 sources
```

For a live `/feature-adr` run, the panel derives remaining-stage timing from timestamped
`features/*/.fa-state/checkpoints.jsonl` runs of the **same tier**. Every estimate prints its
evidence basis: distinct-run `n`, tier, and date window. A Codex-shaped `code` leg always renders
as p25–p75 rather than a false-precision point. The floor is three runs for **each** remaining
`(tier, stage)` bucket; one thin bucket makes the whole result `ETA: недостаточно истории` instead
of silently shortening the sum. Missing/unreadable checkpoints omit ETA, never `~0м`, and never
take down the rest of the statusline. `dz statusline --json` includes the typed `eta` verdict for
custom tooling whenever the live run has enough checkpoint identity to evaluate it.

`--kind <feature-adr|loop>` names the PRODUCER and defaults to `feature-adr`; an unrecognised value
exits 1 rather than silently weakening panel arbitration. It is load-bearing in two places:

- **the label**: a loop renders `🔁 loop <step>` and shows **no** learning counters, because a loop
  never populates them — a `↑0 used` there would be a false statement about the Pattern-memory loop
  rather than a measurement of it;
- **the arbitration**: each producer writes its own per-slug slot under
  `.dz/feature-adr/learning-state/`, and a fresh `feature-adr` state outranks any `loop` state, so a
  loop running alongside a live pipeline can no longer blank that pipeline's counters. Slots are
  discovered newest-first, nothing older than 30 minutes is surfaced, and the write path prunes at
  24 h. Use `--project <dir>` to pin the panel to a specific project root.

### Usage estimate (`dz usage`)
> **Pin the weekly reset to an ABSOLUTE instant.** `weeklyResetAnchor: "Wed 08:59"` is
> server-timezone-relative — measured: the same moment lands a week apart under UTC vs `+03:00`, so
> after a real account reset the counter can keep showing the OLD week for hours while printing the
> "correct" clock time. Add your offset: `"Wed 08:59 +03:00"` in `.dz/config.json` — the boundary
> then never moves with the machine's timezone, and `dz usage` prints the full anchor
> (`resets Wed 08:59 +03:00`). Without an offset it warns on every run.


`dz usage` prints a READONLY, never-throw ESTIMATE of Claude SESSION and WEEKLY token usage,
aggregated from your local `~/.claude/projects/**/*.jsonl` transcripts. Weekly counts start at the
configured fixed local anchor (`memory.usage.weeklyResetAnchor`, for example `Wed 08:59`). Session
counts use the active fixed-length transcript block (`memory.usage.sessionBlockHours`, normally `5`).

```bash
dz usage           # session ~74% (resets 19:00) · week ~76% fable-bound (resets 08:59) · estimated
dz usage --json    # {"sessionPct":74,"weeklyPct":76,"sessionTokens":...,"weeklyTokens":...,"resetsAt":{...},"limits":{...},"estimated":true}
```

**Exit code is 0 ALWAYS** (even unconfigured/error → all-null JSON) — a probe must never distinguish
"usage unknown" from "command failed" via a non-zero exit. Percentages are **ESTIMATES** from local
transcripts; claude.ai/settings/usage is authoritative. They are `null` until you configure the
plan-dependent limits in `.dz/config.json`:

```json
{
  "memory": {
    "usage": {
      "sessionTokenLimit": 200000000,
      "weeklyTokenLimit": 1000000000,
      "weeklyResetAnchor": "Wed 08:59",
      "sessionBlockHours": 5,
      "weeklyTokenLimitByModel": { "fable": 500000000 }
    }
  }
}
```

`sessionTokenLimit` and `weeklyTokenLimit` are optional; absent means that pct is `null` (unknown,
never `0`). `weeklyTokenLimit` is the all-model weekly limit. `weeklyTokenLimitByModel` is optional;
when it has at least one valid model limit (`fable`, `opus`, `sonnet`, or `haiku`), `weeklyPct` is the
binding per-model percentage and `--json` adds:

```json
{
  "weeklyByModel": { "fable": { "tokens": 380, "pct": 76 } },
  "limits": { "session": 200000000, "weekly": 1000000000, "weeklyByModel": { "fable": 500 } }
}
```

When no per-model limits are configured, the JSON shape stays at the legacy fields:
`sessionPct`, `weeklyPct`, `sessionTokens`, `weeklyTokens`, `resetsAt`, `limits`, `estimated`.

Calibrate from human-transcribed claude.ai percentages with one command:

```bash
dz usage --calibrate --session 20 --weekly 50 --model fable=76 --project .
```

It computes each limit as `currentTokens / (pct / 100)`, writes only `memory.usage` in
`.dz/config.json`, and records `calibratedAt` plus `source: "claude.ai/settings/usage"`. Invalid
percentages, unknown models, missing transcripts, and zero-token calibration requests are skipped with
exit code `0`.

This feeds `/feature-adr`'s **usage-adaptive routing** — the pipeline probes `dz usage --json` at each
phase boundary and pre-emptively routes the remaining stages to Codex when `sessionPct` or the binding
`weeklyPct` crosses the threshold (default 70%). **Honest caveat:** at TRUE exhaustion even the Codex
dispatch dies (`codex:codex-rescue` is a Claude wrapper), so the switch must happen BEFORE — the
pre-emptive probe, not reactive detection, is the real defense.

### Claim check (`dz claim-check`)

**Why you want this.** Docs accumulate numbers nobody can reproduce — things like `99% accuracy`,
`10× faster`, `100% coverage` — and an AI agent writing your README is especially good at inventing
them. A rule like *"no fake claims; verify before claiming success"* enforced only by discipline
eventually loses. This makes it a runnable check with an exit code.

**What it does.** Every quantitative claim (coverage, test/skill/command counts, benchmarks) must be
tagged `MEASURED` / `CLAIMED` / `SYNTHETIC` / `ESTIMATED` / `UNVALIDATED` / `BASELINE`, and a
`MEASURED` claim must name its reproducer (`npm test`, a coverage report, `npm view`, a git ref).
A `100%` or `perfect` framing is always high severity — it is the claim most likely to be untrue.
(The backticks are load-bearing: this paragraph quotes the claims it forbids, and a backticked
literal reads as code, not as an assertion.)

So `coverage 92%` is flagged; `coverage 92% (MEASURED — npm test)` is not. `2136 tests` is flagged;
a shields.io badge URL is not (the URL is machinery, not prose). A number inside backticks still
counts: ``accuracy reached `0.95` `` is a claim.

```bash
dz claim-check                       # scans root README, every package README, features/*/08_qe_report.md, docs/**/*.md
dz claim-check docs/perf.md --json   # {"ok":false,"findings":[…],"scanned":[…]}
dz claim-check --fail-on medium      # stricter gate for CI
```

**Exit-code contract:** `0` when ok; `1` only when a finding at or above `--fail-on` (default `high`)
exists. `--json` always emits valid JSON, even on the failure path, and never throws on an
unreadable, binary, or missing file — those are skipped and reported in `scanned`.

`dz publish` runs the same check over each package's README. The gate defaults to `warn`: findings
are surfaced but publish status is **never** changed. Pass `--claim-check error` to fail a package
that carries a high-severity claim, or `--claim-check off` to disable it.

```bash
dz publish --filter harness-cli                      # warn (default): prints "⚠ claim-check: N finding(s) (M high)"
dz publish --filter harness-cli --claim-check error  # a high finding fails THIS package only
dz publish --filter harness-cli --claim-check off    # disable the gate entirely
```

#### From Claude Code — just ask in plain language

There is no slash command: `dz` is a CLI, and the agent runs it for you.

> "Проверь наши README на непроверяемые утверждения перед релизом"
>
> "Run dz claim-check and fix the high findings by tagging them MEASURED with a reproducer"
>
> "Before we publish, make sure no doc claims 100% of anything"

Claude runs `dz claim-check --json`, reads the findings, and edits the offending lines. Two habits
worth asking for explicitly: **do not silence a finding by deleting the number** (a claim you cannot
reproduce should be removed or downgraded, not hidden), and **do not weaken the rules** to make the
gate green.

#### Authoring-time hook — catch a claim WHEN IT IS WRITTEN

The CLI and the `dz publish` gate both fire *after* a false claim is already on disk. The
authoring-time hook closes that gap: it is a Claude Code **`PreToolUse` hook** that runs the same
`claimCheck` engine over the Markdown text an agent is *about to write*, **before the `Write`/`Edit`
lands**, and surfaces the findings to the agent so it can self-correct in the same turn.

- **Scope.** It runs only on `Write` / `Edit` / `MultiEdit` whose `file_path` ends in `.md`.
  Everything else exits immediately at zero cost.
- **Severity policy.** `medium` findings (untagged counts — the exact failure class the publish
  gate misses, because publish defaults to `--fail-on high`) are surfaced as a **warning** the agent
  sees; they never block. `high` findings (the `100%` / `perfect` framing) warn **loudly** — and the
  message always teaches the escape below — but **do not block by default**.
- **Never blocks.** A broken, slow, or misfed hook can never stop you working: malformed input, a
  missing field, an unresolvable engine, or any exception all resolve to a silent no-op. The default
  policy has no code path that denies a write.
- **Opt-in strict mode.** Set `DZ_CLAIM_CHECK_HOOK=deny` to let a `high` finding actually block a
  write — but even then it is doubly guarded: it fires only on a **new** claim line that is **not**
  inside a fenced code block, so editing around pre-existing text is never blocked.

**The backtick escape (important when you write docs about honesty).** Honest documentation
sometimes has to *quote* a forbidden claim as an example of what not to write — this very section
does. Wrap the literal in backticks: a backticked `` `100% coverage` `` reads as a code literal, not
an assertion, and is not flagged. That is the sanctioned fix; **do not weaken the checker** to quiet
a quotation.

**Enable / disable.** The hook is wired via one additive `PreToolUse` group in
`.claude/settings.json` (command: `node ".../.claude/helpers/claim-check-hook.cjs"`). Remove that
group to disable it. It is also inert automatically if `@dzhechkov/harness-core` cannot be resolved,
so it never breaks a checkout that hasn't built the package.

> **Plain-language scenario.** You ask Claude to write this package's README and it drafts a line
> asserting a bare `100% coverage` claim. Before the `Write` lands, the hook runs `claimCheck` and
> you see a warning: this is the retracted all-passing framing — either state a `MEASURED` number
> against a baseline (naming a reproducer like `npx vitest run`), or, if you are only quoting it as
> an example, backtick the literal. Claude backticks it and the write proceeds — no block, no thrash.

#### In CI

```bash
dz claim-check --fail-on high || exit 1     # block a release on a "100%" claim
```

Ported from rUv's [`ruview`](https://www.npmjs.com/package/@ruvnet/ruview) `src/guardrails.js` (MIT),
which was itself written after a documented AI-slop incident. The detection semantics are kept
verbatim — including a deliberately `\b`-free `100%` regex that looks like a bug and is not.

#### What the default scan set covers — and why history is excluded

Published docs (the root README, every package README), live guidance (`docs/**/*.md`), and the QE
reports that grade **current** work (`features/*/08_qe_report.md`).

Deliberately **not** the rest of `features/**` — completed ADRs, audit reports, shipped requirements.
Those are historical records: they fix what was decided and what was found, *including past dishonesty*.
Scanning them pressures an author to rewrite history so a counter goes green, which is the exact
substitution this gate exists to prevent. When we tried the wider set, an agent immediately backticked
genuine `100%` claims across 13 historical documents to silence them — and the gate flagged an audit
report for **quoting** the overstatement it had caught.

Scan history deliberately by naming it: `dz claim-check features/my-feature/03_adr/001-decision.md`.

The unsolved prerequisite for ever widening the default: the engine cannot tell a **quotation** of a
forbidden claim from an **assertion** of one.

### Prose style lint (`dz lint`)

`dz lint` covers the lexical layer that claim-check and semantic voice review do not: dense clusters
of registered stock wording in English or Russian, walls of short bullet items, and registered
three-adjective stacks. Lexical density is `100 × markerCount / max(visibleWords, wordFloor)` within
one paragraph; a single legitimate use such as `robust parser` stays below the two-distinct-marker
floor. Under the default `4`/`2`/`25` policy, that floor decides paragraphs through 50 words and
density rejects diffuse clusters from 51 words onward. Fenced/inline code, link targets, frontmatter,
HTML tags, blockquotes, and explicitly labelled bad examples are excluded.

```bash
dz lint                         # root/package READMEs, sitedoc Markdown/MDX, recognized feature courses
dz lint README.md docs/page.mdx # explicit deterministic scope
dz lint --json                  # dz-slop-lint/1 envelope for CI
dz lint --config policy.json --registry markers.json
```

Findings are advisory and exit `0`; a valid empty default/directory scope is a clean no-op. Malformed
UTF-8, missing/unreadable policy data, unsupported explicit inputs, or a supported input file with no
analyzable prose exit `1`; valued-flag usage errors exit `2`.
This command does not call or change `claim-check`, `guard`, or `publish`. It catches literal wording
and simple structure, not whether a voice sounds natural in context; semantic voice review remains a
separate judgement layer. The bundled registry is intentionally small, versioned, bilingual, and
repository-authored; `--registry` and `--config` replace it only after complete validation.

#### What is NOT a claim

Four things are deliberately out of reach, so the gate flags authors who were dishonest rather than
authors who wrapped a line:

- **Anything inside a fenced code block.** A fence is the block-level form of the inline backtick
  escape. `# accuracy 99%` inside a fence will not be flagged — and neither will a CLI example.
- **A percentage that exists only inside backticks.** Quoting a forbidden claim as an example is how
  honest documentation is written.
- **The tag may live anywhere in the same paragraph** as the claim, so a `MEASURED` that wrapped onto
  the next line still counts. It cannot cross a blank line, a heading, or a fence — that boundary is
  what stops a distant tag from laundering an untagged number.
- **`recall` alone is not a metric here** — it is a command name. It counts only in a scoring context
  (`precision 0.9 / recall 0.8`, `recall@5`, `recall rate`, `recall of 0.9`).

A reproducer must be **structural**: a backticked command (`` `ps -o pid,etime` ``, `` `npm test` ``,
`` `time dz recall …` ``). The bare word *reproducer* is self-certifying and never passes.

**Honest note:** run on this repo it reports hundreds of medium findings and a handful of high ones
(reproducer: `dz claim-check --json`, which prints the exact current counts — deliberately not frozen
into this README, since any doc edit moves them). That is the point of the tool, not a defect in it:
the high findings are real untagged perfect-score claims in our own documentation.

### Targets (10 platforms — 5 lossless + Copilot + AGENTS.md + Cursor + Gemini + Windsurf)

Five platforms natively support the [agentskills.io](https://agentskills.io) `SKILL.md` format:

| Target | Skills file | Native SKILL.md? |
|--------|-----------------|:---:|
| `claude-code` | `.claude/skills/` | Yes |
| `codex` | `.agents/skills/` | Yes ([docs](https://developers.openai.com/codex/skills/)) |
| `opencode` | `.opencode/skills/` | Yes (also scans `.claude/skills/`) |
| `hermes` | `.hermes/skills/` | Yes |
| `openclaude` | `.openclaude/skills/` | Yes |
| `agents-md` | `AGENTS.md` (merged) | flattened, not a tree |
| `cursor` | `.cursor/rules/*.mdc` | per-skill `.mdc`, YAML frontmatter (`.md` ignored) |
| `gemini` | `GEMINI.md` (merged) | flattened, not a tree (Gemini CLI / Code Assist) |
| `windsurf` | `.windsurf/rules/*.md` | per-skill `.md`, YAML `trigger` frontmatter (Windsurf) |

Same SKILL.md file, different directory — no format conversion needed.

The **6th target — `copilot`** (GitHub Copilot) — is an intentionally *lossy* adapter that emits `.github/instructions/<id>.instructions.md` instead of a skills tree.

The **7th target — `agents-md`** compiles ~15 AGENTS.md-reading tools (Zed, Warp, Aider, goose, Gemini CLI, RooCode, Kilo, Junie, Trae, Augment, Devin, pi, Windsurf) into a single merged root `AGENTS.md`. It **merges** (preserves user `AGENTS.md` content, owns a fenced block) and is lossy/flattening — no per-skill frontmatter, no directory tree.

The **8th target — `cursor`** compiles **per-skill** to `.cursor/rules/<id>.mdc` (one file per skill, YAML frontmatter `description`, `globs`, `alwaysApply`). Plain `.md` files in `.cursor/rules/` are **ignored** by Cursor — the extension must be `.mdc`. Unlike `agents-md`, this keeps per-skill boundaries and glob-scoped activation.

The **9th target — `gemini`** compiles the selected skills into a single merged root `GEMINI.md` for the **Gemini CLI** and **Gemini Code Assist** (loaded hierarchically: `~/.gemini/GEMINI.md` → workspace → subdir). It is `agents-md` with a different filename — it **reuses the same fenced-block merge**, so it preserves any user-authored `GEMINI.md` content and is idempotent; lossy/flattening (plain Markdown, no per-skill frontmatter, no tree). Example: `dz init --target gemini --select design-thinking`.

The **10th target — `windsurf`** compiles **per-skill** to `.windsurf/rules/<id>.md` (one plain-Markdown file per skill) with Windsurf's YAML frontmatter: an activation `trigger` (`always_on`/`manual`/`model_decision`/`glob` — dz emits `model_decision`), a `description`, and an optional `globs`. It is essentially `cursor` with a different directory + a `.md` extension (Windsurf reads plain `.md`, not `.mdc`) + a `trigger` key instead of `alwaysApply`; per-skill and intentionally *transforming* (excluded from the byte-identical equivalence suite, loss surfaced as a warning). Some Windsurf/Devin builds also read `.devin/rules/` — out of scope; dz emits only `.windsurf/rules/*.md`. Example: `dz init --target windsurf --select design-thinking`.

**Optional platform enrichment** (skills work without these):

| Platform | Optional extra | What it adds |
|----------|---------------|-------------|
| Codex | `agents/openai.yaml` | UI metadata (icons, display_name, MCP deps) |
| OpenCode | `opencode.json` + `.opencode/agents/*.md` | Config, custom agents |
| Hermes | `cli-config.yaml` | Agent config, persona, memory |

### Workflows (Opus 4.8+ dynamic workflows)

```bash
dz workflow --task coverage-lift     # parallel coverage improvement
dz workflow --task mutation-kill     # kill surviving mutants
dz workflow --task canonicalize      # canonicalize new packages
dz workflow --task security-audit    # adversarial security scan
```

### Scout (ecosystem intelligence)

```bash
dz scout                              # quick scan — radar mode
dz scout --deep                       # deep analysis — AI analyst mode
dz scout --topics mcp-server,ai-agent # custom topics
dz scout --since 2026-05-01           # only recent repos
```

**Radar mode** (`dz scout`) scans **11 sources** in parallel (GitHub + npm + HN + MCP Registry + Glama + OSSInsight + Smithery + Semantic Scholar + arXiv + ECC + AgentBox):
1. **Detects skill format** — SKILL.md, plugin.json, .claude/skills/, .claude-plugin/, MCP manifests
2. **Scores relevance** — format (40%) + stars (30%) + recency (20%) + novelty (10%)
3. **Compares against our 46 packages** — finds skills we don't have
4. **Recommends** — integrate (score ≥70) / monitor (40-69 + ≥50 stars) / skip

**Deep analyst mode** (`dz scout --deep`) goes further for top-scored repos:
1. **Downloads SKILL.md** from each repo, parses frontmatter + body
2. **Finds closest match** in our inventory by keyword overlap
3. **Explains the delta** — what the found skill adds that ours doesn't
4. **Recommends integration path:**
   - **canonicalize** — high-signal novel skill → new `@dzhechkov/skills-*` pack
   - **merge** — similar to existing skill → add unique features to ours
   - **new-preset** — novel skill → add to preset or create new pack
   - **skip** — already in our inventory
5. **Gap analysis** — identifies trending categories across the ecosystem that our harness lacks

Example deep analysis output:

```
## 🔬 Deep Analysis

### cool/agent-toolkit (★500)
2/3 skills are novel

| Skill | Description | Closest match | Integration | Rationale |
|-------|------------|---------------|-------------|-----------|
| code-review | Automated OWASP-focused review | brutal-honesty-review | **merge** | Similar to ours — merge OWASP checklist |
| deploy-check | Pre-deploy validation gates | — | **canonicalize** | High-signal novel skill (500 stars) |

## 📊 Harness Gap Analysis

| Category | Frequency | Recommendation |
|----------|-----------|---------------|
| deploy-automation | 12 repos | Create @dzhechkov/skills-devops — high demand |
| data-pipeline | 5 repos | Monitor — emerging trend |
```

Powered by [`@dzhechkov/scout`](https://www.npmjs.com/package/@dzhechkov/scout).

### BTO integration (create-skill --bto)

```bash
# Scaffold a new skill with BTO-compatible 3-layer evaluation:
dz create-skill --name my-skill --bto

# What you get:
#   evals/my-skill.yaml       — BTO eval with L0/L1/L2 layers
#   references/judge-rubrics.md — scoring rubrics for 3-judge panel
```

The `--bto` flag generates eval templates compatible with `/bto-test`:

| Layer | What | Gate |
|-------|------|------|
| L0 | Deterministic checks (U1-U5 universal + S1-S15 skill-specific) | Pass rate >= 80% |
| L1 | Single LLM judge (Haiku) — 5 dimensions: Clarity, Completeness, Actionability, Quality, Anti-patterns | Average >= 7.0 |
| L2 | 3-judge panel (Sonnet) — Expert (0.40), Critic (0.30), Auditor (0.30) — 5 dimensions: Methodology, Depth, Correctness, Usability, Robustness | Weighted avg >= 7.0 |

After scaffolding, fill in the SKILL.md protocol and run `/bto-test .claude/skills/my-skill` to evaluate.

### dz backlog — brain-backed idea inbox (smart backlog)

Throw ideas in as they come; the backlog dedups them semantically against everything you already
captured (via the same agentdb vector engine the Brain uses — no second store), scores them against
your goals, and picks what to work on when you have free time.

```bash
# 1. Capture an idea — it is instantly deduped + aligned
dz backlog add "add a compounding metric to strengthen dz recall" --effort 3
#   → [new]  e3  align 0.72   (or: [duplicate of 268d3cb1 @ cosine 0.95] / [related: …])
#   A RELATED/DUPLICATE verdict now names the pair, so you can calibrate the 0.92 band on real data:
#     dz backlog: RELATED — captured 67c5883e…
#       top match 9286f5eb… @ cosine 0.793 (DUPLICATE band ≥ 0.92)
#   Dedup is TWO-SIGNAL (register-inflation fix, measured on the real store): the embedding compares a
#   BOUNDED 400-char excerpt (full-length embeds of long same-register texts scored unrelated pairs up
#   to 0.9195 while true paraphrases of the same ideas scored 0.35–0.61 — the signal was inverted), and
#   a DUPLICATE verdict additionally needs shared subject vocabulary (lexical containment ≥ 0.3):
#     near-duplicate demoted: 977e9dcb… @ cosine 0.941 cleared the band but shares no subject
#     vocabulary (containment 0.077 < 0.3) — kept as related
#   The same containment signal works the other way too: a re-capture of an existing idea at a
#   different LENGTH (containment ≥ 0.95, cosine ≥ 0.75) is a duplicate even below the 0.92 band
#   ("subset match"). Knobs: backlog.dedup.{corroborationFloor,subsetContainment,subsetCosineFloor}
#   in .dz/config.json. On first use after the fix the mirrored idea vectors are re-embedded once into
#   the bounded form ("re-embedded N idea vector(s)…"); a DUPLICATE absorption also keeps the full
#   incoming text in .dz/backlog/absorbed.jsonl, so a wrong verdict is reversible (re-add from there).
#   An out-of-scale --effort is ECHOED, never silently clamped:
dz backlog add "an idea I mis-scaled" --effort 13
#   → dz backlog: effort 13 → clamped to 5 (scale 1-5)
#   The first capture also gitignores its own store (`.dz/backlog/` — raw ideas are private): it adds
#   the entry only when no existing rule covers it (`/.dz/`, `.dz/**`, … all count), the write is atomic
#   and keeps the file's line endings, a `!.dz/backlog/` negation is obeyed as an explicit opt-out, and a
#   FAILED scaffold is announced ("your ideas are visible to git") rather than passing in silence.

# 2. Define your goals once ("map + compass") — alignment is scored against these
dz backlog goals            # opens/creates .dz/backlog/goals.json; --validate checks it
dz backlog goals --validate # a malformed entry is WARNED about, never silently dropped:
#   → dz backlog goals: WARNING goal[0]: missing "statement" — dropped
#     dz backlog goals: INVALID  (exit 1 when every entry was dropped — an empty compass is not "valid")
#   A repaired field is reported with the value YOU wrote, not the clamped one the runtime uses:
#   → dz backlog goals: WARNING goal[0] (g1): weight 7 is out of (0,1] — using 1

# 3. When you have free time — spin the roulette (weighted: alignment^α · recency · 1/effort)
dz backlog roulette --seed 7
#   → 268d3cb1 — add a compounding metric …  align 0.72 · effort 3
#     (start it with: dz backlog roulette --commit 268d3cb1)

# 3b. Start it — --commit takes the id you were SHOWN (a bare --commit is refused: the pool can change
#     between spins, so the spin must not decide a mutation). An id ALONE never mutates — a spin is
#     read-only, and the --commit flag is the only thing that authorises a status change.
dz backlog roulette --commit 268d3cb1   # → 268d3cb1 · → in-progress
dz backlog roulette 268d3cb1            # → refused (exit 1): "an idea id alone does not start it"

# 3c. FINISHED the work? Say so — or the roulette keeps re-drawing it forever. Most work happens
#     WITHOUT a --commit (spin, see the pick, just do it), so `ship` is the verb that closes the loop.
#     Short 8-char prefixes (what the roulette prints) resolve if unique; ambiguous/unknown = loud
#     exit-1 error, never a silent no-op. Batches are all-or-nothing.
dz backlog ship 268d3cb1 --reason "shipped in harness-core 0.3.151"
#   → dz backlog ship: 268d3cb1… new → shipped  add a compounding metric …
#   (shipping an already-shipped idea is a SAID no-op, exit 0 — safe in cleanup batches)
dz backlog drop 9286f5eb --reason "superseded by 268d3cb1"    # retire without shipping (→ dropped)
dz backlog edit 9286f5eb --text "corrected wording"           # rewrite ONE idea's text; every other field

# feed the learned auto-cost routing from REAL run telemetry, then read its advice
dz routing recommend                # per-stage args.models suggestion, printed WITH its basis:
                                    # n runs, the time window, the grade-floor rule (success ⇔ QE grade ≥ B,
                                    # attributed run-level — an inference, and it says so), and every skipped
                                    # record with WHY. qe is FORCED to the cross-family of the code pick —
                                    # a same-family qe recommendation is unrepresentable, not filtered.
                                    # A `store:` line always says current / STALE / UNFED and names
                                    # the remedy; JSON carries basis.freshness + basis.unfed.
dz routing recommend --apply        # feed the samples into .dz/routing-outcomes.json (the store the
                                    # `auto-cost` plan spec reads) — idempotent by runId: a second apply
                                    # feeds 0 and names the skipped runs. Insufficient data is SAID
                                    # (cold-start pick + escalation chain), never dressed as a bar-met pick.
                                    # `dz guard --op publish` warns SOFT as routing-store-stale when
                                    # harvested runIds are still missing from that store.
                                                              # (status, effort, goal, uses…) is preserved byte-for-byte,
                                                              # the previous text lands in .dz/backlog/edits.jsonl, and the
                                                              # dedup vector is re-embedded in the same bounded form.
                                                              # If the re-embed FAILS the edit still lands, exits 1, and the
                                                              # record is MARKED embedStale — dedup then refuses to trust its
                                                              # similarity (exact-text identity still applies) until
                                                              # `dz vector reindex` repairs it. The guard sits where the harm
                                                              # would be (the future duplicate verdict), not in a warning
                                                              # nobody re-reads. --append adds instead of replacing; --dry-run previews.
dz backlog reopen 268d3cb1                                    # changed your mind → back to the pool (new)
#   reopen on an already-new idea is REFUSED (exit 1) — that is almost always the wrong id.
#   Terminal→terminal never happens silently: ship on a dropped idea (or drop on shipped) is refused;
#   go through reopen first. --dry-run previews any of the three without writing.

# 4. Work it: stage an idea2prd hand-off (writes the PRD-pipeline input scaffold)
dz backlog enrich 268d3cb1  # → features/<slug>/ scaffold; run the idea2prd-manual skill on it

# 5. Or push it to Jira via the configured adapter (jira-mcp | copilot-mcp | none)
dz backlog jira 268d3cb1    # 'none' (default) writes an auditable .dz/backlog/jira-outbox/<id>.json

# Housekeeping: cluster near-duplicates (dry-run by default; --apply prunes vectors too)
dz backlog harmonize --apply
```

When to use: any time an idea strikes mid-work — capture beats context-switching. Without the
agentdb memory backend installed the dedup honestly degrades to exact-text and alignment to 0
(`dz setup --memory agentdb` enables the semantic tier).

### dz install — install skills from any npm package

```bash
# Install skills from any npm package directly
dz install @dzhechkov/skills-devops
dz install @dzhechkov/skills-web3 --target openclaude
dz install @lythos/skill-curator --target claude-code
dz install @dzhechkov/skills-analyst-manual        # npx-init pack — works too
```

Runs `npm install`, resolves where the package keeps its skills, and compiles them into the
target platform directory. Works with any agentskills.io-compatible npm package, in **any of
the three known layouts** (probed in order, first non-empty wins):

| Layout | Skills live at | Example packs |
|---|---|---|
| `flat` | `<pkg>/<skill>/SKILL.md` | skills-devops, skills-qe, skills-ecc |
| `npx-template` | `<pkg>/templates/.claude/skills/<skill>/SKILL.md` | skills-analyst-manual, keysarium, skills-feature-adr |
| `skills-dir` | `<pkg>/skills/<skill>/SKILL.md` | health-advisor, evidence-wiki |

Real npx-init-pack run (captured):

```bash
$ dz install @dzhechkov/skills-analyst-manual
Installing @dzhechkov/skills-analyst-manual...
dz install @dzhechkov/skills-analyst-manual: 4 skill(s), 18 file(s) written, 0 skipped [layout: npx-template]
  analyst-manual-full: 1 written, 0 skipped
  explore: 3 written, 0 skipped
  goap-research-ed25519: 13 written, 0 skipped
  problem-solver-enhanced: 1 written, 0 skipped
  note: @dzhechkov/skills-analyst-manual also ships commands/hooks/agents — `npx -y @dzhechkov/skills-analyst-manual init` installs the full kit.
```

The `[layout: …]` tag appears for non-flat layouts so the resolution is observable; classic
flat packs print exactly what they always did. The `note:` line appears only when the pack
ships companion assets (slash commands, hooks) that `dz install` does not install — for the
full claude-code kit of such a pack, `npx -y <pkg> init` remains the richer path, while
`dz install --target codex|cursor|opencode|…` compiles the same skills for the non-claude
targets, which the pack's own installer does not do (MEASURED — its installer copies
`templates/.claude/**` only; reproducer: `src/utils.js` `COMPONENTS` in
`@dzhechkov/skills-analyst-manual`).

A package with **no** skills in any known layout now fails loudly — `exit 1` with the probed
paths named (MEASURED — reproducer: `npx vitest run test/install-layouts.test.ts`, case
T5.2; the pre-fix behavior was a misleading `exit 0` advisory):

```bash
$ dz install @dz/broken-pack
Installing @dz/broken-pack...
dz install: no SKILL.md found in @dz/broken-pack. Probed: ., templates/.claude/skills, skills.
If this package installs itself, try: npx -y @dz/broken-pack init
```

When to use: first install of any skills pack. If you previously hit
`no SKILL.md files found` on an npx-init pack (e.g. `@dzhechkov/skills-analyst-manual`) —
that resolver bug is fixed; `dz install` now handles those packs directly.

### dz sync-upstream — check for upstream updates

```bash
dz sync-upstream --list                                    # show packages with external sources
dz sync-upstream --all                                     # check ALL packages against upstream
dz sync-upstream --package packages/@dzhechkov/skills-devops  # check one package
```

Discovers all skill packs with `sources.json`, fetches SKILL.md from origin repos, reports which skills have upstream changes.

### dz agents-sync — Codex starts with the repository's bearing rules

Use this after changing an anchored policy clause in `CLAUDE.md` or `.claude/rules/*.md`, and run
the check form in CI. It updates only the `dz:policies` fence in the root `AGENTS.md`; authored
content and the independent `dz:skills` fence remain untouched.

```console
$ dz agents-sync
dz agents-sync: wrote — 9 policy section(s), 8097 bytes (24.71% of 32768)

$ dz agents-sync --check
dz agents-sync: in sync — 9 policy section(s), 8097 bytes (24.71% of 32768)
```

Exit codes are **0** for synchronized, **1** for drift and **3** when fixed source evidence is
missing or unreadable. `--check` never writes. Each section carries a 12-hex hash recomputed from
its source anchor; this proves synchronization only — not that Codex read or obeyed the rule. The
separate cold-start acceptance probe establishes runtime visibility.

### dz hooks-sync — Codex runs the same veto and recall hooks Claude Code does

**When to use it.** Once per machine, after `npm i -g @dzhechkov/harness-cli`, if you drive Codex as
well as Claude Code. It installs two hooks into the **user-global** `$CODEX_HOME/hooks.json`
(default `~/.codex/hooks.json`) and **arms** them — Codex hooks are trust-gated, and an untrusted
entry is silently never run. Re-run it after a dz upgrade; it is byte-idempotent, so an unchanged
install rewrites nothing and the hook keeps its trust.

```console
$ dz hooks-sync --target codex
dz hooks-sync: codex hooks installed and ARMED (trust: trusted) — VERIFIED by a live veto probe — ready

$ dz hooks-sync --target codex --check          # read-only, and it re-proves the guard fires
dz hooks-sync: codex hooks installed and ARMED (trust: trusted) — VERIFIED by a live veto probe — ready

$ dz hooks-sync --target codex --no-verify      # skips the probe — and can never say "ready"
dz hooks-sync: installed+trusted, NOT verified — ARMED = NO (trust: trusted, executable: true, verify: not verified (no live probe ran))

$ dz hooks-sync --target codex --remove
dz hooks-sync: removed 2 managed entr(ies) from /root/.codex/hooks.json
```

**"ready" means a command was actually blocked, in this run.** By default `dz hooks-sync` runs a
LIVE, nonce-scoped veto probe through `codex exec` in a hermetic workspace: it asks Codex to run one
forbidden command and requires BOTH halves of the evidence — dz's `DZ-VETO:` marker in the
transcript AND the absence of the command's side effect. `--dangerously-bypass-hook-trust` is never
passed, because a bypassed run proves the helper body works and nothing about the installed state.
Anything else — a silent transcript, a dead invocation, a timeout, a version mismatch — is
**inconclusive**, never ready. `--no-verify` skips the probe and is reported as unverified;
`--project <dir>` runs the probe in a project that has already opted into `"shellVeto": "block"`
instead of the hermetic workspace.

Exit codes are **0** for armed **and** trusted **and** verified, **1** for not-armed / drift / a
refusal, and **3** when the answer is inconclusive (including "no `codex` binary on PATH", where dz
writes **nothing**, and `--no-verify`, where nothing was measured). `--check` writes nothing and is
**silent** in a home that never opted in.

**`dz setup --target codex` and `dz init --target codex` deliver these hooks too**, verify them the
same way, and report a failure without aborting the rest of the command. Pass `--no-hooks` for
skills only.

**What the two hooks do.**

| Hook | Event | Behaviour |
|---|---|---|
| `dz-codex-veto.cjs` | `PreToolUse` | judges the shell command against one rule, `ssh-explicit-auth-weakening` |
| `dz-codex-recall.cjs` | `UserPromptSubmit` | injects matching learned lessons and records the use with `runtime: "codex"` |

**The veto WARNS by default and never blocks.** A hit prints `DZ-VETO-WARN:` and exits 0. Enforcement
is opt-in **per project**:

```console
$ cat .dz/config.json
{"hooks": {"shellVeto": "block"}}     # off | warn (default) | block
```

Only then does a hit exit 2 and stop the command. The rule fires only on tokens by which the command
*explicitly* asks for weaker ssh authentication — `sshpass`, `-o PasswordAuthentication=yes`,
`-o PubkeyAuthentication=no`, `-o PreferredAuthentications=…password…`. A bare `ssh myhost` whose
identity comes from `~/.ssh/config` or `ssh-agent` is **allowed**: this guard is user-global, so a
rule that blocks the normal secure case is not a guard, it is an outage.

**Radius.** Both helpers are INERT outside an opted-in dz project — the activation marker is a `.dz`
directory, not `.git`. In a plain git checkout they take no decision, print nothing, and create
nothing.

**Removal is conservative.** `--remove` deletes only entries whose command hash is recorded in dz's
own manifest. An entry that merely *looks* like dz's is kept and reported — dz never deletes what it
cannot prove it wrote. Foreign entries are preserved byte-for-byte by every operation, and a
`hooks.json.bak-<ISO>` copy (newest 3 kept) is taken before each modifying write.

### dz drift-check / dz sync-canonical — intra-monorepo skill-drift guard

**What.** The same skill is physically duplicated across many packages (`packages/@dzhechkov/*/​<skill>/` + `.claude/skills/<skill>/`). These two commands make that duplication safe:

- `dz drift-check` — the **detector + CI gate**. Finds every skill that lives in ≥2 **package** locations and reports which copies **byte-differ**. Exit **1** if any *unexpected* drift, **0** if clean. By default it compares published-package copies only; the `.claude/skills/<skill>` dogfood copies legitimately lag, so add `--all` to include them in a raw audit.
- `dz sync-canonical <skill>` — the **healer**. Treats `skills-meta/<skill>` (or `--from <dir>`) as canonical and overwrites every other copy, proving byte-identity. `--check` reports drift and writes **nothing** (exit 1 on drift) — the CI-safe dry-run. It always prints how the canonical resolved: `resolved: from | skills-meta | auto | none`.
  - **No `skills-meta` home + no `--from`?** (~half of shared skills live in a domain pack, not `skills-meta`.) `--check` still works: it runs a **canonical-free** comparison — are the copies byte-identical to **each other**? — and exits **0** if they all match / **1** if any differ (this used to dead-end at exit 2). A bare **write** in that state **refuses** (exit 2, writes nothing) rather than guess a canonical — a wrong guess would silently destroy the good copy. Pass **`--auto`** to opt in to auto-picking the **most-complete** copy as canonical; it prints a **loud warning naming the pick and the exact overwrite list** before healing (completeness ≠ correctness — review the diff).

**Green-on-arrival, not red-on-arrival.** A gate that always fails is ignored. `drift-check` reads **`.dz/drift-allowlist.json`** — a documented baseline of skills whose drift is *accepted* (intentional forks like `knowledge-extractor`, or a package that owns the primary vs a registry snapshot). It fails only on **new** drift in any other shared skill. To accept a drift, add the skill name + a **reason** to that file; to re-arm the gate, heal it (`dz sync-canonical`) and remove the entry.

**Why.** A fix applied to ONE copy silently leaves the others broken. This is not hypothetical: a CRITICAL `goap-research-ed25519` self-signed-forgery exploit shipped in **10 of 12 copies**, and a `brutal-honesty-review` `set -e` crash reached the **published** `@dzhechkov/skills-qe` — both found only by accident. `dz sync-upstream` only checks against **external** repos and is structurally blind to this class of intra-monorepo drift. `drift-check` closes that gap and turns "found by luck" into a red PR (`.github/workflows/drift-check.yml` runs the built CLI on every PR).

**How.**

```bash
dz drift-check                              # package-scope gate: exit 1 only on NEW/unexpected drift
dz drift-check --all                        # raw audit incl. .claude/skills dogfood copies
dz drift-check --json                       # machine-readable { duplicated, drifted[], allowlisted[] }
dz sync-canonical goap-research-ed25519 --check   # report drift, write NOTHING (exit 1 on drift)
dz sync-canonical goap-research-ed25519           # overwrite every copy from skills-meta/, prove identity
dz sync-canonical brutal-honesty-review --from packages/@dzhechkov/skills-qe/brutal-honesty-review
                                            # heal from a freshly-fixed copy instead of skills-meta
dz sync-canonical brutal-honesty-review --check   # NO skills-meta home → compare copies to EACH OTHER
                                            #   exit 0 if all byte-identical, 1 if any differ (was exit 2)
dz sync-canonical brutal-honesty-review           # bare write, no canonical → REFUSES (exit 2, writes nothing)
dz sync-canonical brutal-honesty-review --auto    # opt-in: pick the most-complete copy as canonical,
                                            #   LOUD banner naming the pick + overwrite list, then heal
```

> `drift-check` is a **consistency** gate, not a correctness one — it goes green when every copy is byte-identical (even if the shared skill is uniformly wrong). The same caveat applies to the canonical-free `sync-canonical --check`: a green result means the copies **agree with each other (convergence)**, NOT that any copy is **correct (validity)**. Correctness stays with review/QE; this just guarantees a fix reaches *all* copies. The pure logic lives in `@dzhechkov/harness-core` (`sweepSkillDrift` / `syncCanonicalSkill`); the prototype scripts `scripts/drift-sweep-skills.mjs` + `scripts/sync-canonical-skill.mjs` are thin wrappers over the same functions.

### dz upgrade — check installed skills for updates

```bash
dz upgrade                           # check .claude/skills/ against canonical
dz upgrade --target openclaude       # check .openclaude/skills/
```

Compares installed skills with canonical source, reports which need `dz init --force` to update.

### dz downloads — npm weekly download stats

```bash
dz downloads     # fetch weekly downloads for all 46 packages
```

### dz benchmark — L0 quality gate

```bash
dz benchmark packages/@dzhechkov/skills-devops/terraform     # single skill
dz benchmark packages/@dzhechkov/skills-devops --all          # batch all
dz benchmark skill-a --compare skill-b                        # A/B compare
```

20 graded deterministic checks (U1-U5 universal + S1-S15 skill-specific) + S16 advisory (capability-declaration nudge, not graded). Grade A = 95%+. For L1/L2 LLM judges, use `/bto-test` inside Claude Code.

### dz mcp-scan — static agent-permission audit

```bash
dz mcp-scan .                  # scan a project/pack (default: .)
dz mcp-scan . --json           # machine-readable report
```

"npm audit for agent tools." Reads (never executes) `.claude/settings*.json` and `.mcp.json`/`.vscode/mcp.json`, then emits a 3-tier verdict with capability-level findings. **Exit codes: `0` clean · `1` medium · `2` high** (so CI fails on any non-clean surface). Flags: wildcard/shell grants, secrets-reachable (Read + MCP active, no `.env` deny), hardcoded MCP env secrets, interpreter/package-runner MCP servers, `enableAllProjectMcpServers`, missing default-deny. Rules adapted from the MetaHarness threat-model.

```bash
# Build-time capability reconciliation (project grants vs installed skills' declarations):
dz mcp-scan . --reconcile                  # report under-grant (skill needs a denied capability) + over-grant
dz mcp-scan . --reconcile --emit-policy    # also write .dz/policy/mcp-policy.json (least-privilege, advisory)
dz mcp-scan . --reconcile --fail-on-undergrant   # CI: exit 1 if a skill declares a need the grants forbid
```

`--reconcile` is **build-time and advisory** — `dz` never enforces; it reports the grant-vs-declaration gap and (with `--emit-policy`) emits a least-privilege policy for a **host** to enforce. Under-grant is MEDIUM (the host will starve the skill); over-grant is an advisory CANDIDATE (a grant may be for the operator). Declared `limits` are reported but **inert** (settings.json has no timeout field). Verdict-neutral unless `--fail-on-undergrant`.

### dz publish — automated npm publish

```bash
dz publish --dry-run                          # preview what would publish
dz publish --filter skills-devops             # publish specific package
dz publish --filter skills-devops --bump-only # bump version only, no publish
```

### dz auto-canonicalize — discover skills in GitHub repos

```bash
dz auto-canonicalize --source github.com/user/repo --pack packages/@dzhechkov/skills-devops
```

Scans a GitHub repo for SKILL.md files, generates `dz create-skill` commands.

### dz registry — searchable skill index

```bash
dz registry                    # visual panel: 179 skills in 11 categories
dz registry search security    # fuzzy search
dz registry --category mcp     # filter by category
```

### dz stats + dz dashboard

```bash
dz stats        # Quick metrics: packages, skills, targets, presets
dz dashboard    # Visual panel with all packages, adapters, skill packs
```

---

## Example: Thesis Defense Preparation (Academic Preset)

```bash
# Install with AgentDB (remembers patterns across students):
dz setup --target claude-code --preset academic --memory agentdb

# Or lightweight:
# dz init --target claude-code --preset academic
```

**Prepare:** Create a folder per student with thesis.pdf + review.pdf + external-review.pdf + antiplagiat.pdf.

**Pre-defense** (open Claude Code in student folder):
```
"Check document package completeness"     → document-checker
"Analyze this thesis"                     → dissertation-review (format, criteria, grade)
"Generate 6 defense questions"            → question-generator (basic → critical, page refs)
```

**During defense** (feed live transcript via [Whisper](https://github.com/openai/whisper) + [VB-Cable](https://vb-audio.com/Cable/)):
```
"Analyze this defense transcript"         → defense-evaluator (structure, coverage, delivery)
"Evaluate the student's answers"          → answer-assessor (completeness, depth, reviewer alignment)
```

| When | Skill | What it does |
|------|-------|-------------|
| Before | `document-checker` | Package completeness: thesis, reviews, antiplagiat |
| Before | `dissertation-review` | ГЭК criteria, research/project format, grade 1-10, team project check |
| Before | `question-generator` | 4-6 questions with page refs and expected keywords |
| During | `defense-evaluator` | Live transcript → structure, coverage, delivery quality |
| During | `answer-assessor` | Q&A evaluation → completeness, depth, reviewer remarks |

**Key features:** Grade corridor, per-criterion 1-10 scoring, TO BE vs data detection, LTV/CAC > 10 warning, reviewer divergence, raise/lower conditions, **compact mode** (1-page справка: "компактная справка"), **summary table** across all students. With AgentDB, patterns persist.

Skills contain **only evaluation criteria and methodology** — no student data.

### Batch mode: S3 archive → agent swarm

```bash
# Download and extract: each student = subfolder with .zip
curl -o students.zip "https://s3.example.com/bucket/students.zip"
mkdir students && cd students && 7z x ../students.zip
for f in *.zip; do mkdir -p "${f%.zip}" && cd "${f%.zip}" && 7z x "../$f" && cd ..; done
```

Then in Claude Code:
```
"For each student folder: run document-checker → dissertation-review → question-generator.
 Save справка.md per student with clickable inline links to pages (стр. 45, разд. 2.3)
 and external sources ([JTBD](https://hbr.org/...)). Run all students in parallel."
```

With AgentDB, patterns persist across students — grading calibration improves with each analysis.

---

## Example: Product Discovery with Design Thinking

```bash
# With self-learning (recommended — remembers HADI patterns, JTBD insights across sessions):
dz setup --target claude-code --preset meta
dz setup --target claude-code --preset meta --memory agentdb  # + semantic search

# Or without self-learning:
dz init --target claude-code --preset meta
# Or individually:
dz setup --target claude-code --select design-thinking
```

Then in Claude Code:
```
"Design a mobile app for booking coworking spaces"
→ design-thinking skill activates
→ 6-phase protocol runs with complexity tier auto-selection
```

### 6-Phase Protocol

```
Phase 1: EMPATHIZE  → STOP gate: request user interview data + goap-research for market data
Phase 2: DEFINE     → JTBD Canvas + CJM AS IS + Ishikawa root cause analysis
Phase 3: IDEATE     → HADI hypotheses + Lean Canvas / Osterwalder BMC + GTM + Unit Economics
Phase 4: PROTOTYPE  → MVP (fidelity spectrum) + CJM/VSM TO BE (labeled as hypotheses)
Phase 5: TEST       → STOP gate: request usability test data + risk analysis + HADI validation
Phase 6: VALIDATE   → Pilot with variance analysis: projected vs actual → Scale/Iterate/Pivot/Kill
```

### Complexity Tiers (auto-selected)

| Tier | When | Phases | Integrations |
|------|------|--------|-------------|
| **S** | Quick user insight | 1→2→5 | explore + goap-research |
| **M** | New feature | 1→2→3→4→5 | + frontend-design + six-thinking-hats |
| **L** | New product | 1→2→3→4→5→6 | + qcsd-swarm + reverse-engineering-unicorn |
| **XL** | Platform / ecosystem | All | All optional integrations (aqe init recommended) |

### Key Safeguards

- **Never fabricates data** — STOP gates pause for real interview/survey/test data
- **TO BE ≠ data** — projections labeled as hypotheses, validated via pilot (Phase 6)
- **LTV/CAC > 10 flagged** as suspicious (Skok 2013)
- **Loop-back protocol** — Phase 5 can invalidate Phase 2 and return upstream
- **22 methodologies** with academic validation tiers (Strong/Moderate/Practitioner/Weak)
- **23 validation rules** (DT-001 through DT-023) enforce quality per tier

### What's included vs what's optional

**Core DT** — the `meta` preset includes all required dependencies (18 skills):

```bash
dz setup --target claude-code --preset meta
# → explore, goap-research-ed25519, problem-solver-enhanced,
#   design-thinking, feature-adr, knowledge-extractor,
#   understand-anything-bridge, ... (18 total)
```

**Full DT** — for ALL optional integrations, install [agentic-qe](https://github.com/proffesor-for-testing/agentic-qe):

```bash
npm install -g agentic-qe && aqe init --auto
# → 94 QE skills + 55 agents in .claude/skills/ and .claude/agents/
# → six-thinking-hats, qcsd-ideation-swarm, frontend-design, brutal-honesty-review
```

Or cherry-pick: `dz compose meta+keysarium` for competitive analysis.

| Optional Skill | Source | What it adds |
|---------------|--------|-------------|
| `frontend-design` | `aqe init` / `keysarium` | HTML/React prototypes (Phase 4) |
| `six-thinking-hats` | `aqe init` | Team ideation (Phase 3) |
| `qcsd-ideation-swarm` | `aqe init` | 9-agent quality risk (Phase 2-3) |
| `reverse-engineering-unicorn` | `keysarium` | Competitor CJM+JTBD (Phase 1) |

Without optional skills, design-thinking uses built-in fallbacks.

BTO benchmark: L0 Grade A, L2 Opus weighted 7.58/10.

---

## Example: Import Skills from ECC

```bash
dz install @dzhechkov/skills-ecc                 # 21 curated ECC skills
dz import-ecc --limit 50                         # import 50 from GitHub
dz import-ecc --local-path /path/to/ECC          # from local clone (fast)
dz import-ecc --select docker-patterns,tdd       # cherry-pick
```

## Example: Security Scan with AgentShield

```bash
# In Claude Code: "scan my agent config for security issues"
# → agentshield-scan skill activates (170 rules, 10 categories)
npx ecc-agentshield scan --format sarif           # SARIF for GitHub Code Scanning
```

## Example: 4-Axis Risk Scoring

```bash
dz init --target codex --preset meta --enrich
# → agents/openai.yaml includes risk_level per skill
# Axes: base_tool + file_sensitivity + blast_radius + irreversibility
```

---

## Example: Understand & Develop an Existing Project

```bash
# 1. Analyze project → get recommendations
dz pretrain                                     # detects stack, recommends presets
dz recommend "work on this Node.js API"         # suggests skills + toolkits

# 2. Install skills (choose your level)
dz setup --target claude-code --preset meta --memory agentdb  # 20 skills (includes feature-adr)
dz setup --target claude-code --preset qe-engineer             # + 20 QE skills

# Want the full feature-adr toolkit with /feature-adr command + governance?
npx @dzhechkov/skills-feature-adr init                         # adds slash command + rules + shards
# See: https://www.npmjs.com/package/@dzhechkov/skills-feature-adr

# preset = SKILL.md only (auto-activates on matching tasks)
# npx = full toolkit (slash command + governance + rules)
```

Install [Understand-Anything](https://github.com/Lum1104/Understand-Anything) plugin, then in Claude Code:
```
# 3. Map the codebase
/understand                                      # builds knowledge graph
# → understand-anything-bridge feeds architecture context to all skills

# 4. Develop with full context
"Add a payment module"
# → feature-adr runs with architecture awareness (layers, hot spots, dependencies)
# → see: https://www.npmjs.com/package/@dzhechkov/skills-feature-adr
# → code generation informed by real dependency graph
# → QE review targets tests at high-impact files
# → agentshield-scan checks new configs for security

# 5. Verify impact
"What files are affected by my changes?"
# → blast radius calculation → targeted test generation
```

Architecture-aware development: every skill knows the codebase structure.

---

## Example: AI-Assisted Reasoning & Self-Improvement

```
# Auto-select reasoning strategy:
"Compare 3 architectures"      → structured-reasoning: Tree-of-Thought (branches + scoring)
"Debug this test"              → structured-reasoning: Chain-of-Thought (linear trace)
"We've been looping"           → structured-reasoning: Reflection-Suppression (break loop)

# Self-review before delivering:
"Write a migration and verify" → reflection-loop: draft → critique → revise (max 3 rounds)

# Manage long sessions:
"Context is getting long"      → context-window-management: checkpoint + prune + continue

# Learn from success:
"Extract this as a skill"      → skill-crystallizer: trace → reusable SKILL.md
```

All included in `meta` preset.

---

## Self-Learning: JSONL vs AgentDB

DZ Harness supports two memory backends for self-learning:

```bash
dz setup --target claude-code --preset devops                    # JSONL (default, lightweight)
dz setup --target claude-code --preset devops --memory agentdb   # AgentDB (vector memory)
```

| Capability | JSONL (default) | AgentDB (`--memory agentdb`) |
|------------|----------------|------------------------------|
| **Session tracking** | Append-only JSONL log | **Real rows in the shared `.dz/agentdb.db`** (`dz_session_events` telemetry, written by session hooks) |
| **Pattern storage** | `dz teach` → patterns.jsonl | `dz teach` (lexical) + session-hook writes → `.dz/agentdb.db`; `agentdb_pattern_store` → `.dz/agentdb-mcp.db` (separate stores — see below) |
| **Search** | Keyword (grep) | **Semantic** (HNSW nearest-neighbor, cosine similarity) |
| **Retrieval** | Sequential scan | **O(log n)** approximate nearest neighbor |
| **Self-learning** | Frequency-based | **9 RL algorithms** + Thompson Sampling bandit |
| **Memory tiers** | Flat file | **3-tier** (working → short-term → long-term) |
| **Reflexion** | Reward scores (0-1) | Episodic memory (task + outcome + self-critique) |
| **Causal reasoning** | No | **Cypher-like graph queries** (X caused Y) |
| **Skill composition** | Manual (presets) | **Bandit-picked** skill chains (A→B→C) |
| **Audit trail** | No | **Cryptographic attestation log** |
| **Size** | ~0 KB | 4.6 MB (agentdb) |
| **MCP tools** | 0 | pattern, reflexion, causal, skill, hierarchy (whatever the pinned `agentdb` build exposes — `dz` hardcodes no count) |
| **Dependencies** | None | agentdb (optional, via npx) |

### AgentDB self-learning algorithms

When using `--memory agentdb`, the following algorithms automatically tune search quality:

1. **Thompson Sampling** — multi-armed bandit for ranking search results
2. **UCB1** (Upper Confidence Bound) — exploration-exploitation balancing
3. **EXP3** — adversarial bandit for non-stationary environments
4. **Softmax** — temperature-based action selection
5. **Epsilon-Greedy** — simple exploration with decay
6. **Gradient Bandit** — preference-based action selection
7. **Contextual Bandit** — context-aware ranking using features
8. **REINFORCE** — policy gradient for complex reward landscapes
9. **PPO-lite** — proximal policy optimization for stable learning

The bandit automatically selects the best algorithm for your usage pattern — no manual tuning needed.

### SAFLA delta — rank lessons by payoff *slope*, not just level

Ported from rUv's SAFLA (`safla/core/delta_evaluation.py`). Normal memory ranks a learned lesson by a
**level** — how often it's been used, how recently, its reward. That can't tell a lesson that was hammered
early and is now dead from one quietly proving itself lately. SAFLA delta measures the **slope**: the
*change* in a lesson's payoff over time, computed from its reinforce history in `.dz/sessions.jsonl` (a
weighted sum of four deltas — performance, efficiency, stability, capability).

Two surfaces:

- **`dz consolidate`** prints a SAFLA-delta section — which lessons are **rising** (`↑`, still paying off)
  and which are **stale** (`↓`, slope ≤ 0). Stale lessons are shown as *prune candidates for review*, never
  auto-deleted (a stale-but-valid lesson is not noise). Works out of the box.
- **Opt-in recall re-rank.** Set `deltaRerank` in `.dz/config.json` to let the slope nudge recall ranking —
  rising lessons up, stale ones down — as a **bounded** ± term (it never overrides lexical/vector
  relevance). **Off by default** (byte-identical to the reinforce-only re-rank until you enable it):

  ```json
  { "memory": { "learning": { "deltaRerank": true } } }
  ```

### Bandit payoff re-rank — "did this lesson ever actually help?"

Similarity answers *is this lesson **about** the topic*. SAFLA delta answers *is its payoff **rising***.
Neither answers *has it ever **resolved** anything* — three lessons can all be about Codex while only one
has ever closed a real defect. The bandit adds that axis: a Beta posterior per `(context, lesson)` fed by
your **confirmations** (`dz teach --reinforce`), turned into a **bounded** re-rank term.

```jsonc
// .dz/config.json
{ "memory": { "learning": {
    "banditRerank": false,       // arm the payoff term (default false)
    "banditExploration": false   // allow unproven lessons a trial lift (default false)
} } }
```

What arming each one costs, plainly:

- **`banditRerank`** — recall gains a payoff term capped at the same constant the reinforcement and
  SAFLA-delta terms use, so it reorders near-ties and can never overturn a decisive relevance gap.
  Similarity still decides WHICH lessons are candidates; the bandit only reorders WITHIN them, and it
  never adds a lesson similarity did not select. Deterministic (posterior mean, no sampling), so two
  identical queries give identical order. A lesson with no confirmations yet contributes exactly `0` —
  on day one the feature changes nothing, which is the deliberate price of refusing a random lift.
- **`banditExploration`** — grants *unproven* lessons a bounded trial lift so they can accumulate
  evidence. This **weakens the view-does-not-promote posture** the store relies on, which is why it is a
  separate flag and ships off. Quarantined lessons are excluded from exploration in **every**
  configuration, and the auto-inject hook is untouched in all of them. `banditExploration` without
  `banditRerank` is a warned no-op.

An **exposure is not a reward**: merely seeing a lesson in a recall result is counted in its own channel
and never moves the posterior. State lives in `.dz/lesson-bandit/state.json` behind a named lock, is pure
derived data, and can be deleted at any time — you lose the learned posteriors, never a lesson.

```bash
dz recall "codex" --json     # armed ⇒ a `{"bandit": …}` line on stderr: contextKey, armsConsidered
                             # (the POST-cut list), quarantinedExcluded, unknownArms, moved, reason
dz compounding               # a bandit-health section: arms with measured payoff, reward events vs
                             # exposure events, write errors, movedRate — INSUFFICIENT_DATA when empty
```

`moved` is the honest headline. `moved: 0` over many queries means the feature is armed and doing
nothing — and none of these numbers claims the re-ranking is *better*: `moved` counts change, not
improvement.

### How to enable AgentDB

```bash
# One command — everything is set up:
dz setup --target claude-code --preset devops --memory agentdb
```

This installs `agentdb` + `better-sqlite3` locally (prebuilt, no build tools), writes `.dz/agentdb-writer.mjs`, registers the agentdb MCP server in `.mcp.json` **pinned to the exact installed version (never `@latest`) with `AGENTDB_PATH` = `.dz/agentdb-mcp.db`**, and configures session hooks. The agent can immediately use `agentdb_pattern_store`, `agentdb_reflexion_recall`, etc.

**Two stores, never one file.** The session hooks write into `.dz/agentdb.db`; the MCP server reads and writes `.dz/agentdb-mcp.db`. This split is deliberate: the hook writer opens SQLite natively via better-sqlite3, while the MCP server silently falls back to **sql.js** when better-sqlite3 has no usable binary for your Node version — and sql.js persists by rewriting the **whole file** from memory, discarding pages the other engine just committed. Measured in the dz repo on 2026-07-09 under exactly that arrangement: of 20 samples, **5 were zero bytes and 4 were torn**. So `dz setup` refuses to point both at one file, `dz doctor` reports a shared store as `agentdb store separation: ok:false`, and a pre-existing shared-store install is re-pointed on your next plain `dz setup --memory agentdb` (no `--force` needed). The rows already written by the MCP server into the old shared file are **not** copied into the new store — copying out of a file two engines may have torn would launder unknown bytes; the MCP store starts empty.

**Session hooks make real writes into the writer's own store.** On every session start/end the hook runs the generated writer, which inserts a **metadata-only telemetry row** into the `dz_session_events` table of `.dz/agentdb.db`. Deliberately *not* an embedding write: markers carry no semantic content, so they stay out of the HNSW index and cost ~milliseconds (no model load, nothing blocks your session). Real learnings enter the vector index in-session via `agentdb_pattern_store` / `agentdb_reflexion_store`, in `.dz/agentdb-mcp.db`. If `better-sqlite3` isn't installed yet, the writer degrades to an honestly-labelled `.dz/sessions.jsonl` line and self-heals once the deps exist. *(Restart Claude Code after setup so the MCP server + hooks load.)*

| Command | When to use |
|---------|-------------|
| `dz setup --memory agentdb` | **Recommended** — full setup in one step |
| `dz init --select agentdb-memory` | Lightweight — only the SKILL.md guide (see below) |

### What does `dz init --select agentdb-memory` actually do?

This is the **lightweight** path — it installs only the skill documentation, without configuring the backend:

```
Step 1: Auto-discovers agentdb-memory/ in skills-mcp package
Step 2: Copies to .claude/skills/agentdb-memory/
          ├── SKILL.md              ← instructions for the agent
          ├── schemas/output.json
          ├── scripts/validate-config.json
          └── evals/agentdb-memory.yaml

Step 3: Claude Code auto-discovers the skill from .claude/skills/
Step 4: When agent encounters a matching task, it reads SKILL.md
Step 5: SKILL.md teaches the agent WHICH tools to call and WHEN
```

**What it does NOT do** (unlike `dz setup --memory agentdb`):
- Does NOT install `agentdb` + `better-sqlite3` or create `.dz/agentdb.db`
- Does NOT register the agentdb MCP server (with the pinned `AGENTDB_PATH`)
- Does NOT configure session hooks / the `.dz/agentdb-writer.mjs` writer

**After `dz init --select agentdb-memory`, the user must manually add the MCP server.** Pin
`AGENTDB_PATH` to the same store the session hooks write, so hook-written patterns and
`agentdb_*` recall share one DB:
```bash
claude mcp add agentdb --env AGENTDB_PATH="$PWD/.dz/agentdb.db" -- npx agentdb@latest mcp start
```
*(`dz setup --memory agentdb` does this pinning for you in `.claude/mcp.json`.)*

**When this is useful:**
- You already have agentdb installed separately and just want the skill guide
- You want to teach the agent about agentdb tools without committing to the full `.dz/` infrastructure
- You're in a team where agentdb is managed centrally but each developer needs the skill docs

---

## Architecture-aware & self-learning workflow (`architecture` · `project-skills` · `mr-rakes` · `retro`)

Four commands that make the harness *self-aware*: it maps your product, keeps new features aligned to it, and
learns from your reviews and sessions. Each shows **when to reach for it**, the exact command, and what it prints.

### 🚀 Start here: the guided setup (no schema knowledge needed)

Don't want to hand-author any config? Just tell Claude Code:

> **"настрой feature-adr под мой продукт"** / **"configure feature-adr for my product"**

The `configure-feature-adr` skill runs a short interview and scaffolds everything for you. Under the hood it
uses the engine directly if you prefer the terminal:
```bash
dz feature-adr-setup --plan                 # which docs exist / are discoverable / are missing (read-only)
dz feature-adr-setup --from-spec spec.json  # preview the scaffold (create / augment / unchanged)
dz feature-adr-setup --from-spec spec.json --apply   # write — existing files are AUGMENTED, never clobbered
```
```
feature-adr project setup — current state:
  vision.md: ✓   manifest: ✓   testing.md: ✗ missing   project-skills.json: ✓
  discovered 47 workspace package(s) → a map can be auto-scaffolded
  next steps:
    • author architecture/testing.md from a short interview (test commands, definition of done, gates)
```
It writes `architecture/vision.md`, `subsystems.manifest.json`, `testing.md` (the new `testing` role → Step-8
QE), and wires `project-skills.json`. Re-run any time the product grows — it only augments, never overwrites.
The four commands below are what it configures; you can also drive them directly.

### `dz architecture` — when you've lost the big picture, or before adding a feature

```bash
dz architecture              # the product map: subsystems (the 5 README jobs + foundation/arsenal/ops) + their packages/commands
dz architecture --revise     # drift check: packages in no subsystem, or a command owned by two (exit 1 on drift)
dz architecture --check --slug add-forecast --desc "forecast the next skill for a task" --cmd forecast   # сheck a feature you're about to build
```
```
✓ architecture сverka: ok — Feature aligns with the product map and vision.
# …or, if you would re-add an existing command:
⛔ block (confidence 0.90) — duplicate-command: "recall" already exists in subsystem "learn". Confirm this is intentional.
```
The map is `architecture/subsystems.manifest.json` + `architecture/vision.md` (committed). `--check` exits **2**
on a hard-stop, so you can gate it in CI or at feature-adr Step 0.

### `dz project-skills` — when a project has its own conventions to fold into every feature-adr run

Drop an `architecture/project-skills.json` (no pipeline edits needed):
```json
{ "version": 1,
  "roles": { "product-vision": "architecture/vision.md", "critic": ".dz-skills/my-critic/SKILL.md" },
  "extra": [ { "skill": ".dz-skills/security-checklist/SKILL.md", "phase": "qe", "as": "guidance" } ] }
```
```bash
dz project-skills                    # who-injected report (which skill feeds which stage)
dz project-skills --json             # the plan feature-adr Step 0 reads
dz project-skills --project /some/repo   # read THAT repo's manifest, whatever your cwd is
```
No manifest ⇒ a normal generic run (byte-identical). With one, feature-adr folds each skill into its stage as guidance
(`product-vision`→design+QE, `critic`→QE, `brand`→code).

`--project <dir>` names the root explicitly. Until harness-cli 0.7.9 the command read the manifest from **cwd only**,
so a feature-adr run whose target repo is a separate checkout probed the wrong place, found nothing, and quietly fell
back to a generic run — no error, just missing project guidance in every stage. Step 0 now probes the target repo first
and falls back to the workspace, so a manifest is found wherever it actually lives.

### `dz mr-rakes` — when you want to learn what mistakes this project keeps repeating

Run it once you have a few reviews (feature-adr QE reports / MR reviews) to mine the **recurring** rakes:
```bash
dz mr-rakes                                                              # ranked rakes (≥2/≥3 distinct sources; one-offs dropped)
dz mr-rakes --teach                                                     # auto-teach confirmed rakes to the dz store (surfaced by recall)
dz mr-rakes --gen-critic architecture/project-critic/SKILL.md --apply   # write a project-critic skill (propose without --apply)
```
```
mr-rakes: 2 rake(s) from 78 finding(s) (73 one-offs dropped):
  [confirmed] BLOCKER ×3 — ADR-named safety property left untested  (untested-adr-property)
```
The generated critic is exactly what a `project-skills.json` `critic` role points at — the loop closes.

### `dz retro` — when you finish a coding session and want to learn from it

```bash
dz retro                     # mine the current session → drills for recurring PROCESS rakes + teach the agent
dz retro --no-teach          # just the drills (don't write the store)
dz retro --install-hook      # print the opt-in SessionEnd hook to run it automatically
```
```
retro: 2 recurring rake(s) to drill (from 6800 events):
  🔁 git commit after a code change without running tests/build first — 2× (recurring)
     Before that `git commit` — did the tests/build actually pass in THIS session, or did you assume?
     --- reveal (cover this, predict first) ---
     ✅ Run the tests/build (and read the output) BEFORE `git commit`. (see the `validate` skill)
```
First-seen rakes accrue silently; only **recurring** ones get a drill (no nagging on a one-off). The user gets the
drill, the agent gets the taught rule — from the same mistake, out of one shared `dz teach` store.

### `dz challenge` — when you have an implementation plan and want it broken BEFORE you code

The cross-model QE at feature-adr Step 8 catches problems *after* the code is written. The most expensive plan
mistakes — overengineering, silent decisions, cemented bad patterns, test-theater, unrealistic scope — cement at
the plan stage, and the plan's author can't see their own gaps. `dz challenge` assembles the "round"; the
`challenge-panel` skill fires it at a FRESH adversary that did **not** write the plan:
```bash
dz challenge --plan features/my-feature/06_implementation_plan.md              # print the WIDE brief + C1-C8 + verdict schema
dz challenge --plan features/my-feature/06_implementation_plan.md --context-only  # just what the panel will read + the adversary to use
dz challenge --plan features/my-feature/06_implementation_plan.md --author codex  # who wrote the plan → prints the CROSS-family adversary
```
```
challenge context for features/my-feature/06_implementation_plan.md:
  plan:        ✓ 23752 chars
  vision:      ✓ 2443 chars
  testing:     ✗ (less calibration)
  map:         ✓ 4470 chars
  degradations:✓ 719 chars
  → adversary: codex — plan authored on claude (Claude) → Codex adversary (cross-family)
```
The panel asks a fixed owner-question set in "break it, don't confirm it" mode — **C1** arch-anti-cement (a
deviation from a pattern in `architecture/degradations.md` is *not* flagged), **C2** prod-ready, **C3** test
sufficiency + honesty (both under- and over-testing), **C4** overengineering, **C5** silent decisions, **C6**
runtime consistency, **C7** scope, **C8** executability. Every P0/P1 finding is **cross-validated** by a second
independent agent (theory is dropped), and the verdict is **advisory — it never auto-blocks**. Two invariants:
the panel is never the plan's own author (cross-family adversary), and the context pack is WIDE (a narrow slice
yields shallow findings). In the feature-adr pipeline this runs automatically at the L/XL plan checkpoint; ad-hoc,
just say **"прогони challenge на этот план"** / **"challenge this plan"**. Scaffold the degradations registry with
`dz feature-adr-setup --from-spec <spec with {"degradations":true}> --apply`.

### `dz routing` — when you want feature-adr to LEARN which model is worth paying for

feature-adr can route a stage to a fixed model (`args.models.code='opus'`), but you may not know which model is
actually worth it. The **`auto-cost`** spec learns from real outcomes: it picks the **cheapest** model whose
learned success-rate is **≥0.7** at `(stage, complexity-tier)`, and a model whose code later **fails the Step-8
QE gate is down-ranked** (success is *passing the gate*, not "returned something"). Grounded in rUv's shipped
`MetaHarnessRouter`. Turn it on per stage:
```js
Workflow({ scriptPath: '.claude/workflows/feature-adr.js',
  args: { slug, description, tier: 'L', models: { code: 'auto-cost', qe: 'auto-cost' } } })
```
```bash
dz routing                    # the learned table — what auto-cost currently believes
dz routing --stage code       # just the code stage
dz routing --json             # raw store (.dz/routing-outcomes.json)
```
```
Learned routing outcomes (what `auto-cost` currently believes):

## code
  L   sonnet         100% (4/4 gated, 4 provisional)
  L   opus            60% (3/5 gated)
```
Cold-start (no history) walks a cheapest-first chain and escalates on failure; once a model clears the bar it is
chosen directly. Two invariants held hard: `auto-cost` on the **qe** stage only ever ranks the **cross-family of
the coder** (a model never self-QEs), and the whole thing is **opt-in** — with no `auto-cost` spec anywhere the
pipeline is byte-identical and the store is never touched. Layered under the usage-adaptive override (a session
near its limit still switches to Codex first). Storage is a plain JSON file — zero native deps.

### `dz bto-optimize` — when you want to improve a skill WITHOUT gaming its own benchmark

The BTO pack already grades a skill (`/bto`) and can evolve it (`/bto-optimize`) — but the evolutionary loop
picks the highest score on the **same** eval it tuned on, so a variant that flatters the LLM judge panel
(verbosity, buzzwords) can win even if it doesn't help real users (**Goodhart's law**). `dz bto-optimize` is the
deterministic engine the `/bto-optimize` skill delegates to so acceptance is gated on **unseen** scenarios:
```bash
dz bto-optimize --split --scenarios @scenarios.json --holdout 0.34          # deterministic tune/holdout split
dz bto-optimize --plan --candidates 5 --rounds 1 --tune 4 --holdout 2 --max 24  # budget plan (trims to the cap)
dz bto-optimize --select --baseline @baseline.json --candidates @cands.json  # accept only on holdout no-regress
```
```
budget plan: 5 candidates × 1 round(s) → 20 tune + 4 holdout = 24 judge run(s) (cap 24, within cap)
✓ winner: real — accepted on holdout: CORRECTNESS +2.00, aggregate +0.40, no regression
✗ no winner — gamer: lifted CORRECTNESS but regressed DEPTH on holdout
```
A candidate is accepted **only** if it lifts the weakest dimension (METHODOLOGY/DEPTH/CORRECTNESS/USABILITY/
ROBUSTNESS) on the **held-out** scenarios **without regressing** the others — a variant that wins on the tuning
set but regresses on the holdout is rejected. Three guarantees: only the **directive prose** is mutated
(frontmatter + headings are off-limits, `--scope-check`), the budget has a **hard cap** (the plan trims to fit
and never lies about the run count), and the engine **never auto-writes** — it renders a diff you confirm.
Grounded in dspy.ts's MIPROv2 (propose → tune → validate-on-held-out). In the skill: **"прогони bto-optimize с
hold-out"** / **"optimize this skill with hold-out validation"**.

## Recipes & FAQ

Scenario → exact command → how to verify → gotcha. **Three gotchas worth calling out up front:**
1. `dz setup` **without `--preset`/`--select` auto-picks a preset** (your stack's best match, else `devops` ≈ 30 skills) — pass `--select <ids>` for a minimal footprint.
2. There are **two memory stores** — lexical (`dz teach`/`dz recall`) and semantic (agentdb MCP). Different tools, different recall.
3. With `--memory agentdb`, session hooks now make **real** vector-store writes (fixed) — see the AgentDB section above.

**"I don't know which skills/preset fit my task."**
```bash
dz recommend "<describe your task>"      # ranked suggestions from the registry
dz registry search <query>               # search by keyword
dz registry --category <cat>             # browse one category
dz init --target claude-code --select skill-advisor   # interactive advisor skill
```
Verify: `dz registry` lists them. Gotcha: `recommend` is lexical/keyword ranking, not an LLM;
word forms are normalized, but paraphrases still belong to `/skill-advisor`. A fallback is labeled
`PROJECT-STACK SUGGESTIONS` and never presented as a match to the question.

**"Install just ONE skill, not a whole preset."**
```bash
dz init --target claude-code --select pr-review        # exactly what you name
```
Gotcha: `dz setup` (no `--select`/`--preset`) installs a whole preset. Scope it:
`dz setup --target claude-code --select agentdb-memory,skill-advisor`.

**"Turn on the self-learning memory (AgentDB)."**
```bash
dz setup --target claude-code --memory agentdb --select agentdb-memory,skill-advisor
# ↑ installs agentdb+better-sqlite3, writes the hook writer, registers MCP with AGENTDB_PATH pinned
claude mcp list                          # expect: agentdb ✔ Connected
```
Verify: after a session, `.dz/agentdb.db` grows and `.dz/sessions.jsonl` stays empty (real writes, no fallback). Gotcha: MCP tools + new `CLAUDE.md` only load on a **fresh** Claude Code session.

**"Do I have to wire agentdb into every skill?"** — **No.** AgentDB is a **harness-level** backend (`.dz/config.json` → `memory.backend`) + MCP tools + hooks. Every skill/preset shares it automatically; skills never hardcode it.

**"Where do memories live? Why two kinds of recall?"**
| Store | Backend | Recall | Command |
|-------|---------|--------|---------|
| `dz teach` / `dz recall` | `@dzhechkov/memory` (SQLite FTS5) | **lexical / keyword** | `dz recall "<q>"` |
| `agentdb_*` MCP + session hooks | AgentDB `.dz/agentdb.db` (native SQLite + HNSW) | **semantic / vector** | in-session tool calls **and** `dz recall` (hybrid) |

Bridge: with the agentdb backend enabled, `dz recall` itself is the bridge — it merges lexical FTS5 with vector similarity over the same store (see *Semantic recall* below). `dz recall --all --json` stays the portable SHARING form.

### `dz discrimination-check` — when a test is green but you're not sure it actually catches anything

feature-adr Step-8 asserts the ADR's load-bearing safety property **has** a test. But a green test can be a
false green — it may never exercise the property, so it would stay green even if the property regressed. The
`§42` gate (learned from rUv's `cve-bench/evaluate.mjs`) proves the test **discriminates**: it runs the property
test in a throwaway git worktree at the pre-feature base (no fix) and requires it to go **red**.

**Use it when** you are about to accept "the property has a test" as evidence — in Step-8 QE, in a review of
someone else's fix, or before trusting a regression test you did not write. Run it against `HEAD` while your
change is still uncommitted; that is what makes `HEAD` the pre-feature base.

```bash
# the Step-7 feature diff is uncommitted mid-pipeline, so HEAD is the pre-feature base
dz discrimination-check --test packages/x/test/auth-property.test.ts --base HEAD --json

# human output, a longer suite, and a runner that is not vitest
dz discrimination-check --test packages/x/test/auth-property.test.ts \
  --base HEAD --runner "node --test" --timeout 600000
```
```
discrimination-check @ HEAD — verdict: NON_DISCRIMINATING
  ✗ packages/x/test/auth-property.test.ts: NON_DISCRIMINATING
  measurementValid: true · primaryAction: strengthen-test

  [high] non-discriminating property test (false green)
  1 property test(s) PASS at pre-feature base WITH execution evidence — they do not exercise the ADR safety
  property and would stay green if the fix regressed … Action: strengthen-test. (Advisory — the pipeline
  continues; the owner decides.)
```

**Every verdict is gated on EXECUTION evidence.** The gate reads the runner's own output shape (vitest /
node --test) and requires it to demonstrate that the *named* test actually ran. An outcome nobody can prove
degrades loudly instead of minting trust — MEASURED before this change, `--runner false` (a command that
executes nothing and prints nothing) returned `DISCRIMINATES`; it now returns `CANNOT_ISOLATE` with
reason `unrecognised-runner-output`.

| Verdict | Means | ✓/✗ | Action |
|---|---|---|---|
| `DISCRIMINATES` | assertion-red at base, execution-evidenced | ✓ | none |
| `DISCRIMINATES_VIA_ERROR` | evidenced load error at base **and** an evidenced pass at TIP | ✓ | none (inference — note it) |
| `NON_DISCRIMINATING` | evidenced pass at base — a proven false green | ✗ | `strengthen-test` |
| `TEST_FILE_ABSENT` | the named check is not a regular file (stat+isFile, before any worktree) | ✗ | `create-missing-test` |
| `LOAD_ERROR_AT_BOTH_REVS` | could not execute at EITHER rev — zero signal | ✗ | `fix-runner-invocation` |
| `FAILS_AT_TIP` | the feature's own test is red **with** the feature present | ✗ | `fix-red-feature-test` |
| `CANNOT_ISOLATE` | no established observation; the row carries a typed `reason` | ✗ | `map-a-test` / `fix-runner-invocation` |

`--json` carries the full reading: `perTest[]` (verdict + `reason`), the per-run `evidence` rows, `findings[]`
(**one per distinct non-clean verdict** — the scalar `aggregate` can only name the worst), `measurementValid`
(`true | false | 'partial'` — did the instrument measure at all), `primaryAction`, and `tipTree` (the live
tree's HEAD + dirty-file count when a tip control ran). The singular `finding` is a **deprecated** alias for
`findings[0]`; read `findings[]`. `--timeout <ms>` (default 300000) bounds each run — a timed-out run is
`CANNOT_ISOLATE` reason `timeout`, never a pass.

It **never auto-aborts** (dz's rule: a false gate kills trust) — exit 0 on any verdict, exit 2 only on a
usage/setup error. Base ref, paths, name filter, and runner are all injection-checked, and the worktree is
always removed. Step-8 runs this on the ADR Confirmation's `Required automated check` automatically.

### `dz guard` — when a self-mutating operation should be refused, not regretted

Recurring failures — a raw `workspace:*` shipped to npm, a credential pasted into a lesson, skill drift
published — were each caught by hand, after the fact. `dz guard` is one declarative place for those
invariants: HARD rules **block** the operation, SOFT rules warn. Zero config needed — built-in defaults
cover the known rakes; `.dz/guard.json` (via `dz guard --init`) exists only if you want to tune a severity
or disable a rule.
```bash
dz guard check --op publish        # no-workspace-star · no-skill-drift · no-secrets · readme-consistency · readme-first · skills-registrable · lockfile-in-sync · marketplace-parity · no-stubs · review-round · licence-hold
dz guard check --op teach --text "the fix: export sk-abc..."   # → BLOCK (exit 1): looks like a credential
dz guard log                       # append-only audit: every verdict + every forced override
```
```
dz guard (teach): ✗ BLOCK  [checked: no-secrets, store-bloat-cap]
  [BLOCK] no-secrets: lesson: looks like a openai-key — do not teach/publish a credential
  → blocked. Fix the HARD violation(s), or override with --force "<reason>" (logged).
```
`dz publish` runs the guard **automatically** as a pre-flight and refuses on a HARD block; the escape
hatch `--no-guard "<reason>"` requires a reason and is logged to `.dz/guard-audit.jsonl` — an override is
visible, never silent. Calibrated against false gates: in a pnpm workspace, `workspace:*` in source is
*correct* (pnpm rewrites it at publish), so the rule resolves each workspace dep to the version it would
ship as and blocks only a dep that would ship raw. The `readme-consistency` rule also holds the **docs
site** in the contour: the command count on the Starlight CLI overview and the front-page tagline must
match the cli README (the site once drifted 35→55 silently; now a mismatch is a warning here and a red
test in CI). In a repo without the docs site those pairs simply aren't gathered — no false gate.

The SOFT `lockfile-in-sync` rule closes the CI break that follows a dependency bump: when a workspace
`packages/*/package.json` declares a `@dzhechkov/*` spec that differs from the specifier `pnpm-lock.yaml`
records for that importer, CI's `pnpm install --frozen-lockfile` dies with `ERR_PNPM_OUTDATED_LOCKFILE`
long after the commit. Now it is a warning at publish time:
```
  [warn] lockfile-in-sync: packages/@dzhechkov/harness-cli: @dzhechkov/harness-core = "^0.3.999" in
         package.json but "^0.3.141" in pnpm-lock.yaml — run `pnpm install` to refresh the lockfile
```
It FAILS OPEN by construction — no lockfile, or one its parser cannot read, yields no warning at all (a
guard that cannot read its evidence must never invent a violation), and it only compares `@dzhechkov/*`
specs. "Tolerant" here means **recognise-or-refuse**, not *guess quietly*: the parser reads exactly the
`lockfileVersion: 9`+ importer layout and returns nothing at all for a legacy v5/v6 file (whose deps are
`dep: version` one-liners) or a truncated one — because a half-parse would find the importer keys, read
zero specifiers, and then report every real dependency as "not recorded". The rule is also **SOFT-only**:
`.dz/guard.json` cannot promote it to HARD, since a parser designed to admit "I may not understand this
file" must never be able to block a publish.

The SOFT, publish-only `marketplace-parity` rule regenerates `.claude-plugin/plugin.json` and
`.claude-plugin/marketplace.json` from the live registry in an isolated temp directory and compares
their composition with the published showcase. It deliberately excludes `version`, which remains an
operator field, and never blocks publication; composition drift warns with the exact repair command
`dz plugin --version <published>`. A repository with no complete `.claude-plugin/` showcase is out of
scope: the rule records an informational skip reason and emits no violation.

Four publish-only `volume-shadow/v1` observations meter the always-loaded corpus without becoming a
release gate: configured template context, largest-file share, feature-artifact/unified-diff-byte
ratio, and the tier/lifecycle artifact set. Rules and commands are reported separately from
conditional full-skill bodies, and their sum is labelled a configured/invokable envelope rather
than measured per-session cost. Human output uses `[observe]` or `[note]`; JSON and the chained audit
retain the same operands, units, dated reference starting points, and method identifiers.

All four rules are SOFT-only, including when `.dz/guard.json` requests HARD. An incomplete or capped
scan, escaping/non-regular input, ambiguous attribution, or zero denominator is a visible typed
`unknown`, never a clean zero and never a blocker. Source comments and comment density are not
collected or classified. The observations therefore do not recommend shortening justification;
they only report volume inside their closed artifact scope.

**`review-round` (HARD, publish)** — a package that bumps its version AND changes source must bring a
GRADED `features/*/08_qe_report.md` in the same change. The gate had eleven rules and not one asked
whether anyone but the author had read the code; the cost is on the record (health-advisor slice H:
five rounds graded F, thirteen packages published on the author's own verification, and round six
found six defects in already-published code).

Scoped to SOURCE on purpose: a HARD rule that also blocked a docs-only republish is a rule someone
switches off. The floor defaults to PRESENCE of a grade — `.dz/guard.json` → `reviewRound.minGrade`
sets a letter when you want one.

It proves a graded report EXISTS in this change. It does **not** prove the review was independent,
was competent, covered THIS package, or was taken against this revision — the violation text says all
four. And like every change-scoped rule here it reads the WORKING TREE, so it is silent once the
change is committed.

```
  [BLOCK] review-round: @dzhechkov/memory: source changed and the version is bumped, but this change
  brings no GRADED features/*/08_qe_report.md — a publish gate that cannot tell "reviewed" from
  "not reviewed" treats them alike.
```

**`licence-hold` (HARD, publish)** — the machine side of a licence precondition (ADR-001 of feature
`hermes-claude-adaptation`, first holder: `@dzhechkov/cloudru-hub`). A pack that declares
`package.json.licenseHold` is parked behind two belts: while it stays `private:true` the npm layer
refuses it and this rule stays silent (other packs publish unblocked); the moment `private` is dropped
with the hold unsatisfied, publish is HARD-blocked:

```
  [BLOCK] licence-hold: @dzhechkov/cloudru-hub: publishable (private flag removed) but the ADR-001
          licence hold is UNSATISFIED — LICENSE still carries the PENDING grant placeholder; LICENSE
          has no "Grant-Confirmation: <url>" line; package.json license "SEE LICENSE IN LICENSE" is
          not a clean SPDX id
```

Satisfying the hold — a real LICENSE (no `<!-- PENDING:` placeholder, a `Grant-Confirmation: <url>`
line), non-empty `THIRD_PARTY_NOTICES`, and a clean SPDX `license` field — makes the rule pass with the
trigger field still in place. Discrimination MEASURED 2026-08-10 (reproducer: flip `private` in
`packages/@dzhechkov/cloudru-hub/package.json`, run `dz publish --dry-run` → exit 1 BLOCKED; restore →
pass; satisfied scratch copy → pass).

**`no-stubs` (SOFT, publish)** — a deterministic scan for unfinished-stub markers (`TODO` / `FIXME` /
`HACK` / `XXX` / `PLACEHOLDER` / the phrase `implement later`) left in the files of the **current
change-set** (backlog 0b403a0106103901, Karpathy-Michaels rule XI). A stub in code you are about to
publish means the task shipped incomplete — and until this rule that was caught only by a reviewer's
judgment (layer 4 on the cost-of-detection ladder); a grep is layer 1. Scope is the working-tree diff
**on purpose**: MEASURED 2026-08-10, a whole-tree case-insensitive scan of this repo yields 32 src/lib
hits + 25 test/fixture hits, the clear majority ancient and legitimate — a tree-wide gate would be
switched off as noise within a day. The gate catches what *you* left in *this* change. Bare markers are
matched **case-sensitively** with hard word boundaries (measured: relaxing case doubles the hits and
adds only prose — `todo` keyword lists, "placeholder" in comments), so `hackathon`, `todos`, and a
marker inside a hash never fire; in markdown, fenced blocks and backticked spans are treated as QUOTES
of a marker, not stubs, so a doc explaining this very gate scans clean.

```bash
$ printf '// %s: finish the retry path\n' 'TODO' >> src/retry.ts
$ dz guard check --op publish
dz guard (publish): ⚠ WARN  [checked: … no-stubs …]
  [warn] no-stubs: src/retry.ts:1: stub marker "TODO" in a changed file — finish it, or waive the
         line with "no-stubs: <reason>" (or .dz/guard.json stubWaivers with a reason)
$ echo $?        # SOFT means SOFT: the publish path completes
0
```

A marker a change must legitimately carry (a fixture exercising another scanner, a demo) takes an
explicit **waiver-with-reason** — inline on the line (`// … no-stubs: fixture exercises the S10 check`)
or path-keyed in `.dz/guard.json` (`"stubWaivers": [{"path": "test/fixtures/x.json", "reason": "…"}]`,
the same shape as `dz feature-adr-setup --guards`). A waiver **without** a reason is refused loudly and
exempts nothing — an exemption you cannot explain is a silent allowlist:

```
  [warn] no-stubs: src/retry.ts:1: inline waiver ("no-stubs:") carries NO reason — refused; a waiver
         you cannot explain is a silent allowlist
  [warn] no-stubs: src/retry.ts:1: stub marker "TODO" in a changed file — …
```

The rule's own source never trips it **structurally**: every marker in `no-stubs.ts` (and its tests) is
assembled from string fragments at load time, so the file contains no literal for the scan to find — a
tested property, not a path skip. The same check runs as a Step-8 QE-gate item in the feature-adr
pipeline ("any unwaived match over the run's touched files = task incomplete").

The change-set includes files inside **brand-new untracked directories**: the gatherer runs
`git status --porcelain -uall`, so a fresh module directory — the most stub-prone artifact there is —
is scanned file-by-file instead of collapsing to one invisible `?? newdir/` line (FN-1, REPRODUCED:
before `-uall` a marker in `newdir/stub.ts` published as PASS/0 findings). `.gitignore` semantics are
unchanged — git never lists ignored paths, `-uall` or not (tested live).

**Fail-open, never fail-silent.** A changed scannable file the gatherer does NOT read — deleted,
non-regular, over 1 MB, unreadable, or beyond the 400-file cap — still reports no findings (missing
evidence is never guessed), but the skip now goes **on the record** as one aggregate note in the
verdict, the `--json` output, and the audit log; it is information, never a violation, and cannot
change the verdict or the exit code:

```
dz guard (publish): ✓ PASS  [checked: … no-stubs …]
  [note] no-stubs: 1 changed scannable file(s) not scanned (deleted/oversize/unreadable/beyond the
         file cap) — the stub scan is fail-open, so this is a coverage gap on the record, not a violation
```

**Known limits** (conscious trade-offs, named rather than implied away — each is also documented at
the top of `no-stubs.ts`):

- **Whole-line inline waiver (FN-2).** The `no-stubs: <reason>` token exempts the *entire line* it
  appears on — any line can be silenced by appending the token. The defence is auditability, not
  prevention: the token is a fixed greppable string, so every silencing is one grep away. That is a
  layer-4 defence on the cost-of-detection ladder, and it is named as such deliberately.
- **Reason quality is not judged (FN-6).** A junk reason (`.`, `x`) satisfies the reason requirement.
  The design stops *forgetting* a reason, not *faking* one — a deterministic layer cannot judge honesty;
  that is review-plane work.
- **Markdown fence model (FN-4).** Fence tracking is a single boolean toggle, not CommonMark: a
  mismatched `~~~`/backtick fence pair, an indented fence, an unclosed fence at EOF (everything after it
  reads as fenced ⇒ skipped), and a marker on the fence info-string line are all mis-scoped.
- **Git-quoted paths (FN-3).** Paths git quotes (spaces, non-ASCII under the default
  `core.quotePath=true`) are not decoded, match no real file, and are not scanned.
- **Extension allowlist (FN-8).** `STUB_SCAN_EXTENSIONS` is a TS-monorepo set: extensionless bin
  scripts, `Dockerfile`, `Makefile`, `.txt/.html/.css/.vue/.svelte/.c/.cpp/.php/.toml/.sql/.ps1/.kt/.swift`
  are unscanned — MED risk if this rule template ships into a polyglot repo (the list is exported and
  testable precisely so it can be extended there).
- **Staged-but-not-worktree content (FN-5).** The gatherer reads the working tree; content staged in the
  index but reverted in the worktree scans as the worktree text — design-consistent for the `publish`
  op, which packs the worktree.
- **Config waivers match the exact path string** — no normalization, no globs; a mis-spelled waiver
  simply does not match and the finding fires (errs toward firing — the safe side).
- **A status listing beyond the raised 32 MB `maxBuffer`** makes the porcelain call throw, which drops
  the whole `change` fact — no-stubs and every promoted template rule go fail-open together for that
  run (the standing not-a-git-repo contract; the bound makes it a pathological-tree-only event).

#### `dz guard promote` — when a LESSON has earned the right to become a rule

`dz compounding` MEASURED the uncomfortable half of the learning loop (reproducer: `dz compounding
--json` on this repo, 2026-07-29): 27 of 154 lessons had ever been injected — ~82 % write-only —
while the lessons that *did* become guard rules collapsed their own violation rate
(`no-workspace-star` 31 → 0, `readme-first` 49 → 4). Rules compound; notes-to-self do not.
`dz guard promote` is the elevator between them — the cost-of-detection ladder made executable.

```bash
dz guard promote --dry-run                      # inspect only: computes and prints, writes NOTHING
dz guard promote                                # writes the proposal + refusal documents (never .dz/guard.json)
dz guard promote --apply                        # installs the promoted rule(s) — SOFT severity, always
dz guard promote --window-days 30 --periods 4   # widen the evidence window for a rarer violation
```
```
dz guard promote — lesson → guard-rule promotion (two consecutive shadow wins required)

  corpus: 1 lesson(s) · 0 quarantined · 13 change(s) over 4 × 7d window(s)

  RANKED CANDIDATES (score = firings × cost, cost = 1 + lesson uses — cost is a PROXY, not a token figure):
    ★ [  12] promoted-pairing-package-json-changelog-md  PROMOTE
        promote: 2 consecutive shadow win(s) over 2 evaluated period(s), 12 real firing(s)
        periods (oldest→newest): –0/0 –0/0 W7/7 W5/6
        evidence: 24f0d72ab2be: package.json changed without any **/CHANGELOG.md

  WROTE: features/guard-promotion/promotions/001-promoted-pairing-package-json-changelog-md.md
  Nothing was written to .dz/guard.json — re-run with --apply to install the promoted rule(s).
```

**A candidate must win twice, on real history.** Each lesson is reduced to a fixed *rule template*
(`pairing-check` = X changed without Y · `absence-check` · `format-match`), then **shadow-replayed
over actual commits** in consecutive time windows. A window in which the check would have fired on a
real commit is a *win*; a window with zero firings is a *loss* and **resets the counter**; a window
with fewer than 5 commits is *skipped*, never counted against it. Two consecutive wins are required,
and every win cites a commit sha you can `git show`. Windows are wall-clock, so re-running the
command can never manufacture a win — the counter is recomputed from history, never accumulated.

**And it must have been watched for two real window-lengths.** Commit timestamps are author-supplied
(`GIT_COMMITTER_DATE`, a rebase, a repo import, clock skew), so history that *looks* like two windows
can be laid down in one afternoon. A second clock closes that: promotion also requires
`now − firstSeen ≥ 2 × --window-days` of real elapsed time, measured by the local clock and
journalled in `.dz/promotion-state.json` the first time the candidate is recorded. Consequences worth
knowing up front: a brand-new repo waits 14 days for its first promotion however strong the evidence,
and a `--dry-run`-only workflow never promotes, because the run that would start the clock is exactly
the one that writes nothing. (The `wait` reason spells both out.) This is a guard against accidental
self-gaming, not a cryptographic one — the state file is local and editable.

Every non-dry run also records a bounded, prospective observation in that same state file for
`dz compounding`: candidate eligibility, an opaque digest of the exact effective template+params when one
exists, and the route's authoritative candidate verdict. It stores no lesson/rule body, does not
feed the promotion decision, and deduplicates an identical run. Legacy state remains readable, but
months before this observation history existed are `NOT MEASURED`; they are never reconstructed.

**It refuses out loud.** Rule code is never synthesised from lesson text — a lesson that fits no
template is listed as not-promotable *with the reason*, and the refusals are recorded in
`features/guard-promotion/promotions/` alongside the promotions. A candidate already covered by an
existing rule is refused as a duplicate naming that rule; a quarantined lesson (an unproven
hypothesis) is refused but still told what it *would* become, so the list reads as a roadmap:
```
✗ [   0] promoted-pairing-package-json-pnpm-lock-yaml  NOT-PROMOTABLE
    not-promotable: quarantined (an unproven hypothesis must not become an enforced rule) — it WOULD
    classify as pairing-check, and is already covered by 'lockfile-in-sync'; confirm it with
    `dz teach --reinforce` to make it eligible
```

**A promoted rule can never block.** It is written `soft`, and `resolveRules` forces SOFT for every
template-backed rule — a hand-edited `"severity": "hard"` in `.dz/guard.json` is ignored. It is a real
rule, though, not an inert config entry: it fires in `dz guard check --op publish` from the next run.

**`--apply` compares rule BODIES, not ids.** Re-applying an identical rule is a no-op and exits 0.
An existing `.dz/guard.json` rule that shares the derived id but has a different body is a
**conflict**: nothing is written, the clash is printed on a `✗ CONFLICT` line (and in the JSON
`conflicts[]`), and the command exits **1** — a zero exit for work that was deliberately not done
would be the same kind of lie the feature exists to remove.

*When to use it:* after a stretch of work that taught you something mechanical ("X must change with
Y"), run `dz guard promote --dry-run` at session end. If a candidate has two wins, `--apply` it and
that class of mistake becomes a layer-1 check instead of something you have to remember.

### `dz feature-adr-setup --guards` — when a project rule should be a TEST, not a reviewer's memory

A 700-line cap enforced by reviewer judgment catches one file and misses its sibling in the same change;
`wc -l` catches both, always (the cost-of-detection ladder). `--guards` scaffolds a deterministic guard set
into the TARGET project — no framework, no dependency, any stack with Node:
```bash
dz feature-adr-setup --guards            # preview (existing files are never clobbered)
dz feature-adr-setup --guards --apply    # writes architecture/guards/{guards.config.json,check.mjs}
node architecture/guards/check.mjs       # run locally / wire into CI or the test command
```
```
guards: ✗ 1 violation(s)
  [loc-cap] src/huge.ts — 801 lines > cap 700
```
Three deterministic rules, each with a **waiver mechanism that requires a reason** (a waiver without one is
itself a violation — a conscious exception is recorded, not silently allowed): **loc-cap** (god-object
guard, `--loc-cap <n>` tunes, default 700), **secret-scan** (the same high-signal credential shapes as
`dz guard`), **frozen-files** (sha256 pins for files that must not change silently). The config is data —
edit caps/paths/waivers in `guards.config.json`; the project-critic role should then *not* re-flag these
rules, only waivers without a reason.

### Domain-scoped recall — `--domain <name>` (a boost, never a filter)

**When to use it.** One brain store, more than one *kind* of work. `dz teach --domain` has always
recorded a domain, but until now the ranking ignored it — so medical-research lessons and coding
lessons came back interleaved, and the dilution grew with the store.

```bash
dz recall "signature" --limit 3 --domain security
#   dz recall "signature"  —  3 hit(s), SQLite FTS5 + vector (agentdb) ranking
#     [0.90] (security) ⟨both⟩ Crypto anti-hallucination anti-pattern: verifying a signature …
#     [0.85] (publishing) ⟨both⟩ ⚠q 'Re-sign LAST' applies to EVERY signed pack a sweep touches …
#     [0.80] (testing) ⟨vector⟩ A structural registry-coverage test that only checks key-SET …
#     domain "security": among 6 candidate(s) — 1 exact match(es), 3 changed position;
#     foreign-domain lessons kept (a boost, not a filter)
#     1 lower-ranked lesson fell past the --limit 3 cut to make room — raise --limit to see them

dz recall "signature" --limit 3 --domain health-research
#     domain "health-research": no lesson in this result carries it — order unchanged, nothing was hidden
```

**One line out per hit.** Every value that reaches a `dz recall` output line — the lesson, its
domain, your query, the requested domain — is rendered on a single line, with embedded line breaks
shown as `⏎`. That is not cosmetic: any tool parsing this output line-wise (the `health-advisor`
research skill reads it to detect whether this `dz` supports `--domain`) would otherwise see lines
forged by stored content or by a crafted query.

**Why a boost and not a filter.** Cross-domain transfer is the reason one shared store beats two
separate ones: *"a reviewer's evidence needs the same execute-don't-describe discipline as your own
claims"* was learned reviewing code and applies verbatim to medical sources. A filter would cut
exactly those transfers. So matching hits move UP — at most **2 places** for an exact domain, **1**
for a hierarchical relative (`health` ↔ `health-research`) — and nothing is ever dropped: the hit
count with `--domain` equals the hit count without it.

The bound matters: a domain tag is a hint about relevance, not evidence of it, so it breaks near-ties
instead of overruling lexical ranking. And the note is honest in three directions — it says when
nothing matched, it distinguishes *matched* from *actually moved*, and it counts what the `--limit`
cut hid. That last one is the subtle part: the boost never drops a hit, but promoting a match into
the top N does push the last one out of the printed list, so "nothing was dropped" would be true of
the ranked list and false of the one you are reading. The note names the difference instead.

### Held-out domains — the export does not hand over everything

`dz recall --all --json` is the portable sharing form, which makes it the realistic path
by which a learned store leaves a machine. Some domains should not travel by default:
`health-research` (written by `@dzhechkov/health-advisor`) carries lessons drawn from one
person's medical investigations.

```bash
dz recall --all --json
#   … 178 patterns on stdout, health-research NOT among them
#   1 lesson(s) in health-research were HELD BACK from this export — that domain carries
#   medical research and does not travel by default. To include it deliberately:
#   --include-domain health-research          ← on stderr, so stdout stays parsable

dz recall --all --json --include-domain health-research   # explicit opt-in
```

**Why a domain tag and not a content scan.** The tag is set by the writer and compared
after normalisation (`Health_Research` and `health research` are the same domain), so the
check is decidable, language-independent, and provable by a test. `health-advisor` first
tried to keep patient data out by INSPECTING the lesson text; seven rounds of
cross-model review could not make that correct, because "is this about a person?" is a
question about meaning. It then filtered each command that emits lesson text, and review
produced five more such commands the moment four were closed. What finally held is
neither: health lessons are written to a SEPARATE store and never reach this one. The
hold-out remains as a second line — and note what it does NOT claim: it governs the
export, not the local store, and it does not make any lesson safe to publish.

The hold-out always says how much it withheld. A silent one would let you believe you had
exported the whole store, and would make a BROKEN hold-out look exactly like an empty
domain.

### Semantic recall (vector tier)

`dz recall` is **hybrid** when the vector tier is available and **exactly the old lexical command** when it is not — enabling it never changes behavior for projects that skip it.

#### The apply leg — learned lessons injected into the prompt that needs them

A feedback loop has three legs: **collect → rank → apply**. dz collected automatically and never read
back: learned lessons reached an agent only when `feature-adr` asked, or when a human typed
`dz recall`. A store nobody reads is a write-only log.

Two hooks close the loop:

| hook | what it does |
|---|---|
| `.claude/helpers/dz-embed-daemon.mjs` (SessionStart) | holds the embedder resident and answers recall over a unix socket |
| `.claude/helpers/recall-hook.cjs` (UserPromptSubmit) | scores your prompt against the store and injects only what clears the relevance floor |

**Silence is the feature.** When nothing is relevant the hook prints nothing at all. The floors are
MEASURED, not chosen: on a 32-probe labeled set (16 RU + 16 EN, half irrelevant) a max-cosine floor of
`0.38` for Cyrillic prompts and `0.31` for Latin ones classified every probe correctly. `"спасибо"`
scores `0.259` and `"какой статус?"` `0.318` — both stay silent.
A z-score `(max−mean)/sd` was tried and **failed at 69 % accuracy** (MEASURED — reproducer `npx vitest run test/recall-hook-policy.test.ts`).
Why it fails: an off-topic query has a flat similarity profile, so its best hit
stands out relative to its own mean. A prompt shorter than `10` characters or carrying fewer than two
content tokens is skipped outright — a bare `"json"` really is close to technical lessons, but carries
no intent.

**Cost, stated honestly.** Loading the embedder takes ~1478 ms; a warm embed takes 6–8 ms. Without a
resident model the hook would add ~2 s to every prompt and you would switch it off within a day. With
the daemon a turn costs **50–83 ms**, and **37 ms** when the daemon is absent (it then stays silent
rather than blocking). The daemon holds the model in memory — **~427 MB RSS** — and exits after 30
minutes idle. It refuses to start twice and opens the store read-only, so it can never be the writer
that tears a database file for a concurrent reader.

Nothing about it can stall a turn: no daemon, no deps, a malformed payload, a slow socket — all exit 0
in silence.

```bash
# ask in plain language; the hook has already surfaced the relevant lessons
"почему codex барьер даёт ложный grade D"      # → injects the matching lesson (0.63)
"спасибо"                                       # → nothing injected
```

Disable it by removing the two hook entries from `.claude/settings.json`; stop the daemon with
`printf '{"op":"stop"}\n' | nc -U .dz/embed.sock`.

#### Cleaning the store: dry-run first, always

The learned store lives in a git-ignored `.dz/` and has no history. A wrong sweep cannot be undone,
so both destructive surfaces **preview by default** and snapshot before they delete.

```bash
dz consolidate --prune-noise            # DRY RUN: names every record it would remove
dz consolidate --prune-noise --apply    # snapshots to .dz/patterns-pre-prune-<ts>.json, then removes

dz recall --forget <dzId>[,<dzId>…]     # DRY RUN
dz recall --forget <dzId> --apply       # snapshots, then removes exactly those records
```

They cover **different** junk. `--prune-noise` removes what `isNoiseInsight` recognises: tool
telemetry and system-wrapper "user responses" — text that was never a lesson. It cannot reach a record
that is structurally fine but semantically worthless (this repo's store carried `mismatch probe A`,
written by a `dz teach --project` path bug). `--forget` is for those: it takes explicit ids, which you
find with `dz recall --all --json` or in the `never read` list of `dz recall --usage`.

An unknown id exits `1` rather than reporting a successful removal of nothing. After `--forget`, run
`dz vector reindex` — the lexical store and the vector mirror are separate copies.

> **Behaviour change:** `--prune-noise` used to delete immediately. It now previews; pass `--apply`.

#### Measuring the loop: usage, not size

`N patterns stored` proves nothing about a learning system. The only question that matters is *were
the lessons ever read?* — and the answer is usually humbling. So the statusline reports both:

```
🎓 dz: 103 patterns · 3 used · 🧠 2 sources
```

```bash
dz recall --usage          # how many were read, which most, which NEVER
dz recall --usage --json   # {totalPatterns, usedPatterns, neverReadPatterns, top, neverRead, …}
```

`neverRead` is the dead weight — patterns that have never once matched a real prompt. It is the input
a future prune should consider, and the diagnostic that would have exposed a missing apply leg years
earlier. (It also surfaces junk that should never have been learned: on this repo it immediately
revealed patterns extracted from task-notification text.)

Every injected hit is appended to `.dz/recall-usage.jsonl` — append-only, no locks, no schema. The
embedding daemon opens the pattern store **read-only** and never writes, so it can never be the writer
that tears a database file for a concurrent reader; the hook does the recording instead. The count and
the last-read timestamp are derived from the **same records**, so they cannot disagree the way
agentic-qe's do (its top row shows `usage_count = 1326` with `last_used_at: never`). The log is bounded:
past `1 MiB` it compacts read events into aggregate rows that preserve both counts and timestamps.

Recording never costs the injection: an unwritable log, a torn last line, a missing module — the hook
still injects, still exits 0. Instrumentation must not break what it measures.

#### Cross-lingual recall, and changing the embedding model

The default embedder (`Xenova/paraphrase-multilingual-MiniLM-L12-v2`) is **multilingual**: a Russian
question finds an English lesson about the same thing. The legacy English-only model gives no such
signal — measured on a real corpus, a relevant Russian query scored `0.018` against an English pattern
and an irrelevant one `0.017`, a gap of `0.001` that no threshold can separate (MEASURED — reproducer:
a cosine probe over `pipeline('feature-extraction', <model>)`).

Machine-translating the query first is **worse**, not simpler: it deletes the technical identifiers the
two languages already share (`codex`, `grade D`), which is exactly where the signal lives.

If you pin a different model in `.dz/config.json` (`memory.agentdb.embeddingModel`), you must re-embed —
vectors from two models are not comparable even at the same dimension:

```bash
dz vector reindex     # re-embeds learned vectors, stamps the manifest, snapshots first
dz brain reindex      # the brain's book vectors live in their own store
```

`dz vector reindex` is **atomic**: it snapshots, and a mid-way failure restores the store rather than
leaving it stripped of the rows it deleted. It also **warns** about task types it does not own (they
stay in the previous embedding space until their own reindex runs) instead of leaving that silent.
Only models listed in `KNOWN_EMBED_DIMS` are accepted — the store's `vectorDim` is 384, so a 768-dim
model is rejected rather than silently writing mismatched vectors.

**Before → after** (what changes when you enable it):

| | Before (lexical only) | After (hybrid vector tier) |
|---|---|---|
| Match | exact tokens / FTS5 stems | + **semantic similarity** (paraphrases, synonyms) |
| `recall "how do I stop repeated DB lookups"` after teaching *"Use DataLoader to batch DB round-trips"* | ✗ miss (no shared words) | ✅ hit (same meaning) |
| Engine absent | works | **byte-identical** behavior (`--semantic` → honest exit-1 ask) |

**Scenario** — you taught a lesson weeks ago, now you search for it in *different words*: with the lexical tier `dz recall "how do I stop repeated database lookups"` misses the DataLoader lesson (zero shared keywords); with the vector tier it surfaces by **meaning**. Walk-through:

```bash
dz setup --target claude-code --memory agentdb   # enables the vector tier (agentdb engine)
dz teach "Used DataLoader to batch DB round-trips" --reward 0.9 --domain performance
#   ↳ mirrored to vector tier (agentdb)           # best-effort, AFTER the lexical write
dz recall "fix N+1 queries"                       # hybrid: FTS5 + vector (RRF-merged), ⟨both⟩/⟨vector⟩ labels
dz recall "fix N+1 queries" --semantic            # weight the vector leg 2×; exit 1 if no engine OR nothing ranked (explicit ask)
dz recall "fix N+1 queries" --no-semantic         # force today's pure-lexical ranking
dz vector status                                  # engine, writer state, mirrored / pending / not-in-the-mirror
dz recall "fix N+1 queries" --json                # every hit carries `relevance` — the RRF score it ranked by
dz consolidate                                    # also BACKFILLS the mirror (heals failed/queued mirrors)
```

- **The TOP lexical match is never displaced by `--semantic`.** It keeps a reserved seat, so a rare identifier, a file name or an error code still surfaces when you weight the vector leg (MEASURED on a live store: survival 2 of 5 → 5 of 5). The seat is taken only under `--semantic`, and never from a hit BOTH legs found. Ties break by evidence — a hit both legs found outranks one only a single leg found.
- **Every claim the output makes follows what the run did.** The header says `+ vector (…)` only when a vector actually ranked something; with an empty tier it says `FTS5 only (semantic tier empty — run: dz vector reindex)` instead of promising a ranking that did not happen, and the `dz setup --memory agentdb` hint no longer fires at a tier that is already installed.
- **`dz vector status` counts like with like.** `Mirrored vectors (learned patterns)` covers exactly the scope the lexical count covers; vectors of other dz-owned task types (backlog ideas) are reported on their own line, and a true orphan — a pattern vector whose record is gone — is named for the first time. The old single number counted three task types while sitting under a one-task-type lexical count: on this repository it read 547 against 274, which looks like half the index orphaned, and 273 of those were backlog ideas with ZERO real orphans.
- **`dz vector status` distinguishes three states, not two:** `Mirror writer: ON/OFF` (whether teach is queueing at all) and `Not in the mirror: N` — mirrorable patterns in neither the mirror nor the pending queue, counted as a SET DIFFERENCE over ids. `Pending mirror queue: 0` no longer stands alone for "no debt": it used to read the same whether the queue was empty or had never been opened.
- **`dz teach --from-json` says so when the mirror writer is off** — carrying a brain to a new machine used to land a fully unindexed store that reported zero debt.

- **Optional by design:** no engine installed ⇒ `teach`/`recall`/`consolidate` behave byte-identically to the pre-vector versions; every engine call is time-bounded and failures degrade to lexical with one honest ℹ line.
- **The lexical store stays the source of truth** — vector hits are pointers; a pattern pruned from the store can never "resurrect" via the mirror.
- **Two portable forms:** `dz recall --all --json` = the SHARING form (patterns themselves, re-import with `dz teach --from-json`); `dz vector export <path>` = the VECTOR form (a portable `.rvf` checkpoint, opt-in `@ruvector/rvf` engine via `.dz/config.json` → `memory.vector.engine: "rvf"`).
- `--no-mirror` on `teach`/`consolidate` skips the vector tier entirely.

### The full learn cycle — export/import + harmonize (both non-destructive)

The learned store round-trips across machines in **two** formats, and de-duplicates **semantically** — all three halves are non-destructive:

| Half | Export | Import | Dedup on import |
|------|--------|--------|-----------------|
| **JSON (patterns / SHARING)** | `dz recall --all --json > patterns.json` | `dz teach --from-json patterns.json` | **exact pattern text** (idempotent; re-embeds on the agentdb backend) |
| **RVF (vectors)** | `dz vector export patterns.rvf` | `dz vector import patterns.rvf` | **UPSERT-BY-dzId** (idempotent; re-import adds 0) |
| **Harmonize (semantic dedup)** | — | `dz vector harmonize` / `dz teach --harmonize` | **cosine ≥ θ** (near-paraphrases, dry-run default) |

**Does `dz vector import` overwrite my store? NO.** Import is **upsert-by-dzId** (our vectors are keyed by the content-addressed `dzId`), so re-importing the *same* `.rvf` twice adds **zero** duplicates and **deletes nothing** — it only inserts new dzIds and replaces the embedding of dzIds it already knows. A dzId with no local pattern is an **orphan**: skipped + counted, with a hint to import the *text* first (`dz teach --from-json`), because embeddings are model-locked but text is not. (Grounded in RuVector's own upsert-by-id merge model — see [rUv RVF](https://github.com/ruvnet/ruvector); the shipped `@ruvector/rvf` SDK exposes no vector read-out, so import reads the `.rvf.idmap.json` dzId sidecar and re-embeds the local text under a **manifest guard** that refuses a foreign model/dim.)

**`dz vector harmonize` — semantic merge.** `dz teach --from-json` only dedups by *exact* text, so paraphrases survive: *"use DataLoader to batch queries"* and *"batch DB round-trips with a dataloader"* are separate rows. Harmonize finds near-duplicate **clusters** by cosine similarity (θ default `0.92`, `--threshold`), keeps the **highest-reward** member of each (tie-break: longer/more-specific text, then newer `ts`), folds reinforcement signal into the keeper (`uses = Σ member uses + drops`, `avgReward` = honest mean of observed member rewards, `mergedFrom` = dropped ids), then removes the rest only on `--apply`. Dry-run previews and writes nothing; apply writes a restorable backup first. It **never** drops a unique pattern. With no vector engine it degrades to **exact-text dedup + an honest note** — never throws.

**Learning signal seam.** Ranking reinforcement is behind `memory.learning.backend`: default `native` (bounded uses/recency/reward signal), kill switch `off`, and reserved `ruvector-gnn` (accepted by config with an honest fallback to native; no RuVector dependency is installed). `memory.learning.onRecallHits:false` disables the default recall-hit auto-bump. `dz teach --reinforce "<id-or-text>"` records an explicit use; `dz teach --guard` is opt-in and only reinforces near-duplicates at θ ≥ `0.95`, while a different reward still writes a new record. `dz recall --all --stats` shows store size, domains, top uses, duplicate groups, and re-teach/reinforce trend counters.

**Before → after** (one near-dup cluster):

```
Before:  [0.90] Use DataLoader to batch queries
         [0.60] batch DB round-trips with a dataloader     ← paraphrase, survives exact-text dedup
         [0.80] Always parameterize SQL

dz vector harmonize                # DRY-RUN (default) — previews, writes NOTHING:
  [keep 0.90] "Use DataLoader to batch queries"
    ↳ drop 0.60 "batch DB round-trips with a dataloader"  (cos 0.94)
  1 cluster(s), 1 kept, 1 dropped, 1 unique
  re-run with --apply to collapse these (a restorable backup is written first)

dz vector harmonize --apply        # writes .dz/memory/patterns.pre-harmonize.json, THEN drops:
After:   [0.90] Use DataLoader to batch queries           ← highest-reward member kept
         [0.80] Always parameterize SQL                   ← unique, untouched
  backup: .dz/memory/patterns.pre-harmonize.json  (restore: dz teach --from-json <it>)
```

**How to run the whole cycle:**

```bash
# Share patterns (lossless, portable, exact-text idempotent):
dz recall --all --json > patterns.json        #  export
dz teach --from-json patterns.json            #  import (dedups exact text; never overwrites)

# Share vectors (the RVF checkpoint half):
dz vector export patterns.rvf                 #  export (needs the opt-in RVF engine)
dz vector import patterns.rvf                 #  import — UPSERT-BY-dzId (never overwrites; orphans skipped)

# De-duplicate semantically (collapse paraphrases):
dz vector harmonize                           #  dry-run: preview clusters, write nothing
dz vector harmonize --apply                   #  collapse (backup written first; reversible)
dz teach --harmonize                          #  same thing — documented alias
```

### One canonical brain store — sharing + fragmentation recovery

The self-learning loop is only compounding if every run reads and writes the **same** store. Two things make that hold:

- **One brain grows across runs.** The `feature-adr` workflow pins its Step-0 `dz recall` and Step-8 `dz teach` to `args.brain` (default = the workspace root), so every run reads and writes the *same* `<brain>/.dz` store and the pool count in `dz statusline` climbs monotonically. Because `dz teach --project <dir>` writes to `<dir>/.dz` (not the process cwd), the lesson lands in the brain even when a code agent has `cd`'d into a target repo. Override `args.brain` with a stable absolute path to keep one brain across several target checkouts.
- **Share with colleagues (idempotent):**
  ```bash
  dz recall --all --json > patterns.json                 #  export the WHOLE store (SHARING form)
  dz teach --from-json patterns.json --project <brain>   #  import on their machine (exact-text dedup)
  ```
- **Recover an accidentally-fragmented store.** If a lesson was taught while cd'd into a stray repo (so it landed in `<stray>/.dz`), merge it back into the canonical brain — a JSON round-trip, no new tooling, dedup-by-exact-text so it is **idempotent** (re-running imports zero):
  ```bash
  cd <stray-repo> && dz recall --all --json > /tmp/stray.json   #  export the stray store
  dz teach --from-json /tmp/stray.json --project <brain>        #  merge into the canonical brain
  dz vector harmonize --apply --project <brain>                 #  optional: collapse near-dup paraphrases
  ```

- **Route by primary family, budget, or stage.** The `feature-adr` workflow accepts `primary=claude|codex`, per-family `budget=normal|eco|hybrid`, and an optional per-stage `models` map over `{router, requirements, research, adr, ideation, ddd, architecture, plan, code, qe, fleet}`. Each stage value is a **spec** — Claude `fable|opus|sonnet|haiku` or Codex `codex[:id[:reasoning]]` (ids incl. `gpt-5.5`, `gpt-5.6`). The **load-bearing default** routes unset QE to the other family than the actual coder; Codex QE uses `sol:high` under normal/hybrid and `terra:medium` under eco, with a loud Claude fallback if the selected id is unavailable. Precedence is `models[stage]` > legacy `planner`/`coder`/`qeReviewer`/`codexModel` knobs > primary/budget defaults > session-inherited. Omitting every routing knob keeps the inherited session path; the result reports `modelsUsed`.
  ```js
  // Claude codes, Codex independently QEs (cross-model by construction):
  Workflow({ scriptPath: '.claude/workflows/feature-adr.js',
    args: { slug: 'add-oauth', description: '…', tier: 'L', models: { code: 'opus', qe: 'codex:gpt-5.6:high' } } })
  ```

**"Verify the whole thing is healthy."**
```bash
dz doctor                                        # node, skills, backend
claude mcp list                                  # agentdb ✔ Connected
dz teach "ping" --reward 0.5 && dz recall "ping" # end-to-end lexical loop
```

**"What do the session hooks do?"** — With `--memory agentdb`: an instant metadata row into `dz_session_events` inside the shared `.dz/agentdb.db` on session start/end (telemetry — deliberately outside the vector index; degrades to an honest `sessions.jsonl` marker only if `better-sqlite3` is unavailable). **On SessionEnd the hook also fires a detached `dz consolidate`**: it harvests the session's *learnings* (tool-use + checkpoint outcomes) into the lexical store and mirrors each new one — with real embeddings and its real harvested score — into the vector index, so `agentdb_pattern_search` recalls them next session. Real-time learnings can still be stored in-session via the `agentdb_*` MCP tools. With the default jsonl backend: an honest `sessions.jsonl` start/end marker, no vector store.

**"Do I ever need to run `dz consolidate` myself?"** — **Yes, periodically.** Hooks only *collect* (telemetry + raw session logs); `dz consolidate` is what *distills* them into reusable patterns. The SessionEnd trigger helps, but it fires only on clean session ends — make consolidation a deliberate habit (after a meaningful work session, or weekly), then inspect what got learned with `dz recall --all`. Reviewing learnings is a human loop, not a background job. Symptom of skipping it: `dz recommend` and recall stop improving while session logs keep growing — collection without consolidation is just telemetry.

**Quick command reference** (the ones people reach for):
`dz registry [search <q>] [--category <c>]` · `dz recommend "<task>"` · `dz init --select <ids>` · `dz setup --memory agentdb` · `dz teach` · `dz recall [--all --json]` · `dz consolidate` · `dz doctor` · `dz list` · `dz info <id>`

---

## How it works

- `dz init` compiles canonical skills from the [agentskills.io](https://agentskills.io) standard into the target platform's layout
- Writing is **additive** — existing files are never overwritten without `--force`
- All 5 platform adapters produce **byte-identical** output (ADR-005)
- `dz doctor` runs 7 health checks (node version, adapters, config, SQLite, skills)
- `dz migrate` detects legacy keysarium/bto installations and recommends migration path

---

## Use Cases

### 1. Short-term product research (one-off study)

**Goal:** Quickly research a product idea, competitors, market — get a structured report.

```bash
# Option A: via dz CLI
dz init --target claude-code --preset meta
# Then in Claude Code:
#   /explore "Research the market for AI-powered code review tools"
#   /feature-adr "Summarize findings into an ADR"

# Option B: via keysarium (full 7-phase pipeline)
npx @dzhechkov/keysarium init
# Then in Claude Code:
#   /casarium "AI-powered code review tools — market analysis"
#   → Phase 0: Discovery → Phase 1: Exploration → Phase 2: Paranoid Research
#   → Phase 3: Solution Design → Phase 4: Architecture → Phase 5: Presentation
```

**What you get:**
- `meta` preset: `/explore` clarifies the problem → `/feature-adr` structures findings as ADR decisions
- `keysarium`: full 7-phase pipeline with dream cycles, background workers, and presentation generation

**Best for:** Quick study (hours), competitive analysis, technology evaluation.

---

### 2. Long-term product research (evolving over time)

**Goal:** Continuously gather data, add new sources, and "recalculate" the product vision as insights accumulate.

```bash
# Install keysarium (research pipeline) + evidence-wiki (knowledge base)
npx @dzhechkov/keysarium init
# Copy evidence-wiki plugin into your project:
npx @dzhechkov/evidence-wiki   # or git clone https://github.com/djd1m/evidence-wiki

npm install -g @dzhechkov/harness-cli
dz init --target claude-code --preset meta
```

**Workflow — iterative research cycles with evidence wiki:**

```
Week 1:  /casarium "Product X — initial research"
         → researches/ directory created with findings
         → .keysarium/memory/ stores patterns + reward scores

         /wiki-generate                              ← evidence-wiki
         → Scans researches/, ADRs, docs
         → Generates wiki/concepts/*.md (atomic pages with inline sources)
         → Builds wiki/graph.json (knowledge graph)
         → wiki/INDEX.md links everything

Week 2:  Add new data → /casarium "Product X — update with Q2 metrics"
         → Memory recalls Week 1 patterns (reward-calibrated learning)
         → New findings merged with existing, conflicts resolved

         /wiki-generate --check                      ← re-generates wiki
         → New concepts added, existing updated
         → Every claim verified: triple-pillar protocol requires N independent
           typed sources (ADR + methodology + research)
         → Stale concepts flagged, broken evidence links detected

         /triple-check wiki/concepts/pricing-model.md ← verify specific page
         → Checks that every factual claim has inline source citations
         → Flags unsupported statements

Week N:  /casarium "Product X — pivot analysis after customer feedback"
         → Full history in memory layer + evidence wiki
         → /harvest extracts reusable knowledge patterns
         → /wiki-generate rebuilds the entire knowledge graph
         → Product vision "recalculated" — the wiki IS the living product model
```

**The evidence-wiki advantage:**

| Without evidence-wiki | With evidence-wiki |
|----------------------|-------------------|
| Research in markdown files | Atomic concept pages with inline sources |
| Findings scattered across `researches/` | Interlinked knowledge graph (`graph.json`) |
| "I think we decided X" | Every claim has a cited source (triple-pillar) |
| Hard to see what changed | `/wiki-generate --check` diffs the knowledge base |
| No verification | `/triple-check` enforces evidence discipline |

**Key features for long-term research:**
- **Evidence wiki** (`@dzhechkov/evidence-wiki`): atomic concept pages where every factual claim carries inline sources; knowledge graph for cross-referencing; triple-pillar protocol (N independent typed sources per claim)
- **Reward-calibrated memory** (`@dzhechkov/memory` Reflexion): each checkpoint response trains the system — "ок" = excellent (1.0), feedback = good (0.7), rework = needs_work (0.3)
- **Agent SDK Dreaming**: between sessions, patterns are consolidated and distilled
- **`/harvest`** (knowledge-extractor skill): extracts reusable patterns from completed research into `lib/` templates
- **SQLite + FTS5 backend**: scales to 100k+ records with full-text search across all research sessions

**Best for:** Product strategy over months, continuous market monitoring, evolving product vision with evidence-backed decisions.

---

### 3. Product research + working prototype

**Goal:** Research the product AND build a functional prototype.

#### Option A: Sequential — research first, then code

```bash
# Step 1: Install research + development presets
npx @dzhechkov/keysarium init
# OR:
dz init --target claude-code --preset keysarium

# Step 2: Research phase
#   /casarium "SaaS platform for team retrospectives"
#   → Phase 0-2: Discovery, Exploration, Paranoid Research
#   → Phase 3: Solution Design (with CJM prototype)
#   → Result: researches/<slug>/ with full analysis

# Step 3: Switch to development
dz init --target claude-code --preset feature-adr

# Step 4: Build using research outputs
#   /feature-adr "Build the retrospective platform based on research in researches/<slug>/"
#   → Step 0: Router classifies as L/XL
#   → Step 1-5: Requirements, ADRs, DDD, Architecture (informed by research)
#   → Step 6: Implementation plan
#   → Step 7: Code generation (with /frontend-design for UI)
#   → Step 8-9: QE review + fleet assessment
```

**What you get:** Research artifacts in `researches/`, then code in `features/<slug>/` + actual repository changes. Research directly feeds into ADR decisions.

#### Option B: Parallel — research and code simultaneously with p-replicator

```bash
# Install the full product development toolkit
npx @dzhechkov/p-replicator init

# Single pipeline: research → requirements → prototype
#   /replicate "SaaS platform for team retrospectives"
#   → Reverse-engineers similar products (reverse-engineering-unicorn)
#   → Generates SPARC PRD (sparc-prd-mini)
#   → Validates requirements (requirements-validator)
#   → Creates the project structure (pipeline-forge)
#   → Builds the prototype (cc-toolkit-generator-enhanced)
#   → Reviews with brutal honesty (brutal-honesty-review)
```

**What you get:** A working prototype generated from research in a single `/replicate` pipeline run. Faster but less deep than Option A.

#### Comparison

| Aspect | Option A (Sequential) | Option B (p-replicator) |
|--------|----------------------|------------------------|
| **Research depth** | Deep (7-phase keysarium) | Moderate (reverse-engineering) |
| **Code quality** | High (11-step feature-adr + QE) | Good (pipeline-forge + review) |
| **Time** | Days to weeks | Hours to days |
| **Best for** | Complex products, regulated domains | MVPs, hackathons, quick validation |
| **Packages** | `keysarium` + `feature-adr` preset | `p-replicator` |
| **Research artifacts** | `researches/` directory | Embedded in PRD |
| **Code artifacts** | `features/<slug>/` + repo changes | Generated project |

**Tip:** For maximum rigor, combine both — use `p-replicator` for a quick prototype, then run `/feature-adr --full-qe-extended` on the generated code for production-grade quality engineering.

---

### Retrospective contract checklist — `dz contract-check`

Audit a completed feature without starting or modifying the feature-ADR workflow:

```bash
dz contract-check --slug my-feature
dz contract-check --slug my-feature --json
```

The read-only adapter discovers the repository root, then reads only
`features/<slug>/01_requirements.md`, direct `features/<slug>/03_adr/*.md`, the QE report, and the
repository-relative evidence paths declared by that report. It writes no feature artifact, command
usage ledger, or checkpoint. Slug traversal, absolute/traversing evidence, symlink escape, and QE
self-citation are refused.

The source vocabulary is exact: `## Acceptance criteria`, one-line `AC-N: ...`, `## Confirmation`,
one-line `- Load-bearing property: ...`, and one-line `- Required automated check: ...`. The QE report
keeps its holistic Grade and adds one `## Contract checklist` fenced JSON payload:

```json
{
  "schema": "contract-checklist-verdict/1",
  "overallGrade": "A",
  "items": [{
    "id": "CC-1",
    "verdict": "met",
    "evidence": {
      "artifact": "packages/example/test/example.test.ts",
      "quote": "rejects the invalid example",
      "observedOutcome": "pass"
    }
  }]
}
```

Human output prints every `CC-N`, its verdict/evidence disposition, aggregate
contract/verdict/met/unmet/not-testable/invalid-evidence counts, the holistic grade, and one final
`contract-check: PASS|FAIL|NOT-ESTABLISHED` line. `--json` emits exactly one document carrying the
contract, report, per-item decisions, diagnostics, counts, grade, outcome, and exit code. Exit `0`
means every established item is `met`; `1` means readable contract/verdict/evidence violates policy;
`2` means invalid invocation or required artifacts/verdict block are unreadable or not established.

The command checks structure and declared artifact anchors; it does not judge semantic sufficiency,
run tests, replace the ADR Confirmation test, or replace independent cross-family QE.

The exact-vocabulary contract is fail-closed by design (ADR-001 D4 rejected a loose/heuristic
parser), and the real-world consequence is narrow coverage today: MEASURED against the three
features shipped the same night this command was built, it verified cleanly only against its own
requirements (21/21 items, grade C) and refused both `dz-deadwood` (a Given/When/Then acceptance
table, not the canonical `AC-N:` list) and `slop-lint` (a wrapped multi-line Confirmation field) with
a named, structural diagnostic rather than a false pass. Adopting it on an existing feature means
conforming that feature's `01_requirements.md`/ADR to the exact vocabulary above, or accepting the
refusal as the honest answer.

---

## Status

`harness-core v0.8.11` · `harness-cli v0.8.10` — **published 2026-09-02** (core 0.8.11 also carries
the Russian-catalogue stemming, the fixed `discrimination-check` / `mutation-gate` seams, `dz chain` and
`dz score --all`; see the harness-core README status): adds bounded
`volume-shadow/v1` publish observations with structured human/JSON/audit parity. All four remain
SOFT-only; incomplete evidence is unknown, and source-comment justification is out of scope.

`harness-core v0.8.10` · `skills-feature-adr v1.5.9` — **staged, not published:** the packaged
feature-adr workflow performs advisory top-3 micro-recall at the live Step 3 ADR choice and Step 6
plan-route choice. Every failure is fail-open; versioned `.fa-state/decision-recall.jsonl` rows make
receipt coverage and repeat-related outcomes derivable offline. The hypothesis is external `[SRC],
n=1`, books were silent on retrieval timing, and no runtime threshold gates a stage.

`v0.8.8` — **staged, not published.** `dz init` now reports exactly one MCP and one hook outcome,
adds `integrations-verify`, content-bound authorization, explicit skills-only opt-out, and named
partial-failure exits; only receipt-proven live registration may be called emitted.

`v0.8.7` — **honest ETA in the live 📐 feature-adr statusline.** The panel scans timestamped
same-tier checkpoint history only while a fresh run is visible, prints p25–p75 for the code leg,
and carries `n`, tier, and date window inline. Any remaining stage below n=3 says
`ETA: недостаточно истории`; absent/unreadable checkpoints fail open without `~0м`.

`v0.8.5` — **`dz restart-advisor`, the 83rd inventory command (80 documented top-level
help names).** It returns an explicit `restart-advisor/1` recommendation from confined QE-history
reads, never restarts or mutates the live pipeline, and reports not-established evidence with exit 2.
Publication and pipeline auto-integration remain outside this implementation step.

`v0.8.3` — **`dz contract-check`, the 82nd inventory command (79 documented top-level help
names), alongside `dz lint`.** Contract checking is read-only and structural; ADR Confirmation and
independent QE remain separate. Publication remains outside this implementation step.

`v0.8.2` — **`dz profile` (the 79th command), hardened by four cross-family review rounds until one came back clean.** Say once who you
are — register, language, deep and weak domains — and every Claude session on the machine loads it from a marked block in
`~/.claude/CLAUDE.md`; the store lives at `~/.dz/profile.json` (0600, never inside a project, redacted from training-pair capture).
The review ladder did what it exists to do, each round finding a hole in the previous round's fix: a marker literal could enter the
profile through `set` and poison every later sync (refused at the one validation seam all write paths cross); the CLI echoed
`language: <value>` BEFORE a refused write exited 2 — a success-looking confirmation of a mutation never applied (echo now deferred
until the write lands); the validation boundary itself could throw (`JSON.stringify(2n)` is a TypeError) through the documented
never-throws contract of `syncProfileBlock` (the validator is now total); and the catch path formatting the thrown value could throw
too — conversion hooks run on the thrown value, so a hostile getter throwing `Object.create(null)` blew up the catch itself (coercion
now sits under its own try with a fixed fallback). Round 8 reviewed the final state and returned no findings, executing the tests
(22/22, MEASURED — reproducer `npx vitest run test/profile.test.ts` in `packages/@dzhechkov/harness-core`) and typecheck itself.
Release gates: tests / syntax / smoke green across 54 packages (MEASURED — reproducer `dz release --filter harness`, verdict
2026-08-28: tests 32 passed, syntax 215 passed, smoke 19 passed); the audit gate is red on advisories
that live ONLY in workspace dev tooling — the published pair's runtime deps are workspace siblings plus `proper-lockfile` and `yaml`,
none affected — taken through the gate's own documented fallback with the scoping fix filed.

`v0.7.8` — **the observability pass, one new verb, and a publisher that stops rewriting history.** `dz feature-adr-record --backfill` fills the
run-cost ledger from the host's own workflow record — dry-run by default, `--yes` writes atomically.
A derived number is MARKED (`filledFrom`/`filledBy`), a number you typed is never overwritten and any
disagreement is reported, and every unfillable row comes back NAMED rather than silently skipped.
Two ambiguities are REFUSED rather than guessed: a slug matching more than one run, and a run claimed
by more than one row — writing the same total into an L/XL feature's `plan` and `full` rows would
double-count it for anyone who sums the column. Only `tokens` is derived; minutes and agents stay
null because the run record exposes no duration and the ledger's `agents` column means a different
quantity than the spend-bearing agent ids.

Ledger rows now carry a join key at all: the sandboxed workflow cannot know its own run id, so
`dz feature-adr-record --kind ledger` resolves it at WRITE time — the only moment the run is
unambiguous — and stamps it as `runIdSource: 'resolved-at-write'`, because a resolved id is an
inference and not something the pipeline knew.

`dz publish` stops relabelling old changelog entries. Keeping the README footer in lock-step with
the bump was done by replacing every occurrence of the outgoing version, which rewrote the heading
documenting what that release contained — four headings in one shipped README had collapsed onto one
version. Entry-shaped lines are now left alone; footers and install examples still move.

`dz feature-adr-checkpoint` stamps the write instant, so "how long did this stage take" becomes
answerable for every future run. `dz doctor` reports AQE store integrity from a log that had 1508
rows and no readers. `dz score` gains an `observability-declared` discipline: does the architecture
artifact say how anyone would know this feature works? Descriptive, never a gate.

`v0.7.6` — **`dz drift-check` and `dz sync-canonical` stop being a `.claude/skills` gate.** Skill-copy
discovery searched `packages/` plus one hardcoded install root, so the four other per-target install
trees were ungated — measurably: this repo's own Codex install of `feature-adr` under `.agents/skills`
drifted for a day while `dz sync-canonical feature-adr --check` reported "all 3 copies match
canonical" and the HARD `no-skill-drift` rule passed. The copy was missing both the K1 section of its
`SKILL.md` and the C6 check of its gate script. Discovery is now driven by a target→install-root
registry, and the HARD rule runs at a new scope covering generated installs while exempting the
hand-edited dev tree (which legitimately lags — three real skills drift there today, so gating it
would be red-on-arrival). **The guard legitimately gets STRICTER: a publish that passed before can now
be BLOCKED by real drift in a non-`.claude` root — that is the gate working.** Target enrichment
written by `dz init --enrich` is exempt from both the drift verdict and the healer, so `sync-canonical`
cannot delete it. Also: `dz tg-post` gains `--max-per-day`, previously read by the code but
unregistered.

`v0.7.6` — **the channel sender stops trusting itself.** `dz tg-post` could format-check, provenance-check
and time-check a post and still publish it twice, or ten more times, or right through an operator who
wanted everything stopped: nothing counted what had already gone out. It now runs three guards FAIL-CLOSED
in a fixed order — a **stop-cord** file that halts even a perfect post before any cheaper check, **dedup**
keyed on the sha256 of the post's VISIBLE text rather than its bytes, and a **daily limit** (10 by default,
`--max-per-day <n>`) counted over the trailing 24h. The send journal is two-phase — `pending` written before
the network call, `sent` after Telegram accepts — so a crash in that window is caught by dedup instead of
double-publishing, and only accepted sends eat the ceiling. An unreadable journal refuses: an unreadable
counter does not prove the ceiling is unreached. The provenance gate additionally clears `kind: url` — a
well-formed http(s) URL is public by construction, while a `file://`, a bare path or a non-URL is refused
and never inferred from its shape. Also: `dz challenge` is now discoverable from the CLI's own help surface
(it existed and was reachable only if you already knew the name), and the adversary it assembles is fed all
five calibration documents rather than a subset.

`v0.7.5` — **a signature-only republish.** `0.7.0` shipped through `pnpm publish` rather than
`dz publish`, so the re-signing step was skipped and 17 of 497 files in the published core did not
match their signed hashes — the content was correct, the manifest was ten hours stale. Nothing in
the shipped behaviour changes between `0.7.0` and `0.7.7`; the integrity check stops reporting these
packages as tampered. The one code change is a TEST: the compat case that asserted the workspace
core sits exactly on `MIN_CORE` is split into an integration half and a boundary half, so a patch
bump of core no longer reddens it and `MIN_CORE` need not claim a version the CLI does not require.

`v0.7.0` — `dz recall` and `dz vector status` now say what the RUN did rather than what the config
allows. **One breaking change for scripts:** `dz recall --semantic` exits **1** when no vector could
serve it — the code the README already documented for the sibling "no engine" case, now applied on
every return path including `--json`, which used to report success. Also: the top lexical match keeps
its place under `--semantic`; `--json` carries a `relevance` field and parses whole even while the
embedder loads; the header names the empty-tier state instead of promising a ranking that did not
happen; `dz vector status` counts like with like and distinguishes "not queued" from "queued and
failed"; and a `--books` search that finds nothing says where it looked and, when the machine-wide
brain holds sources, names the command that searches them.

`v0.6.1` — two commands that move checks off the model's judgement and onto the disk.
`dz amendment-check` resolves every `AM-N` amendment row to a test found INSIDE the file the row names
(the plan is authoritative; an amendment it drops or rewords under the same id is a failure; `--all` is
a census that never blocks). `dz feature-adr-record` is the witnessed writer for the run-cost ledger
and training pairs: the payload arrives as an ARGUMENT rather than baked into a shell pipeline, a
malformed or wrong-kind payload is refused before any write, the timestamp is stamped before
serialising, and the append is verified by re-reading the tail. `MIN_CORE` moves to `0.6.1`.

**v0.6.0** — adds `dz feature-adr-checkpoint`, which writes the pipeline's durable checkpoint line as a
COMMAND instead of leaving a subagent to hand-write state into a file: a security classifier blocked
NINE consecutive hand-written checkpoint writes in one run, `.fa-state/checkpoints.jsonl` was never
created, resume was silently dead, and the run still reported success. The command measures every
declared artifact and refuses to persist a null result, absent or partial artifacts, or a stage that
declared no artifact at all. `MIN_CORE` moves to `0.6.0` and the dependency range with it — under 0.x
semver a caret pins the minor, so a range left at `^0.5.4` would install a core this build then
refuses at startup.

**v0.5.4** — **published 2026-08-20** (0.5.3 is deprecated — the core it pinned could not be installed). No CLI behavior change of its own: released in lockstep with
`@dzhechkov/harness-core@0.5.3` and pinned to it, so a fresh install gets the per-sibling design
checkpoint in `/feature-adr` (one dead design agent no longer discards three finished siblings) and
its refusal gate (an incomplete design fan stops at the Step-5/6 boundary instead of planning off a
partial design). The compat floor is unchanged — this CLI uses no new core export.

**v0.5.1** — published 2026-08-20. Ships `dz workflow run`, the portable plan enactor: it INTERPRETS a `loop-plan/1` plan instead of executing a rendered script, dispatching to `codex exec` or an isolated `claude -p`, exit 0/1/2/75 (75 = a typed pause whose last stdout line is a `wf-pause-envelope/1`). Requires `@dzhechkov/harness-core >= 0.5.1` (the compat guard refuses below it by name). See "Who writes the trace" above for the stated scope of the cross-host equivalence claim — it is narrower than "the two hosts agree".

`v0.5.0` — published. Also available as [Claude Plugin](#claude-plugin). Part of [DZ Harness Hub](https://github.com/djd1m/dz-harness-hub).

New in 0.5.0 (feature `qe-bridge-claude`, cross-runtime leg 3/4): `dz qe-bridge --family claude`
runs an INDEPENDENT Claude reviewer from any host — a Codex session included — and lands a PARSED
signoff whose grade must agree across three LAST-anchored channels; an empty or gradeless answer is
a named failure with a forensic record, never a clean review. `withNamedLockSync` generalises the
store lock and now guards the `$CODEX_HOME/hooks.json` read-merge-write, so two dz processes can no
longer lose each other's hook entries.

Also in 0.4.8 (feature `crossrt-1-agents-md`): `dz agents-sync` ports the fixed registry of bearing
rules into an early root-`AGENTS.md` fence, `--check` exposes source drift to CI, and both surfaces
report the measured Codex project-doc byte budget. A live cold-start probe, not file presence,
remains the runtime acceptance gate.

New in this change (feature `dz-cli-defects`, slice A — three defects confirmed by RUNNING the CLI, then fixed):

- **`dz list` skips and collects** — one unparseable `SKILL.md` no longer hides the rest; the broken files are named on stderr and the exit code stays 1. Same for `dz init` / `dz install` / `dz sync`. [Details](#dz-list--one-broken-skill-never-hides-the-rest)
- **`--target` aliases + did-you-mean** — `--target claude` (and `cc`, `agents`, `gpt`/`openai`) resolve; typos are suggested, never silently accepted. [Details](#--target-aliases-and-did-you-mean)
- **A named refusal instead of a `SyntaxError`** — `dz` now requires `@dzhechkov/harness-core >= 0.4.7` (was `^0.4.0`, which npm could legally resolve to a core too old to link) and says so in words, before anything is imported.

Previously: the global `dz --version` / `-v` / `dz version` surface (one parseable line), and `dz skills-verify --plugin-dir` / `--expect-commands` so slash-command registration is gate-visible. Both exist for `@dzhechkov/loop-designer-plugin`, which requires `dz` in `^0.4`, verifies it at run time, and falls back to `npx -y @dzhechkov/harness-cli@^0.4` when the `dz` on PATH is stale, unparseable or missing.

## Claude Plugin

DZ Harness Hub is available as a Claude Code plugin:

```bash
# Via marketplace (when published):
claude plugin marketplace add djd1m/dz-harness-hub
claude plugin install dz-harness-hub@dz-harness-hub

# Or test locally:
claude --plugin-dir /path/to/dz-harness-hub

# Generate plugin manifest from current inventory:
dz plugin --version 0.3.86
```

The `.claude-plugin/` directory contains `plugin.json` + `marketplace.json` compatible with [pi-claude-marketplace](https://npm.im/pi-claude-marketplace) and [skill-hub](https://npm.im/@jasonwen/skill-hub).

## Related Projects

### Skill sources

- [agentic-qe](https://github.com/proffesor-for-testing/agentic-qe) — 20 QE skills + 55 agents (test generation, coverage, chaos, QCSD swarms)
- [ECC](https://github.com/affaan-m/ECC) — 20 curated skills (agent patterns, autonomous loops, docker, git workflows)
- [AgentShield](https://github.com/affaan-m/agentshield) — Security scanning (170 rules for .claude/ configs)
- [Understand-Anything](https://github.com/Lum1104/Understand-Anything) — Codebase knowledge graph → architecture context

### Platform & infrastructure

- [AgentDB](https://github.com/ruvnet/agentdb) — Self-learning vector memory (`--memory agentdb`, 41 MCP tools)
- [agentskills.io](https://agentskills.io) — Open standard for SKILL.md format (adopted by all 5 platforms)
- [OpenAI Codex](https://github.com/openai/codex) — 2nd target platform
- [OpenCode](https://github.com/sst/opencode) — 3rd target platform (160K+ stars)
- [Hermes Agent](https://github.com/NousResearch/hermes-agent) — 4th target platform
- [OpenClaude](https://github.com/gitlawb/openclaude) — 5th target platform (28K+ stars)

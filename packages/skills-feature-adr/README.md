# @dzhechkov/skills-feature-adr

**Spec-Driven Development pipeline for AI coding agents (Claude Code, Codex, …)**

An 11-step, complexity-routed pipeline that makes an AI coding agent build a feature the way a
disciplined engineering team does: **spec first, code last.** Every phase emits a durable,
versioned, human-approved **specification artifact** (`00_…`–`09_…`), and code is *generated from
the frozen spec* — not reverse-documented after the fact. Scales from a 3-file config change to a
cross-cutting 30+ file refactor via a Complexity Router (S/M/L/XL). Integrates 15 skills from
[agentic-qe](https://github.com/proffesor-for-testing/agentic-qe) for quality engineering. Part of
the [Keysarium](https://www.npmjs.com/package/@dzhechkov/keysarium) ecosystem.

> **For your team:** the `features/<slug>/` folder this produces *is* the spec — reviewable in a PR,
> onboarding doc for free, every decision captured as an ADR, and machine-checked back against the
> code by the QE phase. See **[Spec-Driven Development](#spec-driven-development-sdd)** below.
>
> 👉 **Onboarding a team? Start here:** [**Feature ADR — Team Onboarding**](https://github.com/djd1m/dz-skill-bundles/blob/main/docs/feature-adr-team-onboarding.md) — a single read-top-to-bottom playbook (install → first feature → SDD mechanics → model routing incl. Fable → self-learning layers → team PR workflow → FAQ). It also ships **inside this package** at `node_modules/@dzhechkov/skills-feature-adr/docs/team-onboarding.md` ([raw copy on unpkg](https://unpkg.com/@dzhechkov/skills-feature-adr/docs/team-onboarding.md)), so every install has it locally.

---

## Quick Start

```bash
# Core install (feature-adr pipeline only)
npx @dzhechkov/skills-feature-adr init

# Full install with learning + knowledge extraction
npx @dzhechkov/skills-feature-adr init --with-learning --knowledge-extractor

# Or install globally
npm install -g @dzhechkov/skills-feature-adr
skills-feature-adr init --with-learning --knowledge-extractor

# Already have @dzhechkov/keysarium? Just install core (learning & harvest included)
npx @dzhechkov/skills-feature-adr init
```

After installation, open Claude Code in your project directory and use `/feature-adr`.

---

## What You Get

| Component | Count | Description |
|-----------|-------|-------------|
| **Skill** | 1 | `feature-adr` — 11-step pipeline with complexity routing |
| **Modules** | 12 | Steps 00-09 + 03.5 + opt-in 10: Router → Requirements → Research → ADR → QCSD → DDD → Architecture → Plan → Code → QE → Fleet QE → Delivery Gate (opt-in) |
| **References** | 4+15 | Complexity matrix, ADR/C4/QE templates + 15 agentic-qe skill protocols |
| **Examples** | 1 | Sample M-tier feature output |
| **Command** | 1 | `/feature-adr` — orchestrator (supports `--full-qe` and `--full-qe-extended`) |
| **Rules** | 1 | `feature-adr-conventions` — directory structure and naming |
| **Shards** | 1 | `feature-adr` — governance shard with quality gates |

Everything is installed into your project's `.claude/` directory and works natively with Claude Code.

---

## Commands

```bash
npx @dzhechkov/skills-feature-adr                    # Full install (same as init)
npx @dzhechkov/skills-feature-adr init               # Install core components
npx @dzhechkov/skills-feature-adr init --with-learning                  # + reward learning
npx @dzhechkov/skills-feature-adr init --knowledge-extractor            # + knowledge extractor
npx @dzhechkov/skills-feature-adr init --with-learning --knowledge-extractor  # + both
npx @dzhechkov/skills-feature-adr init --force       # Overwrite existing files
npx @dzhechkov/skills-feature-adr init --dry-run     # Preview without making changes
npx @dzhechkov/skills-feature-adr update             # Update to latest version
npx @dzhechkov/skills-feature-adr remove             # Clean uninstall
npx @dzhechkov/skills-feature-adr list               # Show installed components
npx @dzhechkov/skills-feature-adr doctor             # Health check
```

---

## Feature ADR Pipeline

```
Step 0        Step 1          Step 2       Step 3      Step 3.5      Step 4
COMPLEXITY → REQUIREMENTS → RESEARCH  →   ADR    →  QCSD SWARM  →   DDD
  ROUTER                   (L/XL only)  (M+ only)   (M+ only)    (L/XL only)

Step 5         Step 6            Step 7     Step 8     Step 9
ARCHITECTURE → IMPLEMENTATION →  CODE   →   QE    →  FLEET QE
(M+ only)       PLAN                                (L/XL only)
```

### Usage in Claude Code

```bash
# Start the full adaptive pipeline
/feature-adr Add user authentication with OAuth2 and JWT

# The Complexity Router classifies your feature automatically:
#   S  → fast track (5 steps)
#   M  → standard (8 steps)
#   L  → full pipeline (11 steps)
#   XL → full DAG + multi-agent swarm

# With full agentic-qe integration (requires: npm install -g agentic-qe)
/feature-adr --full-qe Add payment processing module
# Full protocols for 9 core skills, same agents, deeper methodology

# With extended agentic-qe (chaos, security, performance, mutation, TDD)
/feature-adr --full-qe-extended Migrate authentication to zero-trust architecture
# Full protocols + 6 extra skills, up to 7 fleet QE agents
```

### The K2 plan gate runs on ANY repo, not just JS/TS ones (v1.5.0)

Between Step 6 and Step 7 the pipeline runs a machine plan-completeness gate (K2). Until v1.5.0 it
could not finish a run on a non-JS repository — three separate defects, all closed here.

**1. Test paths in every ecosystem.** C2 checks that each ADR's Confirmation names a test file and
that the plan names the same path. It used to demand a `.test.(ts|mjs|js)` suffix, so on a Python,
Go, Rust, JVM or .NET repo it found nothing and failed the plan (measured: 4/4 JS forms matched,
0/11 non-JS forms did). It now uses a two-stage predicate — candidate paths are extracted from the
Confirmation text, then matched against one anchored rule per ecosystem:

| Ecosystem | Recognised |
|---|---|
| JS/TS | `*.test.*` / `*.spec.*` (`ts tsx mts cts mjs cjs js jsx`) |
| pytest | `test_*.py` **and** `*_test.py` |
| Go | `*_test.go` |
| Rust | `tests/*.rs` **and** `tests.rs` |
| JVM | `*Test|Tests|IT|Spec.(java kt kts scala groovy)` |
| .NET | `*Test|Tests.(cs fs vb)` |

Deliberately NOT "any path containing the word test": `docs/testing.md`, `src/latest.rs`,
`contests/results.py` and a sentence like *"the staleness test will verify this"* are all refused. A
gate that passes prose is worse than one that fails Python. An unknown ecosystem is still a FAIL,
never a warning — the message names the recognised set and points at the override below.

**Extending the vocabulary — `testPathRules`.** Add rules to the manifest the pipeline already
reads, `architecture/project-skills.json` (no second dotfile):

```json
{
  "testPathRules": [
    { "ecosystem": "elixir", "pattern": "(?:^|/)test/[^/]+_test\\.exs" }
  ]
}
```

Rules are ADDED to the built-ins, never replace them, and each pattern is anchored by wrapping
(`(?:<pattern>)$`) so every branch of an alternation is anchored. A malformed `testPathRules`
(bad JSON, not an array, missing `ecosystem`/`pattern`, an invalid regex, over 200 characters, or a
nested quantifier) is **NOT-ESTABLISHED, exit 3** — never a quiet fall-back to the built-ins.

**2. The gate script is found where it is installed — `args.gateScript`.** The skill lives in your
WORKSPACE; the gate command `cd`s into the TARGET repo, so a repo-relative lookup died with
`Cannot find module` on every repo that is not itself a feature-adr install. The resolution order is
now:

1. `args.gateScript` — an explicit ABSOLUTE path (validated: absolute, no `..`, or the run fails loudly);
2. the WORKSPACE copy (`$WS/.claude/skills/feature-adr/scripts/check-plan-completeness.mjs`);
3. the target-repo copy.

Workspace before repo on purpose: the verdict contract is defined by the parser inside the running
workflow, so only that installation's own copy is known to speak it. Every run echoes
`K2_GATE_SCRIPT=` (which copy ran) and `K2_GATE_TRIED=` (all candidates) for audit. If none exists
the run refuses with reason `tooling-missing` — a NOT-ESTABLISHED, never a skip — and the operator
message says the gate could not be RUN and that this is **not** a plan defect.

**3. Dotfile targets are admissible; directory-shaped ones are not.** `EXPECTED_CODE_TARGETS` may
now name `.claude/…`, `.github/workflows/ci.yml`, `.gitignore`, `.env.example`. What is refused is
refused BY NAME: `path traversal ('..' segment)`, `degenerate path segment`, `empty path segment`,
`trailing slash — names a directory, not a file`, `path segment ends with '.'`,
`illegal character '<c>'`, `empty stem after the leading dot`. The old substring traversal test also
rejected the ordinary filename `foo..bar.ts`; it is a segment test now.

### The Step-8 amendment gate runs a command instead of judging (v1.5.7)

Every `AM-N` row must resolve to a test found INSIDE the file the row names, and the check is
`dz amendment-check --slug <slug> --json` rather than a paragraph asking the reviewer to confirm it.
MEASURED 2026-08-21: `features/qe-scoped-review` shipped with five named amendment test ids of which
none existed, while its plan recorded `## Amendments: None`. The gate did not fail — a prompt cannot.

The PLAN is authoritative when it carries rows (Step 6 owes "carry AM-N into the plan verbatim"), and
the rule that keeps that honest is coverage: an amendment the plan drops — or rewords under the same
id — is a failure. Renaming the TEST stays legitimate; tests are named later than ideation guesses.

The durable writers were migrated in the same release: the run-cost ledger and the training-pair
capture no longer hand a subagent a pre-baked shell string with their payload baked in — the shape a
security classifier blocked nine times in one run. Both call `dz feature-adr-record`, which refuses
before writing and verifies the append by re-reading the tail. A record failure still never fails the
run; it now survives it in `recordFailures`.

Requires `@dzhechkov/harness-core >= 0.6.1`.

### Step 0 writes the assessment down, and the acid check gets its input back (v1.5.0)

Step 0 classifies the feature and now **writes `00_complexity_assessment.md` before it returns** — the
tier with the criterion that decided it, the active steps, the recalled patterns, and an acid-case
table. MEASURED 2026-08-21: 66 of 199 features carried that file and the last four in a row did not,
with two silent consequences. The tier was recorded NOWHERE while a run was alive (the router
checkpoint lands at phase end and the result object only at the very end), so mid-run it had to be
guessed from which artifacts happened to exist. And the K2 gate reads its acid corpus from that file,
so the C4 check quietly switched itself off — including for the features that introduced it.

Acid rows are pinned to the exact shape the gate parses, `| A<n> | <the bad input> | <what must
happen> |`; a loose shape disables the check just as silently as a missing file. A feature with no
acid cases still says so in prose and writes no table — the gate now tells an ABSENT file (a warning
that names the missing artifact) from a deliberate skip.

Two ways the tier could still go unrecorded, both closed here:

- a **pre-contract router checkpoint** used to resume into the new contract. The resume gate only asks
  whether the artifact is PRESENT, and any of the 66 features carrying a tableless file satisfied it,
  so Step 0 never re-ran. A router-scoped hash token now makes those entries re-run — once, and only
  the router, rather than every in-flight stage.
- a **caller-forced `args.tier`** is now the tier of record. The run executes the override, so the
  file carries `Effective tier: <forced> (forced by the caller)` alongside the router's own
  recommendation, and sizes the acid table for the effective tier. With no override the prompt is
  byte-identical to before.

Requires `@dzhechkov/harness-core >= 0.6.0`.

### The Step-8 QE stage measures the run, not the room (v1.5.0)

Four separate ways the QE stage graded the wrong thing, all closed: the change set is this run's DELTA
(a pre-code baseline against the state after) instead of the working tree's current dirt, so an
unrelated dirty file can no longer grade your feature; a finding whose location cannot be parsed is
`unlocatable` and stays in the graded set, where it used to be filed as someone else's dirt — unknown
counted as clean, inside the function whose job is honest attribution; mode B refuses a scope built
from unlanded code, an unmeasured change set, or an empty intersection; and the QE scribe is
WITNESSED — the report is re-hashed before and after, so a file left by an earlier run can no longer
stand in for one this run never wrote.

### The design fan resumes per sibling, and an incomplete design is REFUSED (v1.4.0)

Step 1–5 run as one parallel fan — requirements, ADR, QCSD, architecture. Until v1.4.0 the whole fan
was ONE checkpoint entry, so a single dead agent discarded three finished siblings and the next
invocation paid for all four again. Each sibling is now checkpointed on its own
(`design:requirements` / `design:adr` / `design:qcsd` / `design:architecture`), keyed on what steers
**it** — its own prompt text included, so correcting one step's instructions re-runs that step and
leaves the others alone.

The other half is what the pipeline is allowed to CONSUME. An incomplete fan no longer flows into
Step 6: the run stops at the Step-5/6 boundary and returns `phase: 'design-incomplete'` rather than
producing a plan with no ADR behind it. Three distinct reasons, each with its own repair:

| Reason | What happened | Repair printed |
|---|---|---|
| `substage-missing` | a sibling agent died (often a Claude limit) | re-invoke — the finished siblings resume free; or route that stage to Codex |
| `artifact-missing` | every sibling reported success, but a required file is not on disk | under `resume:'force'` it says use `resume:'never'` — force skips artifact probes, so re-invoking would loop |
| `probe-not-established` | the check could not be trusted at all | inconclusive is never a pass — refuse, then re-run |

The artifact check never lists a directory. It asks `[ -f <exact path> ]` per required artifact,
because a listing is a list of filenames and the data can impersonate the frame: measured, a file
whose NAME ends in a newline satisfied the requirement for the real file. And since the check is
relayed by an agent rather than read from a pipe, the whole transcript is validated — an agent that
merely *narrates* the expected output emits the token byte-identically, and that produced a false
pass before this release.

Requires `@dzhechkov/harness-core >= 0.5.4`. **One-time cost:** the checkpoint schema moved to
`fa-ckpt-3`, so every existing `.fa-state/checkpoints.jsonl` reads as no checkpoint and each
in-flight feature re-runs router+design+plan once.

### Durable checkpoints + resume (v1.3.64)

Every expensive stage (router / design / plan / code / qe / fleet) checkpoints its result into
`features/<slug>/.fa-state/checkpoints.jsonl`. Re-invoking the workflow with the SAME slug resumes
completed stages instead of re-running them — covering both a **killed run** (previously a total
restart: the exact failure mode that motivated usage-adaptive routing) and the **standard L/XL
two-phase flow** (the `stopAfter: 'plan'` → `stopAfter: 'none'` re-invoke now resumes
router+design+plan for free).

```js
// run 1 (dies mid-code, or stops at the L/XL plan checkpoint)…
Workflow({ scriptPath: '.claude/workflows/feature-adr.js', args: { slug: 'add-x', description: '…' } })
// run 2 — same slug: completed stages resume, only the unfinished work runs
Workflow({ scriptPath: '.claude/workflows/feature-adr.js', args: { slug: 'add-x', description: '…', stopAfter: 'none' } })
//   → log: "checkpoint: router RESUMED … design RESUMED … plan RESUMED"; result carries resumedStages
```

Knobs: `args.resume: 'auto'` (default — resume only on input-hash match AND every tier-required
artifact present) · `'never'` (ignore recorded state) · `'force'` (trust the hash, skip artifact
probes); `args.checkpoints: false` disables the layer entirely. **Honest scope:** resume proves the
run *inputs* are unchanged and artifacts exist — it does NOT fingerprint the working tree; after
manual edits mid-feature pass `resume: 'never'` (or delete `.fa-state/`) and re-QE. A stale-input
checkpoint never resumes in any mode. RU: упавший L/XL-ран продолжает с места смерти, а не
пере-тратит выполненные стадии; штатный двухфазный L/XL-флоу тоже дешевеет — re-invoke после
план-чекпоинта возобновляет router+design+plan из чекпоинтов.

### Codex model routing (optional)

If [Codex](https://developers.openai.com/codex) is installed + logged in, the pipeline can route work to
Codex — **always asking first, always with a Claude fallback** (it never blocks on Codex). Three opt-in
knobs (via the workflow `args`, or offered interactively at the planning checkpoint):

| Knob | Step | What it does |
|---|---|---|
| `planner: 'codex'` | 6 Plan | plan on Codex's top model (Claude fallback) |
| `coder: 'codex-fallback'` | 7 Code | Claude first; **if the Claude Code limit is exhausted mid-run → retry on Codex** |
| `qeReviewer: 'codex-fallback'` | 8 QE/tests | same fallback for the review/testing stage |
| `codexModel: 'auto'` | — | which Codex model (`auto` default (Codex self-selects) · or an id your account exposes (e.g. `gpt-5.5`)) |

**Scenario — never stall on a rate limit:** a long L/XL feature hits the Claude Code session limit while
writing code. Without this the run stalls; with `coder: 'codex-fallback'` the pipeline logs *"Claude
unavailable (limit?) — falling back to Codex auto"* and finishes the code + tests on Codex, no
restart and no lost work.

**Codex writes are out-of-band — the Step-7.5 landed barrier waits for them.** Codex applies edits via
its own runtime, so a naive pipeline runs QE before the async write flushes and false-grades *"Step 7
never ran"* on real code. For a Codex-coded run the pipeline polls a **bounded 120s backing-off window**
(`1,2,2,5,5,10,10,15,20,25,25`s), preferring the code stage's *declared expected files* when known, and
emits an explicit `changed=0 after 120s — genuinely not landed` only when the window truly expires — so
QE distinguishes "not implemented" from "not yet flushed". A Claude-coded run is synchronous and skips
the barrier entirely (zero added wait). Note: if Codex flushes slower than 120s, re-verify after the run
rather than trusting the end-of-run grade.

```bash
# Headless login on a VPS (no browser):
codex login --device-auth                       # prints a code + URL you approve on another device
# — or —
printenv OPENAI_API_KEY | codex login --with-api-key
```

```js
// ultracode (the deterministic workflow form): plan on Codex, code+QE fall back to Codex on Claude-limit:
Workflow({ scriptPath: '.claude/workflows/feature-adr.js',
  args: { slug: 'add-oauth', description: '…', tier: 'M',
          planner: 'codex', coder: 'codex-fallback', qeReviewer: 'codex-fallback', codexModel: 'auto' } })  // 'auto' = Codex picks top; or pin e.g. 'gpt-5.5'
```

Omit the Codex knobs entirely for today's all-Claude behavior. The run result reports
`plannerUsed` / `coderUsed` / `qeReviewerUsed` / `codexModel` / `modelsUsed` so you can see who did what.

**Live model visibility in `/workflows`:** each stage's agent label is decorated with its *resolved*
model — e.g. `adr · codex:gpt-5.5:xhigh`, `plan · opus` — so you see which model actually ran a stage in
the live progress tree, not just in the final report. This matters because a Codex stage's auto
model-badge shows the `codex:codex-rescue` Claude wrapper (the session model), never `codex`; the label
text is the honest signal. A Claude fallback appears as its own distinct node (never mislabeled as Codex),
and a routing-off run adds no suffix (byte-identical to today).

### Per-stage model routing — `args.models`

The three Codex knobs above are shortcuts. `args.models` is the **general dial**: an optional map that
routes each of the 11 pipeline stages to an optimal model. Keys: `{router, requirements, research, adr,
ideation, ddd, architecture, plan, code, qe, fleet}`. Each value is a **spec** — Claude
`fable|opus|sonnet|haiku`, or Codex `codex` / `codex:<id>` / `codex:<id>:<reasoning>`
(`reasoning ∈ low|medium|high|xhigh`; ids incl. `gpt-5.5`, `gpt-5.6`, `gpt-5.6-sol` — the last is the
default auto-top reviewer; ids are account-specific, so probe with `codex exec -m <id>` before pinning).

**Recommended DEFAULT TABLE** (applied only when you opt in — one `args.models` key or any Codex knob
turns it on; otherwise every stage is session-inherited, byte-identical to today):

| router | requirements | adr | ideation | architecture | plan | code | qe | fleet |
|---|---|---|---|---|---|---|---|---|
| `fable` | `sonnet` | `opus` | `sonnet` | `opus` | `sonnet` | coder (default `opus`) | cross-model | `sonnet` |

(`research` folds into `requirements`, `ddd` into `architecture` — recorded in `modelsUsed`, not a
separate call.)

**Cross-model QE default (load-bearing):** when `args.models.qe` is unset, QE auto-routes to the **other
family than the coder** — a model that writes code must not also self-QE; independent cross-model review
catches what self-review misses. coder=Codex ⇒ QE=Claude (`opus`); coder=Claude ⇒ QE=Codex
(`codex:<top>:high`), or a Claude reviewer if Codex is unavailable (never blocks).

### Step 8 on Codex is SCOPED — two modes, and every fallback names its cause

When QE routes to Codex, Step 8 no longer hands it one unscoped `codex exec` prompt. Why, MEASURED
2026-08-21 — same question, same model (`gpt-5.6-sol`, effort `high`), three dispatches:

| dispatch | prompt | wall time | exit | verdict? |
|---|---|---|---|---|
| `codex exec`, unscoped | 19 038 chars | 280 s (and again under a 1500 s ceiling) | 124 | **none** — 416 KB of exploration |
| `codex exec`, scoped (*"read ONLY these two files"*) | 1 461 chars | 41 s | 0 | `Grade: B` + findings |
| `codex review --commit <SHA>` | scope from the diff | 146 s | 0 | verdict + findings |

The unscoped run spent its budget on **reconnaissance of the tree**, not on reasoning about the change.
So raising the timeout does not help, and the prompt-length ceiling was never the binding constraint
(19 038 sat under `CODEX_EXEC_PROMPT_CEILING_CHARS` = 24 000 with ~5 000 to spare). The cost is not the
wasted minutes: on timeout the dispatch returns `null`, the belt runs a Claude reviewer, and
cross-family QE is silently lost — on exactly the big features that need it most.

- **Mode A (primary): `codex review`.** The scope comes from the DIFF, so Codex computes for free the
  thing we were paying a model to do badly. Default scope `--uncommitted`; override with
  `args.qeScope: 'commit' | 'base'` + `args.qeScopeRef`. Two CLI facts are encoded as refusals, both
  measured: `codex review` rejects `-m` (exit 2 — the model goes through `-c model=`), and **every**
  scope flag rejects a positional prompt (`--commit`, `--base` and `--uncommitted` alike, exit 2). So
  mode A runs on Codex's built-in review instructions and cannot be asked our questions.
- **Mode B (follow-up): a NARROWED `codex exec`.** Carries our own questions over at most 3 named
  files with the load-bearing clause *"read ONLY these files, do not explore the repository"*, and
  ends with `Grade: <A|B|C|D>`. An unscoped mode-B prompt is not constructible: an empty file list
  returns `''` and `codexExecPlan` refuses an unscoped `qe` prompt outright.
- **The verdict is parsed, never synthesised.** A `Grade: D` is a SUCCESSFUL cross-family review; a
  review with no grade is a FAILED one. Mode A cannot state a letter, so its grade is DERIVED from the
  severities it reported and labelled `gradeSource: 'derived-from-findings'` — and **zero findings
  yields `null`, never `A`** (measured: `codex review` on a clean tree exits 0 with a polite, entirely
  empty review; calling that an `A` would be a review of nothing reported as a pass).
- **Every fallback names its cause.** The reason carried into
  `opus (cross-family QE DID NOT happen — …)` comes from a locked taxonomy —
  `timeout` (narrow the scope) · `no-verdict` · `tool-error` (fix the invocation) · `unusable-output` ·
  `unavailable` (fix the account/model) · `over-ceiling`. A timeout and an unusable output can never
  render the same string, because the operator's next move differs.
- **The pipeline still never blocks on Codex.** Both modes fail into the same Claude belt as before.

After a Codex verdict a cheap Claude agent transcribes it into `08_qe_report.md` (mode A takes no
prompt, so the reviewer cannot be asked to write anything). It is a scribe, not a second reviewer: the
grade is Codex's and is stated as final.

**Precedence:** `args.models[stage]` wins; the legacy `planner`/`coder`/`qeReviewer`/`codexModel` knobs
fill only unspecified stages. `codexModel` seeds the id for a bare `'codex'` spec. gpt-5.6-ready: a new
Codex id is a data-only allowlist edit.

```js
// Claude writes the code; Codex independently QEs it (cross-model by construction):
Workflow({ scriptPath: '.claude/workflows/feature-adr.js',
  args: { slug: 'add-oauth', description: '…', tier: 'L',
          models: { code: 'opus', qe: 'codex:gpt-5.6:high', architecture: 'opus', router: 'fable' } } })
```

### Usage-adaptive routing — pre-emptive Codex switch at ≥ 70% Claude usage

The `codex-fallback` knobs above are **reactive** — they catch a stage *after* it dies on a limit. At
true exhaustion even the fallback dispatch can die, so the pipeline also switches **pre-emptively**:
when model routing is opted into, it probes Claude **SESSION** (fixed-length transcript block) and
**WEEKLY** (fixed reset anchor such as `Wed 08:59`) usage at each phase boundary via `dz usage --json`
(from `@dzhechkov/harness-cli`), and moves the
remaining stages to Codex **before** hitting the wall.

| Knob (`args.*`) | Default | Effect |
|---|---|---|
| `usageAdaptive` | `true` when routing is requested; `false` otherwise | `true` forces it on by itself; `false` disables all probes (byte-identical to no-routing runs) |
| `usageThreshold` | `70` | the `>=` percent (SESSION **or** WEEKLY) that triggers the switch |
| `usageReasoning` | built-in map | per-stage reasoning under the override (design/code/plan → `xhigh`; router/qe/fleet → `high`) |

**Two-way, hysteretic, fail-safe:**

- `>= usageThreshold` on **either** metric ⇒ ALL remaining stages switch to `codex:<top>`.
- Both metrics back below (positive numbers, not nulls) ⇒ the normal model mix is **restored**.
- A probe whose agent **dies** (often *means* the limit was hit) fail-safe-switches to Codex; a
  value-null (limits not configured) flips nothing — no flapping, no false switches.
- A reactive belt remains: a stage agent returning null while not overridden also flips the switch for
  the *remaining* stages.

**Observability:** switched stages carry ` (usage-switched)` in `modelsUsed`; results include
`usageEvents` (`[{phase, sessionPct, weeklyPct, action}]`, action ∈
`switch|restore|keep|fail-safe-switch|reactive-switch|none`) and `usageThreshold`.

**Config (optional):** percentages are local-transcript **estimates**; claude.ai/settings/usage is
authoritative. They stay `null` — and never trigger a switch — until you set your plan's limits in
`.dz/config.json`. When `weeklyTokenLimitByModel` is configured, `weeklyPct` is the binding per-model
weekly estimate; otherwise it is the all-model weekly estimate.

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

```js
// Claude codes until usage crosses 70%, then every remaining stage runs on Codex until it drops back:
Workflow({ scriptPath: '.claude/workflows/feature-adr.js',
  args: { slug: 'add-oauth', description: '…', tier: 'L',
          models: { code: 'opus' }, usageAdaptive: true, usageThreshold: 70 } })
```

> Note: under the override, coder **and** QE both run on Codex — the cross-model self-QE guard is
> consciously suspended (a Claude QE reviewer is exactly the agent that dies under limit pressure). The
> ` (usage-switched)` suffix + `usageEvents` keep it auditable — and since v1.3.65 the suspension is a
> **machine debt**, not a note: the run writes `features/<slug>/.fa-state/reqe-due.json` (idempotent,
> run-stamped, crash-resume-safe) and returns `reqeDue: true`; after limits reset, `dz usage` shows a
> `re-QE due:` line, `dz reqe --slug <s>` prints the cross-family review brief, and
> `dz reqe --slug <s> --done --report <f>` settles FAIL-CLOSED — only against an existing graded
> report, never the run's own 08_qe_report.md (real-path and inode compared). RU: «перепроверь другой
> семьёй потом» стало долгом на диске с полным жизненным циклом.

---

## Spec-Driven Development (SDD)

Feature ADR is a **spec-driven** pipeline. The point is not to write documentation — it's to make
the **specification the executable contract** that drives the code, and to keep the agent from ever
skipping ahead to implementation before the spec is agreed. Three ideas make that real.

### 1. The artifacts *are* the spec — one layered document, built top-down

Each phase emits a spec artifact at a different altitude. Together they form a single, traceable
specification chain from intent to verified code:

| Artifact | Spec layer | Answers |
|----------|-----------|---------|
| `00_complexity_assessment.md` | **Scope spec** | How big is this? Which phases are even needed? |
| `01_requirements.md` | **Behavioral spec** | What must be true when we're done? (SMART, testable) |
| `02_research.md` | **Prior-art spec** | What patterns/analogues constrain the design? |
| `03_adr/00N-*.md` | **Decision spec** | Which option, and *why* — with ≥2 alternatives + trade-offs |
| `03.5_ideation_report.md` | **Quality-risk spec** | HTSM/SFDIPOT risks + a GO / CONDITIONAL / NO-GO verdict |
| `04_domain_model.md` | **Domain spec** | Entities, aggregates, invariants (DDD) |
| `05_architecture.md` + `diagrams/` | **Structural spec** | C4 + sequence diagrams; components & contracts |
| `06_implementation_plan.md` | **Task spec** | SPARC-GOAP milestones — the plan the code must follow |
| `07_code_changes/` | **The implementation** | Code in the repo + a `change_manifest.md` |
| `08_qe_report.md` / `09_fleet_qe_assessment.md` | **Conformance spec** | Does the code satisfy the spec? Traceability + gaps |

The spec is **version-controlled** (numbered files under `features/<slug>/`) and reviewable in a
pull request exactly like code. Code is **Step 7** — the second-to-last thing that happens.

### 2. The spec is a typed contract carried forward — not prose that gets ignored

Each phase's output becomes a **cross-phase variable** that downstream phases *consume as input*, so
a later phase can't silently contradict an earlier decision — it's building on a fixed upstream spec:

```
{REQUIREMENTS} → {RESEARCH_FINDINGS} → {ADR_DECISIONS} → {IDEATION_VERDICT}/{QUALITY_RISKS}
             → {DOMAIN_MODEL} → {ARCHITECTURE} → {IMPL_PLAN} → {CODE_CHANGES} → {QE_RESULTS}
```

e.g. Step 5 (Architecture) *requires* `{ADR_DECISIONS}` as input — "architecture without an ADR"
is a blocked anti-pattern. Step 7 (Code) consumes `{IMPL_PLAN}`; "code without a plan" is blocked.

### 3. Every spec layer is *gated* — machine-checkable + human-approved

Two gates guard the boundary between phases, so the spec is enforced, not aspirational:

- **Promise tags** — each phase must emit a completion token before the next may start:
  `FEATURE_ADR_ROUTED → …_REQUIREMENTS_GATHERED → …_DESIGNED → …_QUALITY_ASSESSED → …_ARCHITECTED
  → …_PLANNED → …_IMPLEMENTED → …_VERIFIED → …_FLEET_VERIFIED`. A missing/`_INCOMPLETE` promise
  halts the pipeline.
- **Checkpoints** — after each phase the agent stops and shows you the artifact for approval
  (`"ок"` → next, `"углуби X"` → elaborate, free text → adjust). **You co-author and freeze the
  spec** one layer at a time; the agent never runs a 30-file feature unattended.

### 4. The loop closes — code is verified *against* the spec

This is what separates SDD from "write a design doc, then wing it." The QE phases trace the
implementation **back to the specification**:

- **`qe-requirements-validation`** builds a traceability matrix (`01_requirements.md` ⇄ code ⇄ tests).
- **Gap-detection loop** in Step 8 must close with **zero remaining gaps** — every requirement is
  covered or the pipeline blocks.
- For L/XL, **Step 9 Fleet QE** adds risk-based, regression, integration and coverage checks and
  emits `COMPLETE` or `NEEDS_REMEDIATION`.

So a requirement that never got implemented, or code that satisfies no requirement, is caught by a
gate — not discovered in production.

### SDD principle → how Feature ADR implements it

| SDD principle | In this pipeline |
|---------------|------------------|
| Spec before code | Steps 0–6 produce specs; code is Step 7 |
| Executable / enforced spec | Cross-phase variables + promise-tag gates + zero-gap QE loop |
| Decisions are first-class | ADRs with ≥2 alternatives + trade-offs (`03_adr/`) |
| Human stays in control | A checkpoint after every phase; NO-GO verdict blocks |
| Spec ⇄ code traceability | Requirements-validation matrix + gap loop (Steps 8–9) |
| Right-sized ceremony | Complexity Router: S-tier skips ADR/DDD/architecture entirely |
| Spec is a durable asset | Numbered, versioned artifacts in `features/<slug>/`, PR-reviewable |

> **Tip for teams:** treat `features/<slug>/` as the deliverable of the *design* PR, merged and
> reviewed **before** the implementation PR. The ADRs and architecture diagrams become your living
> documentation; the QE report is your acceptance evidence.

---

## Complexity Tiers

| Tier | Scope | Active Steps | Time Budget |
|------|-------|-------------|-------------|
| **S** | 1-3 files, 1 domain | 0→1→6→7→8 | ~15 min |
| **M** | 4-10 files, 1-2 domains | 0→1→3→3.5→5→6→7→8 | ~45 min |
| **L** | 11-30 files, 2-4 domains | Full pipeline with parallelism | ~2 hours |
| **XL** | 30+ files, cross-cutting | Full DAG + multi-agent swarm | ~4+ hours |

### Complexity Dimensions (scored 1-4 each)

| Dimension | 1 (Low) | 4 (High) |
|-----------|---------|----------|
| Files affected | 1-3 | 30+ |
| Domain breadth | Single module | Cross-cutting concerns |
| Integration points | 0-1 external | 4+ external systems |
| Risk / reversibility | Easily reverted | Data migration required |
| Novelty | Well-known pattern | No prior art in codebase |
| Stakeholder count | Solo developer | 4+ teams affected |

---

## Pipeline Steps

| Step | Name | Tiers | Model | Fable? | Agentic QE Skill | Output |
|------|------|-------|-------|:------:|------------------|--------|
| 0 | Complexity Router | All | haiku | ✅ | — | `00_complexity_assessment.md` |
| 1 | Requirements | All | sonnet | ✅ | — | `01_requirements.md` |
| 2 | Research | L/XL | sonnet | ✅ | — | `02_research.md` |
| 3 | ADR + Shift-Left | M+ | opus | ⚠️ | shift-left-testing | `03_adr/001-*.md` |
| 3.5 | QCSD Ideation Swarm | M+ | sonnet | ✅ | qcsd-ideation-swarm | `03.5_ideation_report.md` |
| 4 | DDD | L/XL | opus | ⚠️ | — | `04_domain_model.md` |
| 5 | Architecture | M+ | opus | ⚠️ | — | `05_architecture.md` + diagrams |
| 6 | SPARC-GOAP Plan | All | sonnet | ✅ | code-goal-planner | `06_implementation_plan.md` |
| 7 | Code | All | opus | ⚠️ | tdd-london-chicago* | `07_code_changes/` |
| 8 | QE + Brutal Honesty | All | sonnet | ✅ | brutal-honesty-review | `08_qe_report.md` |
| 9 | Fleet QE | L/XL | sonnet | ⚠️ | 5 skills (4 agents) | `09_fleet_qe_assessment.md` |

*\* Extended skills (marked with \*) are only available with `--full-qe-extended`*

### Step 0 is architecture- & project-aware (opt-in, zero-config when absent)

Beyond classifying the tier, **Step 0 now aligns the feature to your product and folds in project-specific
skills** — both are fully opt-in and a run with neither file present is byte-identical to before.

**Architecture сverka** (needs `dz` ≥ 0.3.111 + an `architecture/` map in the repo). Step 0 runs
`dz architecture --check` against your product map + vision and surfaces the verdict in the checkpoint:
```bash
# author these two committed files once:
#   architecture/subsystems.manifest.json   — the product's subsystems (the 5 jobs + foundation/arsenal/ops)
#   architecture/vision.md                    — what the product is, where it goes, what it must NOT do
dz architecture              # see the map
dz architecture --check --slug <slug> --desc "<what you're building>" --cmd <new,cmds>
```
```
⛔ block (confidence 0.90) — duplicate-command: "recall" already exists in subsystem "learn". Confirm this is intentional.
```
A `block` (a hard-stop, e.g. re-adding an existing command) is surfaced for your confirmation — it never
auto-aborts. At the end of a complete run the map is refreshed (`architecture/map.json`) so the next feature's
сverka sees this one.

**Project-skill polymorphism** (needs `dz` ≥ 0.3.112). If the repo ships `architecture/project-skills.json`,
Step 0 resolves it and folds each declared skill into its stage as **guidance** — so a generic pipeline
becomes project-aware without editing the workflow:
```json
{ "version": 1,
  "roles": { "product-vision": "architecture/vision.md", "critic": ".dz-skills/my-critic/SKILL.md" },
  "extra": [ { "skill": ".dz-skills/security-checklist/SKILL.md", "phase": "qe", "as": "guidance" } ] }
```
Fixed roles map to fixed stages (`product-vision`→design+QE, `critic`→QE, `brand`→code, `impl-bar`→code); the
open `extra` list adds guidance to any stage. `dz project-skills` prints the who-injected report. Absent ⇒ a
normal generic run. (See `dz mr-rakes --gen-critic` to auto-generate the `critic` skill from your recurring rakes.)

**Bundled role-default skills (backend-service defaults; principles portable).** This pack ships four
depersonalized quality skills you can point the roles at — all calibrated by your `architecture/vision.md`
(build it with `dz feature-adr-setup`), so they carry your project's reality, not a vendor's. The examples
assume a backend-service stack (async web / RDB / JWT-JWKS / k8s); the *principles* are portable — translate
the examples for a different stack:

- **`code-critic`** — an independent code-quality reviewer (god-object growth, security invariants, anti-pattern
  detection by intent, honest severity, "low precision costs more than low recall"). Point the **`critic`** role
  at it: `"roles": { "critic": ".claude/skills/code-critic/SKILL.md" }`.
- **`code-impl`** — the implementer's quality bar (top-5 hard rules, god-object rule, reuse-map discipline,
  security invariants, decision discipline, done-ness). Point the **`impl-bar`** role at it.
- **`system-grill`** — a Socratic architecture-intuition trainer (predict-before-reveal, honest 🔴/🟡/🟢 journal)
  that generates its curriculum from your `architecture/subsystems.manifest.json` + `map.json` + `vision.md` —
  for a product person to *feel* the system before briefing an agent. Trigger: "погоняй меня по системе".
- **`code-skills-creator`** — a meta-factory that *produces* a project-tuned `code-impl` + `code-critic` pair.
  It starts from the two generic bases above and specializes them with your project's own evidence —
  `dz mr-rakes` recurring code rakes (primary) or a parallel-critic audit (fallback), your god-object freeze
  table and reuse-map — then generalizes every rake to a *class* of defect (never a bug-list linter). Writes
  the pair to `architecture/project-{impl,critic}/SKILL.md` (augment-never-clobber). With no evidence it hands
  back the generic pair unchanged rather than invent mistakes. Trigger: "build a quality bar pair".

### Adversarial plan-gate at the L/XL checkpoint (needs `dz` ≥ 0.3.117)

Cross-model QE (Step 8) catches problems *after* the code is written. At the **checkpoint-after-plan** the
pipeline now also runs an adversarial **challenge panel** on the plan itself — a FRESH reviewer that did **not**
write the plan tries to BREAK it across a fixed C1-C8 owner-question set (arch-anti-cement, prod-ready, test
sufficiency + honesty, overengineering, silent decisions, runtime consistency, scope, executability):

- **Panel ≠ plan author** (hard invariant): if Claude wrote the plan the adversary is Codex (honest `codex exec`,
  never a fire-and-forget stub); if Codex wrote it the adversary is a fresh Claude. An unknown family never
  silently claims cross-family.
- **Every P0/P1 is cross-validated** by a second independent agent, matched by index (never by title), and the
  non-validated ones are dropped — theory never reaches you. If the validator can't cover them, they are
  surfaced **UNVALIDATED**, never silently dropped.
- **Advisory** — the verdict returns as `challengeVerdict` alongside the ADR + plan; it **never auto-blocks**.
- Calibrated by `architecture/vision.md` + `testing.md` + `map.json` + `architecture/degradations.md` (a
  deviation from a pattern registered in the degradations file is **not** flagged). Run it ad-hoc with
  `dz challenge --plan <plan.md>` or the `challenge-panel` skill; scaffold the degradations registry via
  `dz feature-adr-setup --from-spec <spec with {"degradations":true}> --apply`.

### ADR quality gate (Step 3 generates → Step 8 enforces)

Step 3 and Step 8 share an ADR best-practices contract distilled from the
[architecture-decision-record monograph](https://github.com/architecture-decision-record/architecture-decision-record):

- **Step 3** emits a **MADR-structured** ADR — invariant core (Title/Status/Context/Decision/Consequences),
  ranked **Decision Drivers**, **Considered Options** (the chosen approach framed as an option alongside the
  rejected ones, symmetric pros/cons), **Rationale** mapped to drivers, negative consequences + follow-up
  links + after-action review, a **`## Confirmation`** stanza (method, monitoring, success metric, owner)
  naming the load-bearing property, and a **`## Links`** traceability block. Template weight is tier-mapped:
  S/M → Nygard/ITD-lightweight, L/XL → MADR + Confirmation.
- **Step 8** runs a **13-point ADR fitness checklist** (`qe-code-reviewer`) against every generated ADR and
  **fails the gate** on any miss — decision-shaped title, controlled-vocabulary Status + reversibility,
  neutral Context-before-Decision, symmetric options, driver-mapped rationale, concrete/testable decision,
  negative consequences, traceability links, no placeholder, and **rejects explainer-masquerading-as-ADR**.
  The **Confirmation→test link is load-bearing**: if the named safety property has no automated test the ADR
  grades no better than C.

The pipeline **dog-foods** this: a harness test runs the gate against feature-adr's own generated ADR, so a
Step-3↔Step-8 drift fails CI rather than shipping.

### Amendments are mini-ADRs + the 🚦 Gates line (v1.3.58)

Three additions derived from a real post-release incident analysis (a pipeline shipped slices whose defects
only a *full* post-push review caught), organized by one principle — the **cost-of-detection ladder**: every
check lives on the cheapest layer that reliably holds it (deterministic test > always-loaded file > pipeline
gate > reviewer judgment > memory). A miss usually means a check lived one layer too weak.

- **Amendment Confirmation discipline.** Corrections folded into a run (a Step-3.5 CONDITIONAL condition, a
  challenge-panel confirmed finding, a user checkpoint steer) were historically the least-tested part of the
  pipeline — prose deltas with no proving test. Now every amendment is a **mini-ADR** in a `## Amendments`
  section with a fixed, lintable shape:
  ```
  AM-N (qcsd|challenge-panel|user-steer): <change>. Confirmation: <property> → test `test_name` (fails if reverted).
  ```
  Step 8 verifies each named test **exists** and is **non-vacuous** — amendment tests join the ADR property
  test in the same `dz discrimination-check` run (a test that stays green at pre-feature base proves
  nothing). A *safeguard* amendment needs a test proving it actually **fires** on a real input, not just
  that its code path exists. No `## Amendments` section ⇒ the gate skips silently (zero cost).
- **The `🚦 Gates:` line.** Every checkpoint banner (and the workflow's return objects) carries a gate map
  **derived from machine state** — artifact existence, JSON verdicts, test results — never from what the
  orchestrator remembers. `✓` passed · `✗` failed · `not-run` pending · `—` N/A. The line doesn't make a
  gate run; it makes NOT running one loud.
- **I/O-on-pure-path rule.** A change that adds I/O (DB/network/file) to a previously-pure path — above all
  startup/lifespan/health — must carry a **negative resource-down test** (broken resource → the declared
  degradation contract: fail-open for advisory, fail-fast for load-bearing), and Step 8 hunts the
  **fixture-swap smell**: replacing a broken fixture with a healthy one silently deletes the negative
  control that proved the path was I/O-free. The bundled role-default skills gained the matching entries
  (`code-impl` P25, `code-critic` AP14).

- **No-stubs gate** (backlog 0b403a0106103901, Karpathy-Michaels rule XI). Step 8 greps the files THE RUN
  touched for unfinished-stub markers — `TODO` / `FIXME` / `HACK` / `XXX` / `PLACEHOLDER` (case-sensitive,
  word-bounded: `hackathon`/`todos` never fire) plus the `implement later` phrase — **any unwaived match =
  the task shipped incomplete** (HIGH gap naming file:line). A line may carry an inline
  `no-stubs: <reason>` waiver; a waiver **without** a reason is itself a HIGH gap, never an exemption. The
  same scan runs mechanically at publish time as the SOFT `no-stubs` rule in `dz guard check --op publish`
  (change-set scoped — a deliberate design: a tree-wide scan measured ~78% ancient-marker noise). Markers
  quoted in the QE report are backticked so the report itself scans clean.

Both forms carry all of it: the interactive skill (step modules + banner template) and the deterministic
workflow (stage prompts + derived `gates` in its returns) — same shapes, same vocabulary.

### Step 10 — Delivery Gate (opt-in, v1.3.60)

Step 8 reviews the code as the coder's counterpart; **Step 10 reviews the feature as a PUBLISHED entity** —
the landed diff, its docs, its claims. Four orthogonal planes run in parallel on the **cross-family of the
coder** (regressions ‖ security ‖ code-quality ‖ **product-honesty** — the plane Step 8 lacks: fabricated
completeness, features that do less than their description, misleading degradation text), every BLOCKER/HIGH
is cross-validated **by index**, and the result is a machine-checkable hand-off verdict in
`10_delivery_review.md` (`ready` ⇔ 0 BLOCKER + 0 unwaived HIGH).

```js
Workflow({ scriptPath: '.claude/workflows/feature-adr.js',
  args: { slug, description, tier: 'L', deliveryGate: true, stopAfter: 'none' } })  // L/XL: without stopAfter:'none'
// the run pauses at the plan checkpoint first (re-invoke to implement + gate). models.delivery tunes the
// CLAUDE plane model; codex planes are unsupported in v1 (data-returning stage — the wrapper stubs).
```

Extensibility guarantees (deliberate): **strictly opt-in** — no `deliveryGate`/`models.delivery` ⇒
byte-identical, zero agents, no artifact; **zero VCS-host specifics** — no merge-request/CI API calls; an
MR-flow project's extra criteria (`CI terminal`, `draft→ready`) are document rows the owner fills;
**advisory** — `hand-off: blocked` is a report, nothing auto-aborts, findings are NEVER auto-posted
anywhere. Honest v1 caveats: the cross-family guarantee holds for a CODEX-coded run (Claude planes); a
Claude-coded run gets same-family planes with `crossFamily: false` recorded loudly; the promise tag
`FEATURE_ADR_DELIVERY_GATED` is emitted only when `10_delivery_review.md` actually landed. The `🚦 Gates:`
line gains `delivery ready|blocked|errored|n/a`.

**Deterministic project guards (P3, needs `dz` ≥ 0.3.232).** The lowest rung of the same ladder:
`dz feature-adr-setup --guards --apply` scaffolds `architecture/guards/guards.config.json` + a
**zero-dependency** `check.mjs` runner into YOUR project (any stack with Node) — loc-cap (god-object guard,
`--loc-cap <n>`, default 700), secret-scan, frozen-file sha256 pins; every waiver requires a reason (a
reasonless waiver is itself a violation). Wire `node architecture/guards/check.mjs` into CI and the rules a
reviewer "might notice" become deterministic tests that run on every future slice.

### The `Model` / `Fable?` columns — read this before swapping models

The `Model` column is the **default recommendation, fully overridable** — the routing rule is
"phase difficulty → model tier": a fast tier for classification, a mid tier (`sonnet`) for
structured drafting / QE synthesis, a top tier (`opus`) for load-bearing judgment.

The **`Fable?`** column flags where switching to **Fable** is low-risk to try:

- **✅ Fable-friendly** — drafting / classification / synthesis phases that are **gated by a
  checkpoint and cheap to redo** (0 Router, 1 Requirements, 2 Research, 3.5 Ideation, 6 Plan,
  8 QE draft). If Fable holds quality here, you gain speed/cost with a human gate right after.
- **⚠️ Validate first** — **load-bearing reasoning** phases where a wrong call cascades downstream
  (3 ADR decisions, 4 DDD, 5 Architecture, 7 Code, 9 Fleet QE). Keep the `opus`/`sonnet` default
  unless you've A/B-validated Fable on your codebase.

> **How to decide with data, not vibes:** install with `--with-learning` and run 2–3 features with
> Fable on the ✅ steps; compare the reward patterns / rework counts against your `sonnet` baseline.
> The pipeline's own reward tracker tells you where Fable is safe. This table is a **starting
> heuristic**, not a benchmark — tune per project.

---

## Output Structure

```
features/<feature-slug>/
├── 00_complexity_assessment.md     ← Always
├── 01_requirements.md              ← Always
├── 02_research.md                  ← L/XL only
├── 03_adr/
│   └── 001-<decision-slug>.md      ← M+ only
├── 03.5_ideation_report.md         ← M+ only
├── 04_domain_model.md              ← L/XL only
├── 05_architecture.md              ← M+ only
├── 06_implementation_plan.md       ← Always
├── 07_code_changes/
│   └── change_manifest.md          ← Always
├── 08_qe_report.md                 ← Always
├── 09_fleet_qe_assessment.md       ← L/XL only
├── diagrams/                       ← M+ only
│   ├── architecture-c4.mermaid
│   └── sequence-*.mermaid
└── README.md                       ← Always
```

---

## Agentic QE Integration

Feature ADR integrates 15 skills from [agentic-qe](https://github.com/proffesor-for-testing/agentic-qe) for quality engineering at every step.

### Three Modes

| Mode | Flag | Skills | Requires |
|------|------|--------|----------|
| **Reference** | (none) | 9 core (condensed copies) | Nothing — works out of the box |
| **Direct** | `--full-qe` | 9 core (full protocols) | [agentic-qe](https://github.com/proffesor-for-testing/agentic-qe) installed |
| **Direct Extended** | `--full-qe-extended` | 15 (9 core + 6 extended) | [agentic-qe](https://github.com/proffesor-for-testing/agentic-qe) installed |

### Installing agentic-qe (required for `--full-qe` and `--full-qe-extended`)

```bash
# 1. Install agentic-qe globally
npm install -g agentic-qe

# 2. Initialize in your project (auto-detects tech stack, configures MCP)
cd your-project && aqe init --auto
```

Source: [github.com/proffesor-for-testing/agentic-qe](https://github.com/proffesor-for-testing/agentic-qe)

After installation, feature-adr auto-detects agentic-qe when you use the `--full-qe` or `--full-qe-extended` flags. If agentic-qe is not found, the pipeline falls back to Reference Mode with a warning.

### Core Skills (9, all modes)

| Skill | Step | Purpose |
|-------|------|---------|
| shift-left-testing | 3 | ADR testability validation |
| qcsd-ideation-swarm | 3.5 | HTSM + SFDIPOT quality swarm |
| code-goal-planner | 6 | SPARC-GOAP milestone planning |
| brutal-honesty-review | 8 | Linus/Ramsay/Bach code review |
| qe-requirements-validation | 9 | Traceability matrix + SMART |
| risk-based-testing | 9 | Probability×Impact 5×5 scoring |
| enterprise-integration-testing | 9 | Contract testing + E2E flows |
| regression-testing | 9 | Change-based test selection |
| qe-coverage-analysis | 9 | Risk-weighted coverage |

### Extended Skills (6, `--full-qe-extended` only)

| Skill | Step | Condition |
|-------|------|-----------|
| tdd-london-chicago | 7 | Always |
| mutation-testing | 8 | If test suite exists |
| security-testing | 8, 9 | `HAS_AUTH` / `HAS_EXTERNAL_API` |
| performance-testing | 8, 9 | `HAS_PERFORMANCE_SLA` |
| chaos-engineering-resilience | 9 | `HAS_INFRASTRUCTURE_CHANGE` |
| qcsd-production-swarm | Post-9 | Advisory feedback loops |

---

## Optional Features: Learning & Knowledge Extraction

Feature ADR can be extended with reward learning and knowledge extraction — no additional packages required.

### `--with-learning` — Reward Learning

Adds the Memory Protocol and Reward Tracker. The pipeline **learns from your feedback** at every checkpoint:
- Stores reward scores based on your responses (immediate approval = 1.0, minor adjustments = 0.7, rework = 0.3)
- Loads historical patterns at the start of each step
- Detects domain-specific bottlenecks and skill effectiveness trends

```bash
npx @dzhechkov/skills-feature-adr init --with-learning
```

**Installs:** `lib/memory-protocol.md`, `lib/reward-tracker.md`, `.claude/rules/reward-learning.md`

### `--knowledge-extractor` — Knowledge Harvesting

Adds the Knowledge Extractor skill with the `/harvest` command. After completing a feature, extract reusable patterns:

```bash
npx @dzhechkov/skills-feature-adr init --knowledge-extractor

# After completing a feature:
/harvest features/<feature-slug>/
```

**Installs:** `.claude/skills/knowledge-extractor/` (5 agents, 7 categories, 8 quality gates), `.claude/commands/harvest.md`

### Both at once

```bash
npx @dzhechkov/skills-feature-adr init --with-learning --knowledge-extractor
```

### Already using `@dzhechkov/keysarium`?

> **If you have `@dzhechkov/keysarium` installed, these flags are not needed.**
> Keysarium already includes reward learning, knowledge extraction, and more.
> The installer auto-detects keysarium and skips optional components to avoid duplication.

---

## Self-Learning Layers

There are **three independent self-learning systems** that can sit under a Feature ADR run.
`--full-qe-extended` does **not** turn on learning by itself — it controls QE depth. Learning is a
separate concern — though in Direct modes the pipeline now adds explicit touchpoints into layer B
(Step 0 pattern recall, Steps 8/9 outcome store — see the skill's "Pattern memory loop" section). The three layers do **not conflict**: each is isolated by its own
storage path, its own learning signal, and its own consumer.

| Layer | Turn it on with | Learns from | Storage (distinct!) | Needs a DB? |
|-------|-----------------|-------------|---------------------|-------------|
| **A — feature-adr reward learning** | install flag **`--with-learning`** (or bundled with `@dzhechkov/keysarium`) | your **checkpoint responses** (`ок`=1.0 / minor=0.7 / rework=0.3 / restart=0.0) | `.keysarium/memory/*.json` | **No** — plain JSON files |
| **B — agentic-qe learning** | comes with `agentic-qe` (required by `--full-qe` / `--full-qe-extended`), initialized by `aqe init` | QE task **experiences** (ReasoningBank + dream scheduler) | `.agentic-qe/memory.db` + `patterns.rvf` | Self-contained (its own store) |
| **C — dz harness self-learning** | the `dz` CLI (`dz setup` / `dz teach` / `dz consolidate` / `dz recall`) | your **dz sessions** | `.dz/` (+ optional `.dz/agentdb.db` vector tier) | **Optional** — lexical works without one; agentdb only adds vector search |

### Do they conflict? No — but observe one rule

- **No logical conflict:** different files, different signals, different readers → no write
  contention and no data clobbering. Enabling all three at once is fine; they're complementary.
- **Auto-dedup:** if `@dzhechkov/keysarium` is present, the installer **skips** `--with-learning`
  (keysarium already ships layer A), so you can't accidentally double-install it.
- **⚠️ The one rule — one DB file per writer.** Layer C writes to SQLite **natively (better-sqlite3,
  WAL)**; agentic-qe (layer B) can write **via sql.js (whole-file overwrite)**. Pointing *both* at
  the **same** `.db` file risks corruption. By default they use **different files**
  (`.agentic-qe/memory.db` ≠ `.dz/agentdb.db`), so out of the box you're safe — just never
  hand-repoint one system's `AGENTDB_PATH` at the other's database.

### Which to enable

- Writing features with this pipeline and want it to **learn from your feedback** →
  `npx @dzhechkov/skills-feature-adr init --with-learning` (**no agentdb needed**).
- Running `--full-qe` / `--full-qe-extended` → agentic-qe's learning already runs via its hooks.
- Living inside the `dz` harness and want cross-session memory → `dz setup` (add agentdb only if you
  want the vector tier).

### Maintenance: consolidate periodically

Hooks and events only **collect** raw data — distilling it into reusable patterns is a separate
**consolidation** step, and for layers B and C that step is worth running deliberately:

- **A (reward JSON)** — nothing to do; it consolidates implicitly at every checkpoint.
- **B (agentic-qe)** — queues raw *experiences* that only its consolidation pass distills into
  patterns. Left alone, a project can pile up thousands of unconsolidated experiences over a month
  while its per-prompt pattern injection returns **zero useful patterns**. Run
  `aqe learning consolidate` periodically (e.g. weekly, or after a heavy QE run);
  `aqe learning stats` shows the experience backlog.
- **C (dz harness)** — run `dz consolidate` to harvest session learnings into the lexical store
  (mirrored to the agentdb vector store if present); inspect the result with `dz recall`.
  Consolidation now runs automatically on **PreCompact** — Claude Code fires this before every
  context compaction (both auto-compaction and manual `/compact`), so long or heavily-compacted
  sessions consolidate at each compaction boundary rather than only at a clean end. It is
  **throttled** (a `.dz/.last-consolidate` marker enforces a minimum of ~15 min between auto-runs)
  so rapid compactions don't reload the embedding model repeatedly. **SessionEnd** remains as a
  secondary trigger for clean exits, and you can still run `dz consolidate` manually anytime.
  PreCompact is the primary reliable trigger — earlier the SessionEnd-only hook missed long,
  compacted, or crashed sessions, which left consolidation effectively manual.

**Degradation symptom:** patterns stop improving while raw logs keep growing. If recall/injection
quality plateaus, you're collecting but not distilling — consolidate.

> There is no single unified "what did the whole stack learn" view — each layer reports from its own
> store. That's the price of isolation (and the reason there are no cascading failures). Tune each
> where it lives.

---

## Shared Skills

Feature ADR uses these skills from `@dzhechkov/keysarium` (if installed):

| Skill | Used In | Purpose |
|-------|---------|---------|
| `explore` | Step 1 | Requirements clarification |
| `problem-solver-enhanced` | Step 3 | Trade-off analysis for ADR |
| `frontend-design` | Step 7 | UI implementation (if applicable) |

These are optional — Feature ADR works standalone but benefits from the full toolkit.

---

## Integration with Keysarium Ecosystem

```bash
# Install the full ecosystem
npx @dzhechkov/keysarium init              # Research pipeline
npx @dzhechkov/skills-bto init             # Build-Test-Optimize
npx @dzhechkov/skills-feature-adr init     # Feature development

# Use the right tool for the job:
/casarium [case description]                        # AI case research (7 phases)
/feature-adr [feature description]                  # Feature development (11 steps)
/feature-adr --full-qe [feature description]        # + full agentic-qe protocols
/feature-adr --full-qe-extended [feature desc]      # + extended QE skills
/bto [skill path]                                   # Skill evaluation & optimization
```

---

## Troubleshooting

### `sh: 1: skills-feature-adr: not found` — npx inside a monorepo with workspaces

If you run `npx @dzhechkov/skills-feature-adr <command>` from **inside a monorepo** whose root
`package.json` declares `"workspaces"` (npm/pnpm/yarn) and a local workspace package shadows this
name (e.g. you vendored or forked this package, or you're developing it), npx resolves the **local
workspace copy** instead of fetching from the registry. It then looks for the bin shim in
`node_modules/.bin/` — which the workspace manager may never have created (pnpm links shims only
for declared dependencies) — and falls back to running the bare command in your shell:

```
sh: 1: skills-feature-adr: not found
```

**Note:** pinning a version (`npx @dzhechkov/skills-feature-adr@x.y.z`) does **not** bypass
workspace resolution — verified.

**Fixes:**

```bash
# 1. Run it where it belongs — in the TARGET project (where .claude/ lives).
#    That directory is normally not the package's own monorepo:
cd /path/to/your-project
npx @dzhechkov/skills-feature-adr update

# 2. Developing inside the monorepo that contains this package? Invoke the
#    workspace copy's bin directly:
node <monorepo>/packages/@dzhechkov/skills-feature-adr/bin/cli.js update

# 3. Or use a global install (resolves independently of any workspace):
npm install -g @dzhechkov/skills-feature-adr
skills-feature-adr update
```

Related: `init`/`update`/`remove` operate on the **current directory's** `.claude/` install — running
them inside the package's own monorepo is almost never what you want anyway.

---

## Requirements

- **Claude Code CLI** — installed and configured ([installation guide](https://docs.anthropic.com/en/docs/claude-code))
- **Node.js >= 16.0.0** — required for the npm install method

---

## License

[MIT](https://opensource.org/licenses/MIT)

---

## Links

- **Team Onboarding playbook (public, rendered):** [dz-skill-bundles/docs/feature-adr-team-onboarding.md](https://github.com/djd1m/dz-skill-bundles/blob/main/docs/feature-adr-team-onboarding.md) — also shipped in this package at `docs/team-onboarding.md` ([raw on unpkg](https://unpkg.com/@dzhechkov/skills-feature-adr/docs/team-onboarding.md))
- **GitHub (public docs & bundles):** [https://github.com/djd1m/dz-skill-bundles](https://github.com/djd1m/dz-skill-bundles)
- **Issues:** [https://github.com/djd1m/dz-skill-bundles/issues](https://github.com/djd1m/dz-skill-bundles/issues)
- *Note: the source monorepo (`djd1m/dz-harness-hub`) is private; the links above are the public entry points.*
- **npm:** [https://www.npmjs.com/package/@dzhechkov/skills-feature-adr](https://www.npmjs.com/package/@dzhechkov/skills-feature-adr)
- **Keysarium:** [https://www.npmjs.com/package/@dzhechkov/keysarium](https://www.npmjs.com/package/@dzhechkov/keysarium)
- **BTO:** [https://www.npmjs.com/package/@dzhechkov/skills-bto](https://www.npmjs.com/package/@dzhechkov/skills-bto)

## Write discipline — why the writing steps now build a skeleton first

MEASURED in the field on 2026-08-19 and 2026-08-20, two independent runs of the canonical pipeline
against a ~130-file repository: the steps that must produce a document — Step 5 (Architecture) and
Step 6 (Plan) — **never reached a write**. 18 attempts, zero file writes in every one. They died in
the READING phase: a shell result returns, the agent thinks about its next move, stays silent past
the runtime's 180-second inactivity watchdog, and is killed. One run cost ~4M tokens and 1h54m.

The failure is **deterministic, not unlucky**: thinking time grows with accumulated history, so on a
large enough repository unbounded exploration guarantees the kill. And the cause was in the
instructions, not the runtime — every writing step said, in effect, *"read the code, write the
document"*, with no reading budget and no order of operations. An agent obeying literally reads
until it dies.

The owner's control experiment is the whole evidence base, and it is n=1: same slice, same inputs,
same model, ONE added paragraph about write discipline → a 10-section skeleton on disk 8 minutes in,
first attempt, after six consecutive deaths.

So every document-producing step now carries:

1. the FIRST file write happens within the first ~12 tool calls — a skeleton of section headings
   with one line of intent under each;
2. then fill it **one section per edit**, no edit longer than ~120 lines;
3. never go more than 2 minutes without a tool call;
4. when unsure whether to read more or to write — **write**.

**What this does not do**, stated plainly: it does not stop the deaths. The watchdog is unchanged.
It changes what survives one — previously nothing, now a skeleton on disk that the next attempt can
continue. The `~12` and `~120` are chosen parameters, not measured optima. Two possible regressions
were named by an independent reviewer and are **not measured**: an early skeleton may anchor a
structure chosen before understanding, and section-per-edit raises tool-call overhead.

Steps whose deliverable is a returned verdict rather than a document (the complexity router) are
deliberately excluded — "skeleton first" is nonsense there.


---

## Status

`1.5.4` — **Step 5 now asks how the shipped feature will be watched.** The architecture artifact must
carry a section headed exactly `Observability` answering what the feature logs, what it counts, what a
failure looks like from outside, and who would notice. **"Nothing to observe" is a complete answer** —
a pure refactor or a CI-only gate genuinely emits nothing, and a check that cannot express a true fact
gets switched off. What is not acceptable is leaving the question unanswered. MEASURED before the
change: the word appeared nowhere in the pipeline's prompts, and ZERO of 107 architecture artifacts
carried such a section, while two fully-written observability skills (818 and 946 lines) sat
unreachable because nothing called them. `dz score` reports the answer as a discipline — descriptive,
never a gate, because the whole existing corpus predates the requirement.

Also in the bundled workflow: the K2 gate stops GUESSING the workspace. When it was not pinned, the
workspace candidate was taken from the gate agent's own working directory, which against an external
target repo resolved to that repo — so the candidate silently became a duplicate of the repo
candidate and a skill installed in the workspace was never found (`NOT-ESTABLISHED`, exit 3, the
coding step never ran). New `args.workspace` pins it, the shipped call site passes it, each candidate
is labelled in the audit line, and a `K2_GATE_NOTE` fires when two collapse onto one path. And a
pre-code probe that returns nothing no longer becomes an all-null baseline that later reads as
"every target changed".


`1.5.3` — **the workflow stops crashing on the way into Step 7.** `1.5.2` shipped a workflow that
CALLED three helpers it never defined — `changeSetProbeCmd`, `parseHashProbe`, `changedFromHashes`
(5 call sites, 0 definitions). `QE_SCOPE` defaults to `uncommitted`, so the guarded branch was true
by default and every ultracode run that reached the coding step died with a `ReferenceError` while
the corresponding unit tests stayed green — they exercise the exported module, the pipeline runs an
inline mirror of it. The three are now restored FROM that canonical export, not reconstructed, and
two guards make the class visible: the mirror is checked by lifting each function out of the shipped
file and comparing its BEHAVIOUR case-by-case against the export, and a new layer-1 test parses the
workflow and asserts every referenced identifier is declared or is one of the eight documented
sandbox globals.

Also in this release, both halves of the K2 plan-completeness gate that field use found:

- **C6 scopes each amendment to its own block** — from its `AM-N` line to the line where the next one
  begins. The old three-line window refused amendments whose `→ test` marker sat on a `Confirmation:`
  line further down (measured: line 3 passes, line 4 fails), and — worse, and not reported — it
  PASSED a testless amendment that happened to sit next to a tested one, which borrowed its
  neighbour's marker. The plural `→ tests \`a\` and \`b\`` form is now matched, and a wrapped
  `AM-1..AM-4;` range no longer opens a phantom amendment. Measured over 142 plans: 402 C6 failures
  before, 190 after, **0 plans newly failing**. The Step-6 planner prompt now states that the row is
  machine-read and where the marker must sit.
- **The K2 gate stops guessing the workspace.** When the workspace was not pinned it was taken from
  the gate agent's own working directory, which against an external target repo resolved to that
  repo — so the workspace candidate silently became a duplicate of the repo candidate and a skill
  installed in the workspace was never found (`NOT-ESTABLISHED`, exit 3, the coding step never ran).
  New `args.workspace` pins it, the shipped call site passes it, each candidate is now labelled in the
  audit line, and a `K2_GATE_NOTE` fires when the two collapse onto one path.

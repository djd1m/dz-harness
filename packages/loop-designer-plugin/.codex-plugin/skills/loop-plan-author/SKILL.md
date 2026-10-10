---
name: loop-plan-author
description: >
  Author, validate, render and read agent LOOPS as a typed `loop-plan/1` plan — the four patterns
  (pipeline, barrier, fanout, gate), the eight plan invariants INV-1..8, the claims/defers contract,
  and USER regions that survive re-render byte-for-byte. Use when designing a multi-agent workflow,
  turning a sketched orchestration into a plan a gate can check, hardening an existing loop script,
  or reading what a finished run actually did from its trace. Triggers on: "design a loop",
  "multi-agent workflow", "loop-plan", "workflow init/validate/render", "fanout and join",
  "why did my loop hang", "read the run trace". For execution, choose the host or portable runner below.
trust_tier: 1
trust_tier_label: "Structured"
---

# Loop Plan Author

> **Author a plan once; choose its execution runtime.**

`dz workflow init|validate|render` produces and checks a `loop-plan/1` plan and a script;
`dz workflow-lint` gates the script; `dz workflow-trace` reads run records. There are two execution
paths: Claude Code's **Workflow host** executes the rendered JavaScript with
`Workflow({ scriptPath: '<rendered>.js' })`; portable **`dz workflow run <plan.json>`** interprets
the plan directly through Codex/Claude CLI dispatchers. A Codex shell can invoke the portable
runner without the Claude Code Workflow host.

The portable runner does not execute rendered JavaScript or hand-written USER regions. Choose
the host path for those script customizations; use the portable path for plan-declared orchestration.

---

## 1. When to reach for a plan at all

A `loop-plan/1` plan earns its keep when the orchestration has **structure worth checking**:
concurrency, a join, retries, a gate that can send work back, a pause that a later invocation must
resume. A single linear prompt does not need a plan — say so and move on.

| Signal | Plan? |
|---|---|
| Two or more agents running concurrently | yes — INV-2/INV-3 exist for exactly this |
| A step that may be retried | yes — INV-4 makes you say whether it is idempotent |
| A checkpoint the user answers, then re-invokes | yes — INV-5 makes the pause resumable |
| A verdict that can route work back | yes — the `gate` pattern |
| One agent, one prompt, one answer | no |

---

## 2. The four patterns

`dz workflow init --name <n> --pattern <p> --o <plan.json>` scaffolds a plan that already validates
and already renders lint-clean. Pick the pattern by the SHAPE of the work, not by size.

### `pipeline` — the same item flows through ordered stages
A fanout over a registry where each member walks a `chain` of steps in order (`a` → `b`). Use when
every item needs the same sequence and the stages differ. The join closes the region.

### `barrier` — independent lanes, then one synthesis
A fanout whose members are independent, a join that waits for them, and a consumer hanging off the
**join**, never off the fork. That last detail is a lint rule of its own (`barrier-postdominates`),
because hanging the consumer on the fork is how a "parallel" loop silently reads one lane's result.

### `fanout` — the same shape as `barrier` at the plan level
Scaffolds identically; the distinction is intent (fanout = spread work; barrier = spread then
converge). Choose the name that will read correctly to the next person.

### `gate` — produce, then judge, with a route back
A worker step and a `gate` step with `kind: 'parse-verdict'`, a `failRoute` back to the worker, and
a bounded `maxRedos`. The gate's prompt must PARSE a verdict, never synthesise one — an empty or
unparseable answer is not a pass.

---

## 3. The eight plan invariants (INV-1..8)

`dz workflow validate <plan.json>` reports one diagnostic per violated instance, each naming its
invariant and its JSON path. They are the reason a plan is worth writing down:

| Invariant | What it refuses |
|---|---|
| **INV-1** | A reference to a step that does not exist, or a dependency cycle. |
| **INV-2** | A fanout without `maxFanout >= 1` AND a non-empty `registry` — unbounded fanout is unrepresentable, not merely discouraged. |
| **INV-3** | A parallel region with no named join, or a `joinPolicy` outside the closed set (`all-declared｜all-activated｜any｜quorum:<n>`). |
| **INV-4** | `retry.maxAttempts > 1` on a step not declared `idempotent` (and `maxAttempts` INCLUDES the first attempt). |
| **INV-5** | A declared pause with no reachable pause step or no `resumeArg` — a pause a re-invoke cannot resume is a lie. |
| **INV-6** | `cacheable` on a step that is not idempotent AND side-effect-free. Cache identity is separate from checkpoint identity. |
| **INV-7** | `meta.phases` order contradicting the first-reference order of the phases in the script. |
| **INV-8** | Retired in round 6 — SUBSUMED by the enact-dispatch rule. Kept numbered so older plans and reports still read correctly. |

`loop-plan/1` is **CLOSED-WORLD**: an unknown non-`x-` key is a parse error, not a tolerated extra.
The reason is stated in the schema itself — a key that parses, digests and enacts nothing is a plan
promising behavior nobody performs.

---

## 4. The claims/defers contract

Every step says what it CLAIMS to deliver and what it DEFERS to someone else. Write both:

- **claims** — the artifact or the return value this step is responsible for. If the deliverable is
  a FILE written out-of-band, the plan must also carry the check that the file landed; if the
  deliverable is the RETURN VALUE, a stub answer must be detectable as a stub.
- **defers** — what this step deliberately does not do, and who does it instead.

The failure this contract prevents is specific and has happened: a dispatch whose deliverable is
its return value was routed to a fire-and-forget wrapper, the wrapper returned a stub, and the stub
read exactly like a clean review. `dispatch-by-deliverable` is the lint rule that keeps that honest.

---

## 5. USER regions

`dz workflow render <plan.json> --o <script.js>` emits a region-delimited script. Regions marked

```js
// ── BEGIN USER <label> ──
// ── END USER <label> ──
```

are the **only** hand-editable parts, and they are preserved **byte-for-byte** across re-render.
Everything outside them is generated and will be overwritten — so put the judgment in a USER region
and the plumbing in the plan. `--check` renders to a `.proposed.js` and reports the diff instead of
writing; a USER region whose step vanished from the plan is REPORTED, never silently dropped.

---

## 6. Gating a script

`dz workflow-lint <script.js> [--plan <plan.json> --require-plan | --legacy]` is the layer-1 gate.
Exit codes: **0 pass · 1 fail · 3 inconclusive** — and *inconclusive is never a pass*. Its rule set
includes `meta-complete`, `phase-parity`, `sandbox-bans`, `shq-hygiene`, `agent-labelled`,
`budget-before-spawn`, `fanout-bounded`, `barrier-postdominates`, `retry-idempotent`, `pause-wired`,
`plan-binding`, `blob-hash`, `size-budget`, `tool-perimeter-declared`, `dispatch-by-deliverable`,
`no-partial-checkpoint`, `no-agent-outside-runstep`, `resume-fingerprint`.

Two of those deserve a sentence each, because they encode losses rather than tastes:
`sandbox-bans` — the workflow sandbox has no clock, randomness, `require` or `process`, and no
filesystem (the agent is the filesystem); `plan-binding` — the script header carries the digest of
the plan it was rendered from, so a script rendered from a *different* plan cannot pass as bound.

---

## 7. Reading a finished run

`dz workflow-trace <runDir|--slug <s>|--run <id>> [--invariants <plan.json>] [--html <out>] [--json]`
reads a run's `trace.jsonl` and reports the timeline plus the plan-derived runtime invariants.
`--slug <s>` reads `features/<s>/`; `--run <id>` reads `.dz/loop-trace/<id>/`, the portable
runner's default location. Use an explicit run directory when the execution path overrides it.

Three honesty rules of the reader, which you should repeat to whoever asks you for the numbers:

1. An **empty trace is expected**, not an error — a loop may simply not have emitted one. Report
   emptiness as emptiness.
2. A run with no `run.closed` frame has a possibly-truncated tail; window-dependent invariants
   report **inconclusive**, not pass.
3. Invariants are evaluated **by SEQ**, never by wall-clock time.

---

## 8. What this skill is on each vehicle (per-vehicle honesty)

The same authoring body ships to several places, and they are NOT equivalent:

| Vehicle | What you get | What you do NOT get |
|---|---|---|
| **Claude Code plugin** (marketplace or `--plugin-dir`) | this skill + the five `/loop-designer:*` commands | no run command wrapper; use the Workflow host or a separate portable `dz workflow run` invocation |
| **Bare skill** (`.claude/skills/loop-designer-plan-author/`) | this skill only | no slash commands: commands require a plugin load |
| **Codex** (`.agents/skills/` or the `.codex-plugin` showcase) | this skill, plus `dz` over Codex's shell | no Claude Code `Workflow` host; run the plan via `dz workflow run` when its CLI prerequisites are met, or hand the rendered script to Claude Code |

The plugin wrappers provide authoring, gating and trace reading; the portable runner is a separate
`dz` CLI capability and is not supplied by loading this skill.

---

## 9. The `loop-plan/1` schema

The schema id is the literal string **`loop-plan/1`** and it is the value of the plan's `schema`
field. Field-by-field reference: `references/loop-plan-1-schema.md`, co-located with this file.

---

## 10. Execution prerequisites and limits

For portable execution, install a `dz` CLI exposing `workflow run` (`dz workflow run --help`),
plus installed/authenticated `codex` and/or `claude` CLIs for every family the plan needs.
The runner probes candidate models; a configured model name alone does not establish availability.
The plugin's `^0.4.6` fallback is for its five wrapped verbs and does not establish runner support.

Use a validating `loop-plan/1` JSON plan with `trace.emit: true`. Each dispatched step needs a
routable model family, or supply `--default-family codex|claude`. Declared artifact reads/writes
must stay inside the execution project. Supply `--coder-family` with the actual coding family
when steps use `x-role: qe`; same-family QE is refused unless `--allow-same-family-qe` is supplied,
which records re-QE debt. That waiver does not establish independent review.

Runs write trace, budget and checkpoints under `.dz/loop-trace/<runId>/` by default
(`--run-dir` overrides). Exit **0** means completed, **1** failed with a named reason,
**2** usage/invalid plan, **75** a resumable typed pause with a final `wf-pause-envelope/1` JSON
line. Lint's **3** remains inconclusive. Resume using the same plan and run ID; stale inputs,
foreign runs and already completed runs are refused. Budget counts dispatch units rather than
raw total tokens; a budget or wall-clock pause may need a bounded extension before resuming.

Scheduler, resume, dispatch and trace tests check specific contracts. They do not prove blanket
live parity across model CLIs, account availability, Workflow hosts or custom JavaScript.

## 11. A worked sequence

```bash
dz workflow init --name review-swarm --pattern barrier --o review-swarm.plan.json
$EDITOR review-swarm.plan.json          # replace every TODO; state claims/defers per step
dz workflow validate review-swarm.plan.json          # INV-1..8, exit non-zero on any violation
dz workflow render review-swarm.plan.json --o review-swarm.js
dz workflow-lint review-swarm.js --plan review-swarm.plan.json --require-plan   # 0 / 1 / 3
# Choose rendered-script execution in the Claude Code Workflow host:
#   Workflow({ scriptPath: 'review-swarm.js' })
# For a host trace written under features/review-swarm:
#   dz workflow-trace --slug review-swarm --invariants review-swarm.plan.json
# Or interpret the plan directly (set trace.emit: true and replace all TODOs first):
dz workflow run review-swarm.plan.json --run-id review-swarm-1 --default-family codex --coder-family codex
# If exit 75 pauses, use its envelope; after satisfying the named pause:
#   dz workflow run review-swarm.plan.json --resume review-swarm-1 --default-family codex --coder-family codex
dz workflow-trace --run review-swarm-1 --invariants review-swarm.plan.json
```

---

*Canonical source: `packages/@dzhechkov/skills-meta/loop-plan-author/SKILL.md`. Every other copy in
this repository is a byte-identical synced projection (`dz sync-canonical loop-plan-author`); edit
the canon, never a copy.*

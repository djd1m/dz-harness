# Ultracode → the canonical feature-adr pipeline (ALWAYS)

## Rule

When **ultracode is on** AND the task is a **feature implementation** (new capability, adapter,
command, skill, or a non-trivial change), you MUST run it through the **canonical feature-adr
pipeline**, not an ad-hoc Workflow authored from scratch:

```
Workflow({ scriptPath: '.claude/workflows/feature-adr.js', args: { slug: '<kebab-slug>', description: '<what to build>', code: '<file hints>', tier: 'S|M|L|XL', stopAfter: 'plan' } })
```
(Invoke by `scriptPath`, not `name` — in this harness only built-in workflows resolve by name; `.claude/workflows/*.js` are run via their path.)

This is the single source of truth for `/feature-adr --full-qe-extended`. It guarantees every
feature ships with the standard artifacts **inline** (`features/<slug>/00_complexity … 03_adr …
05_architecture … 06_implementation_plan … 07_code_changes … 08_qe_report … 09_fleet_qe`) and an
**agentic-qe QE pass** (Step 8 brutal-honesty via `qe-code-reviewer`; Step 9 fleet-QE for L/XL) —
so no retroactive ADR/QE fit-up is ever needed.

The script lives at `.claude/workflows/feature-adr.js`.

## Mandatory self-learning (baked into the pipeline)

The pipeline ALWAYS runs the feature-adr Pattern memory loop **in-process** — non-optional:
- **Step 0** recalls learned patterns (`dz recall`) → folds the top ones into requirements/ADR as `{LEARNED_PATTERNS}` + records the recalled count in the live panel (`dz statusline --fa-record`).
- **Step 8** compares candidate lessons against the Step-0 recalled pattern text. If a lesson is already covered, it reinforces the existing pattern (`dz teach --reinforce <id-or-text>`) and records the reinforced count; only genuinely new lessons are taught with `dz teach`. The loop pays off (recall), reinforces under-ranked patterns, and grows only when there is new knowledge.

**Canonical brain pin (`args.brain`) — never fragment the loop.** The loop only compounds if Step-0 recall
and Step-8 teach hit ONE store. Both are pinned to a canonical **brain store** via `args.brain` (default =
the workspace `REPO`) — the workflow emits `cd <brain> && dz recall/teach … --project <brain>`, so a lesson
taught from a Step-7 coder that `cd`'d into a target repo still lands in the brain, not that repo's `.dz`.
Omitting `args.brain` is byte-identical to today for a workspace-CWD run. Override it with a stable absolute
path when the coder works in a target checkout. Recover an accidentally-fragmented store by exporting from
the stray repo and merging into the brain: `cd <stray> && dz recall --all --json > /tmp/stray.json` → `dz
teach --from-json /tmp/stray.json --project <brain>` (exact-text dedup, idempotent).

## Optional Codex routing (opt-in, pre-flight ASK)

feature-adr can route work to Codex's models. **All of it is opt-in and graceful** — absent / declined /
Codex-unavailable → the default Claude agent runs; the pipeline NEVER blocks on Codex. Three knobs, all
overridable via `args`:

| Knob (`args.*`) | Step | Values | Effect |
|---|---|---|---|
| `planner` | 6 (Plan) | `claude` (default) · `codex` | `codex` → Step-6 plans on Codex, Claude fallback |
| `coder` | 7 (Code) | `claude` (default) · `codex` · `codex-fallback` | `codex-fallback` → Claude first, **on limit-exhaustion (null) → Codex** |
| `qeReviewer` | 8 (QE/tests) | `claude` (default) · `codex` · `codex-fallback` | same fallback, for the QE/testing stage |
| `codexModel` | — | `auto` (default — Codex self-selects the top available) · or a specific id your account exposes (e.g. `gpt-5.5`, `gpt-5.4`) | which Codex model to use |

The result reports `plannerUsed` / `coderUsed` / `qeReviewerUsed` / `codexModel` / `modelsUsed` so you can see who did what.

### Per-stage model routing — `args.models` (the general mechanism)

`args.models` is an optional per-stage map that routes EACH pipeline stage to an optimal model — one dial
over the 11 stages `{router, requirements, research, adr, ideation, ddd, architecture, plan, code, qe,
fleet}`. Each value is a **spec**: Claude `fable|opus|sonnet|haiku`, or Codex `codex` / `codex:<id>` /
`codex:<id>:<reasoning>` (reasoning ∈ `none|minimal|low|medium|high|xhigh`; ids incl. `gpt-5.5`, `gpt-5.6`). A resolver
turns the spec into that stage's `agent()` opts (`{model}` for Claude — role `agentType`s preserved;
`{agentType:'codex:codex-rescue', codexModel, _reasoning}` for Codex).

> **`<reasoning>` effort plumbing (honest scope):** the resolved `_reasoning` is RECORDED in
> `modelsUsed` (the who-did-what report) and is plumbed into each Codex dispatch prompt as an
> explicit per-call effort hint, e.g. `(If you are the Codex runtime, run at --effort xhigh.)`.
> The hint is derived from the same resolved opts that render `codex:<id>:<reasoning>`, so the
> dispatched effort and `modelsUsed` label must match for that call. `~/.codex/config.toml`
> `model_reasoning_effort` remains the fallback default when no Codex stage runs or no per-call
> effort hint is emitted.

**Recommended DEFAULT TABLE** (applied ONLY when routing is opted into — any one `args.models` key OR any
Codex knob turns it on; otherwise every stage is session-inherited, byte-identical to today):

| router | requirements | research | adr | ideation | ddd | architecture | plan | code | qe | fleet |
|---|---|---|---|---|---|---|---|---|---|---|
| `fable` | `sonnet` | `sonnet`¹ | `opus` | `sonnet` | `opus`¹ | `opus` | `sonnet` | coder² | cross-model³ | `sonnet` |

¹ `research` folds into `requirements`, `ddd` into `architecture` (single shared call) — recorded in
`modelsUsed` but not a separate call. ² `code` defaults to the `coder` knob (Claude `opus` by default).
³ `qe` — see below.

**Cross-model QE default (load-bearing rationale).** When `args.models.qe` is UNSET, QE auto-routes to the
**OTHER family than the coder** — the model that writes code must NOT also self-QE; independent cross-model
review catches what self-review misses (this is the ADR-named safety property with a dedicated test). So
coder=Codex ⇒ QE=Claude (`opus`); coder=Claude ⇒ QE=Codex (`codex:<top>:high`), falling back to a Claude
reviewer if Codex is unavailable (never blocks).

**Precedence (documented once):** `args.models[stage]` > the legacy `planner`/`coder`/`qeReviewer`/
`codexModel` knob > `DEFAULT_MODELS[stage]`. The knobs remain shortcuts that fill only unspecified stages;
`codexModel` seeds the default id for a bare `'codex'` spec. Codex-fallback (Claude-first, Codex on
limit-null) stays a knob-only behavior; a direct `models.code='codex'` means codex-first.

**gpt-5.6-ready:** adding a new Codex id is a DATA-ONLY edit to the `KNOWN_CODEX` allowlist — no new control
flow. Example: `Workflow({ scriptPath: '.claude/workflows/feature-adr.js', args: { slug, description,
tier: 'L', models: { code: 'opus', qe: 'codex:gpt-5.6:high' } } })` — Claude codes, Codex independently QEs.

**Pre-flight — detect + ASK (do this BEFORE launching a run):**
```bash
node "<codex-plugin>/scripts/codex-companion.mjs" setup --json   # → { "ready": true }
```
If `ready`, ASK the user once (skip all of this if not ready — Claude does everything):
1. *"Plan (Step 6) on the top Codex model?"* → set `planner: 'codex'`.
2. *"Fall back to Codex for code + tests/QE (Step 7/8) if the Claude Code limit is exhausted?"* →
   set `coder: 'codex-fallback'`, `qeReviewer: 'codex-fallback'`.
3. *"Which Codex model?"* (`auto` — Codex self-selects — or a specific id your account exposes; model ids are account/version-specific, so verify via the runtime rather than assuming) → **write it into codex config so the
   `codex:codex-rescue` runtime picks it up**, then pass `codexModel`:
   ```bash
   printf '\nmodel = "gpt-5.5"\n' >> ~/.codex/config.toml   # pin a REAL id your account has (auto = default; verify: ask the codex runtime what -m ids it accepts)
   ```
For the interactive SKILL (plain `/feature-adr`), make the same three offers at the planning checkpoint.

**Scenario (the reason this exists):** a long L/XL run hits the Claude Code session limit mid-Step-7.
Without this, the Code agent returns null and the run stalls. With `coder: 'codex-fallback'`, feature-adr
detects the null, logs *"Claude unavailable (limit?) — falling back to Codex auto"*, and finishes
the code + tests on Codex — no restart, no lost work.

**Codex dispatch is decided by the DELIVERABLE, not by the knob (ADR-001, codex-routing-honesty).**
`codex:codex-rescue` is a fire-and-forget Claude *wrapper*: it dispatches and returns immediately, so its
return value is a **stub**. That is correct for a stage whose deliverable is a FILE written out-of-band
**and** which verifies the write landed — `code` (Step-7.5 `git status` poll) and `plan` (requires
`06_implementation_plan.md` to appear, else it falls back to the Claude planner). For every other stage the
deliverable **is** the return value, and a stub reads exactly like a clean review. Those stages now dispatch
through `codex exec` — synchronous, real stdout. The workflow script is sandboxed (no `child_process`), so
an ordinary Claude agent runs the command and returns Codex's words verbatim: **the agent is the shell.**

Three consequences you must know before routing a stage to Codex:

- **A QE verdict is parsed, never synthesised.** Empty, whitespace-only, or sentinel output is *not* a
  clean review; text without a grade is *not* a verdict. Either case falls back to a Claude reviewer and
  logs that cross-model QE did **not** happen. The deleted `{grade: 'codex-review', gaps: []}` was the bug.
- **There is a prompt ceiling.** `codex exec` answers a trivial prompt in ~6 s and a one-line code question
  in ~12 s, but stalls past 280 s on a 55-line payload (MEASURED). Prompts over
  `CODEX_EXEC_PROMPT_CEILING_CHARS` (1200) are not sent; the stage falls back to Claude **loudly**, because
  a silent downgrade to same-model QE is a worse lie than the stub.
- **The exec agent is a Claude agent.** Under true Claude exhaustion it dies exactly like the wrapper. This
  change makes the review honest; it does **not** make Codex a lifeboat for a Claude limit. The pre-emptive
  usage switch is the limit defence — and it is disarmed while `memory.usage.*` is unset.

`safeCodexAgent` demotes an "agent type not found" error to `null` → Claude fallback, and rethrows every
other error, so real bugs still surface. The model id is **probed once per run**: the allowlist says a name
is spellable, only a probe says it answers.

**Codex-landed barrier (Step 7.5):** Codex applies edits OUT-OF-BAND via its own runtime, so a naive
pipeline runs Step-8 QE before the async write flushes and false-grades *"Step 7 never ran"* (grade D on
real, landed code — observed on the goap-ed25519 fix). When Codex was the coder, feature-adr now polls
`git status` (excluding pipeline artifacts) up to ~30s until the code changes appear and hands the
confirmed file list to QE. Claude-coded runs are synchronous, so the barrier is skipped (zero cost).

**Example invocations:**
```js
// Plan on Codex, code+QE fall back to Codex only if Claude runs out, auto:
Workflow({ scriptPath: '.claude/workflows/feature-adr.js',
  args: { slug: 'add-x', description: '…', tier: 'M',
          planner: 'codex', coder: 'codex-fallback', qeReviewer: 'codex-fallback', codexModel: 'auto' } })  // 'auto' = Codex picks top; or pin e.g. 'gpt-5.5'

// All-Claude (the default — omit the Codex knobs entirely):
Workflow({ scriptPath: '.claude/workflows/feature-adr.js', args: { slug: 'add-x', description: '…', tier: 'M' } })
```

**Headless Codex login on a VPS (no browser):** `codex login --device-auth` (prints a code + URL you
approve on another device) or `printenv OPENAI_API_KEY | codex login --with-api-key`.

## Usage-adaptive routing (pre-emptive Codex switch under limit pressure)

When routing is opted into, feature-adr probes Claude SESSION (active 5h-block) + WEEKLY (rolling 7d)
usage at EACH phase boundary via a minimal effort-low agent running `dz usage --json`, and PRE-EMPTIVELY
switches all remaining stages to Codex when usage is high — BEFORE the phase launches. Three knobs:

| Knob (`args.*`) | Default | Effect |
|---|---|---|
| `usageAdaptive` | `true` when routing is requested; `false` otherwise | `true` forces it on without other routing; `false` disables ALL probes (byte-identical to today — zero probes, no override) |
| `usageThreshold` | `70` | the `>=` percent (SESSION or WEEKLY) that triggers the switch (boundary `=70` counts as over) |
| `usageReasoning` | the `OVERRIDE_REASONING` map | per-stage reasoning under the override (merge over: design/code/plan → `xhigh`; router/qe/fleet → `high`) |

**Two-way, hysteretic.** `>= usageThreshold` on EITHER metric ⇒ switch ALL remaining stages to
`codex:<top>` (`gpt-5.6`-ready via `KNOWN_CODEX`). BOTH metrics back below (positive numbers, not nulls)
⇒ RESTORE the normal mix. **Fail-safe asymmetry:** a probe that returns null (the agent DIED — often
MEANS the limit was hit) fail-safe-switches TO Codex; a value-null (unconfigured limits) flips NOTHING —
it never sends a fresh run to Codex and never restores an active override (no flapping). A reactive belt
also flips the override when a stage agent returns null while not already overridden, so the *remaining*
stages skip the wall.

**The wrapper lesson (why pre-emptive, not just reactive).** `codex:codex-rescue` is a Claude wrapper
subagent — at TRUE exhaustion even the Codex dispatch dies. So the switch MUST happen BEFORE exhaustion,
which is exactly what the 70% probe does; the reactive belt is a best-effort backstop, not the defense.

**Cross-model-QE bounded exception (FR-2.9).** Under the override, coder AND QE are both Codex (the
cross-model self-QE guard is consciously suspended — a Claude QE reviewer is precisely the agent that
dies under limit pressure). The ` (usage-switched)` suffix + `usageEvents` keep it auditable; run an
independent re-QE after limits reset if the switch fired during Step 8.

**Config + honesty.** Set `memory.usage.sessionTokenLimit` / `memory.usage.weeklyTokenLimit` in
`.dz/config.json` (OPTIONAL — absent ⇒ `pct=null`, no switch). Percentages are ESTIMATES from local
transcript aggregation (no official API); calibrate by scaling a limit by `X/100` when a real limit-hit
lands at an estimated `X%`. Observability: switched stages carry ` (usage-switched)` in `modelsUsed`;
both return objects gain `usageEvents` (`[{phase, sessionPct, weeklyPct, action}]`, action ∈ the LOCKED
6-value set `switch|restore|keep|fail-safe-switch|reactive-switch|none`) + `usageThreshold`.

**Example:** `Workflow({ scriptPath: '.claude/workflows/feature-adr.js', args: { slug, description,
tier: 'L', models: { code: 'opus' }, usageAdaptive: true, usageThreshold: 70 } })` — Claude codes until
usage crosses 70%, then every remaining stage runs on Codex until it drops back below.

## Hybrid checkpoints (router decides)

- **S / M** → run autonomously to completion; present a final consolidated review (ADR + plan + QE).
- **L / XL** → the workflow returns after the Plan phase (`phase: 'checkpoint-after-plan'`); present
  the ADR + plan for the user's steer, then re-invoke `feature-adr` with `args.stopAfter: 'none'` to
  implement + QE. (Pass `tier` explicitly to skip the router, or `stopAfter: 'plan'` to force a
  checkpoint even for M.)

## When NOT to use it

- Trivial mechanical edits (a typo, a version bump, a one-line doc fix) — just do them.
- Pure research / design discussions with no code deliverable.
- A conformance/QE-only re-check of already-shipped code — run just the Step-8 QE, not the full pipeline.

## Why

Ad-hoc orchestrations capture the *spirit* of feature-adr but skip its artifacts + checkpoints, which
forced a retroactive ADR+QE sweep for a day's features. Routing every ultracode feature through the one
canonical workflow makes the pipeline deterministic and the ADR + agentic-qe QE non-optional.
Load-bearing lesson baked into the QE step: **the safety property an ADR names is often the untested
one — Step 8 asserts it has a test.**

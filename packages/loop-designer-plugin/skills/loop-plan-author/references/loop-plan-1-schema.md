# `loop-plan/1` — field reference

Companion reference for the `loop-plan-author` skill. The authority is
`packages/@dzhechkov/harness-core/src/loop-plan.ts` in the `dz` monorepo; this file states what an
author needs and points at what the validator will refuse.

`schema` MUST be the literal string `loop-plan/1`.

## Closed-world rule

An unknown, non-`x-` key is a **parse error** — not a tolerated extra. `x-…` extension keys are
preserved and digested but never validated. The reason is stated in the schema itself: a key that
parses, digests and enacts nothing is a plan promising behavior nobody performs.

## Top level

| Field | Type | Notes |
|---|---|---|
| `schema` | `"loop-plan/1"` | required, exact |
| `name` | string | required |
| `description` | string | required |
| `whenToUse` | string | required — the trigger contract |
| `steps` | `LoopStep[]` | required |
| `gates` | `LoopGate[]` | optional |
| `fanouts` | `LoopFanout[]` | optional; required whenever a `fanout` step exists (INV-2) |
| `joins` | `LoopJoin[]` | optional; required for every parallel region (INV-3) |
| `pauses` | `LoopPause[]` | optional |
| `checkpointing` | `{ enabled: boolean }` | `schemaVersion` is NOT ENACTED in v1 |
| `subsystems` | see below | five booleans, all default **false** |
| `trace` | `{ emit: boolean }` | observational |

## `steps[]`

| Field | Type | Notes |
|---|---|---|
| `stepId` | string | `^[a-z0-9_.:-]{1,64}$`, unique |
| `kind` | `agent｜fanout｜join｜gate｜pause` | |
| `phase` | string | first-reference order must match `meta.phases` (INV-7) |
| `deps` | string[] | must resolve, must not cycle (INV-1) |
| `prompt` | string | rendered into the GENERATED region |
| `title` | string | optional label |
| `artifacts` | `{ reads?, writes? }` | |
| `concurrency` | `barrier｜pipeline` | fanout members only |
| `model` | string｜null | resolved by the model-resolver blob when set |
| `deliverable` | `return-value｜file` | default `return-value` |
| `idempotent` | boolean | gates INV-4 and INV-6 |
| `retry` | `RetryProfile` | see below |
| `cacheable` / `cache` | boolean / `CachePolicy` | INV-6 |
| `budget` | `{ maxAgents: number }` | the `budget-before-spawn` lint rule wants it declared |
| `tools` | string[] | `<server>:<capability>` allowlist — a **declaration**, never enforcement |
| `dispatch` | `inline｜codex-wrapper｜codex-exec` | v1 enacts **`inline` only** |
| `pauseState` | string | `kind: 'pause'` only |

### `tools` — say this plainly, once

`tools` is a DECLARED perimeter that is rendered into the step's prompt. It is **not** a sandbox:
`agent()` exposes no tool restriction, and real enforcement lives at the MCP server. An empty array
is meaningful — it is the correct value for a step that touches nothing external.

## `RetryProfile`

| Field | Notes |
|---|---|
| `maxAttempts` | INCLUDES the initial attempt — `1` means run once |
| `retryableFailureClasses` | closed enum: `timeout｜transport｜malformed-output｜policy-refusal`; a function value is a parse error |
| `initialDelayMs`, `backoffMultiplier`, `maxDelayMs`, `jitter` | **NOT ENACTED in v1** — validated away. v1 retries are IMMEDIATE. |

The timing family is rejected rather than ignored precisely so a plan cannot validate while
promising timing nobody performs.

## `fanouts[]`

| Field | Notes |
|---|---|
| `stage` | the `stepId` of the `fanout` step |
| `registry` | non-empty string list; each item must satisfy the shared ItemKey regex — the SAME object the trace layer checks, so the plan domain and the runtime domain cannot drift |
| `maxFanout` | `>= 1`, REQUIRED — a concurrency window, **not** a work cap under the default policy; every registry position dispatches |
| `overflow` | optional `window｜truncate`; absent means `window`. `truncate` is the only way to cap activation |
| `truncateReason` | required, non-blank when `overflow: truncate`; the renderer emits a banner, stderr warning, and `fanout-truncated` trace receipt |
| `chain` | per-member step sequence (pipeline shape) |
| `dedup`, `reasonRequired` | optional |

Never use `maxFanout` to mean “take the first N”. With `overflow` absent or `window`, a six-item
registry and `maxFanout: 3` dispatches all six positions with at most three live at once. Deliberate
sampling must say `overflow: truncate` and explain why in `truncateReason`; otherwise silent
prefix coverage would read like complete coverage in the trace.

## `joins[]`

| Field | Notes |
|---|---|
| `stage` | the `stepId` of the `join` step |
| `forStage` | the fanout it closes |
| `joinPolicy` | closed set: `all-declared｜all-activated｜any｜quorum:<n>` |
| `onInvalid` | e.g. `named-failure` |
| `branchSchema` | optional `{ caveats?: string[] }` |

## `gates[]` / `pauses[]`

`gates[]`: `{ stepId, kind, failRoute?, maxRedos? }` — `kind: 'parse-verdict'` means the gate
PARSES a verdict; an empty or unparseable answer is not a pass.

`pauses[]`: `{ state, resumeArg, payloadSchema? }` — a typed checkpoint-return state plus the args
key a re-invoke supplies to resume. A pause without a `resumeArg` is refused by INV-5.

## `subsystems`

`checkpoints`, `trainingPairs`, `usageAdaptive`, `challengePanel`, `codexDispatch` — all default
**false**. `trainingPairs` defaults off deliberately: capture is never on by default. `codexDispatch`
is NOT ENACTED in v1 and enabling it is rejected.

## Not the runtime

Nothing in this schema starts a loop. `dz` AUTHORS, GATES and READS loops — it never RUNS one; the
rendered script is executed by the host harness (`Workflow({ scriptPath })` in Claude Code).

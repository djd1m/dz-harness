---
name: lint
description: Gate a rendered loop script with dz workflow-lint — layer-1 rules, exit 0/1/3, where inconclusive is never a pass. Triggers on /loop-designer:lint.
---

# /loop-designer:lint

> **`dz` AUTHORS, GATES and READS loops — it never RUNS one.**

The deterministic layer-1 gate over a rendered script: `meta-complete`, `phase-parity`,
`sandbox-bans`, `shq-hygiene`, `agent-labelled`, `budget-before-spawn`, `fanout-bounded`,
`barrier-postdominates`, `retry-idempotent`, `pause-wired`, `plan-binding`, `blob-hash`,
`size-budget`, `tool-perimeter-declared`, `dispatch-by-deliverable`, `no-partial-checkpoint`,
`no-agent-outside-runstep`, `resume-fingerprint`.

## Run exactly this

```bash
if [ -f "${CLAUDE_PLUGIN_ROOT}/bin/loop-designer.js" ]; then
  node "${CLAUDE_PLUGIN_ROOT}/bin/loop-designer.js" run lint <script.js> [--plan <plan.json>] [--require-plan|--legacy] [--json]
else
  echo "LOOP-DZ-PLUGIN-ROOT-UNSET: \${CLAUDE_PLUGIN_ROOT} did not resolve — falling through to npx" >&2
  npx -y @dzhechkov/loop-designer-plugin run lint <script.js> [--plan <plan.json>] [--require-plan|--legacy] [--json]
fi
```

Report the command's output verbatim. Do not paraphrase a verdict, and do not re-derive any flag
this wrapper did not pass — everything after the verb is forwarded unchanged.

The `else` branch is the AM-10 runtime fallback: when `${CLAUDE_PLUGIN_ROOT}` does not resolve at
run time (a bare-skill or Codex session, or a host that stopped exporting it), the same npx
delivery the version guard uses takes over — announced by the `LOOP-DZ-PLUGIN-ROOT-UNSET`
sentinel, never a raw MODULE_NOT_FOUND stack. A reader without bash can run the `npx` line from
the `else` branch directly.

## Exit codes

\`0\` pass · \`1\` fail · \`3\` **inconclusive**. Three is not a pass and must never be reported as one:
it means the gate could not decide, usually because the script was not bound to a plan. Bind it
(\`--plan … --require-plan\`) or acknowledge a legacy script explicitly (\`--legacy\`).

A `LOOP-DZ-*` line on stderr is the authoritative refusal channel: `LOOP-DZ-STALE` (the `dz` on
PATH was rejected — older, below the 0.4.6 floor, unparseable, or a failed capability probe — and
npx was used instead), `LOOP-DZ-UNAVAILABLE` (no usable `dz` — npx absent or its fetch failed;
**nothing ran**), `LOOP-DZ-RANGE-UNSATISFIABLE` (npx resolved a `dz` outside `^0.4.6`),
`LOOP-DZ-PLUGIN-ROOT-UNSET` (the plugin root did not resolve; the npx fallback ran instead). An
ACCEPTED newer `dz` announces itself with a plain informational line, never a sentinel. Key on the
sentinel line, never on the number.

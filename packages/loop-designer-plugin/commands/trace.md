---
name: trace
description: Read what a finished run actually did — timeline plus plan-derived invariants over its trace.jsonl. Triggers on /loop-designer:trace.
---

# /loop-designer:trace

> **`dz` AUTHORS, GATES and READS loops — it never RUNS one.**

Reads a completed run's `trace.jsonl`. Three honesty rules to repeat when reporting the result:
an **empty trace is expected**, not an error (a loop may simply not have emitted one); a run with
no `run.closed` frame has a possibly-truncated tail, so window-dependent invariants report
**inconclusive** rather than pass; invariants are evaluated **by SEQ**, never by wall-clock time.

## Run exactly this

```bash
if [ -f "${CLAUDE_PLUGIN_ROOT}/bin/loop-designer.js" ]; then
  node "${CLAUDE_PLUGIN_ROOT}/bin/loop-designer.js" run trace <runDir|--slug <s>|--run <id>> [--invariants <plan.json>] [--html <out.html>] [--json]
else
  echo "LOOP-DZ-PLUGIN-ROOT-UNSET: \${CLAUDE_PLUGIN_ROOT} did not resolve — falling through to npx" >&2
  npx -y @dzhechkov/loop-designer-plugin run trace <runDir|--slug <s>|--run <id>> [--invariants <plan.json>] [--html <out.html>] [--json]
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

\`0\` the trace was read · \`1\` it could not be read. Reading a run is an observation, not a verdict
on the run's quality.

A `LOOP-DZ-*` line on stderr is the authoritative refusal channel: `LOOP-DZ-STALE` (the `dz` on
PATH was rejected — older, below the 0.4.6 floor, unparseable, or a failed capability probe — and
npx was used instead), `LOOP-DZ-UNAVAILABLE` (no usable `dz` — npx absent or its fetch failed;
**nothing ran**), `LOOP-DZ-RANGE-UNSATISFIABLE` (npx resolved a `dz` outside `^0.4.6`),
`LOOP-DZ-PLUGIN-ROOT-UNSET` (the plugin root did not resolve; the npx fallback ran instead). An
ACCEPTED newer `dz` announces itself with a plain informational line, never a sentinel. Key on the
sentinel line, never on the number.

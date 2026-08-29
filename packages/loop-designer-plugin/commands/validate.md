---
name: validate
description: Check a loop-plan/1 plan against the schema and the eight invariants INV-1..8, one diagnostic per violated instance. Triggers on /loop-designer:validate.
---

# /loop-designer:validate

> **`dz` AUTHORS, GATES and READS loops — it never RUNS one.**

Runs schema parsing (`loop-plan/1` is CLOSED-WORLD — an unknown non-`x-` key is a parse error) and
the invariants INV-1..8: reference closure and acyclicity, bounded fanout, an explicit join with a
closed-set policy, retry only on idempotent steps, resumable pauses, cache identity, phase order.

## Run exactly this

```bash
if [ -f "${CLAUDE_PLUGIN_ROOT}/bin/loop-designer.js" ]; then
  node "${CLAUDE_PLUGIN_ROOT}/bin/loop-designer.js" run validate <plan.json> [--json]
else
  echo "LOOP-DZ-PLUGIN-ROOT-UNSET: \${CLAUDE_PLUGIN_ROOT} did not resolve — falling through to npx" >&2
  npx -y @dzhechkov/loop-designer-plugin run validate <plan.json> [--json]
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

\`0\` valid · \`1\` at least one parse error or invariant violation. Never treat a non-zero exit as
advisory: an unbounded fanout or an unresumable pause is a refusal, not a style note.

A `LOOP-DZ-*` line on stderr is the authoritative refusal channel: `LOOP-DZ-STALE` (the `dz` on
PATH was rejected — older, below the 0.4.6 floor, unparseable, or a failed capability probe — and
npx was used instead), `LOOP-DZ-UNAVAILABLE` (no usable `dz` — npx absent or its fetch failed;
**nothing ran**), `LOOP-DZ-RANGE-UNSATISFIABLE` (npx resolved a `dz` outside `^0.4.6`),
`LOOP-DZ-PLUGIN-ROOT-UNSET` (the plugin root did not resolve; the npx fallback ran instead). An
ACCEPTED newer `dz` announces itself with a plain informational line, never a sentinel. Key on the
sentinel line, never on the number.

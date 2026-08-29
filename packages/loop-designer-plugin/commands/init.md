---
name: init
description: Scaffold a new loop-plan/1 plan (pipeline | barrier | fanout | gate) that already validates and renders lint-clean. Triggers on /loop-designer:init.
---

# /loop-designer:init

> **`dz` AUTHORS, GATES and READS loops — it never RUNS one.**

Scaffolds a `loop-plan/1` plan. Pick the pattern by the SHAPE of the work: `pipeline` (one item
through ordered stages), `barrier` (independent lanes, then one synthesis), `fanout` (spread work),
`gate` (produce, then judge, with a bounded route back). Every scaffold field marked `TODO` is an
authoring cue you must replace before the plan means anything.

## Run exactly this

```bash
if [ -f "${CLAUDE_PLUGIN_ROOT}/bin/loop-designer.js" ]; then
  node "${CLAUDE_PLUGIN_ROOT}/bin/loop-designer.js" run init --name <name> --pattern <pipeline|barrier|fanout|gate> --o <plan.json>
else
  echo "LOOP-DZ-PLUGIN-ROOT-UNSET: \${CLAUDE_PLUGIN_ROOT} did not resolve — falling through to npx" >&2
  npx -y @dzhechkov/loop-designer-plugin run init --name <name> --pattern <pipeline|barrier|fanout|gate> --o <plan.json>
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

\`0\` the plan was written · \`1\` the arguments or the scaffold were rejected. The exit code is the
wrapped command's own, passed through byte-for-byte.

A `LOOP-DZ-*` line on stderr is the authoritative refusal channel: `LOOP-DZ-STALE` (the `dz` on
PATH was rejected — older, below the 0.4.6 floor, unparseable, or a failed capability probe — and
npx was used instead), `LOOP-DZ-UNAVAILABLE` (no usable `dz` — npx absent or its fetch failed;
**nothing ran**), `LOOP-DZ-RANGE-UNSATISFIABLE` (npx resolved a `dz` outside `^0.4.6`),
`LOOP-DZ-PLUGIN-ROOT-UNSET` (the plugin root did not resolve; the npx fallback ran instead). An
ACCEPTED newer `dz` announces itself with a plain informational line, never a sentinel. Key on the
sentinel line, never on the number.

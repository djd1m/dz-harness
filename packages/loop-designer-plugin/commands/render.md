---
name: render
description: Render a validated loop-plan/1 plan into a region-delimited loop script, preserving USER regions byte-for-byte. Triggers on /loop-designer:render.
---

# /loop-designer:render

> **`dz` AUTHORS, GATES and READS loops — it never RUNS one.**

Emits the script from the plan. Only `// ── BEGIN USER … ──` regions are hand-editable, and they
survive re-render byte-for-byte; everything else is generated and will be overwritten. `--check`
writes a `.proposed.js` and reports the diff instead of overwriting.

**Hand-off, stated plainly:** the rendered script is NOT executed here. It runs only under the host
harness — in Claude Code, `Workflow({ scriptPath: "<rendered>.js" })`. Producing the file completes
this command; running it is a separate, deliberate act by the user.

## Run exactly this

```bash
if [ -f "${CLAUDE_PLUGIN_ROOT}/bin/loop-designer.js" ]; then
  node "${CLAUDE_PLUGIN_ROOT}/bin/loop-designer.js" run render <plan.json> --o <script.js> [--check] [--force]
else
  echo "LOOP-DZ-PLUGIN-ROOT-UNSET: \${CLAUDE_PLUGIN_ROOT} did not resolve — falling through to npx" >&2
  npx -y @dzhechkov/loop-designer-plugin run render <plan.json> --o <script.js> [--check] [--force]
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

\`0\` rendered (or, with \`--check\`, no differences) · \`1\` refused or differences found.

A `LOOP-DZ-*` line on stderr is the authoritative refusal channel: `LOOP-DZ-STALE` (the `dz` on
PATH was rejected — older, below the 0.4.6 floor, unparseable, or a failed capability probe — and
npx was used instead), `LOOP-DZ-UNAVAILABLE` (no usable `dz` — npx absent or its fetch failed;
**nothing ran**), `LOOP-DZ-RANGE-UNSATISFIABLE` (npx resolved a `dz` outside `^0.4.6`),
`LOOP-DZ-PLUGIN-ROOT-UNSET` (the plugin root did not resolve; the npx fallback ran instead). An
ACCEPTED newer `dz` announces itself with a plain informational line, never a sentinel. Key on the
sentinel line, never on the number.

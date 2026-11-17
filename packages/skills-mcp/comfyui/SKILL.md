---
name: "comfyui"
description: "ComfyUI workflows through a separately registered, pinned MCP server."
trust_tier: 0
trust_tier_label: "Reference"
validation:
  schema_path: schemas/output.json
  validator_path: scripts/validate-config.json
---

# ComfyUI in Codex

Read [the upstream ComfyUI core guide](references/upstream-comfyui-core.md) for workflows, models, queues, and recovery. This reference is the original `comfyui-core` skill from `comfyui-mcp@0.52.206`, with its [MIT notice](references/LICENSE.upstream-comfyui-core) and [upstream project](https://github.com/artokun/comfyui-mcp).

## Operator setup and check

Node.js 22 or newer is required for the pinned server. Set `COMFYUI_URL` to the actual operator-provided backend URL. An example for a local backend is below; replace it for your environment. Run the commands in the Codex profile where you want to use ComfyUI. Installing this skill, or seeing it in a manifest, does not connect the server.

To install only this skill from an unpacked `@dzhechkov/skills-mcp` package into a chosen project, run `dz init --target codex --select comfyui --skills-dir <unpacked-package-path> --project <project-path> --no-integrations --no-hooks`. The `--no-integrations` option keeps MCP registration separate. Inspect `<project-path>/.agents/skills/comfyui/SKILL.md` and its `references/` files afterward.

```bash
codex mcp add comfyui --env COMFYUI_URL=http://127.0.0.1:8188 -- npx -y comfyui-mcp@0.52.206 --stdio --full
codex mcp get comfyui
```

The registration record alone proves only that Codex stored a command; launch Codex and inspect the **currently exposed MCP tools and their schemas** before invoking any tool. The full server may expose facade tools such as `list_tools`, `describe_tool`, and `call_tool`; use actual discovery to select names and arguments. Do not assume the source inventory is the live tool surface. If discovery fails, report it and stop before a workflow call.

## Operating boundary

Follow the user's current task authorization and environment limits before donor advice. The donor's model download, custom node install, process start/restart, and VRAM-clearing procedures are side effects; use them only when explicitly authorized for this task. Read-only checks can inspect available tool schemas, `get_system_stats`, `list_local_models`, and `queue` when those tools are actually exposed; backend-dependent checks may then report unavailable. Validate the target URL and do not guess a fallback backend.

For a requested generation, use the donor workflow logic with **discovered** tool schemas. The pinned source contains `get_workflow`, `save_workflow`, `create_workflow`, `enqueue_workflow`, `generate_image`, `list_local_models`, `queue`, `get_system_stats`, and `get_image`; source names are leads, not proof of live registration. Do not use the retired names from this wrapper's old recipes (`load_workflow`, `execute_workflow`, `text_to_image`, `queue_status`, `vram_status`, `free_vram`) unless the connected server actually exposes them. For images, inspect an actual `get_image` result or an image-viewing tool available in the current host; Claude's `Read` instruction is not a Codex API. Claude's `${CLAUDE_PLUGIN_ROOT}/scripts/monitor-progress.mjs` background monitor is not installed by this wrapper. Use the donor's `queue` status polling fallback, with the discovered arguments and a bounded interval, when monitoring a submitted job.

## Report readiness honestly

Record separate states for `installation`, `registration`, `discovery`, `runtime`, `models`, and `generation`: `unknown`, `unavailable`, or `verified`, with the observation that supports each verified state. Installation, registration, schema validation, and tool discovery never prove backend reachability, usable models, or generated output. If a layer is unavailable, state the first missing prerequisite and leave downstream layers unknown or unavailable. Claim generation success only after an actual completed job and attributable output are retrieved; include output path or reference. The optional readiness fields in [output schema](schemas/output.json) are a reporting contract, not a runtime probe.

---
name: "comfyui"
description: "ComfyUI image generation via MCP — execute workflows, generate images, manage models, control VRAM."
trust_tier: 2
trust_tier_label: "Validated"
validation:
  schema_path: schemas/output.json
  validator_path: scripts/validate-config.json
---

# comfyui

ComfyUI image generation via the [comfyui-mcp](https://github.com/comfyui-mcp/comfyui-mcp) server. Provides 80+ tools for executing workflows, generating images, managing models, and controlling VRAM. Supports text-to-image, image-to-image, inpainting, upscaling, and ControlNet workflows.

## MCP Server

- **Package:** `comfyui-mcp`
- **Transport:** stdio
- **Tools:** 80+ tools, 10 slash commands, 6 skills, 3 agents

## Installation

### Claude Code

```bash
claude mcp add comfyui -- npx comfyui-mcp
```

### Claude Desktop (`claude_desktop_config.json`)

```json
{
  "mcpServers": {
    "comfyui": {
      "command": "npx",
      "args": ["comfyui-mcp"],
      "env": {
        "COMFYUI_URL": "http://127.0.0.1:8188"
      }
    }
  }
}
```

## Prerequisites

- **ComfyUI** installed and running (Desktop app or from source)
- ComfyUI accessible at `http://127.0.0.1:8188` (default) or custom URL via `COMFYUI_URL`
- At least one checkpoint model downloaded (e.g., SDXL, SD 1.5, Flux)

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `COMFYUI_URL` | No | `http://127.0.0.1:8188` | ComfyUI server URL |

## Tools

Key tool categories provided by the MCP server:

| Category | Tools | Description |
|----------|-------|-------------|
| Workflow | `load_workflow`, `save_workflow`, `execute_workflow` | Load, save, and run ComfyUI workflows |
| Generation | `text_to_image`, `image_to_image`, `inpaint` | Core image generation operations |
| Models | `list_models`, `load_model`, `switch_model` | Model management and switching |
| Queue | `queue_status`, `cancel_job`, `clear_queue` | Queue and job management |
| VRAM | `vram_status`, `unload_models`, `free_vram` | GPU memory management |
| Upscale | `upscale_image`, `apply_controlnet` | Post-processing and enhancement |

## Procedure

1. **Verify ComfyUI is running.** Before any generation, confirm the ComfyUI server is accessible. Check the server URL and that at least one checkpoint model is available. If ComfyUI is not running, instruct the user to start it. Do not attempt to start ComfyUI programmatically.

2. **Load or create workflow.** Either:
   - Load an existing workflow from a JSON file using `load_workflow`
   - Use a built-in workflow template (text-to-image, image-to-image, inpainting)
   - Build a custom workflow by chaining nodes programmatically
   Verify the workflow is valid before execution.

3. **Set parameters.** Configure generation parameters:
   - **Model:** Select checkpoint (SDXL, SD 1.5, Flux, etc.)
   - **Prompt:** Positive and negative prompts. Use descriptive, comma-separated tags for best results.
   - **Size:** Width and height (must be multiples of 8; 1024x1024 for SDXL, 512x512 for SD 1.5)
   - **Steps:** Sampling steps (20-30 for quality, 8-12 for speed with LCM/Turbo)
   - **CFG Scale:** Classifier-free guidance (7-12 typical; lower for Flux)
   - **Sampler:** euler, euler_ancestral, dpmpp_2m, dpmpp_sde (match to model)
   - **Seed:** Fixed for reproducibility, -1 for random

4. **Execute workflow.** Submit the workflow to the ComfyUI queue. Monitor execution status. Handle errors:
   - OOM: Reduce resolution or batch size, or call `free_vram` first
   - Missing model: List available models and suggest alternatives
   - Node errors: Report the specific failing node and its configuration

5. **View generated images.** Retrieve the output image(s). Report:
   - File path of generated image(s)
   - Generation parameters used (for reproducibility)
   - Execution time and queue position
   - Seed used (for re-generation)

6. **Manage models and VRAM.** For ongoing sessions:
   - Check VRAM usage before loading large models
   - Unload unused models to free VRAM
   - Switch models efficiently (unload current before loading next)
   - Monitor queue length to avoid overloading

## Anti-patterns

- **No VRAM management.** Loading multiple large models without checking VRAM causes OOM crashes. Always check `vram_status` before loading a new model and `free_vram` if needed.
- **Ignoring the queue.** Submitting many jobs without checking queue status leads to long waits and potential timeouts. Monitor `queue_status` and batch jobs appropriately.
- **Hardcoded paths.** ComfyUI paths differ between Desktop and source installations, and between OS platforms. Always use the MCP tools to discover paths rather than assuming.
- **Wrong resolution for model.** SDXL expects 1024x1024, SD 1.5 expects 512x512. Mismatched resolutions produce artifacts or waste VRAM.
- **Ignoring negative prompts.** Negative prompts are essential for quality. Always include at least basic negative prompts for the model type.
- **Not saving seeds.** Without recording the seed, results are not reproducible. Always report the seed used.

## Self-check

Before delivering, verify:

1. [ ] ComfyUI server connectivity was verified before attempting generation
2. [ ] Appropriate model was selected for the task (SDXL for high-res, SD 1.5 for speed, Flux for quality)
3. [ ] Resolution matches the model's expected input size
4. [ ] Both positive and negative prompts were provided
5. [ ] VRAM was checked before loading new models
6. [ ] Generated images were retrieved and file paths reported
7. [ ] Seed was recorded for reproducibility
8. [ ] Queue status was checked before submitting large batches

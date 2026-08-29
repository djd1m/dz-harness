---
name: "provider-debug"
description: "Diagnoses and fixes AI provider configuration and connection issues."
trust_tier: 2
trust_tier_label: "Validated"
validation:
  schema_path: schemas/output.json
  validator_path: scripts/validate-config.json
---

# provider-debug

A previously-working AI provider broke, or a switch between providers did not take. Read the config, identify the wrong layer, propose the smallest fix.

## When to use

- User gets API errors after configuring an AI provider (OpenAI, Anthropic, Google Gemini, Ollama, LM Studio, Azure OpenAI, etc.)
- User sees "model not found", 400, 401, 403, or 404 errors from a provider API
- User says their AI agent or tool is not connecting to the expected provider
- User has a specific provider error message they need help interpreting
- User wants to verify that a provider switch (e.g., from OpenAI to Anthropic) is working correctly
- User is setting up a local model (Ollama, LM Studio) and it is not responding
- User has rate limiting, quota, or billing issues with a provider

## When NOT to use

- User wants to choose which AI provider to use (that is a product/architecture decision, not debugging)
- User wants to fine-tune or train a model
- User has application-level bugs unrelated to the AI provider (use `debugging`)
- User wants to benchmark or compare model quality across providers
- User is building a provider integration from scratch (use an implementation skill)

## Procedure

1. **Run diagnostics.** Check if the tool or framework has a built-in health check:
   - Look for `doctor`, `health`, or `status` commands in the tool the user is running
   - Check basic network connectivity: can the machine reach the provider's API endpoint?
   - For local providers (Ollama, LM Studio): verify the process is running (`ps aux | grep ollama`, `curl http://localhost:11434/api/tags`)
   - For cloud providers: verify DNS resolution and HTTPS connectivity (`curl -s -o /dev/null -w "%{http_code}" https://api.openai.com/v1/models`)
   - Check if a proxy or VPN is interfering with the connection
   - Note the exact HTTP status code and response body -- these are the most diagnostic artifacts

2. **Inspect configuration files.** The most common failure is a misconfigured setting. Check:
   - **Environment variables:** `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GOOGLE_API_KEY`, `OLLAMA_HOST`, `AZURE_OPENAI_ENDPOINT`, etc. Verify they are set, non-empty, and not stale.
   - **Config files:** Look for provider config in the tool's settings (VS Code settings.json, `.env`, `config.yaml`, `config.json`, project-specific config). Check for typos in model names, base URLs, and API versions.
   - **Model names:** Verify the model identifier is exact. Common mistakes:
     - `gpt-4` vs `gpt-4o` vs `gpt-4-turbo` (different models, different capabilities)
     - `claude-3-opus-20240229` vs `claude-opus-4-20250514` (version-dated names)
     - `gemini-pro` vs `gemini-1.5-pro` (generation matters)
     - `llama3` vs `llama3:latest` vs `llama3:70b` (Ollama tag format)
   - **Base URLs:** Cloud providers have fixed URLs. Custom/proxy setups need the correct base URL. Azure OpenAI uses a different URL format (`https://{resource}.openai.azure.com/openai/deployments/{deployment}/`).
   - **API versions:** Azure OpenAI requires an `api-version` query parameter. Check it matches a valid version.

3. **Check active provider flags.** In tools that support multiple providers:
   - Verify only ONE provider is actively configured. Multiple active providers cause undefined behavior in most tools.
   - Check for provider priority/fallback settings if the tool supports them.
   - Look for stale config from a previous provider that might conflict.
   - In VS Code extensions, check both user settings and workspace settings -- workspace can override user.

4. **Match error to common failure pattern.** Diagnose by the specific error:

   | Error | Likely Cause | Fix |
   |-------|-------------|-----|
   | `401 Unauthorized` | Invalid, expired, or missing API key | Regenerate key, check env var spelling |
   | `403 Forbidden` | Key lacks required scopes, wrong org, or region restriction | Check API key permissions, org ID, allowed regions |
   | `404 Not Found` / `model_not_found` | Wrong model name or model not available in region | Verify exact model ID, check regional availability |
   | `400 Bad Request` | Invalid parameter for this model (e.g., `reasoning_effort` on non-reasoning model) | Remove unsupported parameters, check model capabilities |
   | `429 Too Many Requests` | Rate limit or quota exceeded | Check usage dashboard, implement backoff, upgrade plan |
   | `Connection refused` (local) | Ollama/LM Studio not running or wrong port | Start the service, check port binding |
   | Empty response (local) | LM Studio model not loaded, Ollama model not pulled | Load/pull the model first |
   | `ECONNRESET` / timeout | Network issue, proxy, or firewall | Check network, proxy settings, increase timeout |
   | `SSL certificate` error | Corporate proxy MITM, expired cert, wrong CA bundle | Set `NODE_EXTRA_CA_CERTS` or disable strict SSL for testing |
   | `context_length_exceeded` | Input too long for model's context window | Reduce input, switch to larger-context model |
   | `content_filter` / `safety` | Provider content filter triggered | Rephrase input, check content policy |

5. **Show verification command after fix.** After identifying and applying the fix:
   - Provide a minimal command that tests the fix works:
     - OpenAI: `curl https://api.openai.com/v1/models -H "Authorization: Bearer $OPENAI_API_KEY" | head -20`
     - Anthropic: `curl https://api.anthropic.com/v1/messages -H "x-api-key: $ANTHROPIC_API_KEY" -H "anthropic-version: 2023-06-01" -H "content-type: application/json" -d '{"model":"claude-sonnet-4-20250514","max_tokens":10,"messages":[{"role":"user","content":"hi"}]}'`
     - Ollama: `curl http://localhost:11434/api/generate -d '{"model":"llama3","prompt":"hi","stream":false}'`
     - Gemini: `curl "https://generativelanguage.googleapis.com/v1beta/models?key=$GOOGLE_API_KEY"`
   - Ask the user to run it and confirm the response is valid
   - If the tool has its own test/ping command, prefer that over raw curl

6. **If not resolved, ask for the full error response body.** The HTTP status code alone is often insufficient. Ask the user to:
   - Run with verbose/debug logging enabled (most tools have a `--verbose` or `DEBUG=*` flag)
   - Capture the full HTTP response body, not just the status code
   - Check for multiple error messages (some providers return arrays of errors)
   - Note the exact timestamp -- intermittent failures may correlate with provider incidents (check status pages: status.openai.com, status.anthropic.com, etc.)

## Key Rules

- Always check the simplest explanation first: is the API key set? Is it the right one? Is the service running?
- Never ask the user to paste their API key. Ask them to verify it is set: `echo $OPENAI_API_KEY | head -c 8` (shows prefix only).
- Model names must be exact. "Close enough" does not work with provider APIs.
- When switching providers, check for provider-specific parameters that the new provider does not support.
- Local model providers (Ollama, LM Studio) have a completely different failure mode from cloud providers. Always check if the process is running first.
- Provider status pages are real. Check them before deep debugging.

## Output Format

Return a structured diagnosis with: provider identified, error classification, root cause, fix applied, and verification command with expected output.

# Ready-made E2B runtime probes — 2026-11-09

Constraint: use only runtime binaries already present in E2B templates. No custom image or runtime installation/upgrade was performed. Only pinned harness-cli 0.8.61, skills-meta 0.9.75 and the candidate skill instructions were installed into a disposable project.

## Template availability

- `Sandbox.create('pi')` returned 404. The authenticated `/default-templates` catalog nevertheless listed a ready Pi build. Creating it by template ID `ipwazbgpjpapvv8s2nyf` succeeded; `pi --version` reported 1.3.0. This proves runtime presence/startup, not Pi consultation quality. Cause of alias-vs-ID behavior was not established.
- `Sandbox.create('claude')` succeeded; Claude Code version 2.1.312 was present before and after project setup.
- Six sandboxes were actually created across probes and Claude trials; every one returned successful kill and subsequent absence. The failed Pi-alias attempt created no observed sandbox.

Official references: [E2B Pi](https://docs.e2b.dev/agents/pi), [E2B Claude Code](https://docs.e2b.dev/agents/claude-code), [OpenRouter Claude Code integration](https://openrouter.ai/docs/cookbook/coding-agents/claude-code-integration). Documentation availability is not sufficient: probe actual startup on the configured endpoint.

## Claude consultation smoke

Used Haiku 5.5 through OpenRouter's Anthropic-compatible endpoint, native `Skill` invocation, and a tool allowlist limited to `Read` and `Skill`. No recommended skill execution, deployment, or model-initiated package installation occurred. Runtime was unchanged and the candidate skill was emitted byte-for-byte through `dz init --target claude-code --select skill-advisor --no-hooks --no-integrations`.

Initial attempts stopped on Claude's max-budget guard. Diagnostic capture in the second attempt confirmed `error_max_budget_usd`; this was neither a failed skill load nor proof of poor answer quality. Claude reported costBasis unknown for the OpenRouter model: its $0.4982675 estimate differed from the $0.009865695 sum returned by OpenRouter for the four captured request IDs. These estimates are not interchangeable. The initial runner did not retain detailed command-error stdout; the second run did.

Successful trials used a bounded $1 CLI estimate cap per question and disabled extended thinking through the runtime environment. This is an integration smoke, not a controlled A/B with previous OpenCode trials: runtime defaults, provider routing, reasoning and session/cache behavior can differ.

| Task | Elapsed consultation | Primary | Complement |
|---|---:|---|---|
| Feature from requirements through verification | 31.1 s | feature-adr | explore, explicitly conditional |
| GitHub research with source links | 29.5 s | goap-research-ed25519 | git-mcp |
| Cloud.ru deployment and maintenance | 24.4 s | deploy-on-cloudru-vm | canary-watch |

All three invoked the native skill successfully, read actual sources for every selected pick, returned catalog-valid skill names, and respected two gaps. Outputs were fenced JSON decoded on the host; no SDK/schema-constrained output claim is made. Installation commands were deliberately omitted from advice because the host owns them. The OpenCode-specific install renderer was not used to render Claude commands.

`claude-smoke.json` preserves final drafts, actual read-source excerpts, hashes and mechanical checks, excluding model thinking and unrelated session metadata. Cost reports are in `billing.json`: the feature trial's captured IDs all returned cost data, but some later request IDs returned 404. Do not treat partial totals as full cost or include E2B compute in these model API numbers.

## Independent semantic review: gpt-6-astra

- Feature: conditional explore and absence of unconditional contradictory pipeline improved the example. Unsupported “has not undergone BTO evaluation” remains: Advisory status alone does not prove evaluation history.
- Research: useful provenance and repository tools, but “does not search GitHub projects” overstates absence; source workflow includes searching candidate sources. The required git-mcp-server prerequisite is missing. HTTP is performed by fetch_source, not create_fetched_fact. Prior mandatory-human-review and universal GitHub-signing claims disappeared.
- Cloud.ru: useful deploy → canary sequence; Go CLI prerequisite, sustained watching and optional Slack/Discord webhooks correctly stated. Claiming canary cannot write CI workflow and a separate skill is required overstates what source silence establishes.

Conclusion: Claude Code is a working candidate with useful examples. Three smoke cases do not select a runtime winner or prove semantic readiness. Pi is eligible for a later same-task consultation test now that its pre-built image has started successfully. Skill-source, model and runtime effects must be separated in the next comparison.

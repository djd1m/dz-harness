# Cross-model role experiment

Question: can a different model in the evidence-review role improve the cheap
advisor team without moving every stage to an expensive model?

## Method

Paired replay: use exactly the same three frozen Haiku drafts from
`live-team-smoke-v2.json` and captured sources from the historical `claude-smoke.json`.
The selector is replayed, not called again. Compare Haiku reviewer with Sonnet
reviewer; Haiku remains the conditional editor in both configurations. Every
review/edit is a fresh stateless gateway request. One repair at most, unchanged
host validators and 120-second per-call deadline; 12,000 output-token cap.

Models were confirmed available in the current OpenRouter models endpoint before
running: `anthropic/claude-haiku-5.5`, `anthropic/claude-sonnet-5.5`.
No custom E2B images, runtime installations, or website changes are involved.
This isolates the reviewer-model choice on a small development set; it is neither
a held-out benchmark nor a native runtime integration test. Single observations
cannot establish stable accuracy, latency or a statistically meaningful winner.

Actual outputs, stages, timings and gateway-reported usage are in
`cross-model-replay.json`. Reported usage cost, where present, is not independently
reconciled account billing; absent/failed-call usage is not zero. Selection cost is
excluded because the original drafts are replayed.

## Observed results

| Reviewer / editor | Feature | Research | Cloud.ru | Gateway-reported USD, three cases |
|---|---|---|---|---:|
| Haiku / Haiku | withheld at review, 22.5 s | withheld after repair, 59.1 s | withheld at review, 23.1 s | 0.021574 |
| Sonnet / Haiku | withheld after repair, 33.5 s | mechanically accepted after repair, 36.2 s | withheld after repair, 35.0 s | 0.338286 |

Only reviewer model changes; original selection is replayed in both profiles.
Sonnet produced one mechanically accepted answer, versus zero for Haiku. This is
not yet a semantic success: the accepted answer claims that registry/type and
OpenCode installation were not checked, despite the host's retained validated
registry and generated commands. The host's quote/binding checks cannot establish
that the reviewer correctly interprets all claims. Independent assessment follows.

The model swap costs more in this observation and does not justify declaring a
winner. A stronger reviewer alone is insufficient; before production, the role
inputs must distinguish host-verified catalog/install facts from skill-source
capabilities, and revised answers need semantic acceptance beyond quote presence.

## Independent semantic assessment (gpt-6-astra)

The mechanically accepted research answer is **rejected semantically**:

- It says the report gate rejects unopened sources, but the captured source allows
  qualified LISTING_ONLY claims and rejects ASSERTED claims.
- It calls git-mcp an MCP server rather than a skill, confusing the skill with its
  external dependency `@cyanheads/git-mcp-server`.
- It presents missing reviewer-side registry data as proof that the host never
  checked catalog membership or installation.
- It discloses medical-population requirements, but still does not establish a
  useful first workflow for investigating GitHub projects.

Feature withholding is defensible for the unsupported registry statement; remove
irrelevant verification commentary instead of delegating host checks to users.
Cloud.ru also merits rejection, but the strongest error is missed by Sonnet: the
answer says users must provide all four credential values, contrary to the source's
environment/configuration-first and missing-value discovery process. Sonnet's
optional-pipeline and Claude-specific-example objections are weaker than this.

Thus neither profile demonstrates a semantically accepted answer on these cases.
Keep PR #30 draft. The promising architecture remains cheap selection plus a more
capable independent reviewer, but the current measured configuration is not ready
for rollout. Next bounded experiment should fix role evidence/context and remove
internal verification commentary before further model comparisons; do not weaken
quote gates or claim that a model upgrade alone solves source fidelity.

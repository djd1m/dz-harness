# Iteration 2 — coverage and conservative selection

Bounded continuation of the local pilot; no website/runtime/npm deployment.

- FR1: add eight source-grounded scenarios for the documented coverage gaps. Independent review binds each exact record; previous records stay unchanged.
- FR2: an empty lexical result does not establish an out-of-scope request. Nonblank queries still reach the selector so it can ask for clarification. Blank input returns clarify without a paid call.
- FR3: recommend only when selected scenarios collectively cover all essential requested outcomes. For partial matches abstain (no-match or clarify); no invented workflow or generated capabilities. This is a semantic model policy, not a deterministic completeness proof.
- FR4: keep previous questions/results unchanged. Freeze a fresh question set before implementation; separately adjudicate coverage of old questions against the expanded catalog.
- NFR1: retain exact ID allowlist and reviewed-text materialization. Provider errors/invalid output remain explicit evaluation failures, never successful no-match answers.
- NFR2: evaluation reports bind questions, coverage, catalog and selector code by hashes. Compare separately: new coverage, retrieval and model decisions; do not call development regressions held-out.

Alternatives: heuristic query-length rule (cannot distinguish ambiguous from specific unsupported tasks); add generated gap explanations (expands semantic attack/error surface); mandatory second strong reviewer per request (cost/latency not justified by pilot). Selected: bounded selector policy plus independent semantic evaluation. If results remain poor, report them instead of tuning the frozen set repeatedly.

Verification: meaningful host/provider boundary tests including empty candidates, blank query, invalid model IDs, provider failure and truncated output; existing advisor regression suite; one cheap-model run on old regressions and one on the fresh set; independent audit of decisions and reported metrics. Next changes require a new experiment rather than silently rewriting outcomes.

Plan challenge accepted: score complete acceptable ID sets, not any relevant ID; keep scoped no-match; bind coverage labels to question bytes; exclusive report writes. Independent code review found missing runtime hash check; added and regression-tested.

Observed protocol repair: first live run with max_tokens=400 produced truncated JSON. A single diagnostic confirmed finish_reason=length with 396 reasoning tokens out of 400 completion tokens. Repeat with max_tokens=1200, unchanged prompt/questions/records. Preserve both runs and report repeat status, not a fresh held-out result. Provider reasoning-token behavior: https://github.com/OpenRouterTeam/docs/blob/main/guides/best-practices/reasoning-tokens.mdx .

Source-projection audit after budget repair: six pipeline false refusals lacked documented details in the selector payload. Enrich all32 records from source, with authors kept away from test questions/results; re-review exact hashes. Include existing steps and unique evidence in pickerInput. Preserve pre-enrichment compiled snapshot and receipts as catalog/iteration-2-initial*.json. Repeats on v1/v2 are development regressions, not new held-out proof. Reviewer froze six further source-oriented questions before seeing enriched cards; even this small set is not a statistical benchmark. No question-specific prompt tuning. Before the final evidence-bearing run, add one contract clarification from source review: broad source quotes do not enlarge the narrower scenario outcome or override its exclusions.

# Independent semantic review — gpt-6-astra

Reviewed the captured V9 Haiku outputs against mirrored source files. This was a read-only editorial review, not execution of recommended skills. The reviewer found:

1. Research ranked `github-actions` before `goap-research-ed25519` although the first rationale explicitly admitted it did not cover repository research. Prefer one useful research pick rather than filling the shortlist with a keyword match.
2. Cloud.ru gaps understated monitoring coverage: `canary-watch` supports repeated interval/duration checks, thresholds and optional webhooks; `observability` describes monitoring stacks and alerting; `github-actions` covers scheduled health checks. Configuration and execution remain necessary, but catalog coverage is not absent.
3. Research overstated a signature/provenance guarantee. The mirrored meta skill makes signing optional and issuer trust conditional; the observed registry pointed to another provider variant, so inspecting the exact runtime source matters.
4. The original host prompt suppressed `pipeline` even when the user requested an order. That was an integration/test design problem, not only a model omission.

The final revision adds source-path lookup and source reading before detailed claims, discourages filler recommendations and unsupported absence claims, sorts higher stated fit first, permits an execution pipeline of recommended names, and requires a pipeline in the deployment smoke case. These changes are tested separately; no semantic guarantee follows from structure, catalog membership or the three-case smoke set.

The original V9 evidence is preserved to make these findings reviewable. Later evidence, if provided, is a separate run, not an edited replacement for the earlier model output.


## Follow-up on V11

The independent reviewer confirmed the core shortlist improvements: no irrelevant CI filler in research, useful canary checks and an explicit deployment sequence, and recorded reads of exact primary sources. Residual limitations remain: the model confused a Go CLI prerequisite with native skill installation, understated optional canary webhooks, claimed bundled scripts are excluded without adapter evidence, called feature-adr unique without catalog-wide comparison, and overstated delegation of content checks to the user. These are preserved as known editorial errors; the technical smoke is not advertised as factual verification of all explanation text.


## Follow-up on V12

Independent gpt-6-astra review inspected source text in actual read-tool events. The shortlists stayed useful; the unsupported uniqueness claim, excluded bundled scripts and total delegation of research verification disappeared. Remaining errors: the Cloud.ru response demanded an OpenCode-specific installer for an external Go binary and delegated its installation to the user despite source instructions; canary webhooks were understated; a checked answer retained stale draft/checker status; Advisory tier was treated as proof BTO never ran; conditional deployment logs were presented as unconditional. Raw evidence is preserved in [evidence-haiku-v12.json](evidence-haiku-v12.json).

The instruction correction distinguishes bundled files, external executables and toolkit integrations, requires reading every selected source, and limits short first-set answers to two actionable, source-supported caveats. It avoids speculative exclusions and internal checker status. Independent gpt-6.1-terra review confirmed the bundled-file correction agrees with the native adapter.


## Follow-up on V13

Independent gpt-6-astra review used actual read-tool source text and found V13 is not a consistent improvement over V12. The external Go binary/OpenCode installer confusion and stale checker status disappeared. However:

- Feature rationale says feature-adr first while the pipeline unconditionally starts with conditionally useful explore. The claimed absence of operational checks overlooks source production/post-release checks.
- Research again asserts mandatory manual verification although the source requires content cross-checking without assigning it exclusively to a human. The assertion that GitHub lacks publisher keys/signed delivery is not established by the read source.
- Cloud.ru picks github-actions instead of canary-watch. Automation is relevant, but the rationale incorrectly limits the selected pair to one-shot verify despite github-actions describing scheduled maintenance/health checks.
- Research has three gaps and Cloud.ru four, despite the requested maximum of two; an unrequested Kubernetes caveat remains.

Conclusion: native mechanical compatibility is confirmed on the smoke set and primary picks are useful for orientation. Caveat accuracy and execution-order consistency remain unstable. Neither the prompt nor the structural checker is a semantic publication gate. V13 is retained as raw evidence, not advertised as editorial acceptance.

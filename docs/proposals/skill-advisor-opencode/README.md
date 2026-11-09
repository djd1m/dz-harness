# Skill-advisor native OpenCode adaptation

Candidate patch, not a published npm release or site deployment. Prepared against public mirror commit `5ca4154781dd61136a8f4810eb642301a9359615`, skills-meta 0.9.75. The repository mirrors npm tarballs; port the accepted change into the private development source and regenerate signed release artifacts there. This proposal deliberately does not rewrite package versions, `.dz-manifest.json`, SBOMs or mirror manifests.

## Problem and change

The native adapter already copies the skill tree correctly. The canonical skill nevertheless contains Claude-specific installation examples and assumes a toolkit's plain `npx ... init` is an appropriate route. Existence in npm does not establish OpenCode installer support.

The new OpenCode procedure reuses the adapter and live registry. A dependency-free checker accepts native skill picks from the actual `dz registry --json` output, derives `dz init --target opencode --select <id>`, and rejects supplied commands for other runtimes, unknown picks, duplicate picks and unrecommended pipeline steps. It never executes installation commands. The checked native route conservatively leaves npm toolkit and preset installer compatibility unverified. This is not a claim those routes cannot work.

A registry snapshot is caller-supplied evidence; the checker cannot attest its origin, age or semantic recommendation quality. It does not prove package safety, course relevance or complete catalog coverage. Native skills do not include companion toolkit hooks/assets. Existing examples for Claude Code remain intact; this patch does not change any adapter or CLI distribution.

## Run locally

```sh
node --test packages/skills-meta/skill-advisor/evals/opencode.test.mjs
dz registry --json > /path/to/scratch/registry.json
node packages/skills-meta/skill-advisor/scripts/check-opencode-advice.mjs /path/to/scratch/registry.json /path/to/scratch/draft.json
```

The draft follows the existing output schema, except `install` can be omitted on input. Successful checker output adds it. The CLI also accepts one final fenced JSON block or a JSON object on the final line of assistant text. It discards preceding prose; mixed fenced drafts followed by corrections are rejected. This native route requires at least one skill recommendation; the pre-existing schema also requires a nonempty list. It is not an implementation of a general no-fit/empty recommendation contract.

For a web integration, run the checker outside the model before displaying a recommendation. A prompt is not an enforcement mechanism. OpenCode CLI `--format json` yields JSON events whose assistant text may still be prose; it is not structured-output mode. The SDK documents a structured-output mode, but the tested E2B OpenCode 1.19.4 returned `Expected OutputFormatJsonSchema` on reading a structured session and the prompt timed out. This matches [upstream issue #26929](https://github.com/anomalyco/opencode/issues/26929). Do not attribute that transport failure to model quality. A CLI host can instead request a JSON draft, use the documented decoder and reject malformed or ambiguous output; a successful JSON event stream is not itself a successful advice response.

## Verification scope

- Local regressions: 16 tests, including executable CLI success/nonzero checks, passed.
- Independent cross-model code review: gpt-6.1-terra found pipeline membership and ambiguous mixed JSON-frame defects. Both fixed and regression-tested; reviewer confirmed closure by inspection. Higher declared fit is sorted first without changing the execution pipeline.
- Native adapter emission and tests inside the E2B opencode template passed. The existing CLI installed one skill, six files, no hooks/integrations requested.
- Instruction-only V1/V2 trials allowed unverified toolkit install routes. They are not acceptance evidence.
- V3 final-text JSON trial: all three task answers were prose and were rejected; sandbox killed and independently absent.
- V4 first SDK transport trial failed before a task result; sandbox killed and independently absent.
- V5/V6 matching SDK 1.19.4 trials with Qwen and Haiku did not complete within 120 seconds; a direct session read reproduced the upstream format codec error. Sandboxes killed and independently absent. These runs do not measure Haiku vs Qwen answer quality.
- Final CLI/Haiku trial: **3/3 mechanical smoke cases passed** using native skill loading, an exact readable IDs/descriptions projection of the real registry, and the final host decoder/checker. Expected primary candidate first in each case. Exact primary-source reads and the deployment sequence were also confirmed from the trace. Latencies: 16.5 / 11.2 / 13.7 seconds, excluding sandbox/install time. Native tests inside E2B: 16 passed. Sandbox kill and independent absence check both passed. See [evidence-haiku.json](evidence-haiku.json).
- V7/V8 exposed tool retrieval limits and model prose surrounding JSON; final tests cover the supported frames. The original one-line registry remains authoritative for the host check; a faithful readable projection avoids truncating the model retrieval view.
- Cheaper Qwen retry with the same corrected retrieval/decoder: all 3 outputs passed structural checks and included the expected candidate, but native `skill-advisor` tool loading occurred in only 1/3 cases, so the strict smoke exited 1. See [evidence-qwen.json](evidence-qwen.json). Qwen is not discarded as inherently incapable; it did not pass this exact native-skill execution contract. Haiku remains the passing tested option, not a claim of globally cheapest adequate model.

Course URLs and the site-specific metadata snapshot are separate host data, not dependencies of the canonical skill. No private user prompts, keys or server configuration belong in this patch.


## Reproduce the external smoke test

This is opt-in and makes billable E2B/OpenRouter calls. Supply `E2B_API_KEY` and `OPENROUTER_API_KEY` through your existing secret/environment mechanism, never as command arguments or checked-in files. Install E2B SDK 2.63.0 in a separate scratch prefix; the public mirror has no development root package.json.

```sh
npm install --prefix /private/advisor-sdk --ignore-scripts --no-audit --no-fund e2b@2.63.0
E2B_SDK_MODULE=/private/advisor-sdk/node_modules/e2b/dist/index.js node docs/proposals/skill-advisor-opencode/e2b-smoke.mjs /private/advisor-smoke-output
```

The optional `ADVISOR_MODEL` environment setting selects the OpenRouter model ID; the default is the measured Haiku model. The script patches the candidate skill into a disposable npm installation before running the real `dz init`, checks byte-for-byte emission of the changed files, captures the resolved lockfile, runs regressions, then requests three synthetic consultations. The host parses/checks results before accepting them. Every sandbox is killed in `finally`, with a separate absence check. The process exits nonzero if setup, any expected candidate/native load/gate, or cleanup fails. Runtime/template/provider availability and prices can change; the checked-in evidence is dated, not a promise for every future run.

The three cases are development through requirements/ADR/verification, research with verifiable GitHub sources, and GitHub-to-Cloud.ru deployment with checks and operations. This is a small smoke set, not a blind quality benchmark. For example, a structurally accepted rationale can overstate absence of an unselected skill, and a secondary CI skill can be ranked too highly for a research task. A production-facing advisor still needs semantic/editorial evaluation and explicit course mapping. This patch does not claim those are solved by JSON validation.

[Earlier trials](earlier-trials.json) retain failures rather than presenting only the successful run. [Sandbox lockfile](sandbox-package-lock.json) records measured npm resolution; source candidate hashes are in the final evidence. [Model metadata](model-metadata.json) is a dated public API snapshot, not a billing receipt.


## Current acceptance boundary

The technical adaptation and measured native consultation protocol work. This is a **review candidate**, not a production-readiness claim for the site advisor. Independent gpt-6-astra [semantic review](semantic-review.md) improved the shortlists but still found incorrect or overly categorical limitations in the final model text: Go CLI prerequisites were confused with native skill installation, bundled scripts were confused with external dependencies, optional alerting was understated, and one capability was called unique without a full-catalog comparison. These are not corrected by schema validation. Preserve this warning when handing the work over; do not present every model explanation as independently verified.

The final gate checks a known primary candidate and source-read evidence on this small smoke set; [final-verification.json](final-verification.json) records those assertions against the unmodified V11 trace. The original [baseline Haiku output](evidence-haiku-baseline.json) remains available for reviewing the earlier findings. Course mapping and the site's answer renderer remain a separate integration task.

Pipeline evidence: the localized three-file implementation used an S-tier feature-adr plan and passed K2 requirement coverage. `dz name-check` could not scan this tarball mirror and returned NOT ESTABLISHED, not a pass; a manual search found no pre-existing helper. No claim is made that the private development repository's full build, packaging/signature gates or other adapters' test suites ran here.

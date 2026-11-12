# Host-owned evidence review candidate

This is a local integration candidate, not a deployed website service or a guarantee of factual accuracy. It reuses the native structural checker and adds `scripts/check-advice-review.mjs` in skill-advisor.

## Boundary

1. Host keeps the original user request, successful registry snapshot and selected skill sources. A single SKILL.md is an excerpt of a skill's possible full resource tree.
2. `makeAdviceReviewRequest(registry, draft, sources, userTask)` normalizes advice with the existing checker, requires a source for every pick and hashes the exact request (including original task and source coverage). Sources are `{id, text, coverage: "excerpt"|"complete"}`. The host owns provenance; source text is untrusted data for the model.
3. A separate model request checks every rationale, gap, task fit and execution order. The advisor cannot approve its own answer. The reviewer has no tools; no code/install commands execute.
4. `checkAdviceReview(request, review)` requires a matching hash, every claim exactly once, valid verdicts, reasons and source quotes for supported factual claims. Matching permits whitespace wrapping only. A changed word does not match. Any negative/uncertain verdict, other issue, malformed/missing review or unmatched quote withholds the answer. Only the accepted result includes `advice`.
5. The host must display only that accepted result. Do not render the original draft or raw reviewer report on failure. The exception/result path should offer a brief unavailable/retry message; retries need an explicit bound. This candidate does not add website UI or an automatic rewrite loop.

A digest binds content; it does not authenticate the reviewer, prove independent authorship or establish source completeness. The caller must retain its original request and invoke an independent review. Matching quotes prove textual presence, not entailment. The model can misjudge implications and can reject good advice. Do not label this as verified truth.

## Opt-in paid reproduction

`review-advice.mjs` accepts an input file `{registry, draft, sources, userTask}` and a new report path. It uses only `OPENROUTER_API_KEY` from the environment and optional `ADVISOR_REVIEW_MODEL` (default tested Haiku). Input is bounded, one 90-second request is made, output is exclusive-created mode 0600, and no retry or installation occurs. It returns nonzero when withheld. Reports contain the review input and sources: treat them as private diagnostic files unless reviewed for publication.

```sh
node docs/proposals/skill-advisor-opencode/review-advice.mjs /private/review-input.json /private/new-review-report.json
node --test packages/skills-meta/skill-advisor/evals/*.test.mjs
```

`e2b-smoke.mjs` now captures each selected SKILL.md for this host review. Sources are collected by the host, not trusted from the model's answer. The opt-in source-capture example uses the trusted locally generated registry; arbitrary caller paths must not be used as filesystem authority in a public service.

## Evaluation limits

The native V14 run passed three consultations and 23 tests inside E2B, then killed its sandbox and verified absence. Final local tests include original-task binding and quote line-wrapping cases added after that run. Earlier smoke marks individual full SKILL.md reads as `complete`; review inputs explicitly correct them to `excerpt` without changing captured text. Subsequent editor prompt changes were evaluated separately from native installation.

Saved V13 erroneous outputs and fresh V14 outputs were independently reviewed through the cheap model. Early reports were withheld because quote wording was not exact; this is not proof that all semantic judgments were correct. The reviewer also made false-positive objections to host-generated commands and missed the distinction between ordinary source checking and mandatory human checking. The revised instruction separates host-validated commands, includes the original task and discourages irrelevant caveats. Independent cross-model inspection identified these limitations; they remain evaluation concerns.

Results and exact trial labels are in semantic-gate-results.json. The positive control is hand-authored against the real source, not an unedited OpenCode answer. Do not count it as successful native end-to-end recommendation quality.

Final evaluation: every paid review trial withheld the answer, including the hand-authored controls. This demonstrates rejection paths but not useful live acceptance or calibrated editor accuracy. Some valid omissions were caught; some refusals were excessive (for example an optional maturity disclosure became a blocking issue). The successful release path is unit-tested; a public advisor must not be enabled on the strength of these trials.

Published upstream issues: [source grounding #26](https://github.com/djd1m/dz-harness/issues/26), [conditional pipelines #27](https://github.com/djd1m/dz-harness/issues/27), [runtime installation #28](https://github.com/djd1m/dz-harness/issues/28). Only issues were published; implementation remains local.

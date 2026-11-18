# Evidence handoff v2

## Change

The review request now carries a host-derived `hostContext`, bound into the
`dz-advice-review/2` request hash. It records selected names found in the supplied
registry, the native OpenCode route and generated commands. It does not claim that
registry classification, runtime readiness or execution were independently verified.
Arbitrary model/registry metadata cannot replace these host facts.

The editor receives the original task, advice, sources, host context, request
metadata and complete structured review (claim checks, evidence, issues). Sources
are transmitted once. Source quotes remain strict: host/coverage metadata is not
source text, and a matching quote still does not prove entailment of every clause.

## Verification

37 local tests passed, including forged context, stale binding, metadata presented
as quotations, and editor mutation isolation. Independent gpt-6-astra code-critic
review of the gpt-6.1-terra delta found no confirmed defects. The reviewer verified
unchanged quote gates and one-repair bounds; it did not execute tests or claim
semantic accuracy.

The paired replay keeps the three historical Haiku drafts, source snapshots,
reviewer/editor models and output/deadline limits from `cross-model-replay.md`.
Only evidence handoff and its instructions change. Each role uses a fresh stateless
gateway request. No native E2B or site integration is claimed. Live outputs are
recorded in `cross-model-handoff-v2.json`.

## Paired replay result

The same frozen drafts still produced 0/3 accepted outputs with each reviewer.
Haiku failed at the first review; Sonnet reached one repair and renewed review for
feature/research, but also withheld all outputs. The Haiku editor retained internal
registry/type/coverage commentary despite structured findings. This is evidence that
handoff correction alone does not establish improved acceptance on these examples.

A second, separately labelled trial uses fresh Haiku selection and Sonnet for both
review and conditional editing. This also changes role prompts and initial drafts,
so it cannot isolate a model effect. Exact prompts are in `handoff-v2-prompts.json`;
outputs are in `fresh-handoff-v2.json`. No external installs or runtime provisioning.

## Fresh selection and independent review

Fresh Haiku → Sonnet review accepted feature and Cloud.ru mechanically (18.6 s and
16.1 s); research returned an empty recommendation list and failed structural checks.
Independent Astra review found no material factual error in the feature capability
recommendation, but internal excerpt/verification caveats still need editorial cleanup.
Cloud.ru was semantically rejected: the gap requires preparing all four credentials,
where the source checks environment/config first and discovers missing region/image
choices. A review quote about two non-discoverable values did not support all four.

Research is valid JSON with an unsupported/weakly justified abstention, not malformed
JSON syntax. The host lacks a separately reviewed no-fit result; tracked as
https://github.com/djd1m/dz-harness/issues/32. Allowing empty recommendations alone
would incorrectly accept the skill/dependency and registry confusion in this example.

The final diagnostic trial also uses Sonnet for selection. It is **not** a paired
model-only comparison: fresh drafts and stochastic generation differ. Feature and
Cloud.ru pass mechanical review, research is withheld after one edit. See
`sonnet-selection-v2.json`. No further trials were run in this slice.

| Fresh profile | Feature | Research | Cloud.ru | Gateway-reported USD, three cases |
|---|---|---|---|---:|
| Haiku selection; Sonnet review/edit | accepted, editorial caveats remain | empty-list failure | accepted mechanically, semantic rejection | 0.101568 |
| Sonnet selection/review/edit | accepted mechanically | withheld after repair | accepted mechanically after repair | 0.498031 |

Costs include observed calls in each fresh run; they are provider-reported response
usage, not independently reconciled billing. Each case/profile was observed once.
Production readiness, stable acceptance rate and a cost-optimal routing policy are
not established. No site deployment, npm release or new runtime image was performed.

## Final independent semantic verdict

Astra accepted the final Sonnet-selected **feature** advice as source-grounded for
this development case: the primary choice, stages, ADR alternatives, complexity
routing and Reference/Direct caveat are supported.

Astra accepted the final **Cloud.ru** advice with a presentation caveat: preserve
“after successful deployment, if repeat checks are needed” when displaying the
pipeline. The credential defect is gone: the advice says the skill requests missing
values rather than requiring all four beforehand, consistent with source lookup and
missing-value resolution. Both capability sets and stated limitations are supported.
Do not render the plain pipeline array alone as an unconditional workflow.

This is the first independently audited positive pair in these trials. It remains
two historical development cases; research is unresolved. Keep PR #30 draft and
require held-out/native integration evidence before recommending rollout.

# Compact advisor input and per-requirement evidence

The runtime now sends short card, requirement and passage aliases. The selector maps requirement IDs to issued passage IDs. It can mark an unsupported requirement, preserve a narrower exact gap, or combine references in a single inferred clause. The server validates the references and builds the answer from the captured passages. Known actions retain their independent scope. A non-narrowing follow-up retains earlier requirements. The model and BGE-M3 retrieval snapshot are the same as in the previous trial.

Evidence selection reserves passages for separate requirement phrases before filling remaining space with whole-query evidence. Limited bilingual terminology expansion connects phrases such as “именованный том” and “готовность базы” to the exact documentation terms. No new model call is required in the normal request path.

## Preserved-vector check

| Case | Previous input characters | Compact input characters |
|---|---:|---:|
| PR review and CI repair | 44,266 | 17,623 |
| Portfolio motion and accessibility | 42,859 | 17,412 |
| Compose persistence and database readiness | 38,841 | 16,510 |
| Owner-facing design decision | 56,693 | 22,177 |

The actual saved-vector path retained both `pr-review` and `ci-fix`. The Compose candidate included a named-volume passage and a `service_healthy` passage. These are input-boundary checks.

## Live controls and independent review

All four previously truncated provider responses reached a stop condition without raising the 1,800-token limit. Only one of those four passed semantic review. The Compose answer linked storage persistence to a named volume and readiness to `condition: service_healthy`. C03 failed with `detail-passage`. The portfolio and owner-facing decision cases failed with `action-selection`. The reason codes locate the rejection class without storing unconstrained model output.

Two of six new tasks passed. One new query failed reference validation. Three others left supported requirements uncovered or omitted a distinct requested skill. In total the provider completed all ten turns, four failed host validation, and three passed independent semantic review. Runtime verification and semantic results are recorded separately in [case receipts](evidence/compact-trial.json). The first four are known replays, including the earlier run's case named `fresh-02`.

The predeclared control gate required all four replays to complete, both key semantic successes, and five of six fresh semantic passes. It did not pass. The broad acceptance run remains pending. The trial spent $0.014063715 under the $0.06 cap.

## Technical verification and remaining work

The final code passed 110 local advisor tests, the assembly and disposable container checks, and desktop and mobile browser probes with a stubbed result. After the paid run, a display-only change labelled passages shared across complementary cards as joint support. Its regression and browser checks passed. The final code reproduced all ten serialized model inputs byte-for-byte by canonical hash using the same saved vectors. The live reviews retain the original output.

Next, distinguish alien passage aliases from other passage rejections and support complementary evidence when an action spans more than one skill. Preserve valid partial results with explicit gaps when possible. Require the frozen CI and Compose cases and a small unseen cohort to clear the control gate before another broad trial. Public production remains on the previous pilot.

The [partial-recovery trial](RECOVERY-TRIAL.md) implements reason-coded recovery and individually bound evidence from complementary cards, with a new control round.

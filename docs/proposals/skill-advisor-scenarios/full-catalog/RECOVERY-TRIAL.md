# Partial recovery of advisor recommendations

A malformed, duplicate or unissued passage alias discards the identified requirement's row. The same applies to a card outside the action's eligibility rules, an attempted manual-work recommendation, or an irreconcilable gap. Other rows are validated independently. The answer exposes the exact uncovered requirement. If no valid recommendation survives, it reports that verification was unsuccessful. Unknown, duplicate or missing requirement IDs, ambiguous response envelopes and interrupted completions still fail the request. Recovery diagnostics record only enumerated reason codes.

Several cards can now contribute evidence to one recognized action. Every card needs its own supplied passage, and shared coverage is labelled as a joint recommendation. Older single-card action bindings still pass the same checks.

## Controlled trial

The [case receipts](evidence/recovery-trial.json) contain five saved-vector replays and six independently authored fresh cases. The model and BGE-M3 snapshot were held fixed. The round spent $0.016123657 under its $0.06 cap.

| Result | Five replays | Six fresh tasks |
|---|---:|---:|
| Completed response with visible answer | 3/5 | 6/6 |
| Recovered at least one rejected requirement into a visible gap | 1/5 | 0/6 |
| Independent semantic pass | 2/5 | 3/6 |

The portfolio replay recovered from `card-eligibility`. It showed the remaining recommendations and explicitly left expressiveness, density and motion intensity uncovered. This is a technical recovery, not a complete semantic answer. The Compose and academic dual-review replays passed. The PR review and CI repair case and the owner-facing decision case hit the response length limit before materialization. The six fresh responses completed. Three missed requirements, including one answer that implied full coverage despite a scope mismatch.

The predeclared control gate required five visible replay answers, semantic passes for both PR/CI and Compose, and at least five fresh passes. It did not pass. The public advisor is still on the earlier pilot.

## Verification

113 advisor tests passed. Fixture cases cover issued and unissued aliases, duplicate and malformed aliases, mixed rows, joint coverage, all-invalid responses, manual work, and unidentified slots. The live adapter fixture confirms the partial result and bounded diagnostic on the normal request path. All four assembly and disposable-container checks passed. The browser rendered the actual recovered portfolio answer from a fixture endpoint at 390 and 1440 pixels, including the exact gap. The legacy answer shape still renders.

The next control should address completions that never produce a usable selection. Explicitly named skills are a candidate for a deterministic selection path with documented evidence. Completion, structural validation and semantic quality need separate measurements before a broad release trial.

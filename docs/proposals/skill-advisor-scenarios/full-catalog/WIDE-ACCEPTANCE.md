# Wide acceptance of the full-catalog advisor

The November 18, 2026 run failed the semantic release criteria. The candidate remains in draft. The [case receipts](evidence/wide-acceptance-dcc801c.json) contain all 74 tasks, their frozen requirements and source paths, the visible results or errors, and independent review decisions.

Three reviewers authored tasks from pinned package sources before the requests ran. The corpus contains one positive case for each of the 57 packages, 12 compound requests and five discovery, clarification and unsupported controls. It shares package capabilities with the development corpus and uses distinct task formulations. It measures coverage on this sample. Production traffic and the frequency of these failures in production were outside the trial.

The run used runtime commit `dcc801c3acf3983d482c8adbcaa42728c4e86211`, the full 8,926-record BGE-M3 index and Claude Haiku 5.5. Visible results include the same course URL mapping as the site candidate at `d6c930ec0c2c4836df5a1cdc83aa8dfe8d6da5f9`. Independent reviewers assessed every case. The frozen corpus SHA-256 is `75bce8d6fb36fc937cb51dd6e5d11406db8e3ca0c3f46dedcf2ef7b607ec7924`.

| Criterion | Required | Observed |
|---|---:|---:|
| Exact package in the first five for positive cases | 52/57 | 56/57 |
| Positive answers satisfying the requested outcomes | 52/57 | 7/57 |
| All fresh answers satisfying the requested outcomes | 67/74 | 16/74 |
| Compound requests with all required guidance and exact unsupported remainder where applicable | 12/12 | 7/12 |
| False claims of full coverage on unsupported controls and unsupported compound portions | 0 | 0 |
| Fabrication | 0 | 0 |
| Additional spend | ≤ $0.30 | $0.183742476 |

The run accounted for 74 model calls. Total conservative accounting across the candidate evaluations reached $0.945594104, including earlier reservations. Three positive and three compound cases ended with `invalid-choice` and yielded no recommendation. These cases count as failures.

## Failure breakdown

Of 58 failed cases, 49 failed on semantic fit or visible guidance, including 44 positive cases that displayed the expected package. Two positive cases had the right package in the shortlist but selected another package. One missed the expected package in retrieval. Six failed choice validation.

In H01 the answer identifies the AGENTS.md adapter and its asset limitations but leaves out how it preserves authored content around the managed block. In C03 the answer returns `pr-review` and reports CI repair as missing, although the package ships `ci-fix`. In H06 the Gemini adapter reaches the shortlist, while the user sees general CLI advice and no guidance on preserving an idempotent block. Reviewers marked 18 positive answers as implying full coverage despite omissions in their supported tasks. These are separate from the unsupported-work control in the table.

The selector can see source context, while the result cards render the selected scenario's preapproved summary, boundary and next action. The next repair should make source-backed details for each requested action visible and leave unmatched requirements explicitly open. Choice validation needs its own repair and regression checks. Keep this sample for regression and use a separate unseen sample for the next acceptance decision.

## Native QE history

Read-only inspection with installed CLI 0.8.49 reported `native-history-absent-not-zero`. Prior reviewed records survive. Inspection of published CLI 0.8.61, core 0.8.68 and skills-meta 0.9.75 found no supported command to import those reviews into the native journal. Their current admission checks still refuse initialization over surviving review evidence. Formal native QE remains open independently of the semantic result.

The [subsequent requirements repair](REQUIREMENTS-REPAIR.md) changed candidate handling and visible evidence. It includes a separate pinned three-mode search comparison and a small live sample. This earlier wide result remains the release baseline.

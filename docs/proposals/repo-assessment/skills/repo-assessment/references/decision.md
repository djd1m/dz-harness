# Preferences, weighted comparison and advice

## Give advice before arithmetic

Translate priorities into concrete consequences. "Fast first version" means accepting
specific missing functions/maintenance work; "stronger assurance" means more exact
artifact checks, narrower execution and potentially fewer features. Ask for a decision
only when it materially changes the recommendation. If priorities are unconfirmed,
show an explained provisional profile instead of claiming the owner approved weights.

Group substitute candidates by role. An overall score across different roles can be
shown diagnostically on request, but cannot identify the single "best foundation".
Maintain a separate eligibility table:

```text
condition: mandatory capability | runtime | rights | unacceptable boundary
state: satisfied | failed | not-established
evidence, required follow-up
```

A weighted score cannot compensate for a failed or unresolved hard condition. Keep
inadmissible/unresolved candidates visibly labelled even in requested all-repo rankings.
No unqualified adoption recommendation until the required conditions are satisfied.

## Optional aggregate

Weights express **this decision's preferences over declared value ranges**. They are
not universal industry coefficients. Use accepted ADR preferences when they exist;
otherwise label proposed profiles as scenarios. Agree anchors/value functions first;
weights depend on those ranges, not just the name of an axis. Avoid double-counting
correlated evidence. Keep integration cost as a separate consideration unless the user
explicitly adds it to the model with a declared scale.

An example family for exploration, not a default approval:

| Scenario | C | F | M | P | O |
|---|---:|---:|---:|---:|---:|
| Smaller first version | 45 | 10 | 15 | 5 | 25 |
| Balanced candidate | 40 | 10 | 20 | 5 | 25 |
| Stronger assurance | 30 | 10 | 20 | 0 | 40 |

If explicitly accepting the **linear approximation** `value(s)=s/4` for ordinal
0–4 scores, and percentage weights summing to 100:

```text
Index = (wC*C + wF*F + wM*M + wP*P + wO*O) / 4
contribution(axis) = weight_percent(axis) * score(axis) / 4
```

This is a model index 0–100, not percent quality/safety or probability of success.
For C=3,F=4,M=2,P=2,O=2 the balanced index is 65.0; contributions are
30+10+10+2.5+12.5. A lower score under another preference profile does not mean
the repository itself deteriorated.

Validate all scores/ranges, finite nonnegative weights and sum before arithmetic.
This candidate's **complete-profile policy requires all five axes to be known,
including an axis with weight zero**. If any is U, suppress the complete index;
do not treat U as 0, infer it from the other axes or silently renormalize weights.
Mathematically a zero-weight term cannot change the weighted sum: suppressing that
index is an explicit evidence-completeness policy, not a mathematical impossibility.
A zero weight does not erase the unknown or close an eligibility condition. If a
user asks for an index over only known/nonzero-weight axes, define that different
model and its comparison scope before computing it.

Rank by unrounded values; exact ties share a rank. Show each contribution so the
total is reproducible. Equal profiles are not a meaningful unique winner. Ordinal
inputs do not justify spurious decimal precision; use only what reproduces the
chosen calculation. Do not add confidence multipliers or a hidden stars bonus.

## Sensitivity and recommendation

Compare the requested preference scenarios and identify which axis drives rank
changes. When near-tied scores or uncertain judgments matter, show the consequence
of a plausible disputed score/range as a labelled scenario. If that was not evaluated,
say sensitivity is limited rather than claiming a robust winner. Do not average the
three indices as if they were independent observations.

Recommend per role in this plain-language shape:

> Use A for the retrieval layer because it supports scenarios X and Y. We must still
> build Z. Compared with B, this accepts less out-of-the-box breadth in exchange for
> a smaller execution surface. Before adoption, confirm the identified license and
> artifact conditions. Reconsider if the supported runtime or required scale changes.

Offer "no suitable candidate" when appropriate. Record accepted tradeoff and
reconsideration trigger in an ADR only if the task calls for an ADR; drafting it
does not establish owner acceptance. Do not create another generic ADR-writing skill.

## Graphics

On request show individual five-axis profiles, an overlaid/filtered comparison and
the raw table. Use the same 0–4 radius and axis order. Higher is favorable on all
axes, including O. Missing values break the line; they are not center points. Use
labels/line styles in addition to color, and make overlapping profiles discoverable.
Polygon area/perimeter is never the aggregate model. Prefer fewer visible series
with a legend/filter to an unreadable twenty-line overlay.

## Primary methodological references

- [Government Analysis Function: introduction to MCDA](https://analysisfunction.civilservice.gov.uk/policy-store/an-introductory-guide-to-mcda/)
  for explicit objectives, value scales, weights and uncertainty.
- [OpenSSF Scorecard](https://github.com/ossf/scorecard) for automated project-security
  observations when an applicable report is available. Its aggregate is not our O
  score, does not establish all rights or fit, and is not a vulnerability-free guarantee.

Our five axes, 0–4 anchors, example weights and linear approximation are local choices,
not prescriptions from these sources. Recheck a source when asserting its current details.

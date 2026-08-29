# Story contract

Author `package-story-brief/1` in this order:

Set `language` to `ru` or `en`; the page chrome and `<html lang>` follow it.

1. `hero`: one audience problem, one value sentence, one primary action.
2. `example`: concrete input, 2–5 process steps, inspectable output preview, evidence ids, and an explicit
   `synthetic: true` flag, which renders as a visible label.
3. `why`: why this package exists and what changes before/after.
4. `mechanism`: 3–6 named stages with explanations and guardrails.
5. `install`: exact commands supported by package evidence.
6. `reuse`: where the same behavior can run; unknown host support stays unknown.
7. `limits`: what it does not do, safety boundary, cost/price status, and freshness boundary.
8. `cta`: the next safe action.

Add `visuals` with exactly `example`, `why`, `mechanism`, `install`, `reuse`, and `limits`. Each value is
`{ kind, direction }`; kind is one of `artifact`, `flow`, `comparison`, `timeline`, or `decision-card`.
The renderer retains both values on the corresponding section so an implementation cannot silently
drop the visual plan.

Keep it short enough to scan. Use a person/situation, surprise, analogy, or choice only when it clarifies
the package. Never create fake testimonials, customers, metrics, awards, or urgency.

Every claim is `{ id, text, status, sourceIds }`, where status is `evidenced`, `external`, or `unknown`.
Every numeric claim must be `evidenced` and provide ordered `numericEvidence` entries containing the
exact `token`, a non-self `context` field/unit containing letters, and cited `sourceId`; token and context must both occur on the
same line in a local range of at most 40 lines. Put factual numbers in `claims`; non-claim marketing
prose with numbers is rejected. Synthetic example payloads and literal install commands are exempt.
Decimal digits from any Unicode numeral script are numeric tokens. Number words such as "three" or
"три" are semantic prose rather than a finite token grammar and remain a content-review responsibility.
Synthetic input, inspectable output previews, and executable commands may contain digits because they
are displayed artifacts rather than marketing prose.
Empty source
sets are allowed only when `status: "unknown"`, and the UI visibly labels the missing proof.
Each referenced source must carry either a local file plus exact `lineRange` or a dated HTTPS URL, as
defined by the evidence contract; external records must exist in the supplied evidence artifact and
point to a current SHA-bound local receipt that names the exact URL and check date. This is provenance,
not proof of a remote fetch.

# Five-axis evidence rubric, version 1

This rubric is a local decision aid, not an industry certification. Scores are ordinal
0–4: distance 1→2 is not proven equal to 3→4. `U`/`null` means unknown. Assign a known
low score only for an observed unfavorable condition, not for an inaccessible source.
Each score needs its reason, evidence link/revision, time and applicability scope.

## C — Capability fit

User story: "I want to know how much of my actual scenario exists, so a useful helper
is not mistaken for a complete solution."

Map each must-have scenario to inspected interfaces/dataflow, not keywords. Record
what still needs adapting and whether that adaptation changes the trust boundary.

| C | Anchor |
|---|---|
| 0 | Inspected behavior does not provide the required role/scenario |
| 1 | Peripheral helper; most required behavior is elsewhere |
| 2 | Useful part of the target scenario, substantial work remains |
| 3 | Most core behavior exists, meaningful domain/integration work remains |
| 4 | Almost all required behavior is evidenced, with small named integration gaps |

A mature schema validator can be C=1 relative to a complete recommender while being a
good choice for the schema-validation role. Label that role; do not call it a bad project.

## F — Freshness and support currency

User story: "I want a maintained, compatible path for the version I will consume,
so today's integration is not tied to an already superseded foundation."

Use relevant code changes, stable/registry release evidence, supported runtime and
owner lifecycle notices. A docs/bot push and repository `updated_at` do not prove
runtime maintenance. Missing GitHub releases do not exclude registry releases.

| F | Anchor |
|---|---|
| 0 | Required support is explicitly discontinued, with no supported path for this use |
| 1 | Weak support evidence plus a material unresolved compatibility/support concern |
| 2 | Mixed evidence, transition or substantial relevant release/support gap |
| 3 | Credible support and compatible path, with named remaining limits |
| 4 | Corroborated sustained relevant support and a current suitable release path |

Unknown access → U. An old compatible supported library is not automatically 0; an
actively edited migrating repository is not automatically 4. No universal day cutoffs.
Use a separately installed `repo-freshness` when a detailed timeline is needed; the
question and these anchors suffice for a bounded assessment without it.

## M — Engineering maturity

User story: "I want predictable interfaces and reproducible checks, so dependency
changes do not create surprises I cannot maintain."

| M | Anchor |
|---|---|
| 0 | Only an idea/announcement; no implementation observed |
| 1 | Minimal prototype, substantial interface/error/check gaps |
| 2 | Working implementation and basic checks, limited robustness evidence |
| 3 | Developed interfaces, documentation, error handling and relevant check coverage |
| 4 | Broad maintained engineering/check evidence for the selected component |

Version numbers, age and stars do not establish maturity. Finding tests or green
badges does not mean we ran tests or verified the user's integration.

## P — Adoption and public-interest signals

User story: "I want to understand community breadth without confusing popularity
with proven use in a comparable deployment."

Keep stars, forks, downloads, dependent projects and named production-use evidence as
separate signals with dates/sources. Pick one consistent declared proxy for a score;
do not quietly add the same popularity evidence into C, M and O. Production adoption
remains U unless separately evidenced, even when stars are high.

An optional simple **stars-only** proxy: 0=observed 0; 1=1–99; 2=100–999;
3=1,000–9,999; 4=10,000+. These boundaries are arbitrary local display anchors, not
engineering discontinuities. Label P "GitHub interest proxy", preserve the raw count,
and do not transfer a monorepo's count to a new module. If a task needs adoption
rather than attention, report the actual use evidence qualitatively instead of
mislabeling this proxy. Unknown count is U, not 0.

## O — Operational assurance and supply-chain observations

User story: "I want to know what I would trust and execute, so adopting a helper
does not introduce an unexpected data leak or command-execution path."

Inspect only the intended use: read-only library versus installer/service; network,
secrets and user-input boundaries; source-to-artifact mapping, pinned dependencies,
provenance, CI permissions and relevant checks. A manifest, signature, SBOM or OpenSSF
Scorecard result is one piece of evidence with scope, not a security guarantee.

| O | Anchor |
|---|---|
| 0 | A concrete unacceptable boundary is observed in the selected path |
| 1 | Material exposure/gaps with weak evidence of controlling measures |
| 2 | Basic measures evidenced, important trust/verification gaps remain |
| 3 | Additional observed controls/provenance/checks for the selected use |
| 4 | Strong implementation and exact-artifact/dependency evidence, with limits stated |

This is assurance, **not risk magnitude**; higher is more favorable. U is distinct
from 0. Neither O=4 nor an index is a certification. Refer concrete findings to an
appropriate review when needed; do not invent vulnerabilities from missing badges.

## Minimal observation record

```text
id, repository, component, revision/version, retrieved_at_utc, as_of_utc
source, observation, scope, evidence_type (declared/inspected/executed)
axis, score (0..4/null), rationale, coverage, limitations
```

If a cited source contradicts another, retain the contradiction and explain how it
affects the conclusion rather than averaging confidence into a nicer score.

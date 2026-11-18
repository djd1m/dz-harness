# Offline scenario catalog pilot

## Requirements / ADR (M scope)

Precompute source-grounded task scenarios with strong author models and independent
cross-model review. Pilot: 12 packages, at least two distinct scenarios per package.
At query time retrieve a compact candidate set and let a cheap model select IDs;
render reviewed text deterministically. No invented commands/courses, website or npm
publication, or new E2B images. Keep previous team as a fallback candidate, not as
mandatory per-query processing.

Alternatives: reread raw sources for every query (costly and error-prone in prior
trials); generate maximum examples (duplicates and speculative claims); reviewed
bounded scenarios (selected). No claim of complete package coverage.

Reuse dz registry IDs/package manifests and the existing recommendation baseline.
Reuse evidence-wiki's atomic sourced-concept principle, not its unrelated mandatory
three-pillar research policy. This pilot's claims concern package documentation;
fabricated ADR/methodology/research citations would weaken provenance.

Canonical JSON drafts → source/hash/quote validation → independent review receipts
bound to record content → compiled approved catalog + Markdown table → lexical
retrieval baseline → optional cheap ID selector → fixed reviewed recommendation text.
A source or record change invalidates approval. Only affected records need revision.
Course mapping is separate; missing verified links stay absent, not guessed.

Measure retrieval separately from final match, on questions authored before seeing
scenario records, plus ambiguous/unsupported requests. Original three advisor tasks
are development regressions, not held-out tests. Measure model usage and wall time;
no price/quality claims without evidence. Current installed runtime unchanged.

## Record contract

Root drafts: {schema:"dz-scenario-catalog/1",records:[...]}. Each record:
{id,package:{name,version,manifest},skillIds,title,queries,intent,whenToUse,
whenNotToUse,outcome,prerequisites,steps,limitations,sources,evidence,courseUrl:null}.
String arrays for queries/whenToUse/whenNotToUse/prerequisites/limitations/steps;
all reader-facing strings in Russian. sources=[{path,sha256}], evidence=[{path,quote}].
Paths repository-relative; manifest must be actual package.json. Source hashes and
quotes exact. Source coverage all referenced files, package version from manifest.
Use at least 2 independent scenarios per assigned package; avoid fabricated absence.
No explicit install command in records: installation/target handled by host later.

Root integrates source validation, approvals, retrieval and safe output. Strong author
agents create records from actual sources; a different-model reviewer adjudicates
content, including conditions/limitations. No approval from author-only checks.

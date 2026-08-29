# Retraction notices — classes, the two live label spellings, and the reason-code posture

## Notice classes (weakest to strongest)

| Class | Meaning | Rendered as |
|---|---|---|
| Correction / corrigendum / erratum | An amendment. Ordinary scholarly hygiene. | not a transparency concern on its own |
| Expression of Concern | The publisher states concerns exist and are unresolved. | a concern — **weaker than a retraction; never rendered as one** |
| Retraction | A publisher-issued withdrawal of the record. A fact about a **record**, never about a person. | a concern |

The **notice direction** matters: on Crossref, `updated-by` hangs off the **retracted work** and
`update-to` off the **notice**. Querying the wrong direction returns an empty answer that looks
clean.

A record whose retraction link appears **only** under `update-to` is the record *of* a retraction —
it retracts something else. It is carried on its own `updateTo` field and is deliberately **not**
folded into `notices`: merging the two directions would report a retraction notice as a retracted
work, which is the accuse-direction error this slice exists to prevent. The residual cost is
**under**-detection (a retraction Crossref records only on the notice side is not found), which is
the safe direction; closing it needs a second lookup resolving `update-to[].DOI` back to this work.

## The notice TYPE is matched by stem, not by one inflection

Crossref's update-type vocabulary spells a withdrawn work several ways, and a substring test for
one inflection reads the rest as clean. Measured: `retraction` matched, while **`Retracted`,
`Withdrawal` and `Removal` all fell through to `other`** — and `other` is not carried as a notice at
all, so a retracted work read as a clean bill. The classifier matches the stems `retract`,
`withdraw`, `remov` (`lib/appraisal-acl/crossref.js`), and `concern` is tested **first** so an
expression of concern is never promoted to a retraction.

Where several retraction notices exist on one record, the **earliest dated** one is the index's
date. Array order is not chronology: taking whichever notice Crossref happened to list first made a
2015 retraction report as 2021 and dropped a genuine pre-publication retraction to `no-concern`.

## The two live label spellings (the trap this package maps)

The concept "retraction notice" has two live spellings, and the wrong one fails **without an
error** — HTTP 200, zero rows, no exception:

- PubMed answers for `Retraction Notice` (measured: tens of thousands of records) and returns
  **count 0** for `Retraction of Publication` — with a quoted-phrase-not-found warning buried in
  the response envelope.
- Europe PMC carries `Retraction of Publication` as a live publication type.

Both spellings map to the **same internal concept** in this engine
(`RETRACTION_LABEL_ALIASES` in `lib/appraisal-core.js`), and the suite proves end-to-end that a
record carrying only the legacy `Retraction of Publication` label still produces a concern.

## Retraction Watch reason codes — quoted, never interpreted

The ~112 Retraction Watch reason strings are the only machine-readable answer to *why* a record
was retracted, and some of them are misconduct-shaped. This engine treats a reason code as a
**verbatim quotation with a locator** — never an input to a verdict, never mapped to a severity,
never paraphrased into a claim about a person's intent. An unrecognized code renders as
`unclassified` beside its raw string.

The full dataset (~65 MB) is a **resource, never a package file**: the default adapter resolves
each cited DOI against Crossref per-lookup; a local CSV snapshot is opt-in via
`--retraction-csv <path>`.

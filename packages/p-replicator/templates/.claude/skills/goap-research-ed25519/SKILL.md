---
name: goap-research-ed25519
description: GOAP research system with Ed25519 provenance and tamper-evidence under pinned trusted-issuer keys. Use for high-stakes research that needs cited sources, explicit confidence, signed audit trails, or cryptographic proof of who signed a fact. Ed25519 does not prove truthfulness or prevent hallucination.
trust_tier: 1
trust_tier_label: "Structured"
trust_tier_path: "Run a BTO evaluation (see the skills-bto package) to promote to Tier 2"
---

# GOAP Research with Ed25519 Provenance

This skill combines Goal-Oriented Action Planning (GOAP), source evaluation, and optional Ed25519 signatures.

Ed25519 provides cryptographic provenance and tamper-evidence under pinned trusted-issuer keys: it proves who signed the canonical message and that the signed bytes were not altered. It does not prove that the claim is true, prevent plagiarism, or replace ordinary source evaluation.

## Core Rules

1. Every factual claim needs a source URL.
2. Unknown, unsigned, revoked, mismatched, or invalid issuer signatures are not issuer-verified.
3. Trusted issuer status requires an explicit issuer -> pinned Ed25519 public key mapping. A domain string alone is never trusted.
4. Strict and paranoid modes reject plans with remaining unsigned or invalid claims.
5. Self-attested researcher signatures provide audit-log tamper-evidence only and are capped below issuer-trusted confidence.

## Trust Classes

| Trust class | Requirement | What it proves | Confidence |
|---|---|---|---|
| `ISSUER_SIGNED` | Signature verifies against the active pinned key for the claimed issuer | The pinned issuer signed this exact canonical message | up to `0.95` |
| `SELF_ATTESTED` | Researcher signature verifies against the embedded researcher key | The research record was not altered after self-signing | up to `0.60` |
| `UNVERIFIED` | Unknown issuer, missing pin, revoked key, key mismatch, malformed key, or invalid signature | No cryptographic provenance | `0.0` |

## Evidence Classes — the second, independent axis

Trust classes answer **"was this record altered after signing?"**. They say nothing about whether
anyone opened the source. That second question caused every content error in real operation, so it
gets its own axis. A fact can be `ISSUER_SIGNED` **and** `ASSERTED` — a cryptographically perfect
record of something recited from memory. That combination is legal, expressible, and the dangerous one.

| Evidence class | Requirement | What it proves | Ceiling |
|---|---|---|---|
| `FETCH_VERIFIED` | `evidence_fetch.fetch_source()` performed the request and got a 2xx body | This script issued an HTTP request and received a body with this byte hash on this date | `1.0` |
| `LISTING_ONLY` | URL known from a listing, or a body supplied by hand, or the fetch failed | The URL is known; nobody opened it through this tool | `0.50` |
| `ASSERTED` | Stated from model memory, source never opened | Nothing about the source | `0.0` |
| *(absent)* | Fact predates this axis | Evidence is **unknown** — neither asserted nor verified | no ceiling of its own |

For quoted text, the acquisition method is a separate closed vocabulary. The author-facing names
map exactly to the stored values; only the verifier can emit the verdict after comparing captured bytes.

| Stored method | Author-facing name | Verbatim ceiling |
|---|---|---|
| `raw-fetch` | `сырая-загрузка` | eligible only after a matching captured excerpt |
| `tool-summary` | `пересказ-инструментом` | never verbatim, even when the words happen to match |
| `search-listing` | `из-поисковой-выдачи` | eligible only after reconciliation against a captured excerpt |
| `manual` | `вручную` | eligible only after reconciliation against a captured excerpt |
| *(absent/other)* | `method-unknown` | never verbatim |

**`FETCH_VERIFIED` cannot be self-declared.** It is minted only by `create_fetched_fact()`, which
requires a `FetchRecord` — the byte hash, HTTP status and date of a request that actually happened.
The manual constructors (`create_listing_fact`, `create_asserted_fact`) have no way to produce it.
The restriction lives in the API shape, not in the author's discipline.

**Honest scope of `FETCH_VERIFIED`:** it means the bytes were received. It does **not** mean the
source is authoritative, that the claim follows from it, or that the reader understood it.
Provenance, not truth.

### The report gate

```bash
python3 scripts/check_report_evidence.py --report report.md --facts facts.json [--profile patient.json] [--excerpts evidence_excerpts]
```

`ASSERTED` claims must not appear in a report at all. `LISTING_ONLY` claims may appear only with a
visible marker next to the claim. This is an exit code, not advice — exit `1` on violation, exit `2`
when the inputs cannot be read (a gate that could not evaluate has cleared nothing).

The gate merges four independent judgements over the same text and loses none of them: the evidence
axis, signature integrity, **population applicability** (`UNMARKED_POPULATION_MISMATCH`,
`POPULATION_UNKNOWN_UNMARKED`, `MISSING_STUDY_POPULATION`, `UNATTESTED_STUDY_POPULATION`,
`LEGACY_POPULATION_UNJUDGEABLE`) and the **relative-risk belt** (`RELATIVE_RISK_WITHOUT_ABSOLUTE`).
A population caveat only counts if it NAMES the diverging axis within 400 characters of **each**
occurrence — boilerplate that names nothing warns nobody.

One exception, and it is the sanctioned path (QE G5): when the source states **no** population at
all, there is no axis to name, so the window must instead SAY the population is unknown — «не
указана», «not stated», `POPULATION_MATCH unknown` and their kin. Requiring the literal sentinel
`(study population)` punished `StudyPopulation.unstated(reason)`, the one honest way to declare it.

`--profile` is optional: without it the population *proximity* rules cannot run, and the gate PRINTS
`population applicability: NOT CHECKED — no --profile supplied` rather than passing silently. The
two attestation rules do NOT depend on it: an unjudgeable or unattested fact is unjudgeable for
every patient, so those fire with or without a profile (QE G4).

### Running the test suite

ONE command, everywhere it is written — never a hand-kept list of module names, because a module no
command names is a file rather than a check:

```bash
cd scripts && python3 -m unittest discover -s . -p 'test_*.py' -v
```

## Self-learning — you do the judging, not a regex (optional; needs `dz` on PATH)

The most valuable thing this skill produces is the moment a conclusion turned out to be
WRONG. Record it. But a lesson describes a METHOD, never a person — otherwise the shared
learned store quietly becomes a medical record, which nobody consented to.

```bash
python3 scripts/learning_bridge.py status                        # is the loop on at all?
python3 scripts/learning_bridge.py recall "transferrin saturation"   # traps already caught
python3 scripts/learning_bridge.py check "<candidate>"           # format check only
python3 scripts/learning_bridge.py teach "<rule>" --confirm-method
```

**You are the check.** A script cannot tell a method from a case note: that is meaning,
not shape. `learning_bridge.py` refuses formatted identifiers (email, phone, record
numbers, letters against a long digit run) because those have a FORMAT and a regex is
reliable on them in any language. Everything below is yours, and the tool says so rather
than implying a guarantee it cannot keep.

### The teach protocol — three steps, in order

**1. Write the RULE, not the case.** Do not edit the finding down; state what it taught.
The test is mechanical: *can you write the general rule WITHOUT the specific reading?*

| the case (do not record) | the rule (record this) |
|---|---|
| "total testosterone 8.04 in this patient was a fasting artifact" | "prolonged fasting lowers total testosterone — check the eating pattern before concluding" |
| "her ferritin 512 turned out to be inflammation, CRP was high" | "a single ferritin cannot separate overload from inflammation — pair it with CRP" |
| "the 56-year-old's TSH normalised on the repeat draw" | "a single out-of-range TSH warrants a repeat before any conclusion" |

If the rule cannot be written without the reading, there is no lesson yet — only a
finding. Do not record it.

**2. Read it back, hunting for the ONE person.** Redaction is not the goal; a lesson with
the numbers blanked out is still a case note. Ask instead: *could a reader who knows this
person recognise them here?*

The dangerous cases carry no name and no digits at all:

- a rare combination — "the patient with situs inversus who ran a marathon"
- a role that identifies — "my brother-in-law's cardiologist said"
- a timeline — "after the surgery last Tuesday"

None of these is detectable by any pattern, in any language. This step exists because you
can see what no scanner can.

**3. Record it, and own it.**

```bash
python3 scripts/learning_bridge.py teach "<the rule>" --confirm-method
```

`--confirm-method` is your assertion that steps 1 and 2 were actually performed. The tool
does not verify it and does not pretend to — it records that a judging agent made the
call. Without the flag nothing is written.

### When to teach — four moments, not "when it feels useful"

| moment | why it is the signal |
|---|---|
| a conclusion was RETRACTED | the single most valuable lesson available |
| a population check flipped a conclusion | the effect did not transfer, and now you know the shape |
| a preanalytical finding explained an alarming value | the value was an artifact; the rule generalises |
| an open question was closed | the answer, not the waiting |

**Recall at the START of an investigation** — before interpreting anything, ask what this
analyte has already fooled us with.

### Honest scope

Lessons are written to a SEPARATE store — `<project>/.health-brain/.dz` — and never to
the shared one. `recall` reads both, so engineering lessons transfer INTO this work while
medical ones never leave. That separation is the guarantee this skill makes, and it holds
for every command that reads the shared store, including ones not yet written: a store
that never receives the data cannot hand it out.

An earlier version kept one store and filtered each command that emits lesson text.
Review closed four such commands and immediately produced five more (`guard promote`,
`epoch-replay --emit`, `vector harmonize`, `consolidate --prune-quarantine`, the
`recall --forget` preview). Filtering per command is a discipline; a separate store is a
property. The export hold-out remains as a second line, not as the promise.

The format check is a helper, not a boundary: it catches identifier shapes and nothing more.

### Run medical work in its own project directory

The separation above covers what THIS SKILL writes. It does not cover what the harness
records about the CONVERSATION, and that channel is real: the `UserPromptSubmit` recall
hook logs the first 200 characters of each prompt into the shared `.dz`, and
`dz consolidate` can harvest transcript messages into shared lessons tagged `general`.
So if you type a lab value into the chat, that text reaches the shared store no matter
what this skill does — the data enters upstream of it.

No check inside this skill can close that, and none is offered: classifying arbitrary
prompt text is the same undecidable problem that cost this feature seven review rounds.
What closes it is WHERE the work happens.

**Do medical work in a project directory of its own.** Then the "shared" store of that
project is itself medical, there is nothing to separate, and prompts, transcripts and
lessons all stay in one place you can inspect or delete as a unit:

```bash
mkdir ~/health-research && cd ~/health-research     # medical work lives here
# lessons: ~/health-research/.health-brain/.dz      (this skill)
# prompts/transcripts: ~/health-research/.dz        (the harness)
```

Do not run medical investigations inside a shared code repository. If you already have,
the prompt log is `.dz/recall-usage.jsonl` and the lessons are in `.health-brain/`.

Choosing the shared store anyway is ADVISED against, never blocked: both `dz teach --domain
health-research` and `dz recall --all --json --include-domain health-research` print what follows
from the choice and end with "Nothing was blocked — this is your call" — the choice must be
knowing, not accidental.
Step 1 is what makes a lesson safe to keep: a rule about a method has nowhere to put a
person. But note what that is and is not — it is a discipline, performed by you and
asserted with `--confirm-method`, which nothing verifies. The property that holds
regardless is the SEPARATE STORE: these lessons are never written to the shared one.

This division is not a preference. An earlier version of this file asked a regex to
decide "method or person" from the text; seven rounds of independent review graded it F
and the finding count never converged, because that question is about meaning and every
pattern answering it fails in both directions at once — admitting `patient McDonald has
HIV` while refusing `apoB`, and refusing a perfectly good Chinese lesson for containing
"a capitalised word".

Without `dz` installed the package behaves exactly as before and says so once. An older
`dz` does not reject `--domain` — it ignores the flag and exits 0 — so recall makes ONE
call and detects the older CLI by the ABSENCE of the boost note in the output. A real
failure (non-zero exit) is reported as itself: proceeding without prior lessons.

## Source Tiers

`source_tiers.classify_source(url)` assigns a class ceiling: A `0.90` (guideline bodies, WHO,
registries) · B `0.80` (peer-reviewed literature) · C `0.60` (preprints, trial registries) ·
D `0.40` (everything else, including unknown domains). A tier is a claim about the CLASS a domain
belongs to — it is **not** a cryptographic statement and must never be confused with issuer pinning.

`source_tiers.is_stale(source_date, kind)` flags sources past their TTL. A **missing** `source_date`
is flagged too: freshness that cannot be established is not freshness.

## Signed Message

`sign_fact()` and `verify_fact()` use the same deterministic JSON message containing:

- `issuer`
- `source_url`
- `claim`
- `source_hash`
- `timestamp`
- optional `research_context` / nonce

**Schema v2** additionally covers `evidence_class`, `fetch_date` and `source_date`, plus a
`"schema": "fact-v2"` self-description marker. Version is chosen by the presence of
`evidence_class`: legacy facts keep verifying against the six-field v1 message forever.

Because the three evidence fields are part of the signed text, **both** tamper directions fail:
stripping `evidence_class` makes the verifier build the v1 text, which no longer matches the signed
v2 text; adding it to a legacy fact makes it build the v2 text, which does not match the signed v1
text. (The marker is self-description — it is not itself the protection; a discrimination run proved
that.)

**Schema v3** additionally covers four more fields:

| field | why it had to come inside the envelope |
|---|---|
| `study_population` | who the finding was measured in — see *Study population*, below |
| `trust_class` | it SELECTS the verification branch. A field that decides which branch verifies a fact must be inside the envelope that branch is verifying |
| `confidence` | protects a consumer that reads `fact.confidence` directly without re-running `verify_fact()`'s ceiling math. Signed as a fixed-width `"0.6000"` string, because float repr differs across runtimes |
| `metadata` | carries `evidence_note` — the mandatory reason for a `LISTING_ONLY` degradation. An audit trail that can be rewritten in a text editor is not an audit trail |

A v3 message carries `"schema": "fact-v3"`, and version is again chosen by **presence**
(`study_population` set ⇒ v3; `evidence_class` set ⇒ v2; otherwise v1). Facts also store an explicit
`schema_version`, which is a convenience mirror of that dispatch, **not** a protection: stripping it
alone is a MEASURED no-op — the verifier recovers version 3 from the fields and the signature still
matches. What refuses tampering is that the v3 text CONTAINS those four keys at all.

**Dispatch is EXACT, and a schema the verifier does not know is REFUSED** (QE G6). Two ways that
matters: `schema_version = "not-a-number"` used to raise an uncaught `ValueError` out of the middle
of a gate run — it now returns `verified=False` with `schema_version` reported as `0`
(unidentified); and the old `version >= 3` band accepted any number at or above 3 as "v3", so the
field could be edited `3 → 99` and the fact still verified. Both are refusals now, and adding a
future v4 is one new branch that the refusal forces you to write.

`VerificationResult` now reports `schema_version` and `signed_fields`, so a consumer asking *"may I
rely on this fact's `trust_class`?"* gets an answer from the object rather than from a paragraph.

### What v3 does NOT fix — the pre-v3 hole, named

Facts signed under **v1 or v2 do not carry `trust_class`, `metadata` or `confidence` under their
signature.** For such a fact, `trust_class` **can be rewritten without invalidating the signature** —
for example from `ISSUER_SIGNED` to `SELF_ATTESTED`, which routes verification onto the embedded-key
branch that never consults the pin registry, so a fact whose issuer key was later **revoked** comes
back `verified=True` at confidence `0.60`. No amount of new code can retroactively cover bytes that
were signed without those fields.

Three things narrow it, and none of them closes it:

1. A **bounded belt**: a pre-v3 fact claiming `SELF_ATTESTED` whose issuer holds a **non-active pin**
   is now refused (`issuer` *is* signed in v1/v2, so the lookup cannot be redirected). An **unpinned**
   issuer's fact remains launderable to `SELF_ATTESTED @ 0.60` — that residual is real and unclosed.
2. The report gate makes the hole VISIBLE instead of laundering it. A used pre-v3 fact carrying no
   population is a `LEGACY_POPULATION_UNJUDGEABLE` finding (exit 1), counted on its own
   `legacy-population-unknown` line; a used pre-v3 fact that carries a `study_population` anyway is
   an `UNATTESTED_STUDY_POPULATION` finding and is **not matched against the patient at all**.
   Before this, a legitimately-signed v2 fact with an INJECTED population and `schema_version`
   pinned to `2` verified, reported `POPULATION_MATCH full` with zero findings and exited 0
   (MEASURED, QE G1) — the declared vulnerability, laundered into a clean match. Note the boundary:
   this is a SCHEMA check. An injection that leaves `schema_version` absent or set to `3` is caught
   by the SIGNATURE check instead (`TAMPERED_FACT`), because the rebuilt v3 text no longer matches.
3. `VerificationResult.signed_fields` names, per fact, what the signature actually covered.

**Re-signing existing v1/v2 facts as v3 is out of scope for this slice.** The gap is named and dated
here rather than quietly carried.

## Study population — was this number obtained in people like this patient?

Every newly created fact must state who the finding was measured in. `study_population` is a
**keyword-only argument with no default** on all five factories, so omitting it is a `TypeError`
from Python itself, not a convention a later author can soften:

```python
fact = verifier.create_listing_fact(
    claim="Omega-3 raises LDL by 44.5%",
    source_url="https://pubmed.ncbi.nlm.nih.gov/…",
    reason="card seen in the search listing; full text never opened",
    study_population={
        "description": "patients with severe hypertriglyceridemia",
        "criteria": {
            "triglycerides_mg_dl_min": {
                "op": ">=", "value": 800, "kind": "baseline",
                "verbatim": "baseline triglycerides >= 800 mg/dL",
                "locator": "[Methods, Baseline characteristics]",
            }
        },
    },
)
```

If the source genuinely does not state it, say so — with a reason, stored verbatim:
`population_match.StudyPopulation.unstated("the abstract never describes who was enrolled")`.

`population_match.match_from_fact(fact.study_population, patient_values)` returns one of **four**
verdicts, and every non-`full` verdict enumerates NAMED discrepancies:

- **`full`** — every stated criterion is satisfied by a known patient value.
- **`partial`** — a **baseline** criterion is out of range: the patient could have enrolled, but the
  effect was not measured from where he stands.
- **`none`** — an **eligibility** criterion excludes him: he would not have been in the study.
- **`unknown`** — the source does not state the axis, or the profile does not carry it. `unknown` is
  never folded into `partial`: an unestablished criterion is not a milder kind of match.

```
POPULATION_MATCH: partial
  triglycerides — patient 236; study requires triglycerides >= 800 (baseline-out-of-range, below)
      enrollable, but the effect was not measured from this starting value
      "baseline triglycerides >= 800 mg/dL"  [Methods, Baseline characteristics]
```

**Honest scope:** nothing here verifies that `verbatim` was transcribed truthfully from the source,
or that the criterion the source used is the one that matters clinically. Both are printed next to
every discrepancy so a human can check and overrule the machine.

## Relative risk never travels alone

"21× higher risk of heart attack" is **1 excess case per 1394 people**. "The risk doubles" is
**4 per 1000 over 25 years**. Both sentences in each pair are true; only one of each is interpretable,
and the uninterpretable one is the one that gets quoted.

`risk_statement.RiskStatement(relative, absolute)` takes both halves as **required positional**
arguments. `absolute` is either a real `AbsoluteEffect` or an explicit
`UnknownBaseline(reason=…)` — a caller with no baseline data cannot omit the absolute half; it must
SAY the baseline is unknown, and that sentence is printed in the slot where the number would have been:

```
risk: HR 0.74 (relative)
  absolute: BASELINE RISK NOT ESTABLISHED — the source reports no control-arm event rate
  NNT: n/a — cannot be computed without a baseline
```

NNT is **computed** from absolute figures (`1/|ARC−ART|`, or `M/N` from an "N excess per M" figure),
never supplied as prose; when the inputs cannot support a finite NNT the result is a **named** reason,
never `Infinity` and never `0`.

**Honest scope (this one matters).** The typed path above is the guarantee. The report gate's
relative-risk scan (`check_report_evidence.py`) matches **formats, not meaning** — it is a secondary
belt over free prose that the constructor never sees, a novel phrasing will slip past it, and it may
never be cited as evidence that the property holds. The gate's own output says so.

Changing the issuer or moving the source URL after signing invalidates the signature. The code signs the raw canonical message bytes; Ed25519 performs its own internal hashing. Do not pre-hash with SHA-512 before signing.

## Pinned Issuers

The default pinned issuer registry is empty. Add real keys explicitly:

```python
verifier = Ed25519Verifier(
    trusted_issuers={
        "example.org": {"pubkey_b64": "base64-public-key", "status": "active"}
    }
)
```

`status: revoked` rejects the key. Online revocation fetching is not implemented. Replay protection is limited to binding `research_context` / nonce into the signed message; there is no persistent nonce ledger.

## Citation Chain Verification

Each non-root fact stores `parent_hash = sha256(canonical_message(parent_fact))`. Chain verification:

1. Verifies each fact signature.
2. Recomputes each parent content hash and compares it to the child's `parent_hash`.
3. Verifies `chain_signature` over the ordered list of fact hashes.

Reordering, substituting, editing, relabeling, or moving a signed fact fails verification.

## GOAP Research Modes

| Mode | Behavior |
|---|---|
| `development` | Allows unsigned claims with clear labels and lower confidence. |
| `moderate` | Prefers signed and cross-checked sources but may continue with labeled uncertainty. |
| `strict` | Rejects plans with unsigned, invalid, unknown, revoked, or mismatched claims. Verified goals additionally require the two capability facts below. |
| `paranoid` | Same as strict, with stronger source redundancy expectations. Same capability-fact requirement. |

### What strict and paranoid actually require — the promise this package does NOT keep by default

In `strict`/`paranoid` mode the planner auto-upgrades goals to their verified variants, and
the verified actions (`configure_trusted_issuers`, `web_search_verified`,
`fetch_signed_source`) are gated on two **deployment capability facts** that no action can
manufacture:

- `issuer_keys_available` — real Ed25519 issuer key material genuinely exists for the
  configured issuers (a list of issuer domain strings is NOT key possession — core rule 3).
- `source_class_verified` — this class of source is capable of Ed25519-signed delivery at all.

Both are constructor arguments on `GOAPResearchPlanner`, **default `False`**:

```python
GOAPResearchPlanner(verification_mode="strict",
                    issuer_keys_available=True,     # only with real key material
                    source_class_verified=True)     # only for signed-delivery sources
```

**Stated plainly: for this package's real health sources (PubMed, PMC, DOI, WHO) neither
fact holds — none of them delivers Ed25519-signed content and no real issuer keys exist —
so `strict`/`paranoid` high-stakes PLANNING is honestly unreachable out of the box.**
`GOAPResearchPlanner(verification_mode="strict").plan(goal_type="high_stakes", ...)`
returns a `PlanNotFound` with verdict `GOAL_UNREACHABLE` naming the missing facts. Earlier
versions instead fabricated a maximum-confidence "verified" plan backed by nothing; that
was a defect, not a capability. Until a genuine signed-source integration exists, only
`development` and `moderate` are fully real for the default sources; `strict`/`paranoid`
become real the day a deployment can truthfully pass both flags.

### Planner return contract (no more `None`)

`find_research_plan()` and `GOAPResearchPlanner.plan()` return either a `ResearchPlan` or
a first-class `PlanNotFound` — **never `None`**. `PlanNotFound.verdict` distinguishes:

- `PlanVerdict.GOAL_UNREACHABLE` — proven: no action sequence can ever satisfy the goal
  (decided promptly by a reachability closure, independent of any budget). Retrying with a
  bigger budget cannot help.
- `PlanVerdict.SEARCH_EXHAUSTED` — the iteration budget (or the opt-in `max_seconds`
  wall-clock ceiling) ran out first: an honest "don't know". A higher `max_iterations` MAY
  help — it is not guaranteed to, because the closure ignores the verification gate, which
  can permanently reject every path in `strict`/`paranoid` mode.

Branch on `isinstance(result, ResearchPlan)`. Legacy truthiness checks (`if plan:`) stay
safe because `PlanNotFound` is falsy — but **identity checks are NOT safe**:
`plan is None` is now always `False`, so `if plan is not None:` reads a no-plan result as
success. Migrate any such check.

`max_iterations` defaults to an adaptive, measurement-calibrated budget (floors: 5,000 for
`development`/`moderate`, 100,000 for `strict`/`paranoid`). On the FAILURE path the full
budget is burned (seconds, not milliseconds, at the strict floor); latency-sensitive
callers should pass `max_seconds` (e.g. `planner.plan(..., max_seconds=2.0)`) to bound it.

## Confidence Formula

```
confidence = min(
    trust_ceiling,      # UNVERIFIED 0.0 · SELF_ATTESTED 0.60 · ISSUER_SIGNED 0.95
    evidence_ceiling,   # FETCH_VERIFIED 1.0 · LISTING_ONLY 0.50 · ASSERTED 0.0 · absent → no cap
    tier_ceiling,       # A 0.90 · B 0.80 · C 0.60 · D 0.40
)
```

The **weakest link decides**, never the average. An `ISSUER_SIGNED` fact that nobody read is capped
at `0.0` by its evidence class — which is the whole point of the second axis.

**Scope of the tier ceiling (read this before the next schema migration).** It applies **from schema
v2 onward** — a lower bound, never an equality. v1 alone is exempt, deliberately: a record keeps the
semantics it was created under. The condition was once written as `!= 2`, which means *"applies to
exactly v2"*; the two readings agreed only while 2 was the newest schema, so minting v3 switched the
third ceiling off in silence (MEASURED: the same unknown-domain fact scored `0.40` at schema 2 and
`1.0` at schema 3). Any future migration that touches schema dispatch must re-check every other
function branching on an exact version equality.

**Applicability is reported BESIDE confidence, never inside it.** There is no fourth ceiling for
`POPULATION_MATCH`: collapsing "was this altered / did anyone read it / what kind of source is it"
and "was it measured in people like this patient" into one number would make the interesting states
inexpressible.

Invalid signatures are rejected with confidence `0.0`; they are never a recoverable `0.5` penalty.

## Research Workflow

1. Define the research goal and required evidence threshold.
2. Configure pinned issuer keys when issuer-grade provenance is required.
3. Search and locate candidate sources.
4. Extract claims and source URLs.
5. **Fetch each source through the tool, not by hand:**
   ```python
   from evidence_fetch import fetch_source_returning_body, FetchRecord
   from quote_provenance import QuoteRecord, capture_excerpt, write_excerpt
   record, body = fetch_source_returning_body(url) # real HTTP, captured bytes
   if isinstance(record, FetchRecord):
       captured = capture_excerpt(body, quoted_text, record)
       write_excerpt("evidence_excerpts", captured)
       quoted = QuoteRecord(quoted_text, "raw-fetch", record.final_url,
                            record.sha256_body, locator, captured["excerpt_id"])
       fact = verifier.create_fetched_fact(claim, record, issuer, quote=quoted)
   else:                                            # offline, 404, oversize, refused scheme…
       fact = verifier.create_listing_fact(claim, url, reason=record.reason)
   ```
   A claim you never opened a source for is `verifier.create_asserted_fact(claim)` — record it
   honestly and let the gate refuse it. Never hand-label a class you did not earn.
5a. **When quoting verbatim, capture at fetch time as shown above.** No captured source bytes means
   no verbatim verdict; `tool-summary` can never earn one even when its words happen to match.
6. Add facts to the research ledger; issuer-signed facts only when a pinned issuer key actually
   signed the message.
7. Verify facts and citation chains.
8. Cross-check claims through ordinary source evaluation.
9. **Run the report gate before delivering:**
   `python3 scripts/check_report_evidence.py --report <report.md> --facts <facts.json>` — exit 0 required.
9a. **A NEGATIVE conclusion ("no competitor has this") MUST carry its own basis:** КОРПУС · ПОЛНОТА ·
   СПОСОБ ПОИСКА · ГРАНИЦА КОРПУСА · СЛЕДСТВИЕ. "We did not find it" is a property of the SEARCH;
   "it is not there" is a property of the WORLD, and only an exhaustive corpus licenses the second.
   Form, closed values and the measured reason: `references/negative-results.md`.
10. Report confidence, evidence-class mix, unsigned claims, rejected signatures, and limitations
    explicitly.

## Output Expectations

Reports include: the objective + executed GOAP plan; findings with source URLs; per-claim status on
BOTH axes — trust (`ISSUER_SIGNED`/`SELF_ATTESTED`/`UNVERIFIED`) and evidence
(`FETCH_VERIFIED`/`LISTING_ONLY`/`ASSERTED`/unknown-legacy); the evidence-class mix as a count
(the `ASSERTED` share should be zero); a visible marker on every `LISTING_ONLY` claim ("source not
opened directly — verify"); chain integrity when chains are used; unsigned and rejected claims; the
explicit caveat that cryptographic provenance is not truth verification — `FETCH_VERIFIED` means
the bytes arrived, not that the source is right.

## Implementation

Use the scripts in this skill:

- [scripts/ed25519_verifier.py](scripts/ed25519_verifier.py)
- [scripts/goap_planner.py](scripts/goap_planner.py)

Install Python crypto dependencies in a virtual environment:

```bash
python3 -m venv .venv
.venv/bin/pip install cryptography
```

Use `--break-system-packages` only as a last-resort local workaround when you understand the system-integrity risk.

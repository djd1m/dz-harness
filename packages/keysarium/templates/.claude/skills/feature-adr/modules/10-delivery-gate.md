# Step 10: Delivery Gate (opt-in) — review the feature as a PUBLISHED ENTITY

> **Opt-in.** This step runs only when explicitly requested (the user asks for a delivery gate, or the
> workflow form receives `args.deliveryGate: true` / `args.models.delivery`). Absent ⇒ the pipeline is
> byte-identical to a run without Step 10 — no agents, no artifact.

## Why a separate step (not more Step-8)

Step 8 reviews the code as the coder's counterpart — pre-hand-off, working-tree view. Step 10 reviews the
feature as a **published entity**: the landed diff, its docs and claims, its behavior as a consumer will
meet it. Its distinctive plane — **product honesty** — is absent from Step 8 entirely: fabricated
completeness (output presented as complete when a source was unavailable), a feature that does less than
its description, misleading user-facing text. Origin: a real incident where a 2-agent fresh-eyes pass said
SHIP and only the full multi-plane review found the fabricated-completeness and cap-violation defects.

## Protocol

### 1. Four orthogonal planes (parallel, cross-family of the coder)

Each plane reads `07_code_changes/change_manifest.md` + the actual changed files (+ `git diff` for anything
uncommitted), calibrating on `architecture/vision.md` / `architecture/degradations.md` **when present** (an
accepted degradation is NOT a finding) and staying generic when absent:

| Plane | Hunts |
|---|---|
| **Regressions** | broken consumers/contracts; NEW I/O on previously-pure startup/lifespan/health paths without a negative resource-down test; removed/weakened tests (fixture-swap); silent semantic changes to shared surfaces |
| **Security** | injection via interpolated paths/refs/commands; secrets in code/artifacts; path traversal/symlink escapes; fail-open where the contract says fail-closed |
| **Code quality** | god-object growth; parallel implementations vs the reuse map; structurally-dead safeguards; swallowed errors |
| **Product honesty + common sense** | claims not backed by behavior; fabricated completeness; docs/READMEs promising more than the code does; misleading degradation/limits text |

Findings shape: `{severity: BLOCKER|HIGH|MED|LOW, title, where (file:line), why}` — confirmed only.

### 2. Cross-validation (BLOCKER/HIGH, by index)

Every BLOCKER/HIGH is independently cross-validated by a second agent, matched **positionally by index —
never by title** (duplicate titles cross-contaminate). Default-to-FP when uncertain. A validator outage
surfaces the findings **UNVALIDATED** — never silently dropped, never silently confirmed.

### 3. Machine-checkable hand-off criterion

Write `features/<slug>/10_delivery_review.md`:
- **## Verdict** — `hand-off: ready | blocked | errored` (ready ⇔ 0 BLOCKER and 0 HIGH, ALL planes returned a usable result, cross-validation complete; `errored` = the gate itself failed — advisory, documented). Waivers: not in v1 — a HIGH is a HIGH.
- **## Findings** — table: severity | plane | title | where | why | crossValidated
- **## Hand-off criterion** — machine-checkable rows: `0 BLOCKER: PASS/FAIL(n)`, `0 HIGH: PASS/FAIL(n)` (waivers: not in v1).
  Projects with a merge-request flow add THEIR OWN rows here (`CI terminal: …`, `draft→ready: …`) — these are
  **document rows the owner fills**, never API calls made by the pipeline. No merge-request flow ⇒ the rows
  stay `—`.
- **## Note** — ADVISORY: the owner decides; nothing auto-aborts.

### Hard rules

1. **Findings only.** Step 10 NEVER posts to a VCS host, tracker, or any external service. Publishing a
   review anywhere is a separate, explicit user instruction.
2. **Advisory.** `hand-off: blocked` is a report, not an abort (a false gate kills trust).
3. **Cross-family (honest v1 scope).** The guarantee holds when the coder was Codex (Claude planes review
   it — genuinely cross-family). A Claude-coded run gets Claude planes too — SAME family — because codex
   planes are unsupported in v1 (a plane is a data-returning stage; the codex wrapper returns a stub, which
   the codex-routing-honesty rule forbids). The degradation is recorded loudly: `crossFamily: false` in the
   result and the review doc — run an independent cross-family review manually for the full guarantee.
4. **Cost control.** One gate per hand-off, not per commit. A stack of related changes gets one Step-10 pass
   on the combined diff.

## Promise tag

`<promise>FEATURE_ADR_DELIVERY_GATED</promise>` — emitted ONLY when the gate ran AND `10_delivery_review.md`
actually landed (the workflow probes the file; a verdict without its doc never claims the tag). The `🚦 Gates:`
line gains `delivery ready|blocked|errored` (`n/a` when the gate was not requested).

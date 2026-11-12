# OpenSpec-style observable scenarios

Status: proposed; OpenSpec CLI availability is reported separately. These are specifications, not passed checks.

## FR-1, FR-2: Bounded dialogue

### Scenario: clarify and follow up
GIVEN an ambiguous task WHEN the advisor asks a clarification AND the user submits a follow-up THEN the prior task and follow-up remain available to selection; the response does not claim execution.

### Scenario: partial coverage
GIVEN only reviewed scenarios for part of the requested outcome WHEN advice is selected THEN the response identifies partial coverage and renders only reviewed text.

## FR-3, NFR-1: Evaluation and provenance

### Scenario: invalid or stale data
GIVEN a stale review hash, an unknown scenario ID or an unmapped course WHEN advice is assembled THEN the stale/unknown material is rejected and no unverified course is invented.

### Scenario: frozen evaluation
GIVEN frozen questions WHEN the evaluator runs THEN it records input and implementation hashes and retains failed calls without rewriting earlier reports.

## NFR-2, NFR-3: Private access and resource limits

### Scenario: unauthorized browser request
GIVEN no valid authenticated session WHEN a request reaches the future HTTPS gateway THEN it is denied before reaching the paid adapter; credentials never appear in URL, access logs or response.

### Scenario: cross-origin request
GIVEN an authenticated session WHEN a different origin attempts a state-changing request THEN the gateway/backend reject it before model invocation.

### Scenario: exhausted budget or unavailable provider
GIVEN budget exhaustion or an active request WHEN another request is sent THEN no paid call starts; provider errors are explicit and preserve the user's input for retry.

## NFR-4: Traceability

### Scenario: changed reviewed text
GIVEN source or presentation content changes WHEN the catalog is built THEN the prior approval no longer applies and independent review is required.

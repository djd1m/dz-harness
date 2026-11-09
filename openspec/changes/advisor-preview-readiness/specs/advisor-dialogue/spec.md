## ADDED Requirements

### Requirement: FR-1 Freeform dialogue
The advisor SHALL retain successful task clarifications, respect later corrections and preserve user input on failure.

#### Scenario: Successful clarification
- **WHEN** the user submits an additional clarification after a successful answer
- **THEN** selection receives the initial task and earlier successful clarifications, with the latest correction identified

#### Scenario: Failed clarification
- **WHEN** the provider fails
- **THEN** earlier answers and unsent clarification remain available for retry

### Requirement: FR-2 Bounded partial guidance
The advisor SHALL show approved scenario text and task-bound missing parts without inventing capabilities.

#### Scenario: Useful partial fit
- **WHEN** selected scenarios cover only part of the task
- **THEN** the answer labels partial fit and displays bounded exact task excerpts classified as uncovered, subject to independent semantic evaluation

#### Scenario: Ambiguous task
- **WHEN** essential task information is absent
- **THEN** the answer asks one fixed question for the selected missing-information category

### Requirement: FR-3 Frozen evaluation
The evaluator SHALL preserve input hashes and distinguish development metrics from general correctness guarantees.

#### Scenario: Evaluation run
- **WHEN** the frozen development cases run
- **THEN** the report retains failures and does not overwrite earlier evidence

### Requirement: NFR-1 Source integrity
The advisor SHALL reject stale source or presentation approvals and unknown scenario identifiers.

#### Scenario: Changed approved content
- **WHEN** a record or its source changes
- **THEN** its prior approval cannot authorize display

### Requirement: NFR-2 Bounded spending
The private gateway candidate SHALL require a persistent request ledger that reserves a request before calling the paid provider.

#### Scenario: Restart after exhaustion
- **WHEN** the configured request budget is exhausted and the server restarts
- **THEN** new paid calls remain refused

### Requirement: NFR-3 Private browser boundary
The undeployed gateway candidate SHALL authenticate every request and reject cross-origin POSTs before forwarding to the loopback backend.

#### Scenario: Unauthenticated request
- **WHEN** valid credentials are absent
- **THEN** the gateway denies access without reaching the backend

#### Scenario: Foreign origin
- **WHEN** authenticated POST has a foreign or absent Origin
- **THEN** the gateway refuses it before proxy rewriting

### Requirement: NFR-4 Traceable review
Every requirement SHALL map through ADR-001, tasks and named checks with honest execution status.

#### Scenario: Handoff
- **WHEN** the candidate is delivered
- **THEN** the report distinguishes passed checks, untested deployment prerequisites and observed limitations

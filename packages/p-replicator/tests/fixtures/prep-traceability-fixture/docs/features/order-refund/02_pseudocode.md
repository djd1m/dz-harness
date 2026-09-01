# Pseudocode — Order refund

<!-- FIXTURE: prep-traceability-fixture / feature slug order-refund. Not a live project artifact. -->

## Core Algorithms

### Algorithm: Validate refund eligibility

REQUIREMENT: `FR-order-refund-1`

REALISES: `SC-FR-order-refund-1-1`

INPUT: order, current time

OUTPUT: eligibility decision

STEPS:

1. Reject an order that is not paid.
2. Compare the current time with the refund-window deadline.
3. Return the eligibility decision.

COMPLEXITY: O(1)

### Algorithm: Record the refund audit event

REQUIREMENT: `FR-order-refund-3`

REALISES: `SC-FR-order-refund-3-1`

INPUT: order identifier, refund request identifier

OUTPUT: persisted audit event

STEPS:

1. Build an immutable audit event from both identifiers.
2. Append the event to the order audit stream.
3. Return the persisted event.

COMPLEXITY: O(1)

## Scenario Coverage

Scenarios in Specification.md: 3 · claimed by an algorithm: 2

Not claimed by any algorithm:

| Scenario | Reason |
|---|---|
| FR-order-refund-2 | out-of-mvp-scope |

Claimed by an algorithm but absent from Specification.md:

| Algorithm | Claimed ID |
|---|---|
| none | none |

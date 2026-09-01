# Specification — Order refund

<!-- FIXTURE: prep-traceability-fixture / feature slug order-refund. Not a live project artifact. -->

## Requirements

### FR-order-refund-1 — Validate refund eligibility

The service must accept a refund request only while its order is inside the refund window.

Acceptance scenarios:

- `SC-FR-order-refund-1-1`: Given an eligible paid order, when the buyer requests a refund, then validation succeeds.

### FR-order-refund-2 — Notify the buyer

The service must notify the buyer after the refund request is accepted.

Acceptance scenarios:

- `SC-FR-order-refund-2-1`: Given an accepted refund request, when processing completes, then the buyer receives a confirmation.

### FR-order-refund-3 — Record the audit event

The service must append an immutable audit event for every accepted refund request.

Acceptance scenarios:

- `SC-FR-order-refund-3-1`: Given an accepted refund request, when it is persisted, then an audit event records the order and request identifiers.

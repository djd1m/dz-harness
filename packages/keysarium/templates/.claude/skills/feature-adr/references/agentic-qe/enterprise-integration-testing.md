# Enterprise Integration Testing (Condensed for Feature ADR)

> Source: agentic-qe `enterprise-integration-testing` skill (Tier 3)
> Condensed from 735 lines — SAP-specific sections removed, universal patterns retained.

## Purpose

Verify that independently correct modules/systems work correctly together.
The biggest risks are in the seams between components, not within them.

## Integration Testing Protocol

### 1. Map E2E Flow

Before writing tests, map the complete flow:
```
User Action → API → Service A → Service B → Database → Response
```

Identify every integration boundary (API calls, DB queries, message queues, file I/O).

### 2. Test Each Boundary

For each integration point:

| Boundary Type | What to Test |
|---|---|
| API (REST/GraphQL) | Contract compliance, schema validation, error codes |
| Database | Query correctness, transaction isolation, migration compatibility |
| Message Queue | Message format, ordering, DLQ handling, retry logic |
| File I/O | Format validation, encoding, path handling |
| External Service | Mock fidelity, timeout handling, circuit breaker |

### 3. Cross-Module Data Consistency

After each integration event, verify:
- Data written by module A is correctly read by module B
- No data loss or transformation errors at boundaries
- Eventual consistency windows are respected (async flows)

### 4. Contract Testing

```
Consumer defines expected contract
  → Provider validates against contract
    → Break = blocked merge
```

Key checks:
- Request/response schemas match between caller and callee
- Error response formats are consistent
- API versioning is respected
- No breaking changes in shared interfaces

### 5. Error Recovery

Test failure scenarios at every boundary:
- What happens when Service B is down?
- Are partial operations compensated/rolled back?
- Do correlation IDs propagate through the chain?
- Are DLQ messages reprocessable?

## Integration Quality Gates

| Gate | Threshold | Action |
|---|---|---|
| Cross-module data consistency | 100% for critical paths | BLOCK on failure |
| API contract compliance | 100% | BLOCK on failure |
| Error recovery | All compensation paths tested | WARN if partial |
| Performance | E2E flow < defined SLA | WARN if exceeded |

## Hierarchical Testing Strategy

Execute integration tests in phases:
1. **Contract validation** — verify interfaces match
2. **Integration testing** — verify boundary behavior
3. **E2E validation** — verify complete flows
4. **Authorization check** — verify access control across modules

## QCSD Flags for Integration

```
HAS_CROSS_MODULE_DATA: true   → Data replicated/shared across modules
HAS_ASYNC_PROCESSING: true    → Message queues, event-driven flows
HAS_EXTERNAL_SERVICES: true   → Third-party API integrations
HAS_DATABASE_SHARING: true    → Multiple modules access same DB
```

## Best Practices

### Do
- Map the full E2E flow before writing any tests
- Test each integration boundary separately AND end-to-end
- Validate data consistency across all modules after each event
- Use service virtualization for hard-to-provision dependencies
- Include correlation ID tracing in test assertions

### Avoid
- Testing only through the UI without API-level tests
- Ignoring async processing errors (DLQ, failed events)
- Assuming cross-module data is immediately consistent
- Testing integrations only in isolation (mock everything)
- Deploying without verifying no breaking API changes

## Agent Coordination

When used as Fleet QE Agent 3 (Integration Integrity Checker):
- Focus scope: cross-module interactions within the feature
- Input: `{CODE_CHANGES}` file list, `{ARCHITECTURE}` component diagram
- Output: integration issues found, contract violations, data consistency risks
- Verdict per issue: BLOCKER / WARNING / INFO

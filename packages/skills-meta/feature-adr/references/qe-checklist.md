# QE Checklist

Unified quality engineering checklist adapted from shift-left testing and brutal-honesty review patterns.

---

## Pre-Implementation (Shift-Left)

Before writing code, verify:

- [ ] Requirements have testable acceptance criteria
- [ ] Edge cases identified in requirements phase
- [ ] Data model validated against expected queries
- [ ] API contract defined before implementation
- [ ] Error scenarios documented

## During Implementation

While coding, continuously check:

- [ ] Each function has a clear single responsibility
- [ ] Error paths return meaningful messages
- [ ] Input validation at system boundaries
- [ ] No hardcoded secrets, URLs, or environment-specific values
- [ ] Logging at appropriate levels (debug/info/warn/error)

## Post-Implementation

### Correctness Checks
- [ ] All acceptance criteria have corresponding tests
- [ ] Happy path tested end-to-end
- [ ] Edge cases tested (null, empty, max, min, boundary)
- [ ] Error paths tested (invalid input, network failure, timeout)
- [ ] Concurrent access tested (if applicable)

### Security Checks (OWASP-aligned)
- [ ] No SQL/NoSQL injection vectors
- [ ] No XSS vectors in output
- [ ] Authentication required on all protected endpoints
- [ ] Authorization checked (not just authentication)
- [ ] Sensitive data not logged or exposed in errors
- [ ] CSRF protection on state-changing operations
- [ ] Rate limiting on public endpoints
- [ ] Input size limits enforced

### Performance Checks
- [ ] No N+1 query patterns
- [ ] Database queries use appropriate indexes
- [ ] Large result sets are paginated
- [ ] Expensive operations are async/cached where appropriate
- [ ] No unnecessary memory allocations in hot paths
- [ ] Connection pools sized appropriately

### Maintainability Checks
- [ ] Code follows existing project conventions
- [ ] Naming is consistent with codebase
- [ ] No dead code or commented-out blocks
- [ ] Complex logic has explanatory comments
- [ ] Public APIs have documentation
- [ ] No circular dependencies introduced

### Compatibility Checks
- [ ] Backward compatible with existing clients (or migration path documented)
- [ ] Database migration is reversible
- [ ] Feature flag available for gradual rollout (if applicable)
- [ ] Existing tests still pass

## Review Severity Guide

| Severity | Symbol | Meaning | Action |
|----------|--------|---------|--------|
| Blocker | 🔴 | Prevents merge | Must fix |
| Warning | 🟡 | Should fix | Fix before next release |
| Suggestion | 🔵 | Nice to have | Consider for future |
| Praise | 🟢 | Well done | No action needed |

## Tier-Specific Depth

| Check Category | S | M | L | XL |
|---------------|---|---|---|-----|
| Pre-implementation | - | Partial | Full | Full |
| Correctness | Smoke | Unit | Unit+Integ | Full |
| Security | - | Basic | Full | Full+Pentest |
| Performance | - | - | Basic | Full+Load |
| Maintainability | - | Basic | Full | Full |
| Compatibility | Smoke | Basic | Full | Full |

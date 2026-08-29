# Architecture Fitness Functions Catalog

Каталог Architecture Fitness Functions для idea2prd skills.

## What are Fitness Functions?

**Architecture Fitness Function** — автоматизированная проверка, что система соответствует архитектурным требованиям.

```
Fitness Function = Objective Metric + Threshold + Automation
```

**Примеры:**
- "Bounded contexts не должны напрямую обращаться к БД друг друга" (Structural)
- "P95 latency < 500ms" (Performance)
- "Все endpoints требуют authentication" (Security)

---

## Categories

### 1. Structural Fitness Functions

Проверяют архитектурную структуру кода.

#### FF-001: Bounded Context Independence

```yaml
Name: Bounded Context Independence
Category: Structural
Rule: No direct database access across bounded contexts
Threshold: 0 violations
Test: Static analysis of imports and dependencies
Tools: ArchUnit, custom ESLint rules, dependency-cruiser
Frequency: Every commit (CI)
```

**Implementation (TypeScript/ESLint):**
```javascript
// .eslintrc.js
module.exports = {
  rules: {
    'no-restricted-imports': ['error', {
      patterns: [
        {
          group: ['**/orders/**'],
          message: 'Cannot import from Orders context directly'
        }
      ]
    }]
  }
}
```

---

#### FF-002: Aggregate Size Limit

```yaml
Name: Aggregate Size Limit
Category: Structural
Rule: Each aggregate should have ≤7 entities
Threshold: Max 7 entities per aggregate
Test: AST analysis or manual review
Tools: Custom script, code review checklist
Frequency: PR review
```

**Rationale:** Large aggregates indicate potential design issues and transaction conflicts.

---

#### FF-003: Dependency Direction

```yaml
Name: Dependency Direction
Category: Structural
Rule: Dependencies flow inward (Infrastructure → Application → Domain)
Threshold: 0 violations
Test: Static analysis
Tools: dependency-cruiser, madge
Frequency: Every commit
```

**dependency-cruiser config:**
```javascript
module.exports = {
  forbidden: [
    {
      name: 'domain-to-infrastructure',
      from: { path: '^src/domain' },
      to: { path: '^src/infrastructure' }
    }
  ]
}
```

---

#### FF-004: Cyclic Dependencies

```yaml
Name: No Cyclic Dependencies
Category: Structural
Rule: No circular dependencies between modules
Threshold: 0 cycles
Test: Dependency graph analysis
Tools: madge, dependency-cruiser
Frequency: Every commit
```

---

### 2. ADR Compliance Fitness Functions

Проверяют соответствие принятым архитектурным решениям.

#### FF-010: API Style Compliance

```yaml
Name: API Style Compliance
Category: ADR Compliance
Related ADR: ADR-003
Rule: All API endpoints follow REST conventions (or GraphQL schema)
Threshold: 100% compliance
Test: OpenAPI/Schema validation
Tools: Spectral, GraphQL linter
Frequency: Every commit
```

**Spectral config (.spectral.yaml):**
```yaml
extends: spectral:oas
rules:
  operation-operationId: error
  operation-tags: error
  path-params: error
```

---

#### FF-011: Authentication Coverage

```yaml
Name: Authentication Coverage
Category: ADR Compliance
Related ADR: ADR-004
Rule: All non-public endpoints require authentication
Threshold: 100%
Test: Security scan + route analysis
Tools: Custom script, OWASP ZAP
Frequency: Every commit + weekly scan
```

---

#### FF-012: Error Response Format

```yaml
Name: Error Response Format
Category: ADR Compliance
Related ADR: ADR-009
Rule: All error responses follow RFC 7807 format
Threshold: 100%
Test: API contract testing
Tools: Custom test suite, Pact
Frequency: Every commit
```

---

#### FF-013: Logging Format

```yaml
Name: Structured Logging
Category: ADR Compliance
Related ADR: ADR-010
Rule: All logs are structured JSON with required fields
Threshold: 100%
Test: Log format validation
Tools: Custom linter, log analysis
Frequency: Every commit
```

---

### 3. Performance Fitness Functions

Проверяют производительность системы.

#### FF-020: Response Time

```yaml
Name: API Response Time
Category: Performance
Related NFR: NFR-P01
Rule: P95 response time < 500ms
Threshold: 500ms
Test: Load testing
Tools: k6, Artillery, Gatling
Frequency: Daily (staging), weekly (prod-like)
```

**k6 script:**
```javascript
import http from 'k6/http';
import { check } from 'k6';

export const options = {
  thresholds: {
    http_req_duration: ['p(95)<500'],
  },
};

export default function () {
  const res = http.get('https://api.example.com/health');
  check(res, {
    'status is 200': (r) => r.status === 200,
  });
}
```

---

#### FF-021: Database Query Time

```yaml
Name: Database Query Time
Category: Performance
Rule: No queries > 100ms in application code
Threshold: 100ms
Test: Query analysis, slow query log
Tools: pg_stat_statements, APM
Frequency: Continuous monitoring
```

---

#### FF-022: Memory Usage

```yaml
Name: Memory Usage
Category: Performance
Rule: Application memory < 512MB under normal load
Threshold: 512MB
Test: Load testing with memory profiling
Tools: Prometheus + Grafana, APM
Frequency: Weekly
```

---

### 4. Security Fitness Functions

Проверяют безопасность системы.

#### FF-030: Dependency Vulnerabilities

```yaml
Name: No Critical Vulnerabilities
Category: Security
Rule: No critical/high CVEs in dependencies
Threshold: 0 critical, 0 high
Test: Dependency scanning
Tools: npm audit, Snyk, Dependabot
Frequency: Every commit + daily
```

---

#### FF-031: Secrets in Code

```yaml
Name: No Secrets in Code
Category: Security
Rule: No hardcoded secrets, API keys, passwords
Threshold: 0 violations
Test: Secret scanning
Tools: git-secrets, gitleaks, truffleHog
Frequency: Every commit
```

---

#### FF-032: HTTPS Enforcement

```yaml
Name: HTTPS Only
Category: Security
Rule: All external communications over HTTPS
Threshold: 100%
Test: Configuration audit, traffic analysis
Tools: Custom script, security scanner
Frequency: Weekly
```

---

### 5. Data Integrity Fitness Functions

#### FF-040: Event Schema Compliance

```yaml
Name: Domain Event Schema
Category: Data Integrity
Rule: All domain events match their JSON Schema
Threshold: 100%
Test: Schema validation in tests
Tools: ajv, JSON Schema validator
Frequency: Every commit
```

---

#### FF-041: Database Migration Safety

```yaml
Name: Safe Migrations
Category: Data Integrity
Rule: All migrations are reversible and non-destructive
Threshold: 100%
Test: Migration testing in CI
Tools: Custom migration tests
Frequency: Every PR with migrations
```

---

### 6. Operational Fitness Functions

#### FF-050: Test Coverage

```yaml
Name: Test Coverage
Category: Operational
Rule: Code coverage ≥ 80%
Threshold: 80%
Test: Coverage report
Tools: Jest, c8, Istanbul
Frequency: Every commit
```

---

#### FF-051: Build Time

```yaml
Name: Build Time
Category: Operational
Rule: CI build completes in < 10 minutes
Threshold: 10 minutes
Test: CI metrics
Tools: CI/CD platform metrics
Frequency: Continuous
```

---

## Fitness Function Template

```yaml
Name: [Descriptive name]
Category: Structural | ADR Compliance | Performance | Security | Data Integrity | Operational
Related ADR/NFR: [ADR-XXX or NFR-XXX]
Rule: [Clear statement of what must be true]
Threshold: [Numeric or boolean threshold]
Test: [How to verify]
Tools: [Automation tools]
Frequency: Every commit | Daily | Weekly | Monthly
Owner: [Team/person responsible]
Alert: [How to alert on failure]
```

---

## Implementation Priority

| Priority | Fitness Functions | Rationale |
|----------|-------------------|-----------|
| **P0** | FF-030 (Vulnerabilities), FF-031 (Secrets), FF-011 (Auth) | Security-critical |
| **P1** | FF-001 (Context Independence), FF-010 (API Style), FF-050 (Coverage) | Architecture integrity |
| **P2** | FF-020 (Response Time), FF-040 (Event Schema) | Quality |
| **P3** | FF-002 (Aggregate Size), FF-021 (Query Time) | Optimization |

---

## Fitness Function Dashboard

```markdown
# Architecture Fitness Dashboard

## Status: [DATE]

| Category | Pass | Fail | Trend |
|----------|------|------|-------|
| Structural | 4/4 | 0 | ✅ |
| ADR Compliance | 3/4 | 1 | ⚠️ |
| Performance | 2/3 | 1 | 🔴 |
| Security | 5/5 | 0 | ✅ |

## Failing Checks

### FF-012: Error Response Format
- **Status:** FAIL
- **Current:** 85%
- **Threshold:** 100%
- **Action:** [JIRA-123] Fix legacy endpoints

### FF-020: Response Time  
- **Status:** FAIL
- **Current:** P95 = 620ms
- **Threshold:** 500ms
- **Action:** [JIRA-124] Optimize /search endpoint
```

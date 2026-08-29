# ADR Catalog: Templates and Common Decisions

Каталог типовых Architecture Decision Records для idea2prd skills.

## ADR Template

```markdown
# ADR-[NNN]: [Title]

## Status
[Proposed | Accepted | Deprecated | Superseded by ADR-XXX]

## Context
[Situation requiring decision. Reference requirements.]

**Related Requirements:**
- FR-XXX: [requirement]
- NFR-XXX: [requirement]

**Related Bounded Contexts:**
- [Context Name]

## Decision Drivers
- [Driver 1]: [Why it matters]
- [Driver 2]: [Why it matters]

## Considered Options
1. [Option A]
2. [Option B]
3. [Option C]

## Decision
[Chosen option] because [rationale].

## Consequences

### Positive
- [Benefit]

### Negative
- [Trade-off]

### Risks
- [Risk]: Mitigation: [approach]

## Confirmation
<!-- REQUIRED. An ADR without this stanza is incomplete. -->
- **Load-bearing property:** [the single property that, if it silently regressed, makes this decision wrong]
- **Required automated check:** [`FF-NNN` fitness function OR `docs/tests/<feature>.feature` Gherkin scenario that FAILS if the property is violated]
- **Verification method:** [how the check is run — e.g. CI stage, fitness_validator.py, test runner]
- **Monitoring:** [what to watch in production to detect drift — metric/log/alert]
- **Success metric:** [the threshold that says the property still holds — tag it MEASURED / ESTIMATED]
- **Owner:** [role/team accountable for the check]

## Related ADRs
- ADR-XXX: [relationship]
```

> **Confirmation stanza is load-bearing (idea2prd v3).** Every generated ADR MUST carry `## Confirmation`.
> Its `Required automated check` MUST name a REAL Phase-5 artifact — a `FF-NNN` fitness function
> (`references/fitness-functions-catalog.md` / `scripts/fitness_validator.py`) or a Gherkin `.feature`
> scenario — so the decision's load-bearing property is *falsifiable*, not prose. This wires Phase 3 (ADR)
> to Phase 5 (fitness/tests): the property an ADR names is often the one left untested (CLAIMED — harness
> feature-adr lesson, `.claude/rules/feature-adr-ultracode.md`), so the Confirmation stanza forces it to
> name its falsifying test.
> An ADR whose Confirmation names no falsifying check is **incomplete** — do not accept it at Checkpoint 3.

### Supersession discipline

Never edit an Accepted/Rejected ADR's decision in place. A changed decision **mints a new ADR** that
supersedes the old one (`Status: Superseded by ADR-XXX`), and the new ADR carries its own `## Confirmation`.

---

## Standard ADRs (Required)

### ADR-001: System Architecture Style

**Common Options:**

| Option | When to Use | Trade-offs |
|--------|-------------|------------|
| **Modular Monolith** | MVP, small team, unclear boundaries | Simple deployment, harder to scale independently |
| **Microservices** | Large team, clear boundaries, need independent scaling | Complex ops, eventual consistency |
| **Serverless** | Event-driven, variable load, cost optimization | Cold starts, vendor lock-in |
| **Hybrid** | Mix of needs | Complexity of multiple patterns |

**Default:** Modular Monolith (safest for MVP)

---

### ADR-002: Database Technology

**Common Options:**

| Option | Strengths | When to Use |
|--------|-----------|-------------|
| **PostgreSQL** | ACID, JSON support, extensions | Most applications |
| **MySQL/MariaDB** | Wide support, replication | High-read workloads |
| **MongoDB** | Schema flexibility, horizontal scale | Document-centric, rapid iteration |
| **DynamoDB** | Serverless, auto-scaling | AWS-native, key-value access patterns |

**Default:** PostgreSQL (most versatile)

**Decision Drivers:**
- Data model complexity
- Consistency requirements
- Scale requirements
- Team expertise
- Cloud platform

---

### ADR-003: API Design

**Common Options:**

| Option | Strengths | When to Use |
|--------|-----------|------------|
| **REST + JSON** | Simple, cacheable, tooling | CRUD operations, public APIs |
| **GraphQL** | Flexible queries, single endpoint | Complex data graphs, mobile apps |
| **gRPC** | Performance, streaming, contracts | Internal services, high-throughput |
| **REST + JSON:API** | Standardized REST | Complex resource relationships |

**Default:** REST + JSON (simplest, most supported)

**Decision Drivers:**
- Client needs (web, mobile, third-party)
- Data complexity
- Performance requirements
- Team expertise

---

### ADR-004: Authentication & Authorization

**Common Options:**

| Option | Strengths | When to Use |
|--------|-----------|-------------|
| **JWT + OAuth 2.0** | Stateless, standard, SSO-ready | Most applications |
| **Session-based** | Simple, server-controlled | Traditional web apps |
| **API Keys** | Simple for M2M | Internal APIs, integrations |
| **OIDC** | Full identity, SSO | Enterprise, multiple IdPs |

**Default:** JWT + OAuth 2.0 (modern standard)

**Decision Drivers:**
- User types (human, machine)
- SSO requirements
- Session management needs
- Compliance requirements

---

### ADR-005: Inter-Context Communication

**Common Options:**

| Option | Strengths | When to Use |
|--------|-----------|-------------|
| **Domain Events (async)** | Loose coupling, resilience | Cross-context state changes |
| **Direct API calls (sync)** | Simple, immediate | Query data, low latency needs |
| **Shared Database** | Simple (anti-pattern) | Legacy, tight deadlines |
| **Event Sourcing** | Full audit trail | Compliance, complex workflows |

**Default:** Domain Events for commands, Direct calls for queries

**Decision Drivers:**
- Coupling tolerance
- Consistency requirements
- Audit requirements
- Team experience

---

### ADR-006: Deployment Architecture

**Common Options:**

| Option | Strengths | When to Use |
|--------|-----------|-------------|
| **Docker + Kubernetes** | Portable, scalable | Production workloads |
| **Docker + Docker Compose** | Simple, local dev | Small deployments, staging |
| **Serverless (Lambda/Functions)** | No ops, pay-per-use | Event-driven, variable load |
| **PaaS (Heroku, Railway)** | Zero ops | MVPs, small teams |

**Default:** Docker + Kubernetes-ready (prepare for scale)

---

### ADR-007: Frontend Technology

**Common Options:**

| Option | Strengths | When to Use |
|--------|-----------|-------------|
| **React** | Ecosystem, hiring, flexibility | Most applications |
| **Vue.js** | Gentle learning curve | Smaller teams, rapid dev |
| **Next.js** | SSR, SEO, full-stack | Content-heavy, SEO-critical |
| **SvelteKit** | Performance, simplicity | Performance-critical |

**Default:** React + TypeScript (largest ecosystem)

---

### ADR-008: State Management

**Common Options:**

| Option | Strengths | When to Use |
|--------|-----------|-------------|
| **React Query + Zustand** | Server state + client state separation | Most React apps |
| **Redux Toolkit** | Predictable, devtools | Complex client state |
| **Jotai/Recoil** | Atomic, simple | Simpler state needs |
| **MobX** | Observable, less boilerplate | OOP preference |

**Default:** React Query (server) + Zustand (client)

---

### ADR-009: Error Handling

**Common Options:**

| Option | Strengths | When to Use |
|--------|-----------|-------------|
| **RFC 7807 Problem Details** | Standard, machine-readable | REST APIs |
| **Custom Error Schema** | Flexible | Specific needs |
| **GraphQL Errors** | Native | GraphQL APIs |

**Default:** RFC 7807 Problem Details

**Example:**
```json
{
  "type": "https://api.example.com/errors/validation",
  "title": "Validation Error",
  "status": 400,
  "detail": "Email format is invalid",
  "instance": "/users/123"
}
```

---

### ADR-010: Observability

**Common Options:**

| Aspect | Options | Default |
|--------|---------|---------|
| **Logging** | Structured JSON, ELK, Loki | Structured JSON |
| **Metrics** | Prometheus, CloudWatch, Datadog | Prometheus |
| **Tracing** | OpenTelemetry, Jaeger | OpenTelemetry |
| **Alerting** | PagerDuty, OpsGenie | Based on platform |

**Default Stack:** Structured JSON logs + OpenTelemetry + Prometheus

---

## Additional ADRs (As Needed)

| ADR | Topic | When Needed |
|-----|-------|-------------|
| ADR-011 | Caching Strategy | High-read, performance-critical |
| ADR-012 | Search Technology | Full-text search requirements |
| ADR-013 | File Storage | User uploads, media |
| ADR-014 | Background Jobs | Async processing |
| ADR-015 | Email/Notifications | User communication |
| ADR-016 | Payment Processing | E-commerce |
| ADR-017 | Internationalization | Multi-language |
| ADR-018 | Feature Flags | Gradual rollout |
| ADR-019 | Rate Limiting | API protection |
| ADR-020 | Data Encryption | Compliance |

---

## ADR Naming Convention

```
ADR-[NNN]-[kebab-case-title].md

Examples:
ADR-001-system-architecture.md
ADR-002-database-technology.md
ADR-003-api-design.md
```

## ADR Index Template

```markdown
# Architecture Decision Records

## Accepted

| ADR | Title | Date | Summary |
|-----|-------|------|---------|
| [ADR-001](ADR-001-system-architecture.md) | System Architecture | YYYY-MM-DD | Modular Monolith |
| [ADR-002](ADR-002-database.md) | Database Technology | YYYY-MM-DD | PostgreSQL |

## Proposed

| ADR | Title | Date | Summary |
|-----|-------|------|---------|

## Deprecated

| ADR | Title | Date | Superseded By |
|-----|-------|------|---------------|
```

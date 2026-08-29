# Phase 4: Architecture — Governance Shard

## Time Budget
15% of total timeline

## Skill
Built-in templates (no external skill)

## Prerequisites
- Phase 3 complete: `<promise>SOLUTION_DESIGNED</promise>`
- Files exist: `00_` through `03_`

## Mandatory Outputs
- `04_architecture.md`
- `diagrams/architecture-c4.mermaid` (C4 Context diagram)
- `diagrams/sequence-main-flow.mermaid` (Sequence diagram)

## Content Requirements
- C4 architectural diagram
- Components table: tech + purpose + justification
- AI Models & Pipeline: task, type, concrete model name
- Data Architecture: sources, ETL, storage, Vector DB
- Integrations: system + protocol
- Security & Compliance: controls, RBAC, audit, regulations
- Scalability: latency target, throughput, scaling strategy
- MVP Scope definition

## Domain-Specific Rules
- Banking: on-premise LLM (GigaChat/YandexGPT/open-source), ФЗ-152, ЦБ, ФСТЭК
- Retail: latency < 200ms, A/B testing infrastructure
- Enterprise: Change Management plan, Legacy integration, SLA definition
- Healthcare: HITL for ALL clinical decisions, ФЗ-323

## Quality Gates
- Minimum 2 Mermaid diagrams (C4 + sequence)
- All model names must be real, available products
- Security section must reference applicable regulations
- MVP scope must be achievable (not over-engineered)

## Promise
On completion: `<promise>ARCHITECTURE_DEFINED</promise>`

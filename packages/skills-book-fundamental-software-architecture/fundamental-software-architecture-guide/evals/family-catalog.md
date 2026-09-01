# Family routing catalog — Fundamental Software Architecture

This is the second-stage catalog. Use it only after the gateway has established an architecture-level
decision and has not handed the request to a narrower installed skill. Choose exactly one family.

- **fsa-family-choice-and-fit** — Formulate and compare an architecture choice, identify structural drivers and accepted downside, select a style/topology, and check fit with deployment, providers, teams, operations and business. Not DDIA SLO/data measurement, ADR writing, Terraform/Kubernetes, ETL implementation, or concrete datastore selection.
- **fsa-family-boundaries-and-coupling** — Decide responsibility, coupling, data and independently-changeable boundaries: actors/actions, connascence, architecture quantum, modular monolith, microservice and pattern composition. Not ordinary SOLID refactoring, C4 artifact production, database review, or backend implementation.
- **fsa-family-distributed-interaction** — Decide the price and semantics of distributed interaction in an event-driven application: distributed fallacies, payload, coordination, ordering, delivery and recovery. Not broker implementation, DDIA consensus, production streaming pipeline, or LLM-agent orchestration.
- **fsa-family-guardrails-and-risk** — Turn an architecture rule or architecture risk into a fitness function, control signal, risk-storming session, trend and reconsideration condition. Not an ordinary PR risk register, generic QA, or observability setup without an architecture rule.
- **fsa-family-architecture-communication** *(KB-only handoff; not gateway-routable)* — Choose the audience, scope and semantic layer of an architecture representation before handing off a C4 or other diagram artifact. Not drawing a generic Mermaid/PlantUML/flowchart by itself.
- **fsa-family-organization-and-participation** — Calibrate architect participation, ownership, independent work streams and team decision rights around an architecture choice. Not sprint planning, stakeholder mapping, or generic people management.

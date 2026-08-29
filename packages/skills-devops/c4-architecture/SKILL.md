---
name: "c4-architecture"
description: "Generates and validates C4 architecture diagrams — context, container, component, and code level views."
trust_tier: 2
trust_tier_label: "Validated"
validation:
  schema_path: schemas/output.json
  validator_path: scripts/validate-config.json
---

# c4-architecture

Generates and validates C4 architecture diagrams at all four levels: context, container, component, and code. Based on the C4 model by Simon Brown. Outputs in Mermaid, PlantUML, or Structurizr DSL.

## When to use

- User needs to document system architecture visually
- User wants to create architecture diagrams for a new or existing system
- User asks for C4 diagrams (context, container, component, code)
- User wants to validate consistency across architecture levels
- User needs architecture documentation for ADRs or design reviews

## When NOT to use

- User wants runtime infrastructure diagrams (use `kubernetes` or `docker-compose`)
- User wants database schema diagrams (use `database-review`)
- User wants sequence diagrams only (general diagramming, not C4-specific)
- User wants to deploy or provision infrastructure

## Procedure

1. **Identify system scope.** Determine the system boundary -- what is "your system" vs external systems. Ask the user: What is the name of the system? Who are the users? What external systems does it integrate with? Scope must be clear before any diagram is drawn.

2. **Context diagram (Level 1).** Map actors (people, roles) and external systems that interact with the target system. Each element gets a name, description, and technology tag. Relationships are labeled with the protocol or purpose (e.g., "Sends email via SMTP", "Reads data via REST API"). The system itself is a single box -- no internal details at this level.

   ```mermaid
   C4Context
     title System Context - Online Banking
     Person(customer, "Banking Customer", "A customer of the bank with one or more accounts")
     System(banking, "Online Banking System", "Allows customers to view balances, make payments, manage accounts")
     System_Ext(email, "Email System", "Sendgrid-based transactional email")
     System_Ext(mainframe, "Core Banking", "Stores account balances, transactions, customer data")

     Rel(customer, banking, "Views balances, makes payments", "HTTPS")
     Rel(banking, email, "Sends notifications", "SMTP")
     Rel(banking, mainframe, "Reads/writes account data", "REST/JSON")
   ```

3. **Container diagram (Level 2).** Zoom into the system boundary. Show applications, databases, message queues, file stores, and their interactions. Each container gets a name, technology stack, and responsibility. Relationships show protocols and data flow direction.

   ```mermaid
   C4Container
     title Container Diagram - Online Banking
     Person(customer, "Banking Customer")

     System_Boundary(banking, "Online Banking System") {
       Container(spa, "Single-Page App", "React, TypeScript", "Provides banking UI")
       Container(api, "API Gateway", "Node.js, Express", "Routes and authenticates requests")
       Container(accounts, "Accounts Service", "Go", "Manages account operations")
       ContainerDb(db, "Database", "PostgreSQL", "Stores user and account data")
       ContainerQueue(queue, "Message Queue", "RabbitMQ", "Async event processing")
     }

     Rel(customer, spa, "Uses", "HTTPS")
     Rel(spa, api, "Calls", "REST/JSON")
     Rel(api, accounts, "Routes to", "gRPC")
     Rel(accounts, db, "Reads/writes", "SQL")
     Rel(accounts, queue, "Publishes events", "AMQP")
   ```

4. **Component diagram (Level 3).** Zoom into a single container. Show the major modules, services, or classes within that container and how they collaborate. Each component gets a name, technology, and responsibility. This level is useful for containers with complex internal structure.

   ```mermaid
   C4Component
     title Component Diagram - Accounts Service
     Container_Boundary(accounts, "Accounts Service") {
       Component(ctrl, "Account Controller", "Go handler", "Handles HTTP/gRPC requests")
       Component(svc, "Account Service", "Go service", "Business logic for accounts")
       Component(repo, "Account Repository", "Go + sqlx", "Data access layer")
       Component(events, "Event Publisher", "Go + AMQP", "Publishes domain events")
     }

     ContainerDb(db, "Database", "PostgreSQL")
     ContainerQueue(queue, "Message Queue", "RabbitMQ")

     Rel(ctrl, svc, "Calls")
     Rel(svc, repo, "Uses")
     Rel(svc, events, "Publishes via")
     Rel(repo, db, "Reads/writes", "SQL")
     Rel(events, queue, "Sends to", "AMQP")
   ```

5. **Code diagram (Level 4).** Zoom into a single component. Show classes, interfaces, and functions with their relationships (inheritance, composition, dependency). This level is optional and only needed for complex components. Use UML class diagram notation.

6. **Generate in target format.** Based on user preference, output diagrams in one of:
   - **Mermaid** (default) -- renders in GitHub, GitLab, Notion, and most markdown viewers
   - **PlantUML** -- requires PlantUML server or local JAR
   - **Structurizr DSL** -- for use with Structurizr tooling and workspace files
   Ensure all element IDs are consistent across levels (same ID for the same element).

7. **Validate consistency across levels.** Check that:
   - Every container in Level 2 exists as the system box in Level 1
   - Every component in Level 3 belongs to a container shown in Level 2
   - Relationships at lower levels do not contradict higher levels
   - Technology tags are consistent (do not call it "PostgreSQL" in L2 and "MySQL" in L3)
   - No orphaned elements (every element has at least one relationship)
   - Naming is consistent across all levels (exact same names, not variations)

8. **Document decisions.** For each diagram, add a brief note explaining why this decomposition was chosen. If there were alternatives considered, mention them. Link to ADRs if they exist. This is the "why" behind the boxes and arrows.

## Anti-patterns

- **Too detailed at context level.** Level 1 should show the system as a single box. If you are showing databases or microservices at L1, you are at the wrong level.
- **Missing relationships.** Every element should have at least one relationship. An isolated box means it is either unnecessary or missing a connection.
- **Inconsistent naming across levels.** If the API is called "API Gateway" in L2, it must be "API Gateway" in L3 -- not "API Server" or "Gateway Service."
- **Technology tags on Level 1.** Context diagrams should not show internal technologies. The system is a black box at this level.
- **Skipping levels.** Going from L1 directly to L3 creates confusion. Always provide L2 first.
- **No descriptions.** Every element needs a one-line description of its responsibility. A box labeled "Service" with no description is useless.

## Self-check

Before delivering, verify:

1. [ ] Level 1 (Context) shows the system as a single box with all external actors and systems
2. [ ] Level 2 (Container) shows all major containers within the system boundary
3. [ ] Level 3 (Component) zooms into at least one container with its internal components
4. [ ] All element names are consistent across all diagram levels
5. [ ] All technology tags are consistent across all diagram levels
6. [ ] Every element has at least one relationship (no orphaned boxes)
7. [ ] Relationships have meaningful labels (protocol, purpose, or data flow)
8. [ ] Diagrams render correctly in the target format (Mermaid/PlantUML/Structurizr)
9. [ ] Each diagram includes a title and brief description of what it shows
10. [ ] Decomposition decisions are documented with rationale

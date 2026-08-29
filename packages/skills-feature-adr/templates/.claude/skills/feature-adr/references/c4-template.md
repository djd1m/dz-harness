# C4 Diagram Templates

Reference templates for C4 architecture diagrams in Mermaid format.

---

## Level 1: System Context

```mermaid
graph TB
    %% Actors
    User["👤 User<br/><i>Description of user</i>"]
    Admin["👤 Admin<br/><i>Description of admin</i>"]

    %% System
    System["🖥️ Our System<br/><i>What it does</i>"]

    %% External Systems
    ExtAuth["🔐 Auth Provider<br/><i>OAuth 2.0</i>"]
    ExtPay["💳 Payment Gateway<br/><i>Stripe/etc</i>"]
    ExtEmail["📧 Email Service<br/><i>SendGrid/etc</i>"]

    %% Relationships
    User -->|"Uses"| System
    Admin -->|"Manages"| System
    System -->|"Authenticates via"| ExtAuth
    System -->|"Processes payments via"| ExtPay
    System -->|"Sends emails via"| ExtEmail

    %% Styling
    classDef system fill:#1168bd,stroke:#0b4884,color:#fff
    classDef external fill:#999,stroke:#666,color:#fff
    classDef person fill:#08427b,stroke:#052e56,color:#fff
    class System system
    class ExtAuth,ExtPay,ExtEmail external
    class User,Admin person
```

## Level 2: Container

```mermaid
graph TB
    subgraph boundary ["System Boundary"]
        WebApp["🌐 Web Application<br/><i>React / Next.js</i>"]
        API["⚙️ API Server<br/><i>Node.js / Express</i>"]
        Worker["🔄 Background Worker<br/><i>Bull / Agenda</i>"]
        DB[("💾 Database<br/><i>PostgreSQL</i>")]
        Cache[("⚡ Cache<br/><i>Redis</i>")]
        Queue["📬 Message Queue<br/><i>Redis / RabbitMQ</i>"]
    end

    User["👤 User"] -->|"HTTPS"| WebApp
    WebApp -->|"REST/GraphQL"| API
    API -->|"SQL"| DB
    API -->|"Read/Write"| Cache
    API -->|"Publish"| Queue
    Queue -->|"Consume"| Worker
    Worker -->|"SQL"| DB
```

## Level 3: Component

```mermaid
graph TB
    subgraph container ["API Server"]
        Router["🔀 Router<br/><i>Express Router</i>"]
        AuthMW["🔐 Auth Middleware<br/><i>JWT validation</i>"]
        Controller["📋 Controller<br/><i>Request handling</i>"]
        Validator["✅ Validator<br/><i>Input validation</i>"]
        Service["⚙️ Service<br/><i>Business logic</i>"]
        Repository["💾 Repository<br/><i>Data access</i>"]
        EventBus["📡 Event Bus<br/><i>Domain events</i>"]
    end

    Router --> AuthMW
    AuthMW --> Controller
    Controller --> Validator
    Controller --> Service
    Service --> Repository
    Service --> EventBus
    Repository --> DB[("Database")]
    EventBus --> Queue["Message Queue"]
```

## Sequence Diagram Template

```mermaid
sequenceDiagram
    actor User
    participant FE as Frontend
    participant API as API Server
    participant Auth as Auth Service
    participant DB as Database
    participant Queue as Message Queue

    User->>FE: Action
    FE->>API: POST /api/resource
    API->>Auth: Validate token
    Auth-->>API: Valid

    API->>API: Validate input
    API->>DB: INSERT INTO resource
    DB-->>API: Created

    API->>Queue: Publish event
    API-->>FE: 201 Created
    FE-->>User: Success feedback

    Note over Queue: Async processing
    Queue->>Worker: Process event
    Worker->>DB: UPDATE status
```

## Tips

1. **Keep diagrams focused** — one concept per diagram
2. **Use consistent naming** — match code namespaces
3. **Show data flow direction** — arrows point from caller to callee
4. **Label relationships** — what protocol/format
5. **Highlight the new** — mark new components vs existing

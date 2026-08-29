# C4 Model Guidelines

Справочник по C4 Model для idea2prd skills.

## Overview

C4 Model — иерархический подход к визуализации архитектуры:

```
Level 1: System Context  — Система и её окружение
Level 2: Container       — Высокоуровневые компоненты системы
Level 3: Component       — Компоненты внутри контейнера
Level 4: Code            — Классы/модули (обычно не нужен)
```

## Level 1: System Context

**Цель:** Показать систему в контексте пользователей и внешних систем.

**Что включать:**
- Основные пользователи (personas)
- Вашу систему (один блок)
- Внешние системы (интеграции)
- Связи между ними

**Mermaid Template:**

```mermaid
C4Context
    title System Context Diagram: [Product Name]
    
    Person(user, "End User", "Description of user")
    Person(admin, "Administrator", "Manages the system")
    
    System(system, "Product Name", "Brief description of what the system does")
    
    System_Ext(email, "Email Service", "Sends emails")
    System_Ext(payment, "Payment Gateway", "Processes payments")
    System_Ext(auth, "Identity Provider", "SSO authentication")
    
    Rel(user, system, "Uses", "HTTPS")
    Rel(admin, system, "Manages", "HTTPS")
    Rel(system, email, "Sends emails via", "SMTP/API")
    Rel(system, payment, "Processes payments via", "REST API")
    Rel(system, auth, "Authenticates via", "OIDC")
```

**Правила:**
- Максимум 10-15 элементов
- Показывать только ключевых пользователей
- Группировать похожие внешние системы
- Указывать протокол/формат связи

---

## Level 2: Container Diagram

**Цель:** Показать высокоуровневую структуру системы.

**Что включать:**
- Приложения (web app, mobile app, CLI)
- Сервисы (API, workers, microservices)
- Базы данных
- Очереди сообщений
- Файловые хранилища

**Mermaid Template:**

```mermaid
C4Container
    title Container Diagram: [Product Name]
    
    Person(user, "User")
    
    System_Boundary(system, "Product Name") {
        Container(spa, "Web Application", "React, TypeScript", "User interface")
        Container(mobile, "Mobile App", "React Native", "Mobile interface")
        Container(api, "API Server", "Node.js, Express", "Business logic and API")
        Container(worker, "Background Worker", "Node.js", "Async job processing")
        ContainerDb(db, "Database", "PostgreSQL", "Stores application data")
        ContainerDb(cache, "Cache", "Redis", "Session and cache storage")
        ContainerQueue(queue, "Message Queue", "Redis/RabbitMQ", "Job queue")
    }
    
    System_Ext(email, "Email Service")
    System_Ext(storage, "Cloud Storage", "S3")
    
    Rel(user, spa, "Uses", "HTTPS")
    Rel(user, mobile, "Uses", "HTTPS")
    Rel(spa, api, "Calls", "REST/JSON, HTTPS")
    Rel(mobile, api, "Calls", "REST/JSON, HTTPS")
    Rel(api, db, "Reads/Writes", "SQL, TCP")
    Rel(api, cache, "Caches", "Redis Protocol")
    Rel(api, queue, "Enqueues jobs", "Redis Protocol")
    Rel(worker, queue, "Processes jobs", "Redis Protocol")
    Rel(worker, db, "Reads/Writes", "SQL")
    Rel(api, storage, "Stores files", "S3 API")
    Rel(worker, email, "Sends via", "SMTP/API")
```

**Container Types:**

| Type | Mermaid | Example |
|------|---------|---------|
| Application | `Container` | Web app, API, Worker |
| Database | `ContainerDb` | PostgreSQL, MongoDB |
| Queue | `ContainerQueue` | RabbitMQ, Redis Queue |
| External | `System_Ext` | Third-party APIs |

**Правила:**
- Один Container = один deployable unit
- Показывать технологии
- Указывать протоколы связи
- Группировать в System_Boundary

---

## Level 3: Component Diagram

**Цель:** Показать внутреннюю структуру контейнера.

**Когда создавать:**
- Для Core bounded contexts (обязательно)
- Для сложных контейнеров
- Когда нужна детализация для разработки

**Mermaid Template:**

```mermaid
C4Component
    title Component Diagram: API Server - [Bounded Context]
    
    Container_Boundary(api, "API Server") {
        Component(ctrl, "REST Controllers", "Express Router", "HTTP request handling")
        Component(auth, "Auth Middleware", "Passport.js", "Authentication & authorization")
        Component(app, "Application Services", "TypeScript", "Use case orchestration")
        Component(domain, "Domain Model", "TypeScript", "Business logic & rules")
        Component(repo, "Repositories", "TypeScript", "Data access abstraction")
        Component(events, "Event Publisher", "TypeScript", "Domain event publishing")
    }
    
    ContainerDb(db, "Database", "PostgreSQL")
    ContainerQueue(queue, "Message Queue", "Redis")
    
    Rel(ctrl, auth, "Uses")
    Rel(ctrl, app, "Calls")
    Rel(app, domain, "Uses")
    Rel(app, repo, "Uses")
    Rel(app, events, "Publishes to")
    Rel(repo, db, "SQL")
    Rel(events, queue, "Publishes")
```

**Layered Architecture Components:**

```
┌─────────────────────────────────────────┐
│           Controllers/Routes            │  ← HTTP handling
├─────────────────────────────────────────┤
│          Application Services           │  ← Use case orchestration
├─────────────────────────────────────────┤
│             Domain Model                │  ← Business logic
├─────────────────────────────────────────┤
│        Repositories / Gateways          │  ← Data access
└─────────────────────────────────────────┘
```

**Правила:**
- Один diagram per Bounded Context
- Показывать слои архитектуры
- Указывать направление зависимостей
- Не более 15 компонентов

---

## Mapping to Bounded Contexts

**Правило:** Один Container может содержать multiple Bounded Contexts, или один Bounded Context может span multiple Containers.

**Modular Monolith:**
```
Container: API Server
├── Bounded Context: Orders
│   └── Components: OrderController, OrderService, OrderRepository
├── Bounded Context: Catalog
│   └── Components: CatalogController, CatalogService, CatalogRepository
└── Bounded Context: Identity
    └── Components: AuthController, UserService, UserRepository
```

**Microservices:**
```
Container: Order Service    → Bounded Context: Orders
Container: Catalog Service  → Bounded Context: Catalog
Container: Identity Service → Bounded Context: Identity
```

---

## Mermaid Syntax Reference

### Elements

```mermaid
%% Persons
Person(alias, "Label", "Description")
Person_Ext(alias, "Label", "Description")

%% Systems
System(alias, "Label", "Description")
System_Ext(alias, "Label", "Description")

%% Containers
Container(alias, "Label", "Technology", "Description")
ContainerDb(alias, "Label", "Technology", "Description")
ContainerQueue(alias, "Label", "Technology", "Description")

%% Components
Component(alias, "Label", "Technology", "Description")

%% Boundaries
System_Boundary(alias, "Label") { ... }
Container_Boundary(alias, "Label") { ... }

%% Relationships
Rel(from, to, "Label")
Rel(from, to, "Label", "Technology")
Rel_D(from, to, "Label")  %% Down
Rel_U(from, to, "Label")  %% Up
Rel_L(from, to, "Label")  %% Left
Rel_R(from, to, "Label")  %% Right
```

### Styling

```mermaid
%% Update styles
UpdateElementStyle(alias, $bgColor="blue", $fontColor="white")
UpdateRelStyle(from, to, $textColor="blue", $lineColor="blue")
```

---

## Best Practices

1. **Start at Level 1** — Always create System Context first
2. **Progressive Detail** — Add levels only when needed
3. **Consistent Notation** — Use same symbols throughout
4. **Show Key Relationships** — Don't include every connection
5. **Label with Technology** — Specify frameworks, protocols
6. **Version Control** — Store diagrams as code (Mermaid)
7. **Keep Updated** — Diagrams should reflect current architecture

---

## Checklist

### Level 1 (System Context)
- [ ] All user personas shown
- [ ] System clearly identified
- [ ] All external systems shown
- [ ] Relationships labeled with protocol/format
- [ ] ≤15 elements total

### Level 2 (Container)
- [ ] All containers shown (apps, DBs, queues)
- [ ] Technologies specified
- [ ] Relationships show data flow
- [ ] Grouped in System_Boundary
- [ ] Maps to deployment units

### Level 3 (Component)
- [ ] Created for Core bounded contexts
- [ ] Shows internal structure
- [ ] Layers clearly visible
- [ ] ≤15 components per diagram
- [ ] Dependencies flow downward

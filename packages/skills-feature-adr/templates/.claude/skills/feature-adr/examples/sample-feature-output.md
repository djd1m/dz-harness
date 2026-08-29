# Sample Output: M-tier Feature — "Add User Notifications"

> This example shows the expected output structure for a medium-complexity feature.

---

## Step 0: Complexity Assessment

```
Feature: Add email and in-app notifications for order status changes
```

| Dimension | Score | Reasoning |
|-----------|-------|-----------|
| Files affected | 2 (M) | ~8 files: model, service, controller, templates, tests |
| Domains touched | 2 (M) | Orders domain + Notifications domain |
| New integrations | 2 (M) | Email service (SendGrid) |
| Breaking changes | 1 (S) | No breaking changes |
| New data models | 2 (M) | Notification entity + preferences |
| Cross-cutting concerns | 1 (S) | None |

**Total: 10 → Tier M**

Active steps: 0, 1, 3, 5(light), 6, 7, 8

---

## Step 1: Requirements

```markdown
# Requirements: User Notifications

## Stakeholders
- End user: receives notifications
- Product owner: defines notification triggers
- Ops team: monitors delivery rates

## Functional Requirements

FR-1: Order status notification
  Priority: MUST
  Acceptance: Given a user with email notifications enabled,
              When their order status changes,
              Then they receive an email within 5 minutes.

FR-2: In-app notification
  Priority: MUST
  Acceptance: Given a user is logged in,
              When a notification is created,
              Then it appears in the notification bell within 10 seconds.

FR-3: Notification preferences
  Priority: SHOULD
  Acceptance: Given a user in settings,
              When they toggle notification types,
              Then only enabled types are delivered.

FR-4: Notification history
  Priority: COULD
  Acceptance: Given a user in notification center,
              When they scroll,
              Then they see paginated notification history.

## Constraints
- Must use existing SendGrid account
- Must not exceed 10K emails/day (current plan limit)
- Must follow existing event-driven architecture

## Scope
- IN: Order status emails, in-app notifications, preferences
- OUT: Push notifications (mobile), SMS, marketing emails
```

---

## Step 3: ADR

```markdown
# ADR-001: Notification Delivery Strategy

## Status
Accepted

## Context
We need to deliver notifications both via email and in-app.
The question is whether to send synchronously or asynchronously.

## Decision Drivers
- Order status changes happen in bursts (batch processing)
- Email delivery latency is acceptable within 5 minutes
- System should not slow down order processing

## Considered Options

### Option 1: Synchronous delivery
Send notification during order status update request.
- ✅ Simple implementation
- ❌ Slows down order status updates
- ❌ Email failures block the request

### Option 2: Async via existing job queue
Publish notification event, worker processes it.
- ✅ Non-blocking for order processing
- ✅ Retry on failure
- ✅ Uses existing Bull queue infrastructure
- ❌ Slight delay (acceptable per requirements)

## Decision
We chose **Option 2: Async via job queue** because it matches our existing
event-driven architecture and meets the 5-minute SLA with room to spare.

## Consequences
### Positive
- Order processing unaffected by notification delivery
- Built-in retry and dead-letter handling
### Negative
- Need to monitor queue depth for capacity planning
```

---

## Step 5: Architecture (Light)

```markdown
# Architecture: User Notifications

## Component Diagram

​```mermaid
graph TB
    subgraph "API Server"
        OrderService[OrderService]
        NotifService[NotificationService]
        NotifController[NotificationController]
        PrefsController[PreferencesController]
    end

    subgraph "Workers"
        EmailWorker[EmailNotificationWorker]
        InAppWorker[InAppNotificationWorker]
    end

    OrderService -->|"publish event"| Queue[(Bull Queue)]
    Queue -->|"consume"| EmailWorker
    Queue -->|"consume"| InAppWorker
    EmailWorker -->|"send"| SendGrid[SendGrid API]
    InAppWorker -->|"write"| DB[(Database)]
    NotifController -->|"read"| DB
    PrefsController -->|"read/write"| DB
​```

## API Endpoints
- GET /api/notifications — list user notifications (paginated)
- PATCH /api/notifications/:id/read — mark as read
- GET /api/preferences/notifications — get preferences
- PUT /api/preferences/notifications — update preferences
```

---

## Step 6: Implementation Plan

```markdown
# Implementation Plan

## Tasks

TASK-1: Create Notification model + migration
  Files: models/notification.ts, migrations/add-notifications.ts
  Depends: none
  Test: Migration runs, model validates

TASK-2: Create NotificationPreference model + migration
  Files: models/notification-preference.ts, migrations/add-notification-prefs.ts
  Depends: none
  Test: Migration runs, defaults created for existing users

TASK-3: Create NotificationService
  Files: services/notification.service.ts
  Depends: TASK-1, TASK-2
  Test: Unit tests for create/read/mark-read/filter-by-prefs

TASK-4: Create notification workers
  Files: workers/email-notification.worker.ts, workers/in-app-notification.worker.ts
  Depends: TASK-3
  Test: Worker processes event, creates notification, sends email mock

TASK-5: Add event publishing to OrderService
  Files: services/order.service.ts (modify)
  Depends: TASK-4
  Test: Order status change publishes notification event

TASK-6: Create API endpoints
  Files: controllers/notification.controller.ts, controllers/preferences.controller.ts
  Depends: TASK-3
  Test: API returns notifications, updates preferences

TASK-7: Write integration tests
  Files: tests/notifications.integration.test.ts
  Depends: TASK-4, TASK-5, TASK-6
  Test: Full flow: order change → event → worker → notification visible via API

## Parallel Groups
Group 1: TASK-1, TASK-2 (parallel)
Group 2: TASK-3 (after Group 1)
Group 3: TASK-4, TASK-5, TASK-6 (parallel, after Group 2)
Group 4: TASK-7 (after Group 3)
```

---

## Step 8: QE Report

```markdown
# QE Report: User Notifications

## Summary
- Tests: 14/14 (100%)
- Review findings: 0 🔴, 2 🟡, 1 🔵
- Requirements: 3/3 MUST passed, 1/1 SHOULD passed

## Review Findings
🟡 WARNING: NotificationService.create() doesn't validate notification type enum
🟡 WARNING: Email template uses inline styles instead of project's template engine
🔵 SUGGESTION: Consider adding index on notifications.user_id + created_at

## Acceptance Criteria
| Req | Status | Evidence |
|-----|--------|----------|
| FR-1 | ✅ PASS | Integration test: order_status_email_notification |
| FR-2 | ✅ PASS | Integration test: in_app_notification_created |
| FR-3 | ✅ PASS | Unit test: filters_by_user_preferences |
| FR-4 | ✅ PASS | API test: paginated_notification_history |

## Verdict
⚠️ CONDITIONAL APPROVAL — fix 2 warnings before merge
```

---

## Final Directory Structure

```
features/add-user-notifications/
├── 00_complexity_assessment.md
├── 01_requirements.md
├── 03_adr/
│   └── 001-notification-delivery-strategy.md
├── 05_architecture.md
├── 06_implementation_plan.md
├── 07_code_changes/
│   └── change_manifest.md
├── 08_qe_report.md
├── diagrams/
│   └── architecture-c4.mermaid
└── README.md
```

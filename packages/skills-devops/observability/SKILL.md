---
name: "observability"
description: "Designs observability stacks — metrics, logs, traces, dashboards, alerting, and SLO/SLI definitions."
trust_tier: 2
trust_tier_label: "Validated"
validation:
  schema_path: schemas/output.json
  validator_path: scripts/validate-config.json
---

# observability

Design and implement a production-grade observability stack covering the three pillars (metrics, logs, traces), dashboards, alerting, SLOs, on-call integration, and cost optimization. Every step produces a concrete artifact: a configuration file, a dashboard definition, an alert rule, or an SLO specification. The goal is to give operators the visibility they need to detect, diagnose, and resolve issues before users notice.

## When to use

- Setting up monitoring for a new service or microservice architecture
- Migrating from ad-hoc logging to structured observability
- Designing SLOs and error budgets for reliability targets
- Building Grafana dashboards for a service or platform team
- Implementing distributed tracing across microservices
- Reducing alert fatigue by rationalizing alert rules
- Choosing between observability vendors (Datadog vs. Grafana stack vs. New Relic)
- Adding OpenTelemetry instrumentation to an existing codebase

## When NOT to use

- Responding to an active production incident (use the incident-response skill)
- Debugging a specific application bug (use the debugging skill)
- Setting up CI/CD pipeline monitoring (use the github-actions or ci-fix skill)
- Performing a security audit of logging infrastructure (use the security-audit skill)

## Procedure

### Step 1: Three Pillars Assessment

Evaluate the current state and choose the right tool for each pillar. Not every system needs all three from day one — start with what gives the most signal for the least effort.

**Pillar comparison:**

| Pillar | Purpose | Best tools | When to prioritize |
|--------|---------|------------|-------------------|
| Metrics | Numeric time-series data: counters, gauges, histograms | Prometheus, Datadog, CloudWatch, InfluxDB | Always first — cheapest signal, fastest to query |
| Logs | Discrete events with context, human-readable or structured | ELK (Elasticsearch/Logstash/Kibana), Grafana Loki, Splunk, CloudWatch Logs | When metrics show a problem but not the cause |
| Traces | Request-scoped DAGs across service boundaries | Jaeger, Grafana Tempo, AWS X-Ray, Honeycomb | Microservices with >3 services in a request path |

**Decision matrix for tool selection:**

| Factor | Prometheus + Grafana + Loki + Tempo | Datadog | AWS CloudWatch + X-Ray |
|--------|--------------------------------------|---------|------------------------|
| Cost model | Infrastructure (self-hosted) or usage (Grafana Cloud) | Per host + per metric + per log GB | Per metric, per log GB, per trace |
| Best for | Teams that want control, open-source ecosystems | Teams that want managed SaaS, fast setup | AWS-native workloads, small teams |
| Scaling | Thanos/Cortex for HA, needs ops investment | Managed by vendor | Managed by AWS |
| Lock-in risk | Low (open standards, PromQL, OTLP) | Medium (proprietary agents, query language) | High (AWS-specific APIs) |
| Setup effort | Medium-High | Low | Low-Medium |

**Assessment checklist:**

```
Current metrics collection:     [none / basic / comprehensive]
Current logging approach:       [unstructured / semi-structured / structured JSON]
Current tracing:                [none / manual / OpenTelemetry / vendor SDK]
Number of services:             [1-5 / 5-20 / 20+]
Primary infrastructure:         [Kubernetes / ECS / Lambda / VMs / hybrid]
Budget preference:              [self-hosted / managed / hybrid]
Team ops maturity:              [low / medium / high]
```

### Step 2: Instrumentation

Instrument services using OpenTelemetry (OTel) as the vendor-neutral standard. OTel provides a single SDK that emits metrics, logs, and traces to any backend.

**OpenTelemetry setup (Node.js example):**

```typescript
// tracing.ts — load before any other imports
import { NodeSDK } from '@opentelemetry/sdk-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-http';
import { PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { Resource } from '@opentelemetry/resources';
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from '@opentelemetry/semantic-conventions';

const sdk = new NodeSDK({
  resource: new Resource({
    [ATTR_SERVICE_NAME]: 'payment-service',
    [ATTR_SERVICE_VERSION]: '1.4.2',
    'deployment.environment': process.env.NODE_ENV ?? 'development',
  }),
  traceExporter: new OTLPTraceExporter({
    url: process.env.OTEL_EXPORTER_OTLP_ENDPOINT ?? 'http://otel-collector:4318/v1/traces',
  }),
  metricReader: new PeriodicExportingMetricReader({
    exporter: new OTLPMetricExporter({
      url: process.env.OTEL_EXPORTER_OTLP_ENDPOINT ?? 'http://otel-collector:4318/v1/metrics',
    }),
    exportIntervalMillis: 15000,
  }),
  instrumentations: [getNodeAutoInstrumentations()],
});

sdk.start();
process.on('SIGTERM', () => sdk.shutdown());
```

**Custom span example:**

```typescript
import { trace, SpanStatusCode } from '@opentelemetry/api';

const tracer = trace.getTracer('payment-service');

async function processPayment(orderId: string, amount: number) {
  return tracer.startActiveSpan('processPayment', async (span) => {
    span.setAttributes({
      'payment.order_id': orderId,
      'payment.amount': amount,
      'payment.currency': 'USD',
    });
    try {
      const result = await chargeCard(orderId, amount);
      span.setStatus({ code: SpanStatusCode.OK });
      return result;
    } catch (error) {
      span.setStatus({ code: SpanStatusCode.ERROR, message: error.message });
      span.recordException(error);
      throw error;
    } finally {
      span.end();
    }
  });
}
```

**Context propagation:**

Ensure trace context (W3C Trace Context headers) is propagated across HTTP calls, message queues, and async boundaries. OTel auto-instrumentation handles HTTP automatically. For message queues, inject context into message headers:

```typescript
import { context, propagation } from '@opentelemetry/api';

// Producer: inject context into message headers
const headers: Record<string, string> = {};
propagation.inject(context.active(), headers);
await queue.publish({ body: payload, headers });

// Consumer: extract context from message headers
const extractedContext = propagation.extract(context.active(), message.headers);
context.with(extractedContext, () => {
  // This span will be a child of the producer's span
  tracer.startActiveSpan('processMessage', (span) => { /* ... */ });
});
```

### Step 3: Metrics Design

Design metrics using established methodologies. Every service should expose a baseline set of metrics; add domain-specific metrics on top.

**RED method (for request-driven services):**

| Metric | What it measures | Prometheus example |
|--------|-----------------|-------------------|
| Rate | Requests per second | `rate(http_requests_total[5m])` |
| Errors | Failed requests per second | `rate(http_requests_total{status=~"5.."}[5m])` |
| Duration | Latency distribution | `histogram_quantile(0.99, rate(http_request_duration_seconds_bucket[5m]))` |

**USE method (for infrastructure resources):**

| Metric | What it measures | Prometheus example |
|--------|-----------------|-------------------|
| Utilization | % time resource is busy | `rate(node_cpu_seconds_total{mode!="idle"}[5m])` |
| Saturation | Queue depth / backlog | `node_load1` or `container_cpu_cfs_throttled_seconds_total` |
| Errors | Error events on the resource | `rate(node_disk_io_time_weighted_seconds_total[5m])` |

**Custom business metrics:**

```typescript
import { metrics } from '@opentelemetry/api';

const meter = metrics.getMeter('payment-service');

// Counter: total payments processed
const paymentsProcessed = meter.createCounter('payments.processed', {
  description: 'Total payments processed',
  unit: '1',
});

// Histogram: payment amount distribution
const paymentAmount = meter.createHistogram('payments.amount', {
  description: 'Payment amount in USD',
  unit: 'USD',
});

// UpDownCounter: active payment sessions
const activeSessions = meter.createUpDownCounter('payments.active_sessions', {
  description: 'Number of active payment sessions',
  unit: '1',
});

// Usage
paymentsProcessed.add(1, { 'payment.method': 'credit_card', 'payment.status': 'success' });
paymentAmount.record(149.99, { 'payment.currency': 'USD' });
activeSessions.add(1);
```

**Naming conventions (Prometheus style):**

- Use `snake_case` with unit suffix: `http_request_duration_seconds`, `payment_amount_usd`
- Counters end with `_total`: `http_requests_total`, `payments_processed_total`
- Use labels for dimensions, not metric names: `http_requests_total{method="POST", path="/api/pay"}` not `http_post_api_pay_requests_total`
- Keep cardinality under control: never use user IDs, request IDs, or unbounded values as label values

### Step 4: Structured Logging

Switch from unstructured text logs to structured JSON logs. Every log entry should be machine-parseable and carry enough context to correlate with traces and metrics.

**Structured log format:**

```json
{
  "timestamp": "2026-06-03T14:23:45.123Z",
  "level": "error",
  "message": "Payment charge failed",
  "service": "payment-service",
  "version": "1.4.2",
  "environment": "production",
  "trace_id": "abc123def456",
  "span_id": "789ghi012",
  "correlation_id": "req-550e8400",
  "user_id": "usr_12345",
  "order_id": "ord_67890",
  "error": {
    "type": "PaymentGatewayTimeout",
    "message": "Stripe API timed out after 30000ms",
    "stack": "PaymentGatewayTimeout: Stripe API timed out..."
  },
  "duration_ms": 30012,
  "http": {
    "method": "POST",
    "path": "/api/v2/payments",
    "status_code": 504
  }
}
```

**Log levels and when to use each:**

| Level | When | Example |
|-------|------|---------|
| `fatal` | Application cannot continue | Database connection pool exhausted, cannot recover |
| `error` | Operation failed, needs attention | Payment charge failed, API returned 500 |
| `warn` | Degraded but functional, may become error | Connection pool at 80%, retry succeeded after 2 attempts |
| `info` | Normal significant events | Server started, payment processed, user logged in |
| `debug` | Detailed diagnostic info (off in production usually) | SQL query executed, cache hit/miss, request payload |

**Sensitive data redaction:**

Never log PII, credentials, or payment data. Implement redaction at the logger level:

```typescript
const REDACT_PATTERNS = [
  { key: /password|secret|token|api_key|authorization/i, replacement: '[REDACTED]' },
  { key: /credit_card|card_number|cvv|ssn/i, replacement: '[REDACTED]' },
  { key: /email/i, replacement: (v: string) => v.replace(/(.{2}).*(@.*)/, '$1***$2') },
];

function redact(obj: Record<string, unknown>): Record<string, unknown> {
  const result = { ...obj };
  for (const [key, value] of Object.entries(result)) {
    for (const pattern of REDACT_PATTERNS) {
      if (pattern.key.test(key)) {
        result[key] = typeof pattern.replacement === 'function'
          ? pattern.replacement(String(value))
          : pattern.replacement;
      }
    }
    if (typeof value === 'object' && value !== null) {
      result[key] = redact(value as Record<string, unknown>);
    }
  }
  return result;
}
```

**Correlation IDs:**

Every incoming request should get a correlation ID. If one arrives in headers (`X-Correlation-ID`, `X-Request-ID`), use it. Otherwise generate one. Pass it downstream in all HTTP calls and message queue headers.

```typescript
import { randomUUID } from 'node:crypto';

function correlationMiddleware(req, res, next) {
  req.correlationId = req.headers['x-correlation-id'] ?? randomUUID();
  res.setHeader('X-Correlation-ID', req.correlationId);
  next();
}
```

### Step 5: Distributed Tracing

Configure end-to-end tracing across service boundaries. Traces show the full journey of a request through your system.

**Trace context propagation chain:**

```
Client -> API Gateway -> Auth Service -> Payment Service -> Stripe API
  |            |              |               |               |
  trace_id: abc123 (same across all services)
  span_id:  001      002          003             004           005
  parent:   null     001          002             003           004
```

**Span attributes best practices:**

| Category | Attributes | Example values |
|----------|-----------|----------------|
| HTTP | `http.method`, `http.route`, `http.status_code` | `POST`, `/api/payments/:id`, `201` |
| Database | `db.system`, `db.statement`, `db.operation` | `postgresql`, `SELECT * FROM orders`, `SELECT` |
| Messaging | `messaging.system`, `messaging.operation` | `rabbitmq`, `publish` |
| Business | `payment.amount`, `order.item_count` | `149.99`, `3` |

**Sampling strategies:**

| Strategy | Description | Use when |
|----------|------------|----------|
| Always On | Sample 100% of traces | Development, low-traffic services |
| Probabilistic | Sample N% of traces | High-traffic services (1-10% typical) |
| Rate-limiting | Max N traces per second | Predictable cost control |
| Tail-based | Decide after trace completes (keep errors, slow) | Need all error traces, budget-conscious |
| Parent-based | Inherit parent's sampling decision | Consistent sampling across services |

**OTel Collector configuration for tail-based sampling:**

```yaml
# otel-collector-config.yaml
receivers:
  otlp:
    protocols:
      grpc:
        endpoint: 0.0.0.0:4317
      http:
        endpoint: 0.0.0.0:4318

processors:
  tail_sampling:
    decision_wait: 10s
    policies:
      - name: errors
        type: status_code
        status_code: { status_codes: [ERROR] }
      - name: slow-requests
        type: latency
        latency: { threshold_ms: 2000 }
      - name: probabilistic
        type: probabilistic
        probabilistic: { sampling_percentage: 10 }

  batch:
    send_batch_size: 1024
    timeout: 5s

exporters:
  otlp/tempo:
    endpoint: tempo:4317
    tls:
      insecure: true
  otlp/prometheus:
    endpoint: prometheus:9090

service:
  pipelines:
    traces:
      receivers: [otlp]
      processors: [tail_sampling, batch]
      exporters: [otlp/tempo]
    metrics:
      receivers: [otlp]
      processors: [batch]
      exporters: [otlp/prometheus]
```

**Trace-to-log correlation:**

Include `trace_id` and `span_id` in every log entry. In Grafana, configure a data link from Loki to Tempo using the trace ID:

```yaml
# Grafana Loki datasource provisioning
datasources:
  - name: Loki
    type: loki
    url: http://loki:3100
    jsonData:
      derivedFields:
        - datasourceUid: tempo-uid
          matcherRegex: '"trace_id":"(\\w+)"'
          name: TraceID
          url: '$${__value.raw}'
```

### Step 6: Dashboards

Build dashboards that answer the question "Is the system healthy?" within 5 seconds of looking at them.

**Four Golden Signals dashboard (per service):**

| Signal | Panel type | PromQL | Threshold |
|--------|-----------|--------|-----------|
| Latency | Heatmap + stat | `histogram_quantile(0.99, rate(http_request_duration_seconds_bucket{service="$service"}[5m]))` | p99 < 500ms |
| Traffic | Time series | `sum(rate(http_requests_total{service="$service"}[5m]))` | Baseline +/- 30% |
| Errors | Time series + stat | `sum(rate(http_requests_total{service="$service", status=~"5.."}[5m])) / sum(rate(http_requests_total{service="$service"}[5m]))` | < 0.1% |
| Saturation | Gauge | `container_memory_working_set_bytes / container_spec_memory_limit_bytes` | < 80% |

**Dashboard layout principles:**

1. **Top row:** Service health summary — green/red status, current error rate, p99 latency, request rate
2. **Second row:** Golden signals — 4 panels showing the signals above as time series
3. **Third row:** Dependencies — downstream service health, database connections, queue depth
4. **Fourth row:** Infrastructure — CPU, memory, disk, network for the service's pods/instances
5. **Bottom row:** Recent deploys overlay — mark deploy events on the timeline

**Dashboard hygiene rules:**

- One service = one dashboard. Do not mix services on a single dashboard
- Use template variables (`$service`, `$namespace`, `$environment`) for reusability
- Set sensible time range defaults (last 6 hours for operational, last 7 days for trends)
- Add annotations for deploy events: `ANNOTATIONS(deploy_events{service="$service"})`
- Link to runbooks from panel descriptions

**Now WRITE the dashboard. This step is not finished by describing one.**

Every other step in this skill emits a runnable artifact; before 2026-08-20 this one emitted only
the table and the principles above, and the output schema asked for a `panels_count` integer — so a
run could claim six panels with zero built, and the validator agreed. It no longer does.

Write a real dashboard file and record its PATH:

```json
{
  "title": "Payments — golden signals",
  "schemaVersion": 41,
  "templating": { "list": [ { "name": "service", "type": "query", "datasource": "${DS_PROM}" } ] },
  "panels": [
    { "id": 1, "type": "timeseries", "title": "Latency p99",
      "gridPos": { "h": 8, "w": 12, "x": 0, "y": 0 },
      "fieldConfig": { "defaults": { "unit": "s" } },
      "datasource": "${DS_PROM}",
      "targets": [ { "expr": "histogram_quantile(0.99, sum by (le) (rate(http_request_duration_seconds_bucket{service=\"$service\"}[5m])))" } ] }
  ]
}
```

Three things in that skeleton are not decoration:

- **`"datasource": "${DS_PROM}"`** — a template variable, never a literal uid. A dashboard exported
  with a hardcoded uid renders nothing in any other Grafana.
- **`"unit": "s"`** — the metric name ends in `_seconds`, so the panel unit must be seconds. A
  seconds metric displayed as milliseconds is silently wrong by a factor of 1000.
- **`sum by (le)` inside `histogram_quantile`** — the `le` label is required. And never average a
  precomputed quantile across instances: `avg(...{quantile="0.99"})` is not a p99 of anything, it is
  arithmetically meaningless.

Then report it and let the gate open it:

```json
"dashboards_defined": [
  { "name": "Payments — golden signals", "type": "golden_signals",
    "file": "dashboards/payments.json", "panels_count": 6 }
]
```

```bash
node scripts/check-dashboards.mjs <output.json> --root <repo>
# 0 PASS · 1 FAIL · 3 NOT-ESTABLISHED — and NOT-ESTABLISHED is never a pass
```

**What that gate does and does not prove**, stated here so the promise cannot quietly grow: it opens
every `file`, requires valid JSON with a non-empty `panels` array, and cross-checks `panels_count`
against the real length. It does **not** prove the queries are right, that the metrics are ever
emitted, or that a panel would render anything — that needs the live datasource, and no green run of
this gate may be read as saying otherwise.

### Step 7: Alerting

Design alerts that are actionable, routed to the right person, and do not cause fatigue.

**Alert severity mapping:**

| Severity | Meaning | Notification | Response time | Example |
|----------|---------|-------------|---------------|---------|
| P1 — Critical | Service down, SLO breached, data at risk | Page on-call immediately | 5 minutes | Error rate > 10% for 5 min |
| P2 — High | Significant degradation, approaching SLO breach | Page on-call during business hours, Slack always | 30 minutes | p99 latency > 2s for 15 min |
| P3 — Medium | Performance degradation, non-critical issue | Slack channel, ticket auto-created | Next business day | Disk usage > 80% |
| P4 — Low | Informational, capacity planning | Weekly digest email | Sprint planning | Certificate expires in 30 days |

**Alert rule template (Prometheus/Alertmanager):**

```yaml
groups:
  - name: payment-service
    rules:
      - alert: HighErrorRate
        expr: |
          sum(rate(http_requests_total{service="payment-service", status=~"5.."}[5m]))
          /
          sum(rate(http_requests_total{service="payment-service"}[5m]))
          > 0.05
        for: 5m
        labels:
          severity: critical
          team: payments
        annotations:
          summary: "Payment service error rate above 5%"
          description: "Error rate is {{ $value | humanizePercentage }} over the last 5 minutes."
          runbook: "https://wiki.internal/runbooks/payment-high-error-rate"
          dashboard: "https://grafana.internal/d/payments/payment-service"

      - alert: HighLatency
        expr: |
          histogram_quantile(0.99,
            rate(http_request_duration_seconds_bucket{service="payment-service"}[5m])
          ) > 2.0
        for: 10m
        labels:
          severity: warning
          team: payments
        annotations:
          summary: "Payment service p99 latency above 2 seconds"
          runbook: "https://wiki.internal/runbooks/payment-high-latency"
```

**Alert fatigue prevention:**

| Technique | Description |
|-----------|-------------|
| Alert on symptoms, not causes | Alert on "error rate > 5%" not "CPU > 90%" (CPU might be fine at 90%) |
| Use `for` duration | Require condition to persist (5m, 10m) before firing — avoids transient spikes |
| Group related alerts | Alertmanager `group_by` to collapse 50 pod alerts into 1 service alert |
| Inhibition rules | If the database is down, inhibit all downstream service alerts |
| Routing by severity | P1 = PagerDuty page, P3 = Slack only, P4 = email digest |
| Regular alert review | Monthly review: delete alerts nobody acted on, tune thresholds |

**Alertmanager routing example:**

```yaml
route:
  receiver: slack-default
  group_by: [alertname, service]
  group_wait: 30s
  group_interval: 5m
  repeat_interval: 4h
  routes:
    - match:
        severity: critical
      receiver: pagerduty-oncall
      repeat_interval: 15m
    - match:
        severity: warning
      receiver: slack-warnings
      repeat_interval: 2h
    - match:
        severity: info
      receiver: slack-info
      repeat_interval: 12h

inhibit_rules:
  - source_match:
      severity: critical
      alertname: DatabaseDown
    target_match:
      severity: warning
    equal: [environment]
```

### Step 8: SLOs and SLIs

Define service level objectives that align engineering effort with user experience.

**SLI/SLO/SLA hierarchy:**

| Concept | Definition | Owner | Example |
|---------|-----------|-------|---------|
| SLI (Indicator) | Measured metric | Engineering | "Proportion of requests completing in < 300ms" |
| SLO (Objective) | Target for the SLI | Engineering + Product | "99.9% of requests complete in < 300ms over 30 days" |
| SLA (Agreement) | Contractual promise with consequences | Business | "99.5% uptime or credits issued" |

**Common SLO definitions:**

```yaml
# slo-definitions.yaml
slos:
  - name: payment-availability
    description: "Payment API returns non-5xx responses"
    sli:
      type: availability
      good_events: 'http_requests_total{service="payment-service", status!~"5.."}'
      total_events: 'http_requests_total{service="payment-service"}'
    objective: 99.95
    window: 30d
    error_budget: 0.05%  # ~21.6 minutes of downtime per 30 days

  - name: payment-latency
    description: "Payment API p99 latency under 500ms"
    sli:
      type: latency
      good_events: 'http_request_duration_seconds_bucket{service="payment-service", le="0.5"}'
      total_events: 'http_request_duration_seconds_count{service="payment-service"}'
    objective: 99.0
    window: 30d

  - name: checkout-success
    description: "End-to-end checkout completes successfully"
    sli:
      type: quality
      good_events: 'checkout_completed_total{status="success"}'
      total_events: 'checkout_completed_total'
    objective: 99.5
    window: 7d
```

**Error budget and burn rate alerts:**

The error budget is the amount of unreliability you are allowed. Burn rate alerts fire when you are consuming the budget too fast.

| Burn rate | Meaning | Alert | Window |
|-----------|---------|-------|--------|
| 14.4x | Budget exhausted in 1 hour | Page immediately (P1) | 5m short, 1h long |
| 6x | Budget exhausted in 5 hours | Page (P1) | 30m short, 6h long |
| 1x | Budget exhausted on schedule | Ticket (P3) | 6h short, 3d long |
| 0.5x | Under budget | No alert | — |

**Burn rate alert rule (multi-window):**

```yaml
- alert: PaymentSLOBudgetBurning
  expr: |
    (
      sum(rate(http_requests_total{service="payment-service", status=~"5.."}[1h]))
      /
      sum(rate(http_requests_total{service="payment-service"}[1h]))
    ) > (14.4 * 0.0005)
    and
    (
      sum(rate(http_requests_total{service="payment-service", status=~"5.."}[5m]))
      /
      sum(rate(http_requests_total{service="payment-service"}[5m]))
    ) > (14.4 * 0.0005)
  labels:
    severity: critical
  annotations:
    summary: "Payment SLO error budget burning at 14.4x — will exhaust in ~1 hour"
```

### Step 9: On-Call Integration

Connect your observability stack to on-call rotation and incident management.

**PagerDuty integration with Alertmanager:**

```yaml
receivers:
  - name: pagerduty-oncall
    pagerduty_configs:
      - routing_key: '<pagerduty-integration-key>'
        severity: '{{ if eq .CommonLabels.severity "critical" }}critical{{ else }}warning{{ end }}'
        description: '{{ .CommonAnnotations.summary }}'
        details:
          service: '{{ .CommonLabels.service }}'
          environment: '{{ .CommonLabels.environment }}'
          runbook: '{{ .CommonAnnotations.runbook }}'
          dashboard: '{{ .CommonAnnotations.dashboard }}'
        links:
          - href: '{{ .CommonAnnotations.dashboard }}'
            text: 'Grafana Dashboard'
          - href: '{{ .CommonAnnotations.runbook }}'
            text: 'Runbook'
```

**OpsGenie integration:**

```yaml
receivers:
  - name: opsgenie-oncall
    opsgenie_configs:
      - api_key: '<opsgenie-api-key>'
        message: '{{ .CommonAnnotations.summary }}'
        priority: '{{ if eq .CommonLabels.severity "critical" }}P1{{ else if eq .CommonLabels.severity "warning" }}P2{{ else }}P3{{ end }}'
        tags: '{{ .CommonLabels.service }},{{ .CommonLabels.environment }}'
```

**On-call rotation best practices:**

| Practice | Why | Implementation |
|----------|-----|----------------|
| 1-week rotations | Long enough to build context, short enough to avoid burnout | PagerDuty schedule, rotate on Tuesday (not Friday) |
| Primary + secondary | Backup if primary is unreachable | PagerDuty escalation policy, 5-min escalation |
| Follow-the-sun | No one wakes up at 3 AM | Regional rotations in PagerDuty, Slack handoff |
| Handoff document | Outgoing on-call briefs incoming | Template: open incidents, noisy alerts, upcoming deploys |
| On-call compensation | People should be compensated for availability | Per-shift stipend or comp time off |
| Shadow rotation | New team members learn before going solo | Shadow on-call for 1-2 rotations before primary |

**Incident channel automation (Slack bot):**

When a P1/P2 alert fires, automatically:
1. Create a Slack channel: `#inc-YYYY-MM-DD-<short-slug>`
2. Invite the on-call engineer and IC rotation
3. Post the alert details, dashboard link, and runbook link
4. Start a timeline thread

### Step 10: Cost Optimization

Observability costs grow with traffic. Design for sustainability from day one.

**Cost drivers and mitigation:**

| Cost driver | Mitigation strategy |
|------------|---------------------|
| Log volume | Structured logging (smaller than unstructured), log levels (reduce debug in prod), sampling verbose endpoints |
| Metric cardinality | Cap label values (no user IDs as labels), drop unused metrics at collector, use recording rules for expensive queries |
| Trace storage | Tail-based sampling (keep errors + slow, sample healthy), reduce span attributes to essentials |
| Retention period | Hot/warm/cold tiers: 7 days hot (fast SSD), 30 days warm (standard), 1 year cold (object storage) |
| Dashboard queries | Pre-compute expensive queries as recording rules, avoid `rate()` over large time ranges in dashboards |

**Retention policy example:**

```yaml
# Metrics retention
prometheus:
  retention: 15d            # Local hot storage
thanos:
  compact:
    retention:
      resolution_raw: 30d   # Full resolution
      resolution_5m: 90d    # 5-minute downsampled
      resolution_1h: 365d   # 1-hour downsampled

# Logs retention
loki:
  limits_config:
    retention_period: 30d
  schema_config:
    configs:
      - from: 2026-01-01
        store: tsdb
        object_store: s3
        schema: v13
        index:
          prefix: index_
          period: 24h

# Traces retention
tempo:
  compactor:
    compaction:
      block_retention: 14d  # Keep traces for 14 days
```

**Recording rules for expensive queries:**

```yaml
groups:
  - name: service_sli_recording
    interval: 30s
    rules:
      - record: service:http_requests:rate5m
        expr: sum by (service) (rate(http_requests_total[5m]))
      - record: service:http_errors:rate5m
        expr: sum by (service) (rate(http_requests_total{status=~"5.."}[5m]))
      - record: service:http_error_ratio:rate5m
        expr: service:http_errors:rate5m / service:http_requests:rate5m
      - record: service:http_latency_p99:5m
        expr: histogram_quantile(0.99, sum by (service, le) (rate(http_request_duration_seconds_bucket[5m])))
```

## Anti-patterns

| Anti-pattern | Why it hurts | What to do instead |
|-------------|-------------|-------------------|
| No correlation IDs | Cannot trace a request across services; debugging becomes guesswork | Generate a correlation ID at the edge and propagate it everywhere |
| Alert fatigue | On-call ignores alerts, real incidents get missed | Alert on symptoms not causes, use `for` durations, review alerts monthly |
| Dashboard sprawl | 200 dashboards, nobody knows which one to look at | One service = one dashboard, enforce naming conventions, archive unused |
| Logging PII | Compliance violations (GDPR, HIPAA), security risk if logs are breached | Redact at the logger level, audit log pipelines, never log passwords or tokens |
| No SLOs defined | No shared definition of "good enough," engineering and product disagree on priorities | Define SLOs with product, publish error budgets, use burn rate alerts |
| Metrics with unbounded cardinality | Prometheus OOM, Datadog bill explodes, queries time out | Never use user IDs, request IDs, or URLs as label values |
| Sampling zero percent of traces | No traces at all; distributed debugging is impossible | Start with 100% in dev, 1-10% probabilistic in prod, always keep errors |

## Self-check

Before signing off on an observability design, verify:

- [ ] Are all three pillars (metrics, logs, traces) addressed with specific tools chosen?
- [ ] Is OpenTelemetry (or equivalent) configured for auto-instrumentation and custom spans?
- [ ] Do metrics follow a naming convention (RED for services, USE for infra)?
- [ ] Are logs structured (JSON), with correlation IDs, and PII redacted?
- [ ] Is trace context propagated across all service boundaries (HTTP, queues)?
- [ ] Does a Golden Signals dashboard exist for every user-facing service?
- [ ] Are alert rules mapped to severities (P1-P4) with routing and runbook links?
- [ ] Are SLOs defined for the most critical user journeys with error budgets?
- [ ] Is on-call rotation configured with escalation policies and handoff docs?
- [ ] Are retention policies set for metrics, logs, and traces with tiered storage?
- [ ] Is metric cardinality bounded (no unbounded label values)?
- [ ] Has the cost model been estimated for the chosen observability stack?

## Examples

**In scope:**
- "Design an observability stack for our 12-microservice Kubernetes platform" -- full 10-step procedure
- "Add OpenTelemetry tracing to our Node.js payment service" -- focus on Steps 2 and 5
- "Define SLOs for our checkout flow" -- focus on Step 8
- "Our on-call team is drowning in alerts, help reduce alert fatigue" -- focus on Step 7
- "Set up Grafana dashboards for our API gateway" -- focus on Step 6
- "We are spending $15k/month on Datadog, help optimize" -- focus on Step 10

**Out of scope:**
- "Our API is returning 500 errors right now" -- use the incident-response skill
- "Set up a CI/CD pipeline" -- use the github-actions skill
- "Audit our logging for security compliance" -- use the security-audit skill
- "Debug why this function is slow" -- use the debugging skill

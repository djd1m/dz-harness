# Completion Checklist Template

Reference файл для Phase 6: Completion Checklist.
Используется для генерации deployment-ready документации.

---

## Template Structure

```markdown
# Completion Checklist: {ProductName}

## 1. Development Environment Setup

### Required Tools
- [ ] Runtime: {runtime} (e.g., Node.js v20+, Python 3.11+)
- [ ] Container: Docker & Docker Compose
- [ ] Database: {database} (or Docker container)
- [ ] Cache: {cache} (if applicable)
- [ ] Message Queue: {queue} (if applicable)

### Local Setup Commands
\`\`\`bash
# Clone and install
git clone {repo-url}
cd {project-name}
{install-command}

# Environment setup
cp .env.example .env
# Edit .env with local credentials

# Database setup
{db-setup-commands}

# Run locally
{run-command}
\`\`\`

### Environment Variables
| Variable | Description | Example |
|----------|-------------|---------|
| DATABASE_URL | Database connection | postgresql://... |
| JWT_SECRET | JWT signing key | random-string |
| ... | ... | ... |

---

## 2. CI/CD Pipeline

### GitHub Actions Template
\`\`\`yaml
name: CI/CD Pipeline

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]

env:
  REGISTRY: {registry}
  IMAGE_NAME: {image-name}

jobs:
  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Setup {runtime}
        uses: {setup-action}
      - run: {lint-command}

  test:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:15
        env:
          POSTGRES_PASSWORD: test
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
    steps:
      - uses: actions/checkout@v4
      - name: Setup {runtime}
        uses: {setup-action}
      - run: {install-command}
      - run: {test-command}
        env:
          DATABASE_URL: postgresql://postgres:test@localhost:5432/test
      
  build:
    needs: [lint, test]
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Build Docker image
        run: |
          docker build -t $REGISTRY/$IMAGE_NAME:${{ github.sha }} .
          docker tag $REGISTRY/$IMAGE_NAME:${{ github.sha }} $REGISTRY/$IMAGE_NAME:latest

  deploy-staging:
    needs: build
    if: github.ref == 'refs/heads/develop'
    runs-on: ubuntu-latest
    environment: staging
    steps:
      - name: Deploy to staging
        run: |
          # Platform-specific deploy command

  deploy-production:
    needs: build
    if: github.ref == 'refs/heads/main'
    runs-on: ubuntu-latest
    environment: production
    steps:
      - name: Deploy to production
        run: |
          # Platform-specific deploy command
\`\`\`

---

## 3. Infrastructure

### Docker Compose (Development)
\`\`\`yaml
version: '3.8'

services:
  app:
    build: .
    ports:
      - "{port}:{port}"
    environment:
      - NODE_ENV=development
      - DATABASE_URL=postgresql://user:pass@postgres:5432/db
    depends_on:
      - postgres
    volumes:
      - .:/app
      - /app/node_modules

  postgres:
    image: postgres:15
    environment:
      POSTGRES_USER: user
      POSTGRES_PASSWORD: pass
      POSTGRES_DB: db
    volumes:
      - postgres_data:/var/lib/postgresql/data
    ports:
      - "5432:5432"

  # Add if needed: redis, rabbitmq, etc.

volumes:
  postgres_data:
\`\`\`

### Dockerfile
\`\`\`dockerfile
# Build stage
FROM {base-image} AS builder
WORKDIR /app
COPY {dependency-files} .
RUN {install-command}
COPY . .
RUN {build-command}

# Production stage
FROM {prod-image}
WORKDIR /app
COPY --from=builder /app/{build-output} .
EXPOSE {port}
CMD [{start-command}]
\`\`\`

### Kubernetes Manifests (Production)

#### deployment.yaml
\`\`\`yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: {app-name}
spec:
  replicas: 3
  selector:
    matchLabels:
      app: {app-name}
  template:
    metadata:
      labels:
        app: {app-name}
    spec:
      containers:
      - name: {app-name}
        image: {registry}/{image}:latest
        ports:
        - containerPort: {port}
        env:
        - name: DATABASE_URL
          valueFrom:
            secretKeyRef:
              name: {app-name}-secrets
              key: database-url
        resources:
          requests:
            memory: "256Mi"
            cpu: "250m"
          limits:
            memory: "512Mi"
            cpu: "500m"
        livenessProbe:
          httpGet:
            path: /health
            port: {port}
          initialDelaySeconds: 30
          periodSeconds: 10
        readinessProbe:
          httpGet:
            path: /ready
            port: {port}
          initialDelaySeconds: 5
          periodSeconds: 5
\`\`\`

#### service.yaml
\`\`\`yaml
apiVersion: v1
kind: Service
metadata:
  name: {app-name}
spec:
  selector:
    app: {app-name}
  ports:
  - port: 80
    targetPort: {port}
  type: ClusterIP
\`\`\`

#### hpa.yaml
\`\`\`yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: {app-name}
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: {app-name}
  minReplicas: 2
  maxReplicas: 10
  metrics:
  - type: Resource
    resource:
      name: cpu
      target:
        type: Utilization
        averageUtilization: 70
\`\`\`

---

## 4. Monitoring & Observability

### Logging Configuration
\`\`\`json
{
  "level": "info",
  "format": "json",
  "fields": {
    "service": "{app-name}",
    "version": "{version}",
    "environment": "{env}"
  },
  "redact": ["password", "token", "secret", "authorization"]
}
\`\`\`

### Prometheus Metrics
\`\`\`
# Application metrics to expose:

# HTTP
http_requests_total{method, path, status}
http_request_duration_seconds{method, path}
http_request_size_bytes{method, path}
http_response_size_bytes{method, path}

# Database
db_query_duration_seconds{query_type, table}
db_connections_active
db_connections_idle

# Business
{domain}_events_total{event_type}
{domain}_operations_total{operation, status}
{domain}_processing_duration_seconds{operation}
\`\`\`

### OpenTelemetry Setup
\`\`\`javascript
// Example: Node.js OTEL setup
const { NodeSDK } = require('@opentelemetry/sdk-node');
const { getNodeAutoInstrumentations } = require('@opentelemetry/auto-instrumentations-node');

const sdk = new NodeSDK({
  serviceName: '{app-name}',
  instrumentations: [getNodeAutoInstrumentations()],
});

sdk.start();
\`\`\`

### Alerting Rules
| Alert | Condition | Severity | Action |
|-------|-----------|----------|--------|
| HighErrorRate | error_rate > 1% for 5m | Critical | Page on-call |
| HighLatency | p95 > 500ms for 5m | Warning | Slack notification |
| DatabaseDown | db_up == 0 for 1m | Critical | Page on-call |
| HighCPU | cpu_usage > 80% for 10m | Warning | Slack notification |
| HighMemory | memory_usage > 80% for 10m | Warning | Slack notification |
| QueueBacklog | queue_size > 1000 for 5m | Warning | Slack notification |

---

## 5. Security Checklist

### Authentication & Authorization
- [ ] OAuth 2.0 / JWT implemented
- [ ] Token expiration: Access (15min), Refresh (7d)
- [ ] RBAC roles defined and enforced
- [ ] Rate limiting on auth endpoints (10 req/min)
- [ ] Account lockout after 5 failed attempts

### Data Protection
- [ ] Passwords: bcrypt with cost factor 12+
- [ ] PII: Encrypted at rest (AES-256)
- [ ] Transit: TLS 1.3 required
- [ ] Secrets: In vault/secret manager, not in code
- [ ] Logs: PII redacted

### OWASP Top 10 Mitigations
| Vulnerability | Mitigation | Status |
|---------------|------------|--------|
| Injection | Parameterized queries, input validation | [ ] |
| Broken Auth | Session management, MFA option | [ ] |
| Sensitive Data | Encryption, minimal data retention | [ ] |
| XXE | Disable external entities | [ ] |
| Broken Access | RBAC, resource ownership checks | [ ] |
| Misconfig | Security headers, defaults review | [ ] |
| XSS | Output encoding, CSP | [ ] |
| Insecure Deser | Type checking, signature validation | [ ] |
| Vulnerable Deps | Automated scanning, updates | [ ] |
| Logging | Structured logs, audit trail | [ ] |

### Security Headers
\`\`\`
Strict-Transport-Security: max-age=31536000; includeSubDomains
Content-Security-Policy: default-src 'self'
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
X-XSS-Protection: 1; mode=block
Referrer-Policy: strict-origin-when-cross-origin
\`\`\`

---

## 6. Documentation Checklist

### Generated (from idea2prd)
- [x] PRD.md - Product requirements
- [x] DDD Strategic - Bounded contexts, domain events
- [x] DDD Tactical - Aggregates, entities, value objects
- [x] ADRs - Architecture decisions
- [x] C4 Diagrams - System architecture
- [x] Pseudocode - Algorithm specifications
- [x] Test Scenarios - Gherkin specs

### Additional Required
- [ ] API Documentation (OpenAPI/Swagger)
- [ ] README.md with quick start
- [ ] CONTRIBUTING.md for contributors
- [ ] CHANGELOG.md for version history
- [ ] Runbook for operations
- [ ] Incident response playbook

---

## 7. Pre-Launch Checklist

### Performance
- [ ] Load testing completed (target: {X} req/s)
- [ ] P95 latency < {target}ms verified
- [ ] Database queries optimized (no N+1)
- [ ] Indexes created for common queries
- [ ] Caching strategy implemented
- [ ] CDN configured for static assets

### Reliability
- [ ] Health check endpoint: GET /health
- [ ] Readiness endpoint: GET /ready
- [ ] Graceful shutdown implemented
- [ ] Circuit breakers for external calls
- [ ] Retry policies with exponential backoff
- [ ] Dead letter queue for failed messages

### Observability
- [ ] Structured logging enabled
- [ ] Metrics endpoint exposed
- [ ] Tracing configured
- [ ] Dashboards created
- [ ] Alerts configured

### Operations
- [ ] Runbook documented
- [ ] On-call rotation scheduled
- [ ] Rollback procedure tested
- [ ] Backup/restore verified
- [ ] Disaster recovery plan

### Launch
- [ ] Staging environment validated
- [ ] Production environment prepared
- [ ] Feature flags configured
- [ ] Gradual rollout plan (1% → 10% → 50% → 100%)
- [ ] Communication plan ready
- [ ] Support team briefed

---

## Generation Instructions

When generating COMPLETION_CHECKLIST.md:

1. Replace all `{placeholders}` with actual values from PRD/ADRs
2. Remove sections not applicable to the project
3. Add project-specific items as needed
4. Ensure all commands are valid for chosen tech stack
5. Verify all file paths match project structure

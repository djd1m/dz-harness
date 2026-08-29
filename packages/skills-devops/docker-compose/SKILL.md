---
name: "docker-compose"
description: "Designs and reviews Docker Compose configurations — multi-service setups, networking, volumes, health checks, and production hardening."
trust_tier: 2
trust_tier_label: "Validated"
validation:
  schema_path: schemas/output.json
  validator_path: scripts/validate-config.json
---

# docker-compose

Design, review, and harden Docker Compose configurations for multi-service applications. Covers the full lifecycle from local development with hot reload to production deployment with resource limits, security constraints, and health monitoring.

## When to use

- User wants to containerize a multi-service application (web + db + cache)
- User asks for a docker-compose.yml review or improvement
- User needs health checks, resource limits, or security hardening for containers
- User wants to set up a local development environment with Docker Compose
- User asks about Docker networking, volumes, or service discovery
- User wants to convert a single-container setup to a multi-service stack
- User needs a production-ready Compose configuration
- User asks about docker compose watch or hot reload with containers

## When NOT to use

- User needs Kubernetes manifests or Helm charts (that is orchestration, not Compose)
- User wants to build a CI/CD pipeline (use `ci-fix`)
- User asks about Docker Swarm mode clustering across multiple hosts
- User needs to debug a running container crash (use `debugging`)
- User wants to write application code that runs inside the container

## Procedure

### Step 1: Identify services

Map the application into discrete services. Every process that can fail or scale independently should be its own service.

**Service dependency graph:** Draw the dependency tree before writing YAML. A service should only `depends_on` services it directly connects to, not transitive dependencies.

Common service patterns:
- **Web application:** The primary service (Node.js, Python, Go, etc.)
- **Database:** PostgreSQL, MySQL, MongoDB -- always a separate service
- **Cache:** Redis, Memcached -- separate service with its own persistence strategy
- **Message queue:** RabbitMQ, Kafka -- separate service with management UI
- **Reverse proxy:** Nginx, Traefik, Caddy -- entry point for HTTP traffic
- **Worker:** Background job processor consuming from the queue
- **Monitoring:** Prometheus, Grafana -- observability stack

```yaml
# Example: service dependency mapping
# web -> postgres, redis
# worker -> postgres, redis, rabbitmq
# nginx -> web
services:
  nginx:
    depends_on:
      web:
        condition: service_healthy
  web:
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
  worker:
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
      rabbitmq:
        condition: service_healthy
```

### Step 2: Choose base images

Image selection affects build time, image size, security surface, and debugging ease.

**Rules:**
- Always pin to a specific version tag. Never use `latest` in production.
- Prefer official images from Docker Hub (library namespace).
- Use Alpine variants (`-alpine`) for smaller images unless you need glibc-specific libraries.
- Use multi-stage builds for compiled languages and for applications that need build tools at compile time but not at runtime.

```dockerfile
# Multi-stage build example (Node.js)
FROM node:20.11-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts
COPY . .
RUN npm run build

FROM node:20.11-alpine AS runtime
WORKDIR /app
RUN addgroup -g 1001 appgroup && adduser -u 1001 -G appgroup -s /bin/sh -D appuser
COPY --from=builder --chown=appuser:appgroup /app/dist ./dist
COPY --from=builder --chown=appuser:appgroup /app/node_modules ./node_modules
COPY --from=builder --chown=appuser:appgroup /app/package.json ./
USER appuser
EXPOSE 3000
CMD ["node", "dist/index.js"]
```

```yaml
# In docker-compose.yml -- pinned tags
services:
  postgres:
    image: postgres:16.2-alpine
  redis:
    image: redis:7.2-alpine
  rabbitmq:
    image: rabbitmq:3.13-management-alpine
```

### Step 3: Configure networking

Docker Compose creates a default bridge network for all services. Use custom networks to isolate traffic between service groups.

**Service discovery:** Services on the same network resolve each other by service name via Docker's built-in DNS. `web` can reach `postgres` at hostname `postgres` on port `5432`.

**Port mapping:** Only expose ports to the host that external clients need. Internal service-to-service traffic stays on the Docker network.

```yaml
services:
  nginx:
    ports:
      - "80:80"       # Exposed to host
      - "443:443"
    networks:
      - frontend

  web:
    # No ports exposed to host -- nginx proxies to it
    expose:
      - "3000"        # Internal only, visible to other containers
    networks:
      - frontend
      - backend

  postgres:
    # No ports exposed to host in production
    # Uncomment for local dev database access:
    # ports:
    #   - "5432:5432"
    networks:
      - backend

  redis:
    networks:
      - backend

networks:
  frontend:
    driver: bridge
  backend:
    driver: bridge
    internal: true   # No external access -- containers only
```

**Key rules:**
- Use `expose` for internal ports, `ports` for host-mapped ports.
- Use `internal: true` on networks that should have no internet access (database networks).
- Bind to `127.0.0.1` instead of `0.0.0.0` for dev-only ports: `"127.0.0.1:5432:5432"`.

### Step 4: Define volumes

Volumes persist data beyond container lifecycle. Choose the right type for each use case.

| Type | Use case | Survives `docker compose down`? |
|------|----------|-------------------------------|
| Named volume | Database data, persistent storage | Yes (unless `-v` flag) |
| Bind mount | Source code in development | Yes (it is the host filesystem) |
| tmpfs | Temporary files, secrets at runtime | No |

```yaml
services:
  postgres:
    volumes:
      - pgdata:/var/lib/postgresql/data     # Named volume for persistence
    tmpfs:
      - /tmp                                 # Ephemeral temp files

  web:
    volumes:
      - ./src:/app/src:ro                    # Bind mount for dev (read-only)

volumes:
  pgdata:
    driver: local
    labels:
      com.example.description: "PostgreSQL data"
      com.example.backup: "daily"
```

**Backup strategy for named volumes:**
```bash
# Backup a named volume
docker run --rm -v pgdata:/data -v $(pwd)/backups:/backup \
  alpine tar czf /backup/pgdata-$(date +%Y%m%d).tar.gz -C /data .

# Restore a named volume
docker run --rm -v pgdata:/data -v $(pwd)/backups:/backup \
  alpine tar xzf /backup/pgdata-20240115.tar.gz -C /data
```

**Key rules:**
- Never use bind mounts for database data in production.
- Use `:ro` (read-only) on bind mounts when the container should not write to the host.
- Define all named volumes in the top-level `volumes:` section.

### Step 5: Environment variables

Manage configuration through environment variables. Never hardcode secrets in the Compose file.

**Hierarchy (highest priority first):**
1. `environment:` in compose file (inline values)
2. `env_file:` directive (loaded from file)
3. Shell environment variables (from the host)
4. `.env` file in the same directory as `docker-compose.yml` (auto-loaded for interpolation)

```yaml
services:
  web:
    env_file:
      - .env                    # Shared variables
      - .env.local              # Local overrides (gitignored)
    environment:
      NODE_ENV: production      # Explicit override
      DATABASE_URL: "postgres://${DB_USER}:${DB_PASS}@postgres:5432/${DB_NAME}"
```

**.env file template:**
```bash
# .env -- committed to repo (no secrets)
DB_NAME=myapp
DB_USER=myapp
REDIS_URL=redis://redis:6379/0
APP_PORT=3000

# .env.local -- gitignored (secrets go here)
# DB_PASS=changeme
# JWT_SECRET=your-secret-here
# SMTP_PASSWORD=mail-password
```

**Docker secrets (for sensitive values):**
```yaml
services:
  web:
    secrets:
      - db_password
      - jwt_secret

secrets:
  db_password:
    file: ./secrets/db_password.txt   # File-based secret
  jwt_secret:
    environment: JWT_SECRET           # From host environment (Compose v2.23+)
```

### Step 6: Health checks

Health checks let Compose know when a service is actually ready to accept connections, not just when the process has started.

```yaml
services:
  postgres:
    image: postgres:16.2-alpine
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${DB_USER} -d ${DB_NAME}"]
      interval: 10s
      timeout: 5s
      retries: 5
      start_period: 30s

  redis:
    image: redis:7.2-alpine
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 3s
      retries: 3
      start_period: 5s

  rabbitmq:
    image: rabbitmq:3.13-management-alpine
    healthcheck:
      test: ["CMD-SHELL", "rabbitmq-diagnostics -q check_running"]
      interval: 15s
      timeout: 10s
      retries: 5
      start_period: 60s

  web:
    image: myapp:latest
    healthcheck:
      test: ["CMD-SHELL", "wget --no-verbose --tries=1 --spider http://localhost:3000/health || exit 1"]
      interval: 15s
      timeout: 5s
      retries: 3
      start_period: 10s
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
```

**Health check parameters:**
- `interval`: Time between checks. 10-15s is a good default.
- `timeout`: Max time for a single check. Should be less than interval.
- `retries`: How many consecutive failures before marking unhealthy.
- `start_period`: Grace period after container start. Failures during this period do not count toward retries. Set this longer for services with slow startup (databases, JVM apps).

### Step 7: Resource limits

Prevent any single container from consuming all host resources.

```yaml
services:
  web:
    deploy:
      resources:
        limits:
          cpus: "1.0"
          memory: 512M
        reservations:
          cpus: "0.25"
          memory: 128M
    ulimits:
      nofile:
        soft: 65536
        hard: 65536

  postgres:
    deploy:
      resources:
        limits:
          cpus: "2.0"
          memory: 1G
        reservations:
          cpus: "0.5"
          memory: 256M
    shm_size: 256M               # Shared memory for PostgreSQL

  redis:
    deploy:
      resources:
        limits:
          cpus: "0.5"
          memory: 256M
        reservations:
          cpus: "0.1"
          memory: 64M
    sysctls:
      net.core.somaxconn: "511"  # Redis recommended setting
```

**Guidelines:**
- `limits` = hard ceiling. Container is killed (OOM) or throttled (CPU) beyond this.
- `reservations` = guaranteed minimum. Docker reserves this for the container.
- Set `shm_size` for PostgreSQL -- it uses shared memory for query processing.
- Total limits across all services should not exceed host resources.

### Step 8: Production hardening

Reduce the attack surface by applying the principle of least privilege.

```yaml
services:
  web:
    read_only: true                    # Read-only root filesystem
    tmpfs:
      - /tmp                           # Writable temp directory
      - /app/.cache                    # App-specific writable paths
    security_opt:
      - no-new-privileges:true         # Prevent privilege escalation
    cap_drop:
      - ALL                            # Drop all Linux capabilities
    cap_add:
      - NET_BIND_SERVICE               # Add back only what is needed
    user: "1001:1001"                  # Non-root user
    restart: unless-stopped            # Auto-restart on failure
    logging:
      driver: json-file
      options:
        max-size: "10m"
        max-file: "3"

  postgres:
    read_only: true
    tmpfs:
      - /tmp
      - /run/postgresql
    security_opt:
      - no-new-privileges:true
    cap_drop:
      - ALL
    restart: unless-stopped
    logging:
      driver: json-file
      options:
        max-size: "50m"
        max-file: "5"
```

**Restart policies:**
| Policy | Behavior |
|--------|----------|
| `no` | Never restart (default) |
| `always` | Always restart, even if stopped manually |
| `unless-stopped` | Restart unless explicitly stopped -- best for production |
| `on-failure` | Restart only on non-zero exit code |

**Logging:** Always set `max-size` and `max-file` to prevent disk exhaustion from log accumulation.

### Step 9: Development workflow

Use override files and watch mode for a productive local development experience.

**docker-compose.override.yml** (auto-loaded in dev, not in production):
```yaml
# docker-compose.override.yml -- development overrides
services:
  web:
    build:
      context: .
      target: builder              # Use builder stage for dev
    volumes:
      - ./src:/app/src              # Hot reload source code
      - /app/node_modules           # Anonymous volume -- don't override node_modules
    environment:
      NODE_ENV: development
      DEBUG: "app:*"
    ports:
      - "3000:3000"                 # Expose for local browser access
      - "9229:9229"                 # Node.js debugger port

  postgres:
    ports:
      - "127.0.0.1:5432:5432"      # Local database access for tools
```

**docker compose watch (Compose v2.22+):**
```yaml
services:
  web:
    develop:
      watch:
        - action: sync
          path: ./src
          target: /app/src
        - action: rebuild
          path: ./package.json
        - action: sync+restart
          path: ./config
          target: /app/config
```

Run with `docker compose watch` -- file changes sync into the container automatically without rebuilding the image.

**Production deployment** (explicit file selection):
```bash
# Development (uses docker-compose.yml + docker-compose.override.yml)
docker compose up

# Production (skips override file)
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d
```

### Step 10: Common stacks

#### Node.js + PostgreSQL + Redis

```yaml
# docker-compose.yml
services:
  web:
    build:
      context: .
      dockerfile: Dockerfile
    environment:
      NODE_ENV: production
      DATABASE_URL: "postgres://${DB_USER}:${DB_PASS}@postgres:5432/${DB_NAME}"
      REDIS_URL: "redis://redis:6379/0"
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
    healthcheck:
      test: ["CMD-SHELL", "wget --no-verbose --tries=1 --spider http://localhost:3000/health || exit 1"]
      interval: 15s
      timeout: 5s
      retries: 3
      start_period: 10s
    deploy:
      resources:
        limits:
          memory: 512M
          cpus: "1.0"
    read_only: true
    tmpfs: [/tmp]
    security_opt: [no-new-privileges:true]
    cap_drop: [ALL]
    user: "1001:1001"
    restart: unless-stopped
    networks: [frontend, backend]

  postgres:
    image: postgres:16.2-alpine
    environment:
      POSTGRES_DB: ${DB_NAME}
      POSTGRES_USER: ${DB_USER}
      POSTGRES_PASSWORD: ${DB_PASS}
    volumes:
      - pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${DB_USER} -d ${DB_NAME}"]
      interval: 10s
      timeout: 5s
      retries: 5
      start_period: 30s
    deploy:
      resources:
        limits:
          memory: 1G
          cpus: "2.0"
    shm_size: 256M
    read_only: true
    tmpfs: [/tmp, /run/postgresql]
    security_opt: [no-new-privileges:true]
    cap_drop: [ALL]
    restart: unless-stopped
    networks: [backend]

  redis:
    image: redis:7.2-alpine
    command: redis-server --maxmemory 128mb --maxmemory-policy allkeys-lru
    volumes:
      - redisdata:/data
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 3s
      retries: 3
      start_period: 5s
    deploy:
      resources:
        limits:
          memory: 256M
          cpus: "0.5"
    read_only: true
    tmpfs: [/tmp]
    security_opt: [no-new-privileges:true]
    cap_drop: [ALL]
    restart: unless-stopped
    networks: [backend]

volumes:
  pgdata:
  redisdata:

networks:
  frontend:
    driver: bridge
  backend:
    driver: bridge
    internal: true
```

#### Python + MySQL + RabbitMQ

```yaml
services:
  api:
    build:
      context: .
      dockerfile: Dockerfile
    environment:
      DATABASE_URL: "mysql+pymysql://${MYSQL_USER}:${MYSQL_PASS}@mysql:3306/${MYSQL_DB}"
      CELERY_BROKER_URL: "amqp://${RABBITMQ_USER}:${RABBITMQ_PASS}@rabbitmq:5672/"
    depends_on:
      mysql:
        condition: service_healthy
      rabbitmq:
        condition: service_healthy
    healthcheck:
      test: ["CMD-SHELL", "curl -f http://localhost:8000/health || exit 1"]
      interval: 15s
      timeout: 5s
      retries: 3
      start_period: 15s
    deploy:
      resources:
        limits:
          memory: 512M
          cpus: "1.0"
    read_only: true
    tmpfs: [/tmp]
    security_opt: [no-new-privileges:true]
    cap_drop: [ALL]
    user: "1001:1001"
    restart: unless-stopped

  worker:
    build:
      context: .
      dockerfile: Dockerfile
    command: celery -A app.celery worker --loglevel=info --concurrency=4
    environment:
      DATABASE_URL: "mysql+pymysql://${MYSQL_USER}:${MYSQL_PASS}@mysql:3306/${MYSQL_DB}"
      CELERY_BROKER_URL: "amqp://${RABBITMQ_USER}:${RABBITMQ_PASS}@rabbitmq:5672/"
    depends_on:
      mysql:
        condition: service_healthy
      rabbitmq:
        condition: service_healthy
    deploy:
      resources:
        limits:
          memory: 1G
          cpus: "2.0"
    read_only: true
    tmpfs: [/tmp]
    security_opt: [no-new-privileges:true]
    cap_drop: [ALL]
    user: "1001:1001"
    restart: unless-stopped

  mysql:
    image: mysql:8.3
    environment:
      MYSQL_DATABASE: ${MYSQL_DB}
      MYSQL_USER: ${MYSQL_USER}
      MYSQL_PASSWORD: ${MYSQL_PASS}
      MYSQL_ROOT_PASSWORD: ${MYSQL_ROOT_PASS}
    volumes:
      - mysqldata:/var/lib/mysql
    healthcheck:
      test: ["CMD", "mysqladmin", "ping", "-h", "localhost", "-u", "root", "-p${MYSQL_ROOT_PASS}"]
      interval: 10s
      timeout: 5s
      retries: 5
      start_period: 60s
    deploy:
      resources:
        limits:
          memory: 1G
          cpus: "2.0"
    cap_drop: [ALL]
    cap_add: [SYS_NICE]
    restart: unless-stopped

  rabbitmq:
    image: rabbitmq:3.13-management-alpine
    environment:
      RABBITMQ_DEFAULT_USER: ${RABBITMQ_USER}
      RABBITMQ_DEFAULT_PASS: ${RABBITMQ_PASS}
    volumes:
      - rabbitmqdata:/var/lib/rabbitmq
    healthcheck:
      test: ["CMD-SHELL", "rabbitmq-diagnostics -q check_running"]
      interval: 15s
      timeout: 10s
      retries: 5
      start_period: 60s
    deploy:
      resources:
        limits:
          memory: 512M
          cpus: "1.0"
    restart: unless-stopped

volumes:
  mysqldata:
  rabbitmqdata:
```

#### Next.js + Supabase (self-hosted)

```yaml
services:
  nextjs:
    build:
      context: .
      dockerfile: Dockerfile
    environment:
      NEXT_PUBLIC_SUPABASE_URL: http://kong:8000
      NEXT_PUBLIC_SUPABASE_ANON_KEY: ${SUPABASE_ANON_KEY}
      SUPABASE_SERVICE_ROLE_KEY: ${SUPABASE_SERVICE_ROLE_KEY}
    depends_on:
      kong:
        condition: service_healthy
    healthcheck:
      test: ["CMD-SHELL", "wget --no-verbose --tries=1 --spider http://localhost:3000/api/health || exit 1"]
      interval: 15s
      timeout: 5s
      retries: 3
      start_period: 20s
    deploy:
      resources:
        limits:
          memory: 512M
          cpus: "1.0"
    ports:
      - "3000:3000"
    read_only: true
    tmpfs: [/tmp, /app/.next/cache]
    security_opt: [no-new-privileges:true]
    cap_drop: [ALL]
    user: "1001:1001"
    restart: unless-stopped

  kong:
    image: kong:3.6
    environment:
      KONG_DATABASE: "off"
      KONG_DECLARATIVE_CONFIG: /etc/kong/kong.yml
    volumes:
      - ./supabase/kong.yml:/etc/kong/kong.yml:ro
    healthcheck:
      test: ["CMD", "kong", "health"]
      interval: 10s
      timeout: 5s
      retries: 3
      start_period: 15s
    ports:
      - "8000:8000"
    restart: unless-stopped

  supabase-db:
    image: supabase/postgres:15.1.1.61
    environment:
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
    volumes:
      - supabase-db-data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U supabase_admin"]
      interval: 10s
      timeout: 5s
      retries: 5
      start_period: 30s
    deploy:
      resources:
        limits:
          memory: 1G
          cpus: "2.0"
    restart: unless-stopped

  supabase-auth:
    image: supabase/gotrue:v2.143.0
    environment:
      GOTRUE_DB_DATABASE_URL: "postgres://supabase_auth_admin:${POSTGRES_PASSWORD}@supabase-db:5432/postgres"
      GOTRUE_JWT_SECRET: ${JWT_SECRET}
    depends_on:
      supabase-db:
        condition: service_healthy
    healthcheck:
      test: ["CMD-SHELL", "wget --no-verbose --tries=1 --spider http://localhost:9999/health || exit 1"]
      interval: 10s
      timeout: 5s
      retries: 3
      start_period: 10s
    restart: unless-stopped

volumes:
  supabase-db-data:
```

## Anti-patterns

These are common mistakes. Flag them during review and propose the correct alternative.

| Anti-pattern | Why it is wrong | Fix |
|---|---|---|
| `image: postgres:latest` | Builds are not reproducible. A new Postgres version could break your app silently. | Pin: `image: postgres:16.2-alpine` |
| Secrets in `docker-compose.yml` | Compose files are committed to git. Secrets leak. | Use `.env.local` (gitignored) or Docker secrets. |
| No health checks | `depends_on` without `condition: service_healthy` only waits for container start, not readiness. App crashes connecting to a database that is still initializing. | Add `healthcheck` to every service and use `depends_on` with `condition: service_healthy`. |
| Running as root | Default container user is root. A container escape gives root on the host. | Set `user: "1001:1001"` and build images with a non-root user. |
| No resource limits | A memory leak in one container brings down the entire host. | Set `deploy.resources.limits` for memory and CPU on every service. |
| Bind mounts in production | Host filesystem coupling makes deployments fragile and non-portable. | Use named volumes for persistent data in production. Bind mounts are for development only. |
| No log rotation | `json-file` driver keeps logs forever. Disk fills up. | Set `logging.options.max-size` and `max-file` on every service. |
| Exposing database ports to host | `ports: "5432:5432"` on postgres makes the database accessible from outside the Docker network. | Use `expose` for internal services. Only expose ports for services that need host access. |
| No restart policy | Container crash = service stays down until manual restart. | Set `restart: unless-stopped` for production services. |
| Ignoring `.dockerignore` | `COPY . .` sends `node_modules`, `.git`, and other junk to the build context, bloating images and slowing builds. | Create a `.dockerignore` with `node_modules`, `.git`, `.env*`, `*.md`. |

## Self-check

Before delivering the Compose configuration, verify all 14 items:

1. Every service has a pinned image tag (no `latest`, no untagged).
2. Every stateful service (database, queue) has a named volume.
3. Every service has a `healthcheck` directive with all five parameters (test, interval, timeout, retries, start_period).
4. Every `depends_on` uses `condition: service_healthy`.
5. No secrets appear as plaintext in the Compose file or committed `.env`.
6. Every service has `deploy.resources.limits` for memory and CPU.
7. Every production service has `security_opt: [no-new-privileges:true]` and `cap_drop: [ALL]`.
8. Application services run as non-root (`user:` directive or `USER` in Dockerfile).
9. Every service has a `restart` policy appropriate for its role.
10. Logging is configured with `max-size` and `max-file` on every service.
11. Database ports are not exposed to the host in the production configuration.
12. Networks are used to isolate frontend from backend traffic.
13. `.env` file template is provided with placeholder values (no real secrets).
14. Override files (`docker-compose.override.yml`) separate dev from production config.

## Examples

### In scope

- "Create a docker-compose.yml for a Node.js app with PostgreSQL and Redis"
- "Review my docker-compose.yml for security issues"
- "Add health checks to my Compose services"
- "Set up hot reload with docker compose watch"
- "How do I limit memory for my containers?"
- "My web container starts before the database is ready, how do I fix that?"
- "Convert my single-container setup to use separate services for the app and database"
- "Create a production-ready Compose file with nginx as reverse proxy"

### Out of scope

- "Deploy this to Kubernetes" -- use K8s tooling, not Compose
- "Set up auto-scaling across multiple servers" -- Compose is single-host
- "Write the Express.js application code" -- Compose configures containers, not app code
- "Configure my CI pipeline to build Docker images" -- use `ci-fix` for CI
- "Debug why my Node.js app crashes inside the container" -- use `debugging`

## Output Format

Return a structured result with: compose configuration, Dockerfile (if needed), .env template, review findings (if reviewing existing config), and self-check results.

---
name: "api-design"
description: "Designs REST and GraphQL APIs with OpenAPI specs, error contracts, pagination, versioning, and security."
trust_tier: 2
trust_tier_label: "Validated"
validation:
  schema_path: schemas/output.json
  validator_path: scripts/validate-config.json
---

# api-design

Design APIs that developers want to use. Good API design is invisible -- consumers reach for the right endpoint instinctively, error messages tell them exactly what went wrong, and pagination just works. This skill produces a complete, reviewable API specification, not code.

## When to use

- User wants to design a new API (REST or GraphQL)
- User wants to review or improve an existing API design
- User needs an OpenAPI/Swagger spec generated from requirements
- User wants an API versioning strategy
- User asks about pagination, filtering, or sorting conventions
- User asks about error handling and error response formats
- User wants to compare REST vs GraphQL vs gRPC for a specific use case

## When NOT to use

- User wants to implement the API (use a coding skill)
- User wants to test an existing API (use `test-writer`)
- User wants to debug an API that is returning errors (use `debugging`)
- User wants to review API code in a PR (use `pr-review`)
- User is building a UI that consumes an API (use `frontend-implementation`)

## Procedure

### Step 1. Identify API consumers

Before designing anything, understand who will call this API. Different consumers have different needs.

| Consumer | Priorities | Design implications |
|----------|-----------|---------------------|
| Web frontend (SPA) | Low latency, batch fetching | Consider BFF pattern, aggregate endpoints |
| Mobile app | Bandwidth efficiency, offline support | Sparse fieldsets, ETags, compact payloads |
| Third-party developers | Stability, documentation, predictability | Strict versioning, comprehensive error messages |
| Internal microservices | Performance, type safety, streaming | Consider gRPC or GraphQL subscriptions |
| CLI tools | Simplicity, scriptability | Plain JSON, consistent exit-code-friendly status codes |

Ask the user: Who are the consumers? If they don't know, default to "web frontend + potential third-party."

### Step 2. Choose the API paradigm

Select the paradigm based on the use case. Do not default to REST just because it is familiar.

| Criterion | REST | GraphQL | gRPC |
|-----------|------|---------|------|
| **Best for** | CRUD resources, public APIs | Complex nested data, multiple consumers | Service-to-service, streaming |
| **Learning curve** | Low | Medium | High |
| **Caching** | HTTP caching works natively | Requires custom caching (persisted queries) | No HTTP caching |
| **Over-fetching** | Common (mitigate with sparse fieldsets) | Solved by design | Solved by design |
| **Under-fetching** | Common (mitigate with includes/embeds) | Solved by design | N/A |
| **File uploads** | Native multipart support | Needs workaround (multipart spec) | Native streaming |
| **Real-time** | SSE or WebSocket bolt-on | Subscriptions built-in | Bidirectional streaming built-in |
| **Tooling maturity** | Excellent (OpenAPI, Postman, curl) | Good (Apollo, Relay, GraphiQL) | Good (protoc, grpcurl, Buf) |
| **Browser support** | Native | Native (HTTP POST) | Requires grpc-web proxy |

**Decision rule:** If the API is public-facing or CRUD-heavy, use REST. If the data graph is deep and consumers need flexibility, use GraphQL. If it is internal service-to-service with streaming needs, use gRPC.

Output your recommendation with a one-paragraph justification.

### Step 3. Define resources and relationships

List every resource as a noun. Never use verbs as resource names.

Good:
```
/users
/users/:id
/users/:id/orders
/orders/:id
/products
```

Bad:
```
/getUser
/createOrder
/fetchProductList
```

Draw a resource relationship diagram (text-based):

```
User 1---* Order *---* Product
  |                      |
  1                      1
  |                      |
  * Review              * Category
```

For each resource, note:
- Cardinality (1:1, 1:N, N:M)
- Whether it is a top-level resource or always nested
- Whether it is read-only, read-write, or append-only

### Step 4. Design URL structure

Rules:
- Use plural nouns: `/users`, not `/user`
- Maximum nesting depth: 2 levels (`/users/:id/orders` is fine; `/users/:id/orders/:oid/items/:iid` is too deep -- promote `items` to a top-level resource)
- Use kebab-case for multi-word resources: `/order-items`, not `/orderItems`
- Collection endpoints: `GET /resources`
- Single resource: `GET /resources/:id`
- Sub-resources: `GET /resources/:id/sub-resources`
- Actions on resources (when CRUD does not fit): `POST /resources/:id/actions/cancel`

For each endpoint, specify:

```
METHOD /path
  Description: What this does
  Auth: required | optional | none
  Idempotent: yes | no
```

### Step 5. Define HTTP methods and status codes

Every endpoint must specify its method and expected status codes.

| Method | Purpose | Idempotent | Request body | Success code | Common error codes |
|--------|---------|------------|--------------|--------------|-------------------|
| GET | Read a resource or list | Yes | None | 200 | 401, 403, 404 |
| POST | Create a resource | No | Required | 201 (with Location header) | 400, 401, 403, 409, 422 |
| PUT | Replace a resource entirely | Yes | Required | 200 or 204 | 400, 401, 403, 404, 409 |
| PATCH | Partial update | No* | Required (partial) | 200 | 400, 401, 403, 404, 422 |
| DELETE | Remove a resource | Yes | None (usually) | 204 | 401, 403, 404 |

*PATCH is not guaranteed idempotent because applying the same patch twice may produce different results depending on the patch format.

Additional status codes to use consistently:

| Code | When to use |
|------|-------------|
| 400 Bad Request | Malformed JSON, missing required fields, invalid field types |
| 401 Unauthorized | Missing or invalid authentication token |
| 403 Forbidden | Valid token but insufficient permissions |
| 404 Not Found | Resource does not exist |
| 409 Conflict | Duplicate resource, version conflict (optimistic locking) |
| 422 Unprocessable Entity | Valid JSON but business rule violation (e.g., email already taken) |
| 429 Too Many Requests | Rate limit exceeded (include Retry-After header) |
| 500 Internal Server Error | Unexpected server failure (never leak stack traces) |
| 503 Service Unavailable | Planned maintenance or overload (include Retry-After header) |

### Step 6. Design request/response schemas

Pick one response envelope convention per project and stick with it.

**Option A: Plain JSON (recommended for most APIs)**

```json
{
  "id": "usr_abc123",
  "email": "alice@example.com",
  "name": "Alice",
  "created_at": "2025-01-15T09:30:00Z"
}
```

**Option B: Wrapped response (useful when you need metadata)**

```json
{
  "data": {
    "id": "usr_abc123",
    "email": "alice@example.com",
    "name": "Alice"
  },
  "meta": {
    "request_id": "req_xyz789",
    "deprecated_fields": ["legacy_name"]
  }
}
```

**Option C: JSON:API (when you need relationship links and includes)**

```json
{
  "data": {
    "type": "users",
    "id": "usr_abc123",
    "attributes": {
      "email": "alice@example.com",
      "name": "Alice"
    },
    "relationships": {
      "orders": {
        "links": { "related": "/users/usr_abc123/orders" }
      }
    }
  }
}
```

Conventions to enforce:
- Use `snake_case` for field names (or `camelCase` -- pick one, never mix)
- Use ISO 8601 for all timestamps: `2025-01-15T09:30:00Z`
- Use opaque string IDs with a prefix: `usr_abc123`, `ord_def456` (avoids exposing auto-increment DB IDs)
- Null fields: include with `null` value, do not omit (makes client parsing predictable)
- Booleans: use `is_` or `has_` prefix for clarity: `is_active`, `has_verified_email`

### Step 7. Error contract (RFC 7807 Problem Details)

Every error response must follow RFC 7807. No exceptions.

```json
{
  "type": "https://api.example.com/errors/validation-failed",
  "title": "Validation Failed",
  "status": 422,
  "detail": "The field 'email' must be a valid email address.",
  "instance": "/users",
  "errors": [
    {
      "field": "email",
      "message": "Must be a valid email address",
      "code": "INVALID_FORMAT"
    },
    {
      "field": "age",
      "message": "Must be at least 13",
      "code": "OUT_OF_RANGE"
    }
  ]
}
```

| Field | Required | Description |
|-------|----------|-------------|
| `type` | Yes | URI identifying the error type (use as a stable error identifier) |
| `title` | Yes | Short human-readable summary (same for all instances of this type) |
| `status` | Yes | HTTP status code (matches the response status) |
| `detail` | Yes | Human-readable explanation specific to this occurrence |
| `instance` | No | URI of the specific request that caused the error |
| `errors` | No | Array of field-level validation errors (for 400/422 responses) |

Error type URIs should be documented and stable. Example catalog:

```
https://api.example.com/errors/validation-failed
https://api.example.com/errors/resource-not-found
https://api.example.com/errors/authentication-required
https://api.example.com/errors/permission-denied
https://api.example.com/errors/rate-limit-exceeded
https://api.example.com/errors/conflict
https://api.example.com/errors/internal-error
```

Example curl request and error response:

```bash
curl -s -X POST https://api.example.com/v1/users \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer tok_expired" \
  -d '{"email": "not-an-email"}' | jq .
```

```json
{
  "type": "https://api.example.com/errors/authentication-required",
  "title": "Authentication Required",
  "status": 401,
  "detail": "The provided bearer token has expired. Request a new token at /oauth/token.",
  "instance": "/v1/users"
}
```

### Step 8. Pagination strategy

Every list endpoint must be paginated. No exceptions.

**Cursor-based pagination (recommended)**

Best for: real-time data, large datasets, data that changes frequently.

```bash
GET /v1/orders?limit=25&cursor=eyJpZCI6MTAwfQ==

# Response includes:
{
  "data": [...],
  "pagination": {
    "next_cursor": "eyJpZCI6MTI1fQ==",
    "has_more": true,
    "limit": 25
  }
}
```

Pros: consistent results even when data changes, performs well on large tables (no OFFSET).
Cons: cannot jump to page N, cursor is opaque.

**Offset-based pagination (simpler, use for small datasets)**

Best for: admin dashboards, search results where total count matters.

```bash
GET /v1/products?limit=25&offset=50

# Response includes:
{
  "data": [...],
  "pagination": {
    "total": 342,
    "limit": 25,
    "offset": 50,
    "has_more": true
  }
}
```

Pros: can jump to any page, total count available.
Cons: slow on large tables (OFFSET scales linearly), inconsistent if data changes between pages.

**Decision rule:** Use cursor-based unless the user explicitly needs page numbers or total count.

Always set a maximum page size (e.g., `limit` max 100) and a default (e.g., 25).

### Step 9. Filtering and sorting

Use query parameters for filtering. Keep it predictable.

**Filtering:**

```bash
# Exact match
GET /v1/orders?status=shipped

# Multiple values (OR)
GET /v1/orders?status=shipped,delivered

# Range
GET /v1/orders?created_after=2025-01-01T00:00:00Z&created_before=2025-06-01T00:00:00Z

# Search (full-text)
GET /v1/products?q=wireless+keyboard
```

Do not invent a query language. If filtering needs are complex, consider a `POST /search` endpoint with a JSON body:

```json
POST /v1/orders/search
{
  "filters": {
    "status": ["shipped", "delivered"],
    "total": { "gte": 100, "lte": 500 },
    "created_at": { "after": "2025-01-01T00:00:00Z" }
  },
  "sort": ["-created_at", "total"],
  "limit": 25
}
```

**Sorting:**

```bash
# Ascending (default)
GET /v1/products?sort=price

# Descending (prefix with minus)
GET /v1/products?sort=-created_at

# Multiple sort fields (comma-separated)
GET /v1/products?sort=-created_at,price
```

Document which fields are sortable. Not every field should be sortable (it requires database indexes).

### Step 10. Versioning strategy

Choose one strategy and apply it consistently.

| Strategy | Example | Pros | Cons |
|----------|---------|------|------|
| **URL path** (recommended) | `/v1/users` | Obvious, easy to route, easy to test | URL changes on version bump |
| **Custom header** | `X-API-Version: 2` | Clean URLs | Easy to forget, hard to test in browser |
| **Accept header** | `Accept: application/vnd.api.v2+json` | Standards-compliant | Verbose, tooling support varies |
| **Query parameter** | `/users?version=2` | Simple | Pollutes query string, caching issues |

**Recommendation:** URL path versioning (`/v1/`, `/v2/`). It is the most widely understood and the easiest to work with.

**Version lifecycle:**

```
v1 (stable) -----> v1 (deprecated, 6-month sunset) -----> v1 (removed)
                        |
v2 (stable) <-----------+
```

When bumping versions:
- Add `Sunset` header to deprecated version responses: `Sunset: Sat, 01 Jan 2027 00:00:00 GMT`
- Add `Deprecation` header: `Deprecation: true`
- Add `Link` header pointing to the new version: `Link: </v2/users>; rel="successor-version"`
- Document all breaking changes in a changelog
- Support the old version for at least 6 months after deprecation notice

**What counts as a breaking change:**
- Removing a field from a response
- Renaming a field
- Changing a field's type
- Removing an endpoint
- Changing authentication requirements
- Changing error response format

**What is NOT a breaking change:**
- Adding a new field to a response
- Adding a new endpoint
- Adding a new optional query parameter
- Adding a new enum value (if clients handle unknown values)

### Step 11. Authentication and authorization

Define auth per-endpoint. Never assume "everything requires auth."

**Authentication methods:**

| Method | Use case | Header |
|--------|----------|--------|
| Bearer token (JWT or opaque) | Most APIs | `Authorization: Bearer tok_abc123` |
| API key | Server-to-server, simple integrations | `X-API-Key: key_def456` or query param `?api_key=...` |
| OAuth2 | Third-party access with scoped permissions | `Authorization: Bearer <access_token>` |
| Basic auth | Legacy, internal tools only | `Authorization: Basic base64(user:pass)` |

**OAuth2 scopes (example):**

```
users:read      - Read user profiles
users:write     - Create and update users
orders:read     - Read orders
orders:write    - Create and update orders
admin           - Full access
```

**Rate limiting headers (include on every response):**

```http
X-RateLimit-Limit: 1000
X-RateLimit-Remaining: 742
X-RateLimit-Reset: 1672531200
Retry-After: 30
```

Rate limit tiers:

| Tier | Limit | Use case |
|------|-------|----------|
| Free | 100 req/hour | Public/anonymous |
| Authenticated | 1000 req/hour | Logged-in users |
| Premium | 10000 req/hour | Paid API consumers |

When rate limit is exceeded, return:

```json
{
  "type": "https://api.example.com/errors/rate-limit-exceeded",
  "title": "Rate Limit Exceeded",
  "status": 429,
  "detail": "You have exceeded 1000 requests per hour. Try again in 30 seconds.",
  "instance": "/v1/users"
}
```

**CORS (for browser consumers):**

Specify allowed origins, methods, and headers. Never use `Access-Control-Allow-Origin: *` in production unless the API is truly public and read-only.

### Step 12. Generate OpenAPI 3.1 spec

Produce a complete OpenAPI 3.1 YAML spec. Here is a skeleton to fill in:

```yaml
openapi: "3.1.0"
info:
  title: "My API"
  version: "1.0.0"
  description: "Brief description of the API"
  contact:
    name: "API Support"
    email: "api@example.com"

servers:
  - url: https://api.example.com/v1
    description: Production
  - url: https://staging-api.example.com/v1
    description: Staging

security:
  - bearerAuth: []

paths:
  /users:
    get:
      summary: List users
      operationId: listUsers
      tags: [Users]
      parameters:
        - name: limit
          in: query
          schema:
            type: integer
            default: 25
            maximum: 100
        - name: cursor
          in: query
          schema:
            type: string
      responses:
        "200":
          description: A paginated list of users
          content:
            application/json:
              schema:
                type: object
                properties:
                  data:
                    type: array
                    items:
                      $ref: "#/components/schemas/User"
                  pagination:
                    $ref: "#/components/schemas/CursorPagination"
        "401":
          $ref: "#/components/responses/Unauthorized"

    post:
      summary: Create a user
      operationId: createUser
      tags: [Users]
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: "#/components/schemas/CreateUserRequest"
      responses:
        "201":
          description: User created
          headers:
            Location:
              schema:
                type: string
              description: URL of the created user
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/User"
        "400":
          $ref: "#/components/responses/BadRequest"
        "409":
          $ref: "#/components/responses/Conflict"
        "422":
          $ref: "#/components/responses/ValidationError"

  /users/{id}:
    get:
      summary: Get a user by ID
      operationId: getUser
      tags: [Users]
      parameters:
        - name: id
          in: path
          required: true
          schema:
            type: string
      responses:
        "200":
          description: User details
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/User"
        "404":
          $ref: "#/components/responses/NotFound"

components:
  securitySchemes:
    bearerAuth:
      type: http
      scheme: bearer
      bearerFormat: JWT
    apiKey:
      type: apiKey
      in: header
      name: X-API-Key

  schemas:
    User:
      type: object
      required: [id, email, name, created_at]
      properties:
        id:
          type: string
          example: "usr_abc123"
        email:
          type: string
          format: email
        name:
          type: string
        is_active:
          type: boolean
          default: true
        created_at:
          type: string
          format: date-time

    CreateUserRequest:
      type: object
      required: [email, name]
      properties:
        email:
          type: string
          format: email
        name:
          type: string
          minLength: 1
          maxLength: 200

    CursorPagination:
      type: object
      properties:
        next_cursor:
          type: string
          nullable: true
        has_more:
          type: boolean
        limit:
          type: integer

    ProblemDetail:
      type: object
      required: [type, title, status, detail]
      properties:
        type:
          type: string
          format: uri
        title:
          type: string
        status:
          type: integer
        detail:
          type: string
        instance:
          type: string
        errors:
          type: array
          items:
            type: object
            properties:
              field:
                type: string
              message:
                type: string
              code:
                type: string

  responses:
    BadRequest:
      description: Malformed request
      content:
        application/problem+json:
          schema:
            $ref: "#/components/schemas/ProblemDetail"
    Unauthorized:
      description: Authentication required
      content:
        application/problem+json:
          schema:
            $ref: "#/components/schemas/ProblemDetail"
    NotFound:
      description: Resource not found
      content:
        application/problem+json:
          schema:
            $ref: "#/components/schemas/ProblemDetail"
    Conflict:
      description: Resource conflict
      content:
        application/problem+json:
          schema:
            $ref: "#/components/schemas/ProblemDetail"
    ValidationError:
      description: Validation failed
      content:
        application/problem+json:
          schema:
            $ref: "#/components/schemas/ProblemDetail"
```

Adapt this skeleton to the user's specific resources and endpoints.

## Anti-patterns

Warn the user if their design includes any of these:

| Anti-pattern | Problem | Fix |
|-------------|---------|-----|
| Verbs in URLs (`/getUser`, `/createOrder`) | Violates resource-oriented design | Use nouns: `/users`, `/orders` with HTTP methods |
| Inconsistent error formats | Clients cannot parse errors reliably | Use RFC 7807 for every error |
| Breaking changes without versioning | Breaks all existing consumers | Version the API; sunset old versions gracefully |
| Exposing auto-increment database IDs | Leaks information (total count, creation order), enumerable | Use opaque prefixed IDs: `usr_abc123` |
| N+1 API calls (list then fetch each) | Multiplies latency, wastes bandwidth | Add `?include=` or design aggregate endpoints |
| No pagination on list endpoints | Returns unbounded data, kills server and client | Always paginate with a max page size |
| Missing rate limit headers | Consumers cannot self-throttle | Include `X-RateLimit-*` on every response |
| Using 200 for everything | Clients cannot distinguish success from failure by status code | Use the correct HTTP status code for each outcome |
| Accepting GET request bodies | Not reliably supported by all HTTP clients and proxies | Use query parameters or POST with body |
| Plural/singular inconsistency | `/user/123/orders` vs `/users/123/order` | Pick plural everywhere and stick with it |
| Deep nesting (`/a/:id/b/:id/c/:id/d`) | Hard to discover, hard to cache, brittle | Max 2 levels of nesting; promote deep resources to top-level |
| No HATEOAS or discoverability | Consumers hard-code URLs | Include `links` or `_links` in responses |

## Examples

**In scope:**

- "Design a REST API for a todo app" -- full 12-step procedure, produces OpenAPI spec
- "Review this OpenAPI spec" -- analyze against the anti-patterns and best practices above
- "Should I use REST or GraphQL for this?" -- run Step 2 decision matrix
- "How should I handle errors in my API?" -- Step 7 with RFC 7807 template
- "What pagination strategy should I use?" -- Step 8 with trade-off analysis
- "Design the endpoints for a multi-tenant SaaS billing API" -- full procedure with tenant isolation considerations

**Out of scope:**

- "Implement the API" -- use a coding skill
- "Write tests for this API" -- use `test-writer`
- "Fix this 500 error in my API" -- use `debugging`
- "Deploy this API" -- use infrastructure/deployment skills
- "Design the database schema" -- use `database-review`

## Self-check

Before delivering the final design, verify every item:

- [ ] Every endpoint is documented with method, URL, request body (if any), response schema, and status codes
- [ ] The error format follows RFC 7807 Problem Details on every error response
- [ ] There is an explicit versioning strategy with a deprecation/sunset policy
- [ ] Every list endpoint is paginated with a documented page size limit
- [ ] Authentication and authorization are documented per-endpoint (not just "auth required")
- [ ] Rate limiting headers are specified
- [ ] Field naming is consistent (all snake_case or all camelCase, never mixed)
- [ ] Timestamps use ISO 8601
- [ ] Resource IDs are opaque (not raw database IDs)
- [ ] No verbs in URL paths
- [ ] URL nesting does not exceed 2 levels
- [ ] A complete OpenAPI 3.1 spec is included (or a clear skeleton the user can extend)
- [ ] CORS policy is defined if browser consumers exist
- [ ] Sorting and filtering conventions are documented for list endpoints

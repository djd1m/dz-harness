---
name: "graphql-schema"
description: "Designs and reviews GraphQL schemas — types, resolvers, pagination, error handling, performance, and security."
trust_tier: 2
trust_tier_label: "Validated"
validation:
  schema_path: schemas/output.json
  validator_path: scripts/validate-config.json
---

# graphql-schema

Design, review, and harden GraphQL schemas for production APIs. Covers schema-first vs code-first approaches, type design, Relay-style cursor pagination, input validation, error handling with union types, N+1 resolution with DataLoader, authentication/authorization directives, query complexity limits, schema evolution with deprecation, and testing via introspection.

## When to use

- User wants to design a new GraphQL API schema
- User asks for a review of existing GraphQL types, queries, or mutations
- User needs pagination (cursor-based Relay connections)
- User wants to solve N+1 query problems (DataLoader)
- User needs authentication or authorization in GraphQL
- User asks about rate limiting or query complexity analysis
- User wants to evolve a schema without breaking clients
- User needs error handling patterns (union result types)

## When NOT to use

- User wants REST API design (use `api-design` skill)
- User needs a full backend framework tutorial (this is schema-focused)
- User asks about GraphQL subscriptions over WebSocket infrastructure (use `nginx-config` for proxy)
- User wants gRPC or tRPC schema design (different paradigm)
- User needs database schema design (use `database-review` skill)

## Procedure

### Step 1: Choose schema-first vs code-first

Decide the approach before writing any types. Both are valid; the choice depends on team workflow.

**Schema-first (SDL) -- recommended for new projects:**

Write `.graphql` files, then generate types and resolvers.

```graphql
# schema.graphql
type Query {
  user(id: ID!): User
  users(first: Int, after: String): UserConnection!
}

type Mutation {
  createUser(input: CreateUserInput!): CreateUserResult!
  updateUser(id: ID!, input: UpdateUserInput!): UpdateUserResult!
  deleteUser(id: ID!): DeleteUserResult!
}

type User {
  id: ID!
  email: String!
  name: String!
  role: Role!
  posts(first: Int, after: String): PostConnection!
  createdAt: DateTime!
  updatedAt: DateTime!
}

enum Role {
  USER
  ADMIN
  MODERATOR
}

scalar DateTime
```

Generate types with codegen:

```yaml
# codegen.ts
import type { CodegenConfig } from '@graphql-codegen/cli';

const config: CodegenConfig = {
  schema: 'src/schema/**/*.graphql',
  generates: {
    'src/generated/types.ts': {
      plugins: ['typescript', 'typescript-resolvers'],
      config: {
        contextType: '../context#Context',
        mappers: {
          User: '../models#UserModel',
          Post: '../models#PostModel',
        },
      },
    },
  },
};
export default config;
```

**Code-first (Pothos/Nexus) -- recommended for TypeScript-heavy teams:**

```typescript
// src/schema/user.ts
import { builder } from '../builder';

const RoleEnum = builder.enumType('Role', {
  values: ['USER', 'ADMIN', 'MODERATOR'] as const,
});

builder.prismaObject('User', {
  fields: (t) => ({
    id: t.exposeID('id'),
    email: t.exposeString('email'),
    name: t.exposeString('name'),
    role: t.expose('role', { type: RoleEnum }),
    posts: t.relatedConnection('posts', {
      cursor: 'id',
      totalCount: true,
    }),
    createdAt: t.expose('createdAt', { type: 'DateTime' }),
    updatedAt: t.expose('updatedAt', { type: 'DateTime' }),
  }),
});
```

### Step 2: Design types (Query, Mutation, Subscription)

Follow naming conventions and keep the schema predictable.

**Naming conventions:**

| Element | Convention | Example |
|---|---|---|
| Types | PascalCase, noun | `User`, `OrderItem` |
| Fields | camelCase | `firstName`, `createdAt` |
| Enums | SCREAMING_SNAKE_CASE values | `PENDING`, `IN_PROGRESS` |
| Inputs | `{Action}{Type}Input` | `CreateUserInput`, `UpdatePostInput` |
| Mutations | `{verb}{noun}` | `createUser`, `deletePost` |
| Connections | `{Type}Connection` | `UserConnection` |
| Edges | `{Type}Edge` | `UserEdge` |

**Input types -- always use dedicated input objects for mutations:**

```graphql
input CreateUserInput {
  email: String!
  name: String!
  role: Role = USER
}

input UpdateUserInput {
  email: String
  name: String
  role: Role
}

# Filtering input
input UserFilter {
  role: Role
  search: String
  createdAfter: DateTime
  createdBefore: DateTime
}

type Query {
  users(
    first: Int = 20
    after: String
    filter: UserFilter
    orderBy: UserOrderBy = CREATED_AT_DESC
  ): UserConnection!
}

enum UserOrderBy {
  CREATED_AT_ASC
  CREATED_AT_DESC
  NAME_ASC
  NAME_DESC
}
```

### Step 3: Connections and pagination (Relay cursor)

Always use cursor-based pagination for lists. Offset pagination breaks when data changes between pages.

**Relay connection spec:**

```graphql
type UserConnection {
  edges: [UserEdge!]!
  pageInfo: PageInfo!
  totalCount: Int!
}

type UserEdge {
  cursor: String!
  node: User!
}

type PageInfo {
  hasNextPage: Boolean!
  hasPreviousPage: Boolean!
  startCursor: String
  endCursor: String
}
```

**Resolver implementation:**

```typescript
import { encodeCursor, decodeCursor } from '../utils/cursor';

const resolvers = {
  Query: {
    users: async (_parent, args, ctx) => {
      const { first = 20, after, filter } = args;
      const limit = Math.min(first, 100); // Cap at 100

      const where: Prisma.UserWhereInput = {};
      if (filter?.role) where.role = filter.role;
      if (filter?.search) {
        where.OR = [
          { name: { contains: filter.search, mode: 'insensitive' } },
          { email: { contains: filter.search, mode: 'insensitive' } },
        ];
      }

      let cursor: Prisma.UserWhereUniqueInput | undefined;
      if (after) {
        cursor = { id: decodeCursor(after) };
      }

      const users = await ctx.prisma.user.findMany({
        where,
        take: limit + 1, // Fetch one extra to determine hasNextPage
        cursor,
        skip: cursor ? 1 : 0, // Skip the cursor itself
        orderBy: { createdAt: 'desc' },
      });

      const hasNextPage = users.length > limit;
      const nodes = hasNextPage ? users.slice(0, limit) : users;

      const edges = nodes.map((user) => ({
        cursor: encodeCursor(user.id),
        node: user,
      }));

      const totalCount = await ctx.prisma.user.count({ where });

      return {
        edges,
        pageInfo: {
          hasNextPage,
          hasPreviousPage: !!after,
          startCursor: edges[0]?.cursor ?? null,
          endCursor: edges[edges.length - 1]?.cursor ?? null,
        },
        totalCount,
      };
    },
  },
};
```

**Cursor encoding:**

```typescript
export function encodeCursor(id: string): string {
  return Buffer.from(`cursor:${id}`).toString('base64url');
}

export function decodeCursor(cursor: string): string {
  const decoded = Buffer.from(cursor, 'base64url').toString('utf8');
  if (!decoded.startsWith('cursor:')) {
    throw new Error('Invalid cursor format');
  }
  return decoded.slice(7);
}
```

### Step 4: Input validation

Validate inputs at the schema level and in resolvers. Never trust client input.

**Schema-level validation with custom scalars:**

```graphql
scalar EmailAddress   # Validates email format
scalar PositiveInt    # Validates positive integers
scalar URL            # Validates URL format

input CreateUserInput {
  email: EmailAddress!
  name: String!           # Validated in resolver
  age: PositiveInt
  website: URL
}
```

**Resolver-level validation:**

```typescript
import { z } from 'zod';
import { GraphQLError } from 'graphql';

const CreateUserSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1).max(100).trim(),
  role: z.enum(['USER', 'ADMIN', 'MODERATOR']).default('USER'),
});

const resolvers = {
  Mutation: {
    createUser: async (_parent, { input }, ctx) => {
      const parsed = CreateUserSchema.safeParse(input);

      if (!parsed.success) {
        throw new GraphQLError('Validation failed', {
          extensions: {
            code: 'BAD_USER_INPUT',
            validationErrors: parsed.error.flatten().fieldErrors,
          },
        });
      }

      // Check uniqueness
      const existing = await ctx.prisma.user.findUnique({
        where: { email: parsed.data.email },
      });
      if (existing) {
        return { __typename: 'DuplicateEmailError', email: parsed.data.email };
      }

      const user = await ctx.prisma.user.create({ data: parsed.data });
      return { __typename: 'CreateUserSuccess', user };
    },
  },
};
```

### Step 5: Error handling with union types

Return errors as data, not as thrown exceptions. This gives clients typed error handling.

**Result union pattern:**

```graphql
type CreateUserSuccess {
  user: User!
}

type DuplicateEmailError {
  email: String!
  message: String!
}

type ValidationError {
  field: String!
  message: String!
}

union CreateUserResult = CreateUserSuccess | DuplicateEmailError | ValidationError

type Mutation {
  createUser(input: CreateUserInput!): CreateUserResult!
}
```

**Client-side handling:**

```graphql
mutation CreateUser($input: CreateUserInput!) {
  createUser(input: $input) {
    ... on CreateUserSuccess {
      user {
        id
        email
        name
      }
    }
    ... on DuplicateEmailError {
      email
      message
    }
    ... on ValidationError {
      field
      message
    }
  }
}
```

**Error extensions for unexpected errors:**

```typescript
throw new GraphQLError('User not found', {
  extensions: {
    code: 'NOT_FOUND',
    argumentName: 'id',
    http: { status: 404 },
  },
});
```

### Step 6: N+1 resolution with DataLoader

Every resolver that fetches related data must use DataLoader to batch queries.

**DataLoader setup:**

```typescript
import DataLoader from 'dataloader';

// Create loaders per request (in context factory)
export function createLoaders(prisma: PrismaClient) {
  return {
    userById: new DataLoader<string, User | null>(async (ids) => {
      const users = await prisma.user.findMany({
        where: { id: { in: [...ids] } },
      });
      const userMap = new Map(users.map((u) => [u.id, u]));
      return ids.map((id) => userMap.get(id) ?? null);
    }),

    postsByAuthorId: new DataLoader<string, Post[]>(async (authorIds) => {
      const posts = await prisma.post.findMany({
        where: { authorId: { in: [...authorIds] } },
      });
      const grouped = new Map<string, Post[]>();
      for (const post of posts) {
        const existing = grouped.get(post.authorId) ?? [];
        existing.push(post);
        grouped.set(post.authorId, existing);
      }
      return authorIds.map((id) => grouped.get(id) ?? []);
    }),
  };
}

// Context type
interface Context {
  prisma: PrismaClient;
  loaders: ReturnType<typeof createLoaders>;
  user: AuthUser | null;
}
```

**Using DataLoader in resolvers:**

```typescript
const resolvers = {
  Post: {
    author: (post, _args, ctx) => {
      return ctx.loaders.userById.load(post.authorId);
    },
  },
  User: {
    posts: (user, _args, ctx) => {
      return ctx.loaders.postsByAuthorId.load(user.id);
    },
  },
};
```

### Step 7: Authentication and authorization

Use context for authentication and directives for declarative authorization.

**Context-based auth:**

```typescript
// src/context.ts
import { verify } from 'jsonwebtoken';

export async function createContext({ req }): Promise<Context> {
  const token = req.headers.authorization?.replace('Bearer ', '');
  let user: AuthUser | null = null;

  if (token) {
    try {
      const payload = verify(token, process.env.JWT_SECRET!) as JwtPayload;
      user = await prisma.user.findUnique({ where: { id: payload.sub } });
    } catch {
      // Invalid token -- user remains null
    }
  }

  return {
    prisma,
    loaders: createLoaders(prisma),
    user,
  };
}
```

**Authorization directive (schema-first):**

```graphql
directive @auth(requires: Role = USER) on FIELD_DEFINITION | OBJECT

type Query {
  me: User @auth
  users: UserConnection! @auth(requires: ADMIN)
}

type Mutation {
  deleteUser(id: ID!): DeleteUserResult! @auth(requires: ADMIN)
}
```

**Directive implementation:**

```typescript
import { mapSchema, getDirective, MapperKind } from '@graphql-tools/utils';
import { defaultFieldResolver, GraphQLError } from 'graphql';

export function authDirective(schema: GraphQLSchema): GraphQLSchema {
  return mapSchema(schema, {
    [MapperKind.OBJECT_FIELD]: (fieldConfig) => {
      const directive = getDirective(schema, fieldConfig, 'auth')?.[0];
      if (!directive) return fieldConfig;

      const requiredRole = directive.requires || 'USER';
      const { resolve = defaultFieldResolver } = fieldConfig;

      fieldConfig.resolve = async (source, args, context, info) => {
        if (!context.user) {
          throw new GraphQLError('Not authenticated', {
            extensions: { code: 'UNAUTHENTICATED' },
          });
        }

        const roleHierarchy = { USER: 0, MODERATOR: 1, ADMIN: 2 };
        if (roleHierarchy[context.user.role] < roleHierarchy[requiredRole]) {
          throw new GraphQLError('Not authorized', {
            extensions: { code: 'FORBIDDEN', requiredRole },
          });
        }

        return resolve(source, args, context, info);
      };

      return fieldConfig;
    },
  });
}
```

### Step 8: Rate limiting with query complexity

Prevent expensive queries from overloading the server.

**Query complexity analysis:**

```typescript
import { createComplexityLimitRule } from 'graphql-validation-complexity';

// Define complexity per field
const complexityConfig = {
  scalarCost: 1,
  objectCost: 2,
  listFactor: 10, // Multiply by first/last argument
};

const complexityLimitRule = createComplexityLimitRule(1000, {
  ...complexityConfig,
  onCost: (cost) => {
    console.log(`Query complexity: ${cost}`);
  },
  formatErrorMessage: (cost) =>
    `Query complexity ${cost} exceeds maximum allowed complexity of 1000`,
});
```

**Depth limiting:**

```typescript
import depthLimit from 'graphql-depth-limit';

const server = new ApolloServer({
  schema,
  validationRules: [
    depthLimit(10), // Max 10 levels deep
    complexityLimitRule,
  ],
});
```

**Field-level cost annotation (code-first with Pothos):**

```typescript
builder.queryField('searchUsers', (t) =>
  t.field({
    type: UserConnection,
    complexity: ({ args }) => ({
      field: 5,
      multiplier: args.first ?? 20,
    }),
    args: {
      query: t.arg.string({ required: true }),
      first: t.arg.int({ defaultValue: 20 }),
      after: t.arg.string(),
    },
    resolve: async (_parent, args, ctx) => {
      // ... search implementation
    },
  })
);
```

### Step 9: Schema evolution and deprecation

Evolve the schema without breaking existing clients.

**Deprecation workflow:**

```graphql
type User {
  id: ID!
  email: String!
  name: String!

  # Deprecated -- use 'name' instead
  firstName: String @deprecated(reason: "Use 'name' field instead. Will be removed in v3.")
  lastName: String @deprecated(reason: "Use 'name' field instead. Will be removed in v3.")

  # New field with default for backwards compatibility
  displayName: String!
}
```

**Versioning strategy:**

1. Add new fields freely (non-breaking)
2. Deprecate old fields with `@deprecated` and a reason
3. Monitor usage of deprecated fields via analytics
4. Remove deprecated fields only when usage drops to zero

**Track deprecated field usage:**

```typescript
const plugin: ApolloServerPlugin = {
  requestDidStart: async () => ({
    executionDidStart: async () => ({
      willResolveField: ({ info }) => {
        const deprecated = info.parentType.getFields()[info.fieldName]?.deprecationReason;
        if (deprecated) {
          analytics.track('deprecated_field_usage', {
            field: `${info.parentType.name}.${info.fieldName}`,
            reason: deprecated,
            clientName: info.rootValue?.clientName,
          });
        }
      },
    }),
  }),
};
```

### Step 10: Testing with introspection

Test your schema programmatically using introspection queries and integration tests.

**Schema validation test:**

```typescript
import { buildSchema, getIntrospectionQuery, graphqlSync } from 'graphql';
import { describe, it, expect } from 'vitest';

describe('GraphQL Schema', () => {
  const schema = buildSchema(fs.readFileSync('schema.graphql', 'utf-8'));

  it('passes introspection', () => {
    const result = graphqlSync({ schema, source: getIntrospectionQuery() });
    expect(result.errors).toBeUndefined();
  });

  it('has required root types', () => {
    expect(schema.getQueryType()).toBeTruthy();
    expect(schema.getMutationType()).toBeTruthy();
  });

  it('all mutations return result union types', () => {
    const mutationType = schema.getMutationType()!;
    const fields = mutationType.getFields();

    for (const [name, field] of Object.entries(fields)) {
      const returnType = field.type;
      // Every mutation should return a union type for error handling
      expect(returnType.toString()).toMatch(/Result$/);
    }
  });

  it('all connections follow Relay spec', () => {
    const typeMap = schema.getTypeMap();
    const connections = Object.entries(typeMap).filter(([name]) =>
      name.endsWith('Connection')
    );

    for (const [name, type] of connections) {
      if (type instanceof GraphQLObjectType) {
        const fields = type.getFields();
        expect(fields.edges).toBeDefined();
        expect(fields.pageInfo).toBeDefined();
        expect(fields.totalCount).toBeDefined();
      }
    }
  });
});
```

**Integration test with SuperTest:**

```typescript
import request from 'supertest';

describe('User API', () => {
  it('creates a user and returns success', async () => {
    const response = await request(app)
      .post('/graphql')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        query: `
          mutation {
            createUser(input: { email: "test@example.com", name: "Test User" }) {
              ... on CreateUserSuccess {
                user { id email name }
              }
              ... on DuplicateEmailError {
                email message
              }
            }
          }
        `,
      });

    expect(response.status).toBe(200);
    expect(response.body.data.createUser.user).toBeDefined();
    expect(response.body.data.createUser.user.email).toBe('test@example.com');
  });

  it('paginates users with cursor', async () => {
    const response = await request(app)
      .post('/graphql')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        query: `
          query {
            users(first: 2) {
              edges {
                cursor
                node { id name }
              }
              pageInfo {
                hasNextPage
                endCursor
              }
              totalCount
            }
          }
        `,
      });

    expect(response.body.data.users.edges).toHaveLength(2);
    expect(response.body.data.users.pageInfo.hasNextPage).toBe(true);
  });
});
```

## Anti-patterns

| Anti-pattern | Why it is wrong | Fix |
|---|---|---|
| Deeply nested queries (>5 levels) | Exponential data fetching; can crash server | Use depth limiting and query complexity |
| No pagination on list fields | Unbounded result sets; OOM on large tables | Always use connections with `first`/`after` |
| Exposing internal errors to clients | Stack traces leak implementation details | Use union result types; sanitize error extensions |
| No DataLoader | N+1 queries; one SQL per item in a list | Batch with DataLoader for every relationship |
| `ID` type for non-identifiers | Misleads clients about field semantics | Use `String` or `Int` for non-identifier fields |
| Giant input types | Hard to validate; confusing for clients | Split into focused inputs per mutation |
| No `@deprecated` before removal | Breaks existing clients without warning | Always deprecate first, remove after monitoring |
| Exposing database columns directly | Couples schema to storage; blocks refactoring | Map domain types with explicit field resolvers |
| No rate limiting | Single expensive query can DoS the server | Use query complexity analysis + depth limit |
| Mutations without error unions | Forces clients to parse error strings | Return typed unions: `Success \| SpecificError` |

## Self-check

Before completing, verify all 12 items:

1. Schema uses consistent naming conventions (PascalCase types, camelCase fields)
2. All list fields use cursor-based pagination (Relay connections)
3. All mutations use dedicated input types (`CreateXInput`, `UpdateXInput`)
4. All mutations return union result types (success + typed errors)
5. DataLoader is used for every relationship resolver
6. Authentication is handled in context, authorization via directives
7. Query depth limit is configured (max 10)
8. Query complexity limit is configured (max 1000)
9. Custom scalars validate format (EmailAddress, URL, DateTime)
10. Deprecated fields have reasons and removal timeline
11. No internal error details leak to clients
12. Schema passes introspection test without errors

---
name: "redis-patterns"
description: "Designs Redis usage patterns — caching strategies, pub/sub, rate limiting, sessions, distributed locks, and data structures."
trust_tier: 2
trust_tier_label: "Validated"
validation:
  schema_path: schemas/output.json
  validator_path: scripts/validate-config.json
---

# redis-patterns

Design, implement, and review Redis usage patterns for production applications. Covers data structure selection, caching strategies, pub/sub eventing, sliding-window rate limiting, distributed locks (Redlock), session storage, and operational monitoring.

## When to use

- User wants to add caching to an application (cache-aside, write-through, write-behind)
- User needs to choose the right Redis data structure for their use case
- User asks about distributed locking (Redlock pattern)
- User wants pub/sub or Streams for event-driven messaging
- User needs rate limiting at the application layer
- User asks about Redis session storage for web applications
- User wants to monitor Redis performance (SLOWLOG, INFO, memory)
- User asks for a review of existing Redis usage code

## When NOT to use

- User needs a full message queue (use RabbitMQ, Kafka, or NATS)
- User wants a primary relational database (Redis is not a replacement for PostgreSQL)
- User asks about Redis Cluster partitioning strategy for 100+ nodes (needs dedicated architect)
- User needs graph database features (use Neo4j or RedisGraph module separately)
- User wants to store files or BLOBs (use S3 or object storage)

## Procedure

### Step 1: Choose the right data structure

Map the domain problem to the optimal Redis data structure. Using the wrong structure is the most common source of Redis performance issues.

**Decision matrix:**

| Use case | Data structure | Why |
|---|---|---|
| Simple key-value cache | String | Fastest. O(1) get/set. Supports atomic increment. |
| Object with multiple fields | Hash | Memory-efficient for objects. Update single fields without rewriting entire value. |
| Recent activity feed | List | O(1) push/pop. Natural FIFO/LIFO. `LTRIM` for bounded lists. |
| Unique tags, followers | Set | O(1) membership check. Supports union/intersection/difference. |
| Leaderboards, priority queues | Sorted Set | O(log n) insert. Range queries by score. Perfect for rankings. |
| Event log, message queue | Stream | Consumer groups, acknowledgment, replay. Persistent message log. |
| Unique visitor count | HyperLogLog | O(1) add, ~0.81% error. 12KB per counter regardless of cardinality. |
| Feature flags, bloom filter | Bitmap / Bloom | Bit-level operations. RedisBloom module for probabilistic membership. |

**ioredis examples for each structure:**

```typescript
import Redis from 'ioredis';
const redis = new Redis({ host: '127.0.0.1', port: 6379 });

// String -- simple cache
await redis.set('user:1001:name', 'Alice', 'EX', 3600);
const name = await redis.get('user:1001:name');

// Hash -- user profile
await redis.hset('user:1001', { name: 'Alice', email: 'alice@example.com', role: 'admin' });
const email = await redis.hget('user:1001', 'email');
const profile = await redis.hgetall('user:1001');

// List -- recent notifications (keep last 100)
await redis.lpush('user:1001:notifications', JSON.stringify({ type: 'mention', text: '...' }));
await redis.ltrim('user:1001:notifications', 0, 99);
const recent = await redis.lrange('user:1001:notifications', 0, 9);

// Set -- user's followed topics
await redis.sadd('user:1001:topics', 'redis', 'nodejs', 'typescript');
const follows = await redis.sismember('user:1001:topics', 'redis'); // 1

// Sorted Set -- leaderboard
await redis.zadd('leaderboard:weekly', 1500, 'player:42');
await redis.zadd('leaderboard:weekly', 2300, 'player:7');
const top10 = await redis.zrevrange('leaderboard:weekly', 0, 9, 'WITHSCORES');

// Stream -- event log
await redis.xadd('events:orders', '*', 'action', 'created', 'order_id', '9001');

// HyperLogLog -- unique visitors
await redis.pfadd('visitors:2024-01-15', 'user:1001', 'user:1002');
const uniqueCount = await redis.pfcount('visitors:2024-01-15');
```

### Step 2: Implement caching patterns

Choose the caching strategy that matches your consistency requirements.

**Cache-aside (lazy loading) -- most common:**

```typescript
async function getUserById(id: string): Promise<User> {
  const cacheKey = `user:${id}`;

  // 1. Check cache
  const cached = await redis.get(cacheKey);
  if (cached) {
    return JSON.parse(cached);
  }

  // 2. Cache miss -- load from database
  const user = await db.query('SELECT * FROM users WHERE id = $1', [id]);

  // 3. Populate cache with TTL
  if (user) {
    await redis.set(cacheKey, JSON.stringify(user), 'EX', 3600);
  }

  return user;
}

// Invalidation on write
async function updateUser(id: string, data: Partial<User>): Promise<void> {
  await db.query('UPDATE users SET ... WHERE id = $1', [id]);
  await redis.del(`user:${id}`); // Invalidate cache
}
```

**Write-through -- strong consistency:**

```typescript
async function updateUserWriteThrough(id: string, data: Partial<User>): Promise<void> {
  // 1. Write to database
  const updated = await db.query('UPDATE users SET ... WHERE id = $1 RETURNING *', [id]);

  // 2. Write to cache (same transaction boundary)
  await redis.set(`user:${id}`, JSON.stringify(updated), 'EX', 3600);
}
```

**Write-behind (async) -- high write throughput:**

```typescript
async function recordPageView(pageId: string): Promise<void> {
  // 1. Write to Redis immediately (fast)
  await redis.hincrby(`pageviews:${pageId}`, 'count', 1);
  await redis.sadd('pageviews:dirty', pageId);

  // 2. Background worker flushes to DB periodically
}

// Background flush worker (runs every 30 seconds)
async function flushPageViews(): Promise<void> {
  const dirtyPages = await redis.smembers('pageviews:dirty');
  for (const pageId of dirtyPages) {
    const count = await redis.hget(`pageviews:${pageId}`, 'count');
    await db.query('UPDATE pages SET views = views + $1 WHERE id = $2', [count, pageId]);
    await redis.hset(`pageviews:${pageId}`, 'count', '0');
    await redis.srem('pageviews:dirty', pageId);
  }
}
```

### Step 3: TTL strategy

Every key MUST have a TTL. Unbounded keys are the number one cause of Redis memory exhaustion in production.

**TTL guidelines by data type:**

| Data type | Recommended TTL | Rationale |
|---|---|---|
| User session | 24h (86400s) | Matches typical session lifetime |
| API response cache | 5-15 min (300-900s) | Balance freshness vs load reduction |
| Database query cache | 1-4h (3600-14400s) | Depends on write frequency |
| Rate limit windows | Window size + 1s | Auto-cleanup after window expires |
| Distributed locks | Task timeout + buffer | Prevents deadlocks if holder crashes |
| Temporary tokens | Token lifetime | Reset codes, OTP, email verification |

**Implementing smart TTL with jitter:**

```typescript
// Add jitter to prevent thundering herd on cache expiration
function ttlWithJitter(baseTtlSeconds: number): number {
  const jitter = Math.floor(Math.random() * baseTtlSeconds * 0.1); // +/- 10%
  return baseTtlSeconds + jitter;
}

await redis.set('product:5001', JSON.stringify(product), 'EX', ttlWithJitter(3600));
```

**Proactive refresh before expiration:**

```typescript
async function getWithRefresh<T>(
  key: string,
  fetchFn: () => Promise<T>,
  ttlSeconds: number,
  refreshThreshold: number = 0.2 // Refresh when 20% of TTL remains
): Promise<T> {
  const [value, ttl] = await redis.pipeline()
    .get(key)
    .ttl(key)
    .exec();

  if (value[1]) {
    // Proactively refresh if close to expiration
    if (ttl[1] < ttlSeconds * refreshThreshold) {
      fetchFn().then(fresh =>
        redis.set(key, JSON.stringify(fresh), 'EX', ttlWithJitter(ttlSeconds))
      );
    }
    return JSON.parse(value[1] as string);
  }

  const fresh = await fetchFn();
  await redis.set(key, JSON.stringify(fresh), 'EX', ttlWithJitter(ttlSeconds));
  return fresh;
}
```

### Step 4: Pub/Sub for real-time events

Use Redis Pub/Sub for lightweight real-time messaging. For durable messaging, prefer Streams (Step 1).

**Publisher:**

```typescript
// Publish domain events
async function publishOrderEvent(order: Order, action: string): Promise<void> {
  const event = {
    action,
    orderId: order.id,
    userId: order.userId,
    total: order.total,
    timestamp: Date.now(),
  };
  await redis.publish('events:orders', JSON.stringify(event));
}
```

**Subscriber:**

```typescript
const subscriber = new Redis();

subscriber.subscribe('events:orders', 'events:payments', (err, count) => {
  console.log(`Subscribed to ${count} channels`);
});

subscriber.on('message', (channel, message) => {
  const event = JSON.parse(message);
  switch (channel) {
    case 'events:orders':
      handleOrderEvent(event);
      break;
    case 'events:payments':
      handlePaymentEvent(event);
      break;
  }
});
```

**Pattern subscription:**

```typescript
subscriber.psubscribe('events:*', (err, count) => {
  console.log(`Pattern-subscribed to ${count} patterns`);
});

subscriber.on('pmessage', (pattern, channel, message) => {
  console.log(`[${channel}] ${message}`);
});
```

### Step 5: Rate limiting with sliding window

Implement precise sliding-window rate limiting using sorted sets.

**Sliding window rate limiter:**

```typescript
async function isRateLimited(
  identifier: string,
  limit: number,
  windowSeconds: number
): Promise<{ limited: boolean; remaining: number; retryAfter: number }> {
  const key = `ratelimit:${identifier}`;
  const now = Date.now();
  const windowStart = now - windowSeconds * 1000;

  const results = await redis.pipeline()
    // Remove expired entries
    .zremrangebyscore(key, 0, windowStart)
    // Count entries in current window
    .zcard(key)
    // Add current request
    .zadd(key, now.toString(), `${now}:${Math.random()}`)
    // Set TTL on the key
    .expire(key, windowSeconds + 1)
    .exec();

  const currentCount = results![1][1] as number;

  if (currentCount >= limit) {
    // Get oldest entry to calculate retry-after
    const oldest = await redis.zrange(key, 0, 0, 'WITHSCORES');
    const retryAfter = oldest.length
      ? Math.ceil((parseInt(oldest[1]) + windowSeconds * 1000 - now) / 1000)
      : windowSeconds;

    return { limited: true, remaining: 0, retryAfter };
  }

  return {
    limited: false,
    remaining: limit - currentCount - 1,
    retryAfter: 0,
  };
}

// Usage in Express middleware
async function rateLimitMiddleware(req: Request, res: Response, next: NextFunction) {
  const identifier = req.ip || req.headers['x-forwarded-for'] as string;
  const result = await isRateLimited(identifier, 100, 60); // 100 req/min

  res.setHeader('X-RateLimit-Limit', '100');
  res.setHeader('X-RateLimit-Remaining', result.remaining.toString());

  if (result.limited) {
    res.setHeader('Retry-After', result.retryAfter.toString());
    return res.status(429).json({ error: 'Too many requests' });
  }

  next();
}
```

### Step 6: Distributed locks with Redlock

Implement safe distributed locking using the Redlock algorithm.

**Single-instance lock (most applications):**

```typescript
async function acquireLock(
  resource: string,
  ttlMs: number = 10000
): Promise<string | null> {
  const lockKey = `lock:${resource}`;
  const lockValue = crypto.randomUUID(); // Unique value to prevent wrong unlock

  const acquired = await redis.set(lockKey, lockValue, 'PX', ttlMs, 'NX');

  return acquired === 'OK' ? lockValue : null;
}

async function releaseLock(resource: string, lockValue: string): Promise<boolean> {
  const lockKey = `lock:${resource}`;

  // Lua script ensures atomic check-and-delete
  const script = `
    if redis.call("get", KEYS[1]) == ARGV[1] then
      return redis.call("del", KEYS[1])
    else
      return 0
    end
  `;

  const result = await redis.eval(script, 1, lockKey, lockValue);
  return result === 1;
}

// Usage
async function processPayment(orderId: string): Promise<void> {
  const lockValue = await acquireLock(`payment:${orderId}`, 30000);
  if (!lockValue) {
    throw new Error('Could not acquire lock -- payment already being processed');
  }

  try {
    await executePayment(orderId);
  } finally {
    await releaseLock(`payment:${orderId}`, lockValue);
  }
}
```

**Redlock with ioredis (multi-instance):**

```typescript
import Redlock from 'redlock';

const redlock = new Redlock(
  [
    new Redis({ host: 'redis-1', port: 6379 }),
    new Redis({ host: 'redis-2', port: 6379 }),
    new Redis({ host: 'redis-3', port: 6379 }),
  ],
  {
    driftFactor: 0.01,
    retryCount: 10,
    retryDelay: 200,
    retryJitter: 200,
    automaticExtensionThreshold: 500,
  }
);

async function processWithRedlock(orderId: string): Promise<void> {
  let lock = await redlock.acquire([`lock:payment:${orderId}`], 30000);

  try {
    // Extend lock if processing takes longer than expected
    lock = await lock.extend(30000);
    await executePayment(orderId);
  } finally {
    await lock.release();
  }
}
```

### Step 7: Session storage

Store web sessions in Redis for horizontal scaling across application instances.

**Express session with connect-redis:**

```typescript
import session from 'express-session';
import RedisStore from 'connect-redis';
import Redis from 'ioredis';

const redisClient = new Redis({
  host: process.env.REDIS_HOST || '127.0.0.1',
  port: 6379,
  password: process.env.REDIS_PASSWORD,
  db: 1, // Separate DB for sessions
  retryStrategy: (times: number) => Math.min(times * 50, 2000),
});

const store = new RedisStore({
  client: redisClient,
  prefix: 'sess:',
  ttl: 86400,           // 24 hours
  disableTouch: false,   // Refresh TTL on access
});

app.use(session({
  store,
  secret: process.env.SESSION_SECRET!,
  resave: false,
  saveUninitialized: false,
  name: 'sid',
  cookie: {
    secure: true,
    httpOnly: true,
    maxAge: 86400000,
    sameSite: 'lax',
  },
}));
```

**Manual session management:**

```typescript
interface SessionData {
  userId: string;
  role: string;
  lastAccess: number;
  metadata: Record<string, unknown>;
}

async function createSession(userId: string, data: Partial<SessionData>): Promise<string> {
  const sessionId = crypto.randomUUID();
  const sessionData: SessionData = {
    userId,
    role: data.role || 'user',
    lastAccess: Date.now(),
    metadata: data.metadata || {},
  };

  await redis.set(
    `session:${sessionId}`,
    JSON.stringify(sessionData),
    'EX', 86400
  );

  // Track active sessions per user
  await redis.sadd(`user:${userId}:sessions`, sessionId);

  return sessionId;
}

async function destroyAllSessions(userId: string): Promise<void> {
  const sessions = await redis.smembers(`user:${userId}:sessions`);
  if (sessions.length > 0) {
    const pipeline = redis.pipeline();
    sessions.forEach(sid => pipeline.del(`session:${sid}`));
    pipeline.del(`user:${userId}:sessions`);
    await pipeline.exec();
  }
}
```

### Step 8: Monitoring and operations

Monitor Redis health and catch issues before they affect users.

**Essential INFO commands:**

```bash
# Memory usage
redis-cli INFO memory
# used_memory_human, maxmemory, mem_fragmentation_ratio

# Connected clients
redis-cli INFO clients
# connected_clients, blocked_clients

# Key statistics
redis-cli INFO keyspace
# db0:keys=15234,expires=14200,avg_ttl=3600000

# Slow queries
redis-cli SLOWLOG GET 10

# Monitor commands in real-time (use briefly -- impacts performance)
redis-cli MONITOR
```

**ioredis health check:**

```typescript
async function redisHealthCheck(): Promise<{
  healthy: boolean;
  latencyMs: number;
  memoryUsedMB: number;
  connectedClients: number;
  keysWithoutTTL: number;
}> {
  const start = Date.now();
  await redis.ping();
  const latencyMs = Date.now() - start;

  const info = await redis.info('memory');
  const memMatch = info.match(/used_memory:(\d+)/);
  const memoryUsedMB = memMatch ? parseInt(memMatch[1]) / 1024 / 1024 : 0;

  const clientInfo = await redis.info('clients');
  const clientMatch = clientInfo.match(/connected_clients:(\d+)/);
  const connectedClients = clientMatch ? parseInt(clientMatch[1]) : 0;

  // Check for keys without TTL (potential memory leak)
  const dbInfo = await redis.info('keyspace');
  const dbMatch = dbInfo.match(/keys=(\d+),expires=(\d+)/);
  const totalKeys = dbMatch ? parseInt(dbMatch[1]) : 0;
  const keysWithExpiry = dbMatch ? parseInt(dbMatch[2]) : 0;

  return {
    healthy: latencyMs < 100,
    latencyMs,
    memoryUsedMB: Math.round(memoryUsedMB * 100) / 100,
    connectedClients,
    keysWithoutTTL: totalKeys - keysWithExpiry,
  };
}
```

**Memory analysis:**

```bash
# Find big keys (non-blocking scan)
redis-cli --bigkeys

# Memory usage of a specific key
redis-cli MEMORY USAGE "user:1001"

# Scan for keys without TTL
redis-cli --scan --pattern '*' | while read key; do
  ttl=$(redis-cli TTL "$key")
  if [ "$ttl" = "-1" ]; then
    echo "NO TTL: $key"
  fi
done
```

## Anti-patterns

| Anti-pattern | Why it is wrong | Fix |
|---|---|---|
| No TTL on cache keys | Memory grows unbounded until OOM | Always set `EX`/`PX` on every `SET` call |
| Using `KEYS *` in production | O(n) blocking scan; freezes Redis for all clients | Use `SCAN` with cursor-based iteration |
| Big keys (>1MB values) | Blocks event loop during serialization; causes latency spikes | Split into smaller keys or use hash fields |
| No persistence configuration | Data lost on restart; sessions/locks vanish | Configure AOF (`appendonly yes`) or RDB snapshots |
| Single Redis for everything | Cache eviction removes sessions; one failure mode | Use separate Redis instances or DB numbers per concern |
| Storing entire objects when only one field needed | Wastes memory and bandwidth | Use Hash fields: `HGET` instead of `GET` + parse |
| No connection pooling | New TCP connection per request | Use ioredis connection pool or single long-lived connection |
| Pub/Sub without subscriber health checks | Messages silently lost if subscriber disconnects | Implement reconnect logic; use Streams for durability |

## Self-check

Before completing, verify all 10 items:

1. Every key has a defined TTL strategy (no unbounded keys)
2. Data structure choice matches the access pattern (not everything is a String)
3. Caching pattern is explicit (cache-aside, write-through, or write-behind)
4. TTL uses jitter to prevent thundering herd
5. Rate limiting uses sliding window (not simple counter)
6. Distributed locks use unique values and atomic release (Lua script)
7. Session storage uses a dedicated Redis DB or instance
8. `KEYS *` is never used in application code (only `SCAN`)
9. Connection pooling or persistent connections are configured
10. Monitoring covers memory, latency, and keys-without-TTL

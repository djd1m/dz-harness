---
name: "database-migration"
description: "Plans and executes database migrations — schema changes, data migrations, zero-downtime strategies, and rollback plans."
trust_tier: 2
trust_tier_label: "Validated"
validation:
  schema_path: schemas/output.json
  validator_path: scripts/validate-config.json
---

# database-migration

Plan and execute database migrations safely, from simple column additions to large-table schema changes. Every step produces a concrete artifact: a migration file, a rollback plan, a timing estimate, or a deployment checklist. The goal is to evolve the database schema without downtime, data loss, or surprises in production.

## When to use

- Adding, renaming, or dropping columns on a production table
- Changing column types or adding constraints
- Running data backfills or ETL-style transformations
- Planning a zero-downtime migration for a high-traffic table
- Choosing between migration tools (Flyway, Prisma, Knex, Alembic)
- Migrating a large table (100M+ rows) without locking
- Writing rollback plans for irreversible schema changes
- Coordinating migration timing with application deploys

## When NOT to use

- Reviewing SQL query performance (use the database-review skill)
- Designing a database schema from scratch (use the api-design or data-pipeline skill)
- Setting up database replication or failover (use an infrastructure skill)
- Debugging a production database outage (use the incident-response skill)

## Procedure

### Step 1: Migration Tools

Choose the right migration tool for your stack. All tools in this table follow the same core pattern: numbered migration files applied in order, with up/down operations.

**Tool comparison:**

| Tool | Language | Database support | Versioning | Rollback | Best for |
|------|----------|-----------------|-----------|----------|----------|
| Flyway | Java (CLI for any) | PostgreSQL, MySQL, Oracle, SQL Server, 20+ | Numbered (V1, V2) | Undo migrations (Teams+) | JVM projects, enterprise |
| Liquibase | Java (CLI for any) | PostgreSQL, MySQL, Oracle, SQL Server, 30+ | Changelog (XML/YAML/JSON/SQL) | Auto-rollback from changelog | Complex enterprise, multi-DB |
| Prisma Migrate | TypeScript | PostgreSQL, MySQL, SQLite, SQL Server, MongoDB | Timestamped directories | Manual (create down migration) | TypeScript/Node.js projects |
| Knex | JavaScript/TS | PostgreSQL, MySQL, SQLite, Oracle, MSSQL | Timestamped files | `exports.down` function | Node.js projects, manual SQL control |
| Alembic | Python | PostgreSQL, MySQL, SQLite, Oracle (via SQLAlchemy) | Revision chain (hash-based) | `downgrade()` function | Python/SQLAlchemy projects |
| Django Migrations | Python | PostgreSQL, MySQL, SQLite, Oracle | Auto-numbered per app | Auto-generated reverse | Django projects |
| golang-migrate | Go | PostgreSQL, MySQL, SQLite, MongoDB, 15+ | Numbered (000001_name) | Down files | Go projects |
| dbmate | Any (CLI) | PostgreSQL, MySQL, SQLite, ClickHouse | Timestamped SQL files | Down section in same file | Polyglot teams, simple SQL |

**Key selection criteria:**

1. **Match your application language** -- using Knex in a Go project adds unnecessary complexity
2. **Check database support** -- ensure your specific database version is supported
3. **Evaluate rollback support** -- some tools generate rollbacks automatically, others require manual down migrations
4. **Consider CI/CD integration** -- the tool must run in headless mode in your pipeline
5. **Team familiarity** -- the tool your team already knows is often the best choice

**Migration file example (Knex):**

```typescript
// migrations/20260603_add_payment_profile.ts
import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('users', (table) => {
    table.uuid('payment_profile_id').nullable();
    table.index('payment_profile_id');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('users', (table) => {
    table.dropIndex('payment_profile_id');
    table.dropColumn('payment_profile_id');
  });
}
```

### Step 2: Migration Types

Understand the four types of migrations and when each is appropriate.

| Type | What it does | SQL category | Locking risk | Example |
|------|-------------|-------------|-------------|---------|
| Schema (DDL) | Changes table structure | `ALTER TABLE`, `CREATE TABLE`, `DROP TABLE` | High (depends on operation) | Add column, create index |
| Data (DML) | Modifies row data | `UPDATE`, `INSERT`, `DELETE` | Medium (row-level locks) | Backfill a new column, fix corrupt data |
| Seed | Populates reference/lookup data | `INSERT` | Low | Insert country codes, permission types |
| Rollback | Reverses a previous migration | Inverse of the original | Same as original | Drop column that was added |

**When to use each:**

- **Schema migration:** Every structural change to the database. Always versioned, always reviewed
- **Data migration:** When a schema change requires existing rows to be updated. Often paired with a schema migration
- **Seed migration:** Initial data load for lookup tables, enums stored in the DB, or test fixtures
- **Rollback migration:** Always write one, even if you hope never to use it. Some changes (dropping a column) are irreversible -- document that

**Migration ordering rules:**

1. Schema changes that add (expand) go first
2. Application code deploys that use the new schema
3. Data migrations to backfill
4. Schema changes that remove (contract) go last, after all code stops using the old schema

### Step 3: Zero-Downtime Strategy

The expand-contract pattern is the foundation of zero-downtime migrations. Never make a breaking schema change in a single step.

**Expand-Contract Pattern:**

```
Phase 1: EXPAND        Phase 2: MIGRATE       Phase 3: CONTRACT
─────────────────      ──────────────────      ──────────────────
Add new column         Backfill data           Drop old column
(nullable, no default) Deploy new code         Remove old code paths
Keep old column        Dual-write to both      Clean up
Deploy compatible code Stop reading old
```

**Example: Renaming a column (`email` -> `email_address`):**

```sql
-- Step 1: EXPAND — Add new column
ALTER TABLE users ADD COLUMN email_address VARCHAR(255);

-- Step 2: BACKFILL — Copy data
UPDATE users SET email_address = email WHERE email_address IS NULL;

-- Step 3: DUAL-WRITE — Application writes to both columns
-- (deploy code change)

-- Step 4: SWITCH-READ — Application reads from new column
-- (deploy code change)

-- Step 5: STOP-WRITE — Application only writes new column
-- (deploy code change)

-- Step 6: CONTRACT — Drop old column
ALTER TABLE users DROP COLUMN email;
```

**Online DDL tools for large tables:**

| Tool | Database | How it works | When to use |
|------|----------|-------------|-------------|
| `pt-online-schema-change` | MySQL | Creates shadow table, copies data via triggers, atomic rename | MySQL tables with >1M rows |
| `gh-ost` | MySQL | Creates shadow table, copies data via binlog, atomic rename (no triggers) | MySQL, when triggers are problematic |
| `pg_repack` | PostgreSQL | Rebuilds table online using logical replication | PostgreSQL table bloat, CLUSTER without lock |
| `ALTER TABLE ... CONCURRENTLY` | PostgreSQL | Native concurrent operations for some DDL | PostgreSQL index operations |
| Online DDL (InnoDB) | MySQL 8.0+ | Native online DDL for many operations | Simple MySQL ALTERs |

**Lock-free operations by database:**

| Operation | PostgreSQL | MySQL 8.0+ |
|-----------|-----------|------------|
| Add nullable column | No lock (instant) | No lock (instant) |
| Add column with default | No lock (PG 11+) | Rebuilds table (lock) |
| Drop column | Brief lock | Rebuilds table (lock) |
| Add index | `CONCURRENTLY` (no lock) | `ALGORITHM=INPLACE` |
| Change column type | Full table rewrite (lock) | Usually rebuilds (lock) |
| Rename column | Brief metadata lock | Brief metadata lock |

### Step 4: Column Operations

Each column operation has a safe pattern. Follow these recipes.

**ADD column (safe):**

```sql
-- PostgreSQL: instant for nullable columns (any version)
ALTER TABLE users ADD COLUMN payment_profile_id UUID;

-- PostgreSQL 11+: instant even with default
ALTER TABLE users ADD COLUMN status VARCHAR(20) NOT NULL DEFAULT 'active';

-- MySQL: instant for nullable columns at end of table
ALTER TABLE users ADD COLUMN payment_profile_id CHAR(36), ALGORITHM=INSTANT;
```

**RENAME column (2-step):**

Never rename in one step. Use the expand-contract pattern:

```sql
-- Step 1: Add new column
ALTER TABLE orders ADD COLUMN total_amount DECIMAL(10,2);

-- Step 2: Backfill (in batches, see Step 6)
UPDATE orders SET total_amount = amount WHERE total_amount IS NULL;

-- Step 3: Deploy code that writes both, reads new
-- Step 4: Deploy code that only uses new column
-- Step 5: Drop old column
ALTER TABLE orders DROP COLUMN amount;
```

**DROP column (2-step):**

Never drop a column that code still references.

```sql
-- Step 1: Deploy code that no longer reads or writes the column
-- Verify: grep codebase for column name, check ORM model, check stored procs

-- Step 2: Wait one full deploy cycle (ensure no rollback will need the column)

-- Step 3: Drop the column
ALTER TABLE users DROP COLUMN legacy_status;
```

**TYPE change (expand-contract):**

Changing a column type almost always locks the table. Use expand-contract:

```sql
-- Changing INT to BIGINT on a large table
-- Step 1: Add new column
ALTER TABLE events ADD COLUMN event_id_new BIGINT;

-- Step 2: Backfill in batches
-- Step 3: Dual-write
-- Step 4: Switch reads
-- Step 5: Drop old, rename new

-- For PostgreSQL, an alternative using a view:
-- ALTER TABLE events ALTER COLUMN event_id TYPE BIGINT;
-- This rewrites the table and locks it. Only safe for small tables.
```

### Step 5: Index Operations

Index creation and removal can lock tables if done incorrectly. Always use concurrent operations in production.

**CREATE INDEX safely:**

```sql
-- PostgreSQL: CONCURRENTLY avoids locking the table
-- Cannot run inside a transaction block
CREATE INDEX CONCURRENTLY idx_orders_customer_id ON orders (customer_id);

-- MySQL: INPLACE avoids copying the table (InnoDB)
ALTER TABLE orders ADD INDEX idx_orders_customer_id (customer_id), ALGORITHM=INPLACE, LOCK=NONE;
```

**Partial indexes (save space, improve performance):**

```sql
-- Only index active users (skip 90% of rows that are inactive)
CREATE INDEX CONCURRENTLY idx_users_active_email
  ON users (email)
  WHERE status = 'active';

-- Only index recent orders
CREATE INDEX CONCURRENTLY idx_orders_recent
  ON orders (created_at)
  WHERE created_at > '2026-01-01';
```

**Identify unused indexes:**

```sql
-- PostgreSQL: find indexes with zero scans
SELECT
  schemaname || '.' || relname AS table,
  indexrelname AS index,
  pg_size_pretty(pg_relation_size(i.indexrelid)) AS size,
  idx_scan AS scans
FROM pg_stat_user_indexes i
JOIN pg_index USING (indexrelid)
WHERE idx_scan = 0
  AND NOT indisunique  -- keep unique constraints
  AND NOT indisprimary -- keep primary keys
ORDER BY pg_relation_size(i.indexrelid) DESC;
```

**DROP unused indexes:**

```sql
-- PostgreSQL: CONCURRENTLY avoids locking
DROP INDEX CONCURRENTLY idx_orders_legacy_status;

-- Always verify the index is unused first (check pg_stat_user_indexes)
-- Always keep a CREATE INDEX statement ready for rollback
```

### Step 6: Data Backfill

Large data backfills must be batched to avoid locking the table for extended periods and overwhelming the database.

**Batch processing pattern:**

```sql
-- Backfill in batches of 10,000 rows
-- PostgreSQL example
DO $$
DECLARE
  batch_size INT := 10000;
  rows_updated INT;
  total_updated INT := 0;
BEGIN
  LOOP
    UPDATE users
    SET payment_profile_id = gen_random_uuid()
    WHERE id IN (
      SELECT id FROM users
      WHERE payment_profile_id IS NULL
      LIMIT batch_size
      FOR UPDATE SKIP LOCKED
    );

    GET DIAGNOSTICS rows_updated = ROW_COUNT;
    total_updated := total_updated + rows_updated;
    RAISE NOTICE 'Updated % rows (total: %)', rows_updated, total_updated;

    EXIT WHEN rows_updated = 0;

    -- Pause briefly to let other queries through
    PERFORM pg_sleep(0.1);
  END LOOP;
  RAISE NOTICE 'Backfill complete. Total rows updated: %', total_updated;
END $$;
```

**Application-level backfill (Node.js/Knex):**

```typescript
async function backfillPaymentProfiles(knex: Knex): Promise<void> {
  const BATCH_SIZE = 5000;
  let totalUpdated = 0;
  let batchCount = 0;

  while (true) {
    const rows = await knex('users')
      .whereNull('payment_profile_id')
      .limit(BATCH_SIZE)
      .select('id');

    if (rows.length === 0) break;

    const ids = rows.map((r) => r.id);
    await knex('users')
      .whereIn('id', ids)
      .update({ payment_profile_id: knex.raw('gen_random_uuid()') });

    totalUpdated += rows.length;
    batchCount++;

    console.log(`Batch ${batchCount}: updated ${rows.length} rows (total: ${totalUpdated})`);

    // Throttle to avoid overloading the database
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  console.log(`Backfill complete: ${totalUpdated} rows updated in ${batchCount} batches`);
}
```

**Idempotent backfills:**

Every backfill must be safe to run multiple times. If the process crashes halfway, restarting it should not corrupt data.

Rules:
- Use `WHERE column IS NULL` to skip already-backfilled rows
- Use `FOR UPDATE SKIP LOCKED` to avoid contention with concurrent writes
- Never use `UPDATE ... SET column = value` without a WHERE clause filtering already-done rows
- Log progress so you know where to investigate if something goes wrong

**Progress tracking:**

For long-running backfills (>1M rows), track progress:

```sql
-- Check progress
SELECT
  COUNT(*) FILTER (WHERE payment_profile_id IS NOT NULL) AS done,
  COUNT(*) FILTER (WHERE payment_profile_id IS NULL) AS remaining,
  COUNT(*) AS total,
  ROUND(100.0 * COUNT(*) FILTER (WHERE payment_profile_id IS NOT NULL) / COUNT(*), 2) AS percent_done
FROM users;
```

### Step 7: Rollback Plan

Every migration must have a rollback plan, documented before the migration runs.

**Reversible vs. irreversible operations:**

| Operation | Reversible? | Rollback method |
|-----------|------------|----------------|
| Add column | Yes | `DROP COLUMN` |
| Add index | Yes | `DROP INDEX` |
| Add constraint | Yes | `DROP CONSTRAINT` |
| Rename column | Yes (if dual-write) | Reverse rename or drop new column |
| Drop column | NO | Restore from backup or point-in-time recovery |
| Drop table | NO | Restore from backup |
| Truncate table | NO | Restore from backup |
| Data update | Maybe | Only if old values are preserved (shadow column or audit log) |

**Rollback plan template:**

```markdown
# Rollback Plan: [Migration Name]

**Migration:** 20260603_add_payment_profile
**Author:** @developer
**Reversible:** Yes / Partial / No

## Pre-migration backup
- [ ] pg_dump of affected table(s): `pg_dump -t users > users_backup_20260603.sql`
- [ ] Note current row count: `SELECT count(*) FROM users;`
- [ ] Verify backup is restorable: `pg_restore --list users_backup_20260603.sql`

## Rollback steps (if migration fails)
1. Run down migration: `knex migrate:down 20260603_add_payment_profile`
2. Verify column removed: `\d users` in psql
3. Deploy previous application version: `kubectl rollout undo deploy/api-server`
4. Verify application health: check error rate dashboard

## Rollback steps (if migration succeeds but causes issues)
1. Deploy code that stops using new column (feature flag off)
2. Run down migration
3. Monitor for 30 minutes

## Point-in-time recovery (nuclear option)
1. Stop all writes to the database
2. Restore from WAL: `pg_restore --target-time '2026-06-03 14:00:00 UTC'`
3. Verify data integrity
4. Resume writes

## Estimated rollback time: 5 minutes (down migration) / 2 hours (PITR)
```

**Automated rollback in CI/CD:**

```yaml
# GitHub Actions example
- name: Run migration
  id: migrate
  run: npx knex migrate:latest
  env:
    DATABASE_URL: ${{ secrets.DATABASE_URL }}

- name: Run smoke tests
  id: smoke
  run: npm run test:smoke
  continue-on-error: true

- name: Rollback on failure
  if: steps.smoke.outcome == 'failure'
  run: npx knex migrate:rollback
  env:
    DATABASE_URL: ${{ secrets.DATABASE_URL }}
```

### Step 8: Testing

Test migrations against production-like data before running them in production. The migration that works on your 100-row dev database may lock a 50M-row production table for 20 minutes.

**Migration testing checklist:**

- [ ] Run migration on a copy of production data (anonymized if needed)
- [ ] Measure execution time for each migration step
- [ ] Monitor lock wait times during the migration
- [ ] Verify the down migration (rollback) works cleanly
- [ ] Run the application test suite after the migration
- [ ] Check for constraint violations on real data

**Timing estimate on production-size data:**

```sql
-- PostgreSQL: check table size before migrating
SELECT
  pg_size_pretty(pg_total_relation_size('users')) AS total_size,
  pg_size_pretty(pg_relation_size('users')) AS table_size,
  pg_size_pretty(pg_indexes_size('users')) AS indexes_size,
  (SELECT count(*) FROM users) AS row_count;
```

**Lock monitoring during migration:**

```sql
-- PostgreSQL: monitor locks in real-time (run in a separate session)
SELECT
  pid,
  now() - pg_stat_activity.query_start AS duration,
  query,
  state,
  wait_event_type,
  wait_event
FROM pg_stat_activity
WHERE state != 'idle'
  AND query NOT LIKE '%pg_stat_activity%'
ORDER BY duration DESC;

-- Check for blocking locks
SELECT
  blocked.pid AS blocked_pid,
  blocked.query AS blocked_query,
  blocking.pid AS blocking_pid,
  blocking.query AS blocking_query,
  now() - blocked.query_start AS blocked_duration
FROM pg_stat_activity blocked
JOIN pg_locks bl ON bl.pid = blocked.pid
JOIN pg_locks kl ON kl.locktype = bl.locktype
  AND kl.database IS NOT DISTINCT FROM bl.database
  AND kl.relation IS NOT DISTINCT FROM bl.relation
  AND kl.page IS NOT DISTINCT FROM bl.page
  AND kl.tuple IS NOT DISTINCT FROM bl.tuple
  AND kl.transactionid IS NOT DISTINCT FROM bl.transactionid
  AND kl.classid IS NOT DISTINCT FROM bl.classid
  AND kl.objid IS NOT DISTINCT FROM bl.objid
  AND kl.objsubid IS NOT DISTINCT FROM bl.objsubid
  AND kl.pid != bl.pid
JOIN pg_stat_activity blocking ON kl.pid = blocking.pid
WHERE NOT bl.granted;
```

**Dry-run mode:**

```bash
# Knex: preview SQL without executing
npx knex migrate:latest --dry-run 2>&1

# Prisma: generate SQL without applying
npx prisma migrate diff --from-schema-datamodel prisma/schema.prisma --to-migrations ./prisma/migrations --script

# Flyway: validate migrations without applying
flyway validate

# Alembic: generate SQL without applying
alembic upgrade head --sql
```

### Step 9: Deployment Coordination

The order in which you deploy migrations and application code matters. Getting it wrong causes errors or data corruption.

**Migration-first vs. code-first:**

| Strategy | When to use | Risk |
|----------|------------|------|
| Migration first, then code | Adding new columns, adding indexes, expanding schema | Old code ignores new columns (safe) |
| Code first, then migration | Dropping columns, removing constraints, contracting schema | New code does not use old columns (safe) |
| Simultaneous | Never in production | Race condition: code may deploy before migration finishes |

**Deployment timeline for expand-contract:**

```
Day 1 (Monday):
  09:00  Run EXPAND migration (add new column)
  09:05  Verify migration complete, no errors
  09:10  Deploy app v2.1 (writes both columns, reads old)
  09:15  Verify app health (error rate, latency)

Day 2 (Tuesday):
  09:00  Run BACKFILL migration (populate new column from old)
  09:30  Verify backfill complete (progress query)
  10:00  Deploy app v2.2 (writes both columns, reads new)
  10:05  Verify app health

Day 5 (Friday):
  -- After confirming no rollback needed --
  09:00  Deploy app v2.3 (writes only new column)
  09:05  Verify app health

Day 8 (Monday of next week):
  09:00  Run CONTRACT migration (drop old column)
  09:05  Verify migration complete
  09:10  Clean up dual-write code
```

**Feature flag integration:**

Use feature flags to decouple migration timing from code deployment:

```typescript
// Application code with feature flag for migration rollback
async function getUserEmail(userId: string): Promise<string> {
  const user = await db('users').where({ id: userId }).first();

  if (featureFlags.isEnabled('use-new-email-column')) {
    return user.email_address;  // New column
  }
  return user.email;  // Old column (fallback)
}
```

**Blue-green compatibility:**

Both the old and new versions of your application must work with the current database schema. If version A uses column `email` and version B uses column `email_address`, the database must have both columns during the transition.

### Step 10: Large Table Migrations

Tables with 100M+ rows require special handling. Standard `ALTER TABLE` operations may lock the table for minutes or hours.

**Decision matrix:**

| Table size | Strategy | Downtime |
|-----------|----------|----------|
| < 1M rows | Standard `ALTER TABLE` | Seconds (acceptable) |
| 1M - 100M rows | Online DDL or `CONCURRENTLY` | None if using the right operation |
| 100M+ rows | Shadow table + dual-write or online schema change tool | None (but complex) |
| 1B+ rows | Partitioning + migrate per partition, or shadow table | None (very complex) |

**Shadow table pattern (manual):**

```sql
-- Step 1: Create new table with desired schema
CREATE TABLE users_new (
  id BIGSERIAL PRIMARY KEY,  -- changed from INT to BIGINT
  email VARCHAR(255) NOT NULL,
  email_address VARCHAR(255),  -- new column
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Step 2: Create trigger to dual-write to new table
CREATE OR REPLACE FUNCTION sync_users_to_new() RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO users_new (id, email, email_address, created_at)
  VALUES (NEW.id, NEW.email, NEW.email, NEW.created_at)
  ON CONFLICT (id) DO UPDATE SET
    email = NEW.email,
    email_address = NEW.email;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_sync_users
  AFTER INSERT OR UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION sync_users_to_new();

-- Step 3: Backfill existing data (batched, see Step 6)
-- Step 4: Verify row counts match
-- Step 5: Atomic swap
BEGIN;
  ALTER TABLE users RENAME TO users_old;
  ALTER TABLE users_new RENAME TO users;
COMMIT;

-- Step 6: Drop old table after verification period
-- DROP TABLE users_old;  -- only after confirming everything works
```

**pt-online-schema-change (MySQL):**

```bash
# Adds a column to a 500M-row table without locking
pt-online-schema-change \
  --alter "ADD COLUMN payment_profile_id CHAR(36)" \
  --execute \
  --chunk-size=5000 \
  --max-lag=1s \
  --check-interval=1 \
  --progress=time,30 \
  h=db-primary.internal,D=myapp,t=users
```

**gh-ost (MySQL, trigger-free):**

```bash
# Same operation using binlog replication instead of triggers
gh-ost \
  --host=db-primary.internal \
  --database=myapp \
  --table=users \
  --alter="ADD COLUMN payment_profile_id CHAR(36)" \
  --chunk-size=5000 \
  --max-lag-millis=1000 \
  --execute
```

**Partitioning for very large tables:**

```sql
-- PostgreSQL: convert monolithic table to partitioned
-- Step 1: Create partitioned table
CREATE TABLE events_partitioned (
  id BIGSERIAL,
  event_type VARCHAR(50),
  payload JSONB,
  created_at TIMESTAMPTZ NOT NULL
) PARTITION BY RANGE (created_at);

-- Step 2: Create partitions
CREATE TABLE events_2026_q1 PARTITION OF events_partitioned
  FOR VALUES FROM ('2026-01-01') TO ('2026-04-01');
CREATE TABLE events_2026_q2 PARTITION OF events_partitioned
  FOR VALUES FROM ('2026-04-01') TO ('2026-07-01');

-- Step 3: Migrate data per partition (reduces lock scope)
-- Step 4: Swap tables atomically
```

## Anti-patterns

| Anti-pattern | Why it hurts | What to do instead |
|-------------|-------------|-------------------|
| No rollback plan | When the migration fails at 3 AM, you have no recovery path | Write a rollback plan before running any migration |
| Locking during deploy | Users see errors or timeouts while the table is locked | Use `CONCURRENTLY`, online DDL tools, or expand-contract |
| Untested on prod-size data | Migration takes 5 seconds on dev, 45 minutes on prod, locking the table | Always test on a copy of production data with realistic row counts |
| Breaking changes without expand-contract | Old application instances crash because the column they need is gone | Always expand first, migrate code, then contract |
| Running migration and code deploy simultaneously | Race condition: some app instances see old schema, some see new | Migration first for expansions, code first for contractions |
| Backfilling without batching | Single UPDATE on 100M rows locks the table and fills WAL | Batch in 5K-10K chunks with brief pauses between batches |
| No progress tracking on large backfills | Cannot estimate completion time, cannot detect stalls | Log batch progress, query completion percentage |

## Self-check

Before running a migration in production, verify:

- [ ] Is the migration tool appropriate for the project stack?
- [ ] Is the migration type correctly identified (schema, data, seed, rollback)?
- [ ] Does the zero-downtime strategy follow expand-contract for breaking changes?
- [ ] Are column operations using the safe patterns (2-step rename, 2-step drop)?
- [ ] Are index operations using `CONCURRENTLY` or equivalent?
- [ ] Are data backfills batched with progress tracking and idempotency?
- [ ] Is there a documented rollback plan with specific steps?
- [ ] Has the migration been tested on production-size data with timing measured?
- [ ] Is the deployment order correct (migration-first for expand, code-first for contract)?
- [ ] Are large tables (>1M rows) using online schema change tools or shadow tables?
- [ ] Are feature flags in place for safe rollback of application code?
- [ ] Has lock monitoring been set up for the migration window?

## Examples

**In scope:**
- "Add a `payment_profile_id` column to our 50M-row users table without downtime" -- full expand-contract with batched backfill
- "Rename the `amount` column to `total_amount` on the orders table" -- 2-step rename with dual-write
- "Choose a migration tool for our TypeScript/PostgreSQL project" -- tool comparison and recommendation
- "Write a rollback plan for dropping the `legacy_status` column" -- rollback plan with backup steps
- "Our users table has 500M rows and we need to change the `id` column from INT to BIGINT" -- large table migration with shadow table
- "Plan the deployment order for adding a NOT NULL constraint to an existing column" -- expand-contract with backfill

**Out of scope:**
- "Optimize this slow SQL query" -- use the database-review skill
- "Design the schema for a new e-commerce application" -- use the api-design skill
- "Set up PostgreSQL replication" -- use an infrastructure skill
- "Our database is down" -- use the incident-response skill

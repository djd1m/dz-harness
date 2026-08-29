---
name: "database-review"
description: "Reviews database schema changes, migrations, and queries."
trust_tier: 2
trust_tier_label: "Validated"
validation:
  schema_path: schemas/output.json
  validator_path: scripts/validate-config.json
---

# database-review

Review a migration, schema change, or query. The dangerous failures are silent at code-review time and loud at 2 AM.

## When to use

- User has a migration file to review
- User is changing a database schema (adding/removing columns, tables, constraints)
- User has a slow query they want optimized
- User asks about indexing strategy
- User wants to know if a migration is safe to deploy
- User is adding foreign keys, unique constraints, or enums
- User asks about rolling deploys with schema changes

## When NOT to use

- User wants to design a schema from scratch (use an architecture/modeling workflow)
- User is asking about ORM configuration, not the underlying SQL
- User wants a full performance audit of an entire database (suggest a DBA engagement)
- User is debugging application-level data issues unrelated to schema

## Procedure

1. **Identify database and version.** Determine the DBMS (PostgreSQL, MySQL, SQLite, SQL Server, etc.) and version. This matters because lock behavior, DDL transactionality, and available features differ dramatically. Check `docker-compose.yml`, connection strings, ORM config, or ask the user. Never assume PostgreSQL.

2. **Read the migration checking for dangerous patterns.** Go through the migration line by line and flag:
   - **Lock duration:** `ALTER TABLE` on large tables acquires `ACCESS EXCLUSIVE` lock in PostgreSQL. Estimate table size if possible. Any migration that locks a table with >1M rows for more than a few seconds is a blocker.
   - **Index builds:** Are indexes created with `CONCURRENTLY`? A regular `CREATE INDEX` locks writes for the entire build duration. On a 50M-row table, that can be minutes of downtime.
   - **Backfills:** Does the migration backfill data in a single transaction? Large backfills should be batched. A single `UPDATE ... SET column = value` on millions of rows will lock the table, bloat WAL, and potentially OOM the connection.
   - **Constraint additions:** Are `NOT NULL` or `CHECK` constraints added with `NOT VALID` + separate `VALIDATE CONSTRAINT`? Adding a constraint directly scans the entire table under a lock.
   - **Type changes:** Changing a column type (e.g., `varchar` to `text`, `int` to `bigint`) may rewrite the entire table. In PostgreSQL, some type changes are metadata-only (e.g., `varchar(100)` to `varchar(200)`) but most are full rewrites.
   - **Default values:** Adding a column with a `DEFAULT` in PostgreSQL 11+ is metadata-only. In older versions or other databases, it rewrites every row.

3. **Check rolling-deploy compatibility.** The migration will be applied while old application code is still running. Check:
   - Can old code handle the new schema? (e.g., a renamed column breaks old code)
   - Can new code handle the old schema? (e.g., new code reads a column that does not exist yet)
   - Is the deploy order correct? (typically: migrate -> deploy new code for additive changes; deploy new code -> migrate for removals)
   - Flag any column renames, drops, or type changes that break backward compatibility.

4. **Review indexes against query patterns.** For each new index:
   - Does it match the query patterns in the codebase? Check the WHERE clauses, JOIN conditions, and ORDER BY clauses that will use this table.
   - Is the index too wide? Indexes on 5+ columns are rarely useful and expensive to maintain.
   - Are there redundant indexes? (e.g., an index on `(a, b)` makes a separate index on `(a)` redundant)
   - Is a partial index appropriate? (e.g., `WHERE deleted_at IS NULL` if most queries filter soft-deleted rows)
   - For multi-column indexes, is the column order correct for the query patterns?

5. **Review the query itself.** If the user provides a query:
   - **Predicates:** Are they sargable? Functions on indexed columns (e.g., `WHERE LOWER(email) = ...`) prevent index use.
   - **JOIN order:** Does the planner have good statistics? Are there implicit cartesian products?
   - **N+1 patterns:** Is this query called in a loop? Look for the calling code.
   - **OFFSET pagination:** Flag `OFFSET` on large tables. Suggest keyset/cursor pagination instead.
   - **Implicit casts:** Does the query compare mismatched types (e.g., `integer` column vs `text` parameter)? This prevents index use.
   - **SELECT *:** Flag it. Especially with JOINs, it pulls unnecessary columns and breaks when schema changes.

6. **Ask for EXPLAIN output.** If the user has not provided `EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)` output, ask for it. The query plan is the single most useful artifact for query optimization. Do not guess at performance without it. Offer to help interpret the output when they provide it.

7. **Check data integrity.** Review:
   - **Foreign keys:** Are they present where entities reference each other? Missing FKs lead to orphaned rows.
   - **Uniqueness:** Are unique constraints in place for business keys? Application-level uniqueness checks have race conditions.
   - **Soft-delete consistency:** If the project uses soft deletes, do unique indexes account for `deleted_at`? (e.g., unique on `(email)` should be `(email) WHERE deleted_at IS NULL`)
   - **NOT NULL:** Are columns that should never be null actually constrained? Every nullable column is a potential `NullPointerException`.

8. **Insist on reversible migration.** Every migration must have a corresponding down/rollback migration. Check:
   - Does the rollback actually undo the change?
   - Is it safe to run the rollback under load?
   - Are destructive operations (DROP TABLE, DROP COLUMN) guarded by feature flags or delayed?
   - For data migrations, is the reverse operation possible? (e.g., if you merged two columns, can you split them back?)

9. **Check behavior on production-sized data.** The migration that runs in 50ms on a dev database with 100 rows may lock production for 20 minutes:
   - Estimate table row counts from the user or codebase context
   - Flag any full-table scan, rewrite, or lock on tables with >100K rows
   - Suggest batched approaches for large data migrations
   - Recommend testing on a production-sized copy before deploying

## Key Rules

- Never approve a migration without understanding the table sizes involved.
- Always check rolling-deploy compatibility. The migration runs before all pods are updated.
- `CONCURRENTLY` is not optional for indexes on production tables.
- A migration without a rollback is a one-way door. Flag it.
- If the user says "it works on my local," ask about production row counts.

## Output Format

Return a structured review with: migration safety assessment (safe/caution/unsafe), findings grouped by severity (blocker/warning/suggestion), specific line references, and a deploy recommendation (deploy order, estimated downtime, rollback plan).

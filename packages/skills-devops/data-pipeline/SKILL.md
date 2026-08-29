---
name: "data-pipeline"
description: "Designs and reviews ETL/ELT data pipelines — schema design, transformations, orchestration, monitoring, and data quality."
trust_tier: 2
trust_tier_label: "Validated"
validation:
  schema_path: schemas/output.json
  validator_path: scripts/validate-config.json
---

# data-pipeline

Design, review, and troubleshoot data pipelines end-to-end. Covers source identification, paradigm selection, schema design, transformation logic, orchestration, data quality enforcement, error handling, monitoring, performance tuning, and documentation. The goal is a pipeline that is correct, observable, recoverable, and cost-efficient.

## When to use

- User needs to design a new ETL/ELT pipeline from scratch
- User wants to review an existing pipeline for correctness and reliability
- User is choosing between batch, streaming, or CDC ingestion
- User asks about schema design for a data warehouse or lakehouse
- User wants to add data quality checks to an existing pipeline
- User has a pipeline that is slow, expensive, or unreliable
- User is migrating from one orchestrator to another (Airflow to Dagster, cron to Prefect)
- User asks about dbt model structure, incremental strategies, or testing
- User wants to set up monitoring, alerting, or SLA tracking for data flows

## When NOT to use

- User wants to build a REST API (use `api-design`)
- User wants to fix a CI/CD pipeline (use `ci-fix`)
- User wants a database schema review without pipeline context (use `database-review`)
- User wants to analyze data interactively (that is analytics/BI work, not pipeline engineering)
- User needs to set up infrastructure (Kubernetes, Terraform) without a data pipeline context

## Procedure

### Step 1: Identify data sources

Catalog every source the pipeline will consume. For each source, determine the extraction method, volume, velocity, and access pattern.

| Source type | Method | Latency | Example |
|-------------|--------|---------|---------|
| **Batch** | Full/incremental extract on schedule | Minutes to hours | Nightly dump from PostgreSQL |
| **Streaming** | Continuous event consumption | Seconds | Kafka topic, Kinesis stream |
| **CDC** | Change data capture from WAL/binlog | Seconds to minutes | Debezium on MySQL binlog |
| **Event** | Webhook or push-based delivery | Sub-second to seconds | Stripe webhook, S3 event notification |
| **File drop** | Polling a directory or bucket | Minutes | CSV uploaded to S3 by vendor |
| **API** | Paginated HTTP pull | Minutes | REST API with cursor pagination |

For each source, document:
- Connection details (host, port, credentials reference -- never hardcode secrets)
- Schema or contract (JSON Schema, Avro, Protobuf, or column list)
- Volume estimate (rows/day, GB/day)
- Update pattern (append-only, upsert, delete-and-reload)
- SLA expectation (when must the data be available downstream?)

### Step 2: Choose paradigm

Select the processing paradigm based on latency requirements, data volume, team skill set, and infrastructure budget.

| Paradigm | How it works | Pros | Cons | When to use |
|----------|-------------|------|------|-------------|
| **ETL** | Extract, transform in a staging area, load into warehouse | Transforms before load; cleaner warehouse | Requires staging infra; slower iteration | Legacy systems, strict schema enforcement |
| **ELT** | Extract, load raw into warehouse, transform in-place | Leverage warehouse compute; faster iteration; dbt-friendly | Raw data in warehouse; compute costs can spike | Modern cloud warehouses (BigQuery, Snowflake, Redshift) |
| **Streaming** | Process events as they arrive | Low latency; real-time dashboards | Complex error handling; harder to debug | Real-time fraud detection, live metrics, event-driven architectures |
| **Hybrid** | Batch for backfill + streaming for real-time | Best of both worlds | Two codepaths to maintain | Lambda/Kappa architecture when both historical and real-time views are needed |

Decision checklist:
- Latency requirement under 5 minutes? Consider streaming or micro-batch.
- Team already uses dbt? ELT is the natural fit.
- Data volume over 10 TB/day? Evaluate cost of warehouse compute vs. dedicated Spark/Flink cluster.
- Must replay historical data? Ensure the paradigm supports backfill without duplicates.

### Step 3: Design schema

Choose a schema design for the target data store based on query patterns, team conventions, and analytical needs.

| Schema pattern | Structure | When to use |
|----------------|-----------|-------------|
| **Star schema** | Fact tables surrounded by dimension tables | Standard OLAP workloads; BI tools expect it |
| **Snowflake schema** | Normalized dimensions (dimension references sub-dimensions) | When dimensions are very large or update frequently |
| **Data vault** | Hub, link, and satellite tables | Auditability, multiple source systems, regulatory environments |
| **One Big Table (OBT)** | Single wide denormalized table | Simple analytics, small-to-medium scale, rapid prototyping |
| **Activity schema** | Entity-centric event stream with typed columns | Product analytics, event-driven analysis |

Design rules:
- Use surrogate keys for dimension tables, never expose source PKs as the join key.
- Add `_loaded_at` and `_source` metadata columns to every table.
- Define grain explicitly: "one row per order line item per day" -- ambiguity here causes every downstream bug.
- Prefer `timestamp with time zone` over `timestamp` for all temporal columns.

### Step 4: Define transformations

Structure transformations in layers. The dbt convention is standard even outside dbt:

```
staging/       -- 1:1 with source tables. Rename, cast, deduplicate. No joins.
intermediate/  -- Business logic joins and aggregations. Reusable building blocks.
mart/          -- Final tables consumed by BI tools, APIs, or ML features.
```

**Example: staging model (`stg_orders.sql`)**

```sql
with source as (
    select * from {{ source('ecommerce', 'raw_orders') }}
),

renamed as (
    select
        id                          as order_id,
        customer_id,
        cast(order_date as date)    as order_date,
        cast(total_cents as int)    as total_cents,
        lower(trim(status))         as status,
        _loaded_at
    from source
    where id is not null
)

select * from renamed
```

**Example: mart model (`fct_daily_revenue.sql`)**

```sql
with orders as (
    select * from {{ ref('stg_orders') }}
    where status != 'cancelled'
),

daily as (
    select
        order_date,
        count(*)                            as order_count,
        sum(total_cents) / 100.0            as revenue_usd,
        count(distinct customer_id)         as unique_customers
    from orders
    group by order_date
)

select
    order_date,
    order_count,
    revenue_usd,
    unique_customers,
    revenue_usd / nullif(unique_customers, 0) as revenue_per_customer
from daily
```

Transformation rules:
- Every staging model filters out null primary keys.
- Intermediate models document the grain in a comment or YAML description.
- Mart models are the only layer BI tools should query directly.
- Use `nullif()` to prevent division-by-zero; never rely on warehouse-specific behavior.
- For Python transforms (PySpark, Pandas), keep the same layered structure in module paths.

### Step 5: Orchestrate

Define the execution graph, schedule, retry policy, and SLA for the pipeline.

**Example: Airflow DAG**

```python
from datetime import datetime, timedelta
from airflow import DAG
from airflow.providers.common.sql.operators.sql import SQLExecuteQueryOperator
from airflow.operators.bash import BashOperator
from airflow.operators.empty import EmptyOperator

default_args = {
    "owner": "data-eng",
    "retries": 2,
    "retry_delay": timedelta(minutes=5),
    "retry_exponential_backoff": True,
    "execution_timeout": timedelta(hours=2),
    "on_failure_callback": notify_slack,
    "sla": timedelta(hours=4),
}

with DAG(
    dag_id="ecommerce_daily_pipeline",
    schedule="0 6 * * *",           # 06:00 UTC daily
    start_date=datetime(2025, 1, 1),
    catchup=False,
    max_active_runs=1,
    tags=["ecommerce", "daily"],
    default_args=default_args,
) as dag:

    start = EmptyOperator(task_id="start")

    extract_orders = SQLExecuteQueryOperator(
        task_id="extract_orders",
        conn_id="source_postgres",
        sql="sql/extract_orders.sql",
    )

    run_dbt = BashOperator(
        task_id="run_dbt_models",
        bash_command="cd /opt/dbt && dbt run --select tag:ecommerce",
    )

    test_dbt = BashOperator(
        task_id="test_dbt_models",
        bash_command="cd /opt/dbt && dbt test --select tag:ecommerce",
    )

    end = EmptyOperator(task_id="end")

    start >> extract_orders >> run_dbt >> test_dbt >> end
```

Orchestration rules:
- Set `max_active_runs=1` for pipelines that are not idempotent to prevent overlapping runs.
- Use exponential backoff for retries; fixed intervals hammer failing services.
- Define an explicit SLA; a pipeline without an SLA has an implicit SLA of "whenever".
- Separate extraction, transformation, and testing into distinct tasks so failures are isolated.
- Never use `depends_on_past=True` unless you have a strong reason -- it creates silent stalls.

### Step 6: Data quality

Enforce data quality at every boundary: after extraction, after transformation, and before serving.

**Great Expectations suite example:**

```python
import great_expectations as gx

context = gx.get_context()

suite = context.add_expectation_suite("orders_quality")

# Primary key uniqueness
suite.add_expectation(
    gx.expectations.ExpectColumnValuesToBeUnique(column="order_id")
)

# No null required fields
for col in ["order_id", "customer_id", "order_date", "total_cents"]:
    suite.add_expectation(
        gx.expectations.ExpectColumnValuesToNotBeNull(column=col)
    )

# Referential integrity proxy -- known statuses only
suite.add_expectation(
    gx.expectations.ExpectColumnValuesToBeInSet(
        column="status",
        value_set=["pending", "confirmed", "shipped", "delivered", "cancelled"],
    )
)

# Volume anomaly detection -- expect at least 80% of yesterday's row count
suite.add_expectation(
    gx.expectations.ExpectTableRowCountToBeBetween(
        min_value=1000,  # absolute floor
    )
)
```

**dbt test YAML:**

```yaml
models:
  - name: stg_orders
    columns:
      - name: order_id
        tests:
          - unique
          - not_null
      - name: status
        tests:
          - accepted_values:
              values: ["pending", "confirmed", "shipped", "delivered", "cancelled"]
      - name: order_date
        tests:
          - not_null
          - dbt_utils.expression_is_true:
              expression: ">= '2020-01-01'"
    tests:
      - dbt_utils.recency:
          datepart: day
          field: _loaded_at
          interval: 2
```

Quality check categories:
- **Schema validation** -- column types, required fields, enum values
- **Freshness** -- data arrived within expected window
- **Uniqueness** -- primary keys are unique, no duplicate rows
- **Null checks** -- required columns have no nulls
- **Range checks** -- values within business-reasonable bounds (no negative prices, no future dates)
- **Volume checks** -- row count within expected range vs. prior runs
- **Referential integrity** -- foreign keys resolve to existing records

### Step 7: Error handling

Design for failure at every stage. Every pipeline will fail; the question is how gracefully.

| Strategy | Where to apply | How it works |
|----------|---------------|--------------|
| **Dead letter queue** | Streaming ingestion | Malformed or unprocessable events go to a DLQ topic/table for manual review |
| **Retry with backoff** | API extraction, database loads | Retry transient failures with exponential backoff; cap at 3-5 retries |
| **Circuit breaker** | External API calls | After N consecutive failures, stop calling the source and alert; prevent cascade |
| **Idempotent writes** | All load steps | Use `MERGE`/upsert or delete-then-insert keyed by primary key + batch ID |
| **Checkpoint/bookmark** | Incremental extraction | Store the last-processed watermark (timestamp or offset) so restarts resume, not replay |
| **Quarantine table** | Transformation layer | Rows that fail validation go to a quarantine table instead of silently dropping |

Error handling rules:
- Never silently drop rows. Either fix them, quarantine them, or fail loudly.
- Log the failing row's primary key and the reason for failure.
- Alert on the first failure, not after the retry budget is exhausted.
- Make every write idempotent. Running the same pipeline twice on the same data must produce the same result.

### Step 8: Monitoring

Instrument every pipeline with metrics that answer: "Is the data correct, complete, and on time?"

| Metric | What it measures | Alert threshold |
|--------|-----------------|-----------------|
| **Row count delta** | Rows loaded vs. expected (compared to prior run) | Drop >30% from previous run |
| **End-to-end latency** | Time from source change to warehouse availability | Exceeds SLA by >15 minutes |
| **Freshness** | Time since last successful load | Over 2x the schedule interval |
| **Error rate** | Percentage of rows that failed quality checks | Over 1% of total rows |
| **Data drift** | Schema changes, new enum values, type changes | Any unexpected schema change |
| **Cost** | Compute cost per run (warehouse credits, Spark cluster hours) | Over 2x the 7-day rolling average |
| **Task duration** | Wall-clock time for each pipeline task | Over 3x the 7-day p95 |

Monitoring rules:
- Track row counts at every stage boundary (extract, transform, load) to detect silent data loss.
- Use a freshness SLA dashboard visible to data consumers, not just engineers.
- Set up cost alerts before they become surprises on the monthly bill.
- Log every pipeline run's start time, end time, row counts, and status to a metadata table.

### Step 9: Performance

Optimize for cost and speed once correctness is established. Never optimize a broken pipeline.

| Technique | When to use | Impact |
|-----------|-------------|--------|
| **Partitioning** | Tables over 10M rows queried with a date filter | 10-100x query speedup, reduced scan cost |
| **Incremental loads** | Append-heavy tables with a reliable watermark column | Avoids full-table scans on every run |
| **Materialized views** | Frequently-read aggregations that change slowly | Trades storage for query speed |
| **Parallel processing** | Independent transformations on separate tables | Reduces wall-clock time linearly with parallelism |
| **Clustering/sort keys** | Warehouse tables filtered on low-cardinality columns | Reduces bytes scanned per query |
| **Compression** | Parquet/ORC for file-based pipelines | 5-10x storage reduction, faster reads |
| **Batch size tuning** | Micro-batch or streaming ingestion | Balance latency vs. per-batch overhead |

**dbt incremental model example:**

```sql
{{
    config(
        materialized='incremental',
        unique_key='order_id',
        incremental_strategy='merge',
        on_schema_change='append_new_columns',
        cluster_by=['order_date'],
    )
}}

select
    order_id,
    customer_id,
    order_date,
    total_cents,
    status,
    _loaded_at

from {{ ref('stg_orders') }}

{% if is_incremental() %}
    where _loaded_at > (select max(_loaded_at) from {{ this }})
{% endif %}
```

Performance rules:
- Partition by the column most commonly used in `WHERE` clauses (usually a date).
- Use incremental models as the default for any table over 1M rows.
- Run `EXPLAIN` or `QUERY PLAN` before and after optimization to measure actual improvement.
- Avoid `SELECT *` in production models; explicit column lists enable predicate pushdown.

### Step 10: Documentation

A pipeline without documentation is a pipeline only one person can operate.

Required artifacts:
- **Data catalog entry** -- for every table: description, grain, owner, update frequency, source
- **Lineage graph** -- visual DAG showing source-to-mart data flow (dbt docs, DataHub, Atlan)
- **SLA definitions** -- written agreement: "fct_daily_revenue is fresh by 08:00 UTC on business days"
- **Runbook** -- step-by-step instructions for: restarting a failed run, backfilling a date range, adding a new source, handling a schema change
- **Change log** -- record of every schema change, new source addition, or SLA modification

Documentation rules:
- Every mart table has a plain-English description that a non-engineer can understand.
- The runbook includes commands, not just prose. "Run `dbt run --select fct_daily_revenue --full-refresh`" beats "re-run the model".
- Review lineage after every model change to catch unintended downstream impact.
- SLA definitions include escalation contacts and grace periods.

## Anti-patterns

| Anti-pattern | Why it is dangerous | Fix |
|-------------|---------------------|-----|
| **No idempotency** | Re-running a pipeline creates duplicate rows or corrupted state | Use MERGE/upsert keyed by primary key; design every write to be safely re-runnable |
| **Missing data quality gates** | Bad data propagates to dashboards and ML models before anyone notices | Add quality checks between every pipeline stage; fail-fast on critical violations |
| **Hardcoded credentials** | Secrets in code end up in git history, CI logs, and error messages | Use secret managers (Vault, AWS Secrets Manager, environment variables from a secure store) |
| **No monitoring** | Pipeline failures are discovered by downstream consumers, not the team that owns it | Instrument row counts, latency, freshness, and error rate; alert proactively |
| **Full refresh on large tables** | Reprocessing 500M rows nightly when only 50K changed wastes hours and money | Use incremental loads with a reliable watermark column |
| **Silent row drops** | Rows that fail validation vanish without a trace | Quarantine failed rows and alert; never discard data silently |
| **Monolithic DAG** | One massive task that extracts, transforms, and loads makes debugging impossible | Split into granular tasks with clear boundaries; one task per logical step |
| **No backfill strategy** | When historical data needs reprocessing, the team has no playbook | Design pipelines to accept a date range parameter; document the backfill procedure |
| **Timezone confusion** | Mixing UTC and local time in timestamp columns produces off-by-one-day errors | Standardize on UTC everywhere; convert to local time only at the presentation layer |
| **Testing only in production** | First run against real data is in prod; failures are discovered live | Maintain a staging environment with representative (sampled or synthetic) data |

## Self-check

Before declaring the pipeline design complete, verify all of the following:

1. Every source has a documented connection method, schema, volume estimate, and SLA.
2. The processing paradigm (ETL/ELT/streaming) matches the latency and cost requirements.
3. The target schema has an explicitly defined grain for every table.
4. Transformations are layered (staging, intermediate, mart) with no BI tool querying raw tables.
5. The orchestrator has retries with exponential backoff, an SLA, and failure alerting.
6. Data quality checks cover uniqueness, nulls, freshness, accepted values, and row count anomalies.
7. Every write is idempotent -- re-running the pipeline produces the same result.
8. Errors are quarantined or surfaced, never silently dropped.
9. Monitoring tracks row counts, latency, freshness, error rate, and cost.
10. Large tables use incremental loads with partitioning, not full refreshes.
11. Documentation includes a data catalog, lineage graph, SLA definitions, and a runbook.
12. No secrets are hardcoded anywhere in the pipeline code or configuration.

## Examples

### In scope

- "Design a pipeline to load Stripe payment events into our Snowflake warehouse with dbt."
- "Review this Airflow DAG for reliability and add data quality checks."
- "Our pipeline takes 6 hours. Help me make it incremental."
- "We need to add CDC from our PostgreSQL database to BigQuery."
- "Set up Great Expectations tests for our orders table."
- "Help me design a star schema for our e-commerce analytics."
- "Our pipeline produces duplicate rows after restarts. Make it idempotent."
- "We are migrating from cron + SQL scripts to Dagster. Help plan the migration."

### Out of scope

- "Build me a React dashboard to visualize sales data." (frontend work)
- "Set up a Kubernetes cluster for our data platform." (infrastructure, use relevant infra skill)
- "Write a machine learning model to predict churn." (ML engineering, not pipeline engineering)
- "Help me write a SQL query to analyze last month's revenue." (ad-hoc analytics, not pipeline design)

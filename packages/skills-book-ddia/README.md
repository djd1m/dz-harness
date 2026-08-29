# @dzhechkov/skills-book-ddia

Decision-moment skills for building data-intensive systems.

> **Inspired by** *Designing Data-Intensive Applications* by Martin Kleppmann (O'Reilly) —
> the canonical reference on data systems. This package is an ORIGINAL, rephrased distillation of
> the field's decision methodology; it reproduces none of the book's text. It teaches WHEN to reach
> for which data-systems technique (replication topology, partitioning, transaction isolation,
> consensus, encoding evolution) with original criteria and tradeoff tables. For the full
> treatment, the ideas' depth, and the author's own words, **read the book** — this is a working
> companion, not a substitute. `trust_tier: 0` (machine-distilled): verify a decision against
> primary sources before relying on it.

## What it does

Makes an AI coder **apply the book's data-systems methodologies** at the real design decisions —
not summarize the book. Each skill activates on a decision moment and gives concrete criteria,
tradeoff tables, key facts/formulas with page anchors, anti-patterns, and cross-links.

## The 10 decision-moment skills (116 verified Knowledge Units)

| Skill | Decision | Chapters |
|-------|----------|----------|
| `ddia-reliability-scalability-foundations` | reliability / scalability / maintainability framing | 1 |
| `ddia-data-model-selection` | relational vs document vs graph | 2 |
| `ddia-storage-engine-tradeoffs` | LSM vs B-tree, OLTP vs OLAP | 3 |
| `ddia-encoding-and-schema-evolution` | serialization + backward/forward compat | 4 |
| `ddia-replication-topology-choice` | single / multi / leaderless + consistency guarantees | 5 |
| `ddia-partitioning-strategy` | hash/range partitioning, rebalancing, secondary indexes | 6 |
| `ddia-transaction-isolation-choice` | isolation levels, SSI, when you need a transaction | 7 |
| `ddia-distributed-consistency-consensus` | distributed faults, linearizability, consensus | 8–9 |
| `ddia-batch-and-stream-processing` | batch vs stream, dataflow, exactly-once | 10–11 |
| `ddia-deriving-data-and-integration` | derived data, system-of-record, end-to-end integration | 12 |

## Install (owner-local)

```bash
dz init --target claude-code --select ddia-replication-topology-choice   # one decision
# then: «проектирую репликацию — single или multi-leader?» → the skill activates
```

Each skill ships its source Knowledge Units in `references/knowledge-units.md` (in-pack deep-lookup).
The full KB is queryable: `dz recall --books --book vysokonagruzhennye-prilozheniya "<query>"`.

## Usage scenarios

**Install the pack once** (owner-local — it's private, so from the monorepo:
`dz init --target claude-code --select <the 10 ddia- ids>`), then just **describe your task to Claude
Code in plain language** — the agent auto-activates the right skill(s). No skill ids to memorize. Here
are the situations where this pack pays off, with example prompts you can copy and adapt:

### 1. Design a new data-intensive system from scratch

**Situation:** greenfield — you must pick a data model, storage engine, replication, and partitioning
before writing much code, and want the tradeoffs made explicitly.

> «Используй скиллы ddia: проектирую систему аналитики событий на 50k RPS — какую модель данных, движок хранения, репликацию и партиционирование выбрать?»

**What happens:** the agent walks the coupled decisions in order (model → storage engine → replication
→ partitioning), applying DDIA's criteria at each and flagging where one choice constrains the next
(e.g. leaderless replication → quorum math in consistency).

### 2. Make one architecture decision, right now

**Situation:** you hit a specific fork and want the principled, cited answer.

> «Проектирую репликацию — single-leader, multi-leader или leaderless?»
> *(EN: "single-leader, multi-leader, or leaderless replication?")*

**What happens:** `ddia-replication-topology-choice` activates, weighs simplicity vs write-availability
vs conflict-resolution cost against your context, and links the coupled decision
(`ddia-transaction-isolation-choice` / consistency) — with page-anchored citations.

### 3. Review / red-team a data architecture

**Situation:** an existing design review — you want risky choices surfaced before they ship.

> «Используй скиллы ddia: отревьюь эту схему — multi-leader между дата-центрами + read-committed — где риски?»

**What happens:** the agent flags the failure modes the book warns about (multi-leader write conflicts
without a resolution strategy, isolation anomalies under contention, hot partitions) with the rationale.

### 4. Choose consistency & isolation for a requirement

**Situation:** a correctness requirement ("no double-spend", "read-your-writes") and you need the right
isolation/consistency level, not the strongest-by-default.

> «Нужна ли мне линеаризуемость здесь, или достаточно причинной согласованности? И какой уровень изоляции транзакций?»

**What happens:** `ddia-distributed-consistency-consensus` + `ddia-transaction-isolation-choice` map the
requirement to the minimal sufficient guarantee and its cost, distinguishing what actually needs
consensus from what doesn't.

### 5. Evaluate a database / storage migration

**Situation:** picking or migrating a datastore and weighing engine tradeoffs + schema evolution.

> «Используй скиллы ddia: переходим с Postgres на что-то под тяжёлую запись — LSM vs B-tree, и как не сломать совместимость схемы?»

**What happens:** `ddia-storage-engine-tradeoffs` (LSM vs B-tree write/read/space amplification) +
`ddia-encoding-and-schema-evolution` (backward/forward compatibility) frame the migration's real costs.

## Provenance

`sources.json`: `upstream_type: book`, ISBN, per-skill `derived_from` KU ids, 100% verified ratio,
digitizer corpus_version. No `origin` block (the book is the immutable upstream).

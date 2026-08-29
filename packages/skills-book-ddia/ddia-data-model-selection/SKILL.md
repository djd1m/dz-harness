---
name: ddia-data-model-selection
description: >
  Pick the DATABASE FAMILY and schema shape for a new service: relational vs document vs graph,
  normalize vs denormalize, schema-on-read vs schema-on-write, many-to-many and join handling.
  The LOGICAL model + query style ONLY — NOT the on-disk engine/index that stores it
  (→ ddia-storage-engine-tradeoffs), NOT the wire serialization format (→ ddia-encoding-and-schema-evolution).
  Triggers (RU+EN): "какую модель данных выбрать", "документная или реляционная", "нормализовать или встроить",
  "граф или таблицы", "relational vs document vs graph", "schema-on-read vs schema-on-write",
  "normalize vs denormalize", "many-to-many relationships", "choose a NoSQL store".
trust_tier: 1
trust_tier_label: "Machine-distilled from DDIA — routing evals passed (CP3.5 gate 2026-07-04)"
trust_tier_path: "Human-review against the cited pages to promote to Tier 2"
derived_from: [ddia-ch02-ku01, ddia-ch02-ku02, ddia-ch02-ku03, ddia-ch02-ku04, ddia-ch02-ku05, ddia-ch02-ku06, ddia-ch02-ku07, ddia-ch02-ku08]
---

# DDIA Data Model Selection — pick the model that matches your relationship shape, not the hype

## Output
A design recommendation for the data model: the chosen family (relational / document / graph), the
normalize-vs-embed and schema-on-read/write calls, the tradeoffs accepted, and the гл.2 facts backing
them — folded into the ADR or architecture step.

## When to use / NOT
- **Use when:** choosing a database family (relational / document / graph) for a new service or
  feature; deciding whether to embed a one-to-many aggregate as one document vs split into tables;
  deciding ID-reference vs inline text (normalize vs denormalize); deciding whether to enforce a
  schema and how format changes will evolve; choosing a query style (declarative SQL vs MapReduce
  vs graph traversal).
- **NOT for:** how the store physically lays out and indexes bytes on disk (LSM vs B-tree, that is
  `ddia-storage-engine-tradeoffs`); how records are serialized on the wire and evolved across
  versions (`ddia-encoding-and-schema-evolution`); or the top-level reliability/scalability framing
  (`ddia-reliability-scalability-foundations`).

## Decision criteria

**1. Pick the model family by the DOMINANT relationship shape** (ku02, ku01):

| Data shape in your app | Choose | Why |
|---|---|---|
| Self-contained tree of one-to-many, loaded whole, few links between records (resume, order, event) | **Document** | Locality: one read, no multi-way join; relational "shredding" into many tables makes schema + code cumbersome |
| Many-to-many relations present | **Relational** | Document model lacks joins → you denormalize (consistency burden) or emulate joins app-side (slower, more complex) than a DB-native join |
| Dense / arbitrary interconnections, "anything relates to anything" | **Graph** | Vertices+edges + variable-length traversal are the natural fit |

Rule from the chapter: document DBs suit self-contained documents with rare inter-document links;
graph DBs suit data where anything can relate to anything; relational sits in between. No model is
universally simpler — it depends on your data's relationships, and any model *can* emulate another
but the result is usually awkward.

**2. If relational/document: how to store a one-to-many aggregate** (ku01):
- Normalized separate tables (FK to parent) — pre-SQL:1999 default; best when the child data is
  queried/joined independently.
- Structured XML/JSON column type — multi-valued data in one row, still queryable/indexable.
- JSON/XML document in a TEXT column — simplest, but the DB **cannot query inside it**; only use
  when you always fetch the whole blob.

**3. Normalize vs duplicate a human-meaningful value** (ku03):
- Value drawn from a **standardized list** (region, industry, company) → store an **ID reference**.
  One canonical copy → global rename, consistent spelling, localization, better search. IDs never
  need to change because they carry no human meaning.
- **Free-form user text** → store the string inline.
- Duplication of a value that could live in one place = the schema is not normalized. But
  normalization needs many-to-one relations, which document DBs handle poorly → pressure back toward
  relational or app-side lookups.

**4. Enforce a schema? (schema-on-write) or not (schema-on-read)** (ku04):
- **Heterogeneous** records (many object types, or structure driven by an external system you don't
  control) → schema-on-read.
- All records share **one expected structure** → schema-on-write (a schema documents and enforces it).
- Weigh the format-change cost: schema-on-read handles old docs in app code at read time;
  schema-on-write needs a migration (see anti-patterns for the MySQL/UPDATE traps).

**5. Sizing documents (aggregate boundaries)** (ku05):
- Locality pays off **only** when you read large parts of the document at once. The DB usually loads
  the *entire* document even for one field, and an update rewrites the whole document. → **Keep
  documents small; avoid writes that grow their encoded size.**
- Need locality *inside* a relational model? Spanner interleaving, Oracle index cluster tables, or
  Bigtable/Cassandra/HBase column families give it without going document.

**6. Query style** (ku06, ku07, ku08):
- Prefer **declarative** (SQL, Cypher, SPARQL): concise, optimizer picks indexes/joins, free to
  reorder rows, parallelizes across cores. Imperative record-walking (CODASYL-style) locks in a plan.
- Distributed aggregation over a document store → **MapReduce** map/reduce, but they must be **pure**
  (inputs only, no extra DB queries, no side effects). If it gets awkward, reach for a declarative
  aggregation pipeline instead.
- Graph queries need **variable-length traversal** (Cypher `:WITHIN*0..`); SQL recursive CTEs can do
  it since SQL:1999 but far more verbosely (4 lines Cypher vs 29 SQL) — a signal to use a graph engine.

## Key facts & formulas
- Three ways to store one-to-many in a relational DB: normalized tables, structured XML/JSON column,
  or JSON/XML in a TEXT column [гл.2, с.56–58].
- Object/relational impedance mismatch; ORMs (ActiveRecord, Hibernate) reduce but don't remove the
  translation layer [гл.2, с.56].
- Normalization = removing duplication so a value lives in exactly one place; needs many-to-one
  relations [гл.2, с.59–60].
- **schema-on-read** (structure interpreted at read) vs **schema-on-write** (enforced at write) —
  analogous to dynamic vs static type checking [гл.2, с.66–68].
- Most relational DBs run `ALTER TABLE` in a few milliseconds; **MySQL is the exception** — copies the
  whole table; online-DDL tools **pt-online-schema-change**, **gh-ost** work around it [гл.2, с.68].
- Document = single contiguous string (JSON/XML, or binary BSON); an update usually rewrites the whole
  document; in-place only if encoded size is unchanged [гл.2, с.68–69].
- Relational-side locality mechanisms: Spanner interleaving, Oracle index cluster tables,
  Bigtable/Cassandra/HBase column families [гл.2, с.69].
- Relational selection σ_family=Sharks(animals) ≡ `SELECT * FROM animals WHERE family='Sharks'`;
  declarative wins on concision, optimizer freedom, and parallelism [гл.2, с.70–73].
- MapReduce: `map` emits key/value per doc, framework groups by key, `reduce` folds per key; both must
  be **pure**; MongoDB added a declarative aggregation pipeline in v2.2 [гл.2, с.73–76].
- Property graph = vertices (id, out-edges, in-edges, key/value props) + edges (id, tail, head, label,
  props); indexes on `tail_vertex` and `head_vertex` [гл.2, с.77–79].
- Graph query languages: **Cypher** (Neo4j), **SPARQL** (RDF triple-stores), **Datalog** (Datomic,
  Cascalog); triples are `(subject, predicate, object)` [гл.2, с.81–83].
- Variable-length traversal `:WITHIN*0..` ("zero or more times") ≡ SQL:1999 `WITH RECURSIVE` CTEs but
  far more verbose [гл.2, с.88].

## Anti-patterns

| Anti-pattern | Why it fails | Source |
|---|---|---|
| Storing a JSON blob in a TEXT column then expecting to query inside it | The DB can't query into that column — you must load and parse app-side | ku01 |
| Picking document model when many-to-many links exist | No joins → denormalize (stale copies) or emulate joins app-side (slow, complex) | ku02 |
| Assuming the v1 relationship fit holds forever | Interconnection density grows as features are added; a document fit can rot into needing joins | ku02 |
| Duplicating a standardized value (region/company) inline | Redundancy + inconsistency when only some copies get updated | ku03 |
| Large documents / writes that grow encoded size | Whole document is loaded per read and rewritten per update — wasteful | ku05 |
| Running a naive `ALTER TABLE` + `UPDATE` migration on a big MySQL table | MySQL copies the whole table (downtime); the UPDATE rewrites every row (slow in any DB) — use pt-online-schema-change / gh-ost | ku04 |
| Map/reduce functions that query the DB or have side effects | Breaks the purity contract → can't be re-run/parallelized safely | ku07 |
| Forcing recursive/graph traversal through SQL CTEs when interconnections are dense | Correct but wildly verbose (4 vs 29 lines) — a native graph engine is the right tool | ku08 |

## Related decisions
- Chose a **document model** here → `ddia-encoding-and-schema-evolution`: schema-on-read pushes the
  format-compatibility burden onto reader/writer code, so evolution rules matter more.
- Sized documents and set aggregate boundaries → `ddia-storage-engine-tradeoffs`: whole-document
  rewrite cost depends on the underlying LSM/B-tree engine.
- Went **leaderless/denormalized** to avoid joins → `ddia-transaction-isolation-choice`: keeping
  denormalized copies consistent is exactly the concurrency/isolation problem you now inherit.

## Источник
Derived from «Высоконагруженные приложения» (M. Kleppmann, DDIA рус.), главы 2.
KUs: ddia-ch02-ku01, ddia-ch02-ku02, ddia-ch02-ku03, ddia-ch02-ku04, ddia-ch02-ku05,
ddia-ch02-ku06, ddia-ch02-ku07, ddia-ch02-ku08. Deep reference: references/knowledge-units.md.

Anchor quotes (verbatim, for human spot-check):
- "MySQL is the notable exception, copying the whole table" [гл.2, с.68].
- "map and reduce must be pure" [гл.2, с.75].

## Self-check
- [x] Every criterion traces to a listed KU?
- [x] Facts carry page anchors?
- [x] trust_tier 0 (machine-distilled, unreviewed)?

## Examples
- «документная или реляционная БД для профиля пользователя?» → document for a self-contained tree, relational once many-to-many links appear, cites гл.2.
- "modeling a social graph where anything relates to anything" → recommends a graph engine (Cypher variable-length traversal) over recursive SQL CTEs.
- «нормализовать регион или встроить строкой?» → ID-reference for standardized values, inline string for free-form user text.

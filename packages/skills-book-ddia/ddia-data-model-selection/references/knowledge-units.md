# Knowledge Units — ddia-data-model-selection

Deep-lookup reference for the `ddia-data-model-selection` skill. Machine-distilled
Knowledge Units from «Высоконагруженные приложения» (M. Kleppmann, DDIA рус.), глава 2.
Facts and technique-names preserved with page anchors; prose paraphrased.

---

## ddia-ch02-ku01 — Three ways to store one-to-many data in a relational DB (impedance mismatch)
- **Type:** decision-framework
- **Pages:** 56, 57, 58

**Problem.** Application objects (a resume with many jobs, schools, contacts) don't map
cleanly onto flat relational rows/columns. How do you represent one-to-many relations?

**Content.** The object/relational impedance mismatch forces a translation layer; ORMs
(ActiveRecord, Hibernate) reduce boilerplate but don't erase it. Three storage options for
a one-to-many structure:
1. **Normalized separate tables** (jobs, education, contacts) referencing the parent by
   foreign key — the pre-SQL:1999 default.
2. **Structured / XML or JSON column types** (supported to varying degrees by Oracle, DB2,
   MS SQL Server, PostgreSQL) so multi-valued data lives in one row but stays
   queryable/indexable.
3. **Encode as a JSON/XML document in a TEXT column** — simplest, but the DB cannot query
   inside it.

For self-contained document-like data (a resume) a single JSON document gives better
**locality**: one read instead of multiple queries or a multi-way join. One-to-many
relations form a tree, which JSON makes explicit.

**Applicability.** Choosing how to persist a document-shaped aggregate (profile, order,
event) in a relational or document store.

**Limits.** Option 3 loses in-DB queryability; JSON locality helps only when you fetch the
whole document. Says nothing about many-to-many, which breaks the single-document approach.

---

## ddia-ch02-ku02 — Choosing document vs relational vs graph model by relationship shape
- **Type:** decision-framework
- **Pages:** 65, 66, 90, 91

**Problem.** Which data model yields the simplest application code and best performance for
a given app?

**Content.** Decide by the dominant relationship type between records:
- **Document-like data** — a tree of one-to-many relations usually loaded all at once, with
  few links between documents → document model. Relational "shredding" (splitting into many
  tables) here produces cumbersome schemas and over-complex code.
- **Many-to-many relations present** → document model becomes unattractive: it lacks joins,
  so you either denormalize (and must keep copies consistent) or emulate joins with multiple
  app-side queries — slower and more complex than a DB-native join. Relational is fine.
- **Dense/complex interconnections** → a graph model is the most natural.

Chapter-summary rule: document DBs suit self-contained documents with rare inter-document
links; graph DBs suit data where anything can relate to anything; relational sits in
between. No model is universally simpler — it depends on the relationships in your data.
Models can emulate each other but the result is usually awkward, which is why different
systems are used for different needs.

**Applicability.** Early architecture decision when picking a database family for a new
service or feature.

**Limits.** Relationship density can grow as features are added — a fit at v1 may not hold
later. Ignores fault-tolerance and concurrency differences (deferred to later chapters).

---

## ddia-ch02-ku03 — Store an ID vs a duplicated text string (normalization)
- **Type:** heuristic
- **Pages:** 59, 60

**Problem.** Should a human-meaningful attribute (region, industry, company) be stored
inline as text or as a reference ID?

**Content.** Prefer an ID when the value is drawn from a standardized list. Benefits of an
ID reference: the human-meaningful string lives in exactly one place, so it can be changed
globally without touching every record; consistent spelling/style; no ambiguity; easy
localization; better search (e.g. encoding that Seattle is in Washington). Storing the text
inline duplicates it in every record, creating redundancy and inconsistency risk when only
some copies are updated. IDs have no meaning to humans and therefore never need to change
even when the thing they point to changes. Removing this duplication is the essence of
**normalization**. Rule of thumb: if a value that could live in one place is duplicated,
the schema is not normalized. Caveat: normalization needs many-to-one relations (many people
share one region), which the document model handles poorly (weak/absent joins).

**Applicability.** Schema design decisions about reference data, enumerations, and shared
entities.

**Limits.** If the field is free-form user text, store it as a string. Normalized
many-to-one relations are awkward in document DBs and may push you toward app-side joins or
in-memory lookup tables.

---

## ddia-ch02-ku04 — Schema-on-read vs schema-on-write
- **Type:** tradeoff-table
- **Pages:** 66, 67, 68

**Problem.** Whether the database should enforce a schema, and how each choice affects
format changes.

**Content.** Document DBs (and relational JSON) are often called "schemaless", but a better
framing is **schema-on-read** (structure is implicit, interpreted when data is read) vs
**schema-on-write** (traditional relational: explicit schema enforced at write time).
Analogy: schema-on-read is like dynamic/runtime type checking; schema-on-write is like
static/compile-time type checking — neither is universally right.

Impact on a format change (e.g. splitting a full name into first/last):
- **Schema-on-read** — start writing new documents with the new field and handle
  old-format docs in app code at read time.
- **Schema-on-write** — run a migration (ALTER TABLE ADD COLUMN + UPDATE).

Fact: most relational DBs run ALTER TABLE in a few milliseconds — **MySQL is the notable
exception**, copying the whole table (minutes/hours of downtime on large tables; tools like
**pt-online-schema-change** and **gh-ost** work around it). An UPDATE rewriting all rows is
slow in any DB. Schema-on-read is preferable when records are heterogeneous (many object
types, or structure controlled by changing external systems); a schema is useful when all
records are expected to share one structure.

**Applicability.** Deciding whether to enforce schema, and planning schema/format evolution.

**Limits.** MySQL ALTER behavior may differ by version/engine and online-DDL tooling.
Heterogeneity judgment is app-specific.

---

## ddia-ch02-ku05 — Document storage locality tradeoff
- **Type:** heuristic
- **Pages:** 68, 69

**Problem.** When does storing related data together as one document actually pay off?

**Content.** Documents are stored as single contiguous strings (JSON/XML or binary like
BSON). Locality benefits reads **only** when you need large parts of the document at once
(e.g. rendering a page): splitting across tables needs multiple index lookups (more disk
seeks). But the DB typically must load the **entire** document even to read a small field —
wasteful for large documents — and an update usually rewrites the whole document (only
changes that don't alter the encoded size can be done in place). Practical guidance: keep
documents small and avoid writes that grow their size. Locality-grouping is not exclusive to
the document model: Google **Spanner** offers it in a relational schema by interleaving child
rows within a parent, **Oracle** via multi-table index cluster tables, and
**Bigtable/Cassandra/HBase** via the column-family concept.

**Applicability.** Sizing documents and deciding aggregate boundaries; tuning read/write
patterns.

**Limits.** These constraints meaningfully narrow where document DBs are a good fit;
whole-document rewrite behavior varies by engine.

---

## ddia-ch02-ku06 — Declarative vs imperative query languages
- **Type:** tradeoff-table
- **Pages:** 70, 71, 72, 73

**Problem.** Why declarative query languages (SQL) win over imperative record-navigation
APIs.

**Content.** Imperative code (as in IMS/CODASYL, iterating records one at a time) specifies
**how** to get results in a fixed order; declarative languages (SQL, relational algebra,
e.g. selection σ_family=Sharks(animals) → `SELECT * FROM animals WHERE family='Sharks'`)
specify only the **pattern** of desired results — conditions, sorting, grouping,
aggregation — and leave execution (indexes, join methods, ordering) to the query optimizer.
Advantages of declarative:
1. more concise;
2. hides engine internals so the DB can improve performance without query changes;
3. because SQL doesn't guarantee row order unless asked, the DB is free to reorder/relocate
   rows (e.g. compaction) without breaking queries;
4. far better suited to **parallel** execution across cores/machines, since it specifies a
   result pattern not an algorithm — important now that CPUs scale by adding cores, not
   clock speed.

The same gain appears in the browser: a CSS/XPath selector (`li.selected > p`) declaratively
restyles matching elements and auto-updates when state changes, whereas the imperative
DOM-manipulation equivalent is longer, buggier, and won't undo itself.

**Applicability.** Justifying query-language and API design choices; understanding
optimizer-driven performance.

**Limits.** Declarative languages are more limited in raw expressiveness (that limitation is
what enables optimization).

---

## ddia-ch02-ku07 — MapReduce query model and its purity constraints
- **Type:** methodology
- **Pages:** 73, 74, 75, 76

**Problem.** How to express read-only aggregation queries over many documents in a
distributed NoSQL store.

**Content.** MapReduce is a programming model (promoted by Google) for processing large data
in blocks across many machines; supported in limited read-only form by MongoDB and CouchDB.
It is neither fully declarative nor fully imperative: logic is expressed as **map** and
**reduce** functions the framework calls repeatedly. `map` is called once per matching
document and emits key/value pairs; the framework groups pairs by key; `reduce` is called
once per key to fold its values. Example (count sharks per month in MongoDB): map emits
`(year+'-'+month, numAnimals)`; reduce returns `Array.sum(values)`; e.g. `emit('1995-12',3)`
and `emit('1995-12',4)` → `reduce('1995-12',[3,4]) = 7`. **Critical constraint:** map and
reduce must be **pure** — use only their inputs, no additional DB queries, no side effects —
which lets the DB run them anywhere, in any order, and re-run on failure. Downside: writing
two coordinated JS functions is harder than one query and gives the optimizer less room, so
MongoDB later added the declarative JSON-syntax **aggregation pipeline** (v2.2) —
illustrating that a NoSQL system can accidentally reinvent SQL in disguise.

**Applicability.** Writing distributed aggregation queries; understanding why analytic
functions must be side-effect-free.

**Limits.** MapReduce is a low-level model; higher-level SQL can be compiled onto it but SQL
has no monopoly on distributed execution and vice versa.

---

## ddia-ch02-ku08 — Property-graph model, graph query languages, and variable-length traversal
- **Type:** definition
- **Pages:** 77, 78, 79, 81, 82, 83, 88

**Problem.** How to model and query data where many-to-many relationships are frequent and
interconnections are complex.

**Content.** When many-to-many links are frequent and grow complex, model data as a graph of
**vertices** (nodes/entities) and **edges** (relationships/arcs). **Property graph:** each
vertex has a unique id, a set of outgoing edges, a set of incoming edges, and a collection of
key/value properties; each edge has a unique id, a tail (start) vertex, a head (end) vertex,
a label, and properties. It maps to two relational tables (vertices, edges) with indexes on
both `tail_vertex` and `head_vertex` to traverse in either direction. Key flexibility: any
vertex can connect to any other (no schema restriction), and different edge labels keep
multiple kinds of relationships in one clean graph.

Declarative graph query languages: **Cypher** (Neo4j), **SPARQL** (for RDF triple-stores;
predates Cypher, whose pattern matching derives from it), and **Datalog** (a Prolog subset,
foundation for later languages; used by Datomic, Cascalog). Triple-stores model data as
`(subject, predicate, object)` triples, near-equivalent to property graphs. A defining
strength is **variable-length path traversal**: Cypher `:WITHIN*0..` means "follow the WITHIN
edge zero or more times" (like `*` in regexes); the same is expressible in SQL since
**SQL:1999** via recursive CTEs (`WITH RECURSIVE`, in PostgreSQL/DB2/Oracle/SQL Server) but
far more verbosely — one example is 4 lines of Cypher vs 29 of SQL.

**Applicability.** Choosing and querying a graph database; deciding when relational recursion
suffices vs a native graph engine.

**Limits.** For simple many-to-many cases relational is adequate; SQL recursive CTEs work but
are unwieldy. Datalog suits reusable/complex rules more than simple one-off queries.

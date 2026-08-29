---
name: ddia-encoding-and-schema-evolution
description: >
  Pick a SERIALIZATION format and evolve its schema across versions/services without breaking rolling
  upgrades: Avro vs Protobuf vs Thrift vs JSON, backward/forward compatibility, safely add/remove a field,
  RPC and message-payload versioning. Byte-level wire/on-disk ENCODING + version compat ONLY — NOT the
  logical data model or query shape (→ ddia-data-model-selection).
  Triggers (RU+EN): "формат сериализации", "эволюция схемы", "обратная и прямая совместимость",
  "JSON или Protobuf", "Avro vs Thrift vs Protobuf", "backward/forward compatibility",
  "rolling upgrade schema change", "add/remove a field safely", "RPC payload format".
trust_tier: 1
trust_tier_label: "Machine-distilled from DDIA — routing evals passed (CP3.5 gate 2026-07-04)"
trust_tier_path: "Human-review against the cited pages to promote to Tier 2"
derived_from: [ddia-ch04-ku01, ddia-ch04-ku02, ddia-ch04-ku03, ddia-ch04-ku04, ddia-ch04-ku05, ddia-ch04-ku06, ddia-ch04-ku07, ddia-ch04-ku08]
---

# Encoding & Schema Evolution — pick a wire format and change it without breaking old code

## Output
A design recommendation for the encoding: the serialization format (JSON / Thrift / Protobuf / Avro),
whether a given schema change is rolling-upgrade-safe, and the compatibility direction the data path
demands — with the гл.4 facts backing it — folded into the ADR or architecture step.

## When to use / NOT
- **Use when:** choosing a serialization format for RPC payloads, message-queue bodies, DB blobs, file dumps, or public APIs; deciding whether a specific schema change (add/remove/rename/retype a field) is safe under a rolling upgrade; reasoning about which compatibility direction (backward vs forward) a given data path demands.
- **NOT for:** choosing the database's *data model* (relational vs document vs graph) → `ddia-data-model-selection`; choosing the on-disk *storage engine* (LSM vs B-tree) → `ddia-storage-engine-tradeoffs`; the failure/idempotency semantics of retries across a cluster → `ddia-distributed-consistency-consensus`.

## Decision criteria

### 1. Which encoding family?
| Family | Pick when | Cost / risk |
|--------|-----------|-------------|
| Language built-ins (pickle, Java Serializable, Marshal, Kryo) | Truly transient, single-language, throwaway | Language lock-in; **arbitrary-code-execution on decode (CWE-502)**; weak versioning; inefficient — avoid beyond transient use |
| Textual JSON / XML / CSV | Cross-organization interchange; human-readability or ecosystem ubiquity matters most | Ambiguous number types; **int > 2^53 loses precision**; no binary (Base64 = +~33%); schemas optional/weak |
| Binary schema-based (Thrift, Protobuf, Avro) | Internal data at scale; you want compact bytes + enforced fwd/back compat + schema-as-docs + codegen | Not human-readable without decoding; must manage schemas |

Rule of thumb: **internal → binary schema-based; between orgs → textual** (the hard part there is just getting parties to agree on a format). Size savings from binary are negligible on small data, decisive at terabyte scale.

### 2. Which binary format — Thrift/Protobuf vs Avro?
| Dimension | Thrift / Protobuf (tag-based) | Avro (tag-less, reader+writer schema) |
|-----------|------------------------------|----------------------------------------|
| How fields are identified | Numeric field tags embedded in the bytes | By field **name**, resolved between writer's & reader's schema |
| Optional/required | Explicit markers; `required` = runtime presence check only | No markers — use **union types + defaults** instead |
| Add a field | New tag; must be optional/have default | Must have a default value |
| Remove a field | Only optional fields; never reuse the tag | Only fields that have a default |
| Rename a field | Free (names not on the wire) | Via reader-side **aliases** (backward-only) |
| Dynamically generated schemas (e.g. from a SQL table) | Awkward — tags assigned manually | Friendly — no tags to manage |
| Reader needs the writer's schema? | No (tags are self-describing) | **Yes** — supply it per context (see §4) |

Choose **Avro** for Hadoop/Kafka pipelines, DB dumps, and auto-derived schemas. Choose **Thrift/Protobuf** when you want self-describing records and language codegen without a schema-distribution channel.

### 3. Which compatibility direction does this data path require?
| Data-flow mode | Required guarantees | Why |
|----------------|---------------------|-----|
| Through a **database** | Backward **and** forward | New & old code coexist during rollout; a new value may be read by still-running old code and vice versa. Data outlives code → store holds many schema versions at once |
| Through **services (REST/RPC)** | Backward on **requests**, forward on **responses** | You can usually assume servers upgrade before clients |
| Through a **message broker** | Backward **and** forward | Broker is format-agnostic; sender & receiver evolve independently, fire-and-forget |

### 4. How does an Avro reader get the writer's schema?
- **Big file, many records** (Hadoop) → embed the writer's schema once at the file start (object-container format).
- **Per-record DB writes** → prefix each record with a schema-version number; look it up in a **schema registry** (version = incrementing int or schema hash).
- **Network connection** → negotiate the schema version in the connection handshake, reuse it for the connection lifetime (Avro RPC).

## Key facts & formulas
- Same 3-field record `{userName, favoriteNumber:1337, interests:[..]}` encoded size: JSON ≈ 81 B, MessagePack 66 B, Thrift Binary 59 B, Thrift Compact 34 B, Protobuf 33 B, **Avro 32 B (smallest)** [гл.4, с.149–151, 155].
- Variable-length int packing: `1337` fits in 2 bytes; values −64..63 in 1 byte, −8192..8191 in 2 bytes [гл.4, с.150–151].
- "Binary JSON" (MessagePack, BSON) barely beats text because it still **embeds field names** [гл.4, с.149].
- JSON/JS integers above **2^53** lose precision in IEEE-754 double; Base64 for binary inflates size **~33%** [гл.4, с.147].
- Thrift/Protobuf tag rules: rename = safe; **never change/reuse a tag**; added field must be optional-or-default (backward compat); removed field must be optional and its tag never reused [гл.4, с.153–154].
- Avro: forward = new writer + old reader; backward = new reader + old writer; add/remove a field **only if it has a default**; `null` is a valid default only as the **first branch** of a union [гл.4, с.156–158].
- Language-specific deserialization can instantiate arbitrary classes → RCE (**CWE-502**) [гл.4, с.146].

## Anti-patterns
| Anti-pattern | Failure mode | Source |
|--------------|--------------|--------|
| Using pickle/Java Serializable/Marshal beyond transient scope | Language lock-in, RCE on decode, no versioning | ku01 |
| Trusting JSON for large integers or binary blobs | Silent precision loss > 2^53; Base64 bloat | ku01 |
| Changing or reusing a Thrift/Protobuf field tag | Invalidates all existing encoded data | ku04 |
| Adding a `required`/no-default field | New code fails reading old data (breaks backward compat) | ku04, ku05 |
| int64→int32 (or any narrowing) retype | Old code truncates the value | ku04 |
| Avro decode without the exact writer's schema | Cannot resolve fields → decode fails | ku05, ku06 |
| Old code re-writing a decoded record (Fig 4.7 trap) | Unknown newer fields silently dropped on round-trip | ku07 |
| Treating an RPC call as a local function | Timeout = unknown outcome; blind retry double-executes non-idempotent ops | ku08 |

## Related decisions
- Chose a schema-based binary format under rolling deploys → the *deploy ordering* and coexistence assumptions live in `ddia-replication-topology-choice` (which nodes run which version when).
- RPC retry after an unknown-outcome timeout needs idempotency → `ddia-distributed-consistency-consensus` / `ddia-transaction-isolation-choice` (exactly-once and dedup guarantees).
- Broker-based async encoding underpins `ddia-batch-and-stream-processing` (message logs, Kafka schema registries feed stream jobs).

## Источник
Derived from «Высоконагруженные приложения» (M. Kleppmann, DDIA рус.), глава 4.
KUs: ddia-ch04-ku01, ku02, ku03, ku04, ku05, ku06, ku07, ku08. Deep reference: references/knowledge-units.md.
- "data outlives code" — records may still sit in original encoding years later [гл.4, с.161].
- Backward = new code reads old data; forward = old code reads new data [гл.4, с.153].

## Self-check
- [x] Every criterion traces to a listed KU (ku01/03 → family; ku04/05/06 → binary format; ku02/07 → compat direction; ku08 → RPC)
- [x] Facts carry page anchors [гл.4, с.X]
- [x] trust_tier 0 (machine-distilled, unreviewed)

## Examples
- «JSON или Protobuf для внутреннего RPC?» → binary schema-based (Protobuf) internally, textual between orgs, cites гл.4.
- "Avro vs Thrift for a Kafka/Hadoop pipeline" → Avro for auto-derived schemas + DB dumps, Thrift/Protobuf for self-describing records without a schema channel.
- «безопасно ли добавить обязательное поле при rolling deploy?» → no — a new field must be optional or carry a default to keep backward compat.

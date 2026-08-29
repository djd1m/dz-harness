# Knowledge Units — ddia-encoding-and-schema-evolution

Deep-lookup reference for the `ddia-encoding-and-schema-evolution` skill.
Source: «Высоконагруженные приложения» (M. Kleppmann, DDIA рус.), глава 4.
Machine-distilled, unreviewed. Page anchors point at the Russian edition.

---

## ddia-ch04-ku01 — Choosing a data-encoding format: three families
- **Type:** tradeoff-table
- **Pages:** 146, 147, 148, 160, 161, 173, 174

**Problem:** Which serialization format should you pick for persisting or transmitting data across process/version boundaries?

**Content:** Three families with distinct trade-offs.
1. **Language-specific built-ins** (Java `java.io.Serializable`, Ruby `Marshal`, Python `pickle`, Kryo): minimal code but lock you to one language, pose security risks (decoding arbitrary bytes can instantiate arbitrary classes → remote code execution, CWE-502), neglect versioning, and are often inefficient — avoid for anything beyond very transient use.
2. **Textual JSON/XML/CSV:** widely supported and human-readable, good as an interchange "lowest common denominator" between organizations, but ambiguous about number types (JSON can't distinguish int vs float; integers > 2^53 lose precision in IEEE-754 double / JavaScript), no native binary-string support (Base64 workaround inflates size ~33%), and schemas optional/weak (CSV has none).
3. **Binary schema-based** (Thrift, Protocol Buffers, Avro): compact, well-defined forward/backward compatibility, schema doubles as always-current documentation and enables codegen for statically typed languages; downside is data must be decoded to be human-readable.

Rule of thumb: for internal data prefer binary schema-based; for cross-organization interchange textual formats often win because the hard part is just getting parties to agree.

**Applicability:** Selecting an encoding for RPC payloads, message queues, database blobs, file dumps, or public APIs.

**Limits:** Binary "lowest-common-denominator" savings are negligible for small datasets; matter at terabyte scale. Textual formats remain fine when human-readability or ecosystem ubiquity outweighs efficiency.

---

## ddia-ch04-ku02 — Backward vs forward compatibility
- **Type:** definition
- **Pages:** 153, 157, 161, 173

**Problem:** What exactly do "backward" and "forward" compatibility mean when old and new code coexist during rolling upgrades?

**Content:** **Backward compatibility:** newer code can read data written by older code (usually easy — you know the old format). **Forward compatibility:** older code can read data written by newer code (harder — old code must tolerate additions it doesn't understand). Both are needed whenever different node versions run simultaneously (rolling/staged deployments), because a value written by a new version may be read by a still-running old version, and vice versa. Compatibility is a relationship between the encoding process and the decoding process. Guiding maxim: data outlives code — five-year-old records may still sit in original encoding, so schema evolution must let the store appear as if uniformly encoded even when it holds many schema versions.

**Applicability:** Reasoning about safe schema changes, rolling deploys, and long-lived stored data.

**Limits:** Direction of the required guarantee depends on data-flow mode (see ku07): e.g. for RPC one may assume servers update before clients, needing only backward-compat requests + forward-compat responses.

---

## ddia-ch04-ku03 — Binary encoding size comparison (same 3-field record)
- **Type:** heuristic
- **Pages:** 149, 150, 151, 155

**Problem:** How much space do the common encodings actually save for the same small record?

**Content:** Encoding the same example record `{userName, favoriteNumber:1337, interests:[..]}` yields:

| Encoding | Bytes |
|----------|-------|
| Textual JSON (whitespace stripped) | ≈ 81 |
| MessagePack (binary JSON) | 66 |
| Thrift BinaryProtocol | 59 |
| Thrift CompactProtocol | 34 |
| Protocol Buffers | 33 |
| Avro | 32 (most compact) |

Key techniques driving the shrinkage: schema-based formats omit field names, sending numeric field tags instead (Thrift/Protobuf) or nothing at all (Avro relies on positional order + schema); CompactProtocol/Protobuf/Avro pack field-type+tag into one byte and use variable-length integers (1337 fits in 2 bytes; values −64..63 in 1 byte, −8192..8191 in 2 bytes, etc.). "Binary JSON" variants (MessagePack, BSON, etc.) barely beat text because they still embed field names.

**Applicability:** Estimating payload savings when moving from JSON to a schema-based binary format.

**Limits:** Absolute byte counts are for this specific tiny record; the ranking generalizes but the magnitude of savings scales with how much field-name repetition you eliminate.

---

## ddia-ch04-ku04 — Thrift / Protocol Buffers field-tag evolution rules
- **Type:** checklist
- **Pages:** 153, 154

**Problem:** How do you evolve a Thrift/Protobuf schema without breaking existing encoded data?

**Content:** Encoded record = concatenation of fields, each identified by its numeric field tag + a type signature; unset fields are simply omitted. Rules:
1. You MAY rename a field freely — encoded data never references names.
2. You MUST NOT change or reuse a field's tag number — doing so invalidates all existing data.
3. Adding a field: give it a new tag; old code ignores unknown tags (it uses the type signature to know how many bytes to skip) → forward compatibility.
4. A newly added field MUST be optional or have a default value, otherwise new code reading old data fails the required-field check → this is what preserves backward compatibility.
5. Removing a field: only optional fields may be removed, and the retired tag number must never be reused.

Note: "required" only triggers a runtime presence check; it has no effect on the wire bytes. Protobuf `repeated` fields simply repeat the same tag, enabling an optional→repeated migration; Thrift has a dedicated list type (supports nested lists but not that single→multi migration).

**Applicability:** Editing .proto / Thrift IDL schemas in production systems undergoing rolling upgrades.

**Limits:** Data-type changes risk precision loss/truncation (e.g. int64→int32 read by old code truncates). Dynamic schema generation from a DB is awkward because tags must be assigned/managed manually.

---

## ddia-ch04-ku05 — Avro reader/writer schema resolution & evolution
- **Type:** methodology
- **Pages:** 156, 157, 158

**Problem:** How does Avro (which has no field tags) achieve schema evolution?

**Content:** Avro distinguishes the **writer's schema** (used to encode) from the **reader's schema** (expected by the decoder); they need not be identical, only compatible. At decode time the Avro library resolves conflicts by matching fields by NAME: field order differences are irrelevant; a field present in the writer's schema but absent in the reader's is ignored; a field the reader expects but the writer omitted is filled with the reader's declared default. Evolution rules: you may add or remove a field only if it has a default value. Adding a field without a default breaks backward compatibility; removing a field without a default breaks forward compatibility. To allow null, use a union type (e.g. `union{null,long,string}`); null is only a valid default if it is the first branch of the union — explicit nullability prevents bugs. Renaming: reader schema can list aliases → backward-compatible but not forward-compatible; adding a union branch is likewise backward- but not forward-compatible. In Avro terms: forward = new writer + old reader; backward = new reader + old writer. Avro has no optional/required markers — union types + defaults replace them. Because there are no tags, Avro is friendlier to dynamically generated schemas (e.g. auto-derived from a relational table).

**Applicability:** Hadoop/Avro pipelines, database dumps, Kafka schema registries, dynamically generated schemas.

**Limits:** Correct decoding requires the reader to obtain the exact writer's schema (see ku06); a type change works only if Avro can convert it.

---

## ddia-ch04-ku06 — How the reader obtains the Avro writer's schema
- **Type:** decision-framework
- **Pages:** 158

**Problem:** Avro decoding needs the exact writer's schema, but you can't embed the full schema in every record. How do you supply it per context?

**Content:** Choose by usage context:
1. **Large file with many records** (e.g. Hadoop): write the writer's schema once at the start of the file — Avro's object-container-file format does this.
2. **Database with individually written records** (written at different times with different schemas): prefix each record with a schema version number and keep a schema registry mapping versions→schemas; the reader extracts the version and looks up the schema (as LinkedIn's Espresso does).
3. **Records over a network connection:** the two processes negotiate the schema version during connection handshake and reuse it for the connection's lifetime (Avro RPC works this way).

A schema-version database is valuable regardless — it serves as documentation and lets you check compatibility before deployment. A version can be an incrementing integer or a hash of the schema.

**Applicability:** Designing Avro storage/transport: file dumps, per-record DB storage, RPC/streaming.

**Limits:** Specific to schema-carrying formats like Avro; tag-based formats (Thrift/Protobuf) don't need this because tags are embedded.

---

## ddia-ch04-ku07 — Data-flow modes and their compatibility requirements
- **Type:** tradeoff-table
- **Pages:** 162, 163, 164, 170, 171, 172

**Problem:** How does encoded data actually move between processes, and which compatibility guarantees does each path demand?

**Content:** Three modes.
1. **Through a database:** writer encodes, reader decodes; both backward AND forward compatibility are needed because rolling upgrades mean new and old code coexist. Watch the trap in Fig 4.7 — if old code decodes a record into app objects and re-writes it, unknown newer fields can be silently dropped; preserve unrecognized fields. Data outlives code, so the store holds many schema versions at once.
2. **Through services (REST/RPC):** client encodes request, server decodes it and encodes response, client decodes response. Because you can usually assume servers upgrade before clients, you need only backward-compat on requests and forward-compat on responses. RPC compatibility is inherited from the underlying encoding (Thrift/gRPC-Protobuf/Avro follow their format's rules). Cross-org APIs may need compatibility maintained indefinitely, often forcing providers to run multiple API versions (version via URL or Accept header).
3. **Asynchronous message passing via a broker:** sender encodes, receiver decodes; broker is format-agnostic (message = bytes + metadata). Broker advantages over direct RPC: buffers when the recipient is down/overloaded (reliability), can redeliver to crashed consumers (no loss), decouples sender from receiver's IP/port (cloud-friendly), enables one-to-many delivery, and logically decouples publisher from subscriber. Communication is typically one-way/fire-and-forget; replies use a separate channel. If a consumer republishes, preserve unknown fields (same Fig 4.7 trap).

**Applicability:** Deciding compatibility test coverage and safe deploy ordering for DB-backed, service, and queue-based data flows.

**Limits:** The "servers update before clients" assumption is a convenience specific to services; it does not hold for DB or peer message flows, which need full bidirectional compatibility.

---

## ddia-ch04-ku08 — Why a network (RPC) call is not a local function call
- **Type:** heuristic
- **Pages:** 167, 168, 169

**Problem:** RPC frameworks make remote calls look local ("location transparency") — why is that abstraction leaky and what must you handle?

**Content:** A remote request differs fundamentally from an in-process call:
1. **Unpredictability** — requests/responses can be lost to network faults, or the remote host may be slow/unreachable, all outside your control; expect these and retry.
2. **A timeout yields an unknown outcome** — unlike a local call that returns, throws, or hangs, a network call may time out with no result, and you cannot know whether the request was delivered and executed.
3. **Retries require idempotency** — retrying a request whose response (not request) was lost re-executes the action unless the protocol has a deduplication/idempotency mechanism.
4. **Latency is far higher and far more variable** (sub-millisecond in the good case, many seconds when congested).
5. **Parameters must be encoded to bytes** — cheap for primitives, expensive/awkward for large objects and pointers.
6. **Cross-language type mapping** — client and server may use different languages, and not all type systems agree (e.g. JavaScript's >2^53 integer problem).

Conclusion: don't pretend a remote service is a local object. REST's appeal is that it does not hide the network. Newer RPC frameworks acknowledge this (Finagle/Rest.li use futures/promises; gRPC supports streams) and some add service discovery.

**Applicability:** Designing or debugging service-to-service calls, retry logic, and timeout handling.

**Limits:** Idempotency and detailed failure semantics are deferred to later chapters (8 and 11); this KU is the design-time checklist, not the full protocol design.

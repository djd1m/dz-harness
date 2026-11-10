# ADR-001: Reusable snapshot search module
## Status
accepted for implementation candidate; revisit after larger corpus tests.
## Context
Existing search embeds catalog rules. Experiment prefers Lance on 32 scenarios, semantic-only has equal recall. Owner requires cross-project reuse.
## Decision
Create standalone ESM package under integrations/hybrid-retrieval exposing buildSnapshot/openSnapshot and OpenRouter embedding helper separately. Core accepts generic documents, vectors and injected lexicalizer + stable lexicalizer ID. It has no model key or DZ metadata. Build a new immutable directory using sibling staging and rename; bind revision/model/dimensions/lexicalizer/content in manifest. Private HTTP wrapper validates bounded vectors/query/revision and delegates to the module. Adapter performs embedding then calls search, attaches trusted scenario records by ID, explicitly logs degraded lexical mode with no user text on availability failure. Startup rejects an invalid/stale configured index; no stale embedding query is used.
## Alternatives
Keep search in advisor source: easiest but fails reuse. Full LlamaIndex Python: additional runtime, not justified by measured corpus. Separate vector DB daemon: avoid adding persistence manager beyond embedded Lance. Semantic-only: matches recall, keep as later ablation rather than claiming fusion caused gain.
## Consequences
Native platform dependency stays in search container/build tool. Exclude optional image/model integrations; install pinned native addon explicitly. Exact IDs/order remain tested; no claim of large-corpus ANN throughput.
## Confirmation
`integrations/hybrid-retrieval/snapshot.test.mjs` must exercise real disk roundtrip, two unrelated corpora, stale/dimension corruption and HTTP validation. Tarball consumer runs outside repo. Source-owned IDs, texts and vector digests are verified before query.

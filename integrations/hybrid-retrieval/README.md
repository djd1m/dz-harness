# Immutable hybrid retrieval

Standalone ESM module for generic IDs, text and precomputed vectors. Reuses the experiment's real Lance cosine flat scan, FTS (simple tokenizer, lowercase, no stemming or stopword removal) and native RRF. The core does not import a catalog, provider client, website or credential. The separate `./openrouter` subpath provides an optional embedding helper without loading Lance.

This candidate targets Node 24 on Linux x64 glibc. Install with `npm ci --omit=optional --ignore-scripts`: Lance and its explicit native addon are pinned to 0.41.0. Other platform binaries and optional model/image integrations are omitted. This package is private; local `npm pack` is supported, registry publication is excluded.

```js
import {buildSnapshot, openSnapshot} from '@aicoding/hybrid-retrieval';
const config = {
  directory: '/private/indexes/2026-11-10-r1',
  revision: 'source-r1', model: 'my-embedding-model', dimensions: 2,
};
const built = await buildSnapshot({...config, documents: [
  {id: 'rain', text: 'rainfall and wet weather', vector: [1, 0]},
  {id: 'sun', text: 'sunlight and dry weather', vector: [0, 1]},
]});
built.close();
const snapshot = await openSnapshot(config);
const result = await snapshot.search({query: 'wet weather', vector: [1, 0], revision: 'source-r1'});
// {revision,model,dimensions,lexicalizerId,hits:[{id,score}]}
snapshot.close();
```

`buildSnapshot` and `openSnapshot` are asynchronous and return the same opened-snapshot interface. `close()` is idempotent; finish outstanding searches before closing. `snapshot.identity` and top-level identity properties expose revision, model, dimensions and lexicalizerId. Query limit defaults to 5 and accepts 1–100. IDs are arbitrary nonempty strings (up to 1024 characters), document text up to 100000 characters, query text up to 6000, dimensions 1–8192, and corpus size 1–10000. Empty corpora are rejected. Vectors must be numeric, finite, nonzero and representable as Float32 with a finite positive Float32 squared magnitude; hashing uses their stored Float32 values.

Pass `lexicalize(text)` returning a string or string tokens to inject preprocessing; custom functions require a stable `lexicalizerId`. Without a custom function, the identity transform has fixed ID `identity-v1`. Lexicalized query text that is empty uses exact vector search. All other queries use native hybrid/RRF. The requested limit is passed directly to native Lance hybrid search, preserving the measured candidate window (five by default). Returned hits are sorted by descending score and then binary ID. Native Lance decides membership at a tied cutoff; this final sort does not guarantee global ID ordering among tied candidates outside the returned set. No approximate-index or large-corpus throughput claim is made.

Build writes a unique sibling staging directory, verifies the persisted rows, then renames it into the requested immutable generation. An exclusive sibling build lock serializes builders; existing generations are rejected. A crashed build can leave staging/lock paths requiring operator cleanup only after its owner has stopped. Open checks the caller-supplied identity, manifest version/count/content digest and every actual stored ID, original text, lexicalized text and vector. The manifest binds source revision, embedding model/dimensions and lexicalizer identity. A caller must derive the expected revision independently from its source. Snapshot directories must have a trusted writer and be mounted read-only at runtime; checks do not authenticate hostile rewrites of both manifest and contents. Switching generations requires reopening; there is no mutating service API.

```js
import {createSearchServer} from '@aicoding/hybrid-retrieval/service';
const server = createSearchServer({snapshot});
server.listen(8080, '0.0.0.0'); // caller supplies private-network isolation
```

`GET /health` returns `{ok:true,...identity}` without a provider call. `POST /search` requires JSON containing all four identity fields plus query, vector and optional limit. Identity mismatch or snapshot corruption is HTTP 409, invalid input 400, oversized body 413, and search unavailability 503. Body maximum is 256 KiB, header deadline 5s, body deadline 5s and total request reception deadline 10s. No public-host assumption or authentication is built in; run only on the private search network, with no published host port or key. Caller owns server lifecycle, request concurrency/resource limits and snapshot close after drain.

Stable `SnapshotError.code` values: `INVALID_CONFIG`, `INVALID_DOCUMENTS`, `INVALID_LEXICALIZER`, `INVALID_VECTOR`, `INVALID_QUERY`, `IDENTITY_MISMATCH`, `SNAPSHOT_EXISTS`, `SNAPSHOT_IO`, `SNAPSHOT_CORRUPT`, `SNAPSHOT_CLOSED`, `SEARCH_FAILED`. HTTP returns only codes, never internal exceptions or source text. Integrity mismatch must not be treated as ordinary search availability fallback.

`npm test` runs real Lance disk roundtrips, independent fresh processes, two unrelated corpora, immutable/concurrent builds, identity/vector/corruption rejection, HTTP boundaries, and installation/use of an npm tarball in a temporary directory outside the repository. The external consumer serves a separate corpus over HTTP without catalog imports or credentials. Tests clean up their own temporary artifacts and servers. `npm audit --omit=optional --ignore-scripts` checks the minimal dependency profile.

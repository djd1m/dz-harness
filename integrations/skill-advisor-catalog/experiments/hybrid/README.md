# Offline hybrid retrieval probe

This is an opt-in paid **development experiment**, not a production dependency.
Use Node >=22 on Linux x64 glibc. `.npmrc` omits optional integrations; the required
Lance native addon is an explicit pinned dependency. The default all-optional
installation pulled vulnerable sharp through an unused model integration; the
minimal profile avoids that chain. Keep `.npmrc` and `--omit=optional` on reinstall.

```sh
cd integrations/skill-advisor-catalog/experiments/hybrid
npm ci --omit=optional --ignore-scripts
# Supply OPENROUTER_API_KEY through the existing protected environment, not argv.
node run.mjs embed /absolute/path/to/fresh-experiment
node run.mjs search /absolute/path/to/fresh-experiment
node run.mjs select /absolute/path/to/fresh-experiment
node verify.mjs /absolute/path/to/fresh-experiment
npm audit --omit=optional
```

Embedding: 8 paid requests (three batches plus five single timing probes).
Selection: 128 sequential calls, baseline vs the best of the two tested hybrids.
No retries. Frozen questions are in `docs/proposals/skill-advisor-scenarios/`.
Report says exactly which cases are covered by the approved catalog; questions
are catalog-aware and do not establish population accuracy. Source hashes bind
catalog/questions/model; this is not a provider model-revision guarantee.

Existing artifacts cause refusal; use a fresh directory only for an explicitly
intended additional run. Each selection response saves its own receipt. Embedding
receipts currently persist when all eight calls finish: if that stage fails,
inspect provider accounting before deciding on a new run. Provider timeouts do not
prove cancellation. USD estimates use frozen observed API rates; provider-reported
cost is recorded separately and is not an invoice. This does not change the public
advisor's durable admission counters or production billing configuration.

Search uses the same positive fields as the baseline. Both library lexical legs
receive the existing RU/EN stems; Orama's Russian tokenizer preserves Latin too.
The library FTS legs do not use baseline stopword removal. Fusion is deliberately
untuned: Orama normalized 50/50 scores, Lance default RRF. Lance's small corpus
uses an exact cosine scan, not an ANN index. Timing is sequential warm local work
with cached vectors; embedding and model network latency are separate. No load,
concurrency, malformed-index recovery, or production availability claim.

`verify.mjs` reopens real indexes in a fresh process for all 64 queries and tests
stale revision, invalid vector dimension and paid-rerun refusal without a key.
Temporary negative-control data is under the OS temp directory (`dz-advisor-*`).

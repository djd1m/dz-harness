# Requirements
- FR-1: Reusable Node module with build/open/search API, generic document IDs/text/vectors, injected lexicalizer; no DZ registry, courses, site domain or provider credential required by core.
- FR-2: Immutable dated/revision-bound Lance snapshot, atomic build, validate model/dimension/document content before queries; exact top5 hybrid RRF.
- FR-3: Advisor uses module over private HTTP with existing embedding key/client and unchanged approved renderer. Failed search/embedding falls back explicitly to existing lexical search; no stale vectors used.
- FR-4: Give selector enough source-supported context to avoid x38 false alternatives gap. Keep scenario boundaries; validate new positive and negative paraphrases with a cheap live model.
- FR-5: Two isolated containers: search has read-only index and no provider key; advisor owns model calls and existing persistent admission limits. Caddy routes to advisor; website/image dependencies untouched.
- NFR-1: Credentials never logged or put in index/image/public payloads. No Docker socket, no host source mount; nonroot, read-only fs, dropped caps, bounded memory/CPU/PIDs, internal search network.
- NFR-2: Reuse request/admission ledgers without resets. Trial 30 total /10 daily /cooldown5s /one active. Experiment budget separate, <=$0.30 projected extra paid checks, no implicit retries.
- NFR-3: Source hash approvals retained, package/course mapping trusted. Test real Lance and containers, freeze fresh questions before runs, record failures honestly.
- NFR-4: Reuse from second unrelated corpus through npm tarball and HTTP without importing DZ artifacts. Push PR candidate, no npm release/site publication.

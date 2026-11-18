# ADR-002: Isolate advisor and search from website
## Status
accepted for tested candidate; deployment remains separate.
## Context
Website is static with paid advisor candidate currently inactive; host model and socket bridge were never deployed. Owner asks that search and advisor have separate dependencies/security boundaries.
## Decision
Two containers. Search service binds private container network only, holds no credentials, index read-only. Advisor container serves only API with existing source-verified catalog, provider client and existing site admission implementation through answer injection; no intermediate model HTTP process. Dedicated internal network advisor→search; only advisor joins edge network for Caddy and provider egress. No published host ports in deployment candidate. Compose limits and probes on both, SIGTERM cleanup. Retain Unix-socket branch as historical alternative, document it as superseded for this candidate. Build from pinned source trees, never copy secret env files. Provider key mounted file in advisor only. Preserve existing admission path/format; no initialization on service start.
## Alternatives
Single advisor+Lance container: simplest but native search dependencies share paid-service runtime. Host processes: already tested but weaker dependency/resource separation. Add another gateway container: unnecessary, Caddy already exists.
## Consequences
One extra internal hop and container lifecycle. Search failures degrade visibly to baseline. Existing website can continue when advisor is stopped. Same-origin checking is browser request policy, not authentication; pilot admission is global, no per-person quota claim.
## Confirmation
`deploy/advisor-containers/containers.test.mjs` performs real Docker requests, outsider search isolation, no key in search/image, read-only/root/cap limits and unrelated route control. Test proper ledger continuity without touching live trial state. Candidate manifests validated; publication flag remains false.

## Review amendment
Retain BOTH prior ledgers without auto-initialization. New service wrapper checks existence then reserves model ledger exactly once before paid work; existing site admission independently reserves once. The old preview endpoint keeps its own guard but is not invoked from the container wrapper. Bind-mount writable parent state directory owned by mapped nonroot UID; separate read-only key file only in advisor. Keep active reservation until provider work settles, even after caller disconnect. Expose unpaid /health, validate revision on private search requests. Document stopped-owner stale-lock recovery without state reset.

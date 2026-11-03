# @dzhechkov/cloudru-vm-linux-x64

Site: https://aicoding.space · Source: https://github.com/djd1m/dz-harness/tree/main/packages/cloudru-vm-linux-x64

The Linux/x64 engine for [`@dzhechkov/cloudru-hub`](https://github.com/djd1m/dz-harness/tree/main/packages/cloudru-hub). This is an unofficial Cloud.ru integration, unaffiliated with Cloud.ru.

The staged `@dzhechkov/cloudru-hub@0.1.19` names this `0.2.9` package as its exact Linux/x64 optional dependency. The hub verifies the engine SHA-256 before startup. No postinstall download is used.
The pinned binary has SHA-256 `12adec025f0b39c750457355c8c4e70dd1d430af6c5a59e55ad903bbc91a1f9f`.

For maintainers, the binary is generated from the private `go/cloudru-vm` source and is not committed to Git. Packing from a fresh checkout builds it automatically; an existing binary is verified before packing or mirroring. The build requires Go 1.25.0 on Linux/x64 in `PATH` (or set `CLOUDRU_GO` to its executable) and checks the SHA-256 pinned by the launcher. Run `npm run prepare:binary` to rebuild explicitly.

Timur contributed extensive Cloud.ru API testing and helped identify API behavior and defects.

The staged `0.2.9-20261102` engine retains Kubernetes placement resolution,
read-only `k8s_plan(preflight:true)` observations and receipt-based recovery for
`k8s_create` and `k8s_add_nodepool`. The diagnostic reports unknown create
permissions, quota capacity and inventory completeness explicitly; it does not
promise readiness or authorize a paid create. The new pair adds an exclusive
shared-local project/VM-name claim before VM or static-site security-group
mutation, plus an immutable configured-project/exact-cluster deletion intent
before `k8s_delete`. Duplicate or restarted uncertainty does not replay the
DELETE; receipt recovery reads the exact target and known operation only.
Neither claim has a TTL or forced retry. Other hosts, state roots, old clients,
raw engine paths and direct API callers are outside this coordination.
Local synthetic race, restart and I/O-fault controls cover these corrections;
no new live VM creation or paid-cluster test was used.

This staged engine journals one public-IP attempt
before attach/create. An uncertain response stops further IP mutations,
returns a partial deployment and retains the plan for read-only
`deploy_reconcile`. Targeted VM cleanup keeps borrowed or unproven IPs; a
run-created IP is eligible for one release request only when its exact ID is
freshly observed as available with explicit null VM and interface bindings.
Accepted deletion is reported as pending. Local synthetic tests cover these
paths; no new live Cloud.ru operation was used.

The executable is built with `CGO_ENABLED=0` for a static Linux/x64 binary. The archive contains complete top-level license and notice files for the third-party Go modules linked into this binary. See `THIRD_PARTY_NOTICES.md`.

The package declares `native/cloudru-vm` in pnpm's `publishConfig.executableFiles` so the packed archive retains its execute permission when installed. It is launched by the hub, not exposed as a public `bin` command.

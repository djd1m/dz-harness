# @dzhechkov/cloudru-vm-linux-x64

Site: https://aicoding.space · Source: https://github.com/djd1m/dz-harness/tree/main/packages/cloudru-vm-linux-x64

The Linux/x64 engine for [`@dzhechkov/cloudru-hub`](https://github.com/djd1m/dz-harness/tree/main/packages/cloudru-hub). This is an unofficial Cloud.ru integration, unaffiliated with Cloud.ru.

`@dzhechkov/cloudru-hub@0.1.16` names this `0.2.7` package as its exact Linux/x64 optional dependency. The hub verifies the engine SHA-256 before startup. No postinstall download is used.

For maintainers, the binary is generated from the private `go/cloudru-vm` source and is not committed to Git. Packing from a fresh checkout builds it automatically; an existing binary is verified before packing or mirroring. The build requires Go 1.25.0 on Linux/x64 in `PATH` (or set `CLOUDRU_GO` to its executable) and checks the SHA-256 pinned by the launcher. Run `npm run prepare:binary` to rebuild explicitly.

Timur contributed extensive Cloud.ru API testing and helped identify API behavior and defects.

The matched `0.2.7-20261029` engine includes Kubernetes placement resolution,
read-only `k8s_plan(preflight:true)` observations and receipt-based recovery for
`k8s_create` and `k8s_add_nodepool`. The diagnostic reports unknown create
permissions, quota capacity and inventory completeness explicitly; it does not
promise readiness or authorize a paid create. This candidate has no new live
Kubernetes deployment or `web-image` acceptance result.

The executable is built with `CGO_ENABLED=0` for a static Linux/x64 binary. The archive contains complete top-level license and notice files for the third-party Go modules linked into this binary. See `THIRD_PARTY_NOTICES.md`.

The package declares `native/cloudru-vm` in pnpm's `publishConfig.executableFiles` so the packed archive retains its execute permission when installed. It is launched by the hub, not exposed as a public `bin` command.

# @dzhechkov/cloudru-vm-linux-x64

Site: https://aicoding.space · Source: https://github.com/djd1m/dz-harness/tree/main/packages/cloudru-vm-linux-x64

The Linux/x64 engine for [`@dzhechkov/cloudru-hub`](https://github.com/djd1m/dz-harness/tree/main/packages/cloudru-hub). This is an unofficial Cloud.ru integration, unaffiliated with Cloud.ru.

Install `@dzhechkov/cloudru-hub@0.1.14` on Linux/x64 to receive this package as an exact optional dependency. The launcher verifies the engine SHA-256 before starting it. No postinstall download is used.

For maintainers, the binary is generated from the private `go/cloudru-vm` source and is not committed to Git. Packing from a fresh checkout builds it automatically; an existing binary is verified before packing or mirroring. The build requires Go 1.25.0 on Linux/x64 in `PATH` (or set `CLOUDRU_GO` to its executable) and checks the SHA-256 pinned by the launcher. Run `npm run prepare:binary` to rebuild explicitly.

Timur contributed extensive Cloud.ru API testing and helped identify API behavior and defects.

The executable is built with `CGO_ENABLED=0` for a static Linux/x64 binary. The archive contains complete top-level license and notice files for the third-party Go modules linked into this binary. See `THIRD_PARTY_NOTICES.md`.

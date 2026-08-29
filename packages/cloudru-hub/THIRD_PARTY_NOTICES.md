# THIRD PARTY NOTICES — @dzhechkov/cloudru-hub

This npm package itself contains no third-party code (its launcher, adapters, installer
and tests are original work — see LICENSE Part 1, MIT).

This file exists because of ADR-001 point 4: the `cloudru-vm` engine binary that the
launcher RESOLVES AT RUNTIME (and that a future `@dzhechkov/cloudru-vm-linux-x64`
platform package would carry, post-grant) is a statically linked Go executable that
embeds the following third-party modules (source of record: `engine/go.mod` in the
pinned baseline `hermes-engine-src-20260718.tgz`, sha256
`007e7cbe851d3ecd78f457f81ae3679904b2fd4dac660a0e349dabcde61bbe5c` — see
`features/hermes-claude-adaptation/evidence/ENGINE-BASELINE.json`).

## Direct dependencies (engine/go.mod, require block 1)

| Module | Version | License |
|---|---|---|
| github.com/minio/minio-go/v7 | v7.2.1 | Apache-2.0 |
| github.com/spf13/cobra | v1.10.2 | Apache-2.0 |
| golang.org/x/crypto | v0.51.0 | BSD-3-Clause |
| golang.org/x/term | v0.43.0 | BSD-3-Clause |
| gopkg.in/yaml.v3 | v3.0.1 | Apache-2.0 (parser core: MIT — see its LICENSE) |

## Indirect dependencies (engine/go.mod, require block 2)

github.com/cespare/xxhash/v2 (MIT), github.com/dustin/go-humanize (MIT),
github.com/google/uuid (BSD-3-Clause), github.com/inconshreveable/mousetrap (Apache-2.0),
github.com/klauspost/compress (Apache-2.0 / BSD-3-Clause / MIT — mixed, see its LICENSE),
github.com/klauspost/cpuid/v2 (MIT), github.com/klauspost/crc32 (Apache-2.0),
github.com/minio/crc64nvme (Apache-2.0), github.com/minio/md5-simd (Apache-2.0),
github.com/philhofer/fwd (MIT), github.com/rs/xid (MIT), github.com/spf13/pflag
(BSD-3-Clause), github.com/tinylib/msgp (MIT), github.com/zeebo/xxh3 (BSD-2-Clause),
go.yaml.in/yaml/v3 (Apache-2.0/MIT), golang.org/x/net (BSD-3-Clause), golang.org/x/sys
(BSD-3-Clause), golang.org/x/text (BSD-3-Clause), gopkg.in/ini.v1 (Apache-2.0).

## Apache-2.0 NOTICE preservation

Apache License 2.0 §4(d) requires redistribution to preserve NOTICE file contents of the
covered works. Of the modules above, MinIO ships a NOTICE file; its contents are
preserved here:

> MinIO Project, (C) 2015-2023 MinIO, Inc.
>
> This product includes software developed at MinIO, Inc.
> (https://min.io/).

The Go standard library linked into the binary is BSD-3-Clause, Copyright (c) 2009
The Go Authors.

## Verification TODO (pre-publication of any binary-carrying channel)

Before the FIRST publication of a channel that actually carries the binary (the platform
package or GitHub Releases), regenerate the authoritative per-module license inventory in
trusted CI with `go-licenses report ./...` (or `cyclonedx-gomod`) against the exact
commit being built, and reconcile it with this file. This hand-written table is faithful
to `go.mod` of the pinned baseline but is not a substitute for the generated report.

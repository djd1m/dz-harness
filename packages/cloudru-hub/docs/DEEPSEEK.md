# DeepSeek harness: explicit project overlay

This integration emits a literal Cordis patch for the official
`@deepseek-ai/dsh-mcp-client`. The researched official source is upstream master;
the isolated runtime acceptance target is the released `@deepseek-ai/dsh@0.2.1-rc.5`.
Master documentation alone does not establish compatibility with that npm release.
This launcher is unofficial and is not affiliated with Cloud.ru. Тимур performed
extensive Cloud.ru API testing and identified API defects.

Install the official harness and this launcher separately, with their normal package
instructions. The installer never runs a package manager. It requires the local
Cloud.ru engine to match this package's SHA-256 pin. Run:

```bash
cloudru-hub install --target deepseek-harness --dir /absolute/project --dry-run
cloudru-hub install --target deepseek-harness --dir /absolute/project
dsh --profile <existing-profile> --patch '/absolute/project/.cloudru-hub/deepseek.cordis.patch.yml' --dump-config
dsh --profile <existing-profile> --patch '/absolute/project/.cloudru-hub/deepseek.cordis.patch.yml'
```

Replace `<existing-profile>` with the name of a profile already configured in your
DeepSeek home. The installer prints commands with the actual absolute overlay path.
Use `--dump-config` to inspect composition, then restart the harness with the same
`--patch` and probe the registered tools. The profile and home Cordis files remain
untouched. The overlay is project-owned and contains a single `insert` row, which
registers `cloudru_hub` over stdio using the absolute local launcher and `mcp-safe`.
The default `--toolsets inventory` selects the existing 11 safe tools. Other named
groups and the guarded `vm-deploy` and `k8s-deploy` profiles are opt-in; the longer
per-call timeout applies only to those two deployment profiles. The proxy retains
its existing mutation and exact-approval rules. No key, secret, or credential
contents are written into the overlay.

The released `@deepseek-ai/dsh@0.2.1-rc.5` MCP transport scrubs ambient
`CLOUDRU_KEY_ID`, `CLOUDRU_SECRET`, and `CLOUDRU_API_KEY`; it preserves
`CLOUDRU_HUB_CREDENTIALS`. The generated overlay explicitly passes only the
verified `CLOUDRU_VM_BIN` path. For `vm-deploy` and `k8s-deploy`, `mcp-safe`
requires a private JSON file. Its default path is
`~/.config/cloudru-hub/credentials.json`; the MCP process must see the same
home. A selection containing `billing_` tools reads that file if present; an
explicit `CLOUDRU_HUB_CREDENTIALS` path must be readable. Keep the file
owner-only (`0600`). For these profiles, set `CLOUDRU_HUB_CREDENTIALS` in the
harness environment before startup to use an alternate file. The alternate
path survives the tested scrubber but works only for these file-loading
profiles. The installer neither emits that variable nor reads the file; do not
put credentials in the patch.

Default `inventory` and `compute`, like other groups with neither a deployment
profile nor `billing_` tools, do not load the JSON file. Creating it alone does
not give their credential-dependent calls cloud authentication under this
transport. Credential-dependent cloud calls from default `inventory` are not
established in this integration.

The installer checks only its own overlay and managed paths. It does not audit or
remove servers from earlier profile, bundle, or home layers. Another raw Cloud.ru
server can bypass this proxy and is outside this integration's protection. The
overlay does not create a global veto or automatic host approval behavior.

Evidence has distinct levels: generated YAML and no-write tests; official
`--dump-config` composition; actual official MCP-client registration and local
no-cloud call; full-host startup and registration; and inference or live-cloud
behavior. Each needs its own observed result. A direct JSON-RPC proxy refusal
checks the proxy, not official client activation. No inference or live-cloud
behavior is implied by installation, a config dump, or a successful local status
call. A failed optional MCP plugin may leave the full harness running, so report
plugin and full-host startup outcomes separately.

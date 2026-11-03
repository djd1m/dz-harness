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
cloudru-hub install --target deepseek-harness --dir /absolute/project --toolsets inventory --credentials-file default
dsh --profile <existing-profile> --patch '/absolute/project/.cloudru-hub/deepseek.cordis.patch.yml' --dump-config
dsh --profile <existing-profile> --patch '/absolute/project/.cloudru-hub/deepseek.cordis.patch.yml'
```

Choose one configuration per project overlay. For an alternate project-local
file and compute tools, use `--toolsets compute --credentials-file
private/credentials.json` in place of the inventory install command. Omit the
credential-file option to keep the previous no-file read-profile behavior.

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
verified `CLOUDRU_VM_BIN` path. For read profiles such as `inventory`, `compute`
and `network`, add `--credentials-file default` to load the existing reader's
standard path, `~/.config/cloudru-hub/credentials.json`, or its explicit
`CLOUDRU_HUB_CREDENTIALS` override. Use `--credentials-file private/credentials.json`
to resolve an alternate path from the selected project. The generated patch
contains the absolute path only; it does not contain key, secret or JSON bytes.
The installer can name a file before it exists, but proxy startup then requires
a readable, owner-only regular JSON file. Create it with `chmod 600` and the
existing `key_id`, `secret`, `project_id` and optional `region` fields. A missing,
malformed, symlinked, wrong-owner or unsafe file refuses before engine spawn.
The same option works on direct `cloudru-hub mcp-safe --toolsets inventory`.

Without `--credentials-file`, read profiles retain their existing behavior:
`inventory`, `compute` and `network` do not load an unrelated private file; a
selection containing `billing_` tools still reads the optional file, and an
explicit billing file path must be readable. `vm-deploy` and `k8s-deploy` still
require their original private file and approval context. They refuse the new
flag, whether it names `default` or an alternate path, before engine spawn or
overlay write. Other installer targets refuse it. The tool groups and host
permissions are unchanged.

The installer checks only its own overlay and managed paths. It does not audit or
remove servers from earlier profile, bundle, or home layers. Another raw Cloud.ru
server can bypass this proxy and is outside this integration's protection. The
overlay does not create a global veto or automatic host approval behavior.

Evidence has distinct levels: generated YAML and no-write tests; official
`--dump-config` composition; actual official MCP-client registration and local
no-cloud call; full-host startup and registration; and inference or live-cloud
behavior. The added credential path was exercised through the installed official
MCP client with a declared fixture-only engine pin: exact selected tool sets,
boolean key/project/region matches for default and alternate files, no-option
absence, failed-file refusal before engine spawn and process disposal. This is
synthetic client-boundary evidence, not a provider or model request. A direct
JSON-RPC proxy refusal checks the proxy, not official client activation. A failed
optional MCP plugin may leave the full harness running, so report plugin and
full-host startup outcomes separately.

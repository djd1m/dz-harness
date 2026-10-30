# @dzhechkov/cloudru-hub

Site: https://aicoding.space · Source: https://github.com/djd1m/dz-harness/tree/main/packages/cloudru-hub

> **Linux/x64:** version 0.1.18 names the exact optional engine
> package `@dzhechkov/cloudru-vm-linux-x64@0.2.8`. The `dz guard` `licence-hold`
> rule continues to check LICENSE, notices and SPDX on publish.

> **Unofficial. NOT affiliated with, endorsed, or supported by Cloud.ru.** "Cloud.ru" is a
> trademark of its owner; this launcher merely talks to the public Cloud.ru Evolution API
> through the `cloudru-vm` engine.

Thin JS launcher for the **`cloudru-vm` MCP engine** — a Go MCP server with **146 registered catalog tools**
(MEASURED — local `tools/list` probe, `data/tools-list-snapshot.json`; this is not 146 live Cloud.ru API tests) for Cloud.ru
Evolution: VMs, k8s, PostgreSQL/Kafka/Redis, DNS, S3, certificates, billing/FinOps, and a
docker-compose deploy wizard.

The launcher archive contains no engine binary. npm installs the exact optional
platform package with the pinned Go engine on Linux/x64. Run:

```bash
npm install -g @dzhechkov/cloudru-hub@0.1.18
cloudru-hub self-test
```

The self-test verifies the engine SHA-256, version, 146 registered MCP catalog tools and their
classification without Cloud.ru credentials. On another platform, or if optional
dependencies were disabled, provide a trusted binary with the same SHA-256.

## Attribution

**[Тимур](https://shkrbkv.ru/about/)** carried out extensive Cloud.ru API testing,
identifying actual behavior and defects.
The JS launcher remains MIT-licensed; its archive contains no Go engine bytes.

## What ships here (our code only — ADR-002)

| Piece | Where | What it does |
|---|---|---|
| Launcher | `bin/cloudru-hub.js` | resolves the engine binary at **runtime** (never bundled): `$CLOUDRU_VM_BIN` → `~/.cloudru-hub/config.json` `enginePath` → optional platform package `@dzhechkov/cloudru-vm-linux-x64`; verifies sha256 against the pin in `package.json.cloudruHub.binaryHashes` |
| Paid-step brake (ADR-004) | `src/install.js`, `templates/.claude/hooks/` | emits `permissions` **ask** rules for every mutating-or-shell-reaching tool (64 tools — MEASURED, `data/tools-classification.json` counts), **deny** for `secret_value`/`cert_private_key`, **allow** for 80 behaviour-audited read-only tools, in BOTH `mcp__cloudru-vm__`/`mcp__cloudru_vm__` spellings (prefix normalization not yet live-probed), plus a PreToolUse veto hook (ssh-guard + the kubectl `rollout` hole) — and **executes** the veto probe before declaring install success |
| Target integration | `src/install.js`, `src/safe-mcp.js` | Codex, OpenCode and Pi get project MCP configs using a pinned proxy; Hermes gets a guarded `$HERMES_HOME/config.yaml` entry with a verified engine path. Claude Code's general install keeps its permissions and hook probe. The opt-in `vm-deploy` profile requires an exact-plan approval and confines remote commands to the returned VM. Codex, Hermes, OpenCode and Pi each completed both live static-site scenarios on 2026-10-20 with HTTP byte checks and exact resource cleanup. The `k8s-deploy` profile uses a separate exact-manifest approval and create-only Kubernetes operation; the same four hosts completed live Kubernetes deployment, readiness, exact-byte HTTP and cleanup checks. Claude Code has installer/registration checks but no live inference pass. |
| Skill dialect compiler (ADR-006) | `src/dialects.js`, `data/dialects.json` | generates per-target variants of the canonical skill tree (which is NOT shipped — point `--canonical` at an engine distribution); hard-fails if any Hermes-dialect token survives AND if the engine codename survives in any case in any emitted file (positive invariant, not just the enumerated denylist); unlinks dangling links; enforces the 12 000-char router cap on lossy layouts; byte-deterministic |
| Golden classification | `data/tools-classification.json` | every engine tool → allow/ask/deny; `allow` requires a BEHAVIOUR audit of the handler (read-only proven at the pinned baseline, engine file:line cited per entry). The previous `stack_status` behavior was unsafe; the imported engine now makes it observational and tests that invariant. A live tool unknown to the classifier is a drift finding. |
| Offline cost worksheet | `src/cost-compare.js`, `docs/cost-compare.example.json` | compares supplied VM and Kubernetes topology, capacity and dated tariff lines with exact decimal arithmetic; needs no engine, credentials or network access |

## Usage

```bash
cloudru-hub resolve                 # where is the engine, which sha256, is it the pinned baseline
cloudru-hub self-test               # resolve → sha256 → engine version → live tools/list → coverage
cloudru-hub cost-compare --input docs/cost-compare.example.json --json  # offline cost worksheet
cloudru-hub mcp                     # run the engine as an MCP stdio server (what .mcp.json points at)
cloudru-hub mcp-safe --toolsets inventory   # pinned MCP proxy with a small allow-classified surface
cloudru-hub install --target codex --toolsets billing  # read-only balance, consumption and FinOps
cloudru-hub install --target codex --toolsets vm-deploy  # guarded VM deployment profile
cloudru-hub install --target codex --toolsets k8s-deploy # bounded existing-cluster profile
cloudru-hub k8s-approve --cluster-id <uuid> --namespace snake-pilot --manifest <snake.yaml> --manifest-sha256 <digest>
cloudru-hub k8s-approve --cluster-id <uuid> --namespace lesson-app --manifest <web.yaml> --manifest-sha256 <digest> --profile web-image
cloudru-hub approve --plan-id <id> --max-monthly-rub <cap>  # one reviewed SSH plan
cloudru-hub approve --plan-id <id> --max-monthly-rub <cap> --site-sha256 <digest>  # reviewed static-site artifact
cloudru-hub install --target claude-code   # emit .mcp.json + permission brake + veto hook, PROBE the veto
cloudru-hub install --target codex         # project .codex/config.toml using mcp-safe
cloudru-hub install --target opencode      # project opencode.json using mcp-safe
cloudru-hub install --target pi            # project .pi/mcp.json using mcp-safe
cloudru-hub install --target hermes        # require a hash-verified engine; add safe entry to $HERMES_HOME/config.yaml
cloudru-hub install --target deepseek-harness --dir /path/to/project --dry-run
cloudru-hub install --target deepseek-harness --dir /path/to/project
cloudru-hub install --target agents-md     # pointer-only section (no tools, no fake support)
cloudru-hub compile-skill --canonical <engine>/skill/cloudru-hub --target claude-code --out ./skill-out
```

The [cost worksheet guide](docs/COST-COMPARE.md) describes the versioned input, supported
units, exact calculations and limits. The packaged example uses checked official
VAT-inclusive tariff rows but leaves traffic unpriced and architecture equivalence
unknown; it therefore reports known subtotals with no winner. Supplied quantities
and tariff applicability remain operator assumptions, not verified inventory or a live bill.

## Using an owner-supplied engine instead

```bash
export CLOUDRU_VM_BIN=/path/to/trusted/cloudru-vm   # must match the pinned build
node bin/cloudru-hub.js self-test
```

Expected: 5 green steps ending `self-test: ALL GREEN` (resolution, sha256 match against
the pinned baseline `0095d391…db8be08`, engine version, 146 registered catalog tools, full
classification coverage). Full walkthrough incl. `npm link` and MCP registration:
[`docs/LOCAL-TESTING.md`](docs/LOCAL-TESTING.md).

Host setup, checks and limits: [`docs/HERMES-CODEX.md`](docs/HERMES-CODEX.md). These adapters are generated from our own classification and do not reuse EVO code. EVO's broader standalone CLI and toolset selection remain advantages to carry into the owner's Go engine.

For the official DeepSeek harness, see [the DeepSeek overlay guide](docs/DEEPSEEK.md).
The installer writes only the project overlay `.cloudru-hub/deepseek.cordis.patch.yml`;
preview it with `--dry-run`, then pass it explicitly as `--patch` to an existing
profile. Repeating the install is idempotent; conflicting managed content is refused.
The overlay registers the existing guarded `mcp-safe` proxy. The released
`@deepseek-ai/dsh@0.2.1-rc.5` passed official-client configuration composition,
MCP registration and a local status call, plus full web-host startup and registration.
These checks do not establish DeepSeek inference or live Cloud.ru deployment. The
default `inventory` selection exposes 11 classified safe tools, but the official
client scrubs ambient Cloud.ru credential variables; its default inventory cloud
calls are not established by a credentials file. The existing `vm-deploy` and
`k8s-deploy` profiles can read the private credential file through `mcp-safe`.

For billing through `mcp-safe`, add the optional `"agreement_id":"…"` to the owner-only `~/.config/cloudru-hub/credentials.json` alongside `key_id`, `secret` and `project_id`. The proxy forwards it to the Go child as `CLOUDRU_AGREEMENT_ID`. Existing environment-only billing setups remain supported when no credential file is configured. The current consumption tool reports the agreement-wide total; its output should not be presented as a per-project bill. See the [Cloud.ru instructions for locating the agreement ID](https://cloud.ru/docs/billing/ug/topics/faq__api_id_agreement).

The `vm-deploy` and `k8s-deploy` profiles are opt-in previews requiring a matching pinned Go binary and credentials in a private local file. `deploy_plan` resolves a VM and a compute/disk estimate; `deploy_preflight(plan_id)` observes live name collisions and available quota usage, naming unknown create rights, capacity and billed tariffs. After an exact-plan approval, `deploy_apply` writes a private run intent before VM creation. If the API outcome is uncertain, `deploy_reconcile(plan_id)` reads the receipt and project inventory; it never adopts a same-name VM or authorizes a retry. A prior receipt for the same project and VM name also blocks a new plan, even if the cloud inventory has not caught up; inspect the prior run and choose a new name. The static-site route still snapshots approved HTML/ZIP bytes, uses fixed Cloud-init and a dedicated TCP-80 group, and reports verified only after exact-byte HTTP checks against the approved IP. Every public file must be reviewed; a public IP may incur additional charges. Static sites do not grant `vm_exec` SSH access.

**Published versions `cloudru-hub@0.1.16` and `cloudru-vm-linux-x64@0.2.7`:** concurrent distinct VM plans for the same project and VM name are not serialized. Avoid launching those plans together; the prior-receipt check protects sequential submissions and is not an atomic name reservation.

**Matched `cloudru-hub@0.1.18` / `cloudru-vm-linux-x64@0.2.8`:** the initial deployment checkpoint exclusively claims the exact project/VM-name pair in private shared local state before either a VM or static-site security group is mutated. The claim remains after process exit, an uncertain provider response, or a later checkpoint failure; even an empty or partial claim blocks another plan. There is no TTL, unlock, forced replay or name-based adoption. Inspect the retained claim and run receipt in the shared state root, reconcile live project inventory and known resource IDs, then choose a new name for a separate deployment if needed. Coordination covers upgraded processes sharing one local state root. Old clients, raw engine paths, different roots or hosts, and direct Cloud.ru API calls remain outside it; this is not distributed idempotency. Local synthetic race, restart and I/O-fault controls cover this correction; no new live VM creation was used for these controls.

In the previous `0.2.7-20261029` engine (retained in `0.2.8-20261029`), operator `k8s_plan` resolves a supported zone name or ID to `zone_id`/`zones`, and `k8s_create` explicitly sends that ID for control-plane placement. The VIP subnet must match the same zone. This does not establish why a worker pool may fail to register nodes.

The matched engine also accepts `k8s_plan` with
`{"preflight":true}` to collect read-only observations before a possible paid
cluster creation. It is separate from VM `deploy_preflight(plan_id)`. The
versioned report includes its observation time and configured project, with
`observed_checks`, `observed_conflicts` and `unknowns`. It attempts exact
zone/subnet resolution, checks returned project cluster rows for an exact name
collision, and reads project-filtered quota usage. A matching cluster with an
explicit same-project identity is a conflict; an empty or unmatched response
does not prove the name is free because inventory completeness is unknown.
Denied, malformed or unavailable quota responses remain unknown; usage does
not prove create capacity. Failed probes leave the established findings intact.

Every diagnostic report says `ready_to_apply:false`. Authentication, successful
listing and JWT scope roles do not prove effective caller or cluster service
account create grants. The [Cloud.ru cluster service-account role guide](https://cloud.ru/docs/kubernetes-evolution/ug/topics/concepts__roles-for-cluster-sa) lists
`k8s.user`, `nlb.user` and `vpc.user` as base dependencies; `auditlog.writer`, `logaas.writer`
and `monaas.write` depend on the actual audit, logging and monitoring settings,
which this report cannot inspect. Verify assignments and settings in IAM before
a separate paid-operation approval. Exact placement resolution also does not
prove region-wide availability or runtime readiness. Prospective tariffs are
not supplied: include compute, control plane, disk, public IP, SNAT, load
balancer and traffic, then run `cloudru-hub cost-compare --input <json> --json`
separately with verified tariff inputs. This diagnostic does not create an
approval or unlock a retry.

Kubernetes create/nodepool recovery was included in the previous `0.2.7-20261029` engine and is retained in `0.2.8-20261029`.
The operator flow records a private durable intent before
`k8s_create` or `k8s_add_nodepool`, then saves known operation/resource IDs.
After a lost reply, `k8s_get` supports `receipt_id`, `operation_id` and
bounded `receipts:true` discovery in addition to its existing cluster lookup.
These observations distinguish provider operation state from resource presence;
they do not check Ready Nodes or application HTTP. This release adds no new
live Kubernetes deployment or `web-image` acceptance result.

The first recovery increment keeps the same project/kind/parent/name blocked
after any submitted intent, including an ambiguous outcome or later deletion.
Changing a request's size does not permit another submission. There is no
automatic retry, force flag or receipt-removal procedure. A different name is a
separate deployment with possible duplicate cost. Diagnostics do not create a
cluster, and existing guarded profiles still deny infrastructure create tools.

**Matched `cloudru-hub@0.1.18` / `cloudru-vm-linux-x64@0.2.8`:**
before one confirmed `k8s_delete` DELETE, the engine writes a private, durable
`cluster-delete` intent scoped to the action, configured project and exact
cluster ID. That target is immutable. A duplicate call or restart after an
uncertain outcome refuses another DELETE through the shared store, including
when the receipt is unreadable. A valid accepted response reports `deleting`;
malformed or uncertain responses report `unknown_outcome` and retain only
unambiguous operation correlation. For `unknown_outcome` or
`recovery_required`, inspect `k8s_get(receipt_id)` or bounded `receipts:true`
discovery. Recovery is GET-only for the exact target and any known operation
under the configured project. A scoped exact-cluster 404 observes absence;
403, errors, malformed or mismatched JSON remain unknown. Operation `done`
does not prove cluster absence, application readiness, dependent cleanup or
zero cost. There is no TTL, receipt removal, forced retry or distributed
guarantee; other hosts, state roots and direct API callers do not coordinate.
Existing create and nodepool recovery behavior is retained. Local synthetic
replay, restart and I/O-fault controls cover this correction; no new paid-cluster
test was used. Broader operation recovery remains work in progress.

The Kubernetes preview has two explicit profiles. The default `snake` profile retains its exact ConfigMap, non-root Deployment and ClusterIP Service. `web-image` accepts one reviewed digest-pinned OCI image in a bounded one-pod Deployment and internal ClusterIP Service. It requires a `/health` endpoint on port 8080, a dedicated namespace, non-root UID 10001, a read-only root filesystem and bounded CPU/RAM. The image must already be built, pushed and pullable by the existing cluster. This package does not build code from a repository or prove that an image digest corresponds to a source commit. `k8s-approve` binds exact manifest bytes, cluster, namespace, project and a ten-minute single-use approval. The proxy uses `create_only=true`; inspect partial resources before retrying because Kubernetes multi-document create is not transactional. Neither profile creates a cluster, namespace, nodes, NAT, ingress or load balancer. Earlier four-host live application acceptance covered only Snake; `web-image` currently has deterministic local tests.

See the [web-image procedure](docs/WEB-IMAGE.md) for authored code and pinned repository inputs.

## Safety properties (all layer-1, discrimination-proven)

Every named property has a mutation-gate entry (`test/mutation-registry.json`, run
`dz mutation-gate --package packages/@dzhechkov/cloudru-hub`) that deletes the protection
and requires the suite to go RED. The registry passed on 2026-10-20 with 13/13
protections proven:

1. **The licence gate stays armed** — the `licenseHold` trigger field remains in
   package.json, so `dz guard` checks LICENSE, the corrected provenance link,
   THIRD_PARTY_NOTICES and the SPDX field on every publish. Pack tests verify the
   corrected API-testing attribution and the publishable state.
2. **Zero upstream engine bytes** — explicit `files[]` whitelist + a test that walks the
   `npm pack --dry-run` file list rejecting ELF magic, `.go` sources and engine paths.
3. **The paid-step brake vetoes** — acid fixtures run the emitted hook (`sshpass` → exit 2,
   keyed ssh → 0, `rollout restart` → 2, `rollout status` → 0); the installer refuses to
   report success unless the executed probe blocks.
4. **`stack_status` only observes** — the private Go engine no longer advances planned or
   running jobs on a read; `stack_apply` is the explicit paid action. The Go regression
   test checks repeated status calls, and the classification now permits the read.
5. **`logs` stays ask** — the engine now shell-quotes its user-controlled `service` as
   one argument, with a regression test for hostile input. It still reaches remote SSH
   and can expose logs, so the proxy does not silently permit it.
6. **The dialect codename gate is armed** — emptying `forbiddenCodenames` (the positive
   case-insensitive, word-boundary net under the 8-token denylist) goes RED; the denylist
   alone let the bare codename survive 5× in the real-corpus compile (MEASURED). The gate
   covers the full engine identity — `hermes`, `dzhechko` (go-module owner), `cloudru-vm-cli`,
   `captainkeys` — with word-boundary matching so the published scope `@dzhechkov` is not
   over-blocked.
7. **The engine binary-name leak forms are scrubbed, not codename-gated** (since 0.1.3) — the
   bare token `cloudru-vm` is ALSO the legitimate MCP server name that must appear in
   output (`\bcloudru-vm\b` over-blocks the compiler's own injected prose `сервера
   cloudru-vm видны` — PROVEN), so instead the two unambiguous leak FORMS get targeted
   replacements in every target: dotted path `.cloudru-vm` → `.cloudru-hub`, and CLI
   invocation `cloudru-vm <verb>` → `cloudru-hub <verb>` for the engine's real cobra
   command set only (`deploy|status|logs|destroy|verify|init|version|list-zones|
   list-images|mcp|doctor`, cited from the baseline `cmd/cloudru-vm/main.go`). Disarming
   either scrub goes RED (`dialect-binary-path-leak-scrubbed`,
   `dialect-binary-invocation-leak-scrubbed`).

## Platform package status

The separate `@dzhechkov/cloudru-vm-linux-x64@0.2.8` package is installed
automatically on Linux/x64 unless optional dependencies are disabled. Its static
build reproduces the pinned SHA-256 and bundles the license and NOTICE files
of linked Go modules. `CLOUDRU_VM_BIN` and `~/.cloudru-hub/config.json` remain
available for an explicitly supplied matching binary (see *Local testing*).

## Tests

`npm test` — 107 tests, 107 passing (MEASURED — `node --test 'test/*.test.mjs'`, 2026-10-20;
node:test with `yaml` as the sole runtime dependency). Suite includes the tarball-content gate,
the post-grant licence gates, the brake acid tests, installer tiering, and dialect
compilation.

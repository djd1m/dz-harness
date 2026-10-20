# @dzhechkov/cloudru-hub

Site: https://aicoding.space · Source: https://github.com/djd1m/dz-harness/tree/main/packages/@dzhechkov/cloudru-hub

> **STATUS: published — the ADR-001 licence hold is SATISFIED (AM-2, 2026-08-12).**
> [Тимур](https://shkrbkv.ru/about/), the author of the Hermes engine additions, approved publication (owner-reported
> 2026-08-12 — the grant record is linked from the `Grant-Confirmation:` line in LICENSE
> Part 2; archiving the author's written confirmation is a recorded owner follow-up).
> The `dz guard` `licence-hold` rule stays armed and keeps verifying
> LICENSE/THIRD_PARTY_NOTICES/SPDX on every publish — a satisfied hold passes with the
> trigger in place.

> **Unofficial. NOT affiliated with, endorsed, or supported by Cloud.ru.** "Cloud.ru" is a
> trademark of its owner; this launcher merely talks to the public Cloud.ru Evolution API
> through the `cloudru-vm` engine.

Thin JS launcher for the **`cloudru-vm` MCP engine** — a Go MCP server with **144 tools**
(MEASURED — live `tools/list` probe, `data/tools-list-snapshot.json`) for Cloud.ru
Evolution: VMs, k8s, PostgreSQL/Kafka/Redis, DNS, S3, certificates, billing/FinOps, and a
docker-compose deploy wizard.

**The npm archive contains no engine binary, and the platform binary package is not published.**
All engine-backed commands, including inventory, billing, VM and Kubernetes operations,
require an owner-supplied Go binary whose SHA-256 matches the pin below. A fresh npm install
alone can inspect the launcher and generate configuration, but cannot run Cloud.ru tools.

## Attribution

- **CLI foundation and everything in this package** (launcher, adapters, installer,
  tests): **Dmitry Zhechkov** (MIT — LICENSE Part 1). Per ADR-001 AM-1 the original Go
  CLI on which the engine builds is the owner's work; the Hermes engine is a derivative
  of it.
- **Hermes engine additions** (the ~144-tool MCP layer): **[Тимур](https://shkrbkv.ru/about/)**, the Hermes author.
  **Zero bytes of those additions ship in this package** — no binary, no Go sources, no
  skill corpus. Publication of this package was approved by the author (grant recorded
  2026-08-12 — LICENSE Part 2, `Grant-Confirmation:` link). The author designated no
  licence text for the engine additions themselves; nothing here grants third parties
  rights to them.

## What ships here (our code only — ADR-002)

| Piece | Where | What it does |
|---|---|---|
| Launcher | `bin/cloudru-hub.js` | resolves the engine binary at **runtime** (never bundled): `$CLOUDRU_VM_BIN` → `~/.cloudru-hub/config.json` `enginePath` → optional platform package `@dzhechkov/cloudru-vm-linux-x64` (not published); verifies sha256 against the pin in `package.json.cloudruHub.binaryHashes` |
| Paid-step brake (ADR-004) | `src/install.js`, `templates/.claude/hooks/` | emits `permissions` **ask** rules for every mutating-or-shell-reaching tool (64 tools — MEASURED, `data/tools-classification.json` counts), **deny** for `secret_value`/`cert_private_key`, **allow** for 78 behaviour-audited read-only tools, in BOTH `mcp__cloudru-vm__`/`mcp__cloudru_vm__` spellings (prefix normalization not yet live-probed), plus a PreToolUse veto hook (ssh-guard + the kubectl `rollout` hole) — and **executes** the veto probe before declaring install success |
| Target integration | `src/install.js`, `src/safe-mcp.js` | Codex, OpenCode and Pi get project MCP configs using a pinned proxy; Hermes gets a guarded `$HERMES_HOME/config.yaml` entry with a verified engine path. Claude Code's general install keeps its permissions and hook probe. The opt-in `vm-deploy` profile requires an exact-plan approval and confines remote commands to the returned VM. Codex, Hermes, OpenCode and Pi each completed both live static-site scenarios on 2026-10-20 with HTTP byte checks and exact resource cleanup. The `k8s-deploy` profile uses a separate exact-manifest approval and create-only Kubernetes operation; the same four hosts completed live Kubernetes deployment, readiness, exact-byte HTTP and cleanup checks. Claude Code has installer/registration checks but no live inference pass. |
| Skill dialect compiler (ADR-006) | `src/dialects.js`, `data/dialects.json` | generates per-target variants of the canonical skill tree (which is NOT shipped — point `--canonical` at an engine distribution); hard-fails if any Hermes-dialect token survives AND if the engine codename survives in any case in any emitted file (positive invariant, not just the enumerated denylist); unlinks dangling links; enforces the 12 000-char router cap on lossy layouts; byte-deterministic |
| Golden classification | `data/tools-classification.json` | every engine tool → allow/ask/deny; `allow` requires a BEHAVIOUR audit of the handler (read-only proven at the pinned baseline, engine file:line cited per entry). The previous `stack_status` behavior was unsafe; the imported engine now makes it observational and tests that invariant. A live tool unknown to the classifier is a drift finding. |

## Usage

```bash
cloudru-hub resolve                 # where is the engine, which sha256, is it the pinned baseline
cloudru-hub self-test               # resolve → sha256 → engine version → live tools/list → coverage
cloudru-hub mcp                     # run the engine as an MCP stdio server (what .mcp.json points at)
cloudru-hub mcp-safe --toolsets inventory   # pinned MCP proxy with a small allow-classified surface
cloudru-hub install --target codex --toolsets billing  # read-only balance, consumption and FinOps
cloudru-hub install --target codex --toolsets vm-deploy  # guarded VM deployment profile
cloudru-hub install --target codex --toolsets k8s-deploy # bounded existing-cluster Snake profile
cloudru-hub k8s-approve --cluster-id <uuid> --namespace snake-pilot --manifest <snake.yaml> --manifest-sha256 <digest>
cloudru-hub approve --plan-id <id> --max-monthly-rub <cap>  # one reviewed SSH plan
cloudru-hub approve --plan-id <id> --max-monthly-rub <cap> --site-sha256 <digest>  # reviewed static-site artifact
cloudru-hub install --target claude-code   # emit .mcp.json + permission brake + veto hook, PROBE the veto
cloudru-hub install --target codex         # project .codex/config.toml using mcp-safe
cloudru-hub install --target opencode      # project opencode.json using mcp-safe
cloudru-hub install --target pi            # project .pi/mcp.json using mcp-safe
cloudru-hub install --target hermes        # require a hash-verified engine; add safe entry to $HERMES_HOME/config.yaml
cloudru-hub install --target agents-md     # pointer-only section (no tools, no fake support)
cloudru-hub compile-skill --canonical <engine>/skill/cloudru-hub --target claude-code --out ./skill-out
```

## Using an owner-supplied engine

```bash
export CLOUDRU_VM_BIN=/path/to/private-build/cloudru-vm   # pinned 0.2.6-20261020 preview
node bin/cloudru-hub.js self-test
```

Expected: 5 green steps ending `self-test: ALL GREEN` (resolution, sha256 match against
the pinned baseline `89c50734…12dbf10`, engine version, 144 live tools, full
classification coverage). Full walkthrough incl. `npm link` and MCP registration:
[`docs/LOCAL-TESTING.md`](docs/LOCAL-TESTING.md).

Host setup, checks and limits: [`docs/HERMES-CODEX.md`](docs/HERMES-CODEX.md). These adapters are generated from our own classification and do not reuse EVO code. EVO's broader standalone CLI and toolset selection remain advantages to carry into the owner's Go engine.

For billing through `mcp-safe`, add the optional `"agreement_id":"…"` to the owner-only `~/.config/cloudru-hub/credentials.json` alongside `key_id`, `secret` and `project_id`. The proxy forwards it to the Go child as `CLOUDRU_AGREEMENT_ID`. Existing environment-only billing setups remain supported when no credential file is configured. The current consumption tool reports the agreement-wide total; its output should not be presented as a per-project bill. See the [Cloud.ru instructions for locating the agreement ID](https://cloud.ru/docs/billing/ug/topics/faq__api_id_agreement).

The `vm-deploy` and `k8s-deploy` profiles are included in the launcher as **opt-in previews**. They require a matching pinned Go binary and temporary credentials in a private local file. There is no published platform binary at this pin; a fresh npm installation alone cannot run them. A static site can be planned from a local HTML file or a bounded ZIP snapshot with `deploy_plan(static_site_source=...)`; the operator checks the source digest shown in the plan and supplies that digest to `approve`. Every included ZIP file is served publicly, so review the file list in the plan and keep credentials out of the artifact. Planning requires an existing available floating IP, whose ID is bound to the approval. Apply creates a dedicated TCP-80 security group, boots the VM from fixed Cloud-init data, and reports the site as verified only after the approved IP is attached to that VM and exact-byte HTTP checks pass. A private run journal keeps resource IDs for interrupted-run recovery and blocks blind replay. The estimate covers compute and disk; a public IP may have a separate charge. The static-site route does not authorize `vm_exec` over SSH. See the two-Snake acceptance procedure in `features/cloudru-cli-vm-deploy/SNAKE-ACCEPTANCE.md` in the private source tree.

The Kubernetes preview accepts only one reviewed manifest containing a ConfigMap, a non-root single-pod Deployment and a ClusterIP Service in an existing namespace. `k8s-approve` binds exact manifest bytes, cluster, namespace, project and a ten-minute single-use approval. The agent passes only the approval ID; the proxy forwards `create_only=true`, so an existing resource name is a conflict instead of being patched. Kubernetes `create` is not transactional across three documents: inspect and clean up any partially created resources by exact name before trying again. Use a dedicated namespace with no pre-existing resources matching the app label or the three approved names. The profile does not create a cluster, namespace, nodes, NAT, ingress or load balancer. The example, local evidence and four-host live acceptance are in `features/cloudru-k8s-snake-deploy/` in private source. The service account's initial 403 was resolved by granting the Kubernetes role; Claude Code inference remains unavailable for a live host test.

## Safety properties (all layer-1, discrimination-proven)

Every named property has a mutation-gate entry (`test/mutation-registry.json`, run
`dz mutation-gate --package packages/@dzhechkov/cloudru-hub`) that deletes the protection
and requires the suite to go RED. The registry passed on 2026-10-20 with 13/13
protections proven:

1. **The licence gate stays armed post-grant** — the `licenseHold` trigger field
   deliberately STAYS in package.json, so the `dz guard` `licence-hold` HARD rule keeps
   verifying LICENSE (grant record + `Grant-Confirmation:` URL, no PENDING placeholder),
   THIRD_PARTY_NOTICES and the SPDX field on every publish; pack tests additionally pin
   the honest grant wording (owner-attested, no fabricated grant deed), the SPDX-matches-
   LICENSE invariant (ADR-001 Confirmation) and the publishable state.
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

## Post-grant publish checklist (executed 2026-08-12)

1. ✅ Grant recorded (ADR-001 AM-2, exit 2): LICENSE Part 2 placeholder replaced with the
   owner-attested grant record + `Grant-Confirmation:` link, `"license": "MIT"` (owner
   code only), `private` removed, `licenseHold` trigger deliberately KEPT armed.
   Open owner follow-up: archive the author's written confirmation in the grant record.
2. ✅ `dz guard check --op publish` passes (the licence-hold rule verifies all of it).
3. ⏳ NOT YET: the platform package `@dzhechkov/cloudru-vm-linux-x64` (the binary-carrying
   channel) still requires the ADR-002 trusted-CI build (`-trimpath`, sha256 must equal
   `cloudruHub.binaryHashes['linux-x64']`) + the go-licenses reconciliation in
   THIRD_PARTY_NOTICES before ITS first publication. Until then the engine binary is
   supplied via `$CLOUDRU_VM_BIN` or `~/.cloudru-hub/config.json` (see *Local testing*).
4. ✅ Published via the repo's standard release flow.

## Tests

`npm test` — 107 tests, 107 passing (MEASURED — `node --test 'test/*.test.mjs'`, 2026-10-20;
node:test with `yaml` as the sole runtime dependency). Suite includes the tarball-content gate,
the post-grant licence gates, the brake acid tests, installer tiering, and dialect
compilation.

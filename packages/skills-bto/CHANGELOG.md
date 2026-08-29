# skills-bto

## 1.4.0 — 2026-08-18

Hardening wave from the BTO improvement review (slice D). Four adopted items; one deferred.

### Added

- **Frontmatter fence on `SKILL.md` (P5).** The pack's own `SKILL.md` now begins with a
  `--- name/description ---` fence. Before this, `dz list --skills-dir <pack>/templates/.claude/skills`
  exited 1 with `SKILL.md must begin with a "---" frontmatter fence` — and because the loader walks
  the whole tree, the unfenced file made *every* skill in the directory unlistable. The fix
  propagates to what BTO **generates**: the BUILD Skill Template emits the fence ahead of `# <Name>`,
  and a new `CHECK-S0` / `TEST-SK0` pair scores the property. Commands, rules and agent templates
  deliberately keep no fence — the parser that requires it reads skills only, and that call is now
  written down as a decision instead of an omission.
- **`## Agent Authoring Rule` (P1).** A new normative section in `SKILL.md`, pointed at from all
  eight authoring texts (four modules, both agent templates, the driving commands): write the
  skeleton first, then incremental `Edit` appends; never one giant `Write`. Carries the watchdog
  numbers (180 s / 600 s) and the consequence — a killed agent loses all unwritten output. The two
  genuinely short emissions (B2 probe answer, one-line variant score) are declared EXEMPT at their
  sites, so an exemption and an omission are distinguishable by grep. OPTIMIZE Step 4 gains an arity
  tripwire that WARNs with the missing variant ids instead of silently selecting from a short pool.
- **Layer B-1: Environment Preconditions + the INCONCLUSIVE verdict (P2).** A new first benchmark
  layer probes that each downstream layer *can* execute and prints
  `Preconditions: ALL_GREEN | DEGRADED(list) | ABORT` in **every** report header, clean runs
  included. `INCONCLUSIVE` joins the verdict lattice, is evaluated ahead of every numeric threshold,
  and is sticky downstream (an INCONCLUSIVE BENCHMARK does not enter TEST). Universal check
  **U-13 `SKIPPED is not PASSED`** carries the same standard into Layer 0.
- **Judge provenance lines (P4, template half).** Every evaluation report now always emits
  `Authored by:` / `Judged by:` / `Cross-family: YES|NO`, and a same-family panel prints the
  `SAME-FAMILY PANEL` degradation banner. The Layer-2 judge table gains a `Family` column and
  `references/eval-patterns.md` gains anti-conformity measure 6, *Model Family Diversity*.
- **Test suite + `npm test`.** `test/*.test.mjs` (5 spec files) wired to
  `"test": "node --test test/*.test.mjs"`. The specs spawn the real `dz` binary as the acceptance
  oracle and assert against the shipped `templates/` text.

### Changed — user-visible recalibrations

These move numbers that existing reports display. Both are deliberate:

- **B1 skill-test denominator 5 → 6.** Adding `TEST-SK0` re-bases every skill's B1 ratio from fifths
  to sixths.
- **Universal checklist total 12 → 13.** Adding `U-13` re-bases the Layer 0 pass rate; the two
  worked example reports were recomputed to match (`Universal (13) + Skill-specific (16) = 29`).
- **B1 pass rate denominator is now `tests_executed`, not `tests_total`.** A check that could not run
  is neither a pass nor a failure, and any `tests_inconclusive > 0` forces the layer to INCONCLUSIVE
  regardless of the ratio.
- **Partial-evaluation renormalization narrowed.** Only layers the operator deliberately skipped via
  `level` are renormalized away. A layer that was requested and could not run is INCONCLUSIVE and is
  never renormalized — redistributing its weight can only raise the score, turning a gap in evidence
  into a better grade. The `or skip B0` escape in the BENCHMARK anti-pattern table is removed for the
  same reason.
- `references/golden-samples.md` documents the fence as a structural row but **excludes it from
  `sections_expected`**; the required-section count stays **7**, so a conformant skill's B0 coverage
  is unchanged.
- `U-03` amended to accept *fence-then-H1*, so the pack no longer fails its own fixed file. `CHECK-S2`
  was re-worded ("first heading AFTER the frontmatter fence"), never dropped — the H1 is still required.

### Not changed (deliberately deferred)

- **No hard cross-family requirement.** The `Cross-family:` line and its banner are *recorded and
  advisory*: they change no score and gate nothing. Making a cross-family Critic mandatory would
  block every user with a single model family, on evidence of n=1; it stays in backlog pending
  3-artifact planted-defect replication. A spec asserts that nothing in the pack blocks, fails or
  refuses on `Cross-family: NO`, so the deferred half cannot arrive unannounced.
- The pre-existing **model-identity collusion BLOCK** is untouched. Identity blocks; family is
  advisory; the two now read as one policy.
- **Round narrowing (P3)** — deferred, instrument first.

## 1.3.0

Initial release — canonicalized into `@dzhechkov/skills-bto` in the dz-harness-hub monorepo.

Build-Benchmark-Test-Optimize skill pack for Claude Code — deterministic benchmarking, quality gates, witness chain, judge attestation, and optimization

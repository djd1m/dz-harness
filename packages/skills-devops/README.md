# @dzhechkov/skills-devops

> **0.3.9 shipped after a CLEAN independent round.** Six rounds of cross-family review: C, C, D, C,
> then A with no findings. Ten defects were found in 115 lines of new gate and all were closed, each
> pinned by a test carrying the input that produced it. The hold this package carried while that was
> unfinished is lifted because the condition was met, not because patience ran out.


Canonical DevOps skill pack — **30 agentic skills** for infrastructure, code review, security, testing, CI/CD, databases, APIs, and more.

10 skills canonicalized from [gitlawb/openclaude-skills](https://github.com/gitlawb/openclaude-skills) + 20 original skills.

## Install

```bash
# Via dz CLI (recommended)
dz init --target claude-code --preset devops

# Or select specific skills
dz init --target claude-code --select pr-review,security-audit,test-writer

# Or install the package directly
npm install @dzhechkov/skills-devops
```

## Skill Inventory (30)

| Skill | Category | Description |
|-------|----------|-------------|
| `api-design` | api | REST/GraphQL API design with OpenAPI specs |
| `c4-architecture` | architecture | C4 model diagrams (context, container, component) |
| `ci-fix` | ci/cd | Diagnoses and fixes CI pipeline failures |
| `codeql-fix` | security | CodeQL/SAST finding remediation |
| `data-pipeline` | data | ETL/ELT pipeline design (dbt, Airflow) |
| `database-migration` | database | Zero-downtime migrations, expand-contract |
| `database-review` | database | Schema changes, queries, migration review |
| `debugging` | debugging | Runtime error diagnosis and root cause fix |
| `deploy-on-cloudru-vm` | deploy | Repo URL → running app on a Cloud.ru VM: analyze repo, ensure/synthesize docker-compose, ask for missing Cloud.ru credentials, deploy via [cloudru-vm](https://github.com/djd1m/cloudru-vm-cli), verify, hand back app URL + ssh string |
| `docker-compose` | infra | Multi-service Docker configs, health checks |
| `frontend-implementation` | frontend | UI components following project conventions |
| `git-conflict-resolve` | git | Merge/rebase conflict resolution |
| `github-actions` | ci/cd | GitHub Actions workflows, matrix, OIDC |
| `graphql-schema` | api | GraphQL schema design, DataLoader, pagination |
| `incident-response` | ops | Production incident handling, postmortem |
| `itsm-itil` | ops | Lightweight ITIL/ITSM in-repo — incidents, problems, known-errors, RFCs as linked tickets, WSJF prioritization |
| `problem-management` | ops | ITIL problem management — RCA, known-error DB, WSJF prioritization |
| `kubernetes` | infra | K8s deployments, Helm, RBAC, GitOps |
| `monorepo-management` | infra | pnpm/Turborepo workspaces, changesets |
| `nginx-config` | infra | Reverse proxy, SSL, rate limiting |
| `observability` | ops | Metrics, logs, traces, SLOs, alerting — and since 0.3.9 the dashboard step **writes a dashboard file** and a gate opens it (below) |
| `playwright-testing` | testing | E2E tests, page objects, visual regression |
| `pr-review` | code-review | Pull request review with severity grouping |
| `provider-debug` | infra | AI provider configuration debugging |
| `redis-patterns` | cache | Caching, pub/sub, Redlock, rate limiting |
| `retrospective` | ops | Postmortem and retrospective facilitation |
| `risk-assessment` | ops | Risk analysis, scoring, and mitigation planning |
| `security-audit` | security | OWASP-aligned security review |
| `terraform` | iac | Terraform/OpenTofu IaC, modules, drift |
| `test-writer` | testing | Unit, integration, E2E test generation |

## Skill Details

### pr-review
6-step review protocol: get diff, understand scope, read in context (30-50 lines around changes), check correctness/errors/edge cases/naming/tests/security/performance/breaking changes, group by severity (Blocker/Important/Nit), write review with `file:line` citations. Pushes back on PRs >600 lines.

### security-audit
7-step audit: identify trust boundaries, walk 8 vulnerability categories (injection, auth, secrets, file ops, network ops, deserialization, XXE/SSRF, dependencies), require exploitation path for every finding, distinguish Critical/High/Medium/Low severity. No vague "consider sanitizing" — concrete fixes only.

### test-writer
11-step test generation: identify unit, pick test type (unit/integration/e2e), enumerate cases (happy/boundary/edge/error), test contracts not implementation, purpose-built fixtures, descriptive assertions, verify test actually fails when broken. Covers TDD workflow.

### ci-fix
10-step CI diagnosis: find actual failure line, classify (Build/Test/Lint/Deploy/Infra), reproduce locally with same toolchain, check environment differences (OS, versions, locale, timezone, parallelism), fix root cause (no retries/skips/continue-on-error), verify in fresh CI run.

### codeql-fix
5-step SAST fix: read finding precisely (Rule ID + data-flow path), triage real vs false positive, pick canonical fix per rule class (SQL injection → parameterized queries, XSS → context-aware encoding, etc.), write smallest fix, suppress with justification if false positive.

### database-review
9-step migration review: check lock duration, CONCURRENTLY for indexes, rolling-deploy compatibility, index-query mapping, query plan analysis (EXPLAIN), data integrity (FKs, uniqueness), insist on reversible migrations, verify on production-sized data.

### debugging
10-step diagnosis: reproduce, read actual error (bottom of stack trace), narrow scope by bisecting (time/code/data), form falsifiable hypothesis, test with smallest change, fix at right layer (no symptom patches), verify, document.

### frontend-implementation
10-step UI development: read existing patterns first (styling, state, routing, data fetching), confirm brief (states, interactions, data), match conventions, handle non-happy states (loading/error/empty), wire in, add minimal tests, verify in browser.

### git-conflict-resolve
7-step conflict resolution: check git state, name both sides' intent per block, classify (same-goal/independent/logical), resolve leaves-to-roots, verify with `git diff` + tests, continue with correct command. Never guess on logical conflicts — asks the user.

### provider-debug
6-step provider diagnosis: run diagnostics, inspect config (settings, env vars, model names), check for conflicting provider flags, match common error patterns (401/403/404, connection refused, model not found), provide verification command after fix.

## Canonical vs Legacy — Coexistence Model

This package is the **canonical source** for DevOps skills (ADR-001 / ADR-002). Skills are synced to platform-specific directories via `dz sync`:

```bash
dz sync --canonical packages/@dzhechkov/skills-devops --project .
```

Writing is **additive** — existing files are never overwritten without `--force`.

## Origin

All 10 skills were originally created by [gitlawb/openclaude-skills](https://github.com/gitlawb/openclaude-skills) (author: gnanam, license: MIT, trust: official). They have been converted from openclaude's SKILL.md format to the [agentskills.io](https://agentskills.io) standard with:

- YAML frontmatter: `trust_tier`, `trust_tier_label`, `validation` paths
- Output schemas: `schemas/output.json` per skill
- Config validators: `scripts/validate-config.json` per skill
- Eval templates: `evals/<skill>.yaml` per skill

## Status

`v0.3.0` — Part of [DZ Harness Hub](https://github.com/djd1m/dz-harness-hub).

## How to use

Skills **auto-activate** — your agent loads a skill when your task matches its trigger phrases (defined in each skill's `SKILL.md` frontmatter). For example:

- "Review this PR" → `pr-review`
- "Set up Terraform modules for AWS" → `terraform`
- "Fix the failing CI pipeline" → `ci-fix`

To see a skill's exact triggers and assets: `dz info <skill-id>`. To find one: `dz registry search <term>`.

## 0.3.9 — the dashboard step stopped certifying a self-report

Nine of the ten steps in the `observability` skill emitted a runnable artifact. Step 6 — dashboards —
emitted only a table and layout advice, while the output schema asked for a `panels_count` integer.
So this validated, with zero panels built:

```json
{ "name": "Payments", "type": "golden_signals", "panels_count": 6 }
```

`dashboards_defined[]` required exactly two strings, `name` and `type`. A deterministic instrument
was certifying a number someone typed — the inversion the cost-of-detection ladder exists to
prevent, and a relative of the known class *"a gate that fails on a degraded artifact but is silent
on an absent one"*: here nothing was ever opened, so it never reached degraded.

What changed:

- `file` is now **required** — a repo-relative path to the dashboard JSON the step actually wrote.
- `scripts/check-dashboards.mjs` **opens** every one: valid JSON, non-empty `panels`, and
  `panels_count` cross-checked against the real length instead of believed.
- Step 6 now shows the artifact to write, and names the three things in it that are not
  decoration — a datasource template variable rather than a literal uid, a panel unit matching the
  metric's `_seconds` suffix, and `sum by (le)` inside `histogram_quantile` (averaging a
  precomputed quantile across instances is arithmetically meaningless).

```bash
node observability/scripts/check-dashboards.mjs <output.json> --root <repo>
# 0 PASS · 1 FAIL · 3 NOT-ESTABLISHED — and NOT-ESTABLISHED is never a pass
```

### The gate's honest scope — narrowed after four cross-family review rounds

**Threat model: a careless or mistaken report author.** That is the disease this was written for —
*"claims six panels, built zero"* — and it catches it.

**It proves:** every claimed `file` exists, parses, and holds at least one panel object with a string
`type`; `panels_count` matches the real count; a duplicate `dashboards_defined` key (however spelled)
makes the report un-judgeable rather than passing.

**It does not prove**, and must never be read as proving:

- that the queries are correct, that the metrics are ever emitted, or that any panel would render
  data — those need the live datasource;
- **resistance to deliberate evasion.** Rounds 2–4 were a ladder: a regex over the raw text was
  defeated by `\u0064` escaping, and `panels:[null]` by `panels:[{}]`. Each fix caught a *spelling*
  and the next round sent another spelling of the same idea. An author actively gaming this script
  can keep going, and no amount of pattern-tightening ends that race. Claiming otherwise would be a
  new version of exactly the lie this gate exists to catch.

If the report author is untrusted, this is the wrong instrument — have the dashboard written by the
same process that writes the report, or check the live datasource. Do not build a stricter reader of
a document the suspect wrote.

## Signature scope (this release)

The pack's `.dz-manifest.json` now covers exactly the files this package SHIPS, as reported by
`npm pack` — not everything present in the author's working tree. Previously it signed files that
`files[]` excludes (typically `CHANGELOG.md`), so every recipient's verifier reported
`listed in the manifest but absent` and the pack read as TAMPERED. Re-signing at any earlier moment
could not fix that: those files were never in the tarball.

Nothing about the shipped content changed in this release — only what the signature describes.

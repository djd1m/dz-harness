# Duplicate audit — 12 November 2026

Audited public `main` at `7a4e64f656f6f3212262a48986b1962e936c9ba6`: 313 SKILL.md
files, 262 unique frontmatter names including vendored/template copies. Searched names,
descriptions and bodies for freshness, repository assessment/evaluation, maintenance,
technology/dependency selection, capability fit and operational assurance. Read the
closest candidates and Scout's actual relevance implementation, not only names.

| Existing capability | What it already owns | Missing behavior addressed here |
|---|---|---|
| `goap-research-ed25519` (meta/news and templates) | General research, evidence/provenance and source-fetch accounting | No repository-specific code/release/support maintenance assessment or F rubric |
| `@dzhechkov/scout` | Discover ecosystem projects, relevance score, deep skill/inventory comparison | Recency contributes 20% of relevance; `analyzeRepo` uses `pushed_at` as `lastCommit`. No selected-path/release/support assessment. This proposal does not change Scout |
| `risk-assessment` | Risks of a change/pipeline, dependency checks, pre-push secrets | A last-publish check is one signal, not maintenance/currency reasoning |
| `audit`, `security-audit`, `pr-review` | Codebase/change findings and fixes/security review | Different deliverables; freshness does not perform or certify their work |
| `aiagents-agent-fit-and-model-choice` | Agent/model/framework selection criteria derived from a book | Not a live repository/release maintenance assessment |
| `fundamental-software-architecture-guide`, `structured-reasoning`, `capture-adr` | System decisions, reasoning and recording decisions | No repository evidence collection/maintenance contract |
| `news-monitor`, `data-pipeline`, feature-adr receipt freshness | News deltas, data arrival, review evidence age | Different object and meaning of freshness |

All 7 open PRs were checked by changed paths: #13 decision mockups; #30 advisor;
#33/#35 PDF intake; #36 night acceptance; #37 recognition lab; #38 recovery verifier.
Their changed skill entrypoints are decision-mockups, skill-advisor and health-read;
no new repository-maintenance skill. All 11 current/history PR titles and 24 issue
titles were also reviewed; no conflicting named proposal was found. This is bounded
to this repository and the observed refs, not proof that no similar skill exists
anywhere on GitHub or inside the private canonical monorepo.

Decision: one focused `repo-freshness` entrypoint is justified. Do not add copies of
GOAP, risk-assessment, AgentShield or the reasoning/ADR skills. For full five-axis
component selection use the separate `repo-assessment` proposal; this skill ends at
dated maintenance evidence and an optional F assessment.

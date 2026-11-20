# Duplicate audit — 12 November 2026

Source: public `main` at `7a4e64f656f6f3212262a48986b1962e936c9ba6`, 313 SKILL.md
files/262 distinct names, including vendored/template copies. Checked names,
descriptions, relevant bodies, Scout implementation, all current/history PR/issue
titles and changed paths of all 7 open PRs. This does not cover unpublished private
canonical changes or all other repositories on GitHub.

| Existing capability | Overlap | Why this proposal is distinct |
|---|---|---|
| `skill-advisor` and open PR #30 | Task-to-skills/packages recommendations | Chooses within the DZ catalog; does not perform external source-level five-axis repository selection |
| `@dzhechkov/scout` | Relevance, stars, recency and novelty; skill inventory similarity | Discovery/integration suggestions, not task-specific C/F/M/P/O with role groups, hard eligibility and ADR preference sensitivity |
| `goap-research-ed25519` | Evidence collection and provenance | General substrate; no repository selection rubric. Reuse when needed, no copied research engine |
| `structured-reasoning`, `problem-solver-enhanced` | Alternatives/tradeoffs | General reasoning, no pinned component evidence, five-axis scales or unknown/gate-aware aggregation |
| `fundamental-software-architecture-guide` | System-level drivers/tradeoffs | Architecture structure and governance, not assessing concrete repositories as reusable components |
| `aiagents-agent-fit-and-model-choice` | Agent/model/framework choice | Domain criteria from a book; not current arbitrary repo/release evaluation |
| `risk-assessment`, `security-audit`, `agentshield-scan`, `adversarial-verifier` | Change/security evidence and candidate finding review | Remain specialist tools; our O reports observed assurance and never replaces/certifies their checks |
| `capture-adr`, `architecture-decision-records` | Recording a decision | Keep existing writers; this proposal supplies the option/evidence/tradeoff input |
| `audit`, `pr-review`, code critics | Code health/review | Find issues in code/changes rather than choose a role-specific reusable foundation |

Open PR scopes: #13 decision mockups; #30 advisor; #33/#35 PDF intake; #36 night
acceptance; #37 recognition lab; #38 recovery verifier. No entrypoint providing the
proposed external five-axis decision workflow was found in those changes.

Decision: one focused `repo-assessment` candidate, not five per-axis skills and not
copies of research/security/ADR tools. Keep freshness as a separately useful narrow
check: `repo-assessment` consumes a dated maintenance result if available, but remains
self-contained. The overlap is one shared F axis, not duplicate end-to-end workflows.

# @dzhechkov/scout

Multi-source ecosystem intelligence — scans **11 sources** for new agent-skill projects, detects formats, scores relevance, and generates actionable intelligence reports.

## Sources (11)

| Source | What it scans | API |
|--------|-------------|-----|
| **GitHub** | Repos by topics: agent-skills, claude-code-skills, mcp-server | REST + token |
| **npm Registry** | Packages with keywords: mcp-server, claude-code, agent-skills | REST, no auth |
| **Hacker News** | Stories about agent tools via Algolia search | REST, no auth |
| **MCP Registry** | Official modelcontextprotocol.io server registry | OpenAPI |
| **Glama.ai** | MCP server metaregistry (29,900+ servers) | REST |
| **OSSInsight Trending** | Top 100 repos by star velocity (weekly) | REST, no auth |
| **Smithery.ai** | MCP server marketplace (7,300+ servers) | REST |
| **Semantic Scholar** | Academic papers on agent tool use | REST JSON, 1 req/sec |
| **arXiv** | Preprints on agent skills / agentic workflows | Atom XML, 3s delay |
| **ECC** | Curated single repo `affaan-m/ECC` — skill inventory | REST + token |
| **AgentBox** | Curated single repo `DreamLab-AI/agentbox` (100+ skills; unlicensed → `monitor`) | REST + token |

## Usage

```bash
npm i -g @dzhechkov/harness-cli

# Quick scan — radar mode (all 11 sources)
dz scout

# Deep analysis — downloads SKILL.md, finds gaps, recommends integration
dz scout --deep

# Custom topics (GitHub-only)
dz scout --topics mcp-server,ai-agent

# Only recent
dz scout --since 2026-05-01

# Show last saved report (offline, no network)
dz scout --report

# Show what changed since last scan
dz scout --diff
```

## What it does

### Radar mode (`dz scout`)

1. **Scans** 11 sources in parallel with deduplication
2. **Detects** skill formats: SKILL.md, plugin.json, .claude/skills/, MCP manifests
3. **Scores** relevance: format (40%) + stars (30%) + recency (20%) + novelty (10%)
4. **Compares** against our 30 packages — finds skills we don't have
5. **Reports** with recommendations: integrate / monitor / skip
6. **Shows source provenance** — which source found each result

### Deep analyst mode (`dz scout --deep`)

For top-scored repos (score ≥50), goes further:

1. **Downloads SKILL.md** from each repo, parses frontmatter
2. **Finds closest match** in our inventory by keyword overlap
3. **Explains the delta** — what the found skill adds that ours doesn't
4. **Recommends integration path:**
   - **canonicalize** — novel skill → new `@dzhechkov/skills-*` pack
   - **merge** — similar to existing → add unique features to ours
   - **new-preset** — novel → add to preset or new pack
   - **skip** — already in inventory
5. **Gap analysis** — trending categories we lack, with brief descriptions
6. **Academic keyword extraction** — arXiv/Semantic Scholar papers contribute research themes to gaps

### Memory (persistent tracking)

Scout remembers repos between runs (stored at `.dz/scout/`):

- **History tracking** — every scanned repo persisted with firstSeen/lastSeen dates
- **New vs seen** — each scan reports how many repos are genuinely new
- **Diff detection** — `--diff` shows new/gone/score-changed repos since last scan
- **Offline report** — `--report` shows last saved report without any network calls
- **User decisions** — programmatically record integrate/monitor/skip for each repo

## Example output

```
Scanning 11 sources (GitHub + npm + HN + MCP Registry + Glama + OSSInsight + Smithery + S2 + arXiv + ECC + AgentBox)...

Sources: github: 50, npm: 42, hackernews: 30, mcp-registry: 20, glama: 10, ossinsight: 64, smithery: 20, s2: 5

# Scout Intelligence Report
Total found: 216 | Scanned: 216

## 🟢 Integrate (high relevance)
| Repo | Stars | Formats | Score | Novel skills |
|------|-------|---------|-------|-------------|
| EXboys/evotown | 954 | agentskills-io | 88 | skill-creator, find-skills |

## 🔬 Deep Analysis (--deep only)
### EXboys/evotown (★954)
| Skill | Description | Closest match | Integration | Rationale |
|-------|------------|---------------|-------------|-----------|
| skill-creator | Create or update AgentSkills | feature-adr | **merge** | Similar — merge unique features |
| http-request | HTTP requests for API calls | — | **canonicalize** | Novel skill (954★) |

## 📊 Harness Gap Analysis
| Category | What it is | Frequency | Recommendation |
|----------|-----------|-----------|---------------|
| ai-agents | Autonomous frameworks — orchestration, planning, memory | 15 repos | Create @dzhechkov/skills-ai-agents |
| mcp | MCP servers — database, API, filesystem connectors | 10 repos | Create @dzhechkov/skills-mcp |
| tool use | LLM tool use — function calling, multi-step chains | 5 papers | Monitor — academic research trend |
```

## Programmatic API

```typescript
import { scanAllSources, deepAnalyze, generateReport } from '@dzhechkov/scout';

// Multi-source scan
const { results, totalBySource } = await scanAllSources({ token: process.env.GITHUB_TOKEN });

// Generate report
const report = generateReport({ repos: results, ... });

// Deep analysis on top results
const deep = await deepAnalyze(results, { token });

// Individual sources
import { scanNpm, scanHN, scanMcpRegistry, scanGlama } from '@dzhechkov/scout';
```

## Status

`v0.8.0` — published on npm. Part of [DZ Harness Hub](https://github.com/djd1m/dz-harness-hub).

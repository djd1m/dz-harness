/**
 * Deep content analyzer — downloads SKILL.md from top repos, parses content,
 * compares against our inventory, generates actionable recommendations.
 *
 * Activated by `dz scout --deep`. Only runs on repos with relevanceScore ≥ 50.
 *
 * @packageDocumentation
 */

import type { RepoProfile } from './types.js';
import { OUR_SKILL_IDS } from './inventory.js';

const GITHUB_RAW = 'https://raw.githubusercontent.com';

/** A skill discovered via deep content analysis. */
export interface DeepSkillAnalysis {
  /** Skill directory name. */
  readonly id: string;
  /** Parsed description from SKILL.md frontmatter. */
  readonly description: string;
  /** Closest matching skill in our inventory (by keyword overlap), or null. */
  readonly closestMatch: string | null;
  /** What this skill adds that our closest match doesn't. */
  readonly delta: string;
  /** Recommended integration path. */
  readonly integration: 'canonicalize' | 'merge' | 'new-preset' | 'skip';
  /** Human-readable integration rationale. */
  readonly rationale: string;
}

/** Deep analysis result for a single repository. */
export interface DeepRepoAnalysis {
  readonly repo: RepoProfile;
  readonly skillsAnalyzed: readonly DeepSkillAnalysis[];
  readonly gapSummary: string;
}

/** Result of a full deep analysis pass. */
export interface DeepAnalysisReport {
  readonly analyses: readonly DeepRepoAnalysis[];
  readonly gaps: readonly GapEntry[];
  readonly markdown: string;
}

/** A gap in our harness identified from ecosystem scan. */
export interface GapEntry {
  readonly category: string;
  readonly description: string;
  readonly frequency: number;
  readonly examples: readonly string[];
  readonly recommendation: string;
}

/** Brief descriptions for common gap categories. */
const GAP_DESCRIPTIONS: Record<string, string> = {
  'ai-agents': 'Autonomous AI agent frameworks — orchestration, planning, memory, tool routing',
  'mcp': 'Model Context Protocol servers — database, API, file system connectors',
  'ai-coding': 'AI-assisted coding tools — code generation, refactoring, completion',
  'developer-tools': 'Developer productivity — CLI utils, scaffolding, project management',
  'open-source': 'Open-source ecosystem tools — licensing, contribution, community',
  'typescript': 'TypeScript-specific tooling — type generation, compiler plugins, AST',
  'evolution': 'Self-evolving agent systems — adaptive behavior, skill learning',
  'runtime-governance': 'Agent runtime governance — permissions, sandboxing, audit trails',
  'self-evolving': 'Self-modifying agents — autonomous skill creation and improvement',
  'self-learning': 'Agent learning systems — pattern extraction, experience replay, transfer learning',
  'ai-safety': 'AI safety and alignment — guardrails, monitoring, red-teaming',
  'deploy-automation': 'Deployment automation — CI/CD, infrastructure-as-code, rollback',
  'data-pipeline': 'Data pipeline testing — ETL validation, schema drift, data quality',
  'mobile-testing': 'Mobile app testing — iOS/Android, responsive, gestures, device farms',
  'agent-framework': 'Agent framework scaffolding — project templates, boilerplate, conventions',
  'agent-identity': 'Agent identity management — persona, context, session persistence',
  'agent-infrastructure': 'Agent infrastructure — hosting, scaling, monitoring, observability',
  'agent-memory': 'Agent memory systems — vector stores, episodic memory, knowledge graphs',
  'autonomous-agents': 'Fully autonomous agent systems — goal-driven, self-directed execution',
  'tool use': 'LLM tool use research — function calling, tool selection, multi-step tool chains',
  'agentic': 'Agentic AI patterns — autonomous workflows, goal decomposition, self-correction',
  'multi-agent': 'Multi-agent systems — coordination, communication, specialization, debate',
  'code generation': 'AI code generation — program synthesis, test generation, refactoring',
  'reasoning': 'LLM reasoning — chain-of-thought, tree-of-thought, self-reflection',
  'planning': 'Agent planning — GOAP, hierarchical task networks, Monte Carlo tree search',
  'grounding': 'Agent grounding — connecting LLM outputs to real-world actions and APIs',
  'alignment': 'AI alignment research — RLHF, constitutional AI, value learning',
};

/** Parse YAML frontmatter from a SKILL.md string. */
function parseFrontmatter(text: string): { description: string; name?: string | undefined } | null {
  const match = text.match(/^---\s*\n([\s\S]*?)\n---/);
  if (!match?.[1]) return null;
  const descMatch = match[1].match(/description:\s*["']?(.+?)["']?\s*$/m);
  const nameMatch = match[1].match(/name:\s*["']?(.+?)["']?\s*$/m);
  return {
    description: descMatch?.[1] ?? '',
    name: nameMatch?.[1],
  };
}

/** Tokenize text for keyword matching. */
function tokenize(text: string): Set<string> {
  return new Set(
    text.toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length > 2),
  );
}

/** Find the closest matching skill in our inventory by keyword overlap. */
function findClosestMatch(description: string, ourSkillDescriptions: Map<string, string>): string | null {
  const queryTokens = tokenize(description);
  let bestMatch: string | null = null;
  let bestOverlap = 0;

  for (const [skillId, skillDesc] of ourSkillDescriptions) {
    const skillTokens = tokenize(skillDesc);
    let overlap = 0;
    for (const token of queryTokens) {
      if (skillTokens.has(token)) overlap++;
    }
    if (overlap > bestOverlap) {
      bestOverlap = overlap;
      bestMatch = skillId;
    }
  }

  return bestOverlap >= 2 ? bestMatch : null;
}

/** Determine integration path for a discovered skill. */
function recommendIntegration(
  skillId: string,
  closestMatch: string | null,
  stars: number,
): { integration: DeepSkillAnalysis['integration']; rationale: string } {
  if (OUR_SKILL_IDS.has(skillId)) {
    return { integration: 'skip', rationale: `Already in our inventory as "${skillId}"` };
  }
  if (closestMatch !== null) {
    return {
      integration: 'merge',
      rationale: `Similar to our "${closestMatch}" — merge unique features rather than duplicating`,
    };
  }
  if (stars >= 100) {
    return {
      integration: 'canonicalize',
      rationale: `High-signal novel skill (${stars} stars) — canonicalize as new @dzhechkov/skills-* pack`,
    };
  }
  return {
    integration: 'new-preset',
    rationale: `Novel skill — consider adding to a preset or creating a new skill pack`,
  };
}

/** Fetch a file from a GitHub repo's default branch. */
async function fetchGitHubFile(
  fullName: string,
  path: string,
  branch: string,
  token?: string,
): Promise<string | null> {
  const url = `${GITHUB_RAW}/${fullName}/${branch}/${path}`;
  const headers: Record<string, string> = { 'User-Agent': 'dz-scout/0.2.0' };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  try {
    const resp = await fetch(url, { headers });
    if (!resp.ok) return null;
    return await resp.text();
  } catch {
    return null;
  }
}

/** Fetch the file tree of a repo to find SKILL.md files. */
async function fetchSkillPaths(
  fullName: string,
  branch: string,
  token?: string,
): Promise<string[]> {
  const url = `https://api.github.com/repos/${fullName}/git/trees/${branch}?recursive=1`;
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'dz-scout/0.2.0',
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  try {
    const resp = await fetch(url, { headers });
    if (!resp.ok) return [];
    const data = (await resp.json()) as { tree: { path: string; type: string }[] };
    return data.tree
      .filter((entry) => entry.type === 'blob' && entry.path.endsWith('/SKILL.md'))
      .map((entry) => entry.path);
  } catch {
    return [];
  }
}

/** Our skill descriptions for matching (static snapshot). */
const OUR_DESCRIPTIONS = new Map<string, string>([
  ['explore', 'adaptive task exploration and clarification'],
  ['feature-adr', 'feature development pipeline with complexity router and ADR'],
  ['knowledge-extractor', 'multi-agent knowledge harvesting system'],
  ['brutal-honesty-review', 'code review with Linus Torvalds and Gordon Ramsay modes'],
  ['qe-test-generation', 'generates unit integration and e2e tests from code analysis'],
  ['qe-coverage-analysis', 'analyzes test coverage data with risk-weighted gap detection'],
  ['qe-chaos-resilience', 'controlled fault injection and resilience testing'],
  ['qe-browser', 'browser automation for visual testing and accessibility audits'],
  ['qe-quality-assessment', 'code quality scoring complexity analysis and test health'],
  ['problem-solver-enhanced', 'first principles thinking game theory and TRIZ'],
  ['reverse-engineering-unicorn', 'reverse engineer existing products and systems'],
  ['sparc-prd-mini', 'generate SPARC product requirements document'],
  ['drug-interaction-checker', 'check drug-drug interactions'],
  ['clinical-diagnostic-reasoning', 'differential diagnosis assistance'],
  ['concept-wiki-generator', 'evidence-disciplined wiki with inline source citations'],
]);

/**
 * Run deep analysis on top-scored repos.
 *
 * Downloads SKILL.md files, parses them, compares against our inventory,
 * and generates actionable integration recommendations.
 */
export async function deepAnalyze(
  repos: readonly RepoProfile[],
  options: { token?: string | undefined; minScore?: number | undefined } = {},
): Promise<DeepAnalysisReport> {
  const minScore = options.minScore ?? 50;
  // Only GitHub repos can be deep-analyzed (need owner/repo format for tree API)
  const candidates = repos.filter((r) =>
    r.relevanceScore >= minScore &&
    r.fullName.includes('/') &&
    !r.fullName.startsWith('hn/') &&
    !r.fullName.startsWith('paper/') &&
    !r.fullName.startsWith('arxiv/') &&
    !r.fullName.startsWith('mcp/') &&
    !r.fullName.startsWith('glama/') &&
    !r.fullName.startsWith('smithery/') &&
    r.url.includes('github.com'),
  );
  const analyses: DeepRepoAnalysis[] = [];
  const categoryCount = new Map<string, { count: number; examples: string[] }>();

  for (const repo of candidates.slice(0, 10)) { // limit to top 10 for rate limiting
    const branch = 'main'; // TODO: use repo.defaultBranch when available
    const skillPaths = await fetchSkillPaths(repo.fullName, branch, options.token);

    const skillsAnalyzed: DeepSkillAnalysis[] = [];
    for (const skillPath of skillPaths.slice(0, 5)) { // max 5 skills per repo
      const content = await fetchGitHubFile(repo.fullName, skillPath, branch, options.token);
      if (!content) continue;

      const frontmatter = parseFrontmatter(content);
      if (!frontmatter) continue;

      const dirName = skillPath.split('/').slice(-2, -1)[0] ?? 'unknown';
      const closestMatch = findClosestMatch(frontmatter.description, OUR_DESCRIPTIONS);
      const { integration, rationale } = recommendIntegration(dirName, closestMatch, repo.stars);

      const delta = closestMatch
        ? `Adds: ${frontmatter.description.slice(0, 100)}. Our "${closestMatch}" lacks this.`
        : `Entirely new capability: ${frontmatter.description.slice(0, 100)}`;

      skillsAnalyzed.push({
        id: dirName,
        description: frontmatter.description,
        closestMatch,
        delta,
        integration,
        rationale,
      });

      // Track categories for gap analysis
      for (const topic of repo.topics) {
        const entry = categoryCount.get(topic) ?? { count: 0, examples: [] };
        entry.count++;
        if (entry.examples.length < 3) entry.examples.push(repo.fullName);
        categoryCount.set(topic, entry);
      }
    }

    if (skillsAnalyzed.length > 0) {
      const novelCount = skillsAnalyzed.filter((s) => s.integration !== 'skip').length;
      analyses.push({
        repo,
        skillsAnalyzed,
        gapSummary: `${novelCount}/${skillsAnalyzed.length} skills are novel`,
      });
    }
  }

  // Also extract research themes from non-GitHub sources (papers, HN stories)
  const academicKeywords = ['tool use', 'agentic', 'agent memory', 'multi-agent', 'code generation',
    'self-evolving', 'reasoning', 'planning', 'grounding', 'safety', 'alignment'];
  for (const repo of repos) {
    if (repo.fullName.startsWith('paper/') || repo.fullName.startsWith('arxiv/') || repo.fullName.startsWith('hn/')) {
      const desc = repo.description.toLowerCase();
      for (const kw of academicKeywords) {
        if (desc.includes(kw)) {
          const entry = categoryCount.get(kw) ?? { count: 0, examples: [] };
          entry.count++;
          if (entry.examples.length < 3) entry.examples.push(repo.fullName);
          categoryCount.set(kw, entry);
        }
      }
    }
  }

  // Build gap entries from category frequency
  const gaps: GapEntry[] = [...categoryCount.entries()]
    .filter(([cat]) => !['agent-skills', 'claude-code', 'mcp-server', 'claude-code-skills'].includes(cat))
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 10)
    .map(([category, { count, examples }]) => ({
      category,
      description: GAP_DESCRIPTIONS[category] ?? `${category} — skills and tools in this domain`,
      frequency: count,
      examples,
      recommendation: count >= 5
        ? `Create @dzhechkov/skills-${category} — high demand (${count} repos)`
        : `Monitor — emerging trend (${count} repos)`,
    }));

  return {
    analyses,
    gaps,
    markdown: generateDeepMarkdown(analyses, gaps),
  };
}

function generateDeepMarkdown(analyses: readonly DeepRepoAnalysis[], gaps: readonly GapEntry[]): string {
  const lines: string[] = [
    '',
    '---',
    '',
    '## 🔬 Deep Analysis',
    '',
  ];

  for (const a of analyses) {
    lines.push(`### [${a.repo.fullName}](${a.repo.url}) (★${a.repo.stars})`, '');
    lines.push(`${a.gapSummary}`, '');
    lines.push('| Skill | Description | Closest match | Integration | Rationale |');
    lines.push('|-------|------------|---------------|-------------|-----------|');
    for (const s of a.skillsAnalyzed) {
      const desc = s.description.length > 60 ? s.description.slice(0, 57) + '...' : s.description;
      lines.push(`| ${s.id} | ${desc} | ${s.closestMatch ?? '—'} | **${s.integration}** | ${s.rationale} |`);
    }
    lines.push('');
  }

  if (gaps.length > 0) {
    lines.push('## 📊 Harness Gap Analysis', '');
    lines.push('| Category | What it is | Frequency | Recommendation |');
    lines.push('|----------|-----------|-----------|---------------|');
    for (const g of gaps) {
      lines.push(`| ${g.category} | ${g.description} | ${g.frequency} repos | ${g.recommendation} |`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * Task recommender — decomposes a user task into harness capabilities.
 *
 * Maps a natural-language task description against the full inventory of
 * commands (23), skills (59), presets (10), and targets (5) to produce
 * a step-by-step plan using existing harness features.
 *
 * This module is deterministic (no LLM) — it uses topic extraction,
 * weighted scoring, and capability matching. The knowledge base is
 * auto-generated from the registry at runtime, so it stays current
 * as new skills/commands are added.
 *
 * @packageDocumentation
 */

import type { Registry, RegistryEntry } from './registry.js';
import { pretrain } from './pretrain.js';
import { computePatternBoost, loadPatterns, loadStoreRecords, readLearningConfig, readReinforcementState, recordToPattern } from './patterns.js';
import { resolveLearningBackend } from './learning-backend.js';

/** A recommended skill with relevance score. */
export interface SkillRecommendation {
  readonly id: string;
  readonly pack: string;
  readonly description: string;
  readonly category: string;
  readonly score: number;
  readonly reason: string;
}

/** A recommended CLI command. */
export interface CommandRecommendation {
  readonly command: string;
  readonly description: string;
  readonly example: string;
  readonly phase: string;
}

/** A recommended preset. */
export interface PresetRecommendation {
  readonly name: string;
  readonly skills: number;
  readonly coverage: number;
  readonly matchedSkills: string[];
}

/** A recommended npx toolkit (full pipeline). */
export interface ToolkitRecommendation {
  readonly name: string;
  readonly npmPackage: string;
  readonly install: string;
  readonly description: string;
  readonly reason: string;
}

/** Full recommendation report. */
export interface RecommendationReport {
  readonly task: string;
  readonly topics: readonly string[];
  readonly skills: readonly SkillRecommendation[];
  readonly presets: readonly PresetRecommendation[];
  readonly toolkits: readonly ToolkitRecommendation[];
  readonly commands: readonly CommandRecommendation[];
  readonly installCommand: string;
  readonly plan: readonly string[];
  /** Set when task was too generic and pretrain was used as fallback. */
  readonly pretrainFallback?: boolean;
}

/** Topic → keywords mapping for task decomposition. */
const TOPIC_KEYWORDS: Record<string, string[]> = {
  'api': ['api', 'rest', 'graphql', 'endpoint', 'openapi', 'swagger', 'http', 'grpc'],
  'testing': ['test', 'testing', 'tdd', 'unit test', 'integration test', 'e2e', 'coverage', 'spec'],
  'ci-cd': ['ci/cd', 'ci cd', 'pipeline', 'github actions', 'gitlab', 'jenkins', 'deploy', 'continuous integration', 'continuous delivery'],
  'security': ['security', 'audit', 'vulnerability', 'owasp', 'injection', 'auth', 'codeql', 'sast'],
  'database': ['database', 'migration', 'schema', 'sql', 'postgres', 'mysql', 'query', 'index'],
  'kubernetes': ['kubernetes', 'k8s', 'helm', 'pod', 'deployment', 'container', 'cluster', 'service mesh'],
  'docker': ['docker', 'compose', 'container', 'dockerfile', 'image', 'registry'],
  'terraform': ['terraform', 'iac', 'infrastructure', 'cloud', 'aws', 'gcp', 'azure', 'provision'],
  'monitoring': ['monitoring', 'observability', 'metrics', 'logs', 'traces', 'alerting', 'slo', 'grafana', 'prometheus'],
  'incident': ['incident', 'outage', 'postmortem', 'oncall', 'pagerduty', 'sev1', 'downtime'],
  'monorepo': ['monorepo', 'workspace', 'pnpm', 'turborepo', 'nx', 'changeset', 'lerna'],
  'review': ['review', 'pull request', 'code review', 'merge', ' pr ', 'pr '],
  'debug': ['debug', 'error', 'crash', 'stack trace', 'bug', 'fix', 'troubleshoot'],
  'frontend': ['frontend', 'react', 'vue', 'component', 'ui', 'css', 'tailwind'],
  'git': ['git', 'merge', 'rebase', 'conflict', 'branch', 'cherry-pick'],
  'web3': ['web3', 'blockchain', 'defi', 'crypto', 'ethereum', 'solana', 'nft', 'token', 'swap', 'wallet'],
  'search': ['search', 'brave', 'exa', 'web search', 'find information'],
  'email': ['email', 'gmail', 'inbox', 'send email', 'mail'],
  'productivity': ['sheets', 'calendar', 'tasks', 'todo', 'schedule', 'meeting', 'clickup', 'project management'],
  'data': ['data', 'etl', 'elt', 'pipeline', 'transform', 'dbt', 'airflow', 'warehouse'],
  'social': ['farcaster', 'reddit', 'social', 'community'],
  'research': ['research', 'explore', 'casarium', 'competitor', 'market', 'analysis'],
  'docs': ['documentation', 'docs', 'context7', 'library', 'reference'],
  'scrape': ['scrape', 'crawl', 'extract', 'jina', 'content', 'markdown'],
  'design-thinking': ['design thinking', 'user research', 'prototype', 'empathize', 'jtbd', 'jobs to be done', 'cjm', 'customer journey', 'vsm', 'value stream', 'hadi', 'lean canvas', 'usability', 'product discovery', 'mvp'],
  'product': ['product', 'feature', 'roadmap', 'prd', 'requirements', 'sprint', 'backlog'],
  'academic': ['thesis', 'dissertation', 'defense', 'ВКР', 'защита', 'ГЭК', 'рецензия', 'academic'],
  'quality': ['quality', 'qa', 'qe', 'quality engineering', 'test strategy', 'coverage'],
  'health': ['health', 'medical', 'clinical', 'diagnosis', 'drug', 'lab', 'patient'],
};

/** Command knowledge base — what each command does and when to use it. */
const COMMAND_KB: { command: string; description: string; example: string; phase: string; topics: string[] }[] = [
  { command: 'dz init', description: 'Install skills for your platform', example: 'dz init --target claude-code --preset devops', phase: 'Install', topics: ['install', 'setup', 'init'] },
  { command: 'dz install', description: 'Install skills from npm package', example: 'dz install @dzhechkov/skills-devops', phase: 'Install', topics: ['install', 'npm'] },
  { command: 'dz verify', description: 'Verify installed skills structure', example: 'dz verify', phase: 'Install', topics: ['verify', 'check', 'validate'] },
  { command: 'dz doctor', description: 'Run health checks', example: 'dz doctor', phase: 'Install', topics: ['health', 'check', 'diagnose'] },
  { command: 'dz registry', description: 'Browse all available skills', example: 'dz registry search kubernetes', phase: 'Discover', topics: ['find', 'browse', 'search', 'discover'] },
  { command: 'dz benchmark', description: 'Benchmark skill quality (L0)', example: 'dz benchmark <skill-dir> --all', phase: 'Create', topics: ['quality', 'benchmark', 'test', 'grade'] },
  { command: 'dz create-skill', description: 'Scaffold a new skill', example: 'dz create-skill --name my-skill --bto', phase: 'Create', topics: ['create', 'new', 'scaffold'] },
  { command: 'dz scout', description: 'Scan ecosystem for new skills', example: 'dz scout --deep', phase: 'Create', topics: ['find', 'ecosystem', 'discover', 'scan'] },
  { command: 'dz upgrade', description: 'Check installed skills for updates', example: 'dz upgrade', phase: 'Maintain', topics: ['update', 'upgrade', 'refresh'] },
  { command: 'dz sync-upstream', description: 'Check upstream for changes', example: 'dz sync-upstream --package <dir>', phase: 'Maintain', topics: ['sync', 'upstream', 'update'] },
  { command: 'dz publish', description: 'Publish packages to npm', example: 'dz publish --filter skills-devops', phase: 'Share', topics: ['publish', 'npm', 'release'] },
  { command: 'dz downloads', description: 'npm download statistics', example: 'dz downloads', phase: 'Discover', topics: ['stats', 'downloads', 'metrics'] },
  { command: 'dz workflow', description: 'Run dynamic workflow', example: 'dz workflow --task coverage-lift', phase: 'Maintain', topics: ['workflow', 'coverage', 'mutation', 'security'] },
  { command: 'dz dashboard', description: 'Visual overview of all packages', example: 'dz dashboard', phase: 'Discover', topics: ['overview', 'status', 'dashboard'] },
];

/** Preset knowledge base. */
const PRESET_KB: { name: string; skills: string[]; topics: string[] }[] = [
  { name: 'devops', skills: ['api-design', 'pr-review', 'security-audit', 'test-writer', 'ci-fix', 'codeql-fix', 'database-review', 'debugging', 'frontend-implementation', 'git-conflict-resolve', 'provider-debug', 'incident-response', 'monorepo-management', 'data-pipeline', 'docker-compose', 'terraform', 'kubernetes', 'github-actions', 'observability', 'database-migration'], topics: ['api', 'testing', 'ci-cd', 'security', 'database', 'kubernetes', 'docker', 'terraform', 'monitoring', 'incident', 'monorepo', 'review', 'debug', 'frontend', 'git', 'data'] },
  { name: 'web3', skills: ['quicknode', 'zerion', 'symbiosis', 'ens-primary-name', 'erc-8004', 'veil', 'neynar', 'trails', 'bankr', 'siwa', 'hydrex', 'quotient'], topics: ['web3', 'blockchain', 'defi', 'crypto'] },
  { name: 'mcp', skills: ['brave-search', 'exa-search', 'gmail', 'google-sheets', 'google-calendar', 'google-tasks', 'clickup', 'reddit', 'jina-reader', 'context7'], topics: ['search', 'email', 'productivity', 'social', 'docs', 'scrape'] },
  { name: 'qe-engineer', skills: ['qe-test-generation', 'qe-test-execution', 'qe-coverage-analysis', 'qe-quality-assessment', 'qe-requirements-validation', 'qe-defect-intelligence', 'qe-iterative-loop', 'qe-chaos-resilience'], topics: ['testing', 'quality', 'coverage'] },
  { name: 'meta', skills: ['explore', 'goap-research-ed25519', 'problem-solver-enhanced', 'design-thinking', 'feature-adr', 'knowledge-extractor'], topics: ['research', 'explore', 'design-thinking', 'product'] },
  { name: 'keysarium', skills: ['explore', 'feature-adr', 'knowledge-extractor', 'problem-solver-enhanced', 'analyst-manual-full', 'reverse-engineering-unicorn', 'presentation-storyteller'], topics: ['research', 'explore', 'product'] },
  { name: 'health', skills: ['drug-interaction-checker', 'clinical-diagnostic-reasoning', 'lab-results'], topics: ['health'] },
  { name: 'bto', skills: ['bto'], topics: ['quality'] },
  { name: 'p-replicator', skills: ['explore', 'reverse-engineering-unicorn', 'sparc-prd-mini'], topics: ['product'] },
  { name: 'feature-adr', skills: ['explore', 'feature-adr', 'knowledge-extractor', 'problem-solver-enhanced', 'frontend-design'], topics: ['product', 'feature'] },
  { name: 'academic', skills: ['dissertation-review', 'question-generator', 'document-checker', 'defense-evaluator', 'answer-assessor'], topics: ['academic'] },
];

/** Toolkit knowledge base — npx packages with full pipelines. */
const TOOLKIT_KB: { name: string; npmPackage: string; install: string; description: string; topics: string[] }[] = [
  { name: 'keysarium', npmPackage: '@dzhechkov/keysarium', install: 'npx @dzhechkov/keysarium init', description: '7-phase AI research toolkit with commands, governance, and memory', topics: ['research', 'explore', 'product'] },
  { name: 'p-replicator', npmPackage: '@dzhechkov/p-replicator', install: 'npx @dzhechkov/p-replicator init', description: 'AI product development — /replicate pipeline with SPARC PRD', topics: ['product'] },
  { name: 'health-advisor', npmPackage: '@dzhechkov/health-advisor', install: 'npx @dzhechkov/health-advisor init', description: 'Medical AI toolkit (25 skills)', topics: ['health'] },
  { name: 'skills-bto', npmPackage: '@dzhechkov/skills-bto', install: 'npx @dzhechkov/skills-bto init', description: 'Build-Benchmark-Test-Optimize pipeline', topics: ['quality'] },
  { name: 'skills-feature-adr', npmPackage: '@dzhechkov/skills-feature-adr', install: 'npx @dzhechkov/skills-feature-adr init', description: '11-step feature pipeline with ADR, DDD, QE', topics: ['product', 'feature'] },
  { name: 'agentic-qe', npmPackage: 'agentic-qe', install: 'npm install -g agentic-qe && aqe init --auto', description: 'Full QE platform — 94 skills + 55 agents + MCP server', topics: ['quality', 'testing'] },
  { name: 'skills-analyst-manual', npmPackage: '@dzhechkov/skills-analyst-manual', install: 'npx @dzhechkov/skills-analyst-manual init', description: '3-phase analyst composite (explore → research → solve)', topics: ['research', 'product'] },
];

/** Extract topics from a task description. */
function extractTopics(task: string): string[] {
  const lower = task.toLowerCase();
  const matched: string[] = [];
  for (const [topic, keywords] of Object.entries(TOPIC_KEYWORDS)) {
    for (const kw of keywords) {
      if (lower.includes(kw)) {
        matched.push(topic);
        break;
      }
    }
  }
  return matched.length > 0 ? matched : ['general'];
}

/** Score a skill against extracted topics. */
function scoreSkill(entry: RegistryEntry, topics: string[], task?: string): number {
  const lower = `${entry.id} ${entry.description} ${entry.category}`.toLowerCase();
  let score = 0;
  for (const topic of topics) {
    const keywords = TOPIC_KEYWORDS[topic] ?? [topic];
    for (const kw of keywords) {
      if (lower.includes(kw)) { score += 10; break; }
    }
  }
  // Topic points alone are FLAT: every skill of a matching topic scores exactly 10, so dozens tie
  // and the top-N cut falls arbitrarily among them. Harmless while the catalogue was small; the
  // moment it grew from 202 to 249 skills (layout fix, 2026-09-01) the right answer started losing
  // ties to same-topic neighbours. A small tie-break by ACTUAL overlap with the asked task keeps
  // the topic signal dominant (10 per topic) while letting the skill the user literally described
  // rise above its topic-mates: an id word is worth more than a description word, because an id
  // match is rarely accidental.
  if (task !== undefined && task !== '') {
    const words = [...new Set(task.toLowerCase().match(/[\p{L}\p{N}]{3,}/gu) ?? [])];
    const id = entry.id.toLowerCase();
    const desc = String(entry.description ?? '').toLowerCase();
    let overlap = 0;
    for (const w of words) {
      if (id.includes(w)) overlap += 3;
      else if (desc.includes(w)) overlap += 1;
    }
    // Capped below one topic point so a tie-break can never outrank a genuine topic match.
    score += Math.min(overlap, 9);
  }
  return score;
}

/** Generate recommendation from a task and registry.
 *  When task is too generic (only 'general' topic), falls back to pretrain
 *  to analyze the actual project and recommend based on tech stack.
 */
export function recommend(task: string, registry: Registry, projectRoot?: string): RecommendationReport {
  let topics = extractTopics(task);
  let pretrainFallback = false;

  // Fallback: if task is too generic, use pretrain to detect project stack
  if (topics.length === 1 && topics[0] === 'general' && projectRoot) {
    const analysis = pretrain(projectRoot);
    const pretrainTopics: string[] = [];
    const techNames = analysis.techs.map((t) => t.name.toLowerCase());
    if (techNames.some((t) => t.includes('node') || t.includes('typescript'))) pretrainTopics.push('api', 'testing');
    if (techNames.some((t) => t.includes('python') || t.includes('django') || t.includes('fastapi'))) pretrainTopics.push('api', 'testing');
    if (techNames.some((t) => t.includes('react') || t.includes('vue') || t.includes('angular'))) pretrainTopics.push('frontend');
    if (analysis.hasDocker) pretrainTopics.push('docker');
    if (analysis.hasTerraform) pretrainTopics.push('terraform');
    if (analysis.hasKubernetes) pretrainTopics.push('kubernetes');
    if (analysis.hasCI) pretrainTopics.push('ci-cd');
    if (analysis.hasTests) pretrainTopics.push('testing');
    if (pretrainTopics.length > 0) {
      topics = [...new Set(pretrainTopics)];
      pretrainFallback = true;
    }
  }

  // Learned-pattern read-back (audit #2): reward-rank taught patterns into a
  // bounded, monotonic boost. Gated on the rollout flag; when memory is empty or
  // the flag is off, `patterns` is [] and the boost is 0 — ranking stays
  // byte-identical to the pure keyword scoring (the graceful invariant, R3).
  const records = projectRoot && readLearningConfig(projectRoot).recommendBoost ? loadStoreRecords(projectRoot) : [];
  const patterns = projectRoot && readLearningConfig(projectRoot).recommendBoost ? loadPatterns(projectRoot) : [];
  const backend = projectRoot !== undefined ? resolveLearningBackend(projectRoot) : undefined;
  const boostFor = (entry: RegistryEntry): number => {
    const base = computePatternBoost(entry.id, entry.description, patterns);
    if (base <= 0 || backend === undefined) return base;
    const matched = records.filter((r) => computePatternBoost(entry.id, entry.description, [recordToPattern(r)]) > 0);
    if (matched.length === 0) return base;
    const signals = backend.enhance(
      matched.map((r) => ({ dzId: r.id, score: r.score, reinforcement: readReinforcementState(r) })),
      { kind: 'recommend' },
    );
    const maxSignal = Math.max(0, ...signals);
    return Math.min(50, Math.round(base * (1 + 0.25 * maxSignal)));
  };

  // Score and rank skills
  const scored = registry.entries
    .map((e) => ({
      entry: e,
      score: scoreSkill(e, topics, task) + (patterns.length ? boostFor(e) : 0),
    }))
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score);

  const skills: SkillRecommendation[] = scored.slice(0, 10).map((s) => {
    let reason = `Matches topics: ${topics.filter((t) => scoreSkill(s.entry, [t]) > 0).join(', ')}`;
    if (patterns.length && boostFor(s.entry) > 0) {
      reason += ' + learned patterns';
    }
    return {
      id: s.entry.id,
      pack: s.entry.pack,
      description: s.entry.description,
      category: s.entry.category,
      score: s.score,
      reason,
    };
  });

  // Score presets
  const presetScores = PRESET_KB.map((p) => {
    const matchedTopics = topics.filter((t) => p.topics.includes(t));
    const matchedSkills = skills.filter((s) => p.skills.includes(s.id)).map((s) => s.id);
    return {
      name: p.name,
      skills: p.skills.length,
      coverage: matchedTopics.length,
      matchedSkills,
    };
  }).filter((p) => p.coverage > 0 || p.matchedSkills.length > 0)
    .sort((a, b) => (b.coverage + b.matchedSkills.length) - (a.coverage + a.matchedSkills.length));

  const presets: PresetRecommendation[] = presetScores.slice(0, 3);

  // Recommend commands based on topics
  const commands: CommandRecommendation[] = COMMAND_KB
    .filter((c) => c.topics.some((t) => topics.includes(t)) || c.command === 'dz init')
    .slice(0, 6)
    .map((c) => ({ command: c.command, description: c.description, example: c.example, phase: c.phase }));

  // Score toolkits — recommend when task needs a full pipeline
  const toolkits: ToolkitRecommendation[] = TOOLKIT_KB
    .map((tk) => {
      const matchedTopics = topics.filter((t) => tk.topics.includes(t));
      if (matchedTopics.length === 0) return null;
      return {
        name: tk.name,
        npmPackage: tk.npmPackage,
        install: tk.install,
        description: tk.description,
        reason: `Matches: ${matchedTopics.join(', ')}. Full pipeline with commands + governance.`,
      };
    })
    .filter((tk): tk is ToolkitRecommendation => tk !== null)
    .slice(0, 3);

  // Generate install command
  const topPreset = presets[0];
  const topSkillIds = skills.slice(0, 5).map((s) => s.id);
  const installCommand = topPreset
    ? `dz setup --target claude-code --preset ${topPreset.name}`
    : `dz init --target claude-code --select ${topSkillIds.join(',')}`;

  // Generate step-by-step plan
  const plan: string[] = [];
  plan.push(`1. Install: ${installCommand}`);
  plan.push(`2. Verify: dz verify && dz doctor`);
  if (skills.length > 0) {
    plan.push(`3. Key skills: ${skills.slice(0, 5).map((s) => s.id).join(', ')}`);
  }
  if (toolkits.length > 0 && toolkits[0]) {
    plan.push(`4. Full pipeline: ${toolkits[0].install}`);
    plan.push(`   (${toolkits[0].description})`);
  }
  if (topics.includes('testing') || topics.includes('security')) {
    plan.push(`${plan.length + 1}. Quality: dz benchmark --all (L0 gate) → /bto-test (L1/L2 judges)`);
  }
  if (topics.includes('ci-cd')) {
    plan.push(`${plan.length + 1}. CI/CD: Use github-actions skill for pipeline setup`);
  }
  if (topics.includes('monitoring') || topics.includes('incident')) {
    plan.push(`${plan.length + 1}. Ops: observability skill for monitoring + incident-response for runbooks`);
  }
  plan.push(`${plan.length + 1}. Use your agent normally — skills auto-activate on matching tasks`);

  return { task, topics, skills, presets, toolkits, commands, installCommand, plan, pretrainFallback };
}

/**
 * Named skill-set presets.
 *
 * A {@link Preset} is a curated list of skill ids. `dz init --preset <name>`
 * uses it to narrow an install to just those skills.
 *
 * @packageDocumentation
 */
const meta = {
    name: 'meta',
    description: 'Development process — explore, research, problem-solving, design thinking, feature pipeline, knowledge extraction, codebase context, security scanning, whole-codebase audit, design-token contract, agent-loop authoring, owner-facing decision pages.',
    skills: [
        'explore',
        'goap-research-ed25519',
        'problem-solver-enhanced',
        'design-thinking',
        'feature-adr',
        'knowledge-extractor',
        'understand-anything-bridge',
        'agentshield-scan',
        'skill-crystallizer',
        'structured-reasoning',
        'reflection-loop',
        'context-window-management',
        'external-comms-gate',
        'capture-adr',
        'adversarial-verifier',
        'skill-advisor',
        'audit',
        'design-tokens',
        'loop-plan-author',
        'decision-mockups',
    ],
};
const qeEngineer = {
    name: 'qe-engineer',
    description: 'Quality engineering — test generation, coverage, chaos, defect prediction, QCSD swarms, code review, SFDIPOT.',
    skills: [
        'qe-test-generation',
        'qe-test-execution',
        'qe-coverage-analysis',
        'qe-quality-assessment',
        'qe-requirements-validation',
        'qe-defect-intelligence',
        'qe-iterative-loop',
        'qe-chaos-resilience',
        'qe-browser',
        'qe-code-intelligence',
        'qe-learning-optimization',
        'qe-visual-accessibility',
        'brutal-honesty-review',
        'six-thinking-hats',
        'sfdipot-product-factors',
        'qcsd-ideation-swarm',
        'qcsd-development-swarm',
        'qcsd-cicd-swarm',
        'qcsd-production-swarm',
        'qcsd-refinement-swarm',
    ],
};
const bto = {
    name: 'bto',
    description: 'Build-Benchmark-Test-Optimize pipeline.',
    skills: ['bto'],
    toolkit: '@dzhechkov/skills-bto',
};
const reasoning = {
    name: 'reasoning',
    description: 'Generic, stack-neutral reasoning & code-quality skills: root-cause investigation, SOLID/TDD, anti-LLM-mistake guidelines, AGENTS.md authoring.',
    skills: [
        'investigate',
        'solid',
        'karpathy-guidelines',
        'agents-md-creator',
    ],
};
const health = {
    name: 'health',
    description: 'Medical AI skills — diagnostics, drug interactions, clinical decision support.',
    toolkit: '@dzhechkov/health-advisor',
    skills: [
        'drug-interaction-checker',
        'clinical-diagnostic-reasoning',
        'lab-results',
        'pubmed-search',
        'clinical-decision-support',
        'nutrition-analyzer',
        'fitness-analyzer',
        'sleep-analyzer',
    ],
};
const keysarium = {
    name: 'keysarium',
    description: 'Full research toolkit — feature-adr, explore, presentation, reverse-engineering.',
    toolkit: '@dzhechkov/keysarium',
    skills: [
        'explore',
        'feature-adr',
        'knowledge-extractor',
        'problem-solver-enhanced',
        'analyst-manual-full',
        'goap-research-ed25519',
        'presentation-storyteller',
        'edu-site-generator',
        'transcript-site-generator',
    ],
};
const pReplicator = {
    name: 'p-replicator',
    description: 'AI-assisted product development — /replicate pipeline, reverse-engineering, SPARC PRD.',
    toolkit: '@dzhechkov/p-replicator',
    skills: [
        'explore',
        'problem-solver-enhanced',
        'knowledge-extractor',
        'brutal-honesty-review',
        'goap-research-ed25519',
        'reverse-engineering-unicorn',
        'sparc-prd-mini',
        'requirements-validator',
        'pipeline-forge',
        'cc-toolkit-generator-enhanced',
    ],
};
const featureAdr = {
    name: 'feature-adr',
    description: 'Full feature development pipeline — 11-step ADR-driven architecture + frontend design.',
    toolkit: '@dzhechkov/skills-feature-adr',
    skills: [
        'explore',
        'feature-adr',
        'knowledge-extractor',
        'problem-solver-enhanced',
        'frontend-design',
        'code-critic',
        'code-impl',
        'system-grill',
        'code-skills-creator',
    ],
};
const devops = {
    name: 'devops',
    description: 'DevOps skills — code review, security audit, testing, CI/CD, debugging, API design.',
    skills: [
        'api-design',
        'c4-architecture',
        'pr-review',
        'security-audit',
        'test-writer',
        'ci-fix',
        'codeql-fix',
        'database-review',
        'debugging',
        'frontend-implementation',
        'data-pipeline',
        'database-migration',
        'docker-compose',
        'github-actions',
        'incident-response',
        'problem-management',
        'kubernetes',
        'observability',
        'monorepo-management',
        'terraform',
        'git-conflict-resolve',
        'graphql-schema',
        'nginx-config',
        'playwright-testing',
        'redis-patterns',
        'retrospective',
        'risk-assessment',
        'provider-debug',
        'itsm-itil',
        'deploy-on-cloudru-vm',
    ],
};
const web3 = {
    name: 'web3',
    description: 'Web3/DeFi skills — blockchain RPC, wallet analytics, cross-chain swaps, identity, privacy, trading.',
    skills: [
        'quicknode',
        'zerion',
        'symbiosis',
        'ens-primary-name',
        'erc-8004',
        'veil',
        'neynar',
        'trails',
        'bankr',
        'siwa',
        'hydrex',
        'quotient',
    ],
};
const mcp = {
    name: 'mcp',
    description: 'MCP server skills — Brave Search, Exa, Gmail, Google Sheets/Calendar/Tasks, ClickUp, Reddit, Jina, Context7.',
    skills: [
        'agentdb-memory',
        'brave-search',
        'comfyui',
        'exa-search',
        'gmail',
        'google-sheets',
        'google-calendar',
        'google-tasks',
        'clickup',
        'reddit',
        'jina-reader',
        'context7',
        'git-mcp',
        'gitlab',
        'notion',
        'obsidian',
    ],
};
const academic = {
    name: 'academic',
    description: 'Academic skills — dissertation review, question generation, document checking for thesis defense (ГЭК).',
    skills: [
        'dissertation-review',
        'question-generator',
        'document-checker',
        'defense-evaluator',
        'answer-assessor',
    ],
};
/** Every preset, keyed by name. */
const news = {
    name: 'news',
    description: 'News & monitoring — source-cited digests on any topic plus lightweight delta watches.',
    skills: [
        'news-digest',
        'news-monitor',
        'goap-research-ed25519',
    ],
};
const pm = {
    name: 'pm',
    description: 'Product management — OST, prioritization (RICE/ICE), strategy, pricing, OKRs, metrics/A-B/cohort, roadmap, stakeholders, GTM, growth, market sizing.',
    skills: [
        'opportunity-solution-tree',
        'prioritize-features',
        'prioritization-frameworks',
        'product-strategy',
        'pricing-strategy',
        'brainstorm-okrs',
        'north-star-metric',
        'metrics-dashboard',
        'ab-test-analysis',
        'cohort-analysis',
        'outcome-roadmap',
        'stakeholder-map',
        'sprint-plan',
        'strategy-red-team',
        'gtm-strategy',
        'growth-loops',
        'beachhead-segment',
        'market-sizing',
    ],
};
export const PRESETS = {
    academic,
    meta,
    'qe-engineer': qeEngineer,
    bto,
    reasoning,
    health,
    keysarium,
    'p-replicator': pReplicator,
    'feature-adr': featureAdr,
    devops,
    web3,
    mcp,
    news,
    pm,
};
/** Every preset name. */
export const PRESET_NAMES = Object.keys(PRESETS);
/** Type guard: is `value` a known preset name? */
export function isPresetName(value) {
    return Object.prototype.hasOwnProperty.call(PRESETS, value);
}
/** Look up a preset by name, or `undefined` if there is no such preset. */
export function getPreset(name) {
    return isPresetName(name) ? PRESETS[name] : undefined;
}
/** Every preset. */
export function listPresets() {
    return Object.values(PRESETS);
}
//# sourceMappingURL=presets.js.map
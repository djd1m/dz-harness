/**
 * Our harness inventory — what we already have.
 *
 * @packageDocumentation
 */
/** All @dzhechkov/* package names. */
export const OUR_PACKAGES = [
    'core', 'memory', 'harness-core', 'harness-cli', 'harness-presets',
    'mcp-server-tools', 'adapter-claude', 'adapter-codex', 'adapter-opencode',
    'adapter-hermes', 'skills-meta', 'skills-qe', 'skills-bto',
    'skills-analyst-manual', 'skills-edu-site', 'skills-transcript-site',
    'skills-feature-adr', 'keysarium', 'keysarium-core', 'health-advisor',
    'p-replicator', 'evidence-wiki', 'sitedoc', 'scout',
];
/** Known skill IDs across all our packages. */
export const OUR_SKILL_IDS = new Set([
    'explore', 'feature-adr', 'knowledge-extractor', 'problem-solver-enhanced',
    'frontend-design', 'analyst-manual-full', 'goap-research-ed25519',
    'presentation-storyteller', 'edu-site-generator', 'transcript-site-generator',
    'bto', 'brutal-honesty-review', 'reverse-engineering-unicorn', 'sparc-prd-mini',
    'requirements-validator', 'pipeline-forge', 'cc-toolkit-generator-enhanced',
    // QE skills
    'qe-browser', 'qe-chaos-resilience', 'qe-code-intelligence',
    'qe-coverage-analysis', 'qe-defect-intelligence', 'qe-iterative-loop',
    'qe-learning-optimization', 'qe-quality-assessment', 'qe-requirements-validation',
    'qe-test-execution', 'qe-test-generation', 'qe-visual-accessibility',
    // Health skills
    'drug-interaction-checker', 'clinical-diagnostic-reasoning', 'lab-results',
    'pubmed-search', 'clinical-decision-support', 'nutrition-analyzer',
    'fitness-analyzer', 'sleep-analyzer',
    // Evidence wiki
    'concept-wiki-generator',
]);
/** Check if a skill ID is novel (not in our inventory). */
export function isNovelSkill(skillId) {
    return !OUR_SKILL_IDS.has(skillId);
}
//# sourceMappingURL=inventory.js.map
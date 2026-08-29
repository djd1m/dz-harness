/**
 * Repository analyzer — skill format detection + relevance scoring.
 *
 * @packageDocumentation
 */
import { isNovelSkill } from './inventory.js';
/** Format weight for relevance scoring. */
const FORMAT_WEIGHTS = {
    'agentskills-io': 1.0,
    'claude-plugin': 0.9,
    'claude-skills': 0.85,
    'codex-skills': 0.7,
    'mcp-server': 0.7,
    'generic-agent': 0.3,
};
/** Detect skill formats from repository topics and description. */
export function detectFormats(item) {
    const formats = [];
    const topics = new Set(item.topics.map((t) => t.toLowerCase()));
    const desc = (item.description ?? '').toLowerCase();
    if (topics.has('agentskills-io') || topics.has('agent-skills') || desc.includes('skill.md')) {
        formats.push('agentskills-io');
    }
    if (topics.has('claude-code-plugin') || desc.includes('plugin.json') || desc.includes('.claude-plugin')) {
        formats.push('claude-plugin');
    }
    if (topics.has('claude-code-skills') || topics.has('claude-code') || desc.includes('.claude/skills')) {
        formats.push('claude-skills');
    }
    if (topics.has('codex') || desc.includes('.agents/skills')) {
        formats.push('codex-skills');
    }
    if (topics.has('mcp-server') || topics.has('mcp') || desc.includes('mcp server')) {
        formats.push('mcp-server');
    }
    if (formats.length === 0 && (topics.has('ai-agent') || desc.includes('agent'))) {
        formats.push('generic-agent');
    }
    return formats;
}
/** Compute relevance score (0-100). */
export function computeRelevanceScore(formats, stars, daysSinceCommit, noveltyRatio) {
    const bestFormat = formats.reduce((max, f) => Math.max(max, FORMAT_WEIGHTS[f] ?? 0), 0);
    const formatScore = bestFormat * 40;
    const activityScore = Math.min(1, Math.log2(stars + 1) / 10) * 30;
    const recencyScore = (daysSinceCommit < 30 ? 1.0 : daysSinceCommit < 90 ? 0.7 : daysSinceCommit < 365 ? 0.3 : 0.1) * 20;
    const noveltyScore = Math.min(1, noveltyRatio) * 10;
    return Math.round(formatScore + activityScore + recencyScore + noveltyScore);
}
/** Determine recommendation based on score and stars. */
export function recommend(score, stars) {
    if (score >= 70)
        return 'integrate';
    if (score >= 40 && stars >= 50)
        return 'monitor';
    return 'skip';
}
/** Extract potential skill IDs from topics (heuristic). */
export function extractSkillHints(item) {
    return item.topics
        .filter((t) => !['agent-skills', 'claude-code', 'mcp-server', 'ai-harness', 'agentskills-io', 'claude-code-skills', 'claude-code-plugin'].includes(t))
        .map((t) => t.replace(/^skill-/, ''));
}
/** Analyze a GitHub search item into a RepoProfile. */
export function analyzeRepo(item) {
    const formats = detectFormats(item);
    const skillHints = extractSkillHints(item);
    const novelSkills = skillHints.filter(isNovelSkill);
    const noveltyRatio = skillHints.length > 0 ? novelSkills.length / skillHints.length : 0;
    const daysSinceCommit = Math.floor((Date.now() - new Date(item.pushed_at).getTime()) / 86400000);
    const score = computeRelevanceScore(formats, item.stargazers_count, daysSinceCommit, noveltyRatio);
    const now = new Date().toISOString();
    return {
        fullName: item.full_name,
        url: item.html_url,
        description: item.description ?? '',
        stars: item.stargazers_count,
        forks: item.forks_count,
        lastCommit: item.pushed_at,
        topics: item.topics,
        license: item.license?.spdx_id ?? null,
        skillFormats: formats,
        skillCount: formats.length > 0 ? 1 : 0, // conservative estimate without tree API
        novelSkills,
        relevanceScore: score,
        recommendation: recommend(score, item.stargazers_count),
        firstSeen: now,
        lastSeen: now,
    };
}
//# sourceMappingURL=analyzer.js.map
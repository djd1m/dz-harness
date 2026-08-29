/**
 * `@dzhechkov/scout` — GitHub ecosystem intelligence.
 *
 * @packageDocumentation
 */

export const SCOUT_VERSION = '0.1.0';

export type {
  GitHubSearchItem,
  IntelligenceReport,
  Recommendation,
  RepoProfile,
  ScanOptions,
  ScanResult,
  SkillFormat,
} from './types.js';

export { scanGitHub, buildSearchQuery } from './scanner.js';
export { analyzeRepo, computeRelevanceScore, detectFormats, recommend } from './analyzer.js';
export { generateReport } from './reporter.js';
export { OUR_PACKAGES, OUR_SKILL_IDS, isNovelSkill } from './inventory.js';
export { deepAnalyze } from './deep-analyzer.js';
export type { DeepAnalysisReport, DeepRepoAnalysis, DeepSkillAnalysis, GapEntry } from './deep-analyzer.js';
export { scanAllSources } from './sources/index.js';
export type { TaggedProfile, SourceTag, SourceStatus, SourceHealth } from './sources/index.js';
export { scanNpm } from './sources/npm.js';
export { scanHN } from './sources/hn.js';
export { scanMcpRegistry, parseMcpRegistryResponse } from './sources/mcp-registry.js';
export { scanGlama } from './sources/glama.js';
export { scanOssInsightTrending } from './sources/ossinsight.js';
export { scanSmithery } from './sources/smithery.js';
export { scanSemanticScholar } from './sources/semantic-scholar.js';
export { scanArxiv } from './sources/arxiv.js';
export { ScoutMemory } from './memory-store.js';
export type { ScanRecord, ScanDiff } from './memory-store.js';
export {
  createRateLimitState,
  getDelay,
  markRetry,
  markSuccess,
  shouldRetry,
  updateFromHeaders,
} from './rate-limiter.js';

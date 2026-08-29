/**
 * Core types for @dzhechkov/scout.
 *
 * @packageDocumentation
 */

/** Detected skill format in a repository. */
export type SkillFormat =
  | 'agentskills-io'
  | 'claude-plugin'
  | 'claude-skills'
  | 'codex-skills'
  | 'mcp-server'
  | 'generic-agent';

/** Recommendation for a discovered repository. */
export type Recommendation = 'integrate' | 'monitor' | 'skip';

/** A discovered and analyzed GitHub repository. */
export interface RepoProfile {
  readonly fullName: string;
  readonly url: string;
  readonly description: string;
  readonly stars: number;
  readonly forks: number;
  readonly lastCommit: string;
  readonly topics: readonly string[];
  readonly license: string | null;
  readonly skillFormats: readonly SkillFormat[];
  readonly skillCount: number;
  readonly novelSkills: readonly string[];
  readonly relevanceScore: number;
  readonly recommendation: Recommendation;
  readonly firstSeen: string;
  readonly lastSeen: string;
  /** Provenance tag for the source that discovered this repo (npm/github/…). */
  readonly source?: string | undefined;
}

/** Options for a scout scan. */
export interface ScanOptions {
  /** GitHub personal access token (env: GITHUB_TOKEN). */
  readonly token?: string | undefined;
  /** Topics to search for. */
  readonly topics?: readonly string[] | undefined;
  /** Only repos updated since this ISO date. */
  readonly since?: string | undefined;
  /** Maximum repos to return. */
  readonly maxResults?: number | undefined;
}

/** Raw GitHub search result item (subset of API response). */
export interface GitHubSearchItem {
  readonly full_name: string;
  readonly html_url: string;
  readonly description: string | null;
  readonly stargazers_count: number;
  readonly forks_count: number;
  readonly pushed_at: string;
  readonly topics: readonly string[];
  readonly license: { readonly spdx_id: string } | null;
  readonly default_branch: string;
}

/** Result of a full scan. */
export interface ScanResult {
  readonly repos: readonly RepoProfile[];
  readonly totalFound: number;
  readonly newSinceLastScan: number;
  readonly scannedAt: string;
  readonly topics: readonly string[];
}

/** Intelligence report structure. */
export interface IntelligenceReport {
  readonly generatedAt: string;
  readonly summary: {
    readonly totalScanned: number;
    readonly newDiscoveries: number;
    readonly integrate: number;
    readonly monitor: number;
    readonly skip: number;
  };
  readonly repos: readonly RepoProfile[];
  readonly markdown: string;
}

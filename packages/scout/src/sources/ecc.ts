/**
 * ECC source scanner — fetches skills from github.com/affaan-m/ECC.
 *
 * Unlike other sources that discover repos, this targets a single known repo
 * (ECC, 210K+ stars) and returns its skills as RepoProfiles for comparison
 * against the harness inventory.
 *
 * @packageDocumentation
 */

import type { RepoProfile, SkillFormat, Recommendation } from '../types.js';

const ECC_API = 'https://api.github.com/repos/affaan-m/ECC';
const ECC_SKILLS_API = 'https://api.github.com/repos/affaan-m/ECC/contents/skills';

interface EccScanOptions {
  /** Maximum skill directories to fetch. Default 100 (GitHub API limit per page). */
  readonly limit?: number;
}

/**
 * Scan ECC for skill inventory. Returns a single RepoProfile representing the
 * ECC repo with skill count and novel skills list.
 */
export async function scanEcc(options: EccScanOptions = {}): Promise<RepoProfile[]> {
  const headers: Record<string, string> = {
    'Accept': 'application/vnd.github.v3+json',
    'User-Agent': 'dz-scout',
  };
  const token = process.env.GITHUB_TOKEN;
  if (token) headers['Authorization'] = `Bearer ${token}`;

  // Fetch repo metadata
  let stars = 210000;
  let forks = 32000;
  let lastCommit = '2026-06-06';
  let description = 'Harness-native operator system for agentic AI development — 300+ skills, 64 agents, 84 commands';

  try {
    const repoRes = await fetch(ECC_API, { headers });
    if (repoRes.ok) {
      const repo = await repoRes.json() as { stargazers_count: number; forks_count: number; pushed_at: string; description: string };
      stars = repo.stargazers_count;
      forks = repo.forks_count;
      lastCommit = repo.pushed_at;
      if (repo.description) description = repo.description;
    }
  } catch { /* use defaults */ }

  // Fetch skill directories
  const skillNames: string[] = [];
  try {
    const skillsRes = await fetch(ECC_SKILLS_API, { headers });
    if (skillsRes.ok) {
      const entries = await skillsRes.json() as { name: string; type: string }[];
      for (const e of entries) {
        if (e.type === 'dir') skillNames.push(e.name);
        if (skillNames.length >= (options.limit ?? 100)) break;
      }
    }
  } catch { /* skill count will be 0 */ }

  const profile: RepoProfile = {
    fullName: 'affaan-m/ECC',
    url: 'https://github.com/affaan-m/ECC',
    description,
    stars,
    forks,
    lastCommit,
    topics: ['claude-code', 'ai-skills', 'agentic', 'coding-agent', 'operator-system'],
    license: 'MIT',
    skillFormats: ['agentskills-io', 'claude-skills'] as SkillFormat[],
    skillCount: skillNames.length,
    novelSkills: skillNames.slice(0, 20), // top 20 for display
    relevanceScore: 95, // high — massive, active, directly relevant
    recommendation: 'integrate' as Recommendation,
    firstSeen: '2026-03-15',
    lastSeen: new Date().toISOString().slice(0, 10),
  };

  return [profile];
}

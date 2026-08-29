/**
 * `dz import-ecc` — import skills from the ECC project (https://github.com/affaan-m/ECC).
 *
 * Fetches SKILL.md files from ECC's GitHub repo, maps the frontmatter to
 * agentskills.io format, deduplicates against existing skills, and writes
 * the imported skills to the target directory.
 *
 * @packageDocumentation
 */

import { existsSync, mkdirSync, writeFileSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/** Result of a single skill import. */
export interface ImportedSkill {
  readonly id: string;
  readonly status: 'imported' | 'skipped_duplicate' | 'skipped_error';
  readonly reason?: string;
}

/** Full import report. */
export interface ImportEccReport {
  readonly source: string;
  readonly totalFetched: number;
  readonly imported: number;
  readonly skippedDuplicate: number;
  readonly skippedError: number;
  readonly skills: readonly ImportedSkill[];
}

/** Options for the import. */
export interface ImportEccOptions {
  /** Directory containing existing skills to check for duplicates. */
  readonly existingSkillsDir: string;
  /** Directory to write imported skills into. */
  readonly outputDir: string;
  /** If true, overwrite existing skills. */
  readonly force?: boolean;
  /** Only import these skill IDs (filter). */
  readonly select?: readonly string[];
  /** Maximum number of skills to import (default: all). */
  readonly limit?: number;
  /** Path to a local ECC clone (skip GitHub fetch). */
  readonly localPath?: string;
}

const ECC_SKILLS_API = 'https://api.github.com/repos/affaan-m/ECC/contents/skills';
const ECC_RAW_BASE = 'https://raw.githubusercontent.com/affaan-m/ECC/main/skills';

/**
 * Map ECC YAML frontmatter to agentskills.io format.
 *
 * ECC format:
 * ```yaml
 * name: skill-name
 * description: long description
 * origin: ECC
 * tools: Read, Write, Bash
 * ```
 *
 * agentskills.io format:
 * ```yaml
 * name: skill-name
 * description: long description
 * trust_tier: 0
 * trust_tier_label: "Community (imported from ECC)"
 * ```
 */
function mapFrontmatter(eccContent: string): string {
  // Extract frontmatter
  const fmMatch = eccContent.match(/^---\s*\n([\s\S]*?)\n---\s*\n/);
  if (!fmMatch) return eccContent; // No frontmatter — return as-is

  const fmYaml = fmMatch[1] ?? '';
  const body = eccContent.slice(fmMatch[0]?.length ?? 0);

  // Parse fields from YAML (simple key: value parsing, no library needed)
  const nameMatch = fmYaml.match(/^name:\s*(.+)$/m);
  const descMatch = fmYaml.match(/^description:\s*([\s\S]*?)(?=\n\w+:|$)/m);

  const name = nameMatch?.[1]?.trim() ?? 'unknown';
  let desc = descMatch?.[1]?.trim() ?? '';
  // Collapse multi-line description
  desc = desc.replace(/\n\s+/g, ' ');

  // Build agentskills.io frontmatter
  const newFm = [
    '---',
    `name: "${name}"`,
    `description: >`,
    `  ${desc}`,
    `trust_tier: 0`,
    `trust_tier_label: "Community (imported from ECC)"`,
    `source: "https://github.com/affaan-m/ECC/tree/main/skills/${name}"`,
    '---',
  ].join('\n');

  return newFm + '\n' + body;
}

/**
 * List ECC skill directories from a local clone.
 */
function listLocalSkills(localPath: string): string[] {
  const skillsDir = join(localPath, 'skills');
  if (!existsSync(skillsDir)) return [];
  return readdirSync(skillsDir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort();
}

/**
 * Read a skill from a local ECC clone.
 */
function readLocalSkill(localPath: string, skillId: string): string | null {
  const skillMd = join(localPath, 'skills', skillId, 'SKILL.md');
  if (!existsSync(skillMd)) return null;
  return readFileSync(skillMd, 'utf-8');
}

/**
 * Import skills from ECC.
 *
 * Supports two modes:
 * 1. Local clone: `--local-path /path/to/ECC` (fast, no network)
 * 2. GitHub API: fetches from api.github.com (rate-limited, requires no clone)
 */
export async function importEcc(options: ImportEccOptions): Promise<ImportEccReport> {
  const existing = new Set<string>();
  if (existsSync(options.existingSkillsDir)) {
    for (const d of readdirSync(options.existingSkillsDir, { withFileTypes: true })) {
      if (d.isDirectory()) existing.add(d.name);
    }
  }

  let skillIds: string[];

  if (options.localPath) {
    // Local clone mode
    skillIds = listLocalSkills(options.localPath);
  } else {
    // GitHub API mode — fetch directory listing
    const res = await fetch(ECC_SKILLS_API, {
      headers: { 'Accept': 'application/vnd.github.v3+json', 'User-Agent': 'dz-harness-hub' },
    });
    if (!res.ok) {
      return {
        source: 'github.com/affaan-m/ECC',
        totalFetched: 0, imported: 0, skippedDuplicate: 0, skippedError: 1,
        skills: [{ id: 'api', status: 'skipped_error', reason: `GitHub API ${res.status}: ${res.statusText}` }],
      };
    }
    const entries = (await res.json()) as { name: string; type: string }[];
    skillIds = entries.filter((e) => e.type === 'dir').map((e) => e.name).sort();
  }

  // Apply filters
  if (options.select) {
    const sel = new Set(options.select);
    skillIds = skillIds.filter((id) => sel.has(id));
  }
  if (options.limit) {
    skillIds = skillIds.slice(0, options.limit);
  }

  const results: ImportedSkill[] = [];

  for (const id of skillIds) {
    // Check for duplicates
    if (existing.has(id) && !options.force) {
      results.push({ id, status: 'skipped_duplicate', reason: `Already exists in ${options.existingSkillsDir}` });
      continue;
    }

    try {
      let content: string | null;

      if (options.localPath) {
        content = readLocalSkill(options.localPath, id);
      } else {
        // Fetch from GitHub raw
        const url = `${ECC_RAW_BASE}/${id}/SKILL.md`;
        const res = await fetch(url, { headers: { 'User-Agent': 'dz-harness-hub' } });
        if (!res.ok) {
          results.push({ id, status: 'skipped_error', reason: `HTTP ${res.status}` });
          continue;
        }
        content = await res.text();
      }

      if (!content) {
        results.push({ id, status: 'skipped_error', reason: 'No SKILL.md found' });
        continue;
      }

      // Map frontmatter
      const mapped = mapFrontmatter(content);

      // Write to output directory
      const outDir = join(options.outputDir, id);
      mkdirSync(outDir, { recursive: true });
      writeFileSync(join(outDir, 'SKILL.md'), mapped, 'utf-8');

      results.push({ id, status: 'imported' });
    } catch (err) {
      results.push({ id, status: 'skipped_error', reason: String(err) });
    }
  }

  return {
    source: options.localPath ?? 'github.com/affaan-m/ECC',
    totalFetched: skillIds.length,
    imported: results.filter((r) => r.status === 'imported').length,
    skippedDuplicate: results.filter((r) => r.status === 'skipped_duplicate').length,
    skippedError: results.filter((r) => r.status === 'skipped_error').length,
    skills: results,
  };
}

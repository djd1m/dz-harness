/**
 * 4-axis risk scoring for AI agent tool calls.
 *
 * Inspired by ECC 2.0 (https://github.com/affaan-m/ECC) Rust control-plane.
 * Re-implemented in TypeScript for harness --enrich enrichment.
 *
 * Axes:
 *   1. Base tool risk — inherent danger of the tool type
 *   2. File sensitivity — whether skill targets secrets/infra files
 *   3. Blast radius — scope of potential changes
 *   4. Irreversibility — whether actions can be undone
 *
 * @packageDocumentation
 */

/** Risk score result with per-axis breakdown. */
export interface RiskScore {
  /** Combined score 0.0–1.0 (higher = more risky). */
  readonly total: number;
  /** Risk level derived from total. */
  readonly level: 'low' | 'medium' | 'high' | 'critical';
  /** Per-axis breakdown. */
  readonly axes: {
    readonly base_tool: number;
    readonly file_sensitivity: number;
    readonly blast_radius: number;
    readonly irreversibility: number;
  };
}

/** Configurable thresholds for risk levels. */
export interface RiskThresholds {
  readonly medium: number;  // default 0.3
  readonly high: number;    // default 0.5
  readonly critical: number; // default 0.7
}

const DEFAULT_THRESHOLDS: RiskThresholds = {
  medium: 0.3,
  high: 0.5,
  critical: 0.7,
};

// ── Axis 1: Base tool risk ──────────────────────────────────

const TOOL_RISK: Record<string, number> = {
  bash: 0.20,
  write: 0.15,
  multiedit: 0.15,
  edit: 0.10,
  read: 0.05,
  glob: 0.03,
  grep: 0.03,
  agent: 0.08,
  mcp: 0.12,
};

function baseToolRisk(skillContent: string): number {
  const lower = skillContent.toLowerCase();
  let maxRisk = 0.05;
  for (const [tool, risk] of Object.entries(TOOL_RISK)) {
    if (lower.includes(tool)) {
      maxRisk = Math.max(maxRisk, risk);
    }
  }
  return maxRisk;
}

// ── Axis 2: File sensitivity ────────────────────────────────

const SENSITIVE_PATTERNS = [
  '.env', 'api_key', 'secret', 'password', 'credential',
  'id_rsa', '.pem', '.key', 'token', 'auth',
];

const INFRA_PATTERNS = [
  'package.json', 'dockerfile', 'docker-compose', '.github/workflows',
  'migration', 'terraform', 'k8s', 'deployment', 'helm',
];

function fileSensitivity(skillContent: string): number {
  const lower = skillContent.toLowerCase();
  let score = 0;
  for (const pat of SENSITIVE_PATTERNS) {
    if (lower.includes(pat)) { score = Math.max(score, 0.25); break; }
  }
  for (const pat of INFRA_PATTERNS) {
    if (lower.includes(pat)) { score = Math.max(score, 0.15); break; }
  }
  return score;
}

// ── Axis 3: Blast radius ────────────────────────────────────

const WIDE_SCOPE_PATTERNS = [
  '**/*', '-rf', '-r ', '--recursive', 'find .', 'grep -r',
  'sed -i', 'awk', 'xargs',
];

function blastRadius(skillContent: string): number {
  const lower = skillContent.toLowerCase();
  let score = 0.05;
  for (const pat of WIDE_SCOPE_PATTERNS) {
    if (lower.includes(pat)) { score = Math.max(score, 0.20); break; }
  }
  // Check for multi-file operations mentioned
  if (/\d{2,}\s*(files?|modules?)/.test(lower)) {
    score = Math.max(score, 0.15);
  }
  return score;
}

// ── Axis 4: Irreversibility ─────────────────────────────────

const DESTRUCTIVE_PATTERNS = [
  'rm -rf', 'rm -f', 'drop table', 'drop database', 'truncate',
  'git push --force', 'git reset --hard', 'git clean -f',
  'format disk', 'destroy', 'delete permanently',
];

function irreversibility(skillContent: string): number {
  const lower = skillContent.toLowerCase();
  let score = 0;
  for (const pat of DESTRUCTIVE_PATTERNS) {
    if (lower.includes(pat)) { score = Math.max(score, 0.25); break; }
  }
  return score;
}

// ── Combined scoring ────────────────────────────────────────

/**
 * Compute 4-axis risk score for a skill based on its SKILL.md content.
 */
export function computeRiskScore(
  skillContent: string,
  thresholds: RiskThresholds = DEFAULT_THRESHOLDS,
): RiskScore {
  const axes = {
    base_tool: baseToolRisk(skillContent),
    file_sensitivity: fileSensitivity(skillContent),
    blast_radius: blastRadius(skillContent),
    irreversibility: irreversibility(skillContent),
  };

  const total = Math.min(
    1.0,
    axes.base_tool + axes.file_sensitivity + axes.blast_radius + axes.irreversibility,
  );

  let level: RiskScore['level'];
  if (total >= thresholds.critical) level = 'critical';
  else if (total >= thresholds.high) level = 'high';
  else if (total >= thresholds.medium) level = 'medium';
  else level = 'low';

  return { total, level, axes };
}

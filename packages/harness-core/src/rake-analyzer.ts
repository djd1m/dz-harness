/**
 * MR rake analyzer (feature mr-rake-analyzer, ADR-001).
 *
 * Mines a project's review corpus for RECURRING mistakes ("rakes") and closes them into self-learning.
 * The parse/normalize/detect/render functions are PURE + deterministic (sorted, no clock/random) so the
 * same corpus yields a byte-identical report; the load/scan helpers do disk I/O with TOP-LEVEL node:fs
 * imports (harness-core is ESM — a lazy require() is undefined at runtime; the R1 footgun).
 *
 * Signature is DETERMINISTIC (ADR-001 §1): a rule table of known rake classes, with an unmatched finding
 * falling to a normalized-text bucket so novel recurrences still cluster. LLM classification is an optional
 * amplifier, never in this core.
 *
 * SAFETY PROPERTY (ADR-001 §3, load-bearing): a finding whose signature appears in fewer than
 * `thresholds.candidate` DISTINCT sources is a one-off — it is NEVER a rake and never reaches teach/critic.
 */

import { existsSync, readFileSync, readdirSync, statSync, realpathSync } from 'node:fs';
import { join } from 'node:path';

export type Severity = 'blocker' | 'high' | 'medium' | 'low' | 'unknown';
const SEVERITY_RANK: Record<Severity, number> = { blocker: 4, high: 3, medium: 2, low: 1, unknown: 0 };

export interface Finding {
  readonly source: string;      // artifact id (e.g. features/<slug>/08_qe_report.md)
  readonly severity: Severity;
  readonly text: string;
  readonly site?: string;       // file:line if present
}

export interface Rake {
  readonly signature: string;
  readonly label: string;
  readonly sources: readonly string[];    // DISTINCT sources (sorted)
  readonly count: number;                 // = sources.length
  readonly severity: Severity;            // max across the group
  readonly examples: readonly Finding[];  // up to 3, sorted
  readonly status: 'candidate' | 'confirmed';
}

export interface RakeThresholds { readonly candidate: number; readonly confirmed: number }
export const DEFAULT_RAKE_THRESHOLDS: RakeThresholds = { candidate: 2, confirmed: 3 };

export interface RakeReport {
  readonly rakes: readonly Rake[];
  readonly totalFindings: number;
  readonly oneOffs: number;               // signatures below the candidate threshold (dropped)
}

export interface RakeSignature { readonly id: string; readonly label: string; readonly patterns: readonly RegExp[] }

/**
 * Known rake classes (extensible, data-only). Seeded from the classes that actually recur in this repo's
 * QE reports — that IS the dogfood. First match in order wins; unmatched → normalized-text bucket.
 */
export const RAKE_SIGNATURES: readonly RakeSignature[] = [
  { id: 'esm-require-footgun', label: 'ESM lazy require() undefined at runtime', patterns: [/require\(['"]node:/, /\besm\b.*require/i, /lazy require/i] },
  { id: 'untested-adr-property', label: 'ADR-named safety property left untested', patterns: [/load-bearing.*(untested|not\s+tested|no\s+test)/i, /adr.*names.*(property|test)/i, /safety property.*test/i] },
  { id: 'claim-check-fp', label: 'claim-check false positive / untagged count', patterns: [/claim-check.*(false positive|\bfp\b)/i, /untagged.*(count|claim)/i, /metric term/i] },
  // "traversal" alone over-matches (AST/tree traversal); require a filesystem-scope token to CO-OCCUR
  // (or a literal `../`) — cross-model QE caught the over-match.
  { id: 'path-traversal', label: 'path not constrained to the repo (traversal)', patterns: [/\.\.\//, /(?=.*travers)(?=.*(repo|root|\bpath\b|director|\/etc\/))/i, /escapes.{0,12}repo/i] },
  { id: 'silent-drop-or-inject', label: 'silent drop / silent injection (no report)', patterns: [/silent(ly)?\s+(drop|inject|discard|dropped)/i, /no silent (injection|caps|drop)/i] },
  { id: 'swallow-generic-exception', label: 'generic except/catch swallows real bugs', patterns: [/except\s+Exception/i, /catch.*swallow/i, /generic (exception|catch)/i] },
  { id: 'determinism-hole', label: 'non-deterministic output (unsorted/clock/random)', patterns: [/non-determinis/i, /determinism hole/i, /unsorted|not sorted/i] },
  { id: 'cross-model-self-qe', label: 'coder self-QE instead of cross-model', patterns: [/self-qe/i, /coder.*(review|qe).*(itself|self)/i, /cross-model/i] },
  { id: 'malformed-input-bypass', label: 'malformed input bypasses validation', patterns: [/array.*(pass|bypass)/i, /malformed.*(bypass|pass|manifest)/i, /typeof.*object/i] },
];
// Deep-freeze so an external caller can't inject a `/g`-flag regex whose `.test()` mutates lastIndex and
// makes signatureOf non-deterministic (cross-model QE). None of the patterns above use `g`/`y`.
for (const s of RAKE_SIGNATURES) { Object.freeze(s.patterns); Object.freeze(s); }
Object.freeze(RAKE_SIGNATURES);

const byStr = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);
const uniqSorted = (xs: readonly string[]): string[] => [...new Set(xs)].sort(byStr);
const maxSeverity = (a: Severity, b: Severity): Severity => (SEVERITY_RANK[a] >= SEVERITY_RANK[b] ? a : b);

const STOPWORDS = new Set(['the', 'a', 'an', 'and', 'or', 'to', 'of', 'in', 'on', 'is', 'it', 'that', 'this', 'for', 'with', 'as', 'at', 'by', 'be', 'not', 'no', 'its', 'when', 'if', 'was', 'are', 'но', 'и', 'в', 'на', 'что', 'это', 'не', 'из', 'за', 'для']);

/** Normalize a finding's text to a stable clustering key: lowercase, strip sites/numbers/punct, top significant words. */
export function normalizeText(text: string): string {
  const cleaned = text
    .toLowerCase()
    .replace(/[\w./-]+:\d+/g, ' ')          // drop file:line
    .replace(/`[^`]*`/g, ' ')               // drop code literals
    .replace(/[^a-zа-я\s]/gi, ' ');         // drop digits/punct
  const words = cleaned.split(/\s+/).filter((w) => w.length >= 4 && !STOPWORDS.has(w));
  return uniqSorted(words).slice(0, 6).join(' ');
}

const SEV_MAP: Record<string, Severity> = {
  blocker: 'blocker', critical: 'blocker', crit: 'blocker',
  high: 'high', hi: 'high',
  medium: 'medium', med: 'medium',
  low: 'low', nit: 'low',
};
const toSeverity = (raw: string): Severity => SEV_MAP[raw.trim().toLowerCase()] ?? 'unknown';
const SITE_RE = /([\w./-]+\.(?:ts|js|tsx|jsx|py|go|md|json|yml|yaml):\d+)/;

/** The signature of a finding: first matching rule, else the normalized-text bucket. */
export function signatureOf(finding: Finding): { id: string; label: string } {
  for (const s of RAKE_SIGNATURES) {
    if (s.patterns.some((p) => p.test(finding.text))) return { id: s.id, label: s.label };
  }
  const key = normalizeText(finding.text);
  if (key !== '') return { id: `text:${key}`, label: key };
  // No significant words (code-only / very short). Key on the LITERAL text so two DIFFERENT such findings
  // never merge into a false "unclassified ×N" rake (cross-model QE) — but two IDENTICAL ones still cluster.
  const literal = finding.text.toLowerCase().replace(/\s+/g, ' ').trim().slice(0, 80);
  return { id: `literal:${literal}`, label: literal === '' ? 'unclassified finding' : literal };
}

/**
 * Parse one markdown artifact into findings. Handles (a) severity table rows `| … | High | <text> | … |`,
 * (b) inline markers `[High]` / `**High —**` / `Sev — <text>`. Deterministic; unknown formats yield nothing.
 */
export function extractFindings(markdown: string, source: string): Finding[] {
  const out: Finding[] = [];
  const push = (severity: Severity, text: string): void => {
    const t = text.replace(/\s+/g, ' ').trim();
    if (t.length < 8) return;                                  // too short to be a finding
    const site = SITE_RE.exec(t)?.[1];
    out.push(site ? { source, severity, text: t, site } : { source, severity, text: t });
  };
  for (const line of markdown.split('\n')) {
    // (a) table row: | ... | <sev> | <finding> | ...
    const cells = line.includes('|') ? line.split('|').map((c) => c.trim()) : null;
    if (cells && cells.length >= 4) {
      const sevCell = cells.find((c) => SEV_MAP[c.toLowerCase()] !== undefined);
      if (sevCell) {
        const sevIdx = cells.indexOf(sevCell);
        const finding = cells.slice(sevIdx + 1).find((c) => c.length >= 8 && !/^-+$/.test(c));
        if (finding) { push(toSeverity(sevCell), finding); continue; }
      }
    }
    // (b) inline `[High] text` / `**High —** text` / `- High: text`. The bracketed form `[High] text`
    // needs no separator (the brackets delimit); the bare form `High: text` requires one so prose like
    // "high latency" doesn't register (cross-model QE: a missing separator silently dropped findings).
    const bracketed = /^[\s\-*>]*\**\[(blocker|critical|high|medium|med|low)\]\**\s*[—:\-]?\s*(.+)$/i.exec(line);
    const bare = /^[\s\-*>]*\**(blocker|critical|high|medium|med|low)\**\s*[—:]\s*(.+)$/i.exec(line);
    const m = bracketed ?? bare;
    if (m && m[1] && m[2]) push(toSeverity(m[1]), m[2]);
  }
  return out;
}

/**
 * Detect rakes: group findings by signature, count DISTINCT sources, keep only groups at/above the candidate
 * threshold (a below-threshold group is a one-off, NEVER a rake — the load-bearing anti-noise property).
 * PURE + deterministic (ADR-001 §1): rakes sorted by (count desc, severity desc, signature asc).
 */
export function detectRakes(findings: readonly Finding[], thresholds: RakeThresholds = DEFAULT_RAKE_THRESHOLDS): RakeReport {
  const groups = new Map<string, { label: string; findings: Finding[] }>();
  for (const f of findings) {
    const sig = signatureOf(f);
    const g = groups.get(sig.id);
    if (g) g.findings.push(f);
    else groups.set(sig.id, { label: sig.label, findings: [f] });
  }

  const rakes: Rake[] = [];
  let oneOffs = 0;
  for (const [signature, g] of groups) {
    const sources = uniqSorted(g.findings.map((f) => f.source));
    const count = sources.length;
    if (count < thresholds.candidate) { oneOffs++; continue; }
    const severity = g.findings.reduce<Severity>((m, f) => maxSeverity(m, f.severity), 'unknown');
    const examples = [...g.findings]
      .sort((a, b) => SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity] || byStr(a.source, b.source))
      .slice(0, 3);
    rakes.push({ signature, label: g.label, sources, count, severity, examples, status: count >= thresholds.confirmed ? 'confirmed' : 'candidate' });
  }
  rakes.sort((a, b) => b.count - a.count || SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity] || byStr(a.signature, b.signature));
  return { rakes, totalFindings: findings.length, oneOffs };
}

/** Human render of the rake report. Deterministic. */
export function renderRakeReport(report: RakeReport): string {
  if (report.rakes.length === 0) {
    return `mr-rakes: no recurring rakes (${report.totalFindings} finding(s), ${report.oneOffs} one-off signature(s) below threshold).`;
  }
  const lines = [`mr-rakes: ${report.rakes.length} rake(s) from ${report.totalFindings} finding(s) (${report.oneOffs} one-off(s) dropped):`, ''];
  for (const r of report.rakes) {
    lines.push(`  [${r.status}] ${r.severity.toUpperCase()} ×${r.count} — ${r.label}  (${r.signature})`);
    lines.push(`      sources: ${r.sources.join(', ')}`);
  }
  return lines.join('\n');
}

/** The teachable rule text for a rake (fed to `dz teach`). Deterministic. */
export function rakeAsLesson(rake: Rake): string {
  return `Project rake (recurred in ${rake.count} reviews): ${rake.label}. First seen: ${rake.examples[0]?.site ?? rake.sources[0]}. Watch for this class before it ships again.`;
}

/** Severity → teach reward. Higher-severity rakes are higher-signal lessons. */
export function rakeReward(rake: Rake): number {
  return ({ blocker: 0.95, high: 0.9, medium: 0.8, low: 0.7, unknown: 0.7 } as const)[rake.severity];
}

/** Render the CONFIRMED rakes as a project-critic SKILL.md section (sink B). Deterministic; confirmed only. */
export function renderCriticSection(report: RakeReport): string {
  const confirmed = report.rakes.filter((r) => r.status === 'confirmed');
  const lines = [
    '## Recurring mistakes (auto-mined by `dz mr-rakes`)',
    '',
    confirmed.length === 0
      ? '_No confirmed recurring rakes yet._'
      : 'These classes of mistake have recurred across this project\'s reviews. Flag them before they ship again:',
    '',
  ];
  for (const r of confirmed) {
    lines.push(`- **${r.label}** (${r.severity}, ×${r.count}) — e.g. ${r.examples[0]?.site ?? r.sources[0]}.`);
  }
  return lines.join('\n');
}

// ── Thin I/O (top-level fs; never throws) ────────────────────────────────────────────────────────────

/** Find review artifacts: each `features/<slug>/08_qe_report.md` plus any `REVIEW`-named markdown. Sorted. */
export function findReviewArtifacts(repoRoot: string): string[] {
  if (typeof repoRoot !== 'string' || repoRoot === '') return [];   // fail-open on bad runtime input (cross-model QE)
  const candidates: string[] = [];
  const featuresDir = join(repoRoot, 'features');
  try {
    if (existsSync(featuresDir)) {
      for (const slug of readdirSync(featuresDir)) {
        const qe = join(featuresDir, slug, '08_qe_report.md');
        if (existsSync(qe)) candidates.push(`features/${slug}/08_qe_report.md`);
      }
    }
  } catch { /* ignore */ }
  // Shallow scan of the repo root for REVIEW-named markdown (mr-review outputs land there).
  try {
    for (const entry of readdirSync(repoRoot)) {
      if (/REVIEW.*\.md$/i.test(entry)) {
        try { if (statSync(join(repoRoot, entry)).isFile()) candidates.push(entry); } catch { /* ignore */ }
      }
    }
  } catch { /* ignore */ }

  // Dedupe by PHYSICAL identity (realpath), not path string — two paths (e.g. a symlinked feature dir)
  // pointing at ONE file must count as ONE source, else a single review fakes a rake (cross-model QE:
  // the real load-bearing breach). Keep the first (sorted) relative path per physical file.
  const seenReal = new Set<string>();
  const out: string[] = [];
  for (const rel of uniqSorted(candidates)) {
    let real: string;
    try { real = realpathSync(join(repoRoot, rel)); } catch { real = join(repoRoot, rel); }
    if (seenReal.has(real)) continue;
    seenReal.add(real);
    out.push(rel);
  }
  return out;
}

/** Analyze the whole repo corpus. Impure wrapper: find artifacts → extract → detect. Never throws. */
export function analyzeCorpus(repoRoot: string, thresholds: RakeThresholds = DEFAULT_RAKE_THRESHOLDS): RakeReport {
  const findings: Finding[] = [];
  for (const rel of findReviewArtifacts(repoRoot)) {
    try {
      const md = readFileSync(join(repoRoot, rel), 'utf8');
      findings.push(...extractFindings(md, rel));
    } catch { /* skip unreadable artifact */ }
  }
  return detectRakes(findings, thresholds);
}

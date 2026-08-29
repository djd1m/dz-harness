/**
 * Pure extraction, rendering, budget measurement, and drift detection for the
 * always-on policy projection written to the root AGENTS.md.
 *
 * Callers own filesystem I/O. Keeping this module string-in/string-out makes
 * the layer-1 drift guard deterministic and usable from both tests and CLI.
 */

import { createHash } from 'node:crypto';

import { POLICY_BLOCK_BEGIN, POLICY_BLOCK_END } from '@dzhechkov/core';

export interface PolicySource {
  readonly id: string;
  readonly file: string;
  readonly heading: string;
  readonly why: string;
  /** Clause whose loss would turn the policy into a slogan rather than a rule. */
  readonly operativeClause: string;
}

/** Ordered by cold-start value; this order is also the deterministic emit order. */
export const POLICY_SOURCES: readonly PolicySource[] = [
  {
    id: 'integrity-rule',
    file: 'CLAUDE.md',
    heading: 'Integrity Rule (ABSOLUTE)',
    why: 'Prevents fabricated evidence and unmeasured claims from a fresh runtime.',
    operativeClause: 'measure before asserting',
  },
  {
    id: 'verify-before-claiming',
    file: 'CLAUDE.md',
    heading: 'Verify before claiming',
    why: 'Requires execution evidence instead of a prediction that work passes.',
    operativeClause: 'verify before claiming success',
  },
  {
    id: 'test-execution-no-watch',
    file: 'CLAUDE.md',
    heading: 'Test execution: never watch',
    why: 'A watch-mode test run hangs an unattended coding session.',
    operativeClause: 'npm test -- --run',
  },
  {
    id: 'data-protection',
    file: 'CLAUDE.md',
    heading: 'Data protection',
    why: 'Protects persistent QE and database state from destructive cleanup.',
    operativeClause: 'without confirmation',
  },
  {
    id: 'fixes-through-pipeline',
    file: '.claude/rules/feature-adr-conventions.md',
    heading: 'Fixes go through the pipeline',
    why: 'Preserves the framing checkpoint for fixes and selects independent QE up front.',
    operativeClause: 'ultracode or plain?',
  },
  {
    id: 'publish-gate',
    file: '.claude/rules/feature-adr-conventions.md',
    heading: 'Publish gate',
    why: 'Prevents publishing an unsettled disk version before independent verification lands.',
    operativeClause: 'independent round with no blockers',
  },
  {
    id: 'readme-first',
    file: 'CLAUDE.md',
    heading: 'README-first',
    why: 'Keeps each changed package and the repository documentation current before a bump.',
    operativeClause: 'in the SAME change',
  },
  {
    id: 'cross-family-qe',
    file: '.claude/rules/feature-adr-ultracode.md',
    heading: 'Cross-family QE',
    why: 'Prevents the model family that wrote code from certifying its own work.',
    operativeClause: 'FAMILY, not host',
  },
  {
    id: 'cost-of-detection-ladder',
    file: '.claude/rules/feature-adr-conventions.md',
    heading: 'Cost-of-detection ladder',
    why: 'Places deterministic checks at the earliest reliable layer instead of reviewer memory.',
    operativeClause: 'strongest layer that can express it',
  },
] as const;

export interface PolicyBlock {
  readonly id: string;
  readonly file: string;
  readonly heading: string;
  /** Verbatim anchor body after the documented minimal whitespace normalization. */
  readonly text: string;
  readonly sha: string;
}

export interface ExtractPolicyBlocksResult {
  readonly blocks: readonly PolicyBlock[];
  /** Registry ids whose source is absent/null or whose begin/end anchor is malformed. */
  readonly missing: readonly string[];
}

export type PolicyDriftStatus = 'ok' | 'stale' | 'missing-stamp' | 'missing-anchor' | 'orphan-stamp';

export interface PolicyDriftFinding {
  readonly id: string;
  readonly file: string;
  readonly status: PolicyDriftStatus;
  readonly expectedSha: string | null;
  readonly actualSha: string | null;
}

export interface PolicyDriftResult {
  readonly applicable: boolean;
  readonly findings: readonly PolicyDriftFinding[];
}

/** MEASURED 2026-08-18, codex-cli 0.147.0, project_doc_max_bytes unset: codex debug prompt-input included exactly 32768 bytes of a 414013-byte AGENTS.md and truncated mid-line with no notice. */
export const CODEX_PROJECT_DOC_MAX_BYTES = 32_768;
export const AGENTS_MD_BUDGET_WARN_FRACTION = 0.9;

export interface AgentsMdBudget {
  readonly bytes: number;
  readonly cap: number;
  /** Percentage in the human convention, e.g. 50 means half the cap. */
  readonly pct: number;
  readonly overflow: boolean;
  /** UTF-8 byte offset immediately after the policy END marker, or -1 when absent. */
  readonly policyBlockEndsAtByte: number;
}

const POLICY_STAMP = /^<!-- dz:policy id=([a-z0-9-]+) src=([^\s]+) sha=([a-f0-9]{12}) -->$/gm;

export function normalizePolicyText(text: string): string {
  return text
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.replace(/[ \t]+$/g, ''))
    .join('\n')
    .trim();
}

export function policyTextSha(text: string): string {
  return createHash('sha256').update(normalizePolicyText(text), 'utf8').digest('hex').slice(0, 12);
}

function anchorPair(id: string): { begin: string; end: string } {
  return { begin: `<!-- dz:policy id=${id} -->`, end: '<!-- dz:policy end -->' };
}

export function extractPolicyBlocks(
  files: ReadonlyMap<string, string | null>,
  sources: readonly PolicySource[] = POLICY_SOURCES,
): ExtractPolicyBlocksResult {
  const blocks: PolicyBlock[] = [];
  const missing: string[] = [];
  for (const source of sources) {
    const raw = files.get(source.file);
    if (typeof raw !== 'string') {
      missing.push(source.id);
      continue;
    }
    const { begin, end } = anchorPair(source.id);
    const beginIndex = raw.indexOf(begin);
    const secondBegin = beginIndex === -1 ? -1 : raw.indexOf(begin, beginIndex + begin.length);
    const endIndex = beginIndex === -1 ? -1 : raw.indexOf(end, beginIndex + begin.length);
    const nestedBegin = beginIndex === -1 ? -1 : raw.indexOf('<!-- dz:policy id=', beginIndex + begin.length);
    if (beginIndex === -1 || secondBegin !== -1 || endIndex === -1 || (nestedBegin !== -1 && nestedBegin < endIndex)) {
      missing.push(source.id);
      continue;
    }
    const text = normalizePolicyText(raw.slice(beginIndex + begin.length, endIndex));
    if (text.length === 0) {
      missing.push(source.id);
      continue;
    }
    blocks.push({ id: source.id, file: source.file, heading: source.heading, text, sha: policyTextSha(text) });
  }
  return { blocks, missing };
}

export function renderPolicySections(
  blocks: readonly PolicyBlock[],
  sources: readonly PolicySource[] = POLICY_SOURCES,
): readonly string[] {
  const headingById = new Map(sources.map((source) => [source.id, source.heading]));
  return blocks.map((block) => {
    const heading = headingById.get(block.id) ?? block.heading;
    return `<!-- dz:policy id=${block.id} src=${block.file} sha=${block.sha} -->\n## ${heading}\n\n${block.text}\n\nCanonical: ${block.file}`;
  });
}

/**
 * Has this repository OPTED IN to policy sync? The `dz:policies` fence in `AGENTS.md` is the only
 * durable on-disk signal that `dz agents-sync` was ever run here. Keeping the marker knowledge in
 * this module means no caller has to re-spell the literal (a second spelling is a second surface).
 */
export function hasPolicyFence(fileText: string | null | undefined): boolean {
  return typeof fileText === 'string' && fileText.includes(POLICY_BLOCK_BEGIN);
}

export function measureAgentsMdBudget(fileText: string): AgentsMdBudget {
  const bytes = Buffer.byteLength(fileText, 'utf8');
  const endChar = fileText.indexOf(POLICY_BLOCK_END);
  const policyBlockEndsAtByte = endChar === -1
    ? -1
    : Buffer.byteLength(fileText.slice(0, endChar + POLICY_BLOCK_END.length), 'utf8');
  return {
    bytes,
    cap: CODEX_PROJECT_DOC_MAX_BYTES,
    pct: Number(((bytes / CODEX_PROJECT_DOC_MAX_BYTES) * 100).toFixed(2)),
    overflow: bytes > CODEX_PROJECT_DOC_MAX_BYTES,
    policyBlockEndsAtByte,
  };
}

interface ParsedStamp {
  readonly id: string;
  readonly file: string;
  readonly sha: string;
  readonly section: string;
}

function parsePolicyStamps(agentsMdText: string | null): ParsedStamp[] {
  if (typeof agentsMdText !== 'string') return [];
  const begin = agentsMdText.indexOf(POLICY_BLOCK_BEGIN);
  const end = begin === -1 ? -1 : agentsMdText.indexOf(POLICY_BLOCK_END, begin + POLICY_BLOCK_BEGIN.length);
  if (begin === -1 || end === -1) return [];
  const inner = agentsMdText.slice(begin + POLICY_BLOCK_BEGIN.length, end);
  const matches = [...inner.matchAll(POLICY_STAMP)];
  return matches.map((match, index) => ({
    id: match[1]!,
    file: match[2]!,
    sha: match[3]!,
    section: inner.slice((match.index ?? 0) + match[0].length, matches[index + 1]?.index ?? inner.length),
  }));
}

function markerCount(text: string, marker: string): number {
  let count = 0;
  let offset = 0;
  while (true) {
    const found = text.indexOf(marker, offset);
    if (found === -1) return count;
    count += 1;
    offset = found + marker.length;
  }
}

function hasUnclaimedPolicyPrefix(text: string): boolean {
  const begin = text.indexOf(POLICY_BLOCK_BEGIN);
  const end = begin === -1 ? -1 : text.indexOf(POLICY_BLOCK_END, begin + POLICY_BLOCK_BEGIN.length);
  if (begin === -1 || end === -1) return false;
  const inner = text.slice(begin + POLICY_BLOCK_BEGIN.length, end);
  const firstStamp = [...inner.matchAll(POLICY_STAMP)][0];
  return inner.slice(0, firstStamp?.index ?? inner.length).trim().length > 0;
}

function hasPolicyStampOutsideFence(text: string): boolean {
  const begin = text.indexOf(POLICY_BLOCK_BEGIN);
  const end = begin === -1 ? -1 : text.indexOf(POLICY_BLOCK_END, begin + POLICY_BLOCK_BEGIN.length);
  if (begin === -1 || end === -1) return [...text.matchAll(POLICY_STAMP)].length > 0;
  const innerStart = begin + POLICY_BLOCK_BEGIN.length;
  return [...text.matchAll(POLICY_STAMP)].some((match) => (match.index ?? -1) < innerStart || (match.index ?? -1) >= end);
}

function emittedBody(stamp: ParsedStamp, source: PolicySource): string | null {
  const normalized = stamp.section.replace(/^\n+/, '').replace(/\n+$/, '');
  const heading = `## ${source.heading}`;
  if (!normalized.startsWith(`${heading}\n`)) return null;
  const afterHeading = normalized.slice(heading.length).replace(/^\n+/, '');
  const canonical = `\n\nCanonical: ${source.file}`;
  if (!afterHeading.endsWith(canonical)) return null;
  return normalizePolicyText(afterHeading.slice(0, -canonical.length));
}

export function detectPolicyDrift(
  sourceFiles: ReadonlyMap<string, string | null>,
  agentsMdText: string | null,
  sources: readonly PolicySource[] = POLICY_SOURCES,
): PolicyDriftResult {
  const sourceFilesPresent = new Set(sources.map((source) => source.file))
    .size > 0 && sources.some((source) => typeof sourceFiles.get(source.file) === 'string');
  const extracted = extractPolicyBlocks(sourceFiles, sources);
  const blockById = new Map(extracted.blocks.map((block) => [block.id, block]));
  const stamps = parsePolicyStamps(agentsMdText);
  const stampsById = new Map<string, ParsedStamp>();
  const duplicateStamps: ParsedStamp[] = [];
  for (const stamp of stamps) {
    if (stampsById.has(stamp.id)) duplicateStamps.push(stamp);
    else stampsById.set(stamp.id, stamp);
  }

  const findings: PolicyDriftFinding[] = [];
  for (const source of sources) {
    const block = blockById.get(source.id);
    const stamp = stampsById.get(source.id);
    if (!block) {
      findings.push({ id: source.id, file: source.file, status: 'missing-anchor', expectedSha: null, actualSha: stamp?.sha ?? null });
      continue;
    }
    if (!stamp) {
      findings.push({ id: source.id, file: source.file, status: 'missing-stamp', expectedSha: block.sha, actualSha: null });
      continue;
    }
    const body = emittedBody(stamp, source);
    const stale = stamp.file !== source.file || stamp.sha !== block.sha || body === null || policyTextSha(body) !== block.sha;
    findings.push({
      id: source.id,
      file: source.file,
      status: stale ? 'stale' : 'ok',
      expectedSha: block.sha,
      actualSha: stamp.sha,
    });
  }

  const sourceIds = new Set(sources.map((source) => source.id));
  for (const stamp of [...stamps.filter((entry) => !sourceIds.has(entry.id)), ...duplicateStamps]) {
    findings.push({ id: stamp.id, file: stamp.file, status: 'orphan-stamp', expectedSha: null, actualSha: stamp.sha });
  }

  if (typeof agentsMdText === 'string') {
    const beginCount = markerCount(agentsMdText, POLICY_BLOCK_BEGIN);
    const endCount = markerCount(agentsMdText, POLICY_BLOCK_END);
    if (
      beginCount > 1 ||
      endCount > 1 ||
      beginCount !== endCount ||
      hasUnclaimedPolicyPrefix(agentsMdText) ||
      hasPolicyStampOutsideFence(agentsMdText)
    ) {
      findings.push({ id: 'dz:policies', file: 'AGENTS.md', status: 'orphan-stamp', expectedSha: null, actualSha: null });
    }
  }

  return { applicable: sourceFilesPresent, findings };
}

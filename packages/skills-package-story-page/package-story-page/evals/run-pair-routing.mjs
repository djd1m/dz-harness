#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..', '..', '..', '..', '..');
const storySkill = resolve(here, '..', 'SKILL.md');
const tutorialSkill = resolve(repoRoot, 'packages/@dzhechkov/skills-tutorial-factory/package-tutorial-factory/SKILL.md');
const evalFile = resolve(here, 'routing.yaml');
const sha256 = (value) => createHash('sha256').update(value).digest('hex');

function unquote(value) {
  const text = value.trim();
  return text.startsWith('"') && text.endsWith('"') ? JSON.parse(text) : text;
}

export function parseRouting(text) {
  const spec = { skill: null, positives: [], negatives: [] };
  let section = null;
  let pending = null;
  for (const raw of text.split('\n')) {
    const line = raw.replace(/\s+$/, '');
    if (!line.trim() || line.trim().startsWith('#')) continue;
    let match;
    if ((match = line.match(/^skill:\s*(.+)$/))) { spec.skill = unquote(match[1]); continue; }
    if ((match = line.match(/^(positives|negatives):\s*$/))) { section = match[1]; pending = null; continue; }
    if ((match = line.match(/^\s{2}-\s+(".*")$/)) && section === 'positives') {
      spec.positives.push(unquote(match[1]));
      continue;
    }
    if ((match = line.match(/^\s{2}-\s+prompt:\s*(.+)$/)) && section === 'negatives') {
      pending = { prompt: unquote(match[1]), shouldActivate: null };
      spec.negatives.push(pending);
      continue;
    }
    if ((match = line.match(/^\s{4}should_activate:\s*(.+)$/)) && pending) {
      pending.shouldActivate = unquote(match[1]);
      continue;
    }
    throw new Error(`unparsed routing line: ${line}`);
  }
  if (!spec.skill || spec.positives.length === 0 || spec.negatives.length === 0
    || spec.negatives.some((item) => !item.shouldActivate)) {
    throw new Error('routing eval is incomplete');
  }
  return spec;
}

export function frontmatterDescription(text) {
  const frontmatter = /^---\n([\s\S]*?)\n---/.exec(text)?.[1];
  if (!frontmatter) throw new Error('SKILL.md frontmatter missing');
  const lines = frontmatter.split('\n');
  const index = lines.findIndex((line) => line.startsWith('description:'));
  if (index < 0) throw new Error('SKILL.md description missing');
  const head = lines[index].slice('description:'.length).trim();
  if (!['>', '>-', '|', '|-'].includes(head)) return unquote(head);
  const body = [];
  for (const line of lines.slice(index + 1)) {
    if (!/^\s+/.test(line)) break;
    body.push(line.trim());
  }
  return body.join(' ').replace(/\s+/g, ' ').trim();
}

export function buildBlindPrompt(catalog, cases) {
  const blind = cases.map(({ id, prompt }) => ({ id, prompt }));
  return [
    'Answer from this prompt only. Do not use commands, files, tools, memory, or external context.',
    'You are a skill router. Choose exactly one installed skill for every request, or none when neither description fits.',
    'Return ONLY a JSON object shaped as {"results":[{"id":"case-001","answer":"skill-id","reason":"short reason"}]}.',
    'Include every case exactly once, preserve ids, and copy each answer from the catalog.',
    '',
    'CATALOG:',
    catalog,
    '',
    'REQUESTS:',
    JSON.stringify(blind, null, 2),
  ].join('\n');
}

export function parseClaudeEnvelope(stdout) {
  const trimmed = stdout.trim();
  const candidates = [trimmed, ...trimmed.split(/\r?\n/).filter(Boolean).reverse()];
  let envelope = null;
  for (const raw of candidates) {
    try {
      const candidate = JSON.parse(raw);
      if (candidate && typeof candidate === 'object' && typeof candidate.result === 'string') { envelope = candidate; break; }
    } catch { /* try the next last-anchored candidate */ }
  }
  if (!envelope || envelope.is_error === true) throw new Error('Claude result envelope missing or failed');
  const resultText = envelope.result.trim();
  const normalized = resultText.startsWith('```json\n') && resultText.endsWith('\n```')
    ? resultText.slice(8, -4).trim()
    : resultText;
  return JSON.parse(normalized);
}

export function scoreRouting(spec, rows) {
  const cases = [
    ...spec.positives.map((prompt, index) => ({ id: `case-${String(index + 1).padStart(3, '0')}`, kind: 'positive', prompt, expected: spec.skill })),
    ...spec.negatives.map((item, index) => ({ id: `case-${String(spec.positives.length + index + 1).padStart(3, '0')}`, kind: 'negative', prompt: item.prompt, expected: item.shouldActivate })),
  ];
  const rowIds = rows.map((row) => row?.id);
  const expectedIds = cases.map((item) => item.id);
  if (new Set(rowIds).size !== rows.length || [...rowIds].sort().join('\n') !== [...expectedIds].sort().join('\n')) {
    throw new Error('judge result ids do not match the blind case set');
  }
  const siblingOwners = new Set(spec.negatives.map((item) => item.shouldActivate));
  const allowed = new Set([spec.skill, ...siblingOwners, 'none']);
  const rowsById = new Map(rows.map((row) => [row.id, row]));
  const merged = cases.map((item) => {
    const judged = rowsById.get(item.id);
    return { ...item, answer: judged?.answer, reason: judged?.reason };
  });
  const positives = merged.filter((item) => item.kind === 'positive');
  const negatives = merged.filter((item) => item.kind === 'negative');
  const activationHits = positives.filter((item) => item.answer === item.expected).length;
  const siblingSteals = positives.filter((item) => item.answer !== item.expected && siblingOwners.has(item.answer)).length;
  const negativeViolations = negatives.filter((item) => item.answer === spec.skill).length;
  const negativeExactHits = negatives.filter((item) => item.answer === item.expected).length;
  const invalidAnswers = merged.filter((item) => !allowed.has(item.answer)
    || typeof item.reason !== 'string' || item.reason.trim() === '').length;
  const metrics = {
    positives: positives.length,
    activationHits,
    activationRate: activationHits / positives.length,
    siblingSteals,
    siblingStealRate: siblingSteals / positives.length,
    negatives: negatives.length,
    negativeViolations,
    negativeExactHits,
    invalidAnswers,
  };
  return {
    pass: metrics.activationRate >= 0.8 && metrics.siblingStealRate <= 0.1
      && metrics.negativeViolations === 0 && metrics.invalidAnswers === 0,
    metrics,
    results: merged,
  };
}

export function main(argv = process.argv.slice(2)) {
  const value = (name, fallback = null) => {
    const index = argv.indexOf(`--${name}`);
    return index >= 0 ? argv[index + 1] : fallback;
  };
  const out = value('out');
  const model = value('model', 'opus');
  const resolvedStorySkill = resolve(value('story-skill', storySkill));
  const resolvedTutorialSkill = resolve(value('sibling-skill', tutorialSkill));
  const resolvedEvalFile = resolve(value('eval', evalFile));
  if (!out) throw new Error('usage: run-pair-routing --out <receipt.json> [--model opus] [--story-skill <SKILL.md>] [--sibling-skill <SKILL.md>] [--eval <routing.yaml>]');
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(model)) throw new Error('unsafe model id');

  const evalText = readFileSync(resolvedEvalFile, 'utf8');
  const spec = parseRouting(evalText);
  const storySkillText = readFileSync(resolvedStorySkill, 'utf8');
  const tutorialSkillText = readFileSync(resolvedTutorialSkill, 'utf8');
  const catalog = [
    `- **package-story-page**: ${frontmatterDescription(storySkillText)}`,
    `- **package-tutorial-factory**: ${frontmatterDescription(tutorialSkillText)}`,
  ].join('\n');
  const cases = [
    ...spec.positives.map((prompt, index) => ({ id: `case-${String(index + 1).padStart(3, '0')}`, prompt })),
    ...spec.negatives.map((item, index) => ({ id: `case-${String(spec.positives.length + index + 1).padStart(3, '0')}`, prompt: item.prompt })),
  ];
  const prompt = buildBlindPrompt(catalog, cases);
  const isolated = mkdtempSync(resolve(tmpdir(), 'package-routing-opus-'));
  try {
    const run = spawnSync('claude', [
      '-p', '--model', model, '--output-format', 'json', '--safe-mode', '--strict-mcp-config',
      '--tools', '', '--no-session-persistence',
    ], { cwd: isolated, input: prompt, encoding: 'utf8', timeout: 600_000, maxBuffer: 10_000_000 });
    if (run.status !== 0) throw new Error(`Claude judge failed: ${run.error?.message ?? run.stderr ?? `exit ${run.status}`}`);
    const parsed = parseClaudeEnvelope(run.stdout);
    if (!Array.isArray(parsed.results)) throw new Error('Claude judge JSON has no results array');
    const scored = scoreRouting(spec, parsed.results);
    const receipt = {
      schema: 'package-story-routing-receipt/1',
      measuredAt: new Date().toISOString(),
      judge: `claude:${model}`,
      isolation: ['safe-mode', 'strict-mcp-config', 'no-tools', 'no-session-persistence', 'empty-cwd'],
      scope: 'bounded pairwise routing: package-story-page vs package-tutorial-factory',
      evalSha256: sha256(evalText),
      storySkillSha256: sha256(storySkillText),
      tutorialSkillSha256: sha256(tutorialSkillText),
      catalogSha256: sha256(catalog),
      promptSha256: sha256(prompt),
      ...scored,
    };
    writeFileSync(resolve(out), `${JSON.stringify(receipt, null, 2)}\n`);
    process.stdout.write(`${receipt.pass ? 'PASS' : 'FAIL'} ${JSON.stringify(receipt.metrics)}\n`);
    return receipt.pass ? 0 : 1;
  } finally {
    rmSync(isolated, { recursive: true, force: true });
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { process.exitCode = main(); } catch (error) { console.error(`run-pair-routing: ${error.message}`); process.exitCode = 1; }
}
